import { getWristVelocity } from '../../hooks/useMotionHistory';
import { audioEngine } from '../../services/audioEngine';
import { dist2, handOpenness, isPinching, palmCenter, pinchMidpoint } from '../shared/handGeometry';
import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, TrackingContext } from '../../types/modules';
import type { Point2D, TrackedHand } from '../../types/tracking';

interface FieldParticle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;
}

interface Shockwave {
  x: number;
  y: number;
  age: number;
}

const MAX_CAPACITY = 500;
const BASE_COUNT = 260;
const REPEL_R = 170;
const REPEL_STRENGTH = 900;
const ATTRACT_R = 190;
const ATTRACT_STRENGTH = 650;
const CONCENTRATE_R = 110;
const CONCENTRATE_STRENGTH = 1100;
const VORTEX_R = 200;
const DRAG = 0.985;
const SHOCKWAVE_SPEED_THRESHOLD = 1.6;
const SHOCKWAVE_DURATION = 0.7;
const SHOCKWAVE_COOLDOWN_MS = 900;

function randomParticle(canvasWidth: number, canvasHeight: number): FieldParticle {
  const x = Math.random() * canvasWidth;
  const y = Math.random() * canvasHeight;
  return { x, y, prevX: x, prevY: y, vx: 0, vy: 0, size: 1 + Math.random() * 1.8, hue: 120 + Math.random() * 60 };
}

/** Angular "curl" of a hand's recent path — positive = counter-clockwise sweep — used to drive the vortex effect. */
function estimateCurl(hand: TrackedHand, context: TrackingContext): number {
  const samples = context.handHistory.get(hand.handedness);
  if (!samples || samples.length < 4) return 0;
  const now = context.time;
  const recent = samples.filter((s) => now - s.t <= 420);
  if (recent.length < 4) return 0;
  const a = recent[0];
  const b = recent[Math.floor(recent.length / 2)];
  const c = recent[recent.length - 1];
  const v1x = b.landmarks[0].x - a.landmarks[0].x;
  const v1y = b.landmarks[0].y - a.landmarks[0].y;
  const v2x = c.landmarks[0].x - b.landmarks[0].x;
  const v2y = c.landmarks[0].y - b.landmarks[0].y;
  const cross = v1x * v2y - v1y * v2x;
  const dt = (c.t - a.t) / 1000 || 1;
  return cross / dt;
}

