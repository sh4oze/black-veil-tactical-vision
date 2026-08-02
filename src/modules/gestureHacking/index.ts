import { GestureStateMachine } from '../../hooks/useGestureStability';
import { audioEngine } from '../../services/audioEngine';
import { dist2, handOpenness, isPinching, palmCenter, pinchMidpoint } from '../shared/handGeometry';
import { emitModuleEvent } from '../../store/moduleEvents';
import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, TrackingContext } from '../../types/modules';
import type { Point2D } from '../../types/tracking';

type Phase = 'playing' | 'success' | 'fail' | 'complete';
type ChallengeType = 'sequence' | 'scanner';

interface SeqNode {
  angle: number;
  number: number;
  touched: boolean;
}

const MAX_LEVEL = 5;
const SUCCESS_DWELL_MS = 1300;
const FAIL_DWELL_MS = 2200;
const COMPLETE_DWELL_MS = 3200;
const SCANNER_HOLD_SECONDS = 1.9;
const SCANNER_DECAY_SECONDS = 1.1;

function shuffled(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * A gesture-driven hacking minigame that alternates between two challenge types across
 * progressive levels: touch numbered holographic nodes in ascending order (pinch as
 * cursor/click), or hold an open palm inside a scanner zone for a sustained duration.
 * A timer bounds each level; running out or touching a node out of order fails it.
 */
export function createGestureHackingModule(): InteractionModule {
  const clickMachine = new GestureStateMachine(70, 60, 180);
  const restartMachine = new GestureStateMachine(500, 150, 300);

  let phase: Phase = 'playing';
  let challengeType: ChallengeType = 'sequence';
  let level = 1;
  let phaseStartTime = 0;
  let timeLimitMs = 10000;
  let nodes: SeqNode[] = [];
  let nextExpected = 1;
  let scannerProgress = 0;
  let needsSetup = true;
  let wasClickActive = false;

  function setupLevel(context: TrackingContext): void {
    challengeType = level % 2 === 1 ? 'sequence' : 'scanner';
    phaseStartTime = context.time;
    phase = 'playing';

    if (challengeType === 'sequence') {
      const count = Math.min(7, 3 + Math.floor(level / 2));
      timeLimitMs = 8500 + count * 1300;
      const order = shuffled(count);
      nodes = order.map((number, i) => ({ angle: (i / count) * Math.PI * 2 - Math.PI / 2, number, touched: false }));
      nextExpected = 1;
    } else {
      timeLimitMs = 7000 + level * 400;
      scannerProgress = 0;
    }
  }

  function fail(context: TrackingContext): void {
    phase = 'fail';
    phaseStartTime = context.time;
    emitModuleEvent('ACCESS DENIED');
    if (context.soundEnabled) audioEngine.play('alert');
  }

  function succeedLevel(context: TrackingContext): void {
    phaseStartTime = context.time;
    if (level >= MAX_LEVEL) {
      phase = 'complete';
      emitModuleEvent('ACCESS GRANTED — SISTEMA COMPROMETIDO');
    } else {
      phase = 'success';
      emitModuleEvent('ACCESS GRANTED');
    }
    if (context.soundEnabled) audioEngine.play('lock');
  }

  function restart(context: TrackingContext): void {
    level = 1;
    setupLevel(context);
  }

  const module: InteractionModule = {
    id: 'gestureHacking',
    label: MODULE_LABELS.gestureHacking,
    enabled: false,

    activate() {
      this.enabled = true;
      needsSetup = true;
    },

    update(context: TrackingContext) {
      if (needsSetup) {
        needsSetup = false;
        setupLevel(context);
      }

      const hands = context.hands.hands.filter((h) => h.opacity > 0.5);
      const elapsed = context.time - phaseStartTime;

      if (phase === 'fail' || phase === 'complete') {
        const anyOpen = hands.some((h) => handOpenness(h) > 0.62);
        if (restartMachine.update(anyOpen, context.time) === 'ACTIVE') {
          restart(context);
          return;
        }
        const dwell = phase === 'fail' ? FAIL_DWELL_MS : COMPLETE_DWELL_MS;
        if (elapsed >= dwell) restart(context);
        return;
      }
      restartMachine.reset();

      if (phase === 'success') {
        if (elapsed >= SUCCESS_DWELL_MS) {
          level += 1;
          setupLevel(context);
        }
        return;
      }

      if (elapsed >= timeLimitMs) {
        fail(context);
        return;
      }

      if (challengeType === 'sequence') {
        const pinchingHand = hands.find((h) => isPinching(h, context.sensitivity));
        const isActiveNow = clickMachine.update(!!pinchingHand, context.time) === 'ACTIVE';
        if (isActiveNow && !wasClickActive && pinchingHand) {
          const cursor = context.toCanvas(pinchMidpoint(pinchingHand).x, pinchMidpoint(pinchingHand).y);
          const c = { x: context.canvasWidth / 2, y: context.canvasHeight / 2 };
          const r = Math.min(context.canvasWidth, context.canvasHeight) * 0.24;
          const hitNode = nodes.find((n) => !n.touched && dist2(cursor, { x: c.x + Math.cos(n.angle) * r, y: c.y + Math.sin(n.angle) * r }) < 30);
          if (hitNode) {
            if (hitNode.number === nextExpected) {
              hitNode.touched = true;
              nextExpected += 1;
              if (context.soundEnabled) audioEngine.play('gesture_confirmed');
              if (nodes.every((n) => n.touched)) succeedLevel(context);
            } else {
              fail(context);
            }
          }
        }
        wasClickActive = isActiveNow;
      } else {
        const c = { x: context.canvasWidth / 2, y: context.canvasHeight * 0.62 };
        const zoneRadius = Math.min(context.canvasWidth, context.canvasHeight) * 0.14;
        const inZone = hands.some((h) => handOpenness(h) > 0.58 && dist2(context.toCanvas(palmCenter(h).x, palmCenter(h).y), c) < zoneRadius);
        scannerProgress = inZone
          ? Math.min(1, scannerProgress + context.dt / SCANNER_HOLD_SECONDS)
          : Math.max(0, scannerProgress - context.dt / SCANNER_DECAY_SECONDS);
        if (scannerProgress >= 1) succeedLevel(context);
      }
    },

    render(ctx: CanvasRenderingContext2D, context: TrackingContext) {
      const cx = context.canvasWidth / 2;
      const cy = context.canvasHeight / 2;

      if (phase === 'fail' || phase === 'success' || phase === 'complete') {
        const color = phase === 'fail' ? '#d1273a' : '#7dd35c';
        const text = phase === 'fail' ? 'ACCESS DENIED' : phase === 'complete' ? 'ACCESS GRANTED' : 'ACCESS GRANTED';
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.font = '700 30px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.5 + Math.abs(Math.sin(context.time / 200)) * 0.5;
        ctx.fillText(text, cx, cy);
        if (phase === 'complete') {
          ctx.font = '11px ui-monospace, monospace';
          ctx.fillText('SISTEMA COMPROMETIDO — REINICIANDO PROTOCOLO', cx, cy + 30);
        } else {
          ctx.font = '11px ui-monospace, monospace';
          ctx.fillText(phase === 'fail' ? `NÍVEL ${level} FALHOU` : `NÍVEL ${level} CONCLUÍDO`, cx, cy + 30);
        }
        ctx.restore();
        return;
      }

      const elapsed = context.time - phaseStartTime;
      const timeLeft = Math.max(0, 1 - elapsed / timeLimitMs);
      const timerColor = timeLeft > 0.4 ? '#7dd35c' : timeLeft > 0.15 ? '#e8c93a' : '#d1273a';

      ctx.save();
      ctx.fillStyle = 'rgba(183,201,186,0.85)';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`GESTURE HACKING — NÍVEL ${level} — ${challengeType === 'sequence' ? 'SEQUENCE LOCK' : 'PALM SCANNER'}`, cx, cy - context.canvasHeight * 0.28);

      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 4;
      const barW = 220;
      const barY = cy - context.canvasHeight * 0.28 + 14;
      ctx.beginPath();
      ctx.moveTo(cx - barW / 2, barY);
      ctx.lineTo(cx + barW / 2, barY);
      ctx.stroke();
      ctx.strokeStyle = timerColor;
      ctx.shadowColor = timerColor;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(cx - barW / 2, barY);
      ctx.lineTo(cx - barW / 2 + barW * timeLeft, barY);
      ctx.stroke();
      ctx.restore();

      if (challengeType === 'sequence') {
        const r = Math.min(context.canvasWidth, context.canvasHeight) * 0.24;
        ctx.save();
        ctx.strokeStyle = 'rgba(58,198,232,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        for (const n of nodes) {
          const x = cx + Math.cos(n.angle) * r;
          const y = cy + Math.sin(n.angle) * r;
          ctx.beginPath();
          ctx.arc(x, y, 18, 0, Math.PI * 2);
          ctx.fillStyle = n.touched ? 'rgba(125,211,92,0.35)' : 'rgba(255,255,255,0.05)';
          ctx.strokeStyle = n.touched ? '#7dd35c' : '#3ac6e8';
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = n.touched ? 4 : 10;
          ctx.lineWidth = 1.6;
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = n.touched ? 'rgba(125,211,92,0.6)' : '#eaffee';
          ctx.font = '600 12px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(n.number), x, y);
        }
        ctx.restore();

        const pinchingHand = context.hands.hands.find((h) => h.opacity > 0.5 && isPinching(h, context.sensitivity));
        if (pinchingHand) {
          const cursor = context.toCanvas(pinchMidpoint(pinchingHand).x, pinchMidpoint(pinchingHand).y);
          drawCursor(ctx, cursor);
        }
      } else {
        const c = { x: cx, y: context.canvasHeight * 0.62 };
        const zoneRadius = Math.min(context.canvasWidth, context.canvasHeight) * 0.14;
        ctx.save();
        ctx.strokeStyle = 'rgba(58,198,232,0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(c.x, c.y, zoneRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(58,198,232,0.7)';
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('POSICIONE A PALMA NO SCANNER', c.x, c.y - zoneRadius - 14);

        ctx.strokeStyle = '#7dd35c';
        ctx.shadowColor = '#7dd35c';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(c.x, c.y, zoneRadius - 10, -Math.PI / 2, -Math.PI / 2 + scannerProgress * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },

    reset() {
      phase = 'playing';
      level = 1;
      nodes = [];
      scannerProgress = 0;
      needsSetup = true;
      wasClickActive = false;
      clickMachine.reset();
      restartMachine.reset();
    },

    deactivate() {
      this.enabled = false;
      this.reset();
    },
  };

  return module;
}

function drawCursor(ctx: CanvasRenderingContext2D, pos: Point2D): void {
  ctx.save();
  ctx.fillStyle = '#eaffee';
  ctx.shadowColor = '#7dd35c';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
