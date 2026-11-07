# NORTHTRAIL 3.0 — DEPLOYMENT EVIDENCE & RUNTIME REPORT

**Date:** 07 November 2026  
**Repository:** [rehaan-patil/northtrail_pp](https://github.com/rehaan-patil/northtrail_pp)  
**Frontend Deployment:** [https://northtrail-cck4sgx3n-rehaanpatil08-7611.vercel.app/](https://northtrail-cck4sgx3n-rehaanpatil08-7611.vercel.app/)  
**Backend Service:** [Railway northtrail_pp](https://railway.com/project/a03bbb44-dc92-446f-a3f6-ec2411e17598/service/a7daffc3-07e2-4f39-95f5-c0a78391b188?environmentId=9d60d797-1708-4813-ba86-427acac55724)  
**Backend Live URL:** [https://northtrailpp-production.up.railway.app](https://northtrailpp-production.up.railway.app)  

---

## 1. VERIFIED ENDPOINT READINESS

### Backend Service (Fastify / Railway)
- `GET /v1/status`: Returns JSON with schemaVersion 1, version 0.1.0, environment production, and all 12 operational capability flags.
- `GET /v1/assets`: Returns Ethereum registry assets (USDC, WETH).
- `POST /v1/quotes/uniswap`: Size-dependent Uniswap v3 pool simulation matching `QuoteObservationSchema`.
- `POST /v1/quotes/benchmark`: Matched-pair Uniswap v3 vs 1inch Pathfinder comparison matching `QuoteBenchmarkSchema`.
- `POST /v1/trades/review`: RFC 8785 decision consistency verification.

### Frontend Service (Next.js 16 / Vercel)
- `GET /`: Responsive Matveyan fintech terminal workspace with dual Light/Dark mode.
- `GET /agent-guard`: World Agent Pass human control loop on World Chain (eip155:480).
- `GET /health`: Web service health check.
- `GET /v1/[...path]` & `GET /api/[...path]`: Next.js edge/serverless route handlers providing same-origin, zero-CORS access to all quant, quoting, and decision capabilities.

---

## 2. SURFACES & COMPONENT CONTRIBUTIONS

1. **Trade Workbench (`quote-panel.tsx`)**:
   - Live size-dependent Uniswap quoter with 50 bps policy slippage.
   - MetaMask / Web3 wallet connection with automatic balance and chain detection.
   - Exact ERC-20 approval (`approve(address,uint256)`) with zero infinite-allowance exposure.
   - Decision digest recording with RFC 8785 canonical hash.
   - Non-custodial execution dispatch with transaction hash tracking.

2. **Curve Atlas (`curve-atlas.tsx`)**:
   - Dynamic trade size slider ($500 to $100,000 USDC).
   - Real-time comparison: Uniswap v3 0.05% (Fee 500) vs Uniswap v3 0.30% (Fee 3000) vs 1inch Pathfinder.
   - Crossover interval explanation (retail fee dominance below $18.5k, institutional tick depth $18.5k–$45k, multi-pool split at $45k+).
   - Gas-normalized net realized output in destination token / USD.
   - "Apply to Workbench" interaction.

3. **Chronos Planner (`chronos-planner.tsx`)**:
   - Execution timing optimizer with tabs: `NOW` | `SPLIT (TWAP)` | `WAIT`.
   - Tranche slider (2 to 5 slices) with repeated gas overhead calculation.
   - Expected shortfall (bps) vs 95% CVaR tail-risk cost.
   - Non-custodial authorization guard.

4. **Aqua Maker Studio (`aqua-maker.tsx`)**:
   - Official 1inch Aqua shared-liquidity registry & SwapVM router v1.0.2 integration.
   - Real-time Capital Coverage Monitor (`inspectAquaCoverage`) calculating `min(Balance, Allowance) / VirtualClaimed`.
   - Health status: `HEALTHY`, `UNDERFUNDED_WARNING`, `CRITICAL`.
   - Strategy lifecycle: Ship virtual strategy, simulate taker swap fill on local fork, dock position.

5. **Universe Risk Lens (`universe-explorer.tsx`)**:
   - Multi-token selector: WETH, WBTC, UNI, DAI.
   - Realized volatility, EWMA volatility, 24h drawdown, 1-day 95% VaR, 95% Expected Shortfall.
   - Market regime classification (`QUIET`, `MODERATE`, `ELEVATED`).
   - Point-in-time candle trend sparkline and sample completeness.

6. **Decision Trail & Trade Proof (`page.tsx`, `proof-panel.tsx`)**:
   - RFC 8785 canonical digest validator.
   - Downloadable cryptographic evidence JSON.
   - Ethereum transaction receipt observer with gas cost and block confirmations.

7. **World Agent Pass (`agent-guard/page.tsx`)**:
   - AgentBook registry on World Chain (eip155:480).
   - Cryptographic human-in-the-loop oversight with Orb verification simulation and daily spending cap enforcement.

---

## 3. VERIFICATION RUN LOGS

```bash
# 1. Typecheck across entire monorepo
pnpm typecheck
# Output: Exit code 0 (zero errors)

# 2. Production build across all 14 packages and apps
pnpm -r --if-present build
# Output: Exit code 0
# - @northtrail/sdk: built dist/index.js (29.86 KB) and dist/index.d.ts (42.40 KB)
# - @northtrail/api: built dist/runtime/server.js and dist/runtime/migrate.js
# - @northtrail/web: compiled static and dynamic routes (/ , /agent-guard, /api/[...path], /v1/[...path], /health)

# 3. Test suite
pnpm test
# Output: 13 test files passed, 207 tests passed (100% PASS)

# 4. Security pattern scan
node scripts/security-scan.mjs
# Output: Credential pattern scan passed (105 files).

# 5. Packaged SDK smoke test
pnpm smoke:sdk
# Output: Packed SDK runtime and TypeScript consumer passed outside the workspace.
```

