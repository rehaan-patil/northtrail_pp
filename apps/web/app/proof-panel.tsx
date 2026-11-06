'use client';
import { useState, type FormEvent } from 'react';
import { createNorthtrail, formatAmount, type ReceiptObservation } from '@northtrail/sdk';

export function ProofPanel({
  client,
  enabled,
}: {
  client: () => ReturnType<typeof createNorthtrail>;
  enabled: boolean;
}) {
  const [hash, setHash] = useState('');
  const [result, setResult] = useState<ReceiptObservation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function observe(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await client().proofs.observeReceipt({ chainId: 1, transactionHash: hash }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Receipt observation failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel research-panel" id="trade-proof" aria-labelledby="proof-title">
      <p className="eyebrow">TRADE PROOF · RECEIPT OBSERVATION</p>
      <h2 id="proof-title">Check what the chain reports.</h2>
      <p className="section-description">
        Read an Ethereum receipt through the server RPC. A successful receipt does not establish
        intended token settlement or finality.
      </p>
      <form className="quote-form" onSubmit={observe}>
        <label htmlFor="proof-hash">Ethereum transaction hash</label>
        <input
          id="proof-hash"
          value={hash}
          required
          maxLength={66}
          spellCheck={false}
          disabled={!enabled || busy}
          placeholder="0x…"
          onChange={(event) => {
            setHash(event.target.value);
            setResult(null);
            setError('');
          }}
        />
        <button className="secondary-button" disabled={!enabled || busy}>
          {busy ? 'Observing receipt…' : 'Observe chain receipt'}
        </button>
        {!enabled && (
          <p className="field-note">
            Server RPC access is not configured. No simulated receipt is substituted.
          </p>
        )}
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {result && (
        <div className="research-result" aria-live="polite">
          <strong>{result.status.replaceAll('_', ' ')}</strong>
          <p>Token settlement not verified · Finality not established</p>
          <p className="field-note">
            Block {result.blockNumber ?? 'not observed'} · {result.confirmations} confirmations at
            observation time
          </p>
          {result.gasPaidWei !== null && (
            <p>Execution gas: {formatAmount(result.gasPaidWei, 18)} ETH</p>
          )}
          {result.limitations.map((limitation) => (
            <p className="field-note" key={limitation}>
              {limitation}
            </p>
          ))}
          <a
            className="text-button"
            download="northtrail-receipt-observation.json"
            href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(result, null, 2))}`}
          >
            Export receipt observation
          </a>
        </div>
      )}
    </section>
  );
}
