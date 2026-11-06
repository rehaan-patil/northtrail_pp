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

export interface RouteHistoryPoint {
  observedAtMs: number;
  netOutputRaw: string;
  benchmarkNetOutputRaw: string;
}

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
  history?: RouteHistoryPoint[];
}

export interface RouteComparisonContext {
  request: QuoteRequest;
  provenance: RouteSample['provenance'];
  blockHash: string | null;
  nowMs: number;
  maxAgeMs: number;
  maxSkewMs: number;
  previousWinnerId?: string | null;
  momentumLookbackMs?: number;
  forecastHorizonMs?: number;
  switchBufferBps?: number;
  volatilityPenaltyBps?: number;
  maxForecastBps?: number;
  ewmaLambdaBps?: number;
}

interface RouteSignal {
  momentumBps: number;
  volatilityBps: number;
  forecastAdjustmentBps: number;
  historyPoints: number;
  signalStatus: 'ACTIVE' | 'INSUFFICIENT_HISTORY';
}

const BPS = 10_000n;
const MAX_SAMPLES = 64;
const MAX_HISTORY_POINTS = 64;

const DEFAULT_LOOKBACK_MS = 30_000;
const DEFAULT_FORECAST_HORIZON_MS = 1_000;
const DEFAULT_SWITCH_BUFFER_BPS = 2;
const DEFAULT_VOLATILITY_PENALTY_BPS = 16_450;
const DEFAULT_MAX_FORECAST_BPS = 30;
const DEFAULT_EWMA_LAMBDA_BPS = 9_400;

function isBoundedInteger(
  value: number,
  minimum: number,
  maximum: number,
): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function ratioBps(
  numerator: bigint,
  denominator: bigint,
): number {
  if (denominator <= 0n) return 0;

  const value = (numerator * BPS) / denominator;

  if (value > 100_000n) return 100_000;
  if (value < -100_000n) return -100_000;

  return Number(value);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);

  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!;
}

function calculateRouteSignal(
  history: RouteHistoryPoint[] | undefined,
  requestedAtMs: number,
  lookbackMs: number,
  forecastHorizonMs: number,
  volatilityPenaltyBps: number,
  maxForecastBps: number,
  ewmaLambdaBps: number,
): RouteSignal {
  const inactive: RouteSignal = {
    momentumBps: 0,
    volatilityBps: 0,
    forecastAdjustmentBps: 0,
    historyPoints: 0,
    signalStatus: 'INSUFFICIENT_HISTORY',
  };

  if (!history || history.length < 3) return inactive;

  if (history.length > MAX_HISTORY_POINTS) {
    throw new NorthtrailError(
      'INVALID_INPUT',
      'Route history exceeds the supported observation limit.',
    );
  }

  let previousTimestamp = -1;

  const observations: {
    observedAtMs: number;
    edgeBps: number;
  }[] = [];

  for (const point of history) {
    if (
      !Number.isSafeInteger(point.observedAtMs) ||
      point.observedAtMs <= previousTimestamp ||
      point.observedAtMs >= requestedAtMs
    ) {
      throw new NorthtrailError(
        'INVALID_INPUT',
        'Route history must be strictly ordered and precede the current quote.',
      );
    }

    previousTimestamp = point.observedAtMs;

    const netOutput = BigInt(
      PositiveAmountSchema.parse(point.netOutputRaw),
    );

    const benchmarkOutput = BigInt(
      PositiveAmountSchema.parse(point.benchmarkNetOutputRaw),
    );

    observations.push({
      observedAtMs: point.observedAtMs,
      edgeBps: ratioBps(
        netOutput - benchmarkOutput,
        benchmarkOutput,
      ),
    });
  }

  const recent = observations.filter(
    (point) =>
      point.observedAtMs >= requestedAtMs - lookbackMs,
  );

  if (recent.length < 3) return inactive;

  const slopes: number[] = [];

  for (let left = 0; left < recent.length - 1; left++) {
    for (
      let right = left + 1;
      right < recent.length;
      right++
    ) {
      const elapsedSeconds =
        (recent[right]!.observedAtMs -
          recent[left]!.observedAtMs) /
        1_000;

      if (elapsedSeconds > 0) {
        slopes.push(
          (recent[right]!.edgeBps -
            recent[left]!.edgeBps) /
            elapsedSeconds,
        );
      }
    }
  }

  if (slopes.length === 0) return inactive;

  const robustSlope = median(slopes);
  const lambda = ewmaLambdaBps / 10_000;

  let ewmaVariance = 0;
  let initialized = false;

  for (let index = 1; index < recent.length; index++) {
    const previous = recent[index - 1]!;
    const current = recent[index]!;

    const elapsedSeconds =
      (current.observedAtMs -
        previous.observedAtMs) /
      1_000;

    const innovation =
      (current.edgeBps -
        previous.edgeBps -
        robustSlope * elapsedSeconds) /
      Math.sqrt(elapsedSeconds);

    const squaredInnovation =
      innovation * innovation;

    ewmaVariance = initialized
      ? lambda * ewmaVariance +
        (1 - lambda) * squaredInnovation
      : squaredInnovation;

    initialized = true;
  }

  const horizonSeconds =
    forecastHorizonMs / 1_000;

  const projectedMomentum =
    robustSlope * horizonSeconds;

  const forecastVolatility = Math.sqrt(
    Math.max(0, ewmaVariance) * horizonSeconds,
  );

  const volatilityCost =
    (forecastVolatility * volatilityPenaltyBps) /
    10_000;

  const adjustment = Math.round(
    projectedMomentum - volatilityCost,
  );

  const forecastAdjustmentBps = Math.max(
    -maxForecastBps,
    Math.min(maxForecastBps, adjustment),
  );

  return {
    momentumBps: Math.round(projectedMomentum),
    volatilityBps: Math.round(forecastVolatility),
    forecastAdjustmentBps,
    historyPoints: recent.length,
    signalStatus: 'ACTIVE',
  };
}

