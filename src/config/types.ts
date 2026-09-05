export interface EnvironmentConfig {
  gravityMps2: number;
  radiusM: number;
  densityKgM3: number;
  scaleHeightM: number;
}

export interface SimulationConfig {
  dtS: number;
  maxTimeS: number;
  fuelEpsilonKg: number;
  traceIntervalS: number;
}

export interface VehicleBaseConfig {
  structureKg: number;
  engineKg: number;
  fuelKg: number;
  thrustN: number;
  exhaustVelocityMps: number;
  dragAreaM2: number;
}

export interface EngineUpgradeConfig {
  cap: number;
  baseCost: number;
  thrustPerLevel: number;
  exhaustPerLevel: number;
  massKgPerLevel: number;
}

export interface FuelUpgradeConfig {
  cap: number;
  baseCost: number;
  capacityPerLevel: number;
  tankKgPerLevel: number;
}

export interface AirframeUpgradeConfig {
  cap: number;
  baseCost: number;
  massDivisorPerLevel: number;
  dragDivisorPerLevel: number;
}

export interface IgnitionUpgradeConfig {
  cap: number;
  baseCost: number;
  initialDelayS: number;
  reductionSPerLevel: number;
  minimumDelayS: number;
}

export interface OpeningBalance {
  balanceVersion: string;
  modelVersion: string;
  environment: EnvironmentConfig;
  simulation: SimulationConfig;
  vehicle: VehicleBaseConfig;
  upgrades: {
    engine: EngineUpgradeConfig;
    fuel: FuelUpgradeConfig;
    airframe: AirframeUpgradeConfig;
    ignition: IgnitionUpgradeConfig;
  };
  costCurve: { linear: number; quadratic: number };
  income: { baseCredits: number; sqrtAltitudeCoefficient: number };
  milestones: Array<{ id: string; altitudeM: number; credits: number }>;
}
