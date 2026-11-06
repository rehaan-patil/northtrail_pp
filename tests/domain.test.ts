import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AddressSchema,
  DecisionPayloadSchema,
  IntentInputSchema,
  PositiveAmountSchema,
  RawAmountSchema,
  SystemStatusSchema,
  UINT256_MAX,
  canonicalJson,
  createDecision,
  digestJson,
  formatAmount,
  minimumOutput,
  parseAmount,
  rawAmount,
  transitionAttempt,
  verifyDecision,
} from '../packages/domain/src/index.js';
import { readEnvironment } from '../packages/config/src/index.js';
import { gasPaid, stressExposure } from '../packages/compass/src/index.js';
import { decisionFixture, intentFixture, zeroAddress } from './fixtures.js';

describe('token base units', () => {
  it('converts six and eighteen decimal assets without losing low-order units', () => {
    expect(parseAmount('5000.000001', 6)).toBe('5000000001');
    expect(parseAmount('1.000000000000000001', 18)).toBe('1000000000000000001');
    expect(formatAmount('5000000001', 6)).toBe('5000.000001');
    expect(formatAmount('1000000000000000001', 18)).toBe('1.000000000000000001');
    expect(formatAmount('1', 18)).toBe('0.000000000000000001');
    expect(formatAmount('0', 18)).toBe('0');
    expect(formatAmount('1200000', 6)).toBe('1.2');
  });

  it('accepts the uint256 maximum and rejects overflow', () => {
    expect(rawAmount(UINT256_MAX.toString())).toBe(UINT256_MAX);
    expect(RawAmountSchema.parse(UINT256_MAX.toString())).toBe(UINT256_MAX.toString());
    expect(() => rawAmount((UINT256_MAX + 1n).toString())).toThrow();
    expect(RawAmountSchema.safeParse((UINT256_MAX + 1n).toString()).success).toBe(false);
    expect(() => parseAmount((UINT256_MAX + 1n).toString(), 0)).toThrow();
  });

  it.each([
    '',
    '01',
    '-1',
    '+1',
    '1.0',
    '1e18',
    '0x10',
    ' 1',
    '1 ',
    'NaN',
    'Infinity',
    '1_000',
    '١',
    '9'.repeat(79),
  ])('rejects noncanonical raw units: %j', (value) => {
    expect(() => rawAmount(value)).toThrow();
    expect(RawAmountSchema.safeParse(value).success).toBe(false);
  });

  it.each([1, 1.25, 1n, null, undefined, {}, []])('rejects non-string API units: %s', (value) => {
    expect(RawAmountSchema.safeParse(value).success).toBe(false);
  });

  it.each(['', '.1', '1.', '01.2', '1e6', '-0.1', '+1', ' 1', '1 ', '1,000', 'Infinity'])(
    'rejects ambiguous human amounts: %j',
    (value) => {
      expect(() => parseAmount(value, 6)).toThrow();
    },
  );

  it('rejects fractional units instead of silently rounding', () => {
    expect(() => parseAmount('0.0000001', 6)).toThrow();
    expect(() => parseAmount('1.1', 0)).toThrow();
    expect(parseAmount('1', 0)).toBe('1');
    expect(PositiveAmountSchema.safeParse('0').success).toBe(false);
  });

  it.each([-1, 1.5, 37, NaN, Infinity])('rejects invalid decimals: %j', (decimals) => {
    expect(() => parseAmount('1', decimals)).toThrow();
    expect(() => formatAmount('1', decimals)).toThrow();
  });

  it('round-trips representative raw amounts across supported precision', () => {
    const amounts = ['0', '1', '999999', '1000001', '9007199254740993', UINT256_MAX.toString()];
    for (const decimals of [0, 6, 18, 36]) {
      for (const amount of amounts)
        expect(parseAmount(formatAmount(amount, decimals), decimals)).toBe(amount);
    }
  });

  it('rounds minimum output down in base units using basis points', () => {
    expect(minimumOutput('10001', 50)).toBe('9950');
    expect(minimumOutput('1000000000000000001', 0)).toBe('1000000000000000001');
    expect(minimumOutput('100', 1000)).toBe('90');
    for (const slippage of [-1, 1.5, 1001, NaN])
      expect(() => minimumOutput('100', slippage)).toThrow();
  });
});

