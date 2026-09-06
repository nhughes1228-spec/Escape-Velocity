# Escape Velocity — game design

> Current playtest decision: two human sessions are recorded in [PHASE_2_PLAYTEST_REVISIONS.md](PHASE_2_PLAYTEST_REVISIONS.md). Final acceptance is held for its camera, scenery, upgrade-art and reset-discoverability improvements. These are the next implementation changes, not a claim that the live build already contains them. Ignition tuning remains a modeled candidate with deployed-save compatibility requirements.

> Phase 2 integration deployed (2026-09-05): [PHASE_2_SPEC.md](PHASE_2_SPEC.md) remains the authoritative design handoff; [PHASE_2_IMPLEMENTATION.md](PHASE_2_IMPLEMENTATION.md) records the controller, UI, domain and save implementation. The approved Phase 2 opening is live at the public repository-subpath URL, pending final human pacing review. The handoff explicitly supersedes earlier Ignition, replay and save proposals; unchanged physical formulas and nominal fixtures remain valid.

Status: opening rules plus deployed Phase 2 integration, 2026-09-05. Later eras are direction, not authorized implementation. See [ROADMAP](ROADMAP.md) for current scope and [BALANCE](BALANCE.md) for measured versus provisional numbers.

## Fantasy and core loop

Turn a small experimental rocket into a capable space program. Each flight should answer “what did my last change accomplish?” The player starts by pressing Launch, watching ascent, receiving a maximum-altitude result and Credits, buying a tangible improvement, and trying again. Flights are free and rockets are replenished automatically. Neither fuel purchasing nor vehicle replacement should interrupt experimentation.

The core loop remains **configure → launch → observe → evaluate → improve**. Later missions change the objective and configuration problem, not this rhythm. Success should feel earned through visible engineering changes without requiring equations or precision piloting.

## Opening experience

A new player sees a rocket on its pad, Launch, Credits (0), Current Record (0 m), and four compact upgrade cards: Engine, Fuel Tank, Airframe, Ignition. Cards show owned level, next price and one plain-language effect. Disable unaffordable purchases with an explanation. Initially no research screen, mission board, tech tree, orbital map, stage slots, payload slots, prestige button, delta-v, specific impulse, thrust-to-weight ratio, or numerical drag coefficient appears, even as locked placeholders.

The starter launch takes about 1.5 seconds to ignite and 8.74 seconds to apogee. It awards enough for any one first physical upgrade. The summary is immediately actionable; no mandatory splash-screen delay or descent wait. After the first launch, show previous result and record comparison. Do not require spending or a tutorial dialog before replaying.

All four cards exist in the opening but advanced diagnostic detail is optional and unlocked when useful. Engine means stronger push with greater fuel flow and engine mass. Fuel Tank means more fuel and a heavier tank. Airframe means less structure mass and less drag. Ignition means a shorter preflight wait, with no change to flight physics.

## Phase 2 requirements and current checkpoint

These were requirements from the Phase 1 playtest. The controller, domain, settlement, save system and focused UI now implement them in the deployed Phase 2 opening.

Phase 2 must make the incremental loop playable: **launch → reach apogee → earn Credits → purchase an upgrade → improve the rocket → launch again**. A completed valid flight must settle its reward from the authoritative result, and a purchased Engine, Fuel Tank, Airframe or Ignition level must produce a visible, understandable consequence on the next launch. The loop must preserve free retries and must not require a separate fuel-purchase step.

Identical configurations must have modest natural performance variance rather than exactly repeating one altitude. Initially target approximately ±2–3% around the configuration's expected result, while keeping upgrade effects clearly larger than ordinary launch-to-launch noise and avoiding catastrophic failures. Variance should perturb an underlying physical input such as engine performance, fuel efficiency or atmospheric conditions before the authoritative simulation runs; it must not randomize the final altitude after simulation. Each gameplay launch needs a generated and stored seed so its result can be replayed, while tests can supply fixed seeds and remain deterministic. A future technology may reduce this spread, but that system is not part of this requirement's implementation.

## Rocket systems and experimentation

Purchased levels are permanent development; initially every purchased level is equipped. The opening family is bounded and audited across every supported combination. Before introducing combinations that can make a vehicle unable to lift, add free configuration selection up to owned levels, a plain-language preflight warning and a safe revert action. Never strand a player behind an irreversible purchase. Do not promise that adding fuel always improves altitude outside the audited opening envelope.

Engine changes thrust, effective exhaust speed and engine mass together. Tank changes fuel capacity and structural mass. Airframe only reduces its own reducible mass; it cannot erase engine/tank mass. Ignition reduces operational delay. The rocket image responds to these changes: larger tank section, distinct engine bell/flame, sleeker body. Visual size is illustrative, never the collision geometry or physics source.

## Flight lifecycle

Ready → ignition → powered ascent → coast → result → ready. Replay is a separate unpaid playback mode. Only one flight exists at once. Freeze the launch configuration on click; purchases are unavailable until result. The pad supports rockets that initially cannot lift while fuel burns. Failed liftoff, impact, invalid simulation and safety-limit outcomes have distinct explanations. Valid apogee ends the opening flight; recovery is abstracted. Seeded engine-performance variance is deterministic from the stored recipe; it does not add random failures, weather, manual steering or a timing minigame.

