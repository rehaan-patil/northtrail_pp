import {
  ReceiptRequestSchema,
  ReceiptObservationSchema,
  RpcEnvelopeSchema,
  RpcQuantitySchema,
  RpcReceiptSchema,
  RpcBlockSchema,
  NorthtrailError,
  canonicalJson,
} from '@northtrail/domain';

// Independent from quote providers and wallet-reported success. Only read RPC methods exist here.
export function createReceiptObserver(options: {
  rpcUrl: string;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const url = new URL(options.rpcUrl);
  if (
    url.username ||
    url.password ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw new NorthtrailError('INVALID_INPUT', 'RPC requires HTTPS or a loopback test node.');
  const transport = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let inFlight = false;
  let recent: number[] = [];
  function invalid(): never {
    throw new NorthtrailError(
      'RPC_INCONSISTENT',
      'RPC evidence is missing, malformed or inconsistent.',
      502,
    );
  }
  return {
    async observe(input: unknown) {
      const request = ReceiptRequestSchema.parse(input);
      const started = now();
      recent = recent.filter((time) => started - time < 60_000);
      if (inFlight || recent.length >= 6)
        throw new NorthtrailError(
          'PROVIDER_RATE_LIMITED',
          'Receipt observation quota reached.',
          429,
        );
      recent.push(started);
      inFlight = true;
      const signal = AbortSignal.timeout(10_000);
      async function batch(calls: { method: string; params: unknown[] }[]) {
        const response = await transport(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(calls.map((call, id) => ({ jsonrpc: '2.0', id, ...call }))),
          signal,
          redirect: 'error',
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
          await response.body?.cancel();
          invalid();
        }
        const reader = response.body?.getReader();
        if (!reader) invalid();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 262_144) invalid();
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel();
        }
        const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!Array.isArray(raw) || raw.length !== calls.length) invalid();
        const parsed = raw.map((item) => RpcEnvelopeSchema.parse(item));
        if (new Set(parsed.map((item) => item.id)).size !== calls.length) invalid();
        return calls.map((_, id) => {
          const item = parsed.find((entry) => entry.id === id);
          if (!item || item.result === undefined) invalid();
          return item.result;
        });
      }
      try {
        const [chain, first] = await batch([
          { method: 'eth_chainId', params: [] },
          { method: 'eth_getTransactionReceipt', params: [request.transactionHash] },
        ]);
        if (chain !== '0x1')
          throw new NorthtrailError(
            'UNSUPPORTED_CHAIN',
            'RPC is not on the requested Ethereum chain.',
            502,
          );
        const base = {
          kind: 'CHAIN_RECEIPT_OBSERVATION',
          ...request,
          observedAt: new Date(now()).toISOString(),
          settlementVerified: false,
          finality: 'NOT_ESTABLISHED',
          limitations: [
            'Single RPC snapshot, rechecked within the observation; not independent multi-provider consensus or economic finality.',
            'A successful receipt is not proof of intended token settlement. Balance changes, route binding, remaining allowances and replacements require additional verification.',
            'Gas is execution gas only; no approval, blob or other transaction costs are included.',
          ],
        };
        if (first === null)
          return ReceiptObservationSchema.parse({
            ...base,
            status: 'NOT_OBSERVED',
            blockHash: null,
            blockNumber: null,
            confirmations: '0',
            from: null,
            to: null,
            gasPaidWei: null,
          });
        const receipt = RpcReceiptSchema.parse(first);
        if (receipt.transactionHash !== request.transactionHash) invalid();
        const [blockRaw, headRaw, second] = await batch([
          { method: 'eth_getBlockByNumber', params: [receipt.blockNumber, false] },
          { method: 'eth_blockNumber', params: [] },
          { method: 'eth_getTransactionReceipt', params: [request.transactionHash] },
        ]);
        const head = BigInt(RpcQuantitySchema.parse(headRaw));
        const height = BigInt(receipt.blockNumber);
        const block = blockRaw === null ? null : RpcBlockSchema.parse(blockRaw);
        const again = second === null ? null : RpcReceiptSchema.parse(second);
        if (block && block.number !== receipt.blockNumber) invalid();
        if (again && again.transactionHash !== request.transactionHash) invalid();
        const reorged =
          !block ||
          block.hash !== receipt.blockHash ||
          !again ||
          again.blockHash !== receipt.blockHash;
        if (!reorged && (head < height || canonicalJson(again) !== canonicalJson(receipt)))
          invalid();
        return ReceiptObservationSchema.parse({
          ...base,
          observedAt: new Date(now()).toISOString(),
          status: reorged
            ? 'REORGED'
            : receipt.status === '0x1'
              ? 'CANONICAL_SUCCESS'
              : 'CANONICAL_REVERT',
          blockHash: receipt.blockHash,
          blockNumber: height.toString(),
          confirmations: reorged ? '0' : (head - height + 1n).toString(),
          from: receipt.from,
          to: receipt.to,
          gasPaidWei: reorged
            ? null
            : (BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)).toString(),
        });
      } catch (error) {
        if (error instanceof NorthtrailError) throw error;
        throw new NorthtrailError(
          'PROVIDER_UNAVAILABLE',
          'Receipt observation could not be completed.',
          503,
        );
      } finally {
        inFlight = false;
      }
    },
  };
}
