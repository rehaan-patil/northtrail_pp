import { z } from 'zod';
import { getAddress, isAddress } from 'viem';
import { UINT256_MAX } from './amounts.js';
import { errorCodes } from './errors.js';

export const AddressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: true }), 'Invalid EVM address')
  .transform((value) => getAddress(value));

export const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);

export const RawAmountSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine((value) => {
    try {
      return BigInt(value) <= UINT256_MAX;
    } catch {
      return false;
    }
  }, 'Amount exceeds uint256');

export const PositiveAmountSchema = RawAmountSchema.refine((value) => {
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}, 'Amount must be positive');

export const TimestampSchema = z.iso.datetime();

export const CapabilityStatusSchema = z.enum([
  'SPECIFIED_NOT_IMPLEMENTED',
  'IMPLEMENTED_NOT_VERIFIED',
  'TESTED_SIMULATION',
  'VERIFIED_ON_CHAIN',
  'DEPLOYED_VERIFIED',
  'DISABLED_UNSUPPORTED',
]);

export const AssetSchema = z.strictObject({
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  address: AddressSchema,
  decimals: z.number().int().min(0).max(36),
  symbol: z.string().regex(/^[A-Za-z0-9._-]{1,12}$/),
});
export type Asset = z.infer<typeof AssetSchema>;

export const IntentInputSchema = z
  .strictObject({
    schemaVersion: z.literal('1'),
    chainId: z.number().int().positive(),
    owner: AddressSchema,
    recipient: AddressSchema,
    tokenIn: AssetSchema,
    tokenOut: AssetSchema,
    amountInRaw: PositiveAmountSchema,
    minOutRaw: PositiveAmountSchema,
    slippageBps: z.number().int().min(0).max(1_000),
    deadline: TimestampSchema,
    route: z.literal('CLASSIC'),
  })
  .superRefine((value, ctx) => {
    if (value.tokenIn.chainId !== value.chainId || value.tokenOut.chainId !== value.chainId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Token and intent chains must match',
        path: ['chainId'],
      });
    }
    if (value.tokenIn.address === value.tokenOut.address) {
      ctx.addIssue({
        code: 'custom',
        message: 'Input and output assets must differ',
        path: ['tokenOut'],
      });
    }
    if (
      value.recipient === '0x0000000000000000000000000000000000000000' ||
      value.owner === '0x0000000000000000000000000000000000000000'
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Owner and recipient must be nonzero',
        path: ['recipient'],
      });
    }
  });
export type IntentInput = z.infer<typeof IntentInputSchema>;

export const SourceSchema = z.strictObject({
  sourceId: z.string().min(1).max(100),
  observedAt: TimestampSchema,
  fetchedAt: TimestampSchema,
  digest: HashSchema,
  provenance: z.enum([
    'SYNTHETIC_FIXTURE',
    'PROVIDER_RESPONSE',
    'CHAIN_OBSERVATION',
    'SIMULATED_CRE',
    'DEPLOYED_VERIFIED',
  ]),
});

export const CandidateSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    id: z.string().min(1).max(100),
    kind: z.literal('NO_TRADE'),
  }),
  z.strictObject({
    id: z.string().min(1).max(100),
    kind: z.literal('TRADE'),
    intent: IntentInputSchema,
    quoteId: z.string().min(1).max(200),
    quoteDigest: HashSchema,
    quotedAt: TimestampSchema,
    expiresAt: TimestampSchema,
    outputRaw: PositiveAmountSchema,
    provenance: z.enum(['SYNTHETIC_FIXTURE', 'PROVIDER_RESPONSE']),
    limitations: z.array(z.string().max(500)).max(30),
  }),
]);

export const DecisionPayloadSchema = z
  .strictObject({
    schemaVersion: z.literal('1'),
    decisionId: z.uuid(),
    revision: z.number().int().positive(),
    previousDigest: HashSchema.nullable(),
    displaySchemaVersion: z.literal('review-v1'),
    candidates: z.array(CandidateSchema).min(1).max(5),
    selectedCandidateId: z.string().max(100).nullable(),
    sources: z.array(SourceSchema).max(20),
    limitations: z.array(z.string().max(500)).max(30),
    createdAt: TimestampSchema,
  })
  .superRefine((value, ctx) => {
    const ids = value.candidates.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'Candidate IDs must be unique' });
    }
    if (value.selectedCandidateId !== null && !ids.includes(value.selectedCandidateId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Selection must belong to the displayed candidates',
      });
    }
    if ((value.revision === 1) !== (value.previousDigest === null)) {
      ctx.addIssue({ code: 'custom', message: 'Revisions must link to their predecessor' });
    }
  });
export type DecisionPayload = z.infer<typeof DecisionPayloadSchema>;

export const DecisionRecordSchema = z.strictObject({
  algorithm: z.literal('JCS-SHA256-v1'),
  payload: DecisionPayloadSchema,
  digest: HashSchema,
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

export const CapabilitySchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  status: CapabilityStatusSchema,
  available: z.boolean(),
  reason: z.string(),
});

export const SystemStatusSchema = z.strictObject({
  schemaVersion: z.literal('1'),
  version: z.string(),
  commit: z.string(),
  environment: z.enum(['development', 'test', 'production']),
  financialExecution: z.literal('DISABLED'),
  capabilities: z.array(CapabilitySchema),
});
export type SystemStatus = z.infer<typeof SystemStatusSchema>;

export const ErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(errorCodes),
    message: z.string(),
    nextAction: z.string(),
    traceId: z.string(),
  }),
});