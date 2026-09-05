import { useEffect, useRef, useState } from 'react';
import type { ActiveLaunch } from '../game/reducer';
import { sampleTrace } from './trace';

declare global {
  interface Window {
    __EV_TEST_CLOCK__?: {
      nowMs: number;
    };
  }
}

function currentTimeMs(timestamp: number): number {
  if (typeof window !== 'undefined' && window.__EV_TEST_CLOCK__) return window.__EV_TEST_CLOCK__.nowMs;
  return timestamp;
}

export interface PlaybackFrame {
  elapsedS: number;
  simulationTimeS: number;
  sample: ReturnType<typeof sampleTrace>;
  paused: boolean;
  isFreshRun: boolean;
}

export function usePlayback(activeLaunch: ActiveLaunch | null, onComplete: (runId: number) => void): PlaybackFrame {
  const [elapsedS, setElapsedS] = useState(0);
  const [paused, setPaused] = useState(false);
  const [clockRunId, setClockRunId] = useState<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!activeLaunch) {
      setElapsedS(0);
      setPaused(false);
      setClockRunId(null);
      return;
    }

    const { runId, result, vehicle } = activeLaunch;
    setClockRunId(runId);
    const totalDurationS = vehicle.ignitionDelayS + result.terminalTimeS;
    let elapsed = 0;
    let previousTimeMs: number | null = null;
    let frameId = 0;
    let completed = false;

    const tick = (timestamp: number) => {
      if (document.visibilityState === 'hidden') {
        previousTimeMs = null;
        setPaused(true);
        return;
      }
      const nowMs = currentTimeMs(timestamp);
      setPaused(false);
      if (previousTimeMs === null) {
        previousTimeMs = nowMs;
      } else {
        // Presentation may jump to the current trace position after a slow
        // frame; hidden tabs reset previousTimeMs so wall-clock gaps never
        // become an unintended catch-up.
        const deltaS = Math.max(0, (nowMs - previousTimeMs) / 1000);
        previousTimeMs = nowMs;
        elapsed += deltaS;
        setElapsedS(elapsed);
        if (!completed && elapsed >= totalDurationS) {
          completed = true;
          onCompleteRef.current(runId);
          return;
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        window.cancelAnimationFrame(frameId);
        previousTimeMs = null;
        setPaused(true);
      } else {
        previousTimeMs = null;
        setPaused(false);
        frameId = window.requestAnimationFrame(tick);
      }
    };
    const onTestTick = () => tick(currentTimeMs(0));

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('escape-velocity:test-tick', onTestTick);
    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('escape-velocity:test-tick', onTestTick);
    };
  }, [activeLaunch?.runId, activeLaunch?.result, activeLaunch?.vehicle]);

  const ignitionDelayS = activeLaunch?.vehicle.ignitionDelayS ?? 0;
  const result = activeLaunch?.result;
  const activeRunId = activeLaunch?.runId ?? null;
  // Keep this comparison render-pure. In StrictMode a render can be invoked
  // twice before effects commit, so mutating a ref here would leak stale time
  // from the previous run into a replay.
  const isFreshRun = clockRunId !== activeRunId;
  const effectiveElapsedS = isFreshRun ? 0 : elapsedS;
  const simulationTimeS = result ? Math.max(0, Math.min(result.terminalTimeS, effectiveElapsedS - ignitionDelayS)) : 0;
  return {
    elapsedS: effectiveElapsedS,
    simulationTimeS,
    sample: result ? sampleTrace(result.trace, simulationTimeS) : null,
    paused,
    isFreshRun,
  };
}
