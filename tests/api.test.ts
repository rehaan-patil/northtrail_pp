import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { readEnvironment, USDC, WETH } from '../packages/config/src/index.js';
import { connectDatabase, migrate, type Database } from '../packages/db/src/index.js';
import { createDecision, SystemStatusSchema } from '../packages/domain/src/index.js';
import { decisionFixture, intentFixture } from './fixtures.js';

describe('public stateless API', () => {
  let db: Database;
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    db = await connectDatabase({ driver: 'pglite' });
    await migrate(db);
    app = await buildApp(readEnvironment({ NODE_ENV: 'test' }), db);
  });
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });
  const intent = () => ({
    ...intentFixture(),
    tokenIn: USDC,
    tokenOut: WETH,
    deadline: new Date(Date.now() + 60_000).toISOString(),
  });

  it('reports health and explicit unimplemented capability states', async () => {
    expect((await app.inject('/health/live')).json().status).toBe('ok');
    expect((await app.inject('/health/ready')).json().status).toBe('ready');
    const response = await app.inject('/v1/status');
    const status = SystemStatusSchema.parse(response.json());
    expect(status.financialExecution).toBe('DISABLED');
    expect(status.capabilities.find((capability) => capability.id === 'uniswap')?.available).toBe(
      false,
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('validates registry identity and freshness without granting authority', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/intents/validate',
      payload: intent(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().spendAuthorized).toBe(false);
    for (const invalid of [
      { ...intent(), tokenIn: { ...USDC, decimals: 18 } },
      { ...intent(), tokenIn: { ...USDC, symbol: 'FAKE' } },
      { ...intent(), deadline: new Date(Date.now() - 1_000).toISOString() },
      { ...intent(), deadline: new Date(Date.now() + 31 * 60_000).toISOString() },
      { ...intent(), amountInRaw: 5000 },
      { ...intent(), approved: true },
    ]) {
      expect(
        (await app.inject({ method: 'POST', url: '/v1/intents/validate', payload: invalid }))
          .statusCode,
      ).toBe(400);
    }
    const otherChain = {
      ...intent(),
      chainId: 8453,
      tokenIn: { ...USDC, chainId: 8453 },
      tokenOut: { ...WETH, chainId: 8453 },
    };
    expect(
      (
        await app.inject({ method: 'POST', url: '/v1/intents/validate', payload: otherChain })
      ).json().error.code,
    ).toBe('UNSUPPORTED_CHAIN');
  });

  it('computes scenario arithmetic and verifies digest consistency only', async () => {
    const scenario = await app.inject({
      method: 'POST',
      url: '/v1/compass/scenario',
      payload: { amountRaw: '5000000000', changeBps: -400 },
    });
    expect(scenario.json()).toEqual({
      changeRaw: '-200000000',
      remainingRaw: '4800000000',
      rounding: 'TOWARD_ZERO',
      kind: 'SCENARIO_ARITHMETIC',
    });
    const record = await createDecision(decisionFixture());
    expect(
      (
        await app.inject({ method: 'POST', url: '/v1/decisions/verify', payload: { record } })
      ).json().valid,
    ).toBe(true);
    expect(
      (
        await app.inject({ method: 'POST', url: '/v1/decisions/verify', payload: { record: null } })
      ).json().valid,
    ).toBe(false);
  });

  it('rejects execution, missing routes, malformed JSON, and oversized requests', async () => {
    const denied = await app.inject({ method: 'POST', url: '/v1/trades', payload: {} });
    expect(denied.statusCode).toBe(503);
    expect(denied.json().error.code).toBe('TRADING_DISABLED');
    expect((await app.inject('/v1/decisions/private')).statusCode).toBe(404);
    const malformed = await app.inject({
      method: 'POST',
      url: '/v1/decisions/verify',
      headers: { 'content-type': 'application/json' },
      payload: '{invalid',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.message).not.toContain('invalid');
    const oversized = await app.inject({
      method: 'POST',
      url: '/v1/decisions/verify',
      payload: { record: 'a'.repeat(66_000) },
    });
    expect(oversized.statusCode).toBe(413);
  });

  it('limits CORS to the configured UI and rate-limits abusive clients', async () => {
    const response = await app.inject({
      url: '/v1/status',
      headers: { origin: 'https://untrusted.invalid' },
    });
    expect(response.headers['access-control-allow-origin']).not.toBe('https://untrusted.invalid');
    let last = 0;
    for (let request = 0; request < 65; request++)
      last = (await app.inject({ url: '/health/live', remoteAddress: '192.0.2.10' })).statusCode;
    expect(last).toBe(429);
  });
});

it('keeps liveness available when the database is down and does not expose driver errors', async () => {
  const db = {
    driver: 'postgres',
    query: async () => {
      throw new Error('private connection string');
    },
  } as unknown as Database;
  const app = await buildApp(readEnvironment({ NODE_ENV: 'test' }), db);
  try {
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private connection');
  } finally {
    await app.close();
  }
});

it('does not mark an unmigrated database ready', async () => {
  const db = await connectDatabase({ driver: 'pglite' });
  const app = await buildApp(readEnvironment({ NODE_ENV: 'test' }), db);
  try {
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
  } finally {
    await app.close();
    await db.close();
  }
});
