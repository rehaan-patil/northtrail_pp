import { RawAmountSchema, NorthtrailError } from '@northtrail/domain';

export interface AquaCoverageReport {
  makerAddress: string;
  actualAvailableRaw: string;
  virtualClaimedRaw: string;
  coverageRatio: number;
  status: 'HEALTHY' | 'UNDERFUNDED_WARNING' | 'CRITICAL';
  recommendation: string;
}

export function inspectAquaCoverage(
  makerAddress: string,
  makerWalletBalanceRaw: string,
  makerAllowanceRaw: string,
  virtualClaimedRaw: string,
): AquaCoverageReport {
  const balance = BigInt(RawAmountSchema.parse(makerWalletBalanceRaw));
  const allowance = BigInt(RawAmountSchema.parse(makerAllowanceRaw));
  const claimed = BigInt(RawAmountSchema.parse(virtualClaimedRaw));

  if (claimed === 0n) {
    throw new NorthtrailError('INVALID_INPUT', 'Virtual claimed allocations must be positive.');
  }

  // Actual available is the minimum of balance and spend approval:
  const actualAvailable = balance < allowance ? balance : allowance;
  const coverageRatio = Number((actualAvailable * 10000n) / claimed) / 10000;

  let status: AquaCoverageReport['status'] = 'HEALTHY';
  let recommendation = 'Virtual liquidity is fully backed by available wallet balance.';

  if (coverageRatio < 0.5) {
    status = 'CRITICAL';
    recommendation = 'Virtual allocations exceed wallet backing by >50%. Taker swaps will revert.';
  } else if (coverageRatio < 1.0) {
    status = 'UNDERFUNDED_WARNING';
    recommendation = 'Coverage ratio below 1.0. Consider docking virtual positions or topping up.';
  }

  return {
    makerAddress,
    actualAvailableRaw: actualAvailable.toString(),
    virtualClaimedRaw: claimed.toString(),
    coverageRatio,
    status,
    recommendation,
  };
}