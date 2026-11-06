import { describe, expect, it, vi } from 'vitest';
import { createReceiptObserver } from '../integrations/provider-http/src/receipt.js';
import { buildApp } from '../apps/api/src/app.js';
import { readEnvironment } from '../packages/config/src/index.js';
import { connectDatabase, migrate } from '../packages/db/src/index.js';
import { createNorthtrail } from '../packages/sdk/src/index.js';

const hash = `0x${'1'.repeat(64)}`;
const blockHash = `0x${'2'.repeat(64)}`;
const otherHash = `0x${'3'.repeat(64)}`;
const receipt = {
  transactionHash: hash,
  blockHash,
  blockNumber: '0x10',
  from: '0x1111111111111111111111111111111111111111',
  to: '0x2222222222222222222222222222222222222222',
  status: '0x1',
  gasUsed: '0x5208',
  effectiveGasPrice: '0x3b9aca00',
};
const request = { chainId: 1 as const, transactionHash: hash };
const response = (results: unknown[]) =>
  Response.json(results.map((result, id) => ({ jsonrpc: '2.0', id, result })).reverse());
function transport(
  changes: {
    chain?: string;
    first?: unknown;
    block?: unknown;
    second?: unknown;
    head?: string;
  } = {},
) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      response([changes.chain ?? '0x1', 'first' in changes ? changes.first : receipt]),
    )
    .mockResolvedValueOnce(
      response([
        'block' in changes ? changes.block : { hash: blockHash, number: '0x10' },
        changes.head ?? '0x12',
        'second' in changes ? changes.second : receipt,
      ]),
    );
}
describe('independent RPC receipt observation with synthetic transports', () => {
  it('matches JSON-RPC IDs, checks canonicality and computes exact gas without claiming settlement', async () => {
    const fetcher = transport();
    const result = await createReceiptObserver({
      rpcUrl: 'https://rpc.invalid',
      fetch: fetcher,
    }).observe(request);
    expect(result.status).toBe('CANONICAL_SUCCESS');
    expect(result.confirmations).toBe('3');
    expect(result.gasPaidWei).toBe('21000000000000');
    expect(result.settlementVerified).toBe(false);
    expect(result.finality).toBe('NOT_ESTABLISHED');
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(String(init?.body)).not.toMatch(/eth_send|eth_sign|personal_/);
    }
  });
  it('does not equate a missing receipt with pending or successful execution', async () => {
    const fetcher = transport({ first: null });
    expect(
      (
        await createReceiptObserver({ rpcUrl: 'https://rpc.invalid', fetch: fetcher }).observe(
          request,
        )
      ).status,
    ).toBe('NOT_OBSERVED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('records canonical revert and gas without reporting a successful swap', async () => {
    const reverted = { ...receipt, status: '0x0' };
    const result = await createReceiptObserver({
      rpcUrl: 'https://rpc.invalid',
      fetch: transport({ first: reverted, second: reverted }),
    }).observe(request);
    expect(result.status).toBe('CANONICAL_REVERT');
    expect(result.gasPaidWei).toBe('21000000000000');
  });
  it.each([
    { block: { hash: otherHash, number: '0x10' } },
    { second: null },
    { block: null },
    { second: { ...receipt, blockHash: otherHash } },
  ])('detects reorganized or disappeared receipt %j', async (change) => {
    const result = await createReceiptObserver({
      rpcUrl: 'https://rpc.invalid',
      fetch: transport(change),
    }).observe(request);
    expect(result.status).toBe('REORGED');
    expect(result.confirmations).toBe('0');
    expect(result.gasPaidWei).toBeNull();
  });
  it.each([
    { chain: '0xa' },
    { first: { ...receipt, transactionHash: otherHash } },
    { head: '0xf' },
    { second: { ...receipt, gasUsed: '0x1' } },
    { first: { ...receipt, blockNumber: '0x010' } },
  ])('rejects mismatched RPC evidence %j', async (change) => {
    await expect(
      createReceiptObserver({ rpcUrl: 'https://rpc.invalid', fetch: transport(change) }).observe(
        request,
      ),
    ).rejects.toThrow();
  });
  it('rejects duplicate response IDs and oversized bodies without leaking RPC secrets', async () => {
    for (const data of [
      Response.json([
        { jsonrpc: '2.0', id: 0, result: '0x1' },
        { jsonrpc: '2.0', id: 0, result: receipt },
      ]),
      new Response(' '.repeat(262145), { headers: { 'content-type': 'application/json' } }),
    ]) {
      await expect(
        createReceiptObserver({
          rpcUrl: 'https://rpc.invalid/private-token',
          fetch: vi.fn<typeof fetch>().mockResolvedValue(data),
        }).observe(request),
      ).rejects.toMatchObject({ code: 'RPC_INCONSISTENT' });
    }
    await expect(
      createReceiptObserver({
        rpcUrl: 'https://rpc.invalid/private-token',
        fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error('private-token')),
      }).observe(request),
    ).rejects.toMatchObject({ message: 'Receipt observation could not be completed.' });
  });
  it('passes the configured API/SDK path and fails closed without an RPC', async () => {
    const db = await connectDatabase({ driver: 'pglite' });
    await migrate(db);
    const app = await buildApp(
      readEnvironment({ NODE_ENV: 'test', RPC_URL: 'https://rpc.invalid' }),
      db,
      { rpcFetch: transport() },
    );
    const disabled = await buildApp(readEnvironment({ NODE_ENV: 'test' }), db);
    try {
      const sdk = createNorthtrail({ baseUrl: await app.listen({ host: '127.0.0.1', port: 0 }) });
      expect((await sdk.proofs.observeReceipt(request)).settlementVerified).toBe(false);
      expect(
        (await disabled.inject({ method: 'POST', url: '/v1/proofs/receipt', payload: request }))
          .statusCode,
      ).toBe(503);
    } finally {
      await app.close();
      await disabled.close();
      await db.close();
    }
  });
});
