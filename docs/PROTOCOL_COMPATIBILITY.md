# NORTHTRAIL 3.0 — PROTOCOL COMPATIBILITY MATRIX

**Date:** 07 November 2026  
**Scope:** Verified on-chain deployments, router addresses, opcode boundaries, and execution models.

---

## 1. UNISWAP INTEGRATION

| Component | Target Version | Address / Reference | Runtime Execution Status | Limitations |
|---|---|---|---|---|
| **Uniswap v3 QuoterV2** | v3 | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` (Ethereum) | Read-only simulation | Exact-input QuoterV2 calls anchor liquidity ticks; simulations never mutate pool reserves. |
| **Uniswap Universal Router** | Universal v1.2 | `0x66a9893cC07D91D95644AEDD05d03f95e1dba8af` (Ethereum) | Client-wallet broadcast | Permitted spend targets only. Non-custodial wallet owner broadcasts transactions. |
| **Uniswap Pool Fee Tiers** | v3 | Fee 500 (0.05%), Fee 3000 (0.30%), Fee 10000 (1.00%) | Verified in Curve Atlas | Single-pool exact-input comparison; accounts for price impact and tick-crossing fee jumps. |
| **Uniswap v4 Hooks** | v4 PoolManager | Architecture specified | Read-only identification | Pools with unverified custom hook logic are classified as `NOT_SUPPORTED` for automatic execution. |

---

## 2. 1INCH CLASSIC SWAP & PATHFINDER

| Feature | Provider Version | Capability | Execution Role | Invariants |
|---|---|---|---|---|
| **Pathfinder Route Splitting** | Swap API v6.1 | Multi-hop split routing across AMMs (Uniswap, Curve, Balancer) | Benchmarking & aggregate comparator | A Pathfinder quote is an external aggregator estimate; it does not authorize user spend or mutate external pool states. |
| **Spot vs Executable Quotes** | v6.1 | Exact-input trade-size quotes | Comparative analysis | Spot reference prices are never substituted for large-size executable quotes. |

---

## 3. 1INCH AQUA & SWAPVM ADAPTIVE MAKER

| Contract | Deployed Address | Network | Lifecycle Methods | Operational Constraints |
|---|---|---|---|---|
| **Aqua Registry** | `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | EVM Chains (Ethereum / Base / Fork) | `ship()`, `dock()` | Allocates and revokes virtual liquidity without taking custody of tokens. |
| **AquaSwapVMRouter** | `0x111111338c5091e8440b67b168bae16a668ac0de` (v1.0.2) | EVM Chains | `quote()`, `swap()` | Executes atomic token pulls and pushes using authorized spend allowances. |
| **Capital Coverage Ratio** | `@northtrail/aqua` | Local / Edge calculation | `inspectAquaCoverage()` | Computes `actualAvailable / virtualClaimed`. Ratios < 1.0 trigger underfunding warnings to prevent taker swap reverts. |

---

## 4. WORLD AGENT PASS & HUMAN CONTROL LOOP

| Layer | Contract / Service | Network | Authorization Scope | Fallback |
|---|---|---|---|---|
| **AgentBook Registry** | AgentBook Mandate Schema | World Chain (`eip155:480`) | Daily spending cap enforcement (e.g. 300 USDC) | Requests exceeding daily budget require fresh World ID Orb verification pass. |
| **World ID Nullifier** | Dev Portal v2 / Simulator | World ID Protocol | Single-use anti-replay token | Nullifiers are tracked in-memory to prevent replay attacks; expires automatically after challenge window. |

