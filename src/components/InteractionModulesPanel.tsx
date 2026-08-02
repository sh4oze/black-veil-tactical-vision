import { MODULE_IDS } from '../types/modules';
import { interactionStore, useInteractionState } from '../store/interactionStore';
import ModuleToggleList from './ModuleToggleList';

interface InteractionModulesPanelProps {
  visible: boolean;
  onClose: () => void;
}

export default function InteractionModulesPanel({ visible, onClose }: InteractionModulesPanelProps) {
  const state = useInteractionState();
  if (!visible) return null;

  const activeCount = MODULE_IDS.filter((id) => state.modules[id]).length;

  return (
    <div className="modules-panel">
      <div className="modules-panel-header">
        <span>INTERACTION MODULES</span>
        <button className="panel-close-btn" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>

      <div className="modules-panel-hint">
        {activeCount === 0
          ? 'NENHUM MÓDULO ATIVO'
          : `${activeCount} MÓDULO${activeCount > 1 ? 'S' : ''} ATIVO${activeCount > 1 ? 'S' : ''}`}
      </div>

      <ModuleToggleList />

      <div className="modules-panel-footer">
        <button
          className={`btn-tactical btn-toggle ${state.allowMultiple ? 'is-active' : ''}`}
          onClick={() => interactionStore.setAllowMultiple(!state.allowMultiple)}
          aria-pressed={state.allowMultiple}
        >
          ALLOW MULTIPLE MODULES
        </button>
        <button className="btn-tactical btn-toggle" onClick={() => interactionStore.resetModules()}>
          RESET MODULES
        </button>
      </div>
    </div>
  );
}
