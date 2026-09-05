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
  if (typeof root.balanceVersion !== 'string' || root.balanceVersion.length === 0) {
    throw new Error('Opening balance must include a balanceVersion.');
  }
  if (typeof root.modelVersion !== 'string' || root.modelVersion.length === 0) {
    throw new Error('Opening balance must include a modelVersion.');
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
  for (const [sectionName, section] of Object.entries({ engine, fuel, airframe, ignition })) {
    const cap = finite(section.cap, `upgrades.${sectionName}.cap`);
    if (!Number.isInteger(cap) || cap < 0) throw new Error(`Upgrade cap ${sectionName} must be a non-negative integer.`);
    positive(section.baseCost, `upgrades.${sectionName}.baseCost`);
  }
  positive(engine.thrustPerLevel, 'upgrades.engine.thrustPerLevel');
  positive(engine.exhaustPerLevel, 'upgrades.engine.exhaustPerLevel');
  positive(engine.massKgPerLevel, 'upgrades.engine.massKgPerLevel');
  positive(fuel.capacityPerLevel, 'upgrades.fuel.capacityPerLevel');
  positive(fuel.tankKgPerLevel, 'upgrades.fuel.tankKgPerLevel');
  positive(airframe.massDivisorPerLevel, 'upgrades.airframe.massDivisorPerLevel');
  positive(airframe.dragDivisorPerLevel, 'upgrades.airframe.dragDivisorPerLevel');
  positive(ignition.initialDelayS, 'upgrades.ignition.initialDelayS');
  positive(ignition.reductionSPerLevel, 'upgrades.ignition.reductionSPerLevel');
  positive(ignition.minimumDelayS, 'upgrades.ignition.minimumDelayS');

  const curve = record(root.costCurve, 'costCurve');
  nonNegative(curve.linear, 'costCurve.linear');
  nonNegative(curve.quadratic, 'costCurve.quadratic');
  const income = record(root.income, 'income');
  nonNegative(income.baseCredits, 'income.baseCredits');
  nonNegative(income.sqrtAltitudeCoefficient, 'income.sqrtAltitudeCoefficient');
  if (!Array.isArray(root.milestones)) throw new Error('Opening balance milestones must be an array.');

  const milestones = root.milestones.map((item, index) => {
    const milestone = record(item, `milestones[${index}]`);
    if (typeof milestone.id !== 'string' || milestone.id.length === 0) throw new Error(`Milestone ${index} needs an id.`);
    nonNegative(milestone.altitudeM, `milestones[${index}].altitudeM`);
    nonNegative(milestone.credits, `milestones[${index}].credits`);
    return milestone;
  });

  return value as OpeningBalance;
}

export const openingBalance = validateOpeningBalance(rawBalance);
