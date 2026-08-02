import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { computeCoverMapping, landmarkToCanvas } from '../utils/coordinates';
import { interactionStore } from '../store/interactionStore';
import type { MotionHistoryTracker } from '../hooks/useMotionHistory';
import type { InteractionModule, QualityLevel, ResolvedQuality, TrackingContext } from '../types/modules';
import type { FaceTrackingResult, HandTrackingResult } from '../types/tracking';

interface InteractionModulesLayerProps {
  activeModules: InteractionModule[];
  faceResultRef: RefObject<FaceTrackingResult>;
  handResultRef: RefObject<HandTrackingResult>;
  historyRef: RefObject<MotionHistoryTracker>;
  width: number;
  height: number;
  videoSize: { w: number; h: number };
}

const QUALITY_TABLE: Record<QualityLevel, ResolvedQuality> = {
  low: { level: 'low', particleMultiplier: 0.25, effectsEnabled: false },
  medium: { level: 'medium', particleMultiplier: 0.55, effectsEnabled: true },
  high: { level: 'high', particleMultiplier: 1, effectsEnabled: true },
  ultra: { level: 'ultra', particleMultiplier: 1.6, effectsEnabled: true },
};

function resolveQuality(setting: string, measuredFps: number): ResolvedQuality {
  if (setting !== 'auto') return QUALITY_TABLE[setting as QualityLevel] ?? QUALITY_TABLE.high;
  let level: QualityLevel;
  if (measuredFps < 24) level = 'low';
  else if (measuredFps < 40) level = 'medium';
  else if (measuredFps < 55) level = 'high';
  else level = 'ultra';
  return QUALITY_TABLE[level];
}

export default function InteractionModulesLayer({
  activeModules,
  faceResultRef,
  handResultRef,
  historyRef,
  width,
  height,
  videoSize,
}: InteractionModulesLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeModulesRef = useRef(activeModules);
  activeModulesRef.current = activeModules;
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

    let rafId = 0;
    let lastTime = performance.now();
    let fpsAcc = 0;
    let fpsCount = 0;
    let measuredFps = 60;

    const toCanvasFactory = (mapping: ReturnType<typeof computeCoverMapping>) => (nx: number, ny: number) =>
      landmarkToCanvas(nx, ny, mapping, width);

    const loop = (time: number) => {
      rafId = requestAnimationFrame(loop);
      const canvas2 = canvasRef.current;
      if (!canvas2 || width <= 0 || height <= 0) return;
      const ctx = canvas2.getContext('2d');
      if (!ctx) return;

      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;
      if (dt > 0) {
        fpsAcc += 1 / dt;
        fpsCount += 1;
        if (fpsCount >= 20) {
          measuredFps = fpsAcc / fpsCount;
          fpsAcc = 0;
          fpsCount = 0;
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const modules = activeModulesRef.current;
      if (modules.length === 0) return;

      const prefs = interactionStore.getState();
      const mapping = computeCoverMapping(videoSize.w, videoSize.h, width, height);

      const context: TrackingContext = {
        time,
        dt,
        face: faceResultRef.current ?? {
          status: 'searching',
          landmarks: null,
          foreheadPoint: null,
          boundingBox: null,
          confidence: 0,
          sizeMetric: 0,
        },
        hands: handResultRef.current ?? { hands: [], bothHandsRaised: false },
        handHistory: historyRef.current?.snapshot() ?? new Map(),
        canvasWidth: width,
        canvasHeight: height,
        mapping,
        toCanvas: toCanvasFactory(mapping),
        quality: resolveQuality(prefs.quality, measuredFps),
        sensitivity: prefs.options.gestureSensitivity,
        confirmationMs: prefs.options.gestureConfirmationMs,
        soundEnabled: prefs.options.soundEffects,
      };

      for (const mod of modules) {
        mod.update(context);
      }
      for (const mod of modules) {
        mod.render(ctx, context);
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [width, height, videoSize, dpr, faceResultRef, handResultRef, historyRef]);

  return <canvas ref={canvasRef} className="stage-canvas" />;
}
