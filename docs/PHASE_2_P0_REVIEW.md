# Focused Astra review — Phase 2 P0 corrections

Reviewed **`059aee9`**, 2026-09-05, against the four blockers in [the original checkpoint review](PHASE_2_CHECKPOINT_REVIEW.md) and the unchanged [Phase 2 specification](PHASE_2_SPEC.md).

## Verdict and scope

**PASS for the four-P0 correction gate — Luna may proceed to controller/UI integration.** This is not Phase 2 release approval. The remaining P1 work below must be completed during integration, with the controller fixes in its first step. Another architecture redesign or separate pre-UI Astra stop is not required unless the corrections uncover a new P0 or change the approved contract.

The original destructive-save, unbounded-work, stale-playback and invalid-authority reproductions no longer fail. Additional checks identified a storage-unavailability gameplay regression and integration details that need correction. Data protection must remain strict while fixing availability; do not restore the old unsafe writes to make launches work.

Inspection began on clean `codex/phase-2-p0-corrections` at `059aee9`, descended from review `0e71279`. Remote fetch succeeded; `origin/main` remains `87cbc30`. At inspection the corrections branch was local-only. This documentation review is recorded on a separate `codex/phase-2-p0-review` branch. No runtime, test-suite, balance or deployment changes were made by Astra.

## Original blocker disposition

| Original finding | Independently observed correction | Disposition |
| --- | --- | --- |
| B1 protected/unknown storage overwrite | Unsupported primary survives settings mutations unchanged and remains exportable. Denied primary reads do not write or erase the stored 19 Credits. Reads are independent; unknown/protected backup bytes are not overwritten automatically. | P0 closed; availability follow-up below |
| B2 trace work escapes sample limits | The original `1e-300` interval cases, both flight and pad with budgets of two, now terminate without timeout. Work is counted independently, due work is preflight-bounded, numeric forward progress is checked, and caller budgets are capped at trusted ceilings. Null vehicle returns `invalid`; terminal trace exhaustion emits one `limit` event. | P0 closed |
| B3 playback identity reuse/disposed callbacks | Reset reuses gameplay run 1 as intended but advances playback identity from 1 to 2; the old callback is rejected with zero Credits. Import/backup identity and disposal regression tests pass. Allocation lives outside restored progress. | P0 closed |
| B4 mutable authority/invalid publication | Mutating the returned nested result/recipe no longer changes authority: settlement remains 19 Credits and the seeded ~160.31 m record. Revision overflow rejects without changing state or stored revision. Validation and I/O failure paths are distinct. | P0 closed; cache public snapshots for React below |

The busy-command part of C1 also passes: two reservations acquire one seed and start one launch. C3 is fixed: rejected import no longer substitutes the candidate for current-progress export. The missing guarded `presentationPhase` store command from C2 has been added. Do not continue reporting those specific defects as open.

## P1 work during controller/UI integration

All items below are **Luna-owned**. They do not require economy changes or new systems.

### 1. Storage read failure currently prevents unsaved gameplay

Evidence: `src/game/store.ts:315–339,354`. With an adapter whose reads throw, `reserveNewLaunch` returns false, starts zero launches and writes nothing. If reads begin failing after reservation and the transition to `playing`, settlement returns false; the paid launch remains active with zero Credits. The no-write protection is correct, but the spec explicitly requires a playable unsaved session when storage is unavailable. The temporary-session branch in `persist` is unreachable through durable commands while reads keep failing.

**Correction:** separate permission to mutate valid in-memory state from permission to write storage. A known stale-tab conflict must continue suspending commands. A read failure must disable writes and preserve unknown/protected data while allowing the current session's valid launch/settlement/purchase transitions and export. An initially unreadable store can use a clearly unsaved temporary session. When access returns, compare/reconcile the observed primary before enabling writes; discovering other progress requires reload or explicit replacement, never implicit overwrite.

**Tests:** startup unavailable → launch → settlement → purchase → valid export, all with zero writes; read failure at apogee → one in-memory award and active state cleared; repeated callback pays nothing; restored unchanged storage writes the complete latest state once; restored different storage remains protected/conflicted. Deferral cost **high** if error handling is wired around permanently disabling Launch.

### 2. Defensive snapshots need a stable React subscription boundary

Evidence: `src/game/store.ts:446–448`; both `Object.is(store.getState(),store.getState())` and the persistence equivalent are false without a transition. Every call copies nested traces. This fixes external mutation, but directly using these getters as `useSyncExternalStore` snapshots violates React's caching requirement and risks an update loop. The installed React implementation explicitly diagnoses uncached snapshots. This is a readiness issue, not a claim that the currently unintegrated Phase 1 screen already loops.

**Correction:** supply a stable, immutable cached snapshot per actual store notification, including persistence-only changes. Cache either in the store or a single React adapter. Keep authority protected; merely returning the mutable internal graph or caching a publicly mutable object is not sufficient. Do not recreate/copy full traces each frame or recreate the controller in render. Add shared `canPurchase`/card selectors before wiring buttons.

