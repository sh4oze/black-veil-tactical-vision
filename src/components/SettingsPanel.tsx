import { interactionStore, useInteractionState } from '../store/interactionStore';
import { setVoiceFeedbackEnabled } from '../services/voiceFeedback';
import ModuleToggleList from './ModuleToggleList';
import type { InteractionOptions } from '../store/interactionStore';
import type { QualitySetting } from '../types/modules';

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
}

const QUALITY_OPTIONS: { id: QualitySetting; label: string }[] = [
  { id: 'low', label: 'LOW' },
  { id: 'medium', label: 'MEDIUM' },
  { id: 'high', label: 'HIGH' },
  { id: 'ultra', label: 'ULTRA' },
  { id: 'auto', label: 'AUTOMATIC' },
];

function OptionSwitch({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button className={`option-switch ${active ? 'is-active' : ''}`} onClick={onToggle} aria-pressed={active}>
      <span>{label}</span>
      <span className="option-switch-state">{active ? 'ON' : 'OFF'}</span>
    </button>
  );
}

function OptionSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="option-slider">
      <div className="option-slider-row">
        <span>{label}</span>
        <span>{format(value)}</span>
      </div>
      <input
        type="range"
        className="tactical-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export default function SettingsPanel({ visible, onClose }: SettingsPanelProps) {
  const state = useInteractionState();
  if (!visible) return null;

  const setOption = <K extends keyof InteractionOptions>(key: K, value: InteractionOptions[K]) => {
    interactionStore.setOption(key, value);
    if (key === 'voiceFeedback') setVoiceFeedbackEnabled(value as boolean);
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <span>CONFIGURAÇÕES DO SISTEMA</span>
        <button className="panel-close-btn" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>

      <div className="settings-panel-body">
        <section className="settings-section">
          <div className="settings-section-title">TRACKING</div>
          <OptionSwitch label="Face Tracking" active={state.options.faceTracking} onToggle={() => setOption('faceTracking', !state.options.faceTracking)} />
          <OptionSwitch label="Hand Tracking" active={state.options.handTracking} onToggle={() => setOption('handTracking', !state.options.handTracking)} />
          <OptionSwitch label="Target Reticle" active={state.options.targetReticle} onToggle={() => setOption('targetReticle', !state.options.targetReticle)} />
          <OptionSwitch label="Auto-Fire on Lock" active={state.options.autoFire} onToggle={() => setOption('autoFire', !state.options.autoFire)} />
          <OptionSwitch label="Hand Skeleton" active={state.options.handSkeleton} onToggle={() => setOption('handSkeleton', !state.options.handSkeleton)} />
          <OptionSwitch label="Gesture Recognition" active={state.options.gestureRecognition} onToggle={() => setOption('gestureRecognition', !state.options.gestureRecognition)} />
        </section>

        <section className="settings-section">
          <div className="settings-section-title">INTERACTIONS</div>
          <ModuleToggleList />
        </section>

        <section className="settings-section">
          <div className="settings-section-title">VISUAL QUALITY</div>
          <div className="quality-row">
            {QUALITY_OPTIONS.map((q) => (
              <button
                key={q.id}
                className={`btn-tactical btn-toggle ${state.quality === q.id ? 'is-active' : ''}`}
                onClick={() => interactionStore.setQuality(q.id)}
                aria-pressed={state.quality === q.id}
              >
                {q.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">OPTIONS</div>
          <OptionSwitch
            label="Allow Multiple Modules"
            active={state.allowMultiple}
            onToggle={() => interactionStore.setAllowMultiple(!state.allowMultiple)}
          />
          <OptionSwitch label="Sound Effects" active={state.options.soundEffects} onToggle={() => setOption('soundEffects', !state.options.soundEffects)} />
          <OptionSwitch label="Voice Feedback" active={state.options.voiceFeedback} onToggle={() => setOption('voiceFeedback', !state.options.voiceFeedback)} />
          <OptionSwitch
            label="Show Debug Landmarks"
            active={state.options.showDebugLandmarks}
            onToggle={() => setOption('showDebugLandmarks', !state.options.showDebugLandmarks)}
          />
          <OptionSwitch label="Show FPS" active={state.options.showFps} onToggle={() => setOption('showFps', !state.options.showFps)} />

          <OptionSlider
            label="Gesture Sensitivity"
            value={state.options.gestureSensitivity}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setOption('gestureSensitivity', v)}
          />
          <OptionSlider
            label="Gesture Confirmation Time"
            value={state.options.gestureConfirmationMs}
            min={100}
            max={1000}
            step={50}
            format={(v) => `${v}ms`}
            onChange={(v) => setOption('gestureConfirmationMs', v)}
          />
          <OptionSlider
            label="Tracking Smoothing"
            value={state.options.trackingSmoothing}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setOption('trackingSmoothing', v)}
          />

          <button className="btn-tactical btn-toggle is-danger-outline" onClick={() => interactionStore.resetModules()}>
            RESET MODULES
          </button>
        </section>
      </div>
    </div>
  );
}
