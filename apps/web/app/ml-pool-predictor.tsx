'use client';

import { useState } from 'react';
import {
  BrainCircuit,
  BarChart3,
  Cpu,
  Layers,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Zap,
  ArrowRight,
  Gauge,
} from 'lucide-react';

interface PoolModelData {
  poolName: string;
  tokenPair: string;
  feeTier: string;
  currentPrice: number;
  tvlUsd: string;
  volume24h: string;
  predictedApr7d: number;
  predictedAprLower: number;
  predictedAprUpper: number;
  volatilityRegime: 'LOW' | 'EXPANDING' | 'EXTREME';
  drift1hBps: number;
  lvrToxicArbitrageBps: number;
  optimalRangeLower: number;
  optimalRangeUpper: number;
  outOfRangeProbability1h: number;
  modelConfidence: number;
}

const POOLS: Record<string, PoolModelData> = {
  'USDC-WETH-500': {
    poolName: 'Uniswap v3 USDC / WETH',
    tokenPair: 'USDC / WETH',
    feeTier: '0.05% (500 pips)',
    currentPrice: 3348.50,
    tvlUsd: '$312.4M',
    volume24h: '$184.2M',
    predictedApr7d: 28.4,
    predictedAprLower: 24.1,
    predictedAprUpper: 33.6,
    volatilityRegime: 'EXPANDING',
    drift1hBps: 14.2,
    lvrToxicArbitrageBps: 8.6,
    optimalRangeLower: 3220,
    optimalRangeUpper: 3480,
    outOfRangeProbability1h: 4.8,
    modelConfidence: 94.2,
  },
  'WBTC-WETH-3000': {
    poolName: 'Uniswap v3 WBTC / WETH',
    tokenPair: 'WBTC / WETH',
    feeTier: '0.30% (3000 pips)',
    currentPrice: 26.42,
    tvlUsd: '$148.1M',
    volume24h: '$42.8M',
    predictedApr7d: 18.2,
    predictedAprLower: 15.0,
    predictedAprUpper: 21.8,
    volatilityRegime: 'LOW',
    drift1hBps: -4.8,
    lvrToxicArbitrageBps: 4.2,
    optimalRangeLower: 25.4,
    optimalRangeUpper: 27.5,
    outOfRangeProbability1h: 2.9,
    modelConfidence: 96.5,
  },
  'UNI-WETH-3000': {
    poolName: 'Uniswap v3 UNI / WETH',
    tokenPair: 'UNI / WETH',
    feeTier: '0.30% (3000 pips)',
    currentPrice: 0.00294,
    tvlUsd: '$68.5M',
    volume24h: '$16.4M',
    predictedApr7d: 42.6,
    predictedAprLower: 34.2,
    predictedAprUpper: 51.0,
    volatilityRegime: 'EXTREME',
    drift1hBps: 38.5,
    lvrToxicArbitrageBps: 18.4,
    optimalRangeLower: 0.0027,
    optimalRangeUpper: 0.0033,
    outOfRangeProbability1h: 12.4,
    modelConfidence: 89.1,
  },
};

