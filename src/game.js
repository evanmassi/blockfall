// The rules: spawning, movement, locking, clearing, scoring and the state
// machine behind the menu, pause, death and game-over screens. The only module
// that writes G, apart from input.js's gesture bookkeeping.

import {
  COLS, ROWS, HIDDEN,
  LINE_SCORES, TSPIN_SCORES, TSPIN_MINI_SCORES, PERFECT_SCORES,
  LOCK_DELAY, MAX_LOCK_RESETS, CLEAR_FX, DEATH_ROW_MS, DEATH_HOLD_MS,
  FRAME_MS, GRAVITY_FRAMES, GRAVITY_MIN_FRAMES,
  ZEN_RESCUE_ROWS, READY_MS, READY_BEATS, CHAIN_SCORES, FALL_MS,
  UNDO_MAX, ZEN_CAPS,
} from './config.js';
import { ROTATIONS, KICKS, topRow } from './pieces.js';
import { theme } from './themes.js';
import {
  G, emptyGrid, saveStats, blankTally, MODES,
  saveRun, loadRun, clearRun, encodeGrid, decodeGrid,
  saveLastMode, loadLastMode, saveSettings,
} from './state.js';
import { collides, fillQueue, makePiece, settle } from './board.js';
import { view, drawSidePanels, syncLevelPalette } from './render.js';
import { Sound } from './audio.js';
import { Haptics } from './haptics.js';
import {
  showOverlay, hideOverlay, showToast, updateHud, setRecordStyle, setCountdown,
  themeBar, wordmark, menuBackdrop, actionBar, textButton, textRow,
  setUndo, settingRow, stepper, toggle,
} from './ui.js';

function setReady(ms) {
  G.ready = ms;
  setCountdown(ms > 0 ? READY_BEATS : 0);
}

const resumeDelay = () => (G.settings.countdown ? READY_MS : 0);

// Single funnel, so beating the record is caught the instant it happens rather
// than on the game-over screen.
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

// Settles a new piece into the visible field so it never appears half-cut by
// the hidden buffer rows.
function enterPiece(piece) {
  if (collides(piece.m, piece.x, piece.y)) {
    if (G.mode !== 'zen') { gameOver(); return false; }
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
  pushUndo();    // ...and the point an undo winds back to
  refreshUndo();
  snapshotRun(); // a new piece is a stable point to save at
}

function resetLockState() {
  G.grounded = false;
  G.lockTimer = 0;
  G.lockResets = 0;
}

/** Milliseconds a piece takes to fall one row. Must not be clamped to a floor:
 *  that silently stopped progression while the level counter kept climbing. */
export function gravityInterval() {
  const cap = G.settings.zenCap; // 0 lets Zen climb like the other modes
  const level = G.mode === 'zen' && cap ? Math.min(G.level, cap) : G.level;
  const frames = GRAVITY_FRAMES[level - 1] ?? GRAVITY_MIN_FRAMES;
  return frames * FRAME_MS;
}

// Zen's answer to topping out: drop the bottom rows and let the stack fall in.
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
 * @param {number} dir  positive clockwise, negative anticlockwise.
 * @returns {boolean} false if every SRS kick was blocked, piece left as-is.
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
  addScore(dist * 2);
  if (dist > 0) G.rotatedLast = false; // a 0-cell drop must not cancel a T-spin
  // Capped at 4: a long drop shaking as hard as a Tetris flattened the whole
  // clear escalation.
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
 * Three-corner rule. Must be called *before* the piece is written into the
 * grid, or the corners it inspects include the piece itself.
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
  G.tally.pieces++;

  for (let y = 0; y < a.m.length; y++) {
    for (let x = 0; x < a.m.length; x++) {
      if (!a.m[y][x]) continue;
      const gy = a.y + y, gx = a.x + x;
      if (gy >= 0) G.grid[gy][gx] = a.type;
      if (gy >= HIDDEN) anyVisible = true;
    }
  }

  const full = fullRows();

  // Locked entirely in the hidden buffer: a top-out everywhere but Zen.
  if (!anyVisible && !full.length) {
    G.active = null;
    if (G.mode === 'zen') { rescue(); spawn(); return; }
    gameOver();
    return;
  }

  if (full.length) {
    beginClear(full, spin);
  } else {
    if (spin) applyScore(0, spin);
    else { G.combo = -1; Sound.lock(); Haptics.lock(); }
    G.active = null;
    spawn();
  }
}

