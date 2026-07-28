import {
  COLS, ROWS, HIDDEN,
  LINE_SCORES, TSPIN_SCORES, TSPIN_MINI_SCORES, PERFECT_SCORES,
  LOCK_DELAY, MAX_LOCK_RESETS, CLEAR_TIME, DEATH_ROW_MS, DEATH_HOLD_MS,
} from './config.js';
import { ROTATIONS, KICKS, topRow } from './pieces.js';
import { theme } from './themes.js';
import { G, emptyGrid, saveStats } from './state.js';
import { collides, fillQueue, makePiece } from './board.js';
import { view, drawSidePanels } from './render.js';
import { Sound } from './audio.js';
import { showOverlay, hideOverlay, showToast, updateHud } from './ui.js';

// ---------- spawning ----------

// Settles a new piece into the top of the visible field so it never appears
// half-cut by the hidden buffer rows.
function enterPiece(piece) {
  if (collides(piece.m, piece.x, piece.y)) { gameOver(); return false; }
  const top = topRow(piece.m);
  while (piece.y + top < HIDDEN && !collides(piece.m, piece.x, piece.y + 1)) piece.y++;
  G.active = piece;
  G.rotatedLast = false;
  G.lastKick = 0;
  resetLockState();
  drawSidePanels();
  return true;
}

export function spawn() {
  fillQueue();
  const piece = makePiece(G.queue.shift());
  fillQueue();
  if (!enterPiece(piece)) return;
  G.canHold = true;
}

function resetLockState() {
  G.grounded = false;
  G.lockTimer = 0;
  G.lockResets = 0;
}

function gravityInterval() {
  const l = Math.min(G.level, 20);
  return Math.max(16, Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000);
}

function touchLock() {
  if (!G.grounded) return;
  if (G.lockResets < MAX_LOCK_RESETS) { G.lockTimer = 0; G.lockResets++; }
}

// ---------- actions ----------

export function move(dx) {
  const a = G.active;
  if (!a || collides(a.m, a.x + dx, a.y)) return false;
  a.x += dx;
  G.rotatedLast = false;
  touchLock();
  Sound.move();
  return true;
}

export function rotate(dir) {
  const a = G.active;
  if (!a || a.type === 'O') return false;

  const from = a.rot, to = (from + (dir > 0 ? 1 : 3)) % 4;
  const m = ROTATIONS[a.type][to];
  const table = (a.type === 'I' ? KICKS.I : KICKS.JLSTZ)[from + '>' + to];

  for (let i = 0; i < table.length; i++) {
    const [kx, ky] = table[i];
    if (!collides(m, a.x + kx, a.y + ky)) {
      a.rot = to; a.m = m;
      a.x += kx; a.y += ky;
      G.rotatedLast = true;
      G.lastKick = i;
      touchLock();
      Sound.rotate();
      return true;
    }
  }
  return false;
}

export function softDrop() {
  const a = G.active;
  if (!a || collides(a.m, a.x, a.y + 1)) return false;
  a.y++;
  G.score += 1;
  G.rotatedLast = false;
  G.gravityAcc = 0;
  resetLockState();
  updateHud();
  return true;
}

export function hardDrop() {
  const a = G.active;
  if (!a) return;
  let dist = 0;
  while (!collides(a.m, a.x, a.y + 1)) { a.y++; dist++; }
  G.score += dist * 2;
  if (dist > 0) G.rotatedLast = false; // a 0-cell drop must not cancel a T-spin
  G.shake = Math.min(9, 2.5 + dist * 0.35);
  Sound.drop();
  lockPiece();
}

export function holdPiece() {
  if (!G.active || !G.canHold) return;
  const swap = G.hold;
  G.hold = G.active.type;

  if (swap) {
    if (!enterPiece(makePiece(swap))) return;
  } else {
    spawn();
    if (G.state !== 'playing') return;
  }

  G.canHold = false; // must follow spawn(), which re-arms the hold
  drawSidePanels();
  Sound.holdSfx();
}

// ---------- locking & clearing ----------

