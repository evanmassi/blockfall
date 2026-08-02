// The seven tetrominoes and the SRS tables. Pure data plus matrix helpers — no
// board, no DOM, no mutable state. Collision and the bag live in board.js.

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

// SRS kicks, already converted to screen space (+y is down).
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

/** Topmost filled row, so a spawning piece can be settled far enough down that
 *  its highest cell clears the hidden buffer. */
export function topRow(m) {
  for (let y = 0; y < m.length; y++) if (m[y].some(Boolean)) return y;
  return 0;
}

/** Calls fn(x, y) for each filled cell of rotation matrix `m`. */
export function forEachCell(m, fn) {
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) fn(x, y);
}
