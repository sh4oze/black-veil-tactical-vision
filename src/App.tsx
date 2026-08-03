import { useCallback, useEffect, useRef, useState } from 'react';
import LoginScreen from './components/LoginScreen';
import StartupScreen from './components/StartupScreen';
import CameraStage, { type CameraStageHandle } from './components/CameraStage';
import TacticalHUD from './components/TacticalHUD';
import ControlPanel from './components/ControlPanel';
import InteractionModulesPanel from './components/InteractionModulesPanel';
import SettingsPanel from './components/SettingsPanel';
import { audioEngine } from './services/audioEngine';
import { hasValidSession, logout } from './services/authService';
import { speak, setVoiceFeedbackEnabled } from './services/voiceFeedback';
import { interactionStore, useInteractionState } from './store/interactionStore';
import { subscribeModuleEvents } from './store/moduleEvents';
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

// Set only via a build-time env var (VITE_SKIP_LOGIN=true), never committed as a default —
// lets the public showcase deploy skip the credential gate while local/private builds keep it.
const SKIP_LOGIN = import.meta.env.VITE_SKIP_LOGIN === 'true';

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => SKIP_LOGIN || hasValidSession());
  const [systemStarted, setSystemStarted] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [modulesPanelVisible, setModulesPanelVisible] = useState(false);
  const [settingsPanelVisible, setSettingsPanelVisible] = useState(false);

  const [telemetry, setTelemetry] = useState<Telemetry>(INITIAL_TELEMETRY);
  const [cameraStatus, setCameraStatus] = useState<CameraStatusInfo>(INITIAL_CAMERA_STATUS);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const prefs = useInteractionState();
  const stageRef = useRef<CameraStageHandle>(null);

  const pushLog = useCallback((text: string) => {
    setLogs((prev) => {
      const next = [...prev, { id: logId++, text, time: Date.now() }];
      return next.slice(-6);
    });
    speak(text);
  }, []);

  useEffect(() => {
    setVoiceFeedbackEnabled(prefs.options.voiceFeedback);
  }, [prefs.options.voiceFeedback]);

  useEffect(() => subscribeModuleEvents(pushLog), [pushLog]);

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
    const next = !prefs.options.soundEffects;
    interactionStore.setOption('soundEffects', next);
    audioEngine.setEnabled(next);
    if (next) audioEngine.play('startup');
  }, [prefs.options.soundEffects]);

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

  const handleLogout = useCallback(() => {
    if (SKIP_LOGIN) return;
    stageRef.current?.stopCamera();
    logout();
    setSystemStarted(false);
    setAuthenticated(false);
  }, []);

  if (!authenticated) {
    return <LoginScreen onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <div className="app-root">
      {!systemStarted && <StartupScreen onStart={handleStartSystem} />}

      {systemStarted && (
        <div className="tactical-shell">
          <CameraStage
            ref={stageRef}
            autoStart
            soundOn={prefs.options.soundEffects}
            showReticle={prefs.options.targetReticle}
            showSkeleton={prefs.options.handSkeleton}
            onTelemetry={setTelemetry}
            onLog={pushLog}
            onCameraStatus={setCameraStatus}
          />

          <TacticalHUD
            telemetry={telemetry}
            cameraStatus={cameraStatus}
            soundOn={prefs.options.soundEffects}
            showFps={prefs.options.showFps}
            logs={logs}
            visible={hudVisible}
          />

          <InteractionModulesPanel visible={modulesPanelVisible} onClose={() => setModulesPanelVisible(false)} />
          <SettingsPanel visible={settingsPanelVisible} onClose={() => setSettingsPanelVisible(false)} />

          <ControlPanel
            cameraOn={cameraStatus.status === 'active' || cameraStatus.status === 'starting'}
            soundOn={prefs.options.soundEffects}
            hudVisible={hudVisible}
            skeletonVisible={prefs.options.handSkeleton}
            reticleVisible={prefs.options.targetReticle}
            autoFireOn={prefs.options.autoFire}
            isFullscreen={isFullscreen}
            canSwitchFacing={cameraStatus.canSwitchFacing}
            modulesPanelOpen={modulesPanelVisible}
            settingsPanelOpen={settingsPanelVisible}
            onToggleCamera={handleToggleCamera}
            onToggleSound={handleToggleSound}
            onToggleHud={() => setHudVisible((v) => !v)}
            onToggleSkeleton={() => interactionStore.setOption('handSkeleton', !prefs.options.handSkeleton)}
            onToggleReticle={() => interactionStore.setOption('targetReticle', !prefs.options.targetReticle)}
            onToggleAutoFire={() => interactionStore.setOption('autoFire', !prefs.options.autoFire)}
            onToggleFullscreen={handleToggleFullscreen}
            onSwitchFacing={handleSwitchFacing}
            onToggleModulesPanel={() => setModulesPanelVisible((v) => !v)}
            onToggleSettingsPanel={() => setSettingsPanelVisible((v) => !v)}
            onLogout={handleLogout}
            showLogout={!SKIP_LOGIN}
          />
        </div>
      )}
    </div>
  );
}
