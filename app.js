/* ── SVG Editor — app.js ─────────────────────────────────────
   Batch 3: Core logic
   - Render SVG
   - Click-to-select (single + shift multi)
   - Chip UI
   - Group into <g>
   - Apply ID / class
   - Export / Copy
   - Zoom & fit
──────────────────────────────────────────────────────────────*/

'use strict';

// ── State ──────────────────────────────────────────────────────
let svgRoot = null;          // live DOM SVG element in viewport
let selected = new Set();    // selected DOM nodes (in svgRoot)
let zoomScale = 1;

// ── DOM refs ───────────────────────────────────────────────────
const svgInput       = document.getElementById('svg-input');
const fileUpload     = document.getElementById('file-upload');
const btnRender      = document.getElementById('btn-render');
const btnClearSel    = document.getElementById('btn-clear-sel');
const btnGroup       = document.getElementById('btn-group');
const btnApplySel    = document.getElementById('btn-apply-sel');
const btnApplyGrp    = document.getElementById('btn-apply-grp');
const btnCopySvg     = document.getElementById('btn-copy-svg');
const btnExportSvg   = document.getElementById('btn-export-svg');
const btnCopyOutput  = document.getElementById('btn-copy-output');
const btnApplyCode   = document.getElementById('btn-apply-code');
const btnFit         = document.getElementById('btn-fit');
const btnZoomIn      = document.getElementById('btn-zoom-in');
const btnZoomOut     = document.getElementById('btn-zoom-out');
const zoomLevel      = document.getElementById('zoom-level');
const chipRow        = document.getElementById('chip-row');
const attrTargetLabel = document.getElementById('attr-target-label');
const attrId         = document.getElementById('attr-id');
const attrClass      = document.getElementById('attr-class');
const svgViewport    = document.getElementById('svg-viewport');
const canvasEmpty    = document.getElementById('canvas-empty-state');
const outputCode     = document.getElementById('svg-output-code');  // textarea
const toast          = document.createElement('div');

// ── Toast ──────────────────────────────────────────────────────
toast.id = 'toast';
document.body.appendChild(toast);
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

// ── Render ─────────────────────────────────────────────────────
function renderSVG(text) {
  text = text.trim();
  if (!text) return showToast('Paste SVG code first.');

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  const err = doc.querySelector('parsererror');
  if (err) return showToast('SVG parse error — check your markup.');

  const svg = doc.documentElement;

  // clear old
  svgViewport.innerHTML = '';
  selected.clear();

  // clone into viewport
  const imported = document.importNode(svg, true);
  imported.style.maxWidth  = '';
  imported.style.maxHeight = '';

  svgViewport.appendChild(imported);
  svgRoot = imported;

  attachInteractivity();
  fitToCanvas();

  canvasEmpty.classList.add('hidden');
  svgViewport.classList.add('visible');

  updateChips();
  updateAttrPanel();
  refreshOutput();
}

// ── Interactivity ──────────────────────────────────────────────
const INTERACTIVE_TAGS = new Set([
  'path','rect','circle','ellipse','line','polyline','polygon',
  'text','use','g','image'
]);

function attachInteractivity() {
  svgRoot.querySelectorAll('*').forEach(el => {
    if (!INTERACTIVE_TAGS.has(el.tagName.toLowerCase())) return;
    el.addEventListener('mousedown', onElMouseDown);
    el.addEventListener('click', onElClick);
    el.addEventListener('mouseenter', () => el.classList.add('svg-hover'));
    el.addEventListener('mouseleave', () => el.classList.remove('svg-hover'));
  });
}

// ── Drag to move ────────────────────────────────────────────────
let isDragging    = false;
let dragMoved     = false;   // true once mouse moves > threshold
let dragStartX    = 0;
let dragStartY    = 0;
// per-element starting translate, keyed by element
let dragOrigins   = new Map();

