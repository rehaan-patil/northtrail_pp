# @northtrail/wallet-embed

> Open-Source Embedded Web3 Wallet Assurance SDK for Wagmi, Viem, and EIP-1193 Providers.

## Overview

`@northtrail/wallet-embed` brings non-custodial quantitative trade assurance, malicious slippage interception, and infinite approval protection directly inside the user's wallet client before raw transactions reach the signing layer.

### Core Guarantees

1. **Pre-Sign Intent Inspection**: Decodes and verifies calldata, router targets, and spend limits before prompt.
2. **Slippage Trap Protection**: Blocks excessive slippage parameters (> policy threshold) to prevent MEV sandwich attacks.
3. **Infinite Allowance Shield**: Intercepts `type(uint256).max` approvals and enforces exact-trade spending limits.
4. **RFC 8785 Decision Digest**: Computes a deterministic canonical evidence digest linking the user intent to on-chain execution.
5. **Zero Custody**: Models and servers never handle private keys; all transactions are signed by the wallet owner.

---

## 15-Line Quickstart (Wagmi / Viem)

```typescript
import { wrapWithNorthtrail } from '@northtrail/wallet-embed';

// Wrap your browser wallet or embedded wallet provider (Privy / Dynamic / RainbowKit)
const securedProvider = wrapWithNorthtrail(window.ethereum, {
  policy: {
    maxSlippageBps: 50, // Block swaps with > 0.50% slippage
    blockInfiniteApprovals: true,
  },
  onPolicyViolation: (audit) => {
    console.error('Northtrail Guard Blocked Unsafe Tx:', audit.blockReason);
  },
  onDecisionDigestCreated: (digest) => {
    console.log('RFC 8785 Decision Digest:', digest);
  },
});
```

---

## License

Apache-2.0 © Northtrail Protocol

