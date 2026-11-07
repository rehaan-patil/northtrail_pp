/**
 * @northtrail/wallet-embed - Wagmi Connector
 * 
 * Open-source Wagmi integration demonstrating how to embed Northtrail
 * into modern React dApps and embedded wallet SDKs (Privy, Dynamic, RainbowKit).
 */

import { wrapWithNorthtrail, type EIP1193Provider, type WrapProviderOptions } from './NorthtrailWalletProvider.js';

export interface NorthtrailWagmiConfig {
  options?: WrapProviderOptions;
}

/**
 * Creates a secured Wagmi connector decorator that automatically attaches Northtrail Guard
 * to any existing Wagmi wallet connector.
 */
export function createNorthtrailWagmiMiddleware(config: NorthtrailWagmiConfig = {}) {
  return (connector: any) => {
    const originalGetProvider = connector.getProvider.bind(connector);

    connector.getProvider = async () => {
      const provider = (await originalGetProvider()) as EIP1193Provider;
      if (!provider) return provider;
      return wrapWithNorthtrail(provider, config.options);
    };

    return connector;
  };
}
