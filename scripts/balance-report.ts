import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openingBalance } from '../src/config/opening';
import { costFor, rewardFor } from '../src/game/economy';
import { createLaunchRecipe } from '../src/game/launch';
import { deriveVehicle, starterLevels, type RocketLevels } from '../src/game/vehicle';
import { effectiveVehicleForCondition, engineConditionForSeed, makeLaunchRng } from '../src/game/variance';
import { simulateVertical } from '../src/simulation/vertical';

const root = resolve(import.meta.dirname, '..');
const physicalKinds = ['engine', 'fuel', 'airframe'] as const;
const allKinds = ['engine', 'fuel', 'airframe', 'ignition'] as const;
const varianceEndpoints = [1 - openingBalance.variance.amplitude, 1, 1 + openingBalance.variance.amplitude];

function options(dtS = openingBalance.simulation.dtS) {
  return {
    ...openingBalance.simulation,
    dtS,
    balanceVersion: openingBalance.balanceVersion,
    modelVersion: openingBalance.modelVersion,
    collectTrace: false,
  };
}

function flight(levels: RocketLevels, conditionK = 1, dtS = openingBalance.simulation.dtS) {
  const nominal = deriveVehicle(levels, openingBalance);
  return simulateVertical(effectiveVehicleForCondition(nominal, conditionK), openingBalance.environment, options(dtS));
}

function seededFlight(levels: RocketLevels, seed: number, dtS = openingBalance.simulation.dtS) {
  const recipe = createLaunchRecipe(levels, seed, openingBalance);
  return simulateVertical(recipe.effectiveVehicle, recipe.environment, {
    ...recipe.simulation,
    dtS,
    balanceVersion: recipe.balanceVersion,
    modelVersion: recipe.modelVersion,
    collectTrace: false,
  });
}

