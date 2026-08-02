import { GestureStateMachine } from '../../hooks/useGestureStability';
import { audioEngine } from '../../services/audioEngine';
import { isPinching } from '../shared/handGeometry';
import { emitImpact } from '../shared/impactBus';
import { ParticlePool } from '../shared/particles';
import { emitModuleEvent } from '../../store/moduleEvents';
import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, TrackingContext } from '../../types/modules';
import type { Point2D } from '../../types/tracking';

interface Pulse {
  x: number;
  y: number;
  dx: number;
  dy: number;
  traveled: number;
  maxDistance: number;
}

interface Target {
  x: number;
  y: number;
  radius: number;
  spawnedAt: number;
}

const PULSE_SPEED = 1400;
const FIRE_HOLD_MS = 90;
const FIRE_COOLDOWN_MS = 280;
const TARGET_RADIUS = 26;

function pointToRayDistance(point: Point2D, origin: Point2D, dir: Point2D): number {
  const t = Math.max(0, (point.x - origin.x) * dir.x + (point.y - origin.y) * dir.y);
  const px = origin.x + dir.x * t;
  const py = origin.y + dir.y * t;
  return Math.hypot(point.x - px, point.y - py);
}

/**
 * Points with the index finger to aim (reuses the shared gesture classifier's
 * "pointing" shape), a quick pinch fires an abstract energy pulse along the
 * wrist->fingertip ray. Impacts broadcast on the shared impact bus so Holographic
 * Shield / Virtual Objects can react. A lightweight always-on target minigame tracks
 * shots, hits, accuracy and reaction time.
 */
