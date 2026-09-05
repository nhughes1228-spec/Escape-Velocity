import { useEffect, useMemo, useReducer, useState } from 'react';
import { openingBalance } from '../config/opening';
import { createInitialGameState, gameReducer } from '../game/reducer';
import { usePlayback } from '../presentation/clock';
import { sampleTrace } from '../presentation/trace';
import type { FlightOutcome, TraceSample } from '../simulation/types';
import { RocketCanvas } from './RocketCanvas';

function formatAltitude(valueM: number): string {
  return `${Math.round(valueM).toLocaleString()} m`;
}

function formatTime(valueS: number): string {
  return `${valueS.toFixed(2)} s`;
}

function outcomeLabel(outcome: FlightOutcome): string {
  switch (outcome) {
    case 'apogee': return 'Apogee reached';
    case 'noLiftoff': return 'No liftoff';
    case 'impact': return 'Flight ended at the pad';
    case 'invalid': return 'Diagnostic failure';
    case 'limit': return 'Safety time limit';
  }
}

function phaseLabel(status: 'ready' | 'ignition' | 'playing' | 'result', sample: TraceSample | null): string {
  if (status === 'ready') return 'Ready on pad';
  if (status === 'ignition') return 'Ignition sequence';
  if (status === 'result') return sample?.phase === 'result' ? 'Flight complete' : 'Result ready';
  if (sample?.phase === 'coast') return 'Coasting';
  if (sample?.phase === 'pad') return 'Holding on pad';
  return 'Powered ascent';
}

export function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialGameState);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const playback = usePlayback(state.activeLaunch, (runId) => dispatch({ type: 'settle', runId }));
  useEffect(() => {
    if (!playback.isFreshRun && state.status === 'ignition' && state.activeLaunch && playback.elapsedS >= state.activeLaunch.vehicle.ignitionDelayS) {
      dispatch({ type: 'presentationPhase', phase: 'playing' });
    }
  }, [playback.elapsedS, playback.isFreshRun, state.activeLaunch, state.status]);
  const displayedResult = state.activeLaunch?.result ?? state.lastResult;
  const displayedSample = useMemo(() => {
    if (state.activeLaunch) return playback.sample;
    return displayedResult ? sampleTrace(displayedResult.trace, displayedResult.terminalTimeS) : null;
  }, [displayedResult, playback.sample, state.activeLaunch]);
  const displayedStatus = !playback.isFreshRun && state.activeLaunch && state.status === 'ignition' &&
    playback.elapsedS >= state.activeLaunch.vehicle.ignitionDelayS ? 'playing' : state.status;
  const canvasSample: TraceSample = displayedSample ?? {
    timeS: 0,
    altitudeM: 0,
    velocityMps: 0,
    fuelKg: openingBalance.vehicle.fuelKg,
    phase: 'pad',
  };
  const visiblePhase = phaseLabel(displayedStatus, displayedSample);
  const isActive = state.status === 'ignition' || state.status === 'playing';
  const statusText = state.status === 'result' && state.lastResult
    ? `${outcomeLabel(state.lastResult.outcome)}. Maximum altitude ${formatAltitude(state.lastResult.maximumAltitudeM)}.`
    : state.status === 'ready'
      ? 'Your starter rocket is fueled and ready.'
      : `${visiblePhase}.`;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">FLIGHT LAB · VERTICAL TEST 01</p>
          <h1>Escape Velocity</h1>
          <p className="subtitle">Build a flight record one careful launch at a time.</p>
        </div>
        <div className="status-chip" data-phase={state.status}>
          <span className="status-dot" aria-hidden="true" />
          <span>{visiblePhase}</span>
        </div>
      </header>

      <section className="flight-panel" aria-labelledby="flight-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">LIVE RANGE</p>
            <h2 id="flight-heading">Starter rocket</h2>
          </div>
          <p className="model-note">Vertical test · fixed starter configuration</p>
        </div>
        <div className="canvas-wrap">
          <RocketCanvas
            trace={displayedResult?.trace ?? []}
            current={canvasSample}
            recordM={state.recordM}
            simulationTimeS={playback.simulationTimeS}
            showFullTrace={!isActive}
            reducedMotion={reducedMotion}
            status={displayedStatus}
          />
          {playback.paused && isActive && <p className="pause-note">Flight paused while this tab is hidden.</p>}
        </div>
        <div className="flight-readout" aria-live="polite">
          <div>
            <span className="readout-label">Current altitude</span>
            <strong>{formatAltitude(canvasSample.altitudeM)}</strong>
          </div>
          <div>
            <span className="readout-label">Flight phase</span>
            <strong aria-live="polite" aria-atomic="true">{visiblePhase}</strong>
          </div>
          <div>
            <span className="readout-label">Session record</span>
            <strong>{formatAltitude(state.recordM)}</strong>
          </div>
        </div>
      </section>

      <section className="control-panel" aria-labelledby="control-heading">
        <div className="control-copy">
          <p className="eyebrow">CONTROL DESK</p>
          <h2 id="control-heading">{state.status === 'result' ? 'Ready for another test?' : 'Make the next test count.'}</h2>
          <p id="status-message" className="status-message">{statusText}</p>
        </div>
        <button
          className="launch-button"
          type="button"
          onClick={() => dispatch({ type: 'launch' })}
          disabled={isActive}
          aria-describedby="status-message"
        >
          <span className="launch-icon" aria-hidden="true">↑</span>
          {state.status === 'result' ? 'Launch again' : 'Launch'}
        </button>
      </section>

      <section className="result-panel" aria-labelledby="result-heading">
        <div>
          <p className="eyebrow">FLIGHT LOG</p>
          <h2 id="result-heading">Previous result</h2>
        </div>
        {state.lastResult ? (
          <div className="result-summary">
            <div className="result-primary">
              <span className="readout-label">Maximum altitude</span>
              <strong>{formatAltitude(state.lastResult.maximumAltitudeM)}</strong>
            </div>
            <div>
              <span className="readout-label">Outcome</span>
              <strong>{outcomeLabel(state.lastResult.outcome)}</strong>
            </div>
            <div>
              <span className="readout-label">Ignition to apogee</span>
              <strong>{formatTime(state.lastResult.terminalTimeS)}</strong>
            </div>
            <p className="result-detail">
              {state.lastResult.outcome === 'apogee'
                ? state.lastResult.maximumAltitudeM > state.recordM - 1e-9
                  ? 'New session record. The trace above is your flight path.'
                  : 'A clean repeat. Keep experimenting when improvements arrive.'
                : 'The launch was not awarded a record. You can retry immediately.'}
            </p>
          </div>
        ) : (
          <p className="empty-result">No flights logged yet. Your first apogee will set the session record.</p>
        )}
      </section>

      <footer className="accessibility-bar">
        <label>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(event) => setReducedMotion(event.target.checked)}
          />
          Reduce motion
        </label>
        <span>Keyboard: focus Launch, then press Enter or Space.</span>
      </footer>
    </main>
  );
}
