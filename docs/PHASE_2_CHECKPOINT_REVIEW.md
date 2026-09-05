# Phase 2 domain/save checkpoint review

Reviewed **`1c9156c`** on 2026-09-05 against [PHASE_2_SPEC.md](PHASE_2_SPEC.md). The specification is unchanged from `a9c1397` and remains authoritative. This review specifies corrections, not new game rules or balance tuning.

## A. Checkpoint verdict

**CONDITIONAL PASS — fix the four narrow blockers in B before broad UI integration.**

The physical derivation, economy, seeded flight mathematics and ordinary reducer transitions are sound for the opening envelope. The persistence/controller boundary and adversarial trace collection are not yet safe enough to expose through Settings and playback callbacks. No broad redesign, orbital infrastructure or Astra runtime implementation is required. Luna owns the corrections; return the correction commit and regression evidence for a focused gate review before proceeding to the UI.

Repository inspection: clean `codex/phase-2-domain-save` at `1c9156c`; fetched `origin`; `main` and `origin/main` at `87cbc30`. At inspection the checkpoint branch had no remote counterpart. Review artifacts are on `codex/phase-2-checkpoint-review`, descended from the checkpoint. Public Pages remains Phase 1; this is not approval of a live Phase 2 release.

Independent verification:

| Check | Result |
| --- | --- |
| `npm ci` | Pass; 0 reported vulnerabilities |
| `npm run typecheck` | Pass |
| `npm test -- --run` | Pass; 8 files, 38 tests |
| `npm run build` | Pass |
| `npm run test:e2e` | Pass; 3 Chromium tests |
| `npm run test:e2e:pages` | Pass; 2 subpath/recovery tests |
| `npm run balance:report` | Pass; committed production report reproduced without changes |
| Independent nominal/endpoint dt-halving | Pass; 2,187 comparisons, no non-apogee outcomes |
| Targeted failure-path probes | Reproduced B and C findings below |

Browser tests exercise the existing Phase 1 surface, not the pending Credits/Settings UI. Their success does not cover the domain-store failure sequences below. No new human playtest or live Phase 2 verification is claimed.

Reproduce the additional evidence from the repository root:

```sh
node --import tsx docs/reviews/phase-2-checkpoint-probe.mts
```

The [probe](reviews/phase-2-checkpoint-probe.mts) uses isolated in-memory storage. Its two adversarial trace cases run in child processes with a two-second kill timeout. It reports observed defects, not a passing acceptance suite. [Captured results](reviews/phase-2-checkpoint-evidence.json) belong to `1c9156c`; convert the cases to permanent regression tests when fixing them. Never run the tiny-interval cases directly on the browser main thread.

## B. P0 — must fix before UI integration

P0 in this review means a **checkpoint blocker**, following the requested output format. Deferral cost is high for all four: UI work would otherwise bake in unsafe state assumptions. These are narrow corrections, not evidence that ordinary opening launches are inaccurate.

### B1. Recovery and unknown-storage state allow destructive autosaves

**Evidence:** `src/game/store.ts:118–176`, `src/persistence/storage.ts:55–73`. Load a primary with the correct game ID and unsupported schema 999. The store reports `recovery` and protects its raw text. Dispatch `setMotion('reduced')`: it writes a fresh save over that primary, clears the protected raw text and reports `saved`. No valid backup is created from the unsupported primary. Export can no longer recover it. A read-denied/write-allowed storage adapter similarly overwrites existing 19-Credit progress with fresh 0-Credit state after a settings change. `checkConflict` catches a failed read and returns true. `inspectStorage` reads both keys in one try, so a backup-read exception also discards information already read from the primary.

**Why it matters:** this directly contradicts spec H's requirement to preserve corrupt/future data. Settings, purchase or launch commands must not implicitly authorize replacement. A read failure is not evidence that the primary is absent.

**Correction:** represent known-empty, known-valid, protected-invalid and unknown/unreadable storage distinctly. Read primary and backup independently. Block automatic writes in protected/unknown states; optionally continue a clearly unsaved temporary session as the spec permits. Preserve available raw recovery data separately from current in-memory progress. Only explicit confirmed import/reset or chosen backup recovery may replace protected data. A failed conflict read must never authorize a subsequent write. If storage becomes readable later, re-inspect/compare before saving. Treat a lone valid backup as recovery data and preserve it until a decision. Keep the current ordinary write-failure behavior for valid in-memory progress.

