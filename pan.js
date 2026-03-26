/* ── pan.js — Infinite Canvas Pan ────────────────────────────
   Pan via: Space+drag, middle-mouse drag, or scroll wheel.
   Empty-canvas left-drag is reserved for marquee selection.
──────────────────────────────────────────────────────────────*/
'use strict';

const canvasWrap = document.getElementById('canvas-wrap');

window.panMode   = false;
window.isPanning = false;

let isPanning  = false;
let panStartX  = 0;
let panStartY  = 0;
let originPanX = 0;
let originPanY = 0;

// ── Space key ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !e.repeat &&
      e.target.tagName !== 'TEXTAREA' &&
      e.target.tagName !== 'INPUT') {
    e.preventDefault();
    window.panMode = true;
    canvasWrap.classList.add('pan-ready');
  }
});

document.addEventListener('keyup', e => {
  if (e.code === 'Space') {
    window.panMode = false;
    isPanning = window.isPanning = false;
    canvasWrap.classList.remove('pan-ready', 'panning');
  }
});

// ── Mouse drag (Space+drag or middle-mouse only) ───────────────
canvasWrap.addEventListener('mousedown', e => {
  const isMiddle = e.button === 1;
  if (!window.panMode && !isMiddle) return;

  e.preventDefault();
  isPanning = window.isPanning = true;
  panStartX  = e.clientX;
  panStartY  = e.clientY;
  originPanX = panX;
  originPanY = panY;
  canvasWrap.classList.add('panning');
});

document.addEventListener('mousemove', e => {
  if (!isPanning) return;
  panX = originPanX + (e.clientX - panStartX);
  panY = originPanY + (e.clientY - panStartY);
  applyTransform();
});

document.addEventListener('mouseup', () => {
  if (!isPanning) return;
  isPanning = window.isPanning = false;
  canvasWrap.classList.remove('panning');
  if (window.panMode) canvasWrap.classList.add('pan-ready');
});

// Prevent context menu on middle click
canvasWrap.addEventListener('contextmenu', e => {
  if (e.button === 1) e.preventDefault();
});
