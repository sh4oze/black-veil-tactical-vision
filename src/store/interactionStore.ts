import { useSyncExternalStore } from 'react';
import { MODULE_IDS } from '../types/modules';
import type { ModuleId, QualitySetting } from '../types/modules';

export interface InteractionOptions {
  faceTracking: boolean;
  handTracking: boolean;
  targetReticle: boolean;
  handSkeleton: boolean;
  gestureRecognition: boolean;
  soundEffects: boolean;
  voiceFeedback: boolean;
  showDebugLandmarks: boolean;
  showFps: boolean;
  /** 0..1 — higher means gestures trigger more easily (looser thresholds). */
  gestureSensitivity: number;
  /** ms a gesture must be held before a module confirms it. */
  gestureConfirmationMs: number;
  /** 0..1 — higher means heavier smoothing (less jitter, more lag). */
  trackingSmoothing: number;
}

export interface InteractionState {
  modules: Record<ModuleId, boolean>;
  allowMultiple: boolean;
  quality: QualitySetting;
  options: InteractionOptions;
}

const STORAGE_KEY = 'blackveil.preferences.v1';

function defaultModules(): Record<ModuleId, boolean> {
  const modules = {} as Record<ModuleId, boolean>;
  for (const id of MODULE_IDS) modules[id] = false;
  return modules;
}

const DEFAULT_OPTIONS: InteractionOptions = {
  faceTracking: true,
  handTracking: true,
  targetReticle: true,
  handSkeleton: true,
  gestureRecognition: true,
  soundEffects: false,
  voiceFeedback: false,
  showDebugLandmarks: false,
  showFps: true,
  gestureSensitivity: 0.5,
  gestureConfirmationMs: 350,
  trackingSmoothing: 0.5,
};

function defaultState(): InteractionState {
  return {
    modules: defaultModules(),
    allowMultiple: false,
    quality: 'auto',
    options: { ...DEFAULT_OPTIONS },
  };
}

interface PersistedShape {
  allowMultiple?: boolean;
  quality?: QualitySetting;
  options?: Partial<InteractionOptions>;
}

function loadPersisted(): PersistedShape {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedShape;
  } catch {
    return {};
  }
}

type Listener = () => void;
type LifecycleCallback = (id: ModuleId, enabled: boolean) => void;

/**
 * Plain external store (no Redux) so interaction modules — which are not React
 * components — can read/write shared UI state directly. React components subscribe
 * via `useInteractionState()`. Only preferences are persisted to localStorage; per
 * the app's privacy rules, module on/off state always resets to "off" on reload and
 * no tracking data ever touches this store.
 */
class InteractionStore {
  private state: InteractionState;
  private listeners = new Set<Listener>();
  private activationOrder: ModuleId[] = [];
  private lifecycleCallback: LifecycleCallback | null = null;

  constructor() {
    const persisted = loadPersisted();
    const base = defaultState();
    this.state = {
      ...base,
      allowMultiple: persisted.allowMultiple ?? base.allowMultiple,
      quality: persisted.quality ?? base.quality,
      options: { ...base.options, ...(persisted.options ?? {}) },
    };
  }

  getState = (): InteractionState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The orchestrator hook registers this once to actually call activate()/deactivate() on module instances. */
  bindModuleLifecycle(cb: LifecycleCallback): void {
    this.lifecycleCallback = cb;
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  private persist(): void {
    if (typeof window === 'undefined') return;
    try {
      const payload: PersistedShape = {
        allowMultiple: this.state.allowMultiple,
        quality: this.state.quality,
        options: this.state.options,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* storage unavailable (private mode / quota) — preferences simply won't persist */
    }
  }

  setModuleEnabled(id: ModuleId, enabled: boolean): void {
    if (this.state.modules[id] === enabled) return;
    const modules = { ...this.state.modules };

    if (enabled && !this.state.allowMultiple) {
      for (const otherId of MODULE_IDS) {
        if (otherId !== id && modules[otherId]) {
          modules[otherId] = false;
          this.lifecycleCallback?.(otherId, false);
          this.activationOrder = this.activationOrder.filter((m) => m !== otherId);
        }
      }
    }

    modules[id] = enabled;
    this.state = { ...this.state, modules };
    this.lifecycleCallback?.(id, enabled);
    this.activationOrder = this.activationOrder.filter((m) => m !== id);
    if (enabled) this.activationOrder.push(id);

    this.emit();
  }

  toggleModule(id: ModuleId): void {
    this.setModuleEnabled(id, !this.state.modules[id]);
  }

  setAllowMultiple(value: boolean): void {
    if (this.state.allowMultiple === value) return;
    this.state = { ...this.state, allowMultiple: value };
    if (!value) {
      const active = MODULE_IDS.filter((id) => this.state.modules[id]);
      if (active.length > 1) {
        const keep = this.activationOrder[this.activationOrder.length - 1] ?? active[active.length - 1];
        for (const id of active) {
          if (id !== keep) this.setModuleEnabled(id, false);
        }
      }
    }
    this.persist();
    this.emit();
  }

  setQuality(quality: QualitySetting): void {
    if (this.state.quality === quality) return;
    this.state = { ...this.state, quality };
    this.persist();
    this.emit();
  }

  setOption<K extends keyof InteractionOptions>(key: K, value: InteractionOptions[K]): void {
    if (this.state.options[key] === value) return;
    this.state = { ...this.state, options: { ...this.state.options, [key]: value } };
    this.persist();
    this.emit();
  }

  resetModules(): void {
    for (const id of MODULE_IDS) {
      if (this.state.modules[id]) this.setModuleEnabled(id, false);
    }
  }
}

export const interactionStore = new InteractionStore();

export function useInteractionState(): InteractionState {
  return useSyncExternalStore(interactionStore.subscribe, interactionStore.getState, interactionStore.getState);
}
