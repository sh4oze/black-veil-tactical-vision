export type GestureLifecycleState = 'IDLE' | 'DETECTING' | 'ACTIVE' | 'RELEASING' | 'COOLDOWN';

/**
 * Generic gesture stability state machine used by interaction modules to turn a raw
 * per-frame boolean condition (e.g. "both palms open and facing each other") into a
 * deliberate, debounced action. IDLE -> DETECTING requires the condition to hold for
 * `confirmMs` before becoming ACTIVE; losing the condition goes through a short
 * RELEASING grace period (absorbs single-frame tracking dropouts) before COOLDOWN,
 * which blocks immediate re-triggering.
 *
 * Not a React hook itself (modules are plain objects, not components) — this module
 * exports the state machine class modules instantiate directly.
 */
export class GestureStateMachine {
  state: GestureLifecycleState = 'IDLE';
  private stateSince = 0;
  private lastNow = 0;

  constructor(
    private confirmMs = 350,
    private releaseMs = 150,
    private cooldownMs = 400,
  ) {}

  /** 0..1 progress through the DETECTING hold — usable to render a "confirming" ring. */
  get progress(): number {
    if (this.state === 'IDLE' || this.state === 'COOLDOWN') return 0;
    if (this.state !== 'DETECTING') return 1;
    return Math.min(1, (this.lastNow - this.stateSince) / Math.max(1, this.confirmMs));
  }

  get isActive(): boolean {
    return this.state === 'ACTIVE' || this.state === 'RELEASING';
  }

  get timeInState(): number {
    return this.lastNow - this.stateSince;
  }

  setTimings(confirmMs: number, releaseMs = this.releaseMs, cooldownMs = this.cooldownMs): void {
    this.confirmMs = confirmMs;
    this.releaseMs = releaseMs;
    this.cooldownMs = cooldownMs;
  }

  update(conditionMet: boolean, now: number): GestureLifecycleState {
    this.lastNow = now;
    const elapsed = now - this.stateSince;
    switch (this.state) {
      case 'IDLE':
        if (conditionMet) this.transition('DETECTING', now);
        break;
      case 'DETECTING':
        if (!conditionMet) this.transition('IDLE', now);
        else if (elapsed >= this.confirmMs) this.transition('ACTIVE', now);
        break;
      case 'ACTIVE':
        if (!conditionMet) this.transition('RELEASING', now);
        break;
      case 'RELEASING':
        if (conditionMet) this.transition('ACTIVE', now);
        else if (elapsed >= this.releaseMs) this.transition('COOLDOWN', now);
        break;
      case 'COOLDOWN':
        if (elapsed >= this.cooldownMs) this.transition('IDLE', now);
        break;
    }
    return this.state;
  }

  /** Forces an immediate cooldown — used when a module needs to cancel an in-progress gesture. */
  cancel(now: number): void {
    this.transition('COOLDOWN', now);
  }

  reset(): void {
    this.state = 'IDLE';
    this.stateSince = 0;
    this.lastNow = 0;
  }

  private transition(next: GestureLifecycleState, now: number): void {
    this.state = next;
    this.stateSince = now;
  }
}
