import { COLS, VIS_ROWS, HIDDEN, ROWS, CLEAR_TIME } from './config.js';
import { ROTATIONS, forEachCell } from './pieces.js';
import { theme, setTheme } from './themes.js';
import { G } from './state.js';
import { collides } from './board.js';
import { blockSprite, ghostSprite, grayOf, clearSprites } from './sprites.js';
import { boardCv, boardCtx, holdCv, holdCtx, nextCv, nextCtx, stage, railLeft } from './dom.js';

export const view = { cell: 24, dpr: 1, previewSize: 12 };

let wellCanvas;

export function resize() {
  view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  const railW = railLeft.getBoundingClientRect().width;
  const availW = stage.clientWidth - 20 - railW * 2 - 16; // padding + both rails + gaps
  const availH = stage.clientHeight - 10;
  view.cell = Math.max(8, Math.floor(Math.min(availW / COLS, availH / VIS_ROWS)));

  const w = view.cell * COLS, h = view.cell * VIS_ROWS;
  boardCv.style.width = w + 'px';
  boardCv.style.height = h + 'px';
  boardCv.width = Math.round(w * view.dpr);
  boardCv.height = Math.round(h * view.dpr);
  boardCtx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

  // Previews are width-bound: every spawn orientation is at most 4 cells wide
  // and 2 tall, so size off the rail's inner width and let height follow.
  view.previewSize = Math.max(7, Math.floor((railW - 12) / 4));
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

  if (G.clearRows) {
    const flash = Math.max(0, G.clearTimer / CLEAR_TIME);
    boardCtx.fillStyle = `rgba(${theme.flash},${0.15 + flash * 0.75})`;
    for (const y of G.clearRows) boardCtx.fillRect(0, (y - HIDDEN) * cell, w, cell);
  }

  const a = G.active;
  if (a && G.state === 'playing') {
    let gy = a.y;
    while (!collides(a.m, a.x, gy + 1)) gy++;
    if (gy !== a.y) {
      forEachCell(a.m, (x, y) => {
        const sy = (gy + y - HIDDEN) * cell;
        if (sy > -cell) drawSprite(boardCtx, ghostSprite(theme.pieces[a.type], cell), (a.x + x) * cell, sy);
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

function drawBlock(ctx, px, py, color, size) {
  drawSprite(ctx, blockSprite(color, size), px, py);
}

function drawSprite(ctx, sprite, px, py) {
  const s = sprite.cv.width;
  ctx.drawImage(sprite.cv, px - sprite.pad, py - sprite.pad, s, s);
}

export function drawSidePanels() {
  drawMini(holdCtx, holdCv, G.hold ? [G.hold] : [], G.canHold ? 1 : 0.35);
  drawMini(nextCtx, nextCv, G.queue.slice(0, 3), 1);
}

function drawMini(ctx, cv, types, alpha) {
  const { dpr, previewSize: size } = view;
  const w = cv.width / dpr, h = cv.height / dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!types.length) return;
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
