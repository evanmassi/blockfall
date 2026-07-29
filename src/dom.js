// Element and canvas-context lookups, done once. These run at import time, so
// this module must not be imported anywhere that could execute before the
// document has parsed.

const $ = id => document.getElementById(id);

export const boardCv = $('board'), boardCtx = boardCv.getContext('2d');
export const holdCv = $('holdCanvas'), holdCtx = holdCv.getContext('2d');
export const nextCv = $('nextCanvas'), nextCtx = nextCv.getContext('2d');

export const app = $('app'), hud = $('hud');
export const stage = $('stage');
export const railLeft = $('railLeft'), railRight = $('railRight');
export const overlay = $('overlay');
export const toastEl = $('toast');
export const scoreEl = $('score'), levelEl = $('level'), linesEl = $('lines');
export const pauseBtn = $('pauseBtn'), muteBtn = $('muteBtn');
