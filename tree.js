/* ── tree.js — Element Tree Panel (Batch 4 + 7) ───────────────
   Batch 4: Collapsible node tree, click-to-select.
   Batch 7:
     - Hide / Lock toggles per row (CSS-only, editor-only)
     - Shift-click range select (tree visual order)
     - Click-drag marquee in tree not needed (canvas handles it)
──────────────────────────────────────────────────────────────*/
'use strict';

const treeRoot = document.getElementById('tree-root');
const btnCollapseTree = document.getElementById('btn-collapse-tree');

const TREE_TAGS = new Set([
  'svg','g','path','rect','circle','ellipse','line',
  'polyline','polygon','text','use','defs','symbol','image','clipPath','mask'
]);

// ── Batch 7: flat ordered list for range select ─────────────
let treeOrderedEls = [];   // populated by buildTree, top-to-bottom visual order
let lastClickedEl  = null; // for shift-click range anchor

// ── Batch 7: hide/lock state ────────────────────────────────
const hiddenEls = new WeakSet();
const lockedEls = new WeakSet();

// Called from app.js after svgRoot is set
function buildTree() {
  treeOrderedEls = [];
  treeRoot.innerHTML = '';
  if (!svgRoot) {
    treeRoot.innerHTML = '<div class="tree-empty">Render an SVG to see its tree</div>';
    return;
  }
  renderTreeNode(svgRoot, treeRoot, 0);
}

function renderTreeNode(el, container, depth) {
  const tag = el.tagName?.toLowerCase();
  if (!tag || !TREE_TAGS.has(tag)) return;

  const children = Array.from(el.children).filter(c =>
    TREE_TAGS.has(c.tagName?.toLowerCase())
  );
  const hasChildren = children.length > 0;

  // ── Row ──
  const row = document.createElement('div');
  row.className = 'tree-node';
  row.dataset.nodeId = el._treeId = el._treeId || Math.random().toString(36).slice(2);

  // Restore hidden/locked visual state on rebuild
  if (hiddenEls.has(el)) row.classList.add('el-hidden');
  if (lockedEls.has(el)) row.classList.add('el-locked');

  // indent
  for (let i = 0; i < depth; i++) {
    const sp = document.createElement('span');
    sp.className = 'tree-indent';
    row.appendChild(sp);
  }

  // toggle arrow
  const toggle = document.createElement('button');
  toggle.className = 'tree-toggle' + (hasChildren ? '' : ' leaf');
  toggle.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  row.appendChild(toggle);

  // icon per tag
  row.appendChild(tagIcon(tag));

  // label
  const label = document.createElement('span');
  label.className = 'tree-tag';
  label.innerHTML = tagLabel(el);
  row.appendChild(label);

  // ── Batch 7: hide / lock action buttons ──
  if (tag !== 'svg') {
    const actions = document.createElement('div');
    actions.className = 'tree-actions';

    // Eye / Hide button
    const eyeBtn = document.createElement('button');
    eyeBtn.className = 'tree-action-btn' + (hiddenEls.has(el) ? ' active' : '');
    eyeBtn.title = 'Toggle visibility';
    eyeBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    eyeBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      if (hiddenEls.has(el)) {
        hiddenEls.delete(el);
        el.classList.remove('svg-hidden');
        row.classList.remove('el-hidden');
        eyeBtn.classList.remove('active');
      } else {
        hiddenEls.add(el);
        el.classList.add('svg-hidden');
        row.classList.add('el-hidden');
        eyeBtn.classList.add('active');
      }
    });

    // Lock button
    const lockBtn = document.createElement('button');
    lockBtn.className = 'tree-action-btn' + (lockedEls.has(el) ? ' active' : '');
    lockBtn.title = 'Toggle lock';
    lockBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
    lockBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      if (lockedEls.has(el)) {
        lockedEls.delete(el);
        el.classList.remove('svg-locked');
        row.classList.remove('el-locked');
        lockBtn.classList.remove('active');
      } else {
        lockedEls.add(el);
        el.classList.add('svg-locked');
        row.classList.add('el-locked');
        lockBtn.classList.add('active');
        // Deselect if currently selected
        if (selected.has(el)) {
          selected.delete(el);
          el.classList.remove('svg-selected');
          updateChips();
          updateAttrPanel();
        }
      }
    });

    actions.appendChild(eyeBtn);
    actions.appendChild(lockBtn);
    row.appendChild(actions);
  }

  container.appendChild(row);

  // Register in flat list (non-svg elements, pre-order = visual order)
  if (tag !== 'svg') {
    treeOrderedEls.push(el);
  }

  // ── Children container ──
  let childWrap = null;
  if (hasChildren) {
    childWrap = document.createElement('div');
    childWrap.className = 'tree-children';
    container.appendChild(childWrap);
    children.forEach(child => renderTreeNode(child, childWrap, depth + 1));

    toggle.classList.add('open');

    toggle.addEventListener('click', e => {
      e.stopPropagation();
      const open = toggle.classList.toggle('open');
      childWrap.classList.toggle('collapsed', !open);
    });
  }

  // ── Click to select (with range select) ──
  row.addEventListener('click', e => {
    if (tag === 'svg') return;
    if (e.target.closest('.tree-action-btn')) return;  // handled by action btns
    if (el.classList.contains('svg-locked')) return;   // locked elements not selectable

    if (e.shiftKey && lastClickedEl && lastClickedEl !== el) {
      // Range select: find indices in flat list
      const a = treeOrderedEls.indexOf(lastClickedEl);
      const b = treeOrderedEls.indexOf(el);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = treeOrderedEls.slice(lo, hi + 1);
        clearVisualSel();
        selected.clear();
        range.forEach(rangeEl => {
          if (!rangeEl.classList.contains('svg-locked')) {
            selected.add(rangeEl);
            rangeEl.classList.add('svg-selected');
          }
        });
        // Keep lastClickedEl as the anchor (don't update it on range select)
      }
    } else {
      // Normal click or shift-toggle
      if (!e.shiftKey) {
        clearVisualSel();
        selected.clear();
      }

      if (selected.has(el)) {
        selected.delete(el);
        el.classList.remove('svg-selected');
      } else {
        selected.add(el);
        el.classList.add('svg-selected');
      }

      lastClickedEl = el;
    }

    updateChips();
    updateAttrPanel();
    highlightTreeSelection();
  });

  // ── Store reference for reverse highlighting ──
  el._treeRow = row;
}

