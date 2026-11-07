import { describe, expect, it } from 'vitest';
import {
  createAgentPassChallenge,
  verifyWorldAgentPass,
  evaluateAgentMandate,
  registerAgentInAgentBook,
} from '../integrations/world-agent-pass/src/index.js';
import type { AgentMandate, MandateExceptionRequest, WorldProofPayload } from '../packages/domain/src/index.js';

const mockMandate: AgentMandate = {
  mandateId: 'mandate-chronos-001',
  owner: '0x1111111111111111111111111111111111111111',
  agentAddress: '0x2222222222222222222222222222222222222222',
  tokenIn: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  dailyBudgetRaw: '300000000', // 300 USDC
  consumedTodayRaw: '100000000', // 100 USDC consumed
  active: true,
  nonce: 1,
};

const mockRequest: MandateExceptionRequest = {
  mandateId: 'mandate-chronos-001',
  owner: '0x1111111111111111111111111111111111111111',
  tokenIn: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  tokenOut: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  amountInRaw: '500000000', // 500 USDC
  reason: 'Chronos detected liquidity dislocation',
};

describe('World Agent Pass & AgentBook Integration', () => {
  it('registers an agent on World Chain AgentBook (eip155:480)', () => {
    const identity = registerAgentInAgentBook(mockMandate.agentAddress, 'human_verified_480');
    expect(identity.worldChainId).toBe('eip155:480');
    expect(identity.status).toBe('ACTIVE');
  });

  it('permits trades within the authorized daily bot budget without World ID', () => {
    const consumed = new Set<string>();
    const result = evaluateAgentMandate(mockMandate, '150000000', null, consumed);
    expect(result.decision).toBe('PERMITTED_WITHIN_CAP');
    expect(result.passUsed).toBeNull();
  });

  it('fails closed when an unverified trade exceeds the daily budget', () => {
    const consumed = new Set<string>();
    const result = evaluateAgentMandate(mockMandate, mockRequest.amountInRaw, null, consumed);
    expect(result.decision).toBe('BLOCKED_CAP_EXCEEDED');
  });

  it('unlocks over-budget trade when verified with valid World ID proof', async () => {
    const consumed = new Set<string>();
    const challenge = await createAgentPassChallenge(mockMandate, mockRequest);

    const validProof: WorldProofPayload = {
      merkle_root: '0xroot_world_id',
      nullifier_hash: '0xnullifier_first_use',
      proof: '0xproof_bytes',
      verification_level: 'orb',
      action: 'northtrail-mandate-elevation',
      signal: challenge.actionDigest,
    };

    const pass = await verifyWorldAgentPass(challenge, validProof, consumed, { isSimulation: true });
    expect(pass.status).toBe('ACTIVE');

    const result = evaluateAgentMandate(mockMandate, mockRequest.amountInRaw, pass, consumed);
    expect(result.decision).toBe('PERMITTED_VIA_WORLD_PASS');
    expect(pass.status).toBe('CONSUMED');
    expect(consumed.has('0xnullifier_first_use')).toBe(true);
  });

  it('prevents replay attacks with the same nullifier', async () => {
    const consumed = new Set<string>(['0xnullifier_already_spent']);
    const challenge = await createAgentPassChallenge(mockMandate, mockRequest);

    const replayedProof: WorldProofPayload = {
      merkle_root: '0xroot',
      nullifier_hash: '0xnullifier_already_spent',
      proof: '0xproof',
      verification_level: 'device',
      action: 'northtrail-mandate-elevation',
      signal: challenge.actionDigest,
    };

    await expect(
      verifyWorldAgentPass(challenge, replayedProof, consumed, { isSimulation: true }),
    ).rejects.toThrow('This World ID pass has already been consumed.');
  });

  it('rejects tampered action signals', async () => {
    const consumed = new Set<string>();
    const challenge = await createAgentPassChallenge(mockMandate, mockRequest);

    const tamperedProof: WorldProofPayload = {
      merkle_root: '0xroot',
      nullifier_hash: '0xnullifier_new',
      proof: '0xproof',
      verification_level: 'orb',
      action: 'northtrail-mandate-elevation',
      signal: '0x0000000000000000000000000000000000000000000000000000000000000000',
    };

    await expect(
      verifyWorldAgentPass(challenge, tamperedProof, consumed, { isSimulation: true }),
    ).rejects.toThrow('The cryptographic signal does not match the active trade challenge.');
  });
});