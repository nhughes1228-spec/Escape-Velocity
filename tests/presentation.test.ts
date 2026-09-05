import { describe, expect, it } from 'vitest';
import { sampleTrace } from '../src/presentation/trace';

describe('presentation trace sampling', () => {
  it('interpolates visual state without changing trace coordinates', () => {
    const trace = [
      { timeS: 0, altitudeM: 0, velocityMps: 10, fuelKg: 2, phase: 'poweredAscent' as const },
      { timeS: 1, altitudeM: 10, velocityMps: 0, fuelKg: 1, phase: 'coast' as const },
    ];
    expect(sampleTrace(trace, 0.5)).toEqual({ timeS: 0.5, altitudeM: 5, velocityMps: 5, fuelKg: 1.5, phase: 'poweredAscent' });
    expect(trace[0].altitudeM).toBe(0);
  });
});
