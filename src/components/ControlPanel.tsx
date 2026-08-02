interface ControlPanelProps {
  cameraOn: boolean;
  soundOn: boolean;
  hudVisible: boolean;
  skeletonVisible: boolean;
  reticleVisible: boolean;
  isFullscreen: boolean;
  canSwitchFacing: boolean;
  onToggleCamera: () => void;
  onToggleSound: () => void;
  onToggleHud: () => void;
  onToggleSkeleton: () => void;
  onToggleReticle: () => void;
  onToggleFullscreen: () => void;
  onSwitchFacing: () => void;
}

function ToggleButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`btn-tactical btn-toggle ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

export default function ControlPanel({
  cameraOn,
  soundOn,
  hudVisible,
  skeletonVisible,
  reticleVisible,
  isFullscreen,
  canSwitchFacing,
  onToggleCamera,
  onToggleSound,
  onToggleHud,
  onToggleSkeleton,
  onToggleReticle,
  onToggleFullscreen,
  onSwitchFacing,
}: ControlPanelProps) {
  return (
    <div className="control-panel">
      <button
        className={`btn-tactical btn-toggle ${cameraOn ? 'is-active is-danger' : ''}`}
        onClick={onToggleCamera}
        aria-pressed={cameraOn}
      >
        {cameraOn ? 'DESLIGAR CÂMERA' : 'LIGAR CÂMERA'}
      </button>
      <ToggleButton active={soundOn} label={soundOn ? 'SOM: ON' : 'SOM: OFF'} onClick={onToggleSound} />
      <ToggleButton active={hudVisible} label="HUD" onClick={onToggleHud} />
      <ToggleButton active={reticleVisible} label="MIRA" onClick={onToggleReticle} />
      <ToggleButton active={skeletonVisible} label="ESQUELETO" onClick={onToggleSkeleton} />
      <button className="btn-tactical btn-toggle" onClick={onToggleFullscreen}>
        {isFullscreen ? 'SAIR TELA CHEIA' : 'TELA CHEIA'}
      </button>
      {canSwitchFacing && (
        <button className="btn-tactical btn-toggle" onClick={onSwitchFacing}>
          ALTERNAR CÂMERA
        </button>
      )}
    </div>
  );
}
