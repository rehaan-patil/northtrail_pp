import { z } from 'zod';
import {
  AddressSchema,
  HashSchema,
  PositiveAmountSchema,
  RawAmountSchema,
  TimestampSchema,
} from './schemas.js';

export const WorldVerificationLevelSchema = z.enum(['device', 'orb']);
export type WorldVerificationLevel = z.infer<typeof WorldVerificationLevelSchema>;

export const WorldAgentIdentitySchema = z.strictObject({
  agentAddress: AddressSchema,
  humanId: z.string().min(1),
  worldChainId: z.literal('eip155:480').default('eip155:480'),
  registeredAt: TimestampSchema,
  status: z.enum(['ACTIVE', 'REVOKED']),
});
export type WorldAgentIdentity = z.infer<typeof WorldAgentIdentitySchema>;

export const WorldProofPayloadSchema = z.strictObject({
  merkle_root: z.string().min(1),
  nullifier_hash: z.string().min(1),
  proof: z.string().min(1),
  verification_level: WorldVerificationLevelSchema,
  action: z.string().min(1).max(100),
  signal: HashSchema,
});
export type WorldProofPayload = z.infer<typeof WorldProofPayloadSchema>;

export const AgentMandateSchema = z.strictObject({
  mandateId: z.string().min(1).max(100),
  owner: AddressSchema,
  agentAddress: AddressSchema,
  tokenIn: AddressSchema,
  dailyBudgetRaw: PositiveAmountSchema,
  consumedTodayRaw: RawAmountSchema,
  active: z.boolean(),
  nonce: z.number().int().nonnegative(),
});
export type AgentMandate = z.infer<typeof AgentMandateSchema>;

export const MandateExceptionRequestSchema = z.strictObject({
  mandateId: z.string().min(1).max(100),
  owner: AddressSchema,
  tokenIn: AddressSchema,
  tokenOut: AddressSchema,
  amountInRaw: PositiveAmountSchema,
  reason: z.string().min(1).max(200),
});
export type MandateExceptionRequest = z.infer<typeof MandateExceptionRequestSchema>;

export const AgentPassChallengeSchema = z.strictObject({
  challengeId: z.string().uuid(),
  actionDigest: HashSchema,
  action: z.string().min(1).max(100),
  mandateId: z.string().min(1).max(100),
  owner: AddressSchema,
  agentAddress: AddressSchema,
  requestedAmountRaw: PositiveAmountSchema,
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
});
export type AgentPassChallenge = z.infer<typeof AgentPassChallengeSchema>;

export const WorldAgentPassSchema = z.strictObject({
  passId: z.string().uuid(),
  challengeId: z.string().uuid(),
  actionDigest: HashSchema,
  nullifierHash: z.string().min(1),
  verificationLevel: WorldVerificationLevelSchema,
  status: z.enum(['ACTIVE', 'CONSUMED', 'EXPIRED']),
  verifiedAt: TimestampSchema,
  expiresAt: TimestampSchema,
});
export type WorldAgentPass = z.infer<typeof WorldAgentPassSchema>;

export const MandateEvaluationResultSchema = z.strictObject({
  decision: z.enum(['PERMITTED_WITHIN_CAP', 'PERMITTED_VIA_WORLD_PASS', 'BLOCKED_CAP_EXCEEDED']),
  mandateId: z.string(),
  requestedAmountRaw: PositiveAmountSchema,
  dailyCapRaw: PositiveAmountSchema,
  consumedTodayRaw: RawAmountSchema,
  passUsed: WorldAgentPassSchema.nullable(),
  reasons: z.array(z.string()),
});
export type MandateEvaluationResult = z.infer<typeof MandateEvaluationResultSchema>;