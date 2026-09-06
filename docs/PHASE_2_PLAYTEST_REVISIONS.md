# Phase 2 playtest response and improvement handoff

Reviewed `main` / `origin/main` **`38590e3`** after fetch, 2026-09-05. Phase 2 UI was merged in `5a69810`; the public Pages build is deployed. This document records the two reported human sessions and the next bounded improvement task. It supersedes the earlier camera recommendation in PHASE_2_SPEC B1/F as specified below. Ignition remains a modeled candidate until its separate versioned implementation; no runtime/configuration change is made by this review.

## Release decision

**Hold final Phase 2 acceptance for a presentation and usability pass. Do not start Phase 3.** Passing two session counts is not the same as passing their experiential acceptance criteria. The user completed two sessions and still finds the experience insufficiently satisfying; another identical long session on this build is not the next task.

Session 1: first purchase Engine, clear benefit; upgrade gains noticeable; variance natural/fair; labels and controls clear. Requested slower initial Ignition with a price closer to other upgrades. Reset could not be found under Settings. After roughly four upgrades, height felt mostly numerical. Reported purchase-triggered zoom that telegraphed improvement. Suggested grounded scenery, clouds and camera bands.

Session 2: completed according to the user, with no additional findings and continued dissatisfaction. No duration, completion level, purchase sequence or milestone timings were supplied for either session. Do not invent those measurements or claim that human campaign pacing has been validated.

The useful parts of the loop should be preserved: physically noticeable gains, simple buying decisions and modest variance. Prioritize making those gains visible in the world. These observations do not justify currencies, missions, prestige, staging, orbit or a new upgrade tree.

## Findings and priority

| Priority / release treatment | Current evidence | Required action / owner |
| --- | --- | --- |
| **P1, acceptance blocker: weak perception of increasing height** | `RocketCanvas.tsx:56–61` fits nominal capability/record into the same view; scenery is primarily a screen-space gradient and flat ground. Higher flights therefore occupy a similar portion of the frame. This supports the reported loss of physical height. | Replace predicted-fit framing with the observed-flight world camera below. Add stable ground/cloud references. **Luna**, high cost if more scenery is built on the old coordinate system. |
| **P1, acceptance blocker: purchase changes flight framing/history** | `App.tsx:121–134` recalculates nominal peak from newly owned levels; the canvas immediately recomputes its range while still showing the previous flight. A purchase crossing a range band can reframe a completed flight before another launch. | Remove predicted peak from camera inputs. Keep a completed flight's scene/vehicle historical until a new flight starts. **Luna**, medium cost. |
| **P1, acceptance blocker: physical upgrades lack clear visual identity** | `RocketCanvas` does not use Engine level in its artwork. Airframe increases body width despite “cleaner shape” copy. Fuel changes body length only slightly. | Make the first Engine, Fuel and Airframe purchases visually distinguishable on their next launch, with modest cumulative changes. Keep the altitude anchor fixed. **Luna**, medium cost. |
| **P1 for this usability pass: new-game action not discoverable** | Live UI contains Reset progress only after expanding Settings below the flight/result/upgrade sections. The user did not find it. | Put visible Settings and New game entry points in the header; New game opens a confirmation, never resets immediately. **Luna**, low cost. |
| **P2, evaluate separately: Ignition tradeoff** | Approved table is `[1.5,1,.6,.3,.1]`, first price 8. User wants a more meaningful operational purchase. | Test the 3-second / 12-Credit candidate below after the visual pass. This is a balance revision, not a fix to physics. **Astra decision, Luna implementation**, medium cost because live saves exist. |
| **P2, small copy/feedback fixes in this pass** | Persisted best is labeled “Session record.” “Ignition to apogee” displays solver time only, excluding the delay. Purchase notice is stored in the Settings notice area. | Use “Personal best”; show correctly derived launch duration or label solver time “Flight time.” Place purchase confirmation next to the purchased card. **Luna**, low cost. |

This is a scoped experience review, not a claim that a fresh full release audit found no other defects. No new data-loss or simulation P0 was found in the checks performed here.

The first Engine purchase on a clean save remains within the existing 300 m camera band (starter ~160 m, Engine 1 ~193 m). The reported exact zoom moment was not independently reproduced at that first purchase. The code does establish purchase-dependent reframing at later band crossings; fix the general mechanism without disputing the player's experience.

## Presentation decision: an observed-flight world camera

