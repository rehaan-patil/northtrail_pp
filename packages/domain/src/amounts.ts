import { NorthtrailError } from './errors.js';

export const UINT256_MAX = (1n << 256n) - 1n;

export function rawAmount(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,77})$/.test(value)) {
    throw new NorthtrailError('INVALID_INPUT', 'Use canonical unsigned integer token units.');
  }

  const amount = BigInt(value);
  if (amount > UINT256_MAX) {
    throw new NorthtrailError('INVALID_INPUT', 'Amount exceeds uint256.');
  }

  return amount;
}

function checkDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new NorthtrailError('INVALID_INPUT', 'Unsupported token precision.');
  }
}

export function parseAmount(value: string, decimals: number): string {
  checkDecimals(decimals);

  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value) || value.length > 116) {
    throw new NorthtrailError(
      'INVALID_INPUT',
      'Enter a decimal amount without signs or exponents.',
    );
  }

  const [whole = '0', fraction = ''] = value.split('.');
  if (fraction.length > decimals) {
    throw new NorthtrailError('INVALID_INPUT', `This asset supports at most ${decimals} decimals.`);
  }

  const scaledWhole = BigInt(whole) * 10n ** BigInt(decimals);
  const scaledFraction = BigInt(fraction.padEnd(decimals, '0') || '0');
  const result = scaledWhole + scaledFraction;

  return rawAmount(result.toString()).toString();
}

export function formatAmount(value: string, decimals: number): string {
  checkDecimals(decimals);
  const amount = rawAmount(value);

  if (decimals === 0) {
    return amount.toString();
  }

  const padded = amount.toString().padStart(decimals + 1, '0');
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  const whole = padded.slice(0, -decimals);

  return whole + (fraction ? `.${fraction}` : '');
}

export function minimumOutput(quotedRaw: string, slippageBps: number): string {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 1_000) {
    throw new NorthtrailError(
      'INVALID_INPUT',
      'Slippage must be between 0 and 1,000 basis points.',
    );
  }

  const quoted = rawAmount(quotedRaw);
  const factor = BigInt(10_000 - slippageBps);
  return ((quoted * factor) / 10_000n).toString();
}