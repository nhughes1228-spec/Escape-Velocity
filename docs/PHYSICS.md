# Physics specification — vertical-v1.1

> Phase 2 integration deployed (2026-09-05): [PHASE_2_SPEC.md](PHASE_2_SPEC.md) remains the authoritative design handoff. Runtime is `vertical-v1.1` on the deployed Phase 2 `main`; the handoff explicitly supersedes earlier Ignition, replay and save proposals, while unchanged nominal formulas/fixtures remain valid.

Status: normative for the first playable simulation and Phase 2 seeded recipes. SI units throughout: kg, m, s, N, m/s, kg/s, kg/m³. This is an Earth-like toy model for interacting upgrades, not a flight planning tool. [BALANCE](BALANCE.md) owns parameters; this document owns equations and event semantics.

## Assumptions and state

One-dimensional, upright, full-throttle flight from sea level in still air. No lift, wind, heating, structural failures, nozzle pressure variation, attitude, Earth rotation or descent recovery. Constant effective exhaust velocity absorbs propulsion detail. Gravity decreases with height; atmosphere is an intentionally approximate single exponential.

Input is an immutable derived vehicle `{dryMassKg, fuelMassKg, thrustN, exhaustVelocityMps, dragAreaM2}` and environment/config version. `dragAreaM2` means Cd × frontal area, not area alone. Ignition is a separate presentation delay. State is `{timeS, altitudeM, velocityMps, fuelKg, phase}`; retain peak altitude and event times as result data. Time zero is ignition completion, not click time.

Validate all inputs before integration: finite values, dry mass > 0, fuel ≥ 0, thrust ≥ 0, exhaust speed > 0, drag area ≥ 0; valid positive radius, scale height, timestep and duration limit; gravity and density ≥ 0 for analytic test environments. Validate levels separately against the family caps. Invalid inputs must not enter a loop or grant a reward.

## Equations

For remaining fuel `f`, height `h`, signed upward velocity `v`:

```text
m = dryMass + f
T = thrust when f > fuelEpsilon, otherwise 0
q = T / exhaustVelocity                     # positive propellant mass flow
f' = -q
h' = v
g(h) = g0 * (R / (R + max(h, 0)))²
rho(h) = rho0 * exp(-max(h, 0) / scaleHeight)
D = 0.5 * rho(h) * dragArea * v * abs(v)    # signed drag
v' = (T - D) / m - g(h)
```

Do not add a second mass-change force: effective exhaust thrust already includes expelled momentum. `dryMass` includes structural, engine and empty-tank mass; fuel decreases during powered flight, dry mass does not. Burn duration is initial fuel / q. Extra fuel adds both propellant and tank mass; thrust need not burn for the same duration after an engine upgrade.

