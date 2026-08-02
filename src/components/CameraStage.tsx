import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import { useFaceTracking } from '../hooks/useFaceTracking';
import { useHandTracking } from '../hooks/useHandTracking';
import { audioEngine } from '../services/audioEngine';
import { GESTURE_LABELS } from '../utils/gestureDetection';
import FaceOverlay from './FaceOverlay';
import HandSkeletonOverlay from './HandSkeletonOverlay';
import type {
  CameraStatusInfo,
  FaceStatus,
  FaceTrackingResult,
  GestureType,
  Handedness,
  HandTrackingResult,
  Telemetry,
} from '../types/tracking';

export interface CameraStageHandle {
  startCamera: () => void;
  stopCamera: () => void;
  switchFacing: () => void;
}

interface CameraStageProps {
  autoStart: boolean;
  soundOn: boolean;
  showReticle: boolean;
  showSkeleton: boolean;
  onTelemetry: (t: Telemetry) => void;
  onLog: (msg: string) => void;
  onCameraStatus: (info: CameraStatusInfo) => void;
}

const MIN_INTERVAL_MS = 25;
const MAX_INTERVAL_MS = 90;
const TELEMETRY_INTERVAL_MS = 400;

function canSwitchFacingGuess(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

const CameraStage = forwardRef<CameraStageHandle, CameraStageProps>(function CameraStage(
  { autoStart, soundOn, showReticle, showSkeleton, onTelemetry, onLog, onCameraStatus },
  ref,
) {
  const { videoRef, status, error, facingMode, videoSize, start, stop, switchFacing, handleLoadedMetadata } =
    useCamera();
  const faceTracking = useFaceTracking();
  const handTracking = useHandTracking();

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const faceResultRef = useRef<FaceTrackingResult>({
    status: 'searching',
    landmarks: null,
    foreheadPoint: null,
    boundingBox: null,
    confidence: 0,
    sizeMetric: 0,
  });
  const handResultRef = useRef<HandTrackingResult>({ hands: [], bothHandsRaised: false });

  const autoStartedRef = useRef(false);
  const prevFaceStatusRef = useRef<FaceStatus>('searching');
  const prevGesturesRef = useRef<Map<Handedness, GestureType>>(new Map());
  const prevHandCountRef = useRef(0);
  const prevBothRaisedRef = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      startCamera: () => void start('user'),
      stopCamera: stop,
      switchFacing: () => void switchFacing(),
    }),
    [start, stop, switchFacing],
  );

  useEffect(() => {
    if (autoStart && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void start('user');
    }
  }, [autoStart, start]);

  useEffect(() => {
    onCameraStatus({ status, error, facingMode, canSwitchFacing: canSwitchFacingGuess() });
  }, [status, error, facingMode, onCameraStatus]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    audioEngine.setEnabled(soundOn);
  }, [soundOn]);

  const pushLog = useCallback((msg: string) => onLog(msg), [onLog]);

  useEffect(() => {
    if (status !== 'active') return undefined;

    let rafId = 0;
    let lastInference = 0;
    let inferenceInterval = 33;
    let lastFrameTs = performance.now();
    let fpsAcc = 0;
    let fpsCount = 0;
    let lastTelemetryEmit = 0;

    const loop = (ts: number) => {
      rafId = requestAnimationFrame(loop);
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const dt = ts - lastFrameTs;
      lastFrameTs = ts;
      if (dt > 0 && dt < 1000) {
        fpsAcc += 1000 / dt;
        fpsCount += 1;
      }

      if (ts - lastInference >= inferenceInterval) {
        const t0 = performance.now();

        if (faceTracking.ready) {
          const prevStatus = prevFaceStatusRef.current;
          const faceResult = faceTracking.detectFace(video, ts);
          faceResultRef.current = faceResult;

          if (faceResult.status !== prevStatus) {
            if (faceResult.status === 'tracked' && prevStatus !== 'tracked') {
              pushLog('TARGET ACQUIRED — ALVO IDENTIFICADO');
              audioEngine.play('lock');
            } else if (faceResult.status === 'detecting' && prevStatus === 'searching') {
              pushLog('SINAL FACIAL DETECTADO');
              audioEngine.play('face_detected');
            } else if ((faceResult.status === 'lost' || faceResult.status === 'searching') && prevStatus === 'tracked') {
              pushLog('VISUAL SIGNAL LOST — ALVO PERDIDO');
              audioEngine.play('target_lost');
            }
            prevFaceStatusRef.current = faceResult.status;
          }
        }

        if (handTracking.ready) {
          const handResult = handTracking.detectHands(video, ts);
          handResultRef.current = handResult;

          if (handResult.hands.length > prevHandCountRef.current) {
            pushLog('HAND STRUCTURE MAPPED');
            audioEngine.play('hand_detected');
          }
          prevHandCountRef.current = handResult.hands.length;

          const nextGestures = new Map<Handedness, GestureType>();
          for (const hand of handResult.hands) {
            nextGestures.set(hand.handedness, hand.gesture);
            const prevGesture = prevGesturesRef.current.get(hand.handedness) ?? 'none';
            if (hand.gesture !== 'none' && hand.gesture !== prevGesture) {
              pushLog(`${GESTURE_LABELS[hand.gesture]} (${hand.handedness === 'Left' ? 'ESQ' : 'DIR'})`);
              audioEngine.play('gesture_confirmed');
            }
          }
          prevGesturesRef.current = nextGestures;

          if (handResult.bothHandsRaised && !prevBothRaisedRef.current) {
            pushLog('RENDIÇÃO DETECTADA');
            audioEngine.play('alert');
          }
          prevBothRaisedRef.current = handResult.bothHandsRaised;
        }

        const elapsed = performance.now() - t0;
        if (elapsed > inferenceInterval * 0.8) {
          inferenceInterval = Math.min(MAX_INTERVAL_MS, inferenceInterval + 4);
        } else if (elapsed < inferenceInterval * 0.3) {
          inferenceInterval = Math.max(MIN_INTERVAL_MS, inferenceInterval - 2);
        }
        lastInference = ts;
      }

      if (ts - lastTelemetryEmit > TELEMETRY_INTERVAL_MS) {
        const avgFps = fpsCount ? fpsAcc / fpsCount : 0;
        const face = faceResultRef.current;
        const hands = handResultRef.current;
        onTelemetry({
          faceStatus: face.status,
          faceConfidence: face.confidence,
          facesCount: face.landmarks ? 1 : 0,
          handsCount: hands.hands.filter((h) => h.opacity > 0.5).length,
          hands: hands.hands
            .filter((h) => h.opacity > 0.5)
            .map((h) => ({ handedness: h.handedness, gesture: h.gesture, confidence: h.confidence })),
          bothHandsRaised: hands.bothHandsRaised,
          fps: avgFps,
          inferenceIntervalMs: Math.round(inferenceInterval),
        });
        fpsAcc = 0;
        fpsCount = 0;
        lastTelemetryEmit = ts;
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [status, faceTracking, handTracking, onTelemetry, pushLog]);

  const modelError = faceTracking.loadError || handTracking.loadError;
  const showLoading = status === 'starting' || (status === 'active' && !faceTracking.ready && !handTracking.ready);

  const errorMessage = useMemo(() => {
    if (modelError) return `Falha ao carregar modelo de rastreamento: ${modelError}`;
    if (error) return error.message;
    return null;
  }, [error, modelError]);

  return (
    <div ref={containerRef} className="stage">
      <video
        ref={videoRef}
        className="stage-video"
        playsInline
        muted
        autoPlay
        onLoadedMetadata={handleLoadedMetadata}
      />

      <FaceOverlay
        resultRef={faceResultRef}
        width={size.width}
        height={size.height}
        videoSize={videoSize}
        visible={showReticle && status === 'active'}
      />
      <HandSkeletonOverlay
        resultRef={handResultRef}
        width={size.width}
        height={size.height}
        videoSize={videoSize}
        visible={showSkeleton && status === 'active'}
      />

      {status === 'idle' && !errorMessage && (
        <div className="stage-message">CÂMERA DESATIVADA</div>
      )}

      {showLoading && !errorMessage && (
        <div className="stage-message">
          <span className="loading-spinner" />
          INICIALIZANDO SISTEMA…
        </div>
      )}

      {errorMessage && (
        <div className="stage-message stage-error">
          <div className="stage-error-title">FALHA NO SISTEMA</div>
          <div>{errorMessage}</div>
        </div>
      )}
    </div>
  );
});

export default CameraStage;
