const STORE = 'blockfall.haptics';

const CLEAR_PATTERNS = {
  1: [14],
  2: [12, 40, 14],
  3: [12, 35, 12, 35, 18],
  4: [16, 30, 16, 30, 16, 30, 34],
};

export const Haptics = {
  supported: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  enabled: (() => {
    try { return localStorage.getItem(STORE) !== '0'; } catch { return true; }
  })(),

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem(STORE, on ? '1' : '0'); } catch {}
  },

  buzz(pattern) {
    if (!this.enabled || !this.supported) return;
    try { navigator.vibrate(pattern); } catch {}
  },

  lock()    { this.buzz(8); },
  hold()    { this.buzz(8); },
  drop()    { this.buzz(12); },
  clear(n)  { this.buzz(CLEAR_PATTERNS[n] || CLEAR_PATTERNS[1]); },
  tspin()   { this.buzz([12, 30, 18]); },
  levelUp() { this.buzz([10, 50, 10, 50, 20]); },
  record()  { this.buzz([16, 60, 16, 60, 34]); },
  over()    { this.buzz([40, 90, 40, 90, 120]); },
};

export { CLEAR_PATTERNS as HAPTIC_CLEAR_PATTERNS };
