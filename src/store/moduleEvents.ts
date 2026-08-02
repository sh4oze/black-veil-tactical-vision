export type ModuleEventListener = (text: string) => void;

const listeners = new Set<ModuleEventListener>();

/** Lets a plain-object interaction module surface a one-off HUD log line (and optional voice readout) without needing a React prop path back to App. */
export function emitModuleEvent(text: string): void {
  listeners.forEach((l) => l(text));
}

export function subscribeModuleEvents(fn: ModuleEventListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
