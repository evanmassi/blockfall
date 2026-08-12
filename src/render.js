// All canvas drawing and the layout maths that sizes it. Reads G, never writes
// it, so a dropped frame can only ever cost a repaint.

import { COLS, VIS_ROWS, HIDDEN, ROWS, CLEAR_FX } from './config.js';
import { ROTATIONS, forEachCell, bounds } from './pieces.js';
import { theme, setTheme, applyLevelPalette } from './themes.js';
import { G } from './state.js';
import { collides } from './board.js';
import { blockSprite, ghostSprite, grayOf, rgbOf, clearSprites } from './sprites.js';
import { boardCv, boardCtx, holdCv, holdCtx, nextCv, nextCtx, app, hud, stage, railLeft, railRight } from './dom.js';
// railLeft/railRight are sized directly rather than measured — reading back a
// width we just wrote would force an extra layout every resize.

// CSS pixels. `cell` is also what input.js measures gestures against, so a drag
// covers the same number of cells on any screen.
export const view = { cell: 24, dpr: 1, previewSize: 12 };

let wellCanvas;

// A repaint also forces the overlay's backdrop-filter to re-blur, so static
// screens redrawing at 120Hz cost about what playing does.
let dirty = true, lastState = null;

const MIN_RAIL = 46, MAX_RAIL = 88;
const PAD_X = 20, PAD_Y = 10, GAPS = 16;

export function resize() {
  view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  // The app box, not the stage: the stage is sized by its contents, so asking
  // its height would echo back the board we are about to size.
  const appStyle = getComputedStyle(app);
  const appInner = app.clientHeight
    - (parseFloat(appStyle.paddingTop) || 0)
    - (parseFloat(appStyle.paddingBottom) || 0);

  // A 10x20 well on a tall phone is width-bound, so rails are sized last: the
  // board takes every pixel its height can use, the remainder becomes rail.
  const availH = appInner - hud.offsetHeight - PAD_Y;
  const totalW = stage.clientWidth - PAD_X - GAPS;
  const cellByH = Math.floor(availH / VIS_ROWS);

  const railW = Math.max(MIN_RAIL, Math.min(MAX_RAIL, Math.round((totalW - cellByH * COLS) / 2)));
  document.documentElement.style.setProperty('--rail', railW + 'px');

  view.cell = Math.max(8, Math.min(cellByH, Math.floor((totalW - railW * 2) / COLS)));

  const w = view.cell * COLS, h = view.cell * VIS_ROWS;
  boardCv.style.width = w + 'px';
  boardCv.style.height = h + 'px';
  boardCv.width = Math.round(w * view.dpr);
  boardCv.height = Math.round(h * view.dpr);
  boardCtx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

  // The board is centred in the screen's vertical slack, so rails have to be
  // pinned to its height or their contents float above it.
  railLeft.style.height = h + 'px';
  railRight.style.height = h + 'px';

  // Every spawn orientation is at most 4 cells wide and 2 tall, so previews are
  // width-bound: size off the rail's inner width and let height follow.
  view.previewSize = Math.max(6, Math.floor((railW - 12) / 4));
  view.nextTail = Math.max(5, Math.round(view.previewSize * NEXT_TAIL));
  sizeMini(holdCv, holdCtx, view.previewSize * 4 + 2, view.previewSize * 2 + 4);
  sizeMini(nextCv, nextCtx, view.previewSize * 4 + 2, nextSlotTop(NEXT_SHOWN));

  clearSprites();
  buildWell();
  drawSidePanels();
  dirty = true;
}

// Swaps palette without recomputing layout: the sprite cache and the
// pre-rendered well both bake in theme colors, so both have to go.
export function applyTheme(name) {
  setTheme(name);
  applyLevelPalette(G.level); // a theme picked mid-run joins at the right level
  clearSprites();
  buildWell();
  drawSidePanels();
  dirty = true;
}

/** Called on level-up. Repaints only when the palette actually moved. */
export function syncLevelPalette() {
  if (!applyLevelPalette(G.level)) return;
  clearSprites();
  drawSidePanels();
  dirty = true;
}

function sizeMini(cv, ctx, w, h) {
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  cv.width = Math.round(w * view.dpr);
  cv.height = Math.round(h * view.dpr);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}

