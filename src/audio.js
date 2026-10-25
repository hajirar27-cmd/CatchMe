// Tiny synthesized SFX so the prototype needs no audio assets.
export class Sfx {
  constructor() {
    this.ctx = null;
  }

  unlock() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      this.ctx = null;
    }
  }

  tone(f0, f1, dur, type = 'sine', vol = 0.12, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  throwNet() { this.tone(700, 220, 0.14, 'triangle', 0.08); }
  miss() { this.tone(220, 110, 0.22, 'sawtooth', 0.09); }
  poof() { this.tone(420, 70, 0.35, 'triangle', 0.08); }
  flush() { this.tone(180, 900, 0.18, 'sawtooth', 0.06); }
  caught() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.18, 'square', 0.07, i * 0.07)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.98, 0.28, 'triangle', 0.1, i * 0.14)); }
}
