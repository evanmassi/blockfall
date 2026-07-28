import { theme } from './themes.js';

const sprites = new Map();

export function clearSprites() { sprites.clear(); }

// Hard-edged square with a classic raised bevel: lit top/left, shaded bottom/right.
// Glow is baked in here so nothing needs shadowBlur at frame time; how much of
// it there is comes from the theme, since it has to go near zero on a light well.
export function blockSprite(color, size) {
  const key = theme.key + color + '@' + size;
  if (sprites.has(key)) return sprites.get(key);

  const style = theme.block;
  const pad = Math.ceil(size * 0.5);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size + pad * 2;
  const g = cv.getContext('2d');
  g.translate(pad, pad);

  const gap = Math.max(1, Math.round(size * 0.045));
  const x0 = gap, y0 = gap, s = size - gap * 2;
  const b = Math.max(1, Math.round(s * 0.16));

  if (style.glow > 0) {
    g.shadowColor = color;
    g.shadowBlur = size * 0.42 * style.glow;
  }
  g.fillStyle = color;
  g.fillRect(x0, y0, s, s);
  g.fillRect(x0, y0, s, s);
  g.shadowBlur = 0;

  g.beginPath();
  g.moveTo(x0, y0); g.lineTo(x0 + s, y0);
  g.lineTo(x0 + s - b, y0 + b); g.lineTo(x0 + b, y0 + b);
  g.lineTo(x0 + b, y0 + s - b); g.lineTo(x0, y0 + s);
  g.closePath();
  g.fillStyle = `rgba(255,255,255,${style.light})`;
  g.fill();

  g.beginPath();
  g.moveTo(x0 + s, y0); g.lineTo(x0 + s, y0 + s); g.lineTo(x0, y0 + s);
  g.lineTo(x0 + b, y0 + s - b); g.lineTo(x0 + s - b, y0 + s - b); g.lineTo(x0 + s - b, y0 + b);
  g.closePath();
  g.fillStyle = `rgba(0,0,0,${style.shade})`;
  g.fill();

  g.strokeStyle = style.outline;
  g.lineWidth = 1;
  g.strokeRect(x0 + .5, y0 + .5, s - 1, s - 1);

  const sprite = { cv, pad };
  sprites.set(key, sprite);
  return sprite;
}

export function ghostSprite(color, size) {
  const key = 'ghost' + theme.key + color + '@' + size;
  if (sprites.has(key)) return sprites.get(key);

  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const gap = Math.max(1, Math.round(size * 0.045));
  const lw = Math.max(1, Math.round(size * 0.08));

  g.globalAlpha = 0.45;
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.strokeRect(gap + lw / 2, gap + lw / 2, size - gap * 2 - lw, size - gap * 2 - lw);
  g.globalAlpha = 0.09;
  g.fillStyle = color;
  g.fillRect(gap, gap, size - gap * 2, size - gap * 2);

  const sprite = { cv, pad: 0 };
  sprites.set(key, sprite);
  return sprite;
}

const grayCache = new Map();

export function grayOf(hex) {
  let out = grayCache.get(hex);
  if (out) return out;
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  const v = Math.round(38 + lum * 0.4);
  out = '#' + ((v << 16) | (v << 8) | v).toString(16).padStart(6, '0');
  grayCache.set(hex, out);
  return out;
}
