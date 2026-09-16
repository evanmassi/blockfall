const SHAPES = {
  I: ['....','IIII','....','....'],
  J: ['J..','JJJ','...'],
  L: ['..L','LLL','...'],
  O: ['OO','OO'],
  S: ['.SS','SS.','...'],
  T: ['.T.','TTT','...'],
  Z: ['ZZ.','.ZZ','...'],
};

export const TYPES = Object.keys(SHAPES);

// PITFALL: SRS kick tables here are already flipped to screen space (+y is down), so they differ from the published ones.
export const KICKS = {
  JLSTZ: {
    '0>1':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '1>0':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '1>2':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '2>1':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '2>3':[[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '3>2':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '3>0':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '0>3':[[0,0],[1,0],[1,-1],[0,2],[1,2]],
  },
  I: {
    '0>1':[[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
    '1>0':[[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    '1>2':[[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
    '2>1':[[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
    '2>3':[[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    '3>2':[[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
    '3>0':[[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
    '0>3':[[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  },
};

function rotateCW(m) {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array(n).fill(null));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x][n - 1 - y] = m[y][x];
  return out;
}

export const ROTATIONS = {};
for (const type of TYPES) {
  const base = SHAPES[type].map(row => [...row].map(c => c === '.' ? null : c));
  ROTATIONS[type] = [base];
  for (let i = 1; i < 4; i++) ROTATIONS[type].push(rotateCW(ROTATIONS[type][i - 1]));
}

export function topRow(m) {
  for (let y = 0; y < m.length; y++) if (m[y].some(Boolean)) return y;
  return 0;
}

export function forEachCell(m, fn) {
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) fn(x, y);
}

export function bounds(m) {
  let minX = m.length, maxX = -1, minY = m.length, maxY = -1;
  forEachCell(m, (x, y) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
