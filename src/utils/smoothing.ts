import type { Point2D, Point3D } from '../types/tracking';

/** Exponential moving average for a single scalar. Higher alpha = more responsive, less smoothing. */
export class SmoothedValue {
  private value: number | null = null;

  constructor(private alpha = 0.4) {}

  update(target: number): number {
    this.value = this.value === null ? target : this.value + this.alpha * (target - this.value);
    return this.value;
  }

  peek(): number | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/** Exponential moving average for a 2D point. */
export class SmoothedPoint {
  private x: SmoothedValue;
  private y: SmoothedValue;

  constructor(alpha = 0.4) {
    this.x = new SmoothedValue(alpha);
    this.y = new SmoothedValue(alpha);
  }

  update(p: Point2D): Point2D {
    return { x: this.x.update(p.x), y: this.y.update(p.y) };
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
  }
}

/** Smooths an entire landmark array (e.g. 21 hand points or 478 face points) point by point. */
export class SmoothedLandmarks {
  private xs: SmoothedValue[] = [];
  private ys: SmoothedValue[] = [];
  private zs: SmoothedValue[] = [];
  private lastOutput: Point3D[] | null = null;

  constructor(private alpha = 0.45) {}

  update(landmarks: Point3D[]): Point3D[] {
    if (this.xs.length !== landmarks.length) {
      this.xs = landmarks.map(() => new SmoothedValue(this.alpha));
      this.ys = landmarks.map(() => new SmoothedValue(this.alpha));
      this.zs = landmarks.map(() => new SmoothedValue(this.alpha));
    }
    const out = landmarks.map((lm, i) => ({
      x: this.xs[i].update(lm.x),
      y: this.ys[i].update(lm.y),
      z: this.zs[i].update(lm.z ?? 0),
    }));
    this.lastOutput = out;
    return out;
  }

  /** Returns the last computed output without advancing the filter — used to freeze a pose while it fades out. */
  peek(): Point3D[] | null {
    return this.lastOutput;
  }

  reset(): void {
    this.xs = [];
    this.ys = [];
    this.zs = [];
    this.lastOutput = null;
  }
}
