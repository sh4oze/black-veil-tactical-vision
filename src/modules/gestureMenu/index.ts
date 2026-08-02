import { GestureStateMachine } from '../../hooks/useGestureStability';
import { audioEngine } from '../../services/audioEngine';
import { handOpenness, isPinching, palmCenter } from '../shared/handGeometry';
import { interactionStore } from '../../store/interactionStore';
import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, ModuleId, TrackingContext } from '../../types/modules';
import type { Handedness, Point2D } from '../../types/tracking';

type MenuAction = ModuleId | 'close';

interface MenuItem {
  action: MenuAction;
  label: string;
}

const MENU_ITEMS: MenuItem[] = [
  { action: 'energyOrb', label: 'ENERGY' },
  { action: 'holographicShield', label: 'SHIELD' },
  { action: 'virtualObjects', label: 'OBJECTS' },
  { action: 'telekinesis', label: 'TELEKINESIS' },
  { action: 'particleField', label: 'PARTICLES' },
  { action: 'airPortal', label: 'PORTAL' },
  { action: 'gestureHacking', label: 'HACK' },
  { action: 'motionEcho', label: 'ECHO' },
  { action: 'close', label: 'CLOSE' },
];

const OPEN_HOLD_MS = 900;
const CLICK_HOLD_MS = 130;
const ROW_HEIGHT = 30;
const ROW_WIDTH = 154;
const OPEN_PALM_THRESHOLD = 0.62;
const CLOSE_FIST_THRESHOLD = 0.55;

/**
 * Holographic radial/list menu opened by holding one palm open for ~1s. The other
 * hand's index fingertip becomes the cursor; a thumb-index pinch on that hand clicks
 * whichever row it's hovering. Closing the anchor hand into a fist dismisses the menu.
 */
