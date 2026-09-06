# Implementation progress

Original prompt: Finish the Phase 1 GitHub Pages publishing workflow after the repository becomes public; do not begin Phase 2.

## 2026-09-05

- Re-audited the current checkout and confirmed the Phase 1 branch is clean and contains `6aa0a1e`, `97927fe`, `f0be657`, and the public-repository documentation update `699cc7d`.
- Confirmed the repository is now public, but the first push was rejected because the GitHub OAuth credential lacks the `workflow` scope needed to create/update `.github/workflows/ci.yml`.
- No workflow files were removed or bypassed. Resume by refreshing the credential with the `workflow` scope, then push the Phase 1 branch and verify the Pages deployment and live URL.
- Merged PR #1 into `main` as `43e90e8`; the first Pages run reached `Configure Pages` but failed because the site was not enabled. The follow-up adds `enablement: true` to `actions/configure-pages@v5` and is ready for the next PR.
- Merged PR #2 into `main` as `e56cff1`, configured Pages for GitHub Actions, reran workflow `33990000879` successfully, and verified the live URL in a browser through the first launch and 160 m result with no console errors. Phase 1 publishing is complete; Phase 2 remains unstarted.

## Phase 1 playtest correction

- Added immediate ignition feedback: stateful control copy, disabled in-progress button, countdown/progress bar, and reduced-motion-safe pad/engine activity while preserving the configured ignition duration.
- Centralized the canvas altitude mapping so the numerical telemetry, ruler, trace, current-altitude guide and rocket fin-tip anchor share one authoritative scale; added a mapping invariant test and ignition browser assertions.
- Recorded the Phase 2 economy loop and seeded ±2–3% physical-input variance requirements in the roadmap, design, architecture, balance and Phase 1 handoff documents. No economy, upgrades, variance, milestones or saves were implemented.

## Phase 2 checkpoint corrections

- Started from Astra review `0e71279` on `codex/phase-2-checkpoint-review`; did not begin React upgrade UI integration.
- Corrected protected/unknown save handling: primary and backup reads are independent, automatic mutations cannot overwrite protected or unreadable bytes, valid backups remain explicit recovery options, and failed primary reads never authorize writes.
- Corrected solver trace scheduling: due boundaries consume bounded work, requested budgets are clamped to trusted ceilings, tiny/non-advancing intervals terminate diagnostically, disabled traces skip scheduling, null input returns `invalid`, and terminal `limit` events are not duplicated.
- Corrected playback lifecycle: controller-scoped monotonic playback IDs survive reset/import/backup recovery, disposed stores reject callbacks, and reservation admission precedes seed acquisition.
- Added defensive state snapshots and pre-publication save/revision validation so external nested mutations and revision overflow cannot alter authoritative settlement state.
- Added focused regression coverage in `tests/save.test.ts` and `tests/physics.test.ts`. Current checkpoint verification: 47 unit tests pass, typecheck passes, root production build passes, balance report reproduces, local E2E passes (3), and Pages-subpath E2E passes (2). Browser smoke remains the Phase 1 UI by design.
- Next step: return the correction commit for Astra’s focused gate review; only after approval should broad Credits/upgrade/Settings UI integration begin.

## 2026-09-05 — Phase 2 controller/UI integration

- Re-audited Astra’s focused PASS at `9e0851c` and started `codex/phase-2-ui-integration` from the approved correction history; no Phase 3 systems were added.
- Kept valid in-memory play available when storage reads fail while preserving protected/unknown bytes and reporting the session as unsaved. Added stable defensive state/persistence snapshots for React subscriptions, one-time started-save reconciliation, explicit acceptance-versus-durability messaging, counter relations and pre-seed revision/playback overflow checks.
- Replaced the Phase 1 reducer-owned screen with the controller-backed Phase 2 surface: Credits and record, paid seeded launches, four shared-selector upgrade cards, visibly distinct physical silhouette levels, historical unpaid replay, motion settings, save export/import/recovery/reset and interrupted reload handling.
- Expanded the permanent balance report to six explicitly named strategies, fifth-launch/500 m/1 km/final-purchase pacing and nominal plus variance-endpoint timestep convergence. The approved physics/economy configuration remains unchanged.
- Added browser coverage for paid launch → reward → purchase → improved launch → reload → unpaid replay, interrupted reload and Settings; local root and Pages-subpath browser suites pass after sequential execution.

## Phase 2 deployment verification

- Merged PR #6 into `main` as `5a69810`; no Phase 3 systems were added.
- GitHub Actions Pages run `34002298235` completed successfully. Its build job passed typecheck, 55 unit tests, the production repository-subpath build and Pages browser checks before deploying the artifact.
- Opened `https://nhughes1228-spec.github.io/Escape-Velocity/` in a real browser after deployment. The live page rendered, Launch entered the visible ignition countdown, and the first launch settled at 160 m for 19 Credits.
- The Phase 2 opening is deployed and playable. Two extended human pacing sessions and Astra’s final release audit remain as release evidence; no balance or Phase 3 work is being started.

## 2026-09-06 — Phase 2 presentation/usability correction

- Implemented Astra’s focused playtest pass in `07c205d` on `codex/phase-2-playtest-revisions`; Phase 3 remains unopened and the approved `opening-v2` balance is unchanged.
- Replaced predicted-capability camera framing with a fixed 300 m world scale that follows only the displayed ascent. Ruler, telemetry, trace, record line, rocket anchor, launchpad and cloud landmarks share the same altitude transform.
- Added persistent launchpad/cloud scenery, distinct Engine bell, Fuel tank segmentation and Airframe fin/fairing artwork, and preserved historical result framing after purchases.
- Made Settings and New game visible in the header, added a confirmed reset dialog with export/cancel/reset choices, scrolled header Settings into view, added local purchase confirmations, and clarified Personal best / Flight time labels.
- Added camera/appearance regression coverage and expanded E2E coverage for purchase-preserved framing and visible reset discovery. Verification passed: 56 unit tests, typecheck, root build, balance report, 5 local browser tests and 2 Pages-subpath tests. Real local browser inspection confirmed ignition, camera translation, scenery and controls. PR #7 merged this work to `main` as `6ff4756`; Pages run `34037890122` passed, and the live URL was opened in a real browser. It showed the corrected header/canvas, entered the visible ignition sequence, settled a 162 m / 19-Credit launch and produced no browser console errors. Final Phase 2 acceptance remains with Astra; Ignition balance evaluation is deferred.

## 2026-09-06 — New game dialog accessibility correction

- Started from Astra’s conditional presentation pass `89c9ece` and kept this task limited to the identified modal blocker; no physics, economy, save contract, balance or Ignition changes were made.
- Added modal focus management in `src/ui/App.tsx`: opening focuses Cancel, Tab and Shift+Tab wrap within the dialog, Escape cancels, closing restores focus to the New game trigger, and the background is `inert`/`aria-hidden` with page scrolling locked while the dialog is open.
- Extended the browser regression to check initial focus, both focus-trap directions, Escape cancellation, focus restoration, background inertness and progress preservation. Typecheck, 56 unit tests and 5 local E2E tests pass; the required Pages-subpath check remains to be run after the final commit.
- Astra’s minor stars, offscreen-label and historical-heading follow-ups remain intentionally deferred. A short revised-presentation human check remains the next product step after this correction; the separate versioned Ignition candidate is not being started.
