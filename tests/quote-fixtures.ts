import { USDC, WETH } from '../packages/config/src/index.js';
import { owner, recipient } from './fixtures.js';

export function oneinchQuoteFixture() {
  return {
    srcToken: { address: USDC.address, decimals: 6, isFoT: false },
    dstToken: { address: WETH.address, decimals: 18, isFoT: false },
    dstAmount: '299000000000000000',
    gas: 190000,
    protocols: [
      {
        token: USDC.address,
        hops: [
          {
            part: 100,
            dst: WETH.address,
            fromTokenId: 0,
            toTokenId: 1,
            protocols: [{ name: 'UNISWAP_V3', part: 100 }],
          },
        ],
      },
    ],
  };
}

export const quoteRequestFixture = () => ({
  chainId: 1 as const,
  owner,
  recipient,
  tokenIn: USDC.address,
  tokenOut: WETH.address,
  amountInRaw: '1000000000',
  slippageBps: 50,
});
export function providerQuoteFixture() {
  return {
    requestId: 'synthetic-request',
    routing: 'CLASSIC',
    permitData: { secretFixturePayload: 'must-never-reach-browser' },
    swapTransaction: { data: '0xdeadbeef' },
    quote: {
      quoteId: 'synthetic-quote',
      chainId: 1,
      swapper: owner as string,
      tradeType: 'EXACT_INPUT',
      slippage: 0.5,
      input: { token: USDC.address, amount: '1000000000' },
      output: {
        token: WETH.address,
        amount: '300000000000000000',
        recipient: recipient as string,
        minimumAmount: '298500000000000000',
      },
      gasFee: '500000000000000',
      blockNumber: '12345678',
      txFailureReasons: [] as string[],
      route: [
        [
          {
            type: 'v3-pool',
            address: '0x3333333333333333333333333333333333333333',
            tokenIn: { address: USDC.address, chainId: 1, decimals: '6' },
            tokenOut: { address: WETH.address, chainId: 1, decimals: '18' },
            fee: '500',
            amountIn: '1000000000',
            amountOut: '300000000000000000',
          },
        ],
      ],
    },
  };
}
