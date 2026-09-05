import type { VehicleSpec } from '../game/vehicle';
import type {
  FlightEvent,
  FlightOutcome,
  FlightResult,
  SimulationEnvironment,
  SimulationOptions,
  TracePhase,
  TraceSample,
  VerticalState,
} from './types';

const DEFAULT_BALANCE_VERSION = 'unknown-balance';
const DEFAULT_MODEL_VERSION = 'vertical-v1';
const EPSILON = 1e-9;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function validVehicle(vehicle: VehicleSpec): boolean {
  return (
    finite(vehicle.dryMassKg) && vehicle.dryMassKg > 0 &&
    finite(vehicle.fuelMassKg) && vehicle.fuelMassKg >= 0 &&
    finite(vehicle.thrustN) && vehicle.thrustN >= 0 &&
    finite(vehicle.exhaustVelocityMps) && vehicle.exhaustVelocityMps > 0 &&
    finite(vehicle.dragAreaM2) && vehicle.dragAreaM2 >= 0 &&
    finite(vehicle.ignitionDelayS) && vehicle.ignitionDelayS >= 0
  );
}

function validEnvironment(environment: SimulationEnvironment): boolean {
  return (
    finite(environment.gravityMps2) && environment.gravityMps2 >= 0 &&
    finite(environment.radiusM) && environment.radiusM > 0 &&
    finite(environment.densityKgM3) && environment.densityKgM3 >= 0 &&
    finite(environment.scaleHeightM) && environment.scaleHeightM > 0
  );
}

function validOptions(options: SimulationOptions): boolean {
  return (
    finite(options.dtS) && options.dtS > 0 &&
    finite(options.maxTimeS) && options.maxTimeS > 0 &&
    finite(options.fuelEpsilonKg) && options.fuelEpsilonKg >= 0 &&
    finite(options.traceIntervalS) && options.traceIntervalS > 0
  );
}

export function gravityAt(heightM: number, environment: SimulationEnvironment): number {
  const heightAbovePad = Math.max(heightM, 0);
  return environment.gravityMps2 * (environment.radiusM / (environment.radiusM + heightAbovePad)) ** 2;
}

export function densityAt(heightM: number, environment: SimulationEnvironment): number {
  return environment.densityKgM3 * Math.exp(-Math.max(heightM, 0) / environment.scaleHeightM);
}

export function signedDragForceN(
  velocityMps: number,
  dragAreaM2: number,
  heightM: number,
  environment: SimulationEnvironment,
): number {
  return 0.5 * densityAt(heightM, environment) * dragAreaM2 * velocityMps * Math.abs(velocityMps);
}

export function accelerationMps2(
  heightM: number,
  velocityMps: number,
  massKg: number,
  thrustN: number,
  vehicle: VehicleSpec,
  environment: SimulationEnvironment,
): number {
  return (thrustN - signedDragForceN(velocityMps, vehicle.dragAreaM2, heightM, environment)) / massKg -
    gravityAt(heightM, environment);
}

export function initialVerticalState(vehicle: VehicleSpec, powered: boolean): VerticalState {
  return {
    timeS: 0,
    altitudeM: 0,
    velocityMps: 0,
    fuelKg: vehicle.fuelMassKg,
    phase: powered ? 'poweredAscent' : 'coast',
  };
}

/**
 * Advances one pure explicit-midpoint step. This is intentionally exposed as
 * a small domain seam for analytic and integrator tests; the launch loop below
 * is responsible for event splitting and pad contact.
 */
