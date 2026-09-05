import { openingBalance } from '../config/opening';
import type { OpeningBalance } from '../config/types';
import { simulateVertical } from '../simulation/vertical';
import type { FlightResult, SimulationEnvironment, SimulationOptions } from '../simulation/types';
import { deriveVehicle, validateLevels, type RocketLevels, type VehicleSpec } from './vehicle';
import { effectiveVehicleForCondition, effectiveVehicleForSeed, PRNG_VERSION, validateLaunchSeed, VARIANCE_VERSION } from './variance';

export type HistoricalSimulationOptions = Pick<SimulationOptions, 'dtS' | 'maxTimeS' | 'fuelEpsilonKg' | 'traceIntervalS' | 'maxIntegrationSteps' | 'maxTraceSamples'>;

export interface LaunchRecipe {
  seed: number;
  balanceVersion: 'opening-v2';
  modelVersion: 'vertical-v1.1';
  varianceVersion: typeof VARIANCE_VERSION;
  prngVersion: typeof PRNG_VERSION;
  levels: RocketLevels;
  nominalVehicle: VehicleSpec;
  effectiveVehicle: VehicleSpec;
  conditionK: number;
  environment: SimulationEnvironment;
  simulation: HistoricalSimulationOptions;
}

export interface PreparedLaunch {
  recipe: LaunchRecipe;
  nominalResult: FlightResult;
  result: FlightResult;
}

function copyEnvironment(balance: OpeningBalance): SimulationEnvironment {
  return { ...balance.environment };
}

function copySimulation(balance: OpeningBalance): HistoricalSimulationOptions {
  return {
    dtS: balance.simulation.dtS,
    maxTimeS: balance.simulation.maxTimeS,
    fuelEpsilonKg: balance.simulation.fuelEpsilonKg,
    traceIntervalS: balance.simulation.traceIntervalS,
    maxIntegrationSteps: balance.simulation.maxIntegrationSteps,
    maxTraceSamples: balance.simulation.maxTraceSamples,
  };
}

function simulationOptions(recipe: LaunchRecipe, collectTrace: boolean): SimulationOptions {
  return {
    ...recipe.simulation,
    balanceVersion: recipe.balanceVersion,
    modelVersion: recipe.modelVersion,
    collectTrace,
  };
}

export function createLaunchRecipe(
  levels: RocketLevels,
  seed: number,
  balance: OpeningBalance = openingBalance,
): LaunchRecipe {
  validateLevels(levels, balance);
  validateLaunchSeed(seed);
  const nominalVehicle = deriveVehicle(levels, balance);
  const { conditionK, vehicle: effectiveVehicle } = effectiveVehicleForSeed(nominalVehicle, seed, balance);
  return {
    seed,
    balanceVersion: balance.balanceVersion,
    modelVersion: balance.modelVersion,
    varianceVersion: balance.variance.varianceVersion,
    prngVersion: balance.variance.prngVersion,
    levels: { ...levels },
    nominalVehicle: { ...nominalVehicle },
    effectiveVehicle: { ...effectiveVehicle },
    conditionK,
    environment: copyEnvironment(balance),
    simulation: copySimulation(balance),
  };
}

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1e-12, Math.abs(right) * 1e-12);
}

function assertVehicleMatches(actual: VehicleSpec, expected: VehicleSpec, label: string): void {
  for (const key of ['dryMassKg', 'fuelMassKg', 'thrustN', 'exhaustVelocityMps', 'dragAreaM2', 'ignitionDelayS'] as const) {
    if (!closeEnough(actual[key], expected[key])) throw new Error(`${label}.${key} does not match the approved derivation.`);
  }
}

function assertEnvironmentMatches(actual: SimulationEnvironment, expected: SimulationEnvironment): void {
  for (const key of ['gravityMps2', 'radiusM', 'densityKgM3', 'scaleHeightM'] as const) {
    if (!closeEnough(actual[key], expected[key])) throw new Error(`Historical environment ${key} is not approved.`);
  }
}

function assertSimulationMatches(actual: HistoricalSimulationOptions, expected: HistoricalSimulationOptions): void {
  for (const key of ['dtS', 'maxTimeS', 'fuelEpsilonKg', 'traceIntervalS', 'maxIntegrationSteps', 'maxTraceSamples'] as const) {
    if (!closeEnough(actual[key], expected[key])) throw new Error(`Historical simulation option ${key} is not approved.`);
  }
}

export function validateLaunchRecipe(recipe: LaunchRecipe, balance: OpeningBalance = openingBalance): void {
  validateLaunchSeed(recipe.seed);
  if (recipe.balanceVersion !== balance.balanceVersion || recipe.modelVersion !== balance.modelVersion) {
    throw new Error('Historical launch balance/model version is unsupported.');
  }
  if (recipe.varianceVersion !== balance.variance.varianceVersion || recipe.prngVersion !== balance.variance.prngVersion) {
    throw new Error('Historical launch variance/PRNG version is unsupported.');
  }
  validateLevels(recipe.levels, balance);
  const expectedNominal = deriveVehicle(recipe.levels, balance);
  assertVehicleMatches(recipe.nominalVehicle, expectedNominal, 'nominalVehicle');
  const expectedCondition = effectiveVehicleForSeed(expectedNominal, recipe.seed, balance).conditionK;
  if (!closeEnough(recipe.conditionK, expectedCondition)) throw new Error('Historical engine condition does not match its seed.');
  assertVehicleMatches(recipe.effectiveVehicle, effectiveVehicleForCondition(expectedNominal, recipe.conditionK), 'effectiveVehicle');
  assertEnvironmentMatches(recipe.environment, balance.environment);
  assertSimulationMatches(recipe.simulation, copySimulation(balance));
}

export function simulateLaunchRecipe(
  recipe: LaunchRecipe,
  collectTrace = true,
  balance: OpeningBalance = openingBalance,
): FlightResult {
  validateLaunchRecipe(recipe, balance);
  return simulateVertical(recipe.effectiveVehicle, recipe.environment, simulationOptions(recipe, collectTrace));
}

export function prepareLaunch(
  levels: RocketLevels,
  seed: number,
  balance: OpeningBalance = openingBalance,
): PreparedLaunch {
  const recipe = createLaunchRecipe(levels, seed, balance);
  const nominalResult = simulateVertical(recipe.nominalVehicle, recipe.environment, {
    ...simulationOptions(recipe, false),
    collectTrace: false,
  });
  const result = simulateLaunchRecipe(recipe, true, balance);
  return { recipe, nominalResult, result };
}
