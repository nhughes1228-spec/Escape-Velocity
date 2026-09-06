# Phase 1 audit and Phase 2 implementation specification

> Playtest follow-up (2026-09-05): [PHASE_2_PLAYTEST_REVISIONS.md](PHASE_2_PLAYTEST_REVISIONS.md) records two human sessions and authorizes the next presentation/usability pass. Its observed-flight world camera supersedes B1/F nominal-capability framing. The proposed Ignition retune is a separate modeled candidate; shipped `opening-v2` values remain unchanged until a versioned implementation. Other domain, reward, variance and save requirements below continue to apply.

Review date: 2026-09-05. Reviewed code: `87cbc30` on `main`, after fetching `origin`; initial working tree clean. This specification authorizes a bounded implementation handoff, not a claim that Phase 2 exists. Application code and active balance configuration were not changed during this review. The design experiment imports the production solver.

For Phase 2, this document supersedes the older opening-v1 **Ignition pricing/delay, replay and persistence proposals** where explicitly noted below. Physical upgrade formulas and income remain unchanged. Phase 3 milestone grants remain outside Phase 2. See the [candidate configuration](experiments/phase-2-candidate.json), [experiment](experiments/phase-2-probe.ts), and [measured report](experiments/phase-2-report.json). Luna must move approved candidate values into runtime configuration during implementation; UI must not import design experiments.

## A. Phase 1 verdict

**Safe to extend after the narrow prerequisites in B. No simulation rewrite or game engine is warranted.** The nominal opening envelope is numerically sound. Midpoint integration, decreasing propellant mass, exact partial burnout steps, inverse-square gravity, exponential density, signed quadratic drag, coasting and interpolated apogee agree with the intended model. All 729 opening vehicles reach apogee, have positive initial liftoff margin and remain convergent when dt is halved. Ignition already lives on the derived vehicle and stays out of force calculations.

The fixed-starter assumption is localized mainly in the launch reducer and UI copy/defaults. Vehicle derivation already supports all four systems. Traces and simulation time are separate from presentation time. A result envelope is a good extension point for seeds and historical flight recipes; vector or stage abstractions are not needed now.

Current verification:

| Check | Result |
| --- | --- |
| Remote/current branch | `main` and `origin/main` both `87cbc30`; clean before review |
| `npm run typecheck` | Pass |
| `npm test -- --run` | 4 files, 13 tests pass |
| `npm run build` | Pass |
| `npm run test:e2e` | 3 Chromium tests pass |
| `npm run test:e2e:pages` | 2 tests pass, including missing-bundle recovery |
| `npm run balance:report` | Pass; no tracked report difference |
| Live Pages | Loaded; immediate ignition feedback; 160 m / 8.74 s result; second flight completed on normal wall clock |
| Live console | No application exception; one `/favicon.ico` 404, classified as cosmetic below |

Live URL: <https://nhughes1228-spec.github.io/Escape-Velocity/>. The tested live JS/CSS filenames match the local reviewed Pages build. Browser inspection used a controlled presentation clock for the first launch and ordinary foreground time for the second. This is not a Phase 2 playtest.

The two earlier UX issues are **not simply still untouched**: countdown/progress/pad feedback fixes the no-feedback ignition problem; shared altitude mapping fixes the old independent-coordinate problem for the desktop starter. A subsequent silhouette clamp still breaks alignment near the top, especially with upgraded vehicles. See B1.

### Technical audit coverage

- Fixed dt=1/120 and midpoint mass/thrust handling: retain. Mass flow q=T/ve and exact fuel-boundary splitting are coherent. No direct altitude multiplier is needed.
- Burnout/coast: final powered partial step consumes fuel, then emits one burnout and updates the event trace to coast. Retain nominal behavior.
- Gravity/atmosphere/drag: lightweight and suitable for this ~1.65 km envelope; changing Mach regimes is not a Phase 2 problem.
- Pad/liftoff: analytic fuel consumption while supported is physically reasonable, but ignores duration/iteration budgets and initially labels the trace as ascent. Correct boundary handling; do not remove pad support.
- Apogee: positive-to-nonpositive velocity crossing with a within-step approximation is adequate at validated dt. The small distinction between midpoint position advancement and average-acceleration event interpolation is below the measured tolerance here. No RK4 rewrite.
- Traces: deterministic for fixed inputs; event samples preserve burnout/apogee. The initial pad phase and collector scheduling after a pad hold need correction. Ordinary sample interpolation belongs to presentation.
- Limits/validation: positive finite inputs alone are insufficient to guarantee bounded runtime (arbitrarily tiny dt or trace interval). Add work budgets. Do not accept solver timing/environment controls from progress saves.
- Replay: current “Launch again” runs a fresh deterministic starter simulation; it is not a distinct archived replay. Phase 2 must separate paid new launch and unpaid replay before rewards exist.
- Tests: the full envelope test is valuable; analytic tests partly exercise a duplicated step helper rather than the actual integration kernel. The ballistic test checks one real step, then merely computes expected apogee/time constants without comparing a terminal event. Improve coverage as described in C.

