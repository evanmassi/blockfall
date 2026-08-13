// Element and context lookups, done once. These run at import time, so nothing
// may import this module before the document has parsed.

const $ = id => document.getElementById(id);

export const boardCv = $('board'), boardCtx = boardCv.getContext('2d');
export const holdCv = $('holdCanvas'), holdCtx = holdCv.getContext('2d');
export const nextCv = $('nextCanvas'), nextCtx = nextCv.getContext('2d');

export const app = $('app'), hud = $('hud');
export const stage = $('stage'), sysBtns = $('sysBtns');
export const railLeft = $('railLeft'), railRight = $('railRight');
export const overlay = $('overlay');
export const toastEl = $('toast'), countdownEl = $('countdown');
export const scoreEl = $('score'), levelEl = $('level'), linesEl = $('lines');
export const comboStat = $('comboStat'), comboEl = $('combo');
export const pauseBtn = $('pauseBtn'), muteBtn = $('muteBtn');
export const undoBtn = $('undoBtn'), undoLeftEl = $('undoLeft');
