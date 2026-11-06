import {
  NorthtrailError,
  QuoteRequestSchema,
  RawAmountSchema,
  PositiveAmountSchema,
  HashSchema,
  canonicalJson,
  type QuoteRequest,
} from '@northtrail/domain';

export type RouteGroup = 'SINGLE_POOL' | 'UNISWAP_NATIVE' | 'AGGREGATOR';

export interface RouteSample {
  id: string;
  group: RouteGroup;
  request: QuoteRequest;
  provenance: 'SYNTHETIC_FIXTURE' | 'PROVIDER_OBSERVATION' | 'PINNED_CHAIN_BLOCK';
  blockHash: string | null;
  requestedAtMs: number;
  fetchedAtMs: number;
  outputRaw: string;
  gasOutputRaw: string | null;
  approvalOutputRaw: string | null;
  additionalFeesOutputRaw: string | null;
  embeddedFeesKnown: boolean;
  exclusionReasons: string[];
}

export interface RouteComparisonContext {
  request: QuoteRequest;
  provenance: RouteSample['provenance'];
  blockHash: string | null;
  nowMs: number;
  maxAgeMs: number;
  maxSkewMs: number;
}

export function convertCostCeil(
  costRaw: string,
  outputNumerator: string,
  sourceDenominator: string,
): string {
  const cost = BigInt(RawAmountSchema.parse(costRaw));
  const numerator = BigInt(PositiveAmountSchema.parse(outputNumerator));
  const denominator = BigInt(PositiveAmountSchema.parse(sourceDenominator));

  // Compute rational conversion with ceiling rounding without float drift
  return ((cost * numerator + denominator - 1n) / denominator).toString();
}

