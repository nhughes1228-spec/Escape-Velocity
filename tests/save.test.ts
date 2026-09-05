import { describe, expect, it } from 'vitest';
import { parseSave, SAVE_BACKUP_KEY, SAVE_KEY, stateFromSave } from '../src/persistence/save';
import { createGameStore, type GameStore } from '../src/game/store';

class MemoryStorage {
  readonly values = new Map<string, string>();
  readonly writes: Array<{ key: string; value: string }> = [];

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
    this.writes.push({ key, value });
  }
}

class FailingStorage {
  getItem(): string | null {
    return null;
  }

  setItem(): void {
    throw new Error('Quota exceeded.');
  }
}

class SelectiveReadStorage {
  constructor(
    readonly base: MemoryStorage,
    readonly deniedKeys: Set<string>,
  ) {}

  getItem(key: string): string | null {
    if (this.deniedKeys.has(key)) throw new Error(`Read denied for ${key}.`);
    return this.base.getItem(key);
  }

  setItem(key: string, value: string): void {
    this.base.setItem(key, value);
  }
}

function settleNewLaunch(store: GameStore): void {
  expect(store.dispatch({ type: 'reserveNewLaunch' })).toBe(true);
  const active = store.getState().activeLaunch;
  expect(active?.runId).toBe(1);
  expect(store.dispatch({ type: 'settleNewLaunch', runId: active!.runId, playbackId: active!.playbackId })).toBe(true);
}