describe('intent boundary', () => {
  it('validates the synthetic exact-input intent', () => {
    expect(IntentInputSchema.parse(intentFixture())).toEqual(intentFixture());
  });

  it.each(['amountInRaw', 'minOutRaw'] as const)('rejects zero and numeric %s', (field) => {
    expect(IntentInputSchema.safeParse({ ...intentFixture(), [field]: '0' }).success).toBe(false);
    expect(IntentInputSchema.safeParse({ ...intentFixture(), [field]: 100 }).success).toBe(false);
  });

  it('rejects another chain, identical assets, and unsupported routes', () => {
    const intent = intentFixture();
    expect(IntentInputSchema.safeParse({ ...intent, chainId: 8453 }).success).toBe(false);
    expect(IntentInputSchema.safeParse({ ...intent, tokenOut: intent.tokenIn }).success).toBe(
      false,
    );
    expect(IntentInputSchema.safeParse({ ...intent, route: 'DUTCH_V3' }).success).toBe(false);
  });

  it.each(['owner', 'recipient'] as const)('rejects zero %s', (field) => {
    expect(IntentInputSchema.safeParse({ ...intentFixture(), [field]: zeroAddress }).success).toBe(
      false,
    );
  });

  it('rejects malformed addresses, unknown authority fields, and unzoned deadlines', () => {
    expect(AddressSchema.safeParse('0x1234').success).toBe(false);
    expect(IntentInputSchema.safeParse({ ...intentFixture(), approved: true }).success).toBe(false);
    expect(
      IntentInputSchema.safeParse({ ...intentFixture(), deadline: '2026-11-06T12:05:00' }).success,
    ).toBe(false);
  });
});

