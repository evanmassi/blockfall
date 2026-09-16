import {
  COLS, ROWS, HIDDEN, VIS_ROWS,
  LINE_SCORES, TSPIN_SCORES, TSPIN_MINI_SCORES, PERFECT_SCORES,
  LOCK_DELAY, MAX_LOCK_RESETS, CLEAR_FX, DEATH_ROW_MS, DEATH_HOLD_MS,
  FRAME_MS, GRAVITY_FRAMES, GRAVITY_MIN_FRAMES,
  ZEN_RESCUE_ROWS, READY_MS, READY_BEATS, CHAIN_SCORES, FALL_MS,
  UNDO_MAX, ZEN_CAPS, ZEN_LEVELS,
} from './config.js';
import { ROTATIONS, KICKS, topRow } from './pieces.js';
import { theme } from './themes.js';
import {
  G, emptyGrid, saveStats, blankTally, BASES, SLOTS, slotOf, parseSlot,
  saveRun, loadRun, clearRun, encodeGrid, decodeGrid,
  saveLastSlot, loadLastSlot, saveSettings,
} from './state.js';
import { collides, fillQueue, makePiece, settle } from './board.js';
import { view, drawSidePanels, syncLevelPalette } from './render.js';
import { Sound } from './audio.js';
import { Haptics } from './haptics.js';
import {
  showOverlay, hideOverlay, showToast, updateHud, setRecordStyle, setCountdown,
  themeBar, wordmark, menuBackdrop, actionBar, textButton, textRow, rule,
  setUndo, settingRow, setSettingText, setWheel, wheel, toggle, setBoardShowing,
} from './ui.js';

function setReady(ms) {
  G.ready = ms;
  setCountdown(ms > 0 ? READY_BEATS : 0);
}

const resumeDelay = () => (G.settings.countdown ? READY_MS : 0);

const currentSlot = () => slotOf(G.mode, G.cascade);

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
  pushUndo();
  refreshUndo();
  snapshotRun();
}

function resetLockState() {
  G.grounded = false;
  G.lockTimer = 0;
  G.lockResets = 0;
}

export function levelFor(lines) {
  const step = Math.floor(lines / 10) + 1;
  if (G.mode !== 'zen') return step;
  const { zenMin, zenMax } = G.settings;
  return Math.max(zenMin, zenMax ? Math.min(step, zenMax) : step);
}

// PITFALL: clamping this to a floor silently stalls speed while the level counter keeps climbing.
export function gravityInterval() {
  const frames = GRAVITY_FRAMES[G.level - 1] ?? GRAVITY_MIN_FRAMES;
  return frames * FRAME_MS;
}

function rescue() {
  const rows = [];
  for (let y = ROWS - ZEN_RESCUE_ROWS; y < ROWS; y++) rows.push(y);
  spawnClearParticles(rows, CLEAR_FX[4]); // PITFALL: reads cell colours, so it must run before the rows are dropped.

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
  if (dist > 0) G.rotatedLast = false; // PITFALL: a 0-cell drop must not cancel a T-spin.
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

  G.canHold = false; // PITFALL: must follow spawn(), which re-arms the hold.
  drawSidePanels();
  Sound.holdSfx();
  Haptics.hold();
}

// PITFALL: must be called before the piece is written into the grid, or the corners it inspects include the piece itself.
export function tSpinType() {
  const a = G.active;
  if (a.type !== 'T' || !G.rotatedLast) return null;

  const cx = a.x + 1, cy = a.y + 1;
  const blocked = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && !!G.grid[y][x]);
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

  let moved = null;
  if (G.cascade) {
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

  if (G.cascade) {
    const next = fullRows();
    if (next.length) {
      G.chain++;
      G.tally.chain = Math.max(G.tally.chain, G.chain + 1);
      beginClear(next, null);
      return;
    }
  }

  G.chain = 0;
  G.state = 'playing';
  spawn();
}

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
    label = ['', '', 'DOUBLE', 'TRIPLE', 'TETRIS'][cleared];
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
    if (!chain) {
      G.combo++;
      if (G.combo > 0) {
        gain += 50 * G.combo * G.level;
        if (!label) label = G.combo + 1 + '× COMBO';
        else label += '  ' + (G.combo + 1) + '×';
      }
      const best = G.stats[currentSlot()];
      best.combo = Math.max(best.combo, G.combo + 1);
      G.tally.combo = Math.max(G.tally.combo, G.combo + 1);
    }

    G.lines += cleared;
    G.level = levelFor(G.lines);
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

  if (!hadBest && G.newBest) {}
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