export function advanceVerticalState(
  state: VerticalState,
  durationS: number,
  vehicle: VehicleSpec,
  environment: SimulationEnvironment,
  powered: boolean,
): VerticalState {
  if (!finite(durationS) || durationS < 0) throw new RangeError('Advance duration must be non-negative.');
  if (!validVehicle(vehicle) || !validEnvironment(environment)) throw new RangeError('Invalid state advance inputs.');
  const thrustN = powered && state.fuelKg > 0 ? vehicle.thrustN : 0;
  const massKg = vehicle.dryMassKg + Math.max(0, state.fuelKg);
  const qKgPerS = thrustN / vehicle.exhaustVelocityMps;
  const a0 = accelerationMps2(state.altitudeM, state.velocityMps, massKg, thrustN, vehicle, environment);
  const midpointFuel = Math.max(0, state.fuelKg - qKgPerS * durationS / 2);
  const midpointHeight = state.altitudeM + state.velocityMps * durationS / 2;
  const midpointVelocity = state.velocityMps + a0 * durationS / 2;
  const midpointMass = vehicle.dryMassKg + midpointFuel;
  const am = accelerationMps2(midpointHeight, midpointVelocity, midpointMass, thrustN, vehicle, environment);
  return {
    timeS: state.timeS + durationS,
    altitudeM: state.altitudeM + midpointVelocity * durationS,
    velocityMps: state.velocityMps + am * durationS,
    fuelKg: Math.max(0, state.fuelKg - qKgPerS * durationS),
    phase: powered && state.fuelKg - qKgPerS * durationS > 0 ? 'poweredAscent' : 'coast',
  };
}

interface Collector {
  readonly enabled: boolean;
  readonly samples: TraceSample[];
  nextSampleTime: number;
  add(sample: TraceSample): void;
  sampleStep(state: VerticalState): void;
}

function createCollector(enabled: boolean, intervalS: number, initial: TraceSample): Collector {
  const samples = enabled ? [initial] : [];
  return {
    enabled,
    samples,
    nextSampleTime: intervalS,
    add(sample) {
      if (!enabled) return;
      const previous = samples[samples.length - 1];
      if (previous && Math.abs(previous.timeS - sample.timeS) <= EPSILON) {
        samples[samples.length - 1] = sample;
      } else {
        samples.push(sample);
      }
    },
    sampleStep(state) {
      if (!enabled) return;
      while (this.nextSampleTime <= state.timeS + EPSILON) {
        // Samples use the first completed integration state crossing each
        // boundary. Their resolution is presentation data, not solver dt.
        this.add({ ...state, phase: state.phase });
        this.nextSampleTime += intervalS;
      }
    },
  };
}

function appendEvent(events: FlightEvent[], type: FlightEvent['type'], timeS: number): void {
  events.push({ type, timeS });
}

function resultFor(
  vehicle: VehicleSpec,
  options: SimulationOptions,
  outcome: FlightOutcome,
  maximumAltitudeM: number,
  terminalTimeS: number,
  terminalFuelKg: number,
  burnoutTimeS: number | null,
  events: FlightEvent[],
  collector: Collector,
  terminalTrace: TraceSample,
): FlightResult {
  collector.add(terminalTrace);
  return {
    balanceVersion: options.balanceVersion ?? DEFAULT_BALANCE_VERSION,
    modelVersion: options.modelVersion ?? DEFAULT_MODEL_VERSION,
    vehicle: { ...vehicle },
    outcome,
    maximumAltitudeM: Math.max(0, maximumAltitudeM),
    terminalTimeS: Math.max(0, terminalTimeS),
    terminalFuelKg: Math.max(0, terminalFuelKg),
    burnoutTimeS,
    events: [...events],
    trace: [...collector.samples],
  };
}

function invalidResult(vehicle: VehicleSpec, options: SimulationOptions): FlightResult {
  const safeVehicle = { ...vehicle };
  const collector = createCollector(Boolean(options.collectTrace), options.traceIntervalS, {
    timeS: 0,
    altitudeM: 0,
    velocityMps: 0,
    fuelKg: finite(vehicle.fuelMassKg) && vehicle.fuelMassKg >= 0 ? vehicle.fuelMassKg : 0,
    phase: 'result',
  });
  const events: FlightEvent[] = [];
  appendEvent(events, 'invalid', 0);
  return resultFor(safeVehicle, options, 'invalid', 0, 0, 0, null, events, collector, {
    timeS: 0,
    altitudeM: 0,
    velocityMps: 0,
    fuelKg: 0,
    phase: 'result',
  });
}

