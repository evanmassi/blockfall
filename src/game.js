// The rules: spawning, movement, locking, clearing, scoring and the state
// machine behind the menu, pause, death and game-over screens. The only module
// that writes G, apart from input.js's gesture bookkeeping.

import {
  COLS, ROWS, HIDDEN,
  LINE_SCORES, TSPIN_SCORES, TSPIN_MINI_SCORES, PERFECT_SCORES,
  LOCK_DELAY, MAX_LOCK_RESETS, CLEAR_FX, DEATH_ROW_MS, DEATH_HOLD_MS,
  FRAME_MS, GRAVITY_FRAMES, GRAVITY_MIN_FRAMES,
  ZEN_SPEED_CAP_LEVEL, ZEN_RESCUE_ROWS,
} from './config.js';
import { ROTATIONS, KICKS, topRow } from './pieces.js';
import { theme } from './themes.js';
import {
  G, emptyGrid, saveStats,
  saveRun, loadRun, clearRun, encodeGrid, decodeGrid,
  saveLastMode, loadLastMode,
} from './state.js';
import { collides, fillQueue, makePiece } from './board.js';
import { view, drawSidePanels, syncLevelPalette } from './render.js';
import { Sound } from './audio.js';
import { Haptics } from './haptics.js';
import {
  showOverlay, hideOverlay, showToast, updateHud, setRecordStyle,
  themeBar, wordmark, menuBackdrop, actionBar,
} from './ui.js';

// Single funnel for score changes so beating the record is caught the instant
// it happens, mid-run, rather than being noticed on the game-over screen.
function addScore(n) {
  G.score += n;
  if (!G.newBest && G.runBest > 0 && G.score > G.runBest) {
    G.newBest = true;
    setRecordStyle(true);
    showToast('NEW HIGH SCORE!', theme.accent);
    Sound.record();
    Haptics.record();
  }
  updateHud();
}

// ---------- spawning ----------

// Settles a new piece into the top of the visible field so it never appears
// half-cut by the hidden buffer rows.
function enterPiece(piece) {
  if (collides(piece.m, piece.x, piece.y)) {
    if (G.mode !== 'zen') { gameOver(); return false; }
    // Clearing the bottom rows shifts everything down, which frees the spawn.
    rescue();
    if (collides(piece.m, piece.x, piece.y)) { gameOver(); return false; }
  }
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
  snapshotRun(); // every new piece is a stable point to save at
}

function resetLockState() {
  G.grounded = false;
  G.lockTimer = 0;
  G.lockResets = 0;
}

/**
 * Milliseconds a piece takes to fall one row at the current level.
 *
 * The previous version clamped this at a 16ms floor, which the guideline curve
 * reached at level 14 — so every level from 14 upward ran at exactly the same
 * speed and progression silently stopped while the counter kept climbing.
 */
export function gravityInterval() {
  // Zen is endless, so it stops accelerating somewhere it stays comfortable.
  const level = G.mode === 'zen' ? Math.min(G.level, ZEN_SPEED_CAP_LEVEL) : G.level;
  const frames = GRAVITY_FRAMES[level - 1] ?? GRAVITY_MIN_FRAMES;
  return frames * FRAME_MS;
}

/**
 * Zen's answer to topping out: drop the bottom rows and let the stack fall into
 * the space. The board gets easier, the run continues, and nothing is lost.
 */
function rescue() {
  const rows = [];
  for (let y = ROWS - ZEN_RESCUE_ROWS; y < ROWS; y++) rows.push(y);
  spawnClearParticles(rows, CLEAR_FX[4]); // read the colours before dropping them

  const kept = G.grid.slice(0, ROWS - ZEN_RESCUE_ROWS);
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
  G.grid = kept;

  G.combo = -1;
  G.shake = Math.max(G.shake, 7);
  Sound.clear(4);
  Haptics.clear(4);
  showToast('BREATHE', theme.accent);
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

/**
 * Rotates the active piece, trying each SRS kick offset in turn.
 * @param {number} dir  positive clockwise, negative anticlockwise.
 * @returns {boolean} false if every kick was blocked, leaving the piece as-is.
 */
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
  G.rotatedLast = false;
  G.gravityAcc = 0;
  resetLockState();
  addScore(1);
  return true;
}

export function hardDrop() {
  const a = G.active;
  if (!a) return;
  let dist = 0;
  while (!collides(a.m, a.x, a.y + 1)) { a.y++; dist++; }
  addScore(dist * 2); // also refreshes the HUD, which a hard drop never did
  if (dist > 0) G.rotatedLast = false; // a 0-cell drop must not cancel a T-spin
  // Kept small on purpose: a long drop used to shake as hard as a Tetris,
  // which flattened the whole clear escalation.
  G.shake = Math.max(G.shake, Math.min(4, 1 + dist * 0.18));
  Sound.drop();
  Haptics.drop();
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
  Haptics.hold();
}

