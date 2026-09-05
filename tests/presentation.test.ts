import { describe, expect, it } from 'vitest';
import { altitudeToCanvasY, canvasYToAltitude, createAltitudeScale } from '../src/presentation/altitudeScale';
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

describe('altitude canvas mapping', () => {
  it('uses one ruler coordinate for telemetry and the visual altitude anchor', () => {
    const scale = createAltitudeScale(380, 250);
    const altitudeM = 160;
    const y = altitudeToCanvasY(altitudeM, scale);

    expect(y).toBeGreaterThan(scale.skyTopY);
    expect(y).toBeLessThan(scale.groundY);
    expect(canvasYToAltitude(y, scale)).toBeCloseTo(altitudeM, 10);
    expect(altitudeToCanvasY(0, scale)).toBe(scale.groundY);
    expect(altitudeToCanvasY(scale.maxAltitudeM, scale)).toBe(scale.skyTopY);
  });
});
