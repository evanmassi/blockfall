const $ = id => document.getElementById(id);

export const boardCv = $('board'), boardCtx = boardCv.getContext('2d');
export const holdCv = $('holdCanvas'), holdCtx = holdCv.getContext('2d');
export const nextCv = $('nextCanvas'), nextCtx = nextCv.getContext('2d');

export const stage = $('stage');
export const railLeft = $('railLeft');
export const overlay = $('overlay');
export const toastEl = $('toast');
export const scoreEl = $('score'), levelEl = $('level'), linesEl = $('lines');
export const pauseBtn = $('pauseBtn'), muteBtn = $('muteBtn');