// ---------- locking & clearing ----------

/**
 * Classifies the active piece's position as a T-spin, by the three-corner rule.
 *
 * Must be called *before* the piece is written into the grid — it inspects the
 * cells diagonally around the T's centre, and once the piece has settled those
 * corners include the piece itself.
 *
 * @returns {'full'|'mini'|null}
 */
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

  // Locked entirely in the hidden buffer: a top-out everywhere but Zen.
  if (!anyVisible && !full.length) {
    G.active = null;
    if (G.mode === 'zen') { rescue(); spawn(); return; }
    gameOver();
    return;
  }

  if (full.length) {
    const fx = CLEAR_FX[Math.min(full.length, 4)];
    spawnClearParticles(full, fx);
    G.pendingClear = { rows: full, spin };
    G.clearRows = full;
    G.clearCount = full.length;
    G.clearTime = fx.time;
    G.clearTimer = fx.time;
    G.shake = Math.max(G.shake, fx.shake);
    G.state = 'clearing';
    G.active = null;
  } else {
    if (spin) applyScore(0, spin);
    else { G.combo = -1; Sound.lock(); Haptics.lock(); }
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
    label = ['', '', 'DOUBLE', 'TRIPLE', 'TETRIS'][cleared]; // a single stays quiet
    if (cleared === 4) color = theme.pieces.I;
    else if (cleared === 3) color = theme.accent;
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
    G.stats[G.mode].combo = Math.max(G.stats[G.mode].combo, G.combo + 1);

    G.lines += cleared;
    G.level = Math.floor(G.lines / 10) + 1;
    if (G.level !== prevLevel) syncLevelPalette();

    if (G.grid.every(row => row.every(c => !c))) {
      gain += PERFECT_SCORES[cleared] * G.level;
      label = 'PERFECT CLEAR';
      color = '#ffffff';
      G.shake = Math.max(G.shake, 12);
    }

    if (spin) { Sound.tspin(); Haptics.tspin(); } else { Sound.clear(cleared); Haptics.clear(cleared); }
    if (G.combo > 0) Sound.combo(G.combo);
  } else {
    G.combo = -1;
    if (spin) { label = 'T-SPIN'; color = theme.pieces.T; Sound.tspin(); }
  }

  const hadBest = G.newBest;
  addScore(gain);

  if (G.level > prevLevel) { Sound.levelUp(); Haptics.levelUp(); }

  // Beating the record outranks the clear label — addScore already toasted it.
  if (!hadBest && G.newBest) { /* keep the high-score toast on screen */ }
  else if (G.level > prevLevel) showToast('LEVEL ' + G.level, theme.pieces.S);
  else if (label) showToast(label, color);
}

function spawnClearParticles(rows, fx) {
  const cell = view.cell;
  for (const y of rows) {
    for (let x = 0; x < COLS; x++) {
      const color = theme.pieces[G.grid[y][x]] || theme.accent;
      for (let i = 0; i < fx.parts; i++) {
        G.particles.push({
          x: (x + Math.random()) * cell,
          y: (y - HIDDEN + Math.random()) * cell,
          vx: (Math.random() - 0.5) * fx.spread,
          vy: (Math.random() - 0.85) * fx.spread * 0.62,
          life: 1, decay: 0.0016 + Math.random() * 0.0016,
          size: cell * (0.1 + Math.random() * 0.16) * (1 + fx.beam * 0.35),
          color,
        });
      }
    }
  }
  if (G.particles.length > 900) G.particles.splice(0, G.particles.length - 900);
}

// ---------- saving and resuming a run ----------

/**
 * Writes the run to storage. Called at stable points only — a new piece, a
 * pause, leaving for the menu, or the page being hidden — never mid-clear or
 * mid-death, so a restored board is always one a player could be looking at.
 */
export function snapshotRun() {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  saveRun(G.mode, {
    mode: G.mode,
    grid: encodeGrid(G.grid),
    // The rotation matrix is rebuilt from ROTATIONS, so only the index is kept.
    active: G.active ? { type: G.active.type, rot: G.active.rot, x: G.active.x, y: G.active.y } : null,
    queue: G.queue, bag: G.bag, hold: G.hold, canHold: G.canHold,
    score: G.score, lines: G.lines, level: G.level,
    combo: G.combo, backToBack: G.backToBack,
    runBest: G.runBest, newBest: G.newBest,
  });
}

