import { useEffect, useRef } from 'react';
import type { TraceSample } from '../simulation/types';
import type { RocketLevels } from '../game/vehicle';
import { visibleTrace } from '../presentation/trace';
import { rocketAppearanceFor } from '../presentation/rocketAppearance';
import {
  createWorldCamera,
  highestPresentedAltitudeM,
  isWorldAltitudeVisible,
  WORLD_CAMERA_CONFIG,
  worldAltitudeToCanvasY,
} from '../presentation/worldCamera';

interface RocketCanvasProps {
  trace: TraceSample[];
  current: TraceSample;
  recordM: number;
  simulationTimeS: number;
  showFullTrace: boolean;
  reducedMotion: boolean;
  status: 'ready' | 'ignition' | 'playing' | 'replay' | 'result';
  ignitionElapsedS: number;
  ignitionProgress: number;
  levels: RocketLevels;
}

interface CloudLayer {
  altitudeM: number;
  xRatio: number;
  widthRatio: number;
  opacity: number;
}

const CLOUD_LAYERS: readonly CloudLayer[] = [
  { altitudeM: 250, xRatio: 0.16, widthRatio: 0.24, opacity: 0.45 },
  { altitudeM: 600, xRatio: 0.82, widthRatio: 0.29, opacity: 0.38 },
  { altitudeM: 1100, xRatio: 0.2, widthRatio: 0.22, opacity: 0.3 },
];

const STAR_POINTS = [
  { altitudeM: 420, xRatio: 0.08, radius: 1.2 },
  { altitudeM: 760, xRatio: 0.92, radius: 1.5 },
  { altitudeM: 920, xRatio: 0.12, radius: 1 },
  { altitudeM: 1330, xRatio: 0.88, radius: 1.3 },
] as const;

function altitudeLabel(valueM: number): string {
  return `${Math.round(valueM).toLocaleString()} m`;
}

