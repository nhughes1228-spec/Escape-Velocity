import { describe, expect, it } from 'vitest';
import { createInitialGameState, gameReducer } from '../src/game/reducer';

describe('phase 1 launch controller', () => {
  it('allows one active flight and settles only its matching run once', () => {
    const initial = createInitialGameState();
    const launched = gameReducer(initial, { type: 'launch' });
    expect(launched.status).toBe('ignition');
    expect(launched.activeLaunch?.runId).toBe(1);
    expect(gameReducer(launched, { type: 'launch' })).toBe(launched);

    const playing = gameReducer(launched, { type: 'presentationPhase', phase: 'playing' });
    expect(playing.status).toBe('playing');
    const stale = gameReducer(playing, { type: 'settle', runId: 999 });
    expect(stale).toBe(playing);
    const settled = gameReducer(playing, { type: 'settle', runId: 1 });
    expect(settled.status).toBe('result');
    expect(settled.activeLaunch).toBeNull();
    expect(settled.lastResult?.outcome).toBe('apogee');
    expect(settled.recordM).toBeCloseTo(160.170311, 4);
    expect(gameReducer(settled, { type: 'settle', runId: 1 })).toBe(settled);
  });

  it('replays the fixed starter deterministically and preserves the record', () => {
    const first = gameReducer(createInitialGameState(), { type: 'launch' });
    const firstResult = gameReducer(first, { type: 'settle', runId: 1 });
    const second = gameReducer(firstResult, { type: 'launch' });
    const secondResult = gameReducer(second, { type: 'settle', runId: 2 });
    expect(secondResult.recordM).toBe(firstResult.recordM);
    expect(secondResult.lastResult?.maximumAltitudeM).toBe(firstResult.lastResult?.maximumAltitudeM);
  });
});