**Required tests:** unsupported schema and balance version, malformed/oversized primary, both corrupt, valid backup, missing primary with backup, independent primary/backup read exceptions, read failure followed by restored access; ordinary launch/purchase/settings cannot alter protected bytes. Explicit replacement and export still work. **Owner: Luna.**

### B2. Trace sample limits do not bound trace work

**Evidence:** `src/simulation/vertical.ts:148–193`. With the starter (and separately thrust 70 N), use `maxTimeS=.1`, `maxIntegrationSteps=2`, `maxTraceSamples=2`, `traceIntervalS=1e-300`, `collectTrace=true`. Both flight and pad cases exceed the probe's two-second timeout. The `.1` interval control completes normally. Deduplicated samples return success without consuming a budget; `sampleStep` repeatedly adds the same state, and pad samples within `EPSILON` also deduplicate. `advanceSchedulePast` says it counts skipped boundaries, but only checks retained array length. Its loop increments no work counter. At sufficiently large time/interval ratios, adding the interval can stop advancing the float entirely.

**Why it matters:** the solver can hang despite budgets of two steps and two samples. Approved save validation currently prevents importing this interval into a recognized recipe, which limits exposure; the advertised bounded solver contract is nevertheless false. Simply testing the retained trace length cannot prove bounded execution.

**Correction:** independently bound every trace/scheduling iteration, including skipped and deduplicated work; use arithmetic schedule advancement where possible; detect non-finite/non-advancing schedule updates. Enforce trusted upper work ceilings rather than accepting caller budgets up to `MAX_SAFE_INTEGER`. Keep the approved production budgets centralized and permit smaller test budgets. Return one diagnostic terminal outcome without exceeding the retained-sample cap. Do not change nominal integration equations or normal sampling output to solve this.

Also fix the related terminal-path defects in the same correction: `invalidResult` guards the vehicle but then dereferences `vehicle.fuelMassKg` at line 251, so a null input throws; trace exhaustion can append two `limit` events (`resultFor`, lines 214–216). With `traceIntervalS=100,maxTraceSamples=1`, the result contains two limit events at burnout. Ensure one coherent terminal event and terminal trace representation within the cap.

**Required tests:** small/default intervals; subnormal/tiny intervals; trace on/off; pad and flight; huge requested budgets; null/malformed inputs; max-time before liftoff; termination while the trace is full. Pathological tests need an external timeout until the fix is proven. Repeat the 729-build × three-condition convergence check; preserve approved fixtures. **Owner: Luna; Astra reviews the bounded-loop change.**

### B3. Reset/import/recovery reuse playback identity

**Evidence:** `src/game/store.ts:179–212`, `src/persistence/save.ts:294`, reducer playback guards. Reserve `(runId=1,playbackId=1)`, interrupt it, confirm reset, reserve again. The new flight is also `(1,1)`. Deliver the old settlement callback: it is accepted and awards 19 Credits during the new ignition. Import and backup reconstruction also initialize `nextPlaybackId` from a fresh state.

**Why it matters:** the ordinary guards reject duplicates within one progress lifetime, but an old callback can complete a different flight after a progress replacement. A saved run ID is not a session-wide animation identity. Reload normally destroys old JavaScript callbacks; reset/import in the same page does not.

**Correction:** retain a monotonic volatile playback identity across reset/import/recovery, or pair it with a controller generation that changes on replacement. Include the identity/generation in every phase/completion callback. Never restore it from imported progress or rewind it to 1 within the controller lifetime. Invalidate pending callbacks when disposing/replacing the controller; `dispose()` currently only removes listeners and still permits dispatch/write calls. Do not add gameplay RNG draws for IDs.

**Required tests:** stale phase/new-flight settlement/replay completion after interruption plus reset/import/backup recovery; old disposed-controller callbacks cannot write. Legitimate new playback still settles once. **Owner: Luna.**

### B4. Invalid transitions are published as ordinary storage failures; authoritative state is mutable

**Evidence:** `src/game/store.ts:118–126,168–176,223`; mutable `GameState`/`LaunchRecipe` interfaces. `saveForState` validation failure still assigns `state=nextState`, and dispatch returns true. The public `getState()` exposes the live nested result and recipe. In the probe, assigning `activeLaunch.result.maximumAltitudeM=100000` then settling publishes **383 Credits and a 100000 m record**, despite save validation detecting the recipe mismatch. This models accidental UI mutation, not a claim of a multiplayer cheating vulnerability. A valid imported revision of `MAX_SAFE_INTEGER` independently reproduces the invalid-transition path: the next setting command is accepted and changes state although its revision cannot be serialized safely.