function drawCloud(context: CanvasRenderingContext2D, x: number, y: number, width: number, opacity: number): void {
  context.save();
  context.fillStyle = `rgba(216, 239, 239, ${opacity})`;
  context.beginPath();
  context.ellipse(x, y, width * 0.5, 10, 0, 0, Math.PI * 2);
  context.ellipse(x - width * 0.23, y + 3, width * 0.27, 8, 0, 0, Math.PI * 2);
  context.ellipse(x + width * 0.22, y + 1, width * 0.3, 9, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawOffscreenIndicator(
  context: CanvasRenderingContext2D,
  label: string,
  direction: 'up' | 'down',
  width: number,
  height: number,
): void {
  context.save();
  context.textAlign = 'right';
  context.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.fillStyle = '#ffd58d';
  context.fillText(`${label} ${direction === 'up' ? '↑' : '↓'}`, width - 25, direction === 'up' ? 22 : height - 18);
  context.restore();
}

function drawLaunchpad(context: CanvasRenderingContext2D, x: number, padY: number, width: number, height: number): void {
  context.save();
  context.fillStyle = '#0a202d';
  context.fillRect(0, padY, width, height - padY);
  context.fillStyle = '#234b5b';
  context.fillRect(0, padY - 4, width, 4);

  context.fillStyle = '#376778';
  context.fillRect(x - 62, padY - 11, 124, 9);
  context.fillStyle = '#8db5b3';
  context.fillRect(x - 48, padY - 18, 4, 7);
  context.fillRect(x + 44, padY - 18, 4, 7);
  context.strokeStyle = '#6f9d9f';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x - 46, padY - 18);
  context.lineTo(x - 20, padY - 38);
  context.lineTo(x - 20, padY - 13);
  context.moveTo(x + 46, padY - 18);
  context.lineTo(x + 20, padY - 38);
  context.lineTo(x + 20, padY - 13);
  context.stroke();
  context.fillStyle = '#d8b36e';
  context.fillRect(x - 2, padY - 27, 4, 16);
  context.restore();
}

function drawRocket(
  context: CanvasRenderingContext2D,
  x: number,
  anchorY: number,
  current: TraceSample,
  levels: RocketLevels,
  status: RocketCanvasProps['status'],
  ignitionElapsedS: number,
  ignitionProgress: number,
  reducedMotion: boolean,
): void {
  const appearance = rocketAppearanceFor(levels);
  const ignitionJitter = status === 'ignition' && !reducedMotion
    ? Math.sin(ignitionElapsedS * 34) * (0.7 + ignitionProgress * 1.5)
    : 0;
  const rocketCenterY = anchorY - appearance.anchorOffsetPx;
  const halfWidth = appearance.bodyWidthPx / 2;

  context.save();
  context.translate(x + ignitionJitter, rocketCenterY);

  // Airframe identity: a narrower fairing and wider, more deliberate fins.
  context.fillStyle = levels.airframe > 0 ? '#d5eeea' : '#e97557';
  context.beginPath();
  context.moveTo(-halfWidth + 2, appearance.bodyHeightPx / 2 - 3);
  context.lineTo(-halfWidth - appearance.finSpanPx, appearance.bodyHeightPx / 2 + 12);
  context.lineTo(-halfWidth + 1, appearance.bodyHeightPx / 2 + 7);
  context.fill();
  context.beginPath();
  context.moveTo(halfWidth - 2, appearance.bodyHeightPx / 2 - 3);
  context.lineTo(halfWidth + appearance.finSpanPx, appearance.bodyHeightPx / 2 + 12);
  context.lineTo(halfWidth - 1, appearance.bodyHeightPx / 2 + 7);
  context.fill();

  context.fillStyle = '#d8e8e6';
  context.beginPath();
  context.moveTo(0, -appearance.bodyHeightPx / 2 - 17);
  context.quadraticCurveTo(halfWidth, -appearance.bodyHeightPx / 2 - 3, halfWidth, -appearance.bodyHeightPx / 2 + 9);
  context.lineTo(halfWidth, appearance.bodyHeightPx / 2 - 5);
  context.lineTo(-halfWidth, appearance.bodyHeightPx / 2 - 5);
  context.lineTo(-halfWidth, -appearance.bodyHeightPx / 2 + 9);
  context.quadraticCurveTo(-halfWidth, -appearance.bodyHeightPx / 2 - 3, 0, -appearance.bodyHeightPx / 2 - 17);
  context.fill();

  if (levels.airframe > 0) {
    context.strokeStyle = '#80d9d3';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, -appearance.bodyHeightPx / 2 - 13);
    context.lineTo(-halfWidth + 3, -appearance.bodyHeightPx / 2 + 10);
    context.moveTo(0, -appearance.bodyHeightPx / 2 - 13);
    context.lineTo(halfWidth - 3, -appearance.bodyHeightPx / 2 + 10);
    context.stroke();
  }

  // Fuel identity: the tank gets a longer segmented body as capacity grows.
  context.fillStyle = '#77d3d5';
  context.fillRect(-halfWidth + 4, -appearance.bodyHeightPx / 2 + 12, appearance.bodyWidthPx - 8, appearance.bodyHeightPx - 22);
  context.strokeStyle = 'rgba(8, 45, 57, 0.48)';
  context.lineWidth = 1;
  for (let index = 1; index < appearance.tankBandCount; index += 1) {
    const bandY = -appearance.bodyHeightPx / 2 + 12 + index * ((appearance.bodyHeightPx - 22) / appearance.tankBandCount);
    context.beginPath();
    context.moveTo(-halfWidth + 5, bandY);
    context.lineTo(halfWidth - 5, bandY);
    context.stroke();
  }

  // Engine identity: the bell and nozzle grow with Engine levels.
  const bellTopY = appearance.bodyHeightPx / 2 - 5;
  context.fillStyle = '#213b48';
  context.beginPath();
  context.moveTo(-appearance.engineBellWidthPx * 0.34, bellTopY);
  context.lineTo(appearance.engineBellWidthPx * 0.34, bellTopY);
  context.lineTo(appearance.engineBellWidthPx / 2, bellTopY + appearance.engineBellHeightPx);
  context.lineTo(-appearance.engineBellWidthPx / 2, bellTopY + appearance.engineBellHeightPx);
  context.closePath();
  context.fill();
  context.fillStyle = '#f1b36b';
  context.fillRect(-appearance.engineBellWidthPx / 2 + 3, bellTopY + 2, appearance.engineBellWidthPx - 6, 3);
  if (levels.engine > 0) {
    context.strokeStyle = '#8ee2dc';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(-appearance.engineBellWidthPx / 2 + 2, bellTopY + 6);
    context.lineTo(appearance.engineBellWidthPx / 2 - 2, bellTopY + 6);
    context.stroke();
  }

  const powered = (status === 'playing' || status === 'replay') && current.phase === 'poweredAscent';
  const ignition = status === 'ignition';
  if (powered || ignition) {
    const flameHeight = powered
      ? 20 + (reducedMotion ? 0 : Math.sin(current.timeS * 18) * 4)
      : 10 + (reducedMotion ? 0 : Math.sin(ignitionElapsedS * 20) * 3);
    context.fillStyle = '#ffca6b';
    context.beginPath();
    context.moveTo(-7, bellTopY + appearance.engineBellHeightPx);
    context.quadraticCurveTo(0, bellTopY + appearance.engineBellHeightPx + flameHeight, 7, bellTopY + appearance.engineBellHeightPx);
    context.fill();
    context.fillStyle = '#fff0ae';
    context.beginPath();
    context.moveTo(-3, bellTopY + appearance.engineBellHeightPx);
    context.quadraticCurveTo(0, bellTopY + appearance.engineBellHeightPx + flameHeight - 8, 3, bellTopY + appearance.engineBellHeightPx);
    context.fill();
  }
  context.restore();
}