// Parse the translate(x,y) out of an element's transform attribute.
// Returns {x, y, rest} where rest is the transform string with translate removed.
function parseTranslate(el) {
  const raw = el.getAttribute('transform') || '';
  const m = raw.match(/translate\(\s*([+-]?[\d.]+)(?:[,\s]+([+-]?[\d.]+))?\s*\)/);
  const x = m ? parseFloat(m[1]) : 0;
  const y = m ? parseFloat(m[2] ?? 0) : 0;
  const rest = raw.replace(/translate\([^)]*\)/, '').trim();
  return { x, y, rest };
}

function setTranslate(el, x, y, rest) {
  const t = `translate(${x},${y})${rest ? ' ' + rest : ''}`;
  el.setAttribute('transform', t);
}

function onElMouseDown(e) {
  if (e.button !== 0) return;
  if (window.panMode) return;
  if (e.target.classList.contains('svg-locked')) return;

  e.stopPropagation();  // prevent marquee from starting

  const el = e.currentTarget;

  // If Ctrl+click, let onElClick handle deep select — don't drag
  if (e.ctrlKey || e.metaKey) return;

  // If this element isn't selected, select it now (shift = add, plain = replace)
  if (!selected.has(el)) {
    if (!e.shiftKey) {
      clearVisualSel();
      selected.clear();
    }
    selected.add(el);
    el.classList.add('svg-selected');
    updateChips();
    updateAttrPanel();
    if (typeof highlightTreeSelection === 'function') highlightTreeSelection();
  }

  // Record drag start
  isDragging  = true;
  dragMoved   = false;
  dragStartX  = e.clientX;
  dragStartY  = e.clientY;
  dragOrigins.clear();
  selected.forEach(sel => {
    const { x, y, rest } = parseTranslate(sel);
    dragOrigins.set(sel, { x, y, rest });
  });
}

document.addEventListener('mousemove', e => {
  if (!isDragging) return;
  if (window.isPanning) { isDragging = false; return; }

  const dx = (e.clientX - dragStartX) / zoomScale;
  const dy = (e.clientY - dragStartY) / zoomScale;

  if (!dragMoved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
  dragMoved = true;

  selected.forEach(el => {
    if (el.classList.contains('svg-locked')) return;
    const o = dragOrigins.get(el);
    if (!o) return;
    setTranslate(el, o.x + dx, o.y + dy, o.rest);
  });
});

document.addEventListener('mouseup', () => {
  if (!isDragging) return;
  isDragging = false;
  if (dragMoved) {
    refreshOutput();
    if (typeof snapshot === 'function') snapshot();
    if (typeof buildTree === 'function') buildTree();
  }
  dragOrigins.clear();
});

function onElClick(e) {
  e.stopPropagation();

  // Ctrl+click = deep select: find the deepest (leaf) element at cursor
  let el = e.currentTarget;
  if (e.ctrlKey || e.metaKey) {
    const deepest = document.elementFromPoint(e.clientX, e.clientY);
    if (deepest && deepest !== svgRoot && svgRoot.contains(deepest) &&
        INTERACTIVE_TAGS.has(deepest.tagName.toLowerCase())) {
      el = deepest;
    }
    if (selected.has(el)) {
      selected.delete(el);
      el.classList.remove('svg-selected');
    } else {
      selected.add(el);
      el.classList.add('svg-selected');
    }
    updateChips();
    updateAttrPanel();
    return;
  }

  if (e.shiftKey) {
    if (selected.has(el)) {
      selected.delete(el);
      el.classList.remove('svg-selected');
    } else {
      selected.add(el);
      el.classList.add('svg-selected');
    }
  } else {
    clearVisualSel();
    selected.clear();
    selected.add(el);
    el.classList.add('svg-selected');
  }

  updateChips();
  updateAttrPanel();
}

function clearVisualSel() {
  svgViewport.querySelectorAll('.svg-selected')
    .forEach(el => el.classList.remove('svg-selected'));
}

// ── Click on empty canvas clears selection ──────────────────────
let wasMarquee = false;   // prevents marquee mouseup from triggering this clear

document.getElementById('canvas-wrap').addEventListener('click', e => {
  if (wasMarquee) { wasMarquee = false; return; }       // marquee just finished
  if (e.target.closest('#svg-viewport svg *')) return;  // hit an SVG element
  if (selected.size === 0) return;
  clearVisualSel();
  selected.clear();
  updateChips();
  updateAttrPanel();
  if (typeof highlightTreeSelection === 'function') highlightTreeSelection();
});

// ── Chips ───────────────────────────────────────────────────────
const INTERNAL_CLASSES = new Set(['svg-selected','svg-hover','svg-hidden','svg-locked']);

function elLabel(el) {
  const tag = el.tagName;
  const id  = el.id ? `#${el.id}` : '';
  const rawCls = el.getAttribute('class') || '';
  const userCls = rawCls.trim().split(/\s+/).filter(c => c && !INTERNAL_CLASSES.has(c));
  const cls = userCls.length ? `.${userCls[0]}` : '';
  return `<${tag}${id}${cls}>`;
}

function updateChips() {
  chipRow.innerHTML = '';
  if (selected.size === 0) {
    chipRow.innerHTML = '<span class="empty-hint">None selected</span>';
    return;
  }
  selected.forEach(el => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = elLabel(el);

    const rm = document.createElement('button');
    rm.className = 'chip-remove';
    rm.title = 'Deselect';
    rm.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    rm.addEventListener('click', () => {
      selected.delete(el);
      el.classList.remove('svg-selected');
      updateChips();
      updateAttrPanel();
    });

    chip.appendChild(rm);
    chipRow.appendChild(chip);
  });
}

