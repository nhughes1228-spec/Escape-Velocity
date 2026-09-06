# Phase 2 presentation correction — Astra review

Reviewed 2026-09-06. Implementation `07c205d`, handoff HEAD `f1c67dc`, fetched `origin/main` `37c17d6`. Their final trees agree; the implementation was merged as `6ff4756`. The working tree was clean before review. This is a focused review of the [playtest correction](PHASE_2_PLAYTEST_REVISIONS.md), not a new design of Phase 2.

## Verdict

**CONDITIONAL PASS.** The observed-flight camera and historical rendering are sound enough for the revised experience check. No new P0 was found. One keyboard-accessibility correction is required before final acceptance. Do not begin Phase 3 or another broad UI redesign.

The two original human sessions remain recorded. They established dissatisfaction, not successful experiential acceptance. The next human check should take a few minutes on the changed presentation, rather than repeat an unchanged 20-minute campaign. Automated checks cannot establish whether this artwork now makes climbing satisfying.

## What passes

- Camera framing consumes the displayed altitude and already-visible trace only. Its 300 m span remains fixed; translation begins above 210 m. It does not consume nominal capability or future apogee.
- Ruler, rocket anchor, trace, record and authored clouds share the linear world transform. The maximum artwork headroom is fixed, so purchasing a taller rocket does not change the world scale.
- Completed-flight artwork uses historical recipe levels while upgrade cards use current ownership. A live starter flight reached about 160 m and paid 19 Credits. Buying Engine for 14 left 5 Credits and produced an identical canvas image before and after the purchase, including its historical E0 appearance.
- Engine, Fuel Tank and Airframe now feed a pure appearance helper with distinct nozzle, tank and profile changes. Appearance remains separate from physics. Their subjective visibility still belongs in the short experience check.
- Header Settings and New game are visible. New game opens an explicit export/cancel/reset confirmation. Personal best and Flight time labels replace the misleading record/time labels identified in the handoff.
- No changes occurred in `src/game`, `src/simulation`, `src/persistence` or `balance` relative to `0e9ffa5`. Economy, deterministic replay, save versions and runtime Ignition remain unchanged. This review does not reopen the previously passed domain checkpoint.

## P1 — correct before final acceptance

### New game dialog does not manage keyboard focus

**Evidence:** `src/ui/App.tsx:261–275` renders a section with `role="dialog"` and `aria-modal="true"`, but provides no modal focus behavior. In the deployed browser, opening New game left focus on the header button outside the dialog; Shift+Tab moved to the background Settings button; Escape left the dialog open. ARIA attributes alone do not make the background inert.

**Why it matters:** keyboard users can operate background controls while a destructive confirmation is displayed, and cannot navigate the confirmation as a modal. Mouse smoke tests do not cover this.

**Correction / ownership:** Luna. Use a native modal dialog or implement equivalent focus management. Opening should focus Cancel, background controls must be inert, Tab and Shift+Tab must stay inside, Escape must cancel, and closing must return focus to New game. Do not initially focus Reset progress. Preserve the existing store/reset/export commands and failure feedback.

**Acceptance:** add a keyboard browser regression covering opening, both tab directions, Escape, focus restoration and cancellation preserving progress. Verify background Launch/purchase controls cannot activate while open; export and explicit reset remain usable. Run the existing checks. Deferral cost is low now, but this must not become a copied dialog pattern.

## P2 — small presentation follow-ups; not a new architecture gate

1. **Stars contradict the agreed scenery convention.** `src/ui/RocketCanvas.tsx:258–263` treats stars as world objects at hundreds of meters. They enter as the camera climbs, whereas the handoff permits ambient stars visible from the pad. Remove these few points or render a fixed distant sky layer visible from the start. Keep clouds in world coordinates. Luna; low deferral cost. No unlock, reward or space system is warranted.
2. **Offscreen labels can overlap.** `drawOffscreenIndicator` gives all downward labels the same coordinates (`RocketCanvas.tsx:62–74`). When the pad and previous record are both below view during a sufficiently improved flight, their text overlaps. Give simultaneous indicators separate slots, including at mobile widths. Luna; low deferral cost; source-derived edge case rather than a reproduced ordinary starter flight.
3. **Archived scene label is ambiguous after a purchase.** The completed scene correctly remains E0 after buying Engine 1, but its heading still says Current rocket. Use Last flight for completed historical display, retaining current owned levels on cards. Luna; low deferral cost.

These can accompany a small polish correction if convenient. Do not hold a revised-experience check for a larger scenery project.

## Independent verification

- Typecheck; 56 unit tests in 9 files; root production build: pass.
- Local Playwright: 5/5; Pages-subpath build and Playwright: 2/2. Suites ran sequentially.
- Production balance report regenerated without a committed diff: 729 builds, zero negative upgrade edges; existing variance and six-policy pacing results unchanged. No retuning was performed.
- Live Pages opened in an isolated Playwright profile. Paid starter launch, Engine purchase, historical canvas preservation, visible header actions and the keyboard defect above were checked without touching the user's save.
- Inspected the actual live canvas through its PNG buffer. Whole-page screenshot calls timed out in the browser tooling; do not treat this as complete visual QA of every viewport. Existing automated mobile/subpath checks passed. The live console showed a favicon 404, with no application exception observed during these interactions.

## Ignition and next work

Keep the approved runtime `[1.5, 1, 0.6, 0.3, 0.1]` delay table and first price 8 for this presentation correction. The separately modeled recommendation remains `[3, 2, 1.2, 0.6, 0.1]`, prices 12/22/36/54. Do not edit opening-v2 in place. Its eventual implementation needs the versioned migration and historical recipe preservation specified in the playtest handoff.

Next Luna task: the narrow dialog correction, with optional small P2 fixes above. No physics, currency, save or upgrade redesign. Then check the changed experience for the first few physical purchases: does passing scenery communicate extra height, does the next rocket visibly reflect the purchase, and does the completed scene stay stable while shopping? A later existing ~1 km save can check camera travel without another long grind. Do not require the player to manufacture extra feedback if their answer is simply that the experience remains weak.

If that short check passes, proceed to the isolated Ignition candidate/migration rather than expanding Phase 3. Bring Astra back for the first deployed-save balance migration with old-save fixtures, old-recipe replay checks and regenerated pacing evidence. If the revised scene still feels numerical, return the observed experience and a short recording or reproduction sequence before commissioning more art. Final Phase 2 acceptance remains pending the keyboard correction and the changed experience/balance checks; the original two-session requirement is already satisfied.