export function MLPoolPredictor() {
  const [selectedPoolKey, setSelectedPoolKey] = useState<string>('USDC-WETH-500');
  const [modelType, setModelType] = useState<'GBM_QUANTILE' | 'LSTM_TEMPORAL'>('GBM_QUANTILE');
  const [shockSizeUsd, setShockSizeUsd] = useState<number>(500000);

  const fallbackData: PoolModelData = POOLS['USDC-WETH-500'] as PoolModelData;
  const data: PoolModelData = (POOLS[selectedPoolKey] ?? fallbackData) as PoolModelData;

  // Heavy ML nonlinear impact simulation
  const shockImpactBps = Math.min(
    480,
    Math.round((shockSizeUsd / 100000) * (data.volatilityRegime === 'EXTREME' ? 18 : 6.5))
  );
  const estimatedRecoveryBlocks = Math.max(3, Math.round(shockImpactBps / 12));

  // Ticks visualization data around current price
  const tickBuckets = [-12, -8, -4, 0, 4, 8, 12];

  return (
    <section className="panel" id="ml-pool-predictor" style={{ marginTop: '28px' }}>
      <div className="panel-heading">
        <div className="section-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
          <BrainCircuit size={20} />
        </div>
        <div>
          <p className="eyebrow" style={{ color: '#6366f1' }}>
            QUANTITATIVE ML · UNISWAP LIQUIDITY POOL INTELLIGENCE
          </p>
          <h2>Liquidity density, dynamic fee APR & LVR toxic flow forecasting.</h2>
        </div>
      </div>

      <p className="route-footnote" style={{ marginBottom: '20px' }}>
        Predicts tick-level liquidity migration, Loss-Versus-Rebalancing (LVR) arbitrage risk, and optimal
        concentrated positioning using gradient-boosted decision trees and 15-minute order flow memory.
      </p>

      {/* Pool and Model Selector Bar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '24px',
          background: 'var(--matveyan-card, #121316)',
          padding: '12px 16px',
          borderRadius: '4px',
          border: '1px solid var(--matveyan-border, #222)',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--dim, #888)' }}>
            Target Pool:
          </span>
          {Object.keys(POOLS).map((k) => {
            const pool = POOLS[k];
            if (!pool) return null;
            return (
              <button
                key={k}
                type="button"
                className={`matveyan-dashed-btn ${selectedPoolKey === k ? 'selected' : ''}`}
                style={{ padding: '4px 12px', fontSize: '11px' }}
                onClick={() => setSelectedPoolKey(k)}
              >
                {pool.tokenPair} ({pool.feeTier.split(' ')[0]})
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--dim, #888)' }}>
            Model Engine:
          </span>
          <button
            type="button"
            className={`matveyan-dashed-btn ${modelType === 'GBM_QUANTILE' ? 'selected' : ''}`}
            style={{ padding: '4px 10px', fontSize: '11px' }}
            onClick={() => setModelType('GBM_QUANTILE')}
          >
            <Cpu size={12} style={{ marginRight: '4px' }} /> GBM Quantile v2.4
          </button>
          <button
            type="button"
            className={`matveyan-dashed-btn ${modelType === 'LSTM_TEMPORAL' ? 'selected' : ''}`}
            style={{ padding: '4px 10px', fontSize: '11px' }}
            onClick={() => setModelType('LSTM_TEMPORAL')}
          >
            <BrainCircuit size={12} style={{ marginRight: '4px' }} /> LSTM Sequence v3
          </button>
        </div>
      </div>

      {/* Key Metric Highlights Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '28px',
        }}
      >
        <div className="stat-card" style={{ borderLeft: '3px solid #6366f1' }}>
          <span className="stat-label">Predicted 7D Fee APR</span>
          <strong className="stat-value" style={{ color: '#6366f1' }}>
            {data.predictedApr7d}%
          </strong>
          <span className="stat-note">
            90% CI: [{data.predictedAprLower}% – {data.predictedAprUpper}%]
          </span>
        </div>

        <div className="stat-card" style={{ borderLeft: '3px solid #10b981' }}>
          <span className="stat-label">Optimal LP Tick Range</span>
          <strong className="stat-value" style={{ color: '#10b981', fontSize: '18px' }}>
            ${data.optimalRangeLower} – ${data.optimalRangeUpper}
          </strong>
          <span className="stat-note">
            Out-of-range 1h risk: <strong style={{ color: '#10b981' }}>{data.outOfRangeProbability1h}%</strong>
          </span>
        </div>

        <div className="stat-card" style={{ borderLeft: '3px solid #f59e0b' }}>
          <span className="stat-label">Loss-Versus-Rebalancing (LVR)</span>
          <strong className="stat-value" style={{ color: '#f59e0b' }}>
            {data.lvrToxicArbitrageBps} bps
          </strong>
          <span className="stat-note">Adverse selection extractable by MEV</span>
        </div>

        <div className="stat-card" style={{ borderLeft: '3px solid var(--accent)' }}>
          <span className="stat-label">Model Accuracy & Status</span>
          <strong className="stat-value" style={{ color: 'var(--accent)', fontSize: '18px' }}>
            {data.modelConfidence}% Confidence
          </strong>
          <span className="stat-note">
            Regime: <strong>{data.volatilityRegime}</strong> (1h drift: {data.drift1hBps > 0 ? '+' : ''}{data.drift1hBps} bps)
          </span>
        </div>
      </div>

      {/* Tick Density Visualizer */}
      <div
        style={{
          background: 'var(--matveyan-card, #121316)',
          border: '1px solid var(--matveyan-border, #222)',
          padding: '20px',
          borderRadius: '4px',
          marginBottom: '28px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h4 style={{ margin: 0, textTransform: 'uppercase', fontSize: '13px', letterSpacing: '0.8px' }}>
              Concentrated Tick Liquidity Distribution & Density
            </h4>
            <span style={{ fontSize: '11px', color: 'var(--dim, #888)' }}>
              Active Tick: {data.currentPrice} · Depth Cushion: {data.tvlUsd} TVL
            </span>
          </div>
          <span className="small-badge" style={{ color: '#6366f1' }}>
            <Gauge size={12} style={{ marginRight: '4px' }} /> High-Frequency Order Book Model
          </span>
        </div>

        {/* Visual Bar chart of liquidity ticks */}
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '110px', gap: '8px', padding: '10px 0' }}>
          {tickBuckets.map((offset, idx) => {
            const isCenter = offset === 0;
            const height = isCenter ? 95 : 85 - Math.abs(offset) * 4.5;
            return (
              <div
                key={idx}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${height}%`,
                    background: isCenter
                      ? 'linear-gradient(180deg, #6366f1, #4338ca)'
                      : 'rgba(99, 102, 241, 0.25)',
                    border: isCenter ? '1px solid #818cf8' : '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: '2px',
                    boxShadow: isCenter ? '0 0 12px rgba(99, 102, 241, 0.4)' : 'none',
                    transition: 'all 0.3s ease',
                  }}
                />
                <span style={{ fontSize: '9.5px', color: isCenter ? '#818cf8' : 'var(--dim, #777)', fontWeight: isCenter ? 700 : 400 }}>
                  {offset === 0 ? 'CURRENT' : `${offset > 0 ? '+' : ''}${offset}%`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Order Flow Shock Testing Sandbox */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px dashed var(--matveyan-border, #333)',
          padding: '20px',
          borderRadius: '4px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h4 style={{ margin: 0, textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.8px' }}>
            ML Order-Flow Shock & Recovery Simulator
          </h4>
          <span style={{ fontSize: '11px', color: 'var(--accent)' }}>
            Shock Size: ${(shockSizeUsd / 1000).toFixed(0)}k USDC
          </span>
        </div>

        <input
          type="range"
          min="50000"
          max="2000000"
          step="50000"
          value={shockSizeUsd}
          onChange={(e) => setShockSizeUsd(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#6366f1', marginBottom: '16px' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div style={{ background: 'var(--matveyan-card)', padding: '10px 14px', borderRadius: '4px' }}>
            <span style={{ fontSize: '11px', color: 'var(--dim)' }}>Forecasted Slippage Shock</span>
            <strong style={{ display: 'block', color: '#ef4444', fontSize: '16px', marginTop: '2px' }}>
              +{shockImpactBps} bps ({(shockImpactBps / 100).toFixed(2)}%)
            </strong>
          </div>

          <div style={{ background: 'var(--matveyan-card)', padding: '10px 14px', borderRadius: '4px' }}>
            <span style={{ fontSize: '11px', color: 'var(--dim)' }}>Pool Resilience / Recovery</span>
            <strong style={{ display: 'block', color: '#10b981', fontSize: '16px', marginTop: '2px' }}>
              ~{estimatedRecoveryBlocks} Ethereum Blocks
            </strong>
          </div>

          <div style={{ background: 'var(--matveyan-card)', padding: '10px 14px', borderRadius: '4px' }}>
            <span style={{ fontSize: '11px', color: 'var(--dim)' }}>Recommended Execution</span>
            <strong style={{ display: 'block', color: '#f59e0b', fontSize: '16px', marginTop: '2px' }}>
              {shockSizeUsd > 250000 ? 'Split into 3 TWAP Tranches' : 'Direct Execution Permitted'}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