/**
 * Which mode a plain tap on the menu should pick up: whichever was played last
 * if it has a save, else whichever does, else none.
 */
export function pendingRun() {
  const last = loadLastMode();
  if (loadRun(last)) return last;
  if (loadRun('marathon')) return 'marathon';
  if (loadRun('zen')) return 'zen';
  return null;
}

/** Restores a saved run and leaves it paused, rather than dropping the player
 *  straight back into live gravity. */
export function resumeRun(mode = pendingRun()) {
  const saved = mode && loadRun(mode);
  if (!saved) { startGame(); return; }
  saveLastMode(mode);

  G.mode = saved.mode === 'zen' ? 'zen' : 'marathon';
  G.grid = decodeGrid(saved.grid);
  G.queue = Array.isArray(saved.queue) ? [...saved.queue] : [];
  G.bag = Array.isArray(saved.bag) ? [...saved.bag] : null;
  G.hold = saved.hold ?? null;
  G.canHold = saved.canHold !== false;

  G.score = saved.score | 0;
  G.lines = saved.lines | 0;
  G.level = Math.max(1, saved.level | 0);
  G.combo = Number.isInteger(saved.combo) ? saved.combo : -1;
  G.backToBack = !!saved.backToBack;
  G.runBest = saved.runBest | 0;
  G.newBest = !!saved.newBest;

  G.gravityAcc = 0; G.particles = []; G.shake = 0;
  G.clearRows = null; G.pendingClear = null; G.clearCount = 0;
  G.deathRow = ROWS; G.deathTimer = 0;
  G.rotatedLast = false; G.lastKick = 0;
  resetLockState();

  G.state = 'playing';
  G.active = saved.active
    ? { ...saved.active, m: ROTATIONS[saved.active.type][saved.active.rot] }
    : null;
  if (!G.active) spawn();

  setRecordStyle(G.newBest);
  syncLevelPalette(); // restore the palette the run was at
  updateHud();
  drawSidePanels();
  if (G.state === 'playing') togglePause();
}

// ---------- flow ----------