The earlier Astra specification recommended nominal-capability framing to avoid revealing the *random* future result. That still lets the presentation reveal expected improvement and compresses progress. This is an architectural/design correction to that recommendation, not solely an implementation failure by Luna.

Use one continuous vertical world and a **fixed 300 m flight-view span** for this opening. The camera translates upward after the rocket reaches the upper part of its initial view; it does not zoom to a calculated apogee. Spatial bands refer to fixed world heights/landmarks, not new progression systems or rewards.

Initial presentation parameters, centralized in a small presentation configuration:

```text
worldSpanM = 300
followHeightM = 210
majorTickSpacingM = 50
highestShownM(t) = maximum altitude actually presented up to playback time t
cameraBottomM(t) = max(0, highestShownM(t) - followHeightM)
pixelsPerMeter = (bottomAnchorY - topAnchorY) / worldSpanM
y(worldAltitudeM) = bottomAnchorY
                 - (worldAltitudeM - cameraBottomM) * pixelsPerMeter
```

`topAnchorY` reserves the **maximum supported silhouette's** headroom, fixed across upgrade levels; `bottomAnchorY` retains bottom padding. At ignition, highest shown is 0 and the camera shows the same launchpad view for every rocket. Until 210 m the rocket climbs through a stationary view; afterward ground/clouds/ruler scroll past it at unchanged meters per pixel. This preserves the difference between the starter and first upgrades without stretching altitude. Resizing recalculates pixel geometry, not the world span or current meters.

Implementation boundaries:

- Add a pure `presentation/worldCamera.ts` (or evolve the existing scale module) receiving only presented time/altitude prefix, viewport geometry and presentation configuration. Do not pass nominal peak, final apogee, future trace samples, owned levels or balance capability into camera framing. Highest shown is transient and bounded; it can be derived from the visible trace prefix. No new save field is needed.
- Map rocket altitude anchor, height ticks, record line, current-height guide, visible trace and world-landmark reference points through the same transform. Do not clamp offscreen altitudes to an edge and draw them as if they occupied that edge's height; clip geometry and show a separately labeled offscreen arrow where needed.
- Camera translation should follow the displayed altitude without extra easing or spring overshoot. The existing time-interpolated trace supplies smooth travel. A future camera animation is not necessary here. No future-result fit at launch or apogee, and no settling-time zoom-out.
- The launchpad remains at world 0. Once it is outside the main view, show a small `Launchpad ↓` reference rather than pinning the actual pad artwork under a high-altitude rocket. If the known best is offscreen, show a labeled direction indicator; turn it into the true mapped line when in view. No separate world map or prediction inset is needed.
- Static world references persist across flights: a recognizable pad/service structure and ground silhouette, then a few authored cloud layers at stable heights (for example centers near 250, 600 and 1100 m). Their artwork is illustrative; their reference locations use world meters. Passing a cloud grants nothing. Keep layers sparse and outside the rocket/ruler's readable corridor.
- Clouds/landmarks must not consume gameplay randomness. Use fixed authored placements for this pass. Optional decorative drift/parallax is deferred; basic world translation already conveys motion. Avoid spawning a new sky arrangement on every launch.
- Stars or a distant moon can be ambient scenery visible from the pad as part of a consistent night/twilight setting. Do not make them appear as rewards for reaching hundreds of meters or suggest the 1.6 km demo has reached space. Ground, sky and clouds are sufficient for this pass; moon art is optional, not an objective or destination interface.
- Reduced motion keeps accurate essential flight/camera movement but removes jitter, particles and decorative drift; no camera shake, flashes or parallax. Verify the scene remains comfortable. Numeric/phase information stays available as DOM text and remains authoritative.

The main scene represents the displayed flight. At result it uses that historical recipe's levels; buying a new level must not retroactively change its rocket or camera. Cards show current owned levels immediately. The next paid launch resets the scene to the pad and shows the upgraded vehicle. Replay uses the archived vehicle and the same observed-flight camera rules. A short label such as “Last flight” avoids presenting the archived result as a new vehicle's performance.

Engine should visibly change the nozzle/bell or exhaust appearance; Fuel the tank/body section; Airframe fins/fairing/profile. Artwork stays illustrative and independent of simulation. Define a small pure appearance helper from the displayed recipe's levels, and ensure the renderer updates when those levels change. Do not add physics effects to justify a drawing.

## Reset and feedback behavior

