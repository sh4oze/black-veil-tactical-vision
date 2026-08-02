import type { GestureType, Point3D } from '../types/tracking';

function dist(a: Point3D, b: Point3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function isFingerExtended(landmarks: Point3D[], tipIdx: number, pipIdx: number): boolean {
  const wrist = landmarks[0];
  return dist(wrist, landmarks[tipIdx]) > dist(wrist, landmarks[pipIdx]) * 1.15;
}

/**
 * Classifies a single hand's raw (already smoothed) landmarks into a discrete shape.
 * Uses distance-from-wrist comparisons (rather than raw y-coordinates) so the
 * classification stays robust to hand rotation and camera angle.
 */
export function detectHandShape(landmarks: Point3D[]): GestureType {
  if (landmarks.length < 21) return 'none';

  const wrist = landmarks[0];
  const indexExt = isFingerExtended(landmarks, 8, 6);
  const middleExt = isFingerExtended(landmarks, 12, 10);
  const ringExt = isFingerExtended(landmarks, 16, 14);
  const pinkyExt = isFingerExtended(landmarks, 20, 18);

  const thumbTip = landmarks[4];
  const thumbMcp = landmarks[2];
  const thumbExt = dist(wrist, thumbTip) > dist(wrist, thumbMcp) * 1.2;

  const palmSize = dist(landmarks[0], landmarks[9]) || 0.0001;
  const pinchDist = dist(thumbTip, landmarks[8]);
  if (pinchDist < palmSize * 0.4) return 'pinch';

  const extCount = [indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;

  if (extCount === 4 && thumbExt) return 'open_palm';
  if (extCount === 0 && !thumbExt) return 'closed_fist';
  if (indexExt && !middleExt && !ringExt && !pinkyExt) return 'pointing';
  if (indexExt && middleExt && !ringExt && !pinkyExt) return 'peace_sign';
  if (thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt) {
    if (thumbTip.y < wrist.y - palmSize * 0.25) return 'thumbs_up';
  }
  return 'none';
}

/**
 * Requires a gesture to dominate a rolling window of recent frames before confirming it,
 * and enforces a cooldown between confirming distinct new (non-"none") gestures.
 * This keeps the HUD from flickering between shapes during finger transitions.
 */
export class GestureStabilizer {
  private history: GestureType[] = [];
  private confirmed: GestureType = 'none';
  private lastConfirmedAt = 0;

  constructor(
    private windowSize = 6,
    private requiredRatio = 0.7,
    private cooldownMs = 550,
  ) {}

  update(raw: GestureType): GestureType {
    this.history.push(raw);
    if (this.history.length > this.windowSize) this.history.shift();
    if (this.history.length < this.windowSize) return this.confirmed;

    const counts = new Map<GestureType, number>();
    for (const g of this.history) counts.set(g, (counts.get(g) ?? 0) + 1);
    let dominant: GestureType = 'none';
    let dominantCount = 0;
    counts.forEach((count, gesture) => {
      if (count > dominantCount) {
        dominantCount = count;
        dominant = gesture;
      }
    });

    const ratio = dominantCount / this.history.length;
    if (ratio < this.requiredRatio) return this.confirmed;

    if (dominant !== this.confirmed) {
      const now = performance.now();
      if (dominant === 'none' || now - this.lastConfirmedAt > this.cooldownMs) {
        this.confirmed = dominant;
        if (dominant !== 'none') this.lastConfirmedAt = now;
      }
    }
    return this.confirmed;
  }

  reset(): void {
    this.history = [];
    this.confirmed = 'none';
  }
}

export const GESTURE_LABELS: Record<GestureType, string> = {
  none: '—',
  open_palm: 'PALMA DETECTADA',
  closed_fist: 'PUNHO FECHADO',
  pointing: 'COMANDO DIRECIONAL',
  peace_sign: 'GESTO CONFIRMADO',
  thumbs_up: 'GESTO CONFIRMADO',
  pinch: 'INTERAÇÃO POR PINÇA',
};
