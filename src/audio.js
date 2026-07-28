// Sound effects synthesised through WebAudio — no audio files, so nothing to
// load or cache. The context can only be created inside a user gesture, which
// is why init() is called from input handlers rather than at startup.

export const Sound = {
  ctx: null,
  muted: localStorage.getItem('blockfall.muted') === '1',

  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  tone(freq, dur, type = 'square', gain = 0.05, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator(), amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(t); osc.stop(t + dur);
  },

  arp(freqs, step = 0.055, type = 'square', gain = 0.05) {
    freqs.forEach((f, i) => this.tone(f, 0.11, type, gain, i * step));
  },

  move()    { this.tone(180, 0.03, 'square', 0.028); },
  rotate()  { this.tone(340, 0.04, 'square', 0.032); },
  lock()    { this.tone(110, 0.07, 'triangle', 0.05); },
  holdSfx() { this.tone(500, 0.06, 'sine', 0.045); },
  drop()    { this.tone(76, 0.10, 'sawtooth', 0.045); },
  // Rises in length, pitch and volume with the clear; a Tetris also lands a
  // low hit underneath so it has weight the smaller clears don't.
  clear(n) {
    const runs = {
      1: [523, 659],
      2: [523, 659, 784],
      3: [523, 659, 784, 1047],
      4: [523, 659, 784, 1047, 1319],
    };
    this.arp(runs[n] || runs[1], n >= 4 ? 0.045 : 0.055, 'square', 0.04 + n * 0.006);
    if (n >= 4) this.tone(62, 0.34, 'sine', 0.09);
  },
  combo(n)  { this.tone(Math.min(1400, 340 + n * 70), 0.07, 'triangle', 0.04); },
  tspin()   { this.arp([392, 587, 880, 1175], 0.05, 'sine', 0.06); },
  levelUp() { this.arp([523, 784, 1047], 0.07, 'triangle', 0.05); },
  curtain(i){ this.tone(Math.max(90, 300 - i * 9), 0.05, 'square', 0.022); },
  record()  { this.arp([523, 659, 784, 1047, 1319, 1568], 0.06, 'triangle', 0.055); this.tone(84, 0.45, 'sine', 0.07); },
  over()    { this.arp([392, 330, 262, 196], 0.11, 'sawtooth', 0.055); },
};