// ── Attr panel ─────────────────────────────────────────────────
const colorFill       = document.getElementById('color-fill');
const colorStroke     = document.getElementById('color-stroke');
const colorFillNone   = document.getElementById('color-fill-none');
const colorStrokeNone = document.getElementById('color-stroke-none');
const attrOpacity      = document.getElementById('attr-opacity');
const attrOpacityRange = document.getElementById('attr-opacity-range');

function cssColorToHex(val) {
  if (!val || val === 'none' || val === 'transparent') return null;
  if (/^#[0-9a-f]{6}$/i.test(val)) return val;
  if (/^#[0-9a-f]{3}$/i.test(val)) {
    return '#' + val[1]+val[1]+val[2]+val[2]+val[3]+val[3];
  }
  const m = val.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)/i);
  if (m) return '#' + [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
  return null;
}

function getAttrOrStyle(el, prop) {
  const attr = el.getAttribute(prop);
  if (attr) return attr;
  return getComputedStyle(el)[prop] || null;
}

function updateAttrPanel() {
  if (selected.size === 0) {
    attrTargetLabel.textContent = 'Select an element first';
    attrId.value = '';
    attrClass.value = '';
    colorFill.value = '#000000';
    colorStroke.value = '#000000';
    colorFillNone.classList.remove('active');
    colorStrokeNone.classList.remove('active');
    attrOpacity.value = 1;
    attrOpacityRange.value = 1;
    return;
  }
  if (selected.size === 1) {
    const el = [...selected][0];
    attrTargetLabel.textContent = `Editing: ${elLabel(el)}`;
    attrId.value    = el.id || '';
    attrClass.value = el.getAttribute('class') || '';

    const fillVal   = getAttrOrStyle(el, 'fill');
    const strokeVal = getAttrOrStyle(el, 'stroke');
    colorFill.value   = cssColorToHex(fillVal)   || '#000000';
    colorStroke.value = cssColorToHex(strokeVal) || '#000000';
    colorFillNone.classList.toggle('active',   fillVal   === 'none');
    colorStrokeNone.classList.toggle('active', strokeVal === 'none');

    const op = parseFloat(el.getAttribute('opacity') ?? getComputedStyle(el).opacity ?? 1);
    const opVal = isNaN(op) ? 1 : Math.min(1, Math.max(0, op));
    attrOpacity.value = opVal;
    attrOpacityRange.value = opVal;
  } else {
    attrTargetLabel.textContent = `${selected.size} elements selected`;
    attrId.value = '';
    attrClass.value = '';
    colorFill.value = '#000000';
    colorStroke.value = '#000000';
    colorFillNone.classList.remove('active');
    colorStrokeNone.classList.remove('active');
    attrOpacity.value = 1;
    attrOpacityRange.value = 1;
  }
}

