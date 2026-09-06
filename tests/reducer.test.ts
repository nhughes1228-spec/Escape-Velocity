import { describe, expect, it } from 'vitest';
import { openingBalance } from '../src/config/opening';
import { costFor } from '../src/game/economy';
import { createInitialGameState, gameReducer } from '../src/game/reducer';

function settle(state: ReturnType<typeof createInitialGameState>, seed: number) {
  const launched = gameReducer(state, { type: 'reserveNewLaunch', seed });
  const active = launched.activeLaunch!;
  return gameReducer(launched, { type: 'settleNewLaunch', runId: active.runId, playbackId: active.playbackId });
}

describe('phase 2 launch controller', () => {
  it('reserves one seeded flight and settles its reward exactly once', () => {
    const initial = createInitialGameState();
    const launched = gameReducer(initial, { type: 'reserveNewLaunch', seed: 0 });
    expect(launched.status).toBe('ignition');
    expect(launched.activeLaunch?.runId).toBe(1);
    expect(launched.lastLaunch?.status).toBe('started');
    expect(gameReducer(launched, { type: 'reserveNewLaunch', seed: 1 })).toBe(launched);

    const active = launched.activeLaunch!;
    const playing = gameReducer(launched, { type: 'presentationPhase', runId: active.runId, playbackId: active.playbackId, phase: 'playing' });
    const stale = gameReducer(playing, { type: 'settleNewLaunch', runId: 999, playbackId: active.playbackId });
    expect(stale).toBe(playing);
    const settled = gameReducer(playing, { type: 'settleNewLaunch', runId: active.runId, playbackId: active.playbackId });
    expect(settled.status).toBe('result');
    expect(settled.activeLaunch).toBeNull();
    expect(settled.lastResult?.outcome).toBe('apogee');
    expect(settled.credits).toBe(19);
    expect(settled.launchesStarted).toBe(1);
    expect(settled.launchesCompleted).toBe(1);
    expect(settled.recordM).toBe(settled.lastResult!.maximumAltitudeM);
    expect(settled.lastLaunch?.summary?.recordBeforeM).toBe(0);
    expect(settled.lastLaunch?.summary?.isNewRecord).toBe(true);
    expect(gameReducer(settled, { type: 'settleNewLaunch', runId: active.runId, playbackId: active.playbackId })).toBe(settled);
  });

  it('preserves equal-flight records and pays equal new launches', () => {
    const first = settle(createInitialGameState(), 42);
    const second = settle(first, 42);
    expect(second.credits).toBe(first.credits * 2);
    expect(second.launchesStarted).toBe(2);
    expect(second.launchesCompleted).toBe(2);
    expect(second.recordM).toBe(first.recordM);
    expect(second.lastLaunch?.summary?.isNewRecord).toBe(false);
    expect(second.lastLaunch?.summary?.recordBeforeM).toBe(first.recordM);
  });

  it('keeps replay unpaid and tied to the historical recipe after a purchase', () => {
    const settled = settle(createInitialGameState(), 42);
    const funded = { ...settled, credits: 1000 };
    const upgraded = gameReducer(funded, { type: 'buyUpgrade', kind: 'engine' });
    expect(upgraded.levels.engine).toBe(1);
    expect(upgraded.credits).toBe(1000 - costFor('engine', 0, openingBalance));

    const replaying = gameReducer(upgraded, { type: 'startReplay' });
    expect(replaying.status).toBe('replay');
    expect(replaying.activeLaunch?.mode).toBe('replay');
    expect(replaying.activeLaunch?.levels.engine).toBe(0);
    expect(replaying.activeLaunch?.vehicle).toEqual(settled.lastLaunch?.recipe.effectiveVehicle);
    const replayPlaybackId = replaying.activeLaunch!.playbackId;
    expect(gameReducer(replaying, { type: 'completeReplay', runId: 1, playbackId: replayPlaybackId - 1 })).toBe(replaying);
    const replayed = gameReducer(replaying, { type: 'completeReplay', runId: 1, playbackId: replayPlaybackId });
    expect(replayed.status).toBe('result');
    expect(replayed.credits).toBe(upgraded.credits);
    expect(replayed.recordM).toBe(upgraded.recordM);
    expect(replayed.launchesStarted).toBe(upgraded.launchesStarted);
    expect(replayed.launchesCompleted).toBe(upgraded.launchesCompleted);
    expect(replayed.lastLaunch?.status).toBe('settled');
    expect(replayed.lastResult?.maximumAltitudeM).toBe(settled.lastResult?.maximumAltitudeM);
  });

  it('marks an active paid launch interrupted without reward or record changes', () => {
    const launched = gameReducer(createInitialGameState(), { type: 'reserveNewLaunch', seed: 0 });
    const interrupted = gameReducer(launched, { type: 'markInterrupted' });
    expect(interrupted.status).toBe('ready');
    expect(interrupted.activeLaunch).toBeNull();
    expect(interrupted.lastLaunch?.status).toBe('interrupted');
    expect(interrupted.credits).toBe(0);
    expect(interrupted.recordM).toBe(0);
    expect(interrupted.launchesStarted).toBe(1);
    expect(interrupted.launchesCompleted).toBe(0);
  });

  it('rejects invalid seeds before a launch is reserved', () => {
    expect(() => gameReducer(createInitialGameState(), { type: 'reserveNewLaunch', seed: -1 })).toThrow(/unsigned 32-bit/);
  });

  it('rejects run-id overflow before preparing a launch', () => {
    const overflowing = { ...createInitialGameState(), launchesStarted: Number.MAX_SAFE_INTEGER - 1, nextRunId: Number.MAX_SAFE_INTEGER };
    expect(() => gameReducer(overflowing, { type: 'reserveNewLaunch', seed: 0 })).toThrow(/counters/);
  });

  it('rejects unaffordable and capped purchases without partial mutation', () => {
    const initial = createInitialGameState();
    expect(gameReducer(initial, { type: 'buyUpgrade', kind: 'engine' })).toBe(initial);
    const capped = { ...initial, credits: 1000, levels: { ...initial.levels, engine: openingBalance.upgrades.engine.cap } };
    expect(gameReducer(capped, { type: 'buyUpgrade', kind: 'engine' })).toBe(capped);
    const purchased = gameReducer({ ...initial, credits: 14 }, { type: 'buyUpgrade', kind: 'engine' });
    expect(purchased.credits).toBe(0);
    expect(purchased.levels.engine).toBe(1);
    expect(purchased.levels.fuel).toBe(0);
  });
});
