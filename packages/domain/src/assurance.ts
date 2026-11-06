import { z } from 'zod';
import { decodeFunctionData, encodeFunctionData, erc20Abi } from 'viem';
import { canonicalJson, verifyDecision } from './decision.js';
import { minimumOutput } from './amounts.js';
import { AddressSchema, DecisionRecordSchema, RawAmountSchema } from './schemas.js';
import { QuoteObservationSchema } from './quotes.js';
import { NorthtrailError } from './errors.js';

export const ReviewRequestSchema = z.strictObject({
  record: DecisionRecordSchema,
  quote: QuoteObservationSchema,
  wallet: AddressSchema,
  chainId: z.number().int().positive().safe(),
});
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;
export const ReviewResultSchema = z.strictObject({
  kind: z.literal('DECISION_QUOTE_REVIEW'),
  status: z.enum(['CONSISTENT', 'REVIEW_REQUIRED']),
  decisionDigest: z.string(),
  reasons: z.array(z.string()),
  executionAuthorized: z.literal(false),
  walletAuthentication: z.literal('NOT_VERIFIED'),
  nextAction: z.string(),
});

// A digest is not consent. This check intentionally has no path to grant spending authority.
export async function reviewDecisionQuote(input: unknown, nowMs: number) {
  const { record, quote, wallet, chainId } = ReviewRequestSchema.parse(input);
  if (!Number.isSafeInteger(nowMs) || nowMs < 0)
    throw new NorthtrailError('INVALID_INPUT', 'Invalid review clock.');
  const reasons: string[] = [];
  if (!(await verifyDecision(record))) reasons.push('DECISION_DIGEST_MISMATCH');
  const candidate = record.payload.candidates.find(
    (item) => item.id === record.payload.selectedCandidateId,
  );
  if (!candidate || candidate.kind !== 'TRADE') reasons.push('NO_SELECTED_TRADE');
  else {
    const { intent } = candidate;
    if (wallet !== intent.owner) reasons.push('WALLET_MISMATCH');
    if (chainId !== intent.chainId) reasons.push('CHAIN_MISMATCH');
    if (
      canonicalJson(quote.request) !==
      canonicalJson({
        chainId: intent.chainId,
        owner: intent.owner,
        recipient: intent.recipient,
        tokenIn: intent.tokenIn.address,
        tokenOut: intent.tokenOut.address,
        amountInRaw: intent.amountInRaw,
        slippageBps: intent.slippageBps,
      })
    )
      reasons.push('QUOTE_INTENT_MISMATCH');
    if (
      candidate.quoteId !== quote.quoteId ||
      candidate.quoteDigest !== quote.responseDigest ||
      candidate.outputRaw !== quote.outputRaw ||
      candidate.provenance !== quote.provenance ||
      candidate.quotedAt !== quote.fetchedAt ||
      candidate.expiresAt !== quote.reviewExpiresAt
    )
      reasons.push('QUOTE_EVIDENCE_MISMATCH');
    const minimum = minimumOutput(quote.outputRaw, intent.slippageBps);
    if (
      quote.policyMinOutRaw !== minimum ||
      BigInt(intent.minOutRaw) < BigInt(minimum) ||
      BigInt(intent.minOutRaw) > BigInt(quote.outputRaw) ||
      (quote.providerMinOutRaw !== null &&
        BigInt(quote.providerMinOutRaw) < BigInt(intent.minOutRaw))
    )
      reasons.push('MINIMUM_OUTPUT_MISMATCH');
    if (Date.parse(intent.deadline) <= nowMs || Date.parse(intent.deadline) > nowMs + 30 * 60_000)
      reasons.push('INVALID_DEADLINE');
  }
  const requested = Date.parse(quote.requestedAt);
  const fetched = Date.parse(quote.fetchedAt);
  const expires = Date.parse(quote.reviewExpiresAt);
  const created = Date.parse(record.payload.createdAt);
  if (
    requested > fetched ||
    fetched > nowMs ||
    expires <= nowMs ||
    expires <= fetched ||
    expires - requested > 30_000 ||
    nowMs - requested > 30_000 ||
    // Browser record timestamps can differ slightly from the API clock. This tolerance
    // applies only to record metadata; quote expiry and intent deadlines stay strict.
    created + 5_000 < fetched ||
    created > nowMs + 5_000
  )
    reasons.push('STALE_OR_INVALID_TIME');
  return ReviewResultSchema.parse({
    kind: 'DECISION_QUOTE_REVIEW',
    status: reasons.length ? 'REVIEW_REQUIRED' : 'CONSISTENT',
    decisionDigest: record.digest,
    reasons,
    executionAuthorized: false,
    walletAuthentication: 'NOT_VERIFIED',
    nextAction: reasons.length
      ? 'Requote and create a new decision revision before requesting fresh consent.'
      : 'Verify wallet ownership, token registry, allowances, route calldata and chain simulation before signing.',
  });
}

