import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { getFaceLandmarker } from '../services/faceLandmarker';
import { SmoothedLandmarks, SmoothedPoint, SmoothedValue } from '../utils/smoothing';
import { interactionStore } from '../store/interactionStore';
import type { FaceStatus, FaceTrackingResult, Point3D } from '../types/tracking';

/** smoothing 0 (responsive) .. 1 (heavy) -> alpha 0.75 (light filtering) .. 0.15 (strong filtering). */
function smoothingToAlpha(smoothing: number): number {
  return 0.75 - smoothing * 0.6;
}

const FOREHEAD_LANDMARK = 10;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;
const MISSING_FRAMES_TO_RESET = 12;

function emptyResult(status: FaceStatus): FaceTrackingResult {
  return { status, landmarks: null, foreheadPoint: null, boundingBox: null, confidence: 0, sizeMetric: 0 };
}

export function useFaceTracking() {
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const smoothLandmarks = useRef(new SmoothedLandmarks(0.5));
  const smoothForehead = useRef(new SmoothedPoint(0.35));
  const smoothSize = useRef(new SmoothedValue(0.3));
  const missingFrames = useRef(0);
  const presentFrames = useRef(0);
  const statusRef = useRef<FaceStatus>('searching');

  useEffect(() => {
    let cancelled = false;
    getFaceLandmarker()
      .then((lm) => {
        if (!cancelled) {
          landmarkerRef.current = lm;
          setReady(true);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Falha ao carregar o modelo facial.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const detectFace = useCallback((video: HTMLVideoElement, timestampMs: number): FaceTrackingResult => {
    const landmarker = landmarkerRef.current;
    if (!landmarker) return emptyResult(statusRef.current);

    const alpha = smoothingToAlpha(interactionStore.getState().options.trackingSmoothing);
    smoothLandmarks.current.setAlpha(alpha);
    smoothForehead.current.setAlpha(Math.max(0.1, alpha - 0.15));

    const result = landmarker.detectForVideo(video, timestampMs);
    const faces = result.faceLandmarks;

    if (faces && faces.length > 0) {
      missingFrames.current = 0;
      presentFrames.current += 1;

      const raw = faces[0] as Point3D[];
      const smoothed = smoothLandmarks.current.update(raw);

      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const p of smoothed) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }

      const forehead = smoothForehead.current.update(smoothed[FOREHEAD_LANDMARK]);
      const eyeDist = Math.hypot(
        smoothed[LEFT_EYE_OUTER].x - smoothed[RIGHT_EYE_OUTER].x,
        smoothed[LEFT_EYE_OUTER].y - smoothed[RIGHT_EYE_OUTER].y,
      );
      const sizeMetric = smoothSize.current.update(eyeDist);

      statusRef.current = presentFrames.current > 3 ? 'tracked' : 'detecting';

      return {
        status: statusRef.current,
        landmarks: smoothed,
        foreheadPoint: forehead,
        boundingBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        confidence: Math.min(0.98, 0.55 + presentFrames.current * 0.05),
        sizeMetric,
      };
    }

    presentFrames.current = 0;
    missingFrames.current += 1;

    if (missingFrames.current > MISSING_FRAMES_TO_RESET) {
      statusRef.current = 'searching';
      smoothLandmarks.current.reset();
      smoothForehead.current.reset();
      smoothSize.current.reset();
      return emptyResult('searching');
    }

    statusRef.current = 'lost';
    return emptyResult('lost');
  }, []);

  return { ready, loadError, detectFace };
}
