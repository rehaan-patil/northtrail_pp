import { describe, expect, it } from 'vitest';
import {
  compareRouteCosts,
  convertCostCeil,
  crossoverIntervals,
  type RouteSample,
  type RouteComparisonContext,
} from '../packages/compass/src/index.js';
import { quoteRequestFixture } from './quote-fixtures.js';

const context = (): RouteComparisonContext => ({
  request: quoteRequestFixture(),
  provenance: 'SYNTHETIC_FIXTURE',
  blockHash: null,
  nowMs: 10_000,
  maxAgeMs: 5_000,
  maxSkewMs: 1_000,
});
const sample = (id: string, overrides: Partial<RouteSample> = {}): RouteSample => ({
  id,
  group: 'SINGLE_POOL',
  request: quoteRequestFixture(),
  provenance: 'SYNTHETIC_FIXTURE',
  blockHash: null,
  requestedAtMs: 9_000,
  fetchedAtMs: 9_100,
  outputRaw: '100000000000000000000',
  gasOutputRaw: '3',
  approvalOutputRaw: '2',
  additionalFeesOutputRaw: '1',
  embeddedFeesKnown: true,
  exclusionReasons: [],
  ...overrides,
});

describe('Curve Atlas exact arithmetic research foundation', () => {
  it('ranks net output beyond Number precision and preserves comparison groups', () => {
    const result = compareRouteCosts(context(), [
      sample('pool'),
      sample('native', { group: 'UNISWAP_NATIVE', gasOutputRaw: '1' }),
      sample('pathfinder', {
        group: 'AGGREGATOR',
        outputRaw: '100000000000000000001',
        gasOutputRaw: '99',
      }),
    ]);
    expect(result.rankedIds).toEqual(['native', 'pool', 'pathfinder']);
    expect(result.groups.AGGREGATOR).toEqual(['pathfinder']);
    expect(result.candidates[0]?.netOutputRaw).toBe('99999999999999999994');
    expect(result.executionAuthorized).toBe(false);
  });
  it.each([
    ['COST_UNKNOWN', { approvalOutputRaw: null }],
    ['COST_UNKNOWN', { gasOutputRaw: null }],
    ['COST_UNKNOWN', { additionalFeesOutputRaw: null }],
    ['FEE_INCLUSION_UNKNOWN', { embeddedFeesKnown: false }],
    ['BLOCK_MISMATCH', { blockHash: `0x${'1'.repeat(64)}` }],
    ['PROVENANCE_MISMATCH', { provenance: 'PROVIDER_OBSERVATION' }],
    ['STALE_OR_INVALID_TIME', { requestedAtMs: 1 }],
    ['STALE_OR_INVALID_TIME', { fetchedAtMs: 11_000 }],
    ['ROUTER_DENIED', { exclusionReasons: ['ROUTER_DENIED'] }],
  ] as [string, Partial<RouteSample>][])(
    'excludes %s before ranking even with huge output',
    (reason, override) => {
      const result = compareRouteCosts(context(), [
        sample('valid'),
        sample('invalid', { outputRaw: '200000000000000000000', ...override }),
      ]);
      expect(result.rankedIds).toEqual(['valid']);
      expect(result.candidates[1]?.reasons).toContain(reason);
      expect(result.candidates[1]?.netOutputRaw).toBeNull();
    },
  );
  it('requires the same amount, wallet, recipient, assets and slippage', () => {
    for (const request of [
      { ...quoteRequestFixture(), amountInRaw: '999999' },
      { ...quoteRequestFixture(), recipient: quoteRequestFixture().owner },
      { ...quoteRequestFixture(), slippageBps: 100 },
    ])
      expect(compareRouteCosts(context(), [sample('different', { request })]).rankedIds).toEqual(
        [],
      );
  });
  it('refuses to rank an unsynchronized window or pretend it is pinned', () => {
    const result = compareRouteCosts(context(), [
      sample('a'),
      sample('b', { requestedAtMs: 7_000, fetchedAtMs: 7_100 }),
    ]);
    expect(result.rankedIds).toEqual([]);
    expect(
      result.candidates.every((row) => row.reasons.includes('OBSERVATION_WINDOW_TOO_WIDE')),
    ).toBe(true);
    expect(() =>
      compareRouteCosts({ ...context(), provenance: 'PINNED_CHAIN_BLOCK' }, []),
    ).toThrow();
    expect(() =>
      compareRouteCosts(context(), [sample('duplicate'), sample('duplicate')]),
    ).toThrow();
  });
  it('rounds rational gas conversions upward without float drift', () => {
    expect(convertCostCeil('1', '1', '3')).toBe('1');
    expect(convertCostCeil('9007199254740993', '3', '2')).toBe('13510798882111490');
    expect(() => convertCostCeil('1', '1', '0')).toThrow();
  });
  it('reports sampled crossover intervals without interpolating over gaps', () => {
    expect(
      crossoverIntervals([
        { amountInRaw: '1', winnerId: 'a' },
        { amountInRaw: '10', winnerId: 'b' },
        { amountInRaw: '100', winnerId: null },
        { amountInRaw: '1000', winnerId: 'c' },
      ]).intervals,
    ).toEqual([{ lowerRaw: '1', upperRaw: '10', from: 'a', to: 'b' }]);
    expect(() =>
      crossoverIntervals([
        { amountInRaw: '10', winnerId: 'a' },
        { amountInRaw: '1', winnerId: 'b' },
      ]),
    ).toThrow();
  });
});
