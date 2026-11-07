'use client';

import { useState } from 'react';
import {
  Globe,
  TrendingDown,
  Activity,
  Shield,
  Layers,
  Search,
  CheckCircle,
} from 'lucide-react';

interface AssetMetric {
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  realizedVol: number;
  ewmaVol: number;
  maxDrawdown: number;
  var95: number;
  es95: number;
  regime: 'QUIET' | 'MODERATE' | 'ELEVATED';
  coveragePct: number;
  candles: number[];
}

const ASSET_UNIVERSE: Record<string, AssetMetric> = {
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    priceUsd: 3333.33,
    change24h: 1.45,
    realizedVol: 0.584,
    ewmaVol: 0.542,
    maxDrawdown: -0.038,
    var95: -0.024,
    es95: -0.036,
    regime: 'MODERATE',
    coveragePct: 99.8,
    candles: [3280, 3295, 3310, 3305, 3320, 3315, 3333.33],
  },
  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    priceUsd: 68450.0,
    change24h: 0.82,
    realizedVol: 0.442,
    ewmaVol: 0.418,
    maxDrawdown: -0.025,
    var95: -0.018,
    es95: -0.028,
    regime: 'QUIET',
    coveragePct: 99.9,
    candles: [67800, 68000, 68250, 68100, 68300, 68400, 68450],
  },
  UNI: {
    symbol: 'UNI',
    name: 'Uniswap Governance',
    priceUsd: 8.42,
    change24h: -2.15,
    realizedVol: 0.785,
    ewmaVol: 0.762,
    maxDrawdown: -0.072,
    var95: -0.045,
    es95: -0.062,
    regime: 'ELEVATED',
    coveragePct: 98.4,
    candles: [8.85, 8.72, 8.6, 8.55, 8.48, 8.45, 8.42],
  },
  DAI: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    priceUsd: 0.9998,
    change24h: 0.01,
    realizedVol: 0.012,
    ewmaVol: 0.009,
    maxDrawdown: -0.001,
    var95: -0.0005,
    es95: -0.0008,
    regime: 'QUIET',
    coveragePct: 100.0,
    candles: [1.0, 0.9997, 0.9999, 1.0, 0.9998, 0.9999, 0.9998],
  },
};

export function UniverseExplorer() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('WETH');
  const [search, setSearch] = useState('');

  const current = ASSET_UNIVERSE[selectedSymbol] || ASSET_UNIVERSE['WETH']!;

  return (
    <section className="panel" id="universe-explorer" style={{ marginTop: '28px' }}>
      <div className="panel-heading">
        <div className="section-icon">
          <Globe size={20} />
        </div>
        <div>
          <p className="eyebrow">HISTORICAL UNIVERSE · RISK LENS</p>
          <h2>Cross-Sectional Asset Volatility & Downside Diagnostics</h2>
        </div>
        <span className="small-badge" style={{ color: 'var(--accent)' }}>
          Point-in-Time Data
        </span>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '14px 0 20px', lineHeight: 1.6 }}>
        Multi-asset historical coverage without survivorship bias. Evaluates realized volatility,
        downside semi-variance, Value-at-Risk (VaR 95%), and Expected Shortfall under calibrated market regimes.
      </p>

      {/* Token Pill Selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {Object.keys(ASSET_UNIVERSE).map((sym) => {
          const item = ASSET_UNIVERSE[sym]!;
          const active = selectedSymbol === sym;
          return (
            <button
              key={sym}
              type="button"
              onClick={() => setSelectedSymbol(sym)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                background: active ? 'var(--badge-bg)' : 'transparent',
                border: active ? '1px solid var(--accent)' : '1px solid var(--line)',
                color: active ? 'var(--accent)' : 'var(--ink)',
                borderRadius: '4px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>{item.symbol}</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>${item.priceUsd.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      {/* Main Asset Stats Card */}
      <div
        style={{
          background: 'var(--badge-bg)',
          border: '1px solid var(--line)',
          borderRadius: '4px',
          padding: '20px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              {current.name} ({current.symbol})
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Ethereum Mainnet · Point-in-time Observation Window
            </span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
              ${current.priceUsd.toLocaleString()}
            </div>
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: 600,
                color: current.change24h >= 0 ? '#10b981' : '#ef4444',
              }}
            >
              {current.change24h >= 0 ? '+' : ''}{current.change24h}% (24h)
            </span>
          </div>
        </div>

        {/* Mini Sparkline / Trend visualization */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '48px', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            {current.candles.map((val, idx) => {
              const min = Math.min(...current.candles);
              const max = Math.max(...current.candles);
              const heightPct = Math.max(15, Math.min(100, ((val - min) / (max - min || 1)) * 100));
              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    height: `${heightPct}%`,
                    background: current.change24h >= 0 ? '#10b981' : '#ef4444',
                    opacity: 0.6 + (idx / current.candles.length) * 0.4,
                    borderRadius: '2px',
                  }}
                  title={`Step ${idx + 1}: $${val}`}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--dim)', marginTop: '4px' }}>
            <span>-24h Window</span>
            <span>Current State</span>
          </div>
        </div>

        {/* Quantitative Risk Metric Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
          <div style={{ padding: '10px 12px', background: 'var(--input-bg)', borderRadius: '3px' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>Realized Vol (Ann.)</span>
            <strong style={{ fontSize: '14px', fontFamily: 'ui-monospace, monospace' }}>
              {(current.realizedVol * 100).toFixed(1)}%
            </strong>
          </div>

          <div style={{ padding: '10px 12px', background: 'var(--input-bg)', borderRadius: '3px' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>EWMA Volatility</span>
            <strong style={{ fontSize: '14px', fontFamily: 'ui-monospace, monospace' }}>
              {(current.ewmaVol * 100).toFixed(1)}%
            </strong>
          </div>

          <div style={{ padding: '10px 12px', background: 'var(--input-bg)', borderRadius: '3px' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>VaR 95% (1-Day)</span>
            <strong style={{ fontSize: '14px', color: '#ef4444', fontFamily: 'ui-monospace, monospace' }}>
              {(current.var95 * 100).toFixed(1)}%
            </strong>
          </div>

          <div style={{ padding: '10px 12px', background: 'var(--input-bg)', borderRadius: '3px' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>Expected Shortfall 95%</span>
            <strong style={{ fontSize: '14px', color: '#ef4444', fontFamily: 'ui-monospace, monospace' }}>
              {(current.es95 * 100).toFixed(1)}%
            </strong>
          </div>

          <div style={{ padding: '10px 12px', background: 'var(--input-bg)', borderRadius: '3px' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>Regime Class</span>
            <strong style={{ fontSize: '12px', color: current.regime === 'QUIET' ? '#10b981' : current.regime === 'MODERATE' ? 'var(--accent)' : '#ef4444' }}>
              {current.regime}
            </strong>
          </div>

          <div style={{ padding: '10px 12px', background: 'var(--input-bg)', borderRadius: '3px' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>Sample Completeness</span>
            <strong style={{ fontSize: '14px', color: '#10b981', fontFamily: 'ui-monospace, monospace' }}>
              {current.coveragePct}%
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

