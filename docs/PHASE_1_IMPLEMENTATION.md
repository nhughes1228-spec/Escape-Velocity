# Phase 1 implementation handoff

Status: deployment correction implemented on `codex/phase-1-white-screen`, 2026-09-05. The commit SHA is reported with the reviewed commit rather than embedded in this handoff. Phase 1 remains subject to user acceptance of the deployed URL.

## Delivered behavior

The application is a single-screen React/Vite launch prototype. A fresh session starts with the fixed level-zero starter rocket and a zero session record. Launch snapshots the starter vehicle, waits 1.5 presentation seconds, plays the authoritative vertical-v1 trace through powered ascent, burnout and coast, then settles one apogee result and updates the session record. The same launch can be repeated without reloading.

The canvas draws the illustrative rocket, simulated trace, height ruler and record marker. The DOM separately exposes current altitude, phase, result and record for keyboard and screen-reader users. The presentation clock pauses in hidden tabs and resets its frame baseline on return. Reduced motion changes presentation detail only; physics, result and record semantics remain unchanged.

## White-screen diagnosis and correction

Commit `6aa0a1e` built successfully at the host root but emitted absolute `/assets/...` URLs. When that `dist` directory was mounted at the GitHub Pages repository path `/Escape-Velocity/`, the HTML loaded with an empty `#root`, both JavaScript/CSS requests returned 404, and Chromium reported failed resource loads. This reproduces the reported white screen. Opening `dist/index.html` directly via `file://` is also unsupported because module assets need an HTTP origin.

The correction adds `npm run build:pages` with Vite base `/Escape-Velocity/`, a Pages deployment workflow on `main`, a subpath E2E check, and a static boot fallback. A React error boundary covers failures after the bundle has loaded. The intended playable URL is [https://nhughes1228-spec.github.io/Escape-Velocity/](https://nhughes1228-spec.github.io/Escape-Velocity/); the repository is now public, so it becomes live after Pages is enabled with GitHub Actions as the source and the workflow runs successfully.

## Boundaries and exclusions

- `src/simulation/vertical.ts` owns validation, forces, midpoint integration, pad support, burnout, apogee, impact, invalid and duration-limit events.
- `src/game/vehicle.ts` owns typed balance-driven vehicle derivation, even though Phase 1 uses level zero only.
- `src/game/reducer.ts` owns one-active-launch and run-ID settlement idempotence.
- `src/presentation/` samples immutable trace data and owns presentation time; canvas never mutates simulation or progress.
- `balance/opening.json` is the sole numeric source; `scripts/balance-report.ts` imports production code.
- Credits, purchases, milestones, persistence, telemetry controls, missions, staging, payloads and orbital systems are deliberately not present.

## Verification evidence

Commands run from the repository root:

```text
npm ci                         passed
npm run typecheck              passed
npm test -- --run              4 files / 12 tests passed
npm run build                  passed (Vite production build)
npm run balance:report         passed; 729 builds, fixtures exact, 0 negative edges
npm run test:e2e               3 tests passed
npm run test:e2e:pages         passed; repository-subpath assets load without errors
git diff --check               passed
```

The production report retains the foundation fixture values: starter apogee 160.170311 m, ignition-completion-to-apogee time 8.741557 s, maximum dt-halving altitude difference 0.00005819 m, maximum time difference 0.00000143 s, minimum pad TWR 1.10838719, and both baseline campaigns reaching 1 km on launch 22. The browser suite covers launch/replay, visible powered-ascent → coast → result transitions, controlled-clock hidden-tab pause/resume, no console errors during two complete launches, and essential controls at 390×844. Ready and result states were visually inspected with Chromium screenshots.

## Review focus

The production solver deliberately matches the calibrated Python fixture while adding the specified invalid-input, pad-support, event and duration-limit handling. Astra review is useful for the numerical/event boundary and the transition from the fixed starter controller to Phase 2 economy/save commands. The remaining acceptance item is an actual successful Pages deployment from `main` and a user click-through of the documented URL.