// Deeper chains hit harder: a clear four links in reads as a Tetris even when
// it is one row.
function beginClear(rows, spin) {
  const fx = CLEAR_FX[Math.min(rows.length + G.chain, 4)];
  spawnClearParticles(rows, fx);
  G.pendingClear = { rows, spin };
  G.clearRows = rows;
  G.clearCount = rows.length;
  G.clearTime = fx.time;
  G.clearTimer = fx.time;
  G.shake = Math.max(G.shake, fx.shake);
  G.state = 'clearing';
  G.active = null;
}

const fullRows = () => {
  const full = [];
  for (let y = 0; y < ROWS; y++) if (G.grid[y].every(Boolean)) full.push(y);
  return full;
};

function finishClear() {
  const { rows, spin } = G.pendingClear;

  // Cascade blanks the rows in place and lets the survivors fall; everywhere
  // else the stack shifts down as whole rows.
  let moved = null;
  if (G.mode === 'cascade') {
    for (const y of rows) G.grid[y] = Array(COLS).fill(null);
    moved = settle(G.grid);
  } else {
    const kept = G.grid.filter((_, y) => !rows.includes(y));
    while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
    G.grid = kept;
  }

  applyScore(rows.length, spin, G.chain);
  G.pendingClear = null;
  G.clearRows = null;

  // The fall is the whole point of cascade: snapping the survivors into place
  // left a chained clear looking like a bonus with no cause.
  if (moved?.length) {
    G.falling = moved;
    G.fallTimer = FALL_MS;
    G.state = 'settling';
    return;
  }

  afterSettle();
}

function afterSettle() {
  G.falling = null;

  if (G.mode === 'cascade') {
    const next = fullRows();
    if (next.length) {
      G.chain++;
      G.tally.chain = Math.max(G.tally.chain, G.chain + 1);
      beginClear(next, null); // a spin credits the placement, not what it set off
      return;
    }
  }

  G.chain = 0;
  G.state = 'playing';
  spawn();
}

