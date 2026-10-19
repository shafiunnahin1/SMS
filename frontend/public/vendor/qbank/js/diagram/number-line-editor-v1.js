(function (window, document) {
    'use strict';

    if (window.QmxNumberLineEditor?.version) return;
    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Number Line] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['closed-interval', 'Closed interval', 'বদ্ধ ব্যবধান'],
        ['open-interval', 'Open interval', 'উন্মুক্ত ব্যবধান'],
        ['half-open', 'Half-open interval', 'অর্ধ-উন্মুক্ত'],
        ['ray-left', 'Left ray', 'বাম রশ্মি'],
        ['ray-right', 'Right ray', 'ডান রশ্মি'],
        ['marker', 'Endpoint / point', 'প্রান্তবিন্দু'],
        ['text', 'Text', 'লেখা']
    ];

    const state = {
        root: null, canvas: null, svg: null, context: null, document: null,
        selectedId: null, activeTool: 'select', draft: null, interaction: null,
        history: [], historyIndex: -1, controls: {}
    };

    function uid(prefix = 'number-line') {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[char]);
    }
    function clamp(value, min, max, fallback = min) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
    }
    function cleanNumber(value, digits = 3) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '0';
        const rounded = Number(number.toFixed(digits));
        return Object.is(rounded, -0) ? '0' : String(rounded);
    }
    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
    }
    function createDocument() {
        return {
            version: 15,
            id: uid('number-line'),
            mode: 'number-line',
            title: 'Number Line / Interval / Inequality Diagram',
            width: 1000,
            height: 600,
            background: '#ffffff',
            numberXMin: -10,
            numberXMax: 10,
            numberStep: 1,
            numberShowTicks: true,
            numberShowTickLabels: true,
            numberShowNotation: true,
            snap: true,
            objects: []
        };
    }
    function mapMetrics(doc = state.document) {
        const left = 70, right = doc.width - 70, axisY = doc.height / 2;
        const range = Math.max(0.001, doc.numberXMax - doc.numberXMin);
        return { left, right, axisY, scale: (right - left) / range };
    }
    function screenX(value, map = mapMetrics()) {
        return map.left + (value - state.document.numberXMin) * map.scale;
    }
    function worldX(pixel, map = mapMetrics()) {
        return state.document.numberXMin + (pixel - map.left) / map.scale;
    }
    function laneY(lane, map = mapMetrics()) { return map.axisY - clamp(lane, -4, 4, 0) * 58; }
    function snapX(value) {
        if (!state.document?.snap) return value;
        const step = clamp(state.document.numberStep, 0.01, 100000, 1);
        return Math.round(value / step) * step;
    }
    function localPoint(event) {
        const svg = state.svg;
        const point = svg.createSVGPoint();
        point.x = event.clientX; point.y = event.clientY;
        const matrix = svg.getScreenCTM();
        const local = matrix ? point.matrixTransform(matrix.inverse()) : point;
        return local;
    }
    function pointFromEvent(event) {
        const local = localPoint(event);
        const map = mapMetrics();
        return {
            x: clamp(snapX(worldX(local.x, map)), state.document.numberXMin, state.document.numberXMax, 0),
            lane: clamp(Math.round((map.axisY - local.y) / 58), -4, 4, 0)
        };
    }
    function intervalNotation(object) {
        if (object.leftInfinite && object.rightInfinite) return '(-∞, ∞)';
        const left = object.leftInfinite ? '(' : (object.startClosed ? '[' : '(');
        const right = object.rightInfinite ? ')' : (object.endClosed ? ']' : ')');
        const a = object.leftInfinite ? '-∞' : cleanNumber(object.start);
        const b = object.rightInfinite ? '∞' : cleanNumber(object.end);
        return `${left}${a}, ${b}${right}`;
    }
    function inequalityText(object) {
        if (object.label) return object.label;
        if (object.leftInfinite && object.rightInfinite) return 'All real numbers';
        if (object.leftInfinite) return `x ${object.endClosed ? '≤' : '<'} ${cleanNumber(object.end)}`;
        if (object.rightInfinite) return `x ${object.startClosed ? '≥' : '>'} ${cleanNumber(object.start)}`;
        return `${cleanNumber(object.start)} ${object.startClosed ? '≤' : '<'} x ${object.endClosed ? '≤' : '<'} ${cleanNumber(object.end)}`;
    }
    function intervalObject(start, end, options = {}) {
        let a = Number(start), b = Number(end);
        if (a > b) [a, b] = [b, a];
        return {
            id: uid('interval'), type: 'interval', start: a, end: b,
            leftInfinite: Boolean(options.leftInfinite), rightInfinite: Boolean(options.rightInfinite),
            startClosed: options.startClosed !== false, endClosed: options.endClosed !== false,
            lane: clamp(options.lane, -4, 4, 0), label: String(options.label || ''),
            notation: String(options.notation || ''), color: options.color || '#2563eb',
            strokeWidth: clamp(options.strokeWidth, 1, 18, 6), fill: options.fill || '#93c5fd',
            fillOpacity: clamp(options.fillOpacity, 0, 1, .2), showShading: options.showShading !== false
        };
    }
    function markerObject(x, lane = 0, closed = true) {
        return { id: uid('marker'), type: 'marker', x, lane, closed, label: cleanNumber(x), color: '#dc2626', size: 8 };
    }
    function textObject(x, lane = 1) {
        return { id: uid('text'), type: 'text', x, lane, text: 'Inequality note', color: '#0f172a', fontSize: 22, fontWeight: 'bold' };
    }

    function pushHistory() {
        if (!state.document) return;
        const snapshot = JSON.stringify(state.document);
        if (state.history[state.historyIndex] === snapshot) return;
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(snapshot);
        if (state.history.length > 100) state.history.shift();
        state.historyIndex = state.history.length - 1;
        updateHistoryButtons();
    }
    function restoreHistory(index) {
        if (index < 0 || index >= state.history.length) return;
        state.historyIndex = index;
        state.document = Diagram.normalizeSpec(JSON.parse(state.history[index]));
        state.selectedId = null; state.draft = null; state.interaction = null;
        syncDocumentControls(); render(); updateHistoryButtons();
    }
    function undo() { restoreHistory(state.historyIndex - 1); }
    function redo() { restoreHistory(state.historyIndex + 1); }
    function updateHistoryButtons() {
        if (!state.controls.undo) return;
        state.controls.undo.disabled = state.historyIndex <= 0;
        state.controls.redo.disabled = state.historyIndex >= state.history.length - 1;
    }

    function addStyles() {
        if (document.getElementById('qmx-number-line-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'qmx-number-line-editor-styles';
        style.textContent = `
        .qmx-number-line-editor[hidden]{display:none!important}.qmx-number-line-editor{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);padding:14px;display:flex;align-items:center;justify-content:center;font:14px/1.35 "Segoe UI",Arial,"Noto Sans Bengali",sans-serif;color:#0f172a}.qmx-number-line-shell{width:min(1420px,calc(100vw - 28px));height:min(900px,calc(100vh - 28px));background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.35);display:grid;grid-template-rows:auto 1fr auto;overflow:hidden}.qmx-number-line-header,.qmx-number-line-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #dbe3ef}.qmx-number-line-footer{border-top:1px solid #dbe3ef;border-bottom:0}.qmx-number-line-title{font-size:18px;font-weight:800}.qmx-number-line-subtitle{font-size:12px;color:#64748b}.qmx-number-line-actions{display:flex;gap:8px;flex-wrap:wrap}.qmx-number-line-btn{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer}.qmx-number-line-btn:hover{background:#f8fafc}.qmx-number-line-btn:disabled{opacity:.45;cursor:not-allowed}.qmx-number-line-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}.qmx-number-line-btn.danger{color:#dc2626}.qmx-number-line-main{min-height:0;display:grid;grid-template-columns:200px minmax(0,1fr) 270px;gap:10px;padding:10px;background:#f8fafc}.qmx-number-line-panel{background:#fff;border:1px solid #dbe3ef;border-radius:12px;padding:10px;overflow:auto}.qmx-number-line-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px}.qmx-number-line-tool{min-height:52px;border:1px solid #cbd5e1;background:#fff;border-radius:9px;font-weight:800;cursor:pointer}.qmx-number-line-tool small{display:block;color:#64748b;font-weight:500}.qmx-number-line-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.qmx-number-line-section{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#475569;font-weight:800;margin:14px 0 8px}.qmx-number-line-presets{display:grid;gap:7px}.qmx-number-line-preset{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:8px;font-weight:700;cursor:pointer}.qmx-number-line-canvas-wrap{border:1px solid #cbd5e1;border-radius:12px;background:#e8eef6;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px;min-width:0}.qmx-number-line-canvas{width:min(100%,1000px);aspect-ratio:5/3;background:#fff;box-shadow:0 8px 25px rgba(15,23,42,.12)}.qmx-number-line-canvas svg{display:block;width:100%;height:100%;touch-action:none;user-select:none}.qmx-number-line-field{display:grid;gap:5px;margin-bottom:10px}.qmx-number-line-field label{font-size:12px;font-weight:800;color:#334155}.qmx-number-line-field input,.qmx-number-line-field select,.qmx-number-line-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;background:#fff}.qmx-number-line-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.qmx-number-line-check{display:flex;gap:8px;align-items:center;margin:8px 0;font-weight:600}.qmx-number-line-status{color:#64748b;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.qmx-number-line-summary{background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;padding:9px;border-radius:9px;font-size:12px}.qmx-number-line-selection{pointer-events:none;fill:none;stroke:#2563eb;stroke-width:2;stroke-dasharray:7 5}.qmx-number-line-handle{fill:#fff;stroke:#2563eb;stroke-width:2;cursor:ew-resize}.qmx-number-line-draft{pointer-events:none;stroke:#7c3aed;stroke-width:3;stroke-dasharray:7 5}.qmx-number-line-empty{color:#64748b;text-align:center;padding:24px 5px}@media(max-width:900px){.qmx-number-line-editor{padding:0}.qmx-number-line-shell{width:100vw;height:100vh;border-radius:0}.qmx-number-line-main{grid-template-columns:160px minmax(0,1fr)}.qmx-number-line-main>.qmx-number-line-panel:last-child{grid-column:1/-1;max-height:300px}.qmx-number-line-title{font-size:15px}}
        `;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;
        addStyles();
        const root = document.createElement('div');
        root.className = 'qmx-number-line-editor'; root.hidden = true;
        root.innerHTML = `
        <div class="qmx-number-line-shell" role="dialog" aria-modal="true" aria-label="Number Line editor">
          <header class="qmx-number-line-header"><div><div class="qmx-number-line-title">Number Line / Interval / Inequality</div><div class="qmx-number-line-subtitle">Open and closed endpoints, rays, unions, intersections and compound inequalities</div></div><div class="qmx-number-line-actions"><button class="qmx-number-line-btn" data-act="new">New</button><button class="qmx-number-line-btn" data-act="undo">Undo</button><button class="qmx-number-line-btn" data-act="redo">Redo</button><button class="qmx-number-line-btn" data-act="duplicate">Duplicate</button><button class="qmx-number-line-btn danger" data-act="delete">Delete</button><button class="qmx-number-line-btn" data-act="close">×</button></div></header>
          <main class="qmx-number-line-main">
            <aside class="qmx-number-line-panel"><strong>Number-line tools</strong><div class="qmx-number-line-tools" data-tools></div><div class="qmx-number-line-section">Interval presets</div><div class="qmx-number-line-presets">
              <button class="qmx-number-line-preset" data-preset="closed">Closed interval [−3, 4]</button>
              <button class="qmx-number-line-preset" data-preset="open">Open interval (−2, 5)</button>
              <button class="qmx-number-line-preset" data-preset="half-open">Half-open [1, 6)</button>
              <button class="qmx-number-line-preset" data-preset="right-ray">x ≥ 2</button>
              <button class="qmx-number-line-preset" data-preset="left-ray">x &lt; −1</button>
              <button class="qmx-number-line-preset" data-preset="bounded">−3 &lt; x ≤ 4</button>
              <button class="qmx-number-line-preset" data-preset="union">x &lt; −2 or x ≥ 3</button>
              <button class="qmx-number-line-preset" data-preset="intersection">Intersection example</button>
              <button class="qmx-number-line-preset" data-preset="all-real">All real numbers</button>
              <button class="qmx-number-line-preset" data-preset="no-solution">No solution</button>
              <button class="qmx-number-line-preset" data-preset="clear">Clear objects</button>
            </div></aside>
            <section class="qmx-number-line-canvas-wrap"><div class="qmx-number-line-canvas" data-canvas></div></section>
            <aside class="qmx-number-line-panel"><strong>Document</strong><div class="qmx-number-line-field"><label>Title</label><input data-doc="title"></div><div class="qmx-number-line-grid2"><div class="qmx-number-line-field"><label>Width</label><input type="number" min="400" max="2400" data-doc="width"></div><div class="qmx-number-line-field"><label>Height</label><input type="number" min="260" max="1800" data-doc="height"></div><div class="qmx-number-line-field"><label>X minimum</label><input type="number" step="any" data-doc="numberXMin"></div><div class="qmx-number-line-field"><label>X maximum</label><input type="number" step="any" data-doc="numberXMax"></div><div class="qmx-number-line-field"><label>Tick step</label><input type="number" min=".01" step="any" data-doc="numberStep"></div><div class="qmx-number-line-field"><label>Background</label><input type="color" data-doc="background"></div></div><label class="qmx-number-line-check"><input type="checkbox" data-doc="numberShowTicks"> Show ticks</label><label class="qmx-number-line-check"><input type="checkbox" data-doc="numberShowTickLabels"> Show tick labels</label><label class="qmx-number-line-check"><input type="checkbox" data-doc="numberShowNotation"> Show interval notation</label><label class="qmx-number-line-check"><input type="checkbox" data-doc="snap"> Snap to tick step</label><hr><strong>Selected object</strong><div data-selected></div><div class="qmx-number-line-summary" data-summary></div></aside>
          </main>
          <footer class="qmx-number-line-footer"><div class="qmx-number-line-status" data-status></div><div class="qmx-number-line-actions"><button class="qmx-number-line-btn" data-act="export-svg">Export SVG</button><button class="qmx-number-line-btn" data-act="export-png">Export PNG</button><button class="qmx-number-line-btn primary" data-act="insert">Insert into question</button></div></footer>
        </div>`;
        document.body.appendChild(root);
        state.root = root; state.canvas = root.querySelector('[data-canvas]');
        state.controls = {
            tools: root.querySelector('[data-tools]'), selected: root.querySelector('[data-selected]'),
            summary: root.querySelector('[data-summary]'), status: root.querySelector('[data-status]'),
            undo: root.querySelector('[data-act="undo"]'), redo: root.querySelector('[data-act="redo"]')
        };
        TOOL_DEFS.forEach(([id, label, bn]) => {
            const button = document.createElement('button'); button.className = 'qmx-number-line-tool';
            button.dataset.tool = id; button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<small>${esc(bn)}</small>`;
            state.controls.tools.appendChild(button);
        });
        root.addEventListener('click', onRootClick);
        root.addEventListener('change', onRootInput);
        document.addEventListener('keydown', onKeydown);
    }

    function setTool(tool) {
        state.activeTool = tool; state.draft = null;
        state.controls.tools.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('is-active', button.dataset.tool === tool));
        setStatus(tool === 'select' ? 'Select and drag an interval, endpoint or annotation.' : 'Click the number line to place the selected object.');
        renderSelectionOverlay();
    }
    function syncDocumentControls() {
        state.root.querySelectorAll('[data-doc]').forEach((input) => {
            const key = input.dataset.doc;
            if (input.type === 'checkbox') input.checked = Boolean(state.document[key]);
            else input.value = state.document[key] ?? '';
        });
    }
    function selectedEditorMarkup(object) {
        if (!object) return '<div class="qmx-number-line-empty">Select an interval, endpoint or text label.</div>';
        if (object.type === 'interval') return `
          <div class="qmx-number-line-grid2"><div class="qmx-number-line-field"><label>Start</label><input type="number" step="any" data-sel="start" value="${esc(object.start)}"></div><div class="qmx-number-line-field"><label>End</label><input type="number" step="any" data-sel="end" value="${esc(object.end)}"></div><div class="qmx-number-line-field"><label>Lane</label><input type="number" min="-4" max="4" data-sel="lane" value="${esc(object.lane)}"></div><div class="qmx-number-line-field"><label>Line colour</label><input type="color" data-sel="color" value="${esc(object.color)}"></div></div>
          <label class="qmx-number-line-check"><input type="checkbox" data-sel="leftInfinite" ${object.leftInfinite ? 'checked' : ''}> Extends to −∞</label><label class="qmx-number-line-check"><input type="checkbox" data-sel="rightInfinite" ${object.rightInfinite ? 'checked' : ''}> Extends to +∞</label><label class="qmx-number-line-check"><input type="checkbox" data-sel="startClosed" ${object.startClosed ? 'checked' : ''}> Closed start</label><label class="qmx-number-line-check"><input type="checkbox" data-sel="endClosed" ${object.endClosed ? 'checked' : ''}> Closed end</label><label class="qmx-number-line-check"><input type="checkbox" data-sel="showShading" ${object.showShading ? 'checked' : ''}> Shade range</label>
          <div class="qmx-number-line-field"><label>Inequality label</label><input data-sel="label" value="${esc(object.label)}" placeholder="Auto"></div><div class="qmx-number-line-field"><label>Custom notation</label><input data-sel="notation" value="${esc(object.notation)}" placeholder="Auto: ${esc(intervalNotation(object))}"></div><div class="qmx-number-line-grid2"><div class="qmx-number-line-field"><label>Line width</label><input type="number" min="1" max="18" data-sel="strokeWidth" value="${esc(object.strokeWidth)}"></div><div class="qmx-number-line-field"><label>Fill opacity</label><input type="number" min="0" max="1" step=".05" data-sel="fillOpacity" value="${esc(object.fillOpacity)}"></div></div>`;
        if (object.type === 'marker') return `<div class="qmx-number-line-grid2"><div class="qmx-number-line-field"><label>Value</label><input type="number" step="any" data-sel="x" value="${esc(object.x)}"></div><div class="qmx-number-line-field"><label>Lane</label><input type="number" min="-4" max="4" data-sel="lane" value="${esc(object.lane)}"></div><div class="qmx-number-line-field"><label>Colour</label><input type="color" data-sel="color" value="${esc(object.color)}"></div><div class="qmx-number-line-field"><label>Size</label><input type="number" min="3" max="30" data-sel="size" value="${esc(object.size)}"></div></div><label class="qmx-number-line-check"><input type="checkbox" data-sel="closed" ${object.closed ? 'checked' : ''}> Closed endpoint</label><div class="qmx-number-line-field"><label>Label</label><input data-sel="label" value="${esc(object.label)}"></div>`;
        return `<div class="qmx-number-line-field"><label>Text</label><textarea data-sel="text">${esc(object.text)}</textarea></div><div class="qmx-number-line-grid2"><div class="qmx-number-line-field"><label>Value</label><input type="number" step="any" data-sel="x" value="${esc(object.x)}"></div><div class="qmx-number-line-field"><label>Lane</label><input type="number" min="-4" max="4" data-sel="lane" value="${esc(object.lane)}"></div><div class="qmx-number-line-field"><label>Colour</label><input type="color" data-sel="color" value="${esc(object.color)}"></div><div class="qmx-number-line-field"><label>Font size</label><input type="number" min="8" max="120" data-sel="fontSize" value="${esc(object.fontSize)}"></div></div><label class="qmx-number-line-check"><input type="checkbox" data-sel="fontWeight" ${object.fontWeight === 'bold' ? 'checked' : ''}> Bold</label>`;
    }
    function updateInspector() {
        const object = selectedObject();
        state.controls.selected.innerHTML = selectedEditorMarkup(object);
        const intervals = state.document.objects.filter((item) => item.type === 'interval').length;
        const markers = state.document.objects.filter((item) => item.type === 'marker').length;
        state.controls.summary.textContent = `${intervals} interval(s) · ${markers} standalone endpoint(s) · ${state.document.objects.length} total object(s)`;
    }

    function render() {
        state.canvas.innerHTML = Diagram.svgMarkup(state.document, { className: 'qmx-number-line-svg' });
        state.svg = state.canvas.querySelector('svg');
        state.svg.tabIndex = 0;
        state.svg.addEventListener('pointerdown', onPointerDown);
        state.svg.addEventListener('click', onCanvasClick);
        renderSelectionOverlay(); updateInspector(); updateHistoryButtons();
    }
    function renderSelectionOverlay() {
        if (!state.svg) return;
        state.svg.querySelector('[data-qmx-number-line-overlay]')?.remove();
        const ns = 'http://www.w3.org/2000/svg';
        const group = document.createElementNS(ns, 'g'); group.dataset.qmxNumberLineOverlay = '1';
        const object = selectedObject(); const map = mapMetrics();
        if (object) {
            if (object.type === 'interval') {
                const y = laneY(object.lane, map); const x1 = screenX(object.leftInfinite ? state.document.numberXMin : object.start, map); const x2 = screenX(object.rightInfinite ? state.document.numberXMax : object.end, map);
                const line = document.createElementNS(ns, 'rect'); line.setAttribute('x', Math.min(x1,x2)-10); line.setAttribute('y', y-18); line.setAttribute('width', Math.max(20,Math.abs(x2-x1)+20)); line.setAttribute('height', 36); line.setAttribute('class','qmx-number-line-selection'); group.appendChild(line);
                if (!object.leftInfinite) group.appendChild(makeHandle(ns,x1,y,'start'));
                if (!object.rightInfinite) group.appendChild(makeHandle(ns,x2,y,'end'));
            } else {
                const x = screenX(object.x, map), y = laneY(object.lane, map);
                const box = document.createElementNS(ns,'rect'); box.setAttribute('x',x-18); box.setAttribute('y',y-22); box.setAttribute('width',36); box.setAttribute('height',44); box.setAttribute('class','qmx-number-line-selection'); group.appendChild(box);
                group.appendChild(makeHandle(ns,x,y,'x'));
            }
        }
        if (state.draft) {
            const y = laneY(state.draft.lane,map), x = screenX(state.draft.x,map);
            const line = document.createElementNS(ns,'line'); line.setAttribute('x1',x); line.setAttribute('y1',y-35); line.setAttribute('x2',x); line.setAttribute('y2',y+35); line.setAttribute('class','qmx-number-line-draft'); group.appendChild(line);
        }
        state.svg.appendChild(group);
    }
    function makeHandle(ns,x,y,handle) {
        const circle=document.createElementNS(ns,'circle'); circle.setAttribute('cx',x); circle.setAttribute('cy',y); circle.setAttribute('r',8); circle.setAttribute('class','qmx-number-line-handle'); circle.dataset.handle=handle; circle.dataset.objectId=state.selectedId; return circle;
    }

    function addObject(object, message) {
        state.document.objects.push(object); state.selectedId = object.id; pushHistory(); render(); setStatus(message);
    }
    function onCanvasClick(event) {
        if (state.activeTool === 'select' || state.interaction) return;
        if (event.target.closest('[data-qmx-object-id], [data-handle]')) return;
        const point = pointFromEvent(event);
        if (state.activeTool === 'marker') { addObject(markerObject(point.x, point.lane, true), 'Endpoint added.'); setTool('select'); return; }
        if (state.activeTool === 'text') { addObject(textObject(point.x, point.lane || 1), 'Text annotation added.'); setTool('select'); return; }
        if (state.activeTool === 'ray-left') { addObject(intervalObject(state.document.numberXMin, point.x,{leftInfinite:true,endClosed:true,lane:point.lane,label:`x ≤ ${cleanNumber(point.x)}`,color:'#7c3aed'}),'Left ray added.'); setTool('select'); return; }
        if (state.activeTool === 'ray-right') { addObject(intervalObject(point.x,state.document.numberXMax,{rightInfinite:true,startClosed:true,lane:point.lane,label:`x ≥ ${cleanNumber(point.x)}`,color:'#16a34a'}),'Right ray added.'); setTool('select'); return; }
        if (!state.draft) { state.draft = point; renderSelectionOverlay(); setStatus('Choose the second endpoint.'); return; }
        const options = { lane: state.draft.lane };
        if (state.activeTool === 'open-interval') { options.startClosed=false; options.endClosed=false; }
        else if (state.activeTool === 'half-open') { options.startClosed=true; options.endClosed=false; }
        else { options.startClosed=true; options.endClosed=true; }
        const object = intervalObject(state.draft.x, point.x, options); state.draft=null; addObject(object,'Interval added.'); setTool('select');
    }
    function onPointerDown(event) {
        const handle = event.target.closest('[data-handle]');
        const target = event.target.closest('[data-qmx-object-id]');
        const objectId = handle?.dataset.objectId || target?.dataset.qmxObjectId;
        if (!objectId || state.activeTool !== 'select') return;
        const object = state.document.objects.find((item)=>item.id===objectId); if(!object) return;
        state.selectedId=objectId; const point=pointFromEvent(event);
        state.interaction={pointerId:event.pointerId,handle:handle?.dataset.handle||'move',start:point,original:clone(object),moved:false};
        document.addEventListener('pointermove',onPointerMove); document.addEventListener('pointerup',onPointerUp); document.addEventListener('pointercancel',onPointerUp); renderSelectionOverlay(); updateInspector(); event.preventDefault();
    }
    function onPointerMove(event) {
        const interaction=state.interaction; if(!interaction||interaction.pointerId!==event.pointerId)return;
        const object=selectedObject(); if(!object)return; const point=pointFromEvent(event); const dx=point.x-interaction.start.x; const dlane=point.lane-interaction.start.lane;
        if(object.type==='interval'){
            if(interaction.handle==='start') object.start=Math.min(point.x,object.end);
            else if(interaction.handle==='end') object.end=Math.max(point.x,object.start);
            else { object.start=clamp(interaction.original.start+dx,state.document.numberXMin,state.document.numberXMax); object.end=clamp(interaction.original.end+dx,state.document.numberXMin,state.document.numberXMax); object.lane=clamp(interaction.original.lane+dlane,-4,4,0); }
        } else { object.x=clamp(interaction.original.x+dx,state.document.numberXMin,state.document.numberXMax); object.lane=clamp(interaction.original.lane+dlane,-4,4,0); }
        interaction.moved=true; render();
    }
    function onPointerUp(event) {
        if(!state.interaction||state.interaction.pointerId!==event.pointerId)return;
        const moved=state.interaction.moved; state.interaction=null; document.removeEventListener('pointermove',onPointerMove); document.removeEventListener('pointerup',onPointerUp); document.removeEventListener('pointercancel',onPointerUp); if(moved)pushHistory(); render();
    }

    function onRootClick(event) {
        const tool=event.target.closest('[data-tool]'); if(tool){setTool(tool.dataset.tool);return;}
        const preset=event.target.closest('[data-preset]'); if(preset){applyPreset(preset.dataset.preset);return;}
        const action=event.target.closest('[data-act]')?.dataset.act; if(!action)return;
        ({new:newDocument,undo,redo,duplicate:duplicateSelected,delete:deleteSelected,close, 'export-svg':exportSvg,'export-png':exportPng,insert:insertIntoQuestion}[action]||(()=>{}))();
    }
    function onRootInput(event) {
        const docKey=event.target.dataset.doc; const selKey=event.target.dataset.sel;
        if(docKey){
            const input=event.target; let value=input.type==='checkbox'?input.checked:input.value;
            if(['width','height','numberXMin','numberXMax','numberStep'].includes(docKey)) value=Number(value);
            state.document[docKey]=value;
            if(state.document.numberXMax<=state.document.numberXMin)state.document.numberXMax=state.document.numberXMin+1;
            syncDocumentControls(); pushHistory(); render(); return;
        }
        if(selKey){
            const object=selectedObject(); if(!object)return; const input=event.target; let value=input.type==='checkbox'?input.checked:input.value;
            if(['start','end','lane','strokeWidth','fillOpacity','x','size','fontSize'].includes(selKey)) value=Number(value);
            if(selKey==='fontWeight') value=input.checked?'bold':'normal'; object[selKey]=value;
            if(object.type==='interval'&&object.start>object.end)[object.start,object.end]=[object.end,object.start];
            pushHistory(); render();
        }
    }

    function applyPreset(type) {
        const objects=[];
        if(type==='clear'){state.document.objects=[];state.selectedId=null;pushHistory();render();setStatus('Number line cleared.');return;}
        if(type==='closed') objects.push(intervalObject(-3,4,{label:'−3 ≤ x ≤ 4'}));
        if(type==='open') objects.push(intervalObject(-2,5,{startClosed:false,endClosed:false,label:'−2 < x < 5',color:'#7c3aed'}));
        if(type==='half-open') objects.push(intervalObject(1,6,{startClosed:true,endClosed:false,label:'1 ≤ x < 6',color:'#0891b2'}));
        if(type==='right-ray') objects.push(intervalObject(2,state.document.numberXMax,{rightInfinite:true,label:'x ≥ 2',color:'#16a34a'}));
        if(type==='left-ray') objects.push(intervalObject(state.document.numberXMin,-1,{leftInfinite:true,endClosed:false,label:'x < −1',color:'#dc2626'}));
        if(type==='bounded') objects.push(intervalObject(-3,4,{startClosed:false,endClosed:true,label:'−3 < x ≤ 4',color:'#ea580c'}));
        if(type==='union') objects.push(intervalObject(state.document.numberXMin,-2,{leftInfinite:true,endClosed:false,label:'x < −2',lane:1,color:'#dc2626'}),intervalObject(3,state.document.numberXMax,{rightInfinite:true,startClosed:true,label:'x ≥ 3',lane:-1,color:'#2563eb'}),textObject(0,3));
        if(type==='union') objects[2].text='Union: (−∞, −2) ∪ [3, ∞)';
        if(type==='intersection') objects.push(intervalObject(-2,4,{startClosed:false,endClosed:true,label:'Intersection: −2 < x ≤ 4',color:'#7c3aed'}));
        if(type==='all-real') objects.push(intervalObject(state.document.numberXMin,state.document.numberXMax,{leftInfinite:true,rightInfinite:true,label:'All real numbers',color:'#16a34a'}));
        if(type==='no-solution'){const text=textObject(0,1);text.text='No solution: ∅';text.color='#dc2626';text.fontSize=30;objects.push(text);}
        state.document.objects=objects; state.selectedId=objects[0]?.id||null; state.draft=null; pushHistory(); render(); setStatus(`${type} preset inserted.`);
    }
    function deleteSelected(){if(!state.selectedId)return;state.document.objects=state.document.objects.filter((item)=>item.id!==state.selectedId);state.selectedId=null;pushHistory();render();setStatus('Object deleted.');}
    function duplicateSelected(){const object=selectedObject();if(!object)return;const copy=clone(object);copy.id=uid(object.type);if(copy.type==='interval'){copy.start+=state.document.numberStep;copy.end+=state.document.numberStep;copy.lane=clamp(copy.lane-1,-4,4,0);}else{copy.x+=state.document.numberStep;copy.lane=clamp(copy.lane-1,-4,4,0);}state.document.objects.push(copy);state.selectedId=copy.id;pushHistory();render();setStatus('Object duplicated.');}
    function newDocument(){if(state.document.objects.length&&!window.confirm('Start a new number-line document?'))return;state.document=createDocument();state.selectedId=null;state.draft=null;state.history=[];state.historyIndex=-1;pushHistory();syncDocumentControls();setTool('select');render();setStatus('New number-line document.');}
    function makeToken(){return `[[qmx-diagram:${Diagram.encodeSpec(state.document)}]]`;}
    function insertIntoQuestion(){const textarea=state.context?.textarea;if(!textarea){setStatus('No target question field was found.');return;}const token=makeToken();const range=state.context?.replaceRange;textarea.focus();if(range&&Number.isInteger(range.start)&&Number.isInteger(range.end))textarea.setRangeText(token,range.start,range.end,'end');else{const start=textarea.selectionStart??textarea.value.length,end=textarea.selectionEnd??start,prefix=start>0&&!/\n$/.test(textarea.value.slice(0,start))?'\n':'',suffix=end<textarea.value.length&&!/^\n/.test(textarea.value.slice(end))?'\n':'';textarea.setRangeText(prefix+token+suffix,start,end,'end');}textarea.dispatchEvent(new Event('input',{bubbles:true}));textarea.dispatchEvent(new Event('change',{bubbles:true}));setStatus('Number-line diagram inserted. Save the question to persist it.');window.setTimeout(close,220);}
    function safeFilename(value){return String(value||'number-line').replace(/[\\/:*?"<>|]+/g,'-').trim()||'number-line';}
    function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
    function exportSvg(){downloadBlob(new Blob([Diagram.svgMarkup(state.document)],{type:'image/svg+xml;charset=utf-8'}),`${safeFilename(state.document.title)}.svg`);setStatus('SVG exported.');}
    function exportPng(){const svg=Diagram.svgMarkup(state.document),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=state.document.width;canvas.height=state.document.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);URL.revokeObjectURL(url);canvas.toBlob((blob)=>blob&&downloadBlob(blob,`${safeFilename(state.document.title)}.png`),'image/png');setStatus('PNG exported.');};image.onerror=()=>{URL.revokeObjectURL(url);setStatus('PNG export failed.');};image.src=url;}
    function setStatus(message){if(state.controls.status)state.controls.status.textContent=message;}
    function open(context={}){buildEditor();state.context=context;state.document=context.initialSpec?Diagram.normalizeSpec(context.initialSpec):createDocument();if(state.document.mode!=='number-line')state.document=createDocument();state.selectedId=null;state.activeTool='select';state.draft=null;state.interaction=null;state.history=[];state.historyIndex=-1;pushHistory();syncDocumentControls();setTool('select');render();state.root.hidden=false;document.body.dataset.qmxNumberLineOverflow=document.body.style.overflow||'';document.body.style.overflow='hidden';setStatus(context.initialSpec?'Existing Number Line diagram loaded.':'Choose an interval or inequality tool.');window.setTimeout(()=>state.svg.focus(),0);}
    function close(){if(!state.root||state.root.hidden)return;state.root.hidden=true;document.body.style.overflow=document.body.dataset.qmxNumberLineOverflow||'';delete document.body.dataset.qmxNumberLineOverflow;state.context?.textarea?.focus?.();}
    function findTokenTextarea(token){return Array.from(document.querySelectorAll('textarea')).find((textarea)=>textarea.value.includes(token))||null;}
    function openFromPreview(figure){const payload=String(figure?.dataset.qmxDiagramPayload||'');if(!payload)return false;let spec;try{spec=Diagram.decodePayload(payload);}catch(error){return false;}if(spec.mode!=='number-line')return false;const token=`[[qmx-diagram:${payload}]]`,textarea=findTokenTextarea(token)||window.QmxDiagramLauncher?.getActiveTextarea?.();let replaceRange=null;if(textarea){const start=textarea.value.indexOf(token);if(start>=0)replaceRange={start,end:start+token.length};}open({tool:{id:'number-line'},textarea,initialSpec:spec,replaceRange,editMode:true});return true;}
    function registerHandlers(){const launcher=window.QmxDiagramLauncher;if(!launcher?.registerToolHandler)return false;let registered=false;['number-line','interval-diagram','inequality-diagram','interval-number-line','numberline'].forEach((id)=>{try{launcher.registerToolHandler(id,open);registered=true;}catch(error){}});return registered;}
    function onKeydown(event){if(!state.root||state.root.hidden)return;const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(event.key==='Escape'){if(state.draft){state.draft=null;renderSelectionOverlay();setStatus('Interval draft cancelled.');}else close();event.preventDefault();return;}if((event.key==='Delete'||event.key==='Backspace')&&!editing){event.preventDefault();deleteSelected();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='d'&&!editing){event.preventDefault();duplicateSelected();}}
    function init(){buildEditor();if(!registerHandlers())document.addEventListener('qmx:diagram-launcher-ready',registerHandlers,{once:true});}
    window.QmxNumberLineEditor=Object.freeze({version:'1.0.0',open,close,openFromPreview,intervalNotation,inequalityText});
    document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})(window, document);