**Why it matters:** presentation can corrupt reward authority, and the final invariant check only changes a save-status label. The spec requires immutable historical inputs and rejection before integer overflow.

**Correction:** distinguish invalid domain/envelope transitions from storage I/O failure. Validate and check revision arithmetic before publishing; invalid transitions leave the last valid state/revision intact and return a rejected command result. A valid transition whose primary write fails may remain playable/unsaved, as specified. Expose deep-readonly snapshots and protect nested recipes/results from external mutation through freezing or defensive copies at the controller boundary. Preserve stable snapshots for subscriptions; do not clone or recompute physics per frame. Handle exceptional seed/counter/validation failures as rejected commands rather than uncaught React event errors.

**Required tests:** attempted nested snapshot/recipe/result mutation cannot affect settlement or replay; invalid envelope transition changes no authoritative state; revision overflow rejects without wrapping; Credits/run-counter overflow rejects; valid storage-quota failure still retains exactly one in-memory award and an exportable valid save. **Owner: Luna.**

## C. P1 — fix during UI integration

### C1. Generate a seed only after launch admission

**Evidence:** `src/game/store.ts:161–168` acquires the seed before the reducer checks whether the game is busy. Two consecutive reservations consume two seed-source calls while only one launch starts. Replay itself correctly consumes none.

**Correction:** share a pure reservation eligibility check with the reducer; reject busy/unsafe commands before seed acquisition. An admitted launch gets exactly one seed. UI disabling/debouncing alone is insufficient. Test repeated commands, rerenders, StrictMode, conflict rejection and a failing injected seed source. **Owner: Luna; deferral cost medium.**

### C2. Finish the controller-facing API before wiring React

**Evidence:** `GameAction` has guarded `presentationPhase`; `GameCommand` does not. The current Phase 1 `src/ui/App.tsx` still owns `useReducer` and calls seed acquisition from its click handler, intentionally bypassing the unintegrated store. There is no shared `canPurchase`/reservation eligibility selector, although cost and vehicle helpers exist.

**Correction:** add the guarded transient phase command and pure eligibility/purchase-view selectors (level, next price, capped/affordable/busy status and reason) used by both domain commands and UI. Use a single authoritative controller for Credits, launches, purchases, settings and persistence. Subscribe React to stable state **and persistence** snapshots so a status-only conflict/error update renders. Create/initialize it at a deliberate lifecycle boundary outside render side effects; constructor reconciliation writes must not be duplicated by StrictMode. No second UI reducer for progression, quoted-price purchase action, component reward calculation or component RNG. **Owner: Luna; deferral cost high.**

### C3. A rejected import replaces the export source

**Evidence:** `src/game/store.ts:191–207`. From valid 19-Credit progress, `importSave('{bad-import',true)` returns false and leaves the primary intact, but the next export returns the bad import text instead of the valid current progress. The rejected candidate is stored as `protectedPrimaryRaw` even though it was never the loaded primary.

**Correction:** keep import-validation errors separate from primary recovery state. Failed import leaves current progress, save status and default export source intact; show the candidate's error separately. If retaining rejected input for troubleshooting, give it an explicit separate export action. Test invalid imports from valid, unsaved and recovery sessions. **Owner: Luna; deferral cost medium.**

### C4. Reject internally impossible settlement counters

**Evidence:** `src/persistence/save.ts:215–245`. Settle run 1, reserve run 2, export, change `launchesCompleted` from 1 to 2. Validation accepts a save whose newest run is still `started`, with `lastSettledRunId=1`, but two launches already completed.

**Correction:** add necessary counter relations: completed count cannot exceed the last settled run ID; when the latest run is unsettled, completed must be less than started; zero completions cannot carry a positive record. Preserve intentional interrupted gaps and the spec's count of newly settled terminal outcomes. Do not invent a full launch ledger or anti-cheat balance reconstruction. Test inconsistent combinations and legitimate interruption histories. **Owner: Luna; deferral cost medium.**

### C5. Restore explicit balance-policy coverage and assertions

