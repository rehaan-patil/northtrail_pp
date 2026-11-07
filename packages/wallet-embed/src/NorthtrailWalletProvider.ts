/**
 * @northtrail/wallet-embed - NorthtrailWalletProvider
 * 
 * Standard EIP-1193 Ethereum Provider wrapper that intercepts outgoing transactions
 * and enforces Northtrail trade & allowance assurance prior to user signature.
 */

import {
  inspectTransactionIntent,
  type SecurityPolicy,
  type InspectionResult,
  DEFAULT_POLICY,
} from './NorthtrailPolicyGuard.js';

export interface EIP1193Provider {
  request(args: { method: string; params?: any[] }): Promise<any>;
  on?(event: string, listener: (...args: any[]) => void): void;
  removeListener?(event: string, listener: (...args: any[]) => void): void;
}

export interface WrapProviderOptions {
  policy?: Partial<SecurityPolicy>;
  onPolicyViolation?: (result: InspectionResult) => void;
  onDecisionDigestCreated?: (digest: `0x${string}`) => void;
}

/**
 * Wraps any EIP-1193 provider (MetaMask, Coinbase Wallet, Rainbow, Wagmi, Viem)
 * with Northtrail's pre-flight assurance pipeline.
 */
export function wrapWithNorthtrail(
  underlyingProvider: EIP1193Provider,
  options: WrapProviderOptions = {}
): EIP1193Provider {
  const policy: SecurityPolicy = {
    ...DEFAULT_POLICY,
    ...options.policy,
  };

  return {
    ...underlyingProvider,
    async request(args: { method: string; params?: any[] }) {
      const { method, params } = args;

      // Intercept eth_sendTransaction
      if (method === 'eth_sendTransaction' && params && params[0]) {
        const rawTx = params[0];
        const chainIdHex = await underlyingProvider.request({ method: 'eth_chainId' });
        const chainId = parseInt(chainIdHex, 16);

        const inspection = inspectTransactionIntent(
          {
            to: rawTx.to,
            from: rawTx.from,
            value: rawTx.value,
            data: rawTx.data,
            chainId,
          },
          policy
        );

        if (options.onDecisionDigestCreated) {
          options.onDecisionDigestCreated(inspection.decisionDigest);
        }

        if (!inspection.allowed) {
          if (options.onPolicyViolation) {
            options.onPolicyViolation(inspection);
          }
          const err = new Error(inspection.blockReason || 'Transaction blocked by Northtrail Security Policy.');
          (err as any).code = 4001;
          (err as any).data = inspection;
          throw err;
        }
      }

      // Pass through all approved or standard requests to underlying provider
      return underlyingProvider.request(args);
    },
  };
}

