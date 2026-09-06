import { openingBalance } from '../config/opening';
import type { OpeningBalance } from '../config/types';
import type { FlightResult } from '../simulation/types';
import type { RocketLevels } from './vehicle';

export const UPGRADE_KINDS = ['engine', 'fuel', 'airframe', 'ignition'] as const;
export type UpgradeKind = (typeof UPGRADE_KINDS)[number];

export function isUpgradeKind(value: unknown): value is UpgradeKind {
  return typeof value === 'string' && (UPGRADE_KINDS as readonly string[]).includes(value);
}

export function rewardFor(result: Pick<FlightResult, 'outcome' | 'maximumAltitudeM'>, balance: OpeningBalance = openingBalance): number {
  if (result.outcome !== 'apogee' || !Number.isFinite(result.maximumAltitudeM) || result.maximumAltitudeM < 0) return 0;
  return balance.income.baseCredits + Math.floor(
    balance.income.sqrtAltitudeCoefficient * Math.sqrt(Math.max(0, result.maximumAltitudeM)),
  );
}

export function costFor(kind: UpgradeKind, currentLevel: number, balance: OpeningBalance = openingBalance): number {
  const upgrade = balance.upgrades[kind];
  if (!Number.isInteger(currentLevel) || currentLevel < 0 || currentLevel >= upgrade.cap) {
    throw new RangeError(`${kind} level ${currentLevel} has no purchasable next level.`);
  }
  const linearHundredths = Math.round(balance.costCurve.linear * 100);
  const quadraticHundredths = Math.round(balance.costCurve.quadratic * 100);
  const curveNumerator = 100 + linearHundredths * currentLevel + quadraticHundredths * currentLevel ** 2;
  return Math.ceil(upgrade.baseCost * curveNumerator / 100);
}

export function nextCostFor(kind: UpgradeKind, levels: RocketLevels, balance: OpeningBalance = openingBalance): number | null {
  const currentLevel = levels[kind];
  return currentLevel >= balance.upgrades[kind].cap ? null : costFor(kind, currentLevel, balance);
}
