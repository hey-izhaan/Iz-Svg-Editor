/* ── SVG Editor — palette.js ──────────────────────────────────
   PALETTE panel: scan all fill/stroke colors in the live SVG,
   display swatches, and bulk-replace a color across all matching
   elements via an inline color picker.
──────────────────────────────────────────────────────────────*/

'use strict';

// ── DOM refs ───────────────────────────────────────────────────
const paletteList       = document.getElementById('palette-list');
const btnRefreshPalette = document.getElementById('btn-refresh-palette');

// ── Helpers ────────────────────────────────────────────────────

// Resolve any CSS color string to a lowercase #rrggbb hex.
// Uses a hidden canvas context to handle named colors, hsl(), etc.
const _colorCtx = document.createElement('canvas').getContext('2d');
function _cssColorToHex(val) {
  if (!val || val === 'none' || val === 'transparent') return null;
  val = val.trim();
  // Fast path — already 6-digit hex
  if (/^#[0-9a-f]{6}$/i.test(val)) return val.toLowerCase();
  // Expand 3-digit hex
  if (/^#[0-9a-f]{3}$/i.test(val)) {
    return '#' + val[1]+val[1]+val[2]+val[2]+val[3]+val[3];
  }
  // Fast path — rgb()
  const m = val.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)/i);
  if (m) return '#' + [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
  // Fallback — let the browser parse it (handles named colors, hsl, etc.)
  _colorCtx.fillStyle = '#000000'; // reset
  _colorCtx.fillStyle = val;
  const resolved = _colorCtx.fillStyle; // browser normalises to #rrggbb or rgb()
  if (resolved === '#000000' && val.toLowerCase() !== 'black' && val.toLowerCase() !== '#000' && val.toLowerCase() !== '#000000') {
    // browser couldn't parse it — skip
    return null;
  }
  if (/^#[0-9a-f]{6}$/i.test(resolved)) return resolved.toLowerCase();
  const m2 = resolved.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)/i);
  if (m2) return '#' + [m2[1],m2[2],m2[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
  return null;
}

// Read an explicitly declared color for `prop` on `el`.
// Checks the SVG presentation attribute first, then the inline style.
// Does NOT fall back to computed/inherited styles — that would cause
// every child element to inherit black and inflate the palette.
function _getExplicitColor(el, prop) {
  // 1. SVG presentation attribute: fill="#f00"
  const attr = el.getAttribute(prop);
  if (attr && attr !== 'inherit') return attr;
  // 2. Inline style: style="fill: red"
  const styleVal = el.style ? el.style.getPropertyValue(prop) : null;
  if (styleVal && styleVal !== 'inherit') return styleVal;
  return null;
}

// ── Scan ───────────────────────────────────────────────────────
// Returns an array of { key, hex, prop, count, elements } sorted by count desc.
function scanColors() {
  const map = new Map(); // key → { hex, prop, elements: Set }

  if (!svgRoot) return [];

  // Pass 1 — explicit presentation attributes and inline styles
  svgRoot.querySelectorAll('*').forEach(el => {
    ['fill', 'stroke'].forEach(prop => {
      const raw = _getExplicitColor(el, prop);
      if (!raw || raw === 'none' || raw === 'transparent') return;
      const hex = _cssColorToHex(raw);
      if (!hex) return;
      const key = prop + ':' + hex;
      if (!map.has(key)) map.set(key, { hex, prop, elements: new Set() });
      map.get(key).elements.add(el);
    });
  });

  // Pass 2 — colors defined inside embedded <style> blocks (e.g. .cls-1{fill:#f00})
  // We extract unique color values from the CSS text and resolve them.
  // We can't associate them with specific elements reliably without a full CSS parser,
  // so we add them as standalone swatches with count=0 if not already found above.
  svgRoot.querySelectorAll('style').forEach(styleEl => {
    const css = styleEl.textContent || '';
    const colorRe = /(?:fill|stroke)\s*:\s*([^;}"'\s]+)/gi;
    let m;
    while ((m = colorRe.exec(css)) !== null) {
      const raw = m[1].trim();
      if (!raw || raw === 'none' || raw === 'transparent' || raw === 'inherit') continue;
      const hex = _cssColorToHex(raw);
      if (!hex) continue;
      const prop = m[0].trim().toLowerCase().startsWith('stroke') ? 'stroke' : 'fill';
      const key = prop + ':' + hex;
      if (!map.has(key)) map.set(key, { hex, prop, elements: new Set() });
      // Don't add fake elements — the count will reflect 0 if no attr matches
    }
  });

  return [...map.entries()]
    .map(([key, v]) => ({ key, hex: v.hex, prop: v.prop, count: v.elements.size, elements: v.elements }))
    .sort((a, b) => b.count - a.count);
}


// ── Replace ────────────────────────────────────────────────────
function replaceColor(oldHex, prop, newHex) {
  if (!svgRoot) return;
  svgRoot.querySelectorAll('*').forEach(el => {
    const raw = _getExplicitColor(el, prop);
    if (!raw) return;
    const hex = _cssColorToHex(raw);
    if (hex === oldHex.toLowerCase()) {
      el.setAttribute(prop, newHex);
      // Also clear matching inline style so the attribute takes precedence
      if (el.style && el.style.getPropertyValue(prop)) {
        el.style.removeProperty(prop);
      }
    }
  });
  if (typeof refreshOutput === 'function') refreshOutput();
  if (typeof snapshot === 'function') snapshot();
}

// ── Render ─────────────────────────────────────────────────────
function buildPalette() {
  paletteList.innerHTML = '';

  if (!svgRoot) {
    paletteList.innerHTML = '<span class="empty-hint">Render an SVG to see its colors</span>';
    return;
  }

  const entries = scanColors();

  if (entries.length === 0) {
    paletteList.innerHTML = '<span class="empty-hint">No fill/stroke colors found</span>';
    return;
  }

  entries.forEach(entry => {
    // Cache the exact element set from the scan — during preview we update
    // these directly instead of re-scanning, so we never accidentally touch
    // other palette colors even if the picker passes through them.
    const targetElements = entry.elements;
    let currentHex = entry.hex;

    // The entire row is a <label> so clicking anywhere on it opens the
    // native color picker (label → input association).
    const row = document.createElement('label');
    row.className = 'palette-row';
    row.title = `Click to replace all ${entry.prop}: ${entry.hex}`;

    // Hidden color input — positioned off-screen so the label click triggers it
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = currentHex;
    colorInput.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';

    // Swatch square (visual only — no interaction, row handles it)
    const swatch = document.createElement('div');
    swatch.className = 'palette-swatch';
    swatch.style.background = currentHex;

    // Hex label
    const hexLabel = document.createElement('span');
    hexLabel.className = 'palette-hex';
    hexLabel.textContent = currentHex;

    // Prop badge (fill / stroke)
    const propBadge = document.createElement('span');
    propBadge.className = 'palette-badge palette-badge--prop';
    propBadge.textContent = entry.prop;

    // Count badge
    const countBadge = document.createElement('span');
    countBadge.className = 'palette-badge palette-badge--count';
    countBadge.textContent = '×' + entry.count;

    row.appendChild(colorInput);
    row.appendChild(swatch);
    row.appendChild(hexLabel);
    row.appendChild(propBadge);
    row.appendChild(countBadge);
    paletteList.appendChild(row);

    // Live preview — update only the cached elements directly, never re-scan.
    // This means dragging through black won't touch other black elements.
    colorInput.addEventListener('input', () => {
      targetElements.forEach(el => el.setAttribute(entry.prop, colorInput.value));
      if (typeof refreshOutput === 'function') refreshOutput();
      currentHex = colorInput.value;
      swatch.style.background = currentHex;
      hexLabel.textContent = currentHex;
    });

    // Picker dismissed / committed — now rebuild so similar colors merge.
    colorInput.addEventListener('change', () => {
      buildPalette();
    });
  });
}

// ── Refresh button ─────────────────────────────────────────────
btnRefreshPalette.addEventListener('click', buildPalette);

// ── Expose globally ────────────────────────────────────────────
window.buildPalette = buildPalette;
