import { COLS, ROWS } from './config.js';
import { TYPES, ROTATIONS } from './pieces.js';
import { G } from './state.js';

export function refillBag() {
  G.bag = [...TYPES];
  for (let i = G.bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [G.bag[i], G.bag[j]] = [G.bag[j], G.bag[i]];
  }
}

export function nextType() {
  if (!G.bag || !G.bag.length) refillBag();
  return G.bag.pop();
}

export function fillQueue() {
  while (G.queue.length < 5) G.queue.push(nextType());
}

export function makePiece(type) {
  return { type, rot: 0, x: type === 'O' ? 4 : 3, y: 0, m: ROTATIONS[type][0] };
}

export function collides(m, px, py) {
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m.length; x++) {
      if (!m[y][x]) continue;
      const gx = px + x, gy = py + y;
      if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
      if (gy >= 0 && G.grid[gy][gx]) return true;
    }
  }
  return false;
}
