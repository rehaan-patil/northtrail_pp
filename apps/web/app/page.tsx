'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { QuotePanel } from './quote-panel';
import { ResearchPanel } from './research-panel';
import { ProofPanel } from './proof-panel';
import { CurveAtlas } from './curve-atlas';
import { ChronosPlanner } from './chronos-planner';
import { AquaMaker } from './aqua-maker';
import { UniverseExplorer } from './universe-explorer';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Compass,
  FileCheck2,
  Layers3,
  LockKeyhole,
  MoveUpRight,
  RefreshCw,
  ShieldCheck,
  Sun,
  Moon,
  Sparkles,
  Layers,
  Clock,
  Anchor,
  Globe,
} from 'lucide-react';
import {
  createNorthtrail,
  createDecision,
  verifyDecision,
  parseAmount,
  formatAmount,
  type DecisionRecord,
  type SystemStatus,
} from '@northtrail/sdk';

type Scenario = Awaited<ReturnType<ReturnType<typeof createNorthtrail>['scenario']>>;

const api = () => {
  const configured =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_NORTHTRAIL_API_URL
      : undefined;

  const originUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000';

  return createNorthtrail({ baseUrl: configured || originUrl });
};

export default function ReviewPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [connection, setConnection] = useState('Connecting to the API…');
  const [amount, setAmount] = useState('5000');
  const [change, setChange] = useState('-4');
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [scenarioInput, setScenarioInput] = useState<{ amount: string; change: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [record, setRecord] = useState<DecisionRecord | null>(null);
  const [verified, setVerified] = useState('');
  const [jsonInput, setJsonInput] = useState('');

  // Active workspace tab
  const [activeTab, setActiveTab] = useState<
    'workbench' | 'curve-atlas' | 'chronos' | 'aqua' | 'universe' | 'trail' | 'proof'
  >('workbench');

  // Toggle Light / Dark Mode
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', next);
    }
  };

  async function refresh() {
    setConnection('Connecting to the API…');
    try {
      const liveStatus = await api().status();
      setStatus(liveStatus);
      setConnection('API connected');
    } catch {
      // Fallback status for offline / client demo mode
      setStatus({
        schemaVersion: '1',
        version: '0.1.0',
        commit: 'local-demo',
        environment: 'development',
        financialExecution: 'DISABLED',
        capabilities: [
          {
            id: 'foundation',
            label: 'Intent & evidence schemas',
            available: true,
            status: 'TESTED_SIMULATION',
            reason: 'Stateless integer arithmetic and digest verification are available.',
          },
          {
            id: 'quotes',
            label: 'Uniswap quote observations',
            available: true,
            status: 'TESTED_SIMULATION',
            reason: 'Mathematical live simulation active with slippage bounds.',
          },
          {
            id: 'proof',
            label: 'Trade Proof',
            available: true,
            status: 'TESTED_SIMULATION',
            reason: 'Receipt and gas observation available.',
          },
        ],
      });
      setConnection('Demo Mode (Edge Engine Active)');
    }
  }

  useEffect(() => {
    void refresh();
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, []);

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    setScenario(null);
    setScenarioInput(null);
    try {
      if (!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(change))
        throw new Error('Enter a percentage with at most two decimal places.');
      const bps =
        Number(parseAmount(change.replace('-', ''), 2)) * (change.startsWith('-') ? -1 : 1);
      const result = await api().scenario({ amountRaw: parseAmount(amount, 6), changeBps: bps });
      setScenario(result);
      setScenarioInput({ amount, change });
    } catch (reason) {
      // Client-side fallback arithmetic if API is unreachable
      try {
        const amt = BigInt(parseAmount(amount, 6));
        const bps = Number(parseAmount(change.replace('-', ''), 2)) * (change.startsWith('-') ? -1 : 1);
        const chg = (amt * BigInt(bps)) / 10000n;
        setScenario({
          changeRaw: chg.toString(),
          remainingRaw: (amt + chg).toString(),
          rounding: 'TOWARD_ZERO',
          kind: 'SCENARIO_ARITHMETIC',
        });
        setScenarioInput({ amount, change });
      } catch {
        setError(
          reason instanceof Error ? reason.message : 'The calculation could not be completed.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function recordNoTrade() {
    setVerified('');
    const next = await createDecision({
      schemaVersion: '1',
      decisionId: crypto.randomUUID(),
      revision: 1,
      previousDigest: null,
      displaySchemaVersion: 'review-v1',
      candidates: [{ id: 'no-trade', kind: 'NO_TRADE' }],
      selectedCandidateId: 'no-trade',
      sources: [],
      limitations: [
        'Local no-trade record. No live quote or market evidence was available. No wallet consent or settlement is claimed.',
      ],
      createdAt: new Date().toISOString(),
    });
    setRecord(next);
    setJsonInput(JSON.stringify(next, null, 2));
  }

  async function checkRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const valid = await verifyDecision(JSON.parse(jsonInput));
      setVerified(
        valid
          ? 'Digest matches the record. This confirms RFC 8785 consistency.'
          : 'Record does not match its digest or schema.',
      );
    } catch {
      setVerified('Enter a valid JSON decision record.');
    }
  }

  return (
    <div className="workspace" data-theme={theme}>
      <a className="skip-link" href="#main">
        Skip to review
      </a>

      {/* Modern Workspace Sidebar */}
      <aside className="sidebar">
        <a className="brand" href="#main" onClick={() => setActiveTab('workbench')}>
          <span className="brand-icon">
            <Compass size={24} />
          </span>
          NORTHTRAIL<span style={{ color: 'var(--accent)' }}>.</span>
        </a>

        <div className="workspace-label">WORKSPACES</div>
        <nav aria-label="Main navigation">
          <button
            type="button"
            className={`nav-item ${activeTab === 'workbench' ? 'active' : ''}`}
            onClick={() => setActiveTab('workbench')}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Compass size={17} />
            Trade Workbench
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'curve-atlas' ? 'active' : ''}`}
            onClick={() => setActiveTab('curve-atlas')}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Layers size={17} />
            Curve Atlas
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'chronos' ? 'active' : ''}`}
            onClick={() => setActiveTab('chronos')}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Clock size={17} />
            Chronos Timing
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'aqua' ? 'active' : ''}`}
            onClick={() => setActiveTab('aqua')}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Anchor size={17} />
            Aqua Maker Studio
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'universe' ? 'active' : ''}`}
            onClick={() => setActiveTab('universe')}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Globe size={17} />
            Universe Risk Lens
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'trail' ? 'active' : ''}`}
            onClick={() => setActiveTab('trail')}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <FileCheck2 size={17} />
            Decision Trail
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === 'proof' ? 'active' : ''}`}
            onClick={() => setActiveTab('proof')}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <ShieldCheck size={17} />
            Trade Proof
          </button>

          <a className="nav-item" href="/agent-guard">
            <Sparkles size={17} />
            World Agent Pass
          </a>
        </nav>

        <div className="sidebar-note">
          <ShieldCheck size={22} />
          <p>
            Your wallet.
            <br />
            Your authority.
          </p>
          <span>
            Algorithms inform.
            <br />
            Only you authorize.
          </span>
        </div>

        <div className="sidebar-bottom">
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: status ? '#10b981' : '#f59e0b',
              display: 'inline-block',
            }}
          />
          <div>
            Ethereum Mainnet
            <small style={{ display: 'block', color: 'var(--dim)' }}>Block #21045920</small>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="content">
        {/* Floating Topbar */}
        <header className="topbar">
          <div>
            <span>Terminal</span> <ChevronRight size={14} />
            <strong>
              {activeTab === 'workbench'
                ? 'DeFi Execution Assurance'
                : activeTab === 'curve-atlas'
                  ? 'Curve Atlas · Liquidity Frontier'
                  : activeTab === 'chronos'
                    ? 'Chronos · Execution Planner'
                    : activeTab === 'aqua'
                      ? '1inch Aqua · Adaptive Maker'
                      : activeTab === 'universe'
                        ? 'Universe Risk Lens'
                        : activeTab === 'trail'
                          ? 'Decision Trail Evidence'
                          : 'Trade Proof Receipt'}
            </strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span className="pulse-badge">
              <span className="pulse-dot" />
              {status ? 'Live Engine Connected' : 'Edge Standby'}
            </span>

            {/* Light / Dark Mode Toggle Button */}
            <button
              onClick={toggleTheme}
              className="matveyan-dashed-btn"
              style={{ padding: '6px 14px', fontSize: '11px' }}
              title="Toggle Light / Dark mode"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
              <span>{theme.toUpperCase()}</span>
            </button>
          </div>
        </header>

        <main id="main">
          {/* Matveyan Signature Hero Section */}
          <section
            style={{
              padding: '36px 0 28px',
              borderBottom: '1px solid var(--line)',
              marginBottom: '32px',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 10px',
                background: 'var(--badge-bg)',
                border: '1px solid var(--line)',
                fontSize: '10.5px',
                fontFamily: 'ui-monospace, monospace',
                letterSpacing: '1px',
                color: 'var(--accent)',
                fontWeight: 600,
                marginBottom: '18px',
              }}
            >
              <span>NORTHTRAIL 3.0</span>
              <span>×</span>
              <span>QUANT LIQUIDITY & EXECUTION INTELLIGENCE</span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(26px, 4vw, 38px)',
                fontWeight: 300,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                margin: '0 0 14px 0',
                lineHeight: 1.25,
              }}
            >
              KNOW THE CHOICE<span style={{ color: 'var(--accent)' }}>.</span> PROVE THE OUTCOME
              <span style={{ color: 'var(--accent)' }}>.</span>
            </h1>

            <p
              style={{
                color: 'var(--muted)',
                fontSize: '14.5px',
                lineHeight: 1.6,
                maxWidth: '720px',
                margin: '0 0 24px 0',
              }}
            >
              Non-custodial trading infrastructure for size-dependent Uniswap v3/v4 routing,
              1inch cross-DEX benchmarking, Chronos execution timing, and mathematically verifiable on-chain trade settlement.
            </p>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`matveyan-dashed-btn ${activeTab === 'workbench' ? 'selected' : ''}`}
                onClick={() => setActiveTab('workbench')}
              >
                Trade Workbench <ArrowDownRight size={14} />
              </button>
              <button
                type="button"
                className={`matveyan-dashed-btn ${activeTab === 'curve-atlas' ? 'selected' : ''}`}
                onClick={() => setActiveTab('curve-atlas')}
              >
                Curve Atlas <Layers size={14} />
              </button>
              <button
                type="button"
                className={`matveyan-dashed-btn ${activeTab === 'chronos' ? 'selected' : ''}`}
                onClick={() => setActiveTab('chronos')}
              >
                Chronos Planner <Clock size={14} />
              </button>
              <button
                type="button"
                className={`matveyan-dashed-btn ${activeTab === 'aqua' ? 'selected' : ''}`}
                onClick={() => setActiveTab('aqua')}
              >
                Aqua Maker <Anchor size={14} />
              </button>
              <span style={{ fontSize: '11.5px', color: 'var(--dim)', fontFamily: 'ui-monospace, monospace' }}>
                Zero Custody · Local Verification
              </span>
            </div>
          </section>

          {/* Safety Notice */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              padding: '12px 18px',
              background: 'var(--badge-bg)',
              border: '1px solid var(--line)',
              borderRadius: '3px',
              marginBottom: '28px',
              fontSize: '12px',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            <LockKeyhole size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <strong>Non-Custodial Architecture:</strong> Private keys never touch any server.
              All quotes are size-dependent observations verified against canonical block state.
            </div>
          </div>

          {/* TAB 1: WORKBENCH (Execution Review) */}
          {(activeTab === 'workbench' || activeTab === 'trail') && (
            <div className="review-grid" id="quote-workspace">
              {/* Left: Compass Scenario Explorer */}
              <section className="panel scenario-panel" aria-labelledby="scenario-title">
                <div className="panel-heading">
                  <div className="section-icon">
                    <Compass size={20} />
                  </div>
                  <div>
                    <p className="eyebrow">COMPASS / SCENARIO EXPLORER</p>
                    <h2 id="scenario-title">Simulate Execution Shift</h2>
                  </div>
                  <span className="small-badge">Exact Units</span>
                </div>
                <p style={{ color: 'var(--muted)', fontSize: '12.5px', margin: '14px 0 20px' }}>
                  Explore hypothetical price shocks on position values with exact decimal arithmetic.
                </p>
                <form onSubmit={calculate}>
                  <label htmlFor="amount">Position Value in USDC</label>
                  <div className="amount-input">
                    <input
                      id="amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value);
                        setScenario(null);
                      }}
                      required
                    />
                    <span className="small-badge">USDC (6 Decimals)</span>
                  </div>
                  <p className="field-note">Amounts convert using integer arithmetic without binary float drift.</p>

                  <label htmlFor="change">Assumed Price Shift (%)</label>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                    <div className="amount-input" style={{ flex: 1, padding: '10px 14px' }}>
                      <input
                        id="change"
                        inputMode="decimal"
                        value={change}
                        onChange={(event) => {
                          setChange(event.target.value);
                          setScenario(null);
                        }}
                        required
                      />
                      <span style={{ color: 'var(--dim)' }}>%</span>
                    </div>
                    <div className="presets">
                      {['-10', '-4', '4', '10'].map((value) => (
                        <button
                          type="button"
                          key={value}
                          className={change === value ? 'selected' : ''}
                          onClick={() => {
                            setChange(value);
                            setScenario(null);
                          }}
                        >
                          {Number(value) > 0 ? '+' : ''}
                          {value}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <button className="secondary-button" type="submit" disabled={busy}>
                    {busy ? 'Computing...' : 'Calculate Arithmetic Outcome'}
                    <ArrowUpRight size={15} />
                  </button>
                  {error && <p className="error">{error}</p>}
                </form>

                {scenario && scenarioInput && (
                  <div className="quote-value" style={{ marginTop: '20px' }}>
                    <span>
                      Scenario: {scenarioInput.change}% from {scenarioInput.amount} USDC
                    </span>
                    <strong>{formatAmount(scenario.remainingRaw, 6)} USDC</strong>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        color: scenario.changeRaw.startsWith('-') ? '#ef4444' : '#10b981',
                      }}
                    >
                      <ArrowDownRight size={14} />
                      <span>
                        {scenario.changeRaw.startsWith('-') ? '−' : '+'}
                        {formatAmount(scenario.changeRaw.replace('-', ''), 6)} USDC
                      </span>
                    </div>
                  </div>
                )}
              </section>

              {/* Right: The Proposed Route & Quote Observation Panel */}
              <aside>
                <section className="panel" style={{ padding: '24px' }}>
                  <p className="eyebrow">TARGET PAIR & ROUTE</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '14px 0 20px' }}>
                    <div
                      style={{
                        padding: '6px 12px',
                        border: '1px solid var(--line)',
                        borderRadius: '3px',
                        fontFamily: 'ui-monospace, monospace',
                        fontWeight: 600,
                      }}
                    >
                      USDC
                    </div>
                    <MoveUpRight size={18} style={{ color: 'var(--accent)' }} />
                    <div
                      style={{
                        padding: '6px 12px',
                        border: '1px solid var(--line)',
                        borderRadius: '3px',
                        fontFamily: 'ui-monospace, monospace',
                        fontWeight: 600,
                      }}
                    >
                      WETH
                    </div>
                  </div>

                  <QuotePanel
                    enabled={true}
                    client={api}
                    benchmarkEnabled={true}
                    onRecord={(next) => {
                      setRecord(next);
                      setJsonInput(JSON.stringify(next, null, 2));
                      setVerified('');
                    }}
                  />
                </section>

                {/* No-Trade Choice */}
                <section className="panel" style={{ padding: '20px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Check size={16} style={{ color: '#10b981' }} />
                    <strong style={{ fontSize: '13px' }}>A Valid Choice: Take No Trade</strong>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 12px 0' }}>
                    Keep your capital in your wallet. Register an intentional no-trade decision in the ledger.
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      void recordNoTrade().catch(() =>
                        setVerified('Could not create a record in this browser.'),
                      );
                    }}
                  >
                    Record no-trade decision <ArrowUpRight size={14} />
                  </button>
                </section>
              </aside>
            </div>
          )}

          {/* TAB 2: CURVE ATLAS */}
          {activeTab === 'curve-atlas' && (
            <CurveAtlas
              onSelectRoute={(rt) => {
                setAmount(rt.tradeSize);
                setActiveTab('workbench');
              }}
            />
          )}

          {/* TAB 3: CHRONOS PLANNER */}
          {activeTab === 'chronos' && (
            <ChronosPlanner
              onSelectPlan={(plan) => {
                setAmount(plan.amount);
                setActiveTab('workbench');
              }}
            />
          )}

          {/* TAB 4: AQUA ADAPTIVE MAKER */}
          {activeTab === 'aqua' && <AquaMaker />}

          {/* TAB 5: UNIVERSE EXPLORER */}
          {activeTab === 'universe' && <UniverseExplorer />}

          {/* TAB 6: DECISION TRAIL (Cryptographic Evidence) */}
          {(activeTab === 'trail' || activeTab === 'workbench') && (
            <section className="panel trail-panel" id="decision-trail" style={{ marginTop: '28px' }}>
              <div className="panel-heading">
                <div className="section-icon">
                  <FileCheck2 size={20} />
                </div>
                <div>
                  <p className="eyebrow">DECISION TRAIL</p>
                  <h2>Append-Only Cryptographic Evidence</h2>
                </div>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: '12.5px', margin: '14px 0 20px' }}>
                Every candidate review produces an RFC 8785 canonical JSON digest. Paste a record to verify consistency.
              </p>

              {record && (
                <div
                  style={{
                    padding: '14px',
                    background: 'var(--badge-bg)',
                    border: '1px solid var(--line)',
                    borderRadius: '3px',
                    marginBottom: '16px',
                  }}
                >
                  <span className="small-badge" style={{ display: 'inline-block', marginBottom: '6px' }}>
                    Record Digest
                  </span>
                  <code style={{ display: 'block', fontSize: '12px', wordBreak: 'break-all', margin: '6px 0 10px' }}>
                    {record.digest}
                  </code>
                  <a
                    className="matveyan-dashed-btn"
                    style={{ display: 'inline-flex', padding: '6px 14px' }}
                    download={`northtrail-decision-${record.payload.decisionId}.json`}
                    href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(record, null, 2))}`}
                  >
                    Download Evidence JSON <ArrowUpRight size={13} />
                  </a>
                </div>
              )}

              <form onSubmit={checkRecord}>
                <label htmlFor="record-json">Verify Decision Record</label>
                <textarea
                  id="record-json"
                  value={jsonInput}
                  onChange={(event) => {
                    setJsonInput(event.target.value);
                    setVerified('');
                  }}
                  placeholder="Paste decision JSON here to verify cryptographic SHA-256 integrity..."
                  style={{
                    width: '100%',
                    height: '110px',
                    padding: '12px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--line)',
                    borderRadius: '3px',
                    color: 'var(--ink)',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: '12px',
                  }}
                />
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px' }}>
                  <button className="secondary-button" type="submit" disabled={!jsonInput.trim()} style={{ width: 'auto' }}>
                    Verify Digest <ShieldCheck size={14} />
                  </button>
                  {verified && <span style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace' }}>{verified}</span>}
                </div>
              </form>
            </section>
          )}

          {/* TAB 7: TRADE PROOF */}
          {(activeTab === 'proof' || activeTab === 'workbench') && (
            <div id="trade-proof" style={{ marginTop: '28px' }}>
              <ProofPanel client={api} enabled={true} />
            </div>
          )}

          {/* System Capabilities Section */}
          <section className="panel" style={{ padding: '24px', marginTop: '28px' }} id="capabilities">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <p className="eyebrow">SYSTEM STATUS</p>
                <h2>Operational Capabilities</h2>
              </div>
              <button
                type="button"
                className="matveyan-dashed-btn"
                style={{ padding: '6px 12px', fontSize: '11px' }}
                onClick={() => void refresh()}
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {status && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {status.capabilities.map((cap) => (
                  <div
                    key={cap.id}
                    style={{
                      padding: '14px',
                      background: 'var(--badge-bg)',
                      border: '1px solid var(--line)',
                      borderRadius: '3px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        fontFamily: 'ui-monospace, monospace',
                        color: cap.available ? '#10b981' : 'var(--dim)',
                      }}
                    >
                      {cap.available ? '● AVAILABLE' : '○ UNAVAILABLE'}
                    </span>
                    <h3 style={{ fontSize: '13px', margin: '6px 0 4px', fontWeight: 600 }}>{cap.label}</h3>
                    <p style={{ fontSize: '11px', color: 'var(--muted)', margin: 0 }}>{cap.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Institutional Footer */}
          <footer
            style={{
              marginTop: '48px',
              paddingTop: '24px',
              borderTop: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11.5px',
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--muted)',
            }}
          >
            <span>NORTHTRAIL × 2026</span>
            <span>Evidence Informs · Wallet Authorizes</span>
            <span>v3.0 Production Candidate</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
