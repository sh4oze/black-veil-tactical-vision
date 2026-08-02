import { GestureStateMachine } from '../../hooks/useGestureStability';
import { getLandmarkPath, pathCircularity } from '../../hooks/useMotionHistory';
import { audioEngine } from '../../services/audioEngine';
import { dist2, handOpenness } from '../shared/handGeometry';
import { emitModuleEvent } from '../../store/moduleEvents';
import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, TrackingContext } from '../../types/modules';
import type { Point2D } from '../../types/tracking';

const DRAW_WINDOW_MS = 1400;
const MIN_DRAW_DURATION_MS = 650;
const CIRCULARITY_THRESHOLD = 0.6;
const CLOSE_HOLD_MS = 500;
const MIN_RADIUS = 50;
const MAX_RADIUS_RATIO = 0.32;
const REOPEN_COOLDOWN_MS = 700;

/**
 * Draws a portal by tracing a circle in the air with an extended index finger — the
 * gesture is validated from the finger's recent trajectory (radius consistency +
 * angular coverage), not a single-frame pose, so it takes a deliberate loop to open.
 * Once open, the distance between both hands resizes it; both fists closes it.
 */
export function createAirPortalModule(): InteractionModule {
  const closeMachine = new GestureStateMachine(CLOSE_HOLD_MS, 120, 300);

  let open = false;
  let center: Point2D = { x: 0, y: 0 };
  let radius = 0;
  let targetRadius = 0;
  let rotation = 0;
  let lastCloseAt = -Infinity;
  let livePath: Point2D[] = [];
  let liveScore = 0;

  function closePortal(context: TrackingContext): void {
    open = false;
    closeMachine.reset();
    lastCloseAt = context.time;
    if (context.soundEnabled) audioEngine.play('target_lost');
  }

  const module: InteractionModule = {
    id: 'airPortal',
    label: MODULE_LABELS.airPortal,
    enabled: false,

    activate() {
      this.enabled = true;
    },

    update(context: TrackingContext) {
      const hands = context.hands.hands.filter((h) => h.opacity > 0.5);
      rotation += context.dt * 0.5;

      if (!open) {
        livePath = [];
        liveScore = 0;

        if (context.time - lastCloseAt < REOPEN_COOLDOWN_MS) return;

        const drawingHand = hands.find((h) => h.gesture === 'pointing');
        if (!drawingHand) return;

        const samples = context.handHistory.get(drawingHand.handedness);
        const rawPath = getLandmarkPath(samples, context.time, DRAW_WINDOW_MS, 8);
        if (rawPath.length < 10) return;

        const span = samples && samples.length > 1 ? context.time - samples[0].t : 0;
        const canvasPath = rawPath.map((p) => context.toCanvas(p.x, p.y));
        livePath = canvasPath;

        const { score, center: c, radius: r } = pathCircularity(rawPath);
        liveScore = score;

        if (score >= CIRCULARITY_THRESHOLD && span >= MIN_DRAW_DURATION_MS) {
          open = true;
          center = context.toCanvas(c.x, c.y);
          radius = Math.max(MIN_RADIUS, Math.min(context.canvasWidth * MAX_RADIUS_RATIO, r * context.mapping.drawWidth));
          targetRadius = radius;
          emitModuleEvent('SPATIAL RIFT STABILIZED');
          if (context.soundEnabled) audioEngine.play('lock');
        }
        return;
      }

      if (hands.length === 2) {
        const d = dist2(
          context.toCanvas(hands[0].landmarks[0].x, hands[0].landmarks[0].y),
          context.toCanvas(hands[1].landmarks[0].x, hands[1].landmarks[0].y),
        );
        targetRadius = Math.max(MIN_RADIUS, Math.min(context.canvasWidth * MAX_RADIUS_RATIO, d * 0.45));
      }
      radius += (targetRadius - radius) * 0.12;

      const bothFists = hands.length === 2 && hands.every((h) => handOpenness(h) < 0.42);
      if (closeMachine.update(bothFists, context.time) === 'ACTIVE') {
        closePortal(context);
      }
    },

    render(ctx: CanvasRenderingContext2D, context: TrackingContext) {
      if (!open) {
        if (livePath.length > 1) {
          ctx.save();
          ctx.strokeStyle = `rgba(58,198,232,${0.4 + liveScore * 0.5})`;
          ctx.shadowColor = '#3ac6e8';
          ctx.shadowBlur = 8;
          ctx.lineWidth = 2;
          ctx.beginPath();
          livePath.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
          ctx.restore();
        }
        return;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.clip();

      const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
      gradient.addColorStop(0, 'rgba(20,10,40,0.95)');
      gradient.addColorStop(1, 'rgba(10,4,24,0.98)');
      ctx.fillStyle = gradient;
      ctx.fillRect(center.x - radius, center.y - radius, radius * 2, radius * 2);

      ctx.strokeStyle = 'rgba(170,120,255,0.35)';
      ctx.lineWidth = 1;
      const rings = 5;
      for (let i = 1; i <= rings; i++) {
        const r = (radius * i) / rings + Math.sin(context.time / 500 + i) * 3;
        ctx.beginPath();
        ctx.arc(center.x, center.y, r, rotation * (i % 2 === 0 ? 1 : -1), rotation * (i % 2 === 0 ? 1 : -1) + Math.PI * 1.5);
        ctx.stroke();
      }

      const particleCount = Math.round(24 * context.quality.particleMultiplier);
      for (let i = 0; i < particleCount; i++) {
        const a = (i / particleCount) * Math.PI * 2 + rotation * 1.4;
        const rr = ((i * 37) % 100) / 100 * radius;
        const x = center.x + Math.cos(a) * rr;
        const y = center.y + Math.sin(a) * rr;
        ctx.fillStyle = 'rgba(200,170,255,0.8)';
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = '#c8a8ff';
      ctx.shadowColor = '#c8a8ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },

    reset() {
      open = false;
      radius = 0;
      targetRadius = 0;
      livePath = [];
      liveScore = 0;
      closeMachine.reset();
      lastCloseAt = -Infinity;
    },

    deactivate() {
      this.enabled = false;
      this.reset();
    },
  };

  return module;
}
