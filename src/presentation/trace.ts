import type { TraceSample } from '../simulation/types';

export function sampleTrace(trace: TraceSample[], timeS: number): TraceSample | null {
  if (trace.length === 0) return null;
  if (timeS <= trace[0].timeS) return { ...trace[0] };
  const last = trace[trace.length - 1];
  if (timeS >= last.timeS) return { ...last };

  let low = 0;
  let high = trace.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (trace[middle].timeS <= timeS) low = middle;
    else high = middle;
  }
  const left = trace[low];
  const right = trace[high];
  const spanS = right.timeS - left.timeS;
  const ratio = spanS > 0 ? (timeS - left.timeS) / spanS : 1;
  return {
    timeS,
    altitudeM: left.altitudeM + (right.altitudeM - left.altitudeM) * ratio,
    velocityMps: left.velocityMps + (right.velocityMps - left.velocityMps) * ratio,
    fuelKg: left.fuelKg + (right.fuelKg - left.fuelKg) * ratio,
    phase: ratio < 1 ? left.phase : right.phase,
  };
}

export function visibleTrace(trace: TraceSample[], timeS: number): TraceSample[] {
  return trace.filter((sample) => sample.timeS <= timeS + 1e-9);
}
