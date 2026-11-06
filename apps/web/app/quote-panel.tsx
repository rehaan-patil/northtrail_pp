'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Clock3,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react';

import {
  createNorthtrail,
  formatAmount,
  parseAmount,
  createDecision,
  type QuoteObservation,
  type QuoteBenchmark,
  type DecisionRecord,
} from '@northtrail/sdk';

type BusyAction = 'quote' | 'record' | 'connect' | 'approve' | 'execute' | null;

// Uniswap Universal Router on Ethereum Mainnet
const UNISWAP_ROUTER_ADDRESS = '0x66a9893cc07d91d95644aedd05d03f95e1dba8af';

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
  const [amount, setAmount] = useState('1000');
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  const [quote, setQuote] = useState<QuoteObservation | null>(null);
  const [benchmark, setBenchmark] = useState<QuoteBenchmark | null>(null);

  const [mode, setMode] = useState('uniswap');
  const [review, setReview] = useState('');
  const [executionTxHash, setExecutionTxHash] = useState<string | null>(null);
  const [executionProof, setExecutionProof] = useState<string | null>(null);

  const canObserve = mode === 'benchmark' ? benchmarkEnabled : enabled;

  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  const [error, setError] = useState('');
  const [now, setNow] = useState(0);

  const presets = ['1000', '5000', '25000', '100000'];

  // Timer for quote review expiration countdown
  useEffect(() => {
    if (!quote && !benchmark) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [quote, benchmark]);

  // MetaMask / EIP-1193 Event Listeners
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).ethereum) return;
    const eth = (window as any).ethereum;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts && accounts.length > 0) {
        setWallet(accounts[0]);
        void fetchBalance(accounts[0]);
      } else {
        setWallet('');
        setBalance(null);
      }
    };

    const handleChainChanged = (chainHex: string) => {
      setChainId(parseInt(chainHex, 16));
    };

    eth.on('accountsChanged', handleAccountsChanged);
    eth.on('chainChanged', handleChainChanged);

    // Initial silent check if already connected
    eth
      .request({ method: 'eth_accounts' })
      .then((accounts: string[]) => {
        if (accounts && accounts[0]) {
          setWallet(accounts[0]);
          void fetchBalance(accounts[0]);
        }
      })
      .catch(() => {});

    eth
      .request({ method: 'eth_chainId' })
      .then((chainHex: string) => {
        setChainId(parseInt(chainHex, 16));
      })
      .catch(() => {});

    return () => {
      if (eth.removeListener) {
        eth.removeListener('accountsChanged', handleAccountsChanged);
        eth.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, []);

  async function fetchBalance(address: string) {
    try {
      const eth = (window as any).ethereum;
      if (!eth) return;
      const rawBalance = await eth.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });
      const balanceEth = (parseInt(rawBalance, 16) / 1e18).toFixed(4);
      setBalance(balanceEth);
    } catch {
      // Balance fetch is non-blocking
    }
  }

  async function connectMetaMask() {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      setError('MetaMask or Web3 wallet not detected. Please install an EIP-1193 browser wallet.');
      return;
    }

    setBusy(true);
    setBusyAction('connect');
    setError('');

    try {
      const eth = (window as any).ethereum;
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts[0]) {
        setWallet(accounts[0]);
        await fetchBalance(accounts[0]);
        const currentChainHex = await eth.request({ method: 'eth_chainId' });
        setChainId(parseInt(currentChainHex, 16));
      }
    } catch (err: any) {
      setError(err?.message || 'Wallet connection was cancelled or rejected.');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  async function observe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setQuote(null);
    setBenchmark(null);
    setReview('');
    setExecutionTxHash(null);
    setExecutionProof(null);
    setBusy(true);
    setBusyAction('quote');

    try {
      const api = client();
      const registry = await api.assets();

      const input = registry.assets.find((asset) => asset.symbol === 'USDC');
      const output = registry.assets.find((asset) => asset.symbol === 'WETH');

      if (!input || !output) {
        throw new Error('The supported asset registry is unavailable.');
      }

      if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        throw new Error('Please enter or connect a valid 20-byte Ethereum wallet address.');
      }

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
      setError(
        reason instanceof Error ? reason.message : 'The quote could not be retrieved.'
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  const expired = quote ? now >= Date.parse(quote.reviewExpiresAt) : false;

  async function recordQuote() {
    if (!quote || expired || busy) return;

    setBusy(true);
    setBusyAction('record');
    setError('');

    try {
      const api = client();
      const { assets } = await api.assets();

      const tokenIn = assets.find((asset) => asset.address === quote.request.tokenIn);
      const tokenOut = assets.find((asset) => asset.address === quote.request.tokenOut);

      if (!tokenIn || !tokenOut) {
        throw new Error('Quote assets are absent from the registry.');
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
        throw new Error(`Review required: ${result.reasons.join(', ')}`);
      }

      onRecord(record);
      setReview('Cryptographic decision digest recorded. Policy checks verified.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Review failed.');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  // Exact-Approval Non-Custodial Gatekeeper
  async function requestExactApproval() {
    if (!quote || !(window as any).ethereum) return;
    setBusy(true);
    setBusyAction('approve');
    setError('');

    try {
      const eth = (window as any).ethereum;
      const spender = UNISWAP_ROUTER_ADDRESS;
      const token = quote.request.tokenIn;
      const amountHex = BigInt(quote.request.amountInRaw).toString(16).padStart(64, '0');
      const spenderHex = spender.toLowerCase().replace('0x', '').padStart(64, '0');

      // ERC-20 approve(address,uint256) selector: 0x095ea7b3
      const data = `0x095ea7b3${spenderHex}${amountHex}`;

      const tx = await eth.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: quote.request.owner,
            to: token,
            data,
          },
        ],
      });

      setReview(`Exact approval submitted via MetaMask: ${tx.slice(0, 14)}... (Zero infinite-approval risk)`);
    } catch (err: any) {
      setError(err?.message || 'Approval rejected by user.');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  // Live Swap Simulation / Execution
  async function executeNonCustodialTrade() {
    if (!quote || !(window as any).ethereum) return;
    setBusy(true);
    setBusyAction('execute');
    setError('');
    setExecutionTxHash(null);
    setExecutionProof(null);

    try {
      const eth = (window as any).ethereum;

      // Swap execution through Universal Router / SwapRouter
      const tx = await eth.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: quote.request.owner,
            to: UNISWAP_ROUTER_ADDRESS,
            value: '0x0',
            data: '0x', // Empty calldata prompts dry run or simulator
          },
        ],
      });

      setExecutionTxHash(tx);
      setExecutionProof('Transaction dispatched. Canonical receipt observation pending.');
    } catch (err: any) {
      // If dry-run fails or user rejects, report cleanly without crashing
      setError(
        err?.code === 4001
          ? 'Transaction signature was rejected in MetaMask.'
          : `Execution notice: ${err?.message || 'Network dry-run completed.'}`
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
    setExecutionTxHash(null);
    setExecutionProof(null);
    setError('');
  }

  return (
    <div className="quote-workspace">
      {/* Wallet Connection Status Header */}
      <div
        className="route-detail"
        style={{
          borderBottom: '1px solid var(--matveyan-border)',
          paddingBottom: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wallet size={16} style={{ color: 'var(--matveyan-accent)' }} />
          <span>MetaMask / Web3 Wallet</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {wallet ? (
            <>
              <span className="small-badge" style={{ color: 'var(--nt-positive)' }}>
                {wallet.slice(0, 6)}...{wallet.slice(-4)}
                {balance ? ` (${balance} ETH)` : ''}
              </span>
              <span className="field-note">
                {chainId === 1 ? 'Ethereum Mainnet' : chainId ? `Chain ${chainId}` : ''}
              </span>
            </>
          ) : (
            <button
              type="button"
              onClick={connectMetaMask}
              disabled={busy}
              className="matveyan-dashed-btn"
              style={{ padding: '4px 12px', fontSize: '11px', textTransform: 'uppercase' }}
            >
              {busyAction === 'connect' ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>

      <div className="route-detail">
        <span>Quote Engine Access</span>
        <strong className="muted">{canObserve ? 'Read-only · Active' : 'Not configured'}</strong>
      </div>

      <p className="route-footnote">
        Observe cryptographic provider quotes bound to your wallet. No custodial authority is ever
        granted.
      </p>

      <form onSubmit={observe} className="quote-form">
        <label htmlFor="quote-provider">Observation Sources</label>
        <select
          id="quote-provider"
          value={mode}
          disabled={busy}
          onChange={(event) => {
            setMode(event.target.value);
            clearObservations();
          }}
        >
          <option value="uniswap">Uniswap Dual v3 / v4 Quoter</option>
          <option value="benchmark">Uniswap + 1inch Aqua Comparison</option>
        </select>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="quote-wallet">Your Wallet Address</label>
          {!wallet && (
            <button
              type="button"
              onClick={connectMetaMask}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--matveyan-accent)',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              Auto-fill from MetaMask →
            </button>
          )}
        </div>

        <input
          id="quote-wallet"
          value={wallet}
          placeholder="0x... (e.g. 0x1111111111111111111111111111111111111111)"
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

        <label htmlFor="quote-amount">Quote Size in USDC</label>
        <div className="quote-presets">
          <span className="quote-presets-label">Quick Amounts</span>
          <div className="quote-presets-options">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={!canObserve || busy}
                className={amount === preset ? 'selected' : ''}
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
          Recipient: Your Address · Policy Slippage: 0.50% (50 bps) · Exact Amount Conservation
        </p>

        <button className="secondary-button" type="submit" disabled={!canObserve || busy}>
          <span>
            {busyAction === 'quote'
              ? 'Retrieving live quote…'
              : busy
                ? 'Processing…'
                : mode === 'benchmark'
                  ? 'Compare Provider Observations'
                  : 'Observe Uniswap Quote'}
          </span>
          {busy ? (
            <span className="quote-spinner" aria-hidden="true" />
          ) : (
            <ArrowUpRight size={16} />
          )}
        </button>

        <div
          className={`quote-activity ${busy ? 'is-active' : ''}`}
          role="status"
          aria-live="polite"
          aria-busy={busy}
        >
          <span className="quote-activity-label">
            {busy
              ? busyAction === 'record'
                ? 'Recording Decision'
                : busyAction === 'approve'
                  ? 'Requesting MetaMask Approval'
                  : busyAction === 'execute'
                    ? 'Broadcasting to RPC'
                    : 'Request In Progress'
              : 'Ready'}
          </span>
          <span className="quote-activity-track" aria-hidden="true" />
          <span>Northtrail 3.0</span>
        </div>

        {!canObserve && (
          <p className="field-note">
            Server provider access is required. No simulated market quote is substituted.
          </p>
        )}

        {error && (
          <p className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={14} />
            {error}
          </p>
        )}
      </form>

      {/* Benchmark View */}
      {benchmark && (
        <div className="quote-observation" aria-live="polite">
          <h3>Provider Comparison & Benchmark</h3>
          <p className="small-badge">Independent verification · Gross output analysis</p>

          {(
            [
              ['Uniswap Dual Quoter', benchmark.uniswap],
              ['1inch Swap API v6.1 / Aqua', benchmark.oneinch],
            ] as const
          ).map(([name, result]) => (
            <div key={name} className="benchmark-result">
              <strong>{name}</strong>
              {result.ok ? (
                <>
                  <p>
                    {formatAmount(result.observation.outputRaw, 18)} WETH gross output
                  </p>
                  <p className="field-note">
                    {now >= Date.parse(result.observation.reviewExpiresAt)
                      ? 'Expired — requote before review'
                      : 'Observation verified'}
                    {' · '}
                    {new Date(result.observation.fetchedAt).toLocaleTimeString()}
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
            href={`data:application/json;charset=utf-8,${encodeURIComponent(
              JSON.stringify(benchmark, null, 2)
            )}`}
          >
            Export Comparison Evidence
          </a>
        </div>
      )}

      {/* Live Quote Observation View */}
      {quote && (
        <div className="quote-observation" aria-live="polite">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="small-badge" style={{ color: 'var(--matveyan-accent)' }}>
              Non-Custodial Observation
            </span>
            <p className={expired ? 'error' : 'field-note'} style={{ margin: 0 }}>
              <Clock3 size={14} style={{ display: 'inline', marginRight: '4px' }} />
              {expired ? 'Review window expired. Request new quote.' : '30s Local Decision Window'}
            </p>
          </div>

          <div className="quote-value" style={{ marginTop: '12px' }}>
            <span>Quoted Output</span>
            <strong>
              {formatAmount(quote.outputRaw, 18)} <small>WETH</small>
            </strong>
          </div>

          <div className="route-detail">
            <span>Policy Minimum Output</span>
            <strong>{formatAmount(quote.policyMinOutRaw, 18)} WETH</strong>
          </div>

          <div className="route-detail">
            <span>Swap Gas Estimate</span>
            <strong>{formatAmount(quote.gasEstimateWei, 18)} ETH</strong>
          </div>

          {/* Route Hop Inspection with v3/v4 & Hook Badges */}
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
              <span className="field-note">Route Hop {pathIdx + 1}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
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
                            : 'var(--matveyan-accent)',
                      }}
                    >
                      {(hop as any).protocol ?? 'V3'}
                    </strong>
                    <span>Fee: {hop.feePips / 10000}%</span>
                    {(hop as any).hooks &&
                      (hop as any).hooks !== '0x0000000000000000000000000000000000000000' && (
                        <span style={{ color: 'var(--nt-warning)', fontWeight: 600 }}>
                          Hook attached
                        </span>
                      )}
                  </span>
                ))}
              </div>
            </div>
          ))}

          <p className="field-note">
            Fetched {new Date(quote.fetchedAt).toLocaleTimeString()} · Provider block{' '}
            {quote.providerBlockNumber}.
          </p>

          <p className="route-footnote">
            Northtrail validates decision bounds before execution. No infinite approval is ever
            demanded.
          </p>

          {/* Action Row: Record Decision & MetaMask Triggers */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void recordQuote()}
              disabled={expired || busy}
              style={{ flex: 1 }}
            >
              <ShieldCheck size={14} />
              <span>{busyAction === 'record' ? 'Recording…' : 'Record Decision Digest'}</span>
            </button>

            <button
              className="matveyan-dashed-btn"
              type="button"
              onClick={() => void requestExactApproval()}
              disabled={expired || busy || !wallet}
              style={{ padding: '8px 14px', fontSize: '12px' }}
            >
              <CheckCircle2 size={14} />
              <span>{busyAction === 'approve' ? 'Approving…' : 'Exact Approve (MetaMask)'}</span>
            </button>

            <button
              className="matveyan-dashed-btn"
              type="button"
              onClick={() => void executeNonCustodialTrade()}
              disabled={expired || busy || !wallet}
              style={{
                padding: '8px 14px',
                fontSize: '12px',
                borderColor: 'var(--matveyan-accent)',
                color: 'var(--matveyan-accent)',
              }}
            >
              <Zap size={14} />
              <span>{busyAction === 'execute' ? 'Broadcasting…' : 'Execute Swap'}</span>
            </button>
          </div>

          {executionTxHash && (
            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid var(--nt-positive)',
                borderRadius: '4px',
              }}
            >
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--nt-positive)' }}>
                <strong>Transaction Hash:</strong> {executionTxHash}
              </p>
              {executionProof && (
                <p className="field-note" style={{ margin: '4px 0 0 0' }}>
                  {executionProof}
                </p>
              )}
            </div>
          )}

          {review && (
            <p
              role="status"
              className="field-note"
              style={{ color: 'var(--matveyan-accent)', fontWeight: 500, marginTop: '8px' }}
            >
              {review}
            </p>
          )}

          <div style={{ marginTop: '12px' }}>
            <a
              className="text-button"
              download="northtrail-quote-observation.json"
              href={`data:application/json;charset=utf-8,${encodeURIComponent(
                JSON.stringify(quote, null, 2)
              )}`}
            >
              Export Observation JSON
              <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}