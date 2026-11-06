import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { readEnvironment } from '../packages/config/src/index.js';
import { connectDatabase, migrate, type Database } from '../packages/db/src/index.js';
import { createNorthtrail } from '../packages/sdk/src/index.js';
import {
  providerQuoteFixture,
  oneinchQuoteFixture,
  quoteRequestFixture,
} from './quote-fixtures.js';

describe('provider benchmark evidence', () => {
  let db: Database;
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  beforeAll(async () => {
    db = await connectDatabase({ driver: 'pglite' });
    await migrate(db);
  });
  afterAll(async () => {
    for (const app of apps) await app.close();
    await db?.close();
  });
  it('keeps both observations through the SDK and refuses a gross-output winner', async () => {
    const app = await buildApp(
      readEnvironment({
        NODE_ENV: 'test',
        UNISWAP_QUOTING_ENABLED: 'true',
        UNISWAP_API_KEY: 'fixture-uni',
        ONEINCH_QUOTING_ENABLED: 'true',
        ONEINCH_API_KEY: 'fixture-one',
      }),
      db,
      {
        providerFetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(Response.json(providerQuoteFixture())),
        oneinchFetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json(oneinchQuoteFixture())),
      },
    );
    apps.push(app);
    const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
    const result = await createNorthtrail({ baseUrl }).benchmarkQuotes(quoteRequestFixture());
    expect(result.uniswap.ok).toBe(true);
    expect(result.oneinch.ok).toBe(true);
    expect(result.ranking).toBe('NOT_COMPARABLE');
    expect(result.executionAuthorized).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /fixture-uni|fixture-one|permitData|swapTransaction/,
    );
    const limited = await createNorthtrail({ baseUrl }).benchmarkQuotes(quoteRequestFixture());
    expect(limited.uniswap).toEqual({ ok: false, code: 'PROVIDER_RATE_LIMITED' });
    expect(limited.oneinch).toEqual({ ok: false, code: 'PROVIDER_RATE_LIMITED' });
  });
  it('retains provider failures and missing configuration instead of dropping candidates', async () => {
    const app = await buildApp(
      readEnvironment({
        NODE_ENV: 'test',
        ONEINCH_QUOTING_ENABLED: 'true',
        ONEINCH_API_KEY: 'fixture',
      }),
      db,
      {
        oneinchFetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('private failure detail', { status: 503 })),
      },
    );
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/quotes/benchmark',
      payload: quoteRequestFixture(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().uniswap).toEqual({ ok: false, code: 'NOT_CONFIGURED' });
    expect(response.json().oneinch).toEqual({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
    expect(response.body).not.toContain('private failure');
  });
});
