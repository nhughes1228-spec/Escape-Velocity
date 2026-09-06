# Phase 2 implementation handoff

Status: controller/UI integration deployed to `main`, 2026-09-05. Correction commit `059aee9` passed the focused Astra P0 gate. Merge commit `5a69810` publishes the approved controller, Credits loop, four upgrade cards, historical replay and Settings recovery behavior through GitHub Pages. Automated verification and a live browser smoke pass; Astra’s two human pacing sessions and final release audit remain pending. [PHASE_2_SPEC.md](PHASE_2_SPEC.md) remains the authoritative design specification.

**Astra review of `1c9156c`: CONDITIONAL PASS.** Independent standard checks pass, but adversarial/controller probes revealed four blockers before UI integration: protected-save writes, trace-loop work that escapes sample budgets, playback identity reuse after reset/import/recovery, and publication of invalid transitions through mutable snapshots. [The checkpoint review](PHASE_2_CHECKPOINT_REVIEW.md) records the evidence. Correction commit `059aee9` subsequently passed the [focused P0 review](PHASE_2_P0_REVIEW.md). All four original reproductions are fixed; remaining P1 work includes unsaved gameplay under read failure, stable subscription snapshots, one-time interrupted reconciliation and explicit Settings outcomes. No balance tuning or normal-flight physics change was made.

## Implemented checkpoint scope

- Phase 1 P0 corrections: shared altitude-anchor headroom and camera mapping, responsive redraw, analytic pad-support handling, integration and trace work budgets, non-advancing-time detection, and explicit `limit` diagnostics.
- Runtime configuration: `opening-v2` and `vertical-v1.1`, with the approved Ignition delay table and bounded work limits in `balance/opening.json`.
- Pure domain modules: `src/game/economy.ts`, `src/game/vehicle.ts`, `src/game/variance.ts` and `src/game/launch.ts`.
- Exact reward and cost helpers, four capped upgrade definitions, physical vehicle derivation, seeded engine-performance variance, the specified Mulberry32 vectors and immutable historical launch recipes.
- Reducer/store commands: reservation and seed acquisition at the command boundary, one-time new-launch settlement, strict record handling, purchases, replay using the historical recipe with zero reward/progression, interrupted reservations and stale-tab suspension.
- Save contract: `escape-velocity.save` with best-effort `escape-velocity.save.backup`, schema/balance validation, recipe/summary correlation checks, backup recovery, import/export, reset, interrupted reload reconciliation and storage-failure behavior.
- `scripts/balance-report.ts` imports production economy, variance and launch helpers. The generated report is a 729-build nominal/seeded envelope audit with endpoint convergence plus six explicitly named no-grant Phase 2 pacing strategies; dormant milestone configuration is not used for Credits.

## Focused checkpoint corrections

- Storage now distinguishes empty, valid, protected-invalid and unreadable primary/backup entries. Automatic mutations never overwrite protected or unreadable bytes; primary and backup reads are independent, explicit recovery/replacement remains available, and a valid primary survives a failed backup read.
- Trace scheduling counts every due boundary as bounded work, clamps untrusted requested budgets to trusted ceilings, detects non-advancing arithmetic, skips disabled-trace scheduling, handles null input defensively and emits at most one terminal `limit` event.
- Playback IDs are monotonic for the controller lifetime, are not restored from saves, and are rejected after reset/import/recovery or controller disposal. Reservation admission is checked before seed acquisition.
- Store state returned to presentation is a defensive snapshot. Save validation and revision-overflow checks complete before authoritative state publication; invalid transitions are rejected separately from valid transitions whose storage write fails.

## Integrated playable surface

The React screen now mounts one module-scoped `GameStore` and subscribes to stable state and persistence snapshots. Launch reservation generates one stored seed at the command boundary, freezes the current derived vehicle, and starts the existing ignition/ascent presentation. A valid terminal apogee settles the authoritative raw result once and displays the resulting Credits award. Cards for Engine, Fuel Tank, Airframe and Ignition use shared cost/cap selectors; physical levels feed vehicle derivation and Ignition changes only the presentation delay.

The secondary `Replay last flight — no reward` action reconstructs the latest historical recipe and cannot award Credits, change the record or consume a gameplay seed. Settings provides motion selection, save status, export, confirmed import/reset and valid-backup recovery. Storage failures leave the in-memory session usable while preserving protected bytes and clearly reporting that it is not saved. An interrupted reservation is reconciled once on reload and remains replayable without an award.

The UI deliberately does not expose estimated apogee, seeds, advanced aerospace telemetry, milestones, staging, orbit, payloads or any other later-phase systems.

## Verification and deployment

The checkpoint must pass:

```sh
npm run typecheck
npm test -- --run
npm run build
npm run balance:report
npm run test:e2e
npm run test:e2e:pages
```

The unit suite covers reward/cost/caps, physical derivation, seeded variance and published vectors, replay/new-launch settlement, bounded physics, altitude mapping, save round trips, corrupted/future/oversized data, backup recovery, interrupted reservations, storage failure, imports, stale-tab conflicts, stable snapshots, counter relations and pre-seed overflow guards. Browser tests cover paid launch → reward → physical purchase → improved launch → reload → unpaid replay, interrupted reload, Settings access, root development and repository-subpath production builds.

The merged `main` commit is `5a69810` (PR [#6](https://github.com/nhughes1228-spec/Escape-Velocity/pull/6)). GitHub Actions Pages run [34002298235](https://github.com/nhughes1228-spec/Escape-Velocity/actions/runs/34002298235) completed successfully, including typecheck, unit tests, the repository-subpath browser suite and artifact deployment. The live URL is [https://nhughes1228-spec.github.io/Escape-Velocity/](https://nhughes1228-spec.github.io/Escape-Velocity/). A real browser opened that URL and verified the initial screen, ignition countdown/progress, and a completed 160 m launch awarding 19 Credits.

## Deliberate exclusions

No staging, orbit, payloads, missions, prestige, research tree, secondary currency, failures, engine families, auto-launch, offline income, fast-forward or variance-reduction technology is included. Phase 3 has not begun. The live build remains a bounded Phase 2 opening sandbox pending human pacing review.