function deterministicPercentile(values: number[], fraction: number): number {
  return [...values].sort((left, right) => left - right)[Math.floor((values.length - 1) * fraction)];
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

type CampaignPolicy = 'cheapest' | 'physical_gain' | 'throughput' | 'ignition_first' | 'engine_first' | 'random';

interface CampaignMilestone {
  launches: number;
  minutes: number;
}

interface CampaignRun {
  unreached?: boolean;
  launches?: number;
  minutes?: number;
  levels: RocketLevels;
  altitudeM?: number;
  maxNoPurchaseStreak: number;
  fifthLaunchAltitudeM?: number;
  milestones?: { 500?: CampaignMilestone; 1000?: CampaignMilestone };
  finalPurchaseMinutes?: number;
}

function campaign(policy: CampaignPolicy, campaignSeed: number): CampaignRun {
  let levels: RocketLevels = { ...starterLevels };
  let credits = 0;
  let seconds = 0;
  let launches = 0;
  let noPurchaseStreak = 0;
  let maxNoPurchaseStreak = 0;
  const launchRng = makeLaunchRng((campaignSeed ^ 0x9e3779b9) >>> 0);
  const choiceRng = makeLaunchRng((campaignSeed ^ 0x85ebca6b) >>> 0);
  let fifthLaunchAltitudeM: number | undefined;
  let milestone500: CampaignMilestone | undefined;
  let milestone1000: CampaignMilestone | undefined;

  while (launches < 300) {
    const launchSeed = Math.floor(launchRng() * 4294967296);
    const result = seededFlight(levels, launchSeed);
    launches += 1;
    seconds += openingBalance.upgrades.ignition.delaysS[levels.ignition] + result.terminalTimeS + 4;
    credits += rewardFor(result, openingBalance);
    if (launches === 5) fifthLaunchAltitudeM = rounded(result.maximumAltitudeM);
    if (!milestone500 && result.maximumAltitudeM >= 500) milestone500 = { launches, minutes: rounded(seconds / 60) };
    if (!milestone1000 && result.maximumAltitudeM >= 1000) milestone1000 = { launches, minutes: rounded(seconds / 60) };

    let purchased = false;
    while (true) {
      const currentResult = flight(levels);
      let candidateKinds = allKinds.filter((kind) => levels[kind] < openingBalance.upgrades[kind].cap);
      if (policy === 'physical_gain') candidateKinds = candidateKinds.filter((kind) => kind !== 'ignition');
      if (policy === 'ignition_first' && levels.ignition < openingBalance.upgrades.ignition.cap) candidateKinds = candidateKinds.filter((kind) => kind === 'ignition');
      if (policy === 'engine_first' && levels.engine < openingBalance.upgrades.engine.cap) candidateKinds = candidateKinds.filter((kind) => kind === 'engine');
      const candidates = candidateKinds
        .map((kind) => {
          const price = costFor(kind, levels[kind], openingBalance);
          const nextLevels = { ...levels, [kind]: levels[kind] + 1 };
          const nextResult = flight(nextLevels);
          let score = -price;
          if (policy === 'physical_gain') {
            score = (nextResult.maximumAltitudeM - currentResult.maximumAltitudeM) / price;
          } else if (policy === 'throughput') {
            const currentRate = rewardFor(currentResult, openingBalance) /
              (currentResult.terminalTimeS + openingBalance.upgrades.ignition.delaysS[levels.ignition] + 4);
            const nextRate = rewardFor(nextResult, openingBalance) /
              (nextResult.terminalTimeS + openingBalance.upgrades.ignition.delaysS[nextLevels.ignition] + 4);
            score = (nextRate - currentRate) / price;
          } else if (policy === 'random') {
            score = choiceRng();
          }
          return { kind, price, score };
        })
        .filter((choice) => choice.price <= credits)
        .sort((left, right) => right.score - left.score || allKinds.indexOf(left.kind) - allKinds.indexOf(right.kind));

      if (candidates.length === 0) break;
      const choice = candidates[0];
      credits -= choice.price;
      levels = { ...levels, [choice.kind]: levels[choice.kind] + 1 };
      purchased = true;
      if ((policy === 'ignition_first' && levels.ignition < openingBalance.upgrades.ignition.cap) ||
          (policy === 'engine_first' && levels.engine < openingBalance.upgrades.engine.cap)) break;
    }

    noPurchaseStreak = purchased ? 0 : noPurchaseStreak + 1;
    maxNoPurchaseStreak = Math.max(maxNoPurchaseStreak, noPurchaseStreak);
    const completionKinds = policy === 'physical_gain' ? physicalKinds : allKinds;
    if (completionKinds.every((kind) => levels[kind] === openingBalance.upgrades[kind].cap)) {
      return {
        launches,
        minutes: rounded(seconds / 60),
        levels,
        altitudeM: rounded(flight(levels).maximumAltitudeM),
        maxNoPurchaseStreak,
        fifthLaunchAltitudeM,
        milestones: { 500: milestone500, 1000: milestone1000 },
        finalPurchaseMinutes: rounded(seconds / 60),
      };
    }
  }
  return { unreached: true, levels, maxNoPurchaseStreak, fifthLaunchAltitudeM, milestones: { 500: milestone500, 1000: milestone1000 } };
}

const fixtures = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [2, 2, 2],
  [4, 4, 4],
  [8, 8, 8],
].map(([engine, fuel, airframe]) => {
  const levels: RocketLevels = { engine, fuel, airframe, ignition: 0 };
  const result = flight(levels);
  return {
    levels: [engine, fuel, airframe],
    altitudeM: rounded(result.maximumAltitudeM),
    flightTimeS: rounded(result.terminalTimeS),
    credits: rewardFor(result, openingBalance),
  };
});

let builds = 0;
let worstAltitudeDifferenceM = 0;
let worstTimeDifferenceS = 0;
let minimumPadTWR = Number.POSITIVE_INFINITY;
let minimumVarianceDeltaPct = Number.POSITIVE_INFINITY;
let maximumVarianceDeltaPct = Number.NEGATIVE_INFINITY;
let negativeUpgradeEdges = 0;

