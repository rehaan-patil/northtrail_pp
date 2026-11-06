import { describe, expect, it } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { readEnvironment } from '../packages/config/src/index.js';
import { connectDatabase, migrate } from '../packages/db/src/index.js';
import { createNorthtrail } from '../packages/sdk/src/index.js';
import { analyzeHistoricalRisk, planExecutionBudget } from '../packages/compass/src/index.js';
import { type MarketDataset } from '../packages/domain/src/index.js';
import { WETH } from '../packages/config/src/index.js';

export function marketFixture(): MarketDataset {
  const start = Date.parse('2026-01-01T00:00:00Z');
  return {
    schemaVersion: '1',
    asset: WETH,
    quoteCurrency: 'USD',
    source: 'Invented unit-test prices',
    datasetVersion: 'fixture-v1',
    provenance: 'SYNTHETIC_FIXTURE',
    storageRights: 'UNKNOWN',
    intervalSeconds: 86400,
    asOf: '2026-02-01T00:00:00Z',
    candles: Array.from({ length: 21 }, (_, i) => ({
      openTime: new Date(start + i * 86400000).toISOString(),
      closeTime: new Date(start + (i + 1) * 86400000).toISOString(),
      availableAt: new Date(start + (i + 1) * 86400000).toISOString(),
      open: 100,
      high: 100,
      low: i === 20 ? 80 : 100,
      close: i === 20 ? 80 : 100,
      volume: 1,
    })),
  };
}

describe('historical risk without execution or forecasting claims', () => {
  it('runs research through API and SDK schemas', async () => {
    const db = await connectDatabase({ driver: 'pglite' });
    await migrate(db);
    const app = await buildApp(readEnvironment({ NODE_ENV: 'test' }), db);
    try {
      const sdk = createNorthtrail({ baseUrl: await app.listen({ host: '127.0.0.1', port: 0 }) });
      expect((await sdk.quant.risk(marketFixture())).status).toBe('DESCRIPTIVE_ONLY');
      expect((await sdk.recoverTrade({ state: 'SIGNED', issue: 'WALLET_REJECTED' })).action).toBe(
        'RECONCILE_CHAIN',
      );
      const result = await sdk.execution.planBudget({
        amountInRaw: '101',
        spendingCapRaw: '101',
        tranches: 2,
        gasPerTransactionWei: '10',
        gasBudgetWei: '20',
      });
      expect(result.amountsInRaw).toEqual(['51', '50']);
      expect(result.executionAuthorized).toBe(false);
      const invalid = marketFixture();
      invalid.asOf = invalid.candles[0]!.openTime;
      await expect(sdk.quant.risk(invalid)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    } finally {
      await app.close();
      await db.close();
    }
  });

  it('computes hand-verifiable drawdown, loss VaR and ES, preserving dataset identity', async () => {
    const result = await analyzeHistoricalRisk(marketFixture());
    expect(result.status).toBe('DESCRIPTIVE_ONLY');
    expect(result.metrics!.totalReturn).toBeCloseTo(-0.2);
    expect(result.metrics!.maxDrawdown).toBeCloseTo(0.2);
    expect(result.metrics!.historicalVar95).toBe(0);
    expect(result.metrics!.historicalExpectedShortfall95).toBeCloseTo(0.2);
    expect(result.metrics!.sampleVolatility).toBeCloseTo(Math.sqrt(0.002));
    expect(result.modelEligibility).toBe('NOT_VALIDATED');
    expect(result.executionAuthorized).toBe(false);
    const changed = marketFixture();
    changed.asset.address = '0x1111111111111111111111111111111111111111';
    expect((await analyzeHistoricalRisk(changed)).datasetDigest).not.toBe(result.datasetDigest);
  });

  it.each(['future', 'before-close', 'overlap', 'reversed', 'ohlc', 'interval', 'nan'])(
    'rejects %s data',
    async (change) => {
      const data = marketFixture();
      if (change === 'future') data.asOf = '2026-01-10T00:00:00Z';
      if (change === 'before-close') data.candles[0]!.availableAt = data.candles[0]!.openTime;
      if (change === 'overlap') data.candles[1] = { ...data.candles[0]! };
      if (change === 'reversed') data.candles.reverse();
      if (change === 'ohlc') data.candles[0]!.high = 99;
      if (change === 'interval') data.intervalSeconds = 3600;
      if (change === 'nan') data.candles[0]!.close = NaN;
      await expect(analyzeHistoricalRisk(data)).rejects.toThrow();
    },
  );

  it('abstains on gaps and short history without bridging missing returns', async () => {
    const data = marketFixture();
    data.candles.splice(5, 1);
    const result = await analyzeHistoricalRisk(data);
    expect(result.missingIntervals).toBe(1);
    expect(result.metrics).toBeNull();
    expect(result.status).toBe('ABSTAIN');
    data.candles = data.candles.slice(0, 3);
    expect((await analyzeHistoricalRisk(data)).status).toBe('ABSTAIN');
  });

  it('constant prices produce zero risk metrics without NaN', async () => {
    const data = marketFixture();
    data.candles[20]!.close = 100;
    const result = await analyzeHistoricalRisk(data);
    expect(Object.values(result.metrics!).every((value) => value === 0)).toBe(true);
  });
});

describe('Chronos exact budget baseline', () => {
  const request = {
    amountInRaw: '100000000000000000001',
    spendingCapRaw: '100000000000000000001',
    tranches: 3,
    gasPerTransactionWei: '11',
    gasBudgetWei: '33',
  };

  it('conserves base units and charges every tranche while abstaining on strategy advantage', () => {
    const result = planExecutionBudget(request);
    expect(result.amountsInRaw.reduce((sum, amount) => sum + BigInt(amount), 0n)).toBe(
      BigInt(request.amountInRaw),
    );
    expect(result.totalGasWei).toBe('33');
    expect(result.additionalGasWei).toBe('22');
    expect(result.budgetFeasible).toBe(true);
    expect(result.recommendation).toBe('ABSTAIN');
  });

  it.each([{ gasBudgetWei: '32' }, { spendingCapRaw: '1' }, { amountInRaw: '2' }])(
    'refuses infeasible budgets %j',
    (change) => {
      expect(planExecutionBudget({ ...request, ...change }).budgetFeasible).toBe(false);
    },
  );
});