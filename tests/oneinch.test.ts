import { describe, expect, it, vi } from 'vitest';
import { createOneinchQuoter, normalizeOneinchQuote } from '../integrations/oneinch/src/index.js';
import { USDC, readEnvironment } from '../packages/config/src/index.js';
import { oneinchQuoteFixture, quoteRequestFixture } from './quote-fixtures.js';

describe('1inch v6.1 observations (synthetic fixtures)', () => {
  it('retains gas units and unknown valuation separately and never binds nonexistent authority', async () => {
    const result = await normalizeOneinchQuote(
      oneinchQuoteFixture(),
      quoteRequestFixture(),
      1_000,
      1_100,
    );
    expect(result.gasUnitsEstimate).toBe('190000');
    expect(result.gasPriceWei).toBeNull();
    expect(result.recipientBinding).toBe('REQUEST_ONLY');
    expect(result.providerBlockNumber).toBeNull();
    expect(result.executionAuthorized).toBe(false);
    expect(result.liquiditySources).toEqual(['UNISWAP_V3']);
  });
  it.each([
    [
      'identity',
      (raw: ReturnType<typeof oneinchQuoteFixture>) => {
        raw.dstToken.address = USDC.address;
      },
    ],
    [
      'decimals',
      (raw: ReturnType<typeof oneinchQuoteFixture>) => {
        raw.dstToken.decimals = 6;
      },
    ],
    [
      'gas',
      (raw: ReturnType<typeof oneinchQuoteFixture>) => {
        raw.gas = -1;
      },
    ],
    [
      'output',
      (raw: ReturnType<typeof oneinchQuoteFixture>) => {
        raw.dstAmount = '3.4';
      },
    ],
    [
      'fee-on-transfer',
      (raw: ReturnType<typeof oneinchQuoteFixture>) => {
        raw.srcToken.isFoT = true;
      },
    ],
  ])('rejects invalid %s', async (_name, change) => {
    const raw = oneinchQuoteFixture();
    change(raw);
    await expect(
      normalizeOneinchQuote(raw, quoteRequestFixture(), 1_000, 1_100),
    ).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' });
  });
  it('rejects the obsolete response topology and stale requests', async () => {
    const raw = oneinchQuoteFixture();
    await expect(
      normalizeOneinchQuote({ ...raw, protocols: [[[]]] }, quoteRequestFixture(), 1_000, 1_100),
    ).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' });
    await expect(
      normalizeOneinchQuote(raw, quoteRequestFixture(), 1_000, 31_000),
    ).rejects.toMatchObject({ code: 'QUOTE_STALE' });
  });
  it('uses the verified endpoint, server bearer header, explicit zero partner fee and bounded transport', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(oneinchQuoteFixture()));
    await createOneinchQuoter({ apiKey: 'fixture-key', fetch: transport }).quote(
      quoteRequestFixture(),
    );
    const [url, init] = transport.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe('https://api.1inch.com/swap/v6.1/1/quote');
    expect(parsed.searchParams.get('amount')).toBe(quoteRequestFixture().amountInRaw);
    expect(parsed.searchParams.get('fee')).toBe('0');
    expect(parsed.toString()).not.toContain('fixture-key');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer fixture-key' });
    expect(init?.redirect).toBe('error');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('fails closed without explicit configuration', () => {
    expect(readEnvironment({ ONEINCH_API_KEY: 'fixture' }).ONEINCH_QUOTING_ENABLED).toBe('false');
    expect(() => readEnvironment({ ONEINCH_QUOTING_ENABLED: 'true' })).toThrow();
  });
});
