export interface AltitudeScale {
  readonly groundY: number;
  readonly skyTopY: number;
  readonly topAnchorY: number;
  readonly maxAltitudeM: number;
}

export const ROCKET_ANCHOR_HEIGHT_PX = 87;
export const ROCKET_TOP_MARGIN_PX = 20;

export function cameraMaxAltitudeM(recordM: number, nominalPeakM: number): number {
  const targetM = Math.max(250, Math.max(0, recordM) * 1.1, Math.max(0, nominalPeakM) * 1.1);
  return Math.max(100, Math.ceil(targetM / 100) * 100);
}

export function createAltitudeScale(
  heightPx: number,
  maxAltitudeM: number,
  anchorHeightPx = ROCKET_ANCHOR_HEIGHT_PX,
  topMarginPx = ROCKET_TOP_MARGIN_PX,
): AltitudeScale {
  const groundY = heightPx - 48;
  return {
    groundY,
    skyTopY: topMarginPx,
    topAnchorY: topMarginPx + anchorHeightPx,
    maxAltitudeM: Math.max(Number.EPSILON, maxAltitudeM),
  };
}

export function altitudeToCanvasY(altitudeM: number, scale: AltitudeScale): number {
  const boundedAltitudeM = Math.min(scale.maxAltitudeM, Math.max(0, altitudeM));
  const altitudeRatio = boundedAltitudeM / scale.maxAltitudeM;
  return scale.groundY - altitudeRatio * (scale.groundY - scale.topAnchorY);
}

export function canvasYToAltitude(y: number, scale: AltitudeScale): number {
  const distanceFromGround = scale.groundY - y;
  const altitudeRatio = distanceFromGround / (scale.groundY - scale.topAnchorY);
  return Math.min(scale.maxAltitudeM, Math.max(0, altitudeRatio * scale.maxAltitudeM));
}
