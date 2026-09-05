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

export type GameAction =
  | { type: 'reserveNewLaunch'; seed: number }
  | { type: 'presentationPhase'; runId: number; playbackId: number; phase: 'playing' }
  | { type: 'settleNewLaunch'; runId: number; playbackId: number }
  | { type: 'startReplay' }
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

function reserveNewLaunch(state: GameState, seed: number): GameState {
  if (state.status !== 'ready' && state.status !== 'result') return state;
  if (!Number.isSafeInteger(state.nextRunId) || !Number.isSafeInteger(state.launchesStarted) ||
      state.nextRunId < 1 || state.nextRunId >= Number.MAX_SAFE_INTEGER || state.launchesStarted < 0 || state.launchesStarted >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Launch counters are not safe to increment.');
  }
  if (!Number.isSafeInteger(state.nextPlaybackId) || state.nextPlaybackId < 1 || state.nextPlaybackId >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Playback counters are not safe to increment.');
  }
  const prepared = prepareLaunch(state.levels, seed, openingBalance);
  const runId = state.nextRunId;
  const lastLaunch: LastLaunchRecord = { runId, status: 'started', recipe: prepared.recipe, summary: null };
  return {
    ...state,
    status: 'ignition',
    activeLaunch: {
      runId,
      playbackId: state.nextPlaybackId,
      mode: 'new',
      levels: { ...prepared.recipe.levels },
      vehicle: { ...prepared.recipe.effectiveVehicle },
      nominalPeakM: prepared.nominalResult.maximumAltitudeM,
      result: prepared.result,
    },
    launchesStarted: state.launchesStarted + 1,
    nextRunId: runId + 1,
    nextPlaybackId: state.nextPlaybackId + 1,
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

function startReplay(state: GameState): GameState {
  if (state.activeLaunch || !state.lastLaunch) return state;
  if (!Number.isSafeInteger(state.nextPlaybackId) || state.nextPlaybackId < 1 || state.nextPlaybackId >= Number.MAX_SAFE_INTEGER) return state;
  const result = simulateLaunchRecipe(state.lastLaunch.recipe, true, openingBalance);
  const nominalResult = simulateVertical(state.lastLaunch.recipe.nominalVehicle, state.lastLaunch.recipe.environment, {
    ...state.lastLaunch.recipe.simulation,
    balanceVersion: state.lastLaunch.recipe.balanceVersion,
    modelVersion: state.lastLaunch.recipe.modelVersion,
    collectTrace: false,
  });
  return {
    ...state,
    status: 'replay',
    activeLaunch: {
      runId: state.lastLaunch.runId,
      playbackId: state.nextPlaybackId,
      mode: 'replay',
      levels: { ...state.lastLaunch.recipe.levels },
      vehicle: { ...state.lastLaunch.recipe.effectiveVehicle },
      nominalPeakM: nominalResult.maximumAltitudeM,
      result,
    },
    nextPlaybackId: state.nextPlaybackId + 1,
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
      return reserveNewLaunch(state, action.seed);
    case 'presentationPhase':
      return state.status === 'ignition' && state.activeLaunch?.mode === 'new' &&
        state.activeLaunch.runId === action.runId && state.activeLaunch.playbackId === action.playbackId
        ? { ...state, status: action.phase }
        : state;
    case 'settleNewLaunch':
      return settleNewLaunch(state, action.runId, action.playbackId);
    case 'startReplay':
      return startReplay(state);
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
