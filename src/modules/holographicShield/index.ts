import { GestureStateMachine } from '../../hooks/useGestureStability';
import { audioEngine } from '../../services/audioEngine';
import { dist2, handOpenness, isPalmFacingCamera, palmCenter } from '../shared/handGeometry';
import { subscribeImpacts } from '../shared/impactBus';
import { emitModuleEvent } from '../../store/moduleEvents';
import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, TrackingContext } from '../../types/modules';
import type { Handedness, Point2D, TrackedHand } from '../../types/tracking';

const DEPLOY_HOLD_MS = 400;
const RECOIL_HOLD_MS = 300;
const REGEN_PER_SECOND = 0.12;
const RIPPLE_DURATION = 0.6;

interface Ripple {
  x: number;
  y: number;
  age: number;
  strength: number;
}

function handRotation(hand: TrackedHand, toCanvas: (nx: number, ny: number) => Point2D): number {
  const wrist = toCanvas(hand.landmarks[0].x, hand.landmarks[0].y);
  const middleMcp = toCanvas(hand.landmarks[9].x, hand.landmarks[9].y);
  return Math.atan2(middleMcp.y - wrist.y, middleMcp.x - wrist.x) + Math.PI / 2;
}

/**
 * A single open palm facing the camera raises a circular holographic shield anchored
 * to that hand — it tracks the hand's position, apparent size (proxy for distance) and
 * rotation every frame. Closing that hand into a fist recoils it. Impacts broadcast on
 * the shared impact bus (e.g. from Energy Pulse) dent the integrity ring and ripple.
 */