export function createEnergyPulseModule(): InteractionModule {
  const fireMachine = new GestureStateMachine(FIRE_HOLD_MS, 60, FIRE_COOLDOWN_MS);
  const impactPool = new ParticlePool(120);

  let pulses: Pulse[] = [];
  let target: Target | null = null;
  let flashAlpha = 0;
  let wasFiring = false;
  let shots = 0;
  let hits = 0;
  let lastReactionMs = 0;

  function spawnTarget(context: TrackingContext): void {
    const marginX = context.canvasWidth * 0.15;
    const marginY = context.canvasHeight * 0.12;
    target = {
      x: marginX + Math.random() * (context.canvasWidth - marginX * 2),
      y: marginY + Math.random() * (context.canvasHeight * 0.55),
      radius: TARGET_RADIUS,
      spawnedAt: context.time,
    };
  }

  function spawnImpact(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 160;
      impactPool.spawn({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        maxLife: 0.35 + Math.random() * 0.25,
        size: 1.5 + Math.random() * 2,
        hue: 165,
      });
    }
  }

  function fire(tipPos: Point2D, dir: Point2D, context: TrackingContext): void {
    pulses.push({ x: tipPos.x, y: tipPos.y, dx: dir.x, dy: dir.y, traveled: 0, maxDistance: Math.hypot(context.canvasWidth, context.canvasHeight) });
    shots += 1;
    flashAlpha = 0.4;
    if (context.soundEnabled) audioEngine.play('lock');

    if (target) {
      const d = pointToRayDistance(target, tipPos, dir);
      if (d < target.radius + 12) {
        hits += 1;
        lastReactionMs = context.time - target.spawnedAt;
        emitModuleEvent('ALVO HOLOGRÁFICO NEUTRALIZADO');
        spawnImpact(target.x, target.y, Math.round(18 * context.quality.particleMultiplier));
        emitImpact({ x: target.x, y: target.y, strength: 0.45 });
        target = null;
      }
    }
  }

  const module: InteractionModule = {
    id: 'energyPulse',
    label: MODULE_LABELS.energyPulse,
    enabled: false,

    activate() {
      this.enabled = true;
    },

    update(context: TrackingContext) {
      if (!target) spawnTarget(context);

      const hands = context.hands.hands.filter((h) => h.opacity > 0.5 && h.gesture === 'pointing');
      const aimHand = hands[0];

      if (aimHand) {
        const wrist = context.toCanvas(aimHand.landmarks[0].x, aimHand.landmarks[0].y);
        const tip = context.toCanvas(aimHand.landmarks[8].x, aimHand.landmarks[8].y);
        const dx = tip.x - wrist.x;
        const dy = tip.y - wrist.y;
        const len = Math.hypot(dx, dy) || 1;
        const dir = { x: dx / len, y: dy / len };

        const pinching = isPinching(aimHand, context.sensitivity);
        const nowFiring = fireMachine.update(pinching, context.time) === 'ACTIVE';
        if (nowFiring && !wasFiring) fire(tip, dir, context);
        wasFiring = nowFiring;
      } else {
        fireMachine.reset();
        wasFiring = false;
      }

      pulses = pulses.filter((p) => {
        const step = PULSE_SPEED * context.dt;
        p.x += p.dx * step;
        p.y += p.dy * step;
        p.traveled += step;
        const outOfBounds = p.x < -20 || p.x > context.canvasWidth + 20 || p.y < -20 || p.y > context.canvasHeight + 20;
        if (p.traveled >= p.maxDistance || outOfBounds) {
          spawnImpact(p.x, p.y, Math.round(8 * context.quality.particleMultiplier));
          return false;
        }
        return true;
      });

      impactPool.update(context.dt, (p, dt) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      });

      flashAlpha = Math.max(0, flashAlpha - context.dt * 2.4);
    },

    render(ctx: CanvasRenderingContext2D, context: TrackingContext) {
      if (flashAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = flashAlpha * 0.25;
        ctx.strokeStyle = '#eaffee';
        ctx.lineWidth = 18;
        ctx.strokeRect(4, 4, context.canvasWidth - 8, context.canvasHeight - 8);
        ctx.restore();
      }

      if (target) {
        const pulse = (Math.sin(context.time / 220) + 1) / 2;
        ctx.save();
        ctx.strokeStyle = '#3ac6e8';
        ctx.shadowColor = '#3ac6e8';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      for (const p of pulses) {
        const tailX = p.x - p.dx * 46;
        const tailY = p.y - p.dy * 46;
        const gradient = ctx.createLinearGradient(tailX, tailY, p.x, p.y);
        gradient.addColorStop(0, 'rgba(125,211,92,0)');
        gradient.addColorStop(1, '#eaffee');
        ctx.strokeStyle = gradient;
        ctx.shadowColor = '#7dd35c';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.restore();

      impactPool.forEachActive((p) => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = `hsl(${p.hue}, 85%, 70%)`;
        ctx.shadowColor = `hsl(${p.hue}, 85%, 60%)`;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      const hands = context.hands.hands.filter((h) => h.opacity > 0.5 && h.gesture === 'pointing');
      const aimHand = hands[0];
      if (aimHand) {
        const tip = context.toCanvas(aimHand.landmarks[8].x, aimHand.landmarks[8].y);
        ctx.save();
        ctx.strokeStyle = fireMachine.state === 'DETECTING' ? '#e8c93a' : '#eaffee';
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 12, 0, Math.PI * 2);
        ctx.moveTo(tip.x - 18, tip.y);
        ctx.lineTo(tip.x - 6, tip.y);
        ctx.moveTo(tip.x + 6, tip.y);
        ctx.lineTo(tip.x + 18, tip.y);
        ctx.moveTo(tip.x, tip.y - 18);
        ctx.lineTo(tip.x, tip.y - 6);
        ctx.moveTo(tip.x, tip.y + 6);
        ctx.lineTo(tip.x, tip.y + 18);
        ctx.stroke();
        ctx.restore();
      }

      const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : 0;
      ctx.save();
      ctx.fillStyle = 'rgba(183,201,186,0.85)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `SHOTS ${shots}  HITS ${hits}  ACCURACY ${accuracy}%  REACTION ${lastReactionMs ? Math.round(lastReactionMs) + 'ms' : '—'}`,
        context.canvasWidth / 2,
        context.canvasHeight - 92,
      );
      ctx.restore();
    },

    reset() {
      pulses = [];
      target = null;
      flashAlpha = 0;
      wasFiring = false;
      shots = 0;
      hits = 0;
      lastReactionMs = 0;
      impactPool.clear();
      fireMachine.reset();
    },

    deactivate() {
      this.enabled = false;
      this.reset();
    },
  };

  return module;
}
