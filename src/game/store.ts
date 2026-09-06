import { createGameplaySeed } from './variance';
import {
  canReserveNewLaunch,
  canStartReplay,
  createGameStateSnapshot,
  createInitialGameState,
  gameReducer,
  validateNewLaunchAdmission,
  type GameAction,
  type GameState,
  type MotionSetting,
} from './reducer';
import { parseSave, SAVE_KEY, saveForState, stateFromSave, type SaveV1 } from '../persistence/save';
import {
  browserSaveStorage,
  inspectStorage,
  writeSave,
  type SaveInspection,
  type SaveStorage,
} from '../persistence/storage';
import type { UpgradeKind } from './economy';

export type GameCommand =
  | { type: 'reserveNewLaunch' }
  | { type: 'presentationPhase'; runId: number; playbackId: number; phase: 'playing' }
  | { type: 'settleNewLaunch'; runId: number; playbackId: number }
  | { type: 'startReplay' }
  | { type: 'completeReplay'; runId: number; playbackId: number }
  | { type: 'stopReplay' }
  | { type: 'markInterrupted' }
  | { type: 'buyUpgrade'; kind: UpgradeKind }
  | { type: 'setMotion'; motion: MotionSetting };

export interface PersistenceSnapshot {
  kind: 'saved' | 'not-saved' | 'recovery' | 'conflict' | 'error';
  message: string | null;
  error: string | null;
  protectedPrimaryRaw: string | null;
  protectedBackupRaw: string | null;
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
  /** Returns whether the transition was accepted in memory. Check
   * getPersistence() to know whether it was durably saved. */
  dispatch(command: GameCommand): boolean;
  recoverBackup(): boolean;
  importSave(raw: string, confirmed: boolean): boolean;
  exportSave(): string;
  reset(confirmed: boolean): boolean;
  dispose(): void;
}

type StorageGate = 'ready' | 'protected' | 'unknown';

