import type { Handedness, HandTrackingResult, Point3D } from '../types/tracking';
import type { HandHistorySample } from '../types/modules';

const HISTORY_WINDOW_MS = 1600;
const MAX_SAMPLES_PER_HAND = 90;

/**
 * Rolling per-hand landmark history, pushed once per inference tick by CameraStage and
 * shared read-only with every interaction module via TrackingContext. Centralizing this
 * avoids each module (Air Portal's circle gesture, Motion Echo's trails, Telekinesis'
 * throw velocity, Energy Pulse's aim dwell) keeping its own duplicate buffer.
 */
export class MotionHistoryTracker {
  private history = new Map<Handedness, HandHistorySample[]>();

  push(hands: HandTrackingResult, now: number): void {
    const seen = new Set<Handedness>();
    for (const hand of hands.hands) {
      if (hand.opacity < 0.5) continue;
      seen.add(hand.handedness);
      const arr = this.history.get(hand.handedness) ?? [];
      arr.push({ t: now, landmarks: hand.landmarks });
      while (arr.length && now - arr[0].t > HISTORY_WINDOW_MS) arr.shift();
      if (arr.length > MAX_SAMPLES_PER_HAND) arr.splice(0, arr.length - MAX_SAMPLES_PER_HAND);
      this.history.set(hand.handedness, arr);
    }
    for (const [handedness, arr] of this.history) {
      const last = arr[arr.length - 1];
      if (!seen.has(handedness) && last && now - last.t > HISTORY_WINDOW_MS) {
        this.history.delete(handedness);
      }
    }
  }

  snapshot(): ReadonlyMap<Handedness, HandHistorySample[]> {
    return this.history;
  }

  reset(): void {
    this.history.clear();
  }
}

/** Wrist velocity (normalized units/sec) over the most recent `windowMs`. */
export function getWristVelocity(
  samples: HandHistorySample[] | undefined,
  now: number,
  windowMs = 150,
): { x: number; y: number; speed: number } {
  if (!samples || samples.length < 2) return { x: 0, y: 0, speed: 0 };
  const recent = samples.filter((s) => now - s.t <= windowMs);
  if (recent.length < 2) return { x: 0, y: 0, speed: 0 };
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { x: 0, y: 0, speed: 0 };
  const vx = (last.landmarks[0].x - first.landmarks[0].x) / dt;
  const vy = (last.landmarks[0].y - first.landmarks[0].y) / dt;
  return { x: vx, y: vy, speed: Math.hypot(vx, vy) };
}

/** Recent path of a single landmark (default: index fingertip #8) over `windowMs`. */
export function getLandmarkPath(
  samples: HandHistorySample[] | undefined,
  now: number,
  windowMs = 1200,
  landmarkIndex = 8,
): Point3D[] {
  if (!samples) return [];
  return samples.filter((s) => now - s.t <= windowMs).map((s) => s.landmarks[landmarkIndex]);
}

export interface CircularityResult {
  score: number;
  center: Point3D;
  radius: number;
}

/**
 * Scores how close a fingertip path is to a fully-drawn circle: consistency of radius
 * around the centroid, combined with total angular coverage swept. Used by Air Portal
 * to require a deliberate circular gesture instead of any stray hand motion.
 */
export function pathCircularity(path: Point3D[]): CircularityResult {
  const empty: CircularityResult = { score: 0, center: { x: 0, y: 0, z: 0 }, radius: 0 };
  if (path.length < 10) return empty;

  let cx = 0;
  let cy = 0;
  for (const p of path) {
    cx += p.x;
    cy += p.y;
  }
  cx /= path.length;
  cy /= path.length;

  let meanR = 0;
  const radii: number[] = [];
  for (const p of path) {
    const r = Math.hypot(p.x - cx, p.y - cy);
    radii.push(r);
    meanR += r;
  }
  meanR /= path.length;
  if (meanR < 0.03) return { ...empty, center: { x: cx, y: cy, z: 0 } };

  let variance = 0;
  for (const r of radii) variance += (r - meanR) ** 2;
  variance /= radii.length;
  const radiusConsistency = Math.max(0, 1 - Math.sqrt(variance) / meanR);

  const angles = path.map((p) => Math.atan2(p.y - cy, p.x - cx));
  let total = 0;
  let prev = angles[0];
  for (let i = 1; i < angles.length; i++) {
    let d = angles[i] - prev;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    total += d;
    prev = angles[i];
  }
  const coverage = Math.min(1, Math.abs(total) / (Math.PI * 2 * 0.75));

  const score = Math.max(0, Math.min(1, radiusConsistency * 0.55 + coverage * 0.45));
  return { score, center: { x: cx, y: cy, z: 0 }, radius: meanR };
}
