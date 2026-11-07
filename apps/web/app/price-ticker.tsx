'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, Radio } from 'lucide-react';

export interface CoinPrice {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  lastTick: 'up' | 'down' | 'neutral';
}

const INITIAL_COINS: CoinPrice[] = [
  { symbol: 'ETH', name: 'Ethereum', price: 3348.50, change24h: 3.42, high24h: 3410.00, low24h: 3280.00, lastTick: 'up' },
  { symbol: 'BTC', name: 'Bitcoin', price: 88450.00, change24h: 2.15, high24h: 89200.00, low24h: 86900.00, lastTick: 'up' },
  { symbol: 'SOL', name: 'Solana', price: 198.40, change24h: -1.05, high24h: 204.50, low24h: 194.20, lastTick: 'down' },
  { symbol: 'UNI', name: 'Uniswap', price: 9.85, change24h: 5.80, high24h: 10.15, low24h: 9.20, lastTick: 'up' },
  { symbol: 'LINK', name: 'Chainlink', price: 18.35, change24h: 4.12, high24h: 18.90, low24h: 17.40, lastTick: 'up' },
  { symbol: 'AAVE', name: 'Aave', price: 184.20, change24h: -0.45, high24h: 189.00, low24h: 181.50, lastTick: 'down' },
  { symbol: 'USDC', name: 'USD Coin', price: 1.0001, change24h: 0.01, high24h: 1.0005, low24h: 0.9998, lastTick: 'neutral' },
  { symbol: 'USDT', name: 'Tether', price: 0.9998, change24h: -0.02, high24h: 1.0002, low24h: 0.9995, lastTick: 'neutral' },
  { symbol: 'DAI', name: 'Dai', price: 1.0000, change24h: 0.00, high24h: 1.0004, low24h: 0.9996, lastTick: 'neutral' },
];

export function PriceTicker() {
  const [coins, setCoins] = useState<CoinPrice[]>(INITIAL_COINS);
  const [latency, setLatency] = useState(118);
  const [blockNumber, setBlockNumber] = useState(21045920);

  // Live real-time tick fluctuation simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setCoins((prev) =>
        prev.map((coin) => {
          if (coin.symbol === 'USDC' || coin.symbol === 'USDT' || coin.symbol === 'DAI') {
            // Stablecoin micro-drift ±0.0002
            const delta = (Math.random() - 0.5) * 0.0002;
            const newPrice = Math.max(0.999, Math.min(1.001, coin.price + delta));
            return {
              ...coin,
              price: parseFloat(newPrice.toFixed(4)),
              lastTick: delta >= 0 ? 'up' : 'down',
            };
          }

          // Crypto volatility ±0.15% per tick
          const pct = (Math.random() - 0.48) * 0.0025;
          const newPrice = coin.price * (1 + pct);
          const lastTick = pct >= 0 ? 'up' : 'down';
          return {
            ...coin,
            price: parseFloat(newPrice.toFixed(coin.price > 100 ? 2 : 3)),
            lastTick,
            change24h: parseFloat((coin.change24h + pct * 5).toFixed(2)),
          };
        })
      );

      // Latency jitter (95ms - 145ms)
      setLatency(Math.floor(95 + Math.random() * 50));
      if (Math.random() > 0.8) {
        setBlockNumber((b) => b + 1);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        background: 'var(--matveyan-card, #121316)',
        borderBottom: '1px solid var(--matveyan-border, #222)',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12px',
        fontFamily: 'ui-monospace, monospace',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        gap: '24px',
      }}
    >
      {/* Live Status indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '170px' }}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 8px #10b981',
            display: 'inline-block',
          }}
        />
        <span style={{ color: '#10b981', fontWeight: 600 }}>LIVE FEED</span>
        <span style={{ color: 'var(--dim, #666)' }}>· {latency}ms · #{blockNumber}</span>
      </div>

      {/* Ticker Items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '22px', flex: 1 }}>
        {coins.map((c) => (
          <div
            key={c.symbol}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.3s ease',
            }}
          >
            <strong style={{ color: 'var(--fg, #eee)', fontWeight: 600 }}>{c.symbol}</strong>
            <span
              style={{
                color:
                  c.lastTick === 'up'
                    ? '#10b981'
                    : c.lastTick === 'down'
                      ? '#ef4444'
                      : 'var(--muted, #888)',
                fontWeight: 600,
                transition: 'color 0.4s ease',
              }}
            >
              ${c.price.toLocaleString('en-US', { minimumFractionDigits: c.price > 100 ? 2 : 4 })}
            </span>
            <span
              style={{
                fontSize: '10px',
                color: c.change24h >= 0 ? '#10b981' : '#ef4444',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              {c.change24h >= 0 ? '+' : ''}
              {c.change24h}%
              {c.change24h >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