export function createHolographicShieldModule(): InteractionModule {
  const deployMachines = new Map<Handedness, GestureStateMachine>([
    ['Left', new GestureStateMachine(DEPLOY_HOLD_MS, 150, 250)],
    ['Right', new GestureStateMachine(DEPLOY_HOLD_MS, 150, 250)],
  ]);
  const recoilMachine = new GestureStateMachine(RECOIL_HOLD_MS, 100, 250);

  let deployed = false;
  let anchorHand: Handedness | null = null;
  let center: Point2D = { x: 0, y: 0 };
  let radius = 0;
  let rotation = 0;
  let squashY = 1;
  let integrity = 1;
  let ripples: Ripple[] = [];
  let unsubscribeImpacts: (() => void) | null = null;

  function recoil(): void {
    deployed = false;
    anchorHand = null;
    recoilMachine.reset();
    ripples = [];
  }

  const module: InteractionModule = {
    id: 'holographicShield',
    label: MODULE_LABELS.holographicShield,
    enabled: false,

    activate() {
      this.enabled = true;
      unsubscribeImpacts = subscribeImpacts((impact) => {
        if (!deployed) return;
        if (dist2(impact, center) <= radius * 1.3) {
          integrity = Math.max(0, integrity - impact.strength);
          ripples.push({ x: impact.x, y: impact.y, age: 0, strength: impact.strength });
        }
      });
    },

    update(context: TrackingContext) {
      const hands = context.hands.hands.filter((h) => h.opacity > 0.5);

      ripples = ripples.filter((r) => r.age < RIPPLE_DURATION);
      for (const r of ripples) r.age += context.dt;

      if (!deployed) {
        for (const hand of hands) {
          const machine = deployMachines.get(hand.handedness);
          if (!machine) continue;
          const met = handOpenness(hand) > 0.58 && isPalmFacingCamera(hand);
          if (machine.update(met, context.time) === 'ACTIVE') {
            deployed = true;
            anchorHand = hand.handedness;
            integrity = 1;
            emitModuleEvent('DEFENSIVE FIELD DEPLOYED');
            if (context.soundEnabled) audioEngine.play('lock');
            break;
          }
        }
        for (const [handedness, machine] of deployMachines) {
          if (!hands.some((h) => h.handedness === handedness)) machine.reset();
        }
        return;
      }

      const anchor = hands.find((h) => h.handedness === anchorHand);
      if (!anchor) {
        recoil();
        return;
      }

      const fistMet = handOpenness(anchor) < 0.42;
      if (recoilMachine.update(fistMet, context.time) === 'ACTIVE') {
        if (context.soundEnabled) audioEngine.play('target_lost');
        recoil();
        return;
      }

      const wrist = context.toCanvas(anchor.landmarks[0].x, anchor.landmarks[0].y);
      const middleMcp = context.toCanvas(anchor.landmarks[9].x, anchor.landmarks[9].y);
      const targetCenter = context.toCanvas(palmCenter(anchor).x, palmCenter(anchor).y);
      const palmSizePx = dist2(wrist, middleMcp);

      center = { x: center.x + (targetCenter.x - center.x) * 0.3, y: center.y + (targetCenter.y - center.y) * 0.3 };
      const targetRadius = Math.max(30, Math.min(context.canvasWidth * 0.28, palmSizePx * 1.9));
      radius += (targetRadius - radius) * 0.2;
      rotation = handRotation(anchor, context.toCanvas);

      const normalZ = Math.abs(palmCenter(anchor).z) || 0.15;
      const targetSquash = Math.max(0.35, Math.min(1, normalZ * 4));
      squashY += (targetSquash - squashY) * 0.15;

      integrity = Math.min(1, integrity + REGEN_PER_SECOND * context.dt);
    },

    render(ctx: CanvasRenderingContext2D, context: TrackingContext) {
      if (!deployed) {
        if (!anchorHand) {
          for (const hand of context.hands.hands) {
            if (hand.opacity < 0.5) continue;
            const machine = deployMachines.get(hand.handedness);
            if (!machine || machine.state !== 'DETECTING') continue;
            const pos = context.toCanvas(palmCenter(hand).x, palmCenter(hand).y);
            drawRing(ctx, pos, 26, 1, `rgba(58,198,232,${0.25 + machine.progress * 0.5})`, 0);
          }
        }
        return;
      }

      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(rotation);
      ctx.scale(1, squashY);

      const integrityColor = integrity > 0.6 ? '#7dd35c' : integrity > 0.3 ? '#e8c93a' : '#d1273a';

      ctx.globalAlpha = 0.85;
      drawRing(ctx, { x: 0, y: 0 }, radius, 2, integrityColor, 12);
      drawRing(ctx, { x: 0, y: 0 }, radius * 0.78, 1, 'rgba(125,211,92,0.4)', 0);

      if (context.quality.effectsEnabled) {
        ctx.strokeStyle = 'rgba(58,198,232,0.35)';
        ctx.lineWidth = 1;
        const segments = 16;
        for (let i = 0; i < segments; i++) {
          const a0 = (i / segments) * Math.PI * 2 + context.time / 2600;
          const a1 = a0 + (Math.PI * 2) / segments - 0.06;
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.92, a0, a1);
          ctx.stroke();
        }

        ctx.fillStyle = 'rgba(234,255,238,0.6)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        const symbolCount = Math.round(6 * context.quality.particleMultiplier);
        for (let i = 0; i < symbolCount; i++) {
          const a = (i / symbolCount) * Math.PI * 2 - context.time / 1800;
          const x = Math.cos(a) * radius * 0.6;
          const y = Math.sin(a) * radius * 0.6;
          ctx.fillText(i % 2 === 0 ? '‡' : '◇', x, y);
        }
      }

      // integrity fill arc
      ctx.strokeStyle = integrityColor;
      ctx.shadowColor = integrityColor;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 8, -Math.PI / 2, -Math.PI / 2 + integrity * Math.PI * 2);
      ctx.stroke();

      ctx.restore();

      for (const r of ripples) {
        const t = r.age / RIPPLE_DURATION;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t) * 0.8;
        ctx.strokeStyle = '#eaffee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 6 + t * 40 * r.strength, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },

    reset() {
      recoil();
      integrity = 1;
      radius = 0;
    },

    deactivate() {
      this.enabled = false;
      unsubscribeImpacts?.();
      unsubscribeImpacts = null;
      this.reset();
    },
  };

  return module;
}

function drawRing(ctx: CanvasRenderingContext2D, center: Point2D, radius: number, lineWidth: number, color: string, blur: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (blur > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
