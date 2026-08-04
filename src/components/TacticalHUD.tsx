import { GESTURE_LABELS } from '../utils/gestureDetection';
import type { CameraStatusInfo, LogEntry, Telemetry } from '../types/tracking';

interface TacticalHUDProps {
  telemetry: Telemetry;
  cameraStatus: CameraStatusInfo;
  soundOn: boolean;
  showFps: boolean;
  logs: LogEntry[];
  visible: boolean;
}

const FACE_STATUS_LABEL: Record<Telemetry['faceStatus'], string> = {
  searching: 'VARREDURA EM ANDAMENTO',
  detecting: 'ALVO EM ANÁLISE',
  tracked: 'ALVO IDENTIFICADO',
  lost: 'ALVO PERDIDO',
};

export default function TacticalHUD({ telemetry, cameraStatus, soundOn, showFps, logs, visible }: TacticalHUDProps) {
  if (!visible) return null;

  return (
    <div className="hud-layer">
      <div className="tactical-grid" />
      <div className="tactical-scanline" />
      <div className="tactical-vignette" />
      <div className="tactical-noise" />

      <div className="hud-corner hud-corner-tl" />
      <div className="hud-corner hud-corner-tr" />
      <div className="hud-corner hud-corner-bl" />
      <div className="hud-corner hud-corner-br" />

      <header className="hud-topbar">
        <div className="hud-brand">
          <span className="hud-brand-dot" />
          BLACK VEIL <span className="hud-brand-sep">·</span> TACTICAL VISION SYSTEM
        </div>
        <div className="hud-indicators">
          <span className={`hud-pill ${cameraStatus.status === 'active' ? 'ok' : 'muted'}`}>
            CAM {cameraStatus.status === 'active' ? 'ON' : 'OFF'}
          </span>
          <span className={`hud-pill ${soundOn ? 'ok' : 'muted'}`}>SOM {soundOn ? 'ON' : 'OFF'}</span>
          {showFps && <span className="hud-pill">FPS {telemetry.fps.toFixed(0)}</span>}
        </div>
      </header>

      <section className="hud-panel hud-panel-left">
        <div className="hud-panel-title">STATUS DO SISTEMA</div>
        <div className="hud-row">
          <span>MODO</span>
          <span>RASTREAMENTO TÁTICO</span>
        </div>
        <div className="hud-row">
          <span>ROSTOS</span>
          <span>{telemetry.facesCount.toString().padStart(2, '0')}</span>
        </div>
        <div className="hud-row">
          <span>MÃOS</span>
          <span>{telemetry.handsCount.toString().padStart(2, '0')}</span>
        </div>
        <div className="hud-row">
          <span>INFERÊNCIA</span>
          <span>{telemetry.inferenceIntervalMs}ms</span>
        </div>
        <div className="hud-divider" />
        <div className="hud-panel-title">BIOMETRIC DATA SIMULATED</div>
        <div className="hud-log">
          {logs.map((log) => (
            <div key={log.id} className="hud-log-line">
              &gt; {log.text}
            </div>
          ))}
        </div>
      </section>

      <section className="hud-panel hud-panel-right">
        <div className="hud-panel-title">RASTREAMENTO FACIAL</div>
        <div className={`hud-status-line status-${telemetry.faceStatus}`}>{FACE_STATUS_LABEL[telemetry.faceStatus]}</div>
        <div className="hud-row">
          <span>CONFIANÇA</span>
          <span>{(telemetry.faceConfidence * 100).toFixed(0)}%</span>
        </div>

        <div className="hud-divider" />

        <div className="hud-panel-title">RASTREAMENTO DE MÃOS</div>
        {telemetry.hands.length === 0 && <div className="hud-row hud-muted">NENHUMA MÃO DETECTADA</div>}
        {telemetry.hands.map((hand) => (
          <div key={hand.handedness} className="hud-hand-block">
            <div className="hud-row">
              <span>{hand.handedness === 'Left' ? 'MÃO ESQUERDA' : 'MÃO DIREITA'}</span>
              <span>{(hand.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="hud-gesture">{GESTURE_LABELS[hand.gesture]}</div>
          </div>
        ))}
        {telemetry.bothHandsRaised && <div className="hud-alert">RENDIÇÃO DETECTADA</div>}
      </section>

      <footer className="hud-footer">
        BLACK VEIL ONLINE · TACTICAL TRACKING ACTIVE · TODAS AS INFORMAÇÕES BIOMÉTRICAS SÃO SIMULADAS · NENHUM DADO
        É ARMAZENADO
      </footer>
    </div>
  );
}
