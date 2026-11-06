'use client';

import { useState } from 'react';

export default function AgentGuardPage() {
  const [mandate] = useState({
    id: 'mandate-chronos-eth-1',
    agentAddress: '0x2b4f8d9a2c3e1...e589',
    humanId: 'world-id-human-9941',
    chain: 'World Chain (eip155:480)',
    dailyCap: 300,
    consumed: 100,
  });

  const [tradeAmount, setTradeAmount] = useState('500');
  const [evalResult, setEvalResult] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [passActive, setPassActive] = useState<any>(null);

  const handleEvaluate = () => {
    const amountNum = parseFloat(tradeAmount);
    if (mandate.consumed + amountNum > mandate.dailyCap && !passActive) {
      setEvalResult({
        decision: 'BLOCKED_CAP_EXCEEDED',
        message: `Trade of ${amountNum} USDC exceeds remaining daily limit (${mandate.dailyCap - mandate.consumed} USDC).`,
      });
    } else {
      setEvalResult({
        decision: passActive ? 'PERMITTED_VIA_WORLD_PASS' : 'PERMITTED_WITHIN_CAP',
        message: passActive
          ? 'Trade permitted via verified World Agent Pass (Nullifier consumed).'
          : 'Trade is within authorized daily bot budget.',
      });
    }
  };

  const handleSimulateWorldID = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setPassActive({
        passId: 'world-pass-live-001',
        nullifierHash: '0x9fa4c7b8e1a72d3...b84',
        verificationLevel: 'orb',
        status: 'ACTIVE',
      });
      setIsVerifying(false);
    }, 1000);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
      <h2>World Agent Pass · Human Control Loop</h2>
      <p style={{ color: '#888', marginBottom: '24px' }}>
        AgentBook registry on World Chain (eip155:480) with cryptographic human-in-the-loop oversight.
      </p>

      {/* AgentBook Identity Card */}
      <div style={{ border: '1px solid #222', borderRadius: '8px', padding: '16px', marginBottom: '20px', background: '#0a0a0a' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#10b981' }}>● AgentBook Verified (World Chain eip155:480)</h4>
        <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#ccc' }}>
          <div><strong>Agent Address:</strong> <code>{mandate.agentAddress}</code></div>
          <div><strong>Linked Human ID:</strong> <code>{mandate.humanId}</code></div>
          <div><strong>Daily Spending Cap:</strong> {mandate.dailyCap} USDC (Consumed: <span style={{ color: '#f59e0b' }}>{mandate.consumed} USDC</span>)</div>
          <div><strong>Remaining Budget:</strong> <span style={{ color: '#10b981' }}>{mandate.dailyCap - mandate.consumed} USDC</span></div>
        </div>
      </div>

      {/* Trade Simulation */}
      <div style={{ border: '1px solid #333', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px' }}>
          Simulated AI Agent Trade Size (USDC):
        </label>
        <input
          type="number"
          value={tradeAmount}
          onChange={(e) => setTradeAmount(e.target.value)}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #444', background: '#111', color: '#fff', marginBottom: '12px' }}
        />
        <button
          onClick={handleEvaluate}
          style={{ width: '100%', padding: '10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Evaluate Agent Mandate Policy
        </button>
      </div>

      {/* Evaluation Output */}
      {evalResult && (
        <div style={{
          border: `1px solid ${evalResult.decision === 'BLOCKED_CAP_EXCEEDED' ? '#ef4444' : '#10b981'}`,
          borderRadius: '8px',
          padding: '16px',
          background: evalResult.decision === 'BLOCKED_CAP_EXCEEDED' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <strong>{evalResult.decision === 'BLOCKED_CAP_EXCEEDED' ? '⚠️ POLICY BLOCKED' : '✅ POLICY CLEARED'}</strong>
            <span style={{ fontSize: '12px' }}>{evalResult.decision}</span>
          </div>
          <p style={{ margin: 0, fontSize: '13px' }}>{evalResult.message}</p>

          {evalResult.decision === 'BLOCKED_CAP_EXCEEDED' && !passActive && (
            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px' }}>Elevate Spending Cap via World ID:</span>
              <button
                onClick={handleSimulateWorldID}
                disabled={isVerifying}
                style={{ padding: '8px 16px', background: '#fff', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {isVerifying ? 'Verifying ZK Proof...' : 'Verify with World ID (Orb)'}
              </button>
            </div>
          )}
        </div>
      )}

      {passActive && (
        <div style={{ marginTop: '16px', border: '1px solid #10b981', borderRadius: '8px', padding: '12px', background: 'rgba(16,185,129,0.05)', fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
          <span>Active Pass: <code>{passActive.nullifierHash}</code> (Orb Verified)</span>
          <strong style={{ color: '#10b981' }}>READY TO SIGN</strong>
        </div>
      )}
    </div>
  );
}