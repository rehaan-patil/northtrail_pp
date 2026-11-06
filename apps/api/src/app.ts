import { randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z, ZodError } from 'zod';
import {
  IntentInputSchema,
  NorthtrailError,
  PositiveAmountSchema,
  SystemStatusSchema,
  QuoteBenchmarkSchema,
  verifyDecision,
} from '@northtrail/domain';
import { USDC, WETH, type Environment } from '@northtrail/config';
import { stressExposure } from '@northtrail/compass';
import { assertDatabaseReady, type Database } from '@northtrail/db';
import { createUniswapQuoter, validateQuoteRequest } from '@northtrail/uniswap';
import { createOneinchQuoter } from '@northtrail/oneinch';

export async function buildApp(
  env: Environment,
  db: Database,
  dependencies: { providerFetch?: typeof fetch; oneinchFetch?: typeof fetch } = {},
) {
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
    const isKnown = error instanceof NorthtrailError;
    const isValidation = error instanceof ZodError;
    const httpError = error as { statusCode?: number };

    let status = 500;
    if (isKnown) {
      status = error.status;
    } else if (isValidation) {
      status = 400;
    } else if (httpError.statusCode && httpError.statusCode < 500) {
      status = httpError.statusCode;
    }

    let message = 'The request could not be completed.';
    if (isKnown) {
      message = error.message;
    } else if (isValidation) {
      message = 'Request does not match the expected schema.';
    } else if (status < 500) {
      message = 'Request rejected.';
    }

    if (status >= 500) {
      app.log.error(
        { traceId: request.id, code: isKnown ? error.code : 'INTERNAL_ERROR' },
        'Request failed',
      );
    }

    return reply.status(status).send({
      error: {
        code: isKnown ? error.code : status < 500 ? 'INVALID_INPUT' : 'INTERNAL_ERROR',
        message,
        nextAction: isKnown ? error.nextAction : 'Check the request or retry later.',
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

  app.get('/health/live', async () => ({
    status: 'ok',
    version: '0.1.0',
    commit: env.GIT_SHA,
  }));

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
          available: quoter !== null || oneinch !== null,
          status: 'IMPLEMENTED_NOT_VERIFIED',
          reason:
            'Provider comparison preserves failures and unknown costs. No synchronized live benchmark or net winner is verified.',
        },
        {
          id: 'quotes',
          label: 'Uniswap quote observations',
          available: quoter !== null,
          status: 'IMPLEMENTED_NOT_VERIFIED',
          reason: quoter
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
          available: false,
          status: 'SPECIFIED_NOT_IMPLEMENTED',
          reason: 'No confirmed transaction has been independently reconciled.',
        },
        {
          id: 'risk',
          label: 'Risk Lens',
          available: false,
          status: 'SPECIFIED_NOT_IMPLEMENTED',
          reason: 'No rights-approved historical dataset is loaded.',
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
          available: false,
          status: 'DISABLED_UNSUPPORTED',
          reason: 'Official Agent Pass request and validation contract is awaiting verification.',
        },
        {
          id: 'agent',
          label: 'Guarded Agent Mode',
          available: false,
          status: 'DISABLED_UNSUPPORTED',
          reason: 'Exact account and router enforcement has not been demonstrated.',
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
    if (intent.chainId !== 1) {
      throw new NorthtrailError(
        'UNSUPPORTED_CHAIN',
        'Only Ethereum is a candidate in this release.',
      );
    }

    const matchesRegistry =
      intent.tokenIn.address === USDC.address &&
      intent.tokenOut.address === WETH.address &&
      intent.tokenIn.decimals === 6 &&
      intent.tokenOut.decimals === 18 &&
      intent.tokenIn.symbol === 'USDC' &&
      intent.tokenOut.symbol === 'WETH';

    if (!matchesRegistry) {
      throw new NorthtrailError(
        'UNSUPPORTED_TOKEN',
        'Asset identity does not match the configured USDC/WETH registry.',
      );
    }

    const expiresIn = Date.parse(intent.deadline) - Date.now();
    if (expiresIn <= 0 || expiresIn > 30 * 60_000) {
      throw new NorthtrailError('INVALID_INPUT', 'Deadline must be within the next 30 minutes.');
    }

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
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (request) => {
      const input = validateQuoteRequest(request.body);
      if (!quoter) {
        throw new NorthtrailError(
          'PROVIDER_UNAVAILABLE',
          'Server quote acquisition is not configured.',
          503,
          'Configure a server Uniswap key and explicitly enable read-only quoting.',
        );
      }
      return quoter.quote(input);
    },
  );

  app.post(
    '/v1/quotes/benchmark',
    { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (request) => {
      const input = validateQuoteRequest(request.body);

      async function observe<T>(provider: { quote(input: unknown): Promise<T> } | null) {
        if (!provider) {
          return { ok: false as const, code: 'NOT_CONFIGURED' };
        }
        try {
          return { ok: true as const, observation: await provider.quote(input) };
        } catch (error) {
          const allowed = [
            'PROVIDER_UNAVAILABLE',
            'PROVIDER_INVALID_RESPONSE',
            'PROVIDER_RATE_LIMITED',
            'QUOTE_STALE',
          ];
          const code =
            error instanceof NorthtrailError && allowed.includes(error.code)
              ? error.code
              : 'PROVIDER_UNAVAILABLE';
          return { ok: false as const, code };
        }
      }

      const [native, aggregator] = await Promise.all([observe(quoter), observe(oneinch)]);

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

  return app;
}