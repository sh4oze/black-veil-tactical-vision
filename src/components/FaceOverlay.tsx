import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { computeCoverMapping, landmarkToCanvas } from '../utils/coordinates';
import { drawFaceFrame, drawReticle } from '../utils/drawing';
import { audioEngine } from '../services/audioEngine';
import { ParticlePool } from '../modules/shared/particles';
import { interactionStore } from '../store/interactionStore';
import type { FaceTrackingResult } from '../types/tracking';

interface FaceOverlayProps {
  resultRef: RefObject<FaceTrackingResult>;
  width: number;
  height: number;
  videoSize: { w: number; h: number };
  visible: boolean;
}

interface Projectile {
  x: number;
  y: number;
  dx: number;
  dy: number;
  traveled: number;
  maxDistance: number;
  targetX: number;
  targetY: number;
}

const PROJECTILE_SPEED = 2200;
const FIRE_COOLDOWN_MS = 900;
const HIT_RADIUS = 34;

export default function FaceOverlay({ resultRef, width, height, videoSize, visible }: FaceOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const projectilesRef = useRef<Projectile[]>([]);
  const impactPoolRef = useRef<ParticlePool | null>(null);
  const lastFireAtRef = useRef(-Infinity);

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
    if (!impactPoolRef.current) impactPoolRef.current = new ParticlePool(80);
    const impactPool = impactPoolRef.current;

    if (!visible) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    function spawnImpact(x: number, y: number, hit: boolean): void {
      const count = hit ? 16 : 8;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = hit ? 90 + Math.random() * 160 : 40 + Math.random() * 70;
        impactPool.spawn({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          maxLife: 0.35 + Math.random() * 0.3,
          size: 1.5 + Math.random() * (hit ? 2.5 : 1.5),
          hue: hit ? 6 + Math.random() * 20 : 205,
        });
      }
    }

    let rafId = 0;
    let lastTime = performance.now();

    const draw = (time: number) => {
      rafId = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx || width <= 0 || height <= 0) return;

      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const mapping = computeCoverMapping(videoSize.w, videoSize.h, width, height);
      const result = resultRef.current;
      const foreheadCanvas =
        result?.foreheadPoint && videoSize.w && videoSize.h
          ? landmarkToCanvas(result.foreheadPoint.x, result.foreheadPoint.y, mapping, width)
          : null;

      // Projectiles/impacts update and render regardless of current detection, so an
      // in-flight shot still resolves even if the target slips out of tracking meanwhile.
      projectilesRef.current = projectilesRef.current.filter((p) => {
        const step = PROJECTILE_SPEED * dt;
        p.x += p.dx * step;
        p.y += p.dy * step;
        p.traveled += step;
        if (p.traveled >= p.maxDistance) {
          const hit = !!foreheadCanvas && Math.hypot(foreheadCanvas.x - p.targetX, foreheadCanvas.y - p.targetY) < HIT_RADIUS;
          spawnImpact(p.x, p.y, hit);
          if (interactionStore.getState().options.soundEffects) audioEngine.play(hit ? 'alert' : 'target_lost');
          return false;
        }
        return true;
      });

      impactPool.update(dt, (p, pdt) => {
        p.x += p.vx * pdt;
        p.y += p.vy * pdt;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      });

      for (const p of projectilesRef.current) {
        const tailX = p.x - p.dx * 30;
        const tailY = p.y - p.dy * 30;
        ctx.save();
        const gradient = ctx.createLinearGradient(tailX, tailY, p.x, p.y);
        gradient.addColorStop(0, 'rgba(209,39,58,0)');
        gradient.addColorStop(1, '#ff5b5b');
        ctx.strokeStyle = gradient;
        ctx.shadowColor = '#d1273a';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
      }

      impactPool.forEachActive((p) => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = `hsl(${p.hue}, 85%, 62%)`;
        ctx.shadowColor = `hsl(${p.hue}, 85%, 55%)`;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      if (!result?.landmarks || !videoSize.w || !videoSize.h) return;

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

      if (result.foreheadPoint && foreheadCanvas) {
        const radius = Math.max(20, Math.min(80, (result.sizeMetric || 0.08) * mapping.drawWidth * 1.7));
        drawReticle(ctx, foreheadCanvas, radius, result.status, time);

        if (
          interactionStore.getState().options.autoFire &&
          result.status === 'tracked' &&
          time - lastFireAtRef.current > FIRE_COOLDOWN_MS
        ) {
          lastFireAtRef.current = time;
          const originX = width / 2 + (Math.random() - 0.5) * width * 0.12;
          const originY = height - 6;
          const dx = foreheadCanvas.x - originX;
          const dy = foreheadCanvas.y - originY;
          const dist = Math.hypot(dx, dy) || 1;
          projectilesRef.current.push({
            x: originX,
            y: originY,
            dx: dx / dist,
            dy: dy / dist,
            traveled: 0,
            maxDistance: dist,
            targetX: foreheadCanvas.x,
            targetY: foreheadCanvas.y,
          });
          if (interactionStore.getState().options.soundEffects) audioEngine.play('lock');
        }
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
