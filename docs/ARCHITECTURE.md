# Architecture

> Phase 2 integration candidate (2026-09-05): [PHASE_2_SPEC.md](PHASE_2_SPEC.md) is the detailed implementation handoff. Runtime keeps the approved `opening-v2` / `vertical-v1.1` formulas and now mounts the controller-backed Phase 2 UI on this branch. The handoff explicitly supersedes earlier Ignition, replay and save proposals; unchanged physical formulas and nominal fixtures remain valid. Its measured Phase 2 campaigns exclude the Phase 3 milestone grants used by the older report.

Status: Phase 2 controller/UI integration candidate, 2026-09-05. Phase 1 remains the accepted public deployment until the integrated branch is released. The branch implements the approved Phase 2 domain, settlement, persistence and focused UI; prefer small explicit modules over frameworks for hypothetical future systems.

## Stack

Use TypeScript (strict), React, Vite, plain CSS and Canvas 2D for the launch view. React manages controls and summaries; canvas draws the rocket, ruler and trace. Use Vitest for domain tests and Playwright for a few browser acceptance flows. npm with a committed lockfile; pin a compatible Node runtime in the repository and CI when scaffolding. Vite's [official guide](https://vite.dev/guide/) documents its runtime requirements; verify compatibility when selecting versions instead of copying stale package numbers from this document.

Rationale: a static browser game needs neither server rendering nor a backend. React simplifies progressive screens, TypeScript catches boundary mistakes, and canvas can animate without updating React at 120 Hz. No game engine, ECS, Redux, database, service worker, accounts, cloud saves or network API initially. Deployment is a separate decision; this repository has no Sites hosting configuration. Do not deploy as part of Phase 1 unless requested.

## Repository layout and ownership

```text
AGENTS.md                      agent workflow
README.md                      entry point and verified commands
docs/                          rules, decisions, roadmap, handoffs
balance/opening.json            sole numeric opening balance source
scripts/                        balance reports importing production domain code
src/config/                    typed JSON validation and configuration access
src/simulation/                pure vertical solver, forces, events, result types
src/game/                      vehicle derivation, costs, rewards, reducer, selectors
src/persistence/               save validation, migrations, storage adapter
src/presentation/              playback clock, trace interpolation, camera, canvas
src/ui/                        React controls, summaries, styles
src/main.tsx                   composition root
tests/                         analytic, fixtures, reducer, save and browser cases
```

Only create directories as their phase needs them. `balance/opening.json` remains the machine-readable design artifact. Phase 1 replaced the intentionally limited Python calibration probe with `scripts/balance-report.ts`, which imports the production solver and preserves the measured fixtures. Do not keep parallel formula implementations drifting forever.

The documents own intended semantics, configuration owns numeric tuning and code implements them. If these conflict, name the conflict and resolve it explicitly with tests and a document/config update. Neither old conversation history nor undocumented code automatically wins.

## Hosting

Local development and the ordinary production preview use the host-root Vite base `/`. `npm run build:pages` overrides the base to `/Escape-Velocity/`, matching the repository subpath used by GitHub Pages. The public repository's Pages workflow enables Pages on its first `main` run, then publishes `dist` on pushes to `main` using GitHub Actions. The live repository-subpath deployment was verified on 2026-09-05. No client-side router or deep-link fallback is needed for this one-screen application. A static boot fallback in `index.html` and a React error boundary keep asset-load or render failures visible to players.

## Boundaries and data flow

1. A pure `deriveVehicle(levels, balance)` creates a vehicle spec. It knows nothing about components or canvas.
2. `simulateVertical(spec, environment, options)` returns a result and optional trace. It knows no currency, unlock or storage rules.
3. The launch command boundary obtains one seed, snapshots levels, derived nominal/effective specs, balance/model versions and approved numeric options, then allocates one monotonically increasing run ID.
4. A presentation controller plays the immutable trace after ignition. The physics result may be computed beforehand; it is not awarded beforehand.
5. `settleNewLaunch(runId)` consumes only the pending paid launch once, updates record/Credits/counts/summary and clears the active launch atomically. Replay is a separate read-only mode using the saved recipe; UI cannot submit arbitrary altitude or reward amounts.
6. The store persists the complete durable envelope after reservation, settlement, purchase, settings and recovery commands. Components subscribe to stable state/persistence snapshots and dispatch commands; the UI never owns progression state.

Use discriminated unions for status and outcomes, not scattered booleans. Define `FlightOutcome = 'apogee' | 'noLiftoff' | 'impact' | 'invalid' | 'limit'`; application cancellation discards the active flight. Distinguish `ready`, `ignition`, `playing`, `replay`, `result`. Runtime recipes use `balanceVersion: 'opening-v2'` and `modelVersion: 'vertical-v1.1'`; orbital results must later use a separate model without abusing altitude fields. Do not introduce an abstract plugin registry.

## Phase 2 playtest requirements

Phase 2 adds the incremental loop without weakening the simulation boundary: a valid apogee result settles Credits, the player buys one bounded upgrade, and the next launch snapshots the improved vehicle. Credits, the purchase and the result settlement remain reducer/economy concerns; the UI never invents a reward from displayed altitude.

Each gameplay launch must also carry an explicit launch seed in its immutable active-launch/result envelope. The game boundary generates and stores the seed; a deterministic seeded PRNG derives small physical-input perturbations before calling `simulateVertical`. The solver must not call `Math.random` or randomize a completed altitude. Replaying a stored seed must reconstruct the same inputs, trace and terminal result. Unit tests continue to pass explicit seeds (including a no-variance fixture where useful), while gameplay uses a generated seed. No seed-based catastrophic failure model is required for the opening.