export function createGestureMenuModule(): InteractionModule {
  const openMachines = new Map<Handedness, GestureStateMachine>([
    ['Left', new GestureStateMachine(OPEN_HOLD_MS, 150, 350)],
    ['Right', new GestureStateMachine(OPEN_HOLD_MS, 150, 350)],
  ]);
  const closeMachine = new GestureStateMachine(500, 100, 300);
  const clickMachine = new GestureStateMachine(CLICK_HOLD_MS, 80, 260);

  let menuOpen = false;
  let anchorHand: Handedness | null = null;
  let anchorCanvasPos: Point2D = { x: 0, y: 0 };
  let hoveredIndex = -1;
  let wasClickActive = false;

  function closeMenu(playSound: boolean): void {
    if (playSound && interactionStore.getState().options.soundEffects) audioEngine.play('target_lost');
    menuOpen = false;
    anchorHand = null;
    hoveredIndex = -1;
    closeMachine.reset();
    clickMachine.reset();
  }

  const module: InteractionModule = {
    id: 'gestureMenu',
    label: MODULE_LABELS.gestureMenu,
    enabled: false,

    activate() {
      this.enabled = true;
    },

    update(context: TrackingContext) {
      const hands = context.hands.hands.filter((h) => h.opacity > 0.5);

      if (!menuOpen) {
        for (const hand of hands) {
          const machine = openMachines.get(hand.handedness);
          if (!machine) continue;
          const met = handOpenness(hand) > OPEN_PALM_THRESHOLD;
          const state = machine.update(met, context.time);
          if (state === 'ACTIVE') {
            menuOpen = true;
            anchorHand = hand.handedness;
            const canvasPos = context.toCanvas(...toXY(palmCenter(hand)));
            anchorCanvasPos = canvasPos;
            if (context.soundEnabled) audioEngine.play('gesture_confirmed');
            break;
          }
        }
        for (const [handedness, machine] of openMachines) {
          if (!hands.some((h) => h.handedness === handedness)) machine.reset();
        }
        hoveredIndex = -1;
        return;
      }

      const anchor = hands.find((h) => h.handedness === anchorHand);
      if (!anchor) {
        closeMenu(true);
        return;
      }

      const target = context.toCanvas(...toXY(palmCenter(anchor)));
      anchorCanvasPos = {
        x: anchorCanvasPos.x + (target.x - anchorCanvasPos.x) * 0.25,
        y: anchorCanvasPos.y + (target.y - anchorCanvasPos.y) * 0.25,
      };

      const fistMet = handOpenness(anchor) < CLOSE_FIST_THRESHOLD;
      if (closeMachine.update(fistMet, context.time) === 'ACTIVE') {
        closeMenu(true);
        return;
      }

      const cursorHand = hands.find((h) => h.handedness !== anchorHand);
      const items = MENU_ITEMS;
      const originX = anchorCanvasPos.x + 40;
      const originY = anchorCanvasPos.y - (items.length * ROW_HEIGHT) / 2;

      hoveredIndex = -1;
      if (cursorHand) {
        const tip = cursorHand.landmarks[8];
        const cursorPos = context.toCanvas(tip.x, tip.y);
        items.forEach((_item, i) => {
          const rx = originX;
          const ry = originY + i * ROW_HEIGHT;
          if (cursorPos.x >= rx && cursorPos.x <= rx + ROW_WIDTH && cursorPos.y >= ry && cursorPos.y <= ry + ROW_HEIGHT - 4) {
            hoveredIndex = i;
          }
        });

        const pinching = isPinching(cursorHand, context.sensitivity);
        const isActiveNow = clickMachine.update(pinching, context.time) === 'ACTIVE';
        if (isActiveNow && !wasClickActive && hoveredIndex >= 0) {
          const item = items[hoveredIndex];
          if (item.action === 'close') {
            closeMenu(true);
          } else {
            interactionStore.setModuleEnabled(item.action, true);
            if (context.soundEnabled) audioEngine.play('lock');
            closeMenu(false);
          }
        }
        wasClickActive = isActiveNow;
      } else {
        clickMachine.reset();
        wasClickActive = false;
      }
    },

    render(ctx: CanvasRenderingContext2D, context: TrackingContext) {
      if (!menuOpen) {
        for (const hand of context.hands.hands) {
          if (hand.opacity < 0.5) continue;
          const machine = openMachines.get(hand.handedness);
          if (!machine || machine.state !== 'DETECTING') continue;
          const pos = context.toCanvas(...toXY(palmCenter(hand)));
          drawProgressRing(ctx, pos, 34, machine.progress, '#3ac6e8');
        }
        return;
      }

      const items = MENU_ITEMS;
      const originX = anchorCanvasPos.x + 40;
      const originY = anchorCanvasPos.y - (items.length * ROW_HEIGHT) / 2;
      const panelH = items.length * ROW_HEIGHT + 12;

      ctx.save();
      ctx.fillStyle = 'rgba(6, 14, 12, 0.85)';
      ctx.strokeStyle = 'rgba(125, 211, 92, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(125, 211, 92, 0.5)';
      ctx.shadowBlur = 14;
      roundRect(ctx, originX - 8, originY - 10, ROW_WIDTH + 16, panelH, 6);
      ctx.fill();
      ctx.stroke();

      items.forEach((item, i) => {
        const rx = originX;
        const ry = originY + i * ROW_HEIGHT;
        const hovered = i === hoveredIndex;
        ctx.shadowBlur = hovered ? 12 : 0;
        ctx.fillStyle = hovered ? 'rgba(125, 211, 92, 0.28)' : 'rgba(255,255,255,0.03)';
        ctx.strokeStyle = hovered ? '#7dd35c' : 'rgba(125, 211, 92, 0.3)';
        roundRect(ctx, rx, ry, ROW_WIDTH, ROW_HEIGHT - 4, 3);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = hovered ? '#eaffee' : '#b7c9ba';
        ctx.font = '600 11px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, rx + 10, ry + (ROW_HEIGHT - 4) / 2);

        if (hovered && clickMachine.state === 'DETECTING') {
          drawProgressRing(ctx, { x: rx + ROW_WIDTH - 14, y: ry + (ROW_HEIGHT - 4) / 2 }, 8, clickMachine.progress, '#7dd35c');
        }
      });
      ctx.restore();

      const cursorHand = context.hands.hands.find((h) => h.handedness !== anchorHand && h.opacity > 0.5);
      if (cursorHand) {
        const tip = cursorHand.landmarks[8];
        const pos = context.toCanvas(tip.x, tip.y);
        ctx.save();
        ctx.fillStyle = '#eaffee';
        ctx.shadowColor = '#7dd35c';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },

    reset() {
      menuOpen = false;
      anchorHand = null;
      hoveredIndex = -1;
      wasClickActive = false;
      openMachines.forEach((m) => m.reset());
      closeMachine.reset();
      clickMachine.reset();
    },

    deactivate() {
      this.enabled = false;
      this.reset();
    },
  };

  return module;
}

function toXY(p: { x: number; y: number }): [number, number] {
  return [p.x, p.y];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