function runPayload() {
  return {
    mode: G.mode, cascade: G.cascade,
    grid: encodeGrid(G.grid),
    active: G.active ? { type: G.active.type, rot: G.active.rot, x: G.active.x, y: G.active.y } : null,
    queue: [...G.queue], bag: G.bag ? [...G.bag] : null, hold: G.hold, canHold: G.canHold,
    score: G.score, lines: G.lines, level: G.level,
    combo: G.combo, backToBack: G.backToBack,
    runBest: G.runBest, newBest: G.newBest,
    tally: { ...G.tally },
  };
}

export function snapshotRun() {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  saveRun(currentSlot(), { ...runPayload(), undosUsed: G.undosUsed, undoStack: G.undoStack });
}

function applyRun(saved) {
  // PITFALL: older saves stored cascade as mode 'cascade' with no flag; reading them as-is silently forks the run into a plain Classic save.
  G.mode = BASES.includes(saved.mode) ? saved.mode : 'marathon';
  G.cascade = !!saved.cascade || saved.mode === 'cascade';
  G.grid = decodeGrid(saved.grid);
  G.queue = Array.isArray(saved.queue) ? [...saved.queue] : [];
  G.bag = Array.isArray(saved.bag) ? [...saved.bag] : null;
  G.hold = saved.hold ?? null;
  G.canHold = saved.canHold !== false;

  G.score = saved.score | 0;
  G.lines = saved.lines | 0;
  G.level = Math.max(1, saved.level | 0);
  if (G.mode === 'zen') {
    const { zenMin, zenMax } = G.settings;
    G.level = Math.max(zenMin, zenMax ? Math.min(G.level, zenMax) : G.level);
  }
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

const undosLeft = () => Math.max(0, G.settings.undos - G.undosUsed);

const UNDOABLE = { playing: 1, clearing: 1, settling: 1 };

const canUndo = () => !!UNDOABLE[G.state] && undosLeft() > 0 && G.undoStack.length > 1;

function pushUndo() {
  if (!G.settings.undos) return;
  G.undoStack.push(runPayload());
  if (G.undoStack.length > UNDO_MAX + 1) G.undoStack.shift();
}

function refreshUndo() {
  const live = G.state !== 'menu' && G.state !== 'over' && G.state !== 'dying';
  setUndo(G.settings.undos > 0 && live, undosLeft(), canUndo());
}

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

export function pendingRun() {
  const last = loadLastSlot();
  if (loadRun(last)) return last;
  return SLOTS.find(s => loadRun(s)) ?? null;
}

export function resumeRun(slot = pendingRun()) {
  const saved = slot && loadRun(slot);
  if (!saved) { startGame(); return; }
  saveLastSlot(slot);

  G.undosUsed = Math.max(0, saved.undosUsed | 0);
  G.undoStack = Array.isArray(saved.undoStack) ? saved.undoStack : [];
  applyRun(saved);
  if (!G.undoStack.length) pushUndo();

  hideOverlay();
  if (G.state === 'playing') setReady(resumeDelay());
}

export function startGame(mode = 'marathon', cascade = false) {
  commitStats();
  G.mode = mode;
  G.cascade = !!cascade;
  const slot = currentSlot();
  clearRun(slot);
  saveLastSlot(slot);
  G.grid = emptyGrid();
  G.queue = []; G.bag = null; G.hold = null; G.canHold = true;
  G.score = 0; G.lines = 0; G.combo = -1; G.backToBack = false;
  G.level = levelFor(0);
  G.tally = blankTally();
  G.runBest = G.stats[slot].score;
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
  syncLevelPalette();
  fillQueue();
  spawn();
  updateHud();
}

export function gameOver() {
  if (G.state === 'dying' || G.state === 'over') return;
  G.state = 'dying';
  G.active = null;
  G.deathRow = ROWS;
  G.deathTimer = 0;
  refreshUndo();
}

function commitStats() {
  const best = G.stats[currentSlot()];
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
  if (G.cascade) rows.push(['BEST CHAIN', t.chain + '&times;']);
  return `<dl class="tally">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

function finishGameOver() {
  G.state = 'over';
  Sound.over();
  Haptics.over();
  commitStats();
  clearRun(currentSlot());

  showOverlay(`
    <h2${G.newBest ? ' class="record"' : ''}>${G.newBest ? 'NEW HIGH SCORE!' : 'GAME OVER'}</h2>
    <div class="best${G.newBest ? ' new' : ''}">
      <span class="label">SCORE</span>
      <b>${G.score.toLocaleString()}</b>
    </div>
    ${tallyCard()}
    ${G.newBest ? '' : `<p>HIGH SCORE ${G.stats[currentSlot()].score.toLocaleString()}</p>`}
    ${themeBar()}
    ${actionBar([['restart', 'PLAY AGAIN'], ['menu', 'MAIN MENU']])}
  `);
}

function controlsHint() {
  const touch = window.matchMedia?.('(pointer: coarse)')?.matches ?? true;

  const rows = touch
    ? [['DRAG', 'move'], ['TAP', 'rotate'], ['FLICK DOWN', 'hard drop'],
       ['SWIPE UP', 'hold'], ['TWO-FINGER TAP', 'rotate back']]
    : [['&larr; &rarr;', 'move'], ['&uarr; / X', 'rotate'], ['Z', 'rotate back'],
       ['SPACE', 'hard drop'], ['C', 'hold'], ['P', 'pause']];

  const cells = rows.map(([key, action]) => `<dt>${key}</dt><dd>${action}</dd>`).join('');
  return `<dl class="controls">${cells}</dl>`;
}

export function showPauseScreen() {
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

const FEEL = [[3, 'GENTLE'], [6, 'STEADY'], [8, 'BRISK'], [10, 'RELENTLESS']];

const secondsToFloor = level => {
  const frames = GRAVITY_FRAMES[level - 1] ?? GRAVITY_MIN_FRAMES;
  return Math.round(VIS_ROWS * frames * FRAME_MS / 1000);
};
const feelOf = level => FEEL.find(([upto]) => level <= upto)?.[1] ?? 'RELENTLESS';

function settingSubs() {
  const s = G.settings;
  const takeBacks = s.undos === 1 ? '1 TAKE-BACK EACH GAME' : `${s.undos} TAKE-BACKS EACH GAME`;
  return {
    countdown: s.countdown ? '3-2-1 BEFORE PLAY RESUMES' : 'RESUMES THE MOMENT YOU DO',
    cascade: s.cascade ? 'CLEARS DROP INTO THE HOLES' : 'ROWS COLLAPSE WHOLE',
    undos: s.undos ? takeBacks : 'NO TAKE-BACKS',
    zen: s.zenMax
      ? `${feelOf(s.zenMin)} ${secondsToFloor(s.zenMin)}s → ${feelOf(s.zenMax)} ${secondsToFloor(s.zenMax)}s TO THE FLOOR`
      : `${feelOf(s.zenMin)} ${secondsToFloor(s.zenMin)}s, THEN KEEPS SPEEDING UP`,
  };
}

function settingsRows() {
  const s = G.settings;
  const subs = settingSubs();

  const undoOptions = [[0, 'OFF'], ...Array.from({ length: UNDO_MAX }, (_, i) => [i + 1, String(i + 1)])];
  const minOptions = ZEN_LEVELS.map(v => [v, String(v)]);
  const maxOptions = ZEN_CAPS.map(v => [v, v ? String(v) : 'NONE']);

  return `
    <div class="settings">
      ${settingRow('countdown', 'COUNTDOWN',
                   toggle('countdown', s.countdown ? 'ON' : 'OFF', s.countdown), subs.countdown)}
      ${settingRow('cascade', 'CASCADE',
                   toggle('cascade', s.cascade ? 'ON' : 'OFF', s.cascade), subs.cascade)}
      ${settingRow('undos', 'UNDOS', wheel('undos', undoOptions, s.undos), subs.undos)}
      ${settingRow('zen', 'ZEN SPEED', `
        <div class="wheelPair">
          <div class="wheelCol"><span class="wheelTag">MIN</span>${wheel('zenMin', minOptions, s.zenMin)}</div>
          <div class="wheelCol"><span class="wheelTag">MAX</span>${wheel('zenMax', maxOptions, s.zenMax)}</div>
        </div>`, subs.zen)}
    </div>`;
}

export function showSettings() {
  showOverlay(`
    <h2 data-debug>SETTINGS</h2>
    ${settingsRows()}
    ${actionBar([['back', 'BACK']])}
  `, { soft: G.state !== 'menu', modal: true });
}

export function changeSetting(key, value) {
  const s = G.settings;
  const before = { ...s };
  if (key === 'countdown') s.countdown = !s.countdown;
  if (key === 'cascade') s.cascade = !s.cascade;
  if (key === 'undos') s.undos = Math.min(UNDO_MAX, Math.max(0, value | 0));
  if (key === 'zenMin') {
    s.zenMin = ZEN_LEVELS.includes(value) ? value : s.zenMin;
    if (s.zenMax && s.zenMax < s.zenMin) s.zenMax = s.zenMin;
  }
  if (key === 'zenMax') {
    s.zenMax = ZEN_CAPS.includes(value) ? value : s.zenMax;
    if (s.zenMax && s.zenMax < s.zenMin) s.zenMin = s.zenMax;
  }
  saveSettings();

  if (key === 'undos') {
    if (!s.undos) G.undoStack = [];
    else if (!G.undoStack.length && G.active) pushUndo();
  }

  refreshUndo();

  // PITFALL: never re-render the screen for a wheel's own value; rebuilding resets its scroll while iOS momentum is still running and can leave it a number off.
  const turned = key === 'undos' || key === 'zenMin' || key === 'zenMax';
  if (!turned) { showSettings(); return; }

  setSettingText(settingSubs());
  if (key === 'zenMin' && before.zenMax !== s.zenMax) setWheel('zenMax', ZEN_CAPS.indexOf(s.zenMax));
  if (key === 'zenMax' && before.zenMin !== s.zenMin) setWheel('zenMin', ZEN_LEVELS.indexOf(s.zenMin));
}

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

const BASE_MENU = {
  marathon: { name: 'CLASSIC', progress: s => (s.score | 0).toLocaleString() },
  zen: { name: 'ZEN', progress: s => lineCount(s.lines | 0) },
};
const VARIANTS = [[false, 'NORMAL'], [true, 'CASCADE']];

const slotName = slot => {
  const { mode, cascade } = parseSlot(slot);
  return `${BASE_MENU[mode].name} ${cascade ? 'CASCADE' : 'NORMAL'}`;
};

function recordCards() {
  const s = slot => G.stats[slot] ?? { score: 0, lines: 0, combo: 0 };
  if (!SLOTS.some(slot => s(slot).score || s(slot).lines)) return '';

  const heads = BASES.map(m => `<span class="recHead">${BASE_MENU[m].name}</span>`).join('');

  const rows = VARIANTS.map(([cascade, label]) => {
    const cells = BASES.map(mode => {
      const rec = s(slotOf(mode, cascade));
      if (!rec.score && !rec.lines) return '<div class="recordCard empty">&mdash;</div>';
      return `
        <div class="recordCard">
          <b>${rec.score.toLocaleString()}</b>
          <span class="sub">${lineCount(rec.lines)} &nbsp;·&nbsp; ${rec.combo}&times;</span>
        </div>`;
    }).join('');
    return `<span class="recSide">${label}</span>${cells}`;
  }).join('');

  return `<div class="records"><span></span>${heads}${rows}</div>`;
}

let openPick = false;
let menuAt = 0;

export function openPicker() {
  openPick = !openPick;
  renderMenu(false);
}

export function startSlot(mode) {
  startGame(mode, G.settings.cascade);
}

export function showMenu() {
  snapshotRun();
  commitStats();
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

  openPick = false;
  menuAt = Date.now();
  setBoardShowing(false);
  renderMenu(true);
}

function renderMenu(intro) {
  const clears = G.settings.cascade ? 'CASCADE' : 'NORMAL';
  const starts = BASES.map(mode => [`new-${mode}`, `NEW ${BASE_MENU[mode].name}`, clears]);

  const waiting = SLOTS.map(slot => ({ slot, save: loadRun(slot) })).filter(w => w.save);

  const picker = waiting.map(({ slot, save }) => {
    const { mode, cascade } = parseSlot(slot);
    return `<button class="pickRow" data-act="go-${slot}">
        <span>${BASE_MENU[mode].name} · ${cascade ? 'CASCADE' : 'NORMAL'}</span>
        <em>${BASE_MENU[mode].progress(save)}</em>
      </button>`;
  }).join('');

  showOverlay(`
    ${intro ? menuBackdrop() : menuBackdrop((Date.now() - menuAt) / 1000)}
    ${wordmark()}
    ${recordCards()}
    ${themeBar()}
    ${rule()}
    ${actionBar(starts)}
    ${waiting.length ? rule() + `
      <div class="resumeWrap">
        ${openPick ? `<div class="picker">${picker}</div>` : ''}
        ${actionBar([['pick-resume', 'RESUME',
                      waiting.length === 1 ? slotName(waiting[0].slot) : `${waiting.length} RUNS WAITING`]])}
      </div>` : ''}
    ${rule()}
    ${textRow(textButton('how', 'HOW TO PLAY'), textButton('settings', 'SETTINGS'))}
  `, { intro, picking: openPick });
}

// PITFALL: must run after updateKeyRepeat in the same frame, so held-key movement settles before gravity and lock delay apply.
export function update(dt) {
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
