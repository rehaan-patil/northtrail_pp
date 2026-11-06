import { describe, expect, it } from 'vitest';
import {
  createDecision,
  reviewDecisionQuote,
  validateExactApproval,
  safeRecovery,
  transitionAttempt,
} from '../packages/domain/src/index.js';
import { normalizeQuote } from '../integrations/uniswap/src/index.js';
import { providerQuoteFixture, quoteRequestFixture } from './quote-fixtures.js';
import { decisionFixture } from './fixtures.js';
import { USDC, WETH } from '../packages/config/src/index.js';
import { readEnvironment } from '../packages/config/src/index.js';
import { buildApp } from '../apps/api/src/app.js';
import { connectDatabase, migrate } from '../packages/db/src/index.js';
import { createNorthtrail } from '../packages/sdk/src/index.js';

const now = Date.parse('2026-11-06T12:00:05.000Z');
// Independently encode the standard ERC-20 selector and two static ABI words.
const approvalData = (spender: string, amount: bigint): `0x${string}` =>
  `0x095ea7b3${spender.slice(2).toLowerCase().padStart(64, '0')}${amount.toString(16).padStart(64, '0')}`;
export async function reviewFixture(stamp = now) {
  const quote = await normalizeQuote(
    providerQuoteFixture(),
    quoteRequestFixture(),
    stamp - 1000,
    stamp - 1000,
  );
  const payload = decisionFixture();
  payload.createdAt = new Date(stamp).toISOString();
  const selected = payload.candidates[0]!;
  if (selected.kind !== 'TRADE') throw new Error('Fixture');
  selected.intent = {
    ...selected.intent,
    owner: quote.request.owner,
    recipient: quote.request.recipient,
    tokenIn: USDC,
    tokenOut: WETH,
    amountInRaw: quote.request.amountInRaw,
    minOutRaw: quote.policyMinOutRaw,
    deadline: new Date(stamp + 20_000).toISOString(),
  };
  selected.quoteId = quote.quoteId;
  selected.quoteDigest = quote.responseDigest;
  selected.outputRaw = quote.outputRaw;
  selected.provenance = quote.provenance;
  selected.quotedAt = quote.fetchedAt;
  selected.expiresAt = quote.reviewExpiresAt;
  return { record: await createDecision(payload), quote, wallet: quote.request.owner, chainId: 1 };
}

describe('decision-bound review (synthetic provider evidence)', () => {
  it('bounds client record clock skew without extending quote validity', async () => {
    const input = await reviewFixture();
    input.record.payload.createdAt = new Date(now + 3).toISOString();
    input.record = await createDecision(input.record.payload);
    expect((await reviewDecisionQuote(input, now)).status).toBe('CONSISTENT');
    expect((await reviewDecisionQuote(input, now + 31_000)).status).toBe('REVIEW_REQUIRED');
    input.record.payload.createdAt = new Date(now + 5_001).toISOString();
    input.record = await createDecision(input.record.payload);
    expect((await reviewDecisionQuote(input, now)).status).toBe('REVIEW_REQUIRED');
  });
  it('reviews through API/SDK and rejects forged token decimals', async () => {
    const db = await connectDatabase({ driver: 'pglite' });
    await migrate(db);
    const app = await buildApp(readEnvironment({ NODE_ENV: 'test' }), db);
    try {
      const sdk = createNorthtrail({ baseUrl: await app.listen({ host: '127.0.0.1', port: 0 }) });
      const input = await reviewFixture(Date.now());
      expect((await sdk.reviewTrade(input)).status).toBe('CONSISTENT');
      const selected = input.record.payload.candidates[0]!;
      if (selected.kind !== 'TRADE') throw new Error('fixture');
      selected.intent.tokenIn.decimals = 18;
      input.record = await createDecision(input.record.payload);
      await expect(sdk.reviewTrade(input)).rejects.toMatchObject({ code: 'UNSUPPORTED_TOKEN' });
      expect(
        (await app.inject({ method: 'POST', url: '/v1/trades', payload: {} })).statusCode,
      ).toBe(503);
    } finally {
      await app.close();
      await db.close();
    }
  });
  it('checks evidence but never authenticates or authorizes the wallet', async () => {
    const result = await reviewDecisionQuote(await reviewFixture(), now);
    expect(result.status).toBe('CONSISTENT');
    expect(result.executionAuthorized).toBe(false);
    expect(result.walletAuthentication).toBe('NOT_VERIFIED');
  });
  it.each([
    'wallet',
    'chainId',
    'quoteId',
    'amountInRaw',
    'minOut',
    'digest',
    'stale',
    'future',
    'no-trade',
  ])('rejects %s changes', async (change) => {
    const input = await reviewFixture();
    if (change === 'wallet') input.wallet = '0x9999999999999999999999999999999999999999';
    if (change === 'chainId') input.chainId = 10;
    if (change === 'quoteId') input.quote.quoteId = 'substituted';
    if (change === 'amountInRaw') input.quote.request.amountInRaw = '999999';
    if (change === 'minOut') input.quote.providerMinOutRaw = '1';
    if (change === 'digest') input.record.payload.limitations.push('tampered');
    if (change === 'no-trade') {
      input.record.payload.selectedCandidateId = 'no-trade';
      input.record = await createDecision(input.record.payload);
    }
    expect(
      (
        await reviewDecisionQuote(
          input,
          change === 'stale' ? now + 31_000 : change === 'future' ? now - 10_000 : now,
        )
      ).status,
    ).toBe('REVIEW_REQUIRED');
  });
});

