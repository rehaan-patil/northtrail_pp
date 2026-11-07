import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AgentMandateSchema,
  MandateExceptionRequestSchema,
  WorldProofPayloadSchema,
  AgentPassChallengeSchema,
} from '@northtrail/domain';
import {
  createAgentPassChallenge,
  verifyWorldAgentPass,
  evaluateAgentMandate,
  registerAgentInAgentBook,
} from '@northtrail/world-agent-pass';

const consumedNullifiers = new Set<string>();

export function registerAgentPassRoutes(app: FastifyInstance) {
  // Register agent identity in AgentBook
  app.post('/v1/agent-pass/register', async (request) => {
    const Body = z.strictObject({
      agentAddress: z.string(),
      humanId: z.string(),
    });
    const { agentAddress, humanId } = Body.parse(request.body);
    return registerAgentInAgentBook(agentAddress, humanId);
  });

  // Request Challenge
  app.post('/v1/agent-pass/challenge', async (request) => {
    const Body = z.strictObject({
      mandate: AgentMandateSchema,
      request: MandateExceptionRequestSchema,
    });
    const { mandate, request: req } = Body.parse(request.body);
    return createAgentPassChallenge(mandate, req);
  });

  // Verify World ID Proof
  app.post('/v1/agent-pass/verify', async (request) => {
    const Body = z.strictObject({
      challenge: AgentPassChallengeSchema,
      proof: WorldProofPayloadSchema,
    });
    const { challenge, proof } = Body.parse(request.body);
    return verifyWorldAgentPass(challenge, proof, consumedNullifiers, {
      isSimulation: process.env.NODE_ENV === 'test' || !process.env.WORLD_APP_ID,
      ...(process.env.WORLD_APP_ID ? { appId: process.env.WORLD_APP_ID } : {}),
    });
  });

  // Evaluate Mandate Policy
  app.post('/v1/agent-pass/evaluate', async (request) => {
    const Body = z.strictObject({
      mandate: AgentMandateSchema,
      requestedAmountRaw: z.string(),
      pass: z.any().nullable(),
    });
    const { mandate, requestedAmountRaw, pass } = Body.parse(request.body);
    return evaluateAgentMandate(mandate, requestedAmountRaw, pass, consumedNullifiers);
  });
}