for (let engine = 0; engine <= openingBalance.upgrades.engine.cap; engine += 1) {
  for (let fuel = 0; fuel <= openingBalance.upgrades.fuel.cap; fuel += 1) {
    for (let airframe = 0; airframe <= openingBalance.upgrades.airframe.cap; airframe += 1) {
      const levels: RocketLevels = { engine, fuel, airframe, ignition: 0 };
      const nominal = flight(levels);
      const fine = flight(levels, 1, openingBalance.simulation.dtS / 2);
      if (nominal.outcome !== 'apogee' || fine.outcome !== 'apogee') throw new Error(`Build ${engine},${fuel},${airframe} did not reach apogee.`);
      worstAltitudeDifferenceM = Math.max(worstAltitudeDifferenceM, Math.abs(nominal.maximumAltitudeM - fine.maximumAltitudeM));
      worstTimeDifferenceS = Math.max(worstTimeDifferenceS, Math.abs(nominal.terminalTimeS - fine.terminalTimeS));

      for (const conditionK of varianceEndpoints) {
        const endpoint = flight(levels, conditionK);
        const endpointFine = flight(levels, conditionK, openingBalance.simulation.dtS / 2);
        if (endpoint.outcome !== 'apogee' || endpointFine.outcome !== 'apogee') throw new Error(`Variance endpoint failed for ${engine},${fuel},${airframe}.`);
        worstAltitudeDifferenceM = Math.max(worstAltitudeDifferenceM, Math.abs(endpoint.maximumAltitudeM - endpointFine.maximumAltitudeM));
        worstTimeDifferenceS = Math.max(worstTimeDifferenceS, Math.abs(endpoint.terminalTimeS - endpointFine.terminalTimeS));
        const deltaPct = 100 * (endpoint.maximumAltitudeM / nominal.maximumAltitudeM - 1);
        minimumVarianceDeltaPct = Math.min(minimumVarianceDeltaPct, deltaPct);
        maximumVarianceDeltaPct = Math.max(maximumVarianceDeltaPct, deltaPct);
        const vehicle = effectiveVehicleForCondition(deriveVehicle(levels, openingBalance), conditionK);
        minimumPadTWR = Math.min(
          minimumPadTWR,
          vehicle.thrustN / ((vehicle.dryMassKg + vehicle.fuelMassKg) * openingBalance.environment.gravityMps2),
        );
        for (const kind of physicalKinds) {
          if (levels[kind] >= openingBalance.upgrades[kind].cap) continue;
          const next = { ...levels, [kind]: levels[kind] + 1 };
          if (flight(next, conditionK).maximumAltitudeM < endpoint.maximumAltitudeM) negativeUpgradeEdges += 1;
        }
      }
      builds += 1;
    }
  }
}

if (worstAltitudeDifferenceM > 0.1 || worstTimeDifferenceS > 0.02 || minimumVarianceDeltaPct < -3 || maximumVarianceDeltaPct > 3 || negativeUpgradeEdges !== 0) {
  throw new Error('Opening production envelope regression. Inspect the generated measurements before changing the report.');
}

const starterSamples = Array.from({ length: 4096 }, (_, seed) => seededFlight(starterLevels, seed).maximumAltitudeM);
const starterNominal = flight(starterLevels).maximumAltitudeM;
const endpointRewards = varianceEndpoints.map((conditionK) => rewardFor(flight(starterLevels, conditionK), openingBalance));
if (endpointRewards.some((reward) => reward !== 19)) throw new Error('Starter variance endpoint no longer awards 19 Credits.');

