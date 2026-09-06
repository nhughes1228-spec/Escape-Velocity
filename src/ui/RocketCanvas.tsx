import { useEffect, useRef } from 'react';
import type { TraceSample } from '../simulation/types';
import type { RocketLevels } from '../game/vehicle';
import { visibleTrace } from '../presentation/trace';
import { altitudeToCanvasY, cameraMaxAltitudeM, createAltitudeScale, rocketAnchorHeightPx } from '../presentation/altitudeScale';

interface RocketCanvasProps {
  trace: TraceSample[];
  current: TraceSample;
  recordM: number;
  nominalPeakM: number;
  simulationTimeS: number;
  showFullTrace: boolean;
  reducedMotion: boolean;
  status: 'ready' | 'ignition' | 'playing' | 'replay' | 'result';
  ignitionElapsedS: number;
  ignitionProgress: number;
  levels: RocketLevels;
}

function altitudeLabel(valueM: number): string {
  return `${Math.round(valueM).toLocaleString()} m`;
}

export function RocketCanvas({
  trace,
  current,
  recordM,
  nominalPeakM,
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
    // Camera framing is based on nominal capability and record, not the
    // hidden actual peak of a seeded launch. Keep the range in stable 100 m
    // bands so same-build launches remain visually comparable.
    const bodyHeight = 58 + Math.min(10, levels.fuel * 1.25);
    const scaleMaxM = cameraMaxAltitudeM(recordM, nominalPeakM);
    const altitudeScale = createAltitudeScale(height, scaleMaxM, rocketAnchorHeightPx(bodyHeight));
    const { groundY } = altitudeScale;
    const x = width * 0.5;
    const yForAltitude = (altitudeM: number) => altitudeToCanvasY(altitudeM, altitudeScale);

    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#091a2b');
    sky.addColorStop(0.62, '#123955');
    sky.addColorStop(1, '#1d5971');
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    context.fillStyle = 'rgba(255, 196, 100, 0.09)';
    context.fillRect(0, height * 0.62, width, height * 0.38);
    context.fillStyle = '#0b2638';
    context.fillRect(0, groundY, width, height - groundY);
    context.fillStyle = '#21475a';
    context.fillRect(0, groundY - 4, width, 4);

    context.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.textAlign = 'left';
    for (let index = 0; index <= 4; index += 1) {
      const altitudeM = (scaleMaxM / 4) * index;
      const y = yForAltitude(altitudeM);
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
      const recordY = yForAltitude(recordM);
      context.strokeStyle = '#ffc66d';
      context.setLineDash([6, 5]);
      context.beginPath();
      context.moveTo(18, recordY);
      context.lineTo(width - 18, recordY);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = '#ffd58d';
      context.textAlign = 'right';
      context.fillText(`record ${altitudeLabel(recordM)}`, width - 28, recordY - 7);
      context.textAlign = 'left';
    }

    const currentAltitudeY = yForAltitude(current.altitudeM);
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
      context.strokeStyle = 'rgba(112, 234, 239, 0.62)';
      context.lineWidth = 2;
      context.beginPath();
      shownTrace.forEach((sample, index) => {
        const traceX = x + Math.sin(sample.timeS * 0.22) * Math.min(24, width * 0.06);
        const traceY = yForAltitude(sample.altitudeM);
        if (index === 0) context.moveTo(traceX, traceY);
        else context.lineTo(traceX, traceY);
      });
      context.stroke();
    }

    // The silhouette is illustrative only; physics uses the immutable vehicle
    // specification and never reads canvas dimensions or pixels. The fin tips
    // are the visual altitude anchor, so the same y-coordinate also drives the
    // ruler, trace, current-altitude guide and numeric telemetry.
    const bodyWidth = 26 + Math.min(9, levels.airframe * 1.1);
    const rocketBaseOffset = bodyHeight / 2 + 12;
    const ignitionJitter = status === 'ignition' && !reducedMotion
      ? Math.sin(ignitionElapsedS * 34) * (0.7 + ignitionProgress * 1.5)
      : 0;

    if (status === 'ignition') {
      const padY = yForAltitude(0);
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

    // The shared scale reserves the complete silhouette headroom. Do not
    // clamp the rocket independently, or its anchor would disagree with the
    // ruler and guide near the top of the range.
    const rocketCenterY = currentAltitudeY - rocketBaseOffset;
    context.save();
    context.translate(x + ignitionJitter, rocketCenterY);
    context.fillStyle = '#d8e8e6';
    context.beginPath();
    context.moveTo(0, -bodyHeight / 2 - 17);
    context.quadraticCurveTo(bodyWidth / 2, -bodyHeight / 2 - 3, bodyWidth / 2, -bodyHeight / 2 + 9);
    context.lineTo(bodyWidth / 2, bodyHeight / 2 - 5);
    context.lineTo(-bodyWidth / 2, bodyHeight / 2 - 5);
    context.lineTo(-bodyWidth / 2, -bodyHeight / 2 + 9);
    context.quadraticCurveTo(-bodyWidth / 2, -bodyHeight / 2 - 3, 0, -bodyHeight / 2 - 17);
    context.fill();
    context.fillStyle = '#77d3d5';
    context.fillRect(-bodyWidth / 2 + 4, -bodyHeight / 2 + 12, bodyWidth - 8, 25);
    context.fillStyle = '#f1b36b';
    context.fillRect(-bodyWidth / 2 - 5, bodyHeight / 2 - 7, bodyWidth + 10, 8);
    context.fillStyle = '#e97557';
    context.beginPath();
    context.moveTo(-bodyWidth / 2, bodyHeight / 2 - 3);
    context.lineTo(-bodyWidth / 2 - 11, bodyHeight / 2 + 12);
    context.lineTo(-bodyWidth / 2, bodyHeight / 2 + 8);
    context.fill();
    context.beginPath();
    context.moveTo(bodyWidth / 2, bodyHeight / 2 - 3);
    context.lineTo(bodyWidth / 2 + 11, bodyHeight / 2 + 12);
    context.lineTo(bodyWidth / 2, bodyHeight / 2 + 8);
    context.fill();

    const powered = (status === 'playing' || status === 'replay') && current.phase === 'poweredAscent';
    const ignition = status === 'ignition';
    if (powered || ignition) {
      const flameHeight = powered
        ? 20 + (reducedMotion ? 0 : Math.sin(current.timeS * 18) * 4)
        : 10 + (reducedMotion ? 0 : Math.sin(ignitionElapsedS * 20) * 3);
      context.fillStyle = '#ffca6b';
      context.beginPath();
      context.moveTo(-7, bodyHeight / 2 + 5);
      context.quadraticCurveTo(0, bodyHeight / 2 + flameHeight, 7, bodyHeight / 2 + 5);
      context.fill();
      context.fillStyle = '#fff0ae';
      context.beginPath();
      context.moveTo(-3, bodyHeight / 2 + 5);
      context.quadraticCurveTo(0, bodyHeight / 2 + flameHeight - 8, 3, bodyHeight / 2 + 5);
      context.fill();
    }
    context.restore();

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
  }, [trace, current, recordM, nominalPeakM, simulationTimeS, showFullTrace, reducedMotion, status, ignitionElapsedS, ignitionProgress]);

  return <canvas ref={canvasRef} className="flight-canvas" role="img" aria-label="Rocket flight view with height ruler and record marker" />;
}
