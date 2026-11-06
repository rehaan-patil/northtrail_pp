import { NorthtrailError } from '@northtrail/domain';
export { createReceiptObserver } from './receipt.js';

const MAX_BODY_BYTES = 262_144;
function invalid(): never {
  throw new NorthtrailError(
    'PROVIDER_INVALID_RESPONSE',
    'Provider response is not bounded JSON.',
    502,
  );
}

// Server-only primitive. Adapters choose fixed official URLs; callers never supply one.
export function createQuoteTransport(options: { fetch?: typeof fetch; now?: () => number }) {
  const transport = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  let inFlight = false;
  let recent: number[] = [];
  return async (url: string, init: RequestInit) => {
    const started = now();
    recent = recent.filter((time) => started - time < 60_000);
    if (inFlight || recent.length >= 6 || (recent.length > 0 && started - recent.at(-1)! < 1_000))
      throw new NorthtrailError(
        'PROVIDER_RATE_LIMITED',
        'Quote acquisition is temporarily limited.',
        429,
        'Wait before requesting another quote.',
      );
    recent.push(started);
    inFlight = true;
    try {
      const response = await transport(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new NorthtrailError(
          response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_UNAVAILABLE',
          'Provider did not return a usable quote.',
          response.status === 429 ? 429 : 503,
          'Check server provider access or retry later.',
        );
      }
      if (
        !response.headers.get('content-type')?.toLowerCase().includes('application/json') ||
        Number(response.headers.get('content-length') ?? 0) > MAX_BODY_BYTES
      ) {
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
          if (size > MAX_BODY_BYTES) invalid();
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
      }
      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        invalid();
      }
      return { payload, requestedAt: started, fetchedAt: now() };
    } catch (error) {
      if (error instanceof NorthtrailError) throw error;
      throw new NorthtrailError(
        'PROVIDER_UNAVAILABLE',
        'Provider quote request could not be completed.',
        503,
        'Check provider availability and retry later.',
      );
    } finally {
      inFlight = false;
    }
  };
}
