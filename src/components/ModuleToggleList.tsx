import { MODULE_IDS, MODULE_LABELS } from '../types/modules';
import { interactionStore, useInteractionState } from '../store/interactionStore';

/** Shared list of the 10 module toggle rows — used by both the compact quick panel and the full settings panel. */
export default function ModuleToggleList() {
  const state = useInteractionState();

  return (
    <div className="modules-list">
      {MODULE_IDS.map((id) => {
        const active = state.modules[id];
        return (
          <button
            key={id}
            className={`module-row ${active ? 'is-active' : ''}`}
            onClick={() => interactionStore.toggleModule(id)}
            aria-pressed={active}
          >
            <span className="module-row-dot" />
            <span className="module-row-label">{MODULE_LABELS[id]}</span>
            <span className="module-row-state">{active ? 'ON' : 'OFF'}</span>
          </button>
        );
      })}
    </div>
  );
}
