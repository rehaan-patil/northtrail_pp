import { NorthtrailError, rawAmount } from '@northtrail/domain';

export function stressExposure(
  amountRaw: string,
  changeBps: number,
): {
  changeRaw: string;
  remainingRaw: string;
  rounding: 'TOWARD_ZERO';
  kind: 'SCENARIO_ARITHMETIC';
} {
  if (!Number.isInteger(changeBps) || changeBps < -10_000 || changeBps > 100_000) {
    throw new NorthtrailError('INVALID_INPUT', 'Stress scenario is outside the supported range.');
  }

  const amount = rawAmount(amountRaw);
  const change = (amount * BigInt(changeBps)) / 10_000n;

  return {
    changeRaw: change.toString(),
    remainingRaw: (amount + change).toString(),
    rounding: 'TOWARD_ZERO',
    kind: 'SCENARIO_ARITHMETIC',
  };
}

export function gasPaid(gasUsed: string, effectiveGasPrice: string): string {
  return (rawAmount(gasUsed) * rawAmount(effectiveGasPrice)).toString();
}

export * from './routes.js';