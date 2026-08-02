import { MODULE_LABELS } from '../../types/modules';
import type { InteractionModule, ModuleId, TrackingContext } from '../../types/modules';

/** Placeholder used for modules not yet implemented in the current build phase — toggles cleanly, does nothing. */
export function createStubModule(id: ModuleId): InteractionModule {
  return {
    id,
    label: MODULE_LABELS[id],
    enabled: false,
    activate() {
      this.enabled = true;
    },
    update(_context: TrackingContext) {
      /* not yet implemented */
    },
    render(_ctx: CanvasRenderingContext2D, _context: TrackingContext) {
      /* not yet implemented */
    },
    reset() {
      /* no state to clear yet */
    },
    deactivate() {
      this.enabled = false;
    },
  };
}
