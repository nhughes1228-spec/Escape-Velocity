# Balance framework — opening-v2

> Phase 2 integration deployed (2026-09-05): [PHASE_2_SPEC.md](PHASE_2_SPEC.md) remains the authoritative design handoff. Runtime configuration is `opening-v2` with `vertical-v1.1`; [PHASE_2_IMPLEMENTATION.md](PHASE_2_IMPLEMENTATION.md) records the integrated controller/UI deployment. Final human pacing review is pending. The handoff explicitly supersedes earlier Ignition, replay and save proposals; unchanged physical formulas and nominal fixtures remain valid.

Status: measured Phase 2 deployed configuration; automated/live-browser checks pass, with human pacing sessions pending. Machine-readable values live in [balance/opening.json](../balance/opening.json). Formulas here are normative; tables are rounded outputs, not a second editable configuration source. Any formula/config change must regenerate [balance-report.json](balance-report.json) and identify its version/provenance.

## Starter rocket

| Parameter | Initial value |
| --- | ---: |
| Reducible airframe/structural mass | 6 kg |
| Engine/base hardware mass (includes base empty tank) | 2 kg |
| Dry mass total | 8 kg |
| Propellant capacity | 2 kg |
| Initial wet mass | 10 kg |
| Thrust | 160 N |
| Effective exhaust speed | 400 m/s |
| Mass flow (derived) | 0.4 kg/s |
| Powered duration (derived) | 5 s |
| Drag area Cd × A | 0.012 m² |
| Sea-level gravity | 9.80665 m/s² |
| Planet radius | 6,371,000 m |
| Sea-level density | 1.225 kg/m³ |
| Density scale height | 8,500 m |
| Ignition delay | 1.5 presentation seconds |

This deliberately inefficient small experimental rocket creates a short, readable first flight. It is not a specification for a real engine. Initial thrust-to-weight ratio is about 1.63. At dt=1/120, the modeled first apogee is **160.170311 m**, reached **8.741557 simulated seconds** after ignition. Click to result is about **10.24 foreground seconds** at 1×; result review is player-controlled.

## Seeded launch variance

The fixed starter and exact nominal fixture above remain the Phase 1 baseline. Phase 2 uses one seeded engine-performance factor `k = 1 + 0.006*(u1 + u2 - 1)`, where `u1` and `u2` are the first two draws of versioned Mulberry32 for the stored uint32 seed. `k` multiplies nominal thrust and exhaust velocity together, leaving mass, fuel, drag and flow unchanged. The authoritative solver determines the resulting altitude; there is no post-simulation altitude adjustment. Starter seeded results span 157.283095–163.070630 m at the approved endpoints, with all endpoint flights awarding 19 Credits. The future variance-reduction technology requires a separate design decision.

## Bounded opening upgrades

Levels are integers starting at zero. `e,f,a,i` mean Engine, Fuel Tank, Airframe, Ignition. Physical caps are 8 each; ignition cap is 4. Purchased levels are automatically equipped in this family. Formulas:

```text
thrustN = 160 * (1 + 0.18*e)
exhaustVelocityMps = 400 * (1 + 0.035*e)
fuelKg = 2 * (1 + 0.22*f)
dryMassKg = 6/(1 + 0.10*a) + 2 + 0.12*e + 0.15*f
dragAreaM2 = 0.012/(1 + 0.12*a)
ignitionDelayS = [1.5, 1.0, 0.6, 0.3, 0.1][i]
```

Numbers above mirror the JSON for readability; code reads JSON. Thrust and effective exhaust speed jointly determine flow; don't independently multiply burn duration. Engine increases mass and flow, but increases efficiency modestly. Every tank level adds 0.44 kg propellant and 0.15 kg empty tank mass. Airframe's diminishing improvement affects only structure and drag. Ignition never changes the altitude or reward per flight.

The full 729-build sweep shows all opening builds lift, terminate, and have no negative physical-upgrade altitude edges. The minimum initial TWR is about 1.108. This envelope is intentional protection for the simple opening UI. General future builds need not be monotonic and will require configuration preview and free re-equipping. Before calibration the 25% tank increment produced one slightly harmful purchase; 22% resolves it while preserving mass coupling.

## Prices and income

Price of the next level, from current owned level L:

```text
cost(kind,L) = ceil(baseCost[kind] * (1 + 0.6*L + 0.18*L²))
```

A cap means “fully developed,” not another purchasable level. Credits are nonnegative safe integers. Round exactly once at the price boundary. No cost reduction, income multiplier or prestige multiplier in this family.

| Upgrade | Base/first price | Second price | Third price | First purchase at starter income |
| --- | ---: | ---: | ---: | --- |
| Engine | 14 | 25 | 41 | 1 launch |
| Fuel Tank | 16 | 29 | 47 | 1 launch |
| Airframe | 12 | 22 | 36 | 1 launch |
| Ignition | 8 | 15 | 24 | 1 launch |

“1 launch” means each option individually from zero Credits, not all options together. Starter income is 19 Credits; after buying a first physical upgrade, typical subsequent early purchases take 1–3 launches depending on order. Target no more than 5 same-build repeats for a useful physical upgrade before 1 km. Validate this in richer economy sweeps before claiming it for every player policy.

For a completed valid new-launch apogee h in raw meters:

```text
repeatIncome(h) = 4 + floor(1.2 * sqrt(max(0,h)))
newRecord = max(oldRecord, h)
```