const campaignPolicies: readonly CampaignPolicy[] = ['cheapest', 'physical_gain', 'throughput', 'ignition_first', 'engine_first', 'random'];
const campaigns = Object.fromEntries(campaignPolicies.map((policy) => {
  const runs = Array.from({ length: 32 }, (_, index) => campaign(policy, index + 1));
  const minutes = runs.map((run) => run.minutes ?? Number.POSITIVE_INFINITY);
  const summary = (values: Array<number | undefined>) => {
    const finite = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
    if (finite.length === 0) return null;
    return {
      min: rounded(Math.min(...finite)),
      median: rounded(deterministicPercentile(finite, 0.5)),
      max: rounded(Math.max(...finite)),
    };
  };
  return [policy, {
    representativeSeed1: runs[0],
    semantics: policy === 'cheapest'
      ? 'Buy the least expensive affordable level repeatedly.'
      : policy === 'physical_gain'
        ? 'Buy the best altitude gain per Credit, excluding Ignition.'
        : policy === 'throughput'
          ? 'Buy the best reward-per-review-second gain per Credit.'
          : policy === 'ignition_first'
            ? 'Wait for and buy Ignition levels first, then buy the least expensive affordable level.'
            : policy === 'engine_first'
              ? 'Wait for and buy Engine levels first, then buy the least expensive affordable level.'
              : 'Choose uniformly from affordable upgrades with an independent deterministic choice stream.',
    completionMinutes: {
      min: rounded(Math.min(...minutes)),
      median: rounded(deterministicPercentile(minutes, 0.5)),
      max: rounded(Math.max(...minutes)),
    },
    pacing: {
      fifthLaunchAltitudeM: summary(runs.map((run) => run.fifthLaunchAltitudeM)),
      launchesTo500m: summary(runs.map((run) => run.milestones?.[500]?.launches)),
      minutesTo500m: summary(runs.map((run) => run.milestones?.[500]?.minutes)),
      launchesTo1km: summary(runs.map((run) => run.milestones?.[1000]?.launches)),
      minutesTo1km: summary(runs.map((run) => run.milestones?.[1000]?.minutes)),
      maxNoPurchaseGap: summary(runs.map((run) => run.maxNoPurchaseStreak)),
      finalPurchaseMinutes: summary(runs.map((run) => run.finalPurchaseMinutes)),
    },
  }];
}));

const report = {
  balanceVersion: openingBalance.balanceVersion,
  modelVersion: openingBalance.modelVersion,
  scope: 'Production TypeScript solver and economy helpers; nominal/seeded envelope sweep and no-grant Phase 2 campaign comparison. Milestone data remains dormant until Phase 3.',
  fixtures,
  seedFixtures: {
    conditionK: [0, 1, 42, 0xffffffff].map((seed) => ({ seed, conditionK: engineConditionForSeed(seed, openingBalance) })),
    starter: {
      nominalM: starterNominal,
      endpointBoundsM: [flight(starterLevels, varianceEndpoints[0]).maximumAltitudeM, flight(starterLevels, varianceEndpoints[2]).maximumAltitudeM],
      meanM: starterSamples.reduce((sum, value) => sum + value, 0) / starterSamples.length,
      p05M: deterministicPercentile(starterSamples, 0.05),
      p95M: deterministicPercentile(starterSamples, 0.95),
      sampleMinM: Math.min(...starterSamples),
      sampleMaxM: Math.max(...starterSamples),
      endpointRewards,
    },
  },
  audit: {
    builds,
    worstAltitudeDifferenceM,
    worstTimeDifferenceS,
    minimumPadTWR,
    minimumVarianceDeltaPct,
    maximumVarianceDeltaPct,
    negativeUpgradeEdges,
  },
  campaignAssumptions: 'No milestone grants; 1x playback; 4 s decision time per launch; 32 deterministic campaign seeds per policy; six explicitly named buying strategies including physical-gain and throughput stress cases; purchase scores recompute from the current build after every purchase; completion means all four opening systems reach their caps.',
  campaigns,
};

const reportPath = resolve(root, 'docs/balance-report.json');
const previous = JSON.parse(readFileSync(reportPath, 'utf8')) as { fixtures?: unknown };
if (JSON.stringify(previous.fixtures) !== JSON.stringify(report.fixtures)) {
  throw new Error('Nominal production fixtures changed. Inspect the physics/config diff before updating the committed report.');
}
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
