# Roadmap and project state

Updated: 2026-09-05. Canonical repository: https://github.com/nhughes1228-spec/Escape-Velocity (private).

## Current state

Phase 0 foundation is established: design, physics, architecture, balance configuration, reproducible opening experiment and agent workflow. No application, package manifest, browser build or production tests exist yet. **Next authorized implementation scope: Phase 1**, specified in [LUNA_PHASE_1.md](LUNA_PHASE_1.md). This is a handoff, not a claim that an implementation conversation has been started.

Phase 0 is necessarily the sole non-playable prerequisite. Every implementation phase below must preserve the previous playable game and finish with a playable build plus its acceptance checks. Do not claim Phase 0 itself is playable.

## Foundation verification

The opening report reproduced exactly on 2026-09-05 using Python's standard library. All 729 builds passed dt-halving convergence and immediate-liftoff checks; zero negative physical upgrade edges. Maximum altitude difference was 0.00005819 m. Both baseline purchase policies reached 1 km on launch 22. JSON parsing, local Markdown links and whitespace checks passed. Application build, unit and browser checks are unavailable until Phase 1; this verification does not stand in for them.

## Phases and exit gates

| Phase | Deliverable and player loop | Exit gate / explicit limit |
| --- | --- | --- |
| 0 — Foundation | Canonical specifications and calibrated opening experiment | Documents agree, JSON parses, opening sweep and pacing report reproducible; no application code |
| 1 — First playable launch | Press Launch, watch ignition/ascent/coast, see maximum altitude and session record, repeat | Full handoff acceptance passes; fixed starter only, no economy/save/upgrade UI |
| 2 — Upgrades and economy | Earn Credits, buy Engine/Fuel/Airframe/Ignition, launch improved vehicle, resume saved progress | All opening config levels supported; gains visible; costs/awards atomic; buy/reload and duplicate settlement tests; save recovery/export available |
| 3 — Opening progression | Earn 100 m/500 m/1 km milestones, compare record trace, reveal optional diagnostics | One-time grants persist, multi-threshold jumps handled; measured time to 1 km within 4–9 active minutes for baseline strategies; human opening playtest recorded |
| 4 — Launch operations | At 1 km reveal telemetry playback controls and repeat-flight results shortcut | 1×/2×/4× produce identical outcomes/rewards; hide-tab/reload/skip cannot duplicate awards; same rocket remains playable |
| 5 — Stratospheric systems | Add the next vehicle family and reach 10 km with the same upgrade/launch loop | First write/calibrate family spec; free reconfiguration and liftoff preview precede risky builds; 10 km reachable without bypassing caps; playable transition from opening saves |
| 6 — Reach space | Extend calibrated vehicle families to 100 km and deliver the space-versus-orbit reveal | Numeric convergence over new envelope; human pacing review; player can continue vertical launches; no pretend orbital success |
| 7 — Orbital flight | Guidance presets, horizontal velocity and an orbital objective | Approved orbital spec, bound-orbit/periapsis checks, analytic/conservation tests, preset-guided orbit achievable; prior vertical mode retained |
| 8 — Payload delivery | Choose useful payload mass and satisfy a delivery objective | Payload affects physics; rewards cannot be farmed via altitude double counting; clear failure feedback and affordable repeat path |
| 9 — Staging | Discard spent mass to solve a demonstrated delivery constraint | Mass/fuel conservation and event-order tests; one-stage saves work; no duplicated thrust/fuel on separation |
| 10 — Lunar missions | Configure launch/transfer/arrival with accessible guidance | New mission spec and numerical validation first; playable attempt/result loop with coast compression |
| 11 — Interplanetary and endgame | Select one validated extension to the delivery loop | Scope/pacing review before implementation; no default prestige or arbitrary currency expansion |

Phases 5 onward are proposals awaiting detailed specifications. Before releasing content that lets a player exhaust the opening's caps, either ship the next calibrated phase or label the build as a limited demo with a satisfying end screen and continued replay. Do not hide an unreachable objective behind more grinding. Phase 2 may explicitly be a small sandbox; Phase 3 is a 1 km demo.

Automation is deliberately not bundled with simple playback acceleration. After Phase 4 playtesting, decide whether auto-launch is needed; if selected, write a bounded specification including settlement, stop conditions, tab visibility and offline policy before adding it. Basic accessibility and error recovery belong in every phase.

## Review and handoff practice

At each phase: inspect current branch/status/log and remote, read relevant specs, identify implemented scope, audit before editing, and rank issues by severity and deferral cost. Every implementation handoff records behavior, formulas, boundaries, tests, acceptance and exclusions. Include tested commit SHA in review/PR text rather than a self-referential SHA in the same commit.

Suggested severity: P0 data loss/unusable application; P1 incorrect physics, duplicate awards or progression blocker; P2 pacing risk, unclear feedback or avoidable architectural debt; P3 polish. Also report deferral cost low/medium/high and why. A P2 save-boundary problem can become expensive even while it is not immediately catastrophic.

Record phase completion only after its build/tests and relevant human/UI checks pass. Update this file with the completed deliverable, known limitations and next bounded task. Do not mark later phases done because their config keys exist.

## Foundation decisions

- 2026-09-05: start with vertical-v1 midpoint integration, SI units and explicit burnout/apogee handling. Orbit will be a separate later model.
- 2026-09-05: one currency, free retries, no initial offline income/prestige; sublinear altitude income and capped additive/rational upgrades.
- 2026-09-05: use a small static TypeScript/React/Vite application; separate physics, game rules and presentation. Saves begin with economy in Phase 2.
- 2026-09-05: source balance in JSON; temporary Python probe measures opening only and must be replaced by production-solver reporting in Phase 1.
- 2026-09-05: initial 25% fuel increment produced one negative opening upgrade edge; reduced to 22% and reran the full envelope. This is an opening usability decision, not a universal promise that fuel helps.

## Outstanding decisions

Priority before Phase 5: next vehicle families, transitions and measured pacing to 10 km/100 km. Priority before Phase 7: orbital guidance, mission completion/time horizon, reward transition and presentation. Later: staging interaction, automation/offline policy, mission breadth and endgame. Art style can evolve during Phase 1 without changing physics. Hosting/provider, release visibility and license have not been selected.
