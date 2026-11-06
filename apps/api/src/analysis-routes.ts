import type { FastifyInstance } from 'fastify';
import {
  ReviewRequestSchema,
  reviewDecisionQuote,
  safeRecovery,
  NorthtrailError,
} from '@northtrail/domain';
import { analyzeHistoricalRisk, planExecutionBudget } from '@northtrail/compass';
import { USDC, WETH } from '@northtrail/config';
import { validateQuoteRequest } from '@northtrail/uniswap';

export function registerAnalysisRoutes(app: FastifyInstance) {
  app.post('/v1/trades/review', async (request) => {
    const input = ReviewRequestSchema.parse(request.body);
    validateQuoteRequest(input.quote.request);
    const selected = input.record.payload.candidates.find(
      (item) => item.id === input.record.payload.selectedCandidateId,
    );
    if (selected?.kind === 'TRADE') {
      const { tokenIn, tokenOut } = selected.intent;
      if (
        tokenIn.address !== USDC.address ||
        tokenIn.decimals !== USDC.decimals ||
        tokenIn.symbol !== USDC.symbol ||
        tokenOut.address !== WETH.address ||
        tokenOut.decimals !== WETH.decimals ||
        tokenOut.symbol !== WETH.symbol
      )
        throw new NorthtrailError(
          'UNSUPPORTED_TOKEN',
          'Decision asset identity differs from the supported registry.',
        );
    }
    return reviewDecisionQuote(input, Date.now());
  });
  app.post('/v1/trades/recovery', async (request) => safeRecovery(request.body));
  app.post('/v1/quant/risk', { bodyLimit: 262_144 }, async (request) =>
    analyzeHistoricalRisk(request.body),
  );
  app.post('/v1/execution/budget', async (request) => planExecutionBudget(request.body));
}