**Evidence:** `scripts/balance-report.ts:32–90`. The production report uses four policies × 32 seeds; the approved design experiment used six × 32. New `engine_first`/`ignition_first` policies buy other affordable choices when the preferred one is unaffordable, so their labels no longer reproduce the older hoarding stress strategy. The report does not record fifth-launch, 500 m and 1 km pacing, and its dt-halving sweep covers nominal conditions only. The `dtS` argument to `seededFlight` is unused. Independent endpoint convergence passes in this review.

**Correction:** explicitly name policy semantics, restore the deliberate hoarding/throughput stress comparisons from the approved experiment or document their exclusion, and report fifth-launch altitude, 500 m, 1 km, max no-purchase gap and final-purchase time. Enforce endpoint as well as nominal convergence and remove/fix the unused dt argument. Keep milestone grants disabled. These are reporting/test corrections, not a reason to retune the approved values. **Owner: Luna; deferral cost low for domain, medium for interpreting playtests.**

## D. P2 — defer

| Item and evidence | Correction / deadline | Ownership and deferral cost |
| --- | --- | --- |
| Unsupported historical solver version currently rejects the entire save through `validateLaunchRecipe`, rather than preserving progress/summary and disabling replay | Before the first version change, implement the spec's explicit migration/historical-replay policy and fixtures. Do not silently apply changed physics to old recipes. No historical Phase 2 version currently requires an invented migration. B1 protects unknown data meanwhile. | Luna implementation, Astra reviews migration; low now, high at version change |
| The exported single-step helper and production loop duplicate midpoint integration arithmetic | Make production use the tested shared kernel when next changing integration; maintain event splitting and exact fixtures. Full-solver convergence currently passes, so this is not a UI blocker. | Luna; medium if equations diverge |
| Save validation can rerun historical physics several times per durable mutation | Profile complete UI sessions before adding caching/workers. Avoid revalidation per frame, but do not weaken imported-summary checks to gain speculative speed. | Luna; low in the capped opening |
| Raw comparison plus storage events cannot provide cross-tab compare-and-swap | Keep simultaneous multi-tab play unsupported and show conflict/reload clearly. Do not add locks/cloud/merge infrastructure now. B1 fixes failed-read handling, not the explicitly excluded simultaneous-write race. | Astra only if scope changes; low under current promise |

## E. Determinism verdict

**The RNG and physics algorithm pass. Full immutable-controller/replay lifecycle compliance is conditional on B3/B4 and C1.**

Mulberry32 matches the specified uint32 arithmetic, validates seeds before coercion and consumes exactly its first two draws for `k=1+.006*(u1+u2-1)`. Golden factors match exactly: seed 0 → `.9956005537263117`; 1 → `.9977788579706103`; 42 → `1.0002963658655062`; 4294967295 → `1.000515405225102`. The seed source uses `crypto.getRandomValues`; no date or `Math.random` fallback exists in the gameplay contract.

Only thrust and exhaust velocity receive the same fixed per-flight factor. Nominal mass flow is preserved within floating-point tolerance. Fuel, dry mass, drag, environment, ignition and integration parameters remain deterministic. IDs are not simulation inputs. Recipe fields are copied explicitly, not interpreted by object iteration order; current upgrade purchases do not alter the historical copies. Replay derives from the historical seed/recipe and consumes no new entropy. Verification may recompute the same two deterministic draws from the stored seed; that is not a fresh gameplay seed acquisition.

For unmodified, supported recipes and matching versions, repeated simulation gives the same result/events/trace. No clock/render state enters physics. Cross-runtime comparisons retain the spec's numerical tolerances; arbitrary future floating-point/platform changes are not promised bitwise equivalence. Version identifiers match `opening-v2`, `vertical-v1.1`, `engine-variation-v1`, `mulberry32-v1`. Historical validation intentionally checks the approved version/config, so future changes must follow D's migration rule rather than editing values under an existing version.

## F. Settlement verdict

**Ordinary exact-once settlement passes; exposure through the full controller lifecycle is not yet approved.**

The reducer uses the current paid launch and guarded IDs, calculates `4+floor(1.2*sqrt(raw apogee meters))` for apogee only, sets the strict personal best, increments completion, records summary and clears active state in one transition. Prices use the approved integer ceiling; purchase deduction and level increment are one transition. Lower-performing new launches pay normally; replay does not award, update record or increment gameplay counts. Duplicate completion without a progress replacement is a no-op. Loaded `started` recipes become interrupted with no award and no active paid launch; loaded settled recipes cannot settle again.

