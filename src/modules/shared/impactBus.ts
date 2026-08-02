export interface ImpactEvent {
  x: number;
  y: number;
  strength: number;
}

type ImpactListener = (event: ImpactEvent) => void;

const listeners = new Set<ImpactListener>();

/** Cross-module hit notification — e.g. Energy Pulse fires and Holographic Shield / Virtual Objects react if they're near (x, y) in canvas space. */
export function emitImpact(event: ImpactEvent): void {
  listeners.forEach((l) => l(event));
}

export function subscribeImpacts(fn: ImpactListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
