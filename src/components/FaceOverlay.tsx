import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { computeCoverMapping, landmarkToCanvas } from '../utils/coordinates';
import { drawFaceFrame, drawReticle } from '../utils/drawing';
import { interactionStore } from '../store/interactionStore';
import type { FaceTrackingResult } from '../types/tracking';

interface FaceOverlayProps {
  resultRef: RefObject<FaceTrackingResult>;
  width: number;
  height: number;
  videoSize: { w: number; h: number };
  visible: boolean;
}

export default function FaceOverlay({ resultRef, width, height, videoSize, visible }: FaceOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }, [width, height, dpr]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!visible) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let rafId = 0;
    const draw = (time: number) => {
      rafId = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx || width <= 0 || height <= 0) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const result = resultRef.current;
      if (!result?.landmarks || !videoSize.w || !videoSize.h) return;

      const mapping = computeCoverMapping(videoSize.w, videoSize.h, width, height);

      if (result.boundingBox) {
        const p1 = landmarkToCanvas(result.boundingBox.x, result.boundingBox.y, mapping, width);
        const p2 = landmarkToCanvas(
          result.boundingBox.x + result.boundingBox.width,
          result.boundingBox.y + result.boundingBox.height,
          mapping,
          width,
        );
        const box = {
          x: Math.min(p1.x, p2.x),
          y: p1.y,
          width: Math.abs(p2.x - p1.x),
          height: p2.y - p1.y,
        };
        drawFaceFrame(ctx, box, result.status, time);
      }

      if (result.foreheadPoint) {
        const center = landmarkToCanvas(result.foreheadPoint.x, result.foreheadPoint.y, mapping, width);
        const radius = Math.max(20, Math.min(80, (result.sizeMetric || 0.08) * mapping.drawWidth * 1.7));
        drawReticle(ctx, center, radius, result.status, time);
      }

      if (interactionStore.getState().options.showDebugLandmarks) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 47, 212, 0.7)';
        for (let i = 0; i < result.landmarks.length; i += 2) {
          const p = landmarkToCanvas(result.landmarks[i].x, result.landmarks[i].y, mapping, width);
          ctx.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5);
        }
        ctx.restore();
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [visible, width, height, videoSize, dpr, resultRef]);

  return <canvas ref={canvasRef} className="stage-canvas" />;
}
