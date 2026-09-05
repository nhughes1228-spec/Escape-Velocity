# Phase 2 implementation checkpoint

Status: domain, settlement and save foundation implemented on the Phase 2 branch; broad upgrade UI integration is intentionally paused for Astra review. This document records what is actually in the repository, while [PHASE_2_SPEC.md](PHASE_2_SPEC.md) remains the authoritative design specification.

**Astra review of `1c9156c`: CONDITIONAL PASS.** Independent standard checks pass, but adversarial/controller probes reveal four blockers before UI integration: protected-save writes, trace-loop work that escapes sample budgets, playback identity reuse after reset/import/recovery, and publication of invalid transitions through mutable snapshots. [The checkpoint review](PHASE_2_CHECKPOINT_REVIEW.md) records evidence, precise corrections and the next gate. The implementation inventory below describes the checkpoint's intended facilities; it does not certify those failure paths as complete. No runtime or balance changes were made by this review.

## Implemented checkpoint scope

- Phase 1 P0 corrections: shared altitude-anchor headroom and camera mapping, responsive redraw, analytic pad-support handling, integration and trace work budgets, non-advancing-time detection, and explicit `limit` diagnostics.
- Runtime configuration: `opening-v2` and `vertical-v1.1`, with the approved Ignition delay table and bounded work limits in `balance/opening.json`.
- Pure domain modules: `src/game/economy.ts`, `src/game/vehicle.ts`, `src/game/variance.ts` and `src/game/launch.ts`.
- Exact reward and cost helpers, four capped upgrade definitions, physical vehicle derivation, seeded engine-performance variance, the specified Mulberry32 vectors and immutable historical launch recipes.
- Reducer/store commands: reservation and seed acquisition at the command boundary, one-time new-launch settlement, strict record handling, purchases, replay using the historical recipe with zero reward/progression, interrupted reservations and stale-tab suspension.
- Save contract: `escape-velocity.save` with best-effort `escape-velocity.save.backup`, schema/balance validation, recipe/summary correlation checks, backup recovery, import/export, reset, interrupted reload reconciliation and storage-failure behavior.
- `scripts/balance-report.ts` now imports production economy, variance and launch helpers. The generated report is a 729-build nominal/seeded envelope audit plus no-grant Phase 2 pacing data; dormant milestone configuration is not used for Credits.

The existing React screen remains the accepted Phase 1 surface during this checkpoint. It has not yet been wired to display Credits, upgrade cards, Settings import/export or the secondary replay control. That is deliberate: Astra review occurs after this foundation and before the broad UI work prescribed by Phase 2 specification step J5.

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