function buildWell() {
  const { cell, dpr } = view;
  const w = cell * COLS, h = cell * VIS_ROWS;

  wellCanvas = document.createElement('canvas');
  wellCanvas.width = Math.round(w * dpr);
  wellCanvas.height = Math.round(h * dpr);
  const g = wellCanvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  g.fillStyle = theme.well;
  g.fillRect(0, 0, w, h);

  g.strokeStyle = theme.gridLine;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 1; x < COLS; x++) { g.moveTo(x * cell + .5, 0); g.lineTo(x * cell + .5, h); }
  for (let y = 1; y < VIS_ROWS; y++) { g.moveTo(0, y * cell + .5); g.lineTo(w, y * cell + .5); }
  g.stroke();

  const vig = g.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,.45)');
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);
}

export function render() {
  const moving = G.state === 'playing' || G.state === 'clearing' || G.state === 'dying'
    || G.particles.length > 0 || G.shake > 0;
  if (!moving && !dirty && G.state === lastState) return;
  lastState = G.state;
  dirty = false;

  const { cell, dpr } = view;
  const w = cell * COLS, h = cell * VIS_ROWS;

  boardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  boardCtx.clearRect(0, 0, w, h);

  if (G.shake > 0) {
    boardCtx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  }

  boardCtx.drawImage(wellCanvas, 0, 0, w, h);

  for (let y = HIDDEN; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = G.grid[y][x];
      if (!t) continue;
      const color = theme.pieces[t];
      drawBlock(boardCtx, x * cell, (y - HIDDEN) * cell, y >= G.deathRow ? grayOf(color) : color, cell, t);
    }
  }

  if (G.clearRows) drawClearFx(w, h, cell);

  const a = G.active;
  if (a && G.state === 'playing') {
    let gy = a.y;
    while (!collides(a.m, a.x, gy + 1)) gy++;
    if (gy !== a.y) {
      forEachCell(a.m, (x, y) => {
        const sy = (gy + y - HIDDEN) * cell;
        if (sy > -cell) drawSprite(boardCtx, ghostSprite(theme.pieces[a.type], cell, theme), (a.x + x) * cell, sy);
      });
    }
    forEachCell(a.m, (x, y) => {
      const sy = (a.y + y - HIDDEN) * cell;
      if (sy > -cell) drawBlock(boardCtx, (a.x + x) * cell, sy, theme.pieces[a.type], cell, a.type);
    });
  }

  for (const p of G.particles) {
    boardCtx.globalAlpha = Math.max(0, p.life);
    boardCtx.fillStyle = p.color;
    boardCtx.fillRect(p.x, p.y, p.size, p.size);
  }
  boardCtx.globalAlpha = 1;
}