interface LoadedState {
  state: GameState;
  revision: number;
  observedRaw: string | null;
  storageGate: StorageGate;
  persistence: PersistenceSnapshot;
  reconcileInterrupted: boolean;
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

function recoveryMessage(inspection: SaveInspection): string {
  if (inspection.primary.status === 'unknown') return 'Saved progress could not be read. It is protected until storage access returns.';
  if (inspection.primary.status === 'protected') return 'Saved progress needs recovery. Export it or recover a valid backup before replacing it.';
  if (inspection.backup.status === 'unknown') return 'A backup could not be read. Progress is protected until storage access returns.';
  if (inspection.backup.status === 'protected') return 'A backup needs recovery. Export it or reset explicitly before replacing it.';
  return 'A valid backup is available. Recover it or reset explicitly before continuing.';
}

function storageGateFor(inspection: SaveInspection): StorageGate {
  if (inspection.primary.status === 'valid') return 'ready';
  if (inspection.primary.status === 'empty' && inspection.backup.status === 'empty') return 'ready';
  return inspection.primary.status === 'unknown' || inspection.backup.status === 'unknown' ? 'unknown' : 'protected';
}

function persistenceForRecovery(inspection: SaveInspection): PersistenceSnapshot {
  const protectedPrimaryRaw = inspection.primary.status === 'protected' ? inspection.primary.raw : null;
  const protectedBackupRaw = inspection.primary.status === 'valid'
    ? inspection.backup.status === 'protected' ? inspection.backup.raw : null
    : inspection.backup.raw;
  return {
    kind: 'recovery',
    message: recoveryMessage(inspection),
    error: null,
    protectedPrimaryRaw,
    protectedBackupRaw,
    backupAvailable: inspection.backup.save !== null,
  };
}

function loadedState(inspection: SaveInspection): LoadedState {
  if (inspection.primary.status === 'valid' && inspection.primary.save) {
    let state = stateFromSave(inspection.primary.save);
    const reconcileInterrupted = inspection.primary.save.lastLaunch?.status === 'started';
    if (reconcileInterrupted) {
      state = gameReducer(state, { type: 'markInterrupted' });
    }
    return {
      state,
      revision: inspection.primary.save.revision,
      observedRaw: inspection.primary.raw,
      storageGate: 'ready',
      persistence: {
        kind: 'saved',
        message: null,
        error: null,
        protectedPrimaryRaw: null,
        protectedBackupRaw: null,
        backupAvailable: inspection.backup.save !== null,
      },
      reconcileInterrupted,
    };
  }

  if (inspection.primary.status === 'empty' && inspection.backup.status === 'empty') {
    return {
      state: createInitialGameState(),
      revision: 0,
      observedRaw: null,
      storageGate: 'ready',
      persistence: {
        kind: 'saved',
        message: null,
        error: null,
        protectedPrimaryRaw: null,
        protectedBackupRaw: null,
        backupAvailable: false,
      },
      reconcileInterrupted: false,
    };
  }

  return {
    state: createInitialGameState(),
    revision: 0,
    observedRaw: inspection.primary.status === 'unknown' ? null : inspection.primary.raw,
    storageGate: storageGateFor(inspection),
    persistence: persistenceForRecovery(inspection),
    reconcileInterrupted: false,
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
  let storageGate = loaded.storageGate;
  let persistence = loaded.persistence;
  let stateSnapshot = createGameStateSnapshot(state);
  let persistenceSnapshot: PersistenceSnapshot = Object.freeze({ ...persistence });
  let disposed = false;
  // Playback IDs are deliberately volatile and controller-scoped. They are
  // never restored from a save, so reset/import/recovery cannot make a late
  // callback look like the current playback.
  let nextPlaybackIdentity = Math.max(1, state.nextPlaybackId);
  const listeners = new Set<() => void>();

  const notify = () => {
    if (!disposed) listeners.forEach((listener) => listener());
  };

  const setPersistence = (next: PersistenceSnapshot) => {
    persistence = next;
    persistenceSnapshot = Object.freeze({ ...next });
    notify();
  };

  const publishState = (nextState: GameState) => {
    state = nextState;
    stateSnapshot = createGameStateSnapshot(nextState);
  };

  const reportError = (message: string) => {
    setPersistence({
      ...persistence,
      kind: persistence.kind === 'recovery' || persistence.kind === 'conflict' ? persistence.kind : 'error',
      message,
      error: message,
    });
  };

  const allocatePlaybackIdentity = (): number => {
    if (!Number.isSafeInteger(nextPlaybackIdentity) || nextPlaybackIdentity < 1 || nextPlaybackIdentity >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('Playback identity is not safe to increment.');
    }
    const identity = nextPlaybackIdentity;
    nextPlaybackIdentity += 1;
    return identity;
  };

  const inspectStorageSafely = (): SaveInspection => inspectStorage(storage);

  const persist = (nextState: GameState, replaceProtected = false, minimumRevision = revision): boolean => {
    if (!Number.isSafeInteger(minimumRevision) || minimumRevision < 0 || minimumRevision >= Number.MAX_SAFE_INTEGER) {
      reportError('Change rejected because the save revision cannot be advanced safely.');
      return false;
    }
    const nextRevision = minimumRevision + 1;
    let save: SaveV1;
    try {
      save = saveForState(nextState, nextRevision);
    } catch (error) {
      // Validation failures are rejected before the authoritative state or
      // revision is published. They are not storage failures.
      reportError(error instanceof Error ? error.message : 'Change rejected because the save state is invalid.');
      return false;
    }

    if (storageGate !== 'ready' && !replaceProtected) {
      // A temporary in-memory session is allowed, but it must never overwrite
      // protected or unreadable bytes without an explicit user decision.
      publishState(nextState);
      revision = nextRevision;
      setPersistence({
        ...persistence,
        kind: 'recovery',
        message: persistence.message ?? recoveryMessage(inspectStorageSafely()),
        error: null,
      });
      return true;
    }

    const result = writeSave(storage, save);
    publishState(nextState);
    revision = nextRevision;
    if (result.ok) {
      observedRaw = result.raw;
      storageGate = 'ready';
      setPersistence({
        kind: 'saved',
        message: result.backupError ? 'Progress saved; backup could not be refreshed.' : null,
        error: null,
        protectedPrimaryRaw: replaceProtected ? null : persistence.protectedPrimaryRaw,
        protectedBackupRaw: replaceProtected ? null : persistence.protectedBackupRaw,
        backupAvailable: false,
      });
      return true;
    }

    if (replaceProtected) {
      // An explicit replacement that cannot be written must leave the old
      // recovery bytes protected and visible for another attempt/export.
      setPersistence({
        ...persistence,
        kind: 'recovery',
        message: 'Replacement could not be saved. The previous progress remains protected.',
        error: result.error ?? 'Save could not be written.',
      });
    } else {
      setPersistence({
        ...persistence,
        kind: 'not-saved',
        message: 'Progress is not being saved. Export a copy from Settings.',
        error: result.error ?? 'Save could not be written.',
      });
    }
    return true;
  };

  type StorageCheck = 'ok' | 'blocked' | 'conflict';

  const refreshUnknownGate = (): StorageCheck => {
    if (storageGate !== 'unknown') return 'ok';
    const refreshed = inspectStorageSafely();
    if (refreshed.primary.status === 'unknown') {
      setPersistence({
        ...persistence,
        kind: 'recovery',
        message: recoveryMessage(refreshed),
        error: null,
        protectedPrimaryRaw: refreshed.primary.raw,
        protectedBackupRaw: refreshed.backup.raw,
        backupAvailable: refreshed.backup.save !== null,
      });
      return 'blocked';
    }
    if (refreshed.primary.raw !== observedRaw) {
      setPersistence({
        ...persistence,
        kind: 'conflict',
        message: 'Progress changed while storage access was unavailable. Reload before continuing.',
        error: null,
      });
      return 'conflict';
    }
    storageGate = storageGateFor(refreshed);
    if (storageGate !== 'ready') {
      setPersistence(persistenceForRecovery(refreshed));
      return 'blocked';
    }
    setPersistence({
      kind: 'saved',
      message: null,
      error: null,
      protectedPrimaryRaw: null,
      protectedBackupRaw: null,
      backupAvailable: false,
    });
    return 'ok';
  };

  const checkConflict = (): StorageCheck => {
    if (disposed || persistence.kind === 'conflict') return 'conflict';
    let currentRaw: string | null;
    try {
      currentRaw = storage.getItem(SAVE_KEY);
    } catch (error) {
      storageGate = 'unknown';
      setPersistence({
        ...persistence,
        kind: 'recovery',
        message: 'Progress could not be checked safely. No write was attempted.',
        error: error instanceof Error ? error.message : 'Storage read failed.',
      });
      return 'blocked';
    }
    if (currentRaw !== observedRaw) {
      setPersistence({
        ...persistence,
        kind: 'conflict',
        message: 'Progress changed in another tab. Reload before continuing.',
        error: null,
      });
      return 'conflict';
    }
    return refreshUnknownGate();
  };

  // A started recipe is reconciled to interrupted before the first subscriber
  // can use the store. This write is safe because the primary was validated.
  if (loaded.reconcileInterrupted) {
    persist(state);
  }

  const dispatch = (command: GameCommand): boolean => {
    if (disposed) return false;
    // Admission is checked before seed acquisition. A rejected busy command
    // must not consume entropy or create a playback identity.
    if (command.type === 'reserveNewLaunch' && !canReserveNewLaunch(state)) return false;
    if (command.type === 'startReplay' && !canStartReplay(state)) return false;
    if (isDurable(command) && checkConflict() === 'conflict') return false;

    let action: GameAction;
    try {
      if (command.type === 'reserveNewLaunch') {
        validateNewLaunchAdmission(state);
        if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
          throw new RangeError('Change rejected because the save revision cannot be advanced safely.');
        }
        if (!Number.isSafeInteger(nextPlaybackIdentity) || nextPlaybackIdentity < 1 || nextPlaybackIdentity >= Number.MAX_SAFE_INTEGER) {
          throw new RangeError('Playback identity is not safe to increment.');
        }
        const seed = seedSource();
        action = { type: 'reserveNewLaunch', seed, playbackId: allocatePlaybackIdentity() };
      } else if (command.type === 'startReplay') {
        action = { type: 'startReplay', playbackId: allocatePlaybackIdentity() };
      } else {
        action = command;
      }
      const nextState = gameReducer(state, action);
      if (nextState === state) return false;
      if (isDurable(command)) return persist(nextState);
      publishState(nextState);
      notify();
      return true;
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'Command was rejected.');
      return false;
    }
  };

