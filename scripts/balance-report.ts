import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openingBalance } from '../src/config/opening';
import { deriveVehicle, type RocketLevels } from '../src/game/vehicle';
import { simulateVertical } from '../src/simulation/vertical';

const root = resolve(import.meta.dirname, '..');
const physicalKinds = ['engine', 'fuel', 'airframe'] as const;

function flight(levels: RocketLevels, dtS = openingBalance.simulation.dtS) {
  const vehicle = deriveVehicle(levels, openingBalance);
  return simulateVertical(vehicle, openingBalance.environment, {
    ...openingBalance.simulation,
    dtS,
    balanceVersion: openingBalance.balanceVersion,
    modelVersion: openingBalance.modelVersion,
    collectTrace: false,
  });
}

function cost(kind: (typeof physicalKinds)[number], level: number): number {
  const upgrade = openingBalance.upgrades[kind];
  const curve = openingBalance.costCurve;
  return Math.ceil(upgrade.baseCost * (1 + curve.linear * level + curve.quadratic * level ** 2));
}

function income(heightM: number): number {
  return openingBalance.income.baseCredits +
    Math.floor(openingBalance.income.sqrtAltitudeCoefficient * Math.sqrt(Math.max(0, heightM)));
}

function campaign(policy: 'altitude_per_credit' | 'cheapest') {
  const levels = [0, 0, 0];
  let credits = 0;
  let seconds = 0;
  const claimed = new Set<string>();
  for (let launchNumber = 1; launchNumber <= 300; launchNumber += 1) {
    const currentLevels: RocketLevels = { engine: levels[0], fuel: levels[1], airframe: levels[2], ignition: 0 };
    const result = flight(currentLevels);
    seconds += openingBalance.upgrades.ignition.initialDelayS + result.terminalTimeS + 4;
    credits += income(result.maximumAltitudeM);
    for (const milestone of openingBalance.milestones) {
      if (result.maximumAltitudeM >= milestone.altitudeM && !claimed.has(milestone.id)) {
        credits += milestone.credits;
        claimed.add(milestone.id);
      }
    }
    if (result.maximumAltitudeM >= 1000) {
      return {
        launches: launchNumber,
        minutes: Math.round((seconds / 60) * 100) / 100,
        levels,
        altitudeM: Math.round(result.maximumAltitudeM * 100) / 100,
      };
    }
    while (true) {
      const choices: Array<{ score: number; index: number; price: number; levels: number[] }> = [];
      for (let index = 0; index < physicalKinds.length; index += 1) {
        const kind = physicalKinds[index];
        const currentLevel = levels[index];
        if (currentLevel >= openingBalance.upgrades[kind].cap) continue;
        const price = cost(kind, currentLevel);
        if (price > credits) continue;
        const nextLevels = [...levels];
        nextLevels[index] += 1;
        const next: RocketLevels = { engine: nextLevels[0], fuel: nextLevels[1], airframe: nextLevels[2], ignition: 0 };
        const gain = flight(next).maximumAltitudeM - result.maximumAltitudeM;
        choices.push({ score: policy === 'altitude_per_credit' ? gain / price : -price, index, price, levels: nextLevels });
      }
      if (choices.length === 0) break;
      choices.sort((left, right) => right.score - left.score || left.index - right.index);
      const choice = choices[0];
      credits -= choice.price;
      levels.splice(0, levels.length, ...choice.levels);
    }
  }
  return { unreached: true };
}

const rows = [];
let worstAltitudeDifferenceM = 0;
let worstTimeDifferenceS = 0;
let minimumPadTWR = Number.POSITIVE_INFINITY;
let negativeUpgradeEdges = 0;
for (let engine = 0; engine <= openingBalance.upgrades.engine.cap; engine += 1) {
  for (let fuel = 0; fuel <= openingBalance.upgrades.fuel.cap; fuel += 1) {
    for (let airframe = 0; airframe <= openingBalance.upgrades.airframe.cap; airframe += 1) {
      const levels: RocketLevels = { engine, fuel, airframe, ignition: 0 };
      const coarse = flight(levels);
      const fine = flight(levels, openingBalance.simulation.dtS / 2);
      if (coarse.outcome !== 'apogee' || fine.outcome !== 'apogee') throw new Error(`Build ${engine},${fuel},${airframe} did not reach apogee.`);
      const altitudeError = Math.abs(coarse.maximumAltitudeM - fine.maximumAltitudeM);
      const timeError = Math.abs(coarse.terminalTimeS - fine.terminalTimeS);
      if (altitudeError > Math.max(0.1, 0.001 * fine.maximumAltitudeM) || timeError > 0.02) {
        throw new Error(`Convergence failed for ${engine},${fuel},${airframe}.`);
      }
      worstAltitudeDifferenceM = Math.max(worstAltitudeDifferenceM, altitudeError);
      worstTimeDifferenceS = Math.max(worstTimeDifferenceS, timeError);
      const vehicle = deriveVehicle(levels, openingBalance);
      minimumPadTWR = Math.min(
        minimumPadTWR,
        vehicle.thrustN / ((vehicle.dryMassKg + vehicle.fuelMassKg) * openingBalance.environment.gravityMps2),
      );
      for (let index = 0; index < physicalKinds.length; index += 1) {
        const kind = physicalKinds[index];
        if (levels[kind] >= openingBalance.upgrades[kind].cap) continue;
        const nextLevels = { ...levels, [kind]: levels[kind] + 1 };
        if (flight(nextLevels).maximumAltitudeM < coarse.maximumAltitudeM) negativeUpgradeEdges += 1;
      }
    }
  }
}

for (const values of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [2, 2, 2], [4, 4, 4], [8, 8, 8]]) {
  const result = flight({ engine: values[0], fuel: values[1], airframe: values[2], ignition: 0 });
  rows.push({
    levels: values,
    altitudeM: Number(result.maximumAltitudeM.toFixed(6)),
    flightTimeS: Number(result.terminalTimeS.toFixed(6)),
    credits: income(result.maximumAltitudeM),
  });
}

const report = {
  balanceVersion: openingBalance.balanceVersion,
  modelVersion: openingBalance.modelVersion,
  scope: 'Production TypeScript solver; trace-free opening sweep and campaign comparison. Application/save/event behavior is covered by tests.',
  fixtures: rows,
  audit: {
    builds: (openingBalance.upgrades.engine.cap + 1) * (openingBalance.upgrades.fuel.cap + 1) * (openingBalance.upgrades.airframe.cap + 1),
    worstAltitudeDifferenceM,
    worstTimeDifferenceS,
    minimumPadTWR,
    negativeUpgradeEdges,
  },
  campaignAssumptions: '1x playback, 1.5 s ignition, 4 s decision time per launch, no ignition purchases; buy affordable physical upgrades until none remain; stable engine/fuel/airframe tie order.',
  campaigns: {
    altitude_per_credit: campaign('altitude_per_credit'),
    cheapest: campaign('cheapest'),
  },
};

const reportPath = resolve(root, 'docs/balance-report.json');
const previous = JSON.parse(readFileSync(reportPath, 'utf8')) as { fixtures?: unknown };
if (JSON.stringify(previous.fixtures) !== JSON.stringify(report.fixtures)) {
  throw new Error('Production solver fixtures differ from the committed foundation report. Inspect before updating.');
}
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
