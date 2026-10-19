(function (window, document) {
    'use strict';

    if (window.QmxCoordinateGeometryEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Coordinate Geometry] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['point', 'Point', 'বিন্দু'],
        ['segment', 'Segment', 'রেখাংশ'],
        ['line', 'Line', 'সরলরেখা'],
        ['circle', 'Circle', 'বৃত্ত'],
        ['ellipse', 'Ellipse', 'উপবৃত্ত'],
        ['parabola', 'Parabola', 'পরাবৃত্ত'],
        ['hyperbola', 'Hyperbola', 'অধিবৃত্ত'],
        ['midpoint', 'Midpoint', 'মধ্যবিন্দু'],
        ['distance', 'Distance', 'দূরত্ব'],
        ['slope', 'Slope', 'ঢাল'],
        ['parallel', 'Parallel', 'সমান্তরাল'],
        ['perpendicular', 'Perpendicular', 'লম্ব'],
        ['text', 'Text', 'লেখা']
    ];

    const TWO_POINT_TOOLS = new Set([
        'segment', 'line', 'circle', 'ellipse', 'parabola', 'hyperbola',
        'midpoint', 'distance', 'slope'
    ]);
    const THREE_POINT_TOOLS = new Set(['parallel', 'perpendicular']);

    const state = {
        root: null,
        svg: null,
        context: null,
        document: null,
        selectedId: null,
        activeTool: 'select',
        draft: [],
        interaction: null,
        history: [],
        historyIndex: -1,
        controls: {}
    };

    function uid(prefix = 'coord') {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[char]);
    }

    function clamp(value, min, max, fallback = min) {
        const number = Number(value);
        return Number.isFinite(number)
            ? Math.min(max, Math.max(min, number))
            : fallback;
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
            version: 14,
            id: uid('coordinate-geometry'),
            mode: 'coordinate-geometry',
            title: 'Coordinate Geometry / Mathematical Construction',
            width: 1000,
            height: 600,
            background: '#ffffff',
            coordXMin: -10,
            coordXMax: 10,
            coordYMin: -5,
            coordYMax: 5,
            coordGridStep: 1,
            showGrid: true,
            showAxes: true,
            coordShowTickLabels: true,
            snap: true,
            objects: []
        };
    }

    function metrics(doc = state.document) {
        const padding = 58;
        const xMin = Number(doc.coordXMin);
        const xMax = Number(doc.coordXMax);
        const yMin = Number(doc.coordYMin);
        const yMax = Number(doc.coordYMax);
        const xRange = Math.max(0.001, xMax - xMin);
        const yRange = Math.max(0.001, yMax - yMin);
        const scale = Math.min(
            Math.max(1, doc.width - padding * 2) / xRange,
            Math.max(1, doc.height - padding * 2) / yRange
        );
        const plotWidth = xRange * scale;
        const plotHeight = yRange * scale;
        const left = (doc.width - plotWidth) / 2;
        const top = (doc.height - plotHeight) / 2;

        return {
            padding,
            xMin,
            xMax,
            yMin,
            yMax,
            xRange,
            yRange,
            scale,
            left,
            top,
            right: left + plotWidth,
            bottom: top + plotHeight,
            plotWidth,
            plotHeight
        };
    }

    function screenPoint(x, y, map = metrics()) {
        return {
            x: map.left + (x - map.xMin) * map.scale,
            y: map.bottom - (y - map.yMin) * map.scale
        };
    }

    function worldPoint(x, y, map = metrics()) {
        return {
            x: map.xMin + (x - map.left) / map.scale,
            y: map.yMin + (map.bottom - y) / map.scale
        };
    }

    function snapCoordinate(value) {
        if (!state.document?.snap) return value;
        const step = clamp(state.document.coordGridStep, 0.01, 100000, 1);
        return Math.round(value / step) * step;
    }

    function pointFromEvent(event) {
        const localPoint = state.svg.createSVGPoint();
        localPoint.x = event.clientX;
        localPoint.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        const local = matrix ? localPoint.matrixTransform(matrix.inverse()) : localPoint;
        const map = metrics();
        const raw = worldPoint(local.x, local.y, map);

        return {
            x: clamp(snapCoordinate(raw.x), map.xMin, map.xMax, 0),
            y: clamp(snapCoordinate(raw.y), map.yMin, map.yMax, 0)
        };
    }

    function nextPointLabel() {
        const labels = new Set(
            state.document.objects
                .filter((object) => object.type === 'point')
                .map((object) => String(object.label || '').trim())
        );

        for (const label of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
            if (!labels.has(label)) return label;
        }
        return `P${labels.size + 1}`;
    }

    function lineStyle(type) {
        return {
            id: uid(type),
            type,
            x1: 0,
            y1: 0,
            x2: 1,
            y2: 1,
            label: '',
            stroke: '#2563eb',
            strokeWidth: 2.5,
            dash: false,
            showEquation: type === 'line'
        };
    }

    function pointObject(point, label = nextPointLabel()) {
        return {
            id: uid('point'),
            type: 'point',
            x: point.x,
            y: point.y,
            label,
            color: '#dc2626',
            labelColor: '#0f172a',
            size: 6
        };
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
        state.selectedId = null;
        state.draft = [];
        state.interaction = null;
        syncDocumentControls();
        render();
        updateHistoryButtons();
    }

    function undo() {
        restoreHistory(state.historyIndex - 1);
    }

    function redo() {
        restoreHistory(state.historyIndex + 1);
    }

    function updateHistoryButtons() {
        if (!state.controls.undo) return;
        state.controls.undo.disabled = state.historyIndex <= 0;
        state.controls.redo.disabled = state.historyIndex >= state.history.length - 1;
    }

    function addStyles() {
        if (document.getElementById('qmx-coordinate-geometry-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-coordinate-geometry-editor-styles';
        style.textContent = `
.qmx-coordinate-editor[hidden]{display:none!important}
.qmx-coordinate-editor{position:fixed;inset:0;z-index:10180;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.70);backdrop-filter:blur(2px)}
.qmx-coordinate-dialog{width:min(1520px,100%);height:min(96vh,980px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.38)}
.qmx-coordinate-header{display:flex;align-items:center;gap:9px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-coordinate-title{margin-right:auto}.qmx-coordinate-title strong{display:block}.qmx-coordinate-title span{display:block;color:#64748b;font-size:11px}
.qmx-coordinate-btn,.qmx-coordinate-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-coordinate-btn:hover,.qmx-coordinate-tool:hover{border-color:#60a5fa;background:#eff6ff}
.qmx-coordinate-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-coordinate-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}
.qmx-coordinate-btn.is-danger{color:#b91c1c}.qmx-coordinate-close{font-size:20px;line-height:1}
.qmx-coordinate-workspace{min-height:0;flex:1;display:grid;grid-template-columns:220px minmax(0,1fr) 285px;gap:10px;padding:10px}
.qmx-coordinate-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-coordinate-panel h3{margin:0 0 8px;font-size:13px}
.qmx-coordinate-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-coordinate-tool{min-height:55px;padding:7px 5px;font-size:11px}
.qmx-coordinate-tool span{display:block;margin-top:2px;color:#64748b;font-size:10px;font-weight:500}
.qmx-coordinate-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-coordinate-group-title{margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;color:#475569;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.qmx-coordinate-quick{display:grid;gap:7px;margin-top:8px}
.qmx-coordinate-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-coordinate-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-coordinate-stage{display:block;width:min(100%,1180px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.17);touch-action:none;user-select:none}
.qmx-coordinate-object{cursor:move}.qmx-coordinate-object text{pointer-events:none}
.qmx-coordinate-hit{fill:none;stroke:transparent;stroke-width:18;pointer-events:stroke}
.qmx-coordinate-hit-fill{fill:transparent;stroke:transparent;stroke-width:16;pointer-events:all}
.qmx-coordinate-select{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-coordinate-draft{fill:none;stroke:#2563eb;stroke-width:2;stroke-dasharray:7 5;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-coordinate-draft-point{fill:#2563eb;stroke:#fff;stroke-width:1.5;pointer-events:none}
.qmx-coordinate-fields{display:grid;gap:9px}
.qmx-coordinate-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-coordinate-field input,.qmx-coordinate-field textarea,.qmx-coordinate-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-coordinate-field textarea{min-height:62px;resize:vertical}
.qmx-coordinate-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-coordinate-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-coordinate-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}
.qmx-coordinate-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-coordinate-summary{margin-top:10px;padding:9px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.55}
.qmx-coordinate-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-coordinate-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}
.qmx-coordinate-footer .qmx-coordinate-btn:first-of-type{margin-left:auto}
@media(max-width:1080px){.qmx-coordinate-workspace{grid-template-columns:180px minmax(0,1fr) 250px}.qmx-coordinate-tools{grid-template-columns:1fr}}
@media(max-width:760px){.qmx-coordinate-editor{padding:0}.qmx-coordinate-dialog{width:100%;height:100%;border-radius:0}.qmx-coordinate-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(360px,1fr) auto;overflow:auto}.qmx-coordinate-panel{overflow:visible}.qmx-coordinate-tools{grid-template-columns:repeat(2,1fr)}.qmx-coordinate-header{overflow-x:auto}.qmx-coordinate-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-coordinate-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-coordinate-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-coordinate-title">
<header class="qmx-coordinate-header">
    <div class="qmx-coordinate-title">
        <strong id="qmx-coordinate-title">Coordinate Geometry / Mathematical Construction</strong>
        <span>Coordinate plane, lines, measurements, conics, parallel and perpendicular constructions</span>
    </div>
    <button type="button" class="qmx-coordinate-btn" data-coordinate-new>New</button>
    <button type="button" class="qmx-coordinate-btn" data-coordinate-undo>Undo</button>
    <button type="button" class="qmx-coordinate-btn" data-coordinate-redo>Redo</button>
    <button type="button" class="qmx-coordinate-btn" data-coordinate-duplicate>Duplicate</button>
    <button type="button" class="qmx-coordinate-btn is-danger" data-coordinate-delete>Delete</button>
    <button type="button" class="qmx-coordinate-btn qmx-coordinate-close" data-coordinate-close aria-label="Close">×</button>
</header>

<div class="qmx-coordinate-workspace">
    <aside class="qmx-coordinate-panel">
        <h3>Coordinate tools</h3>
        <div class="qmx-coordinate-tools" data-coordinate-tools></div>

        <div class="qmx-coordinate-group-title">Construction presets</div>
        <div class="qmx-coordinate-quick">
            <button type="button" class="qmx-coordinate-btn" data-coordinate-preset="line-circle">Line and circle</button>
            <button type="button" class="qmx-coordinate-btn" data-coordinate-preset="slope-midpoint">Slope, distance and midpoint</button>
            <button type="button" class="qmx-coordinate-btn" data-coordinate-preset="parallel-perpendicular">Parallel and perpendicular</button>
            <button type="button" class="qmx-coordinate-btn" data-coordinate-preset="conics">Conic sections</button>
            <button type="button" class="qmx-coordinate-btn" data-coordinate-clear>Clear objects</button>
        </div>

        <p class="qmx-coordinate-help">
            Point and Text use one click. Segment, Line, Circle, Ellipse, Parabola,
            Hyperbola, Midpoint, Distance and Slope use two clicks. Parallel and
            Perpendicular use three clicks: two points for the base line and one
            point for the constructed line.
        </p>
    </aside>

    <main class="qmx-coordinate-stage-wrap">
        <svg class="qmx-coordinate-stage" data-coordinate-svg viewBox="0 0 1000 600" tabindex="0" aria-label="Coordinate geometry canvas">
            <defs>
                <marker id="qmx-coordinate-axis-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke"></path>
                </marker>
            </defs>
            <rect data-coordinate-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-coordinate-grid></g>
            <g data-coordinate-objects></g>
            <g data-coordinate-draft></g>
            <g data-coordinate-selection></g>
        </svg>
    </main>

    <aside class="qmx-coordinate-panel">
        <h3>Document</h3>
        <div class="qmx-coordinate-fields">
            <label class="qmx-coordinate-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-coordinate-row">
                <label class="qmx-coordinate-field">Width<input type="number" min="360" max="2400" data-doc-prop="width"></label>
                <label class="qmx-coordinate-field">Height<input type="number" min="260" max="1800" data-doc-prop="height"></label>
            </div>
            <div class="qmx-coordinate-row">
                <label class="qmx-coordinate-field">X minimum<input type="number" step=".1" data-doc-prop="coordXMin"></label>
                <label class="qmx-coordinate-field">X maximum<input type="number" step=".1" data-doc-prop="coordXMax"></label>
            </div>
            <div class="qmx-coordinate-row">
                <label class="qmx-coordinate-field">Y minimum<input type="number" step=".1" data-doc-prop="coordYMin"></label>
                <label class="qmx-coordinate-field">Y maximum<input type="number" step=".1" data-doc-prop="coordYMax"></label>
            </div>
            <div class="qmx-coordinate-row">
                <label class="qmx-coordinate-field">Grid step<input type="number" min=".01" max="100000" step=".1" data-doc-prop="coordGridStep"></label>
                <label class="qmx-coordinate-field">Background<input type="color" data-doc-prop="background"></label>
            </div>
            <label class="qmx-coordinate-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label>
            <label class="qmx-coordinate-check"><input type="checkbox" data-doc-prop="showAxes"> Show coordinate axes</label>
            <label class="qmx-coordinate-check"><input type="checkbox" data-doc-prop="coordShowTickLabels"> Show tick labels</label>
            <label class="qmx-coordinate-check"><input type="checkbox" data-doc-prop="snap"> Snap to grid step</label>
        </div>

        <hr class="qmx-coordinate-divider">
        <h3>Selected object</h3>
        <div data-coordinate-properties></div>
        <div class="qmx-coordinate-summary" data-coordinate-summary></div>
    </aside>
</div>

<footer class="qmx-coordinate-footer">
    <span class="qmx-coordinate-status" data-coordinate-status aria-live="polite"></span>
    <button type="button" class="qmx-coordinate-btn" data-coordinate-export-svg>Export SVG</button>
    <button type="button" class="qmx-coordinate-btn" data-coordinate-export-png>Export PNG</button>
    <button type="button" class="qmx-coordinate-btn is-primary" data-coordinate-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.svg = root.querySelector('[data-coordinate-svg]');
        state.controls = {
            bg: root.querySelector('[data-coordinate-bg]'),
            grid: root.querySelector('[data-coordinate-grid]'),
            objects: root.querySelector('[data-coordinate-objects]'),
            draft: root.querySelector('[data-coordinate-draft]'),
            selection: root.querySelector('[data-coordinate-selection]'),
            tools: root.querySelector('[data-coordinate-tools]'),
            props: root.querySelector('[data-coordinate-properties]'),
            summary: root.querySelector('[data-coordinate-summary]'),
            status: root.querySelector('[data-coordinate-status]'),
            undo: root.querySelector('[data-coordinate-undo]'),
            redo: root.querySelector('[data-coordinate-redo]')
        };

        TOOL_DEFS.forEach(([id, label, labelBn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-coordinate-tool';
            button.dataset.coordinateTool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, labelBn) : `${esc(label)}<span>${esc(labelBn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        root.querySelector('[data-coordinate-close]').addEventListener('click', close);
        root.querySelector('[data-coordinate-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-coordinate-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-coordinate-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-coordinate-clear]').addEventListener('click', clearObjects);
        root.querySelector('[data-coordinate-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-coordinate-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-coordinate-insert]').addEventListener('click', insertIntoQuestion);

        root.addEventListener('click', (event) => {
            const toolButton = event.target.closest('[data-coordinate-tool]');
            if (toolButton) setTool(toolButton.dataset.coordinateTool);

            const presetButton = event.target.closest('[data-coordinate-preset]');
            if (presetButton) insertPreset(presetButton.dataset.coordinatePreset);
        });

        root.addEventListener('input', onControlInput);
        root.addEventListener('change', onControlChange);

        state.svg.addEventListener('pointerdown', onPointerDown);
        state.svg.addEventListener('pointermove', onPointerMove);
        state.svg.addEventListener('pointerup', onPointerUp);
        state.svg.addEventListener('pointercancel', onPointerUp);
        state.svg.addEventListener('click', onCanvasClick);

        document.addEventListener('keydown', onKeydown);
    }

    function setTool(tool) {
        state.activeTool = TOOL_DEFS.some(([id]) => id === tool) ? tool : 'select';
        state.draft = [];
        state.interaction = null;

        state.root.querySelectorAll('[data-coordinate-tool]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.coordinateTool === state.activeTool);
        });

        renderDraft();

        const definition = TOOL_DEFS.find(([id]) => id === state.activeTool);
        if (definition) {
            const clickCount = THREE_POINT_TOOLS.has(state.activeTool)
                ? 'Click three construction points.'
                : (TWO_POINT_TOOLS.has(state.activeTool)
                    ? 'Click two construction points.'
                    : 'Click the coordinate plane.');
            setStatus(`${definition[1]} tool selected. ${clickCount}`);
        }
    }

    function gridValues(min, max, step, limit = 160) {
        const values = [];
        const safeStep = Math.max(0.000001, Math.abs(step));
        let value = Math.ceil(min / safeStep) * safeStep;
        let count = 0;

        while (value <= max + safeStep * 0.0001 && count < limit) {
            values.push(Number(value.toFixed(10)));
            value += safeStep;
            count += 1;
        }
        return values;
    }

    function renderGrid() {
        const doc = state.document;
        const map = metrics(doc);
        const step = clamp(doc.coordGridStep, 0.01, 100000, 1);
        const xValues = gridValues(map.xMin, map.xMax, step);
        const yValues = gridValues(map.yMin, map.yMax, step);
        const parts = [];

        parts.push(`<rect x="${map.left}" y="${map.top}" width="${map.plotWidth}" height="${map.plotHeight}" fill="none" stroke="#cbd5e1" stroke-width="1"/>`);

        if (doc.showGrid) {
            xValues.forEach((value) => {
                const point = screenPoint(value, 0, map);
                const major = Math.abs(value / step) % 5 < 0.00001;
                parts.push(`<line x1="${point.x}" y1="${map.top}" x2="${point.x}" y2="${map.bottom}" stroke="${major ? '#cbd5e1' : '#e2e8f0'}" stroke-width="${major ? 1.15 : 0.8}"/>`);
            });
            yValues.forEach((value) => {
                const point = screenPoint(0, value, map);
                const major = Math.abs(value / step) % 5 < 0.00001;
                parts.push(`<line x1="${map.left}" y1="${point.y}" x2="${map.right}" y2="${point.y}" stroke="${major ? '#cbd5e1' : '#e2e8f0'}" stroke-width="${major ? 1.15 : 0.8}"/>`);
            });
        }

        if (doc.showAxes) {
            if (map.yMin <= 0 && map.yMax >= 0) {
                const originY = screenPoint(0, 0, map).y;
                parts.push(`<line x1="${map.left}" y1="${originY}" x2="${map.right}" y2="${originY}" stroke="#334155" stroke-width="2" marker-end="url(#qmx-coordinate-axis-arrow)"/>`);
                parts.push(`<text x="${map.right - 5}" y="${originY - 10}" text-anchor="end" font-size="15" font-weight="800" fill="#334155">x</text>`);
            }
            if (map.xMin <= 0 && map.xMax >= 0) {
                const originX = screenPoint(0, 0, map).x;
                parts.push(`<line x1="${originX}" y1="${map.bottom}" x2="${originX}" y2="${map.top}" stroke="#334155" stroke-width="2" marker-end="url(#qmx-coordinate-axis-arrow)"/>`);
                parts.push(`<text x="${originX + 10}" y="${map.top + 15}" font-size="15" font-weight="800" fill="#334155">y</text>`);
            }
        }

        if (doc.coordShowTickLabels) {
            const axisY = map.yMin <= 0 && map.yMax >= 0 ? screenPoint(0, 0, map).y : map.bottom;
            const axisX = map.xMin <= 0 && map.xMax >= 0 ? screenPoint(0, 0, map).x : map.left;

            xValues.forEach((value) => {
                if (Math.abs(value) < step * 0.0001) return;
                const point = screenPoint(value, 0, map);
                parts.push(`<text x="${point.x}" y="${axisY + 18}" text-anchor="middle" font-size="10" fill="#64748b">${esc(cleanNumber(value))}</text>`);
            });
            yValues.forEach((value) => {
                if (Math.abs(value) < step * 0.0001) return;
                const point = screenPoint(0, value, map);
                parts.push(`<text x="${axisX - 8}" y="${point.y + 3}" text-anchor="end" font-size="10" fill="#64748b">${esc(cleanNumber(value))}</text>`);
            });
        }

        state.controls.grid.innerHTML = parts.join('');
    }

    function clipLine(x1, y1, x2, y2, map = metrics()) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const candidates = [];

        function add(x, y) {
            if (
                x >= map.xMin - 1e-8 &&
                x <= map.xMax + 1e-8 &&
                y >= map.yMin - 1e-8 &&
                y <= map.yMax + 1e-8
            ) {
                if (!candidates.some((point) => Math.hypot(point.x - x, point.y - y) < 1e-7)) {
                    candidates.push({ x, y });
                }
            }
        }

        if (Math.abs(dx) > 1e-10) {
            let t = (map.xMin - x1) / dx;
            add(map.xMin, y1 + t * dy);
            t = (map.xMax - x1) / dx;
            add(map.xMax, y1 + t * dy);
        }

        if (Math.abs(dy) > 1e-10) {
            let t = (map.yMin - y1) / dy;
            add(x1 + t * dx, map.yMin);
            t = (map.yMax - y1) / dy;
            add(x1 + t * dx, map.yMax);
        }

        if (candidates.length < 2) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];

        let best = [candidates[0], candidates[1]];
        let bestDistance = -1;

        for (let i = 0; i < candidates.length; i += 1) {
            for (let j = i + 1; j < candidates.length; j += 1) {
                const distance = Math.hypot(
                    candidates[j].x - candidates[i].x,
                    candidates[j].y - candidates[i].y
                );
                if (distance > bestDistance) {
                    bestDistance = distance;
                    best = [candidates[i], candidates[j]];
                }
            }
        }

        return best;
    }

    function lineEquation(object) {
        const dx = object.x2 - object.x1;
        const dy = object.y2 - object.y1;

        if (Math.abs(dx) < 1e-9) return `x = ${cleanNumber(object.x1)}`;

        const slope = dy / dx;
        const intercept = object.y1 - slope * object.x1;
        const sign = intercept < 0 ? '−' : '+';
        return `y = ${cleanNumber(slope)}x ${sign} ${cleanNumber(Math.abs(intercept))}`;
    }

    function sampledParabola(object, map = metrics()) {
        const points = [];
        const samples = 180;

        if (object.orientation === 'horizontal') {
            for (let i = 0; i <= samples; i += 1) {
                const y = map.yMin + (map.yRange * i) / samples;
                const x = object.vx + object.a * ((y - object.vy) ** 2);
                if (x >= map.xMin && x <= map.xMax) points.push(screenPoint(x, y, map));
                else points.push(null);
            }
        } else {
            for (let i = 0; i <= samples; i += 1) {
                const x = map.xMin + (map.xRange * i) / samples;
                const y = object.vy + object.a * ((x - object.vx) ** 2);
                if (y >= map.yMin && y <= map.yMax) points.push(screenPoint(x, y, map));
                else points.push(null);
            }
        }

        return pathFromPoints(points);
    }

    function sampledHyperbola(object, map = metrics()) {
        const branches = [];
        const samples = 100;
        const maxT = 3.2;

        [-1, 1].forEach((branch) => {
            const points = [];
            for (let i = 0; i <= samples; i += 1) {
                const t = -maxT + (2 * maxT * i) / samples;
                let x;
                let y;

                if (object.orientation === 'vertical') {
                    x = object.cx + object.b * Math.sinh(t);
                    y = object.cy + branch * object.a * Math.cosh(t);
                } else {
                    x = object.cx + branch * object.a * Math.cosh(t);
                    y = object.cy + object.b * Math.sinh(t);
                }

                if (
                    x >= map.xMin &&
                    x <= map.xMax &&
                    y >= map.yMin &&
                    y <= map.yMax
                ) {
                    points.push(screenPoint(x, y, map));
                } else {
                    points.push(null);
                }
            }
            branches.push(pathFromPoints(points));
        });

        return branches.filter(Boolean).join(' ');
    }

    function pathFromPoints(points) {
        let path = '';
        let open = false;

        points.forEach((point) => {
            if (!point) {
                open = false;
                return;
            }
            path += `${open ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)} `;
            open = true;
        });

        return path.trim();
    }

    function objectLineEndpoints(object, map = metrics()) {
        if (object.type === 'segment' || object.type === 'distance' || object.type === 'slope' || object.type === 'midpoint') {
            return [screenPoint(object.x1, object.y1, map), screenPoint(object.x2, object.y2, map)];
        }

        if (object.type === 'line') {
            return clipLine(object.x1, object.y1, object.x2, object.y2, map).map((point) => screenPoint(point.x, point.y, map));
        }

        if (object.type === 'parallel' || object.type === 'perpendicular') {
            let dx = object.x2 - object.x1;
            let dy = object.y2 - object.y1;
            if (object.type === 'perpendicular') [dx, dy] = [-dy, dx];
            if (Math.hypot(dx, dy) < 1e-9) dx = 1;
            return clipLine(object.px, object.py, object.px + dx, object.py + dy, map)
                .map((point) => screenPoint(point.x, point.y, map));
        }

        return [];
    }

    function objectMarkup(object) {
        const map = metrics();
        const fontFamily = 'Arial, Noto Sans Bengali, sans-serif';

        if (object.type === 'point') {
            const point = screenPoint(object.x, object.y, map);
            return `<g class="qmx-coordinate-object" data-object-id="${esc(object.id)}">
                <circle cx="${point.x}" cy="${point.y}" r="${object.size}" fill="${esc(object.color)}" stroke="#ffffff" stroke-width="1.5"/>
                <text x="${point.x + object.size + 5}" y="${point.y - object.size - 4}" font-family="${fontFamily}" font-size="14" font-weight="800" fill="${esc(object.labelColor)}">${esc(object.label)}</text>
                <circle class="qmx-coordinate-hit-fill" cx="${point.x}" cy="${point.y}" r="${Math.max(13, object.size + 7)}"/>
            </g>`;
        }

        if (['segment', 'line', 'parallel', 'perpendicular'].includes(object.type)) {
            const [a, b] = objectLineEndpoints(object, map);
            if (!a || !b) return '';
            const dash = object.dash ? ' stroke-dasharray="8 6"' : '';
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const label = object.label || (object.type === 'parallel' ? '∥' : (object.type === 'perpendicular' ? '⊥' : ''));
            const equation = object.showEquation && ['segment', 'line'].includes(object.type)
                ? lineEquation(object)
                : '';
            let base = '';

            if (object.type === 'parallel' || object.type === 'perpendicular') {
                const baseEnds = clipLine(object.x1, object.y1, object.x2, object.y2, map)
                    .map((point) => screenPoint(point.x, point.y, map));
                base = `<line x1="${baseEnds[0].x}" y1="${baseEnds[0].y}" x2="${baseEnds[1].x}" y2="${baseEnds[1].y}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="7 5"/>`;
            }

            return `<g class="qmx-coordinate-object" data-object-id="${esc(object.id)}">
                ${base}
                <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash}/>
                <line class="qmx-coordinate-hit" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>
                ${label ? `<text x="${midX}" y="${midY - 10}" text-anchor="middle" font-size="14" font-weight="800" fill="${esc(object.stroke)}">${esc(label)}</text>` : ''}
                ${equation ? `<text x="${midX}" y="${midY + 18}" text-anchor="middle" font-size="12" fill="#475569">${esc(equation)}</text>` : ''}
            </g>`;
        }

        if (object.type === 'circle') {
            const center = screenPoint(object.cx, object.cy, map);
            const radius = object.r * map.scale;
            return `<g class="qmx-coordinate-object" data-object-id="${esc(object.id)}">
                <circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${object.dash ? ' stroke-dasharray="8 6"' : ''}/>
                ${object.label ? `<text x="${center.x}" y="${center.y - radius - 8}" text-anchor="middle" font-size="14" font-weight="800" fill="${esc(object.stroke)}">${esc(object.label)}</text>` : ''}
                <circle class="qmx-coordinate-hit-fill" cx="${center.x}" cy="${center.y}" r="${Math.max(12, radius)}"/>
            </g>`;
        }

        if (object.type === 'ellipse') {
            const center = screenPoint(object.cx, object.cy, map);
            const rx = object.rx * map.scale;
            const ry = object.ry * map.scale;
            return `<g class="qmx-coordinate-object" data-object-id="${esc(object.id)}">
                <ellipse cx="${center.x}" cy="${center.y}" rx="${rx}" ry="${ry}" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${object.dash ? ' stroke-dasharray="8 6"' : ''}/>
                ${object.label ? `<text x="${center.x}" y="${center.y - ry - 8}" text-anchor="middle" font-size="14" font-weight="800" fill="${esc(object.stroke)}">${esc(object.label)}</text>` : ''}
                <ellipse class="qmx-coordinate-hit-fill" cx="${center.x}" cy="${center.y}" rx="${Math.max(12, rx)}" ry="${Math.max(12, ry)}"/>
            </g>`;
        }

        if (object.type === 'parabola') {
            const path = sampledParabola(object, map);
            const vertex = screenPoint(object.vx, object.vy, map);
            return `<g class="qmx-coordinate-object" data-object-id="${esc(object.id)}">
                <path d="${path}" fill="none" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${object.dash ? ' stroke-dasharray="8 6"' : ''}/>
                <path class="qmx-coordinate-hit" d="${path}"/>
                <circle cx="${vertex.x}" cy="${vertex.y}" r="4" fill="${esc(object.stroke)}"/>
                ${object.label ? `<text x="${vertex.x + 8}" y="${vertex.y - 9}" font-size="14" font-weight="800" fill="${esc(object.stroke)}">${esc(object.label)}</text>` : ''}
            </g>`;
        }

        if (object.type === 'hyperbola') {
            const path = sampledHyperbola(object, map);
            const center = screenPoint(object.cx, object.cy, map);
            return `<g class="qmx-coordinate-object" data-object-id="${esc(object.id)}">
                <path d="${path}" fill="none" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${object.dash ? ' stroke-dasharray="8 6"' : ''}/>
                <path class="qmx-coordinate-hit" d="${path}"/>
                <circle cx="${center.x}" cy="${center.y}" r="3.5" fill="${esc(object.stroke)}"/>
                ${object.label ? `<text x="${center.x + 8}" y="${center.y - 8}" font-size="14" font-weight="800" fill="${esc(object.stroke)}">${esc(object.label)}</text>` : ''}
            </g>`;
        }

        if (object.type === 'midpoint') {
            const a = screenPoint(object.x1, object.y1, map);
            const b = screenPoint(object.x2, object.y2, map);
            const midpoint = screenPoint((object.x1 + object.x2) / 2, (object.y1 + object.y2) / 2, map);
            return `<g class="qmx-coordinate-object" data-object-id="${esc(object.id)}">
                <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6 5"/>
                <circle cx="${midpoint.x}" cy="${midpoint.y}" r="${object.size}" fill="${esc(object.color)}" stroke="#ffffff" stroke-width="1.5"/>
                <text x="${midpoint.x + 9}" y="${midpoint.y - 8}" font-size="13" font-weight="800" fill="${esc(object.color)}">${esc(object.label || 'M')} (${cleanNumber((object.x1 + object.x2) / 2)}, ${cleanNumber((object.y1 + object.y2) / 2)})</text>
                <circle class="qmx-coordinate-hit-fill" cx="${midpoint.x}" cy="${midpoint.y}" r="14"/>
            </g>`;
        }

        if (object.type === 'distance' || object.type === 'slope') {
            const a = screenPoint(object.x1, object.y1, map);
            const b = screenPoint(object.x2, object.y2, map);
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const dx = object.x2 - object.x1;
            const dy = object.y2 - object.y1;
            const distance = Math.hypot(dx, dy);
            const slope = Math.abs(dx) < 1e-9 ? 'undefined' : cleanNumber(dy / dx);
            const value = object.type === 'distance'
                ? `${object.label || 'd'} = ${cleanNumber(distance)}`
                : `${object.label || 'm'} = ${slope}`;
            const triangle = object.type === 'slope'
                ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${a.y}" stroke="${esc(object.stroke)}" stroke-width="1.4" stroke-dasharray="6 4"/><line x1="${b.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${esc(object.stroke)}" stroke-width="1.4" stroke-dasharray="6 4"/>`
                : '';

            return `<g class="qmx-coordinate-object" data-object-id="${esc(object.id)}">
                <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${object.dash ? ' stroke-dasharray="8 6"' : ''}/>
                ${triangle}
                <circle cx="${a.x}" cy="${a.y}" r="4" fill="${esc(object.stroke)}"/><circle cx="${b.x}" cy="${b.y}" r="4" fill="${esc(object.stroke)}"/>
                <text x="${midX}" y="${midY - 12}" text-anchor="middle" font-size="13" font-weight="800" fill="${esc(object.stroke)}">${esc(value)}</text>
                <line class="qmx-coordinate-hit" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>
            </g>`;
        }

        const point = screenPoint(object.x, object.y, map);
        return `<g class="qmx-coordinate-object" data-object-id="${esc(object.id)}">
            <text x="${point.x}" y="${point.y}" text-anchor="middle" dominant-baseline="middle" font-size="${object.fontSize}" font-weight="${object.fontWeight}" fill="${esc(object.color)}" paint-order="stroke" stroke="#ffffff" stroke-width="5">${esc(object.text)}</text>
            <rect class="qmx-coordinate-hit-fill" x="${point.x - Math.max(35, object.text.length * object.fontSize * 0.28)}" y="${point.y - object.fontSize}" width="${Math.max(70, object.text.length * object.fontSize * 0.56)}" height="${object.fontSize * 2}"/>
        </g>`;
    }

    function objectBounds(object) {
        const map = metrics();
        const points = [];

        function add(point) {
            if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) points.push(point);
        }

        if (object.type === 'point') {
            const point = screenPoint(object.x, object.y, map);
            return {
                x: point.x - 14,
                y: point.y - 14,
                width: 28,
                height: 28
            };
        }

        if (['segment', 'line', 'parallel', 'perpendicular', 'distance', 'slope', 'midpoint'].includes(object.type)) {
            objectLineEndpoints(object, map).forEach(add);
        } else if (object.type === 'circle') {
            const center = screenPoint(object.cx, object.cy, map);
            const radius = object.r * map.scale;
            return {
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            };
        } else if (object.type === 'ellipse') {
            const center = screenPoint(object.cx, object.cy, map);
            return {
                x: center.x - object.rx * map.scale,
                y: center.y - object.ry * map.scale,
                width: object.rx * map.scale * 2,
                height: object.ry * map.scale * 2
            };
        } else if (object.type === 'parabola' || object.type === 'hyperbola') {
            return {
                x: map.left,
                y: map.top,
                width: map.plotWidth,
                height: map.plotHeight
            };
        } else if (object.type === 'text') {
            const point = screenPoint(object.x, object.y, map);
            const width = Math.max(70, object.text.length * object.fontSize * 0.56);
            return {
                x: point.x - width / 2,
                y: point.y - object.fontSize,
                width,
                height: object.fontSize * 2
            };
        }

        if (!points.length) {
            return { x: map.left, y: map.top, width: 20, height: 20 };
        }

        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        return {
            x: Math.min(...xs) - 8,
            y: Math.min(...ys) - 8,
            width: Math.max(16, Math.max(...xs) - Math.min(...xs) + 16),
            height: Math.max(16, Math.max(...ys) - Math.min(...ys) + 16)
        };
    }

    function renderSelection() {
        const object = selectedObject();
        if (!object) {
            state.controls.selection.innerHTML = '';
            return;
        }

        const bounds = objectBounds(object);
        state.controls.selection.innerHTML = `<rect class="qmx-coordinate-select" x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}"/>`;
    }

    function renderDraft() {
        if (!state.controls.draft || !state.document) return;

        const map = metrics();
        const parts = [];
        state.draft.forEach((point, index) => {
            const screen = screenPoint(point.x, point.y, map);
            parts.push(`<circle class="qmx-coordinate-draft-point" cx="${screen.x}" cy="${screen.y}" r="5"/>`);
            if (index > 0) {
                const previous = screenPoint(state.draft[index - 1].x, state.draft[index - 1].y, map);
                parts.push(`<line class="qmx-coordinate-draft" x1="${previous.x}" y1="${previous.y}" x2="${screen.x}" y2="${screen.y}"/>`);
            }
        });

        state.controls.draft.innerHTML = parts.join('');
    }

    function renderSummary() {
        const counts = {};
        state.document.objects.forEach((object) => {
            counts[object.type] = (counts[object.type] || 0) + 1;
        });

        const labels = Object.entries(counts)
            .map(([type, count]) => `${count} ${type}`)
            .join(' · ');

        state.controls.summary.textContent = labels || 'No coordinate objects.';
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;

        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        renderGrid();
        state.controls.objects.innerHTML = state.document.objects.map(objectMarkup).join('');
        renderDraft();
        renderSelection();
        renderSummary();
        if (!options.keepProperties) renderProperties();
        updateHistoryButtons();
    }

    function numberField(label, prop, value, step = '.1') {
        return `<label class="qmx-coordinate-field">${esc(label)}<input type="number" step="${esc(step)}" data-prop="${esc(prop)}" value="${esc(cleanNumber(value, 6))}"></label>`;
    }

    function textField(label, prop, value) {
        return `<label class="qmx-coordinate-field">${esc(label)}<textarea data-prop="${esc(prop)}">${esc(value || '')}</textarea></label>`;
    }

    function colorField(label, prop, value) {
        return `<label class="qmx-coordinate-field">${esc(label)}<input type="color" data-prop="${esc(prop)}" value="${esc(value || '#0f172a')}"></label>`;
    }

    function renderProperties() {
        const object = selectedObject();

        if (!object) {
            state.controls.props.innerHTML = '<div class="qmx-coordinate-empty">Select a coordinate object.</div>';
            return;
        }

        let fields = `<div class="qmx-coordinate-fields">`;

        if (object.type === 'point') {
            fields += textField('Point label', 'label', object.label);
            fields += `<div class="qmx-coordinate-row">${numberField('X', 'x', object.x)}${numberField('Y', 'y', object.y)}</div>`;
            fields += `<div class="qmx-coordinate-row">${colorField('Point colour', 'color', object.color)}${colorField('Label colour', 'labelColor', object.labelColor)}</div>`;
            fields += numberField('Point size', 'size', object.size, '1');
        } else if (['segment', 'line'].includes(object.type)) {
            fields += textField('Label', 'label', object.label);
            fields += `<div class="qmx-coordinate-row">${numberField('X1', 'x1', object.x1)}${numberField('Y1', 'y1', object.y1)}</div>`;
            fields += `<div class="qmx-coordinate-row">${numberField('X2', 'x2', object.x2)}${numberField('Y2', 'y2', object.y2)}</div>`;
            fields += lineStyleFields(object, true);
        } else if (['parallel', 'perpendicular'].includes(object.type)) {
            fields += textField('Label', 'label', object.label);
            fields += `<div class="qmx-coordinate-row">${numberField('Base X1', 'x1', object.x1)}${numberField('Base Y1', 'y1', object.y1)}</div>`;
            fields += `<div class="qmx-coordinate-row">${numberField('Base X2', 'x2', object.x2)}${numberField('Base Y2', 'y2', object.y2)}</div>`;
            fields += `<div class="qmx-coordinate-row">${numberField('Through X', 'px', object.px)}${numberField('Through Y', 'py', object.py)}</div>`;
            fields += lineStyleFields(object, false);
        } else if (object.type === 'circle') {
            fields += textField('Label', 'label', object.label);
            fields += `<div class="qmx-coordinate-row">${numberField('Center X', 'cx', object.cx)}${numberField('Center Y', 'cy', object.cy)}</div>`;
            fields += numberField('Radius', 'r', object.r);
            fields += conicStyleFields(object);
        } else if (object.type === 'ellipse') {
            fields += textField('Label', 'label', object.label);
            fields += `<div class="qmx-coordinate-row">${numberField('Center X', 'cx', object.cx)}${numberField('Center Y', 'cy', object.cy)}</div>`;
            fields += `<div class="qmx-coordinate-row">${numberField('Radius X', 'rx', object.rx)}${numberField('Radius Y', 'ry', object.ry)}</div>`;
            fields += conicStyleFields(object);
        } else if (object.type === 'parabola') {
            fields += textField('Label', 'label', object.label);
            fields += `<div class="qmx-coordinate-row">${numberField('Vertex X', 'vx', object.vx)}${numberField('Vertex Y', 'vy', object.vy)}</div>`;
            fields += numberField('Coefficient a', 'a', object.a, '.01');
            fields += `<label class="qmx-coordinate-field">Orientation<select data-prop="orientation"><option value="vertical" ${object.orientation === 'vertical' ? 'selected' : ''}>Vertical: y = a(x − h)² + k</option><option value="horizontal" ${object.orientation === 'horizontal' ? 'selected' : ''}>Horizontal: x = a(y − k)² + h</option></select></label>`;
            fields += lineStyleFields(object, false);
        } else if (object.type === 'hyperbola') {
            fields += textField('Label', 'label', object.label);
            fields += `<div class="qmx-coordinate-row">${numberField('Center X', 'cx', object.cx)}${numberField('Center Y', 'cy', object.cy)}</div>`;
            fields += `<div class="qmx-coordinate-row">${numberField('Parameter a', 'a', object.a)}${numberField('Parameter b', 'b', object.b)}</div>`;
            fields += `<label class="qmx-coordinate-field">Orientation<select data-prop="orientation"><option value="horizontal" ${object.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option><option value="vertical" ${object.orientation === 'vertical' ? 'selected' : ''}>Vertical</option></select></label>`;
            fields += lineStyleFields(object, false);
        } else if (['midpoint', 'distance', 'slope'].includes(object.type)) {
            fields += textField('Label', 'label', object.label);
            fields += `<div class="qmx-coordinate-row">${numberField('X1', 'x1', object.x1)}${numberField('Y1', 'y1', object.y1)}</div>`;
            fields += `<div class="qmx-coordinate-row">${numberField('X2', 'x2', object.x2)}${numberField('Y2', 'y2', object.y2)}</div>`;

            if (object.type === 'midpoint') {
                fields += `<div class="qmx-coordinate-row">${colorField('Point colour', 'color', object.color)}${numberField('Point size', 'size', object.size, '1')}</div>`;
            } else {
                fields += lineStyleFields(object, false);
            }
        } else {
            fields += textField('Text', 'text', object.text);
            fields += `<div class="qmx-coordinate-row">${numberField('X', 'x', object.x)}${numberField('Y', 'y', object.y)}</div>`;
            fields += `<div class="qmx-coordinate-row">${colorField('Colour', 'color', object.color)}${numberField('Font size', 'fontSize', object.fontSize, '1')}</div>`;
            fields += `<label class="qmx-coordinate-check"><input type="checkbox" data-prop="bold" ${object.fontWeight === 'bold' ? 'checked' : ''}> Bold text</label>`;
        }

        fields += '</div>';
        state.controls.props.innerHTML = fields;
    }

    function lineStyleFields(object, showEquation) {
        return `<div class="qmx-coordinate-row">${colorField('Stroke', 'stroke', object.stroke)}${numberField('Line width', 'strokeWidth', object.strokeWidth, '.5')}</div>
        <label class="qmx-coordinate-check"><input type="checkbox" data-prop="dash" ${object.dash ? 'checked' : ''}> Dashed line</label>
        ${showEquation ? `<label class="qmx-coordinate-check"><input type="checkbox" data-prop="showEquation" ${object.showEquation ? 'checked' : ''}> Show equation</label>` : ''}`;
    }

    function conicStyleFields(object) {
        return `<div class="qmx-coordinate-row">${colorField('Stroke', 'stroke', object.stroke)}${colorField('Fill', 'fill', object.fill)}</div>
        <div class="qmx-coordinate-row">${numberField('Line width', 'strokeWidth', object.strokeWidth, '.5')}${numberField('Fill opacity', 'fillOpacity', object.fillOpacity, '.05')}</div>
        <label class="qmx-coordinate-check"><input type="checkbox" data-prop="dash" ${object.dash ? 'checked' : ''}> Dashed outline</label>`;
    }

    function onControlInput(event) {
        const docInput = event.target.closest('[data-doc-prop]');
        if (docInput) {
            updateDocumentProperty(docInput);
            return;
        }

        const propertyInput = event.target.closest('[data-prop]');
        if (propertyInput) updateObjectProperty(propertyInput);
    }

    function onControlChange(event) {
        if (event.target.closest('[data-doc-prop], [data-prop]')) pushHistory();
    }

    function updateDocumentProperty(input) {
        const prop = input.dataset.docProp;

        if (input.type === 'checkbox') {
            state.document[prop] = input.checked;
        } else if (input.type === 'number') {
            state.document[prop] = Number(input.value);
        } else {
            state.document[prop] = input.value;
        }

        if (prop === 'coordXMin' && state.document.coordXMin >= state.document.coordXMax) {
            state.document.coordXMax = state.document.coordXMin + 1;
        }
        if (prop === 'coordXMax' && state.document.coordXMax <= state.document.coordXMin) {
            state.document.coordXMin = state.document.coordXMax - 1;
        }
        if (prop === 'coordYMin' && state.document.coordYMin >= state.document.coordYMax) {
            state.document.coordYMax = state.document.coordYMin + 1;
        }
        if (prop === 'coordYMax' && state.document.coordYMax <= state.document.coordYMin) {
            state.document.coordYMin = state.document.coordYMax - 1;
        }

        state.document = Diagram.normalizeSpec(state.document);
        syncDocumentControls();
        render({ keepProperties: true });
    }

    function updateObjectProperty(input) {
        const object = selectedObject();
        if (!object) return;

        const prop = input.dataset.prop;

        if (prop === 'bold') {
            object.fontWeight = input.checked ? 'bold' : 'normal';
        } else if (['dash', 'showEquation'].includes(prop)) {
            object[prop] = input.checked;
        } else if (input.type === 'number') {
            object[prop] = Number(input.value);
        } else {
            object[prop] = input.value;
        }

        state.document = Diagram.normalizeSpec(state.document);
        render({ keepProperties: true });
    }

    function syncDocumentControls() {
        if (!state.root || !state.document) return;

        state.root.querySelectorAll('[data-doc-prop]').forEach((input) => {
            const value = state.document[input.dataset.docProp];
            if (input.type === 'checkbox') input.checked = Boolean(value);
            else input.value = value;
        });
    }

    function onPointerDown(event) {
        if (state.activeTool !== 'select') return;

        const group = event.target.closest('[data-object-id]');
        if (!group) {
            state.selectedId = null;
            renderSelection();
            renderProperties();
            return;
        }

        const object = state.document.objects.find((item) => item.id === group.dataset.objectId);
        if (!object) return;

        state.selectedId = object.id;
        state.interaction = {
            pointerId: event.pointerId,
            start: pointFromEvent(event),
            original: clone(object),
            moved: false
        };

        state.svg.setPointerCapture?.(event.pointerId);
        renderSelection();
        renderProperties();
        event.preventDefault();
    }

    function onPointerMove(event) {
        const interaction = state.interaction;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        const current = pointFromEvent(event);
        const dx = current.x - interaction.start.x;
        const dy = current.y - interaction.start.y;
        const object = selectedObject();
        if (!object) return;

        moveObject(object, interaction.original, dx, dy);
        interaction.moved = Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9;
        render({ keepProperties: true });
    }

    function onPointerUp(event) {
        const interaction = state.interaction;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        state.svg.releasePointerCapture?.(event.pointerId);
        if (interaction.moved) {
            pushHistory();
            renderProperties();
            setStatus('Coordinate object moved.');
        }
        state.interaction = null;
    }

    function onCanvasClick(event) {
        if (state.activeTool === 'select') return;
        const point = pointFromEvent(event);
        handleToolPoint(point);
    }

    function moveObject(target, original, dx, dy) {
        if (target.type === 'point' || target.type === 'text') {
            target.x = original.x + dx;
            target.y = original.y + dy;
            return;
        }

        if (['segment', 'line', 'midpoint', 'distance', 'slope'].includes(target.type)) {
            target.x1 = original.x1 + dx;
            target.y1 = original.y1 + dy;
            target.x2 = original.x2 + dx;
            target.y2 = original.y2 + dy;
            return;
        }

        if (['parallel', 'perpendicular'].includes(target.type)) {
            target.x1 = original.x1 + dx;
            target.y1 = original.y1 + dy;
            target.x2 = original.x2 + dx;
            target.y2 = original.y2 + dy;
            target.px = original.px + dx;
            target.py = original.py + dy;
            return;
        }

        if (target.type === 'circle' || target.type === 'ellipse' || target.type === 'hyperbola') {
            target.cx = original.cx + dx;
            target.cy = original.cy + dy;
            return;
        }

        if (target.type === 'parabola') {
            target.vx = original.vx + dx;
            target.vy = original.vy + dy;
        }
    }

    function handleToolPoint(point) {
        if (state.activeTool === 'point') {
            const object = pointObject(point);
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            render();
            setStatus(`Point ${object.label} added at (${cleanNumber(point.x)}, ${cleanNumber(point.y)}).`);
            return;
        }

        if (state.activeTool === 'text') {
            const object = {
                id: uid('text'),
                type: 'text',
                x: point.x,
                y: point.y,
                text: 'Label',
                color: '#0f172a',
                fontSize: 18,
                fontWeight: 'normal'
            };
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            render();
            setStatus('Text label added.');
            return;
        }

        state.draft.push(point);
        renderDraft();

        const required = THREE_POINT_TOOLS.has(state.activeTool) ? 3 : 2;
        if (state.draft.length < required) {
            setStatus(`${state.activeTool} construction: ${state.draft.length}/${required} point(s) selected.`);
            return;
        }

        const object = createObjectFromDraft(state.activeTool, state.draft);
        state.draft = [];

        if (!object) {
            renderDraft();
            setStatus('Construction needs distinct points.');
            return;
        }

        state.document.objects.push(object);
        state.selectedId = object.id;
        pushHistory();
        render();
        setStatus(`${TOOL_DEFS.find(([id]) => id === state.activeTool)?.[1] || 'Object'} added.`);
    }

    function createObjectFromDraft(tool, points) {
        const [a, b, c] = points;

        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) return null;

        if (tool === 'segment' || tool === 'line') {
            return {
                ...lineStyle(tool),
                x1: a.x,
                y1: a.y,
                x2: b.x,
                y2: b.y
            };
        }

        if (tool === 'circle') {
            return {
                id: uid('circle'),
                type: 'circle',
                cx: a.x,
                cy: a.y,
                r: Math.max(0.05, Math.hypot(b.x - a.x, b.y - a.y)),
                label: 'Circle',
                stroke: '#2563eb',
                strokeWidth: 2.5,
                fill: '#dbeafe',
                fillOpacity: 0.15,
                dash: false
            };
        }

        if (tool === 'ellipse') {
            return {
                id: uid('ellipse'),
                type: 'ellipse',
                cx: a.x,
                cy: a.y,
                rx: Math.max(0.05, Math.abs(b.x - a.x)),
                ry: Math.max(0.05, Math.abs(b.y - a.y)),
                label: 'Ellipse',
                stroke: '#7c3aed',
                strokeWidth: 2.5,
                fill: '#ede9fe',
                fillOpacity: 0.16,
                dash: false
            };
        }

        if (tool === 'parabola') {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            let coefficient = Math.abs(dx) > 0.1 ? dy / (dx * dx) : 0.25;
            if (Math.abs(coefficient) < 0.01) coefficient = coefficient < 0 ? -0.1 : 0.1;

            return {
                id: uid('parabola'),
                type: 'parabola',
                vx: a.x,
                vy: a.y,
                a: clamp(coefficient, -10, 10, 0.25),
                orientation: 'vertical',
                label: 'Parabola',
                stroke: '#dc2626',
                strokeWidth: 2.5,
                dash: false
            };
        }

        if (tool === 'hyperbola') {
            return {
                id: uid('hyperbola'),
                type: 'hyperbola',
                cx: a.x,
                cy: a.y,
                a: Math.max(0.1, Math.abs(b.x - a.x)),
                b: Math.max(0.1, Math.abs(b.y - a.y)),
                orientation: 'horizontal',
                label: 'Hyperbola',
                stroke: '#ea580c',
                strokeWidth: 2.5,
                dash: false
            };
        }

        if (tool === 'midpoint') {
            return {
                id: uid('midpoint'),
                type: 'midpoint',
                x1: a.x,
                y1: a.y,
                x2: b.x,
                y2: b.y,
                label: 'M',
                color: '#16a34a',
                size: 6
            };
        }

        if (tool === 'distance' || tool === 'slope') {
            return {
                ...lineStyle(tool),
                x1: a.x,
                y1: a.y,
                x2: b.x,
                y2: b.y,
                label: tool === 'distance' ? 'd' : 'm',
                stroke: tool === 'distance' ? '#0891b2' : '#9333ea',
                showEquation: false
            };
        }

        if (tool === 'parallel' || tool === 'perpendicular') {
            return {
                ...lineStyle(tool),
                x1: a.x,
                y1: a.y,
                x2: b.x,
                y2: b.y,
                px: c.x,
                py: c.y,
                label: tool === 'parallel' ? 'Parallel' : 'Perpendicular',
                stroke: tool === 'parallel' ? '#16a34a' : '#dc2626',
                showEquation: false
            };
        }

        return null;
    }

    function clearObjects() {
        if (!state.document.objects.length) return;
        if (!window.confirm('Remove all coordinate objects?')) return;

        state.document.objects = [];
        state.selectedId = null;
        state.draft = [];
        pushHistory();
        render();
        setStatus('All coordinate objects removed.');
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        state.document.objects = state.document.objects.filter((object) => object.id !== state.selectedId);
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Object deleted.');
    }

    function duplicateSelected() {
        const object = selectedObject();
        if (!object) return;

        const copy = clone(object);
        copy.id = uid(object.type);
        moveObject(copy, object, state.document.coordGridStep || 1, state.document.coordGridStep || 1);
        state.document.objects.push(copy);
        state.selectedId = copy.id;
        pushHistory();
        render();
        setStatus('Object duplicated.');
    }

    function insertPreset(type) {
        const objects = [];

        if (type === 'line-circle') {
            objects.push(
                {
                    ...lineStyle('line'),
                    id: uid('line'),
                    x1: -8,
                    y1: -3,
                    x2: 8,
                    y2: 5,
                    label: 'g',
                    showEquation: true
                },
                {
                    id: uid('circle'),
                    type: 'circle',
                    cx: 1,
                    cy: 0,
                    r: 4,
                    label: 'C',
                    stroke: '#dc2626',
                    strokeWidth: 2.5,
                    fill: '#fee2e2',
                    fillOpacity: 0.14,
                    dash: false
                },
                pointObject({ x: -3, y: -0.5 }, 'A'),
                pointObject({ x: 3, y: 2.5 }, 'B')
            );
        } else if (type === 'slope-midpoint') {
            objects.push(
                {
                    ...lineStyle('segment'),
                    id: uid('segment'),
                    x1: -7,
                    y1: -3,
                    x2: 5,
                    y2: 3,
                    label: 'AB',
                    showEquation: true
                },
                {
                    id: uid('distance'),
                    type: 'distance',
                    x1: -7,
                    y1: -3,
                    x2: 5,
                    y2: 3,
                    label: 'd',
                    stroke: '#0891b2',
                    strokeWidth: 2.5,
                    dash: false,
                    showEquation: false
                },
                {
                    id: uid('slope'),
                    type: 'slope',
                    x1: -7,
                    y1: -3,
                    x2: 5,
                    y2: 3,
                    label: 'm',
                    stroke: '#9333ea',
                    strokeWidth: 2.5,
                    dash: false,
                    showEquation: false
                },
                {
                    id: uid('midpoint'),
                    type: 'midpoint',
                    x1: -7,
                    y1: -3,
                    x2: 5,
                    y2: 3,
                    label: 'M',
                    color: '#16a34a',
                    size: 6
                },
                pointObject({ x: -7, y: -3 }, 'A'),
                pointObject({ x: 5, y: 3 }, 'B')
            );
        } else if (type === 'parallel-perpendicular') {
            objects.push(
                {
                    ...lineStyle('line'),
                    id: uid('line'),
                    x1: -8,
                    y1: -2,
                    x2: 7,
                    y2: 3,
                    label: 'l',
                    stroke: '#2563eb',
                    showEquation: true
                },
                {
                    ...lineStyle('parallel'),
                    id: uid('parallel'),
                    x1: -8,
                    y1: -2,
                    x2: 7,
                    y2: 3,
                    px: -1,
                    py: 3,
                    label: 'p ∥ l',
                    stroke: '#16a34a',
                    showEquation: false
                },
                {
                    ...lineStyle('perpendicular'),
                    id: uid('perpendicular'),
                    x1: -8,
                    y1: -2,
                    x2: 7,
                    y2: 3,
                    px: 3,
                    py: -1,
                    label: 'n ⟂ l',
                    stroke: '#dc2626',
                    showEquation: false
                },
                pointObject({ x: -1, y: 3 }, 'P'),
                pointObject({ x: 3, y: -1 }, 'Q')
            );
        } else {
            objects.push(
                {
                    id: uid('ellipse'),
                    type: 'ellipse',
                    cx: -5,
                    cy: 0,
                    rx: 3,
                    ry: 2,
                    label: 'Ellipse',
                    stroke: '#2563eb',
                    strokeWidth: 2.5,
                    fill: '#dbeafe',
                    fillOpacity: 0.14,
                    dash: false
                },
                {
                    id: uid('parabola'),
                    type: 'parabola',
                    vx: 0,
                    vy: -2,
                    a: 0.28,
                    orientation: 'vertical',
                    label: 'Parabola',
                    stroke: '#dc2626',
                    strokeWidth: 2.5,
                    dash: false
                },
                {
                    id: uid('hyperbola'),
                    type: 'hyperbola',
                    cx: 5,
                    cy: 0,
                    a: 1.5,
                    b: 1,
                    orientation: 'horizontal',
                    label: 'Hyperbola',
                    stroke: '#ea580c',
                    strokeWidth: 2.5,
                    dash: false
                }
            );
        }

        state.document.objects = objects;
        state.selectedId = objects[0]?.id || null;
        state.draft = [];
        pushHistory();
        render();
        setStatus(`${type} preset inserted.`);
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new coordinate geometry document?')) return;

        state.document = createDocument();
        state.selectedId = null;
        state.draft = [];
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Coordinate Geometry document.');
    }

    function makeToken() {
        return `[[qmx-diagram:${Diagram.encodeSpec(state.document)}]]`;
    }

    function insertIntoQuestion() {
        const textarea = state.context?.textarea;
        if (!textarea) {
            setStatus('No target question field was found.');
            return;
        }

        const token = makeToken();
        const replaceRange = state.context?.replaceRange;
        textarea.focus();

        if (
            replaceRange &&
            Number.isInteger(replaceRange.start) &&
            Number.isInteger(replaceRange.end)
        ) {
            textarea.setRangeText(token, replaceRange.start, replaceRange.end, 'end');
        } else {
            const start = textarea.selectionStart ?? textarea.value.length;
            const end = textarea.selectionEnd ?? start;
            const prefix = start > 0 && !/\n$/.test(textarea.value.slice(0, start)) ? '\n' : '';
            const suffix = end < textarea.value.length && !/^\n/.test(textarea.value.slice(end)) ? '\n' : '';
            textarea.setRangeText(prefix + token + suffix, start, end, 'end');
        }

        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        setStatus('Coordinate geometry diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'coordinate-geometry')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'coordinate-geometry';
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function exportSvg() {
        downloadBlob(
            new Blob([Diagram.svgMarkup(state.document)], { type: 'image/svg+xml;charset=utf-8' }),
            `${safeFilename(state.document.title)}.svg`
        );
        setStatus('SVG exported.');
    }

    function exportPng() {
        const svg = Diagram.svgMarkup(state.document);
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        const image = new Image();

        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = state.document.width;
            canvas.height = state.document.height;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            URL.revokeObjectURL(url);
            canvas.toBlob((blob) => {
                if (blob) downloadBlob(blob, `${safeFilename(state.document.title)}.png`);
            }, 'image/png');
            setStatus('PNG exported.');
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            setStatus('PNG export failed.');
        };

        image.src = url;
    }

    function setStatus(message) {
        if (state.controls.status) state.controls.status.textContent = message;
    }

    function open(context = {}) {
        buildEditor();

        state.context = context;
        state.document = context.initialSpec
            ? Diagram.normalizeSpec(context.initialSpec)
            : createDocument();

        if (state.document.mode !== 'coordinate-geometry') {
            state.document = createDocument();
        }

        state.selectedId = null;
        state.activeTool = 'select';
        state.draft = [];
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();

        state.root.hidden = false;
        document.body.dataset.qmxCoordinateOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(
            context.initialSpec
                ? 'Existing Coordinate Geometry diagram loaded.'
                : 'Choose a coordinate construction tool.'
        );

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;

        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxCoordinateOverflow || '';
        delete document.body.dataset.qmxCoordinateOverflow;
        state.context?.textarea?.focus?.();
    }

    function findTokenTextarea(token) {
        return Array.from(document.querySelectorAll('textarea'))
            .find((textarea) => textarea.value.includes(token)) || null;
    }

    function openFromPreview(figure) {
        const payload = String(figure?.dataset.qmxDiagramPayload || '');
        if (!payload) return false;

        let spec;
        try {
            spec = Diagram.decodePayload(payload);
        } catch (error) {
            return false;
        }

        if (spec.mode !== 'coordinate-geometry') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }

        open({
            tool: { id: 'coordinate-geometry' },
            textarea,
            initialSpec: spec,
            replaceRange,
            editMode: true
        });

        return true;
    }

    function registerHandlers() {
        const launcher = window.QmxDiagramLauncher;
        if (!launcher?.registerToolHandler) return false;

        let registered = false;
        [
            'coordinate-geometry',
            'coordinate-plane',
            'analytic-geometry',
            'mathematical-construction',
            'coordinate-construction'
        ].forEach((id) => {
            try {
                launcher.registerToolHandler(id, open);
                registered = true;
            } catch (error) {
                // Some registries expose only the canonical coordinate-geometry id.
            }
        });

        return registered;
    }

    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;

        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        if (event.key === 'Escape') {
            if (state.draft.length) {
                state.draft = [];
                renderDraft();
                setStatus('Construction draft cancelled.');
            } else {
                close();
            }
            event.preventDefault();
            return;
        }

        if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) {
            event.preventDefault();
            deleteSelected();
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            event.shiftKey ? redo() : undo();
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            redo();
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && !editing) {
            event.preventDefault();
            duplicateSelected();
        }
    }

    function init() {
        buildEditor();
        if (!registerHandlers()) {
            document.addEventListener('qmx:diagram-launcher-ready', registerHandlers, { once: true });
        }
    }

    window.QmxCoordinateGeometryEditor = Object.freeze({
        version: '1.0.0',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