// ── Apply opacity ────────────────────────────────────────────────
function applyOpacity(val) {
  const v = Math.min(1, Math.max(0, parseFloat(val)));
  if (isNaN(v)) return;
  attrOpacity.value = v;
  attrOpacityRange.value = v;
  selected.forEach(el => el.setAttribute('opacity', v));
  refreshOutput();
  if (typeof snapshot === 'function') snapshot();
}

attrOpacityRange.addEventListener('input', () => applyOpacity(attrOpacityRange.value));
attrOpacity.addEventListener('change', () => applyOpacity(attrOpacity.value));

// ── Apply color ─────────────────────────────────────────────────
function applyColorProp(prop, value) {
  if (selected.size === 0) return showToast('Select elements first.');
  selected.forEach(el => el.setAttribute(prop, value));
  refreshOutput();
  if (typeof snapshot === 'function') snapshot();
}

colorFill.addEventListener('input', () => {
  colorFillNone.classList.remove('active');
  applyColorProp('fill', colorFill.value);
});
colorStroke.addEventListener('input', () => {
  colorStrokeNone.classList.remove('active');
  applyColorProp('stroke', colorStroke.value);
});
colorFillNone.addEventListener('click', () => {
  colorFillNone.classList.toggle('active');
  applyColorProp('fill', colorFillNone.classList.contains('active') ? 'none' : colorFill.value);
});
colorStrokeNone.addEventListener('click', () => {
  colorStrokeNone.classList.toggle('active');
  applyColorProp('stroke', colorStrokeNone.classList.contains('active') ? 'none' : colorStroke.value);
});

// ── Clear selection ─────────────────────────────────────────────
btnClearSel.addEventListener('click', () => {
  clearVisualSel();
  selected.clear();
  updateChips();
  updateAttrPanel();
});

// ── Delete selected elements ────────────────────────────────────
function deleteSelected() {
  if (selected.size === 0) return showToast('Select elements to delete.');
  const count = selected.size;
  selected.forEach(el => el.remove());
  selected.clear();
  updateChips();
  updateAttrPanel();
  refreshOutput();
  showToast(`Deleted ${count} element${count > 1 ? 's' : ''}.`);
}

document.getElementById('btn-delete').addEventListener('click', deleteSelected);

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
});

// ── Group into <g> ──────────────────────────────────────────────
btnGroup.addEventListener('click', () => {
  if (selected.size === 0) return showToast('Select elements to group.');

  const els = [...selected];
  const parent = els[0].parentNode;
  if (!els.every(e => e.parentNode === parent))
    return showToast('All selected elements must share the same parent.');

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  // insert before first selected child
  const children = Array.from(parent.children);
  const firstIdx = Math.min(...els.map(e => children.indexOf(e)));
  parent.insertBefore(g, children[firstIdx]);

  els.forEach(el => {
    el.classList.remove('svg-selected');
    g.appendChild(el);
  });

  // re-attach events to the new <g>
  g.addEventListener('click', onElClick);
  g.addEventListener('mouseenter', () => g.classList.add('svg-hover'));
  g.addEventListener('mouseleave', () => g.classList.remove('svg-hover'));

  selected.clear();
  selected.add(g);
  g.classList.add('svg-selected');

  updateChips();
  updateAttrPanel();
  refreshOutput();
  showToast('Grouped into <g>');
});

