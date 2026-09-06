import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { openingBalance } from '../config/opening';
import { deriveVehicle, type RocketLevels } from '../game/vehicle';
import { canPurchaseUpgrade, upgradeCardsFor } from '../game/selectors';
import { createGameStore, type GameStore, type PersistenceSnapshot } from '../game/store';
import { simulateVertical } from '../simulation/vertical';
import type { FlightOutcome, TraceSample } from '../simulation/types';
import { usePlayback } from '../presentation/clock';
import { sampleTrace } from '../presentation/trace';
import { RocketCanvas } from './RocketCanvas';

// The controller is created at module scope so React StrictMode cannot run
// storage reconciliation or seed acquisition twice during a render probe.
const gameStore: GameStore = createGameStore();

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

function phaseLabel(status: 'ready' | 'ignition' | 'playing' | 'replay' | 'result', sample: TraceSample | null): string {
  if (status === 'ready') return 'Ready on pad';
  if (status === 'ignition') return 'Ignition sequence';
  if (status === 'replay') return 'Replay · no reward';
  if (status === 'result') return sample?.phase === 'result' ? 'Flight complete' : 'Result ready';
  if (sample?.phase === 'coast') return 'Coasting';
  if (sample?.phase === 'pad') return 'Holding on pad';
  return 'Powered ascent';
}

function persistenceLabel(snapshot: PersistenceSnapshot): string {
  switch (snapshot.kind) {
    case 'saved': return 'Saved locally';
    case 'not-saved': return 'Not saved';
    case 'recovery': return 'Recovery needed';
    case 'conflict': return 'Reload required';
    case 'error': return 'Save error';
  }
}

function settingsMessage(snapshot: PersistenceSnapshot): string {
  if (snapshot.message) return snapshot.message;
  if (snapshot.kind === 'saved') return 'Progress is saved in this browser.';
  return 'Progress remains available in this session. Export a copy before leaving.';
}

function effectiveReducedMotion(motion: 'system' | 'reduced' | 'full', systemReduced: boolean): boolean {
  return motion === 'reduced' || (motion === 'system' && systemReduced);
}

function useGameStoreSnapshot(store: GameStore) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const persistence = useSyncExternalStore(store.subscribe, store.getPersistence, store.getPersistence);
  return { state, persistence };
}

function levelSummary(levels: RocketLevels): string {
  return `E${levels.engine} · F${levels.fuel} · A${levels.airframe} · I${levels.ignition}`;
}

