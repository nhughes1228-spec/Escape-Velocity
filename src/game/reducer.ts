import { openingBalance } from '../config/opening';
import { simulateVertical } from '../simulation/vertical';
import type { FlightOutcome, FlightResult } from '../simulation/types';
import { costFor, isUpgradeKind, rewardFor, type UpgradeKind } from './economy';
import { prepareLaunch, simulateLaunchRecipe, type LaunchRecipe } from './launch';
import { starterLevels, type RocketLevels, type VehicleSpec } from './vehicle';

export type GameStatus = 'ready' | 'ignition' | 'playing' | 'replay' | 'result';
export type MotionSetting = 'system' | 'reduced' | 'full';

export interface LaunchSummary {
  outcome: FlightOutcome;
  maximumAltitudeM: number;
  terminalTimeS: number;
  burnoutTimeS: number | null;
  terminalFuelKg: number;
  rewardCredits: number;
  recordBeforeM: number;
  isNewRecord: boolean;
}

export interface LastLaunchRecord {
  runId: number;
  status: 'started' | 'settled' | 'interrupted';
  recipe: LaunchRecipe;
  summary: LaunchSummary | null;
}

export interface ActiveLaunch {
  runId: number;
  playbackId: number;
  mode: 'new' | 'replay';
  levels: RocketLevels;
  vehicle: VehicleSpec;
  nominalPeakM: number;
  result: FlightResult;
}

export interface GameState {
  status: GameStatus;
  credits: number;
  levels: RocketLevels;
  recordM: number;
  launchesStarted: number;
  launchesCompleted: number;
  nextRunId: number;
  nextPlaybackId: number;
  lastSettledRunId: number | null;
  settings: { motion: MotionSetting };
  activeLaunch: ActiveLaunch | null;
  lastResult: FlightResult | null;
  lastLaunch: LastLaunchRecord | null;
}

function cloneFlightResult(result: FlightResult | null): FlightResult | null {
  if (!result) return null;
  return {
    ...result,
    vehicle: { ...result.vehicle },
    events: result.events.map((event) => ({ ...event })),
    trace: result.trace.map((sample) => ({ ...sample })),
  };
}

function cloneLaunchRecord(record: LastLaunchRecord | null): LastLaunchRecord | null {
  if (!record) return null;
  return {
    ...record,
    recipe: {
      ...record.recipe,
      levels: { ...record.recipe.levels },
      nominalVehicle: { ...record.recipe.nominalVehicle },
      effectiveVehicle: { ...record.recipe.effectiveVehicle },
      environment: { ...record.recipe.environment },
      simulation: { ...record.recipe.simulation },
    },
    summary: record.summary ? { ...record.summary } : null,
  };
}

/**
 * Return a defensive snapshot for presentation and external callers. The
 * store keeps its own authoritative graph private; in particular, a caller
 * cannot mutate a historical result or recipe between reservation and
 * settlement.
 */
export function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    levels: { ...state.levels },
    settings: { ...state.settings },
    activeLaunch: state.activeLaunch ? {
      ...state.activeLaunch,
      levels: { ...state.activeLaunch.levels },
      vehicle: { ...state.activeLaunch.vehicle },
      result: cloneFlightResult(state.activeLaunch.result)!,
    } : null,
    lastResult: cloneFlightResult(state.lastResult),
    lastLaunch: cloneLaunchRecord(state.lastLaunch),
  };
}

export type GameAction =
  | { type: 'reserveNewLaunch'; seed: number; playbackId?: number }
  | { type: 'presentationPhase'; runId: number; playbackId: number; phase: 'playing' }
  | { type: 'settleNewLaunch'; runId: number; playbackId: number }
  | { type: 'startReplay'; playbackId?: number }
  | { type: 'completeReplay'; runId: number; playbackId: number }
  | { type: 'stopReplay' }
  | { type: 'markInterrupted' }
  | { type: 'buyUpgrade'; kind: UpgradeKind }
  | { type: 'setMotion'; motion: MotionSetting };

export function createInitialGameState(): GameState {
  return {
    status: 'ready',
    credits: 0,
    levels: { ...starterLevels },
    recordM: 0,
    launchesStarted: 0,
    launchesCompleted: 0,
    nextRunId: 1,
    nextPlaybackId: 1,
    lastSettledRunId: null,
    settings: { motion: 'system' },
    activeLaunch: null,
    lastResult: null,
    lastLaunch: null,
  };
}

export function canReserveNewLaunch(state: GameState): boolean {
  return state.status === 'ready' || state.status === 'result';
}

export function canStartReplay(state: GameState): boolean {
  return !state.activeLaunch && state.lastLaunch !== null;
}

function reserveNewLaunch(state: GameState, seed: number, requestedPlaybackId = state.nextPlaybackId): GameState {
  if (!canReserveNewLaunch(state)) return state;
  if (!Number.isSafeInteger(state.nextRunId) || !Number.isSafeInteger(state.launchesStarted) ||
      state.nextRunId < 1 || state.nextRunId >= Number.MAX_SAFE_INTEGER || state.launchesStarted < 0 || state.launchesStarted >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Launch counters are not safe to increment.');
  }
  if (!Number.isSafeInteger(requestedPlaybackId) || requestedPlaybackId < 1 || requestedPlaybackId >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Playback counters are not safe to increment.');
  }
  const prepared = prepareLaunch(state.levels, seed, openingBalance);
  const runId = state.nextRunId;
  const nextPlaybackId = Math.max(state.nextPlaybackId, requestedPlaybackId + 1);
  const lastLaunch: LastLaunchRecord = { runId, status: 'started', recipe: prepared.recipe, summary: null };
  return {
    ...state,
    status: 'ignition',
    activeLaunch: {
      runId,
      playbackId: requestedPlaybackId,
      mode: 'new',
      levels: { ...prepared.recipe.levels },
      vehicle: { ...prepared.recipe.effectiveVehicle },
      nominalPeakM: prepared.nominalResult.maximumAltitudeM,
      result: prepared.result,
    },
    launchesStarted: state.launchesStarted + 1,
    nextRunId: runId + 1,
    nextPlaybackId,
    lastLaunch,
  };
}

