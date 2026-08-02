import { drawHandSkeleton } from '../../utils/drawing';
import { emitModuleEvent } from '../../store/moduleEvents';
import { MODULE_LABELS } from '../../types/modules';
import type { HandHistorySample, InteractionModule, TrackingContext } from '../../types/modules';
import type { Point2D, Point3D } from '../../types/tracking';

interface FaceHistorySample {
  t: number;
  forehead: Point2D | null;
  size: number;
}

const ECHO_COUNT = 5;
const DELAY_STEP_MS = 85;
const FACE_HISTORY_WINDOW_MS = ECHO_COUNT * DELAY_STEP_MS + 200;

function closestSample<T extends { t: number }>(samples: T[], targetT: number): T | null {
  if (samples.length === 0) return null;
  let best = samples[0];
  let bestDiff = Math.abs(samples[0].t - targetT);
  for (let i = 1; i < samples.length; i++) {
    const diff = Math.abs(samples[i].t - targetT);
    if (diff < bestDiff) {
      best = samples[i];
      bestDiff = diff;
    }
  }
  return bestDiff <= DELAY_STEP_MS * 1.5 ? best : null;
}

/**
 * Renders faded, time-delayed copies of the hands (from the shared motion history) and
 * head position (from a small local buffer of the already-detected forehead point — no
 * extra inference) trailing behind the live pose, like a short-persistence hologram.
 */
export function createMotionEchoModule(): InteractionModule {
  let faceHistory: FaceHistorySample[] = [];
  let announced = false;

  const module: InteractionModule = {
    id: 'motionEcho',
    label: MODULE_LABELS.motionEcho,
    enabled: false,

    activate() {
      this.enabled = true;
      announced = false;
    },

    update(context: TrackingContext) {
      faceHistory.push({ t: context.time, forehead: context.face.foreheadPoint, size: context.face.sizeMetric });
      faceHistory = faceHistory.filter((s) => context.time - s.t <= FACE_HISTORY_WINDOW_MS);

      if (!announced && (context.hands.hands.length > 0 || context.face.landmarks)) {
        emitModuleEvent('MOTION ECHO ACTIVE');
        announced = true;
      }
    },

    render(ctx: CanvasRenderingContext2D, context: TrackingContext) {
      for (let i = ECHO_COUNT; i >= 1; i--) {
        const targetT = context.time - i * DELAY_STEP_MS;
        const fade = 1 - i / (ECHO_COUNT + 1);
        const opacity = 0.32 * fade;

        for (const [handedness, samples] of context.handHistory as ReadonlyMap<string, HandHistorySample[]>) {
          const sample = closestSample(samples as HandHistorySample[], targetT);
          if (!sample) continue;
          const points = sample.landmarks.map((lm: Point3D) => context.toCanvas(lm.x, lm.y));
          drawHandSkeleton(ctx, points, handedness as 'Left' | 'Right', opacity, context.time);
        }

        const faceSample = closestSample(faceHistory, targetT);
        if (faceSample?.forehead) {
          const pos = context.toCanvas(faceSample.forehead.x, faceSample.forehead.y);
          const radius = Math.max(14, Math.min(50, faceSample.size * context.mapping.drawWidth * 1.4));
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.strokeStyle = '#3ac6e8';
          ctx.shadowColor = '#3ac6e8';
          ctx.shadowBlur = 6;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius * 0.7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    },

    reset() {
      faceHistory = [];
      announced = false;
    },

    deactivate() {
      this.enabled = false;
      this.reset();
    },
  };

  return module;
}
