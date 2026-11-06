import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { readEnvironment } from '../packages/config/src/index.js';
import { connectDatabase, migrate, type Database } from '../packages/db/src/index.js';
import { createNorthtrail } from '../packages/sdk/src/index.js';
import { providerQuoteFixture, quoteRequestFixture } from './quote-fixtures.js';

describe('quote API through the SDK', () => {
  let db: Database;
  let enabled: Awaited<ReturnType<typeof buildApp>>;
  let disabled: Awaited<ReturnType<typeof buildApp>>;
  let client: ReturnType<typeof createNorthtrail>;
  const providerFetch = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(providerQuoteFixture()));
  beforeAll(async () => {
    db = await connectDatabase({ driver: 'pglite' });
    await migrate(db);
    enabled = await buildApp(
      readEnvironment({
        NODE_ENV: 'test',
        UNISWAP_QUOTING_ENABLED: 'true',
        UNISWAP_API_KEY: 'synthetic-private-key',
      }),
      db,
      { providerFetch },
    );
    disabled = await buildApp(readEnvironment({ NODE_ENV: 'test' }), db);
    const baseUrl = await enabled.listen({ host: '127.0.0.1', port: 0 });
    client = createNorthtrail({ baseUrl });
  });
  afterAll(async () => {
    await enabled?.close();
    await disabled?.close();
    await db?.close();
  });
  it('exposes an observation through HTTP and SDK without spend authority or credentials', async () => {
    const quote = await client.quoteUniswap(quoteRequestFixture());
    expect(quote.kind).toBe('QUOTE_OBSERVATION');
    expect(quote.executionAuthorized).toBe(false);
    expect(JSON.stringify(quote)).not.toContain('synthetic-private-key');
    expect(
      (await enabled.inject({ method: 'POST', url: '/v1/trades', payload: quote })).statusCode,
    ).toBe(503);
  });
  it('fails closed without configured provider access', async () => {
    const response = await disabled.inject({
      method: 'POST',
      url: '/v1/quotes/uniswap',
      payload: quoteRequestFixture(),
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('PROVIDER_UNAVAILABLE');
  });
  it('rejects caller-supplied endpoint, key, route or transaction fields before touching the provider', async () => {
    const count = providerFetch.mock.calls.length;
    for (const extra of [
      { endpoint: 'http://localhost' },
      { apiKey: 'x' },
      { routing: 'DUTCH' },
      { transaction: {} },
    ]) {
      const result = await enabled.inject({
        method: 'POST',
        url: '/v1/quotes/uniswap',
        payload: { ...quoteRequestFixture(), ...extra },
      });
      expect(result.statusCode).toBe(400);
    }
    expect(providerFetch).toHaveBeenCalledTimes(count);
  });
});
