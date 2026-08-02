import { getWristVelocity } from '../../hooks/useMotionHistory';
import { audioEngine } from '../../services/audioEngine';
import { dist2, handOpenness, palmCenter } from '../shared/handGeometry';
import { emitModuleEvent } from '../../store/moduleEvents';
import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, TrackingContext } from '../../types/modules';
import type { Handedness, Point2D } from '../../types/tracking';

type ObjectState = 'idle' | 'floating' | 'held';

interface TkObject {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  floatPhase: number;
  state: ObjectState;
  heldBy: Handedness | null;
}

const REACH_RADIUS = 150;
const OPEN_THRESHOLD = 0.6;
const FIST_THRESHOLD = 0.42;
const RELEASE_OPEN_THRESHOLD = 0.85;
const FRICTION_PER_SEC = 1.4;
const OBJECT_COUNT = 4;

function createObjects(canvasWidth: number, canvasHeight: number): TkObject[] {
  return Array.from({ length: OBJECT_COUNT }, (_, i) => ({
    id: `tk-${i}`,
    x: canvasWidth * (0.2 + (i / (OBJECT_COUNT - 1)) * 0.6),
    y: canvasHeight * 0.6,
    vx: 0,
    vy: 0,
    radius: 20,
    floatPhase: Math.random() * Math.PI * 2,
    state: 'idle',
    heldBy: null,
  }));
}

/**
 * Objects drift idly until an open palm reaches toward one (it starts to float);
 * closing that hand into a fist locks it to the hand with visible tether lines;
 * snapping the hand open again throws it using the hand's recently measured
 * velocity (from the shared motion history, not a single-frame delta).
 */
export function createTelekinesisModule(): InteractionModule {
  let objects: TkObject[] = [];
  let initialized = false;
  let announcedHold = false;

  function ensureInitialized(context: TrackingContext): void {
    if (initialized) return;
    objects = createObjects(context.canvasWidth, context.canvasHeight);
    initialized = true;
  }

  const module: InteractionModule = {
    id: 'telekinesis',
    label: MODULE_LABELS.telekinesis,
    enabled: false,

    activate() {
      this.enabled = true;
    },

    update(context: TrackingContext) {
      ensureInitialized(context);
      const hands = context.hands.hands.filter((h) => h.opacity > 0.5);

      for (const hand of hands) {
        const openness = handOpenness(hand);
        const palmPos = context.toCanvas(palmCenter(hand).x, palmCenter(hand).y);
        const held = objects.find((o) => o.heldBy === hand.handedness);

        if (held) {
          if (openness > RELEASE_OPEN_THRESHOLD) {
            const samples = context.handHistory.get(hand.handedness);
            const vel = getWristVelocity(samples, context.time, 160);
            held.state = 'idle';
            held.heldBy = null;
            held.vx = vel.x * context.mapping.drawWidth;
            held.vy = vel.y * context.mapping.drawHeight;
            if (context.soundEnabled) audioEngine.play('gesture_confirmed');
          } else {
            held.x = palmPos.x;
            held.y = palmPos.y;
          }
          continue;
        }

        if (openness < FIST_THRESHOLD) {
          const floating = objects.find((o) => o.state === 'floating' && (o.heldBy === null || o.heldBy === hand.handedness));
          if (floating && dist2(palmPos, { x: floating.x, y: floating.y }) < REACH_RADIUS) {
            floating.state = 'held';
            floating.heldBy = hand.handedness;
            floating.vx = 0;
            floating.vy = 0;
            if (!announcedHold) {
              emitModuleEvent('GRAVITATIONAL HOLD ACTIVE');
              announcedHold = true;
            }
          }
          continue;
        }

        if (openness > OPEN_THRESHOLD) {
          let nearest: TkObject | null = null;
          let nearestDist = REACH_RADIUS;
          for (const obj of objects) {
            if (obj.state === 'held') continue;
            const d = dist2(palmPos, { x: obj.x, y: obj.y });
            if (d < nearestDist) {
              nearest = obj;
              nearestDist = d;
            }
          }
          if (nearest && nearest.state === 'idle') nearest.state = 'floating';
        }
      }

      for (const obj of objects) {
        if (obj.state === 'held') continue;

        if (obj.state === 'floating') {
          const stillInReach = hands.some(
            (h) => handOpenness(h) > FIST_THRESHOLD && dist2(context.toCanvas(palmCenter(h).x, palmCenter(h).y), { x: obj.x, y: obj.y }) < REACH_RADIUS * 1.3,
          );
          if (!stillInReach) obj.state = 'idle';
          obj.floatPhase += context.dt * 2;
          obj.y += Math.sin(obj.floatPhase) * 0.15;
          continue;
        }

        obj.x += obj.vx * context.dt;
        obj.y += obj.vy * context.dt;
        const decay = Math.max(0, 1 - FRICTION_PER_SEC * context.dt);
        obj.vx *= decay;
        obj.vy *= decay;

        obj.x = Math.max(obj.radius, Math.min(context.canvasWidth - obj.radius, obj.x));
        obj.y = Math.max(obj.radius, Math.min(context.canvasHeight - obj.radius, obj.y));
      }

      if (!objects.some((o) => o.state === 'held')) announcedHold = false;
    },

    render(ctx: CanvasRenderingContext2D, context: TrackingContext) {
      if (!initialized) return;

      for (const obj of objects) {
        const color = obj.state === 'held' ? '#e8c93a' : obj.state === 'floating' ? '#3ac6e8' : '#7dd35c';
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = obj.state === 'idle' ? 6 : 16;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.radius + 6 + Math.sin(context.time / 250) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        if (obj.state === 'held' && obj.heldBy) {
          const hand = context.hands.hands.find((h) => h.handedness === obj.heldBy && h.opacity > 0.5);
          if (hand) drawTether(ctx, context, hand.landmarks[0], { x: obj.x, y: obj.y }, context.time);

          ctx.save();
          ctx.fillStyle = '#e8c93a';
          ctx.font = '600 9px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('GRAVITATIONAL HOLD', obj.x, obj.y - obj.radius - 12);
          ctx.restore();
        }
      }
    },

    reset() {
      objects = [];
      initialized = false;
      announcedHold = false;
    },

    deactivate() {
      this.enabled = false;
      this.reset();
    },
  };

  return module;
}

function drawTether(
  ctx: CanvasRenderingContext2D,
  context: TrackingContext,
  wristLandmark: { x: number; y: number },
  target: Point2D,
  time: number,
): void {
  const wristPos = context.toCanvas(wristLandmark.x, wristLandmark.y);
  const segments = 8;
  ctx.save();
  ctx.strokeStyle = '#e8c93a';
  ctx.shadowColor = '#e8c93a';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(wristPos.x, wristPos.y);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const jitter = Math.sin(time / 60 + i * 2) * 4 * (1 - t);
    const x = wristPos.x + (target.x - wristPos.x) * t + jitter;
    const y = wristPos.y + (target.y - wristPos.y) * t;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}
