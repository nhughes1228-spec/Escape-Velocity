import { openingBalance } from '../config/opening';
import type { OpeningBalance } from '../config/types';

export interface RocketLevels {
  engine: number;
  fuel: number;
  airframe: number;
  ignition: number;
}

export interface VehicleSpec {
  dryMassKg: number;
  fuelMassKg: number;
  thrustN: number;
  exhaustVelocityMps: number;
  dragAreaM2: number;
  ignitionDelayS: number;
}

export const starterLevels: RocketLevels = Object.freeze({ engine: 0, fuel: 0, airframe: 0, ignition: 0 });

export function validateLevels(levels: RocketLevels, balance: OpeningBalance = openingBalance): void {
  const entries: Array<[keyof RocketLevels, number]> = [
    ['engine', levels.engine],
    ['fuel', levels.fuel],
    ['airframe', levels.airframe],
    ['ignition', levels.ignition],
  ];
  for (const [kind, level] of entries) {
    const cap = balance.upgrades[kind].cap;
    if (!Number.isInteger(level) || level < 0 || level > cap) {
      throw new RangeError(`${kind} level ${level} is outside 0-${cap}.`);
    }
  }
}

export function deriveVehicle(levels: RocketLevels, balance: OpeningBalance = openingBalance): VehicleSpec {
  validateLevels(levels, balance);
  const base = balance.vehicle;
  const { engine, fuel, airframe, ignition } = balance.upgrades;
  return {
    dryMassKg:
      base.structureKg / (1 + airframe.massDivisorPerLevel * levels.airframe) +
      base.engineKg +
      engine.massKgPerLevel * levels.engine +
      fuel.tankKgPerLevel * levels.fuel,
    fuelMassKg: base.fuelKg * (1 + fuel.capacityPerLevel * levels.fuel),
    thrustN: base.thrustN * (1 + engine.thrustPerLevel * levels.engine),
    exhaustVelocityMps: base.exhaustVelocityMps * (1 + engine.exhaustPerLevel * levels.engine),
    dragAreaM2: base.dragAreaM2 / (1 + airframe.dragDivisorPerLevel * levels.airframe),
    ignitionDelayS: ignition.delaysS[levels.ignition],
  };
}
