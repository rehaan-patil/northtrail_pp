import { test, expect } from '@playwright/test';
import { normalizeQuote } from '../../integrations/uniswap/src/index.js';
import { providerQuoteFixture, quoteRequestFixture } from '../quote-fixtures.js';
import { normalizeOneinchQuote } from '../../integrations/oneinch/src/index.js';
import { oneinchQuoteFixture } from '../quote-fixtures.js';
import { WETH } from '../../packages/config/src/index.js';

test('receipt success remains explicitly separate from token settlement', async ({ page }) => {
  await page.route('**/v1/status', async (route) => {
    const response = await route.fetch();
    const status = await response.json();
    status.capabilities.find((capability: { id: string }) => capability.id === 'proof').available =
      true;
    await route.fulfill({ json: status });
  });
  await page.route('**/v1/proofs/receipt', async (route) => {
    await route.fulfill({
      json: {
        kind: 'CHAIN_RECEIPT_OBSERVATION',
        ...route.request().postDataJSON(),
        status: 'CANONICAL_SUCCESS',
        observedAt: new Date().toISOString(),
        blockHash: `0x${'2'.repeat(64)}`,
        blockNumber: '16',
        confirmations: '3',
        from: quoteRequestFixture().owner,
        to: WETH.address,
        gasPaidWei: '21000000000000',
        settlementVerified: false,
        finality: 'NOT_ESTABLISHED',
        limitations: ['Synthetic browser fixture.'],
      },
    });
  });
  await page.goto('/');
  await page.getByLabel('Ethereum transaction hash').fill(`0x${'1'.repeat(64)}`);
  await page.getByRole('button', { name: 'Observe chain receipt' }).click();
  await expect(page.getByText('CANONICAL SUCCESS', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Token settlement not verified · Finality not established'),
  ).toBeVisible();
  await expect(page.getByText('Execution gas: 0.000021 ETH')).toBeVisible();
  await page.getByLabel('Ethereum transaction hash').fill(`0x${'3'.repeat(64)}`);
  await expect(page.getByText('CANONICAL SUCCESS', { exact: true })).toHaveCount(0);
});

test('scenario, immutable export, and tamper detection connect through the review workspace', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Before your next move.' })).toBeVisible();
  await expect(page.getByText('Execution disabled', { exact: true })).toBeVisible();
  await expect(page.getByText('API connected', { exact: true })).toBeVisible();
  await page.getByLabel('Hypothetical position value').fill('5000');
  await page.getByLabel('Assumed change', { exact: true }).fill('-4');
  await page.getByRole('button', { name: 'Calculate scenario' }).click();
  await expect(page.locator('.scenario-result strong')).toHaveText('4800 USDC units');
  await page.getByRole('button', { name: 'Record no-trade choice' }).click();
  await expect(page.getByText('No-trade choice recorded', { exact: true })).toBeVisible();
  const original = await page.getByLabel('Decision record JSON').inputValue();
  await page.getByRole('button', { name: 'Verify digest' }).click();
  await expect(
    page.getByText('Digest matches the record. This confirms consistency only.'),
  ).toBeVisible();
  const tampered = JSON.parse(original);
  tampered.payload.limitations = ['Changed'];
  await page.getByLabel('Decision record JSON').fill(JSON.stringify(tampered));
  await page.getByRole('button', { name: 'Verify digest' }).click();
  await expect(page.getByText('Record does not match its digest or schema.')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^northtrail-decision-.*\.json$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('review.png'), fullPage: true });
});

