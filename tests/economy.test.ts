import { describe, expect, it } from 'vitest';
import { openingBalance } from '../src/config/opening';
import { costFor, nextCostFor, rewardFor } from '../src/game/economy';
import { deriveVehicle, starterLevels } from '../src/game/vehicle';

describe('phase 2 economy', () => {
  it('awards the exact tapering reward only for an apogee', () => {
    expect(rewardFor({ outcome: 'apogee', maximumAltitudeM: 160.170311 }, openingBalance)).toBe(19);
    expect(rewardFor({ outcome: 'apogee', maximumAltitudeM: 0 }, openingBalance)).toBe(4);
    expect(rewardFor({ outcome: 'limit', maximumAltitudeM: 160.170311 }, openingBalance)).toBe(0);
    expect(rewardFor({ outcome: 'impact', maximumAltitudeM: 1000 }, openingBalance)).toBe(0);
    expect(rewardFor({ outcome: 'apogee', maximumAltitudeM: Number.NaN }, openingBalance)).toBe(0);
  });

  it('uses the approved integer purchase vectors and caps', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((level) => costFor('engine', level, openingBalance))).toEqual([14, 25, 41, 62, 88, 119, 156, 197]);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((level) => costFor('fuel', level, openingBalance))).toEqual([16, 29, 47, 71, 101, 136, 178, 225]);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((level) => costFor('airframe', level, openingBalance))).toEqual([12, 22, 36, 54, 76, 102, 133, 169]);
    expect([0, 1, 2, 3].map((level) => costFor('ignition', level, openingBalance))).toEqual([8, 15, 24, 36]);
    expect(nextCostFor('ignition', { ...starterLevels, ignition: 4 }, openingBalance)).toBeNull();
    expect(() => costFor('engine', 8, openingBalance)).toThrow(/purchasable/);
    expect(() => costFor('engine', 1.5, openingBalance)).toThrow(/purchasable/);
  });

  it('derives physical upgrades and ignition from their documented tables', () => {
    expect(deriveVehicle({ ...starterLevels, engine: 1 }, openingBalance)).toMatchObject({ thrustN: expect.closeTo(188.8), exhaustVelocityMps: expect.closeTo(414) });
    expect(deriveVehicle({ ...starterLevels, fuel: 1 }, openingBalance)).toMatchObject({ fuelMassKg: 2.44, dryMassKg: 8.15 });
    expect(deriveVehicle({ ...starterLevels, airframe: 1 }, openingBalance)).toMatchObject({ dryMassKg: expect.closeTo(7.454545454545454), dragAreaM2: expect.closeTo(0.010714285714285714) });
    expect([0, 1, 2, 3, 4].map((ignition) => deriveVehicle({ ...starterLevels, ignition }, openingBalance).ignitionDelayS)).toEqual([1.5, 1, 0.6, 0.3, 0.1]);
  });
});
