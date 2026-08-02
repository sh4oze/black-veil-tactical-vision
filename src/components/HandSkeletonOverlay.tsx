import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { computeCoverMapping, landmarkToCanvas } from '../utils/coordinates';
import { drawHandSkeleton } from '../utils/drawing';
import type { HandTrackingResult } from '../types/tracking';

interface HandSkeletonOverlayProps {
  resultRef: RefObject<HandTrackingResult>;
  width: number;
  height: number;
  videoSize: { w: number; h: number };
  visible: boolean;
}

export default function HandSkeletonOverlay({ resultRef, width, height, videoSize, visible }: HandSkeletonOverlayProps) {
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
      if (!result?.hands.length || !videoSize.w || !videoSize.h) return;

      const mapping = computeCoverMapping(videoSize.w, videoSize.h, width, height);

      for (const hand of result.hands) {
        const points = hand.landmarks.map((lm) => landmarkToCanvas(lm.x, lm.y, mapping, width));
        drawHandSkeleton(ctx, points, hand.handedness, hand.opacity, time);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [visible, width, height, videoSize, dpr, resultRef]);

  return <canvas ref={canvasRef} className="stage-canvas" />;
}
