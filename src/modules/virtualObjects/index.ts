import { audioEngine } from '../../services/audioEngine';
import { dist2, isPinching, pinchMidpoint } from '../shared/handGeometry';
import { emitModuleEvent } from '../../store/moduleEvents';
import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, TrackingContext } from '../../types/modules';
import type { Handedness } from '../../types/tracking';

type ObjectType = 'cube' | 'sphere' | 'file' | 'dataCore' | 'drone' | 'disk';

interface PosSample {
  t: number;
  x: number;
  y: number;
}

interface VObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  rotation: number;
  angularVelocity: number;
  baseRadius: number;
  grabbedBy: Handedness | null;
  history: PosSample[];
  snapped: boolean;
  selectPulse: number;
  snapFlash: number;
  floatPhase: number;
}

interface SnapZone {
  x: number;
  y: number;
  radius: number;
  label: string;
}

const OBJECT_TYPES: ObjectType[] = ['cube', 'sphere', 'file', 'dataCore', 'drone', 'disk'];
const GRAB_RADIUS = 60;
const HOVER_RADIUS = GRAB_RADIUS * 1.3;
const FRICTION_PER_SEC = 2.6;
const BOUNCE_DAMPING = 0.45;
const SNAP_SPEED_THRESHOLD = 40;

/** Distinct signature color per holographic primitive — lets you tell types apart at a glance. */
const TYPE_COLORS: Record<ObjectType, string> = {
  cube: '#3ac6e8',
  sphere: '#7dd35c',
  file: '#d1273a',
  dataCore: '#9d4edd',
  drone: '#e8c93a',
  disk: '#8fd9ff',
};

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function createObjects(canvasWidth: number, canvasHeight: number): VObject[] {
  return OBJECT_TYPES.map((type, i) => {
    const cols = 3;
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: `${type}-${i}`,
      type,
      x: canvasWidth * (0.25 + col * 0.25),
      y: canvasHeight * (0.3 + row * 0.28),
      vx: 0,
      vy: 0,
      scale: 1,
      rotation: 0,
      angularVelocity: 0.15 + Math.random() * 0.2,
      baseRadius: 34,
      grabbedBy: null,
      history: [],
      snapped: false,
      selectPulse: 0,
      snapFlash: 0,
      floatPhase: Math.random() * Math.PI * 2,
    };
  });
}

function getSnapZones(canvasWidth: number, canvasHeight: number): SnapZone[] {
  return [
    { x: canvasWidth * 0.08, y: canvasHeight * 0.85, radius: 55, label: 'DOCK A' },
    { x: canvasWidth * 0.92, y: canvasHeight * 0.85, radius: 55, label: 'DOCK B' },
  ];
}

interface TwoHandGrab {
  objectId: string;
  initialDist: number;
  initialScale: number;
}

/**
 * A small set of holographic primitives (cube, sphere, classified file, data core,
 * drone, disk) that can be pinch-selected, dragged, thrown (release velocity is
 * measured from the object's recent drag trajectory, not the raw hand — steadier),
 * scaled/rotated with two hands, and docked into snap zones. Each type has its own
 * signature color; idle objects drift and bob gently so the scene never looks static.
 */
