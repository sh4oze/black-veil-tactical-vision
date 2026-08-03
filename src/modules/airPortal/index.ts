import { GestureStateMachine } from '../../hooks/useGestureStability';
import { getLandmarkPath, pathCircularity } from '../../hooks/useMotionHistory';
import { audioEngine } from '../../services/audioEngine';
import { dist2, handOpenness, isPinching, pinchMidpoint } from '../shared/handGeometry';
import { emitModuleEvent } from '../../store/moduleEvents';
import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, TrackingContext } from '../../types/modules';
import type { Handedness, Point2D } from '../../types/tracking';

const DRAW_WINDOW_MS = 1400;
const MIN_DRAW_DURATION_MS = 650;
const CIRCULARITY_THRESHOLD = 0.6;
const CLOSE_HOLD_MS = 500;
const MIN_RADIUS = 50;
const MAX_RADIUS_RATIO = 0.32;
const REOPEN_COOLDOWN_MS = 700;
const GRAB_REACH = 50;

interface PortalGrab {
  /** center - pinchPos at the moment of grab, so single-hand drag doesn't snap the portal to the fingers. */
  offset: Point2D;
}

interface TwoHandResize {
  initialDist: number;
  initialRadius: number;
}

/**
 * Draws a portal by tracing a circle in the air with an extended index finger — the
 * gesture is validated from the finger's recent trajectory (radius consistency +
 * angular coverage), not a single-frame pose, so it takes a deliberate loop to open.
 * Once open, a pinch near the rim grabs it: one hand drags it around, two hands
 * pinching at once resize it from the live distance between the pinch points
 * (same "hands set the size" feel as Energy Orb). Both fists closes it.
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
  const grabbedHands = new Map<Handedness, PortalGrab>();
  let twoHandResize: TwoHandResize | null = null;

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

      const pinchingHands = hands.filter((h) => isPinching(h, context.sensitivity));
      const pinchingSet = new Set(pinchingHands.map((h) => h.handedness));

      for (const handedness of [...grabbedHands.keys()]) {
        if (!pinchingSet.has(handedness)) {
          grabbedHands.delete(handedness);
          if (twoHandResize && grabbedHands.size < 2) twoHandResize = null;
        }
      }

      for (const hand of pinchingHands) {
        if (grabbedHands.has(hand.handedness)) continue;
        const pinchPos = context.toCanvas(pinchMidpoint(hand).x, pinchMidpoint(hand).y);
        if (dist2(pinchPos, center) > radius + GRAB_REACH) continue;
        grabbedHands.set(hand.handedness, { offset: { x: center.x - pinchPos.x, y: center.y - pinchPos.y } });
        if (context.soundEnabled) audioEngine.play('hand_detected');
      }

      if (grabbedHands.size === 2) {
        const [handA, handB] = [...grabbedHands.keys()];
        const hA = hands.find((h) => h.handedness === handA);
        const hB = hands.find((h) => h.handedness === handB);
        if (hA && hB) {
          const pA = context.toCanvas(pinchMidpoint(hA).x, pinchMidpoint(hA).y);
          const pB = context.toCanvas(pinchMidpoint(hB).x, pinchMidpoint(hB).y);
          const liveDist = Math.max(20, dist2(pA, pB));
          if (!twoHandResize) twoHandResize = { initialDist: liveDist, initialRadius: radius };
          targetRadius = Math.max(
            MIN_RADIUS,
            Math.min(context.canvasWidth * MAX_RADIUS_RATIO, twoHandResize.initialRadius * (liveDist / twoHandResize.initialDist)),
          );
          center = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
        }
      } else if (grabbedHands.size === 1) {
        twoHandResize = null;
        const [[handedness, grab]] = [...grabbedHands.entries()];
        const hand = hands.find((h) => h.handedness === handedness);
        if (hand) {
          const pinchPos = context.toCanvas(pinchMidpoint(hand).x, pinchMidpoint(hand).y);
          center = { x: pinchPos.x + grab.offset.x, y: pinchPos.y + grab.offset.y };
        }
      }

      radius += (targetRadius - radius) * 0.12;

      const bothFists = grabbedHands.size === 0 && hands.length === 2 && hands.every((h) => handOpenness(h) < 0.42);
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

      const grabbed = grabbedHands.size > 0;
      ctx.save();
      ctx.strokeStyle = grabbed ? '#eaffee' : '#c8a8ff';
      ctx.shadowColor = grabbed ? '#eaffee' : '#c8a8ff';
      ctx.shadowBlur = grabbed ? 20 : 14;
      ctx.lineWidth = grabbed ? 3.2 : 2.5;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (twoHandResize && grabbedHands.size === 2) {
        const [handA, handB] = [...grabbedHands.keys()];
        const hA = context.hands.hands.find((h) => h.handedness === handA);
        const hB = context.hands.hands.find((h) => h.handedness === handB);
        if (hA && hB) {
          const pA = context.toCanvas(pinchMidpoint(hA).x, pinchMidpoint(hA).y);
          const pB = context.toCanvas(pinchMidpoint(hB).x, pinchMidpoint(hB).y);
          ctx.save();
          ctx.strokeStyle = 'rgba(234,255,238,0.5)';
          ctx.shadowColor = '#eaffee';
          ctx.shadowBlur = 6;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(pA.x, pA.y);
          ctx.lineTo(pB.x, pB.y);
          ctx.stroke();
          ctx.setLineDash([]);

          const pct = Math.round((radius / twoHandResize.initialRadius) * 100);
          ctx.fillStyle = '#eaffee';
          ctx.font = '600 10px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${pct}%`, (pA.x + pB.x) / 2, (pA.y + pB.y) / 2 - 10);
          ctx.restore();
        }
      }
    },

    reset() {
      open = false;
      radius = 0;
      targetRadius = 0;
      livePath = [];
      liveScore = 0;
      closeMachine.reset();
      lastCloseAt = -Infinity;
      grabbedHands.clear();
      twoHandResize = null;
    },

    deactivate() {
      this.enabled = false;
      this.reset();
    },
  };

  return module;
}
