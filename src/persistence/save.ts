import { openingBalance } from '../config/opening';
import type { SimulationEnvironment } from '../simulation/types';
import { rewardFor } from '../game/economy';
import { simulateLaunchRecipe, validateLaunchRecipe, type HistoricalSimulationOptions, type LaunchRecipe } from '../game/launch';
import { createInitialGameState, type GameState, type LastLaunchRecord, type LaunchSummary, type MotionSetting } from '../game/reducer';
import { validateLevels, type RocketLevels, type VehicleSpec } from '../game/vehicle';

export const SAVE_KEY = 'escape-velocity.save';
export const SAVE_BACKUP_KEY = 'escape-velocity.save.backup';
export const MAX_SAVE_BYTES = 1_000_000;

export interface SaveV1 {
  gameId: 'escape-velocity';
  schemaVersion: 1;
  balanceVersion: 'opening-v2';
  revision: number;
  progress: {
    credits: number;
    levels: RocketLevels;
    bestAltitudeM: number;
    launchesStarted: number;
    launchesCompleted: number;
    nextRunId: number;
    lastSettledRunId: number | null;
  };
  settings: { motion: MotionSetting };
  lastLaunch: null | LastLaunchRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function nonNegativeNumber(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function safeInteger(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} must be a safe integer.`);
  return number;
}

function positiveSafeInteger(value: unknown, label: string): number {
  const number = safeInteger(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function numberOrNull(value: unknown, label: string): number | null {
  if (value === null) return null;
  return nonNegativeNumber(value, label);
}

function levelsFromUnknown(value: unknown): RocketLevels {
  const root = record(value, 'levels');
  const levels = {
    engine: safeInteger(root.engine, 'levels.engine'),
    fuel: safeInteger(root.fuel, 'levels.fuel'),
    airframe: safeInteger(root.airframe, 'levels.airframe'),
    ignition: safeInteger(root.ignition, 'levels.ignition'),
  };
  validateLevels(levels, openingBalance);
  return levels;
}

function vehicleFromUnknown(value: unknown, label: string): VehicleSpec {
  const root = record(value, label);
  const vehicle = {
    dryMassKg: finiteNumber(root.dryMassKg, `${label}.dryMassKg`),
    fuelMassKg: nonNegativeNumber(root.fuelMassKg, `${label}.fuelMassKg`),
    thrustN: nonNegativeNumber(root.thrustN, `${label}.thrustN`),
    exhaustVelocityMps: finiteNumber(root.exhaustVelocityMps, `${label}.exhaustVelocityMps`),
    dragAreaM2: nonNegativeNumber(root.dragAreaM2, `${label}.dragAreaM2`),
    ignitionDelayS: nonNegativeNumber(root.ignitionDelayS, `${label}.ignitionDelayS`),
  };
  if (vehicle.dryMassKg <= 0 || vehicle.exhaustVelocityMps <= 0) throw new Error(`${label} has invalid mass or exhaust velocity.`);
  return vehicle;
}

function environmentFromUnknown(value: unknown): SimulationEnvironment {
  const root = record(value, 'recipe.environment');
  const environment = {
    gravityMps2: nonNegativeNumber(root.gravityMps2, 'recipe.environment.gravityMps2'),
    radiusM: finiteNumber(root.radiusM, 'recipe.environment.radiusM'),
    densityKgM3: nonNegativeNumber(root.densityKgM3, 'recipe.environment.densityKgM3'),
    scaleHeightM: finiteNumber(root.scaleHeightM, 'recipe.environment.scaleHeightM'),
  };
  if (environment.radiusM <= 0 || environment.scaleHeightM <= 0) throw new Error('Recipe environment has invalid radius or scale height.');
  return environment;
}

function simulationFromUnknown(value: unknown): HistoricalSimulationOptions {
  const root = record(value, 'recipe.simulation');
  return {
    dtS: finiteNumber(root.dtS, 'recipe.simulation.dtS'),
    maxTimeS: finiteNumber(root.maxTimeS, 'recipe.simulation.maxTimeS'),
    fuelEpsilonKg: nonNegativeNumber(root.fuelEpsilonKg, 'recipe.simulation.fuelEpsilonKg'),
    traceIntervalS: finiteNumber(root.traceIntervalS, 'recipe.simulation.traceIntervalS'),
    maxIntegrationSteps: positiveSafeInteger(root.maxIntegrationSteps, 'recipe.simulation.maxIntegrationSteps'),
    maxTraceSamples: positiveSafeInteger(root.maxTraceSamples, 'recipe.simulation.maxTraceSamples'),
  };
}

function launchRecipeFromUnknown(value: unknown): LaunchRecipe {
  const root = record(value, 'lastLaunch.recipe');
  const recipe = {
    seed: safeInteger(root.seed, 'recipe.seed'),
    balanceVersion: root.balanceVersion,
    modelVersion: root.modelVersion,
    varianceVersion: root.varianceVersion,
    prngVersion: root.prngVersion,
    levels: levelsFromUnknown(root.levels),
    nominalVehicle: vehicleFromUnknown(root.nominalVehicle, 'recipe.nominalVehicle'),
    effectiveVehicle: vehicleFromUnknown(root.effectiveVehicle, 'recipe.effectiveVehicle'),
    conditionK: finiteNumber(root.conditionK, 'recipe.conditionK'),
    environment: environmentFromUnknown(root.environment),
    simulation: simulationFromUnknown(root.simulation),
  } as LaunchRecipe;
  validateLaunchRecipe(recipe, openingBalance);
  return recipe;
}

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1e-8, Math.abs(right) * 1e-8);
}

function summaryFromUnknown(value: unknown, recipe: LaunchRecipe): LaunchSummary {
  const root = record(value, 'lastLaunch.summary');
  const outcome = root.outcome;
  if (outcome !== 'apogee' && outcome !== 'noLiftoff' && outcome !== 'impact' && outcome !== 'invalid' && outcome !== 'limit') {
    throw new Error('lastLaunch.summary.outcome is unsupported.');
  }
  const summary: LaunchSummary = {
    outcome,
    maximumAltitudeM: nonNegativeNumber(root.maximumAltitudeM, 'summary.maximumAltitudeM'),
    terminalTimeS: nonNegativeNumber(root.terminalTimeS, 'summary.terminalTimeS'),
    burnoutTimeS: numberOrNull(root.burnoutTimeS, 'summary.burnoutTimeS'),
    terminalFuelKg: nonNegativeNumber(root.terminalFuelKg, 'summary.terminalFuelKg'),
    rewardCredits: safeInteger(root.rewardCredits, 'summary.rewardCredits'),
    recordBeforeM: nonNegativeNumber(root.recordBeforeM, 'summary.recordBeforeM'),
    isNewRecord: root.isNewRecord === true || root.isNewRecord === false ? root.isNewRecord : (() => { throw new Error('summary.isNewRecord must be boolean.'); })(),
  };
  if (summary.rewardCredits < 0) throw new Error('summary.rewardCredits must be non-negative.');
  const expected = simulateLaunchRecipe(recipe, false, openingBalance);
  if (
    summary.outcome !== expected.outcome ||
    !closeEnough(summary.maximumAltitudeM, expected.maximumAltitudeM) ||
    !closeEnough(summary.terminalTimeS, expected.terminalTimeS) ||
    !closeEnough(summary.terminalFuelKg, expected.terminalFuelKg) ||
    (summary.burnoutTimeS === null) !== (expected.burnoutTimeS === null) ||
    (summary.burnoutTimeS !== null && expected.burnoutTimeS !== null && !closeEnough(summary.burnoutTimeS, expected.burnoutTimeS))
  ) {
    throw new Error('lastLaunch.summary does not match its historical recipe result.');
  }
  const expectedReward = rewardFor(expected, openingBalance);
  if (summary.rewardCredits !== expectedReward) throw new Error('lastLaunch.summary.rewardCredits is not authoritative.');
  if (summary.isNewRecord !== (expected.outcome === 'apogee' && expected.maximumAltitudeM > summary.recordBeforeM)) {
    throw new Error('lastLaunch.summary.isNewRecord is inconsistent with recordBeforeM.');
  }
  return summary;
}

function lastLaunchFromUnknown(value: unknown): LastLaunchRecord | null {
  if (value === null) return null;
  const root = record(value, 'lastLaunch');
  const runId = positiveSafeInteger(root.runId, 'lastLaunch.runId');
  const status = root.status;
  if (status !== 'started' && status !== 'settled' && status !== 'interrupted') throw new Error('lastLaunch.status is unsupported.');
  const recipe = launchRecipeFromUnknown(root.recipe);
  const summary = status === 'settled' ? summaryFromUnknown(root.summary, recipe) : null;
  if (status !== 'settled' && root.summary !== null) throw new Error('Only settled launches may contain a summary.');
  return { runId, status, recipe, summary };
}

export function validateSave(value: unknown): SaveV1 {
  const root = record(value, 'save');
  if (root.gameId !== 'escape-velocity') throw new Error('Save gameId is unsupported.');
  if (root.schemaVersion !== 1) throw new Error('Save schemaVersion is unsupported.');
  if (root.balanceVersion !== openingBalance.balanceVersion) throw new Error('Save balanceVersion is unsupported.');
  const revision = safeInteger(root.revision, 'save.revision');
  if (revision < 0) throw new Error('save.revision must be non-negative.');
  const progressRoot = record(root.progress, 'save.progress');
  const progress = {
    credits: safeInteger(progressRoot.credits, 'progress.credits'),
    levels: levelsFromUnknown(progressRoot.levels),
    bestAltitudeM: nonNegativeNumber(progressRoot.bestAltitudeM, 'progress.bestAltitudeM'),
    launchesStarted: safeInteger(progressRoot.launchesStarted, 'progress.launchesStarted'),
    launchesCompleted: safeInteger(progressRoot.launchesCompleted, 'progress.launchesCompleted'),
    nextRunId: positiveSafeInteger(progressRoot.nextRunId, 'progress.nextRunId'),
    lastSettledRunId: progressRoot.lastSettledRunId === null ? null : positiveSafeInteger(progressRoot.lastSettledRunId, 'progress.lastSettledRunId'),
  };
  if (progress.credits < 0 || progress.launchesStarted < 0 || progress.launchesCompleted < 0) throw new Error('Progress counters must be non-negative.');
  if (progress.launchesStarted >= Number.MAX_SAFE_INTEGER || progress.nextRunId !== progress.launchesStarted + 1) throw new Error('progress.nextRunId is inconsistent.');
  if (progress.launchesCompleted > progress.launchesStarted) throw new Error('progress.launchesCompleted exceeds launchesStarted.');
  if (progress.lastSettledRunId !== null && progress.lastSettledRunId > progress.launchesStarted) throw new Error('progress.lastSettledRunId is invalid.');
  if ((progress.launchesCompleted === 0) !== (progress.lastSettledRunId === null)) throw new Error('Completed launches and lastSettledRunId are inconsistent.');

  const settingsRoot = record(root.settings, 'save.settings');
  const motion = settingsRoot.motion;
  if (motion !== 'system' && motion !== 'reduced' && motion !== 'full') throw new Error('save.settings.motion is unsupported.');
  const lastLaunch = lastLaunchFromUnknown(root.lastLaunch);
  if (progress.launchesStarted === 0 && lastLaunch !== null) throw new Error('A fresh progress record cannot have a last launch.');
  if (progress.launchesStarted > 0 && lastLaunch === null) throw new Error('Started progress must retain its latest launch recipe.');
  if (lastLaunch && lastLaunch.runId !== progress.launchesStarted) throw new Error('lastLaunch must be the latest launch.');
  if (lastLaunch?.status === 'settled' && progress.lastSettledRunId !== lastLaunch.runId) throw new Error('Settled lastLaunch must be the lastSettledRunId.');
  if (lastLaunch?.status === 'settled' && progress.launchesCompleted === 0) throw new Error('Settled lastLaunch requires a completed launch.');
  if (lastLaunch?.status === 'interrupted' && progress.lastSettledRunId === lastLaunch.runId) throw new Error('Interrupted lastLaunch cannot be the lastSettledRunId.');
  if (lastLaunch && lastLaunch.status !== 'settled' && progress.lastSettledRunId !== null && progress.lastSettledRunId >= lastLaunch.runId) {
    throw new Error('Interrupted/started lastLaunch must follow the last settled launch.');
  }
  if (lastLaunch?.status === 'settled' && lastLaunch.summary) {
    if (lastLaunch.summary.isNewRecord) {
      if (lastLaunch.summary.maximumAltitudeM <= lastLaunch.summary.recordBeforeM || !closeEnough(progress.bestAltitudeM, lastLaunch.summary.maximumAltitudeM)) {
        throw new Error('New-record summary is inconsistent with the saved best altitude.');
      }
    } else if (!closeEnough(progress.bestAltitudeM, lastLaunch.summary.recordBeforeM) || lastLaunch.summary.maximumAltitudeM > lastLaunch.summary.recordBeforeM) {
      throw new Error('Repeat summary is inconsistent with the saved best altitude.');
    }
  }
  return {
    gameId: 'escape-velocity',
    schemaVersion: 1,
    balanceVersion: openingBalance.balanceVersion,
    revision,
    progress,
    settings: { motion },
    lastLaunch,
  };
}

export function parseSave(raw: string): SaveV1 {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > MAX_SAVE_BYTES) throw new Error('Save exceeds the 1 MB limit.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Save is not valid JSON.');
  }
  return validateSave(parsed);
}

export function serializeSave(save: SaveV1): string {
  const raw = JSON.stringify(save);
  if (new TextEncoder().encode(raw).byteLength > MAX_SAVE_BYTES) throw new Error('Save exceeds the 1 MB limit.');
  return raw;
}

export function saveForState(state: GameState, revision: number): SaveV1 {
  const save: SaveV1 = {
    gameId: 'escape-velocity',
    schemaVersion: 1,
    balanceVersion: openingBalance.balanceVersion,
    revision,
    progress: {
      credits: state.credits,
      levels: { ...state.levels },
      bestAltitudeM: state.recordM,
      launchesStarted: state.launchesStarted,
      launchesCompleted: state.launchesCompleted,
      nextRunId: state.nextRunId,
      lastSettledRunId: state.lastSettledRunId,
    },
    settings: { ...state.settings },
    lastLaunch: state.lastLaunch ? {
      ...state.lastLaunch,
      recipe: {
        ...state.lastLaunch.recipe,
        levels: { ...state.lastLaunch.recipe.levels },
        nominalVehicle: { ...state.lastLaunch.recipe.nominalVehicle },
        effectiveVehicle: { ...state.lastLaunch.recipe.effectiveVehicle },
        environment: { ...state.lastLaunch.recipe.environment },
        simulation: { ...state.lastLaunch.recipe.simulation },
      },
      summary: state.lastLaunch.summary ? { ...state.lastLaunch.summary } : null,
    } : null,
  };
  return validateSave(save);
}

export function stateFromSave(save: SaveV1): GameState {
  const initial = createInitialGameState();
  const lastResult = save.lastLaunch?.status === 'settled'
    ? simulateLaunchRecipe(save.lastLaunch.recipe, true, openingBalance)
    : null;
  return {
    ...initial,
    status: lastResult ? 'result' : 'ready',
    credits: save.progress.credits,
    levels: { ...save.progress.levels },
    recordM: save.progress.bestAltitudeM,
    launchesStarted: save.progress.launchesStarted,
    launchesCompleted: save.progress.launchesCompleted,
    nextRunId: save.progress.nextRunId,
    lastSettledRunId: save.progress.lastSettledRunId,
    settings: { ...save.settings },
    activeLaunch: null,
    lastResult,
    lastLaunch: save.lastLaunch ? {
      ...save.lastLaunch,
      recipe: {
        ...save.lastLaunch.recipe,
        levels: { ...save.lastLaunch.recipe.levels },
        nominalVehicle: { ...save.lastLaunch.recipe.nominalVehicle },
        effectiveVehicle: { ...save.lastLaunch.recipe.effectiveVehicle },
        environment: { ...save.lastLaunch.recipe.environment },
        simulation: { ...save.lastLaunch.recipe.simulation },
      },
      summary: save.lastLaunch.summary ? { ...save.lastLaunch.summary } : null,
    } : null,
  };
}
