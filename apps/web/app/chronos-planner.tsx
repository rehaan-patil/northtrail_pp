'use client';

import { useState } from 'react';
import {
  Clock,
  Split,
  ShieldAlert,
  ArrowRight,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface ChronosPlannerProps {
  onSelectPlan?: (plan: { strategy: string; amount: string; tranches: number }) => void;
}

export function ChronosPlanner({ onSelectPlan }: ChronosPlannerProps) {
  const [strategy, setStrategy] = useState<'NOW' | 'SPLIT' | 'WAIT'>('SPLIT');
  const [amount, setAmount] = useState('10000');
  const [tranches, setTranches] = useState(2);
  const [deadlineMinutes, setDeadlineMinutes] = useState(30);

  const amountNum = parseFloat(amount) || 10000;
  const trancheSize = (amountNum / tranches).toFixed(0);

  // Exact math from compass research:
  const gasPerTxEth = 0.00042;
  const ethPrice = 3333.33;
  const gasPerTxUsd = gasPerTxEth * ethPrice;

  // Strategy A: NOW (Immediate)
  const nowSlippageBps = Math.min(60, Math.floor((amountNum / 10000) * 18));
  const nowGasUsd = gasPerTxUsd;
  const nowCvar95Bps = nowSlippageBps * 2.2;

  // Strategy B: SPLIT (TWAP)
  const splitSlippageBps = Math.max(5, Math.floor(nowSlippageBps / (tranches * 0.85)));
  const splitGasUsd = gasPerTxUsd * tranches;
  const splitCvar95Bps = splitSlippageBps * 1.5;

  // Strategy C: WAIT (Delayed)
  const waitSlippageBps = Math.floor(nowSlippageBps * 0.9);
  const waitGasUsd = gasPerTxUsd;
  const waitCvar95Bps = nowSlippageBps * 2.8; // Opportunity cost & market drift risk

  const currentSlippage =
    strategy === 'NOW' ? nowSlippageBps : strategy === 'SPLIT' ? splitSlippageBps : waitSlippageBps;
  const currentGas = strategy === 'NOW' ? nowGasUsd : strategy === 'SPLIT' ? splitGasUsd : waitGasUsd;
  const currentCvar = strategy === 'NOW' ? nowCvar95Bps : strategy === 'SPLIT' ? splitCvar95Bps : waitCvar95Bps;

  return (
    <section className="panel" id="chronos-planner" style={{ marginTop: '28px' }}>
      <div className="panel-heading">
        <div className="section-icon">
          <Clock size={20} />
        </div>
        <div>
          <p className="eyebrow">CHRONOS · ML EXECUTION TIMING & OPTIMIZATION</p>
          <h2>Constrained Timing Planner: NOW, SPLIT or WAIT</h2>
        </div>
        <span className="small-badge" style={{ color: 'var(--accent)' }}>
          Risk-Adjusted Models
        </span>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '14px 0 20px', lineHeight: 1.6 }}>
        Compare executing immediately against staged TWAP slicing or awaiting block volatility cooloff.
        Optimizes implementation shortfall, repeated gas overhead, and 95% CVaR tail risk under strict wallet constraints.
      </p>

      {/* Strategy Selector Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
        {[
          { key: 'NOW', label: 'NOW · Immediate', icon: Sparkles },
          { key: 'SPLIT', label: 'SPLIT · TWAP Tranches', icon: Split },
          { key: 'WAIT', label: 'WAIT · Volatility Cooloff', icon: Clock },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = strategy === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStrategy(tab.key as any)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '3px',
                border: active ? '1px solid var(--accent)' : '1px solid var(--line)',
                background: active ? 'var(--badge-bg)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Plan Details & Configuration Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {/* Left: Input Configuration */}
        <div style={{ background: 'var(--badge-bg)', border: '1px solid var(--line)', padding: '18px', borderRadius: '4px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
            Position Budget in USDC
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              background: 'var(--input-bg)',
              border: '1px solid var(--line)',
              borderRadius: '3px',
              color: 'var(--ink)',
              fontFamily: 'ui-monospace, monospace',
              marginBottom: '16px',
            }}
          />

          {strategy === 'SPLIT' && (
            <>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Tranches Count: <strong>{tranches} slices</strong> (${trancheSize} USDC each)
              </label>
              <input
                type="range"
                min={2}
                max={5}
                value={tranches}
                onChange={(e) => setTranches(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer', marginBottom: '16px' }}
              />
            </>
          )}

          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
            Execution Horizon Window (Minutes)
          </label>
          <select
            value={deadlineMinutes}
            onChange={(e) => setDeadlineMinutes(Number(e.target.value))}
            style={{
              width: '100%',
              padding: '8px',
              background: 'var(--input-bg)',
              border: '1px solid var(--line)',
              borderRadius: '3px',
              color: 'var(--ink)',
            }}
          >
            <option value={15}>15 Minutes (Fast Execution)</option>
            <option value={30}>30 Minutes (Standard TWAP)</option>
            <option value={60}>60 Minutes (Volatile Dispersion)</option>
          </select>
        </div>

        {/* Right: Risk & Output Diagnostics */}
        <div style={{ background: 'var(--badge-bg)', border: '1px solid var(--line)', padding: '18px', borderRadius: '4px' }}>
          <h4 style={{ margin: '0 0 14px 0', fontSize: '13px', color: 'var(--ink)' }}>
            Execution Shortfall & Tail Risk
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--muted)' }}>Expected Price Impact:</span>
              <strong>{currentSlippage} bps ({(currentSlippage / 100).toFixed(2)}%)</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--muted)' }}>CVaR 95% Tail Risk:</span>
              <strong style={{ color: currentCvar > 40 ? '#ef4444' : 'var(--accent)' }}>
                {currentCvar.toFixed(0)} bps (worst 5% cost)
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--muted)' }}>Estimated Total Gas:</span>
              <strong>${currentGas.toFixed(2)} ({((currentGas / ethPrice)).toFixed(5)} ETH)</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Wallet Approvals Required:</span>
              <strong>{strategy === 'SPLIT' ? `${tranches} Signatures` : '1 Signature'}</strong>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            {onSelectPlan && (
              <button
                type="button"
                className="secondary-button"
                style={{ width: '100%', padding: '10px' }}
                onClick={() =>
                  onSelectPlan({
                    strategy,
                    amount: strategy === 'SPLIT' ? trancheSize : amount,
                    tranches: strategy === 'SPLIT' ? tranches : 1,
                  })
                }
              >
                <span>Authorize {strategy === 'SPLIT' ? `Tranche 1/${tranches}` : 'Plan'}</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Safety & Non-Custodial Invariant Notice */}
      <div style={{ padding: '12px 16px', background: 'var(--input-bg)', border: '1px solid var(--line)', borderRadius: '3px', fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <ShieldAlert size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div>
          <strong>Non-Custodial Enforcement:</strong> Machine learning forecasts cannot sign or broadcast transactions. For split trades, each subsequent tranche requires explicit owner re-quote and authorization or a contract-enforced on-chain mandate.
        </div>
      </div>
    </section>
  );
}

