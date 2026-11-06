import { z } from 'zod';
import {
  AddressSchema,
  HashSchema,
  PositiveAmountSchema,
  RawAmountSchema,
  TimestampSchema,
} from './schemas.js';

const NonzeroAddress = AddressSchema.refine(
  (value) => value !== '0x0000000000000000000000000000000000000000',
  'Address must be nonzero',
);

// In packages/domain/src/quotes.ts

export const QuoteObservationSchema = z.strictObject({
  schemaVersion: z.literal('1'),
  kind: z.literal('QUOTE_OBSERVATION'),
  provider: z.literal('UNISWAP'),
  provenance: z.literal('PROVIDER_RESPONSE'),
  request: QuoteRequestSchema,
  requestId: z.string().min(1).max(200),
  quoteId: z.string().min(1).max(200),
  responseDigest: HashSchema,
  requestedAt: TimestampSchema,
  fetchedAt: TimestampSchema,
  reviewExpiresAt: TimestampSchema,
  providerBlockNumber: PositiveAmountSchema,
  chainVerification: z.literal('NOT_VERIFIED'),
  outputRaw: PositiveAmountSchema,
  policyMinOutRaw: RawAmountSchema,
  providerMinOutRaw: RawAmountSchema.nullable(),
  gasEstimateWei: RawAmountSchema,
  approvalCost: z.literal('UNKNOWN'),
  routes: z
    .array(
      z
        .array(
          z.strictObject({
            pool: NonzeroAddress,
            tokenIn: NonzeroAddress,
            tokenOut: NonzeroAddress,
            feePips: z.number().int().min(0).max(1_000_000),
            // Add v4 protocol and hook metadata:
            protocol: z.enum(['V3', 'V4']).default('V3'),
            hooks: AddressSchema.optional(),
          }),
        )
        .min(1)
        .max(8),
    )
    .min(1)
    .max(8),
  executionAuthorized: z.literal(false),
  limitations: z.array(z.string().max(500)).min(1).max(20),
});
export type QuoteObservation = z.infer<typeof QuoteObservationSchema>;

export const AggregatorObservationSchema = z.strictObject({
  schemaVersion: z.literal('1'),
  kind: z.literal('AGGREGATOR_OBSERVATION'),
  provider: z.literal('ONEINCH'),
  provenance: z.literal('PROVIDER_RESPONSE'),
  request: QuoteRequestSchema,
  responseDigest: HashSchema,
  requestedAt: TimestampSchema,
  fetchedAt: TimestampSchema,
  reviewExpiresAt: TimestampSchema,
  outputRaw: PositiveAmountSchema,
  gasUnitsEstimate: PositiveAmountSchema,
  gasPriceWei: z.null(),
  providerBlockNumber: z.null(),
  chainVerification: z.literal('NOT_VERIFIED'),
  recipientBinding: z.literal('REQUEST_ONLY'),
  approvalCost: z.literal('UNKNOWN'),
  liquiditySources: z.array(z.string().min(1).max(100)).min(1).max(100),
  executionAuthorized: z.literal(false),
  limitations: z.array(z.string().max(500)).min(1).max(20),
});
export type AggregatorObservation = z.infer<typeof AggregatorObservationSchema>;

const BenchmarkFailureSchema = z.strictObject({
  ok: z.literal(false),
  code: z.enum([
    'NOT_CONFIGURED',
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_INVALID_RESPONSE',
    'PROVIDER_RATE_LIMITED',
    'QUOTE_STALE',
  ]),
});

export const QuoteBenchmarkSchema = z.strictObject({
  schemaVersion: z.literal('1'),
  kind: z.literal('QUOTE_BENCHMARK'),
  request: QuoteRequestSchema,
  uniswap: z.union([
    z.strictObject({ ok: z.literal(true), observation: QuoteObservationSchema }),
    BenchmarkFailureSchema,
  ]),
  oneinch: z.union([
    z.strictObject({ ok: z.literal(true), observation: AggregatorObservationSchema }),
    BenchmarkFailureSchema,
  ]),
  ranking: z.literal('NOT_COMPARABLE'),
  executionAuthorized: z.literal(false),
  reasons: z.array(z.string().max(500)).min(1).max(20),
});
export type QuoteBenchmark = z.infer<typeof QuoteBenchmarkSchema>;