## B. P0 — must fix before Phase 2

Here P0 means **prerequisite before enabling the paid/configurable loop**, as requested. These are not claims of catastrophic loss in the current fixed-rocket release.

### B1. Altitude anchor is moved after the shared mapping

**Evidence:** `src/ui/RocketCanvas.tsx:157–163`. `currentAltitudeY` is mapped correctly, then `boundedRocketCenterY` pushes the silhouette down to keep its nose inside the sky. The guide, ruler and trace do not receive that correction. At a 310 px canvas and 500 m current/peak height, scale max becomes 600 m; mapped Y is 67 px, but the clamped fin-tip anchor is 115 px, equivalent to **376.92 m**. The starter on mobile is off by only about 3 px, which explains why the initial correction can look acceptable. Upgrades make it conspicuous.

**Correction:** reserve silhouette headroom in the shared altitude scale, then use the exact mapped anchor for rocket, guide, trace and ruler. For current silhouette the anchor-to-nose height is 87 px. Define the upper anchor plane as a top margin plus the maximum illustrative silhouette height (including upgrades); all altitude values map to anchor coordinates. Never clamp only the rocket. Derive the scale from nominal capability and record, not the hidden random actual peak: freeze a rounded range at launch (e.g. next 100 m above max(250, record*1.1, nominalPeak*1.1)); this keeps same-config launches comparable and avoids leaking the seed's outcome through the ruler. Headroom is pixel geometry, not altitude inflation. Resize via ResizeObserver; redraw idle/result scenes too.

**Ownership:** Luna implements; Astra approves the invariant. **Deferral cost:** high for perceived progress, low code cost now. **Tests:** anchor→meter inversion at 0, 160, 500, 1000 and 1700 m across 310/380 px heights, every silhouette size, and resize at idle/ascent/result; actual rendered anchor within 1 CSS px of the guide.

### B2. Solver's pad paths bypass its termination budget

**Evidence:** `src/simulation/vertical.ts:248–274`. Reproduce with starter vehicle, thrust 70 N and `maxTimeS=0.1`: solver returns `noLiftoff` at **11.428571 s**. With thrust 90 N it returns `limit` at **3.655796 s**. Both exceed the requested 0.1 s; pad trace loops also run even when `collectTrace:false`. Extreme but finite inputs can spend unbounded time in those loops. At t=0 the trace incorrectly says `poweredAscent` during pad support.

**Correction:** cap pad duration at remaining simulation time; consume fuel only through that interval. If the cap precedes liftoff/burnout, return `limit` at the cap with remaining fuel and no fictitious burnout. Select pad phase before the first sample; advance the collector's next sample boundary after the hold. Skip sample loops when trace disabled. Bound integration steps (300,000) and trace samples (20,000) in central simulation config; count work in every branch, detect non-advancing floating-point time, return a diagnostic `limit` with reason instead of hanging. A pad interval can jump analytically; it must not iterate at an untrusted microscopic sample interval. At an event exactly on the time cap, process the physical event first; otherwise cap wins.

**Ownership:** Luna; Astra verifies the edge-case tests. **Deferral cost:** medium, especially once flight recipes are imported. The approved opening including variance does not enter pad support, so current players are not stuck by this defect. **Tests:** both reproductions end at 0.1 s, nonzero fuel, bounded traces; exact-cap burnout ordering; delayed liftoff within cap; trace off; tiny dt/interval budget exhaustion completes promptly.

### B3. Establish new-flight/replay and one-time settlement boundaries first

**Evidence:** `src/game/reducer.ts:43–62` always derives `starterLevels` and recomputes inside the reducer. This is fine for Phase 1; adding randomness or storage inside that function would make React re-evaluation capable of changing seeds or duplicating side effects.

**Correction:** pure reducer plus a single serialized command boundary. Acquire a seed once outside reducer/render; prepare a copied flight recipe/result once; admit only if idle/result and expected run ID matches. Persist the run reservation before playback. Settling an active **new** launch atomically updates Credits, counts, record, award summary and saved recipe once; replay is a separate read-only mode. All phase/completion callbacks carry run ID and playback ID so late callbacks from replay or prior runs are rejected. The UI never submits altitude or award amounts. See G/H for exact semantics.

**Ownership:** Luna under this spec; Astra reviews at checkpoint L before full UI integration. **Deferral cost:** high; a reward or save implementation built on ambiguous replay semantics would require rework. This is an architectural prerequisite, not an existing duplicate-Credits bug (Credits do not exist yet).

## C. P1 — fix during early Phase 2

