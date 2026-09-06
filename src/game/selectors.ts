import { openingBalance } from '../config/opening';
import { costFor, type UpgradeKind, UPGRADE_KINDS } from './economy';
import type { GameState } from './reducer';

export interface UpgradeCardView {
  kind: UpgradeKind;
  label: string;
  level: number;
  cap: number;
  cost: number | null;
  affordable: boolean;
  available: boolean;
}

const labels: Record<UpgradeKind, string> = {
  engine: 'Engine',
  fuel: 'Fuel Tank',
  airframe: 'Airframe',
  ignition: 'Ignition',
};

export function canPurchaseUpgrade(state: GameState, kind: UpgradeKind): boolean {
  if (state.activeLaunch || (state.status !== 'ready' && state.status !== 'result')) return false;
  const level = state.levels[kind];
  const upgrade = openingBalance.upgrades[kind];
  return level < upgrade.cap && Number.isSafeInteger(state.credits) && state.credits >= costFor(kind, level, openingBalance);
}

export function upgradeCardsFor(state: GameState): UpgradeCardView[] {
  return UPGRADE_KINDS.map((kind) => {
    const level = state.levels[kind];
    const cap = openingBalance.upgrades[kind].cap;
    const cost = level < cap ? costFor(kind, level, openingBalance) : null;
    return {
      kind,
      label: labels[kind],
      level,
      cap,
      cost,
      affordable: cost !== null && state.credits >= cost,
      available: canPurchaseUpgrade(state, kind),
    };
  });
}