const INTERNAL_CLS = new Set(['svg-selected','svg-hover','svg-hidden','svg-locked']);

function tagLabel(el) {
  const tag = el.tagName.toLowerCase();
  const id  = el.id  ? ` <span class="tree-attr">#${el.id}</span>` : '';
  const rawCls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(c => c && !INTERNAL_CLS.has(c));
  const cls = rawCls.length
    ? ` <span class="tree-attr">.${rawCls.join('.')}</span>`
    : '';
  return `&lt;${tag}${id}${cls}&gt;`;
}

function tagIcon(tag) {
  const icons = {
    svg:      'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
    g:        'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    path:     'M3 3 L21 3 L21 21',
    rect:     'M3 3h18v18H3z',
    circle:   'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0',
    ellipse:  'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0',
    text:     'M4 7V4h16v3 M9 20h6 M12 4v16',
    defs:     'M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
    default:  'M12 2L2 7l10 5 10-5-10-5z',
  };
  const d = icons[tag] || icons.default;
  const el = document.createElement('span');
  el.className = 'tree-icon';
  el.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  return el;
}

// Highlight tree rows matching current selection
function highlightTreeSelection() {
  treeRoot.querySelectorAll('.tree-node').forEach(r => r.classList.remove('selected'));
  selected.forEach(el => {
    if (el._treeRow) el._treeRow.classList.add('selected');
  });
}

// Collapse all
btnCollapseTree.addEventListener('click', () => {
  treeRoot.querySelectorAll('.tree-children').forEach(c => c.classList.add('collapsed'));
  treeRoot.querySelectorAll('.tree-toggle').forEach(t => t.classList.remove('open'));
});

// Rebuild tree whenever svgViewport's children change
const treeObserver = new MutationObserver(() => {
  buildTree();
  highlightTreeSelection();
});

treeObserver.observe(document.getElementById('svg-viewport'), {
  childList: true, subtree: true
});

// Refresh tree label text after attr changes
document.getElementById('btn-apply-sel').addEventListener('click', () => {
  setTimeout(() => { buildTree(); highlightTreeSelection(); }, 50);
});
document.getElementById('btn-apply-grp').addEventListener('click', () => {
  setTimeout(() => { buildTree(); highlightTreeSelection(); }, 50);
});
document.getElementById('btn-group').addEventListener('click', () => {
  setTimeout(() => { buildTree(); highlightTreeSelection(); }, 50);
});