No award depends on displayed/rounded height. There is no record bonus and no Phase 2 milestone payout. NoLiftoff, impact, invalid, duration-limit, replay and user-aborted flights receive zero. Repeating a valid sub-record new launch still pays. Free fuel/restoration is part of the game abstraction. Square-root growth controls income per flight; it does not by itself prove a stable long-term economy, especially after automation or a new reward type.

## Dormant milestones (Phase 3)

| Milestone ID | Threshold | One-time Credits | Behavior / phase |
| --- | ---: | ---: | --- |
| altitude-100m | 100 m | 0 | First-flight acknowledgement, Phase 3 |
| altitude-500m | 500 m | 35 | Record-trace reveal, Phase 3 |
| altitude-1km | 1,000 m | 80 | Optional flight diagnostics, Phase 3; operations eligibility in Phase 4 |

These grants total 115 Credits and never repeat. A single jump across several thresholds grants their sum. Eligibility alone does not expose an unimplemented panel. Grants are in the config for calibration, but the Phase 2 sandbox only uses repeat income; Phase 3 implements milestones. Campaign numbers below describe the completed Phase 3 opening.

10 km and 100 km are future objectives with **no approved grant amounts yet**. Define later grants as a fraction of the next meaningful development purchase after simulating the new family. Do not extrapolate an arbitrary million-Credit bonus or add dummy grants to the production config.

## Measured altitude progression

Levels below are `(engine, fuel, airframe)`; ignition is zero. Trace-free design probe results rounded to useful precision:

| Levels | Apogee | Ignition-to-apogee | Repeat Credits |
| --- | ---: | ---: | ---: |
| 0,0,0 | 160.17 m | 8.74 s | 19 |
| 1,0,0 | 193.33 m | 8.78 s | 20 |
| 0,1,0 | 203.64 m | 10.19 s | 21 |
| 0,0,1 | 192.65 m | 9.22 s | 20 |
| 2,2,2 | 446.16 m | 12.48 s | 29 |
| 4,4,4 | 805.39 m | 15.55 s | 38 |
| 8,8,8 | 1,647.88 m | 20.66 s | 52 |

Tank first gives more altitude but a longer flight; Engine first improves altitude with almost unchanged duration. This is a useful interaction that altitude-per-Credit alone misses. Ignition competes as a time-saving purchase rather than a physics boost. Its first level saves 0.5 seconds per flight under the approved table, so playtest whether it feels worth buying; do not treat numerical availability as evidence of appeal.

## Phase 2 pacing evidence and targets

The production campaign starts with zero Credits. It launches, pays repeat income only, then buys affordable upgrades repeatedly. The committed report uses production reward/cost/recipe/variance helpers, six explicitly named policies with 32 deterministic seeds each, nominal and variance-endpoint convergence checks, and recomputes marginal values after each purchase. It reports fifth-launch altitude, 500 m/1 km pacing, no-purchase gaps and final-purchase time. Timing assumes 1× playback and 4 s for decision/result review per launch; no background/offline time. This is a baseline, not an optimal policy or a human study.

| Objective | Active-play target | Current evidence |
| --- | --- | --- |
| First reward/choice | ≤15 s before review time | ~10.24 s and any first physical purchase affordable |
| Full Phase 2 opening caps | 15–25 minutes | Production seeded campaigns complete all four caps in about 18.8–19.1 minutes; see [balance-report.json](balance-report.json). |
| 10 km | 20–35 minutes cumulative | Provisional; requires Phase 5 family, not reachable with opening caps |
| 100 km | 60–100 minutes cumulative | Provisional; requires Phase 6 family calibration and playback improvements |

Opening research supports the finite Phase 2 opening and the later 1 km milestone loop. The six-policy report is evidence for pacing, not a claim that every route or player behaves identically. Do not tune opening levels upward without bound to force later timing targets. Each family must have a measured capability envelope, affordable entry build and saved-progress transition. Longer trajectories should use telemetry/playback QoL rather than require several minutes of repeated waiting.

## Balance workflow and anti-runaway controls

Keep one versioned numeric config, deterministic solver, campaign runner and committed generated report. Audit local marginal gains, income per launch AND per active minute, waiting time to the next useful purchase and milestone grant share. Do not use only a balanced-level trajectory; it misses tank-only traps. Sweep all combinations for capped small families and sample/optimize larger ones.

Bounds, additive engine/tank improvements, diminishing airframe gains, mass coupling, square-root rewards and quadratic prices limit the opening. Physical caps also make impossible goals visible as content limits rather than infinite grinds. A family transition introduces a new engineering choice with an explicit finite budget; never stacks every prior era's percentage bonus. Do not add repeat milestone awards, best-record compounding or uncapped playback/automation multipliers.

The permanent report currently names cheapest, physical-gain, throughput, Ignition-first, Engine-first and seeded-random choice. Future audits may add save-for-best, engine-only/fuel-only/airframe-only stress cases, look-ahead and novice policies; these are not silently conflated with the current six. For each report time/launches to milestones, median and worst waits, final ownership, failed flights, income composition and dominant upgrades. Cross-check a few policies with human playtests and record assumptions/seeds. No claim of strategy diversity until tested.

Perturb thrust, fuel, mass, CdA, prices and reward coefficient ±10%; measure sensitivity rather than fitting a single route. Assert no softlock within the supported family. New families require convergence and mass/flow checks before economy tuning. Phase 1's production-solver report reproduces the reference and the temporary Python implementation is retired. The Phase 2 production report now covers seeded variance, endpoint convergence and six no-grant policy models; human UI pacing remains a release-playtest task.
