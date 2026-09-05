import { describe, expect, it } from 'vitest';
import { openingBalance } from '../src/config/opening';
import { createLaunchRecipe, prepareLaunch, simulateLaunchRecipe } from '../src/game/launch';
import { deriveVehicle, starterLevels } from '../src/game/vehicle';
import { effectiveVehicleForCondition } from '../src/game/variance';
import { simulateVertical } from '../src/simulation/vertical';

describe('immutable launch recipes', () => {
  it('snapshots versions, levels, effective inputs and approved simulation settings', () => {
    const prepared = prepareLaunch(starterLevels, 0, openingBalance);
    expect(prepared.recipe.balanceVersion).toBe('opening-v2');
    expect(prepared.recipe.modelVersion).toBe('vertical-v1.1');
    expect(prepared.recipe.varianceVersion).toBe('engine-variation-v1');
    expect(prepared.recipe.prngVersion).toBe('mulberry32-v1');
    expect(prepared.recipe.simulation).toEqual({
      dtS: openingBalance.simulation.dtS,
      maxTimeS: openingBalance.simulation.maxTimeS,
      fuelEpsilonKg: openingBalance.simulation.fuelEpsilonKg,
      traceIntervalS: openingBalance.simulation.traceIntervalS,
      maxIntegrationSteps: openingBalance.simulation.maxIntegrationSteps,
      maxTraceSamples: openingBalance.simulation.maxTraceSamples,
    });
    expect(prepared.result.vehicle).toEqual(prepared.recipe.effectiveVehicle);
  });

  it('replays the exact historical recipe after the current configuration changes', () => {
    const recipe = createLaunchRecipe({ ...starterLevels, engine: 1 }, 42, openingBalance);
    const replay = simulateLaunchRecipe(recipe, true, openingBalance);
    const repeat = simulateLaunchRecipe(recipe, true, openingBalance);
    expect(replay).toEqual(repeat);
    expect(replay.maximumAltitudeM).toBeCloseTo(prepareLaunch({ ...starterLevels, engine: 1 }, 42, openingBalance).result.maximumAltitudeM, 12);
  });

  it('covers the endpoint variance envelope for every physical opening build', () => {
    let builds = 0;
    for (let engine = 0; engine <= openingBalance.upgrades.engine.cap; engine += 1) {
      for (let fuel = 0; fuel <= openingBalance.upgrades.fuel.cap; fuel += 1) {
        for (let airframe = 0; airframe <= openingBalance.upgrades.airframe.cap; airframe += 1) {
          const levels = { engine, fuel, airframe, ignition: 0 };
          const nominal = deriveVehicle(levels, openingBalance);
          const nominalResult = simulateVertical(nominal, openingBalance.environment, {
            ...openingBalance.simulation,
            collectTrace: false,
            balanceVersion: openingBalance.balanceVersion,
            modelVersion: openingBalance.modelVersion,
          });
          for (const conditionK of [0.994, 1, 1.006]) {
            const result = simulateVertical(effectiveVehicleForCondition(nominal, conditionK), openingBalance.environment, {
              ...openingBalance.simulation,
              collectTrace: false,
              balanceVersion: openingBalance.balanceVersion,
              modelVersion: openingBalance.modelVersion,
            });
            expect(result.outcome).toBe('apogee');
    expect(Number.isFinite(result.maximumAltitudeM)).toBe(true);
            expect(result.maximumAltitudeM).toBeGreaterThanOrEqual(0);
            expect(Math.abs(result.maximumAltitudeM - nominalResult.maximumAltitudeM) / nominalResult.maximumAltitudeM).toBeLessThan(0.03);
          }
          for (let seed = 0; seed < 32; seed += 1) {
            const seeded = simulateLaunchRecipe(createLaunchRecipe(levels, seed, openingBalance), false, openingBalance);
            expect(seeded.outcome).toBe('apogee');
            expect(Number.isFinite(seeded.maximumAltitudeM)).toBe(true);
            expect(seeded.maximumAltitudeM).toBeGreaterThanOrEqual(0);
          }
          builds += 1;
        }
      }
    }
    expect(builds).toBe(729);
  }, 15000);
});