One serialized primary `setItem` is the durable boundary. Backup is best-effort. If a valid write fails, an in-memory award is intentionally not guaranteed to survive reload; the UI must show unsaved progress and offer export. This is different from duplicate settlement and must not be advertised as durable success. B1/B3/B4 address the destructive/invalid lifecycle paths; C4 closes a save-history inconsistency.

The independent stale-tab sequence passes: A holds a pending launch, B advances progress and buys Engine, A attempts settlement; A returns false, reports conflict and preserves B's bytes and Engine level. No claim of atomic simultaneous-tab gameplay follows from this.

## G. Save/recovery verdict

**Not safe to expose Settings until B1/B3/B4 are fixed; remaining C3/C4 fixes belong in the Settings integration pass.**

The schema/key design is appropriate: primary `escape-velocity.save`, backup `escape-velocity.save.backup`, game ID, schema 1, balance version, safe revision/counters/Credits, bounded levels, raw best altitude, settings and latest historical recipe/summary. Current rocket stats remain derived. No traces, animation time, speculative currencies or unlimited history are persisted.

Existing validation correctly handles the main numeric/shape/enum/cap/seed/version constraints, rejects non-finite values and negative/unsafe integers, caps input bytes, checks recognized recipe correlations and reproduces summaries/rewards. Existing tests pass ordinary roundtrip, backup recovery, interrupted reload, quota failure and valid import/reset cases. The presence of tests for corrupt input does not cover subsequent autosaves over that input: B1 reproduces that missing sequence. Failed-import export routing and impossible counters also require the listed corrections.

After corrections, release tests must combine failures with later operations: load → reject/recover → change setting/launch → export → reload. Verify a later successful write contains the full latest valid in-memory state, never replays failed awards. Confirmed imports replace progress rather than adding Credits; imported started recipes remain interrupted. Keep reset/import disabled during active paid/replay playback and require the in-game confirmation/export opportunity already specified.

## H. Balance verdict

**Reported physics/economy results confirmed. No balance change recommended.**

| Measurement | Independent/reproduced result |
| --- | --- |
| Physical configurations | 729; caps Engine/Fuel/Airframe 0–8, Ignition 0–4 |
| Negative same-condition upgrade edges | 0 at `.994`, `1`, `1.006` |
| Worst relative variance | −2.866824% to +2.870800% |
| Minimum initial TWR over endpoints | 1.101737; all audited builds lift off |
| Starter nominal apogee | 160.170311 m |
| Starter forced endpoints | 157.283095–163.070630 m |
| Starter seeds 0–4095 | Mean 160.171209 m; p05 158.209452 m; p95 162.107701 m |
| Starter reward, including endpoints | 19 Credits |
| First Engine / Fuel / Airframe purchase | 14 / 16 / 12 Credits; nominal 193.329105 / 203.635326 / 192.650897 m |
| First Ignition purchase | 8 Credits; 1.5 → 1.0 s; altitude unchanged |
| Endpoint-inclusive dt-halving maximum error | 0.0000587429 m altitude, 0.00000144185 s time |
| Current four-policy median final purchase | 18.83–19.10 minutes |
| Current 128 modeled campaigns, full range | Approximately 18.76–19.18 minutes |

Stat and cost curves match spec F, including tank structural mass, Engine thrust/exhaust/mass changes, Airframe mass/drag reductions and Ignition `[1.5,1,.6,.3,.1]`. No duplicated alternative formula was found in the Phase 2 domain; physical upgrades reach the solver through vehicle derivation. Seeded nominal-flow correlation and long-burn/max-mass/min-mass combinations stay within the tested envelope.

The reported 18.8–19.1 minutes is a reasonable rounded description of current strategy medians, not the extrema of every route. C5 explains why it should not be presented as a direct replication of all 192 original experiment campaigns. The four-policy report finds short no-purchase gaps, but does not establish that hoarding or globally optimal play behaves the same. First physical upgrades improve altitude about 20–27%, clearly beyond starter noise. The previously accepted ~0.19% worst late tank edge can overlap RNG; do not promise every post-upgrade flight beats a lucky previous flight. A small Ignition improvement is an operational benefit by design, not a missing altitude gain.

## I. UI integration instructions for Luna

