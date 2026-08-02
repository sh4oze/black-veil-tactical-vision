import type { FaceBoundingBox, FaceStatus, Handedness, Point2D } from '../types/tracking';

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17], // palm base
];

const FINGER_CHAINS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
];

const PALM_OUTLINE = [0, 1, 5, 9, 13, 17];

const STATE_COLORS: Record<FaceStatus, string> = {
  searching: '#3d5a6c',
  detecting: '#e8c93a',
  tracked: '#d1273a',
  lost: '#5a5f66',
};

const HAND_COLORS: Record<Handedness, string> = {
  Left: '#33d17a',
  Right: '#3ac6e8',
};

export function stateColor(state: FaceStatus): string {
  return STATE_COLORS[state] ?? STATE_COLORS.searching;
}

/** Animated targeting reticle: pulse ring, rotating dashed circle, crosshair ticks, corner brackets, center dot. */
export function drawReticle(
  ctx: CanvasRenderingContext2D,
  center: Point2D,
  radius: number,
  state: FaceStatus,
  time: number,
): void {
  const color = stateColor(state);
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;

  const pulse = (Math.sin(time / 400) + 1) / 2;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3 + pulse * 0.25;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius * (1.15 + pulse * 0.15), 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.8;
  ctx.setLineDash([radius * 0.25, radius * 0.18]);
  ctx.lineDashOffset = -(time / 20) % (radius * 2 || 1);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  const gap = radius * 0.35;
  const len = radius * 0.55;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(dx * gap, dy * gap);
    ctx.lineTo(dx * (gap + len), dy * (gap + len));
    ctx.stroke();
  }

  ctx.lineWidth = 2;
  const bracket = radius * 1.5;
  const bl = radius * 0.35;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    ctx.beginPath();
    ctx.moveTo(sx * bracket, sy * bracket);
    ctx.lineTo(sx * (bracket - bl), sy * bracket);
    ctx.moveTo(sx * bracket, sy * bracket);
    ctx.lineTo(sx * bracket, sy * (bracket - bl));
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2, radius * 0.06), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Corner-bracket technical frame around the detected face, with a subtle scanning line while acquiring lock. */
export function drawFaceFrame(
  ctx: CanvasRenderingContext2D,
  box: FaceBoundingBox,
  state: FaceStatus,
  time: number,
): void {
  const color = stateColor(state);
  const pad = box.width * 0.18;
  const x = box.x - pad;
  const y = box.y - pad * 1.4;
  const w = box.width + pad * 2;
  const h = box.height + pad * 2.2;
  const cornerLen = Math.min(w, h) * 0.16;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.85;

  const corners: [number, number, number, number][] = [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx * cornerLen, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + dy * cornerLen);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  if (state === 'detecting' || state === 'searching') {
    const scanY = y + ((time / 6) % h);
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(x, scanY);
    ctx.lineTo(x + w, scanY);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Stylized cybernetic hand overlay: bone connections with neon glow, joint nodes,
 * a translucent palm mesh, and small energy pulses that travel along each finger.
 */
export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  points: Point2D[],
  handedness: Handedness,
  opacity: number,
  time: number,
): void {
  if (points.length < 21) return;
  const color = HAND_COLORS[handedness] ?? HAND_COLORS.Right;

  ctx.save();

  // Palm mesh fill
  ctx.beginPath();
  PALM_OUTLINE.forEach((idx, i) => {
    const p = points[idx];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity * 0.1;
  ctx.fill();

  // Bones
  ctx.globalAlpha = opacity * 0.9;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(points[a].x, points[a].y);
    ctx.lineTo(points[b].x, points[b].y);
    ctx.stroke();
  }

  // Joints
  ctx.shadowBlur = 6;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const r = i === 0 ? 5 : i % 4 === 0 ? 4 : 2.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? '#ffffff' : color;
    ctx.globalAlpha = opacity * (i === 0 ? 0.9 : 0.75);
    ctx.fill();
  }

  // Traveling energy pulses along each finger chain
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffffff';
  const t = (time % 1400) / 1400;
  FINGER_CHAINS.forEach((chain, fi) => {
    const phase = (t + fi * 0.15) % 1;
    const segCount = chain.length - 1;
    const segF = phase * segCount;
    const segIdx = Math.min(segCount - 1, Math.floor(segF));
    const localT = segF - segIdx;
    const a = points[chain[segIdx]];
    const b = points[chain[segIdx + 1]];
    const px = a.x + (b.x - a.x) * localT;
    const py = a.y + (b.y - a.y) * localT;
    ctx.globalAlpha = opacity * 0.9;
    ctx.beginPath();
    ctx.arc(px, py, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Handedness tag near the wrist
  const wrist = points[0];
  ctx.shadowBlur = 4;
  ctx.globalAlpha = opacity * 0.85;
  ctx.fillStyle = color;
  ctx.font = '600 11px "Share Tech Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  const label = handedness === 'Left' ? 'L' : 'R';
  ctx.fillText(label, wrist.x, wrist.y + 22);

  ctx.restore();
}

export function handColor(handedness: Handedness): string {
  return HAND_COLORS[handedness] ?? HAND_COLORS.Right;
}