| Issue / evidence | Why it matters and correction | Owner; deferral cost |
| --- | --- | --- |
| `scripts/balance-report.ts:67` subtracts the last flown altitude after every purchase in a buying batch | After one purchase the base is stale, so later choices are not marginal-gain/Credit. Recompute from current levels after each buy; separate Phase 2 no-grant policies from Phase 3 grants and import shared economy helpers. The review probe does this. Existing nominal fixtures stay valid. | Luna; medium |
| `advanceVerticalState` and main loop independently implement midpoint integration | Analytic tests can pass while production diverges. Share one pure free-flight kernel (pad/events remain in solver), validate helper state/duration or make preconditions explicit, and test the actual ballistic/apogee event path plus delayed liftoff. Do not change equations. | Luna; medium |
| New-record text compares result with the already updated record (`App.tsx`, result detail) | Equal repeats currently celebrate “New session record.” Compute strict `h > recordBefore` at settlement; persist `recordBeforeM` and `isNewRecord` in award summary. Replay says “Replay — no reward,” never a new achievement. | Luna; low now, high if used for bonuses |
| Balance validator accepts fractional Credits/base cost and duplicate milestone IDs; versions are arbitrary strings | Before saves/economy, validate supported versions, safe integer caps/prices/rewards, unique IDs where used, explicit ignition delay table and finite bounded derivation. Keep configuration validation separate from imported-save validation. | Luna; medium |
| Fixed starter reducer/UI defaults and fixed-size silhouette | Launch must snapshot owned levels; ready-state display derives from current levels, archived replay from historical levels. Show clear tank/engine/body visual changes with stable altitude anchor. Remove “fixed starter” copy. | Luna; medium |
| Whole React tree updates every animation frame; changing altitude and ignition countdown sit in live regions | Remove per-frame live announcements; announce phase transitions/award/purchase only. Limit DOM telemetry to ≤10 Hz, use presentation time for canvas. Seed generation and storage must not happen per render/frame. Separate animation subscription if profiling warrants it. | Luna; medium |
| Deployment job currently runs Pages browser checks but can publish independently of typecheck/unit CI | Add typecheck/unit tests to the deployment build prerequisites (or make deployment depend on an equivalent successful verification job). Add seeded/save/purchase flows to local and Pages browser tests. | Luna; medium |

## D. P2 — can defer

| Item | Recommendation | Owner; deferral cost |
| --- | --- | --- |
| Worker, detailed performance infrastructure | Opening simulation and tests are fast. Measure worst seeded build on target hardware; retain synchronous preparation if <50 ms. Do not build a worker framework preemptively. | Luna measures, Astra only if it stalls; low |
| Staging/orbit/general environment registry | Keep typed model/version on recipe/result and pure solver boundaries. No stage graph, vector engine, environment selection or aircraft fidelity work. | Astra later; low with current boundaries |
| Long history, best-flight trace saves, cloud/accounts, offline income, variance reduction tech | Last launch recipe is enough. None belongs in Phase 2. | Astra design later; low |
| Favicon 404 and additional art polish | Add a Pages-base-aware favicon when convenient. It is not the old broken-bundle defect. Keep live release error checks honest. | Luna; low |
| Unavoidable small late marginal choices | Worst tank-only edge is ~0.19% altitude at a variance endpoint, so independent flights can overlap. Balanced level-5 increments are ~4.48% Engine, 9.22% Fuel, 5.84% Airframe nominal. Do not promise every random post-purchase flight beats a previous lucky flight; test typical play and explain small natural variation. Consider late tuning only if players actually stall. | Astra after playtest; low |

## E. Phase 2 economy specification

One spendable currency: **Credits**, displayed as an integer. Start with 0. Fuel/refurbishment and new attempts are free. For actual authoritative apogee h in unrounded meters:

```text
reward = 4 + floor(1.2 * sqrt(max(0, h)))  // only outcome === apogee
```

Other outcomes and aborted launches pay 0. Minimum qualifying reward is 4. Starter earns **19 Credits** over the full approved variance range. Use actual performance, not the nominal estimate, record, or a replay's copied result. A paid new launch below the record pays normally. Award rounding happens once; display rounding never enters the formula. No record bonus, first-flight grant, streak, offline payout or milestone payout in Phase 2. Existing milestone data remains dormant for Phase 3 and must not be accidentally included by shared report code.

UI summary: “Reached 160 m · +19 Credits”; an optional simple explanation says “Higher flights earn more; returns taper as altitude increases.” A tooltip/details line may show `4 base + floor(1.2 × √altitude in meters)`; do not require algebra to play. The taper supports repeated progress without exponential income. Do not substitute “one Credit per meter”: it changes all purchase pacing.

Use one pure `rewardFor(result)` and one `costFor(kind,currentLevel)` shared by state and report tooling. Buy exactly one level per action. Enforce sufficient safe-integer balance, not active/replay, valid kind and below cap; subtract exactly its current price and increment one level in the same transition. Stale repeated actions recalculate cost/cap against current state, not a quoted UI price. No refunds/loadout controls are needed for the audited opening envelope.

## F. Upgrade specification

