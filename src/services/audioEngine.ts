export type SoundName =
  | 'startup'
  | 'face_detected'
  | 'lock'
  | 'hand_detected'
  | 'gesture_confirmed'
  | 'target_lost'
  | 'alert';

/**
 * Minimal procedural sound engine built on the Web Audio API — no external audio
 * files, nothing fetched, nothing stored. Sound starts disabled; `setEnabled(true)`
 * must be called synchronously from a user-gesture event handler (a click) so the
 * browser's autoplay policy allows the AudioContext to start.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = false;

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) this.ctx = new Ctx();
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private tone(freq: number, duration: number, type: OscillatorType, peakGain: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  play(name: SoundName): void {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'startup':
        this.tone(220, 0.25, 'sawtooth', 0.05);
        this.tone(440, 0.3, 'sine', 0.04, 0.15);
        break;
      case 'face_detected':
        this.tone(880, 0.08, 'square', 0.035);
        break;
      case 'lock':
        this.tone(1200, 0.05, 'square', 0.05);
        this.tone(1650, 0.08, 'square', 0.045, 0.06);
        break;
      case 'hand_detected':
        this.tone(660, 0.07, 'triangle', 0.035);
        break;
      case 'gesture_confirmed':
        this.tone(900, 0.06, 'square', 0.045);
        this.tone(1250, 0.09, 'square', 0.045, 0.08);
        break;
      case 'target_lost':
        this.tone(500, 0.15, 'sawtooth', 0.04);
        this.tone(280, 0.25, 'sawtooth', 0.03, 0.1);
        break;
      case 'alert':
        this.tone(1000, 0.09, 'square', 0.06);
        this.tone(1000, 0.09, 'square', 0.06, 0.16);
        break;
    }
  }
}

export const audioEngine = new AudioEngine();