export function tSpinType() {
  const a = G.active;
  if (a.type !== 'T' || !G.rotatedLast) return null;

  const cx = a.x + 1, cy = a.y + 1;
  const blocked = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && !!G.grid[y][x]);
  // TL, TR, BL, BR
  const corners = [blocked(cx - 1, cy - 1), blocked(cx + 1, cy - 1), blocked(cx - 1, cy + 1), blocked(cx + 1, cy + 1)];
  if (corners.filter(Boolean).length < 3) return null;

  const fronts = [[0, 1], [1, 3], [2, 3], [0, 2]][a.rot];
  if (fronts.every(i => corners[i])) return 'full';
  return G.lastKick === 4 ? 'full' : 'mini';
}

export function lockPiece() {
  const a = G.active;
  const spin = tSpinType();
  let anyVisible = false;

  for (let y = 0; y < a.m.length; y++) {
    for (let x = 0; x < a.m.length; x++) {
      if (!a.m[y][x]) continue;
      const gy = a.y + y, gx = a.x + x;
      if (gy >= 0) G.grid[gy][gx] = a.type;
      if (gy >= HIDDEN) anyVisible = true;
    }
  }

  const full = [];
  for (let y = 0; y < ROWS; y++) if (G.grid[y].every(Boolean)) full.push(y);

  if (!anyVisible && !full.length) { G.active = null; gameOver(); return; }

  if (full.length) {
    spawnClearParticles(full);
    G.pendingClear = { rows: full, spin };
    G.clearRows = full;
    G.clearTimer = CLEAR_TIME;
    G.state = 'clearing';
    G.active = null;
  } else {
    if (spin) applyScore(0, spin);
    else { G.combo = -1; Sound.lock(); }
    G.active = null;
    spawn();
  }
}

function finishClear() {
  const { rows, spin } = G.pendingClear;
  const kept = G.grid.filter((_, y) => !rows.includes(y));
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
  G.grid = kept;

  applyScore(rows.length, spin);
  G.pendingClear = null;
  G.clearRows = null;
  G.state = 'playing';
  spawn();
}

