export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  alpha: number;
  active: boolean;
  /** Free-form per-particle data modules can reuse (e.g. trail points, spin) without subclassing. */
  data: number;
}

function makeParticle(): Particle {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, hue: 140, alpha: 1, active: false, data: 0 };
}

/**
 * Fixed-capacity object pool — spawning never allocates once warmed up, keeping GC
 * pressure flat regardless of how many particles are cycled through per second.
 * Used by Energy Orb, Particle Field, Energy Pulse and Air Portal.
 */
export class ParticlePool {
  private pool: Particle[];

  constructor(public capacity: number) {
    this.pool = Array.from({ length: capacity }, makeParticle);
  }

  spawn(init: Partial<Particle>): Particle | null {
    for (const p of this.pool) {
      if (!p.active) {
        p.x = init.x ?? 0;
        p.y = init.y ?? 0;
        p.vx = init.vx ?? 0;
        p.vy = init.vy ?? 0;
        p.life = 0;
        p.maxLife = init.maxLife ?? 1;
        p.size = init.size ?? 2;
        p.hue = init.hue ?? 140;
        p.alpha = init.alpha ?? 1;
        p.data = init.data ?? 0;
        p.active = true;
        return p;
      }
    }
    return null;
  }

  update(dt: number, step: (p: Particle, dt: number) => void): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      step(p, dt);
    }
  }

  forEachActive(fn: (p: Particle) => void): void {
    for (const p of this.pool) if (p.active) fn(p);
  }

  countActive(): number {
    let c = 0;
    for (const p of this.pool) if (p.active) c += 1;
    return c;
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }

  resize(capacity: number): void {
    if (capacity === this.pool.length) return;
    if (capacity < this.pool.length) {
      this.pool.length = capacity;
      return;
    }
    while (this.pool.length < capacity) this.pool.push(makeParticle());
    this.capacity = capacity;
  }
}
