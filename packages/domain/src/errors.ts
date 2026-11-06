export const errorCodes = [
  'INVALID_INPUT',
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNSUPPORTED_CHAIN',
  'UNSUPPORTED_TOKEN',
  'UNSUPPORTED_ROUTE',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_INVALID_RESPONSE',
  'PROVIDER_RATE_LIMITED',
  'QUOTE_STALE',
  'PERMIT_STALE',
  'SIGNATURE_MISMATCH',
  'APPROVAL_REQUIRED',
  'TRADING_DISABLED',
  'UNKNOWN_FINALITY',
  'RPC_INCONSISTENT',
  'REORG',
  'MANDATE_EXCEEDED',
  'EVIDENCE_EXPIRED',
  'WORLD_UNVERIFIED',
  'INSUFFICIENT_DATA',
  'DATA_RIGHTS_RESTRICTED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export class NorthtrailError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number = 400,
    public readonly nextAction: string = 'Review the request and try again.',
  ) {
    super(message);
    this.name = 'NorthtrailError';
  }
}