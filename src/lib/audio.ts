/** Tiny WebAudio synth — no audio files, no network, instant on stage. */
class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    this.ensure();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  hit(combo: number) {
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    const semi = steps[Math.min(steps.length - 1, combo)];
    this.tone(392 * Math.pow(2, semi / 12), 0.14, 'triangle', 0.1);
    this.tone(784 * Math.pow(2, semi / 12), 0.08, 'sine', 0.05);
  }

  miss() {
    this.tone(150, 0.24, 'sawtooth', 0.055, 70);
  }

  tick() {
    this.tone(880, 0.05, 'square', 0.035);
  }

  go() {
    this.tone(660, 0.1, 'square', 0.06);
    setTimeout(() => this.tone(990, 0.18, 'square', 0.06), 90);
  }

  finish() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.07), i * 95));
  }

  bust() {
    [392, 523, 659, 880, 1174].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'square', 0.05), i * 70));
  }

  /** soft entry tone — a new pose begins */
  soft() {
    this.tone(392, 0.5, 'sine', 0.05, 294);
  }

  /** completion chime, warm and slow */
  chime() {
    [523.25, 659.25, 783.99].forEach((f, i) => setTimeout(() => this.tone(f, 0.8, 'sine', 0.055), i * 110));
  }
}

export const sfx = new Sfx();
