import { describe, expect, it } from 'vitest';
import { sampleTrace } from '../src/presentation/trace';
import { rocketAppearanceFor, MAX_ROCKET_ANCHOR_HEIGHT_PX } from '../src/presentation/rocketAppearance';
import { canvasYToWorldAltitude, createWorldCamera, highestPresentedAltitudeM, worldAltitudeToCanvasY } from '../src/presentation/worldCamera';

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

describe('observed-flight world camera', () => {
  it('keeps one world scale while translating only after actual ascent', () => {
    const initial = createWorldCamera(380, 0);
    const scrolled = createWorldCamera(380, 300);
    expect(initial.cameraBottomM).toBe(0);
    expect(initial.cameraTopM).toBe(300);
    expect(scrolled.cameraBottomM).toBe(90);
    expect(scrolled.cameraTopM).toBe(390);
    expect(scrolled.pixelsPerMeter).toBe(initial.pixelsPerMeter);
    expect(worldAltitudeToCanvasY(300, scrolled)).toBeCloseTo(worldAltitudeToCanvasY(210, initial), 10);

    for (const camera of [initial, scrolled, createWorldCamera(310, 1700)]) {
      for (const altitudeM of [0, 160, 300, 500, 1000, 1700]) {
        const y = worldAltitudeToCanvasY(altitudeM, camera);
        expect(canvasYToWorldAltitude(y, camera)).toBeCloseTo(altitudeM, 10);
      }
    }
  });

  it('uses only the presented altitude prefix, never a future apogee', () => {
    expect(highestPresentedAltitudeM([0, 160, Number.NaN, 150])).toBe(160);
    const traceWithLowerFuture = [0, 160, 240];
    const traceWithHigherFuture = [0, 160, 1700];
    const cameraForLowerFuture = createWorldCamera(380, highestPresentedAltitudeM(traceWithLowerFuture.slice(0, 2)));
    const cameraForHigherFuture = createWorldCamera(380, highestPresentedAltitudeM(traceWithHigherFuture.slice(0, 2)));
    expect(cameraForLowerFuture).toEqual(cameraForHigherFuture);
  });
});

describe('rocket appearance', () => {
  it('gives each physical system a distinct visual signal', () => {
    const starter = rocketAppearanceFor({ engine: 0, fuel: 0, airframe: 0, ignition: 0 });
    const engine = rocketAppearanceFor({ engine: 1, fuel: 0, airframe: 0, ignition: 0 });
    const fuel = rocketAppearanceFor({ engine: 0, fuel: 1, airframe: 0, ignition: 0 });
    const airframe = rocketAppearanceFor({ engine: 0, fuel: 0, airframe: 1, ignition: 0 });
    expect(engine.engineBellWidthPx).toBeGreaterThan(starter.engineBellWidthPx);
    expect(fuel.bodyHeightPx).toBeGreaterThan(starter.bodyHeightPx);
    expect(fuel.tankBandCount).toBeGreaterThan(starter.tankBandCount);
    expect(airframe.finSpanPx).toBeGreaterThan(starter.finSpanPx);
    expect(airframe.bodyWidthPx).toBeLessThan(starter.bodyWidthPx);
    expect(MAX_ROCKET_ANCHOR_HEIGHT_PX).toBeGreaterThanOrEqual(starter.anchorOffsetPx + 29);
  });
});