function settleNewLaunch(state: GameState, runId: number, playbackId: number): GameState {
  const active = state.activeLaunch;
  if (!active || active.mode !== 'new' || (state.status !== 'ignition' && state.status !== 'playing') || active.runId !== runId || active.playbackId !== playbackId) return state;
  if (!state.lastLaunch || state.lastLaunch.runId !== runId || state.lastLaunch.status !== 'started') return state;
  if (!Number.isSafeInteger(state.launchesCompleted) || state.launchesCompleted < 0 || state.launchesCompleted >= Number.MAX_SAFE_INTEGER) return state;
  const result = active.result;
  const rewardCredits = rewardFor(result, openingBalance);
  const recordBeforeM = state.recordM;
  const isNewRecord = result.outcome === 'apogee' && result.maximumAltitudeM > recordBeforeM;
  if (!Number.isSafeInteger(state.credits) || state.credits < 0 || state.credits > Number.MAX_SAFE_INTEGER - rewardCredits) return state;
  const summary: LaunchSummary = {
    outcome: result.outcome,
    maximumAltitudeM: result.maximumAltitudeM,
    terminalTimeS: result.terminalTimeS,
    burnoutTimeS: result.burnoutTimeS,
    terminalFuelKg: result.terminalFuelKg,
    rewardCredits,
    recordBeforeM,
    isNewRecord,
  };
  return {
    ...state,
    status: 'result',
    credits: state.credits + rewardCredits,
    recordM: isNewRecord ? result.maximumAltitudeM : state.recordM,
    launchesCompleted: state.launchesCompleted + 1,
    activeLaunch: null,
    lastResult: result,
    lastSettledRunId: runId,
    lastLaunch: { ...state.lastLaunch, status: 'settled', summary },
  };
}

function startReplay(state: GameState, requestedPlaybackId = state.nextPlaybackId): GameState {
  const lastLaunch = state.lastLaunch;
  if (!canStartReplay(state) || !lastLaunch) return state;
  if (!Number.isSafeInteger(requestedPlaybackId) || requestedPlaybackId < 1 || requestedPlaybackId >= Number.MAX_SAFE_INTEGER) return state;
  const result = simulateLaunchRecipe(lastLaunch.recipe, true, openingBalance);
  const nominalResult = simulateVertical(lastLaunch.recipe.nominalVehicle, lastLaunch.recipe.environment, {
    ...lastLaunch.recipe.simulation,
    balanceVersion: lastLaunch.recipe.balanceVersion,
    modelVersion: lastLaunch.recipe.modelVersion,
    collectTrace: false,
  });
  return {
    ...state,
    status: 'replay',
    activeLaunch: {
      runId: lastLaunch.runId,
      playbackId: requestedPlaybackId,
      mode: 'replay',
      levels: { ...lastLaunch.recipe.levels },
      vehicle: { ...lastLaunch.recipe.effectiveVehicle },
      nominalPeakM: nominalResult.maximumAltitudeM,
      result,
    },
    nextPlaybackId: Math.max(state.nextPlaybackId, requestedPlaybackId + 1),
  };
}

function completeReplay(state: GameState, runId: number, playbackId: number): GameState {
  const active = state.activeLaunch;
  if (!active || active.mode !== 'replay' || state.status !== 'replay' || active.runId !== runId || active.playbackId !== playbackId) return state;
  return { ...state, status: 'result', activeLaunch: null, lastResult: active.result };
}

function buyUpgrade(state: GameState, kind: UpgradeKind): GameState {
  if ((state.status !== 'ready' && state.status !== 'result') || !isUpgradeKind(kind)) return state;
  const currentLevel = state.levels[kind];
  if (currentLevel >= openingBalance.upgrades[kind].cap) return state;
  const price = costFor(kind, currentLevel, openingBalance);
  if (!Number.isSafeInteger(state.credits) || state.credits < price) return state;
  return {
    ...state,
    credits: state.credits - price,
    levels: { ...state.levels, [kind]: currentLevel + 1 },
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'reserveNewLaunch':
      return reserveNewLaunch(state, action.seed, action.playbackId);
    case 'presentationPhase':
      return state.status === 'ignition' && state.activeLaunch?.mode === 'new' &&
        state.activeLaunch.runId === action.runId && state.activeLaunch.playbackId === action.playbackId
        ? { ...state, status: action.phase }
        : state;
    case 'settleNewLaunch':
      return settleNewLaunch(state, action.runId, action.playbackId);
    case 'startReplay':
      return startReplay(state, action.playbackId);
    case 'completeReplay':
      return completeReplay(state, action.runId, action.playbackId);
    case 'stopReplay':
      return state.activeLaunch?.mode === 'replay'
        ? { ...state, status: state.lastLaunch?.status === 'settled' ? 'result' : 'ready', activeLaunch: null }
        : state;
    case 'markInterrupted':
      return state.lastLaunch?.status === 'started' && (!state.activeLaunch || state.activeLaunch.mode === 'new')
        ? {
          ...state,
          status: 'ready',
          activeLaunch: null,
          lastLaunch: { ...state.lastLaunch, status: 'interrupted' },
        }
        : state;
    case 'buyUpgrade':
      return buyUpgrade(state, action.kind);
    case 'setMotion':
      return state.settings.motion === action.motion ? state : { ...state, settings: { motion: action.motion } };
    default:
      return state;
  }
}