const ApprovalTransactionSchema = z.strictObject({
  chainId: z.number().int().positive().safe(),
  from: AddressSchema,
  to: AddressSchema,
  value: RawAmountSchema,
  data: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .max(138),
});
const ApprovalPolicySchema = z.strictObject({
  chainId: z.number().int().positive().safe(),
  owner: AddressSchema,
  token: AddressSchema,
  spender: AddressSchema,
  amountRaw: RawAmountSchema,
});

// Trusted caller must obtain the spender from a chain/version-specific allowlist, never provider data.
// This validates ERC-20 approve only: neither a Permit2 typed signature nor a swap authorization.
export function validateExactApproval(transaction: unknown, trustedPolicy: unknown) {
  const tx = ApprovalTransactionSchema.parse(transaction);
  const policy = ApprovalPolicySchema.parse(trustedPolicy);
  const zero = '0x0000000000000000000000000000000000000000';
  const reject = () => {
    throw new NorthtrailError('INVALID_INPUT', 'Approval exceeds the exact trusted policy.');
  };
  if (
    [policy.owner, policy.token, policy.spender].includes(zero) ||
    tx.chainId !== policy.chainId ||
    tx.from !== policy.owner ||
    tx.to !== policy.token ||
    tx.value !== '0'
  )
    reject();
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data as `0x${string}` });
    if (decoded.functionName !== 'approve') return reject();
    const [spender, amount] = decoded.args;
    const canonical = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [policy.spender, BigInt(policy.amountRaw)],
    });
    if (
      spender !== policy.spender ||
      amount !== BigInt(policy.amountRaw) ||
      canonical.toLowerCase() !== tx.data.toLowerCase()
    )
      reject();
  } catch {
    reject();
  }
  return {
    kind: 'EXACT_ERC20_APPROVAL_CHECK' as const,
    consistent: true as const,
    executionAuthorized: false as const,
  };
}

export const RecoveryRequestSchema = z.strictObject({
  state: z.enum([
    'DRAFT',
    'QUOTED',
    'REVIEWED',
    'SIGNED',
    'SUBMITTED',
    'PENDING',
    'CONFIRMED',
    'REVERTED',
    'REORGED',
    'UNKNOWN_FINALITY',
    'REPLACED',
    'EXPIRED',
    'CANCELLED',
  ]),
  issue: z.enum([
    'QUOTE_EXPIRED',
    'PRICE_CHANGED',
    'APPROVAL_FAILED',
    'WRONG_NETWORK',
    'WALLET_REJECTED',
    'PROVIDER_TIMEOUT',
    'TRANSACTION_REVERTED',
    'TRANSACTION_REPLACED',
    'INCOMPLETE_PLAN',
  ]),
});
export type RecoveryRequest = z.infer<typeof RecoveryRequestSchema>;
export const RecoveryResultSchema = z.strictObject({
  action: z.enum([
    'RECONCILE_CHAIN',
    'INSPECT_SETTLEMENT',
    'NEW_REVIEW',
    'SWITCH_NETWORK',
    'CANCEL_OR_REVIEW',
  ]),
  mayCancelLocally: z.boolean(),
  requiresFreshConsent: z.literal(true),
  executionAuthorized: z.literal(false),
  message: z.string(),
});
export function safeRecovery(input: unknown) {
  const { state, issue } = RecoveryRequestSchema.parse(input);
  const unresolved = [
    'SIGNED',
    'SUBMITTED',
    'PENDING',
    'UNKNOWN_FINALITY',
    'REORGED',
    'REPLACED',
  ].includes(state);
  const settled = ['CONFIRMED', 'REVERTED'].includes(state);
  return RecoveryResultSchema.parse({
    action: unresolved
      ? 'RECONCILE_CHAIN'
      : settled
        ? 'INSPECT_SETTLEMENT'
        : issue === 'WRONG_NETWORK'
          ? 'SWITCH_NETWORK'
          : issue === 'WALLET_REJECTED'
            ? 'CANCEL_OR_REVIEW'
            : 'NEW_REVIEW',
    mayCancelLocally: ['DRAFT', 'QUOTED', 'REVIEWED'].includes(state),
    requiresFreshConsent: true,
    executionAuthorized: false,
    message: unresolved
      ? 'Resolve the signed transaction and its nonce on chain before any retry. Local cancellation cannot revoke a signature.'
      : settled
        ? 'Inspect canonical settlement and remaining permissions. A completed swap cannot be undone.'
        : 'Correct the issue, obtain a fresh quote and decision revision, then request new permission. No automatic retry or larger allowance.',
  });
}