describe('phase 2 save contract', () => {
  it('round-trips progression, settings and the historical settled recipe', () => {
    const storage = new MemoryStorage();
    const store = createGameStore({ storage, seedSource: () => 0 });
    settleNewLaunch(store);
    expect(store.dispatch({ type: 'setMotion', motion: 'reduced' })).toBe(true);
    expect(store.dispatch({ type: 'buyUpgrade', kind: 'engine' })).toBe(true);

    const save = parseSave(store.exportSave());
    const restored = stateFromSave(save);
    expect(restored.status).toBe('result');
    expect(restored.credits).toBe(5);
    expect(restored.levels.engine).toBe(1);
    expect(restored.settings.motion).toBe('reduced');
    expect(restored.lastLaunch?.status).toBe('settled');
    expect(restored.lastLaunch?.recipe.seed).toBe(0);
    expect(restored.lastResult).toEqual(store.getState().lastResult);
    expect(save.progress.nextRunId).toBe(2);
    store.dispose();
  });

  it('persists a reservation before playback and settles exactly once', () => {
    const storage = new MemoryStorage();
    const store = createGameStore({ storage, seedSource: () => 42 });
    expect(store.dispatch({ type: 'reserveNewLaunch' })).toBe(true);
    const startedRaw = storage.getItem(SAVE_KEY);
    expect(startedRaw).not.toBeNull();
    expect(parseSave(startedRaw!).lastLaunch?.status).toBe('started');

    const active = store.getState().activeLaunch!;
    expect(store.dispatch({ type: 'settleNewLaunch', runId: active.runId, playbackId: active.playbackId })).toBe(true);
    const writesAfterSettlement = storage.writes.length;
    expect(store.dispatch({ type: 'settleNewLaunch', runId: active.runId, playbackId: active.playbackId })).toBe(false);
    expect(storage.writes.length).toBe(writesAfterSettlement);
    expect(parseSave(storage.getItem(SAVE_KEY)!).progress.launchesCompleted).toBe(1);
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBe(startedRaw);
    store.dispose();
  });

  it('reconciles an in-flight reservation as interrupted on reload', () => {
    const storage = new MemoryStorage();
    const first = createGameStore({ storage, seedSource: () => 1 });
    expect(first.dispatch({ type: 'reserveNewLaunch' })).toBe(true);
    first.dispose();

    const reloaded = createGameStore({ storage, seedSource: () => 2 });
    expect(reloaded.getState().status).toBe('ready');
    expect(reloaded.getState().activeLaunch).toBeNull();
    expect(reloaded.getState().credits).toBe(0);
    expect(reloaded.getState().launchesCompleted).toBe(0);
    expect(reloaded.getState().lastLaunch?.status).toBe('interrupted');
    expect(parseSave(storage.getItem(SAVE_KEY)!).lastLaunch?.status).toBe('interrupted');
    reloaded.dispose();
  });

  it('protects a valid backup while recovering a corrupted primary', () => {
    const storage = new MemoryStorage();
    const source = createGameStore({ storage, seedSource: () => 42 });
    expect(source.dispatch({ type: 'reserveNewLaunch' })).toBe(true);
    const startedRaw = storage.getItem(SAVE_KEY);
    const active = source.getState().activeLaunch!;
    expect(source.dispatch({ type: 'settleNewLaunch', runId: active.runId, playbackId: active.playbackId })).toBe(true);
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBe(startedRaw);
    source.dispose();

    const corruptRaw = '{"schemaVersion":999,"progress":"not a save"}';
    storage.values.set(SAVE_KEY, corruptRaw);
    const recovering = createGameStore({ storage, seedSource: () => 9 });
    expect(recovering.getPersistence().kind).toBe('recovery');
    expect(recovering.getPersistence().backupAvailable).toBe(true);
    expect(recovering.exportSave()).toBe(corruptRaw);
    expect(recovering.recoverBackup()).toBe(true);
    expect(recovering.getState().lastLaunch?.status).toBe('interrupted');
    expect(recovering.getState().credits).toBe(0);
    expect(parseSave(storage.getItem(SAVE_KEY)!).lastLaunch?.status).toBe('interrupted');
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBe(startedRaw);
    recovering.dispose();
  });

  it('does not overwrite protected primary bytes during an automatic mutation', () => {
    const storage = new MemoryStorage();
    const protectedRaw = '{"gameId":"escape-velocity","schemaVersion":999,"credits":"keep me"}';
    storage.values.set(SAVE_KEY, protectedRaw);
    const store = createGameStore({ storage, seedSource: () => 0 });

    expect(store.getPersistence().kind).toBe('recovery');
    expect(store.dispatch({ type: 'setMotion', motion: 'reduced' })).toBe(true);
    expect(storage.getItem(SAVE_KEY)).toBe(protectedRaw);
    expect(store.exportSave()).toBe(protectedRaw);
    expect(store.getPersistence().kind).toBe('recovery');
    store.dispose();
  });

  it('keeps a valid primary usable when the backup read is denied', () => {
    const base = new MemoryStorage();
    const source = createGameStore({ storage: base, seedSource: () => 0 });
    settleNewLaunch(source);
    source.dispose();
    const guarded = new SelectiveReadStorage(base, new Set([SAVE_BACKUP_KEY]));
    const store = createGameStore({ storage: guarded, seedSource: () => 1 });

    expect(store.getState().credits).toBe(19);
    expect(store.recoverBackup()).toBe(false);
    expect(store.dispatch({ type: 'setMotion', motion: 'reduced' })).toBe(true);
    expect(parseSave(base.getItem(SAVE_KEY)!).settings.motion).toBe('reduced');
    expect(store.getPersistence().kind).toBe('saved');
    store.dispose();
  });

  it('does not write after a primary read failure', () => {
    const base = new MemoryStorage();
    const source = createGameStore({ storage: base, seedSource: () => 0 });
    settleNewLaunch(source);
    source.dispose();
    const originalRaw = base.getItem(SAVE_KEY);
    const guarded = new SelectiveReadStorage(base, new Set([SAVE_KEY]));
    const store = createGameStore({ storage: guarded, seedSource: () => 1 });

    expect(store.dispatch({ type: 'setMotion', motion: 'reduced' })).toBe(false);
    expect(base.getItem(SAVE_KEY)).toBe(originalRaw);
    expect(store.getPersistence().message).toMatch(/safely|read/);
    guarded.deniedKeys.delete(SAVE_KEY);
    expect(store.dispatch({ type: 'setMotion', motion: 'full' })).toBe(false);
    expect(base.getItem(SAVE_KEY)).toBe(originalRaw);
    expect(store.getPersistence().kind).toBe('conflict');
    store.dispose();
  });

  it('keeps a valid backup as an explicit recovery option when primary is missing', () => {
    const storage = new MemoryStorage();
    const source = createGameStore({ storage, seedSource: () => 0 });
    settleNewLaunch(source);
    source.dispose();
    storage.values.delete(SAVE_KEY);
    const store = createGameStore({ storage, seedSource: () => 1 });

    expect(store.getPersistence().kind).toBe('recovery');
    expect(store.getPersistence().backupAvailable).toBe(true);
    expect(store.dispatch({ type: 'setMotion', motion: 'reduced' })).toBe(true);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(store.recoverBackup()).toBe(true);
    expect(store.getState().lastLaunch?.status).toBe('interrupted');
    expect(store.getState().settings.motion).toBe('system');
    store.dispose();
  });

  it('rejects corrupt, future and oversized save input before mounting it', () => {
    const storage = new MemoryStorage();
    const store = createGameStore({ storage, seedSource: () => 0 });
    settleNewLaunch(store);
    const valid = JSON.parse(store.exportSave()) as Record<string, unknown>;
    expect(() => parseSave('{not-json')).toThrow(/valid JSON/);
    expect(() => parseSave(JSON.stringify({ ...valid, schemaVersion: 2 }))).toThrow(/schemaVersion/);
    expect(() => parseSave('x'.repeat(1_000_001))).toThrow(/1 MB/);

    const invalidCredits = JSON.parse(store.exportSave()) as { progress: { credits: number } };
    invalidCredits.progress.credits = -1;
    expect(() => parseSave(JSON.stringify(invalidCredits))).toThrow(/non-negative|credits/);
    const invalidLevel = JSON.parse(store.exportSave()) as { progress: { levels: { engine: number } } };
    invalidLevel.progress.levels.engine = 9;
    expect(() => parseSave(JSON.stringify(invalidLevel))).toThrow(/outside/);
    const invalidSeed = JSON.parse(store.exportSave()) as { lastLaunch: { recipe: { seed: number } } };
    invalidSeed.lastLaunch.recipe.seed = -1;
    expect(() => parseSave(JSON.stringify(invalidSeed))).toThrow(/unsigned 32-bit/);
    const invalidSimulation = JSON.parse(store.exportSave()) as { lastLaunch: { recipe: { simulation: { dtS: number } } } };
    invalidSimulation.lastLaunch.recipe.simulation.dtS = 0;
    expect(() => parseSave(JSON.stringify(invalidSimulation))).toThrow(/simulation option/);
    const invalidReward = JSON.parse(store.exportSave()) as { lastLaunch: { summary: { rewardCredits: number } } };
    invalidReward.lastLaunch.summary.rewardCredits = 0;
    expect(() => parseSave(JSON.stringify(invalidReward))).toThrow(/rewardCredits/);
    store.dispose();
  });

  it('keeps the session playable and exports current state when storage fails', () => {
    const store = createGameStore({ storage: new FailingStorage(), seedSource: () => 0 });
    expect(store.dispatch({ type: 'reserveNewLaunch' })).toBe(true);
    expect(store.getPersistence().kind).toBe('not-saved');
    expect(store.getPersistence().message).toMatch(/not being saved/);
    expect(parseSave(store.exportSave()).lastLaunch?.status).toBe('started');
    const active = store.getState().activeLaunch!;
    expect(store.dispatch({ type: 'settleNewLaunch', runId: active.runId, playbackId: active.playbackId })).toBe(true);
    expect(store.getState().credits).toBe(19);
    expect(parseSave(store.exportSave()).progress.credits).toBe(19);
    store.dispose();
  });

  it('rejects stale callbacks after reset and after controller disposal', () => {
    const storage = new MemoryStorage();
    const store = createGameStore({ storage, seedSource: () => 0 });
    expect(store.dispatch({ type: 'reserveNewLaunch' })).toBe(true);
    const old = store.getState().activeLaunch!;
    expect(store.dispatch({ type: 'markInterrupted' })).toBe(true);
    expect(store.reset(true)).toBe(true);
    expect(store.dispatch({ type: 'reserveNewLaunch' })).toBe(true);
    const current = store.getState().activeLaunch!;
    expect(current.playbackId).not.toBe(old.playbackId);
    expect(store.dispatch({ type: 'settleNewLaunch', runId: old.runId, playbackId: old.playbackId })).toBe(false);
    expect(store.getState().credits).toBe(0);
    store.dispose();
    expect(store.dispatch({ type: 'settleNewLaunch', runId: current.runId, playbackId: current.playbackId })).toBe(false);
  });

  it('keeps playback identities monotonic through backup recovery', () => {
    const storage = new MemoryStorage();
    const source = createGameStore({ storage, seedSource: () => 0 });
    settleNewLaunch(source);
    source.dispose();

    const store = createGameStore({ storage, seedSource: () => 1 });
    expect(store.dispatch({ type: 'reserveNewLaunch' })).toBe(true);
    const old = store.getState().activeLaunch!;
    expect(store.dispatch({ type: 'markInterrupted' })).toBe(true);
    expect(store.recoverBackup()).toBe(true);
    expect(store.dispatch({ type: 'reserveNewLaunch' })).toBe(true);
    const current = store.getState().activeLaunch!;
    expect(current.playbackId).toBeGreaterThan(old.playbackId);
    expect(store.dispatch({ type: 'settleNewLaunch', runId: old.runId, playbackId: old.playbackId })).toBe(false);
    expect(store.getState().credits).toBe(19);
    store.dispose();
  });

  it('rejects a stale replay completion after an explicit import', () => {
    const storage = new MemoryStorage();
    const store = createGameStore({ storage, seedSource: () => 0 });
    settleNewLaunch(store);
    const exported = store.exportSave();
    expect(store.dispatch({ type: 'startReplay' })).toBe(true);
    const oldReplay = store.getState().activeLaunch!;
    expect(store.dispatch({ type: 'stopReplay' })).toBe(true);
    expect(store.reset(true)).toBe(true);
    expect(store.importSave(exported, true)).toBe(true);
    expect(store.dispatch({ type: 'startReplay' })).toBe(true);
    const currentReplay = store.getState().activeLaunch!;

    expect(store.dispatch({ type: 'completeReplay', runId: oldReplay.runId, playbackId: oldReplay.playbackId })).toBe(false);
    expect(store.getState().status).toBe('replay');
    expect(store.dispatch({ type: 'completeReplay', runId: currentReplay.runId, playbackId: currentReplay.playbackId })).toBe(true);
    expect(store.getState().credits).toBe(19);
    store.dispose();
  });

  it('protects authoritative nested snapshots from caller mutation', () => {
    const store = createGameStore({ storage: new MemoryStorage(), seedSource: () => 0 });
    expect(store.dispatch({ type: 'reserveNewLaunch' })).toBe(true);
    const snapshot = store.getState();
    snapshot.activeLaunch!.result.maximumAltitudeM = 100000;
    snapshot.activeLaunch!.result.vehicle.thrustN = 1;
    snapshot.lastLaunch!.recipe.effectiveVehicle.thrustN = 1;
    const active = store.getState().activeLaunch!;
    expect(store.dispatch({ type: 'settleNewLaunch', runId: active.runId, playbackId: active.playbackId })).toBe(true);
    expect(store.getState().credits).toBe(19);
    expect(store.getState().recordM).toBeLessThan(100000);
    store.dispose();
  });

  it('rejects revision overflow without publishing a state change', () => {
    const storage = new MemoryStorage();
    const source = createGameStore({ storage });
    const raw = JSON.parse(source.exportSave()) as { revision: number };
    source.dispose();
    raw.revision = Number.MAX_SAFE_INTEGER;
    storage.values.set(SAVE_KEY, JSON.stringify(raw));
    const store = createGameStore({ storage });

    expect(store.dispatch({ type: 'setMotion', motion: 'reduced' })).toBe(false);
    expect(store.getState().settings.motion).toBe('system');
    expect(parseSave(storage.getItem(SAVE_KEY)!).revision).toBe(Number.MAX_SAFE_INTEGER);
    expect(store.getPersistence().kind).toBe('error');
    store.dispose();
  });

  it('blocks a stale tab before it can reserve or overwrite a launch', () => {
    const storage = new MemoryStorage();
    const first = createGameStore({ storage, seedSource: () => 0 });
    let staleSeedCalls = 0;
    const stale = createGameStore({ storage, seedSource: () => { staleSeedCalls += 1; return 1; } });
    expect(first.dispatch({ type: 'reserveNewLaunch' })).toBe(true);
    expect(stale.dispatch({ type: 'reserveNewLaunch' })).toBe(false);
    expect(staleSeedCalls).toBe(0);
    expect(stale.getPersistence().kind).toBe('conflict');
    expect(stale.getState().launchesStarted).toBe(0);
    expect(parseSave(storage.getItem(SAVE_KEY)!).lastLaunch?.recipe.seed).toBe(0);
    first.dispose();
    stale.dispose();
  });

  it('requires explicit import confirmation and replaces, rather than adds to, progress', () => {
    const sourceStorage = new MemoryStorage();
    const source = createGameStore({ storage: sourceStorage, seedSource: () => 42 });
    settleNewLaunch(source);
    const exported = source.exportSave();
    const targetStorage = new MemoryStorage();
    const target = createGameStore({ storage: targetStorage, seedSource: () => 0 });
    expect(target.importSave(exported, false)).toBe(false);
    expect(target.importSave(exported, true)).toBe(true);
    expect(target.getState().credits).toBe(19);
    expect(target.getState().launchesCompleted).toBe(1);
    expect(target.reset(false)).toBe(false);
    expect(target.getState().credits).toBe(19);
    expect(target.reset(true)).toBe(true);
    expect(target.getState().credits).toBe(0);
    expect(parseSave(target.exportSave()).progress.nextRunId).toBe(1);
    expect(target.importSave(exported, true)).toBe(true);
    expect(target.getState().credits).toBe(19);
    expect(target.getState().launchesCompleted).toBe(1);
    source.dispose();
    target.dispose();
  });
});