export function compareRouteCosts(context: RouteComparisonContext, samples: RouteSample[]) {
  const requestCanonical = canonicalJson(QuoteRequestSchema.parse(context.request));

  const isTimingValid =
    Number.isSafeInteger(context.nowMs) &&
    Number.isSafeInteger(context.maxAgeMs) &&
    Number.isSafeInteger(context.maxSkewMs) &&
    context.maxAgeMs > 0 &&
    context.maxAgeMs <= 60_000 &&
    context.maxSkewMs >= 0 &&
    context.maxSkewMs <= context.maxAgeMs;

  const isProvenanceValid = ['SYNTHETIC_FIXTURE', 'PROVIDER_OBSERVATION', 'PINNED_CHAIN_BLOCK'].includes(
    context.provenance,
  );

  if (!isTimingValid || samples.length > 64 || !isProvenanceValid) {
    throw new NorthtrailError('INVALID_INPUT', 'Invalid bounded route comparison context.');
  }

  if (context.provenance === 'PINNED_CHAIN_BLOCK') {
    HashSchema.parse(context.blockHash);
  } else if (context.blockHash !== null) {
    throw new NorthtrailError('INVALID_INPUT', 'Unverified observations cannot claim a pinned block.');
  }

  const seenIds = new Set<string>();

  const rows = samples.map((sample) => {
    if (!sample.id || sample.id.length > 200 || seenIds.has(sample.id)) {
      throw new NorthtrailError('INVALID_INPUT', 'Route sample IDs must be unique.');
    }
    seenIds.add(sample.id);

    if (!['SINGLE_POOL', 'UNISWAP_NATIVE', 'AGGREGATOR'].includes(sample.group)) {
      throw new NorthtrailError('INVALID_INPUT', 'Unknown route comparison group.');
    }

    const reasons = [...sample.exclusionReasons];

    if (canonicalJson(QuoteRequestSchema.parse(sample.request)) !== requestCanonical) {
      reasons.push('REQUEST_MISMATCH');
    }
    if (sample.provenance !== context.provenance) {
      reasons.push('PROVENANCE_MISMATCH');
    }
    if (sample.blockHash !== context.blockHash) {
      reasons.push('BLOCK_MISMATCH');
    }

    const timingOk =
      Number.isSafeInteger(sample.requestedAtMs) &&
      Number.isSafeInteger(sample.fetchedAtMs) &&
      sample.fetchedAtMs >= sample.requestedAtMs &&
      sample.fetchedAtMs <= context.nowMs &&
      context.nowMs - sample.requestedAtMs <= context.maxAgeMs;

    if (!timingOk) {
      reasons.push('STALE_OR_INVALID_TIME');
    }

    if (!sample.embeddedFeesKnown) {
      reasons.push('FEE_INCLUSION_UNKNOWN');
    }

    const costs = [sample.gasOutputRaw, sample.approvalOutputRaw, sample.additionalFeesOutputRaw];
    if (costs.some((c) => c === null)) {
      reasons.push('COST_UNKNOWN');
    }

    const output = BigInt(PositiveAmountSchema.parse(sample.outputRaw));
    let totalCost = 0n;
    for (const costItem of costs) {
      if (costItem !== null) {
        totalCost += BigInt(RawAmountSchema.parse(costItem));
      }
    }

    return {
      id: sample.id,
      group: sample.group,
      requestedAtMs: sample.requestedAtMs,
      fetchedAtMs: sample.fetchedAtMs,
      reasons: [...new Set(reasons)],
      netOutputRaw: (output - totalCost).toString(),
    };
  });

  const valid = rows.filter((r) => r.reasons.length === 0);
  if (valid.length > 0) {
    const maxFetched = Math.max(...valid.map((r) => r.fetchedAtMs));
    const minRequested = Math.min(...valid.map((r) => r.requestedAtMs));
    if (maxFetched - minRequested > context.maxSkewMs) {
      for (const row of valid) {
        row.reasons.push('OBSERVATION_WINDOW_TOO_WIDE');
      }
    }
  }

  const ranked = rows
    .filter((r) => r.reasons.length === 0)
    .sort((a, b) => {
      const diff = BigInt(b.netOutputRaw) - BigInt(a.netOutputRaw);
      if (diff === 0n) {
        return a.id.localeCompare(b.id);
      }
      return diff > 0n ? 1 : -1;
    });

  const groups: Record<RouteGroup, string[]> = {
    SINGLE_POOL: [],
    UNISWAP_NATIVE: [],
    AGGREGATOR: [],
  };

  for (const item of ranked) {
    groups[item.group].push(item.id);
  }

  return {
    kind: 'ROUTE_COST_ANALYSIS' as const,
    executionAuthorized: false as const,
    provenance: context.provenance,
    rankedIds: ranked.map((r) => r.id),
    groups,
    candidates: rows.map(({ id, group, reasons, netOutputRaw }) => ({
      id,
      group,
      comparable: reasons.length === 0,
      reasons,
      netOutputRaw: reasons.length > 0 ? null : netOutputRaw,
    })),
    limitations: [
      'Analysis of supplied observations, not verification of source truth, pool state, calldata or wallet authority.',
      'Net output subtracts gas, approval and separately charged fees only. Embedded AMM fees and impact must not be subtracted twice.',
      'Gas conversions must use an independently supplied timestamped rational rate. Unknown costs exclude the sample.',
      'Provider observations are window comparisons, not exact-block quotes. Never sum split routes that share pool state.',
    ],
  };
}

export function crossoverIntervals(points: { amountInRaw: string; winnerId: string | null }[]) {
  if (points.length > 64) {
    throw new NorthtrailError('INVALID_INPUT', 'Amount grid exceeds the bounded research budget.');
  }

  const intervals: { lowerRaw: string; upperRaw: string; from: string; to: string }[] = [];

  for (let i = 0; i < points.length; i++) {
    const current = points[i]!;
    PositiveAmountSchema.parse(current.amountInRaw);

    const previous = points[i - 1];
    if (!previous) continue;

    if (BigInt(current.amountInRaw) <= BigInt(previous.amountInRaw)) {
      throw new NorthtrailError('INVALID_INPUT', 'Amount grid must increase strictly.');
    }

    if (previous.winnerId && current.winnerId && previous.winnerId !== current.winnerId) {
      intervals.push({
        lowerRaw: previous.amountInRaw,
        upperRaw: current.amountInRaw,
        from: previous.winnerId,
        to: current.winnerId,
      });
    }
  }

  return {
    kind: 'SAMPLED_CROSSOVER_INTERVALS' as const,
    intervals,
    interpolation: 'NONE' as const,
  };
}