Retain physical curves and caps from opening-v1. Starting levels are all zero. All owned levels are equipped. For e=Engine, f=Fuel, a=Airframe:

```text
T = 160 * (1 + 0.18*e) N
ve = 400 * (1 + 0.035*e) m/s
fuel = 2 * (1 + 0.22*f) kg
dry = 6/(1 + 0.10*a) + 2 + 0.12*e + 0.15*f kg
CdA = 0.012/(1 + 0.12*a) m²
q = T/ve kg/s; burnDuration = fuel/q s
```

Additive engine/tank curves and rational diminishing airframe returns are deliberate. No independent altitude, income or burn-duration multiplier.

| System | Cap | Next-level price, current level L | Player-facing consequence |
| --- | ---: | --- | --- |
| Engine | 8 | ceil(14 × (1 + 0.6L + 0.18L²)) | Stronger push; slightly heavier engine and faster fuel use; first upgrade ~193.33 m nominal |
| Fuel Tank | 8 | ceil(16 × (1 + 0.6L + 0.18L²)) | More fuel, heavier rocket, longer burn; first upgrade ~203.64 m nominal |
| Airframe | 8 | ceil(12 × (1 + 0.6L + 0.18L²)) | Lighter structure and reduced drag; first upgrade ~192.65 m nominal |
| Ignition | 4 | ceil(8 × (1 + 0.6L + 0.18L²)) | Shorter countdown, same physical flight and per-flight reward |

Prices for successive purchases: Engine **14,25,41,62,88,119,156,197**; Fuel **16,29,47,71,101,136,178,225**; Airframe **12,22,36,54,76,102,133,169**; Ignition **8,15,24,36**. Prices use mathematical ceiling; use an integer implementation such as `ceil(baseCost*(100+60L+18L²)/100)` to avoid binary-float ceiling errors at integer boundaries. Verify the listed integer vectors; the report uses the same integer formula. No discrepancy was found for the approved price vectors; this makes rounding intent explicit.

**Ignition changes:** replace linear delay derivation with central table **[1.5,1.0,0.6,0.3,0.1] seconds** for levels 0–4. The 0.1 s floor feels nearly instant but preserves visible input acknowledgement. No artificial countdown rounding to an extra second. Existing progress bar reads actual duration. First upgrade saves 0.5 s, compared with the old 0.3 s at a much higher price. Higher levels have diminishing absolute time savings. Total cost is 83 Credits; no altitude or physical mass change. The first flight can fund any one physical upgrade, or Ignition with Credits left over. No purchase order tutorial is mandatory.

Cards show name, current level, next cost and one primary effect plus a concise tradeoff. Examples: “Engine Lv. 0 — stronger thrust; uses fuel faster”; “Fuel Tank Lv. 0 — longer burn; heavier rocket”; “Airframe Lv. 0 — lighter and more streamlined”; “Ignition Lv. 0 — countdown 1.5 s → 1.0 s.” Optional friendly stat detail may show nominal burn time, but not TWR, ve, q, CdA, delta-v or full mass budgets initially. **Do not show estimated apogee on purchase cards**: flight results should reveal the improvement. Keep nominal simulation available internally for balanced camera ranges and reports.

The first physical gains are 20.3–27.1%, far larger than starter noise. Engine keeps early round duration almost unchanged; Fuel buys more altitude but longer observation; Airframe improves both mass and aerodynamic losses; Ignition improves throughput only. No one system should receive an undocumented reward multiplier to force usage.

## G. Seeded variance specification

Use **one per-flight combustion-performance factor**. No per-timestep draws, atmospheric noise, random mass, random fuel quantity or independent engine/fuel dice. At nominal fixed mass flow, slightly different effective exhaust speed also changes thrust. This is a credible simple physical input, not a claim to model actual combustion instability.

For nominal derived vehicle and k:

```text
k = 1 + 0.006*z
z = u1 + u2 - 1                        // symmetric triangular support [-1,1]
actual.thrustN = nominal.thrustN * k
actual.exhaustVelocityMps = nominal.exhaustVelocityMps * k
```

All other physical parameters/environment and ignition delay remain nominal. q=T/ve remains constant within floating-point tolerance; thrust and exhaust speed are perfectly positively correlated. Fuel capacity, dry mass, drag and countdown never jitter. Hold k fixed throughout the launch. Physical input mean is nominal; nonlinear altitude mean is only approximately nominal, not corrected afterward. Central IDs: `varianceVersion='engine-variation-v1'`, `prngVersion='mulberry32-v1'`.

Exact unsigned 32-bit algorithm (seed zero is valid):

```ts
function makeLaunchRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Validate uint32 BEFORE coercion; don't silently truncate imported values.
const next = makeLaunchRng(seed);
const k = 1 + amplitude * (next() + next() - 1);
```

