import { describe, expect, it, vi } from 'vitest';
import { createUniswapQuoter, normalizeQuote } from '../integrations/uniswap/src/index.js';
import { USDC, WETH, readEnvironment } from '../packages/config/src/index.js';
import { digestJson } from '../packages/domain/src/index.js';
import { owner, recipient } from './fixtures.js';
import { quoteRequestFixture, providerQuoteFixture } from './quote-fixtures.js';

describe('read-only Uniswap contract (synthetic fixtures, no live quote)', () => {
  it('binds identity and amounts, hashes evidence, removes all signing material', async () => {
    const raw = providerQuoteFixture();
    const quote = await normalizeQuote(raw, quoteRequestFixture(), 1_000, 1_100);
    expect(quote.executionAuthorized).toBe(false);
    expect(quote.policyMinOutRaw).toBe('298500000000000000');
    expect(quote.responseDigest).toBe(await digestJson(raw));
    expect(quote.reviewExpiresAt).toBe(new Date(31_000).toISOString());
    expect(quote.chainVerification).toBe('NOT_VERIFIED');
    expect(JSON.stringify(quote)).not.toMatch(
      /deadbeef|secretFixturePayload|permitData|swapTransaction/,
    );
  });
  it.each([
    [
      'recipient',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.quote.output.recipient = owner;
      },
    ],
    [
      'swapper',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.quote.swapper = recipient;
      },
    ],
    [
      'amount',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.quote.input.amount = '1';
      },
    ],
    [
      'chain',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.quote.chainId = 8453;
      },
    ],
    [
      'token',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.quote.output.token = USDC.address;
      },
    ],
    [
      'route',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.routing = 'DUTCH_V2';
      },
    ],
    [
      'pool protocol',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.quote.route[0]![0]!.type = 'v4-pool';
      },
    ],
    [
      'route amount',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.quote.route[0]![0]!.amountOut = '1';
      },
    ],
    [
      'slippage',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.quote.slippage = 5;
      },
    ],
    [
      'minimum',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.quote.output.minimumAmount = '1';
      },
    ],
    [
      'simulation failure',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.quote.txFailureReasons.push('SIMULATION_ERROR');
      },
    ],
    [
      'decimals',
      (raw: ReturnType<typeof providerQuoteFixture>) => {
        raw.quote.route[0]![0]!.tokenIn.decimals = '18';
      },
    ],
  ])('rejects changed %s', async (_name, change) => {
    const raw = providerQuoteFixture();
    change(raw);
    await expect(normalizeQuote(raw, quoteRequestFixture(), 1_000, 1_100)).rejects.toMatchObject({
      code: 'PROVIDER_INVALID_RESPONSE',
    });
  });
  it('rejects integrator allocations and stale responses', async () => {
    const raw = providerQuoteFixture();
    await expect(
      normalizeQuote(
        {
          ...raw,
          quote: {
            ...raw.quote,
            aggregatedOutputs: [
              {
                token: WETH.address,
                recipient,
                amount: raw.quote.output.amount,
                bps: 9999,
                fee: 'INTEGRATOR',
              },
            ],
          },
        },
        quoteRequestFixture(),
        1_000,
        1_100,
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' });
    await expect(normalizeQuote(raw, quoteRequestFixture(), 1_000, 31_000)).rejects.toMatchObject({
      code: 'QUOTE_STALE',
    });
  });
  it('sends only the supported official request and never retries', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(providerQuoteFixture()));
    const quote = await createUniswapQuoter({
      apiKey: 'synthetic-fixture-key',
      fetch: transport,
      now: () => 1_000,
    }).quote(quoteRequestFixture());
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://trade-api.gateway.uniswap.org/v1/quote');
    expect(init?.redirect).toBe('error');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      protocols: ['V3'],
      permitAmount: 'EXACT',
      slippageTolerance: 0.5,
      integratorFees: [],
    });
    expect(quote.executionAuthorized).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    [
      'provider error',
      () => new Response('sensitive provider message', { status: 401 }),
      'PROVIDER_UNAVAILABLE',
    ],
    [
      'rate limit',
      () => new Response('sensitive provider message', { status: 429 }),
      'PROVIDER_RATE_LIMITED',
    ],
    [
      'not JSON',
      () => new Response('not-json', { headers: { 'content-type': 'application/json' } }),
      'PROVIDER_INVALID_RESPONSE',
    ],
    ['HTML', () => new Response('<html>error</html>'), 'PROVIDER_INVALID_RESPONSE'],
    [
      'oversize header',
      () =>
        new Response('{}', {
          headers: { 'content-type': 'application/json', 'content-length': '999999' },
        }),
      'PROVIDER_INVALID_RESPONSE',
    ],
    [
      'oversize stream',
      () => Response.json({ data: 'x'.repeat(270_000) }),
      'PROVIDER_INVALID_RESPONSE',
    ],
  ])('handles %s with a redacted error', async (_name, response, code) => {
    const quote = createUniswapQuoter({
      apiKey: 'fixture-key',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response()),
    }).quote(quoteRequestFixture());
    await expect(quote).rejects.toMatchObject({ code });
    await expect(quote).rejects.not.toThrow(/sensitive/);
  });
  it('bounds concurrent calls and retains quota across provider failures', async () => {
    let clock = 1_000;
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('secret-network-error'));
    const quoter = createUniswapQuoter({
      apiKey: 'fixture-key',
      fetch: transport,
      now: () => clock,
    });
    const pending = quoter.quote(quoteRequestFixture());
    await expect(quoter.quote(quoteRequestFixture())).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
    });
    await expect(pending).rejects.not.toThrow(/secret-network/);
    for (let i = 0; i < 5; i++) {
      clock += 1_000;
      await expect(quoter.quote(quoteRequestFixture())).rejects.toMatchObject({
        code: 'PROVIDER_UNAVAILABLE',
      });
    }
    clock += 1_000;
    await expect(quoter.quote(quoteRequestFixture())).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
    });
    expect(transport).toHaveBeenCalledTimes(6);
  });
  it('requires explicit server opt-in and forbids trading even with a key', () => {
    expect(readEnvironment({ UNISWAP_API_KEY: 'fixture' }).UNISWAP_QUOTING_ENABLED).toBe('false');
    expect(() => readEnvironment({ UNISWAP_QUOTING_ENABLED: 'true' })).toThrow();
    expect(() =>
      readEnvironment({
        UNISWAP_API_KEY: 'fixture',
        UNISWAP_QUOTING_ENABLED: 'true',
        TRADING_ENABLED: 'true',
      }),
    ).toThrow();
  });
});