## State management and commands

One reducer/store owned by the root is enough; React context can expose state and dispatch. Persist a compact progress object: Credits, owned levels, best altitude, launch counts, next run ID, last settled run ID, settings and the latest new-launch recipe/summary. Phase 2 does not persist milestone IDs. Keep derived vehicle stats, prices and available unlocks as selectors; the historical recipe is retained only for replay/debugging.

Commands: reserve a new launch, settle the current paid launch, start/complete/stop replay, buy one upgrade, set motion, reconcile an interrupted launch, import/export and explicit reset. The store acquires seeds once at the command boundary and checks the current primary save before durable commands. Reducer checks phase, affordability, cap and IDs. Double-click Launch cannot allocate two active flights; stale/duplicate settlement and late replay callbacks are no-ops. Check integer safe-range on Credits and run IDs; reject overflow rather than silently lose currency.

No UI component may own a formula, spend Credits directly or mutate a vehicle. Purchased stats are frozen until the next launch. Tests should exercise the command boundary, not merely individual helpers.

## Animation and time

For opening flights, precompute a bounded trace on launch. Benchmark a worst supported build; target < 50 ms on the documented test device, but measure rather than guarantee. Move simulation into a worker only if measured stalls justify it. Collect ~10 Hz trace plus events, interpolate at requestAnimationFrame rate, and sample DOM telemetry at ~10 Hz or less. Keep canvas size/device-pixel ratio out of domain code.

Physics time, presentation time and wall clock are separate. Ignition uses presentation time; playback speed changes the presentation clock only. A hidden tab pauses ignition/playback. On return reset the previous frame timestamp so there is no catch-up jump. Slow frames can advance playback to the current trace position but cannot omit settlement or phase events. Reduced motion offers a calm presentation/results option without a gameplay cost. Automation/offline accounting is not implied by wall-clock passage.

Keep last flight and best-flight trace only in memory initially. Trace persistence is optional cosmetic work, not part of a progress save. A reload may lose the ghost without losing the record.

## Save/load (Phase 2)

Use localStorage keys `escape-velocity.save` and `escape-velocity.save.backup` with a single JSON envelope `{schemaVersion:1, balanceVersion:'opening-v2', revision, progress:{...}}`. Save the reservation recipe before playback as `started`, then settle to `settled`; never save live solver state, particles, derived prices or animation time. Save after reservation, settlement, purchases, settings and recovery commands; never save per frame. On reload a `started` record becomes `interrupted` with no reward and reopens idle.

Validate JSON shape, finite nonnegative record, nonnegative safe-integer Credits/counts/IDs, integer bounded levels, recipe versions, uint32 seeds, approved physical inputs and summary correlations. Bound import size to 1 MB. An unreadable, oversized or unsupported-future-version save must not be overwritten automatically: show recovery/export/reset options and keep the original raw data. Balance changes are separate from schema migrations; preserve acquired progress or write an explicit compensation/mapping rule for removed content. Never silently clamp purchased levels to a new lower cap.

Migrations are pure sequential `vN → vN+1` functions tested against committed fixtures; validate before and after. Retain the raw source until migration and storage succeed. A storage adapter catches quota/privacy failures, keeps the session playable and clearly shows “Progress is not being saved” with export available. Keep one previous valid save as best-effort backup; loading must reject malformed envelopes and offer the valid backup explicitly.

Settle currency, record, counts and the launch summary in one new envelope and one primary-key write so a crash cannot persist only part of an award. No anti-cheat infrastructure: saves are editable local player data. In Phase 2 handle another tab via a storage event and a raw-primary comparison before every durable command: suspend commands in the stale tab and ask it to reload before writing. localStorage is not transactional across tabs; document simultaneous-tab play as unsupported. Strong cross-tab locking is deferred unless required, not falsely promised by a revision number.

## Tests and release checks

`npm ci`, `npm run typecheck`, `npm test -- --run`, `npm run build`, and `npm run test:e2e` must be documented and succeed once the app exists. Use a pinned browser install in CI. Phase 1 establishes package scripts and a basic GitHub Actions workflow for typecheck, unit tests and build; browser smoke may be a separate CI job.

Simulation tests include PHYSICS analytic cases, fractional burnout, no liftoff, invalid inputs, duration cap, recorded reference fixtures and timestep convergence. Parametric opening sweeps verify all builds lift and terminate, while identifying reductions in altitude from a purchase. General physics tests must not assert “fuel always improves altitude.” Curve/config validation checks caps, positive masses and safe prices. Economy tests cover reward rounding, price vectors, duplicate settlements, insufficient funds and interrupted flights. Save tests cover round-trip, malformed/oversized/future data, recipe validation, backup recovery, failure to write, imports and reload after reservation/award.

Browser smoke: keyboard launch, ignition/burnout/coast/result, paid launch/reward, buy/save/reload, unpaid replay, interrupted reload, no hidden-system controls, mobile-size controls and no console errors. Visually inspect first flight, upgrade silhouette and previous-record comparison. Exact aesthetics are not screenshot pixel tests. Record actual commands/results in a reviewable handoff or PR.

## Future extension and decision discipline

Orbital flight adds a new simulation model and success policy; staging adds a stage list only when implemented; payloads add mass when missions need them. The result envelope and pure derivation boundary are sufficient preparation. Retain old models/fixtures where needed to explain saved historic results. Do not recompute historic awards under new balance rules.

Major changes update the owning document and a short decision entry in ROADMAP; create separate ADR files only when a decision needs substantial alternatives/history. Review current code before editing and favor correcting the smallest responsible module.
