# Iz SVG Editor — Claude Context

## Project Overview
A browser-based infinite-canvas SVG editor. Pure vanilla JS/HTML/CSS — no build step, no frameworks, no npm. Open `index.html` directly in a browser.

## File Structure
| File | Purpose |
|------|---------|
| `index.html` | Layout, DOM structure, script loading order |
| `styles.css` | All styling — dark theme, canvas, panels, rulers, tree |
| `app.js` | Core logic — render, select, zoom/pan, marquee, rulers, code editor |
| `pan.js` | Space+drag and middle-mouse pan (reads/writes global `panX`, `panY`) |
| `history.js` | Undo/redo via MutationObserver + XMLSerializer snapshots |
| `tree.js` | Element tree panel — build, highlight, hide/lock nodes |

## Architecture

### Infinite Canvas
- `#canvas-wrap`: fixed viewport, `overflow: hidden`, hosts the checkerboard background
- `#canvas-bg`: `position: absolute; transform-origin: 0 0` — panned and zoomed via `translate(panX,panY) scale(zoomScale)`
- `#svg-viewport`: inside canvas-bg, holds the live SVG DOM
- `applyTransform()` in app.js is the single function that updates the canvas transform and redraws rulers

### Pan & Zoom
- **Scroll wheel** = pan (deltaX/deltaY)
- **Ctrl+wheel** = zoom toward cursor (`zoomAt()`)
- **Space+drag** or **middle-mouse drag** = pan (handled in pan.js)
- Empty-canvas left-drag = marquee selection (NOT pan)
- Cross-script globals: `window.panMode`, `window.isPanning`, `panX`, `panY`, `zoomScale`

### Selection
- Click SVG element = select; Shift+click = multi-select
- Drag on empty canvas = marquee (rubber-band) select
- `wasMarquee` flag prevents the post-mouseup click from clearing selection
- `selected` = a `Set` of live DOM nodes

### History
- MutationObserver on `svgRoot` snapshots SVG XML after each change
- `isBusy` flag prevents snapshot loops during `restore()`
- Undo/redo restores full SVG XML, then calls `attachInteractivity()` + `applyTransform()`

### Rulers
- Two `<canvas>` elements (`#ruler-h`, `#ruler-v`) overlaid inside `#canvas-wrap`
- Drawn by `drawRulers()` called from every `applyTransform()`
- Tick step auto-scales to a "nice" number based on current `zoomScale`
- Coordinates shown in SVG canvas units (origin = SVG top-left)

### SVG Code Editor
- Bottom-left panel ("SVG CODE") is an editable `<textarea id="svg-output-code">`
- `refreshOutput()` keeps it in sync after any canvas mutation
- Ctrl+Enter or "Apply" button calls `renderSVG()` with the textarea content

## Key Global Functions (app.js)
- `renderSVG(text)` — parse + render SVG string, fit to canvas
- `fitToCanvas()` — center and scale SVG to fill canvas-wrap
- `applyTransform()` — apply pan+zoom transform, redraw rulers, update zoom% label
- `zoomAt(scale, cx, cy)` — zoom toward a canvas-wrap pixel coordinate
- `drawRulers()` — redraw both ruler canvases
- `refreshOutput()` — sync code editor textarea with live SVG
- `attachInteractivity()` — bind click/hover events to all SVG elements
- `snapshot()` / `undo()` / `redo()` — in history.js
- `buildTree()` / `highlightTreeSelection()` — in tree.js

## Coding Conventions
- `'use strict'` in every file
- DOM refs declared at top of each file
- No external libraries or bundlers
- Scripts loaded at bottom of `<body>` in order: app.js → tree.js → history.js → pan.js
- pan.js reads `panX`, `panY` as globals set by app.js