  const recoverBackup = (): boolean => {
    if (disposed || state.activeLaunch || checkConflict() !== 'ok') return false;
    const current = inspectStorageSafely();
    if (current.primary.status === 'unknown') {
      setPersistence({ ...persistenceForRecovery(current), error: current.readError });
      storageGate = 'unknown';
      return false;
    }
    if (current.backup.status === 'unknown') {
      setPersistence({
        ...persistence,
        message: 'The backup could not be read. The valid primary remains unchanged.',
        error: current.backup.error,
      });
      return false;
    }
    if (!current.backup.save) {
      setPersistence({ ...persistence, message: 'No valid backup is available.', error: null, backupAvailable: false });
      return false;
    }
    let nextState = stateFromSave(current.backup.save);
    if (nextState.lastLaunch?.status === 'started') nextState = gameReducer(nextState, { type: 'markInterrupted' });
    return persist(nextState, true, Math.max(revision, current.backup.save.revision));
  };

  const importSave = (raw: string, confirmed: boolean): boolean => {
    if (disposed || !confirmed || state.activeLaunch || checkConflict() !== 'ok') return false;
    let save: SaveV1;
    try {
      save = parseSave(raw);
    } catch (error) {
      // An invalid import is form input, not primary recovery data. In
      // particular it must not hijack export or erase an existing recovery
      // candidate.
      setPersistence({
        ...persistence,
        error: error instanceof Error ? error.message : 'Import is invalid.',
      });
      return false;
    }
    let nextState = stateFromSave(save);
    if (nextState.lastLaunch?.status === 'started') nextState = gameReducer(nextState, { type: 'markInterrupted' });
    return persist(nextState, true, Math.max(revision, save.revision));
  };

  const exportSave = (): string => {
    if (persistence.protectedPrimaryRaw) return persistence.protectedPrimaryRaw;
    if (persistence.kind === 'recovery' && persistence.protectedBackupRaw) return persistence.protectedBackupRaw;
    return JSON.stringify(saveForState(state, revision));
  };

  const reset = (confirmed: boolean): boolean => {
    if (disposed || !confirmed || state.activeLaunch || checkConflict() !== 'ok') return false;
    return persist(createInitialGameState(), true);
  };

  const onStorage = (event: StorageEvent) => {
    if (!disposed && event.key === SAVE_KEY && event.newValue !== observedRaw) {
      setPersistence({
        ...persistence,
        kind: 'conflict',
        message: 'Progress changed in another tab. Reload before continuing.',
        error: null,
      });
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  return {
    getState: () => stateSnapshot,
    getPersistence: () => persistenceSnapshot,
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
      disposed = true;
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      listeners.clear();
    },
  };
}
