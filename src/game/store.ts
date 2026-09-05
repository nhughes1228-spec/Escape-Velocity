import { createGameplaySeed } from './variance';
import { createInitialGameState, gameReducer, type GameAction, type GameState, type MotionSetting } from './reducer';
import { parseSave, saveForState, stateFromSave, type SaveV1 } from '../persistence/save';
import { browserSaveStorage, inspectStorage, writeSave, type SaveInspection, type SaveStorage } from '../persistence/storage';
import type { UpgradeKind } from './economy';

export type GameCommand =
  | { type: 'reserveNewLaunch' }
  | { type: 'settleNewLaunch'; runId: number; playbackId: number }
  | { type: 'startReplay' }
  | { type: 'completeReplay'; runId: number; playbackId: number }
  | { type: 'stopReplay' }
  | { type: 'markInterrupted' }
  | { type: 'buyUpgrade'; kind: UpgradeKind }
  | { type: 'setMotion'; motion: MotionSetting };

export interface PersistenceSnapshot {
  kind: 'saved' | 'not-saved' | 'recovery' | 'conflict';
  message: string | null;
  protectedPrimaryRaw: string | null;
  backupAvailable: boolean;
}

export interface GameStoreOptions {
  storage?: SaveStorage;
  seedSource?: () => number;
}

export interface GameStore {
  getState(): GameState;
  getPersistence(): PersistenceSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(command: GameCommand): boolean;
  recoverBackup(): boolean;
  importSave(raw: string, confirmed: boolean): boolean;
  exportSave(): string;
  reset(confirmed: boolean): boolean;
  dispose(): void;
}

function unavailableStorage(): SaveStorage {
  return {
    getItem() { throw new Error('Browser storage is unavailable.'); },
    setItem() { throw new Error('Browser storage is unavailable.'); },
  };
}

function isDurable(command: GameCommand): boolean {
  return command.type === 'reserveNewLaunch' || command.type === 'settleNewLaunch' || command.type === 'markInterrupted' || command.type === 'buyUpgrade' || command.type === 'setMotion';
}

function loadedState(inspection: SaveInspection): { state: GameState; revision: number; observedRaw: string | null; persistence: PersistenceSnapshot } {
  if (inspection.readError) {
    return {
      state: createInitialGameState(),
      revision: 0,
      observedRaw: null,
      persistence: { kind: 'not-saved', message: 'Progress is not being saved.', protectedPrimaryRaw: null, backupAvailable: false },
    };
  }
  if (inspection.primary.save) {
    let state = stateFromSave(inspection.primary.save);
    let revision = inspection.primary.save.revision;
    if (state.lastLaunch?.status === 'started') {
      state = gameReducer(state, { type: 'markInterrupted' });
    }
    return {
      state,
      revision,
      observedRaw: inspection.primary.raw,
      persistence: { kind: 'saved', message: null, protectedPrimaryRaw: null, backupAvailable: false },
    };
  }
  if (inspection.primary.raw !== null) {
    return {
      state: createInitialGameState(),
      revision: 0,
      observedRaw: inspection.primary.raw,
      persistence: {
        kind: 'recovery',
        message: inspection.primary.error ?? 'The saved progress needs recovery.',
        protectedPrimaryRaw: inspection.primary.raw,
        backupAvailable: inspection.backup.save !== null,
      },
    };
  }
  return {
    state: createInitialGameState(),
    revision: 0,
    observedRaw: null,
    persistence: { kind: 'saved', message: null, protectedPrimaryRaw: null, backupAvailable: inspection.backup.save !== null },
  };
}

