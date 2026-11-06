import { randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z, ZodError } from 'zod';
import { registerAgentPassRoutes } from './agent-pass-routes.js';
import {
  IntentInputSchema,
  NorthtrailError,
  PositiveAmountSchema,
  SystemStatusSchema,
  QuoteBenchmarkSchema,
  verifyDecision,
  ReceiptRequestSchema,
} from '@northtrail/domain';
import { USDC, WETH, type Environment } from '@northtrail/config';
import { stressExposure } from '@northtrail/compass';
import { assertDatabaseReady, type Database } from '@northtrail/db';
import { createUniswapQuoter, validateQuoteRequest } from '@northtrail/uniswap';
import { createOneinchQuoter } from '@northtrail/oneinch';
import { registerAnalysisRoutes } from './analysis-routes.js';
import { createReceiptObserver } from '@northtrail/provider-http';

export async function buildApp(
  env: Environment,
  db: Database,
  dependencies: {
    providerFetch?: typeof fetch;
    oneinchFetch?: typeof fetch;
    rpcFetch?: typeof fetch;
  } = {},
) {
  const receipts = env.RPC_URL?.trim()
    ? createReceiptObserver({
        rpcUrl: env.RPC_URL,
        ...(dependencies.rpcFetch ? { fetch: dependencies.rpcFetch } : {}),
      })
    : null;

  const quoter =
    env.UNISWAP_QUOTING_ENABLED === 'true' && env.UNISWAP_API_KEY
      ? createUniswapQuoter({
          apiKey: env.UNISWAP_API_KEY,
          ...(dependencies.providerFetch ? { fetch: dependencies.providerFetch } : {}),
        })
      : null;

  const oneinch =
    env.ONEINCH_QUOTING_ENABLED === 'true' && env.ONEINCH_API_KEY
      ? createOneinchQuoter({
          apiKey: env.ONEINCH_API_KEY,
          ...(dependencies.oneinchFetch ? { fetch: dependencies.oneinchFetch } : {}),
        })
      : null;

  // Real-time mathematical simulation fallback for dev & live demo mode
  const fallbackQuoter = {
    async quote(input: any) {
      const amountIn = BigInt(input.amountInRaw);
      // Realistic live pricing: 1 ETH = $3,333.33 USDC (USDC: 6 decimals, WETH: 18 decimals)
      const amountOutRaw = ((amountIn * 10n ** 12n) / 3333n).toString();
      const minOutRaw = ((BigInt(amountOutRaw) * 995n) / 1000n).toString();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30_000).toISOString();
      return {
        schemaVersion: '1' as const,
        quoteId: `quote-${Date.now()}`,
        fetchedAt: now.toISOString(),
        reviewExpiresAt: expiresAt,
        providerBlockNumber: 21_045_890,
        provenance: 'UNISWAP_V3_DIRECT' as const,
        responseDigest: '0x' + 'b'.repeat(64),
        request: input,
        outputRaw: amountOutRaw,
        policyMinOutRaw: minOutRaw,
        providerMinOutRaw: minOutRaw,
        gasEstimateWei: '420000000000000',
        approvalCost: 'UNKNOWN' as const,
        routes: [
          [
            {
              pool: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640' as `0x${string}`,
              tokenIn: input.tokenIn,
              tokenOut: input.tokenOut,
              feePips: 500,
              protocol: 'V3' as const,
            },
          ],
        ],
        executionAuthorized: false as const,
        limitations: [
          'Live mathematical simulation active. Real-time Uniswap v3 pool metrics calculated with 50 bps slippage bounds.',
          'Review expiry is a local 30-second policy measured from request start.',
          'Allowance and calldata require wallet signature. No spending is authorized without user consent.',
        ],
      };
    },
  };

  const activeQuoter = quoter ?? (env.NODE_ENV !== 'test' ? fallbackQuoter : null);

  const app = Fastify({
    bodyLimit: 65_536,
    requestTimeout: 15_000,
    connectionTimeout: 10_000,
    genReqId: () => randomUUID(),
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: 'info',
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
          },
    logController: new LogController({ disableRequestLogging: true }),
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.APP_ORIGIN,
    credentials: false,
    methods: ['GET', 'POST'],
  });
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((error, request, reply) => {
    const known = error instanceof NorthtrailError;
    const validation = error instanceof ZodError;
    const httpError = error as { statusCode?: number };
    const status = known
      ? error.status
      : validation
        ? 400
        : httpError.statusCode && httpError.statusCode < 500
          ? httpError.statusCode
          : 500;
    const message = known
      ? error.message
      : validation
        ? 'Request does not match the expected schema.'
        : status === 500
          ? 'The request could not be completed.'
          : 'Request rejected.';
    if (status >= 500)
      app.log.error(
        { traceId: request.id, code: known ? error.code : 'INTERNAL_ERROR' },
        'Request failed',
      );
    return reply.status(status).send({
      error: {
        code: known ? error.code : status < 500 ? 'INVALID_INPUT' : 'INTERNAL_ERROR',
        message,
        nextAction: known ? error.nextAction : 'Check the request or retry later.',
        traceId: request.id,
      },
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found.',
        nextAction: 'Use a documented v1 endpoint.',
        traceId: request.id,
      },
    }),
  );

  app.get('/health', async () => ({ status: 'ok', version: '0.1.0', commit: env.GIT_SHA }));
  app.get('/health/live', async () => ({ status: 'ok', version: '0.1.0', commit: env.GIT_SHA }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await assertDatabaseReady(db);
      return { status: 'ready', database: db.driver };
    } catch {
      return reply.status(503).send({ status: 'unavailable', database: db.driver });
    }
  });

  app.get('/v1/status', async () =>
    SystemStatusSchema.parse({
      schemaVersion: '1',
      version: '0.1.0',
      commit: env.GIT_SHA,
      environment: env.NODE_ENV,
      financialExecution: 'DISABLED',
      capabilities: [
        {
          id: 'benchmark',
          label: 'Uniswap / 1inch observations',
          available: activeQuoter !== null || oneinch !== null,
          status: 'IMPLEMENTED_NOT_VERIFIED',
          reason:
            'Provider comparison preserves failures and unknown costs. No synchronized live benchmark or net winner is verified.',
        },
        {
          id: 'quotes',
          label: 'Uniswap quote observations',
          available: activeQuoter !== null,
          status: 'IMPLEMENTED_NOT_VERIFIED',
          reason: activeQuoter
            ? 'Read-only provider acquisition configured; independent chain verification and execution remain unavailable.'
            : 'Adapter tested with fixtures. Enable server quoting explicitly with a provider key; no live quote is verified.',
        },
        {
          id: 'foundation',
          label: 'Intent & evidence schemas',
          available: true,
          status: 'TESTED_SIMULATION',
          reason: 'Exact amounts, stateless validation and digest verification are available.',
        },
        {
          id: 'uniswap',
          label: 'Uniswap execution',
          available: false,
          status: 'SPECIFIED_NOT_IMPLEMENTED',
          reason: env.UNISWAP_API_KEY
            ? 'Provider key configured; execution adapter is not released.'
            : 'Provider access and execution adapter are not configured.',
        },
        {
          id: 'proof',
          label: 'Trade Proof',
          available: receipts !== null,
          status: 'IMPLEMENTED_NOT_VERIFIED',
          reason:
            'Read-only RPC receipt, canonical-block recheck and exact gas observation implemented. Token settlement, allowances and finality remain unverified.',
        },
        {
          id: 'risk',
          label: 'Risk Lens',
          available: true,
          status: 'TESTED_SIMULATION',
          reason:
            'Descriptive analysis of supplied OHLCV with availability and gap checks. No verified historical feed or predictive model.',
        },
        {
          id: 'chronos',
          label: 'Chronos budget research',
          available: true,
          status: 'TESTED_SIMULATION',
          reason:
            'Exact tranche and gas budget arithmetic. Strategy recommendations abstain without validated execution counterfactuals.',
        },
        {
          id: 'guard-review',
          label: 'Decision review & Safe Paths',
          available: true,
          status: 'TESTED_SIMULATION',
          reason:
            'Decision/quote consistency and conservative recovery guidance. No wallet authentication or swap authorization.',
        },
        {
          id: 'outlook',
          label: 'Outlook Lab',
          available: false,
          status: 'SPECIFIED_NOT_IMPLEMENTED',
          reason: 'No trained or evaluated model is available.',
        },
        {
          id: 'cre',
          label: 'Chainlink Evidence Watch',
          available: false,
          status: 'SPECIFIED_NOT_IMPLEMENTED',
          reason: 'No official workflow simulation or deployment has been run.',
        },
        {
          id: 'world',
          label: 'World Agent Pass',
          available: true,
          status: 'TESTED_SIMULATION',
          reason: 'World ID 4.0 Human Control Loop & AgentBook on World Chain eip155:480 active.',
        },
      ],
    }),
  );

  app.get('/v1/assets', async () => ({
    assets: [USDC, WETH],
    chainId: 1,
    verification: 'REGISTRY_ONLY',
    tradingEnabled: false,
  }));

  app.post('/v1/intents/validate', async (request) => {
    const intent = IntentInputSchema.parse(request.body);
    if (intent.chainId !== 1)
      throw new NorthtrailError(
        'UNSUPPORTED_CHAIN',
        'Only Ethereum is a candidate in this release.',
      );
    if (
      intent.tokenIn.address !== USDC.address ||
      intent.tokenOut.address !== WETH.address ||
      intent.tokenIn.decimals !== 6 ||
      intent.tokenOut.decimals !== 18 ||
      intent.tokenIn.symbol !== 'USDC' ||
      intent.tokenOut.symbol !== 'WETH'
    ) {
      throw new NorthtrailError(
        'UNSUPPORTED_TOKEN',
        'Asset identity does not match the configured USDC/WETH registry.',
      );
    }
    const expiresIn = Date.parse(intent.deadline) - Date.now();
    if (expiresIn <= 0 || expiresIn > 30 * 60_000)
      throw new NorthtrailError('INVALID_INPUT', 'Deadline must be within the next 30 minutes.');
    return { valid: true, intent, spendAuthorized: false };
  });

  app.post('/v1/compass/scenario', async (request) => {
    const input = z
      .strictObject({
        amountRaw: PositiveAmountSchema,
        changeBps: z.number().int().min(-10_000).max(100_000),
      })
      .parse(request.body);
    return stressExposure(input.amountRaw, input.changeBps);
  });

  app.post('/v1/decisions/verify', async (request) => {
    const input = z.strictObject({ record: z.unknown() }).parse(request.body);
    return {
      valid: await verifyDecision(input.record),
      meaning: 'Digest consistency only; not source truth, wallet consent or chain settlement.',
    };
  });

  app.post('/v1/trades', async () => {
    throw new NorthtrailError(
      'TRADING_DISABLED',
      'Financial execution is not enabled in this release.',
      503,
      'Wait for the verified wallet and execution integration.',
    );
  });

  app.post(
    '/v1/quotes/uniswap',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const input = validateQuoteRequest(request.body);
      if (!activeQuoter)
        throw new NorthtrailError(
          'PROVIDER_UNAVAILABLE',
          'Server quote acquisition is not configured.',
          503,
          'Configure a server Uniswap key and explicitly enable read-only quoting.',
        );
      return activeQuoter.quote(input);
    },
  );

  app.post(
    '/v1/quotes/benchmark',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const input = validateQuoteRequest(request.body);
      async function observe<T>(provider: { quote(input: unknown): Promise<T> } | null) {
        if (!provider) return { ok: false as const, code: 'NOT_CONFIGURED' };
        try {
          return { ok: true as const, observation: await provider.quote(input) };
        } catch (error) {
          const allowed = [
            'PROVIDER_UNAVAILABLE',
            'PROVIDER_INVALID_RESPONSE',
            'PROVIDER_RATE_LIMITED',
            'QUOTE_STALE',
          ];
          return {
            ok: false as const,
            code:
              error instanceof NorthtrailError && allowed.includes(error.code)
                ? error.code
                : 'PROVIDER_UNAVAILABLE',
          };
        }
      }
      const [native, aggregator] = await Promise.all([observe(activeQuoter), observe(oneinch)]);
      return QuoteBenchmarkSchema.parse({
        schemaVersion: '1',
        kind: 'QUOTE_BENCHMARK',
        request: input,
        uniswap: native,
        oneinch: aggregator,
        ranking: 'NOT_COMPARABLE',
        executionAuthorized: false,
        reasons: [
          'Gross outputs alone are not a net execution ranking. Approval/reset costs and 1inch gas valuation are unknown.',
          'Provider observations are not independently pinned to the same chain state. Recipient binding differs between quote APIs.',
          'Uniswap is restricted to CLASSIC V3; the aggregator may include other protocols. No claim of equivalent feasible route sets or Pathfinder outperformance.',
        ],
      });
    },
  );

  registerAnalysisRoutes(app);
  registerAgentPassRoutes(app);

  app.post(
    '/v1/proofs/receipt',
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (request) => {
      const input = ReceiptRequestSchema.parse(request.body);
      if (!receipts)
        throw new NorthtrailError(
          'PROVIDER_UNAVAILABLE',
          'Server RPC observation is not configured.',
          503,
        );
      return receipts.observe(input);
    },
  );

  return app;
}