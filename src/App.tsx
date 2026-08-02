import { useCallback, useEffect, useRef, useState } from 'react';
import StartupScreen from './components/StartupScreen';
import CameraStage, { type CameraStageHandle } from './components/CameraStage';
import TacticalHUD from './components/TacticalHUD';
import ControlPanel from './components/ControlPanel';
import { audioEngine } from './services/audioEngine';
import type { CameraStatusInfo, LogEntry, Telemetry } from './types/tracking';

const INITIAL_TELEMETRY: Telemetry = {
  faceStatus: 'searching',
  faceConfidence: 0,
  facesCount: 0,
  handsCount: 0,
  hands: [],
  bothHandsRaised: false,
  fps: 0,
  inferenceIntervalMs: 33,
};

const INITIAL_CAMERA_STATUS: CameraStatusInfo = {
  status: 'idle',
  error: null,
  facingMode: 'user',
  canSwitchFacing: false,
};

let logId = 0;

export default function App() {
  const [systemStarted, setSystemStarted] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [skeletonVisible, setSkeletonVisible] = useState(true);
  const [reticleVisible, setReticleVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [telemetry, setTelemetry] = useState<Telemetry>(INITIAL_TELEMETRY);
  const [cameraStatus, setCameraStatus] = useState<CameraStatusInfo>(INITIAL_CAMERA_STATUS);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const stageRef = useRef<CameraStageHandle>(null);

  const pushLog = useCallback((text: string) => {
    setLogs((prev) => {
      const next = [...prev, { id: logId++, text, time: Date.now() }];
      return next.slice(-6);
    });
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleStartSystem = useCallback(() => {
    setSystemStarted(true);
    pushLog('BLACK VEIL ONLINE');
    pushLog('TACTICAL TRACKING ACTIVE');
  }, [pushLog]);

  const handleToggleCamera = useCallback(() => {
    if (cameraStatus.status === 'active' || cameraStatus.status === 'starting') {
      stageRef.current?.stopCamera();
      pushLog('SENSOR ÓTICO DESATIVADO');
    } else {
      stageRef.current?.startCamera();
      pushLog('SENSOR RECALIBRATION');
    }
  }, [cameraStatus.status, pushLog]);

  const handleToggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      audioEngine.setEnabled(next);
      if (next) audioEngine.play('startup');
      return next;
    });
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }, []);

  const handleSwitchFacing = useCallback(() => {
    stageRef.current?.switchFacing();
  }, []);

  return (
    <div className="app-root">
      {!systemStarted && <StartupScreen onStart={handleStartSystem} />}

      {systemStarted && (
        <div className="tactical-shell">
          <CameraStage
            ref={stageRef}
            autoStart
            soundOn={soundOn}
            showReticle={reticleVisible}
            showSkeleton={skeletonVisible}
            onTelemetry={setTelemetry}
            onLog={pushLog}
            onCameraStatus={setCameraStatus}
          />

          <TacticalHUD
            telemetry={telemetry}
            cameraStatus={cameraStatus}
            soundOn={soundOn}
            logs={logs}
            visible={hudVisible}
          />

          <ControlPanel
            cameraOn={cameraStatus.status === 'active' || cameraStatus.status === 'starting'}
            soundOn={soundOn}
            hudVisible={hudVisible}
            skeletonVisible={skeletonVisible}
            reticleVisible={reticleVisible}
            isFullscreen={isFullscreen}
            canSwitchFacing={cameraStatus.canSwitchFacing}
            onToggleCamera={handleToggleCamera}
            onToggleSound={handleToggleSound}
            onToggleHud={() => setHudVisible((v) => !v)}
            onToggleSkeleton={() => setSkeletonVisible((v) => !v)}
            onToggleReticle={() => setReticleVisible((v) => !v)}
            onToggleFullscreen={handleToggleFullscreen}
            onSwitchFacing={handleSwitchFacing}
          />
        </div>
      )}
    </div>
  );
}
