'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, Clock3 } from 'lucide-react';

import {
  createNorthtrail,
  formatAmount,
  parseAmount,
  createDecision,
  type QuoteObservation,
  type QuoteBenchmark,
  type DecisionRecord,
} from '@northtrail/sdk';

type BusyAction = 'quote' | 'record' | null;

export function QuotePanel({
  enabled,
  benchmarkEnabled,
  client,
  onRecord,
}: {
  enabled: boolean;
  benchmarkEnabled: boolean;
  client: () => ReturnType<typeof createNorthtrail>;
  onRecord: (record: DecisionRecord) => void;
}) {
  const [wallet, setWallet] = useState('');
  const [amount, setAmount] = useState('');

  const [quote, setQuote] = useState<QuoteObservation | null>(null);
  const [benchmark, setBenchmark] = useState<QuoteBenchmark | null>(null);

  const [mode, setMode] = useState('uniswap');
  const [review, setReview] = useState('');

  const canObserve =
    mode === 'benchmark' ? benchmarkEnabled : enabled;

  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  const [error, setError] = useState('');
  const [now, setNow] = useState(0);

  const presets = ['1000', '5000', '25000', '100000'];

  useEffect(() => {
    if (!quote && !benchmark) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [quote, benchmark]);

  async function observe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setQuote(null);
    setBenchmark(null);
    setReview('');
    setBusy(true);
    setBusyAction('quote');

    try {
      const api = client();
      const registry = await api.assets();

      const input = registry.assets.find(
        (asset) => asset.symbol === 'USDC'
      );

      const output = registry.assets.find(
        (asset) => asset.symbol === 'WETH'
      );

      if (!input || !output) {
        throw new Error(
          'The supported asset registry is unavailable.'
        );
      }

      const request = {
        chainId: 1 as const,
        owner: wallet as 0x${string},
        recipient: wallet as 0x${string},
        tokenIn: input.address,
        tokenOut: output.address,
        amountInRaw: parseAmount(amount, 6),
        slippageBps: 50,
      };

      if (mode === 'benchmark') {
        setBenchmark(await api.benchmarkQuotes(request));
      } else {
        setQuote(await api.quoteUniswap(request));
      }

      setNow(Date.now());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The quote could not be retrieved.'
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  const expired = quote
    ? now >= Date.parse(quote.reviewExpiresAt)
    : false;

  async function recordQuote() {
    if (!quote || expired || busy) return;

    setBusy(true);
    setBusyAction('record');
    setError('');

    try {
      const api = client();

      const { assets } = await api.assets();

      const tokenIn = assets.find(
        (asset) => asset.address === quote.request.tokenIn
      );

      const tokenOut = assets.find(
        (asset) => asset.address === quote.request.tokenOut
      );

      if (!tokenIn || !tokenOut) {
        throw new Error(
          'Quote assets are absent from the registry.'
        );
      }

      const record = await createDecision({
        schemaVersion: '1',
        decisionId: crypto.randomUUID(),
        revision: 1,
        previousDigest: null,
        displaySchemaVersion: 'review-v1',

        selectedCandidateId: 'uniswap-observation',

        candidates: [
          {
            id: 'uniswap-observation',
            kind: 'TRADE',

            intent: {
              schemaVersion: '1',
              chainId: quote.request.chainId,
              owner: quote.request.owner,
              recipient: quote.request.recipient,

              tokenIn,
              tokenOut,

              amountInRaw: quote.request.amountInRaw,
              minOutRaw: quote.policyMinOutRaw,

              slippageBps: quote.request.slippageBps,
              deadline: quote.reviewExpiresAt,
              route: 'CLASSIC',
            },

            quoteId: quote.quoteId,
            quoteDigest: quote.responseDigest,
            quotedAt: quote.fetchedAt,
            expiresAt: quote.reviewExpiresAt,

            outputRaw: quote.outputRaw,
            provenance: quote.provenance,
            limitations: quote.limitations,
          },

          {
            id: 'no-trade',
            kind: 'NO_TRADE',
          },
        ],

        sources: [
          {
            sourceId: quote.quoteId.slice(0, 100),
            observedAt: quote.fetchedAt,
            fetchedAt: quote.fetchedAt,
            digest: quote.responseDigest,
            provenance: 'PROVIDER_RESPONSE',
          },
        ],

        limitations: [
          'Local review record, not wallet consent. Provider retrieval time is not a verified chain observation.',
        ],

        createdAt: new Date().toISOString(),
      });

      const result = await api.reviewTrade({
        record,
        quote,
        wallet: quote.request.owner,
        chainId: 1,
      });

      if (result.status !== 'CONSISTENT') {
        throw new Error(
          Review required: ${result.reasons.join(', ')}
        );
      }

      onRecord(record);

      setReview(
        'Quote evidence recorded below. Wallet ownership and execution remain unverified.'
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Review failed.'
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  function clearObservations() {
    setQuote(null);
    setBenchmark(null);
    setReview('');
    setError('');
  }

  return (
    <div className="quote-workspace">
      <div className="route-detail">
        <span>Quote access</span>

        <strong className="muted">
          {canObserve ? 'Read-only' : 'Not configured'}
        </strong>
      </div>

      <p className="route-footnote">
        Observe a provider quote for your address.
        This does not connect a wallet or authorize a trade.
      </p>

      <form onSubmit={observe} className="quote-form">
        <label htmlFor="quote-provider">
          Observation sources
        </label>

        <select
          id="quote-provider"
          value={mode}
          disabled={busy}
          onChange={(event) => {
            setMode(event.target.value);
            clearObservations();
          }}
        >
          <option value="uniswap">
            Uniswap CLASSIC V3
          </option>

          <option value="benchmark">
            Uniswap + 1inch comparison
          </option>
        </select>

        <label htmlFor="quote-wallet">
          Your wallet address
        </label>

        <input
          id="quote-wallet"
          value={wallet}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          maxLength={42}
          disabled={!canObserve || busy}
          required
          onChange={(event) => {
            setWallet(event.target.value);
            clearObservations();
          }}
        />

        <label htmlFor="quote-amount">
          Quote size in USDC
        </label>

        <div className="quote-presets">
          <span className="quote-presets-label">
            Quick amounts
          </span>

          <div className="quote-presets-options">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={!canObserve || busy}
                className={
                  amount === preset ? 'selected' : ''
                }
                onClick={() => {
                  setAmount(preset);
                  clearObservations();
                }}
              >
                ${Number(preset).toLocaleString('en-US')}
              </button>
            ))}
          </div>
        </div>

        <input
          id="quote-amount"
          inputMode="decimal"
          value={amount}
          placeholder="Enter an amount"
          maxLength={80}
          disabled={!canObserve || busy}
          required
          onChange={(event) => {
            setAmount(event.target.value);
            clearObservations();
          }}
        />

        <p className="field-note">
          Recipient: your address · Slippage policy: 0.50%
        </p>

        <button
          className="secondary-button"
          type="submit"
          disabled={!canObserve || busy}
        >
          <span>
            {busyAction === 'quote'
              ? 'Retrieving quote…'
              : busy
                ? 'Processing…'
                : mode === 'benchmark'
                  ? 'Compare provider observations'
                  : 'Observe Uniswap quote'}
          </span>

          {busy ? (
            <span
              className="quote-spinner"
              aria-hidden="true"
            />
          ) : (
            <ArrowUpRight size={16} />
          )}
        </button>

        <div
          className={`quote-activity ${
            busy ? 'is-active' : ''
          }`}
          role="status"
          aria-live="polite"
          aria-busy={busy}
        >
          <span className="quote-activity-label">
            {busy
              ? busyAction === 'record'
                ? 'Recording decision'
                : 'Request in progress'
              : 'Ready'}
          </span>

          <span
            className="quote-activity-track"
            aria-hidden="true"
          />

          <span>
            {busy
              ? busyAction === 'record'
                ? 'Decision review'
                : 'Provider response'
              : 'Northtrail'}
          </span>
        </div>

        {!canObserve && (
          <p className="field-note">
            Server provider access is required.
            No sample market quote is substituted.
          </p>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>

      {benchmark && (
        <div
          className="quote-observation"
          aria-live="polite"
        >
          <h3>Provider comparison</h3>

          <p className="small-badge">
            Not comparable · no net winner
          </p>

          {(
            [
              ['Uniswap', benchmark.uniswap],
              ['1inch', benchmark.oneinch],
            ] as const
          ).map(([name, result]) => (
            <div
              key={name}
              className="benchmark-result"
            >
              <strong>{name}</strong>

              {result.ok ? (
                <>
                  <p>
                    {formatAmount(
                      result.observation.outputRaw,
                      18
                    )}{' '}
                    WETH gross output
                  </p>

                  <p className="field-note">
                    {now >=
                    Date.parse(
                      result.observation.reviewExpiresAt
                    )
                      ? 'Expired — requote before review'
                      : 'Provider observation · unverified'}

                    {' · '}

                    {new Date(
                      result.observation.fetchedAt
                    ).toLocaleTimeString()}
                  </p>

                  <p className="field-note">
                    Approval costs unknown; chain state
                    not independently verified.
                  </p>
                </>
              ) : (
                <p role="status">
                  {result.code.replaceAll('_', ' ')}
                </p>
              )}
            </div>
          ))}

          {benchmark.reasons.map((reason) => (
            <p className="field-note" key={reason}>
              {reason}
            </p>
          ))}

          <a
            className="text-button"
            download="northtrail-provider-comparison.json"
            href={`data:application/json;charset=utf-8,${encodeURIComponent(
              JSON.stringify(benchmark, null, 2)
            )}`}
          >
            Export comparison
          </a>
        </div>
      )}

      {quote && (
        <div
          className="quote-observation"
          aria-live="polite"
        >
          <span className="small-badge">
            Provider observation · unverified
          </span>

          <p className={expired ? 'error' : 'field-note'}>
            <Clock3 size={14} />

            {expired
              ? 'Review window expired. Request a new quote.'
              : '30-second local review window'}
          </p>

          <div className="quote-value">
            <span>Quoted output</span>

            <strong>
              {formatAmount(quote.outputRaw, 18)}
              {' '}
              <small>WETH</small>
            </strong>
          </div>

          <div className="route-detail">
            <span>Policy minimum</span>

            <strong>
              {formatAmount(
                quote.policyMinOutRaw,
                18
              )}{' '}
              WETH
            </strong>
          </div>

          <div className="route-detail">
            <span>Swap gas estimate</span>

            <strong>
              {formatAmount(
                quote.gasEstimateWei,
                18
              )}{' '}
              ETH
            </strong>
          </div>

          <div className="route-detail">
            <span>Approval / reset cost</span>

            <strong>Unknown</strong>
          </div>

          {quote.routes?.map((path, pathIdx) => (
            <div
              key={pathIdx}
              className="route-detail"
              style={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '6px',
              }}
            >
              <span className="field-note">
                Route Hop {pathIdx + 1}
              </span>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                }}
              >
                {path.map((hop, hopIdx) => (
                  <span
                    key={hopIdx}
                    className="small-badge"
                    style={{
                      display: 'inline-flex',
                      gap: '6px',
                      alignItems: 'center',
                    }}
                  >
                    <strong
                      style={{
                        color:
                          (hop as any).protocol === 'V4'
                            ? 'var(--nt-positive)'
                            : 'var(--nt-accent)',
                      }}
                    >
                      {(hop as any).protocol ?? 'V3'}
                    </strong>

                    <span>
                      Fee: {hop.feePips / 10000}%
                    </span>

                    {(hop as any).hooks &&
                      (hop as any).hooks !==
                        '0x0000000000000000000000000000000000000000' && (
                        <span
                          style={{
                            color: 'var(--nt-warning)',
                            fontWeight: 600,
                          }}
                        >
                          Hook attached
                        </span>
                      )}
                  </span>
                ))}
              </div>
            </div>
          ))}

          <p className="field-note">
            Fetched{' '}
            {new Date(quote.fetchedAt).toLocaleTimeString()}
            {' · '}
            Provider block {quote.providerBlockNumber}.
            Block hash and canonicality are not verified.
          </p>

          <p className="route-footnote">
            Amounts are observations, not an executable offer.
            Allowances, permits and calldata have not been checked.
            Execution remains disabled.
          </p>

          <a
            className="text-button"
            download="northtrail-quote-observation.json"
            href={`data:application/json;charset=utf-8,${encodeURIComponent(
              JSON.stringify(quote, null, 2)
            )}`}
          >
            Export observation
            <ArrowUpRight size={14} />
          </a>

          <button
            className="secondary-button"
            type="button"
            onClick={() => void recordQuote()}
            disabled={expired || busy}
          >
            <span>
              {busyAction === 'record'
                ? 'Recording…'
                : 'Record quote for review'}
            </span>

            {busyAction === 'record' && (
              <span
                className="quote-spinner"
                aria-hidden="true"
              />
            )}
          </button>

          {review && (
            <p role="status" className="field-note">
              {review}
            </p>
          )}
        </div>
      )}
    </div>
  );
}