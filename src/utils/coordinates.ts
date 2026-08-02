import type { Point2D } from '../types/tracking';

export interface VideoFrameMapping {
  scale: number;
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Computes how a video with intrinsic size (videoW, videoH) is laid out inside a
 * canvas/container of size (canvasW, canvasH) under `object-fit: cover` semantics.
 * Needed so normalized landmark coordinates (0..1 relative to the video frame) map
 * exactly onto the visible, possibly-cropped, video area — regardless of aspect ratio.
 */
export function computeCoverMapping(
  videoW: number,
  videoH: number,
  canvasW: number,
  canvasH: number,
): VideoFrameMapping {
  if (!videoW || !videoH || !canvasW || !canvasH) {
    return { scale: 1, drawWidth: canvasW, drawHeight: canvasH, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.max(canvasW / videoW, canvasH / videoH);
  const drawWidth = videoW * scale;
  const drawHeight = videoH * scale;
  return {
    scale,
    drawWidth,
    drawHeight,
    offsetX: (canvasW - drawWidth) / 2,
    offsetY: (canvasH - drawHeight) / 2,
  };
}

/**
 * Maps a normalized landmark point (0..1) to canvas pixel space, honoring the cover
 * mapping and optionally mirroring horizontally (to match a mirrored/selfie video).
 */
export function landmarkToCanvas(
  nx: number,
  ny: number,
  mapping: VideoFrameMapping,
  canvasW: number,
  mirror = true,
): Point2D {
  const px = mapping.offsetX + nx * mapping.drawWidth;
  const py = mapping.offsetY + ny * mapping.drawHeight;
  return { x: mirror ? canvasW - px : px, y: py };
}
