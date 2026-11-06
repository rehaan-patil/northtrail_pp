'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { QuotePanel } from './quote-panel';
import { ResearchPanel } from './research-panel';
import { ProofPanel } from './proof-panel';
import ThemeToggle from './theme-toggle';

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

type Scenario = Awaited<
  ReturnType<ReturnType<typeof createNorthtrail>['scenario']>
>;

const api = () => {
  const configured = process.env.NEXT_PUBLIC_API_URL;

  const local =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);

  if (!configured && !local) {
    throw new Error('API is not configured for this preview.');
  }

  return createNorthtrail({
    baseUrl: configured || 'http://localhost:4000',
  });
};

export default function ReviewPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [connection, setConnection] = useState('Connecting to the API…');

  const [amount, setAmount] = useState('5000');
  const [change, setChange] = useState('-4');

  const [scenario, setScenario] = useState<Scenario | null>(null);

  const [scenarioInput, setScenarioInput] = useState<{
    amount: string;
    change: string;
  } | null>(null);

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
      setConnection(
        'API unavailable. Start the Northtrail API to use the calculator.'
      );
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
      if (!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(change)) {
        throw new Error(
          'Enter a percentage with at most two decimal places.'
        );
      }

      const bps =
        Number(parseAmount(change.replace('-', ''), 2)) *
        (change.startsWith('-') ? -1 : 1);

      const result = await api().scenario({
        amountRaw: parseAmount(amount, 6),
        changeBps: bps,
      });

      setScenario(result);
      setScenarioInput({ amount, change });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The calculation could not be completed.'
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
      candidates: [
        { id: 'no-trade', kind: 'NO_TRADE' },
      ],
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
          : 'Record does not match its digest or schema.'
      );
    } catch {
      setVerified('Enter a valid JSON decision record.');
    }
  }

  const quotesEnabled =
    status?.capabilities.some(
      (capability) =>
        capability.id === 'quotes' && capability.available
    ) ?? false;

  const benchmarkEnabled =
    status?.capabilities.some(
      (capability) =>
        capability.id === 'benchmark' && capability.available
    ) ?? false;

  const proofEnabled =
    status?.capabilities.some(
      (capability) =>
        capability.id === 'proof' && capability.available
    ) ?? false;

  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to review
      </a>

      <aside className="sidebar">
        <a className="brand" href="#main">
          <span className="brand-icon">
            <Compass size={22} />
          </span>
          northtrail<span className="brand-dot">.</span>
        </a>

        <div className="workspace-label">
          WORKSPACE
        </div>

        <nav aria-label="Main navigation">
          <a className="nav-item active" href="#main">
            <Compass size={17} />
            Review
            <span>01</span>
          </a>

          <a className="nav-item" href="#quote-section">
            <MoveUpRight size={17} />
            Quotes
          </a>

          <a className="nav-item" href="#decision-trail">
            <FileCheck2 size={17} />
            Decision trail
          </a>

          <a className="nav-item" href="#research">
            <Layers3 size={17} />
            Research
          </a>

          <a className="nav-item" href="#trade-proof">
            <ShieldCheck size={17} />
            Trade proof
          </a>

          <a className="nav-item" href="#capabilities">
            <Layers3 size={17} />
            Capabilities
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
            Analysis can inform a decision.
            <br />
            Only you can authorize a trade.
          </span>
        </div>

        <div className="sidebar-bottom">
          <span className="avatar">N</span>

          <div>
            Developer workspace
            <small>Foundation preview</small>
          </div>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <strong>Trade review</strong>
          </div>

          <div className="topbar-actions">
            <span className="preview-pill">
              <span />
              Execution disabled
            </span>

            <ThemeToggle />
          </div>
        </header>

        <main id="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                WORKSPACE / TRADE REVIEW
              </p>

              <h1>Trade review</h1>

              <p className="lead">
                Compare provider observations, test a position
                scenario, and preserve the evidence behind your decision.
              </p>
            </div>

            <span className="network">
              <span className="eth-symbol">◇</span>
              Ethereum
              <span className="muted">
                / Mainnet candidate
              </span>
            </span>
          </div>

          <div className="notice">
            <LockKeyhole size={17} />

            <div>
              <strong>Execution is currently disabled.</strong>
              {' '}Read-only quotes require configured provider access.
              Wallet signing and chain proofs are not available yet.
              These tools cannot move funds.
            </div>
          </div>

          <div className="review-grid">
            <section
              className="panel scenario-panel"
              aria-labelledby="scenario-title"
              id="compass-scenario"
            >
              <div className="panel-heading">
                <div className="section-icon">
                  <Compass size={19} />
                </div>

                <div>
                  <p className="eyebrow">
                    COMPASS / SCENARIO EXPLORER
                  </p>

                  <h2 id="scenario-title">
                    Position scenario
                  </h2>
                </div>

                <span className="small-badge">
                  Arithmetic only
                </span>
              </div>

              <p className="section-description">
                Explore a hypothetical position value.
                No market data, forecasts, fees or executable quote
                are used in this calculation.
              </p>

              <form onSubmit={calculate}>
                <label htmlFor="amount">
                  Hypothetical position value
                </label>

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
                    <span>＄</span>
                    USDC units
                  </span>
                </div>

                <p className="field-note" id="units-help">
                  6 decimal places. USDC units are not a verified USD price.
                </p>

                <label htmlFor="change">
                  Assumed change
                </label>

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
                        className={
                          change === value ? 'selected' : ''
                        }
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

                <button
                  className="primary-button"
                  type="submit"
                  disabled={busy || !status}
                >
                  {busy ? 'Calculating…' : 'Calculate scenario'}

                  {busy ? (
                    <span className="quote-spinner" />
                  ) : (
                    <ArrowUpRight size={16} />
                  )}
                </button>

                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
              </form>

              <div
                className="scenario-result"
                aria-live="polite"
              >
                {scenario && scenarioInput ? (
                  <>
                    <div>
                      <span>
                        At {scenarioInput.change}% from{' '}
                        {scenarioInput.amount} USDC units
                      </span>

                      <strong>
                        {formatAmount(scenario.remainingRaw, 6)}
                        {' '}
                        <small>USDC units</small>
                      </strong>
                    </div>

                    <div className="scenario-delta">
                      <ArrowDownRight size={17} />

                      <span>
                        {scenario.changeRaw.startsWith('-')
                          ? '−'
                          : '+'}
                        {formatAmount(
                          scenario.changeRaw.replace('-', ''),
                          6
                        )}
                        {' '}units
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="empty-result">
                    <span className="result-line" />

                    <p>
                      Your scenario will appear here.
                      <small>
                        Results use exact integer arithmetic.
                      </small>
                    </p>
                  </div>
                )}
              </div>
            </section>

            <aside className="right-column">
              <section
                className="panel route-panel"
                id="quote-section"
              >
                <p className="eyebrow">
                  QUOTE OBSERVATION
                </p>

                <div className="token-route">
                  <span className="token usdc">$</span>

                  <div>
                    <strong>USDC</strong>
                    <small>You would spend</small>
                  </div>

                  <MoveUpRight
                    className="route-arrow"
                    size={20}
                  />

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
                  enabled={quotesEnabled}
                  client={api}
                  benchmarkEnabled={benchmarkEnabled}
                  onRecord={(next) => {
                    setRecord(next);
                    setJsonInput(
                      JSON.stringify(next, null, 2)
                    );
                    setVerified('');
                  }}
                />

                <div className="route-detail">
                  <span>Wallet authorization</span>
                  <strong className="muted">
                    Not requested
                  </strong>
                </div>

                <p className="route-footnote">
                  Token addresses are registry entries.
                  On-chain identity and the supported execution
                  route still need verification.
                </p>
              </section>

              <section className="choice-panel">
                <span className="choice-icon">
                  <Check size={18} />
                </span>

                <p className="eyebrow">
                  ALTERNATIVE DECISION
                </p>

                <h2>Take no trade.</h2>

                <p>
                  Keep your funds where they are.
                  Record that choice locally without connecting
                  a wallet.
                </p>

                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    void recordNoTrade().catch(() => {
                      setVerified(
                        'Could not create a record in this browser.'
                      );
                    });
                  }}
                >
                  Record no-trade choice
                  <ArrowUpRight size={15} />
                </button>

                <span className="local-note">
                  Stored in this tab only · Export below to keep it
                </span>
              </section>
            </aside>
          </div>

          <section
            className="panel trail-panel"
            id="decision-trail"
            aria-labelledby="trail-title"
          >
            <div className="panel-heading">
              <div className="section-icon">
                <FileCheck2 size={19} />
              </div>

              <div>
                <p className="eyebrow">
                  DECISION TRAIL
                </p>

                <h2 id="trail-title">
                  Decision records
                </h2>
              </div>
            </div>

            <p className="section-description">
              Export a local decision record or paste a record
              to verify its digest. A matching digest establishes
              consistency, not source truth, consent or settlement.
            </p>

            {record && (
              <div className="record-summary">
                <span className="record-state">
                  <Check size={14} />

                  {record.payload.candidates.find(
                    (candidate) =>
                      candidate.id ===
                      record.payload.selectedCandidateId
                  )?.kind === 'TRADE'
                    ? 'Quote review recorded'
                    : 'No-trade choice recorded'}
                </span>

                <code>{record.digest}</code>

                <a
                  className="secondary-button"
                  download={northtrail-decision-${record.payload.decisionId}.json}
                  href={`data:application/json;charset=utf-8,${encodeURIComponent(
                    JSON.stringify(record, null, 2)
                  )}`}
                >
                  Export JSON
                  <ArrowUpRight size={14} />
                </a>
              </div>
            )}

            <form onSubmit={checkRecord}>
              <label htmlFor="record-json">
                Decision record JSON
              </label>

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
                <button
                  className="secondary-button"
                  type="submit"
                  disabled={!jsonInput.trim()}
                >
                  Verify digest
                  <ShieldCheck size={15} />
                </button>

                <p role="status">{verified}</p>
              </div>
            </form>
          </section>

          <div id="research">
            <ResearchPanel
              client={api}
              enabled={status !== null}
            />
          </div>

          <div id="trade-proof">
            <ProofPanel
              client={api}
              enabled={proofEnabled}
            />
          </div>

          <section
            className="capabilities"
            id="capabilities"
            aria-labelledby="capabilities-title"
          >
            <div className="capability-heading">
              <div>
                <p className="eyebrow">
                  SYSTEM OVERVIEW
                </p>

                <h2 id="capabilities-title">
                  Capability status
                </h2>
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
                        capability.available
                          ? 'capability-state available'
                          : 'capability-state'
                      }
                    >
                      {capability.available
                        ? 'Available locally'
                        : 'Not available'}
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

            <p>
              Evidence informs. Your wallet authorizes.
            </p>

            <span>Developer preview / v0.1</span>
          </footer>
        </main>
      </div>
    </div>
  );
}