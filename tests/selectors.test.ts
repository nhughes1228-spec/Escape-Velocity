import { describe, expect, it } from 'vitest';
import { openingBalance } from '../src/config/opening';
import { createInitialGameState, gameReducer } from '../src/game/reducer';
import { canPurchaseUpgrade, upgradeCardsFor } from '../src/game/selectors';

describe('Phase 2 upgrade selectors', () => {
  it('shares affordability and busy eligibility with the purchase command', () => {
    const initial = createInitialGameState();
    expect(canPurchaseUpgrade(initial, 'airframe')).toBe(false);
    const funded = { ...initial, credits: 19 };
    expect(canPurchaseUpgrade(funded, 'airframe')).toBe(true);
    expect(gameReducer(funded, { type: 'buyUpgrade', kind: 'airframe' }).levels.airframe).toBe(1);
    const active = gameReducer(funded, { type: 'reserveNewLaunch', seed: 0 });
    expect(canPurchaseUpgrade(active, 'airframe')).toBe(false);
  });

  it('reports next prices and caps without exposing a quoted mutable command', () => {
    const capped = {
      ...createInitialGameState(),
      credits: 1000,
      levels: { ...createInitialGameState().levels, ignition: openingBalance.upgrades.ignition.cap },
    };
    const ignition = upgradeCardsFor(capped).find((card) => card.kind === 'ignition')!;
    expect(ignition.level).toBe(4);
    expect(ignition.cost).toBeNull();
    expect(ignition.available).toBe(false);
    expect(upgradeCardsFor(capped).find((card) => card.kind === 'engine')?.cost).toBe(14);
  });
});
