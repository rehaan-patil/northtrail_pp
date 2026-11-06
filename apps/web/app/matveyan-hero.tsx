'use client';

import { Sun, Moon, ArrowDownRight, ShieldCheck, Terminal } from 'lucide-react';

interface MatveyanHeroProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onExploreQuotes: () => void;
}

export function MatveyanHero({ theme, onToggleTheme, onExploreQuotes }: MatveyanHeroProps) {
  return (
    <section
      style={{
        backgroundColor: 'var(--matveyan-bg)',
        borderBottom: '1px solid var(--matveyan-border)',
        padding: '48px 24px 36px',
        transition: 'background-color 0.25s ease, color 0.25s ease',
      }}
    >
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Top Tag & Theme Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 12px',
              backgroundColor: 'var(--matveyan-tag-bg)',
              border: '1px solid var(--matveyan-border)',
              borderRadius: '2px',
              fontSize: '11px',
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: '1px',
              color: 'var(--matveyan-accent)',
              fontWeight: 600,
            }}
          >
            <span>NORTHTRAIL</span>
            <span>×</span>
            <span>DEFI EXECUTION ASSURANCE</span>
          </div>

          <button
            onClick={onToggleTheme}
            aria-label="Toggle Light/Dark Theme"
            style={{
              background: 'transparent',
              border: '1px solid var(--matveyan-border)',
              color: 'var(--matveyan-text)',
              padding: '6px 12px',
              borderRadius: '2px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            <span>{theme.toUpperCase()} MODE</span>
          </button>
        </div>

        {/* Signature Matveyan Headline */}
        <h1
          style={{
            color: 'var(--matveyan-text)',
            fontSize: 'clamp(28px, 4vw, 42px)',
            fontWeight: 300,
            lineHeight: 1.25,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            margin: '0 0 16px 0',
          }}
        >
          UI <span style={{ color: 'var(--matveyan-accent)' }}>×</span> UX FOR CAPITAL, DATA AND CONTROL
        </h1>

        {/* Sub-headline */}
        <p
          style={{
            color: 'var(--matveyan-text-muted)',
            fontSize: '15px',
            lineHeight: 1.6,
            maxWidth: '680px',
            margin: '0 0 28px 0',
            fontWeight: 400,
          }}
        >
          Non-custodial DeFi infrastructure for amount-dependent Uniswap pool discovery, 
          1inch cross-DEX benchmarking, and mathematically verifiable on-chain trade settlement.
        </p>

        {/* Action Button Row */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '36px' }}>
          <button onClick={onExploreQuotes} className="matveyan-dashed-btn">
            Observe Trade Quotes <ArrowDownRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          </button>

          <span style={{ fontSize: '12px', color: 'var(--matveyan-text-dim)', fontFamily: 'ui-monospace, monospace' }}>
            Zero Custody · Local Verification
          </span>
        </div>

        {/* Technical Data Badges (Bento Style) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            paddingTop: '20px',
            borderTop: '1px solid var(--matveyan-border)',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--matveyan-surface)',
              border: '1px solid var(--matveyan-border)',
            }}
          >
            <div style={{ fontSize: '10px', color: 'var(--matveyan-text-dim)', letterSpacing: '1px' }}>PAIR SPECIFICATION</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--matveyan-text)', marginTop: '4px', fontFamily: 'ui-monospace, monospace' }}>
              USDC / WETH · Mainnet (1)
            </div>
          </div>

          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--matveyan-surface)',
              border: '1px solid var(--matveyan-border)',
            }}
          >
            <div style={{ fontSize: '10px', color: 'var(--matveyan-text-dim)', letterSpacing: '1px' }}>ROUTING PROTOCOL</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--matveyan-text)', marginTop: '4px', fontFamily: 'ui-monospace, monospace' }}>
              Uniswap v3 / v4 Dual-Route
            </div>
          </div>

          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--matveyan-surface)',
              border: '1px solid var(--matveyan-border)',
            }}
          >
            <div style={{ fontSize: '10px', color: 'var(--matveyan-text-dim)', letterSpacing: '1px' }}>SETTLEMENT PROOF</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--matveyan-text)', marginTop: '4px', fontFamily: 'ui-monospace, monospace' }}>
              CANONICAL_RECEIPT · Status 1
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}