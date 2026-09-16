import { CTRL } from './config.js';
import { G } from './state.js';
import { view } from './render.js';
import { Sound } from './audio.js';
import { stage, overlay, pauseBtn, muteBtn, undoBtn } from './dom.js';
import { onOverlayAction } from './ui.js';
import {
  move, rotate, softDrop, hardDrop, holdPiece, undo,
  startGame, startSlot, openPicker, togglePause, showMenu, pendingRun, resumeRun,
  showPauseScreen, showControls, showSettings, changeSetting, closeSubScreen,
} from './game.js';
import { Haptics } from './haptics.js';

const playFromMenu = () => (pendingRun() ? resumeRun() : startGame());

const keys = { left: 0, right: 0, down: 0 };
let dasTimer = 0, arrTimer = 0, softTimer = 0, dasDir = 0;

export function updateKeyRepeat(dt) {
  const dir = keys.left && !keys.right ? -1 : keys.right && !keys.left ? 1 : 0;
  if (dir !== dasDir) { dasDir = dir; dasTimer = 0; arrTimer = 0; }

  if (dir) {
    dasTimer += dt;
    if (dasTimer >= CTRL.das) {
      arrTimer += dt;
      while (arrTimer >= CTRL.arr) { arrTimer -= CTRL.arr; move(dir); }
    }
  }

  if (keys.down) {
    softTimer += dt;
    while (softTimer >= CTRL.softRepeat) { softTimer -= CTRL.softRepeat; if (!softDrop()) break; }
  }
}

document.addEventListener('keydown', e => {
  if (e.repeat) return;

  if (G.state === 'menu' || G.state === 'over') {
    if (e.key === ' ' || e.key === 'Enter') {
      Sound.init();
      if (G.state === 'menu') playFromMenu(); else startGame(G.mode, G.cascade);
    }
    return;
  }
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { togglePause(); return; }
  if (G.state !== 'playing' || G.ready) return;

  switch (e.key) {
    case 'ArrowLeft':  keys.left = 1; move(-1); break;
    case 'ArrowRight': keys.right = 1; move(1); break;
    case 'ArrowDown':  keys.down = 1; softTimer = 0; softDrop(); break;
    case 'ArrowUp': case 'x': case 'X': rotate(1); break;
    case 'z': case 'Z': case 'Control': rotate(-1); break;
    case 'Shift': case 'c': case 'C': holdPiece(); break;
    case ' ': hardDrop(); break;
    default: return;
  }
  e.preventDefault();
});

document.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft') keys.left = 0;
  if (e.key === 'ArrowRight') keys.right = 0;
  if (e.key === 'ArrowDown') keys.down = 0;
});

let gesture = null, extraPointers = 0;

let lastTouchTap = -Infinity;

// PITFALL: pointerdown, not click: click is not guaranteed to arrive under `touch-action: none`.
overlay.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  // PITFALL: a touch also emits a delayed compatibility "mouse" pointerdown that lands on whatever replaced the overlay's contents.
  const now = e.timeStamp ?? 0;
  if (e.pointerType === 'mouse' && now - lastTouchTap < 700) return;
  if (e.pointerType !== 'mouse') lastTouchTap = now;
  e.preventDefault();

  if (e.target.closest?.('[data-theme]')) return;

  if (e.target.closest?.('.menuBtns')) return;

  if (overlay.classList.contains('modal')) return;

  Sound.init();
  if (G.state === 'paused' || G.state === 'pausedClearing') togglePause();
});

onOverlayAction(act => {
  Sound.init();
  if (act === 'new-marathon' || act === 'new-zen') startSlot(act.slice(4));
  else if (act === 'pick-resume') openPicker();
  else if (act.startsWith('go-')) resumeRun(act.slice(3));
  else if (act === 'restart') startGame(G.mode, G.cascade);
  else if (act === 'menu') showMenu();
  else if (act === 'how') showControls();
  else if (act === 'settings') showSettings();
  else if (act === 'back') closeSubScreen();
  else if (act === 'resume') togglePause();
  else if (act.startsWith('set-')) {
    const at = act.lastIndexOf('-');
    changeSetting(act.slice(4, at), Number(act.slice(at + 1)));
  }
  else if (act === 'countdown' || act === 'cascade') changeSetting(act);
  else if (act === 'haptics') {
    Haptics.setEnabled(!Haptics.enabled);
    Haptics.lock();
    showPauseScreen();
  }
});

