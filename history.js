/* ── history.js — Undo / Redo (Batch 5) ─────────────────────
   Snapshots the full SVG XML string after each mutation.
   Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo.
──────────────────────────────────────────────────────────────*/
'use strict';

const HISTORY_LIMIT = 50;

const stack  = [];   // past states  [oldest ... newest]
let   future = [];   // redo states  [next ... furthest]
let   isBusy = false;

const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');

// ── Snapshot helpers ───────────────────────────────────────────
function snapshot() {
  if (!svgRoot) return;
  const xml = new XMLSerializer().serializeToString(svgRoot);
  stack.push(xml);
  if (stack.length > HISTORY_LIMIT) stack.shift();
  future = [];       // new action clears redo branch
  syncButtons();
}

function syncButtons() {
  btnUndo.disabled = stack.length < 2;   // need at least 1 past state
  btnRedo.disabled = future.length === 0;
}

// ── Restore a serialized SVG string ───────────────────────────
function restore(xml) {
  if (!xml) return;
  isBusy = true;

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'image/svg+xml');
  const newSvg = document.importNode(doc.documentElement, true);
  newSvg.removeAttribute('width');
  newSvg.removeAttribute('height');
  newSvg.style.maxWidth  = '100%';
  newSvg.style.maxHeight = '100%';

  svgViewport.innerHTML = '';
  svgViewport.appendChild(newSvg);
  svgRoot = newSvg;

  // re-attach interactivity from app.js
  attachInteractivity();

  // restore viewport size and transform
  const vw = svgRoot.viewBox?.baseVal?.width  || parseFloat(svgRoot.getAttribute('width'))  || 400;
  const vh = svgRoot.viewBox?.baseVal?.height || parseFloat(svgRoot.getAttribute('height')) || 400;
  svgViewport.style.width  = vw + 'px';
  svgViewport.style.height = vh + 'px';
  applyTransform();

  // clear selection
  selected.clear();
  updateChips();
  updateAttrPanel();
  refreshOutput();
  if (typeof buildPalette === 'function') buildPalette();
  syncButtons();

  isBusy = false;
}

// ── Undo ───────────────────────────────────────────────────────
function undo() {
  if (stack.length < 2) return;
  const current = stack.pop();
  future.unshift(current);
  restore(stack[stack.length - 1]);
  showToast('Undo');
}

// ── Redo ───────────────────────────────────────────────────────
function redo() {
  if (future.length === 0) return;
  const next = future.shift();
  stack.push(next);
  restore(next);
  showToast('Redo');
}

// ── Button wiring ──────────────────────────────────────────────
btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);

// ── Keyboard shortcuts ─────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
  if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
});

// ── Auto-snapshot on mutations ─────────────────────────────────
// Watch for structural/attribute changes inside svgViewport
const histObserver = new MutationObserver(() => {
  if (isBusy) return;
  snapshot();
});

// Begin watching after first render
const viewportEl = document.getElementById('svg-viewport');
const startObserving = () => {
  if (!svgRoot) return;
  histObserver.disconnect();
  histObserver.observe(svgRoot, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['id', 'class', 'd', 'fill', 'stroke']
  });
};

// Patch render trigger — snapshot initial state after render
document.getElementById('btn-render').addEventListener('click', () => {
  setTimeout(() => {
    stack.length = 0;
    future = [];
    snapshot();          // baseline
    startObserving();
    syncButtons();
  }, 80);
}, true);

document.getElementById('file-upload').addEventListener('change', () => {
  setTimeout(() => {
    stack.length = 0;
    future = [];
    snapshot();
    startObserving();
    syncButtons();
  }, 200);
});

// Init button states
syncButtons();
