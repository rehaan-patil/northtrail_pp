# Northtrail

**Know the choice. Prove the outcome.**

### Financial intelligence meets verifiable DeFi execution.

Northtrail is a non-custodial DeFi transaction-intelligence and assurance platform, built as an embeddable TypeScript SDK and developer workspace.

It brings together executable market quotes, mathematical cost analysis, risk-aware decision-making and cryptographically verifiable decision records. The broader goal is to make DeFi transactions easier to understand, safer to authorize and more transparent to evaluate after execution.

Rather than building another decentralized exchange, Northtrail focuses on an important part of the trading experience: **everything that happens between deciding to trade and understanding the result.**

---

## Why Northtrail?

A typical DeFi transaction involves more than selecting two tokens and clicking Swap.

Users have to consider exchange rates, liquidity, price impact, network fees, slippage, token approvals and execution uncertainty. Different protocols may offer different outcomes for the same amount, and market conditions can change between receiving a quote and submitting a transaction.

Most of this information exists, but it is often distributed across exchanges, wallet interfaces, analytics platforms and blockchain explorers.

That fragmentation creates three practical problems:

**1. It's difficult to compare the true cost of a trade.**  
A better advertised exchange rate does not necessarily mean a better result once gas, liquidity depth and other costs are considered.

**2. The reasoning behind a transaction is rarely preserved.**  
A user might compare multiple quotes and risk scenarios before making a decision, but those observations are not necessarily linked to a durable, independently inspectable decision record.

**3. Execution and verification are often treated as separate experiences.**  
The expected result shown before signing and the actual settled result on-chain are different kinds of evidence. Connecting them accurately requires more than simply storing a transaction hash.

Northtrail is designed to close these gaps through a shared intelligence, authorization and verification architecture.

---

## What we're building

Northtrail follows a straightforward principle:

**Understand the trade → Compare alternatives → Record the decision → Authorize safely → Verify the outcome.**

The platform is organized around five connected capabilities.

| Capability | Purpose |
|---|---|
| **Compass** | Analyze trade economics, risk exposure and competing execution scenarios. |
| **Decision Trail** | Preserve the parameters, evidence and reasoning associated with a financial decision. |
| **Trade Guard** | Validate execution boundaries, wallet permissions and transaction constraints. |
| **Trade Proof** | Reconcile transaction expectations with actual on-chain settlement evidence. |
| **Safe Paths** | Handle stale quotes, changed conditions and failed transaction attempts without silently expanding permissions. |

These components form the foundation of Northtrail. Advanced liquidity research and machine learning extend their capabilities rather than replacing them.

---

## 🚀 Quickstart & Demonstration Guide