export function startGame(mode = 'marathon') {
  clearRun(mode); // only this mode's slot — the other run stays waiting
  saveLastMode(mode);
  G.mode = mode;
  G.grid = emptyGrid();
  G.queue = []; G.bag = null; G.hold = null; G.canHold = true;
  G.score = 0; G.lines = 0; G.level = 1; G.combo = -1; G.backToBack = false;
  G.runBest = G.stats[mode].score; // each mode has its own record to beat
  G.newBest = false;
  setRecordStyle(false);
  G.gravityAcc = 0; G.particles = []; G.shake = 0;
  G.clearRows = null; G.pendingClear = null;
  G.deathRow = ROWS; G.deathTimer = 0;
  G.state = 'playing';

  hideOverlay();
  syncLevelPalette(); // back to the level-1 palette after a high-level run
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

// Abandoning a run mid-game shouldn't throw away a personal best. Each mode
// keeps its own set, so Zen's unbounded score can never flatter Marathon's.
function commitStats() {
  const best = G.stats[G.mode];
  best.score = Math.max(best.score, G.score);
  best.lines = Math.max(best.lines, G.lines);
  saveStats();
}

function finishGameOver() {
  G.state = 'over';
  Sound.over();
  Haptics.over();
  commitStats();
  clearRun(G.mode); // this run is finished; the other mode's is untouched

  showOverlay(`
    <h2${G.newBest ? ' class="record"' : ''}>${G.newBest ? 'NEW HIGH SCORE!' : 'GAME OVER'}</h2>
    <div class="best${G.newBest ? ' new' : ''}">
      <span class="label">SCORE</span>
      <b>${G.score.toLocaleString()}</b>
    </div>
    <p>LINES ${G.lines} &nbsp;·&nbsp; LEVEL ${G.level}${
      G.newBest ? '' : `<br>HIGH SCORE ${G.stats[G.mode].score.toLocaleString()}`}</p>
    ${themeBar()}
    ${actionBar([['menu', 'MAIN MENU']])}
    <p class="cta">TAP TO PLAY AGAIN</p>
  `);
}

/**
 * The gesture list, shared by the menu and the pause screen so the two can't
 * drift. Phones get the gestures, desktop the keys — showing both is clutter on
 * the screen that matters.
 */
function controlsHint() {
  const touch = window.matchMedia?.('(pointer: coarse)')?.matches ?? true;

  // A two-column list, not a run of text. Separating pairs with middots let the
  // browser wrap at any space, which split "FLICK DOWN" from "drop".
  const rows = touch
    ? [['DRAG', 'move'], ['TAP', 'rotate'], ['FLICK DOWN', 'hard drop'],
       ['SWIPE UP', 'hold'], ['TWO-FINGER TAP', 'rotate back']]
    : [['&larr; &rarr;', 'move'], ['&uarr; / X', 'rotate'], ['Z', 'rotate back'],
       ['SPACE', 'hard drop'], ['C', 'hold'], ['P', 'pause']];

  const cells = rows.map(([key, action]) => `<dt>${key}</dt><dd>${action}</dd>`).join('');
  return `<dl class="controls">${cells}</dl>`;
}

/**
 * Renders the pause screen. Separate from togglePause so a control on it can
 * redraw the screen it lives on without resuming the game.
 */
export function showPauseScreen() {
  // Only offered where vibration exists — on iOS the API is absent entirely,
  // and a toggle for nothing is worse than no toggle.
  const actions = [['restart', 'RESTART'], ['menu', 'MAIN MENU']];
  if (Haptics.supported) {
    actions.push(['haptics', Haptics.enabled ? 'BUZZ ON' : 'BUZZ OFF']);
  }

  showOverlay(`
    <h2>PAUSED</h2>
    ${themeBar()}
    ${actionBar(actions)}
    ${controlsHint()}
    <p class="cta">TAP TO RESUME</p>
  `, { soft: true }); // board stays readable behind it
}

export function togglePause() {
  if (G.state === 'playing' || G.state === 'clearing') {
    G.state = G.state === 'clearing' ? 'pausedClearing' : 'paused';
    snapshotRun();
    showPauseScreen();
  } else if (G.state === 'paused' || G.state === 'pausedClearing') {
    G.state = G.state === 'pausedClearing' ? 'clearing' : 'playing';
    hideOverlay();
  }
}

const lineCount = n => `${n.toLocaleString()} ${n === 1 ? 'LINE' : 'LINES'}`;

/** One card per mode that has anything to show, each with the same three stats. */
function recordCards() {
  const card = (mode, name) => {
    const s = G.stats[mode];
    if (!s.score && !s.lines) return '';
    return `
      <div class="recordCard">
        <span class="label">${name}</span>
        <b>${s.score.toLocaleString()}</b>
        <span class="sub">${lineCount(s.lines)} &nbsp;·&nbsp; ${s.combo}&times;</span>
      </div>`;
  };

  const cards = card('marathon', 'GAME') + card('zen', 'ZEN');
  return cards ? `<div class="records">${cards}</div>` : '';
}

export function showMenu() {
  snapshotRun();  // keep the run resumable before the board is torn down
  commitStats();  // may be arriving from an abandoned run
  G.state = 'menu';
  G.grid = emptyGrid();
  G.active = null;
  G.particles = [];
  G.clearRows = null;
  G.pendingClear = null;
  G.deathRow = ROWS;
  setRecordStyle(false);

  const savedMarathon = loadRun('marathon');
  const savedZen = loadRun('zen');
  const pending = pendingRun();
  const saved = savedMarathon || savedZen;

  // "New" on the first row, "resume" on the second. One verb throughout: the
  // buttons and the prompt both say RESUME, and both modes are named the same
  // way wherever they appear.
  const actions = [];

  if (saved) {
    actions.push(['new', 'NEW GAME'], ['zen', 'NEW ZEN'], null);
    if (savedMarathon) {
      actions.push(['continue', `RESUME GAME · ${(savedMarathon.score | 0).toLocaleString()}`]);
    }
    if (savedZen) {
      actions.push(['continue-zen', `RESUME ZEN · ${lineCount(savedZen.lines | 0)}`]);
    }
  } else {
    actions.push(['zen', 'ZEN MODE']);
  }

  // Naming the mode here is what the separate caption line used to do, without
  // repeating the whole thing underneath the buttons.
  const cta = pending
    ? `TAP TO RESUME ${pending === 'zen' ? 'ZEN' : 'GAME'}`
    : 'TAP TO PLAY';

  showOverlay(`
    ${menuBackdrop()}
    ${wordmark()}
    ${recordCards()}
    ${controlsHint()}
    <p class="fine">HOLD SAVES A PIECE &nbsp;·&nbsp; ONCE PER DROP</p>
    ${themeBar()}
    ${actionBar(actions)}
    <p class="cta">${cta}</p>
  `, { intro: true });
}

// ---------- per-frame ----------

/**
 * Advances one frame.
 * @param {number} dt  milliseconds since the last frame, clamped by the caller.
 *
 * Must run *after* input.js's updateKeyRepeat for the same frame, so a piece
 * moved by held keys is settled before gravity and lock delay are applied.
 */
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
