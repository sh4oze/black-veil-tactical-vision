import type { Point3D, TrackedHand } from '../../types/tracking';

export function dist3(a: Point3D, b: Point3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

export function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

const PALM_LANDMARKS = [0, 5, 9, 13, 17];

export function palmCenter(hand: TrackedHand): Point3D {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of PALM_LANDMARKS) {
    x += hand.landmarks[i].x;
    y += hand.landmarks[i].y;
    z += hand.landmarks[i].z;
  }
  const n = PALM_LANDMARKS.length;
  return { x: x / n, y: y / n, z: z / n };
}

/** Approximate palm-facing unit normal from the cross product of two in-palm edge vectors. */
export function palmNormal(hand: TrackedHand): Point3D {
  const wrist = hand.landmarks[0];
  const index = hand.landmarks[5];
  const pinky = hand.landmarks[17];
  const v1 = { x: index.x - wrist.x, y: index.y - wrist.y, z: index.z - wrist.z };
  const v2 = { x: pinky.x - wrist.x, y: pinky.y - wrist.y, z: pinky.z - wrist.z };
  const nx = v1.y * v2.z - v1.z * v2.y;
  const ny = v1.z * v2.x - v1.x * v2.z;
  const nz = v1.x * v2.y - v1.y * v2.x;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

/**
 * Heuristic: the palm normal's z component grows in magnitude as the hand rotates to face
 * either straight toward or straight away from the camera, and shrinks toward 0 when the
 * hand is edge-on (like a "karate chop"). We deliberately check magnitude, not sign — the
 * sign convention for which side is "palm" vs "back of hand" depends on landmark winding
 * order per hand and could not be empirically verified against a real camera in development,
 * so treating both orientations as "facing" trades a little precision for reliability.
 */
export function isPalmFacingCamera(hand: TrackedHand): boolean {
  return Math.abs(palmNormal(hand).z) > 0.15;
}

const FINGERTIPS = [4, 8, 12, 16, 20];

/** 0 (closed fist) .. ~1.2 (fully open hand), based on average fingertip distance from palm center. */
export function handOpenness(hand: TrackedHand): number {
  const center = palmCenter(hand);
  const palmSize = dist3(hand.landmarks[0], hand.landmarks[9]) || 0.0001;
  let avg = 0;
  for (const t of FINGERTIPS) avg += dist3(hand.landmarks[t], center);
  avg /= FINGERTIPS.length;
  return avg / (palmSize * 1.55);
}

export function pinchDistance(hand: TrackedHand): number {
  const palmSize = dist3(hand.landmarks[0], hand.landmarks[9]) || 0.0001;
  return dist3(hand.landmarks[4], hand.landmarks[8]) / palmSize;
}

export function isPinching(hand: TrackedHand, sensitivity = 0.5): boolean {
  const threshold = lerp(0.35, 0.55, sensitivity);
  return pinchDistance(hand) < threshold;
}

export function pinchMidpoint(hand: TrackedHand): Point3D {
  const a = hand.landmarks[4];
  const b = hand.landmarks[8];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
}
