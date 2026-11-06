'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, Clock3 } from 'lucide-react';
import {
  createNorthtrail,
  formatAmount,
  parseAmount,
  type QuoteObservation,
} from '@northtrail/sdk';

export function QuotePanel({
  enabled,
  client,
}: {
  enabled: boolean;
  client: () => ReturnType<typeof createNorthtrail>;
}) {
  const [wallet, setWallet] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<QuoteObservation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!quote) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [quote]);

  async function observe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setQuote(null);
    setBusy(true);

    try {
      const api = client();
      const registry = await api.assets();
      const input = registry.assets.find((asset) => asset.symbol === 'USDC');
      const output = registry.assets.find((asset) => asset.symbol === 'WETH');

      if (!input || !output) {
        throw new Error('The supported asset registry is unavailable.');
      }

      const result = await api.quoteUniswap({
        chainId: 1,
        owner: wallet.trim() as `0x${string}`,
        recipient: wallet.trim() as `0x${string}`,
        tokenIn: input.address,
        tokenOut: output.address,
        amountInRaw: parseAmount(amount.trim(), 6),
        slippageBps: 50,
      });

      setNow(Date.now());
      setQuote(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The quote could not be retrieved.');
    } finally {
      setBusy(false);
    }
  }

  const expired = quote ? now >= Date.parse(quote.reviewExpiresAt) : false;

  return (
    <div className="quote-workspace">
      <div className="route-detail">
        <span>Quote access</span>
        <strong className="muted">{enabled ? 'Read-only' : 'Not configured'}</strong>
      </div>
      <p className="route-footnote">
        Observe a provider quote for your address. This does not connect a wallet or authorize a
        trade.
      </p>
      <form onSubmit={observe} className="quote-form">
        <label htmlFor="quote-wallet">Your wallet address</label>
        <input
          id="quote-wallet"
          value={wallet}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          maxLength={42}
          disabled={!enabled || busy}
          required
          onChange={(event) => {
            setWallet(event.target.value);
            setQuote(null);
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
          disabled={!enabled || busy}
          required
          onChange={(event) => {
            setAmount(event.target.value);
            setQuote(null);
            setError('');
          }}
        />
        <p className="field-note">Recipient: your address · Slippage policy: 0.50%</p>
        <button className="secondary-button" type="submit" disabled={!enabled || busy}>
          {busy ? 'Retrieving quote…' : 'Observe Uniswap quote'}
          <ArrowUpRight size={16} />
        </button>
        {!enabled && (
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
        </div>
      )}
    </div>
  );
}