import { z } from 'zod';
import {
  AssetSchema,
  ErrorResponseSchema,
  IntentInputSchema,
  NorthtrailError,
  PositiveAmountSchema,
  SystemStatusSchema,
  QuoteRequestSchema,
  QuoteObservationSchema,
  QuoteBenchmarkSchema,
  ReceiptRequestSchema,
  ReceiptObservationSchema,
  type ReceiptRequest,
  ReviewRequestSchema,
  ReviewResultSchema,
  RecoveryRequestSchema,
  RecoveryResultSchema,
  MarketDatasetSchema,
  RiskReportSchema,
  ExecutionBudgetRequestSchema,
  ExecutionBudgetResultSchema,
  type ReviewRequest,
  type RecoveryRequest,
  type MarketDataset,
  type ExecutionBudgetRequest,
  type QuoteRequest,
} from '../../domain/src/index.js';
export {
  createDecision,
  verifyDecision,
  parseAmount,
  formatAmount,
  type DecisionRecord,
  type DecisionPayload,
  type IntentInput,
  type SystemStatus,
  type QuoteRequest,
  type QuoteObservation,
  type AggregatorObservation,
  type QuoteBenchmark,
  type ReceiptRequest,
  type ReceiptObservation,
  type ReviewRequest,
  type RecoveryRequest,
  type MarketDataset,
  type RiskReport,
  type ExecutionBudgetRequest,
} from '../../domain/src/index.js';
export { inspectAquaCoverage, type AquaCoverageReport } from '../../aqua/src/index.js';
export { stressExposure, gasPaid } from '../../compass/src/index.js';

export function createNorthtrail(options: {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}) {
  const base = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    throw new NorthtrailError('INVALID_INPUT', 'Use an HTTP(S) API URL without credentials.');
  const transport = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
    throw new NorthtrailError(
      'INVALID_INPUT',
      'SDK timeout must be an integer from 1 to 60000 milliseconds.',
    );
  async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await transport(new URL(path, base), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
    } catch {
      throw new NorthtrailError(
        'PROVIDER_UNAVAILABLE',
        'Northtrail API could not be reached.',
        503,
        'Check the API URL and service status.',
      );
    }
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new NorthtrailError('PROVIDER_INVALID_RESPONSE', 'API response is not JSON.', 502);
    }
    if (!response.ok) {
      const parsed = ErrorResponseSchema.safeParse(result);
      if (parsed.success)
        throw new NorthtrailError(
          parsed.data.error.code,
          parsed.data.error.message,
          response.status,
          parsed.data.error.nextAction,
        );
      throw new NorthtrailError(
        'PROVIDER_INVALID_RESPONSE',
        'API returned an unexpected error response.',
        response.status,
      );
    }
    const parsed = schema.safeParse(result);
    if (!parsed.success)
      throw new NorthtrailError(
        'PROVIDER_INVALID_RESPONSE',
        'API response does not match the versioned contract.',
        502,
      );
    return parsed.data;
  }
  return {
    proofs: {
      observeReceipt: (input: ReceiptRequest) =>
        request('/v1/proofs/receipt', ReceiptObservationSchema, ReceiptRequestSchema.parse(input)),
    },
    reviewTrade: (input: ReviewRequest) =>
      request('/v1/trades/review', ReviewResultSchema, ReviewRequestSchema.parse(input)),
    recoverTrade: (input: RecoveryRequest) =>
      request('/v1/trades/recovery', RecoveryResultSchema, RecoveryRequestSchema.parse(input)),
    quant: {
      risk: (input: MarketDataset) =>
        request('/v1/quant/risk', RiskReportSchema, MarketDatasetSchema.parse(input)),
    },
    execution: {
      planBudget: (input: ExecutionBudgetRequest) =>
        request(
          '/v1/execution/budget',
          ExecutionBudgetResultSchema,
          ExecutionBudgetRequestSchema.parse(input),
        ),
    },
    benchmarkQuotes: (input: QuoteRequest) =>
      request('/v1/quotes/benchmark', QuoteBenchmarkSchema, QuoteRequestSchema.parse(input)),
    quoteUniswap: (input: QuoteRequest) =>
      request('/v1/quotes/uniswap', QuoteObservationSchema, QuoteRequestSchema.parse(input)),
    status: () => request('/v1/status', SystemStatusSchema),
    assets: () =>
      request(
        '/v1/assets',
        z.strictObject({
          assets: z.array(AssetSchema),
          chainId: z.number().int(),
          verification: z.literal('REGISTRY_ONLY'),
          tradingEnabled: z.literal(false),
        }),
      ),
    scenario: (input: { amountRaw: string; changeBps: number }) =>
      request(
        '/v1/compass/scenario',
        z.strictObject({
          changeRaw: z.string().regex(/^-?[0-9]+$/),
          remainingRaw: z.string().regex(/^[0-9]+$/),
          rounding: z.literal('TOWARD_ZERO'),
          kind: z.literal('SCENARIO_ARITHMETIC'),
        }),
        z
          .strictObject({
            amountRaw: PositiveAmountSchema,
            changeBps: z.number().int().min(-10_000).max(100_000),
          })
          .parse(input),
      ),
    validateIntent: (input: unknown) =>
      request(
        '/v1/intents/validate',
        z.strictObject({
          valid: z.literal(true),
          intent: IntentInputSchema,
          spendAuthorized: z.literal(false),
        }),
        IntentInputSchema.parse(input),
      ),
    verifyDecision: (record: unknown) =>
      request('/v1/decisions/verify', z.strictObject({ valid: z.boolean(), meaning: z.string() }), {
        record,
      }),
  };
}
