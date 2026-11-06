import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function cleanup(directory) {
  const local = relative(tmpdir(), directory);
  if (local.startsWith('..') || !local.startsWith('northtrail-smoke-')) {
    throw new Error('Unexpected smoke cleanup path');
  }
  await rm(directory, { recursive: true, force: true });
}

const temporary = await mkdtemp(join(tmpdir(), 'northtrail-smoke-'));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_DRIVER: 'pglite',
  DATABASE_PATH: join(temporary, 'db'),
  PORT: String(port),
  HOST: '127.0.0.1',
  TRADING_ENABLED: 'false',
  UNISWAP_QUOTING_ENABLED: 'false',
  ONEINCH_QUOTING_ENABLED: 'false',
  RPC_URL: '',
  RPC_SECONDARY_URL: '',
};
let server;
try {
  execFileSync(process.execPath, ['apps/api/dist/runtime/migrate.js'], {
    env,
    stdio: 'pipe',
    windowsHide: true,
  });
  server = spawn(process.execPath, ['apps/api/dist/runtime/server.js'], {
    env,
    stdio: 'ignore',
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    server.once('spawn', resolve);
    server.once('error', reject);
  });
  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(`Built API exited with ${server.exitCode}`);
    try {
      ready = (await fetch(`${url}/health/ready`, { signal: AbortSignal.timeout(1_000) })).ok;
    } catch {
      /* Wait for startup. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Built API must become ready with packaged migrations');
  const { createNorthtrail, createDecision, verifyDecision } =
    await import('../packages/sdk/dist/index.js');
  const sdk = createNorthtrail({ baseUrl: url });
  assert.equal((await sdk.status()).financialExecution, 'DISABLED');
  assert.equal(
    (await sdk.recoverTrade({ state: 'SUBMITTED', issue: 'PROVIDER_TIMEOUT' })).action,
    'RECONCILE_CHAIN',
  );
  assert.deepEqual(
    (
      await sdk.execution.planBudget({
        amountInRaw: '101',
        spendingCapRaw: '101',
        tranches: 2,
        gasPerTransactionWei: '10',
        gasBudgetWei: '20',
      })
    ).amountsInRaw,
    ['51', '50'],
  );
  assert.equal(
    (await sdk.scenario({ amountRaw: '5000000000', changeBps: -400 })).changeRaw,
    '-200000000',
  );
  const record = await createDecision({
    schemaVersion: '1',
    decisionId: randomUUID(),
    revision: 1,
    previousDigest: null,
    displaySchemaVersion: 'review-v1',
    candidates: [{ id: 'wait', kind: 'NO_TRADE' }],
    selectedCandidateId: 'wait',
    sources: [],
    limitations: ['Build smoke test; no market data or spending authority.'],
    createdAt: new Date().toISOString(),
  });
  assert.equal(await verifyDecision(record), true);
  assert.equal((await sdk.verifyDecision(record)).valid, true);
  console.log('Built API, packaged migrations, and built SDK smoke passed.');
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  await cleanup(temporary);
}
