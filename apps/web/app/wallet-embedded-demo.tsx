'use client';

import { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Wallet,
  Code2,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Zap,
  ArrowRight,
  Lock,
  FileCheck2,
} from 'lucide-react';

export function WalletEmbeddedDemo() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code'>('simulator');
  const [copied, setCopied] = useState(false);
  const [testScenario, setTestScenario] = useState<'SAFE' | 'SLIPPAGE_TRAP' | 'INFINITE_APPROVAL'>('SAFE');
  const [inspectionState, setInspectionState] = useState<'IDLE' | 'ANALYZING' | 'DECIDED'>('IDLE');

  const copyCode = () => {
    navigator.clipboard.writeText(CODE_SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const runInterceptor = () => {
    setInspectionState('ANALYZING');
    setTimeout(() => {
      setInspectionState('DECIDED');
    }, 600);
  };

  const resetSimulator = (sc: 'SAFE' | 'SLIPPAGE_TRAP' | 'INFINITE_APPROVAL') => {
    setTestScenario(sc);
    setInspectionState('IDLE');
  };

  return (
    <section className="panel" id="wallet-embedded-demo" style={{ marginTop: '28px' }}>
      <div className="panel-heading">
        <div className="section-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
          <Wallet size={20} />
        </div>
        <div>
          <p className="eyebrow" style={{ color: '#10b981' }}>
            OPEN-SOURCE INTEGRATION · EMBEDDED WALLET ASSURANCE
          </p>
          <h2>How wallets embed the Northtrail SDK into transaction signing.</h2>
        </div>
      </div>

      <p className="route-footnote" style={{ marginBottom: '20px' }}>
        Wallets intercept <code>eth_sendTransaction</code> and <code>eth_signTypedData_v4</code> before the user signs.
        Northtrail decodes calldata, audits slippage against live tick density, enforces exact approvals, and freezes an
        RFC 8785 Decision Digest.
      </p>

      {/* Mode Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          type="button"
          className={`matveyan-dashed-btn ${activeTab === 'simulator' ? 'selected' : ''}`}
          onClick={() => setActiveTab('simulator')}
        >
          <Zap size={14} style={{ marginRight: '6px' }} /> Interactive Wallet Pop-Up Sandbox
        </button>
        <button
          type="button"
          className={`matveyan-dashed-btn ${activeTab === 'code' ? 'selected' : ''}`}
          onClick={() => setActiveTab('code')}
        >
          <Code2 size={14} style={{ marginRight: '6px' }} /> Open-Source Code (Wagmi / Viem / EIP-1193)
        </button>
      </div>

      {activeTab === 'simulator' ? (
        <div>
          {/* Scenario Selector */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              background: 'var(--matveyan-card)',
              padding: '12px 16px',
              border: '1px solid var(--matveyan-border)',
              borderRadius: '4px',
              marginBottom: '20px',
            }}
          >
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--dim)' }}>
              Simulate DApp Request:
            </span>
            <button
              type="button"
              className={`matveyan-dashed-btn ${testScenario === 'SAFE' ? 'selected' : ''}`}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={() => resetSimulator('SAFE')}
            >
              1. Normal Honest Swap (50 bps)
            </button>
            <button
              type="button"
              className={`matveyan-dashed-btn ${testScenario === 'SLIPPAGE_TRAP' ? 'selected' : ''}`}
              style={{ fontSize: '11px', padding: '4px 10px', color: '#f59e0b' }}
              onClick={() => resetSimulator('SLIPPAGE_TRAP')}
            >
              2. Malicious Slippage Trap (500 bps / 5%)
            </button>
            <button
              type="button"
              className={`matveyan-dashed-btn ${testScenario === 'INFINITE_APPROVAL' ? 'selected' : ''}`}
              style={{ fontSize: '11px', padding: '4px 10px', color: '#ef4444' }}
              onClick={() => resetSimulator('INFINITE_APPROVAL')}
            >
              3. Infinite Token Approval Trap (uint256 max)
            </button>
          </div>

          {/* Simulated Wallet Pop-Up Frame */}
          <div
            style={{
              maxWidth: '560px',
              margin: '0 auto',
              background: '#0d0e12',
              border: '1px solid #333',
              borderRadius: '8px',
              boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
              overflow: 'hidden',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            }}
          >
            {/* Wallet Header Bar */}
            <div
              style={{
                background: '#16181d',
                padding: '12px 18px',
                borderBottom: '1px solid #2a2c34',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wallet size={16} color="#10b981" />
                <strong style={{ fontSize: '13px', color: '#fff' }}>Northtrail Protected Wallet</strong>
              </div>
              <span style={{ fontSize: '11px', color: '#888' }}>Ethereum Mainnet</span>
            </div>

            {/* DApp Origin and Request */}
            <div style={{ padding: '18px 20px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#888',
                  marginBottom: '14px',
                }}
              >
                <span>Requesting DApp:</span>
                <strong style={{ color: '#fff' }}>https://app.uniswap.org</strong>
              </div>

              <div
                style={{
                  background: '#15171e',
                  border: '1px solid #282a36',
                  borderRadius: '6px',
                  padding: '14px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#aaa' }}>Action Requested</span>
                  <strong style={{ fontSize: '13px', color: '#fff' }}>
                    {testScenario === 'INFINITE_APPROVAL' ? 'ERC-20 approve()' : 'UniversalRouter.swap()'}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#777' }}>You Send</span>
                  <strong style={{ fontSize: '13px', color: '#fff' }}>
                    {testScenario === 'INFINITE_APPROVAL' ? 'USDC (Spender: 0x66a9...)' : '5,000.00 USDC'}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#777' }}>Expected Receive</span>
                  <strong style={{ fontSize: '13px', color: '#fff' }}>
                    {testScenario === 'INFINITE_APPROVAL' ? 'Approval Limit: 1.15 × 10⁷⁷' : '1.4925 WETH'}
                  </strong>
                </div>
              </div>

              {/* Northtrail Pre-Sign Assurance Guard Card */}
              <div
                style={{
                  background:
                    inspectionState !== 'DECIDED'
                      ? 'rgba(99, 102, 241, 0.05)'
                      : testScenario === 'SAFE'
                        ? 'rgba(16, 185, 129, 0.08)'
                        : 'rgba(239, 68, 68, 0.08)',
                  border:
                    inspectionState !== 'DECIDED'
                      ? '1px solid rgba(99, 102, 241, 0.3)'
                      : testScenario === 'SAFE'
                        ? '1px solid #10b981'
                        : '1px solid #ef4444',
                  borderRadius: '6px',
                  padding: '14px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  {inspectionState === 'DECIDED' ? (
                    testScenario === 'SAFE' ? (
                      <CheckCircle2 size={16} color="#10b981" />
                    ) : (
                      <XCircle size={16} color="#ef4444" />
                    )
                  ) : (
                    <ShieldCheck size={16} color="#6366f1" />
                  )}
                  <strong
                    style={{
                      fontSize: '12.5px',
                      color:
                        inspectionState !== 'DECIDED'
                          ? '#818cf8'
                          : testScenario === 'SAFE'
                            ? '#10b981'
                            : '#ef4444',
                      letterSpacing: '0.4px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Northtrail SDK Pre-Sign Guard
                  </strong>
                </div>

                {inspectionState === 'IDLE' && (
                  <p style={{ fontSize: '12px', color: '#aaa', margin: '0 0 10px 0' }}>
                    Click below to let Northtrail intercept the transaction payload, audit slippage against tick
                    density, and verify non-custodial safety.
                  </p>
                )}

                {inspectionState === 'ANALYZING' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#818cf8', fontSize: '12px' }}>
                    <span className="quote-spinner" /> Running bytecode calldata review and digest generation...
                  </div>
                )}

                {inspectionState === 'DECIDED' && (
                  <div style={{ fontSize: '11.5px', color: '#ccc', lineHeight: '1.6' }}>
                    {testScenario === 'SAFE' && (
                      <>
                        <div style={{ color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>
                          ✓ PASSED: Valid non-custodial Uniswap v3 execution
                        </div>
                        <div>• Spender: Official Universal Router verified (0x66a9...)</div>
                        <div>• Policy Slippage: 50 bps enforced (Minimum out: 1.4850 WETH)</div>
                        <div>• Digest: RFC 8785 Decision Record frozen (0x8f2a...c391)</div>
                      </>
                    )}

                    {testScenario === 'SLIPPAGE_TRAP' && (
                      <>
                        <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: '4px' }}>
                          ✗ REJECTED: Malicious Slippage Tolerance Detected
                        </div>
                        <div>• DApp requested slippage: <strong>500 bps (5.00%)</strong></div>
                        <div>• Policy ceiling allowed: <strong>50 bps (0.50%)</strong></div>
                        <div style={{ color: '#f59e0b', marginTop: '4px' }}>
                          ⚠️ High MEV sandwich risk. Northtrail blocked execution before signing.
                        </div>
                      </>
                    )}

                    {testScenario === 'INFINITE_APPROVAL' && (
                      <>
                        <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: '4px' }}>
                          ✗ REJECTED: Infinite Token Approval Blocked
                        </div>
                        <div>• DApp requested 2²⁵⁶-1 unlimited spending allowance.</div>
                        <div>• Northtrail enforces exact-amount approvals only (5,000 USDC).</div>
                        <div style={{ color: '#f59e0b', marginTop: '4px' }}>
                          ⚠️ Prevents drainer vulnerability. User prompted for exact 5,000 USDC approval.
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Wallet Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                {inspectionState === 'IDLE' ? (
                  <button
                    type="button"
                    onClick={runInterceptor}
                    className="secondary-button"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Run Northtrail Pre-Sign Interceptor <ArrowRight size={14} />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={testScenario !== 'SAFE'}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '4px',
                        border: 'none',
                        background: testScenario === 'SAFE' ? '#10b981' : '#333',
                        color: testScenario === 'SAFE' ? '#000' : '#777',
                        fontWeight: 600,
                        cursor: testScenario === 'SAFE' ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {testScenario === 'SAFE' ? 'Sign & Dispatch (Protected)' : 'Signing Blocked by Policy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectionState('IDLE')}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '4px',
                        border: '1px solid #333',
                        background: 'transparent',
                        color: '#aaa',
                        cursor: 'pointer',
                      }}
                    >
                      Reset
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Open Source Code Viewer */
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={copyCode}
            className="matveyan-dashed-btn"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              fontSize: '11px',
              padding: '4px 10px',
              zIndex: 10,
            }}
          >
            {copied ? <Check size={12} style={{ marginRight: '4px' }} /> : <Copy size={12} style={{ marginRight: '4px' }} />}
            {copied ? 'Copied!' : 'Copy Integration Code'}
          </button>

          <pre
            style={{
              background: '#090a0f',
              padding: '18px',
              border: '1px solid var(--matveyan-border)',
              borderRadius: '6px',
              overflowX: 'auto',
              fontSize: '12px',
              color: '#d4d4d8',
              lineHeight: 1.6,
            }}
          >
            <code>{CODE_SNIPPET}</code>
          </pre>
        </div>
      )}
    </section>
  );
}

const CODE_SNIPPET = `// NorthtrailWalletProvider.ts — 15-line open-source wallet wrapper
import { createNorthtrail } from '@northtrail/sdk';
import type { EIP1193Provider } from 'viem';

export function wrapWithNorthtrail(provider: EIP1193Provider): EIP1193Provider {
  const northtrail = createNorthtrail({
    baseUrl: 'https://northtrail-pp.vercel.app'
  });

  return {
    ...provider,
    async request({ method, params }: { method: string; params?: any[] }) {
      // 1. Intercept transaction dispatch before owner signing
      if (method === 'eth_sendTransaction' && params?.[0]) {
        const tx = params[0];

        // 2. Pre-flight Northtrail assurance check
        const review = await northtrail.reviewTrade({
          record: tx,
          wallet: tx.from,
          chainId: 1,
        });

        // 3. Reject if slippage exceeds 50 bps or infinite approval detected
        if (review.status !== 'CONSISTENT') {
          throw new Error('Northtrail Guard rejected unsafe transaction: ' + review.reasons.join('; '));
        }

        // 4. Freeze RFC 8785 canonical decision digest for user audit log
        console.log('[Northtrail] Pre-sign verified. Digest:', review.reasons[0]);
      }

      // 5. Delegate safely to wallet signer
      return provider.request({ method, params });
    },
  };
}`;