Consume exactly the first two draws, in that order. Do not consume this stream for visuals, UI, IDs, tests or buying-strategy randomness. Version any change to algorithm, draw order, interpretation or amplitude. Production gameplay obtains a uint32 with `crypto.getRandomValues(new Uint32Array(1))[0]` once per admitted new-launch command, outside React render/reducer. Tests inject the seed source. Never use Date.now or Math.random as a silent fallback. A new draw need not yield a distinct rounded meter value; repeated rounded outcomes and rare seed collisions are normal. Do not reject “boring” draws, force alternating outcomes or re-roll until an upgrade looks good.

Golden factors at amplitude .006: seed 0 → **0.9956005537263117**; 1 → **0.9977788579706103**; 42 → **1.0002963658655062**; 4294967295 → **1.000515405225102**. Exact agreement is expected in the JS implementation. Golden solver comparisons use existing numeric tolerances across runtimes.

Measured bounds (forcing z=-1/+1, not estimating extrema from a sample):

- Starter **157.283095–163.070630 m**, about ±1.8%. Across seeds 0–4095: mean 160.171209 m, 5th–95th percentile 158.209452–162.107701 m. The full bounds are intentionally rarer than central values.
- Full 729-build endpoint sweep: **-2.866824% to +2.870800%** altitude relative to nominal; minimum initial TWR **1.101737**. No non-apogee results or negative same-condition upgrade edges at k=.994,1,1.006. Maximum dt-halving altitude difference **0.00005874 m**.
- These are sampled-build/endpoint audits, not a universal theorem of monotonicity in arbitrary rocket parameters. Phase 2 tests add fixed seeds across the same envelope and forbid post-hoc output clamps.

This is preferable to imposing ±3% on every vehicle: near-liftoff builds are more sensitive, and normal builds don't need artificial output normalization. Early physical gains >20% remain obvious. Different seeds before/after a very small marginal upgrade can reverse the observed order; same seed/config/version reproduces a flight. Keep seed/k in saved flight details/debug export, hidden from ordinary UI. Optional explanatory text: “Small engine variations make each launch a little different.” No variance-reduction upgrade now.

**Paid launch versus replay:** primary Launch/Launch again uses current levels, new run ID and fresh seed and can earn Credits. A secondary “Replay last flight” reconstructs the recorded recipe (including original ignition) or plays its verified cached trace; it never acquires a seed, spends Credits, updates record, increments gameplay launch counts, pays a reward or replays a purchase. Show “Replay — no reward.” Replay stays reproducible after subsequent purchases and reloads. Stop replay may return immediately to the previous summary. No auto-launch, fast-forward or paid early result button.

## H. Save-state specification

One localStorage key **`escape-velocity.save`**, plus best-effort **`escape-velocity.save.backup`**. No cloud/backend/accounts. Use a single JSON envelope, not independently saved currency/levels/record keys. Start `schemaVersion:1`; set runtime balance to `opening-v2` on implementation. B's solver contract fixes should carry a new model version (`vertical-v1.1`) even though nominal fixture numbers remain unchanged. Phase 1 has no durable progress to migrate.

Proposed structure:

```ts
type SaveV1 = {
  gameId: 'escape-velocity';
  schemaVersion: 1;
  balanceVersion: 'opening-v2';
  revision: number; // safe nonnegative integer; changes on durable mutation
  progress: {
    credits: number;
    levels: {engine:number; fuel:number; airframe:number; ignition:number};
    bestAltitudeM: number; // raw meters
    launchesStarted: number;
    launchesCompleted: number; // all newly settled terminal outcomes; excludes replay/abort
    nextRunId: number; // initially 1; equals launchesStarted + 1
    lastSettledRunId: number | null;
  };
  settings: { motion: 'system' | 'reduced' | 'full' };
  lastLaunch: null | {
    runId: number;
    status: 'started' | 'settled' | 'interrupted';
    recipe: {
      seed: number; // uint32
      balanceVersion: string;
      modelVersion: string;
      varianceVersion: 'engine-variation-v1';
      prngVersion: 'mulberry32-v1';
      levels: {engine:number; fuel:number; airframe:number; ignition:number};
      nominalVehicle: VehicleSpec;
      effectiveVehicle: VehicleSpec;
      conditionK: number;
      environment: SimulationEnvironment;
      simulation: SimulationOptions; // copied approved numeric settings, not executable data
    };
    summary: null | {
      outcome: FlightOutcome;
      maximumAltitudeM: number;
      terminalTimeS: number;
      burnoutTimeS: number | null;
      terminalFuelKg: number;
      rewardCredits: number;
      recordBeforeM: number;
      isNewRecord: boolean;
    };
  };
};
```

Current vehicle, prices, income preview, burn time, available purchases and UI visibility are **derived** from current levels/config. The vehicle/environment/options copies above are immutable **historical recipe inputs**, never a second source for current progression. They enable debugging after later purchases or balance edits. Retain only the latest new launch, not an unbounded history. No saved traces, canvas/camera positions, active animation time, particles or offline timestamps. No milestone IDs are needed in Phase 2; Phase 3 introduces earned milestones with a schema migration rather than unused scaffolding now.