export function simulateVertical(
  vehicle: VehicleSpec,
  environment: SimulationEnvironment,
  options: SimulationOptions,
): FlightResult {
  if (!validVehicle(vehicle) || !validEnvironment(environment) || !validOptions(options)) {
    return invalidResult(vehicle, options);
  }

  const traceEnabled = options.collectTrace !== false;
  const qKgPerS = vehicle.thrustN / vehicle.exhaustVelocityMps;
  const initiallyPowered = vehicle.fuelMassKg > options.fuelEpsilonKg && qKgPerS > 0;
  const initial = initialVerticalState(vehicle, initiallyPowered);
  const collector = createCollector(traceEnabled, options.traceIntervalS, {
    ...initial,
    phase: initiallyPowered ? 'poweredAscent' : 'coast',
  });
  const events: FlightEvent[] = [];

  if (!initiallyPowered || vehicle.thrustN === 0) {
    appendEvent(events, 'noLiftoff', 0);
    return resultFor(vehicle, options, 'noLiftoff', 0, 0, vehicle.fuelMassKg, null, events, collector, {
      timeS: 0,
      altitudeM: 0,
      velocityMps: 0,
      fuelKg: vehicle.fuelMassKg,
      phase: 'result',
    });
  }

  // A positive-gravity pad holds the rocket until thrust exceeds current
  // weight. Fuel is still consumed while supported by the pad.
  let timeS = 0;
  let altitudeM = 0;
  let velocityMps = 0;
  let fuelKg = vehicle.fuelMassKg;
  let phase: Exclude<TracePhase, 'result'> = 'pad';
  let burnoutTimeS: number | null = null;
  let maximumAltitudeM = 0;

  if (environment.gravityMps2 > 0 && vehicle.thrustN <= vehicle.dryMassKg * environment.gravityMps2) {
    const burnTimeS = fuelKg / qKgPerS;
    for (let sampleTimeS = options.traceIntervalS; sampleTimeS < burnTimeS - EPSILON; sampleTimeS += options.traceIntervalS) {
      collector.add({ timeS: sampleTimeS, altitudeM: 0, velocityMps: 0, fuelKg: Math.max(0, fuelKg - qKgPerS * sampleTimeS), phase: 'pad' });
    }
    fuelKg = 0;
    appendEvent(events, 'burnout', burnTimeS);
    appendEvent(events, 'noLiftoff', burnTimeS);
    return resultFor(vehicle, options, 'noLiftoff', 0, burnTimeS, fuelKg, burnTimeS, events, collector, {
      timeS: burnTimeS,
      altitudeM: 0,
      velocityMps: 0,
      fuelKg: 0,
      phase: 'result',
    });
  }

  if (environment.gravityMps2 > 0 && vehicle.thrustN < (vehicle.dryMassKg + fuelKg) * environment.gravityMps2) {
    const fuelAtLiftKg = vehicle.thrustN / environment.gravityMps2 - vehicle.dryMassKg;
    const padDurationS = (fuelKg - fuelAtLiftKg) / qKgPerS;
    for (let sampleTimeS = options.traceIntervalS; sampleTimeS < padDurationS - EPSILON; sampleTimeS += options.traceIntervalS) {
      collector.add({ timeS: sampleTimeS, altitudeM: 0, velocityMps: 0, fuelKg: Math.max(0, fuelKg - qKgPerS * sampleTimeS), phase: 'pad' });
    }
    timeS = padDurationS;
    fuelKg = Math.max(0, fuelAtLiftKg);
    phase = 'poweredAscent';
    collector.add({ timeS, altitudeM: 0, velocityMps: 0, fuelKg, phase });
  } else {
    phase = 'poweredAscent';
  }

  while (timeS < options.maxTimeS - EPSILON) {
    const powered = fuelKg > options.fuelEpsilonKg && qKgPerS > 0;
    const thrustN = powered ? vehicle.thrustN : 0;
    const remainingS = options.maxTimeS - timeS;
    const burnRemainingS = powered ? fuelKg / qKgPerS : Number.POSITIVE_INFINITY;
    const durationS = Math.min(options.dtS, remainingS, burnRemainingS);
    if (!finite(durationS) || durationS <= 0) {
      return invalidResult(vehicle, options);
    }

    const massKg = vehicle.dryMassKg + fuelKg;
    const a0 = accelerationMps2(altitudeM, velocityMps, massKg, thrustN, vehicle, environment);
    const midpointFuelKg = Math.max(0, fuelKg - (powered ? qKgPerS * durationS / 2 : 0));
    const midpointAltitudeM = altitudeM + velocityMps * durationS / 2;
    const midpointVelocityMps = velocityMps + a0 * durationS / 2;
    const midpointMassKg = vehicle.dryMassKg + midpointFuelKg;
    const am = accelerationMps2(
      midpointAltitudeM,
      midpointVelocityMps,
      midpointMassKg,
      thrustN,
      vehicle,
      environment,
    );
    const nextAltitudeM = altitudeM + midpointVelocityMps * durationS;
    const nextVelocityMps = velocityMps + am * durationS;
    const nextFuelKg = powered ? Math.max(0, fuelKg - qKgPerS * durationS) : fuelKg;
    const nextTimeS = timeS + durationS;

    if (![a0, am, nextAltitudeM, nextVelocityMps, nextFuelKg, nextTimeS].every(finite)) {
      appendEvent(events, 'invalid', timeS);
      return resultFor(vehicle, options, 'invalid', maximumAltitudeM, timeS, fuelKg, burnoutTimeS, events, collector, {
        timeS,
        altitudeM: Math.max(0, altitudeM),
        velocityMps,
        fuelKg,
        phase: 'result',
      });
    }

    const burnoutAtEnd = powered && nextFuelKg <= options.fuelEpsilonKg;
    if (velocityMps > 0 && nextVelocityMps <= 0) {
      const averageAccelerationMps2 = (nextVelocityMps - velocityMps) / durationS;
      const tauS = Math.min(durationS, Math.max(0, -velocityMps / averageAccelerationMps2));
      const peakAltitudeM = Math.max(altitudeM, altitudeM + velocityMps * tauS + 0.5 * averageAccelerationMps2 * tauS ** 2);
      const terminalFuelKg = powered ? Math.max(0, fuelKg - qKgPerS * tauS) : fuelKg;
      const terminalTimeS = timeS + tauS;
      if (burnoutAtEnd && Math.abs(tauS - durationS) <= EPSILON) {
        fuelKg = 0;
        burnoutTimeS = nextTimeS;
        appendEvent(events, 'burnout', nextTimeS);
      }
      appendEvent(events, 'apogee', terminalTimeS);
      return resultFor(vehicle, options, 'apogee', peakAltitudeM, terminalTimeS, terminalFuelKg, burnoutTimeS, events, collector, {
        timeS: terminalTimeS,
        altitudeM: peakAltitudeM,
        velocityMps: 0,
        fuelKg: terminalFuelKg,
        phase: 'result',
      });
    }

    if (nextAltitudeM < 0 && nextVelocityMps < 0) {
      const altitudeSpanM = altitudeM - nextAltitudeM;
      const impactDurationS = altitudeSpanM > 0
        ? Math.min(durationS, Math.max(0, durationS * altitudeM / altitudeSpanM))
        : durationS;
      const impactTimeS = timeS + impactDurationS;
      const impactFuelKg = powered ? Math.max(0, fuelKg - qKgPerS * impactDurationS) : fuelKg;
      const impactVelocityMps = velocityMps + (nextVelocityMps - velocityMps) * (impactDurationS / durationS);
      appendEvent(events, 'impact', impactTimeS);
      return resultFor(vehicle, options, 'impact', maximumAltitudeM, impactTimeS, impactFuelKg, burnoutTimeS, events, collector, {
        timeS: impactTimeS,
        altitudeM: 0,
        velocityMps: impactVelocityMps,
        fuelKg: impactFuelKg,
        phase: 'result',
      });
    }

    timeS = nextTimeS;
    altitudeM = Math.max(0, nextAltitudeM);
    velocityMps = nextVelocityMps;
    fuelKg = nextFuelKg <= options.fuelEpsilonKg ? 0 : nextFuelKg;
    maximumAltitudeM = Math.max(maximumAltitudeM, altitudeM);
    collector.sampleStep({ timeS, altitudeM, velocityMps, fuelKg, phase });

    if (burnoutAtEnd) {
      fuelKg = 0;
      phase = 'coast';
      burnoutTimeS = timeS;
      appendEvent(events, 'burnout', timeS);
      collector.add({ timeS, altitudeM, velocityMps, fuelKg, phase });
    }
    if (phase === 'poweredAscent' && !powered) phase = 'coast';
  }

  appendEvent(events, 'limit', timeS);
  return resultFor(vehicle, options, 'limit', maximumAltitudeM, timeS, fuelKg, burnoutTimeS, events, collector, {
    timeS,
    altitudeM,
    velocityMps,
    fuelKg,
    phase: 'result',
  });
}
