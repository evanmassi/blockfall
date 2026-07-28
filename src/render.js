// All canvas drawing and the layout maths that sizes it. Reads G but never
// writes it: nothing here changes the game, so a dropped frame can only ever
// cost a repaint.

import { COLS, VIS_ROWS, HIDDEN, ROWS, CLEAR_FX } from './config.js';
import { ROTATIONS, forEachCell } from './pieces.js';
import { theme, setTheme } from './themes.js';
import { G } from './state.js';
import { collides } from './board.js';
import { blockSprite, ghostSprite, grayOf, rgbOf, clearSprites } from './sprites.js';
import { boardCv, boardCtx, holdCv, holdCtx, nextCv, nextCtx, stage, railLeft, railRight } from './dom.js';
// railLeft/railRight are sized directly rather than measured — reading back a
// width we just wrote would force an extra layout every resize.

/**
 * Current layout, in CSS pixels. `cell` is also the unit input.js measures
 * gestures against, so a drag covers the same number of cells on any screen.
 */
export const view = { cell: 24, dpr: 1, previewSize: 12 };

let wellCanvas;

const MIN_RAIL = 46, MAX_RAIL = 88;
const PAD_X = 20, PAD_Y = 10, GAPS = 16;

export function resize() {
  view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  // A 10x20 well on a tall phone is width-bound with height to spare, so the
  // rails get sized last: the board takes every pixel of width its height can
  // actually use, and whatever is left over becomes rail.
  const availH = stage.clientHeight - PAD_Y;
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

  // The board is centred in whatever vertical slack the screen has, so the
  // rails have to be pinned to its height or their contents float above it.
  railLeft.style.height = h + 'px';
  railRight.style.height = h + 'px';

  // Previews are width-bound: every spawn orientation is at most 4 cells wide
  // and 2 tall, so size off the rail's inner width and let height follow.
  view.previewSize = Math.max(6, Math.floor((railW - 12) / 4));
  sizeMini(holdCv, holdCtx, view.previewSize * 4 + 2, view.previewSize * 2 + 4);
  sizeMini(nextCv, nextCtx, view.previewSize * 4 + 2, (view.previewSize * 2 + 8) * 3);

  clearSprites();
  buildWell();
  drawSidePanels();
}

// Swaps palette without recomputing layout: the sprite cache and the
// pre-rendered well both bake in theme colors, so both have to go.
export function applyTheme(name) {
  setTheme(name);
  clearSprites();
  buildWell();
  drawSidePanels();
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
      drawBlock(boardCtx, x * cell, (y - HIDDEN) * cell, y >= G.deathRow ? grayOf(color) : color, cell);
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
      if (sy > -cell) drawBlock(boardCtx, (a.x + x) * cell, sy, theme.pieces[a.type], cell);
    });
  }

  for (const p of G.particles) {
    boardCtx.globalAlpha = Math.max(0, p.life);
    boardCtx.fillStyle = p.color;
    boardCtx.fillRect(p.x, p.y, p.size, p.size);
  }
  boardCtx.globalAlpha = 1;
}

// Escalates with the number of rows: every clear washes out and fires a light
// bar along each row, but the bar thickens and tints as the clear grows, and a
// Tetris additionally throws columns of light up through the board.
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

function drawBlock(ctx, px, py, color, size, th = theme) {
  drawSprite(ctx, blockSprite(color, size, th), px, py);
}

function drawSprite(ctx, sprite, px, py) {
  const s = sprite.cv.width;
  ctx.drawImage(sprite.cv, px - sprite.pad, py - sprite.pad, s, s);
}

// A miniature of the real thing: that theme's well, grid, bevel, glow and
// scanlines. Colour chips alone don't tell you what a theme actually looks like.
const PREVIEW_STACK = [
  [0, 3, 'I'], [1, 3, 'J'], [2, 3, 'L'], [3, 3, 'S'], [4, 3, 'T'],
  [1, 2, 'Z'], [3, 2, 'O'],
];

/**
 * Paints a miniature well into `cv` using `th` — a THEMES entry, not
 * necessarily the active theme. That is the whole point: the picker has to
 * show palettes that are not currently applied.
 */
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
    drawBlock(g, ox + x * cell, oy + y * cell, th.pieces[type], cell, th);
  }

  if (th.scanlines) {
    g.fillStyle = 'rgba(0,0,0,.22)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y + 2, w, 2);
  }
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
    drawBlock(g, pad + x * cell, pad + y * cell, th.pieces.L, cell, th);
  }
}

export function drawSidePanels() {
  drawMini(holdCtx, holdCv, G.hold ? [G.hold] : [], G.canHold ? 1 : 0.35);
  drawMini(nextCtx, nextCv, G.queue.slice(0, 3), 1);
}

// An empty HOLD slot otherwise reads as dead space rather than somewhere a
// piece can go.
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

function drawMini(ctx, cv, types, alpha) {
  const { dpr, previewSize: size } = view;
  const w = cv.width / dpr, h = cv.height / dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!types.length) { drawEmptySlot(ctx, w, h); return; }
  ctx.globalAlpha = alpha;

  const slotH = h / types.length;

  types.forEach((type, i) => {
    const m = ROTATIONS[type][0];
    let minX = 9, maxX = -1, minY = 9, maxY = -1;
    forEachCell(m, (x, y) => {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    const pw = (maxX - minX + 1) * size, ph = (maxY - minY + 1) * size;
    const ox = (w - pw) / 2 - minX * size;
    const oy = i * slotH + (slotH - ph) / 2 - minY * size;
    forEachCell(m, (x, y) => drawBlock(ctx, ox + x * size, oy + y * size, theme.pieces[type], size));
  });

  ctx.globalAlpha = 1;
}