The command boundary synchronously serializes changes against the latest authoritative state (not a stale React closure). It calls the pure reducer, attempts one complete primary save write, then publishes the new state to React. A small controller/store with a React subscription suffices; no Redux/ECS required. StrictMode must never execute seed acquisition or storage side effects twice. Before playback, `startLaunch` reserves/increments the ID/count, saves the seeded recipe as `started`, and prepares its immutable result. `settle` accepts only the currently active paid launch, computes reward/new record from the **previous** progress, increments completed count, stores summary/settled ID and clears the active transient state. Duplicate settlement is a no-op with no revision/write.

On reload, a `started` recipe becomes `interrupted`, no reward/count-completion/record update, and the game opens idle. There is no instant-payout refresh shortcut. Keep that recipe for unpaid replay/debug; the next paid launch uses a fresh ID/seed. Purchases and settings do not overwrite `lastLaunch`. A reload after settlement restores the summary and cannot settle again because no active launch is reconstructed. Playback/hidden-tab pause state is transient.

### Validation and recovery

- Treat parsed JSON as unknown. Validate game/version, required shape, settings enum, safe nonnegative integer Credits/counts/revision, level caps, integer IDs and uint32 seeds **before** coercion/derivation. `nextRunId=launchesStarted+1`; completed≤started; settled ID≤started. Reject overflow before a command rather than wrap IDs or money.
- Raw heights/time/fuel must be finite and nonnegative, outcomes recognized, summary present iff settled, archived ID valid. For a recognized recipe version validate its levels, rederive nominal inputs, reproduce k/effective inputs and check copied approved environment/options. Validate correlations instead of accepting arbitrary imported thrust, dt or claim of paid reward. Imports are player-controlled local data, not a multiplayer anti-cheat system; no signing/encryption service.
- Only replay a recognized model/recipe version. If future code no longer supports a historical solver, retain its summary and progression, label replay unavailable rather than silently recompute with new physics. Unknown/future **save schema or progression balance version** requires explicit migration/recovery; never silently clamp owned levels or reset Credits.
- Max import/save input 1 MB, checked before parsing. Malformed/corrupt/future saves remain untouched in storage and are offered as raw export with a valid backup recovery option. Do not mount autosaving fresh progress over them. Explicit reset/replacement requires an in-game confirmation and offers export first. A new temporary session can play without overwriting the protected raw save.
- Migrations are pure sequential functions, validate before/after and retain the source until successful write. No imaginary Phase 1 save format. An import replaces current progress only after validation and explicit user confirmation, never adds Credits or re-awards archived results; imports are disabled during flight/replay.
- Autosave on launch reservation, settlement, purchase, settings change, confirmed import/reset and interrupted-launch reconciliation. No storage writes per animation frame. Before replacing a valid primary save, copy its raw string to backup best-effort; primary write is the atomic progress boundary. Backup failure alone does not invalidate a successful primary write.
- Catch storage access/quota/write failures, keep the current session playable, and show “Progress is not being saved” with export available. Report success only if the primary write actually succeeds. A later successful write contains the entire latest state; do not replay failed individual awards.
- Cross-tab scope: simultaneous gameplay in multiple tabs is unsupported in Phase 2. Listen for storage changes and suspend stale-tab commands, including pending completion; before every durable command compare primary revision/raw identity with the last observed value and offer reload on conflict. This reduces accidental overwrites but is not a cross-tab transaction. Do not promise race-free multi-tab play. Strong locking is deferred; no cloud merge policy.

**Import/export is required now**, tucked under Settings, because browser-local progress needs recovery. Export raw current in-memory progress if storage is failing, and export protected raw input when corruption is blocking load. A copied JSON recipe is data only; it must never cause script execution or remote requests.

## I. Early-game pacing targets

Keep the existing physical caps; Phase 2 is a satisfying **15–25 minute opening demo**, not a 10 km era. Show a simple completion message when all four systems reach their caps, with continued optional paid launches/replay and no unreachable next objective. No new rewards/currency/technology in that message.