export function RocketCanvas({
  trace,
  current,
  recordM,
  simulationTimeS,
  showFullTrace,
  reducedMotion,
  status,
  ignitionElapsedS,
  ignitionProgress,
  levels,
}: RocketCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(320, bounds.width);
      const height = Math.max(300, bounds.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const shownTrace = showFullTrace ? trace : visibleTrace(trace, simulationTimeS);
      const highestShownM = highestPresentedAltitudeM([
        current.altitudeM,
        ...shownTrace.map((sample) => sample.altitudeM),
      ]);
      const camera = createWorldCamera(height, highestShownM);
      const worldY = (altitudeM: number) => worldAltitudeToCanvasY(altitudeM, camera);
      const x = width * 0.5;

      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#091a2b');
      sky.addColorStop(0.62, '#123955');
      sky.addColorStop(1, '#1d5971');
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      for (const star of STAR_POINTS) {
        if (!isWorldAltitudeVisible(star.altitudeM, camera, 8)) continue;
        context.fillStyle = 'rgba(230, 246, 235, 0.72)';
        context.beginPath();
        context.arc(width * star.xRatio, worldY(star.altitudeM), star.radius, 0, Math.PI * 2);
        context.fill();
      }

      for (const cloud of CLOUD_LAYERS) {
        if (!isWorldAltitudeVisible(cloud.altitudeM, camera, 30)) continue;
        drawCloud(context, width * cloud.xRatio, worldY(cloud.altitudeM), width * cloud.widthRatio, cloud.opacity);
      }

      const padY = worldY(0);
      if (isWorldAltitudeVisible(0, camera)) {
        context.fillStyle = 'rgba(255, 196, 100, 0.09)';
        context.fillRect(0, Math.min(height, padY), width, Math.max(0, height - padY));
        drawLaunchpad(context, x, padY, width, height);
      } else {
        drawOffscreenIndicator(context, 'Launchpad', 'down', width, height);
      }

      context.save();
      context.beginPath();
      context.rect(18, 0, width - 36, height);
      context.clip();
      context.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.textAlign = 'left';
      const tickSpacingM = WORLD_CAMERA_CONFIG.majorTickSpacingM;
      const firstTickM = Math.max(0, Math.ceil(camera.cameraBottomM / tickSpacingM) * tickSpacingM);
      for (let index = 0, altitudeM = firstTickM; index < 100 && altitudeM <= camera.cameraTopM + 0.001; index += 1, altitudeM += tickSpacingM) {
        const y = worldY(altitudeM);
        context.strokeStyle = 'rgba(190, 230, 239, 0.18)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(20, y);
        context.lineTo(width - 20, y);
        context.stroke();
        context.fillStyle = 'rgba(228, 245, 246, 0.75)';
        context.fillText(altitudeLabel(altitudeM), 28, y - 6);
      }

      if (recordM > 0) {
        if (isWorldAltitudeVisible(recordM, camera)) {
          const recordY = worldY(recordM);
          context.strokeStyle = '#ffc66d';
          context.setLineDash([6, 5]);
          context.beginPath();
          context.moveTo(18, recordY);
          context.lineTo(width - 18, recordY);
          context.stroke();
          context.setLineDash([]);
          context.fillStyle = '#ffd58d';
          context.textAlign = 'right';
          context.fillText(`Personal best ${altitudeLabel(recordM)}`, width - 28, recordY - 7);
          context.textAlign = 'left';
        } else {
          drawOffscreenIndicator(context, `Personal best ${altitudeLabel(recordM)}`, recordM > camera.cameraTopM ? 'up' : 'down', width, height);
        }
      }

      const currentAltitudeY = worldY(current.altitudeM);
      if (status === 'ignition' || current.altitudeM > 0) {
        context.strokeStyle = status === 'ignition' ? 'rgba(255, 198, 109, 0.38)' : 'rgba(122, 224, 213, 0.24)';
        context.setLineDash([3, 5]);
        context.beginPath();
        context.moveTo(18, currentAltitudeY);
        context.lineTo(width - 18, currentAltitudeY);
        context.stroke();
        context.setLineDash([]);
      }

      if (shownTrace.length > 1) {
        context.save();
        context.beginPath();
        context.rect(60, 0, Math.max(1, width - 120), height);
        context.clip();
        context.strokeStyle = 'rgba(112, 234, 239, 0.62)';
        context.lineWidth = 2;
        context.beginPath();
        shownTrace.forEach((sample, index) => {
          const traceX = x + Math.sin(sample.timeS * 0.22) * Math.min(24, width * 0.06);
          const traceY = worldY(sample.altitudeM);
          if (index === 0) context.moveTo(traceX, traceY);
          else context.lineTo(traceX, traceY);
        });
        context.stroke();
        context.restore();
      }
      context.restore();

      if (status === 'ignition') {
        const pulse = reducedMotion ? 0.55 : 0.45 + Math.sin(ignitionElapsedS * 16) * 0.12;
        context.save();
        context.globalAlpha = pulse;
        const glow = context.createRadialGradient(x, padY, 2, x, padY, 46);
        glow.addColorStop(0, 'rgba(255, 208, 116, 0.46)');
        glow.addColorStop(1, 'rgba(255, 145, 80, 0)');
        context.fillStyle = glow;
        context.fillRect(x - 50, padY - 24, 100, 68);
        context.fillStyle = 'rgba(218, 238, 229, 0.52)';
        const ventOffset = reducedMotion ? 0 : Math.sin(ignitionElapsedS * 11) * 3;
        for (const puff of [-1, 0, 1]) {
          context.beginPath();
          context.arc(x + puff * 20 + ventOffset, padY + 8 - Math.abs(puff) * 4, 7 + Math.abs(puff) * 2, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }

      // The fin-tip anchor is mapped by the same world transform as the
      // ruler, trace, guide and telemetry. Artwork never affects physics.
      drawRocket(context, x, currentAltitudeY, current, levels, status, ignitionElapsedS, ignitionProgress, reducedMotion);

      context.fillStyle = 'rgba(237, 250, 249, 0.82)';
      context.textAlign = 'center';
      context.font = '600 12px Inter, system-ui, sans-serif';
      context.fillText(`${altitudeLabel(current.altitudeM)}  ·  ${current.velocityMps.toFixed(1)} m/s`, x, height - 17);
    };

    draw();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', draw);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [trace, current, recordM, simulationTimeS, showFullTrace, reducedMotion, status, ignitionElapsedS, ignitionProgress, levels]);

  return <canvas ref={canvasRef} className="flight-canvas" role="img" aria-label="Rocket flight view with height ruler and world landmarks" />;
}
