import { z } from 'zod';
import { AddressSchema, HashSchema, RawAmountSchema, TimestampSchema } from './schemas.js';

export const ReceiptRequestSchema = z.strictObject({
  chainId: z.literal(1),
  transactionHash: HashSchema,
});
export type ReceiptRequest = z.infer<typeof ReceiptRequestSchema>;
export const ReceiptObservationSchema = z.strictObject({
  kind: z.literal('CHAIN_RECEIPT_OBSERVATION'),
  chainId: z.literal(1),
  transactionHash: HashSchema,
  status: z.enum(['NOT_OBSERVED', 'CANONICAL_SUCCESS', 'CANONICAL_REVERT', 'REORGED']),
  observedAt: TimestampSchema,
  blockHash: HashSchema.nullable(),
  blockNumber: RawAmountSchema.nullable(),
  confirmations: RawAmountSchema,
  from: AddressSchema.nullable(),
  to: AddressSchema.nullable(),
  gasPaidWei: RawAmountSchema.nullable(),
  settlementVerified: z.literal(false),
  finality: z.literal('NOT_ESTABLISHED'),
  limitations: z.array(z.string()),
});
export type ReceiptObservation = z.infer<typeof ReceiptObservationSchema>;

// JSON-RPC quantities are minimally encoded unsigned hex, not decimal token strings.
export const RpcQuantitySchema = z.string().regex(/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/);
export const RpcReceiptSchema = z.object({
  transactionHash: HashSchema,
  blockHash: HashSchema,
  blockNumber: RpcQuantitySchema,
  from: AddressSchema,
  to: AddressSchema.nullable(),
  status: z.enum(['0x0', '0x1']),
  gasUsed: RpcQuantitySchema,
  effectiveGasPrice: RpcQuantitySchema,
});
export const RpcBlockSchema = z.object({ hash: HashSchema, number: RpcQuantitySchema });
export const RpcEnvelopeSchema = z.strictObject({
  jsonrpc: z.literal('2.0'),
  id: z.number().int(),
  result: z.unknown(),
});