Compute physics independently of animation. Awards occur when the terminal result is presented and settled, never from the visual height or a frame callback. Aborting/reloading an unsettled flight awards nothing and costs nothing. Records use unrounded meters; UI rounding must never grant thresholds early.

## Currency and rewards

Credits are the sole spendable resource. In the Phase 2 checkpoint, repeat flights pay based on achieved altitude, including flights below the record. There is no all-time-best multiplier, passive income, launch fee or early offline income. Phase 3 milestone grants remain dormant and are not included in Phase 2 settlement. Purchases and award settlement are atomic, idempotent game-state transitions. Formula and first milestones live in [BALANCE](BALANCE.md).

Do not add “science,” “prestige points” or mission tokens to gate a menu. An eventual resource requires a distinct decision that Credits cannot express and a documented design review.

## Milestones and progressive disclosure

Thresholds are achievements from completed valid flights. On settlement, award every newly crossed milestone once, in ascending order; large jumps do not skip grants. Unlocks remain earned if later balance changes lower the rocket's performance. Show one relevant next objective; batch celebrations into one summary. Crossing 100 m acknowledges the first flight without a grant. 500 m introduces a record trace; 1 km enables optional flight diagnostics and later operations work. 10 km opens the next engineering problem. 100 km triggers the space/orbit reveal only when that phase is implemented.

Unlocks introduce a solution to a demonstrated problem: telemetry makes a long coast understandable and skippable, configuration preview explains a heavy rocket, guidance addresses sideways speed. Accessibility settings (reduced motion, readable text, keyboard controls, sound toggle) are always free and available; never gate them behind progression.

## Eras and mission structure

| Era | Player problem and new decisions | Scope status |
| --- | --- | --- |
| Experimental Rocketry | Improve thrust, fuel and airframe to exceed a personal altitude record | Opening specification |
| Stratosphere | More fuel becomes heavy; new engine/tank families and diagnostics extend useful flight | Proposed |
| Space | Reach 100 km; understand that a vertical rocket still falls back | Proposed |
| Orbital Flight | Use guidance to build horizontal speed while preserving altitude | Proposed |
| Payload Delivery | Deliver useful mass to a specified orbit rather than optimize an empty rocket | Proposed |
| Multi-Stage Rockets | Discard spent structure to overcome payload and energy limits | Proposed |
| Lunar Missions | Plan departure and arrival budgets with optional coast compression | Proposed |
| Interplanetary Missions | Trade capability, mission duration and payload across destinations | Proposed |

Mission definitions eventually contain stable ID, prerequisites, vehicle constraints, success predicate, one-time reward and repeat payout policy. Begin with one active suggested altitude goal, not a separate mission currency or board. Later repeat contracts must replace or cap redundant altitude payouts so repeated high arcs cannot dominate delivery missions. Evaluate mission outcomes from authoritative results, never UI labels. A partial failure should explain the missing capability and keep free experimentation available.

## Space, orbit, staging and payloads

At 100 km, celebrate reaching space, then show the arc returning: “Space reached. Orbit requires enough sideways speed to keep missing the ground.” Preserve the altitude record and offer guided orbital experiments. Do not silently switch to a different planet or award orbit from altitude alone. Orbital success will require a bound trajectory with periapsis above the atmospheric boundary. Exact guidance controls and rewards need a Phase 7 specification.

Use generous guidance presets before exposing pitch programs and delta-v. Retain short, replayable launches via presentation acceleration. Staging later drops expended dry mass and activates another engine; fuel is not multiplied and exhausted stages cannot contribute thrust. Payload mass reduces performance and earns objective-specific rewards. These are future design constraints, not modules to scaffold now.

## Operations, presentation and feedback

Keep the pad and previous record as stable references; show height ruler and apogee marker. Automatic camera zoom must keep a record marker or inset reference visible so better flights do not look identical. Show a previous-flight ghost/trace after its unlock, with muted contrast and a clear legend. Traces use simulated meters and seconds, resampled only for rendering. Never stretch results to exaggerate improvement.

A short record celebration, changed silhouette, flame cutoff at burnout and readable coast phase communicate improvement. Use atmosphere color transitions as flavor, with labeled altitude milestones as truth. Provide DOM equivalents of all essential canvas information, keyboard-operable buttons, visible focus, reduced motion and non-color status cues. Keep screen-reader announcements to phase changes/results, not every altitude update.

Ignition levels improve the opening's startup delay. At 1 km, later telemetry can offer 2×/4× playback and immediate results for repeat configurations. First milestone reveal flights remain watchable with an explicit fast-forward option. Faster playback must use the same physics steps. Automation later repeats a selected configuration and settles each flight once; the player can pause it. No auto-buy initially. Background behavior must be defined before automation ships; no implicit offline simulation.

## Resets and endgame

No prestige/reset system in the initial roadmap. Avoid designing a grind that requires erasing progress to fix it. If eventual expedition programs create useful fresh starts, preserve achievements and provide an explicit optional choice; permanent bonuses cannot recursively multiply income.

Possible endgame: efficient cargo programs, reusable vehicle optimization, destination infrastructure, constrained design challenges and a mission sandbox. These are options, not promised content. Select only after the orbital/delivery loop is satisfying.

## Open decisions

Later vehicle-family calibration and transitions, guidance interaction, repeat mission economy, staging UX, automation/background policy, art direction and endgame selection remain open. There is no need to settle them before the first playable launch.
