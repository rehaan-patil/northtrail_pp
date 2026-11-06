import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, realpath, symlink, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'northtrail-sdk-'));
async function cleanup() {
  const local = relative(tmpdir(), temporary);
  if (local.startsWith('..') || !local.startsWith('northtrail-sdk-'))
    throw new Error('Unexpected SDK smoke path');
  await rm(temporary, { recursive: true, force: true });
}
try {
  const pnpm = process.env.npm_execpath;
  if (!pnpm) throw new Error('Run this check with pnpm smoke:sdk.');
  const command = /\.(?:c?js|mjs)$/.test(pnpm) ? process.execPath : pnpm;
  const args = command === pnpm ? [] : [pnpm];
  execFileSync(
    command,
    [...args, '--dir', join(root, 'packages/sdk'), 'pack', '--pack-destination', temporary],
    { stdio: 'pipe', windowsHide: true },
  );
  execFileSync('tar', ['-xf', join(temporary, 'northtrail-sdk-0.1.0.tgz'), '-C', temporary], {
    windowsHide: true,
  });
  const packed = JSON.parse(await readFile(join(temporary, 'package/package.json'), 'utf8'));
  assert.equal(packed.exports['.'].import, './dist/index.js');
  assert.equal(packed.exports['.'].types, './dist/index.d.ts');
  assert.deepEqual(Object.keys(packed.dependencies), ['zod']);
  const types = await readFile(join(temporary, 'package/dist/index.d.ts'), 'utf8');
  assert.ok(
    !types.includes('@northtrail/domain'),
    'Declarations must not refer to unpublished internal packages',
  );
  await mkdir(join(temporary, 'node_modules/@northtrail'), { recursive: true });
  await symlink(
    join(temporary, 'package'),
    join(temporary, 'node_modules/@northtrail/sdk'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await symlink(
    await realpath(join(root, 'packages/sdk/node_modules/zod')),
    join(temporary, 'node_modules/zod'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const consumer = join(temporary, 'consumer.mts');
  await writeFile(
    consumer,
    `import { parseAmount, createDecision, verifyDecision, createNorthtrail, type DecisionPayload, type MarketDataset, type ReviewRequest } from '@northtrail/sdk';
const client = createNorthtrail({ baseUrl: 'http://127.0.0.1:4000' });
if (typeof client.quant.risk !== 'function' || typeof client.execution.planBudget !== 'function' || typeof client.reviewTrade !== 'function' || typeof client.recoverTrade !== 'function') throw new Error('New SDK methods missing');
type PublicContracts = [MarketDataset, ReviewRequest];
const payload: DecisionPayload = { schemaVersion: '1', decisionId: '8f0e4950-9318-4099-a779-a30c9dac954b', revision: 1, previousDigest: null, displaySchemaVersion: 'review-v1', candidates: [{ id: 'wait', kind: 'NO_TRADE' }], selectedCandidateId: 'wait', sources: [], limitations: ['Archive smoke only'], createdAt: '2026-11-06T00:00:00.000Z' };
if (parseAmount('1.000001', 6) !== '1000001') throw new Error('Amount mismatch');
if (!await verifyDecision(await createDecision(payload))) throw new Error('Digest mismatch');
`,
  );
  const tsc = join(
    dirname(fileURLToPath(import.meta.resolve('typescript/package.json'))),
    'bin/tsc',
  );
  execFileSync(
    process.execPath,
    [
      tsc,
      '--strict',
      '--noEmit',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      consumer,
    ],
    { stdio: 'pipe', windowsHide: true },
  );
  execFileSync(process.execPath, [consumer], { stdio: 'pipe', windowsHide: true });
  console.log(
    'Packed SDK runtime and TypeScript consumer passed outside the workspace, with only its declared Zod dependency.',
  );
} finally {
  await cleanup();
}