export function App() {
  const { state, persistence } = useGameStoreSnapshot(gameStore);
  const [systemReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [exportText, setExportText] = useState('');
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [recentMode, setRecentMode] = useState<'new' | 'replay'>('new');

  const playback = usePlayback(state.activeLaunch, (runId, playbackId) => {
    const active = gameStore.getState().activeLaunch;
    if (!active || active.runId !== runId || active.playbackId !== playbackId) return;
    const mode = active.mode;
    setRecentMode(mode);
    gameStore.dispatch(mode === 'replay'
      ? { type: 'completeReplay', runId, playbackId }
      : { type: 'settleNewLaunch', runId, playbackId });
  });

  useEffect(() => {
    const active = state.activeLaunch;
    if (!active || state.status !== 'ignition' || playback.isFreshRun) return;
    if (playback.elapsedS >= active.vehicle.ignitionDelayS) {
      gameStore.dispatch({
        type: 'presentationPhase',
        runId: active.runId,
        playbackId: active.playbackId,
        phase: 'playing',
      });
    }
  }, [playback.elapsedS, playback.isFreshRun, state.activeLaunch, state.status]);

  const displayedResult = state.activeLaunch?.result ?? state.lastResult;
  const displayedSample = useMemo(() => {
    if (state.activeLaunch) return playback.sample;
    return displayedResult ? sampleTrace(displayedResult.trace, displayedResult.terminalTimeS) : null;
  }, [displayedResult, playback.sample, state.activeLaunch]);
  const displayedStatus = !playback.isFreshRun && state.activeLaunch && state.status === 'ignition' &&
    playback.elapsedS >= state.activeLaunch.vehicle.ignitionDelayS ? 'playing' : state.status;
  const ignitionActive = state.status === 'ignition' ? state.activeLaunch : null;
  const ignitionDelayS = ignitionActive?.vehicle.ignitionDelayS ?? 0;
  const ignitionProgress = ignitionActive && ignitionDelayS > 0
    ? Math.min(1, Math.max(0, playback.elapsedS / ignitionDelayS))
    : 0;
  const ignitionRemainingS = Math.max(0, ignitionDelayS - playback.elapsedS);
  const displayLevels = state.activeLaunch?.levels ?? state.levels;
  const displayVehicle = state.activeLaunch?.vehicle ?? deriveVehicle(displayLevels, openingBalance);
  const nominalPeakM = useMemo(() => {
    if (state.activeLaunch) return state.activeLaunch.nominalPeakM;
    const result = simulateVertical(deriveVehicle(displayLevels, openingBalance), openingBalance.environment, {
      ...openingBalance.simulation,
      balanceVersion: openingBalance.balanceVersion,
      modelVersion: openingBalance.modelVersion,
      collectTrace: false,
    });
    return result.maximumAltitudeM;
  }, [displayLevels, state.activeLaunch]);
  const canvasSample: TraceSample = displayedSample ?? {
    timeS: 0,
    altitudeM: 0,
    velocityMps: 0,
    fuelKg: displayVehicle.fuelMassKg,
    phase: 'pad',
  };
  const visiblePhase = phaseLabel(displayedStatus, displayedSample);
  const isActive = state.status === 'ignition' || state.status === 'playing' || state.status === 'replay';
  const isReplay = state.status === 'replay' || recentMode === 'replay';
  const reducedMotion = effectiveReducedMotion(state.settings.motion, systemReduced);
  const upgradeCards = useMemo(() => upgradeCardsFor(state), [state]);
  const latestSummary = state.lastLaunch?.status === 'settled' ? state.lastLaunch.summary : null;
  const hasCompletedAllUpgrades = upgradeCards.every((card) => card.level === card.cap);
  const statusText = state.status === 'result' && state.lastResult
    ? `${outcomeLabel(state.lastResult.outcome)}. Maximum altitude ${formatAltitude(state.lastResult.maximumAltitudeM)}.`
    : state.status === 'ready'
      ? state.launchesCompleted === 0 ? 'Your starter rocket is fueled and ready.' : 'Choose an upgrade or launch again.'
      : state.status === 'ignition'
        ? `Ignition sequence active. Liftoff in ${ignitionRemainingS.toFixed(1)} s.`
        : `${visiblePhase}.`;
  const phaseAnnouncement = state.status === 'result' && state.lastResult && recentMode === 'replay'
    ? 'Replay complete. No reward; progression is unchanged.'
    : state.status === 'result' && state.lastResult
      ? `${outcomeLabel(state.lastResult.outcome)}. Maximum altitude ${formatAltitude(state.lastResult.maximumAltitudeM)}${latestSummary ? `. Awarded ${latestSummary.rewardCredits} Credits.` : '.'}`
    : visiblePhase;

  const launch = () => {
    setRecentMode('new');
    gameStore.dispatch({ type: 'reserveNewLaunch' });
  };

  const replay = () => {
    setRecentMode('replay');
    gameStore.dispatch({ type: 'startReplay' });
  };

  const purchase = (kind: typeof upgradeCards[number]['kind']) => {
    if (!canPurchaseUpgrade(state, kind)) return;
    if (gameStore.dispatch({ type: 'buyUpgrade', kind })) {
      const label = kind === 'fuel' ? 'Fuel Tank' : kind[0].toUpperCase() + kind.slice(1);
      setRecentMode('new');
      setSettingsNotice(`${label} upgraded.`);
    }
  };

  const exportProgress = () => {
    const raw = gameStore.exportSave();
    setExportText(raw);
    try {
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'escape-velocity-save.json';
      link.click();
      URL.revokeObjectURL(url);
      setSettingsNotice('Save exported.');
    } catch {
      setSettingsNotice('Save copied into the export box below.');
    }
  };

  const importProgress = () => {
    if (!importText.trim()) {
      setSettingsNotice('Paste a save into the import box first.');
      return;
    }
    if (!window.confirm('Replace the current progress with this save? Export current progress first if you may need it.')) return;
    const accepted = gameStore.importSave(importText, true);
    const result = gameStore.getPersistence();
    setSettingsNotice(accepted
      ? result.kind === 'saved' ? 'Progress imported and saved.' : 'Progress imported for this session, but it is not saved yet.'
      : result.error ?? 'Import was rejected; current progress is unchanged.');
    if (accepted) {
      setRecentMode('new');
      setImportText('');
    }
  };

  const resetProgress = () => {
    if (!window.confirm('Reset all Credits, upgrades and records? Export current progress first if you may need it.')) return;
    const accepted = gameStore.reset(true);
    const result = gameStore.getPersistence();
    setSettingsNotice(accepted
      ? result.kind === 'saved' ? 'Progress reset and saved.' : 'Reset accepted for this session, but it is not saved yet.'
      : result.error ?? 'Reset was rejected; current progress is unchanged.');
    if (accepted) setRecentMode('new');
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">FLIGHT LAB · VERTICAL TEST 02</p>
          <h1>Escape Velocity</h1>
          <p className="subtitle">Build a flight record one careful launch at a time.</p>
        </div>
        <div className="header-stats">
          <div className="credits-display" aria-label={`${state.credits} Credits`}><span>Credits</span><strong>{state.credits.toLocaleString()}</strong></div>
          <div className="status-chip" data-phase={state.status}>
            <span className="status-dot" aria-hidden="true" />
            <span>{visiblePhase}</span>
          </div>
        </div>
      </header>

      <section className="flight-panel" aria-labelledby="flight-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">LIVE RANGE</p>
            <h2 id="flight-heading">{isReplay ? 'Historical flight' : 'Current rocket'}</h2>
          </div>
          <p className="model-note">{levelSummary(displayLevels)} · physical configuration</p>
        </div>
        <div className="canvas-wrap">
          <RocketCanvas
            trace={displayedResult?.trace ?? []}
            current={canvasSample}
            recordM={state.recordM}
            nominalPeakM={nominalPeakM}
            simulationTimeS={playback.simulationTimeS}
            showFullTrace={!isActive}
            reducedMotion={reducedMotion}
            status={displayedStatus}
            ignitionElapsedS={playback.elapsedS}
            ignitionProgress={ignitionProgress}
            levels={displayLevels}
          />
          {playback.paused && isActive && <p className="pause-note">Flight paused while this tab is hidden.</p>}
        </div>
        <div className="flight-readout">
          <div>
            <span className="readout-label">Current altitude</span>
            <strong>{formatAltitude(canvasSample.altitudeM)}</strong>
          </div>
          <div>
            <span className="readout-label">Flight phase</span>
            <strong>{visiblePhase}</strong>
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
          <h2 id="control-heading">
            {state.status === 'result' ? 'Ready for another test?' : state.status === 'ignition' ? 'Ignition underway' : 'Make the next test count.'}
          </h2>
          <p id="status-message" className="status-message">{statusText}</p>
          {ignitionActive && (
            <div className="ignition-feedback" role="group" aria-label="Ignition feedback">
              <div className="ignition-feedback-heading">
                <span className="readout-label">Ignition sequence</span>
                <strong>{ignitionProgress >= 1 ? 'Liftoff' : `${ignitionRemainingS.toFixed(1)} s to liftoff`}</strong>
              </div>
              <div className="ignition-progress" role="progressbar" aria-label="Ignition progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ignitionProgress * 100)}>
                <span style={{ width: `${Math.round(ignitionProgress * 100)}%` }} />
              </div>
              <p>Engine systems are coming online.</p>
            </div>
          )}
        </div>
        <button
          className={`launch-button${isActive ? ' launch-button-active' : ''}`}
          type="button"
          onClick={launch}
          disabled={isActive || persistence.kind === 'conflict'}
          aria-describedby="status-message"
          aria-busy={isActive}
        >
          <span className="launch-icon" aria-hidden="true">{isActive ? '◌' : '↑'}</span>
          {state.status === 'result' ? 'Launch again' : state.status === 'ignition' ? 'Ignition sequence' : state.status === 'playing' ? 'In flight' : 'Launch'}
        </button>
      </section>

      <p className="sr-only" role="status" aria-live="polite">{phaseAnnouncement}</p>

      <section className="upgrade-panel" aria-labelledby="upgrade-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ROCKET SYSTEMS</p>
              <h2 id="upgrade-heading">Spend Credits on the next advantage</h2>
            </div>
            <p className="section-note">Each purchase equips one new level.</p>
          </div>
          <div className="upgrade-grid">
            {upgradeCards.map((card) => {
              const effect = card.kind === 'engine'
                ? 'Stronger push; slightly heavier engine and faster fuel use.'
                : card.kind === 'fuel'
                  ? 'More fuel and a longer burn; the tank adds mass.'
                  : card.kind === 'airframe'
                    ? 'Lighter structure and a cleaner shape.'
                    : `Shorter countdown${card.level < card.cap ? ` · ${openingBalance.upgrades.ignition.delaysS[card.level].toFixed(1)} → ${openingBalance.upgrades.ignition.delaysS[card.level + 1].toFixed(1)} s` : ''}.`;
              const actionLabel = card.cost === null ? `${card.label} maxed` : `Buy ${card.label} for ${card.cost} Credits`;
              return (
                <article className={`upgrade-card${card.available ? ' upgrade-card-available' : ''}`} key={card.kind}>
                  <div className="upgrade-card-top">
                    <h3>{card.label}</h3>
                    <span className="level-pill">Lv. {card.level}/{card.cap}</span>
                  </div>
                  <p>{effect}</p>
                  <button type="button" onClick={() => purchase(card.kind)} disabled={!card.available} aria-label={actionLabel}>
                    {card.cost === null ? 'Fully upgraded' : card.affordable ? `Buy · ${card.cost} Credits` : `${card.cost} Credits needed`}
                  </button>
                </article>
              );
            })}
          </div>
          {hasCompletedAllUpgrades && <p className="completion-note" role="status">All opening systems are fully upgraded. Keep flying to refine your record.</p>}
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
            {latestSummary && recentMode !== 'replay' && (
              <div className="reward-callout">
                <span className="readout-label">Launch reward</span>
                <strong>+{latestSummary.rewardCredits} Credits</strong>
              </div>
            )}
            <p className="result-detail">
              {recentMode === 'replay'
                ? 'Replay complete · no reward. Your saved result and progression are unchanged.'
                : state.lastResult.outcome === 'apogee'
                  ? latestSummary?.isNewRecord ? 'New session record. Higher flights earn more Credits.' : 'A clean repeat. Small engine variation makes every launch a little different.'
                  : 'This launch earned no reward. You can retry immediately.'}
            </p>
            {state.status === 'result' && state.lastLaunch && (
              <p className="result-actions">
                <button type="button" className="secondary-button" onClick={replay}>Replay last flight — no reward</button>
              </p>
            )}
          </div>
        ) : (
          <p className="empty-result">No flights logged yet. Your first apogee will set the session record and award Credits.</p>
        )}
      </section>

      <section className="settings-panel">
        <button type="button" className="settings-toggle" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} aria-controls="settings-content">
          <span><span className="eyebrow">SETTINGS</span><strong>{persistenceLabel(persistence)}</strong></span>
          <span aria-hidden="true">{settingsOpen ? '−' : '+'}</span>
        </button>
        {settingsOpen && (
          <div id="settings-content" className="settings-content">
            <p className={`save-status save-status-${persistence.kind}`} role="status">{settingsMessage(persistence)}</p>
            {persistence.error && <p className="settings-error">{persistence.error}</p>}
            {persistence.kind === 'conflict' && <button type="button" className="secondary-button" onClick={() => window.location.reload()}>Reload saved progress</button>}
            {persistence.backupAvailable && <button type="button" className="secondary-button" onClick={() => { const accepted = gameStore.recoverBackup(); setSettingsNotice(accepted ? 'Backup recovered for this session.' : gameStore.getPersistence().error ?? 'Backup recovery was rejected.'); }}>Recover valid backup</button>}
            <label className="setting-row">
              Motion
              <select value={state.settings.motion} onChange={(event) => gameStore.dispatch({ type: 'setMotion', motion: event.target.value as typeof state.settings.motion })} disabled={isActive}>
                <option value="system">Use system setting</option>
                <option value="reduced">Reduced motion</option>
                <option value="full">Full motion</option>
              </select>
            </label>
            <p className="setting-help">Animation only affects presentation. Physics and rewards stay the same.</p>
            <div className="settings-actions">
              <button type="button" className="secondary-button" onClick={exportProgress}>Export save</button>
              <button type="button" className="danger-button" onClick={resetProgress} disabled={isActive}>Reset progress</button>
            </div>
            {exportText && <textarea className="save-text" aria-label="Exported save" value={exportText} readOnly rows={4} />}
            {!isActive && (
              <>
                <label className="save-label" htmlFor="import-save">Import save</label>
                <textarea id="import-save" className="save-text" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste an exported save here" rows={4} />
                <button type="button" className="secondary-button" onClick={importProgress}>Confirm import</button>
              </>
            )}
            {settingsNotice && <p className="settings-notice" role="status">{settingsNotice}</p>}
          </div>
        )}
      </section>

      <footer className="accessibility-bar">
        <label className="motion-footer-control">
          <input type="checkbox" checked={reducedMotion} onChange={(event) => gameStore.dispatch({ type: 'setMotion', motion: event.target.checked ? 'reduced' : 'full' })} />
          Reduce motion
        </label>
        <span>Keyboard: focus Launch, then press Enter or Space.</span>
      </footer>
    </main>
  );
}
