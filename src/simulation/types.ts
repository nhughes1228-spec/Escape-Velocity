import type { VehicleSpec } from '../game/vehicle';

export type FlightOutcome = 'apogee' | 'noLiftoff' | 'impact' | 'invalid' | 'limit';
export type TracePhase = 'pad' | 'poweredAscent' | 'coast' | 'result';

export interface VerticalState {
  timeS: number;
  altitudeM: number;
  velocityMps: number;
  fuelKg: number;
  phase: Exclude<TracePhase, 'result'>;
}

export interface TraceSample {
  timeS: number;
  altitudeM: number;
  velocityMps: number;
  fuelKg: number;
  phase: TracePhase;
}

export type FlightEventType = 'burnout' | FlightOutcome;

export interface FlightEvent {
  type: FlightEventType;
  timeS: number;
}

export interface SimulationEnvironment {
  gravityMps2: number;
  radiusM: number;
  densityKgM3: number;
  scaleHeightM: number;
}

export interface SimulationOptions {
  dtS: number;
  maxTimeS: number;
  fuelEpsilonKg: number;
  traceIntervalS: number;
  balanceVersion?: string;
  modelVersion?: string;
  collectTrace?: boolean;
}

export interface FlightResult {
  balanceVersion: string;
  modelVersion: string;
  vehicle: VehicleSpec;
  outcome: FlightOutcome;
  maximumAltitudeM: number;
  terminalTimeS: number;
  terminalFuelKg: number;
  burnoutTimeS: number | null;
  events: FlightEvent[];
  trace: TraceSample[];
}