**Tests:** repeated snapshot reads are referentially equal until an update; nested mutation cannot alter authority or future reads; persistence-only conflict/error changes render; StrictMode does not duplicate initialization/seed acquisition, restart playback or loop. Deferral cost **high** once playback effects depend on unstable objects.

### 3. Already-interrupted saves are rewritten on every load

Evidence: `src/game/store.ts:342–345` checks the reconciled state's `interrupted` status rather than whether the stored recipe was `started`. Load an already-interrupted revision 2 save twice without commands: revisions become 3 then 4, with two storage writes each time (primary and backup).

**Correction:** reconcile/write only when the original validated primary status was `started`. Loading a save that is already interrupted is read-only. Initialize the controller at a deliberate lifecycle boundary, not in a repeatedly invoked render initializer. Test started → interrupted once, then repeat initialization produces no write/revision/backup changes or award. Deferral cost **medium**: avoid backup churn and artificial stale-tab conflicts.

### 4. Distinguish command acceptance from durable replacement success

Evidence: `src/game/store.ts:238–272,429–431`. After a settled 19-Credit flight, force writes to fail and call `reset(true)`: it returns true, memory becomes 0 Credits, disk remains 19 Credits, and persistence correctly reports a replacement error. The boolean means accepted in memory, not saved successfully. Import and recovery share this path.

**Correction:** define/document the controller result contract and make Settings consume an explicit durable outcome or the resulting persistence status. Never show “saved/reset successfully” solely because a command returned true. Retaining a valid, explicitly requested replacement in memory is permitted if clearly labeled unsaved; validation rejection still changes no progression. Preserve export/recovery data, and make failed replacement retry behavior clear. Tests should cover failed reset/import/recovery followed by retry/export/reload. Deferral cost **medium** for misleading Settings feedback.

### 5. Finish existing counter/seed/reporting refinements

- The prior C4 impossible-counter probe still succeeds: two completions are accepted while run 2 is started and run 1 is the latest settlement. Add the necessary counter relationships described in the original review; no ledger or anti-cheat system.
- Admission now rejects busy launches before entropy, but unsafe revision/run counters are checked later. With revision `MAX_SAFE_INTEGER`, reservation rejects correctly and leaves progression intact, but still calls the seed source once. Preflight all known overflow conditions before seed acquisition; test invalid seed-source rejection separately. This completes C1 rather than changing the RNG contract.
- C5 report-policy coverage remains open: clearly distinguish four current buying strategies from the six original experiments, include hoarding/throughput stress cases and fifth-launch/500 m/1 km pacing, and enforce endpoint convergence in permanent tooling. No balance tuning is requested.

Deferral cost **medium** for counters, **low** for the extreme seed-boundary case, **medium** for interpreting human pacing without the reporting refinements.

## Verification and determinism

Independently passed on `059aee9`:

- Typecheck and **47 tests across 8 files**.
- Root production build.
- Local Chromium browser suite: **3/3**.
- Pages-subpath production build and browser suite: **2/2**.
- Production balance report: unchanged from the checkpoint; **729 builds, zero negative upgrade edges**, approved seeded range and campaign results retained.
- Original audit probe: P0 reproductions fixed; all **2,187** nominal/endpoint timestep-halving comparisons pass. Maximum altitude difference remains **0.000058742855 m**, maximum terminal-time difference **0.000001441843 s**.
- `git diff --check`.

The initial reviewer invocation ran the two browser suites in parallel. Both use the same Playwright artifact directory and collided with `ENOENT` errors during trace cleanup. Sequential reruns pass completely. This was a review harness scheduling error, not an application failure; run those suites sequentially unless output directories are isolated.

The RNG/variance, economy and recipe derivation modules are unchanged by the correction commit. Golden seed tests pass, historical replay still uses the old recipe without fresh entropy or reward, and nominal/endpoint results are unchanged. No live Phase 2 deployment or independent human session is claimed. The current browser tests still cover the Phase 1 surface.

[Captured review evidence](reviews/phase-2-p0-review-evidence.json) combines the original probe rerun on this commit and the [adjacent-case probe](reviews/phase-2-p0-adjacent-probe.mts). Both use isolated memory storage. The old probe's hardcoded `reviewedCommit` label describes its original fixture; the new evidence explicitly identifies `059aee9` as the code under review.

## Luna's next task and next Astra review

Proceed with the first controller/UI integration commit: resolve P1 items 1–4, the eligibility/snapshot interface and counter/seed guards; add their regression tests. Then wire Credits, four upgrades, paid launch versus unpaid historical replay, reward feedback and Settings per the approved specification. Complete report refinements before the release/playtest handoff. No change to Phase 2 scope, formulas, currencies or future mechanics is authorized by this review.

Bring Astra back after the controller-backed UI, two human sessions and live Pages verification described in the original review's K: implementation/deployed SHAs, automated results, unchanged or explicitly justified balance report, buy/reload/replay and failure-path evidence, and session timings/purchase choices/subjective feedback. Report a new P0 earlier if one appears. This pass clears the original correction gate; it does not mark Phase 2 shipped.
