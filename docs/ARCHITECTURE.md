# Architecture

Status: foundation decision with Phase 1 implementation, 2026-09-05. The first playable launch prototype follows this layout; future systems remain intentionally unimplemented. Prefer small explicit modules over frameworks for hypothetical future systems.

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

## Boundaries and data flow

1. A pure `deriveVehicle(levels, balance)` creates a vehicle spec. It knows nothing about components or canvas.
2. `simulateVertical(spec, environment, options)` returns a result and optional trace. It knows no currency, unlock or storage rules.
3. `startLaunch` snapshots levels, derived spec, balance/model versions and allocates one monotonically increasing run ID.
4. A presentation controller plays the immutable trace after ignition. The physics result may be computed beforehand; it is not awarded beforehand.
5. `settleLaunch(runId)` consumes the pending authoritative result once, updates record/credits/milestones and clears the active launch atomically. UI cannot submit arbitrary altitude or reward amounts.
6. The storage adapter persists the completed durable state. Components render selectors and dispatch commands.

Use discriminated unions for status and outcomes, not scattered booleans. Define `FlightOutcome = 'apogee' | 'noLiftoff' | 'impact' | 'invalid' | 'limit'`; application cancellation discards the active flight. Distinguish `idle`, `ignition`, `playing`, `result`. Use `model: 'vertical-v1'` on result envelopes so orbital results can later be added without abusing altitude fields. Do not introduce an abstract plugin registry.

## State management and commands

One reducer/store owned by the root is enough; React context can expose state and dispatch. Persist a compact progress object: Credits, owned levels, best altitude, earned milestone IDs, next run ID, last settled run ID and optional last result summary. Keep derived vehicle stats, prices and available unlocks as selectors. Store immutable earned milestone IDs but derive UI visibility from them and current content availability.

Commands: launch, settle current launch, buy one upgrade (Phase 2), acknowledge result, load validated save and explicit user reset. Reducer checks phase, affordability, cap and IDs. Double-click Launch cannot allocate two active flights; stale/duplicate settlement is a no-op. Check integer safe-range on Credits and run IDs; reject overflow rather than silently lose currency. Phase 1 uses launch/result/record state only; add economy and saves in Phase 2.

No UI component may own a formula, spend Credits directly or mutate a vehicle. Purchased stats are frozen until the next launch. Tests should exercise the command boundary, not merely individual helpers.

## Animation and time

For opening flights, precompute a bounded trace on launch. Benchmark a worst supported build; target < 50 ms on the documented test device, but measure rather than guarantee. Move simulation into a worker only if measured stalls justify it. Collect ~10 Hz trace plus events, interpolate at requestAnimationFrame rate, and sample DOM telemetry at ~10 Hz or less. Keep canvas size/device-pixel ratio out of domain code.

Physics time, presentation time and wall clock are separate. Ignition uses presentation time; playback speed changes the presentation clock only. A hidden tab pauses ignition/playback. On return reset the previous frame timestamp so there is no catch-up jump. Slow frames can advance playback to the current trace position but cannot omit settlement or phase events. Reduced motion offers a calm presentation/results option without a gameplay cost. Automation/offline accounting is not implied by wall-clock passage.

Keep last flight and best-flight trace only in memory initially. Trace persistence is optional cosmetic work, not part of a progress save. A reload may lose the ghost without losing the record.

## Save/load (Phase 2)

Use localStorage with a single JSON envelope, e.g. `{schemaVersion:1, balanceVersion:'opening-v1', revision, progress:{...}}`. Save only settled progression, not live solver state, particle positions, derived prices or animation time. Saving after purchases and settlement is enough; no save-per-frame. Before starting a flight persist its consumed nextRunId; an interrupted run has no reward and reopens idle.

Validate JSON shape, finite nonnegative record, nonnegative safe-integer Credits/IDs, integer bounded levels and known milestone IDs. Bound import size to 1 MB. An unreadable, oversized or unsupported-future-version save must not be overwritten automatically: show recovery/export/reset options and keep the original raw data. Balance changes are separate from schema migrations; preserve acquired progress or write an explicit compensation/mapping rule for removed content. Never silently clamp purchased levels to a new lower cap.

Migrations are pure sequential `vN → vN+1` functions tested against committed fixtures; validate before and after. Retain the raw source until migration and storage succeed. A storage adapter catches quota/privacy failures, keeps the session playable and clearly shows “Progress is not being saved” with export available. Keep one previous valid save as best-effort backup; loading must reject malformed envelopes and offer the valid backup explicitly.

Settle currency, record and milestones in one new envelope and one primary-key write so a crash cannot persist only part of an award. No anti-cheat infrastructure: saves are editable local player data. In Phase 2 handle another tab via a storage event: suspend commands in the stale tab and ask it to reload before writing. localStorage is not transactional across tabs; document simultaneous-tab play as unsupported. Strong cross-tab locking is deferred unless required, not falsely promised by a revision number.

## Tests and release checks

`npm ci`, `npm run typecheck`, `npm test -- --run`, `npm run build`, and `npm run test:e2e` must be documented and succeed once the app exists. Use a pinned browser install in CI. Phase 1 establishes package scripts and a basic GitHub Actions workflow for typecheck, unit tests and build; browser smoke may be a separate CI job.

Simulation tests include PHYSICS analytic cases, fractional burnout, no liftoff, invalid inputs, duration cap, recorded reference fixtures and timestep convergence. Parametric opening sweeps verify all builds lift and terminate, while identifying reductions in altitude from a purchase. General physics tests must not assert “fuel always improves altitude.” Curve/config validation checks caps, positive masses and safe prices. Economy tests cover threshold jumps, rounding, duplicate settlements, insufficient funds and interrupted flights. Save tests cover round-trip, malformed data, future versions, migration, failure to write and reload after purchase/award.

Browser smoke: keyboard launch, ignition/burnout/coast/result, replay without reload, record update, no hidden-system controls, mobile-size controls, no console errors; add buy/save/reload in Phase 2. Visually inspect first flight and previous-record comparison. Exact aesthetics are not screenshot pixel tests. Record actual commands/results in a reviewable handoff or PR.

## Future extension and decision discipline

Orbital flight adds a new simulation model and success policy; staging adds a stage list only when implemented; payloads add mass when missions need them. The result envelope and pure derivation boundary are sufficient preparation. Retain old models/fixtures where needed to explain saved historic results. Do not recompute historic awards under new balance rules.

Major changes update the owning document and a short decision entry in ROADMAP; create separate ADR files only when a decision needs substantial alternatives/history. Review current code before editing and favor correcting the smallest responsible module.
