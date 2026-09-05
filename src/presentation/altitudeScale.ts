export interface AltitudeScale {
  readonly groundY: number;
  readonly skyTopY: number;
  readonly maxAltitudeM: number;
}

export function createAltitudeScale(heightPx: number, maxAltitudeM: number): AltitudeScale {
  return {
    groundY: heightPx - 48,
    skyTopY: 28,
    maxAltitudeM: Math.max(Number.EPSILON, maxAltitudeM),
  };
}

export function altitudeToCanvasY(altitudeM: number, scale: AltitudeScale): number {
  const boundedAltitudeM = Math.min(scale.maxAltitudeM, Math.max(0, altitudeM));
  const altitudeRatio = boundedAltitudeM / scale.maxAltitudeM;
  return scale.groundY - altitudeRatio * (scale.groundY - scale.skyTopY);
}

export function canvasYToAltitude(y: number, scale: AltitudeScale): number {
  const distanceFromGround = scale.groundY - y;
  const altitudeRatio = distanceFromGround / (scale.groundY - scale.skyTopY);
  return Math.min(scale.maxAltitudeM, Math.max(0, altitudeRatio * scale.maxAltitudeM));
}
