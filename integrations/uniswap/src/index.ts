import { createQuoteTransport } from '@northtrail/provider-http';
import { z } from 'zod';
import { USDC, WETH } from '@northtrail/config';
import {
  AddressSchema,
  NorthtrailError,
  PositiveAmountSchema,
  RawAmountSchema,
  QuoteRequestSchema,
  QuoteObservationSchema,
  digestJson,
  minimumOutput,
  type QuoteRequest,
  type QuoteObservation,
} from '@northtrail/domain';

const ENDPOINT = 'https://trade-api.gateway.uniswap.org/v1/quote';
const REVIEW_TTL_MS = 30_000; // Local review policy, not provider validity or chain freshness.
const Token = z.object({
  address: AddressSchema,
  chainId: z.literal(1),
  decimals: z.string().regex(/^(0|[1-9][0-9]?)$/),
});
const Pool = z.object({
  type: z.literal('v3-pool'),
  address: AddressSchema,
  tokenIn: Token,
  tokenOut: Token,
  fee: z.enum(['100', '500', '3000', '10000']),
  amountIn: PositiveAmountSchema.optional(),
  amountOut: PositiveAmountSchema.optional(),
});
const ResponseSchema = z.object({
  requestId: z.string().min(1).max(200),
  routing: z.literal('CLASSIC'),
  quote: z.object({
    quoteId: z.string().min(1).max(200),
    chainId: z.literal(1),
    swapper: AddressSchema,
    tradeType: z.literal('EXACT_INPUT'),
    slippage: z.number().finite(),
    input: z.object({ token: AddressSchema, amount: PositiveAmountSchema }),
    output: z.object({
      token: AddressSchema,
      amount: PositiveAmountSchema,
      recipient: AddressSchema,
      minimumAmount: RawAmountSchema.optional(),
    }),
    gasFee: RawAmountSchema,
    blockNumber: PositiveAmountSchema,
    route: z.array(z.array(Pool).min(1).max(8)).min(1).max(8),
    txFailureReasons: z.array(z.string()).max(20),
    aggregatedOutputs: z
      .array(
        z.object({
          token: AddressSchema,
          amount: PositiveAmountSchema,
          recipient: AddressSchema,
          bps: z.literal(10_000),
          minAmount: RawAmountSchema.optional(),
          fee: z.never().optional(),
        }),
      )
      .length(1)
      .optional(),
  }),
});

function invalid(): never {
  throw new NorthtrailError(
    'PROVIDER_INVALID_RESPONSE',
    'Uniswap response failed the supported quote contract.',
    502,
    'Request a fresh supported quote; do not sign this response.',
  );
}

export function validateQuoteRequest(input: unknown): QuoteRequest {
  const request = QuoteRequestSchema.parse(input);
  if (request.tokenIn !== USDC.address || request.tokenOut !== WETH.address)
    throw new NorthtrailError(
      'UNSUPPORTED_TOKEN',
      'Only registry USDC to WETH on Ethereum is supported.',
    );
  return request;
}