// ── Apply attributes ────────────────────────────────────────────
function applyAttrs(targets) {
  const id  = attrId.value.trim();
  const cls = attrClass.value.trim();

  targets.forEach((el, i) => {
    if (id) el.id = targets.length === 1 ? id : `${id}-${i + 1}`;
    if (cls) el.setAttribute('class', cls);
  });

  updateChips();
  updateAttrPanel();
  refreshOutput();
  showToast('Attributes applied.');
}

btnApplySel.addEventListener('click', () => {
  if (selected.size === 0) return showToast('Select elements first.');
  applyAttrs([...selected]);
});

btnApplyGrp.addEventListener('click', () => {
  if (selected.size === 0) return showToast('Select elements first.');
  const parents = [...new Set([...selected].map(el =>
    el.tagName === 'g' ? el : el.parentNode
  ))].filter(Boolean);
  applyAttrs(parents);
});

// ── Output ─────────────────────────────────────────────────────
function serializeSVG() {
  if (!svgRoot) return '';
  return new XMLSerializer().serializeToString(svgRoot);
}

function formatXML(xml) {
  let indent = 0;
  const lines = xml.replace(/>\s*</g, '>\n<').split('\n');
  return lines.map(line => {
    line = line.trim();
    if (!line) return '';
    if (line.startsWith('</')) { indent = Math.max(0, indent - 1); }
    const out = '  '.repeat(indent) + line;
    if (!line.startsWith('</') && !line.endsWith('/>') &&
        line.startsWith('<') && !line.startsWith('<!--')) { indent++; }
    return out;
  }).filter(Boolean).join('\n');
}

function refreshOutput() {
  const raw = serializeSVG();
  outputCode.value = raw ? formatXML(raw) : '';
  // sync modal if open
  const ma = document.getElementById('modal-code-area');
  if (ma && document.getElementById('code-modal')?.classList.contains('open')) {
    ma.value = outputCode.value;
  }
}

// ── Copy / Export ───────────────────────────────────────────────
function copySVGToClipboard() {
  const raw = serializeSVG();
  if (!raw) return showToast('No SVG loaded.');
  navigator.clipboard.writeText(raw).then(() => showToast('Copied to clipboard!'));
}

btnCopySvg.addEventListener('click', copySVGToClipboard);
btnCopyOutput.addEventListener('click', copySVGToClipboard);

// ── Code editor — Apply changes ─────────────────────────────
function applyCodeEditor() {
  const code = outputCode.value.trim();
  if (!code) return showToast('No SVG code to apply.');
  renderSVG(code);
}

btnApplyCode.addEventListener('click', applyCodeEditor);
outputCode.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    applyCodeEditor();
  }
});

btnExportSvg.addEventListener('click', () => {
  const raw = serializeSVG();
  if (!raw) return showToast('No SVG loaded.');
  const blob = new Blob([raw], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'edited.svg';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('SVG exported!');
});

// ── File upload ─────────────────────────────────────────────────
fileUpload.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    svgInput.value = ev.target.result;
    renderSVG(ev.target.result);
  };
  reader.readAsText(file);
  fileUpload.value = '';
});

// ── Render button ───────────────────────────────────────────────
btnRender.addEventListener('click', () => renderSVG(svgInput.value));
svgInput.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') renderSVG(svgInput.value);
});

// ── Keyboard shortcuts ───────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
    e.preventDefault();
    btnGroup.click();
  }
  if (e.key === 'f' || e.key === 'F') fitToCanvas();
});

// ── Infinite canvas state ───────────────────────────────────────
const canvasBg = document.getElementById('canvas-bg');
let panX = 0, panY = 0;   // canvas-bg offset from canvas-wrap origin

function applyTransform() {
  canvasBg.style.transform = `translate(${panX}px,${panY}px) scale(${zoomScale})`;
  zoomLevel.textContent = Math.round(zoomScale * 100) + '%';
  drawRulers();
}

