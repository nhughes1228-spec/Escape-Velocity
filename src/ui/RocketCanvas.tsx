import { useEffect, useRef } from 'react';
import type { TraceSample } from '../simulation/types';
import { visibleTrace } from '../presentation/trace';

interface RocketCanvasProps {
  trace: TraceSample[];
  current: TraceSample;
  recordM: number;
  simulationTimeS: number;
  showFullTrace: boolean;
  reducedMotion: boolean;
  status: 'ready' | 'ignition' | 'playing' | 'result';
}

function altitudeLabel(valueM: number): string {
  return `${Math.round(valueM).toLocaleString()} m`;
}

export function RocketCanvas({ trace, current, recordM, simulationTimeS, showFullTrace, reducedMotion, status }: RocketCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    const tracePeak = shownTrace.reduce((peak, sample) => Math.max(peak, sample.altitudeM), 0);
    const scaleMaxM = Math.max(250, recordM * 1.15, current.altitudeM * 1.2, tracePeak * 1.15);
    const groundY = height - 48;
    const skyTopY = 28;
    const flightHeight = groundY - skyTopY;
    const x = width * 0.5;
    const yForAltitude = (altitudeM: number) => groundY - (Math.max(0, altitudeM) / scaleMaxM) * flightHeight;

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
    // specification and never reads canvas dimensions or pixels.
    const rocketY = yForAltitude(current.altitudeM);
    const bodyWidth = 26;
    const bodyHeight = 58;
    context.save();
    context.translate(x, Math.max(skyTopY + 22, Math.min(groundY - 30, rocketY)));
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

    const powered = status === 'playing' && current.phase === 'poweredAscent';
    if (powered && !reducedMotion) {
      const flameHeight = 20 + Math.sin(current.timeS * 18) * 4;
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
  }, [trace, current, recordM, simulationTimeS, showFullTrace, reducedMotion, status]);

  return <canvas ref={canvasRef} className="flight-canvas" role="img" aria-label="Rocket flight view with height ruler and record marker" />;
}