Keep header entry points `Settings` and `New game` visible without expanding a below-the-fold accordion. New game opens a clearly named reset dialog with a concise list of what is cleared, `Export save`, `Cancel`, and `Reset progress`. Preserve the existing store command, confirmation semantics, conflict handling and unsaved-status reporting. During flight/replay disable the destructive confirmation with a readable reason. Opening the dialog does not mutate progress. There is no prestige bonus or reset currency.

Put confirmation of a purchase near its card, with an accessible announcement; don't make the player open Settings to learn that an upgrade was bought. Preserve the readable labels the user already liked. No general dashboard redesign is required.

For result duration, either use `historicalRecipe.nominalVehicle.ignitionDelayS + terminalTimeS` under “Launch to apogee,” or keep solver time and call it “Flight time.” Prefer the former when evaluating Ignition so its operational benefit is visible; paused background time is excluded. Never derive a historical duration from newly owned Ignition levels. Rename persisted session-record copy to “Personal best” / “New altitude record.”

## Ignition recommendation and measured tradeoff

Recommend this **candidate**, separate from the presentation repair:

| Owned level | Shipped delay | Candidate delay | Candidate next price |
| --- | ---: | ---: | ---: |
| 0 | 1.5 s | 3.0 s | 12 Credits |
| 1 | 1.0 s | 2.0 s | 22 Credits |
| 2 | 0.6 s | 1.2 s | 36 Credits |
| 3 | 0.3 s | 0.6 s | 54 Credits |
| 4 | 0.1 s | 0.1 s | Capped |

Same approved cost equation, new base 12; all physical stats, rewards, seed factors and caps remain unchanged. Total Ignition investment becomes 124 rather than 83 Credits. A first launch still funds any first upgrade. First Ignition saves 1 second rather than 0.5. Starter click-to-apogee becomes ~11.74 s rather than ~10.24 s. Do not extend startup to a long 5–10 second wait merely to make a convenience purchase desirable.

The [review-only experiment](experiments/phase-2-ignition-playtest-report.json) reruns the current six production buying policies, 32 campaign seeds each, for the shipped values and 3-second candidates with base prices 12 and 14. It uses production physics, variance, derivation and reward/cost helpers. The shipped config/report are unchanged. Four seconds of decision time per launch is modeled, not human-measured.

| Policy | Shipped median completion | 3 s / 12 Credits | 3 s / 14 Credits |
| --- | ---: | ---: | ---: |
| Cheapest | 18.83 min | 19.52 min | 19.51 min |
| Throughput | 18.58 min | 19.15 min | 19.40 min |
| Ignition first | 18.90 min | 19.40 min | 19.65 min |
| Engine hoarding | 19.39 min | 20.67 min | 21.06 min |
| Random affordable | 18.90 min | 19.50 min | 19.76 min |
| Physical gain, **physical caps only** | 19.62 min | 20.94 min | 20.94 min |

Base 12 satisfies the request to sit with the other prices (Airframe 12, Engine 14, Fuel 16), while preserving more of the approved early pacing: ordinary candidate medians to 500 m are ~3.25–3.96 min, to 1 km ~8.24–8.96 min; physical-only play reaches them in ~2.45 / 8.07 min. Deliberate Engine hoarding remains the known slower exception (~9.12 / 12.86 min). Base 14 pushes some ordinary median 1 km routes beyond 9 min without a clear experiential benefit. Neither candidate changes the 729-build physical envelope; all audit metrics match baseline.

**Do not implement this by editing `opening-v2` in place.** Live saves and recipes validate historical Ignition against that version. If the candidate is adopted, use `opening-v3` for new balance, retain a frozen approved `opening-v2` definition for historical recipe validation/replay, and migrate progression explicitly. Preserve owned levels, Credits, best, counters and last recipe; no retroactive charges, awards or forced reset. Old recipes retain their old version and old ignition delay, while new launches derive from v3. Schema 1 can remain if its shape is unchanged; balance-version migration still needs validation, source preservation/backup and failure tests. Physics/RNG versions need not change because their algorithms do not change. Update literal version types/validators accordingly. This is the first real deployed-save balance migration, so keep it isolated and reviewable.

## Luna implementation order and acceptance

1. **Presentation repair:** observed-flight camera, world references, visible physical upgrade identity and historical result rendering. Implement the pure mapping first, then draw against it. No Ignition/economy change in this commit.
2. **Usability:** visible Settings/New game, safe reset dialog, local purchase confirmation and truthful record/duration labels. This may accompany the presentation commit if still small and reviewable.
3. **Short before/after experience check:** demonstrate the starter, first Engine/Fuel/Airframe upgrades and a later ~1 km flight in normal and reduced motion. The user should be able to recognize extra height from passed landmarks and the previous-best line without relying only on the number. Resolve this before adding more scenery.
4. **Separate Ignition candidate and migration:** only after the scene repair, implement the recommended candidate with versioned save/replay compatibility and regenerated campaign report. Check its longer initial wait and more meaningful first upgrade in a fresh-save comparison. Do not turn a spreadsheet improvement into an untested claim that Ignition now feels good.

