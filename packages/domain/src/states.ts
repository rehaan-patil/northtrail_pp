import { NorthtrailError } from './errors.js';

export const attemptTransitions = {
  DRAFT: ['QUOTED', 'CANCELLED'],
  QUOTED: ['REVIEWED', 'EXPIRED', 'CANCELLED'],
  REVIEWED: ['SIGNED', 'EXPIRED', 'CANCELLED'],
  SIGNED: ['SUBMITTED', 'UNKNOWN_FINALITY', 'EXPIRED'],
  SUBMITTED: ['PENDING', 'CONFIRMED', 'REVERTED', 'REPLACED', 'UNKNOWN_FINALITY'],
  PENDING: ['CONFIRMED', 'REVERTED', 'REPLACED', 'UNKNOWN_FINALITY'],
  CONFIRMED: ['REORGED'],
  REVERTED: ['REORGED'],
  REORGED: [],
  UNKNOWN_FINALITY: ['CONFIRMED', 'REVERTED', 'REPLACED'],
  REPLACED: [],
  EXPIRED: [],
  CANCELLED: [],
} as const;

export type AttemptState = keyof typeof attemptTransitions;

export function transitionAttempt(current: AttemptState, next: AttemptState): AttemptState {
  const allowed: readonly string[] = attemptTransitions[current];
  if (!allowed.includes(next)) {
    throw new NorthtrailError(
      'CONFLICT',
      `Attempt cannot move from ${current} to ${next}.`,
      409,
      'Reconcile the existing attempt before retrying.',
    );
  }
  return next;
}