export function createGameStore(options: GameStoreOptions = {}): GameStore {
  let storage: SaveStorage;
  try {
    storage = options.storage ?? browserSaveStorage();
  } catch {
    storage = unavailableStorage();
  }
  const seedSource = options.seedSource ?? createGameplaySeed;
  const inspection = inspectStorage(storage);
  const loaded = loadedState(inspection);
  let state = loaded.state;
  let revision = loaded.revision;
  let observedRaw = loaded.observedRaw;
  let persistence = loaded.persistence;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  const setPersistence = (next: PersistenceSnapshot) => {
    persistence = next;
    notify();
  };

  const persist = (nextState: GameState): boolean => {
    const nextRevision = revision + 1;
    let save: SaveV1;
    try {
      save = saveForState(nextState, nextRevision);
    } catch (error) {
      state = nextState;
      setPersistence({ kind: 'not-saved', message: error instanceof Error ? error.message : 'Progress is not being saved.', protectedPrimaryRaw: persistence.protectedPrimaryRaw, backupAvailable: persistence.backupAvailable });
      return false;
    }
    const result = writeSave(storage, save);
    state = nextState;
    revision = nextRevision;
    if (result.ok) {
      observedRaw = result.raw;
      setPersistence({ kind: 'saved', message: result.backupError ? 'Progress saved; backup could not be refreshed.' : null, protectedPrimaryRaw: null, backupAvailable: false });
      return true;
    }
    setPersistence({ kind: 'not-saved', message: 'Progress is not being saved. Export a copy from Settings.', protectedPrimaryRaw: persistence.protectedPrimaryRaw, backupAvailable: persistence.backupAvailable });
    return false;
  };

  // A started recipe is reconciled to interrupted before the first subscriber
  // can use the store. This write follows the same complete-envelope path as
  // every mutation and advances the saved revision exactly once.
  if (inspection.primary.save?.lastLaunch?.status === 'started') persist(state);

  const checkConflict = (): boolean => {
    try {
      const currentRaw = storage.getItem('escape-velocity.save');
      if (currentRaw !== observedRaw) {
        setPersistence({ kind: 'conflict', message: 'Progress changed in another tab. Reload before continuing.', protectedPrimaryRaw: persistence.protectedPrimaryRaw, backupAvailable: persistence.backupAvailable });
        return false;
      }
    } catch {
      setPersistence({ kind: 'not-saved', message: 'Progress is not being saved.', protectedPrimaryRaw: persistence.protectedPrimaryRaw, backupAvailable: persistence.backupAvailable });
    }
    return true;
  };

  const dispatch = (command: GameCommand): boolean => {
    if (isDurable(command) && !checkConflict()) return false;
    let action: GameAction;
    if (command.type === 'reserveNewLaunch') {
      // Seed acquisition is a command-boundary side effect, never a reducer
      // or React render side effect, and it runs once per admitted command.
      action = { type: 'reserveNewLaunch', seed: seedSource() };
    } else {
      action = command;
    }
    const nextState = gameReducer(state, action);
    if (nextState === state) return false;
    if (isDurable(command)) {
      persist(nextState);
    } else {
      state = nextState;
      notify();
    }
    return true;
  };

  const recoverBackup = (): boolean => {
    if (state.activeLaunch || !checkConflict()) return false;
    const current = inspectStorage(storage);
    if (!current.backup.save) {
      setPersistence({ ...persistence, message: 'No valid backup is available.', backupAvailable: false });
      return false;
    }
    let nextState = stateFromSave(current.backup.save);
    if (nextState.lastLaunch?.status === 'started') nextState = gameReducer(nextState, { type: 'markInterrupted' });
    return persist(nextState);
  };

  const importSave = (raw: string, confirmed: boolean): boolean => {
    if (!confirmed || state.activeLaunch || !checkConflict()) return false;
    let save: SaveV1;
    try {
      save = parseSave(raw);
    } catch (error) {
      setPersistence({ kind: 'recovery', message: error instanceof Error ? error.message : 'Import is invalid.', protectedPrimaryRaw: raw, backupAvailable: persistence.backupAvailable });
      return false;
    }
    let nextState = stateFromSave(save);
    if (nextState.lastLaunch?.status === 'started') nextState = gameReducer(nextState, { type: 'markInterrupted' });
    return persist(nextState);
  };

  const exportSave = (): string => {
    if (persistence.kind === 'recovery' && persistence.protectedPrimaryRaw) return persistence.protectedPrimaryRaw;
    return JSON.stringify(saveForState(state, revision));
  };

  const reset = (confirmed: boolean): boolean => {
    if (!confirmed || state.activeLaunch || !checkConflict()) return false;
    return persist(createInitialGameState());
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === 'escape-velocity.save' && event.newValue !== observedRaw) {
      setPersistence({ kind: 'conflict', message: 'Progress changed in another tab. Reload before continuing.', protectedPrimaryRaw: persistence.protectedPrimaryRaw, backupAvailable: persistence.backupAvailable });
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  return {
    getState: () => state,
    getPersistence: () => persistence,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,
    recoverBackup,
    importSave,
    exportSave,
    reset,
    dispose() {
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      listeners.clear();
    },
  };
}
