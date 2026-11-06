import { randomUUID } from 'node:crypto';
import {
  AgentMandate,
  AgentPassChallenge,
  AgentPassChallengeSchema,
  MandateEvaluationResult,
  MandateExceptionRequest,
  NorthtrailError,
  WorldAgentIdentity,
  WorldAgentPass,
  WorldProofPayload,
  digestJson,
} from '@northtrail/domain';

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes review validity

export function registerAgentInAgentBook(
  agentAddress: string,
  humanId: string,
): WorldAgentIdentity {
  return {
    agentAddress: agentAddress as `0x${string}`,
    humanId,
    worldChainId: 'eip155:480',
    registeredAt: new Date().toISOString(),
    status: 'ACTIVE',
  };
}

export async function createAgentPassChallenge(
  mandate: AgentMandate,
  request: MandateExceptionRequest,
): Promise<AgentPassChallenge> {
  if (mandate.owner !== request.owner || mandate.mandateId !== request.mandateId) {
    throw new NorthtrailError('FORBIDDEN', 'Mandate ownership mismatch.');
  }

  const now = Date.now();
  const challengeId = randomUUID();
  const expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString();

  // Cryptographic action binding: binds trade parameters to the ZKP signal
  const payloadToSign = {
    challengeId,
    mandateId: mandate.mandateId,
    owner: request.owner,
    agentAddress: mandate.agentAddress,
    tokenIn: request.tokenIn,
    tokenOut: request.tokenOut,
    amountInRaw: request.amountInRaw,
    nonce: mandate.nonce,
    expiresAt,
  };

  const actionDigest = await digestJson(payloadToSign);

  return AgentPassChallengeSchema.parse({
    challengeId,
    actionDigest,
    action: 'northtrail-mandate-elevation',
    mandateId: mandate.mandateId,
    owner: request.owner,
    agentAddress: mandate.agentAddress,
    requestedAmountRaw: request.amountInRaw,
    issuedAt: new Date(now).toISOString(),
    expiresAt,
  });
}

export interface WorldVerifierOptions {
  appId?: string;
  fetchFn?: typeof fetch;
  isSimulation?: boolean;
}

export async function verifyWorldAgentPass(
  challenge: AgentPassChallenge,
  proof: WorldProofPayload,
  consumedNullifiers: Set<string>,
  options: WorldVerifierOptions = {},
): Promise<WorldAgentPass> {
  const now = new Date().toISOString();
  if (now > challenge.expiresAt) {
    throw new NorthtrailError('PASS_EXPIRED', 'Challenge has expired. Request a new pass.', 400);
  }

  // 1. Strict Signal Verification
  if (proof.signal !== challenge.actionDigest) {
    throw new NorthtrailError(
      'INVALID_ACTION_SIGNAL',
      'The cryptographic signal does not match the active trade challenge.',
      400,
    );
  }

  // 2. Anti-Replay: Prevent nullifier reuse
  if (consumedNullifiers.has(proof.nullifier_hash)) {
    throw new NorthtrailError(
      'PASS_ALREADY_CONSUMED',
      'This World ID pass has already been consumed.',
      409,
    );
  }

  // 3. Official World Developer Portal verification (or local simulation fallback)
  if (!options.isSimulation && options.appId) {
    const transport = options.fetchFn ?? fetch;
    const url = `https://developer.world.org/api/v4/verify/${options.appId}`;
    const res = await transport(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol_version: '3.0',
        nullifier_hash: proof.nullifier_hash,
        merkle_root: proof.merkle_root,
        proof: proof.proof,
        verification_level: proof.verification_level,
        action: proof.action,
        signal: proof.signal,
      }),
    });

    if (!res.ok) {
      throw new NorthtrailError(
        'WORLD_PROOF_INVALID',
        'Official World ID proof verification failed.',
        400,
      );
    }
  }

  return {
    passId: randomUUID(),
    challengeId: challenge.challengeId,
    actionDigest: challenge.actionDigest,
    nullifierHash: proof.nullifier_hash,
    verificationLevel: proof.verification_level,
    status: 'ACTIVE',
    verifiedAt: now,
    expiresAt: challenge.expiresAt,
  };
}

export function evaluateAgentMandate(
  mandate: AgentMandate,
  requestedAmountRaw: string,
  pass: WorldAgentPass | null,
  consumedNullifiers: Set<string>,
): MandateEvaluationResult {
  const currentTotal = BigInt(mandate.consumedTodayRaw);
  const requested = BigInt(requestedAmountRaw);
  const dailyCap = BigInt(mandate.dailyBudgetRaw);

  // Case A: Within authorized daily bot cap
  if (currentTotal + requested <= dailyCap) {
    return {
      decision: 'PERMITTED_WITHIN_CAP',
      mandateId: mandate.mandateId,
      requestedAmountRaw,
      dailyCapRaw: mandate.dailyBudgetRaw,
      consumedTodayRaw: mandate.consumedTodayRaw,
      passUsed: null,
      reasons: ['Trade is within authorized daily bot budget.'],
    };
  }

  // Case B: Over budget, but verified via World Agent Pass
  if (pass && pass.status === 'ACTIVE') {
    if (new Date().toISOString() > pass.expiresAt) {
      throw new NorthtrailError('PASS_EXPIRED', 'World Agent Pass has expired.', 400);
    }
    // Consume pass atomically:
    pass.status = 'CONSUMED';
    consumedNullifiers.add(pass.nullifierHash);

    return {
      decision: 'PERMITTED_VIA_WORLD_PASS',
      mandateId: mandate.mandateId,
      requestedAmountRaw,
      dailyCapRaw: mandate.dailyBudgetRaw,
      consumedTodayRaw: mandate.consumedTodayRaw,
      passUsed: pass,
      reasons: [
        `Trade exceeds budget (${dailyCap.toString()}) but verified by human World Agent Pass.`,
        `Nullifier ${pass.nullifierHash.slice(0, 10)}... consumed atomically.`,
      ],
    };
  }

  // Case C: Over budget without pass -> Fail closed
  return {
    decision: 'BLOCKED_CAP_EXCEEDED',
    mandateId: mandate.mandateId,
    requestedAmountRaw,
    dailyCapRaw: mandate.dailyBudgetRaw,
    consumedTodayRaw: mandate.consumedTodayRaw,
    passUsed: null,
    reasons: [
      'Requested amount exceeds remaining bot daily limit.',
      'Human authorization via World Agent Pass is required to elevate spending cap.',
    ],
  };
}