// ── Rulers ──────────────────────────────────────────────────
function drawRulers() {
  const rulerH = document.getElementById('ruler-h');
  const rulerV = document.getElementById('ruler-v');
  if (!rulerH || !rulerV) return;

  const wrap = document.getElementById('canvas-wrap');
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  const RW = 16;

  rulerH.width  = Math.max(1, W - RW);
  rulerH.height = RW;
  rulerV.width  = RW;
  rulerV.height = Math.max(1, H - RW);

  // Nice tick step in canvas (SVG) units
  const rawStep = 80 / zoomScale;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 0.001))));
  const niceMult = rawStep / mag < 2 ? 1 : rawStep / mag < 5 ? 2 : 5;
  const step = niceMult * mag;

  const BG    = '#18181B';
  const TICK  = '#3F3F46';
  const LABEL = '#52525B';
  const BORDER = '#27272A';
  const FONT  = '9px JetBrains Mono, monospace';

  // ── Horizontal ruler ──────────────────────────────────────
  const hCtx = rulerH.getContext('2d');
  hCtx.fillStyle = BG;
  hCtx.fillRect(0, 0, rulerH.width, RW);
  hCtx.font = FONT;
  hCtx.textAlign = 'left';

  const startX = Math.ceil((-panX) / zoomScale / step) * step;
  for (let cx = startX; cx * zoomScale + panX < W; cx += step) {
    const px = cx * zoomScale + panX - RW;
    if (px < 0) continue;
    hCtx.strokeStyle = TICK;
    hCtx.beginPath();
    hCtx.moveTo(px + 0.5, RW);
    hCtx.lineTo(px + 0.5, RW / 2);
    hCtx.stroke();
    hCtx.fillStyle = LABEL;
    hCtx.fillText(Math.round(cx), px + 2, RW - 3);
  }
  hCtx.strokeStyle = BORDER;
  hCtx.beginPath();
  hCtx.moveTo(0, RW - 0.5);
  hCtx.lineTo(rulerH.width, RW - 0.5);
  hCtx.stroke();

  // ── Vertical ruler ────────────────────────────────────────
  const vCtx = rulerV.getContext('2d');
  vCtx.fillStyle = BG;
  vCtx.fillRect(0, 0, RW, rulerV.height);
  vCtx.font = FONT;

  const startY = Math.ceil((-panY) / zoomScale / step) * step;
  for (let cy = startY; cy * zoomScale + panY < H; cy += step) {
    const py = cy * zoomScale + panY - RW;
    if (py < 0) continue;
    vCtx.strokeStyle = TICK;
    vCtx.beginPath();
    vCtx.moveTo(RW, py + 0.5);
    vCtx.lineTo(RW / 2, py + 0.5);
    vCtx.stroke();
    vCtx.save();
    vCtx.fillStyle = LABEL;
    vCtx.translate(RW - 3, py + 2);
    vCtx.rotate(-Math.PI / 2);
    vCtx.fillText(Math.round(cy), 0, 0);
    vCtx.restore();
  }
  vCtx.strokeStyle = BORDER;
  vCtx.beginPath();
  vCtx.moveTo(RW - 0.5, 0);
  vCtx.lineTo(RW - 0.5, rulerV.height);
  vCtx.stroke();
}

window.addEventListener('resize', drawRulers);
// Draw rulers on initial load (even before any SVG is rendered)
drawRulers();

// Zoom toward a point (cx, cy) in canvas-wrap client coords
function zoomAt(newScale, cx, cy) {
  newScale = Math.min(20, Math.max(0.02, newScale));
  // point in canvas-space before zoom
  const wx = (cx - panX) / zoomScale;
  const wy = (cy - panY) / zoomScale;
  // after zoom, keep same canvas-space point under cursor
  panX = cx - wx * newScale;
  panY = cy - wy * newScale;
  zoomScale = newScale;
  applyTransform();
}

