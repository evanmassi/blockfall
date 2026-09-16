import { G, loadStats, loadSettings, migrateLegacyRun } from './state.js';
import { setTheme, savedThemeName } from './themes.js';
import { resize, render, tickQueue } from './render.js';
import { tickScore, syncScreenHeight } from './ui.js';
import { update, showMenu, togglePause, snapshotRun } from './game.js';
import { updateKeyRepeat } from './input.js';
import { Sound } from './audio.js';
import { muteBtn } from './dom.js';

const BUILD = 'b70';

const DEBUG_KEY = 'blockfall.debug';
const debugging = new URLSearchParams(location.search).has('debug') ||
  (() => { try { return localStorage.getItem(DEBUG_KEY) === '1'; } catch { return false; } })();

// PITFALL: resolved against import.meta.url so it still finds /sw.js when served from a subpath.
if ('serviceWorker' in navigator) {
  if (debugging) {
    navigator.serviceWorker.getRegistrations?.()
      .then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    globalThis.caches?.keys?.().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
    });
  }
}

let marks = 0, markedAt = -Infinity;

document.addEventListener('pointerdown', e => {
  if (!e.target?.closest?.('[data-debug]')) return;
  const now = e.timeStamp ?? 0;
  marks = now - markedAt < 3000 ? marks + 1 : 1;
  markedAt = now;
  if (marks < 5) return;
  marks = 0;
  try {
    const on = localStorage.getItem(DEBUG_KEY) === '1';
    localStorage.setItem(DEBUG_KEY, on ? '0' : '1');
  } catch {}
  location.reload();
}, true);

if (debugging) {
  const out = document.createElement('div');
  out.id = 'debug';
  document.body.appendChild(out);
  document.getElementById('app').classList.add('showBoxes');

  let head = [], tail = [];
  const draw = () => { out.textContent = [`build ${BUILD}`, ...head, ...tail].join('\n'); };
  const post = line => {
    try { new Image().src = '/log?m=' + encodeURIComponent(line) + '&t=' + Date.now(); } catch {}
  };
  const log = line => {
    tail.push(line);
    if (tail.length > 4) tail.shift();
    draw();
    post(line);
  };
  globalThis.__bfLog = log;
  post(`--- session start, build ${BUILD} ---`);

  const boxes = () => {
    const cs = getComputedStyle(document.getElementById('app'));
    const r = sel => {
      const el = sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel);
      const b = el?.getBoundingClientRect?.();
      return b ? `${sel} ${Math.round(b.top)}→${Math.round(b.bottom)}` : `${sel} absent`;
    };
    head = [
      `vp ${innerWidth}x${innerHeight} vis ${Math.round(visualViewport?.height ?? 0)} dpr ${devicePixelRatio}`,
      `screen ${screen?.width}x${screen?.height} outer ${outerWidth}x${outerHeight}`,
      `safe t${cs.paddingTop} b${cs.paddingBottom} standalone=${!!navigator.standalone}`,
      `${r('#app')} ${r('#overlay')}`,
      `${r('.bgfall')} ${r('#stage')}`,
      `html ${Math.round(document.documentElement.getBoundingClientRect().bottom)} ` +
      `body ${Math.round(document.body.getBoundingClientRect().bottom)} ` +
      `ovf ${getComputedStyle(document.body).overflow}`,
      `html=${document.documentElement.style.background || '(css)'} body=${document.body.style.background || '(css)'}`,
    ];
    draw();
    head.forEach(post);
  };

  setTimeout(boxes, 1600);
  addEventListener('resize', () => setTimeout(boxes, 120));
  visualViewport?.addEventListener('resize', () => setTimeout(boxes, 120));
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    document.addEventListener(type, e => {
      const t = e.target;
      const cls = typeof t.className === 'string' && t.className
        ? '.' + t.className.trim().split(/\s+/).join('.') : '';
      const act = t.closest?.('[data-act]')?.dataset.act ?? '-';
      const at = `@${Math.round(e.clientY)}/${innerHeight}`;
      log(`${type}/${e.pointerType || 'x'} ${at} ${t.tagName}${cls} act=${act} → ${G.state}`);
    }, true);
  }
}

document.addEventListener('contextmenu', e => e.preventDefault());

// PITFALL: pagehide, not unload: unload does not fire reliably on iOS when the app is swiped away.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (G.state === 'playing') togglePause();
  else snapshotRun();
});
window.addEventListener('pagehide', snapshotRun);
window.addEventListener('resize', () => { syncScreenHeight(); resize(); });
window.visualViewport?.addEventListener('resize', resize);

let lastFrame = 0;

function frame(t) {
  const dt = Math.min(t - lastFrame, 100);
  lastFrame = t;

  // PITFALL: updateKeyRepeat must run before update() in the same frame.
  if (G.state === 'playing' && G.active && !G.ready) updateKeyRepeat(dt);
  update(dt);
  render();

  tickScore();
  tickQueue(dt);

  requestAnimationFrame(frame);
}

// PITFALL: boot order matters: settings load before showMenu, syncScreenHeight before resize.
migrateLegacyRun();
G.stats = loadStats();
G.settings = loadSettings();
muteBtn.textContent = Sound.muted ? '♪̸' : '♪';
setTheme(savedThemeName());
syncScreenHeight();
resize();
showMenu();
requestAnimationFrame(t => { lastFrame = t; frame(t); });
