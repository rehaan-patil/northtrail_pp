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
  const canObserve = mode === 'benchmark' ? benchmarkEnabled : enabled;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!quote && !benchmark) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [quote, benchmark]);
  async function observe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setQuote(null);
    setBenchmark(null);
    setReview('');
    setBusy(true);
    try {
      const api = client();
      const registry = await api.assets();
      const input = registry.assets.find((asset) => asset.symbol === 'USDC');
      const output = registry.assets.find((asset) => asset.symbol === 'WETH');
      if (!input || !output) throw new Error('The supported asset registry is unavailable.');
      const request = {
        chainId: 1 as const,
        owner: wallet as `0x${string}`,
        recipient: wallet as `0x${string}`,
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
      setError(reason instanceof Error ? reason.message : 'The quote could not be retrieved.');
    } finally {
      setBusy(false);
    }
  }
  const expired = quote ? now >= Date.parse(quote.reviewExpiresAt) : false;
  async function recordQuote() {
    if (!quote || expired) return;
    setBusy(true);
    setError('');
    try {
      const api = client();
      const { assets } = await api.assets();
      const tokenIn = assets.find((asset) => asset.address === quote.request.tokenIn);
      const tokenOut = assets.find((asset) => asset.address === quote.request.tokenOut);
      if (!tokenIn || !tokenOut) throw new Error('Quote assets are absent from the registry.');
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
          { id: 'no-trade', kind: 'NO_TRADE' },
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
      if (result.status !== 'CONSISTENT')
        throw new Error(`Review required: ${result.reasons.join(', ')}`);
      onRecord(record);
      setReview('Quote evidence recorded below. Wallet ownership and execution remain unverified.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Review failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="quote-workspace">
      <div className="route-detail">
        <span>Quote access</span>
        <strong className="muted">{canObserve ? 'Read-only' : 'Not configured'}</strong>
      </div>
      <p className="route-footnote">
        Observe a provider quote for your address. This does not connect a wallet or authorize a
        trade.
      </p>
      <form onSubmit={observe} className="quote-form">
        <label htmlFor="quote-provider">Observation sources</label>
        <select
          id="quote-provider"
          value={mode}
          disabled={busy}
          onChange={(event) => {
            setMode(event.target.value);
            setQuote(null);
            setBenchmark(null);
            setError('');
            setReview('');
          }}
        >
          <option value="uniswap">Uniswap CLASSIC V3</option>
          <option value="benchmark">Uniswap + 1inch comparison</option>
        </select>
        <label htmlFor="quote-wallet">Your wallet address</label>
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
            setQuote(null);
            setBenchmark(null);
            setReview('');
            setError('');
          }}
        />
        <label htmlFor="quote-amount">Quote size in USDC</label>
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
            setQuote(null);
            setBenchmark(null);
            setReview('');
            setError('');
          }}
        />
        <p className="field-note">Recipient: your address · Slippage policy: 0.50%</p>
        <button className="secondary-button" type="submit" disabled={!canObserve || busy}>
          {busy
            ? 'Retrieving quote…'
            : mode === 'benchmark'
              ? 'Compare provider observations'
              : 'Observe Uniswap quote'}
          <ArrowUpRight size={16} />
        </button>
        {!canObserve && (
          <p className="field-note">
            Server provider access is required. No sample market quote is substituted.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      {benchmark && (
        <div className="quote-observation" aria-live="polite">
          <h3>Provider comparison</h3>
          <p className="small-badge">Not comparable · no net winner</p>
          {(
            [
              ['Uniswap', benchmark.uniswap],
              ['1inch', benchmark.oneinch],
            ] as const
          ).map(([name, result]) => (
            <div key={name} className="benchmark-result">
              <strong>{name}</strong>
              {result.ok ? (
                <>
                  <p>{formatAmount(result.observation.outputRaw, 18)} WETH gross output</p>
                  <p className="field-note">
                    {now >= Date.parse(result.observation.reviewExpiresAt)
                      ? 'Expired — requote before review'
                      : 'Provider observation · unverified'}{' '}
                    · {new Date(result.observation.fetchedAt).toLocaleTimeString()}
                  </p>
                  <p className="field-note">
                    Approval costs unknown; chain state not independently verified.
                  </p>
                </>
              ) : (
                <p role="status">{result.code.replaceAll('_', ' ')}</p>
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
            href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(benchmark, null, 2))}`}
          >
            Export comparison
          </a>
        </div>
      )}
      {quote && (
        <div className="quote-observation" aria-live="polite">
          <span className="small-badge">Provider observation · unverified</span>
          <p className={expired ? 'error' : 'field-note'}>
            <Clock3 size={14} />{' '}
            {expired
              ? 'Review window expired. Request a new quote.'
              : '30-second local review window'}
          </p>
          <div className="quote-value">
            <span>Quoted output</span>
            <strong>
              {formatAmount(quote.outputRaw, 18)} <small>WETH</small>
            </strong>
          </div>
          <div className="route-detail">
            <span>Policy minimum</span>
            <strong>{formatAmount(quote.policyMinOutRaw, 18)} WETH</strong>
          </div>
          <div className="route-detail">
            <span>Swap gas estimate</span>
            <strong>{formatAmount(quote.gasEstimateWei, 18)} ETH</strong>
          </div>
          <div className="route-detail">
            <span>Approval / reset cost</span>
            <strong>Unknown</strong>
          </div>
          <p className="field-note">
            Fetched {new Date(quote.fetchedAt).toLocaleTimeString()} · Provider block{' '}
            {quote.providerBlockNumber}. Block hash and canonicality are not verified.
          </p>
          <p className="route-footnote">
            Amounts are observations, not an executable offer. Allowances, permits and calldata have
            not been checked. Execution remains disabled.
          </p>
          <a
            className="text-button"
            download="northtrail-quote-observation.json"
            href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(quote, null, 2))}`}
          >
            Export observation <ArrowUpRight size={14} />
          </a>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void recordQuote()}
            disabled={expired || busy}
          >
            Record quote for review
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