function applyScore(cleared, spin) {
  const prevLevel = G.level;
  let gain = 0, label = '', color = theme.accent;

  if (spin) {
    const table = spin === 'full' ? TSPIN_SCORES : TSPIN_MINI_SCORES;
    gain = table[cleared] * G.level;
    label = (spin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN') + ['', ' SINGLE', ' DOUBLE', ' TRIPLE'][cleared];
    color = theme.pieces.T;
  } else if (cleared) {
    gain = LINE_SCORES[cleared] * G.level;
    if (cleared === 4) { label = 'TETRIS'; color = theme.pieces.I; }
  }

  const difficult = cleared > 0 && (spin || cleared === 4);
  if (difficult) {
    if (G.backToBack) { gain = Math.round(gain * 1.5); label = 'B2B ' + label; }
    G.backToBack = true;
  } else if (cleared) {
    G.backToBack = false;
  }

  if (cleared) {
    G.combo++;
    if (G.combo > 0) {
      gain += 50 * G.combo * G.level;
      if (!label) label = G.combo + 1 + '× COMBO';
      else label += '  ' + (G.combo + 1) + '×';
    }
    G.stats.bestCombo = Math.max(G.stats.bestCombo, G.combo + 1);

    G.lines += cleared;
    G.level = Math.floor(G.lines / 10) + 1;

    if (G.grid.every(row => row.every(c => !c))) {
      gain += PERFECT_SCORES[cleared] * G.level;
      label = 'PERFECT CLEAR';
      color = '#ffffff';
      G.shake = Math.max(G.shake, 10);
    }
    if (cleared >= 4) G.shake = Math.max(G.shake, 8);

    if (spin) Sound.tspin(); else Sound.clear(cleared);
  } else {
    G.combo = -1;
    if (spin) { label = 'T-SPIN'; color = theme.pieces.T; Sound.tspin(); }
  }

  G.score += gain;
  if (G.level > prevLevel) { Sound.levelUp(); showToast('LEVEL ' + G.level, theme.pieces.S); }
  else if (label) showToast(label, color);

  updateHud();
}

function spawnClearParticles(rows) {
  const cell = view.cell;
  for (const y of rows) {
    for (let x = 0; x < COLS; x++) {
      const color = theme.pieces[G.grid[y][x]] || theme.accent;
      for (let i = 0; i < 3; i++) {
        G.particles.push({
          x: (x + Math.random()) * cell,
          y: (y - HIDDEN + Math.random()) * cell,
          vx: (Math.random() - 0.5) * 0.34,
          vy: (Math.random() - 0.85) * 0.22,
          life: 1, decay: 0.0016 + Math.random() * 0.0016,
          size: cell * (0.12 + Math.random() * 0.16),
          color,
        });
      }
    }
  }
  if (G.particles.length > 700) G.particles.splice(0, G.particles.length - 700);
}

// ---------- flow ----------

export function startGame() {
  G.grid = emptyGrid();
  G.queue = []; G.bag = null; G.hold = null; G.canHold = true;
  G.score = 0; G.lines = 0; G.level = 1; G.combo = -1; G.backToBack = false;
  G.gravityAcc = 0; G.particles = []; G.shake = 0;
  G.clearRows = null; G.pendingClear = null;
  G.deathRow = ROWS; G.deathTimer = 0;
  G.state = 'playing';

  hideOverlay();
  fillQueue();
  spawn();
  updateHud();
}

// Death is a two-beat sequence: a grey curtain sweeps up from the floor,
// then the summary appears.
export function gameOver() {
  if (G.state === 'dying' || G.state === 'over') return;
  G.state = 'dying';
  G.active = null;
  G.deathRow = ROWS;
  G.deathTimer = 0;
}

function finishGameOver() {
  G.state = 'over';
  Sound.over();
  G.stats.best = Math.max(G.stats.best, G.score);
  G.stats.bestLines = Math.max(G.stats.bestLines, G.lines);
  saveStats();

  showOverlay(`
    <h2>GAME OVER</h2>
    <div>
      <p>SCORE</p>
      <div class="big">${G.score.toLocaleString()}</div>
    </div>
    <p>LINES ${G.lines} &nbsp;·&nbsp; LEVEL ${G.level}<br>BEST ${G.stats.best.toLocaleString()}</p>
    <p class="cta">TAP TO PLAY AGAIN</p>
  `);
}

export function togglePause() {
  if (G.state === 'playing' || G.state === 'clearing') {
    G.state = G.state === 'clearing' ? 'pausedClearing' : 'paused';
    showOverlay('<h2>PAUSED</h2><p class="cta">TAP TO RESUME</p>');
  } else if (G.state === 'paused' || G.state === 'pausedClearing') {
    G.state = G.state === 'pausedClearing' ? 'clearing' : 'playing';
    hideOverlay();
  }
}

export function showMenu() {
  G.state = 'menu';
  showOverlay(`
    <h1>BLOCKFALL</h1>
    <p>DRAG to move &nbsp;·&nbsp; TAP to rotate<br>
       FLICK DOWN to drop &nbsp;·&nbsp; SWIPE UP to hold<br>
       TWO-FINGER TAP to rotate back</p>
    ${G.stats.best ? `<p>BEST ${G.stats.best.toLocaleString()}</p>` : ''}
    <p class="cta">TAP TO PLAY</p>
  `);
}

// ---------- per-frame ----------

export function update(dt) {
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 0.03);

  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 0.0011 * dt;
    p.life -= p.decay * dt;
    if (p.life <= 0) G.particles.splice(i, 1);
  }

  if (G.state === 'dying') {
    G.deathTimer += dt;
    while (G.deathRow > HIDDEN && G.deathTimer >= DEATH_ROW_MS) {
      G.deathTimer -= DEATH_ROW_MS;
      G.deathRow--;
      Sound.curtain(ROWS - 1 - G.deathRow);
    }
    if (G.deathRow <= HIDDEN && G.deathTimer >= DEATH_HOLD_MS) finishGameOver();
    return;
  }

  if (G.state === 'clearing') {
    G.clearTimer -= dt;
    if (G.clearTimer <= 0) finishClear();
    return;
  }

  if (G.state !== 'playing' || !G.active) return;

  const a = G.active;
  G.gravityAcc += dt;
  const interval = gravityInterval();
  while (G.gravityAcc >= interval) {
    G.gravityAcc -= interval;
    if (!collides(a.m, a.x, a.y + 1)) {
      a.y++;
      G.rotatedLast = false;
      G.grounded = false;
      G.lockResets = 0;
    } else break;
  }

  if (collides(a.m, a.x, a.y + 1)) {
    if (!G.grounded) { G.grounded = true; G.lockTimer = 0; }
    G.lockTimer += dt;
    if (G.lockTimer >= LOCK_DELAY) lockPiece();
  } else {
    G.grounded = false;
    G.lockTimer = 0;
  }
}
