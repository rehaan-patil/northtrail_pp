import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createNorthtrail } from '../packages/sdk/src/index.js';
import { buildApp } from '../apps/api/src/app.js';
import { readEnvironment } from '../packages/config/src/index.js';
import { connectDatabase, migrate, type Database } from '../packages/db/src/index.js';
import { createDecision } from '../packages/domain/src/index.js';
import { decisionFixture } from './fixtures.js';

describe('SDK over a real HTTP listener', () => {
  let db: Database;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sdk: ReturnType<typeof createNorthtrail>;
  beforeAll(async () => {
    db = await connectDatabase({ driver: 'pglite' });
    await migrate(db);
    app = await buildApp(readEnvironment({ NODE_ENV: 'test' }), db);
    sdk = createNorthtrail({ baseUrl: await app.listen({ host: '127.0.0.1', port: 0 }) });
  });
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });
  it('consumes status, registry, scenario, and independent digest verification', async () => {
    expect((await sdk.status()).financialExecution).toBe('DISABLED');
    expect((await sdk.assets()).tradingEnabled).toBe(false);
    expect((await sdk.scenario({ amountRaw: '2500000000', changeBps: -400 })).changeRaw).toBe(
      '-100000000',
    );
    expect((await sdk.verifyDecision(await createDecision(decisionFixture()))).valid).toBe(true);
  });
});

describe('SDK failure boundaries', () => {
  it.each([0, -1, 60001, NaN, Infinity, 1.5])(
    'rejects invalid timeout %s before sending',
    (timeoutMs) => {
      expect(() => createNorthtrail({ baseUrl: 'https://api.invalid', timeoutMs })).toThrow(
        /timeout/,
      );
    },
  );
  const credentialUrl = new URL('https://example.invalid');
  credentialUrl.username = 'synthetic-user';
  credentialUrl.password = 'synthetic-password';
  it.each(['file:///tmp/api', credentialUrl.href])('rejects unsafe API base %s', (baseUrl) => {
    expect(() => createNorthtrail({ baseUrl })).toThrow();
  });
  it('rejects unexpected successful payloads and non-JSON responses', async () => {
    for (const response of [
      Response.json({ financialExecution: 'LIVE_MANUAL' }),
      new Response('<html>Error</html>'),
    ]) {
      const sdk = createNorthtrail({
        baseUrl: 'https://api.invalid',
        fetch: vi.fn().mockResolvedValue(response),
      });
      await expect(sdk.status()).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' });
    }
  });
  it('preserves structured errors and never blindly retries a request', async () => {
    const transport = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'TRADING_DISABLED',
            message: 'Disabled',
            nextAction: 'Wait',
            traceId: 'test',
          },
        },
        { status: 503 },
      ),
    );
    const sdk = createNorthtrail({ baseUrl: 'https://api.invalid', fetch: transport });
    await expect(sdk.status()).rejects.toMatchObject({ code: 'TRADING_DISABLED', status: 503 });
    expect(transport).toHaveBeenCalledTimes(1);
    const init = transport.mock.calls[0]?.[1] as RequestInit;
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it('fails on transport errors without echoing sensitive connection details', async () => {
    const sdk = createNorthtrail({
      baseUrl: 'https://api.invalid',
      fetch: vi.fn().mockRejectedValue(new Error('secret-token')),
    });
    await expect(sdk.status()).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      message: 'Northtrail API could not be reached.',
    });
  });
});