// Analysis-only normalization. Never returns permit data, calldata or a transaction.
export async function normalizeQuote(
  raw: unknown,
  input: QuoteRequest,
  requestedAt: number,
  fetchedAt: number,
): Promise<QuoteObservation> {
  const request = validateQuoteRequest(input);
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) invalid();
  const { quote, requestId } = parsed.data;
  if (
    quote.swapper !== request.owner ||
    quote.input.token !== request.tokenIn ||
    quote.output.token !== request.tokenOut ||
    quote.output.recipient !== request.recipient ||
    quote.input.amount !== request.amountInRaw ||
    quote.slippage !== request.slippageBps / 100 ||
    quote.txFailureReasons.length > 0
  )
    invalid();
  if (
    !Number.isSafeInteger(requestedAt) ||
    !Number.isSafeInteger(fetchedAt) ||
    fetchedAt < requestedAt ||
    fetchedAt - requestedAt >= REVIEW_TTL_MS
  )
    throw new NorthtrailError(
      'QUOTE_STALE',
      'The quote arrived outside the local review window.',
      502,
    );
  const minOut = minimumOutput(quote.output.amount, request.slippageBps);
  const aggregate = quote.aggregatedOutputs?.[0];
  if (
    aggregate &&
    (aggregate.token !== request.tokenOut ||
      aggregate.recipient !== request.recipient ||
      aggregate.amount !== quote.output.amount)
  )
    invalid();
  for (const minimum of [quote.output.minimumAmount, aggregate?.minAmount])
    if (
      minimum !== undefined &&
      (BigInt(minimum) < BigInt(minOut) || BigInt(minimum) > BigInt(quote.output.amount))
    )
      invalid();
  let totalInput = 0n;
  let totalOutput = 0n;
  for (const path of quote.route) {
    const first = path[0]!;
    const last = path.at(-1)!;
    if (
      first.tokenIn.address !== request.tokenIn ||
      last.tokenOut.address !== request.tokenOut ||
      first.tokenIn.decimals !== '6' ||
      last.tokenOut.decimals !== '18' ||
      !first.amountIn ||
      !last.amountOut
    )
      invalid();
    totalInput += BigInt(first.amountIn);
    totalOutput += BigInt(last.amountOut);
    for (let i = 0; i < path.length; i++) {
      const pool = path[i]!;
      if (
        pool.address === '0x0000000000000000000000000000000000000000' ||
        pool.tokenIn.address === pool.tokenOut.address
      )
        invalid();
      if (
        i > 0 &&
        (path[i - 1]!.tokenOut.address !== pool.tokenIn.address ||
          path[i - 1]!.tokenOut.decimals !== pool.tokenIn.decimals)
      )
        invalid();
    }
  }
  if (totalInput !== BigInt(request.amountInRaw) || totalOutput !== BigInt(quote.output.amount))
    invalid();
  return QuoteObservationSchema.parse({
    schemaVersion: '1',
    kind: 'QUOTE_OBSERVATION',
    provider: 'UNISWAP',
    provenance: 'PROVIDER_RESPONSE',
    request,
    requestId,
    quoteId: quote.quoteId,
    responseDigest: await digestJson(raw),
    requestedAt: new Date(requestedAt).toISOString(),
    fetchedAt: new Date(fetchedAt).toISOString(),
    reviewExpiresAt: new Date(requestedAt + REVIEW_TTL_MS).toISOString(),
    providerBlockNumber: quote.blockNumber,
    chainVerification: 'NOT_VERIFIED',
    outputRaw: quote.output.amount,
    policyMinOutRaw: minOut,
    providerMinOutRaw: quote.output.minimumAmount ?? aggregate?.minAmount ?? null,
    gasEstimateWei: quote.gasFee,
    approvalCost: 'UNKNOWN',
    routes: quote.route.map((path) =>
      path.map((pool) => ({
        pool: pool.address,
        tokenIn: pool.tokenIn.address,
        tokenOut: pool.tokenOut.address,
        feePips: Number(pool.fee),
      })),
    ),
    executionAuthorized: false,
    limitations: [
      'Provider observation only. Pool identity, block hash, canonicality and on-chain state are not independently verified.',
      'Review expiry is a local 30-second policy measured from request start; it is not a provider execution guarantee.',
      'Allowance, approval/reset gas, Permit2, calldata, owner authority and settlement are not verified. No spending is authorized.',
      'Only CLASSIC V3 USDC/WETH routes with exact endpoint amount conservation and no integrator fee allocation are accepted.',
    ],
  });
}

export function createUniswapQuoter(options: {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  if (!options.apiKey.trim())
    throw new NorthtrailError('PROVIDER_UNAVAILABLE', 'Uniswap access is not configured.', 503);
  const transport = createQuoteTransport(options);
  return {
    async quote(input: unknown): Promise<QuoteObservation> {
      const request = validateQuoteRequest(input);
      const result = await transport(ENDPOINT, {
        method: 'POST',
        headers: {
          'x-api-key': options.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          type: 'EXACT_INPUT',
          amount: request.amountInRaw,
          tokenInChainId: 1,
          tokenOutChainId: 1,
          tokenIn: request.tokenIn,
          tokenOut: request.tokenOut,
          swapper: request.owner,
          recipient: request.recipient,
          slippageTolerance: request.slippageBps / 100,
          protocols: ['V3'],
          routingPreference: 'BEST_PRICE',
          permitAmount: 'EXACT',
          generatePermitAsTransaction: false,
          integratorFees: [],
        }),
      });
      return normalizeQuote(result.payload, request, result.requestedAt, result.fetchedAt);
    },
  };
}