Required checks for the presentation/usability pass:

- Buying an upgrade changes cards/Credits but never the currently displayed completed flight's camera, trace, recipe appearance or recorded result.
- Two traces with the same shown prefix but different future apogees have identical camera transforms. Different configured rockets start with the same pad view and meters-per-pixel at a given viewport size.
- Rocket anchor, ruler, current guide, visible record and world reference positions agree within 1 CSS px, including after resize and during camera translation. Test 0, 160, 300, 500, 1000 and 1700 m, desktop and 390×844. Offscreen references are labeled indicators, not false coordinate-clamped lines.
- Each first physical upgrade visibly changes its own feature on the next launch; historical replay still shows its old configuration. Engine appearance must no longer ignore Engine level.
- New game is discoverable from the initial viewport. Opening/canceling/exporting from its dialog preserves progress; confirmed reset uses the existing atomic command and reports save failures accurately.
- No new rewards/unlocks are attached to scenery; no predicted altitude, future systems or camera auto-fit leaks into the UI. No gameplay RNG is consumed by art/camera code.
- Existing settlement, seed/replay, save and build tests pass; extend browser checks for purchase-preserved framing, camera travel and reset discoverability. Re-run local and Pages suites **sequentially** unless artifact directories are isolated.
- Record reviewed/published SHAs and actual observations in this handoff/ROADMAP. Final release acceptance stays pending until the reported experiential defects are resolved; the two original sessions are already recorded, not reset to “zero sessions.”

## Evidence and limits of this review

Independent typecheck, **55 unit tests in 9 files**, and root production build pass on `38590e3`. Read current UI/camera/config/report code and relevant design/physics/balance/architecture instructions. A separate Playwright browser session opened live Pages, completed a ~162 m / 19-Credit first flight, bought Engine for 14, and located Reset under expanded Settings. It did not alter the user's browser save. The live console had a `/favicon.ico` 404; no application exception was observed in those interactions. CLI initially lacked its default Chrome path; using the installed Playwright Chromium resolved inspection. This is a focused experience check, not a rerun of every release-browser scenario or a third human playtest.

Camera/landmark suggestions fit Phase 2 because they make existing altitude and upgrade mechanics perceptible. They do not require a Phase 3 milestone system. Further mechanism expansion should wait until this existing loop feels satisfying.

## Luna presentation/usability implementation

The scoped correction is implemented in commit `07c205d` on `codex/phase-2-playtest-revisions`. It does not change `opening-v2`, the approved Credits curve, the seeded variance model or the Ignition balance. The separate 3-second / 12-Credit Ignition candidate remains deferred for a versioned follow-up.

Implemented behavior:

- `src/presentation/worldCamera.ts` uses a fixed 300 m world span and follows the highest altitude actually presented so far. The ruler, trace, current guide, personal-best line, rocket fin-tip anchor and authored scenery all use the same transform; no predicted apogee or future trace is used for framing.
- `RocketCanvas` now includes persistent launchpad/service-tower artwork, authored cloud layers and a labeled offscreen launchpad reference. The world scale stays constant as higher flights translate the view.
- `src/presentation/rocketAppearance.ts` gives Engine, Fuel Tank and Airframe distinct cumulative silhouette signals while preserving the physical altitude anchor. Completed flights retain their historical recipe and framing after a purchase; the next paid launch uses the new artwork.
- The header exposes `Settings` and `New game`. Settings opens and scrolls into view, while New game presents Export save, Cancel and confirmed Reset progress actions. Purchase confirmation appears beside the purchased card. Result copy now says `Personal best` and `Flight time`.

Verification for this correction: 56 unit tests, typecheck, root production build, unchanged balance report, 5 local browser tests and 2 Pages-subpath browser tests pass. A real local browser session confirmed ignition-to-flight presentation, a completed starter flight, Engine/Fuel visual progression, camera translation beyond the initial band, the offscreen launchpad indicator, purchase-preserved completed-flight framing and the visible Settings/New game controls. Final live Pages verification and Phase 2 acceptance remain pending merge/deployment and Astra review.
