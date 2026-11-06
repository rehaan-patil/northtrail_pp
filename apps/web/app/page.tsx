'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { QuotePanel } from './quote-panel';
import { ResearchPanel } from './research-panel';
import { ProofPanel } from './proof-panel';
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
  const configured = process.env.NEXT_PUBLIC_API_URL;
  const local =
    typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!configured && !local) throw new Error('API is not configured for this preview.');
  return createNorthtrail({ baseUrl: configured || 'http://localhost:4000' });
};

export default function ReviewPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [connection, setConnection] = useState('Connecting to the API…');
  const [amount, setAmount] = useState('5000');
  const [change, setChange] = useState('-4');
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [scenarioInput, setScenarioInput] = useState<{ amount: string; change: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [record, setRecord] = useState<DecisionRecord | null>(null);
  const [verified, setVerified] = useState('');
  const [jsonInput, setJsonInput] = useState('');

  async function refresh() {
    setConnection('Connecting to the API…');
    try {
      setStatus(await api().status());
      setConnection('API connected');
    } catch {
      setStatus(null);
      setConnection('API unavailable. Start the Northtrail API to use the calculator.');
    }
  }
  useEffect(() => {
    void refresh();
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
      setError(
        reason instanceof Error ? reason.message : 'The calculation could not be completed.',
      );
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
          ? 'Digest matches the record. This confirms consistency only.'
          : 'Record does not match its digest or schema.',
      );
    } catch {
      setVerified('Enter a valid JSON decision record.');
    }
  }

  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to review
      </a>
      <aside className="sidebar">
        <a className="brand" href="#main">
          <span className="brand-icon">
            <Compass size={25} />
          </span>
          northtrail<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <a className="nav-item active" href="#main">
            <Compass size={18} />
            Review<span>01</span>
          </a>
          <a className="nav-item" href="#decision-trail">
            <FileCheck2 size={18} />
            Decision trail
          </a>
          <a className="nav-item" href="#capabilities">
            <Layers3 size={18} />
            Capabilities
          </a>
          <a className="nav-item" href="#research">
            <Layers3 size={18} />
            Research
          </a>
          <a className="nav-item" href="#trade-proof">
            <ShieldCheck size={18} />
            Receipt observation
          </a>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={24} />
          <p>
            Your wallet.
            <br />
            Your authority.
          </p>
          <span>
            Analysis can inform a decision.
            <br />
            Only you can authorize a trade.
          </span>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">N</span>
          <div>
            Developer workspace<small>Foundation preview</small>
          </div>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <div>
            Workspace <ChevronRight size={14} />
            <strong>Trade review</strong>
          </div>
          <span className="preview-pill">
            <span />
            Execution disabled
          </span>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">KNOW THE CHOICE. PROVE THE OUTCOME.</p>
              <h1>Before your next move.</h1>
              <p className="lead">Understand the exposure. Keep a record of the choice.</p>
            </div>
            <span className="network">
              <span className="eth-symbol">◇</span>Ethereum
              <span className="muted"> / Mainnet candidate</span>
            </span>
          </div>

          <div className="notice">
            <LockKeyhole size={18} />
            <div>
              <strong>A foundation you can inspect.</strong> Read-only quotes require configured
              provider access. Wallet signing and chain proofs are not available yet. The tools
              below cannot move funds.
            </div>
          </div>

          <div className="review-grid">
            <section className="panel scenario-panel" aria-labelledby="scenario-title">
              <div className="panel-heading">
                <div className="section-icon">
                  <Compass size={21} />
                </div>
                <div>
                  <p className="eyebrow">COMPASS / SCENARIO EXPLORER</p>
                  <h2 id="scenario-title">What would a change mean?</h2>
                </div>
                <span className="small-badge">Arithmetic only</span>
              </div>
              <p className="section-description">
                Explore a hypothetical position value. This is a scenario you choose, with no market
                data, forecast, fees, or executable quote.
              </p>
              <form onSubmit={calculate}>
                <label htmlFor="amount">Hypothetical position value</label>
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
                    aria-describedby="units-help"
                  />
                  <span className="asset">
                    <span>＄</span>USDC units
                  </span>
                </div>
                <p className="field-note" id="units-help">
                  6 decimal places. USDC units are not a verified USD price.
                </p>
                <label htmlFor="change">Assumed change</label>
                <div className="change-row">
                  <div className="percent-input">
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
                    <span>%</span>
                  </div>
                  <div className="presets" aria-label="Scenario presets">
                    {['-10', '-4', '4'].map((value) => (
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
                <button className="primary-button" type="submit" disabled={busy || !status}>
                  {busy ? 'Calculating…' : 'Calculate scenario'}
                  <ArrowUpRight size={18} />
                </button>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
              </form>
              <div className="scenario-result" aria-live="polite">
                {scenario && scenarioInput ? (
                  <>
                    <div>
                      <span>
                        At {scenarioInput.change}% from {scenarioInput.amount} USDC units
                      </span>
                      <strong>
                        {formatAmount(scenario.remainingRaw, 6)} <small>USDC units</small>
                      </strong>
                    </div>
                    <div className="scenario-delta">
                      <ArrowDownRight size={18} />
                      <span>
                        {scenario.changeRaw.startsWith('-') ? '−' : '+'}
                        {formatAmount(scenario.changeRaw.replace('-', ''), 6)} units
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="empty-result">
                    <span className="result-line" />
                    <p>
                      Your scenario will appear here.
                      <small>Results use exact integer arithmetic.</small>
                    </p>
                  </div>
                )}
              </div>
            </section>

            <aside className="right-column">
              <section className="panel route-panel">
                <p className="eyebrow">THE PROPOSED ROUTE</p>
                <div className="token-route">
                  <span className="token usdc">$</span>
                  <div>
                    <strong>USDC</strong>
                    <small>You would spend</small>
                  </div>
                  <MoveUpRight className="route-arrow" size={22} />
                  <span className="token weth">◇</span>
                  <div>
                    <strong>WETH</strong>
                    <small>Wrapped Ether</small>
                  </div>
                </div>
                <div className="route-detail">
                  <span>Network</span>
                  <strong>Ethereum</strong>
                </div>
                <QuotePanel
                  enabled={
                    status?.capabilities.some(
                      (capability) => capability.id === 'quotes' && capability.available,
                    ) ?? false
                  }
                  client={api}
                  benchmarkEnabled={
                    status?.capabilities.some(
                      (capability) => capability.id === 'benchmark' && capability.available,
                    ) ?? false
                  }
                  onRecord={(next) => {
                    setRecord(next);
                    setJsonInput(JSON.stringify(next, null, 2));
                    setVerified('');
                  }}
                />
                <div className="route-detail">
                  <span>Wallet authorization</span>
                  <strong className="muted">Not requested</strong>
                </div>
                <p className="route-footnote">
                  Token addresses are registry entries. On-chain identity and the supported
                  execution route still need verification.
                </p>
              </section>
              <section className="choice-panel">
                <span className="choice-icon">
                  <Check size={20} />
                </span>
                <p className="eyebrow">A VALID CHOICE, TOO</p>
                <h2>Take no trade.</h2>
                <p>
                  Keep your funds where they are. You can record that choice locally without
                  connecting a wallet.
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
                  Record no-trade choice <ArrowUpRight size={17} />
                </button>
                <span className="local-note">
                  Stored in this tab only · export below to keep it
                </span>
              </section>
            </aside>
          </div>

          <section className="panel trail-panel" id="decision-trail" aria-labelledby="trail-title">
            <div className="panel-heading">
              <div className="section-icon">
                <FileCheck2 size={21} />
              </div>
              <div>
                <p className="eyebrow">DECISION TRAIL</p>
                <h2 id="trail-title">A choice you can reconstruct.</h2>
              </div>
            </div>
            <p className="section-description">
              Export a local no-trade record or paste a record to check its digest. A matching
              digest establishes consistency, not source truth, consent, or settlement.
            </p>
            {record && (
              <div className="record-summary">
                <span className="record-state">
                  <Check size={15} />
                  {record.payload.candidates.find(
                    (candidate) => candidate.id === record.payload.selectedCandidateId,
                  )?.kind === 'TRADE'
                    ? 'Quote review recorded'
                    : 'No-trade choice recorded'}
                </span>
                <code>{record.digest}</code>
                <a
                  className="secondary-button"
                  download={`northtrail-decision-${record.payload.decisionId}.json`}
                  href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(record, null, 2))}`}
                >
                  Export JSON <ArrowUpRight size={15} />
                </a>
              </div>
            )}
            <form onSubmit={checkRecord}>
              <label htmlFor="record-json">Decision record JSON</label>
              <textarea
                id="record-json"
                value={jsonInput}
                onChange={(event) => {
                  setJsonInput(event.target.value);
                  setVerified('');
                }}
                placeholder="Create a no-trade record above, or paste an existing record."
                spellCheck={false}
                maxLength={65536}
              />
              <div className="verify-row">
                <button className="secondary-button" type="submit" disabled={!jsonInput.trim()}>
                  Verify digest <ShieldCheck size={16} />
                </button>
                <p role="status">{verified}</p>
              </div>
            </form>
          </section>

          <ResearchPanel client={api} enabled={status !== null} />
          <ProofPanel
            client={api}
            enabled={
              status?.capabilities.some(
                (capability) => capability.id === 'proof' && capability.available,
              ) ?? false
            }
          />
          <section className="capabilities" id="capabilities" aria-labelledby="capabilities-title">
            <div className="capability-heading">
              <div>
                <p className="eyebrow">BUILT ON EVIDENCE</p>
                <h2 id="capabilities-title">Capability status</h2>
              </div>
              <button
                type="button"
                className="refresh-button"
                onClick={() => {
                  void refresh();
                }}
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>
            <p className="connection" role="status">
              <span className={status ? 'connected' : ''} />
              {connection}
            </p>
            {status && (
              <div className="capability-grid">
                {status.capabilities.map((capability) => (
                  <article key={capability.id}>
                    <span
                      className={
                        capability.available ? 'capability-state available' : 'capability-state'
                      }
                    >
                      {capability.available ? 'Available locally' : 'Not available'}
                    </span>
                    <h3>{capability.label}</h3>
                    <p>{capability.reason}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
          <footer>
            <span>
              northtrail<span className="brand-dot">.</span>
            </span>
            <p>Evidence informs. Your wallet authorizes.</p>
            <span>Developer preview / v0.1</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
