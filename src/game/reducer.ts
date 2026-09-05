import { openingBalance } from '../config/opening';
import { deriveVehicle, starterLevels, type RocketLevels, type VehicleSpec } from './vehicle';
import { simulateVertical } from '../simulation/vertical';
import type { FlightResult } from '../simulation/types';

export type GameStatus = 'ready' | 'ignition' | 'playing' | 'result';

export interface ActiveLaunch {
  runId: number;
  levels: RocketLevels;
  vehicle: VehicleSpec;
  result: FlightResult;
}

export interface GameState {
  status: GameStatus;
  recordM: number;
  activeLaunch: ActiveLaunch | null;
  lastResult: FlightResult | null;
  nextRunId: number;
  lastSettledRunId: number | null;
}

export type GameAction =
  | { type: 'launch' }
  | { type: 'presentationPhase'; phase: 'playing' }
  | { type: 'settle'; runId: number };

export function createInitialGameState(): GameState {
  return {
    status: 'ready',
    recordM: 0,
    activeLaunch: null,
    lastResult: null,
    nextRunId: 1,
    lastSettledRunId: null,
  };
}

function launch(state: GameState): GameState {
  if (state.status !== 'ready' && state.status !== 'result') return state;
  const vehicle = deriveVehicle(starterLevels, openingBalance);
  const result = simulateVertical(vehicle, openingBalance.environment, {
    ...openingBalance.simulation,
    balanceVersion: openingBalance.balanceVersion,
    modelVersion: openingBalance.modelVersion,
    collectTrace: true,
  });
  return {
    ...state,
    status: 'ignition',
    activeLaunch: { runId: state.nextRunId, levels: { ...starterLevels }, vehicle, result },
    nextRunId: state.nextRunId + 1,
  };
}

function settle(state: GameState, runId: number): GameState {
  const active = state.activeLaunch;
  if (!active || state.status !== 'ignition' && state.status !== 'playing' || active.runId !== runId) return state;
  if (state.lastSettledRunId === runId) return state;
  const result = active.result;
  return {
    ...state,
    status: 'result',
    recordM: result.outcome === 'apogee' ? Math.max(state.recordM, result.maximumAltitudeM) : state.recordM,
    activeLaunch: null,
    lastResult: result,
    lastSettledRunId: runId,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'launch':
      return launch(state);
    case 'presentationPhase':
      return state.status === 'ignition' && state.activeLaunch ? { ...state, status: action.phase } : state;
    case 'settle':
      return settle(state, action.runId);
    default:
      return state;
  }
}
