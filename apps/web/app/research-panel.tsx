'use client';

import { useState, type FormEvent } from 'react';
import {
  createNorthtrail,
  parseAmount,
  type RiskReport,
  type MarketDataset,
} from '@northtrail/sdk';

type Budget = Awaited<ReturnType<ReturnType<typeof createNorthtrail>['execution']['planBudget']>>;
export function ResearchPanel({
  client,
  enabled,
}: {
  client: () => ReturnType<typeof createNorthtrail>;
  enabled: boolean;
}) {
  const [dataset, setDataset] = useState('');
  const [risk, setRisk] = useState<RiskReport | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function analyze(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setRisk(null);
    try {
      setRisk(await client().quant.risk(JSON.parse(dataset) as MarketDataset));
    } catch (reason) {
      setError(
        reason instanceof Error && reason.name === 'ZodError'
          ? 'Dataset does not match the OHLCV schema. Check asset identity, source, interval, timestamps and candle values.'
          : reason instanceof SyntaxError
            ? 'Enter valid JSON for the historical dataset.'
            : reason instanceof Error
              ? reason.message
              : 'Analysis failed.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function plan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setBudget(null);
    const form = new FormData(event.currentTarget);
    try {
      setBudget(
        await client().execution.planBudget({
          amountInRaw: parseAmount(String(form.get('amount')), 6),
          spendingCapRaw: parseAmount(String(form.get('cap')), 6),
          tranches: Number(form.get('tranches')),
          gasPerTransactionWei: parseAmount(String(form.get('gas')), 18),
          gasBudgetWei: parseAmount(String(form.get('gasBudget')), 18),
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Budget check failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel research-panel" id="research" aria-labelledby="research-title">
      <p className="eyebrow">COMPASS + CHRONOS</p>
      <h2 id="research-title">Research with visible limits.</h2>
      <p className="section-description">
        Analyze your historical candles and test a proposed split budget. These tools do not
        forecast an execution advantage or authorize a trade.
      </p>
      <div className="research-grid">
        <form onSubmit={analyze}>
          <h3>Historical Risk Lens</h3>
          <label htmlFor="market-dataset">Historical dataset JSON</label>
          <textarea
            id="market-dataset"
            value={dataset}
            maxLength={262144}
            disabled={busy}
            rows={8}
            required
            spellCheck={false}
            placeholder="Paste a versioned OHLCV dataset with asset identity, source, availability timestamps and asOf."
            onChange={(event) => {
              setDataset(event.target.value);
              setRisk(null);
              setError('');
            }}
          />
          <p className="field-note">
            21–512 consecutive candles for descriptive metrics. Missing intervals cause abstention.
            Data is processed transiently; rights and source accuracy are not verified.
          </p>
          <button className="secondary-button" disabled={!enabled || busy || !dataset.trim()}>
            Analyze historical risk
          </button>
          {risk && (
            <div className="research-result" aria-live="polite">
              <strong>
                {risk.status === 'ABSTAIN'
                  ? 'ABSTAIN — insufficient continuous data'
                  : 'Descriptive research only'}
              </strong>
              <p>
                {risk.asset.symbol} · {risk.observations} candles · {risk.missingIntervals} missing
                intervals
              </p>
              {risk.metrics && (
                <dl>
                  {(
                    [
                      ['Total return', risk.metrics.totalReturn],
                      ['Maximum drawdown', risk.metrics.maxDrawdown],
                      ['Annualized volatility', risk.metrics.annualizedVolatility],
                      ['Historical VaR 95%', risk.metrics.historicalVar95],
                      ['Historical ES 95%', risk.metrics.historicalExpectedShortfall95],
                    ] as const
                  ).map(([label, value]) => (
                    <div className="route-detail" key={label}>
                      <dt>{label}</dt>
                      <dd>{(value * 100).toFixed(2)}%</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="field-note">
                Source: {risk.source} · {risk.provenance} · Model not validated
              </p>
              <a
                className="text-button"
                download="northtrail-risk-research.json"
                href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(risk, null, 2))}`}
              >
                Export risk evidence
              </a>
            </div>
          )}
        </form>
        <form
          onSubmit={plan}
          onChange={() => {
            setBudget(null);
            setError('');
          }}
          className="quote-form"
        >
          <h3>Chronos split budget</h3>
          <label htmlFor="plan-amount">Total input (USDC)</label>
          <input id="plan-amount" name="amount" inputMode="decimal" required disabled={busy} />
          <label htmlFor="plan-cap">Spending cap (USDC)</label>
          <input id="plan-cap" name="cap" inputMode="decimal" required disabled={busy} />
          <label htmlFor="plan-tranches">Number of tranches</label>
          <input
            id="plan-tranches"
            name="tranches"
            type="number"
            min="1"
            max="16"
            required
            disabled={busy}
          />
          <label htmlFor="plan-gas">Assumed gas per swap (ETH)</label>
          <input id="plan-gas" name="gas" inputMode="decimal" required disabled={busy} />
          <label htmlFor="plan-gas-budget">Total gas budget (ETH)</label>
          <input
            id="plan-gas-budget"
            name="gasBudget"
            inputMode="decimal"
            required
            disabled={busy}
          />
          <button className="secondary-button" disabled={!enabled || busy}>
            Check split budget
          </button>
          {budget && (
            <div className="research-result" aria-live="polite">
              <strong>
                {budget.budgetFeasible ? 'Fits supplied budget assumptions' : 'Budget infeasible'}
              </strong>
              <p>Strategy recommendation: ABSTAIN</p>
              <p className="field-note">
                {budget.amountsInRaw.length} tranches · total gas {budget.totalGasWei} wei · extra
                gas {budget.additionalGasWei} wei
              </p>
              {budget.reasons.map((reason) => (
                <p className="field-note" key={reason}>
                  {reason}
                </p>
              ))}
            </div>
          )}
        </form>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
