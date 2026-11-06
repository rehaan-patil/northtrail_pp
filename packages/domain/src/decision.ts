import canonicalize from 'canonicalize';
import { DecisionPayloadSchema, DecisionRecordSchema, type DecisionRecord } from './schemas.js';
import { NorthtrailError } from './errors.js';

export function canonicalJson(value: unknown): string {
  const result = canonicalize(value);
  if (typeof result !== 'string')
    throw new NorthtrailError('INVALID_INPUT', 'Value cannot be canonicalized.');
  return result;
}
export async function digestJson(value: unknown): Promise<`0x${string}`> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `0x${Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
export async function createDecision(input: unknown): Promise<DecisionRecord> {
  const payload = DecisionPayloadSchema.parse(input);
  return { algorithm: 'JCS-SHA256-v1', payload, digest: await digestJson(payload) };
}
export async function verifyDecision(input: unknown): Promise<boolean> {
  const record = DecisionRecordSchema.safeParse(input);
  return record.success && (await digestJson(record.data.payload)) === record.data.digest;
}