stage.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (G.state !== 'playing' || G.ready) return;

  if (gesture) { extraPointers++; rotate(-1); return; }

  stage.setPointerCapture?.(e.pointerId);
  gesture = {
    id: e.pointerId,
    startX: e.clientX, startY: e.clientY,
    lastX: e.clientX, lastY: e.clientY,
    lastT: e.timeStamp, startT: e.timeStamp,
    accX: 0, accY: 0, maxDist: 0, dropped: false,
    vy: 0, burstY: 0,
  };
});

stage.addEventListener('pointermove', e => {
  if (!gesture || e.pointerId !== gesture.id || gesture.dropped) return;

  const dx = e.clientX - gesture.lastX, dy = e.clientY - gesture.lastY;
  const dt = Math.max(1, e.timeStamp - gesture.lastT);
  gesture.lastX = e.clientX; gesture.lastY = e.clientY; gesture.lastT = e.timeStamp;

  const totalX = e.clientX - gesture.startX, totalY = e.clientY - gesture.startY;
  gesture.maxDist = Math.max(gesture.maxDist, Math.hypot(totalX, totalY));

  gesture.vy += (dy / dt - gesture.vy) * CTRL.flickSmooth;
  const fastDown = gesture.vy >= CTRL.flickVel * 0.5;
  if (!fastDown) gesture.burstY = 0;
  else if (dy > 0) gesture.burstY += dy;

  if (gesture.vy > CTRL.flickVel &&
      gesture.burstY > view.cell * CTRL.flickDist &&
      Math.abs(totalY) > Math.abs(totalX)) {
    gesture.dropped = true;
    hardDrop();
    return;
  }

  if (fastDown && dy > Math.abs(dx)) {
    gesture.accX = 0;
  } else {
    gesture.accX += dx;
    const stepX = view.cell * CTRL.moveStep;
    while (Math.abs(gesture.accX) >= stepX) {
      const dir = Math.sign(gesture.accX);
      gesture.accX -= dir * stepX;
      if (!move(dir)) { gesture.accX = 0; break; }
    }
  }

  if (dy > 0) {
    gesture.accY += dy;
    const stepY = view.cell * CTRL.softStep;
    while (gesture.accY >= stepY) {
      gesture.accY -= stepY;
      if (!softDrop()) { gesture.accY = 0; break; }
    }
  } else {
    gesture.accY = 0;
  }
});

function endGesture(e) {
  if (!gesture || e.pointerId !== gesture.id) return;
  const g = gesture;
  gesture = null;

  if (extraPointers > 0) { extraPointers = 0; return; }
  if (g.dropped || G.state !== 'playing') return;

  const totalX = e.clientX - g.startX, totalY = e.clientY - g.startY;
  const elapsed = e.timeStamp - g.startT;

  if (-totalY > view.cell * CTRL.holdSwipe && Math.abs(totalY) > Math.abs(totalX) * 1.5) { holdPiece(); return; }
  if (g.maxDist < CTRL.tapDist && elapsed < CTRL.tapTime) rotate(1);
}

stage.addEventListener('pointerup', endGesture);
stage.addEventListener('pointercancel', e => { if (gesture && e.pointerId === gesture.id) gesture = null; });

// PITFALL: WebKit-only pinch-zoom events; touch-action alone does not stop them on iOS.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, e => e.preventDefault());
}
document.addEventListener('dblclick', e => e.preventDefault());

pauseBtn.addEventListener('click', () => { Sound.init(); togglePause(); });

undoBtn.addEventListener('pointerdown', e => {
  e.stopPropagation();
  e.preventDefault();
  Sound.init();
  undo();
});

muteBtn.addEventListener('click', () => {
  Sound.muted = !Sound.muted;
  localStorage.setItem('blockfall.muted', Sound.muted ? '1' : '0');
  muteBtn.textContent = Sound.muted ? '♪̸' : '♪';
});