function setZoom(scale) {
  const wrap = document.getElementById('canvas-wrap');
  zoomAt(scale, wrap.clientWidth / 2, wrap.clientHeight / 2);
}

btnZoomIn.addEventListener('click',  () => setZoom(zoomScale * 1.25));
btnZoomOut.addEventListener('click', () => setZoom(zoomScale / 1.25));

// ── Fit to canvas ───────────────────────────────────────────────
function fitToCanvas() {
  if (!svgRoot) return;
  const wrap = document.getElementById('canvas-wrap');
  const ww = wrap.clientWidth;
  const wh = wrap.clientHeight;

  let sw = svgRoot.viewBox?.baseVal?.width  || parseFloat(svgRoot.getAttribute('width'))  || svgRoot.clientWidth  || 400;
  let sh = svgRoot.viewBox?.baseVal?.height || parseFloat(svgRoot.getAttribute('height')) || svgRoot.clientHeight || 400;
  if (sw === 0) sw = 400;
  if (sh === 0) sh = 400;

  svgRoot.setAttribute('width',  sw);
  svgRoot.setAttribute('height', sh);
  svgViewport.style.width  = sw + 'px';
  svgViewport.style.height = sh + 'px';

  const scale = Math.min((ww - 80) / sw, (wh - 80) / sh, 2);
  zoomScale = Math.min(20, Math.max(0.02, scale));
  panX = (ww - sw * zoomScale) / 2;
  panY = (wh - sh * zoomScale) / 2;
  applyTransform();
}

btnFit.addEventListener('click', fitToCanvas);

// ── Wheel zoom toward cursor ────────────────────────────────────
document.getElementById('canvas-wrap').addEventListener('wheel', e => {
  e.preventDefault();
  const wrap = document.getElementById('canvas-wrap');
  const wr   = wrap.getBoundingClientRect();
  const cx   = e.clientX - wr.left;
  const cy   = e.clientY - wr.top;
  if (e.ctrlKey || e.metaKey) {
    // pinch-to-zoom or Ctrl+wheel
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    zoomAt(zoomScale * factor, cx, cy);
  } else {
    // plain scroll = pan
    panX -= e.deltaX;
    panY -= e.deltaY;
    applyTransform();
  }
}, { passive: false });

// ── Marquee (rubber-band) selection ─────────────────────────────
const canvasWrapEl  = document.getElementById('canvas-wrap');
const marqueeRect   = document.getElementById('marquee-rect');

let isMarquee = false;
let mqStartX  = 0;
let mqStartY  = 0;

let marqueeCtrl = false;  // was Ctrl held at marquee start?

canvasWrapEl.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (window.panMode) return;
  const svgEl = e.target.closest('#svg-viewport svg *');
  if (svgEl) return;   // clicking an SVG element — handled by onElClick
  if (!svgRoot) return;
  marqueeCtrl = e.ctrlKey || e.metaKey;

  isMarquee = true;
  const wr = canvasWrapEl.getBoundingClientRect();
  mqStartX  = e.clientX - wr.left;
  mqStartY  = e.clientY - wr.top;

  marqueeRect.style.display = 'block';
  marqueeRect.style.left   = mqStartX + 'px';
  marqueeRect.style.top    = mqStartY + 'px';
  marqueeRect.style.width  = '0px';
  marqueeRect.style.height = '0px';
});

document.addEventListener('mousemove', e => {
  if (!isMarquee) return;
  if (window.isPanning) { isMarquee = false; marqueeRect.style.display = 'none'; return; }
  const wr   = canvasWrapEl.getBoundingClientRect();
  const curX = e.clientX - wr.left;
  const curY = e.clientY - wr.top;
  marqueeRect.style.left   = Math.min(curX, mqStartX) + 'px';
  marqueeRect.style.top    = Math.min(curY, mqStartY) + 'px';
  marqueeRect.style.width  = Math.abs(curX - mqStartX) + 'px';
  marqueeRect.style.height = Math.abs(curY - mqStartY) + 'px';
});