export function createVirtualObjectsModule(): InteractionModule {
  let objects: VObject[] = [];
  let zones: SnapZone[] = [];
  const handGrabs = new Map<Handedness, string>();
  let twoHand: TwoHandGrab | null = null;
  let hoverTargetId: string | null = null;
  let initialized = false;

  function ensureInitialized(context: TrackingContext): void {
    if (initialized) return;
    objects = createObjects(context.canvasWidth, context.canvasHeight);
    zones = getSnapZones(context.canvasWidth, context.canvasHeight);
    initialized = true;
  }

  function release(handedness: Handedness, context: TrackingContext): void {
    const objectId = handGrabs.get(handedness);
    handGrabs.delete(handedness);
    if (!objectId) return;
    const obj = objects.find((o) => o.id === objectId);
    if (!obj) return;

    if (twoHand?.objectId === objectId) {
      twoHand = null;
      obj.grabbedBy = handGrabs.size ? [...handGrabs.entries()].find(([, id]) => id === objectId)?.[0] ?? null : null;
      if (obj.grabbedBy) return;
    }

    obj.grabbedBy = null;
    const recent = obj.history.filter((s) => context.time - s.t <= 140);
    if (recent.length >= 2) {
      const first = recent[0];
      const last = recent[recent.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt > 0) {
        obj.vx = (last.x - first.x) / dt;
        obj.vy = (last.y - first.y) / dt;
      }
    }
    obj.history = [];
    obj.snapped = false;
  }

  const module: InteractionModule = {
    id: 'virtualObjects',
    label: MODULE_LABELS.virtualObjects,
    enabled: false,

    activate() {
      this.enabled = true;
    },

    update(context: TrackingContext) {
      ensureInitialized(context);
      zones = getSnapZones(context.canvasWidth, context.canvasHeight);
      const hands = context.hands.hands.filter((h) => h.opacity > 0.5);
      const pinchingHands = hands.filter((h) => isPinching(h, context.sensitivity));
      const pinchingSet = new Set(pinchingHands.map((h) => h.handedness));

      for (const handedness of [...handGrabs.keys()]) {
        if (!pinchingSet.has(handedness)) release(handedness, context);
      }

      for (const hand of pinchingHands) {
        if (handGrabs.has(hand.handedness)) continue;
        const pinchPos = context.toCanvas(pinchMidpoint(hand).x, pinchMidpoint(hand).y);

        const heldByOther = objects.find(
          (o) => o.grabbedBy && o.grabbedBy !== hand.handedness && dist2(pinchPos, { x: o.x, y: o.y }) <= o.baseRadius * o.scale * 1.4,
        );
        if (heldByOther && !twoHand) {
          twoHand = { objectId: heldByOther.id, initialDist: 1, initialScale: heldByOther.scale };
          const otherHandedness = heldByOther.grabbedBy!;
          const otherHand = hands.find((h) => h.handedness === otherHandedness);
          if (otherHand) {
            const otherPos = context.toCanvas(pinchMidpoint(otherHand).x, pinchMidpoint(otherHand).y);
            twoHand.initialDist = Math.max(20, dist2(pinchPos, otherPos));
          }
          handGrabs.set(hand.handedness, heldByOther.id);
          continue;
        }

        let nearest: VObject | null = null;
        let nearestDist = GRAB_RADIUS;
        for (const obj of objects) {
          if (obj.grabbedBy) continue;
          const d = dist2(pinchPos, { x: obj.x, y: obj.y });
          if (d < nearestDist) {
            nearest = obj;
            nearestDist = d;
          }
        }
        if (nearest) {
          nearest.grabbedBy = hand.handedness;
          nearest.snapped = false;
          nearest.vx = 0;
          nearest.vy = 0;
          nearest.selectPulse = 1;
          handGrabs.set(hand.handedness, nearest.id);
          if (context.soundEnabled) audioEngine.play('hand_detected');
        }
      }

      // Pre-grab hover feedback: highlight whichever ungrabbed object a free hand is
      // hovering near, so the user knows what a pinch would catch before committing.
      hoverTargetId = null;
      let bestHoverDist = HOVER_RADIUS;
      for (const hand of hands) {
        if (handGrabs.has(hand.handedness)) continue;
        const pos = context.toCanvas(pinchMidpoint(hand).x, pinchMidpoint(hand).y);
        for (const obj of objects) {
          if (obj.grabbedBy) continue;
          const d = dist2(pos, { x: obj.x, y: obj.y });
          if (d < bestHoverDist) {
            bestHoverDist = d;
            hoverTargetId = obj.id;
          }
        }
      }

      for (const obj of objects) {
        obj.selectPulse = Math.max(0, obj.selectPulse - context.dt * 1.5);
        obj.snapFlash = Math.max(0, obj.snapFlash - context.dt * 1.2);
        obj.floatPhase += context.dt * 1.6;

        if (obj.grabbedBy) {
          const grabbedHand = hands.find((h) => h.handedness === obj.grabbedBy);
          if (!grabbedHand) continue;
          const pos = context.toCanvas(pinchMidpoint(grabbedHand).x, pinchMidpoint(grabbedHand).y);

          if (twoHand?.objectId === obj.id) {
            const otherEntry = [...handGrabs.entries()].find(([h, id]) => id === obj.id && h !== obj.grabbedBy);
            const otherHand = otherEntry ? hands.find((h) => h.handedness === otherEntry[0]) : undefined;
            if (otherHand) {
              const otherPos = context.toCanvas(pinchMidpoint(otherHand).x, pinchMidpoint(otherHand).y);
              obj.x = (pos.x + otherPos.x) / 2;
              obj.y = (pos.y + otherPos.y) / 2;
              obj.rotation = Math.atan2(otherPos.y - pos.y, otherPos.x - pos.x);
              const d = Math.max(20, dist2(pos, otherPos));
              obj.scale = Math.max(0.4, Math.min(2.6, twoHand.initialScale * (d / twoHand.initialDist)));
            }
          } else {
            obj.x = pos.x;
            obj.y = pos.y;
          }

          obj.history.push({ t: context.time, x: obj.x, y: obj.y });
          if (obj.history.length > 10) obj.history.shift();
          continue;
        }

        if (obj.snapped) continue;

        obj.x += obj.vx * context.dt;
        obj.y += obj.vy * context.dt;
        obj.rotation += obj.angularVelocity * context.dt * (0.3 + Math.min(1, Math.hypot(obj.vx, obj.vy) / 200));

        const decay = Math.max(0, 1 - FRICTION_PER_SEC * context.dt);
        obj.vx *= decay;
        obj.vy *= decay;

        const r = obj.baseRadius * obj.scale;
        if (obj.x < r) {
          obj.x = r;
          obj.vx = Math.abs(obj.vx) * BOUNCE_DAMPING;
        } else if (obj.x > context.canvasWidth - r) {
          obj.x = context.canvasWidth - r;
          obj.vx = -Math.abs(obj.vx) * BOUNCE_DAMPING;
        }
        if (obj.y < r) {
          obj.y = r;
          obj.vy = Math.abs(obj.vy) * BOUNCE_DAMPING;
        } else if (obj.y > context.canvasHeight - r) {
          obj.y = context.canvasHeight - r;
          obj.vy = -Math.abs(obj.vy) * BOUNCE_DAMPING;
        }

        const speed = Math.hypot(obj.vx, obj.vy);
        if (speed < SNAP_SPEED_THRESHOLD) {
          const zone = zones.find((z) => dist2({ x: obj.x, y: obj.y }, z) < z.radius);
          if (zone) {
            obj.x += (zone.x - obj.x) * 0.2;
            obj.y += (zone.y - obj.y) * 0.2;
            obj.vx = 0;
            obj.vy = 0;
            if (dist2({ x: obj.x, y: obj.y }, zone) < 2 && !obj.snapped) {
              obj.snapped = true;
              obj.snapFlash = 1;
              emitModuleEvent(`OBJETO ANCORADO: ${obj.type.toUpperCase()}`);
              if (context.soundEnabled) audioEngine.play('lock');
            }
          }
        }
      }

      // Cheap pairwise separation so free-floating objects don't overlap each other.
      for (let i = 0; i < objects.length; i++) {
        const a = objects[i];
        if (a.grabbedBy || a.snapped) continue;
        for (let j = i + 1; j < objects.length; j++) {
          const b = objects[j];
          if (b.grabbedBy || b.snapped) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.max(0.01, Math.hypot(dx, dy));
          const minDist = (a.baseRadius * a.scale + b.baseRadius * b.scale) * 0.85;
          if (dist < minDist) {
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;
          }
        }
      }
    },

    render(ctx: CanvasRenderingContext2D, context: TrackingContext) {
      if (!initialized) return;

      ctx.save();
      ctx.strokeStyle = 'rgba(58,198,232,0.25)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      for (const zone of zones) {
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(58,198,232,0.6)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(zone.label, zone.x, zone.y + zone.radius + 12);
        ctx.setLineDash([4, 4]);
      }
      ctx.setLineDash([]);
      ctx.restore();

      for (const obj of objects) {
        drawObject(ctx, obj, context, obj.id === hoverTargetId);
      }
    },

    reset() {
      objects = [];
      zones = [];
      handGrabs.clear();
      twoHand = null;
      hoverTargetId = null;
      initialized = false;
    },

    deactivate() {
      this.enabled = false;
      this.reset();
    },
  };

  return module;
}

