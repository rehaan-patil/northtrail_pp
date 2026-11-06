import type { DecisionPayload, IntentInput } from '../packages/domain/src/index.js';

export const owner = '0x1111111111111111111111111111111111111111' as const;
export const recipient = '0x2222222222222222222222222222222222222222' as const;
export const zeroAddress = '0x0000000000000000000000000000000000000000' as const;

export function intentFixture(): IntentInput {
  return {
    schemaVersion: '1',
    chainId: 1,
    owner,
    recipient,
    tokenIn: {
      chainId: 1,
      address: '0x3333333333333333333333333333333333333333',
      decimals: 6,
      symbol: 'TEST_USDC',
    },
    tokenOut: {
      chainId: 1,
      address: '0x4444444444444444444444444444444444444444',
      decimals: 18,
      symbol: 'TEST_WETH',
    },
    amountInRaw: '5000000000',
    minOutRaw: '1000000000000000000',
    slippageBps: 50,
    deadline: '2026-11-06T12:05:00.000Z',
    route: 'CLASSIC',
  };
}

export function decisionFixture(): DecisionPayload {
  return {
    schemaVersion: '1',
    decisionId: '8f0e4950-9318-4099-a779-a30c9dac954b',
    revision: 1,
    previousDigest: null,
    displaySchemaVersion: 'review-v1',
    candidates: [
      {
        id: 'full-size',
        kind: 'TRADE',
        intent: intentFixture(),
        quoteId: 'synthetic-unit-test-quote',
        quoteDigest: `0x${'1'.repeat(64)}`,
        quotedAt: '2026-11-06T12:00:00.000Z',
        expiresAt: '2026-11-06T12:00:30.000Z',
        outputRaw: '1010000000000000000',
        provenance: 'SYNTHETIC_FIXTURE',
        limitations: ['Invented fixture for deterministic unit testing; not a market quote.'],
      },
      { id: 'no-trade', kind: 'NO_TRADE' },
    ],
    selectedCandidateId: 'full-size',
    sources: [],
    limitations: ['Synthetic test evidence; no wallet or blockchain was contacted.'],
    createdAt: '2026-11-06T12:00:01.000Z',
  };
}
