import { Buffer } from 'node:buffer';
import { NorthtrailError } from '@northtrail/domain';

const MAX_BODY_BYTES = 262_144;

function invalidResponse(): never {
  throw new NorthtrailError(
    'PROVIDER_INVALID_RESPONSE',
    'Provider response is not bounded JSON.',
    502,
  );
}

export function createQuoteTransport(options: { fetch?: typeof fetch; now?: () => number }) {
  const transport = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;

  let inFlight = false;
  let recentTimestamps: number[] = [];

  return async (url: string, init: RequestInit) => {
    const started = now();

    // Prune requests older than 1 minute
    recentTimestamps = recentTimestamps.filter((time) => started - time < 60_000);

    const isRateLimited =
      inFlight ||
      recentTimestamps.length >= 6 ||
      (recentTimestamps.length > 0 && started - recentTimestamps.at(-1)! < 1_000);

    if (isRateLimited) {
      throw new NorthtrailError(
        'PROVIDER_RATE_LIMITED',
        'Quote acquisition is temporarily limited.',
        429,
        'Wait before requesting another quote.',
      );
    }

    recentTimestamps.push(started);
    inFlight = true;

    try {
      const response = await transport(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        await response.body?.cancel();
        const status = response.status;
        throw new NorthtrailError(
          status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_UNAVAILABLE',
          'Provider did not return a usable quote.',
          status === 429 ? 429 : 503,
          'Check server provider access or retry later.',
        );
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      const contentLength = Number(response.headers.get('content-length') ?? 0);

      if (!contentType.includes('application/json') || contentLength > MAX_BODY_BYTES) {
        await response.body?.cancel();
        invalidResponse();
      }

      const reader = response.body?.getReader();
      if (!reader) {
        invalidResponse();
      }

      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          totalSize += value.byteLength;
          if (totalSize > MAX_BODY_BYTES) {
            invalidResponse();
          }
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }

      let payload: unknown;
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        payload = JSON.parse(text);
      } catch {
        invalidResponse();
      }

      return {
        payload,
        requestedAt: started,
        fetchedAt: now(),
      };
    } catch (error) {
      if (error instanceof NorthtrailError) {
        throw error;
      }
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