function drawObject(ctx: CanvasRenderingContext2D, obj: VObject, context: TrackingContext, hovered: boolean): void {
  const baseColor = TYPE_COLORS[obj.type];
  const r = obj.baseRadius * obj.scale * (1 + obj.selectPulse * 0.15);
  const glow = obj.grabbedBy ? '#eaffee' : hovered ? '#ffffff' : baseColor;
  const bob = obj.grabbedBy || obj.snapped ? 0 : Math.sin(obj.floatPhase) * 3;

  // Ground shadow — cheap depth cue, skipped while grabbed (object is "lifted").
  if (!obj.grabbedBy) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(obj.x, obj.y + r * 0.92 + bob * 0.3, r * 0.75, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(obj.x, obj.y + bob);
  ctx.rotate(obj.rotation);
  ctx.strokeStyle = glow;
  ctx.fillStyle = rgba(baseColor, 0.1);
  ctx.shadowColor = glow;
  ctx.shadowBlur = obj.grabbedBy ? 18 : hovered ? 12 : 8;
  ctx.lineWidth = 1.6;

  switch (obj.type) {
    case 'cube': {
      const s = r * 0.75;
      ctx.beginPath();
      ctx.rect(-s, -s, s * 2, s * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s, -s);
      ctx.lineTo(-s * 0.4, -s * 1.5);
      ctx.lineTo(s * 1.5, -s * 1.5);
      ctx.lineTo(s, -s);
      ctx.moveTo(s, -s);
      ctx.lineTo(s * 1.5, -s * 1.5);
      ctx.lineTo(s * 1.5, s * 0.5);
      ctx.lineTo(s, s);
      ctx.stroke();
      break;
    }
    case 'sphere': {
      const gradient = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      gradient.addColorStop(0, 'rgba(234,255,238,0.5)');
      gradient.addColorStop(1, rgba(baseColor, 0.05));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.8, r * 0.25, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'file': {
      const w = r * 1.1;
      const h = r * 1.4;
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = glow;
      ctx.font = '700 8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CLASSIFIED', 0, -h / 2 + 14);
      ctx.strokeStyle = 'rgba(209,39,58,0.7)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 8, -h / 4 + i * 12);
        ctx.lineTo(w / 2 - 8, -h / 4 + i * 12);
        ctx.stroke();
      }
      break;
    }
    case 'dataCore': {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.cos(a) * r * 0.8;
        const y = Math.sin(a) * r * 0.8;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Inner ring spins independently — reads as an active data core, not a static icon.
      ctx.save();
      ctx.rotate(-obj.rotation * 2.4 - context.time / 500);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'drone': {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.9);
      ctx.lineTo(r * 0.7, 0);
      ctx.lineTo(0, r * 0.9);
      ctx.lineTo(-r * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (const [dx, dy] of [[1, -1], [1, 1], [-1, -1], [-1, 1]] as const) {
        ctx.beginPath();
        ctx.arc(dx * r * 0.7, dy * r * 0.7, r * 0.16, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'disk': {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.85, r * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.5, r * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();

  if (context.quality.effectsEnabled && (obj.grabbedBy || obj.selectPulse > 0 || hovered)) {
    ctx.save();
    ctx.globalAlpha = obj.grabbedBy ? 0.5 : hovered ? 0.35 : obj.selectPulse * 0.5;
    ctx.strokeStyle = '#eaffee';
    ctx.lineWidth = 1;
    ctx.setLineDash(hovered && !obj.grabbedBy ? [3, 3] : []);
    ctx.beginPath();
    ctx.arc(obj.x, obj.y + bob, r + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (obj.snapFlash > 0) {
    ctx.save();
    ctx.globalAlpha = obj.snapFlash * 0.7;
    ctx.strokeStyle = baseColor;
    ctx.shadowColor = baseColor;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, r + 6 + (1 - obj.snapFlash) * 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(183,201,186,0.7)';
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(obj.snapped ? `${obj.type.toUpperCase()} · LOCKED` : obj.type.toUpperCase(), obj.x, obj.y + r + 14);
}