describe('exact ERC-20 approval checks', () => {
  const policy = {
    chainId: 1,
    owner: quoteRequestFixture().owner,
    token: USDC.address,
    spender: '0x5555555555555555555555555555555555555555' as const,
    amountRaw: '1000000',
  };
  const tx = () => ({
    chainId: 1,
    from: policy.owner as string,
    to: policy.token,
    value: '0',
    data: approvalData(policy.spender, 1000000n),
  });
  it('accepts exact and explicitly requested zero-reset amounts', () => {
    expect(validateExactApproval(tx(), policy).consistent).toBe(true);
    expect(
      validateExactApproval(
        { ...tx(), data: approvalData(policy.spender, 0n) },
        { ...policy, amountRaw: '0' },
      ).executionAuthorized,
    ).toBe(false);
  });
  it.each(['chain', 'owner', 'token', 'value', 'spender', 'unlimited', 'trailing', 'transfer'])(
    'rejects unsafe %s',
    (change) => {
      const transaction = tx();
      if (change === 'chain') transaction.chainId = 10;
      if (change === 'owner') transaction.from = policy.spender;
      if (change === 'token') transaction.to = WETH.address;
      if (change === 'value') transaction.value = '1';
      if (change === 'spender') transaction.data = approvalData(policy.owner, 1000000n);
      if (change === 'unlimited') transaction.data = approvalData(policy.spender, 2n ** 256n - 1n);
      if (change === 'trailing') transaction.data = `${transaction.data}00`;
      if (change === 'transfer')
        transaction.data = `0xa9059cbb${approvalData(policy.spender, 1000000n).slice(10)}`;
      expect(() => validateExactApproval(transaction, policy)).toThrow();
    },
  );
});

describe('Safe Paths', () => {
  it.each(['SIGNED', 'SUBMITTED', 'PENDING', 'UNKNOWN_FINALITY', 'REORGED', 'REPLACED'])(
    'reconciles %s before retries',
    (state) => {
      const result = safeRecovery({ state, issue: 'PROVIDER_TIMEOUT' });
      expect(result.action).toBe('RECONCILE_CHAIN');
      expect(result.mayCancelLocally).toBe(false);
    },
  );
  it('never offers undo for a confirmed swap', () => {
    expect(safeRecovery({ state: 'CONFIRMED', issue: 'PRICE_CHANGED' }).action).toBe(
      'INSPECT_SETTLEMENT',
    );
  });
  it('accepts replacement observed directly after submission', () => {
    expect(transitionAttempt('SUBMITTED', 'REPLACED')).toBe('REPLACED');
  });
});
