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
} from '../../domain/src/index.js';

export function createNorthtrail(options: {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}) {
  const base = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new NorthtrailError('INVALID_INPUT', 'Use an HTTP(S) API URL without credentials.');
  }

  const transport = options.fetch ?? globalThis.fetch;

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
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
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
      const errorParsed = ErrorResponseSchema.safeParse(result);
      if (errorParsed.success) {
        throw new NorthtrailError(
          errorParsed.data.error.code,
          errorParsed.data.error.message,
          response.status,
          errorParsed.data.error.nextAction,
        );
      }
      throw new NorthtrailError(
        'PROVIDER_INVALID_RESPONSE',
        'API returned an unexpected error response.',
        response.status,
      );
    }

    const parsed = schema.safeParse(result);
    if (!parsed.success) {
      throw new NorthtrailError(
        'PROVIDER_INVALID_RESPONSE',
        'API response does not match the versioned contract.',
        502,
      );
    }

    return parsed.data;
  }

  return {
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