export function createParticleFieldModule(): InteractionModule {
  const particles: FieldParticle[] = [];
  let activeCount = 0;
  let shockwaves: Shockwave[] = [];
  let lastShockwaveAt = 0;
  let initialized = false;
  let sizeCache = { w: 0, h: 0 };

  function ensureInitialized(context: TrackingContext): void {
    if (!initialized) {
      for (let i = 0; i < MAX_CAPACITY; i++) particles.push(randomParticle(context.canvasWidth, context.canvasHeight));
      initialized = true;
      sizeCache = { w: context.canvasWidth, h: context.canvasHeight };
    }
    activeCount = Math.max(40, Math.min(MAX_CAPACITY, Math.round(BASE_COUNT * context.quality.particleMultiplier)));
  }

  const module: InteractionModule = {
    id: 'particleField',
    label: MODULE_LABELS.particleField,
    enabled: false,

    activate() {
      this.enabled = true;
    },

    update(context: TrackingContext) {
      ensureInitialized(context);
      if (sizeCache.w !== context.canvasWidth || sizeCache.h !== context.canvasHeight) {
        sizeCache = { w: context.canvasWidth, h: context.canvasHeight };
      }

      const hands = context.hands.hands.filter((h) => h.opacity > 0.5);

      shockwaves = shockwaves.filter((s) => s.age < SHOCKWAVE_DURATION);
      for (const s of shockwaves) s.age += context.dt;

      interface HandForce {
        pos: Point2D;
        pinchPos: Point2D;
        repel: boolean;
        attract: boolean;
        pinch: boolean;
        curl: number;
      }

      const handForces: HandForce[] = hands.map((hand) => {
        const openness = handOpenness(hand);
        const pos = context.toCanvas(palmCenter(hand).x, palmCenter(hand).y);
        const pinchPos = context.toCanvas(pinchMidpoint(hand).x, pinchMidpoint(hand).y);
        return {
          pos,
          pinchPos,
          repel: openness > 0.62,
          attract: openness < 0.4,
          pinch: isPinching(hand, context.sensitivity),
          curl: estimateCurl(hand, context),
        };
      });

      let globalForce = 0;
      if (hands.length === 2) {
        const a = context.toCanvas(palmCenter(hands[0]).x, palmCenter(hands[0]).y);
        const b = context.toCanvas(palmCenter(hands[1]).x, palmCenter(hands[1]).y);
        const d = dist2(a, b);
        const normalized = (d - context.canvasWidth * 0.25) / context.canvasWidth;
        globalForce = Math.max(-260, Math.min(260, normalized * 400));
      }
      const fieldCenter = { x: context.canvasWidth / 2, y: context.canvasHeight / 2 };

      for (const hand of hands) {
        const vel = getWristVelocity(context.handHistory.get(hand.handedness), context.time, 120);
        if (vel.speed > SHOCKWAVE_SPEED_THRESHOLD && context.time - lastShockwaveAt > SHOCKWAVE_COOLDOWN_MS) {
          const pos = context.toCanvas(palmCenter(hand).x, palmCenter(hand).y);
          shockwaves.push({ x: pos.x, y: pos.y, age: 0 });
          lastShockwaveAt = context.time;
          if (context.soundEnabled) audioEngine.play('alert');
        }
      }

      for (let i = 0; i < activeCount; i++) {
        const p = particles[i];
        p.prevX = p.x;
        p.prevY = p.y;
        let ax = 0;
        let ay = 0;

        for (const hf of handForces) {
          if (hf.repel) {
            const d = Math.max(1, dist2(p, hf.pos));
            if (d < REPEL_R) {
              const f = (1 - d / REPEL_R) * REPEL_STRENGTH;
              ax += ((p.x - hf.pos.x) / d) * f;
              ay += ((p.y - hf.pos.y) / d) * f;
            }
          }
          if (hf.attract) {
            const d = Math.max(1, dist2(p, hf.pos));
            if (d < ATTRACT_R) {
              const f = (1 - d / ATTRACT_R) * ATTRACT_STRENGTH;
              ax -= ((p.x - hf.pos.x) / d) * f;
              ay -= ((p.y - hf.pos.y) / d) * f;
            }
          }
          if (hf.pinch) {
            const d = Math.max(1, dist2(p, hf.pinchPos));
            if (d < CONCENTRATE_R) {
              const f = (1 - d / CONCENTRATE_R) * CONCENTRATE_STRENGTH;
              ax -= ((p.x - hf.pinchPos.x) / d) * f;
              ay -= ((p.y - hf.pinchPos.y) / d) * f;
            }
          }
          if (Math.abs(hf.curl) > 0.4) {
            const d = Math.max(1, dist2(p, hf.pos));
            if (d < VORTEX_R) {
              const strength = Math.min(1, Math.abs(hf.curl) / 6) * (1 - d / VORTEX_R) * 500;
              const dir = Math.sign(hf.curl);
              const dx = p.x - hf.pos.x;
              const dy = p.y - hf.pos.y;
              ax += (-dy / d) * strength * dir;
              ay += (dx / d) * strength * dir;
            }
          }
        }

        if (globalForce !== 0) {
          const d = Math.max(1, dist2(p, fieldCenter));
          ax += ((p.x - fieldCenter.x) / d) * globalForce;
          ay += ((p.y - fieldCenter.y) / d) * globalForce;
        }

        for (const s of shockwaves) {
          const d = Math.max(1, dist2(p, s));
          const ringR = (s.age / SHOCKWAVE_DURATION) * 260;
          if (Math.abs(d - ringR) < 40) {
            const f = 1400 * (1 - s.age / SHOCKWAVE_DURATION);
            ax += ((p.x - s.x) / d) * f;
            ay += ((p.y - s.y) / d) * f;
          }
        }

        p.vx = (p.vx + ax * context.dt) * DRAG;
        p.vy = (p.vy + ay * context.dt) * DRAG;
        p.x += p.vx * context.dt;
        p.y += p.vy * context.dt;

        if (p.x < 0) p.x += context.canvasWidth;
        if (p.x > context.canvasWidth) p.x -= context.canvasWidth;
        if (p.y < 0) p.y += context.canvasHeight;
        if (p.y > context.canvasHeight) p.y -= context.canvasHeight;
      }
    },

    render(ctx: CanvasRenderingContext2D, context: TrackingContext) {
      if (!initialized) return;
      const showTrails = context.quality.effectsEnabled;

      ctx.save();
      for (let i = 0; i < activeCount; i++) {
        const p = particles[i];
        ctx.strokeStyle = ctx.fillStyle = `hsla(${p.hue}, 85%, 68%, 0.85)`;
        if (showTrails && (Math.abs(p.x - p.prevX) > 0.05 || Math.abs(p.y - p.prevY) > 0.05)) {
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.prevX, p.prevY);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      for (const s of shockwaves) {
        const t = s.age / SHOCKWAVE_DURATION;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t) * 0.6;
        ctx.strokeStyle = '#eaffee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, t * 260, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },

    reset() {
      particles.length = 0;
      shockwaves = [];
      initialized = false;
      activeCount = 0;
    },

    deactivate() {
      this.enabled = false;
      this.reset();
    },
  };

  return module;
}
