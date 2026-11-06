import { z } from 'zod';
import { USDC, WETH } from '@northtrail/config';
import {
  AddressSchema,
  PositiveAmountSchema,
  QuoteRequestSchema,
  AggregatorObservationSchema,
  NorthtrailError,
  digestJson,
  type QuoteRequest,
} from '@northtrail/domain';
import { createQuoteTransport } from '@northtrail/provider-http';

const TokenSchema = z.object({
  address: AddressSchema,
  decimals: z.number().int().min(0).max(36),
  isFoT: z.literal(false).optional(),
});

const OneinchResponseSchema = z.object({
  srcToken: TokenSchema,
  dstToken: TokenSchema,
  dstAmount: PositiveAmountSchema,
  gas: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  protocols: z
    .array(
      z.object({
        token: AddressSchema,
        hops: z
          .array(
            z.object({
              part: z.number().positive().max(100),
              dst: AddressSchema,
              fromTokenId: z.number().int().nonnegative().max(10_000),
              toTokenId: z.number().int().nonnegative().max(10_000),
              protocols: z
                .array(
                  z.object({
                    name: z.string().min(1).max(100),
                    part: z.number().positive().max(100),
                  }),
                )
                .min(1)
                .max(32),
            }),
          )
          .min(1)
          .max(32),
      }),
    )
    .min(1)
    .max(32),
});

function validate(input: unknown) {
  const request = QuoteRequestSchema.parse(input);
  if (request.tokenIn !== USDC.address || request.tokenOut !== WETH.address) {
    throw new NorthtrailError(
      'UNSUPPORTED_TOKEN',
      'Only registry USDC to WETH on Ethereum is supported.',
    );
  }
  return request;
}

export async function normalizeOneinchQuote(
  raw: unknown,
  input: QuoteRequest,
  requestedAt: number,
  fetchedAt: number,
) {
  const request = validate(input);
  const response = OneinchResponseSchema.safeParse(raw);

  const isMatched =
    response.success &&
    response.data.srcToken.address === request.tokenIn &&
    response.data.dstToken.address === request.tokenOut &&
    response.data.srcToken.decimals === 6 &&
    response.data.dstToken.decimals === 18;

  if (!isMatched) {
    throw new NorthtrailError(
      'PROVIDER_INVALID_RESPONSE',
      '1inch quote did not match the supported observation contract.',
      502,
    );
  }

  const isTimingValid =
    Number.isSafeInteger(requestedAt) &&
    Number.isSafeInteger(fetchedAt) &&
    fetchedAt >= requestedAt &&
    fetchedAt - requestedAt < 30_000;

  if (!isTimingValid) {
    throw new NorthtrailError(
      'QUOTE_STALE',
      'The quote arrived outside the local review window.',
      502,
    );
  }

  const quote = response.data;

  const sources = new Set(
    quote.protocols.flatMap((path) =>
      path.hops.flatMap((hop) => hop.protocols.map((source) => source.name)),
    ),
  );

  return AggregatorObservationSchema.parse({
    schemaVersion: '1',
    kind: 'AGGREGATOR_OBSERVATION',
    provider: 'ONEINCH',
    provenance: 'PROVIDER_RESPONSE',
    request,
    responseDigest: await digestJson(raw),
    requestedAt: new Date(requestedAt).toISOString(),
    fetchedAt: new Date(fetchedAt).toISOString(),
    reviewExpiresAt: new Date(requestedAt + 30_000).toISOString(),
    outputRaw: quote.dstAmount,
    gasUnitsEstimate: String(quote.gas),
    gasPriceWei: null,
    providerBlockNumber: null,
    chainVerification: 'NOT_VERIFIED',
    recipientBinding: 'REQUEST_ONLY',
    approvalCost: 'UNKNOWN',
    liquiditySources: [...sources].sort(),
    executionAuthorized: false,
    limitations: [
      'Aggregator provider observation, not an executable route, confirmed pool topology or independently pinned chain state.',
      'Quote endpoint does not bind a recipient or echo the input amount. Request context is recorded, not asserted as a provider execution guarantee.',
      'Estimated gas units are not a gas fee. Gas price, approval/reset costs and spend authority remain unverified.',
      'Route sources may span several protocols and hops. No claim is made to reproduce Pathfinder or exceed its performance.',
    ],
  });
}

export function createOneinchQuoter(options: {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  if (!options.apiKey.trim()) {
    throw new NorthtrailError('PROVIDER_UNAVAILABLE', '1inch access is not configured.', 503);
  }

  const transport = createQuoteTransport(options);

  return {
    async quote(input: unknown) {
      const request = validate(input);
      const url = new URL('https://api.1inch.com/swap/v6.1/1/quote');

      const params: Record<string, string> = {
        src: request.tokenIn,
        dst: request.tokenOut,
        amount: request.amountInRaw,
        fee: '0',
        includeTokensInfo: 'true',
        includeProtocols: 'true',
        includeGas: 'true',
      };

      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }

      const result = await transport(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          Accept: 'application/json',
        },
      });

      return normalizeOneinchQuote(result.payload, request, result.requestedAt, result.fetchedAt);
    },
  };
}