import type { RocketLevels } from '../game/vehicle';
import { rocketAnchorHeightPx } from './altitudeScale';

export interface RocketAppearance {
  bodyHeightPx: number;
  bodyWidthPx: number;
  finSpanPx: number;
  engineBellWidthPx: number;
  engineBellHeightPx: number;
  tankBandCount: number;
  anchorOffsetPx: number;
}

export const MAX_ROCKET_BODY_HEIGHT_PX = 80;
export const MAX_ROCKET_ANCHOR_HEIGHT_PX = rocketAnchorHeightPx(MAX_ROCKET_BODY_HEIGHT_PX);

export function rocketAppearanceFor(levels: RocketLevels): RocketAppearance {
  const bodyHeightPx = Math.min(MAX_ROCKET_BODY_HEIGHT_PX, 58 + levels.fuel * 2 + levels.airframe * 0.4);
  return {
    bodyHeightPx,
    bodyWidthPx: Math.max(24, 29 + levels.fuel * 0.7 - levels.airframe * 0.8),
    finSpanPx: 11 + levels.airframe * 1.6,
    engineBellWidthPx: 12 + levels.engine * 1.5,
    engineBellHeightPx: 8 + levels.engine * 0.8,
    tankBandCount: Math.min(5, levels.fuel + 1),
    anchorOffsetPx: bodyHeightPx / 2 + 12,
  };
}