### Live Production Deployment
- **Interactive Workspace (Frontend):** [https://northtrail-pp.vercel.app](https://northtrail-pp.vercel.app)
- **Typed REST API (Backend):** [https://northtrailpp-production.up.railway.app](https://northtrailpp-production.up.railway.app)
- **Health Check Endpoint:** [https://northtrail-pp.vercel.app/health](https://northtrail-pp.vercel.app/health)
- **Verified Capabilities:** [https://northtrail-pp.vercel.app/v1/status](https://northtrail-pp.vercel.app/v1/status)

---

### Running Locally on Your Machine From Scratch

#### Prerequisites
- **Node.js**: v24.0.0 or higher (`node -v`)
- **Git**: installed (`git --version`)
- **Corepack**: built into Node (`corepack enable`)

#### 1. Clone & Enter Repository
```bash
git clone https://github.com/rehaan-patil/northtrail_pp.git
cd northtrail_pp
```

#### 2. Install Dependencies
```bash
corepack enable
corepack pnpm install
```

#### 3. Build SDK Bundle
Compile `@northtrail/sdk` (includes domain schemas, 1inch Aqua coverage inspector, and Chronos quant models):
```bash
corepack pnpm --filter @northtrail/sdk build
```

#### 4. Run Automated Test Verification
Run the 207-test test suite across all 13 test suites:
```bash
corepack pnpm test
```
*Expected result: 13 passed (13 test files), 207 passed (207 tests).*

#### 5. Start Development Servers
Start both the Fastify API server and Next.js frontend concurrently:
```bash
corepack pnpm dev
```
- **Next.js Web UI**: `http://localhost:3000` (or `http://127.0.0.1:3000`)
- **Fastify API Server**: `http://127.0.0.1:4000`

#### 6. Run External SDK Consumer (Terminal Verification)
In a separate terminal, test the standalone developer SDK querying the live deployment:
```bash
corepack pnpm demo
```
*Outputs the RFC 8785 canonical decision digest and reports `locallyValid: true` and `valid: true`.*

---

### UI Demonstration Walkthrough (What to Click & Show)

Open `http://localhost:3000` (or `https://northtrail-pp.vercel.app`):

1. **Trade Workbench (`/`)**:
   - Notice the green badge `Edge Engine Active` or `API connected`.
   - Enter `2500` in **Trade Amount** and `+5.00%` in **Simulate price shock** → Click **Calculate shock** to demonstrate integer token arithmetic.
   - Click **Request Fresh Quote** to view real-time Uniswap v3 fee-500 quotes with 50 bps slippage bounds.
   - Toggle to **1inch Benchmark** to observe dual-provider comparison.

2. **Curve Atlas (Liquidity Frontier)**:
   - Click **Curve Atlas** in the left sidebar navigation.
   - Drag the slider from `$500` to `$100,000` to demonstrate the trade-size frontier.
   - Point out the **Crossover Intervals**: Uniswap 0.05% wins below \$18.5k, Uniswap 0.30% wins between \$18.5k–\$45k, and 1inch Pathfinder wins above \$45k.
   - Click **Apply Optimal Venue to Workbench**.

3. **Chronos Execution Planner**:
   - Click **Chronos Planner** in the sidebar.
   - Compare **NOW** (immediate), **SPLIT** (staged TWAP), and **WAIT** (volatility cooloff).
   - Change order size to `$50,000` and tranches to `3` to reveal the 95% CVaR tail risk reduction.

4. **Aqua Adaptive Maker Studio (1inch Protocol)**:
   - Click **Aqua Maker** in the sidebar.
   - Show the official 1inch Aqua and SwapVM contract addresses.
   - Demonstrate the **Live Capital Coverage Monitor** (`inspectAquaCoverage`) showing 100% healthy coverage.
   - Click through **Ship Strategy** → **Simulate SwapVM Fill** → **Dock Strategy**.

5. **Universe Risk Explorer**:
   - Click **Universe Explorer** in the sidebar.
   - Select **WETH**, **WBTC**, **DAI**, and **UNI** to display annualized realized vol, EWMA vol, 24h drawdown, and 95% Value-at-Risk.

6. **Cryptographic Decision Trail & Trade Proof**:
   - Return to the Workbench and click **Verify Canonical Digest** on the RFC 8785 payload.
   - Under **Trade Proof**, click **Observe chain receipt** to demonstrate on-chain receipt observation with strict separation from final token settlement.

---

## Current implementation

The repository currently focuses on the mathematical, storage, API and developer-facing foundation.

### Exact financial computation

The domain layer works with integer token units rather than floating-point transaction amounts.

This matters because ERC-20 assets use different decimal precisions, and small numerical errors can become significant when computing allowances, comparing quotes or constructing financial transactions.

Northtrail separates raw financial values from display formatting and validates structured inputs through Zod.

### Multi-provider quote observation

Server-side integrations observe candidate rates from **Uniswap V3 and 1inch v6.1**, with boundary checks and rate limiting.

These adapters are designed to provide comparable market observations without introducing signing authority into the data collection layer.

An observed quote is not automatically an executable transaction, and quotes obtained at different times must not be presented as perfectly equivalent.

### Mathematical scenario analysis

Compass provides a pure calculation layer for exploring risk exposure and comparing net costs across candidate routes.

By keeping this logic separate from the UI and external API calls, calculations can be tested independently and reused across applications.

### Verifiable decision records

Northtrail uses RFC 8785 JSON Canonicalization Scheme (JCS) and SHA-256 hashing to produce deterministic decision-record digests.

Records can be independently checked to detect changes in the recorded parameters.

A digest establishes **record integrity**, not the correctness of a third-party quote or a guarantee that the selected trade was optimal.

### Append-only decision storage

The database layer uses PostgreSQL and PGlite adapters, with immutable decision-lineage protections.

This allows successive revisions to be preserved rather than silently rewriting earlier observations or decisions.

### Developer workspace and SDK

The Next.js workspace provides visual scenario stress-testing and decision verification.

A lightweight TypeScript SDK exposes Northtrail's capabilities for integration into external DeFi applications without tying them to the Northtrail frontend.

**Implementation boundary:** The capabilities above describe the current repository architecture. Live wallet-controlled execution, independent settlement verification, autonomous agents and advanced ML execution planning are part of the broader development direction and should only be marked complete when supported by actual implementation and test evidence.

---

## Architecture

Northtrail uses a pnpm monorepo with clear boundaries between financial computation, provider integrations, persistent evidence and user interfaces.

```text
northtrail/
├── apps/
│   ├── api/                 # Fastify API
│   └── web/                 # Next.js workspace
│
├── packages/
│   ├── domain/              # Financial primitives and schemas
│   ├── config/              # Environment and asset configuration
│   ├── db/                  # Decision storage and migrations
│   ├── compass/             # Scenario and cost analysis
│   └── sdk/                 # Embeddable TypeScript client
│
└── integrations/
    └── ...                  # Server-side protocol observers
```

### Core modules

| Module | Responsibility |
|---|---|
| `packages/domain` | Zod schemas, exact token-unit arithmetic, canonical hashing and state transitions |
| `packages/config` | Strict configuration validation and verified asset registries |
| `packages/db` | PostgreSQL/PGlite adapters, migrations and append-only decision lineage |
| `packages/compass` | Pure mathematical scenario evaluation and route-cost comparison |
| `integrations/*` | Read-only Uniswap and 1inch market observations |
| `apps/api` | Fastify REST API, validation, rate limiting and security boundaries |
| `packages/sdk` | Reusable TypeScript integration layer |
| `apps/web` | Scenario review, financial analysis and decision verification workspace |

The architecture deliberately keeps market observations separate from transaction authorization.

A quote provider can supply information. It cannot independently grant permission to spend a user's funds.

---

## How Northtrail works

Consider a user evaluating a **10,000 USDC → WETH** transaction.

### 1. Observe the market

Northtrail requests supported quotes from its protocol adapters.

Each observation is associated with its provider, requested amount and available context.

### 2. Compare the economics

Compass evaluates the candidate routes using consistent token units and cost assumptions.

The goal is to understand the expected net outcome, rather than simply ranking the largest quoted output without accounting for relevant costs.

### 3. Review the alternatives

The workspace presents competing scenarios and their financial implications.

This gives developers a way to inspect how a different trade amount or route changes the decision.

### 4. Preserve the decision

The selected parameters and relevant evidence are represented as a canonical decision record.

A cryptographic digest allows later verification that the recorded data has not been altered.

### 5. Extend toward verified execution

The execution-assurance architecture is designed to connect the recorded decision with wallet-authorized transaction submission and independently observed settlement.

The intended end state is a single evidence trail connecting what the user expected, what was authorized and what actually happened.

---

## Getting started

### Prerequisites

- Node.js `>= 24.0.0`
- pnpm `12.16.1`, or a compatible version supported by the repository
- A suitable local environment for PGlite, or PostgreSQL for persistent deployments
- Required environment variables for any enabled external integrations

### Installation

Clone the repository:

```bash
git clone https://github.com/rehaan-patil/northtrail.git
cd northtrail
```

Install the pinned dependencies:

```bash
pnpm install --frozen-lockfile
```

Configure the required environment variables according to the project's configuration schema.

Validate the environment:

```bash
pnpm check-env
```

Apply database migrations:

```bash
pnpm db:migrate
```

Start the development environment:

```bash
pnpm dev
```

### Local services

| Service | Default address |
|---|---|
| Web workspace | `http://localhost:3000` |
| Fastify API | `http://localhost:4000` |

These are the intended local development addresses; confirm the actual service output after startup.

The local database uses PGlite where configured, while PostgreSQL is intended for persistent deployments.

---

## Testing and verification

Financial software needs stronger guarantees than a successful UI build.

Northtrail separates domain correctness, API behavior, SDK compatibility and browser functionality into independently testable layers.

| Command | Purpose |
|---|---|
| `pnpm test` | Run Vitest unit and integration tests |
| `pnpm typecheck` | Check TypeScript correctness |
| `pnpm lint` | Validate code quality |
| `pnpm format:check` | Check formatting consistency |
| `pnpm build` | Build workspace packages and applications |
| `pnpm smoke:built` | Validate built artifacts |
| `pnpm smoke:sdk` | Test the SDK package |
| `pnpm test:e2e` | Run Playwright browser tests |

Install Playwright's Chromium browser before running E2E tests if necessary:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

A passing unit test demonstrates the tested behavior under its stated conditions. It does not, by itself, prove that a live blockchain swap has settled or that an external protocol integration is production-ready.

For sensitive execution features, Northtrail's acceptance criteria also include transaction-specific negative tests, correct authorization handling and independently verified on-chain results.

---

## Security philosophy

Northtrail is built around **non-custodial financial control**.

### No private-key custody

Northtrail does not require users to provide private keys or seed phrases.

Financial authorization belongs to the user's wallet or a separately approved, enforceable smart-account policy.

### Read-only market observation

Quote adapters provide market information without obtaining permission to sign transactions.

Financial data collection and spending authorization remain separate systems.

### Deterministic decision integrity

Decision records use `JCS-SHA256-v1` to support independent integrity verification.

The canonicalized record and digest make changes detectable, but they do not establish that an external data source was truthful.

### Exact arithmetic

Transaction amounts, token balances and allowances use precise token-unit representations.

Floating-point rounding must not determine signable financial values.

### Explicit execution boundaries

The execution architecture requires appropriate validation of chain, account, token, spender, recipient, amount, slippage, quote freshness and transaction destination.

Models and external data providers cannot override those restrictions.

### Independent settlement evidence

The intended Trade Proof layer distinguishes a submitted transaction from a confirmed successful transaction and from the actual tokens received.

This is essential for treating the on-chain outcome as evidence rather than simply trusting the quote displayed before signing.

---

## Research and development direction

The longer-term development plan extends Northtrail into a complete quantitative DeFi decision-and-execution platform.

The work is grouped into four priorities.

### Priority 1 — Execution Assurance

Complete the original Compass, Decision Trail, Trade Guard, Trade Proof and Safe Paths lifecycle.

This includes supported wallet-authorized Uniswap execution, transaction-state handling, actual balance-delta verification, approval visibility and actionable failure recovery.

**Goal:** Users should be able to trace a trade from its initial financial reasoning to its independently verified outcome.

### Priority 2 — Quantitative Intelligence

Expand Compass with three major research capabilities.

**Curve Atlas — Liquidity Curve Intelligence**

Analyze real Uniswap liquidity pools across different trade sizes and compare them with supported 1inch Pathfinder routes.

The objective is to understand when a pool's apparent advantage changes because of liquidity depth, fees, gas or price impact.

**Chronos — ML Execution Planning**

Research execution timing using probabilistic cost forecasting, volatility analysis and risk-aware optimization.

Compare immediate execution, staged swaps and delayed execution against strong baselines, including native Uniswap routing and 1inch Pathfinder.

Any claimed improvement must survive out-of-sample testing and realistic cost accounting.

**Historical Market Universe**

Build a reproducible dataset of eligible crypto assets for historical returns, volatility, correlation, liquidity and risk analysis.

Data availability, asset identity, missingness and timestamp validity are first-class requirements.

The objective is broad, trustworthy coverage—not claiming complete historical execution data for every cryptocurrency.

### Priority 3 — Advanced Protocol Integrations

**1inch Aqua / SwapVM**

Develop risk-aware liquidity-provider positions using official Aqua and SwapVM infrastructure, with verifiable actual token movements and inventory-coverage analysis.

**Chainlink CRE**

Use cross-system evidence workflows for on-chain permission and external financial-context review, outside the latency-sensitive quotation path.

**World Agent Pass**

Add human verification for sensitive automated-agent policy actions, while retaining independent wallet authorization and enforceable spending restrictions.

**Agent Mode**

Research bounded, opt-in execution with strict transaction, spending and permission controls. Autonomous execution remains disabled wherever the necessary on-chain enforcement is unverified.

### Priority 4 — Production and Developer Experience

Develop the full platform as a reusable product:

- Original, responsive financial UI/UX.
- Wallet and transaction-review experiences.
- Well-documented TypeScript SDK.
- Independent example application.
- Integration, security and browser tests.
- Model evaluations and reproducible research artifacts.
- CI/CD, monitoring and verified deployment.

The roadmap is deliberately incremental. A smaller working feature with verifiable results is more useful than a large collection of interfaces that appear functional but depend on simulated data.

---

## Design principles

Several decisions guide Northtrail's development.

**Mathematics before marketing.**  
Accurate cost accounting and clear assumptions matter more than impressive but unverified performance figures.

**Models inform; users authorize.**  
ML can help evaluate uncertainty and compare strategies. It cannot independently expand spending permissions.

**Build on existing protocols.**  
Uniswap and 1inch already solve difficult execution problems. Northtrail aims to add understanding, risk awareness and accountability rather than claiming to replace their routing infrastructure.

**Every financial claim needs evidence.**  
Historical simulations, executable quotes and settled transactions must be identified correctly.

**Failures are part of the product.**  
Stale quotes, unavailable providers, rejected signatures and unsupported routes should be handled explicitly rather than hidden behind optimistic UI states.

**Developer usability matters.**  
The SDK should remain useful independently of the Northtrail dashboard.

---

## Technology stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Runtime | Node.js 24+ |
| Workspace | pnpm monorepo |
| Frontend | Next.js |
| Backend | Fastify |
| Validation | Zod |
| Data storage | PostgreSQL / PGlite |
| Testing | Vitest / Playwright |
| Decision integrity | RFC 8785 JCS / SHA-256 |
| Market integrations | Uniswap V3 / 1inch v6.1 |
| Quantitative research | Mathematical scenario engine; Python-based research extensions planned |
| Blockchain integration | EVM-compatible protocol and wallet interfaces |

Versions and supported networks should be checked against the actual installed dependencies and deployed contract configuration.

---

## Project status and transparency

Northtrail is under active development.

The currently described repository provides the core financial-domain, decision-record, quote-observation, mathematical-analysis, API, SDK and developer-workspace foundations.

Additional execution-assurance, machine-learning, liquidity-position and automation capabilities are part of the ongoing implementation roadmap.

Features should be described according to actual evidence—not simply their presence in an architecture document or a UI mockup.

The project does not guarantee profitable trades, universally optimal prices, complete protection from MEV, or that historical forecasts will remain reliable under future market conditions.

---

## Contributing

Northtrail sits at the intersection of DeFi infrastructure, quantitative finance, software security and developer tooling.

Contributions are especially useful in financial arithmetic, protocol integration, reproducible quantitative research, API reliability, accessibility, testing and transaction-verification methodology.

Before making changes, review the relevant domain contracts and run the applicable checks. Financial logic should include tests for edge cases, invalid inputs and failure conditions.

Issues and technically grounded proposals can be discussed through the GitHub repository.

---

## Project philosophy

The DeFi ecosystem has made trading increasingly accessible. Understanding execution quality and preserving financial accountability should be just as accessible.

Northtrail is an attempt to make that process more transparent, measurable and reusable—without taking control away from the wallet owner.

**Know the choice. Prove the outcome.**

*Built around precise financial computation, verifiable decisions and responsible DeFi engineering.*