// Escalates with the row count: the bar thickens and tints as the clear grows,
// and a Tetris additionally throws columns of light up through the board.
function drawClearFx(w, h, cell) {
  const fx = CLEAR_FX[Math.min(G.clearCount, 4)] || CLEAR_FX[1];
  const p = Math.min(1, Math.max(0, 1 - G.clearTimer / G.clearTime)); // 0 -> 1
  const rgb = fx.tint === 'I' ? rgbOf(theme.pieces.I)
            : fx.tint === 'accent' ? rgbOf(theme.accent)
            : theme.flash;

  const wash = Math.max(0, 1 - p * 1.35);
  boardCtx.fillStyle = `rgba(${theme.flash},${0.12 + wash * 0.78})`;
  for (const y of G.clearRows) boardCtx.fillRect(0, (y - HIDDEN) * cell, w, cell);

  // Bar sweeps out from the middle over the first half, then fades.
  const grow = Math.min(1, p / 0.5);
  const barW = w * (1 - Math.pow(1 - grow, 3));
  const barH = cell * fx.beam;
  const fade = p < 0.5 ? 1 : Math.max(0, 1 - (p - 0.5) / 0.5);

  if (barW > 1) {
    const x0 = (w - barW) / 2;
    const grad = boardCtx.createLinearGradient(x0, 0, x0 + barW, 0);
    grad.addColorStop(0, `rgba(${rgb},0)`);
    grad.addColorStop(0.5, `rgba(${rgb},1)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    boardCtx.globalAlpha = fade;
    boardCtx.fillStyle = grad;
    for (const y of G.clearRows) {
      boardCtx.fillRect(x0, (y - HIDDEN + 0.5) * cell - barH / 2, barW, barH);
    }
    boardCtx.globalAlpha = 1;
  }

  if (G.clearCount >= 4) {
    const bandCY = (Math.min(...G.clearRows) - HIDDEN + G.clearRows.length / 2) * cell;
    const rise = h * Math.min(1, p * 1.4);
    if (rise > 1) {
      const col = boardCtx.createLinearGradient(0, bandCY, 0, bandCY - rise);
      col.addColorStop(0, `rgba(${rgb},.55)`);
      col.addColorStop(1, `rgba(${rgb},0)`);
      boardCtx.globalAlpha = Math.max(0, 1 - p * 1.1);
      boardCtx.fillStyle = col;
      const cw = cell * 0.45;
      for (let i = 0; i < 6; i++) {
        boardCtx.fillRect((i + 0.5) / 6 * w - cw / 2, bandCY - rise, cw, rise);
      }
      boardCtx.globalAlpha = 1;
    }
  }
}

// `type` cannot be inferred from colour: Game Boy picks a fill pattern per
// piece, and the death curtain greys the colour while identity must survive.
function drawBlock(ctx, px, py, color, size, type, th = theme) {
  drawSprite(ctx, blockSprite(color, size, th, type), px, py);
}

function drawSprite(ctx, sprite, px, py) {
  const s = sprite.cv.width;
  ctx.drawImage(sprite.cv, px - sprite.pad, py - sprite.pad, s, s);
}

// A miniature of the real thing — colour chips alone don't tell you what a
// theme looks like.
const PREVIEW_STACK = [
  [0, 3, 'I'], [1, 3, 'J'], [2, 3, 'L'], [3, 3, 'S'], [4, 3, 'T'],
  [1, 2, 'Z'], [3, 2, 'O'],
];

/** `th` is any THEMES entry, not necessarily the active one — the picker has to
 *  show palettes that are not applied. */
export function drawThemePreview(cv, th) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = cv.clientWidth || 64, h = cv.clientHeight || 52;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);

  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  g.fillStyle = th.well;
  g.fillRect(0, 0, w, h);

  const cell = Math.floor(Math.min(w / 5, h / 4));
  const ox = Math.round((w - cell * 5) / 2), oy = h - cell * 4;

  g.strokeStyle = th.gridLine;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 1; x < 5; x++) { g.moveTo(ox + x * cell + .5, 0); g.lineTo(ox + x * cell + .5, h); }
  for (let y = 1; y < 4; y++) { g.moveTo(0, oy + y * cell + .5); g.lineTo(w, oy + y * cell + .5); }
  g.stroke();

  for (const [x, y, type] of PREVIEW_STACK) {
    drawBlock(g, ox + x * cell, oy + y * cell, th.pieces[type], cell, type, th);
  }

  if (th.scanlines) {
    g.fillStyle = 'rgba(0,0,0,.22)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y + 2, w, 2);
  }
}

/** One menu-backdrop piece, drawn with the real block renderer so it carries
 *  the theme's bevel, glow and Game Boy fill marks rather than a flat chip. */
export function drawDebris(cv, type, cell, th = theme) {
  const m = ROTATIONS[type][0];
  const b = bounds(m);
  // Sprites overdraw by half a cell for their glow; without matching padding
  // here it is clipped square at the piece's edge.
  const pad = Math.ceil(cell * 0.5);
  const w = b.w * cell + pad * 2, h = b.h * cell + pad * 2;

  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);

  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  forEachCell(m, (x, y) => {
    drawBlock(g, pad + (x - b.x) * cell, pad + (y - b.y) * cell, th.pieces[type], cell, type, th);
  });
}

// The L tetromino in its first rotation is, conveniently, the letter L.
const WORDMARK_L = [[0, 0], [0, 1], [0, 2], [1, 2]];

/** Draws the title's L glyph. Sized by CSS to 1cap, so it matches the type. */
export function drawWordmarkL(cv, th = theme) {
  const cell = 26, pad = 3;
  cv.width = cell * 2 + pad * 2;
  cv.height = cell * 3 + pad * 2;
  const g = cv.getContext('2d');
  for (const [x, y] of WORDMARK_L) {
    drawBlock(g, pad + x * cell, pad + y * cell, th.pieces.L, cell, 'L', th);
  }
}

// ---------- next queue ----------

const NEXT_SHOWN = 3;
const NEXT_TAIL = 0.68;   // the two behind the lead are drawn smaller
const NEXT_SLIDE_MS = 190;

let nextShown = [];       // what the canvas currently depicts
let slideFrom = null;     // the pre-shift queue, while animating
let slideT = 1;           // 0 -> 1 progress; 1 means settled

/** Fractional index, so a piece can sit between two slots mid-slide. */
function nextSlotTop(f) {
  const lead = view.previewSize * 2 + 12;
  const tail = view.nextTail * 2 + 10;
  return f <= 1 ? lead * f : lead + tail * (f - 1);
}

function nextSlotHeight(f) {
  return f < 1 ? view.previewSize * 2 + 12 : view.nextTail * 2 + 10;
}

function nextScale(f) {
  if (f <= 0) return 1;
  if (f >= 1) return NEXT_TAIL;
  return 1 - (1 - NEXT_TAIL) * f;
}

// Centres on the filled bounding box, not the matrix, so a 4x4 I and a 3x3 T
// both sit visually centred. Shared by the HOLD slot and the queue.
function drawPieceInBox(ctx, type, w, top, slotH, size, alpha = 1) {
  const m = ROTATIONS[type][0];
  let minX = 9, maxX = -1, minY = 9, maxY = -1;
  forEachCell(m, (x, y) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  const pw = (maxX - minX + 1) * size, ph = (maxY - minY + 1) * size;
  const ox = (w - pw) / 2 - minX * size;
  const oy = top + (slotH - ph) / 2 - minY * size;

  ctx.globalAlpha = alpha;
  forEachCell(m, (x, y) => drawBlock(ctx, ox + x * size, oy + y * size, theme.pieces[type], size, type));
  ctx.globalAlpha = 1;
}

function drawNext() {
  const { dpr } = view;
  const w = nextCv.width / dpr, h = nextCv.height / dpr;
  nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  nextCtx.clearRect(0, 0, w, h);

  const sliding = slideT < 1 && slideFrom;
  const list = sliding ? slideFrom : nextShown;
  const shift = sliding ? 1 - Math.pow(1 - slideT, 3) : 0; // eased so it settles

  list.forEach((type, i) => {
    const f = i - shift;
    if (f < -1 || f > NEXT_SHOWN) return;
    // Fades out past the top, and in as the fourth piece rises into view.
    const alpha = f < 0 ? Math.max(0, 1 + f)
                : f > NEXT_SHOWN - 1 ? Math.max(0, NEXT_SHOWN - f)
                : 1;
    const size = Math.max(4, Math.round(view.previewSize * nextScale(f)));
    drawPieceInBox(nextCtx, type, w, nextSlotTop(f), nextSlotHeight(f), size, alpha);
  });
}

function drawHold() {
  const { dpr, previewSize: size } = view;
  const w = holdCv.width / dpr, h = holdCv.height / dpr;

  holdCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  holdCtx.clearRect(0, 0, w, h);

  if (!G.hold) { drawEmptySlot(holdCtx, w, h); return; }
  drawPieceInBox(holdCtx, G.hold, w, 0, h, size, G.canHold ? 1 : 0.35); // dim = spent
}

export function drawSidePanels() {
  drawHold();

  // One extra, so the piece rising into the last slot has something to be. A
  // queue that shifted by exactly one animates; anything else snaps.
  const now = G.queue.slice(0, NEXT_SHOWN + 1);
  if (nextShown.length > 1 && now[0] === nextShown[1]) {
    slideFrom = nextShown;
    slideT = 0;
  } else {
    slideFrom = null;
    slideT = 1;
  }
  nextShown = now;
  drawNext();
}

/** From the frame loop, not on queue changes. */
export function tickQueue(dt) {
  if (slideT >= 1) return;
  slideT = Math.min(1, slideT + dt / NEXT_SLIDE_MS);
  drawNext();
}

// Otherwise an empty HOLD slot reads as dead space rather than a destination.
function drawEmptySlot(ctx, w, h) {
  const bw = Math.round(view.previewSize * 2.4), bh = Math.round(view.previewSize * 1.5);
  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = theme.dim;
  ctx.lineWidth = 1;
  ctx.setLineDash?.([3, 3]);
  ctx.strokeRect(Math.round((w - bw) / 2) + .5, Math.round((h - bh) / 2) + .5, bw, bh);
  ctx.setLineDash?.([]);
  ctx.globalAlpha = 1;
}

