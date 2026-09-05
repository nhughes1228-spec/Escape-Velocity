import { describe, expect, it } from 'vitest';
import { altitudeToCanvasY, cameraMaxAltitudeM, canvasYToAltitude, createAltitudeScale } from '../src/presentation/altitudeScale';
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
    for (const heightPx of [310, 380]) {
      const scale = createAltitudeScale(heightPx, 2000);
      for (const altitudeM of [0, 160, 500, 1000, 1700]) {
        const y = altitudeToCanvasY(altitudeM, scale);
        expect(y).toBeGreaterThanOrEqual(scale.topAnchorY);
        expect(y).toBeLessThanOrEqual(scale.groundY);
        expect(canvasYToAltitude(y, scale)).toBeCloseTo(altitudeM, 10);
      }
      expect(altitudeToCanvasY(scale.maxAltitudeM, scale)).toBe(scale.topAnchorY);
    }
  });

  it('freezes camera ranges in rounded bands from nominal capability and record', () => {
    expect(cameraMaxAltitudeM(0, 160.170311)).toBe(300);
    expect(cameraMaxAltitudeM(1000, 1400)).toBe(1600);
    expect(cameraMaxAltitudeM(0, 1647.878595)).toBe(1900);
  });
});
