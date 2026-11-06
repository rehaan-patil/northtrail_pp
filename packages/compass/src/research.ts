import {
  MarketDatasetSchema,
  RiskReportSchema,
  ExecutionBudgetRequestSchema,
  ExecutionBudgetResultSchema,
  NorthtrailError,
  digestJson,
} from '@northtrail/domain';

// Statistical estimates use floating point. They never become signable token amounts.
export async function analyzeHistoricalRisk(input: unknown) {
  const dataset = MarketDatasetSchema.parse(input);
  const interval = dataset.intervalSeconds * 1000;
  const asOf = Date.parse(dataset.asOf);
  let missingIntervals = 0;
  for (let i = 0; i < dataset.candles.length; i++) {
    const candle = dataset.candles[i]!;
    const start = Date.parse(candle.openTime);
    const end = Date.parse(candle.closeTime);
    const available = Date.parse(candle.availableAt);
    const previous = dataset.candles[i - 1];
    if (
      end - start !== interval ||
      available < end ||
      available > asOf ||
      candle.low > Math.min(candle.open, candle.close) ||
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > candle.high
    )
      throw new NorthtrailError(
        'INVALID_INPUT',
        'Invalid OHLC range, interval or availability timestamp.',
      );
    if (previous) {
      const gap = start - Date.parse(previous.closeTime);
      if (gap < 0 || gap % interval !== 0)
        throw new NorthtrailError(
          'INVALID_INPUT',
          'Candles must be ordered, nonoverlapping and interval-aligned.',
        );
      missingIntervals += gap / interval;
    }
  }
  const limitations = [
    'User-supplied data; provider provenance, licensing and economic accuracy are not independently verified.',
    'Historical candles are not executable DeFi quotes. No execution counterfactual or future performance is established.',
    'Simple close-to-close returns; sample volatility; 365-day annualization assumes comparable intervals, not stationarity.',
    '95% empirical loss VaR (nearest rank) and fractional-tail Expected Shortfall; loss measures floored at zero. Estimates are not calibrated forecasts.',
    'EWMA lambda 0.94 is a descriptive baseline, not an out-of-sample validated model. Outlook ETH 24h research remains separate.',
  ];
  const eligible = dataset.candles.length >= 21 && missingIntervals === 0;
  if (!eligible)
    limitations.push(
      'ABSTAIN: at least 21 consecutive candles are required; gaps are never forward-filled.',
    );
  if (dataset.storageRights === 'UNKNOWN')
    limitations.push(
      'Storage rights unknown; this endpoint computes transiently and does not persist the dataset.',
    );
  let metrics = null;
  if (eligible) {
    const closes = dataset.candles.map((candle) => candle.close);
    const returns = closes.slice(1).map((close, i) => close / closes[i]! - 1);
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance =
      returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
    const losses = returns.map((value) => -value).sort((a, b) => a - b);
    const var95 = losses[Math.ceil(returns.length * 0.95) - 1]!;
    // Integrate exactly the worst 5% empirical probability mass, including a fractional boundary.
    let mass = returns.length * 0.05;
    let tail = 0;
    for (let i = losses.length - 1; mass > 1e-12 && i >= 0; i--) {
      const weight = Math.min(1, mass);
      tail += losses[i]! * weight;
      mass -= weight;
    }
    let peak = closes[0]!;
    let drawdown = 0;
    for (const price of closes) {
      peak = Math.max(peak, price);
      drawdown = Math.max(drawdown, 1 - price / peak);
    }
    let ewma = returns[0]! ** 2;
    for (const value of returns.slice(1)) ewma = 0.94 * ewma + 0.06 * value ** 2;
    metrics = {
      totalReturn: closes.at(-1)! / closes[0]! - 1,
      meanReturn: mean,
      sampleVolatility: Math.sqrt(variance),
      annualizedVolatility: Math.sqrt(variance * ((365 * 86400) / dataset.intervalSeconds)),
      maxDrawdown: drawdown,
      historicalVar95: Math.max(0, var95),
      historicalExpectedShortfall95: Math.max(0, tail / (returns.length * 0.05)),
      ewmaVolatility: Math.sqrt(ewma),
    };
  }
  return RiskReportSchema.parse({
    schemaVersion: '1',
    kind: 'HISTORICAL_RISK_RESEARCH',
    datasetDigest: await digestJson(dataset),
    asset: dataset.asset,
    source: dataset.source,
    datasetVersion: dataset.datasetVersion,
    provenance: dataset.provenance,
    status: eligible ? 'DESCRIPTIVE_ONLY' : 'ABSTAIN',
    observations: dataset.candles.length,
    missingIntervals,
    metrics,
    modelEligibility: 'NOT_VALIDATED',
    executionAuthorized: false,
    limitations,
  });
}

export function planExecutionBudget(input: unknown) {
  const request = ExecutionBudgetRequestSchema.parse(input);
  const amount = BigInt(request.amountInRaw);
  const count = BigInt(request.tranches);
  const gas = BigInt(request.gasPerTransactionWei);
  const totalGas = gas * count;
  const reasons = [
    'ABSTAIN: matched execution observations and held-out strategy evaluation are unavailable. No NOW/SPLIT/WAIT performance recommendation.',
  ];
  if (amount > BigInt(request.spendingCapRaw)) reasons.push('SPENDING_CAP_EXCEEDED');
  if (totalGas > BigInt(request.gasBudgetWei)) reasons.push('GAS_BUDGET_EXCEEDED');
  if (amount < count) reasons.push('ZERO_SIZE_TRANCHE');
  const amounts =
    amount < count
      ? []
      : Array.from({ length: request.tranches }, (_, i) =>
          (amount / count + (BigInt(i) < amount % count ? 1n : 0n)).toString(),
        );
  // Output bounds reject overflow instead of truncating financial values.
  return ExecutionBudgetResultSchema.parse({
    kind: 'CHRONOS_BUDGET_RESEARCH',
    recommendation: 'ABSTAIN',
    budgetFeasible: reasons.length === 1,
    amountsInRaw: amounts,
    totalGasWei: totalGas.toString(),
    additionalGasWei: (totalGas - gas).toString(),
    executionAuthorized: false,
    reasons: [
      ...reasons,
      'Gas is a supplied assumption and excludes approvals. Tranches need separate fresh quotes, minimum outputs and owner authorization; shared-pool outputs cannot be summed.',
    ],
  });
}
