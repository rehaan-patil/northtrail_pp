import { z } from 'zod';
import { AssetSchema, NorthtrailError } from '@northtrail/domain';

export const USDC = AssetSchema.parse({
  chainId: 1,
  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  decimals: 6,
  symbol: 'USDC',
});

export const WETH = AssetSchema.parse({
  chainId: 1,
  address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  decimals: 18,
  symbol: 'WETH',
});

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  DATABASE_DRIVER: z.enum(['pglite', 'postgres']).default('pglite'),
  DATABASE_PATH: z.string().default('../../.data/northtrail'),
  DATABASE_URL: z.string().optional(),
  UNISWAP_API_KEY: z.string().optional(),
  UNISWAP_QUOTING_ENABLED: z.enum(['true', 'false']).default('false'),
  ONEINCH_API_KEY: z.string().optional(),
  ONEINCH_QUOTING_ENABLED: z.enum(['true', 'false']).default('false'),
  RPC_URL: z.string().optional(),
  RPC_SECONDARY_URL: z.string().optional(),
  TRADING_ENABLED: z.enum(['true', 'false']).default('false'),
  GIT_SHA: z.string().default('local'),
});

export type Environment = z.infer<typeof EnvSchema>;

export function readEnvironment(input: Record<string, string | undefined>): Environment {
  const env = EnvSchema.parse(input);

  if (env.ONEINCH_QUOTING_ENABLED === 'true' && !env.ONEINCH_API_KEY?.trim()) {
    throw new NorthtrailError('INVALID_INPUT', 'Enabled 1inch quoting requires a server API key.');
  }

  if (env.UNISWAP_QUOTING_ENABLED === 'true' && !env.UNISWAP_API_KEY?.trim()) {
    throw new NorthtrailError(
      'INVALID_INPUT',
      'Enabled quote acquisition requires a server Uniswap key.',
    );
  }

  if (env.DATABASE_DRIVER === 'postgres' && !env.DATABASE_URL) {
    throw new NorthtrailError('INVALID_INPUT', 'DATABASE_URL is required for PostgreSQL.');
  }

  if (
    env.NODE_ENV === 'production' &&
    (env.DATABASE_DRIVER !== 'postgres' || !env.APP_ORIGIN.startsWith('https://'))
  ) {
    throw new NorthtrailError(
      'INVALID_INPUT',
      'Production requires PostgreSQL and an HTTPS application origin.',
    );
  }

  if (env.TRADING_ENABLED === 'true') {
    throw new NorthtrailError(
      'TRADING_DISABLED',
      'This foundation release does not enable financial execution.',
    );
  }

  return env;
}