document.addEventListener('mouseup', e => {
  if (!isMarquee) return;
  isMarquee = false;
  if (window.isPanning) { marqueeRect.style.display = 'none'; return; }

  const mqW = parseFloat(marqueeRect.style.width)  || 0;
  const mqH = parseFloat(marqueeRect.style.height) || 0;
  marqueeRect.style.display = 'none';

  if (mqW < 4 && mqH < 4) return;
  wasMarquee = true;  // suppress the canvas click that fires immediately after

  // Marquee rect is in canvas-wrap client coords; getBoundingClientRect on SVG
  // elements also returns viewport coords — offset by wr to match
  const wr  = canvasWrapEl.getBoundingClientRect();
  const mxL = parseFloat(marqueeRect.style.left)  + wr.left;
  const myT = parseFloat(marqueeRect.style.top)   + wr.top;
  const mxR = mxL + mqW;
  const myB = myT + mqH;

  if (!e.shiftKey) {
    clearVisualSel();
    selected.clear();
  }

  if (svgRoot) {
    svgRoot.querySelectorAll('*').forEach(el => {
      if (!INTERACTIVE_TAGS.has(el.tagName.toLowerCase())) return;
      if (el.classList.contains('svg-locked')) return;
      // Ctrl+drag = deep select: skip <g> containers, only leaf elements
      if (marqueeCtrl && el.tagName.toLowerCase() === 'g') return;
      const er = el.getBoundingClientRect();
      const overlaps = !(er.right < mxL || er.left > mxR ||
                         er.bottom < myT || er.top  > myB);
      if (overlaps) {
        selected.add(el);
        el.classList.add('svg-selected');
      }
    });
  }

  updateChips();
  updateAttrPanel();
  if (typeof highlightTreeSelection === 'function') highlightTreeSelection();
});

// ── Code Editor Modal ────────────────────────────────────────────
const codeModal      = document.getElementById('code-modal');
const codeModalClose = document.getElementById('code-modal-close');
const btnOpenCode    = document.getElementById('btn-open-code');
const modalCodeArea  = document.getElementById('modal-code-area');
const btnModalApply  = document.getElementById('btn-modal-apply');
const btnModalCopy   = document.getElementById('btn-modal-copy');

function openCodeModal() {
  modalCodeArea.value = outputCode.value;
  codeModal.classList.add('open');
  modalCodeArea.focus();
}

function closeCodeModal() {
  codeModal.classList.remove('open');
}

btnOpenCode.addEventListener('click', openCodeModal);
codeModalClose.addEventListener('click', closeCodeModal);
codeModal.addEventListener('click', e => { if (e.target === codeModal) closeCodeModal(); });

btnModalApply.addEventListener('click', () => {
  const code = modalCodeArea.value.trim();
  if (!code) return showToast('No SVG code to apply.');
  renderSVG(code);
  closeCodeModal();
});

btnModalCopy.addEventListener('click', () => {
  const raw = serializeSVG();
  if (!raw) return showToast('No SVG loaded.');
  navigator.clipboard.writeText(raw).then(() => showToast('Copied to clipboard!'));
});

modalCodeArea.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    btnModalApply.click();
  }
});

// ── Keyboard Shortcuts Modal ─────────────────────────────────────
const shortcutsModal      = document.getElementById('shortcuts-modal');
const shortcutsModalClose = document.getElementById('shortcuts-modal-close');
const btnOpenShortcuts    = document.getElementById('btn-open-shortcuts');

btnOpenShortcuts.addEventListener('click', () => shortcutsModal.classList.add('open'));
shortcutsModalClose.addEventListener('click', () => shortcutsModal.classList.remove('open'));
shortcutsModal.addEventListener('click', e => { if (e.target === shortcutsModal) shortcutsModal.classList.remove('open'); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeCodeModal();
    shortcutsModal.classList.remove('open');
  }
});
