import { z } from 'zod';
import {
  AssetSchema,
  PositiveAmountSchema,
  RawAmountSchema,
  TimestampSchema,
  HashSchema,
} from './schemas.js';

const Price = z.number().finite().min(1e-15).max(1e15);
export const MarketDatasetSchema = z.strictObject({
  schemaVersion: z.literal('1'),
  asset: AssetSchema,
  quoteCurrency: z.literal('USD'),
  source: z.string().min(1).max(200),
  datasetVersion: z.string().min(1).max(100),
  provenance: z.enum(['USER_SUPPLIED', 'SYNTHETIC_FIXTURE']),
  storageRights: z.enum(['USER_ATTESTED', 'UNKNOWN']),
  intervalSeconds: z.number().int().min(60).max(604800),
  asOf: TimestampSchema,
  candles: z
    .array(
      z.strictObject({
        openTime: TimestampSchema,
        closeTime: TimestampSchema,
        availableAt: TimestampSchema,
        open: Price,
        high: Price,
        low: Price,
        close: Price,
        volume: z.number().finite().nonnegative().max(1e30),
      }),
    )
    .min(2)
    .max(512),
});
export type MarketDataset = z.infer<typeof MarketDatasetSchema>;
const Metric = z.number().finite();
export const RiskReportSchema = z.strictObject({
  schemaVersion: z.literal('1'),
  kind: z.literal('HISTORICAL_RISK_RESEARCH'),
  datasetDigest: HashSchema,
  asset: AssetSchema,
  source: z.string(),
  datasetVersion: z.string(),
  provenance: z.enum(['USER_SUPPLIED', 'SYNTHETIC_FIXTURE']),
  status: z.enum(['DESCRIPTIVE_ONLY', 'ABSTAIN']),
  observations: z.number().int(),
  missingIntervals: z.number().int().nonnegative(),
  metrics: z
    .strictObject({
      totalReturn: Metric,
      meanReturn: Metric,
      sampleVolatility: Metric,
      annualizedVolatility: Metric,
      maxDrawdown: Metric,
      historicalVar95: Metric,
      historicalExpectedShortfall95: Metric,
      ewmaVolatility: Metric,
    })
    .nullable(),
  modelEligibility: z.literal('NOT_VALIDATED'),
  executionAuthorized: z.literal(false),
  limitations: z.array(z.string()),
});
export type RiskReport = z.infer<typeof RiskReportSchema>;
export const ExecutionBudgetRequestSchema = z.strictObject({
  amountInRaw: PositiveAmountSchema,
  spendingCapRaw: PositiveAmountSchema,
  tranches: z.number().int().min(1).max(16),
  gasPerTransactionWei: RawAmountSchema,
  gasBudgetWei: RawAmountSchema,
});
export type ExecutionBudgetRequest = z.infer<typeof ExecutionBudgetRequestSchema>;
export const ExecutionBudgetResultSchema = z.strictObject({
  kind: z.literal('CHRONOS_BUDGET_RESEARCH'),
  recommendation: z.literal('ABSTAIN'),
  budgetFeasible: z.boolean(),
  amountsInRaw: z.array(PositiveAmountSchema),
  totalGasWei: RawAmountSchema,
  additionalGasWei: RawAmountSchema,
  executionAuthorized: z.literal(false),
  reasons: z.array(z.string()),
});