export function convertCostCeil(
  costRaw: string,
  outputNumerator: string,
  sourceDenominator: string,
): string {
  const cost = BigInt(
    RawAmountSchema.parse(costRaw),
  );

  const numerator = BigInt(
    PositiveAmountSchema.parse(outputNumerator),
  );

  const denominator = BigInt(
    PositiveAmountSchema.parse(sourceDenominator),
  );

  return (
    (cost * numerator + denominator - 1n) /
    denominator
  ).toString();
}

export function compareRouteCosts(
  context: RouteComparisonContext,
  samples: RouteSample[],
) {
  const requestCanonical = canonicalJson(
    QuoteRequestSchema.parse(context.request),
  );

  const lookbackMs =
    context.momentumLookbackMs ??
    DEFAULT_LOOKBACK_MS;

  const forecastHorizonMs =
    context.forecastHorizonMs ??
    DEFAULT_FORECAST_HORIZON_MS;

  const switchBufferBps =
    context.switchBufferBps ??
    DEFAULT_SWITCH_BUFFER_BPS;

  const volatilityPenaltyBps =
    context.volatilityPenaltyBps ??
    DEFAULT_VOLATILITY_PENALTY_BPS;

  const maxForecastBps =
    context.maxForecastBps ??
    DEFAULT_MAX_FORECAST_BPS;

  const ewmaLambdaBps =
    context.ewmaLambdaBps ??
    DEFAULT_EWMA_LAMBDA_BPS;

  const timingValid =
    Number.isSafeInteger(context.nowMs) &&
    Number.isSafeInteger(context.maxAgeMs) &&
    Number.isSafeInteger(context.maxSkewMs) &&
    context.maxAgeMs > 0 &&
    context.maxAgeMs <= 60_000 &&
    context.maxSkewMs >= 0 &&
    context.maxSkewMs <= context.maxAgeMs;

  const provenanceValid = [
    'SYNTHETIC_FIXTURE',
    'PROVIDER_OBSERVATION',
    'PINNED_CHAIN_BLOCK',
  ].includes(context.provenance);

  const strategyConfigValid =
    isBoundedInteger(lookbackMs, 1_000, 300_000) &&
    isBoundedInteger(forecastHorizonMs, 100, 10_000) &&
    isBoundedInteger(switchBufferBps, 0, 100) &&
    isBoundedInteger(volatilityPenaltyBps, 0, 50_000) &&
    isBoundedInteger(maxForecastBps, 1, 100) &&
    isBoundedInteger(ewmaLambdaBps, 0, 10_000);

  if (
    !timingValid ||
    !strategyConfigValid ||
    samples.length > MAX_SAMPLES ||
    !provenanceValid
  ) {
    throw new NorthtrailError(
      'INVALID_INPUT',
      'Invalid bounded route comparison context.',
    );
  }

  if (context.provenance === 'PINNED_CHAIN_BLOCK') {
    HashSchema.parse(context.blockHash);
  } else if (context.blockHash !== null) {
    throw new NorthtrailError(
      'INVALID_INPUT',
      'Unverified observations cannot claim a pinned block.',
    );
  }

  const seenIds = new Set<string>();

  const rows = samples.map((sample) => {
    if (
      !sample.id ||
      sample.id.length > 200 ||
      seenIds.has(sample.id)
    ) {
      throw new NorthtrailError(
        'INVALID_INPUT',
        'Route sample IDs must be unique.',
      );
    }

    seenIds.add(sample.id);

    if (
      ![
        'SINGLE_POOL',
        'UNISWAP_NATIVE',
        'AGGREGATOR',
      ].includes(sample.group)
    ) {
      throw new NorthtrailError(
        'INVALID_INPUT',
        'Unknown route comparison group.',
      );
    }

    const reasons = [...sample.exclusionReasons];

    if (
      canonicalJson(
        QuoteRequestSchema.parse(sample.request),
      ) !== requestCanonical
    ) {
      reasons.push('REQUEST_MISMATCH');
    }

    if (sample.provenance !== context.provenance) {
      reasons.push('PROVENANCE_MISMATCH');
    }

    if (sample.blockHash !== context.blockHash) {
      reasons.push('BLOCK_MISMATCH');
    }

    const timingValidForSample =
      Number.isSafeInteger(sample.requestedAtMs) &&
      Number.isSafeInteger(sample.fetchedAtMs) &&
      sample.fetchedAtMs >= sample.requestedAtMs &&
      sample.fetchedAtMs <= context.nowMs &&
      context.nowMs - sample.requestedAtMs <=
        context.maxAgeMs;

    if (!timingValidForSample) {
      reasons.push('STALE_OR_INVALID_TIME');
    }

    if (!sample.embeddedFeesKnown) {
      reasons.push('FEE_INCLUSION_UNKNOWN');
    }

    if (
      [
        sample.gasOutputRaw,
        sample.approvalOutputRaw,
        sample.additionalFeesOutputRaw,
      ].some((value) => value === null)
    ) {
      reasons.push('COST_UNKNOWN');
    }

    const output = BigInt(
      PositiveAmountSchema.parse(sample.outputRaw),
    );

    const totalCost = [
      sample.gasOutputRaw,
      sample.approvalOutputRaw,
      sample.additionalFeesOutputRaw,
    ].reduce(
      (total, value) =>
        total +
        (value === null
          ? 0n
          : BigInt(RawAmountSchema.parse(value))),
      0n,
    );

    const netOutputRaw = (
      output - totalCost
    ).toString();

    if (output <= totalCost) {
      reasons.push('NON_POSITIVE_NET_OUTPUT');
    }

    return {
      id: sample.id,
      group: sample.group,
      requestedAtMs: sample.requestedAtMs,
      fetchedAtMs: sample.fetchedAtMs,
      reasons: [...new Set(reasons)],
      netOutputRaw,
      signal: calculateRouteSignal(
        sample.history,
        sample.requestedAtMs,
        lookbackMs,
        forecastHorizonMs,
        volatilityPenaltyBps,
        maxForecastBps,
        ewmaLambdaBps,
      ),
    };
  });

  const valid = rows.filter(
    (row) => row.reasons.length === 0,
  );

  if (valid.length > 0) {
    const latestFetch = Math.max(
      ...valid.map((row) => row.fetchedAtMs),
    );

    const earliestRequest = Math.min(
      ...valid.map((row) => row.requestedAtMs),
    );

    if (
      latestFetch - earliestRequest >
      context.maxSkewMs
    ) {
      for (const row of valid) {
        row.reasons.push(
          'OBSERVATION_WINDOW_TOO_WIDE',
        );
      }
    }
  }

  const comparable = rows.filter(
    (row) => row.reasons.length === 0,
  );

  const netOutputRanked = [...comparable].sort(
    (left, right) => {
      const difference =
        BigInt(right.netOutputRaw) -
        BigInt(left.netOutputRaw);

      return difference === 0n
        ? left.id.localeCompare(right.id)
        : difference > 0n
          ? 1
          : -1;
    },
  );

  const strategyRanked = [...comparable].sort(
    (left, right) => {
      const leftScore =
        BigInt(left.netOutputRaw) *
        BigInt(
          10_000 +
            left.signal.forecastAdjustmentBps,
        );

      const rightScore =
        BigInt(right.netOutputRaw) *
        BigInt(
          10_000 +
            right.signal.forecastAdjustmentBps,
        );

      if (leftScore !== rightScore) {
        return leftScore > rightScore ? -1 : 1;
      }

      const outputDifference =
        BigInt(right.netOutputRaw) -
        BigInt(left.netOutputRaw);

      return outputDifference === 0n
        ? left.id.localeCompare(right.id)
        : outputDifference > 0n
          ? 1
          : -1;
    },
  );

  const bestCandidate = strategyRanked[0];

  const incumbent = context.previousWinnerId
    ? strategyRanked.find(
        (row) =>
          row.id === context.previousWinnerId,
      )
    : undefined;

  let recommendedId =
    bestCandidate?.id ?? null;

  let previousWinnerRetained = false;

  if (
    bestCandidate &&
    incumbent &&
    incumbent.id !== bestCandidate.id
  ) {
    const incumbentScore =
      BigInt(incumbent.netOutputRaw) *
      BigInt(
        10_000 +
          incumbent.signal.forecastAdjustmentBps,
      );

    const bestScore =
      BigInt(bestCandidate.netOutputRaw) *
      BigInt(
        10_000 +
          bestCandidate.signal.forecastAdjustmentBps,
      );

    if (
      incumbentScore * BPS >=
      bestScore *
        BigInt(10_000 - switchBufferBps)
    ) {
      recommendedId = incumbent.id;
      previousWinnerRetained = true;
    }
  }

  const rankedIds = recommendedId
    ? [
        recommendedId,
        ...strategyRanked
          .filter(
            (row) => row.id !== recommendedId,
          )
          .map((row) => row.id),
      ]
    : [];

  const groups: Record<RouteGroup, string[]> = {
    SINGLE_POOL: [],
    UNISWAP_NATIVE: [],
    AGGREGATOR: [],
  };

  for (const row of strategyRanked) {
    groups[row.group].push(row.id);
  }

  return {
    kind: 'ROUTE_COST_ANALYSIS' as const,
    executionAuthorized: false as const,
    provenance: context.provenance,
    rankedIds,
    netOutputRankedIds: netOutputRanked.map(
      (row) => row.id,
    ),
    groups,
    candidates: rows.map(
      ({ id, group, reasons, netOutputRaw }) => ({
        id,
        group,
        comparable: reasons.length === 0,
        reasons,
        netOutputRaw:
          reasons.length > 0 ? null : netOutputRaw,
      }),
    ),
    strategy: {
      name: 'RISK_ADJUSTED_BUFFERED_MOMENTUM' as const,
      recommendedId,
      rankedIds,
      previousWinnerRetained,
      switchBufferBps,
      lookbackMs,
      forecastHorizonMs,
      ewmaLambdaBps,
      candidates: rows.map((row) => ({
        id: row.id,
        comparable: row.reasons.length === 0,
        scoreRaw:
          row.reasons.length === 0
            ? (
                (BigInt(row.netOutputRaw) *
                  BigInt(
                    10_000 +
                      row.signal.forecastAdjustmentBps,
                  )) /
                BPS
              ).toString()
            : null,
        momentumBps: row.signal.momentumBps,
        volatilityBps: row.signal.volatilityBps,
        forecastAdjustmentBps:
          row.signal.forecastAdjustmentBps,
        historyPoints: row.signal.historyPoints,
        signalStatus: row.signal.signalStatus,
      })),
    },
    limitations: [
      'Analysis of supplied observations, not verification of source truth, pool state, calldata or wallet authority.',
      'Net output subtracts gas, approval and separately charged fees only. Embedded AMM fees and price impact must not be subtracted twice.',
      'Gas conversions require an independently supplied timestamped rational rate. Unknown costs exclude the sample.',
      'Provider observations are time-window comparisons, not exact-block quotes. Shared-pool split outputs must not be summed as independent executions.',
      'Momentum uses relative net-output edge against a same-request, same-time benchmark to reduce common ETH price movement.',
      'The volatility-adjusted forecast is a heuristic score, not a trained or calibrated probability of future execution success.',
      'At least three valid historical observations are required; insufficient history falls back to current net-output ranking.',
      'Historical route observations must use identical token pair, input amount, fee accounting and benchmark methodology.',
      'The recommended route is analytical guidance only; execution remains unauthorized.',
    ],
  };
}

export function crossoverIntervals(
  points: {
    amountInRaw: string;
    winnerId: string | null;
  }[],
) {
  if (points.length > MAX_SAMPLES) {
    throw new NorthtrailError(
      'INVALID_INPUT',
      'Amount grid exceeds the bounded research budget.',
    );
  }

  const intervals: {
    lowerRaw: string;
    upperRaw: string;
    from: string;
    to: string;
  }[] = [];

  for (
    let index = 0;
    index < points.length;
    index++
  ) {
    const current = points[index]!;

    PositiveAmountSchema.parse(
      current.amountInRaw,
    );

    const previous = points[index - 1];

    if (!previous) continue;

    if (
      BigInt(current.amountInRaw) <=
      BigInt(previous.amountInRaw)
    ) {
      throw new NorthtrailError(
        'INVALID_INPUT',
        'Amount grid must increase strictly.',
      );
    }

    if (
      previous.winnerId &&
      current.winnerId &&
      previous.winnerId !== current.winnerId
    ) {
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
