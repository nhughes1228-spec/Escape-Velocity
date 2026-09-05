import { openingBalance } from '../config/opening';
import type { OpeningBalance } from '../config/types';
import type { VehicleSpec } from './vehicle';

export const VARIANCE_VERSION = 'engine-variation-v1' as const;
export const PRNG_VERSION = 'mulberry32-v1' as const;
const UINT32_MAX = 0xffffffff;

export function isUint32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;
}

export function validateLaunchSeed(seed: unknown): asserts seed is number {
  if (!isUint32(seed)) throw new RangeError('Launch seed must be an unsigned 32-bit integer.');
}

export function createGameplaySeed(): number {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Secure random seed generation is unavailable.');
  }
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0];
}

export function makeLaunchRng(seed: number): () => number {
  // Validate before >>> 0 so imported values cannot be silently truncated.
  validateLaunchSeed(seed);
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function engineConditionForSeed(
  seed: number,
  balance: OpeningBalance = openingBalance,
): number {
  validateLaunchSeed(seed);
  if (balance.variance.varianceVersion !== VARIANCE_VERSION || balance.variance.prngVersion !== PRNG_VERSION) {
    throw new Error('Unsupported launch variance version.');
  }
  const next = makeLaunchRng(seed);
  return 1 + balance.variance.amplitude * (next() + next() - 1);
}

export function effectiveVehicleForCondition(nominalVehicle: VehicleSpec, conditionK: number): VehicleSpec {
  if (!Number.isFinite(conditionK) || conditionK <= 0) throw new RangeError('Engine condition must be positive and finite.');
  return {
    ...nominalVehicle,
    thrustN: nominalVehicle.thrustN * conditionK,
    exhaustVelocityMps: nominalVehicle.exhaustVelocityMps * conditionK,
  };
}

export function effectiveVehicleForSeed(
  nominalVehicle: VehicleSpec,
  seed: number,
  balance: OpeningBalance = openingBalance,
): { conditionK: number; vehicle: VehicleSpec } {
  const conditionK = engineConditionForSeed(seed, balance);
  return { conditionK, vehicle: effectiveVehicleForCondition(nominalVehicle, conditionK) };
}