test('API failure remains explicit and cannot enable calculations or execution', async ({
  page,
}) => {
  await page.route('**/v1/status', (route) => route.abort());
  await page.goto('/');
  await expect(
    page.getByText('API unavailable. Start the Northtrail API to use the calculator.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calculate scenario' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Observe Uniswap quote' })).toBeDisabled();
  await expect(page.getByText('Execution disabled', { exact: true })).toBeVisible();
});

test('synthetic provider observation displays costs and expiry without enabling trading', async ({
  page,
}) => {
  // Browser-only fixture. No fixture is served by the real application or provider adapter.
  await page.clock.install();
  await page.route('**/v1/status', async (route) => {
    const response = await route.fetch();
    const status = await response.json();
    status.capabilities.find((capability: { id: string }) => capability.id === 'quotes').available =
      true;
    await route.fulfill({ json: status });
  });
  await page.route('**/v1/quotes/uniswap', async (route) => {
    const input = route.request().postDataJSON();
    const fixture = providerQuoteFixture();
    fixture.quote.output.recipient = input.recipient;
    const stamp = Date.now();
    const observation = await normalizeQuote(
      fixture,
      { ...quoteRequestFixture(), recipient: input.recipient },
      stamp,
      stamp,
    );
    await route.fulfill({ json: observation });
  });
  await page.goto('/');
  await page.getByLabel('Your wallet address').fill(quoteRequestFixture().owner);
  await page.getByLabel('Quote size in USDC').fill('1000');
  await page.getByRole('button', { name: 'Observe Uniswap quote' }).click();
  await expect(page.getByText('Provider observation · unverified')).toBeVisible();
  await expect(page.locator('.quote-value strong')).toHaveText('0.3 WETH');
  await expect(page.getByText('Approval / reset cost')).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect(page.getByText('Review window expired. Request a new quote.')).toBeVisible();
  await expect(page.getByText('Execution disabled', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByLabel('Quote size in USDC').fill('2000');
  await expect(page.locator('.quote-observation')).toHaveCount(0);
});

test('benchmark retains a provider failure and never displays a winner', async ({ page }) => {
  await page.route('**/v1/status', async (route) => {
    const response = await route.fetch();
    const status = await response.json();
    status.capabilities.find(
      (capability: { id: string }) => capability.id === 'benchmark',
    ).available = true;
    await route.fulfill({ json: status });
  });
  await page.route('**/v1/quotes/benchmark', async (route) => {
    const input = route.request().postDataJSON();
    const stamp = Date.now();
    await route.fulfill({
      json: {
        schemaVersion: '1',
        kind: 'QUOTE_BENCHMARK',
        request: input,
        uniswap: { ok: false, code: 'PROVIDER_UNAVAILABLE' },
        oneinch: {
          ok: true,
          observation: await normalizeOneinchQuote(oneinchQuoteFixture(), input, stamp, stamp),
        },
        ranking: 'NOT_COMPARABLE',
        executionAuthorized: false,
        reasons: ['Synthetic browser fixture; unknown costs exclude ranking.'],
      },
    });
  });
  await page.goto('/');
  await page.getByLabel('Observation sources').selectOption('benchmark');
  await page.getByLabel('Your wallet address').fill(quoteRequestFixture().owner);
  await page.getByLabel('Quote size in USDC').fill('1000');
  await page.getByRole('button', { name: 'Compare provider observations' }).click();
  await expect(page.getByText('Not comparable · no net winner')).toBeVisible();
  await expect(page.getByText('PROVIDER UNAVAILABLE', { exact: true })).toBeVisible();
  await expect(page.getByText(/WETH gross output/)).toBeVisible();
  await page.getByLabel('Quote size in USDC').fill('2000');
  await expect(page.getByRole('heading', { name: 'Provider comparison' })).toHaveCount(0);
});

test('quote choice binds into the existing Decision Trail through real API review', async ({
  page,
}) => {
  await page.route('**/v1/status', async (route) => {
    const response = await route.fetch();
    const status = await response.json();
    status.capabilities.find((capability: { id: string }) => capability.id === 'quotes').available =
      true;
    await route.fulfill({ json: status });
  });
  await page.route('**/v1/quotes/uniswap', async (route) => {
    const input = route.request().postDataJSON();
    const fixture = providerQuoteFixture();
    fixture.quote.output.recipient = input.recipient;
    const stamp = Date.now();
    await route.fulfill({ json: await normalizeQuote(fixture, input, stamp, stamp) });
  });
  await page.goto('/');
  await page.getByLabel('Your wallet address').fill(quoteRequestFixture().owner);
  await page.getByLabel('Quote size in USDC').fill('1000');
  await page.getByRole('button', { name: 'Observe Uniswap quote' }).click();
  await page.getByRole('button', { name: 'Record quote for review' }).click();
  await expect(page.getByText('Quote review recorded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Verify digest' }).click();
  await expect(
    page.getByText('Digest matches the record. This confirms consistency only.'),
  ).toBeVisible();
  await expect(page.getByText('Execution disabled', { exact: true })).toBeVisible();
});

test('research budgets show abstention and invalidate changed inputs', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('API connected', { exact: true })).toBeVisible();
  await page.getByLabel('Total input (USDC)').fill('1000');
  await page.getByLabel('Spending cap (USDC)').fill('1000');
  await page.getByLabel('Number of tranches').fill('3');
  await page.getByLabel('Assumed gas per swap (ETH)').fill('0.001');
  await page.getByLabel('Total gas budget (ETH)').fill('0.003');
  await page.getByRole('button', { name: 'Check split budget' }).click();
  await expect(page.getByText('Fits supplied budget assumptions')).toBeVisible();
  await expect(page.getByText('Strategy recommendation: ABSTAIN')).toBeVisible();
  await page.getByLabel('Spending cap (USDC)').fill('999');
  await expect(page.getByText('Fits supplied budget assumptions')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check split budget' }).click();
  await expect(page.getByText('Budget infeasible')).toBeVisible();
  await page.getByLabel('Historical dataset JSON').fill('{"unexpected":true}');
  await page.getByRole('button', { name: 'Analyze historical risk' }).click();
  await expect(page.locator('#research [role="alert"]')).toBeVisible();
  await expect(page.locator('#research [role="alert"]')).toHaveText(
    'Dataset does not match the OHLCV schema. Check asset identity, source, interval, timestamps and candle values.',
  );
  const start = Date.parse('2026-01-01T00:00:00Z');
  await page.getByLabel('Historical dataset JSON').fill(
    JSON.stringify({
      schemaVersion: '1',
      asset: WETH,
      quoteCurrency: 'USD',
      source: 'Synthetic browser test',
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
        low: 80,
        close: i === 20 ? 80 : 100,
        volume: 1,
      })),
    }),
  );
  await page.getByRole('button', { name: 'Analyze historical risk' }).click();
  await expect(page.getByText('Descriptive research only', { exact: true })).toBeVisible();
  await expect(page.getByText('Maximum drawdown', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Export risk evidence' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.locator('#research').screenshot({ path: testInfo.outputPath('research.png') });
});
