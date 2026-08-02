// Pre-rendered block sprites, baked once per (theme, colour, size) so the frame
// loop only calls drawImage. shadowBlur per block per frame is far too slow on
// a phone.

const sprites = new Map();

/** Must be called whenever the theme or the cell size changes. */
export function clearSprites() { sprites.clear(); }

// `th` is passed rather than read from the module so the picker can draw a
// swatch in a palette that isn't the active one.
export function blockSprite(color, size, th, type) {
  const key = th.key + (type || '') + color + '@' + size;
  if (sprites.has(key)) return sprites.get(key);

  const style = th.block;
  const kind = style.style || 'bevel';
  const pad = Math.ceil(size * 0.5);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size + pad * 2;
  const g = cv.getContext('2d');
  g.translate(pad, pad);

  // Only the bevel treats cells as separate objects; the hardware styles butt
  // together, their outlines forming the grid.
  const gap = kind === 'bevel' ? Math.max(1, Math.round(size * 0.045)) : 0;
  const x0 = gap, y0 = gap, s = size - gap * 2;

  if (style.glow > 0) {
    g.shadowColor = color;
    g.shadowBlur = size * 0.42 * style.glow;
  }
  g.fillStyle = color;
  g.fillRect(x0, y0, s, s);
  g.fillRect(x0, y0, s, s);
  g.shadowBlur = 0;

  if (kind === 'inset') paintInset(g, x0, y0, s, th, type);
  else if (kind === 'nes') paintNes(g, x0, y0, s, th, type);
  else paintBevel(g, x0, y0, s, th);

  const sprite = { cv, pad };
  sprites.set(key, sprite);
  return sprite;
}

/** Raised 3D block: lit top-left, shaded bottom-right. */
function paintBevel(g, x0, y0, s, th) {
  const style = th.block;
  const b = Math.max(1, Math.round(s * 0.16));

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
}

// On a monochrome LCD the fill pattern, not the colour, identifies a piece.
export const INSET_MARKS = {
  I: 'stipple',
  J: 'ringLarge',
  L: 'fillSmall',
  O: 'fillLarge',
  S: 'ringSmall',
  T: 'dot',
  Z: 'solid',
};

// No lighting: the LCD had none, and a bevel reads as the wrong machine.
function paintInset(g, x0, y0, s, th, type) {
  const style = th.block;
  const edge = Math.max(1, Math.round(s * 0.1));
  const ink = style.outline;
  const light = `rgba(255,255,255,${style.light})`;

  g.strokeStyle = ink;
  g.lineWidth = edge;
  g.strokeRect(x0 + edge / 2, y0 + edge / 2, s - edge, s - edge);

  const square = (insetFrac, filled) => {
    const i = Math.max(edge + 1, Math.round(s * insetFrac));
    const w = s - i * 2;
    if (w <= 1) return;
    if (filled) {
      g.fillStyle = light;
      g.fillRect(x0 + i, y0 + i, w, w);
    }
    g.strokeStyle = ink;
    g.lineWidth = Math.max(1, Math.round(s * 0.07));
    g.strokeRect(x0 + i, y0 + i, w, w);
  };

  switch (INSET_MARKS[type] || 'fillSmall') {
    case 'solid':
      break;
    case 'ringLarge':
      square(0.2, false);
      break;
    case 'fillLarge':
      square(0.2, true);
      break;
    case 'ringSmall':
      square(0.32, false);
      break;
    case 'fillSmall':
      square(0.32, true);
      break;
    case 'dot': {
      const d = Math.max(1, Math.round(s * 0.2));
      g.fillStyle = ink;
      g.fillRect(x0 + Math.round((s - d) / 2), y0 + Math.round((s - d) / 2), d, d);
      break;
    }
    case 'stipple': {
      const cells = 4;
      const step = (s - edge * 2) / cells;
      const d = Math.max(1, Math.round(step * 0.62));
      g.fillStyle = light;
      for (let row = 0; row < cells; row++) {
        for (let col = 0; col < cells; col++) {
          if ((row + col) % 2) continue;
          g.fillRect(
            x0 + edge + Math.round(col * step + (step - d) / 2),
            y0 + edge + Math.round(row * step + (step - d) / 2),
            d, d
          );
        }
      }
      break;
    }
  }
}

// Two tiles per level on the hardware: a solid square with a corner highlight,
// and a hollow ring for the pale piece. Ring goes to the near-white pieces,
// which also fixes a white highlight being invisible on a white block.
export const NES_MARKS = {
  I: 'solid', J: 'solid', L: 'solid', S: 'solid', Z: 'solid',
  O: 'ring', T: 'ring', // the level's white pieces
};

function paintNes(g, x0, y0, s, th, type) {
  const style = th.block;
  const lw = Math.max(1, Math.round(s * 0.1));

  if (NES_MARKS[type] === 'ring') {
    const inset = Math.max(lw + 1, Math.round(s * 0.26));
    g.fillStyle = th.well;
    g.fillRect(x0 + inset, y0 + inset, s - inset * 2, s - inset * 2);
  } else {
    g.strokeStyle = `rgba(255,255,255,${style.light})`;
    g.lineWidth = lw;
    g.strokeRect(x0 + lw / 2, y0 + lw / 2, s - lw, s - lw);

    // Three pixels, not a 2x2 block — that L is the original tile's highlight.
    const u = Math.max(1, Math.round(s * 0.15));
    const hx = x0 + Math.round(lw * 1.5), hy = y0 + Math.round(lw * 1.5);
    g.fillStyle = `rgba(255,255,255,${Math.min(1, style.light + 0.35)})`;
    g.fillRect(hx, hy, u, u);
    g.fillRect(hx + u, hy, u, u);
    g.fillRect(hx, hy + u, u, u);
  }

  g.strokeStyle = style.outline;
  g.lineWidth = 1;
  g.strokeRect(x0 + .5, y0 + .5, s - 1, s - 1);
}

export function ghostSprite(color, size, th) {
  const key = 'ghost' + th.key + color + '@' + size;
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

// "r,g,b" so callers can build rgba() strings with their own alpha.
export function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

const grayCache = new Map();

/** Luminance-preserving grey, so a drained stack stays readable as shapes. */
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