First submit a narrow B1–B4 correction commit with regression tests and updated checkpoint notes for focused approval. C1/C2 should be resolved when preparing the controller seam, before wiring launch/buy buttons. Then implement spec J5 without changing the approved economy.

1. Mount one controller and subscribe to stable authoritative state/persistence snapshots. Wire guarded commands, derived vehicle and eligibility selectors. Keep animation time transient. Cancel obsolete callbacks on unmount/replacement and still reject them at the controller boundary.
2. Show Credits, raw-record display rounding, Launch/Launch again, immediate ignition feedback, current flight altitude, accurate rocket/ruler/record anchor and the settled result. Reveal the actual reward from the settled summary, not a duplicate UI formula or the precomputed result before playback finishes. New launches use current levels; historical replay uses its original silhouette/ignition/trace.
3. Add Engine, Fuel Tank, Airframe and Ignition cards: level, price/cap, affordable/busy status and concise consequence/tradeoff text. Use spec F's values, read through shared helpers. Fuel explains longer burn plus heavier tank/fuel; Engine stronger lift plus added mass; Airframe lighter/sleeker; Ignition shorter delay. No estimated apogee, exhaust velocity, fuel flow, TWR, drag coefficients or seed controls. Make silhouette changes visible without moving the altitude reference point.
4. Add secondary **Replay last flight — no reward**, with stop replay. Replay cannot call the paid settlement action. Purchases stay disabled during paid/replay playback. After returning from replay, distinguish the historical earned summary from a new reward announcement; do not visually add Credits again.
5. Add Settings with persisted motion preference, current save status, valid-progress export, protected-data export/recovery, confirmed import and reset. Apply C3/C4. Conflicts offer reload and suspend writes; failures remain visible. Invalid import is a form error, not a replacement save. Hide advanced mechanics and future menus.
6. Retain immediate result/purchase/new-launch actions, no added countdown after apogee, no refuel cost or wait. Keep the finite-demo completion message and continued optional launches; no unreachable 5/10 km objective. Accessibility is available immediately: keyboard, focus, readable small-screen controls, motion choice and restrained phase/result/purchase announcements.
7. Extend browser coverage to real controller-backed launch → award → buy → changed rocket → reload → unpaid replay; interrupted refresh; Settings error/recovery; repeated/stale callbacks; StrictMode initialization; desktop and 390×844; root and repository-subpath production builds. Recheck rocket anchor against ruler at several heights and after resize, rather than relying solely on the visual impression of upward movement.

## J. Human playtest checklist

Run two fresh-save 15–25 minute sessions with different purchase preferences. Record observations, not only pass/fail.

- Does the first apogee/reward make you want another launch, and can you explain the payment?
- Is the first purchase an interesting choice? Is each card's benefit/tradeoff understandable without aerospace terminology?
- Can you see and feel the physical improvement over the next several launches? Does the record/ruler agree with the rocket?
- Does Ignition feel worth buying, especially after several repetitions?
- Does variation feel natural rather than unfair or too subtle? Note lucky-before/unlucky-after purchases.
- Does round duration sustain “one more launch”? Note waits, indecision and longest runs without a purchase.
- Does the layout remain readable and uncluttered on the device used? Are paid launch and unpaid replay unmistakable?
- Does the finite opening remain satisfying through 15–25 minutes, including late purchases and the completion message?

## K. Next Astra checkpoints

**Immediate gate:** return B1–B4 correction SHA, changed files, permanent regression tests for each reproduction, all standard check results and the regenerated unchanged-balance envelope. A focused review should confirm the conditional pass has cleared before broad UI integration; no repeat architecture design exercise is needed.

**After UI and two human sessions:** return the implementation SHA, deployed Pages SHA/URL and CI results; production browser evidence for launch → reward → buy → improved flight → reload → unpaid replay; console/network errors or explicit clean results; final balance report with clearly named strategies. Supply two short session logs with device/browser/motion setting, purchase order, first-purchase timing, launch-five altitude, time/launch to 500 m and 1 km, longest no-purchase gap, late-round duration, completion time or stopping point, and subjective checklist answers. For surprising outcomes include exported launch seed/recipe, levels and actual reward; do not require invasive analytics or a telemetry system.

Astra then reviews actual controller/UI integration, transaction regressions, replay/visual correctness and measured pacing. Change balance only if implementation or both sessions provide concrete contrary evidence. Until then, the approved Phase 2 scope and formulas stand.
