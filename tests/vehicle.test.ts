import { describe, expect, it } from 'vitest';
import { openingBalance } from '../src/config/opening';
import { deriveVehicle, starterLevels } from '../src/game/vehicle';

describe('opening vehicle derivation', () => {
  it('derives the documented starter values', () => {
    const vehicle = deriveVehicle(starterLevels, openingBalance);
    expect(vehicle).toEqual({
      dryMassKg: 8,
      fuelMassKg: 2,
      thrustN: 160,
      exhaustVelocityMps: 400,
      dragAreaM2: 0.012,
      ignitionDelayS: 1.5,
    });
    expect(vehicle.thrustN / vehicle.exhaustVelocityMps).toBeCloseTo(0.4, 12);
    expect(vehicle.fuelMassKg / (vehicle.thrustN / vehicle.exhaustVelocityMps)).toBeCloseTo(5, 12);
  });

  it('rejects levels outside their configured caps', () => {
    expect(() => deriveVehicle({ ...starterLevels, engine: 9 }, openingBalance)).toThrow(/outside/);
    expect(() => deriveVehicle({ ...starterLevels, ignition: 1.5 }, openingBalance)).toThrow(/outside/);
  });
});
