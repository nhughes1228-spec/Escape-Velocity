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
  maxIntegrationSteps: number;
  maxTraceSamples: number;
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
  delaysS: number[];
}

export interface VarianceConfig {
  varianceVersion: 'engine-variation-v1';
  prngVersion: 'mulberry32-v1';
  amplitude: number;
}

export interface OpeningBalance {
  balanceVersion: 'opening-v2';
  modelVersion: 'vertical-v1.1';
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
  variance: VarianceConfig;
  milestones: Array<{ id: string; altitudeM: number; credits: number }>;
}