The simplified `T=q*exhaustVelocity` follows [NASA's thrust and specific impulse explanation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/). Signed quadratic drag follows the opposing-motion force convention described in [MIT's trajectory notes](https://web.mit.edu/16.unified/www/FALL/systems/Lab_Notes/traj.pdf). The exponential atmosphere and constant exhaust velocity here are game approximations. The [ideal rocket equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/) is a verification case, not a substitute for drag/gravity integration.

## Fixed timestep and integrator

Use explicit midpoint (RK2), nominal `dt=1/120 s`, JavaScript Number (64-bit floating point). Never derive integration dt from frame rate or playback speed. A bounded synchronous simulation is adequate for the opening; no physics engine dependency needed.

On each step, select `d=min(dt, remainingDuration, f/q)` when powered, excluding the fuel bound when q=0. This splits exactly at burnout rather than burning negative fuel. Snap fuel ≤ 1e-10 kg to zero. At a free-flight step start `(h,v,f)`, evaluate acceleration `a0` from the equations, then:

```text
hm = h + v*d/2
vm = v + a0*d/2
fm = f - q*d/2
am = acceleration(hm, vm, dryMass + fm, T)
hNext = h + vm*d
vNext = v + am*d
fNext = max(0, f - q*d)
```

The midpoint evaluation uses the same powered T for the entire partial step, including the last powered step. The next step is unpowered. Split event times from the nominal grid deterministically. Emit burnout once at exhausted fuel; zero starting fuel is already unpowered and emits no fictitious burn.

## Pad contact and launch termination

The pad supplies a normal force when `h=0, v=0` and thrust cannot lift current mass. Continue consuming fuel on the pad. If powered, find the time at which `dryMass+f` reaches `T/g0`; split a step there, stay at h=v=0 up to that point and then integrate the remaining interval freely. If g0=0, positive thrust lifts immediately. If thrust never exceeds dry weight before burnout, terminate `noLiftoff` at burnout. A zero-thrust rocket returns `noLiftoff` immediately instead of waiting forever. Negative altitude must not become a hidden tunnel under the pad. The runtime treats pad support analytically and bounds all integration and trace work with configured `maxIntegrationSteps` and `maxTraceSamples`. If a cap is reached, it returns `limit` at the cap with a diagnostic reason; it does not invent burnout, liftoff or apogee.

After liftoff, detect the first positive-to-nonpositive velocity crossing. For the crossing step use `aBar=(vNext-v)/d`, `tau=-v/aBar`, clamped to [0,d]. Approximate peak `hPeak=h+v*tau+0.5*aBar*tau²`; time is `t+tau`. Terminate `apogee`, even in an unusual vehicle that loses upward speed before burnout. Do not wait to descend. Retain terminal fuel with consumption only through tau. If this event coincides with burnout, record both in a defined order (burnout then apogee). Emit at most one terminal result.

Defensive impact detection terminates at a downward ground crossing after liftoff; interpolate to h=0. An ordinary upright launch ends at apogee first. `invalid` covers nonfinite intermediate state; `limit` covers the configured duration or work budget without another terminal event. These last two are diagnostic failures with no Credits, records or unlocks. Never silently present a duration cap as an apogee. User abort is an application action with no settlement.

Only `apogee` results qualify for altitude income and milestones in the opening. `noLiftoff`/`impact` pay zero; launches cost zero. UI explains recovery/configuration choices. Safety caps are guardrails, not balance targets; every supported opening build must reach apogee well inside them.

## Result and trace

Return model version, balance version, copied vehicle spec, outcome, maximum altitude, terminal simulated time, terminal fuel, burnout time (nullable), and sampled trace `{timeS, altitudeM, velocityMps, fuelKg, phase}`. Keep time-zero, events and final sample; sample ordinary trace at roughly 10 Hz (first integration state crossing each sample boundary). Events override sample deduplication. Trace resolution is not integrator resolution. Omit/disable trace collection for bulk balance sweeps.

## Determinism and stability

No wall clock, random numbers, DOM, storage or mutable configuration in the solver. Gameplay applies the versioned engine condition before entering the solver; the solver itself remains deterministic. Same inputs and versions reproduce the same result in one runtime; cross-runtime agreement is tolerance-based, not promised bitwise. Store versions with fixtures/results. Visual interpolation and particle randomness cannot affect awards.

Halve dt to 1/240 for convergence tests. Across the supported 0–8 opening physical levels require altitude difference ≤ max(0.1 m, 0.1% of fine result) and event-time difference ≤ 0.02 s. If these fail, fix numerical resolution/model envelope rather than widen tolerances blindly. Always maintain positive mass, nonnegative fuel and finite state. New high-thrust/low-mass families require a new convergence audit: fixed dt is not universally stable for quadratic drag.

Analytic tests: vacuum ballistic apogee `h0+v0²/(2g)` and time `v0/g`; zero-gravity/drag velocity gain `ve*ln(mInitial/mFinal)`; exact burnout `fuel/q`; drag opposes either sign of v. Add pad-support, fractional-step burnout, dry launch, invalid input, terminal idempotence and cap cases. Runtime state reducers separately test duplicate settlement and threshold accounting.

## Expansion to orbit

Keep `vertical-v1.1` as a stable module and fixture set. Later introduce an explicit `orbital-v1` model with planet-centered position/velocity vectors and thrust direction. Use `altitude=|r|-R`, gravity vector `-mu*r/|r|³`, and vector drag opposing air-relative velocity. Reuse vehicle derivation, balance IDs and result envelopes; do not fake horizontal motion by rotating the current altitude display.

At that phase specify surface initialization, guidance, integration accuracy, atmosphere reference frame, event detection and mission horizon together. Bound orbit requires negative specific energy and periapsis above the chosen atmosphere boundary; altitude alone is insufficient. Orbit does not terminate at the vertical solver's first apogee. Numerical energy/angular-momentum tests and orbital event fixtures are required before shipping. No vector engine, staging framework or N-body solver is needed in Phase 1.