describe('Decision Trail integrity', () => {
  it('matches independent canonical bytes and SHA-256', async () => {
    const value = { z: [3, { b: false, a: 'quoted "value"' }], a: 1 };
    const expected = JSON.stringify({ a: 1, z: [3, { a: 'quoted "value"', b: false }] });
    expect(canonicalJson(value)).toBe(expected);
    expect(await digestJson(value)).toBe(
      `0x${createHash('sha256').update(expected, 'utf8').digest('hex')}`,
    );
    expect(await digestJson({ a: 1, z: value.z })).toBe(await digestJson(value));
  });

  it('hashes an empty canonical object to a fixed known answer', async () => {
    expect(await digestJson({})).toBe(
      '0x44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    );
  });

  it('reproduces a created record and rejects changed evidence or digest', async () => {
    const record = await createDecision(decisionFixture());
    expect(await verifyDecision(record)).toBe(true);
    expect(await verifyDecision({ ...record, digest: `0x${'0'.repeat(64)}` })).toBe(false);
    expect(
      await verifyDecision({
        ...record,
        payload: { ...record.payload, selectedCandidateId: 'no-trade' },
      }),
    ).toBe(false);
    expect(
      await verifyDecision({ ...record, payload: { ...record.payload, limitations: [] } }),
    ).toBe(false);
    expect(await verifyDecision({ ...record, algorithm: 'SHA1' })).toBe(false);
  });

  it('rejects omitted selected candidates and duplicate candidate identifiers', () => {
    const payload = decisionFixture();
    expect(
      DecisionPayloadSchema.safeParse({
        ...payload,
        candidates: [{ id: 'no-trade', kind: 'NO_TRADE' }],
      }).success,
    ).toBe(false);
    expect(
      DecisionPayloadSchema.safeParse({
        ...payload,
        candidates: [...payload.candidates, { id: 'no-trade', kind: 'NO_TRADE' }],
      }).success,
    ).toBe(false);
  });

  it('requires predecessor linkage only for later revisions', async () => {
    const payload = decisionFixture();
    const first = await createDecision(payload);
    expect(DecisionPayloadSchema.safeParse({ ...payload, revision: 2 }).success).toBe(false);
    expect(
      DecisionPayloadSchema.safeParse({ ...payload, previousDigest: first.digest }).success,
    ).toBe(false);
    const second = await createDecision({ ...payload, revision: 2, previousDigest: first.digest });
    expect(second.digest).not.toBe(first.digest);
    expect(await verifyDecision(second)).toBe(true);
  });

  it('rejects malformed evidence without throwing from verification', async () => {
    expect(await verifyDecision(null)).toBe(false);
    expect(await verifyDecision({ payload: { candidates: [] } })).toBe(false);
    expect(
      await verifyDecision({
        algorithm: 'JCS-SHA256-v1',
        digest: 'garbage',
        payload: decisionFixture(),
      }),
    ).toBe(false);
  });
});

describe('attempt lifecycle', () => {
  it('allows the observed successful path and subsequent reorg', () => {
    expect(transitionAttempt('DRAFT', 'QUOTED')).toBe('QUOTED');
    expect(transitionAttempt('QUOTED', 'REVIEWED')).toBe('REVIEWED');
    expect(transitionAttempt('REVIEWED', 'SIGNED')).toBe('SIGNED');
    expect(transitionAttempt('SIGNED', 'SUBMITTED')).toBe('SUBMITTED');
    expect(transitionAttempt('PENDING', 'CONFIRMED')).toBe('CONFIRMED');
    expect(transitionAttempt('CONFIRMED', 'REORGED')).toBe('REORGED');
    expect(transitionAttempt('REORGED', 'PENDING')).toBe('PENDING');
  });

  it('requires reconciliation of unknown finality instead of signing or submitting again', () => {
    expect(transitionAttempt('SIGNED', 'UNKNOWN_FINALITY')).toBe('UNKNOWN_FINALITY');
    expect(() => transitionAttempt('UNKNOWN_FINALITY', 'SIGNED')).toThrow();
    expect(() => transitionAttempt('UNKNOWN_FINALITY', 'SUBMITTED')).toThrow();
    expect(transitionAttempt('UNKNOWN_FINALITY', 'CONFIRMED')).toBe('CONFIRMED');
  });

  it('does not equate a draft or signature with settlement', () => {
    expect(() => transitionAttempt('DRAFT', 'CONFIRMED')).toThrow();
    expect(() => transitionAttempt('SIGNED', 'CONFIRMED')).toThrow();
    expect(() => transitionAttempt('CANCELLED', 'SUBMITTED')).toThrow();
    expect(() => transitionAttempt('EXPIRED', 'SIGNED')).toThrow();
  });
});

describe('runtime release gates', () => {
  it('uses an explicitly disabled local default', () => {
    const env = readEnvironment({});
    expect(env.DATABASE_DRIVER).toBe('pglite');
    expect(env.HOST).toBe('127.0.0.1');
    expect(env.TRADING_ENABLED).toBe('false');
  });

  it('requires PostgreSQL and HTTPS in production', () => {
    expect(() => readEnvironment({ NODE_ENV: 'production' })).toThrow();
    expect(() => readEnvironment({ DATABASE_DRIVER: 'postgres' })).toThrow();
    expect(() =>
      readEnvironment({
        NODE_ENV: 'production',
        DATABASE_DRIVER: 'postgres',
        DATABASE_URL: 'postgresql://example.invalid/northtrail',
      }),
    ).toThrow();
    expect(
      readEnvironment({
        NODE_ENV: 'production',
        DATABASE_DRIVER: 'postgres',
        DATABASE_URL: 'postgresql://example.invalid/northtrail',
        APP_ORIGIN: 'https://northtrail.example',
      }).NODE_ENV,
    ).toBe('production');
  });

  it('refuses accidental trading enablement', () => {
    expect(() => readEnvironment({ TRADING_ENABLED: 'true' })).toThrow();
    expect(() => readEnvironment({ TRADING_ENABLED: 'yes' })).toThrow();
  });

  it('does not accept a status response that claims unimplemented live execution', () => {
    expect(
      SystemStatusSchema.safeParse({
        schemaVersion: '1',
        version: '0.1.0',
        commit: 'test',
        environment: 'test',
        financialExecution: 'LIVE_MANUAL',
        capabilities: [],
      }).success,
    ).toBe(false);
  });
});

describe('read-only financial arithmetic', () => {
  it('computes disclosed stress exposure independently of quotes or forecasts', () => {
    expect(stressExposure('5000000000', -400)).toEqual({
      changeRaw: '-200000000',
      remainingRaw: '4800000000',
      rounding: 'TOWARD_ZERO',
      kind: 'SCENARIO_ARITHMETIC',
    });
    expect(stressExposure('2500000000', -400).changeRaw).toBe('-100000000');
    expect(stressExposure('1', -400).changeRaw).toBe('0');
    expect(stressExposure('100', -10_000).remainingRaw).toBe('0');
    expect(stressExposure('100', 400).remainingRaw).toBe('104');
  });

  it('rejects unsupported stress and computes gas without floating point', () => {
    expect(() => stressExposure('100', -10_001)).toThrow();
    expect(() => stressExposure('100', 0.1)).toThrow();
    expect(() => stressExposure('100', NaN)).toThrow();
    expect(gasPaid('21000', '20000000000')).toBe('420000000000000');
    expect(gasPaid('1', '9007199254740993')).toBe('9007199254740993');
  });
});
