# Phase 2 implementation checkpoint

Status: correction commit `059aee9` passed the focused Astra P0 gate. Controller/UI integration may proceed with the P1 corrections in the [focused review](PHASE_2_P0_REVIEW.md); Phase 2 remains unshipped. This document records what is actually in the repository, while [PHASE_2_SPEC.md](PHASE_2_SPEC.md) remains the authoritative design specification.

**Astra review of `1c9156c`: CONDITIONAL PASS.** Independent standard checks pass, but adversarial/controller probes revealed four blockers before UI integration: protected-save writes, trace-loop work that escapes sample budgets, playback identity reuse after reset/import/recovery, and publication of invalid transitions through mutable snapshots. [The checkpoint review](PHASE_2_CHECKPOINT_REVIEW.md) records the evidence. Correction commit `059aee9` subsequently passed the [focused P0 review](PHASE_2_P0_REVIEW.md). All four original reproductions are fixed; remaining P1 work includes unsaved gameplay under read failure, stable subscription snapshots, one-time interrupted reconciliation and explicit Settings outcomes. No balance tuning or normal-flight physics change was made.

## Implemented checkpoint scope

- Phase 1 P0 corrections: shared altitude-anchor headroom and camera mapping, responsive redraw, analytic pad-support handling, integration and trace work budgets, non-advancing-time detection, and explicit `limit` diagnostics.
- Runtime configuration: `opening-v2` and `vertical-v1.1`, with the approved Ignition delay table and bounded work limits in `balance/opening.json`.
- Pure domain modules: `src/game/economy.ts`, `src/game/vehicle.ts`, `src/game/variance.ts` and `src/game/launch.ts`.
- Exact reward and cost helpers, four capped upgrade definitions, physical vehicle derivation, seeded engine-performance variance, the specified Mulberry32 vectors and immutable historical launch recipes.
- Reducer/store commands: reservation and seed acquisition at the command boundary, one-time new-launch settlement, strict record handling, purchases, replay using the historical recipe with zero reward/progression, interrupted reservations and stale-tab suspension.
- Save contract: `escape-velocity.save` with best-effort `escape-velocity.save.backup`, schema/balance validation, recipe/summary correlation checks, backup recovery, import/export, reset, interrupted reload reconciliation and storage-failure behavior.
- `scripts/balance-report.ts` now imports production economy, variance and launch helpers. The generated report is a 729-build nominal/seeded envelope audit plus no-grant Phase 2 pacing data; dormant milestone configuration is not used for Credits.

## Focused checkpoint corrections

- Storage now distinguishes empty, valid, protected-invalid and unreadable primary/backup entries. Automatic mutations never overwrite protected or unreadable bytes; primary and backup reads are independent, explicit recovery/replacement remains available, and a valid primary survives a failed backup read.
- Trace scheduling counts every due boundary as bounded work, clamps untrusted requested budgets to trusted ceilings, detects non-advancing arithmetic, skips disabled-trace scheduling, handles null input defensively and emits at most one terminal `limit` event.
- Playback IDs are monotonic for the controller lifetime, are not restored from saves, and are rejected after reset/import/recovery or controller disposal. Reservation admission is checked before seed acquisition.
- Store state returned to presentation is a defensive snapshot. Save validation and revision-overflow checks complete before authoritative state publication; invalid transitions are rejected separately from valid transitions whose storage write fails.

The existing React screen remains the accepted Phase 1 surface during this checkpoint. It has not yet been wired to display Credits, upgrade cards, Settings import/export or the secondary replay control. The focused P0 gate is now cleared; the next implementation work is the controller refinements followed by the broad UI work prescribed by Phase 2 specification step J5. The current UI still bypasses the persistent store until that integration.

## Verification at checkpoint

The checkpoint must pass:

```sh
npm run typecheck
npm test -- --run
npm run build
npm run balance:report
npm run test:e2e
npm run test:e2e:pages
```

The unit suite covers reward/cost/caps, physical derivation, seeded variance and published vectors, replay/new-launch settlement, bounded physics, altitude mapping, save round trips, corrupted/future/oversized data, backup recovery, interrupted reservations, storage failure, imports and stale-tab conflicts. Browser tests remain Phase 1 regressions until the post-review Phase 2 UI pass.

## Deliberate exclusions

No staging, orbit, payloads, missions, prestige, research tree, secondary currency, failures, engine families, auto-launch, offline income, fast-forward or variance-reduction technology is included. No Phase 2 live deployment is claimed from this checkpoint; the public Pages URL still serves accepted Phase 1 `main` until UI integration and its release verification are complete.
