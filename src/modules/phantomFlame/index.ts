import { getWristVelocity } from '../../hooks/useMotionHistory';
import { audioEngine } from '../../services/audioEngine';
import { HAND_CONNECTIONS } from '../../utils/drawing';
import { ParticlePool } from '../shared/particles';
import { emitModuleEvent } from '../../store/moduleEvents';
import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, TrackingContext } from '../../types/modules';
import type { Point2D } from '../../types/tracking';

const FINGER_TIPS = [4, 8, 12, 16, 20];
const EMBER_CAPACITY = 260;
const BASE_EMBER_RATE = 22; // embers/sec per fingertip at rest
const MOTION_EMBER_RATE = 140; // extra embers/sec per unit of hand speed
const FLICKER_SPEED = 0.01;

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function flameHue(t: number): number {
  // 0 = red, 30 = orange, 50 = yellow — biased toward orange, occasionally flares yellow-hot.
  return 6 + pseudoRandom(t) * 46;
}

/**
 * Renders a continuous procedural fire effect wrapped around both hands' skeletons —
 * layered flickering strokes along the bones plus rising embers spawned from the
 * fingertips, biased by how fast the hand is moving (a slow hand smolders, a swung
 * hand trails fire). Purely visual — no gesture gate, active on every tracked hand
 * while the module is on.
 */
export function createPhantomFlameModule(): InteractionModule {
  const embers = new ParticlePool(EMBER_CAPACITY);
  let announced = false;

  const module: InteractionModule = {
    id: 'phantomFlame',
    label: MODULE_LABELS.phantomFlame,
    enabled: false,

    activate() {
      this.enabled = true;
      announced = false;
    },

    update(context: TrackingContext) {
      // Purely cosmetic effect — unlike gesture modules, there's no false-trigger risk in
      // showing flame on a low-confidence hand, so we don't gate on a high opacity threshold.
      // Instead intensity scales with tracking confidence (see rate/alpha below), so a faint
      // detection gets a faint flame instead of nothing at all.
      const hands = context.hands.hands.filter((h) => h.opacity > 0.12);

      embers.update(context.dt, (p, dt) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy = p.vy * 0.98 - 26 * dt; // buoyant drift upward
        p.x += Math.sin(context.time / 180 + p.y * 0.05) * 6 * dt;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
        p.size = Math.max(0.4, p.size * (1 - dt * 0.5));
      });

      if (hands.length === 0) return;

      if (!announced) {
        emitModuleEvent('CHAMA ESPECTRAL INVOCADA');
        if (context.soundEnabled) audioEngine.play('alert');
        announced = true;
      }

      const spawnBudget = Math.max(0.15, context.quality.particleMultiplier);
      for (const hand of hands) {
        const vel = getWristVelocity(context.handHistory.get(hand.handedness), context.time, 120);
        const rate = (BASE_EMBER_RATE + MOTION_EMBER_RATE * Math.min(2.5, vel.speed)) * spawnBudget * hand.opacity;
        const expected = rate * context.dt;
        const count = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);

        for (let i = 0; i < count; i++) {
          const tipIdx = FINGER_TIPS[Math.floor(Math.random() * FINGER_TIPS.length)];
          const lm = hand.landmarks[tipIdx];
          const pos = context.toCanvas(lm.x, lm.y);
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
          const speed = 30 + Math.random() * 70 + vel.speed * 40;
          embers.spawn({
            x: pos.x + (Math.random() - 0.5) * 6,
            y: pos.y + (Math.random() - 0.5) * 6,
            vx: Math.cos(angle) * speed * 0.4 - vel.x * context.mapping.drawWidth * 0.3,
            vy: Math.sin(angle) * speed - vel.y * context.mapping.drawHeight * 0.3,
            maxLife: 0.35 + Math.random() * 0.45,
            size: 1.6 + Math.random() * 2.4,
            hue: flameHue(context.time * 0.001 + tipIdx * 7.7 + Math.random() * 100),
          });
        }
      }
    },

    render(ctx: CanvasRenderingContext2D, context: TrackingContext) {
      const hands = context.hands.hands.filter((h) => h.opacity > 0.12);

      for (const hand of hands) {
        const points: Point2D[] = hand.landmarks.map((lm) => context.toCanvas(lm.x, lm.y));
        const seedBase = hand.handedness === 'Left' ? 0 : 1000;
        // Scales every layer's intensity by tracking confidence, so a shaky/low-confidence
        // detection fades the flame down instead of it vanishing outright at some cutoff.
        const conf = hand.opacity;

        ctx.save();
        // Outer glow body — soft, wide, low alpha.
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (const [a, b] of HAND_CONNECTIONS) {
          const pa = points[a];
          const pb = points[b];
          const flicker = pseudoRandom(context.time * FLICKER_SPEED + a * 3.1 + b * 1.7);
          ctx.strokeStyle = `hsla(${12 + flicker * 20}, 95%, 50%, ${0.4 * conf})`;
          ctx.lineWidth = 12 + flicker * 6;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }

        // Core licks — brighter, thinner, jittered perpendicular to the bone.
        for (const [a, b] of HAND_CONNECTIONS) {
          const pa = points[a];
          const pb = points[b];
          const dx = pb.x - pa.x;
          const dy = pb.y - pa.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          const perp = { x: -dy / len, y: dx / len };
          const seed = seedBase + a * 12.9898 + b * 78.233 + context.time * FLICKER_SPEED;
          const jitter = (pseudoRandom(seed) - 0.5) * len * 0.35;
          const midX = (pa.x + pb.x) / 2 + perp.x * jitter;
          const midY = (pa.y + pb.y) / 2 + perp.y * jitter;
          const hue = 18 + pseudoRandom(seed + 5) * 28;

          ctx.strokeStyle = `hsla(${hue}, 100%, 65%, ${0.9 * conf})`;
          ctx.shadowColor = `hsla(${hue}, 100%, 55%, 0.9)`;
          ctx.shadowBlur = 12;
          ctx.lineWidth = 3.4;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.quadraticCurveTo(midX, midY, pb.x, pb.y);
          ctx.stroke();
        }

        // Hotter core glow at each fingertip.
        ctx.shadowBlur = 18;
        for (const tipIdx of FINGER_TIPS) {
          const p = points[tipIdx];
          const pulse = 0.75 + pseudoRandom(context.time * 0.006 + tipIdx) * 0.35;
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16 * pulse);
          gradient.addColorStop(0, `rgba(255,244,214,${0.95 * conf})`);
          gradient.addColorStop(0.4, `rgba(255,150,40,${0.65 * conf})`);
          gradient.addColorStop(1, 'rgba(255,60,20,0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 16 * pulse, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      embers.forEachActive((p) => {
        ctx.globalAlpha = p.alpha * 0.9;
        ctx.fillStyle = `hsl(${p.hue}, 100%, ${55 + p.alpha * 20}%)`;
        ctx.shadowColor = `hsl(${p.hue}, 100%, 50%)`;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    reset() {
      embers.clear();
      announced = false;
    },

    deactivate() {
      this.enabled = false;
      this.reset();
    },
  };

  return module;
}
