# Agent instructions — Escape Velocity

## Authority and roles

This repository is the canonical project record for code, game rules, balance, architecture and state. Multiple Codex conversations may work here, including a GPT-5.6 Luna implementation conversation and a senior architect/reviewer conversation. Inspect current repository state every time; it may differ from prior conversation history. Do not assume another conversation's uncommitted state or undo its work to restore an old plan.

Before significant work inspect `git status --short --branch`, branches/remotes, recent commits and relevant files. Fetch the configured remote before comparing committed state when network access is available. Read `docs/ROADMAP.md` for the active phase, then relevant `GAME_DESIGN.md`, `PHYSICS.md`, `BALANCE.md`, `ARCHITECTURE.md` and feature handoff documents. Confirm what is actually implemented. Report any code/document conflict and decide explicitly which should change.

The architect normally specifies/reviews; Luna normally implements well-defined features. Review-only requests mean no edits. Rank findings by severity and by cost of deferring them, with concrete evidence and tests/reproduction. Difficult mathematical or cross-system corrections may warrant architect implementation. Routine UI work usually belongs in an implementation handoff.

## Implementation constraints

- Keep flight formulas centralized in `src/simulation`; keep vehicle derivation and economy in pure `src/game` modules. Follow the documented Phase 1 transition from the temporary Python design probe.
- Keep balance constants in versioned configuration (`balance/opening.json` initially). No hardcoded upgrade numbers, prices, reward formulas or unlock thresholds in UI components.
- Preserve progressive disclosure. Locked future systems must not appear as teaser menus, empty panels, slots or tech trees. Do not expose aerospace metrics before their documented unlock.
- Keep simulation state and physics time separate from animation, frame rate and wall time. Rewards come from authoritative terminal results and settle once.
- Add/update meaningful tests for any simulation change: analytic cases, invariants and convergence as appropriate. Balance changes require regenerated reports and a pacing review.
- Update documentation when architecture, formulas, player rules, save semantics or accepted phase scope changes. Distinguish measured data, targets and unimplemented proposals.
- Do not add currencies, prestige, missions, staging or other systems without explaining the player problem they solve and obtaining scope in the roadmap/user task.
- Prefer finishing the active playable phase before beginning future systems. Avoid speculative frameworks, backend services or orbital code in the opening phases.
- Preserve free retry and recovery from bad configurations. Accessibility is never a progression purchase.

## Git and verification

Use descriptive, logically scoped commits. Use `codex/` branches for new work after initial repository bootstrap. Recheck the working tree/diff before staging; stage only your own intended paths or hunks. Do not discard, reset, force-push, overwrite or casually stash another agent's changes. If overlapping uncommitted work prevents a safe edit, explain the exact overlap. Independent files can proceed. Never claim a push, test or remote inspection succeeded without checking its result.

Before completion run the available phase's checks. For documentation-only foundation run `python3 tools/balance_probe.py`, compare `docs/balance-report.json`, validate JSON and run `git diff --check`; application build/tests do not exist yet and must be described as unavailable. Phase 1 replaces the probe and establishes npm typecheck/test/build/browser scripts. Thereafter verify build/tests before considering a task complete and run relevant browser acceptance checks for UI work. Report failures/blockers precisely; do not mark a phase complete with required checks pending.

Record completion and next work in `docs/ROADMAP.md`, with evidence; no chat-only project state. Commit balance/config/report/doc changes together where they describe one decision. Do not create a new Codex conversation or message another one unless the user asks; a written handoff is sufficient.
