import { GestureStateMachine } from '../../hooks/useGestureStability';
import { audioEngine } from '../../services/audioEngine';
import { dist2, handOpenness, palmCenter } from '../shared/handGeometry';
import { ParticlePool } from '../shared/particles';
import { emitModuleEvent } from '../../store/moduleEvents';
import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, TrackingContext } from '../../types/modules';
import type { Point2D } from '../../types/tracking';

const OPEN_THRESHOLD = 0.6;
const FIST_THRESHOLD = 0.5;
const FORM_HOLD_MS = 500;
const CHARGE_SECONDS = 1.8;
const DECAY_SECONDS = 1.2;
const BASE_ORBITERS = 18;

interface Orbiter {
  angle: number;
  speed: number;
  radiusFactor: number;
  size: number;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function drawArc(ctx: CanvasRenderingContext2D, center: Point2D, radius: number, angle: number, seed: number): void {
  const segments = 5;
  ctx.beginPath();
  ctx.moveTo(center.x + Math.cos(angle) * radius * 0.2, center.y + Math.sin(angle) * radius * 0.2);
  for (let s = 1; s <= segments; s++) {
    const t = s / segments;
    const r = radius * (0.2 + t * 0.8);
    const jitter = (pseudoRandom(seed + s * 12.9898) - 0.5) * radius * 0.28;
    const perp = angle + Math.PI / 2;
    ctx.lineTo(center.x + Math.cos(angle) * r + Math.cos(perp) * jitter, center.y + Math.sin(angle) * r + Math.sin(perp) * jitter);
  }
  ctx.stroke();
}

function drawProgressRing(ctx: CanvasRenderingContext2D, center: Point2D, radius: number, progress: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Two open palms facing each other (held briefly) form a plasma sphere between them.
 * Distance between palms sets its size, the midpoint sets its position, the vector
 * between hands sets its rotation. Both fists closed charges it; snapping both hands
 * open again while charged releases an expanding particle wave.
 */
export function createEnergyOrbModule(): InteractionModule {
  const formMachine = new GestureStateMachine(FORM_HOLD_MS, 200, 300);
  const burstPool = new ParticlePool(80);
  const orbiters: Orbiter[] = Array.from({ length: BASE_ORBITERS }, (_, i) => ({
    angle: (i / BASE_ORBITERS) * Math.PI * 2,
    speed: 0.6 + pseudoRandom(i * 7.31) * 0.8,
    radiusFactor: pseudoRandom(i * 3.17),
    size: 1.4 + pseudoRandom(i * 5.53) * 1.8,
  }));

  let formed = false;
  let radius = 0;
  let targetRadius = 0;
  let center: Point2D = { x: 0, y: 0 };
  let rotation = 0;
  let chargeLevel = 0;
  let wasBothFists = false;

  function dissolve(): void {
    formed = false;
    chargeLevel = 0;
    wasBothFists = false;
    formMachine.reset();
  }

  function release(context: TrackingContext): void {
    const count = Math.round(26 * context.quality.particleMultiplier);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const speed = 130 + Math.random() * 90;
      burstPool.spawn({
        x: center.x,
        y: center.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        maxLife: 0.45 + Math.random() * 0.3,
        size: 2 + Math.random() * 2,
        hue: 12 + Math.random() * 40,
      });
    }
    if (context.soundEnabled) audioEngine.play('alert');
    chargeLevel = 0;
  }

  const module: InteractionModule = {
    id: 'energyOrb',
    label: MODULE_LABELS.energyOrb,
    enabled: false,

    activate() {
      this.enabled = true;
    },

    update(context: TrackingContext) {
      const hands = context.hands.hands.filter((h) => h.opacity > 0.5);
      const left = hands.find((h) => h.handedness === 'Left');
      const right = hands.find((h) => h.handedness === 'Right');

      burstPool.update(context.dt, (p, dt) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      });

      if (!left || !right) {
        if (formed) dissolve();
        return;
      }

      const openA = handOpenness(left) > OPEN_THRESHOLD;
      const openB = handOpenness(right) > OPEN_THRESHOLD;
      const pA = context.toCanvas(palmCenter(left).x, palmCenter(left).y);
      const pB = context.toCanvas(palmCenter(right).x, palmCenter(right).y);
      const distance = dist2(pA, pB);
      // Plausible "holding something between both hands" range — deliberately not gated on
      // 3D palm orientation, which can't be reliably calibrated without a real camera to test.
      const withinRange = distance > context.canvasWidth * 0.05 && distance < context.canvasWidth * 0.55;
      const canForm = openA && openB && withinRange;

      if (!formed) {
        if (formMachine.update(canForm, context.time) === 'ACTIVE') {
          formed = true;
          emitModuleEvent('ENERGY CORE STABILIZED');
          if (context.soundEnabled) audioEngine.play('lock');
        } else {
          return;
        }
      }

      const midpoint = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };

      targetRadius = Math.max(context.canvasWidth * 0.035, Math.min(context.canvasWidth * 0.24, distance * 0.3));
      radius += (targetRadius - radius) * 0.18;
      center = { x: center.x + (midpoint.x - center.x) * 0.3, y: center.y + (midpoint.y - center.y) * 0.3 };
      rotation = Math.atan2(pB.y - pA.y, pB.x - pA.x);

      const bothFists = handOpenness(left) < FIST_THRESHOLD && handOpenness(right) < FIST_THRESHOLD;
      if (bothFists) {
        chargeLevel = Math.min(1, chargeLevel + context.dt / CHARGE_SECONDS);
      } else {
        chargeLevel = Math.max(0, chargeLevel - context.dt / DECAY_SECONDS);
      }

      const bothOpenNow = handOpenness(left) > 0.78 && handOpenness(right) > 0.78;
      if (wasBothFists && bothOpenNow && chargeLevel > 0.15) {
        release(context);
      }
      wasBothFists = bothFists;

      const spin = 1 + chargeLevel * 1.5;
      for (const o of orbiters) o.angle += o.speed * context.dt * spin;
    },

