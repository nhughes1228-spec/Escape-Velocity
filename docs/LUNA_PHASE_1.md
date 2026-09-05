# Luna handoff — Phase 1: first playable vertical launch

## Assignment

Inspect the CURRENT repository, branches, working tree, remote and recent commits first. Read AGENTS and all five foundation documents. Implement a small playable browser build using the agreed stack. Keep the initial starter specification fixed. The architect has not started an implementation conversation; this file is the complete bounded task to give Luna.

## Behavior

One screen: rocket/pad, Launch, current altitude, flight phase, previous result and session record. Ready at page load, zero record. Click or keyboard-activate Launch once: wait 1.5 presentation seconds, simulate/play the configured rocket through powered ascent, burnout and coast, show exact-result-based maximum altitude rounded for display, update session record and enable another launch. Time to result is approximately 10.24 seconds at 1× in a foreground tab. No forced result-dismissal delay.

The Phase 1 screen is a launch prototype. The four cards and Credits specified for the complete opening arrive in Phase 2; do not implement disabled fake upgrade controls now. A height ruler/record marker must make flight scale legible. The trajectory is computed by the solver; animation cannot choose the peak or grant a result. Hidden tabs pause presentation and reset frame timing on return. Reduced motion and keyboard access are required now.

## Interfaces and boundaries

Implement the PHYSICS equations/event rules in a pure TypeScript solver; centrally validate/import `balance/opening.json`. Keep functions for vehicle derivation outside components even though the UI only uses level zero. Use typed vehicle, state, outcome and result/trace structures from PHYSICS and ARCHITECTURE. Expose a pure advancement/initial-state test seam for analytic ballistic tests; it need not be public UI. Do not introduce configurable environment controls for players.

A small game reducer/controller admits a single active launch and accepts its result once. Keep pending result/trace transient; no save schema is needed yet. Presentation only samples trace, drives the camera and emits completion for the current run ID. Prevent stale completion after cancellation/unmount. Handle diagnostic results visibly and allow retry.

Establish npm scripts `dev`, `typecheck`, `test`, `build`, `test:e2e`, `balance:report`. Pin compatible dependencies/runtime, commit lockfile, add minimal CI for typecheck/unit/build. Replace the Python probe with a TypeScript report script importing production solver and game configuration. Keep reference fixtures from the original report for comparison, and retain report assumptions/provenance. Do not copy the limited Python solver's lack of invalid-input/pad handling into production.

## Exact acceptance criteria

1. A fresh checkout runs with documented `npm ci` and `npm run dev`; typecheck, unit tests and production build succeed. A configured browser smoke test succeeds with documented installation prerequisites.
2. Default levels `(0,0,0)` derive dry mass 8 kg, fuel 2 kg, thrust 160 N, effective exhaust speed 400 m/s and drag area 0.012 m²; q = 0.4 kg/s and burnout = 5.000 s within 1e-8 s.
3. At dt=1/120 s, default apogee is **160.170311 m ± 0.1 m** and time from ignition completion is **8.741557 s ± 0.02 s**. First result appears after roughly 10.24 foreground seconds at 1×; CI asserts state transitions using a controlled presentation clock rather than tight wall-time sleeps.
4. Physics tests pass for vacuum ballistic ascent, ideal rocket velocity gain with gravity/drag disabled, drag direction, nonnegative fuel/positive mass, fractional-step burnout, initial zero fuel/thrust, delayed/no liftoff, invalid/nonfinite input, duration limit and single termination. Use meaningful independent analytic expectations, not a second copy of the implementation as oracle.
5. Production-solver sweeps cover all 729 physical opening builds at dt and dt/2: every build lifts and reaches finite apogee before the cap, no opening physical purchase reduces altitude, and PHYSICS convergence tolerances pass. Reference report fixture altitude/time tolerances also pass. Store the regenerated report and describe any discrepancy rather than silently updating fixtures.
6. Launch cannot be double-started by rapid clicks or keyboard repeats. Result/record settle once; stale/duplicate completion does nothing. Repeating the fixed configuration produces the same peak and preserves the record. A second flight works without reloading.
7. Burnout visibly stops the engine flame; the rocket continues coasting. Height/readout and record marker agree with trace coordinates. Canvas never mutates simulation or progress. Window resizing does not change results.
8. Keyboard launch, visible focus, textual phase/result, reduced motion and a narrow 390×844 viewport work without clipped essential controls. No locked orbit/staging/payload/prestige UI appears. No browser console errors during two complete launches.
9. Hidden-tab pause/resume does not catch up wall time, skip ignition or settle twice. Tests inject visibility/clock changes; document one manual browser check. Reduced motion follows the same result/record semantics.
10. README lists verified commands; ROADMAP describes Phase 1 completion and remaining scope only after checks pass. Changes are committed in descriptive scopes; recheck others' work before staging and push without force. Report the commit, checks and known limitations to the user.

## Out of scope

Purchases, Credits, milestone payouts/unlocks, save/load, persistence of traces, offline gains, auto-launch, playback upgrades, missions, orbital physics, staging, payloads, prestige, audio production, elaborate art systems, deployment and a backend. This task deliberately establishes one reliable playable flight before economy work.
