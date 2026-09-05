import rawBalance from '../../balance/opening.json';
import type { OpeningBalance } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Opening balance value ${label} must be finite.`);
  }
  return value;
}

function positive(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number <= 0) throw new Error(`Opening balance value ${label} must be positive.`);
  return number;
}

function nonNegative(value: unknown, label: string): number {
  const number = finite(value, label);
  if (number < 0) throw new Error(`Opening balance value ${label} must be non-negative.`);
  return number;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Opening balance section ${label} is missing.`);
  return value;
}

export function validateOpeningBalance(value: unknown): OpeningBalance {
  const root = record(value, 'root');
  if (root.balanceVersion !== 'opening-v2') {
    throw new Error('Opening balance balanceVersion must be opening-v2.');
  }
  if (root.modelVersion !== 'vertical-v1.1') {
    throw new Error('Opening balance modelVersion must be vertical-v1.1.');
  }

  const environment = record(root.environment, 'environment');
  positive(environment.gravityMps2, 'environment.gravityMps2');
  positive(environment.radiusM, 'environment.radiusM');
  nonNegative(environment.densityKgM3, 'environment.densityKgM3');
  positive(environment.scaleHeightM, 'environment.scaleHeightM');

  const simulation = record(root.simulation, 'simulation');
  positive(simulation.dtS, 'simulation.dtS');
  positive(simulation.maxTimeS, 'simulation.maxTimeS');
  nonNegative(simulation.fuelEpsilonKg, 'simulation.fuelEpsilonKg');
  positive(simulation.traceIntervalS, 'simulation.traceIntervalS');
  for (const [key, value] of [
    ['maxIntegrationSteps', simulation.maxIntegrationSteps],
    ['maxTraceSamples', simulation.maxTraceSamples],
  ] as const) {
    const limit = finite(value, `simulation.${key}`);
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error(`Simulation limit ${key} must be a positive safe integer.`);
  }

  const vehicle = record(root.vehicle, 'vehicle');
  positive(vehicle.structureKg, 'vehicle.structureKg');
  positive(vehicle.engineKg, 'vehicle.engineKg');
  nonNegative(vehicle.fuelKg, 'vehicle.fuelKg');
  nonNegative(vehicle.thrustN, 'vehicle.thrustN');
  positive(vehicle.exhaustVelocityMps, 'vehicle.exhaustVelocityMps');
  nonNegative(vehicle.dragAreaM2, 'vehicle.dragAreaM2');

  const upgrades = record(root.upgrades, 'upgrades');
  const engine = record(upgrades.engine, 'upgrades.engine');
  const fuel = record(upgrades.fuel, 'upgrades.fuel');
  const airframe = record(upgrades.airframe, 'upgrades.airframe');
  const ignition = record(upgrades.ignition, 'upgrades.ignition');
  const ignitionCap = finite(ignition.cap, 'upgrades.ignition.cap');
  if (!Number.isSafeInteger(ignitionCap) || ignitionCap < 0) throw new Error('Upgrade cap ignition must be a non-negative safe integer.');
  for (const [sectionName, section] of Object.entries({ engine, fuel, airframe, ignition })) {
    const cap = finite(section.cap, `upgrades.${sectionName}.cap`);
    if (!Number.isSafeInteger(cap) || cap < 0) throw new Error(`Upgrade cap ${sectionName} must be a non-negative safe integer.`);
    const baseCost = positive(section.baseCost, `upgrades.${sectionName}.baseCost`);
    if (!Number.isSafeInteger(baseCost)) throw new Error(`Upgrade base cost ${sectionName} must be a safe integer.`);
  }
  positive(engine.thrustPerLevel, 'upgrades.engine.thrustPerLevel');
  positive(engine.exhaustPerLevel, 'upgrades.engine.exhaustPerLevel');
  positive(engine.massKgPerLevel, 'upgrades.engine.massKgPerLevel');
  positive(fuel.capacityPerLevel, 'upgrades.fuel.capacityPerLevel');
  positive(fuel.tankKgPerLevel, 'upgrades.fuel.tankKgPerLevel');
  positive(airframe.massDivisorPerLevel, 'upgrades.airframe.massDivisorPerLevel');
  positive(airframe.dragDivisorPerLevel, 'upgrades.airframe.dragDivisorPerLevel');
  const delaysS = ignition.delaysS;
  if (!Array.isArray(delaysS) || delaysS.length !== ignitionCap + 1) {
    throw new Error('Ignition delays must contain one value for every level, including level zero.');
  }
  delaysS.forEach((delay, index) => {
    const delayS = positive(delay, `upgrades.ignition.delaysS[${index}]`);
    const previousDelayS = index > 0 ? finite(delaysS[index - 1], `upgrades.ignition.delaysS[${index - 1}]`) : null;
    if (previousDelayS !== null && delayS > previousDelayS) {
      throw new Error('Ignition delays must not increase with level.');
    }
  });

  const curve = record(root.costCurve, 'costCurve');
  const linearCurve = nonNegative(curve.linear, 'costCurve.linear');
  const quadraticCurve = nonNegative(curve.quadratic, 'costCurve.quadratic');
  if (!Number.isInteger(linearCurve * 100) || !Number.isInteger(quadraticCurve * 100)) {
    throw new Error('Cost curve coefficients must be exact hundredths.');
  }
  const income = record(root.income, 'income');
  const baseCredits = nonNegative(income.baseCredits, 'income.baseCredits');
  if (!Number.isSafeInteger(baseCredits)) throw new Error('Income baseCredits must be a safe integer.');
  positive(income.sqrtAltitudeCoefficient, 'income.sqrtAltitudeCoefficient');

  const variance = record(root.variance, 'variance');
  if (variance.varianceVersion !== 'engine-variation-v1' || variance.prngVersion !== 'mulberry32-v1') {
    throw new Error('Opening variance versions are unsupported.');
  }
  const amplitude = positive(variance.amplitude, 'variance.amplitude');
  if (amplitude > 1) throw new Error('Opening variance amplitude must not exceed 1.');
  if (!Array.isArray(root.milestones)) throw new Error('Opening balance milestones must be an array.');

  const milestoneIds = new Set<string>();
  const milestones = root.milestones.map((item, index) => {
    const milestone = record(item, `milestones[${index}]`);
    if (typeof milestone.id !== 'string' || milestone.id.length === 0) throw new Error(`Milestone ${index} needs an id.`);
    if (milestoneIds.has(milestone.id)) throw new Error(`Milestone ${milestone.id} is duplicated.`);
    milestoneIds.add(milestone.id);
    nonNegative(milestone.altitudeM, `milestones[${index}].altitudeM`);
    const credits = nonNegative(milestone.credits, `milestones[${index}].credits`);
    if (!Number.isSafeInteger(credits)) throw new Error(`Milestone ${index} credits must be a safe integer.`);
    return milestone;
  });

  return value as OpeningBalance;
}

export const openingBalance = validateOpeningBalance(rawBalance);