    render(ctx: CanvasRenderingContext2D, context: TrackingContext) {
      if (!formed) {
        if (formMachine.state === 'DETECTING') {
          const hands = context.hands.hands.filter((h) => h.opacity > 0.5);
          const left = hands.find((h) => h.handedness === 'Left');
          const right = hands.find((h) => h.handedness === 'Right');
          if (left && right) {
            const pA = context.toCanvas(palmCenter(left).x, palmCenter(left).y);
            const pB = context.toCanvas(palmCenter(right).x, palmCenter(right).y);
            drawProgressRing(ctx, { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 }, 22, formMachine.progress, '#3ac6e8');
          }
        }
        return;
      }

      ctx.save();
      const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
      gradient.addColorStop(0, 'rgba(255,246,224,0.95)');
      gradient.addColorStop(0.45, `rgba(255,140,60,${0.55 + chargeLevel * 0.3})`);
      gradient.addColorStop(1, 'rgba(179,18,31,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (context.quality.effectsEnabled) {
        for (let i = 1; i <= 2; i++) {
          ctx.strokeStyle = `rgba(255,120,40,${0.18 / i})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius * (1 + i * 0.2) + Math.sin(context.time / 320 + i) * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const arcCount = Math.max(1, Math.round(3 * context.quality.particleMultiplier));
      ctx.strokeStyle = '#fff2d9';
      ctx.shadowColor = '#ff8c3c';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < arcCount; i++) {
        const angle = rotation + (i / arcCount) * Math.PI * 2 + context.time / 900;
        drawArc(ctx, center, radius, angle, context.time / 140 + i * 91.7);
      }

      ctx.shadowBlur = 6;
      const orbiterCount = Math.min(orbiters.length, Math.round(BASE_ORBITERS * context.quality.particleMultiplier));
      for (let i = 0; i < orbiterCount; i++) {
        const o = orbiters[i];
        const r = radius * (0.55 + o.radiusFactor * 0.55);
        const x = center.x + Math.cos(o.angle + rotation) * r;
        const y = center.y + Math.sin(o.angle + rotation) * r * 0.55;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#fff2d9';
        ctx.beginPath();
        ctx.arc(x, y, o.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (chargeLevel > 0.02) {
        drawProgressRing(ctx, center, radius + 14, chargeLevel, '#e8c93a');
      }

      burstPool.forEachActive((p) => {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = `hsl(${p.hue}, 90%, 72%)`;
        ctx.shadowColor = `hsl(${p.hue}, 90%, 60%)`;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      ctx.restore();
    },

    reset() {
      dissolve();
      radius = 0;
      targetRadius = 0;
      center = { x: 0, y: 0 };
      burstPool.clear();
    },

    deactivate() {
      this.enabled = false;
      this.reset();
    },
  };

  return module;
}