/** @param {number} chain  links already set off by this one placement. */
function applyScore(cleared, spin, chain = 0) {
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

  if (spin) G.tally.tspins++;
  if (cleared === 4) G.tally.tetris++;

  if (chain > 0) {
    gain = Math.round(gain * CHAIN_SCORES[Math.min(chain, CHAIN_SCORES.length - 1)]);
    label = `CHAIN ${chain + 1}×` + (label ? '  ' + label : '');
    color = theme.pieces.S;
  }

  if (cleared) {
    // Combo counts consecutive *placements* that cleared, so the extra clears one
    // placement sets off must not touch it — four links would read as a 4× combo.
    if (!chain) {
      G.combo++;
      if (G.combo > 0) {
        gain += 50 * G.combo * G.level;
        if (!label) label = G.combo + 1 + '× COMBO';
        else label += '  ' + (G.combo + 1) + '×';
      }
      G.stats[G.mode].combo = Math.max(G.stats[G.mode].combo, G.combo + 1);
      G.tally.combo = Math.max(G.tally.combo, G.combo + 1);
    }

    G.lines += cleared;
    G.level = Math.floor(G.lines / 10) + 1;
    if (G.level !== prevLevel) syncLevelPalette();

    if (G.grid.every(row => row.every(c => !c))) {
      G.tally.perfect++;
      gain += PERFECT_SCORES[cleared] * G.level;
      label = 'PERFECT CLEAR';
      color = '#ffffff';
      G.shake = Math.max(G.shake, 12);
    }

    if (chain > 0) Sound.chain(chain);
    else if (spin) { Sound.tspin(); Haptics.tspin(); }
    else Sound.clear(cleared);
    Haptics.clear(cleared);
    if (G.combo > 0) Sound.combo(G.combo);
  } else {
    G.combo = -1;
    if (spin) { label = 'T-SPIN'; color = theme.pieces.T; Sound.tspin(); }
  }

  const hadBest = G.newBest;
  addScore(gain);

  if (G.level > prevLevel) { Sound.levelUp(); Haptics.levelUp(); }

  // A record outranks the clear label; addScore already toasted it.
  if (!hadBest && G.newBest) { /* leave the high-score toast up */ }
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

// Everything needed to put a run back. Copied, not referenced: an undo entry has
// to survive the play that follows it rather than follow along with it.
function runPayload() {
  return {
    mode: G.mode,
    grid: encodeGrid(G.grid),
    // The rotation matrix is rebuilt from ROTATIONS, so only the index is kept.
    active: G.active ? { type: G.active.type, rot: G.active.rot, x: G.active.x, y: G.active.y } : null,
    queue: [...G.queue], bag: G.bag ? [...G.bag] : null, hold: G.hold, canHold: G.canHold,
    score: G.score, lines: G.lines, level: G.level,
    combo: G.combo, backToBack: G.backToBack,
    runBest: G.runBest, newBest: G.newBest,
    tally: { ...G.tally },
  };
}

// Stable points only — a new piece, a pause, the menu, the page being hidden —
// never mid-clear or mid-death, so a restored board is always a playable one.
export function snapshotRun() {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  saveRun(G.mode, { ...runPayload(), undosUsed: G.undosUsed, undoStack: G.undoStack });
}

/** The live board becomes `saved`. Shared by resuming and undoing. */
function applyRun(saved) {
  G.mode = MODES.includes(saved.mode) ? saved.mode : 'marathon';
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
  G.tally = { ...blankTally(), ...saved.tally };

  G.gravityAcc = 0; G.particles = []; G.shake = 0;
  G.clearRows = null; G.pendingClear = null; G.clearCount = 0; G.chain = 0;
  G.falling = null; G.fallTimer = 0;
  G.deathRow = ROWS; G.deathTimer = 0;
  G.rotatedLast = false; G.lastKick = 0;
  resetLockState();

  G.state = 'playing';
  G.active = saved.active
    ? { ...saved.active, m: ROTATIONS[saved.active.type][saved.active.rot] }
    : null;
  if (!G.active) spawn();

  setRecordStyle(G.newBest);
  syncLevelPalette();
  updateHud();
  drawSidePanels();
  refreshUndo();
}

// ---------- undo ----------

export const undosLeft = () => Math.max(0, G.settings.undos - G.undosUsed);

// Mid-clear counts: the entry restored predates the piece that set the clear off,
// so it cancels cleanly — and the button doesn't die for a third of a second
// after every landing.
const UNDOABLE = { playing: 1, clearing: 1, settling: 1 };

// Two deep at minimum: the top is the piece in play, so something has to be under it.
export const canUndo = () => !!UNDOABLE[G.state] && undosLeft() > 0 && G.undoStack.length > 1;

function pushUndo() {
  if (!G.settings.undos) return; // nothing to spend, nothing worth keeping
  G.undoStack.push(runPayload());
  if (G.undoStack.length > UNDO_MAX + 1) G.undoStack.shift();
}

function refreshUndo() {
  const live = G.state !== 'menu' && G.state !== 'over' && G.state !== 'dying';
  setUndo(G.settings.undos > 0 && live, undosLeft(), canUndo());
}

/** Takes back the piece in play, putting the board where it was one spawn ago. */
export function undo() {
  if (!canUndo()) return;
  G.undoStack.pop();
  G.undosUsed++;
  applyRun(G.undoStack[G.undoStack.length - 1]);
  Sound.undo();
  Haptics.lock();
  showToast('UNDO', theme.accent);
  snapshotRun();
}

/** Which mode a plain tap on the menu picks up: last played if it has a save,
 *  else whichever does, else none. */
export function pendingRun() {
  const last = loadLastMode();
  if (loadRun(last)) return last;
  return MODES.find(m => loadRun(m)) ?? null;
}

export function resumeRun(mode = pendingRun()) {
  const saved = mode && loadRun(mode);
  if (!saved) { startGame(); return; }
  saveLastMode(mode);

  G.undosUsed = Math.max(0, saved.undosUsed | 0);
  G.undoStack = Array.isArray(saved.undoStack) ? saved.undoStack : [];
  applyRun(saved);
  // A run saved before undo existed, or with undos switched off at the time.
  if (!G.undoStack.length) pushUndo();

  hideOverlay();
  if (G.state === 'playing') setReady(resumeDelay()); // spawn() above can have topped out
}

// ---------- flow ----------

export function startGame(mode = 'marathon') {
  commitStats(); // the run being replaced may be holding a record
  clearRun(mode); // only this mode's slot — the other run stays waiting
  saveLastMode(mode);
  G.mode = mode;
  G.grid = emptyGrid();
  G.queue = []; G.bag = null; G.hold = null; G.canHold = true;
  G.score = 0; G.lines = 0; G.level = 1; G.combo = -1; G.backToBack = false;
  G.tally = blankTally();
  G.runBest = G.stats[mode].score;
  G.newBest = false;
  setRecordStyle(false);
  G.gravityAcc = 0; G.particles = []; G.shake = 0;
  G.clearRows = null; G.pendingClear = null; G.chain = 0;
  G.falling = null; G.fallTimer = 0;
  G.deathRow = ROWS; G.deathTimer = 0;
  G.state = 'playing';
  setReady(0);
  G.undosUsed = 0;
  G.undoStack = [];

  hideOverlay();
  syncLevelPalette(); // back to level 1 after a high-level run
  fillQueue();
  spawn();
  updateHud();
}

// Two beats: a grey curtain sweeps up from the floor, then the summary.
export function gameOver() {
  if (G.state === 'dying' || G.state === 'over') return;
  G.state = 'dying';
  G.active = null;
  G.deathRow = ROWS;
  G.deathTimer = 0;
  refreshUndo();
}

// Per mode, so Zen's unbounded score can never flatter Marathon's.
function commitStats() {
  const best = G.stats[G.mode];
  best.score = Math.max(best.score, G.score);
  best.lines = Math.max(best.lines, G.lines);
  saveStats();
}

function clockText(ms) {
  const s = Math.floor(ms / 1000);
  const parts = [Math.floor(s / 60) % 60, s % 60];
  if (s >= 3600) parts.unshift(Math.floor(s / 3600));
  return parts.map((n, i) => (i ? String(n).padStart(2, '0') : n)).join(':');
}

function tallyCard() {
  const t = G.tally;
  const rows = [
    ['LINES', G.lines], ['LEVEL', G.level], ['TIME', clockText(t.ms)],
    ['PIECES', t.pieces.toLocaleString()], ['TETRIS', t.tetris],
    ['T-SPINS', t.tspins], ['PERFECT', t.perfect], ['BEST COMBO', t.combo + '&times;'],
  ];
  // Chains are impossible outside cascade, so elsewhere the row is always zero.
  if (G.mode === 'cascade') rows.push(['BEST CHAIN', t.chain + '&times;']);
  return `<dl class="tally">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

function finishGameOver() {
  G.state = 'over';
  Sound.over();
  Haptics.over();
  commitStats();
  clearRun(G.mode); // the other mode's save is untouched

  showOverlay(`
    <h2${G.newBest ? ' class="record"' : ''}>${G.newBest ? 'NEW HIGH SCORE!' : 'GAME OVER'}</h2>
    <div class="best${G.newBest ? ' new' : ''}">
      <span class="label">SCORE</span>
      <b>${G.score.toLocaleString()}</b>
    </div>
    ${tallyCard()}
    ${G.newBest ? '' : `<p>HIGH SCORE ${G.stats[G.mode].score.toLocaleString()}</p>`}
    ${themeBar()}
    ${actionBar([['restart', 'PLAY AGAIN'], ['menu', 'MAIN MENU']])}
  `);
}

// Shared by the menu and the pause screen so the two can't drift. Phones get
// the gestures, desktop the keys; showing both is clutter.
function controlsHint() {
  const touch = window.matchMedia?.('(pointer: coarse)')?.matches ?? true;

  // Two columns, not a run of text: middots let the browser wrap at any space,
  // which split "FLICK DOWN" from "drop".
  const rows = touch
    ? [['DRAG', 'move'], ['TAP', 'rotate'], ['FLICK DOWN', 'hard drop'],
       ['SWIPE UP', 'hold'], ['TWO-FINGER TAP', 'rotate back']]
    : [['&larr; &rarr;', 'move'], ['&uarr; / X', 'rotate'], ['Z', 'rotate back'],
       ['SPACE', 'hard drop'], ['C', 'hold'], ['P', 'pause']];

  const cells = rows.map(([key, action]) => `<dt>${key}</dt><dd>${action}</dd>`).join('');
  return `<dl class="controls">${cells}</dl>`;
}

// Separate from togglePause so a control on the screen can redraw it without
// resuming the game.
export function showPauseScreen() {
  // iOS has no vibration API at all, and a toggle for nothing is worse than none.
  const actions = [['restart', 'RESTART'], ['menu', 'MAIN MENU']];
  if (Haptics.supported) {
    actions.push(['haptics', Haptics.enabled ? 'BUZZ ON' : 'BUZZ OFF']);
  }

  showOverlay(`
    <h2>PAUSED</h2>
    ${themeBar()}
    ${actionBar(actions)}
    ${textRow(textButton('how', 'HOW TO PLAY'), textButton('settings', 'SETTINGS'))}
    <p class="cta">TAP TO RESUME</p>
  `, { soft: true });
}

// Ordered by how often they get touched: the countdown is a one-time choice,
// the Zen cap is a mood.
function settingsRows() {
  const s = G.settings;
  const rowMs = level => Math.round((GRAVITY_FRAMES[level - 1] ?? GRAVITY_MIN_FRAMES) * FRAME_MS);

  return `
    <div class="settings">
      ${settingRow('COUNTDOWN', toggle('countdown', s.countdown ? 'ON' : 'OFF'),
                   s.countdown ? '3-2-1 BEFORE PLAY RESUMES' : 'RESUMES THE MOMENT YOU DO')}
      ${settingRow('UNDOS', stepper('undos', s.undos || 'OFF'),
                   s.undos ? `${s.undos} TAKE-BACKS EACH GAME` : 'NO TAKE-BACKS')}
      ${settingRow('ZEN SPEED', stepper('zen', s.zenCap || 'NO CAP'),
                   s.zenCap ? `STOPS AT ${rowMs(s.zenCap)}MS A ROW` : 'KEEPS SPEEDING UP')}
    </div>`;
}

export function showSettings() {
  showOverlay(`
    <h2>SETTINGS</h2>
    ${settingsRows()}
    ${actionBar([['back', 'BACK']])}
  `, { soft: G.state !== 'menu', modal: true });
}

/** @param {number} dir  step for a stepper; ignored by the toggles. */
export function changeSetting(key, dir = 0) {
  const s = G.settings;
  if (key === 'countdown') s.countdown = !s.countdown;
  if (key === 'undos') s.undos = Math.min(UNDO_MAX, Math.max(0, s.undos + dir));
  if (key === 'zen') {
    const at = ZEN_CAPS.indexOf(s.zenCap);
    s.zenCap = ZEN_CAPS[Math.min(ZEN_CAPS.length - 1, Math.max(0, at + dir))];
  }
  saveSettings();

  // Nothing is recorded while undos are off, so history kept across that gap
  // would wind back to whenever they were last on — a whole run, in the worst
  // case. Dropped on the way out, seeded from where she stands on the way in.
  if (key === 'undos') {
    if (!s.undos) G.undoStack = [];
    else if (!G.undoStack.length && G.active) pushUndo();
  }

  refreshUndo();
  showSettings();
}

// Reached from the menu and from pause; where BACK returns is read off the state
// rather than tracked, since only those two screens can open it.
export function showControls() {
  const fromPause = G.state !== 'menu';
  showOverlay(`
    <h2>HOW TO PLAY</h2>
    ${controlsHint()}
    ${actionBar([['back', 'BACK']])}
  `, { soft: fromPause, modal: true });
}

export function closeSubScreen() {
  if (G.state === 'menu') showMenu();
  else showPauseScreen();
}

// Each live state has a paused twin, so pausing mid-clear or mid-fall resumes
// into the same beat rather than skipping it.
const PAUSED_AS = { playing: 'paused', clearing: 'pausedClearing', settling: 'pausedSettling' };
const RESUMED_AS = { paused: 'playing', pausedClearing: 'clearing', pausedSettling: 'settling' };

export function togglePause() {
  if (PAUSED_AS[G.state]) {
    G.state = PAUSED_AS[G.state];
    setReady(0);
    snapshotRun();
    showPauseScreen();
  } else if (RESUMED_AS[G.state]) {
    G.state = RESUMED_AS[G.state];
    hideOverlay();
    setReady(resumeDelay());
  }
  refreshUndo();
}

const lineCount = n => `${n.toLocaleString()} ${n === 1 ? 'LINE' : 'LINES'}`;

// Menu order, and what a run in progress reads as on its resume button.
const MENU_MODES = [
  { mode: 'marathon', name: 'CLASSIC', start: 'new', resume: 'continue',
    progress: s => (s.score | 0).toLocaleString() },
  { mode: 'zen', name: 'ZEN', start: 'zen', resume: 'continue-zen',
    progress: s => lineCount(s.lines | 0) },
  { mode: 'cascade', name: 'CASCADE', start: 'cascade', resume: 'continue-cascade',
    progress: s => (s.score | 0).toLocaleString() },
];

/** One card per mode that has anything to show. */
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

  const cards = card('marathon', 'CLASSIC') + card('zen', 'ZEN') + card('cascade', 'CASCADE');
  return cards ? `<div class="records">${cards}</div>` : '';
}

export function showMenu() {
  snapshotRun();  // stay resumable before the board is torn down
  commitStats();  // may be arriving from an abandoned run
  G.state = 'menu';
  G.grid = emptyGrid();
  G.active = null;
  G.particles = [];
  G.clearRows = null;
  G.pendingClear = null;
  G.chain = 0;
  G.falling = null;
  G.deathRow = ROWS;
  setReady(0);
  setRecordStyle(false);
  refreshUndo();

  // Starting on the first row, resuming below it. Progress goes on a second line
  // inside the button rather than after the label: "RESUME CASCADE · 18,400" on
  // one line is wider than a phone, and three of those stacked ran off the bottom.
  const actions = [];
  const resumes = [];

  for (const m of MENU_MODES) {
    actions.push([m.start, `NEW ${m.name}`]);
    const save = loadRun(m.mode);
    if (save) resumes.push([m.resume, `RESUME ${m.name}`, m.progress(save)]);
  }

  if (resumes.length) actions.push(null, ...resumes);

  showOverlay(`
    ${menuBackdrop()}
    ${wordmark()}
    ${recordCards()}
    ${themeBar()}
    ${actionBar(actions)}
    ${textRow(textButton('how', 'HOW TO PLAY'), textButton('settings', 'SETTINGS'))}
  `, { intro: true });
}

// ---------- per-frame ----------

/**
 * @param {number} dt  ms since the last frame, clamped by the caller.
 *
 * Must run *after* updateKeyRepeat for the same frame, so a piece moved by held
 * keys is settled before gravity and lock delay apply.
 */
export function update(dt) {
  // First, so one guard freezes gravity, lock delay, clears and particles alike.
  if (G.ready > 0) {
    G.ready = Math.max(0, G.ready - dt);
    setCountdown(Math.ceil(G.ready / (READY_MS / READY_BEATS)));
    return;
  }

  if (G.state === 'playing' || G.state === 'clearing' || G.state === 'settling') G.tally.ms += dt;

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

  if (G.state === 'settling') {
    G.fallTimer -= dt;
    if (G.fallTimer > 0) return;
    // The stack landing, before whatever it completed lights up.
    const drop = Math.max(...G.falling.map(f => f.to - f.from));
    G.shake = Math.max(G.shake, Math.min(4, 1 + drop * 0.5));
    Sound.settle(drop);
    Haptics.lock();
    afterSettle();
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
