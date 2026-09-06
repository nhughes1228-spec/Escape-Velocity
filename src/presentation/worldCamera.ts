export interface WorldCameraConfig {
  worldSpanM: number;
  followHeightM: number;
  majorTickSpacingM: number;
  topMarginPx: number;
  bottomPaddingPx: number;
  maxRocketAnchorHeightPx: number;
}

export const WORLD_CAMERA_CONFIG: Readonly<WorldCameraConfig> = Object.freeze({
  worldSpanM: 300,
  followHeightM: 210,
  majorTickSpacingM: 50,
  topMarginPx: 20,
  bottomPaddingPx: 48,
  maxRocketAnchorHeightPx: MAX_ROCKET_ANCHOR_HEIGHT_PX,
});

export interface WorldCamera {
  readonly worldSpanM: number;
  readonly cameraBottomM: number;
  readonly cameraTopM: number;
  readonly groundY: number;
  readonly topAnchorY: number;
  readonly pixelsPerMeter: number;
}

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function highestPresentedAltitudeM(altitudesM: readonly number[]): number {
  let highestM = 0;
  for (const altitudeM of altitudesM) {
    if (Number.isFinite(altitudeM)) highestM = Math.max(highestM, altitudeM);
  }
  return highestM;
}

export function createWorldCamera(
  heightPx: number,
  highestShownM: number,
  config: WorldCameraConfig = WORLD_CAMERA_CONFIG,
): WorldCamera {
  const groundY = Math.max(0, heightPx - config.bottomPaddingPx);
  const topAnchorY = config.topMarginPx + config.maxRocketAnchorHeightPx;
  const drawableHeightPx = Math.max(1, groundY - topAnchorY);
  const cameraBottomM = Math.max(0, nonNegativeFinite(highestShownM) - config.followHeightM);
  return {
    worldSpanM: config.worldSpanM,
    cameraBottomM,
    cameraTopM: cameraBottomM + config.worldSpanM,
    groundY,
    topAnchorY,
    pixelsPerMeter: drawableHeightPx / config.worldSpanM,
  };
}

export function worldAltitudeToCanvasY(altitudeM: number, camera: WorldCamera): number {
  const safeAltitudeM = Number.isFinite(altitudeM) ? altitudeM : 0;
  return camera.groundY - (safeAltitudeM - camera.cameraBottomM) * camera.pixelsPerMeter;
}

export function canvasYToWorldAltitude(y: number, camera: WorldCamera): number {
  return camera.cameraBottomM + (camera.groundY - y) / camera.pixelsPerMeter;
}

export function isWorldAltitudeVisible(altitudeM: number, camera: WorldCamera, paddingM = 0): boolean {
  return altitudeM >= camera.cameraBottomM - paddingM && altitudeM <= camera.cameraTopM + paddingM;
}
import { MAX_ROCKET_ANCHOR_HEIGHT_PX } from './rocketAppearance';