All measurements below use production physics with seeded candidate conditions, **no milestone grants**, 1× playback, and 4 s assumed review/decision time per launch (including that round's purchases). Buying policies recompute marginal value after each purchase. 32 deterministic campaign seeds per policy; these are models, not human-playtest claims. Completion means the final purchase; add ~21 s to demonstrate the final rocket.

| Observable | Target / measured candidate |
| --- | --- |
| First flight | Nominal 160.17 m; full variance bounds 157.28–163.07 m |
| First reward / upgrade | 19 Credits; one launch, about 10.24 s to result; typically <20 s including choice |
| After five launches | Typical mixed choices ~250–350 m; deliberately buying only Ignition can remain ~160 m while shortening waits |
| 500 m | Typical 2–4 minutes / 8–14 launches; engine-only hoarding can delay to ~8.3 minutes |
| 1 km | Typical 7–9 minutes / 23–29 launches without grants; engine-first stress route ~11.6 minutes |
| After 10 minutes | Typical ~1.1 km; engine-first stress route ~0.79 km |
| After 15 minutes | Typical ~1.35–1.45 km |
| Full physical capability | Nominal 1,647.88 m, about 19–20 minutes in modeled strategies; do not market 5 km as reachable |
| 5 km | Outside approved Phase 2 envelope; provisional later-content cumulative target 20–30 minutes, requiring new calibration |
| 10 km | Outside approved Phase 2 envelope; provisional later-content cumulative target 25–40 minutes, requiring new calibration |

Representative campaign seed 1:

| Strategy | Fifth flight | 500 m | 1 km | Completion |
| --- | ---: | ---: | ---: | ---: |
| Cheapest affordable across all four | 290 m | 3.39 min | 7.90 min | 56 launches / 18.83 min |
| Marginal altitude/Credit, physical only | 350 m | 2.25 min | 7.46 min | 52 launches / 19.25 min (Ignition unbought) |
| Marginal reward/active-second per Credit | 254 m | 3.26 min | 8.40 min | 56 launches / 18.58 min |
| Max Ignition first, then cheapest | 160 m | 3.45 min | 7.97 min | 57 launches / 18.90 min |
| Max Engine first, then cheapest | 242 m | 8.29 min | 11.63 min | 66 launches / 19.46 min |
| Seeded random affordable choices | 254 m | 3.39 min | 7.92 min | 56 launches / 19.01 min |

Across these 192 runs, final-purchase times span about **18.58–19.73 min** (physical-only route has a different completion condition, explicitly above). Typical modeled maximum no-purchase gaps are 3 launches; engine-first voluntarily waiting for expensive engine levels produces 6. The mild RNG rarely changes rounded starter income, so playtime spread is small. This is desired: variation creates flight texture, not a lottery economy. These greedy policies do not prove global optimality or strategic depth; add save-for-best/lookahead policies and human sessions before tuning further.

Bounded caps, physically interacting additive/rational curves, square-root income and quadratic prices prevent runaway within this opening. First physical purchases are much larger than RNG. Late fuel-only purchases can be marginal, so good UI must convey weight tradeoffs without declaring every purchase a record. A bad-order player is slower, but can always earn toward the other systems. Do not change to geometric thrust multipliers to hit 5/10 km prematurely.

Round duration stays manageable: starter ~10.24 s click-to-apogee; balanced capped vehicle ~20.66 s physical time plus 0.1–1.5 s ignition. No mandatory coast after apogee, result-dismiss delay, recovery countdown or refueling purchase. Results and buys are immediately actionable. Keep clock→trace→settlement boundaries capable of later acceleration; do not implement accelerated coast, early payout, auto-launch or offline gains now.

## J. Luna implementation plan

1. **Inspect current state and fix B1/B2 with regression tests.** Keep nominal fixtures unchanged. Update model version and explain event-limit changes. Do not mix economy UI into this correction.
2. **Implement pure Phase 2 domain functions and immutable recipe.** Move candidate values into versioned runtime config, derive new Ignition table, centralize integer prices/reward, add exact PRNG and seeded conditions, snapshot recipe and replay distinction. Update validators. Production solver has no RNG calls.
3. **Implement serialized commands and persistence.** Reserve run/seed once, one-time award, purchases, strict record detection, save validation/recovery/import/export, interrupted-load policy and stale-tab handling. Domain/browser integration tests first; no broad visual polish.
4. **Astra checkpoint L.** Submit a reviewable commit and seed/pacing/save evidence before coupling all four cards to persistence.
5. **Build the focused UI.** Credits, record, Launch, immediate countdown, accurate canvas, actual reward and four cards. Disable purchases during paid/replay playback. Show a clear primary new launch and secondary unpaid replay. Persist settings, accessible announcements, visible silhouette changes. Hide future controls and estimated apogee.
6. **Verify and playtest.** Run all K checks, update the report to import production Phase 2 helpers (retire the review-only helper copies), run multiple 15–25 minute human sessions with different purchase orders, report timing observations, then deploy the verified commit to Pages and inspect it live. Update ROADMAP and handoff with exact checked/published SHAs and remaining limitations.

Use descriptive commits on a `codex/` branch and re-inspect recent work before edits/staging. No broad implementation was performed as part of this audit; every correction above remains a Luna task.

## K. Phase 2 acceptance criteria

- [ ] B1 shared anchor/headroom/resize regressions and B2 bounded pad/iteration regressions pass; nominal Phase 1 altitude/time fixture unchanged within documented tolerances.
- [ ] New valid gameplay launches earn `4+floor(1.2*sqrt(actual h))` once. Non-apogee, aborted, replayed, stale and duplicate settlements pay zero. Below-record **new** flights pay normally. No grants from dormant milestone data.
- [ ] Credits, counts, levels and raw best height persist across reload; purchases and settlement save complete envelopes. Double-click, StrictMode, hidden-tab resume and late callbacks cannot duplicate IDs, seeds, purchases or rewards.
- [ ] Each of four upgrades can be purchased from level 0 through its cap; listed price vectors are exact; insufficient funds/invalid kind/cap/overflow rejected without partial state mutation. First flight can fund each physical option individually.
- [ ] Engine/Fuel/Airframe affect their documented physical parameters and production trajectories. Tank always adds propellant and structural mass; Engine changes flow through T/ve; Airframe cannot remove engine/tank mass. Ignition alone changes presentation time and leaves the same-seed physical trace/reward unchanged.
- [ ] Ignition countdowns follow [1.5,1.0,0.6,0.3,0.1] s and acknowledge input immediately even at the minimum. No hidden extra countdown second.
- [ ] PRNG golden vectors pass, including seed 0 and uint32 max; invalid seeds rejected. Exactly two draws per prepared flight; no Math.random/date dependence; no physical draws from rendering.
- [ ] Same seed + historical levels + model/balance/variance versions + environment/options reproduce the effective vehicle, events, trace and result. Replay after purchase and after reload uses the old recipe and awards nothing. Unsupported historical replay versions preserve summary/progress rather than silently changing history.
- [ ] Full physical envelope at nominal and both k endpoints lifts, reaches finite apogee within limits, has nonnegative fuel/positive mass, no negative same-condition physical-upgrade edges, and satisfies dt-halving tolerances. Add seeds 0–31 per build; endpoint relative altitude stays within ±3.0% for the approved model, with no output correction.
- [ ] Starter seeds 0–4095 approximately reproduce report mean/percentiles (mean within 0.05 m, p05/p95 within 0.1 m); all endpoint starter results yield 19 Credits. Distinct seeds need not yield distinct rounded meters. Default gameplay repeatedly shows small natural variance without user seed controls.
- [ ] Corrupt/future/oversized saves, invalid levels/numbers/IDs, imported recipes with unsafe simulation inputs, migration failure and localStorage failure are covered. Valid backups/import/export work; protected bad input is never silently overwritten. Reload midflight yields no reward; duplicate import never adds reward. Cross-tab conflict suspends writes; limitations documented.
- [ ] Paid new launch and unpaid replay are visibly distinct; record equality does not celebrate a new record. Previous/actual result and award explain income. No estimated apogee, seed/noise controls or aerospace telemetry wall in ordinary UI.
- [ ] Rocket/guide/ruler/readout agree at 0–1700 m within 1 CSS px at desktop/mobile sizes and after resizing. Purchased physical systems visibly alter the silhouette without moving its anchor. Same-config camera framing does not disclose the random future peak.
- [ ] Keyboard launch/buy/replay, readable costs, visible focus, reduced-motion preference and 390×844 layout work. Essential numeric/phase labels must wrap instead of being misleadingly clipped. Screen-reader announcements occur on phase/result/purchase, not each altitude/countdown tick.
- [ ] Seeded report reproduces approved nominal/endpoint fixtures and no-grant pacing using shared production helpers. Standard strategies buy a useful upgrade in one launch, make visible progress within five launches, reach 500 m in 2–4 min and 1 km in 7–9 min under modeled assumptions, and finish the finite demo around 15–25 min. Deliberate Ignition-only/Engine-hoarding exceptions are documented, not failed by an impossible universal assertion.
- [ ] At least two human sessions validate purchase clarity, perceived upgrade gain, variance and late waiting. Record observations rather than equating a passing solver report with “fun.” No 5/10 km promise for the capped demo.
- [ ] `npm ci`, typecheck, unit suite, root production build, local Playwright, Pages-subpath Playwright and production balance report all pass. Deployment requires verification success. Live Pages launch→award→buy→improved launch→reload→unpaid replay works at the published SHA, without application console errors or broken JS/CSS assets. Cosmetic errors are recorded explicitly.
- [ ] ROADMAP, GAME_DESIGN, PHYSICS, BALANCE, ARCHITECTURE, README and implementation handoff match the shipped rules, versions, save/replay behavior and known limitations. No staging, orbit, payloads, missions, research tree, prestige, secondary currency, catastrophic RNG failures, detailed engine families or auto-launch added.

## L. Recommended Astra checkpoint

Bring Astra back **after J3 is committed and domain/save tests plus the production seeded balance report pass, before J5's full UI integration**. Request a read-only audit of the actual commit: B1/B2 fixes, recipe/seed determinism, replay eligibility, one-time award/purchase transactions, corrupted/interrupted-save handling, no-grant pacing and upgrade signal relative to variance. Provide commit SHA, test commands/results, generated report, and any proposed deviations. This is the point where mathematical/state-contract mistakes are cheap to fix.

Then request a short release review after two human Phase 2 sessions and live Pages verification, concentrating on real pacing and whether upgrades are perceptible. Do not wait for orbit or a larger technology tree to judge this loop.
