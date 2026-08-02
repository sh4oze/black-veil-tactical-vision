import { useCallback, useEffect, useRef, useState } from 'react';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { getHandLandmarker } from '../services/handLandmarker';
import { SmoothedLandmarks } from '../utils/smoothing';
import { detectHandShape, GestureStabilizer } from '../utils/gestureDetection';
import type { Handedness, HandTrackingResult, Point3D, TrackedHand } from '../types/tracking';

const FADE_MS = 450;
const RAISED_Y_THRESHOLD = 0.45;
const BOTH_RAISED_STABLE_FRAMES = 4;

interface HandState {
  smoother: SmoothedLandmarks;
  stabilizer: GestureStabilizer;
  lastSeen: number;
}

export function useHandTracking() {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const statesRef = useRef<Map<Handedness, HandState>>(new Map());
  const bothRaisedStreak = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getHandLandmarker()
      .then((lm) => {
        if (!cancelled) {
          landmarkerRef.current = lm;
          setReady(true);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Falha ao carregar o modelo de mãos.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const detectHands = useCallback((video: HTMLVideoElement, timestampMs: number): HandTrackingResult => {
    const landmarker = landmarkerRef.current;
    const states = statesRef.current;
    if (!landmarker) return { hands: [], bothHandsRaised: false };

    const result = landmarker.detectForVideo(video, timestampMs);
    const now = performance.now();
    const seen = new Set<Handedness>();
    const hands: TrackedHand[] = [];

    result.landmarks.forEach((rawLandmarks, i) => {
      const info = result.handednesses[i]?.[0];
      const handedness = (info?.categoryName as Handedness) ?? 'Right';
      seen.add(handedness);

      let state = states.get(handedness);
      if (!state) {
        state = { smoother: new SmoothedLandmarks(0.55), stabilizer: new GestureStabilizer(), lastSeen: now };
        states.set(handedness, state);
      }
      state.lastSeen = now;

      const smoothed = state.smoother.update(rawLandmarks as Point3D[]);
      const rawGesture = detectHandShape(smoothed);
      const gesture = state.stabilizer.update(rawGesture);

      hands.push({
        handedness,
        landmarks: smoothed,
        confidence: info?.score ?? 0,
        gesture,
        opacity: 1,
      });
    });

    for (const [handedness, state] of states.entries()) {
      if (seen.has(handedness)) continue;
      const dt = now - state.lastSeen;
      if (dt < FADE_MS) {
        const frozen = state.smoother.peek();
        if (frozen) {
          hands.push({
            handedness,
            landmarks: frozen,
            confidence: 0,
            gesture: 'none',
            opacity: Math.max(0, 1 - dt / FADE_MS),
          });
        }
      } else {
        states.delete(handedness);
      }
    }

    const bothRaisedNow =
      hands.length === 2 && hands.every((h) => h.opacity > 0.5 && h.landmarks[0].y < RAISED_Y_THRESHOLD);
    bothRaisedStreak.current = bothRaisedNow ? bothRaisedStreak.current + 1 : 0;

    return { hands, bothHandsRaised: bothRaisedStreak.current >= BOTH_RAISED_STABLE_FRAMES };
  }, []);

  return { ready, loadError, detectHands };
}
