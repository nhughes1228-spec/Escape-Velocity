import { describe, expect, it } from 'vitest';
import { openingBalance } from '../src/config/opening';
import { prepareLaunch } from '../src/game/launch';
import { makeLaunchRng, engineConditionForSeed, effectiveVehicleForCondition } from '../src/game/variance';
import { starterLevels } from '../src/game/vehicle';

describe('seeded engine variance', () => {
  it('matches the published Mulberry32 condition vectors', () => {
    expect(engineConditionForSeed(0, openingBalance)).toBe(0.9956005537263117);
    expect(engineConditionForSeed(1, openingBalance)).toBe(0.9977788579706103);
    expect(engineConditionForSeed(42, openingBalance)).toBe(1.0002963658655062);
    expect(engineConditionForSeed(0xffffffff, openingBalance)).toBe(1.000515405225102);
  });

  it('rejects invalid seeds before unsigned coercion', () => {
    expect(() => makeLaunchRng(-1)).toThrow(/unsigned 32-bit/);
    expect(() => makeLaunchRng(4294967296)).toThrow(/unsigned 32-bit/);
    expect(() => makeLaunchRng(1.5)).toThrow(/unsigned 32-bit/);
    expect(() => makeLaunchRng(Number.NaN)).toThrow(/unsigned 32-bit/);
  });

  it('holds one physical condition for the whole launch without changing mass, fuel or drag', () => {
    const prepared = prepareLaunch(starterLevels, 42, openingBalance);
    expect(prepared.recipe.conditionK).toBe(1.0002963658655062);
    expect(prepared.recipe.effectiveVehicle.thrustN).toBeCloseTo(160 * prepared.recipe.conditionK, 12);
    expect(prepared.recipe.effectiveVehicle.exhaustVelocityMps).toBeCloseTo(400 * prepared.recipe.conditionK, 12);
    expect(prepared.recipe.effectiveVehicle.fuelMassKg).toBe(prepared.recipe.nominalVehicle.fuelMassKg);
    expect(prepared.recipe.effectiveVehicle.dryMassKg).toBe(prepared.recipe.nominalVehicle.dryMassKg);
    expect(prepared.recipe.effectiveVehicle.dragAreaM2).toBe(prepared.recipe.nominalVehicle.dragAreaM2);
    expect(prepared.recipe.effectiveVehicle.ignitionDelayS).toBe(prepared.recipe.nominalVehicle.ignitionDelayS);
    expect(prepared.recipe.effectiveVehicle.thrustN / prepared.recipe.effectiveVehicle.exhaustVelocityMps).toBeCloseTo(0.4, 12);
    expect(effectiveVehicleForCondition(prepared.recipe.nominalVehicle, 1).thrustN).toBe(prepared.recipe.nominalVehicle.thrustN);
  });

  it('is reproducible by seed and varies modestly between different seeds', () => {
    const first = prepareLaunch(starterLevels, 0, openingBalance);
    const repeat = prepareLaunch(starterLevels, 0, openingBalance);
    const different = prepareLaunch(starterLevels, 1, openingBalance);
    expect(repeat.recipe).toEqual(first.recipe);
    expect(repeat.result).toEqual(first.result);
    expect(different.result.maximumAltitudeM).not.toBe(first.result.maximumAltitudeM);
    expect(Math.abs(different.result.maximumAltitudeM - first.result.maximumAltitudeM) / first.result.maximumAltitudeM).toBeLessThan(0.03);
  });
});
