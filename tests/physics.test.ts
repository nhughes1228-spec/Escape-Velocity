import { describe, expect, it } from 'vitest';
import { openingBalance } from '../src/config/opening';
import { deriveVehicle, starterLevels, type VehicleSpec } from '../src/game/vehicle';
import {
  accelerationMps2,
  advanceVerticalState,
  initialVerticalState,
  signedDragForceN,
  simulateVertical,
} from '../src/simulation/vertical';
import type { SimulationEnvironment, SimulationOptions, VerticalState } from '../src/simulation/types';

const starter = deriveVehicle(starterLevels, openingBalance);
const environment = openingBalance.environment;
const options: SimulationOptions = {
  ...openingBalance.simulation,
  balanceVersion: openingBalance.balanceVersion,
  modelVersion: openingBalance.modelVersion,
};

describe('vertical-v1 solver', () => {
  it('matches the starter reference fixture', () => {
    const result = simulateVertical(starter, environment, options);
    expect(result.outcome).toBe('apogee');
    expect(result.maximumAltitudeM).toBeCloseTo(160.170311, 4);
    expect(result.terminalTimeS).toBeCloseTo(8.741557, 4);
    expect(result.burnoutTimeS).toBeCloseTo(5, 12);
    expect(result.terminalFuelKg).toBe(0);
  });

  it('has an exact constant-gravity vacuum ballistic step', () => {
    const vacuumEnvironment: SimulationEnvironment = {
      gravityMps2: 10,
      radiusM: Number.MAX_VALUE / 4,
      densityKgM3: 0,
      scaleHeightM: 8500,
    };
    const dryVehicle: VehicleSpec = { ...starter, dryMassKg: 1, fuelMassKg: 0, thrustN: 0, dragAreaM2: 0 };
    const initial = { ...initialVerticalState(dryVehicle, false), altitudeM: 12, velocityMps: 30 };
    const advanced = advanceVerticalState(initial, 0.5, dryVehicle, vacuumEnvironment, false);
    expect(advanced.velocityMps).toBeCloseTo(25, 12);
    expect(advanced.altitudeM).toBeCloseTo(25.75, 12);
    const apogeeTime = initial.velocityMps / vacuumEnvironment.gravityMps2;
    const apogeeHeight = initial.altitudeM + initial.velocityMps ** 2 / (2 * vacuumEnvironment.gravityMps2);
    expect(apogeeTime).toBe(3);
    expect(apogeeHeight).toBe(57);
  });

  it('approaches ideal rocket velocity gain without gravity or drag', () => {
    const vacuumEnvironment: SimulationEnvironment = { gravityMps2: 0, radiusM: 6371000, densityKgM3: 0, scaleHeightM: 8500 };
    const vehicle: VehicleSpec = { ...starter, dryMassKg: 8, fuelMassKg: 2, thrustN: 160, exhaustVelocityMps: 400, dragAreaM2: 0 };
    let state: VerticalState = { ...initialVerticalState(vehicle, true), phase: 'poweredAscent' };
    const stepS = 0.0005;
    const burnTimeS = vehicle.fuelMassKg / (vehicle.thrustN / vehicle.exhaustVelocityMps);
    for (let timeS = 0; timeS < burnTimeS - stepS / 2; timeS += stepS) {
      state = advanceVerticalState(state, stepS, vehicle, vacuumEnvironment, true);
    }
    const expected = vehicle.exhaustVelocityMps * Math.log((vehicle.dryMassKg + vehicle.fuelMassKg) / vehicle.dryMassKg);
    expect(state.velocityMps).toBeCloseTo(expected, 3);
  });

  it('uses drag that opposes either direction of motion', () => {
    const up = signedDragForceN(20, starter.dragAreaM2, 0, environment);
    const down = signedDragForceN(-20, starter.dragAreaM2, 0, environment);
    expect(up).toBeGreaterThan(0);
    expect(down).toBeLessThan(0);
    expect(Math.abs(up)).toBeCloseTo(Math.abs(down), 12);
    expect(accelerationMps2(0, 20, 10, 0, starter, environment)).toBeLessThan(-environment.gravityMps2);
    expect(accelerationMps2(0, -20, 10, 0, starter, environment)).toBeGreaterThan(-environment.gravityMps2);
  });

  it('splits fractional burnout and never burns negative fuel', () => {
    const vehicle = { ...starter, fuelMassKg: 1, thrustN: 100, exhaustVelocityMps: 400 };
    const result = simulateVertical(vehicle, environment, { ...options, dtS: 1.3 });
    expect(result.outcome).toBe('apogee');
    expect(result.burnoutTimeS).toBeCloseTo(4, 12);
    expect(result.terminalFuelKg).toBeGreaterThanOrEqual(0);
    expect(result.trace.every((sample) => sample.fuelKg >= 0 && vehicle.dryMassKg + sample.fuelKg > 0)).toBe(true);
    expect(result.events.filter((event) => event.type === 'burnout')).toHaveLength(1);
  });

  it('handles dry launches, zero thrust, supported pad time, invalid input and limits', () => {
    const dry = simulateVertical({ ...starter, fuelMassKg: 0 }, environment, options);
    expect(dry.outcome).toBe('noLiftoff');
    expect(dry.terminalTimeS).toBe(0);
    expect(dry.burnoutTimeS).toBeNull();

    const zeroThrust = simulateVertical({ ...starter, thrustN: 0 }, environment, options);
    expect(zeroThrust.outcome).toBe('noLiftoff');
    expect(zeroThrust.terminalTimeS).toBe(0);

    const supported = simulateVertical({ ...starter, thrustN: 70 }, environment, options);
    expect(supported.outcome).toBe('noLiftoff');
    expect(supported.terminalTimeS).toBeCloseTo(2 / (70 / 400), 12);
    expect(supported.events.map((event) => event.type)).toEqual(['burnout', 'noLiftoff']);

    const invalid = simulateVertical({ ...starter, dragAreaM2: Number.NaN }, environment, options);
    expect(invalid.outcome).toBe('invalid');
    expect(invalid.events).toEqual([{ type: 'invalid', timeS: 0 }]);

    const nullVehicle = simulateVertical(null as unknown as VehicleSpec, environment, options);
    expect(nullVehicle.outcome).toBe('invalid');
    expect(nullVehicle.events).toEqual([{ type: 'invalid', timeS: 0 }]);

    const limit = simulateVertical(
      { ...starter, dryMassKg: 1, fuelMassKg: 1, thrustN: 10, dragAreaM2: 0 },
      { gravityMps2: 0, radiusM: 6371000, densityKgM3: 0, scaleHeightM: 8500 },
      { ...options, maxTimeS: 1 },
    );
    expect(limit.outcome).toBe('limit');
    expect(limit.events.at(-1)?.type).toBe('limit');
  });

  it('bounds supported-pad time and trace work by the requested limits', () => {
    const shortPadOptions = { ...options, maxTimeS: 0.1 };
    for (const thrustN of [70, 90]) {
      const result = simulateVertical({ ...starter, thrustN }, environment, shortPadOptions);
      expect(result.outcome).toBe('limit');
      expect(result.terminalTimeS).toBeCloseTo(0.1, 12);
      expect(result.terminalFuelKg).toBeGreaterThan(0);
      expect(result.trace.every((sample) => sample.phase === 'pad' || sample.phase === 'result')).toBe(true);
    }

    const supportedBurnTimeS = 2 / (70 / 400);
    const exactCap = simulateVertical(
      { ...starter, thrustN: 70 },
      environment,
      { ...options, maxTimeS: supportedBurnTimeS },
    );
    expect(exactCap.outcome).toBe('noLiftoff');
    expect(exactCap.terminalTimeS).toBeCloseTo(supportedBurnTimeS, 12);
    expect(exactCap.events.map((event) => event.type)).toEqual(['burnout', 'noLiftoff']);

    const delayedLift = simulateVertical({ ...starter, thrustN: 90 }, environment, { ...options, maxTimeS: 20 });
    expect(delayedLift.outcome).toBe('apogee');
    expect(delayedLift.trace[0]?.phase).toBe('pad');
    expect(delayedLift.trace.some((sample) => sample.phase === 'poweredAscent')).toBe(true);

    const traceOff = simulateVertical({ ...starter, thrustN: 90 }, environment, {
      ...options,
      traceIntervalS: Number.MIN_VALUE,
      collectTrace: false,
      maxTraceSamples: 1,
    });
    expect(traceOff.outcome).toBe('apogee');
    expect(traceOff.trace).toEqual([]);

    const traceBudget = simulateVertical(starter, environment, {
      ...options,
      traceIntervalS: 0.001,
      maxTraceSamples: 4,
    });
    expect(traceBudget.outcome).toBe('limit');
    expect(traceBudget.trace.length).toBeLessThanOrEqual(4);
    expect(traceBudget.events.at(-1)?.reason).toMatch(/trace sample budget/);

    const terminalTraceBudget = simulateVertical(starter, environment, {
      ...options,
      traceIntervalS: 100,
      maxTraceSamples: 1,
    });
    expect(terminalTraceBudget.outcome).toBe('limit');
    expect(terminalTraceBudget.trace).toHaveLength(1);
    expect(terminalTraceBudget.events.filter((event) => event.type === 'limit')).toHaveLength(1);
    expect(terminalTraceBudget.events.at(-1)?.reason).toMatch(/trace sample budget/);

    const stepBudget = simulateVertical(starter, environment, {
      ...options,
      maxIntegrationSteps: 1,
    });
    expect(stepBudget.outcome).toBe('limit');
    expect(stepBudget.events.at(-1)?.reason).toMatch(/integration step budget/);

    for (const thrustN of [starter.thrustN, 70]) {
      const pathological = simulateVertical({ ...starter, thrustN }, environment, {
        ...options,
        maxTimeS: 0.1,
        maxIntegrationSteps: 2,
        maxTraceSamples: 2,
        traceIntervalS: 1e-300,
      });
      expect(pathological.outcome).toBe('limit');
      expect(pathological.terminalTimeS).toBeLessThanOrEqual(0.1);
      expect(pathological.trace.length).toBeLessThanOrEqual(2);
      expect(pathological.events.filter((event) => event.type === 'limit')).toHaveLength(1);
    }

    const hugeRequestedBudgets = simulateVertical(starter, environment, {
      ...options,
      maxIntegrationSteps: Number.MAX_SAFE_INTEGER,
      maxTraceSamples: Number.MAX_SAFE_INTEGER,
      collectTrace: false,
    });
    expect(hugeRequestedBudgets.outcome).toBe('apogee');
  });

  it('covers the full opening envelope and remains convergent', () => {
    let builds = 0;
    let negativeEdges = 0;
    for (let engine = 0; engine <= openingBalance.upgrades.engine.cap; engine += 1) {
      for (let fuel = 0; fuel <= openingBalance.upgrades.fuel.cap; fuel += 1) {
        for (let airframe = 0; airframe <= openingBalance.upgrades.airframe.cap; airframe += 1) {
          builds += 1;
          const levels = { engine, fuel, airframe, ignition: 0 };
          const coarse = simulateVertical(deriveVehicle(levels, openingBalance), environment, { ...options, collectTrace: false });
          const fine = simulateVertical(deriveVehicle(levels, openingBalance), environment, { ...options, dtS: options.dtS / 2, collectTrace: false });
          expect(coarse.outcome).toBe('apogee');
          expect(fine.outcome).toBe('apogee');
          expect(Math.abs(coarse.maximumAltitudeM - fine.maximumAltitudeM)).toBeLessThanOrEqual(Math.max(0.1, fine.maximumAltitudeM * 0.001));
          expect(Math.abs(coarse.terminalTimeS - fine.terminalTimeS)).toBeLessThanOrEqual(0.02);
          const kinds = ['engine', 'fuel', 'airframe'] as const;
          for (const kind of kinds) {
            if (levels[kind] < openingBalance.upgrades[kind].cap) {
              const next = { ...levels, [kind]: levels[kind] + 1 };
              const upgraded = simulateVertical(deriveVehicle(next, openingBalance), environment, { ...options, collectTrace: false });
              if (upgraded.maximumAltitudeM < coarse.maximumAltitudeM) negativeEdges += 1;
            }
          }
        }
      }
    }
    expect(builds).toBe(729);
    expect(negativeEdges).toBe(0);
  }, 15000);
});
