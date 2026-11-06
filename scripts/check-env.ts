import { readEnvironment } from '../packages/config/src/index.js';

const env = readEnvironment(process.env);
console.log(
  JSON.stringify(
    {
      environment: env.NODE_ENV,
      databaseDriver: env.DATABASE_DRIVER,
      financialExecution: 'DISABLED',
      configured: {
        database: Boolean(env.DATABASE_URL),
        uniswap: Boolean(env.UNISWAP_API_KEY),
        oneinch: Boolean(env.ONEINCH_API_KEY),
        rpc: Boolean(env.RPC_URL),
        secondaryRpc: Boolean(env.RPC_SECONDARY_URL),
      },
    },
    null,
    2,
  ),
);
