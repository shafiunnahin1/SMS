(function (window, document) {
    'use strict';

    if (window.QmxVectorArtEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Vector Art] Diagram renderer must load first.');
        return;
    }

    const TOOLS = [
        ['select', 'Select', 'নির্বাচন'],
        ['brush', 'Brush', 'ফ্রি-হ্যান্ড'],
        ['pen', 'Pen / Polyline', 'পেন / পাথ'],
        ['line', 'Line', 'রেখা'],
        ['arrow', 'Arrow', 'তীর'],
        ['rectangle', 'Rectangle', 'আয়তক্ষেত্র'],
        ['ellipse', 'Ellipse', 'উপবৃত্ত'],
        ['star', 'Star', 'তারকা'],
        ['text', 'Text', 'লেখা'],
        ['eraser', 'Eraser', 'মুছুন']
    ];

    const state = {
        root: null,
        svg: null,
        document: null,
        context: null,
        activeTool: 'select',
        selectedId: null,
        interaction: null,
        pendingPen: null,
        history: [],
        historyIndex: -1,
        controls: {}
    };

    function uid(prefix = 'art') {
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

    function clamp(value, min, max, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number)
            ? Math.min(max, Math.max(min, number))
            : fallback;
    }

    function createDocument() {
        return {
            version: 11,
            id: uid('vector-art'),
            mode: 'vector-art',
            title: 'Freehand / Vector Art',
            width: 1000,
            height: 600,
            background: '#ffffff',
            gridSize: 20,
            showGrid: true,
            snapToGrid: false,
            showCenterGuides: true,
            showSafeArea: false,
            safeArea: 45,
            defaultStroke: '#0f172a',
            defaultFill: '#dbeafe',
            defaultStrokeWidth: 4,
            objects: []
        };
    }

    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
    }

    function snap(value) {
        if (!state.document.snapToGrid) return value;
        const size = state.document.gridSize;
        return Math.round(value / size) * size;
    }

    function svgPoint(event) {
        const point = state.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        const local = matrix ? point.matrixTransform(matrix.inverse()) : point;
        return { x: local.x, y: local.y };
    }

    function addStyles() {
        if (document.getElementById('qmx-vector-art-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-vector-art-editor-styles';
        style.textContent = `
.qmx-art-editor[hidden]{display:none!important}
.qmx-art-editor{position:fixed;inset:0;z-index:10270;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.72);backdrop-filter:blur(2px)}
.qmx-art-dialog{width:min(1580px,100%);height:min(96vh,990px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.4)}
.qmx-art-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-art-title{margin-right:auto}.qmx-art-title strong{display:block}.qmx-art-title span{display:block;color:#64748b;font-size:11px}
.qmx-art-btn,.qmx-art-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-art-btn:hover,.qmx-art-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-art-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-art-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-art-btn.is-danger{color:#b91c1c}.qmx-art-close{font-size:20px;line-height:1}
.qmx-art-workspace{min-height:0;flex:1;display:grid;grid-template-columns:225px minmax(0,1fr) 310px;gap:10px;padding:10px}
.qmx-art-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-art-panel h3{margin:0 0 8px;font-size:13px}.qmx-art-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-art-tool{min-height:57px;padding:6px 5px;font-size:10px}.qmx-art-tool span{display:block;margin-top:2px;color:#64748b;font-size:9px;font-weight:500}
.qmx-art-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-art-quick{display:grid;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0}
.qmx-art-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-art-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-art-stage{display:block;width:min(100%,1180px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.17);touch-action:none;user-select:none}
.qmx-art-object{cursor:move}.qmx-art-hit{fill:transparent;stroke:transparent;stroke-width:20;pointer-events:all}
.qmx-art-select{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-art-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair;pointer-events:all}
.qmx-art-node{fill:#fff;stroke:#7c3aed;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair;pointer-events:all}
.qmx-art-fields{display:grid;gap:9px}.qmx-art-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-art-field input,.qmx-art-field textarea,.qmx-art-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-art-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-art-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-art-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-art-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-art-summary{margin-top:10px;padding:9px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.55}
.qmx-art-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-art-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-art-footer .qmx-art-btn:first-of-type{margin-left:auto}
@media(max-width:1050px){.qmx-art-workspace{grid-template-columns:185px minmax(0,1fr) 255px}.qmx-art-tools{grid-template-columns:1fr}}
@media(max-width:760px){.qmx-art-editor{padding:0}.qmx-art-dialog{width:100%;height:100%;border-radius:0}.qmx-art-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(350px,1fr) auto;overflow:auto}.qmx-art-panel{overflow:visible}.qmx-art-tools{grid-template-columns:repeat(2,1fr)}.qmx-art-header{overflow-x:auto}.qmx-art-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-art-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-art-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-art-title">
<header class="qmx-art-header">
    <div class="qmx-art-title">
        <strong id="qmx-art-title">Freehand / Vector Art</strong>
        <span>Brush strokes, editable paths, vector shapes, text and composition guides</span>
    </div>
    <button type="button" class="qmx-art-btn" data-art-new>New</button>
    <button type="button" class="qmx-art-btn" data-art-undo>Undo</button>
    <button type="button" class="qmx-art-btn" data-art-redo>Redo</button>
    <button type="button" class="qmx-art-btn" data-art-front>Bring front</button>
    <button type="button" class="qmx-art-btn" data-art-back>Send back</button>
    <button type="button" class="qmx-art-btn" data-art-duplicate>Duplicate</button>
    <button type="button" class="qmx-art-btn is-danger" data-art-delete>Delete</button>
    <button type="button" class="qmx-art-btn qmx-art-close" data-art-close aria-label="Close">×</button>
</header>
<div class="qmx-art-workspace">
    <aside class="qmx-art-panel">
        <h3>Vector tools</h3>
        <div class="qmx-art-tools" data-art-tools></div>
        <div class="qmx-art-quick">
            <button type="button" class="qmx-art-btn" data-art-icon-preset>Icon composition</button>
            <button type="button" class="qmx-art-btn" data-art-callout-preset>Callout preset</button>
            <button type="button" class="qmx-art-btn" data-art-badge-preset>Badge preset</button>
            <button type="button" class="qmx-art-btn" data-art-clear>Clear canvas</button>
        </div>
        <p class="qmx-art-help">
            Brush creates a continuous freehand stroke. Pen/Polyline adds one node per click;
            double-click or press Enter to finish. Select a path to edit its nodes.
        </p>
    </aside>
    <main class="qmx-art-stage-wrap">
        <svg class="qmx-art-stage" data-art-svg viewBox="0 0 1000 600" tabindex="0" aria-label="Freehand and vector art canvas">
            <defs>
                <marker id="qmx-art-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke"></path>
                </marker>
            </defs>
            <rect data-art-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-art-guides></g>
            <g data-art-objects></g>
            <g data-art-selection></g>
            <g data-art-pending></g>
        </svg>
    </main>
    <aside class="qmx-art-panel">
        <h3>Document</h3>
        <div class="qmx-art-fields">
            <label class="qmx-art-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-art-row">
                <label class="qmx-art-field">Width<input type="number" min="320" max="2400" data-doc-prop="width"></label>
                <label class="qmx-art-field">Height<input type="number" min="220" max="1800" data-doc-prop="height"></label>
            </div>
            <div class="qmx-art-row">
                <label class="qmx-art-field">Grid size<input type="number" min="5" max="100" data-doc-prop="gridSize"></label>
                <label class="qmx-art-field">Background<input type="color" data-doc-prop="background"></label>
            </div>
            <label class="qmx-art-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label>
            <label class="qmx-art-check"><input type="checkbox" data-doc-prop="snapToGrid"> Snap to grid</label>
            <label class="qmx-art-check"><input type="checkbox" data-doc-prop="showCenterGuides"> Show centre guides</label>
            <label class="qmx-art-check"><input type="checkbox" data-doc-prop="showSafeArea"> Show safe-area guide</label>
            <label class="qmx-art-field">Safe-area padding<input type="number" min="0" max="500" data-doc-prop="safeArea"></label>
        </div>
        <hr class="qmx-art-divider">
        <h3>Selected object</h3>
        <div data-art-properties></div>
        <div class="qmx-art-summary" data-art-summary></div>
    </aside>
</div>
<footer class="qmx-art-footer">
    <span class="qmx-art-status" data-art-status aria-live="polite"></span>
    <button type="button" class="qmx-art-btn" data-art-export-svg>Export SVG</button>
    <button type="button" class="qmx-art-btn" data-art-export-png>Export PNG</button>
    <button type="button" class="qmx-art-btn is-primary" data-art-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.svg = root.querySelector('[data-art-svg]');
        state.controls = {
            bg: root.querySelector('[data-art-bg]'),
            guides: root.querySelector('[data-art-guides]'),
            objects: root.querySelector('[data-art-objects]'),
            selection: root.querySelector('[data-art-selection]'),
            pending: root.querySelector('[data-art-pending]'),
            tools: root.querySelector('[data-art-tools]'),
            props: root.querySelector('[data-art-properties]'),
            summary: root.querySelector('[data-art-summary]'),
            status: root.querySelector('[data-art-status]'),
            undo: root.querySelector('[data-art-undo]'),
            redo: root.querySelector('[data-art-redo]')
        };

        TOOLS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-art-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        state.controls.tools.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (button) setTool(button.dataset.tool);
        });

        root.querySelector('[data-art-close]').addEventListener('click', close);
        root.querySelector('[data-art-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-art-front]').addEventListener('click', bringFront);
        root.querySelector('[data-art-back]').addEventListener('click', sendBack);
        root.querySelector('[data-art-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-art-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-art-icon-preset]').addEventListener('click', iconPreset);
        root.querySelector('[data-art-callout-preset]').addEventListener('click', calloutPreset);
        root.querySelector('[data-art-badge-preset]').addEventListener('click', badgePreset);
        root.querySelector('[data-art-clear]').addEventListener('click', clearCanvas);
        root.querySelector('[data-art-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-art-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-art-insert]').addEventListener('click', insertIntoQuestion);

        root.querySelectorAll('[data-doc-prop]').forEach((control) => {
            control.addEventListener('input', onDocumentInput);
            control.addEventListener('change', () => {
                onDocumentInput({ currentTarget: control });
                pushHistory();
            });
        });

        state.controls.props.addEventListener('input', onPropertyInput);
        state.controls.props.addEventListener('change', () => pushHistory());

        state.svg.addEventListener('pointerdown', onPointerDown);
        state.svg.addEventListener('pointermove', onPointerMove);
        state.svg.addEventListener('pointerup', onPointerUp);
        state.svg.addEventListener('pointercancel', onPointerUp);
        state.svg.addEventListener('dblclick', onDoubleClick);
        document.addEventListener('keydown', onKeydown);
    }

    function setTool(tool) {
        if (state.pendingPen && tool !== 'pen') finishPen();
        state.activeTool = TOOLS.some(([id]) => id === tool) ? tool : 'select';
        state.interaction = null;
        state.controls.tools.querySelectorAll('[data-tool]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tool === state.activeTool);
        });

        if (state.activeTool === 'brush') setStatus('Drag on the canvas to draw a freehand stroke.');
        else if (state.activeTool === 'pen') setStatus('Click to add path nodes; double-click or press Enter to finish.');
        else if (state.activeTool === 'select') setStatus('Select, move, resize or edit path nodes.');
        else setStatus(`Click the canvas to add ${TOOLS.find(([id]) => id === state.activeTool)?.[1] || 'object'}.`);
    }

    function pushHistory() {
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
        state.pendingPen = null;
        state.interaction = null;
        syncDocumentControls();
        render();
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        if (!state.controls.undo) return;
        state.controls.undo.disabled = state.historyIndex <= 0;
        state.controls.redo.disabled = state.historyIndex >= state.history.length - 1;
    }

    function undo() {
        restoreHistory(state.historyIndex - 1);
    }

    function redo() {
        restoreHistory(state.historyIndex + 1);
    }

    function defaultStyle(fill = false) {
        return {
            stroke: state.document.defaultStroke,
            fill: fill ? state.document.defaultFill : 'none',
            fillOpacity: fill ? 0.75 : 0,
            strokeWidth: state.document.defaultStrokeWidth,
            opacity: 1,
            dash: false,
            lineCap: 'round',
            lineJoin: 'round'
        };
    }

    function createPath(points, options = {}) {
        return Object.assign({
            id: uid('path'),
            type: 'path',
            points,
            closed: Boolean(options.closed),
            smooth: options.smooth !== false,
            arrowStart: false,
            arrowEnd: false,
            rotation: 0
        }, defaultStyle(Boolean(options.closed)), options);
    }

    function createLine(x, y, arrow = false) {
        return Object.assign({
            id: uid(arrow ? 'arrow' : 'line'),
            type: arrow ? 'arrow' : 'line',
            x1: x - 110,
            y1: y,
            x2: x + 110,
            y2: y,
            arrowStart: false,
            arrowEnd: arrow,
            rotation: 0
        }, defaultStyle(false));
    }

    function createShape(type, x, y) {
        return Object.assign({
            id: uid(type),
            type,
            x,
            y,
            width: type === 'star' ? 180 : 210,
            height: type === 'star' ? 180 : 130,
            rotation: 0,
            points: type === 'star' ? 5 : 0,
            innerRatio: type === 'star' ? 0.45 : 0
        }, defaultStyle(true));
    }

    function createText(x, y) {
        return {
            id: uid('text'),
            type: 'text',
            x,
            y,
            text: 'Vector text',
            textColor: '#0f172a',
            fontSize: 32,
            fontWeight: 'bold',
            fontStyle: 'normal',
            textAnchor: 'middle',
            rotation: 0,
            opacity: 1
        };
    }

    function onDocumentInput(event) {
        const control = event.currentTarget;
        const prop = control.dataset.docProp;
        if (!prop || !state.document) return;

        if (['showGrid', 'snapToGrid', 'showCenterGuides', 'showSafeArea'].includes(prop)) {
            state.document[prop] = control.checked;
        } else if (['width', 'height', 'gridSize', 'safeArea'].includes(prop)) {
            state.document[prop] = Number(control.value);
        } else {
            state.document[prop] = control.value;
        }

        state.document = Diagram.normalizeSpec(state.document);
        render();
    }

    function syncDocumentControls() {
        state.root.querySelectorAll('[data-doc-prop]').forEach((control) => {
            const value = state.document[control.dataset.docProp];
            if (control.type === 'checkbox') control.checked = Boolean(value);
            else control.value = value ?? '';
        });
    }

    function guidesMarkup() {
        const pieces = [];

        if (state.document.showGrid) {
            const size = state.document.gridSize;
            pieces.push(`<defs><pattern id="qmx-art-grid-live" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${state.document.width}" height="${state.document.height}" fill="url(#qmx-art-grid-live)" pointer-events="none"/>`);
        }

        if (state.document.showCenterGuides) {
            pieces.push(`<line x1="${state.document.width / 2}" y1="0" x2="${state.document.width / 2}" y2="${state.document.height}" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="7 6" opacity=".8" vector-effect="non-scaling-stroke"/><line x1="0" y1="${state.document.height / 2}" x2="${state.document.width}" y2="${state.document.height / 2}" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="7 6" opacity=".8" vector-effect="non-scaling-stroke"/>`);
        }

        if (state.document.showSafeArea) {
            const padding = state.document.safeArea;
            pieces.push(`<rect x="${padding}" y="${padding}" width="${Math.max(0, state.document.width - padding * 2)}" height="${Math.max(0, state.document.height - padding * 2)}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="9 6" vector-effect="non-scaling-stroke"/>`);
        }

        return pieces.join('');
    }

    function smoothPath(points) {
        if (!points.length) return '';
        if (points.length < 3) return `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')}`;
        let path = `M ${points[0].x} ${points[0].y}`;
        for (let i = 0; i < points.length - 1; i += 1) {
            const current = points[i];
            const next = points[i + 1];
            const midX = (current.x + next.x) / 2;
            const midY = (current.y + next.y) / 2;
            path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
        }
        const last = points[points.length - 1];
        path += ` T ${last.x} ${last.y}`;
        return path;
    }

    function pathD(object) {
        const base = object.smooth
            ? smoothPath(object.points)
            : `M ${object.points.map((point) => `${point.x} ${point.y}`).join(' L ')}`;
        return object.closed ? `${base} Z` : base;
    }

    function markerAttrs(object) {
        return `${object.arrowStart ? ' marker-start="url(#qmx-art-arrow)"' : ''}${object.arrowEnd ? ' marker-end="url(#qmx-art-arrow)"' : ''}`;
    }

    function commonStyle(object) {
        return `stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" opacity="${object.opacity}" stroke-linecap="${object.lineCap}" stroke-linejoin="${object.lineJoin}"${object.dash ? ' stroke-dasharray="10 7"' : ''} vector-effect="non-scaling-stroke"`;
    }

    function starPoints(object) {
        const output = [];
        const count = Math.max(3, Math.round(object.points || 5));
        const outer = Math.min(object.width, object.height) / 2;
        const inner = outer * object.innerRatio;
        for (let i = 0; i < count * 2; i += 1) {
            const radius = i % 2 === 0 ? outer : inner;
            const angle = -Math.PI / 2 + i * Math.PI / count;
            output.push(`${object.x + Math.cos(angle) * radius},${object.y + Math.sin(angle) * radius}`);
        }
        return output.join(' ');
    }

    function objectMarkup(object) {
        const transform = object.rotation
            ? ` transform="rotate(${object.rotation} ${object.x ?? (object.x1 + object.x2) / 2} ${object.y ?? (object.y1 + object.y2) / 2})"`
            : '';

        if (object.type === 'path') {
            return `<g class="qmx-art-object" data-object-id="${esc(object.id)}"><path d="${pathD(object)}" ${commonStyle(object)}${markerAttrs(object)}/><path class="qmx-art-hit" d="${pathD(object)}" fill="none"/></g>`;
        }

        if (['line', 'arrow'].includes(object.type)) {
            return `<g class="qmx-art-object" data-object-id="${esc(object.id)}"><line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" ${commonStyle(object)}${markerAttrs(object)}/><line class="qmx-art-hit" x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}"/></g>`;
        }

        if (object.type === 'rectangle') {
            return `<g class="qmx-art-object" data-object-id="${esc(object.id)}"${transform}><rect x="${object.x - object.width / 2}" y="${object.y - object.height / 2}" width="${object.width}" height="${object.height}" rx="${object.radius || 0}" ${commonStyle(object)}/><rect class="qmx-art-hit" x="${object.x - object.width / 2}" y="${object.y - object.height / 2}" width="${object.width}" height="${object.height}"/></g>`;
        }

        if (object.type === 'ellipse') {
            return `<g class="qmx-art-object" data-object-id="${esc(object.id)}"${transform}><ellipse cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}" ${commonStyle(object)}/><ellipse class="qmx-art-hit" cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}"/></g>`;
        }

        if (object.type === 'star') {
            const points = starPoints(object);
            return `<g class="qmx-art-object" data-object-id="${esc(object.id)}"${transform}><polygon points="${points}" ${commonStyle(object)}/><polygon class="qmx-art-hit" points="${points}"/></g>`;
        }

        return `<g class="qmx-art-object" data-object-id="${esc(object.id)}"><text x="${object.x}" y="${object.y}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" font-style="${object.fontStyle}" opacity="${object.opacity}" text-anchor="${object.textAnchor}" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})">${esc(object.text)}</text><rect class="qmx-art-hit" x="${object.x - 100}" y="${object.y - 45}" width="200" height="90"/></g>`;
    }

    function objectBounds(object) {
        if (object.type === 'path') {
            return {
                minX: Math.min(...object.points.map((point) => point.x)),
                minY: Math.min(...object.points.map((point) => point.y)),
                maxX: Math.max(...object.points.map((point) => point.x)),
                maxY: Math.max(...object.points.map((point) => point.y))
            };
        }

        if (['line', 'arrow'].includes(object.type)) {
            return {
                minX: Math.min(object.x1, object.x2),
                minY: Math.min(object.y1, object.y2),
                maxX: Math.max(object.x1, object.x2),
                maxY: Math.max(object.y1, object.y2)
            };
        }

        if (object.type === 'text') {
            return {
                minX: object.x - 100,
                minY: object.y - 45,
                maxX: object.x + 100,
                maxY: object.y + 45
            };
        }

        return {
            minX: object.x - object.width / 2,
            minY: object.y - object.height / 2,
            maxX: object.x + object.width / 2,
            maxY: object.y + object.height / 2
        };
    }

    function selectionMarkup() {
        const object = selectedObject();
        if (!object) return '';

        if (object.type === 'path') {
            const bounds = objectBounds(object);
            const nodes = object.points.map((point, index) =>
                `<circle class="qmx-art-node" data-handle="node" data-point-index="${index}" cx="${point.x}" cy="${point.y}" r="6"/>`
            ).join('');
            return `<rect class="qmx-art-select" x="${bounds.minX - 8}" y="${bounds.minY - 8}" width="${bounds.maxX - bounds.minX + 16}" height="${bounds.maxY - bounds.minY + 16}"/>${nodes}`;
        }

        if (['line', 'arrow'].includes(object.type)) {
            return `<line class="qmx-art-select" x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}"/><circle class="qmx-art-handle" data-handle="endpoint-1" cx="${object.x1}" cy="${object.y1}" r="7"/><circle class="qmx-art-handle" data-handle="endpoint-2" cx="${object.x2}" cy="${object.y2}" r="7"/>`;
        }

        const bounds = objectBounds(object);
        const resize = object.type === 'text'
            ? ''
            : `<circle class="qmx-art-handle" data-handle="resize" cx="${bounds.maxX}" cy="${bounds.maxY}" r="7"/>`;
        return `<rect class="qmx-art-select" x="${bounds.minX - 8}" y="${bounds.minY - 8}" width="${bounds.maxX - bounds.minX + 16}" height="${bounds.maxY - bounds.minY + 16}"/>${resize}`;
    }

    function pendingMarkup() {
        if (!state.pendingPen?.points?.length) return '';
        const points = state.pendingPen.points.map((point) => `${point.x},${point.y}`).join(' ');
        return `<polyline points="${points}" fill="none" stroke="${esc(state.document.defaultStroke)}" stroke-width="${state.document.defaultStrokeWidth}" stroke-dasharray="7 5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
            state.pendingPen.points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="#fff" stroke="#7c3aed" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('');
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;

        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        state.controls.guides.innerHTML = guidesMarkup();
        state.controls.objects.innerHTML = state.document.objects.map(objectMarkup).join('');
        state.controls.selection.innerHTML = selectionMarkup();
        state.controls.pending.innerHTML = pendingMarkup();

        if (!options.keepProperties) renderProperties();
        renderSummary();
        updateHistoryButtons();
    }

    function renderSummary() {
        const paths = state.document.objects.filter((object) => object.type === 'path').length;
        const shapes = state.document.objects.filter((object) => ['rectangle', 'ellipse', 'star'].includes(object.type)).length;
        const lines = state.document.objects.filter((object) => ['line', 'arrow'].includes(object.type)).length;
        const text = state.document.objects.filter((object) => object.type === 'text').length;
        state.controls.summary.textContent = `${paths} path(s) · ${shapes} shape(s) · ${lines} line/arrow(s) · ${text} text object(s)`;
    }

    function renderProperties() {
        const object = selectedObject();

        if (!object) {
            state.controls.props.innerHTML = `<div class="qmx-art-empty">Select a vector object or path node.</div>`;
            return;
        }

        if (object.type === 'text') {
            state.controls.props.innerHTML = `
<div class="qmx-art-fields">
    <label class="qmx-art-field">Text<textarea data-object-prop="text">${esc(object.text)}</textarea></label>
    <div class="qmx-art-row">
        <label class="qmx-art-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-art-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-art-row">
        <label class="qmx-art-field">Font size<input type="number" min="8" max="160" data-object-prop="fontSize" value="${object.fontSize}"></label>
        <label class="qmx-art-field">Rotation<input type="number" data-object-prop="rotation" value="${object.rotation}"></label>
    </div>
    <label class="qmx-art-field">Text colour<input type="color" data-object-prop="textColor" value="${object.textColor}"></label>
    <label class="qmx-art-check"><input type="checkbox" data-object-prop="fontWeight"${object.fontWeight === 'bold' ? ' checked' : ''}> Bold</label>
    <label class="qmx-art-check"><input type="checkbox" data-object-prop="fontStyle"${object.fontStyle === 'italic' ? ' checked' : ''}> Italic</label>
</div>`;
            return;
        }

        const positionFields = object.type === 'path'
            ? `<div class="qmx-art-summary">${object.points.length} editable nodes. Drag the violet node handles.</div>`
            : (['line', 'arrow'].includes(object.type)
                ? `<div class="qmx-art-row"><label class="qmx-art-field">X1<input type="number" data-object-prop="x1" value="${object.x1.toFixed(1)}"></label><label class="qmx-art-field">Y1<input type="number" data-object-prop="y1" value="${object.y1.toFixed(1)}"></label></div><div class="qmx-art-row"><label class="qmx-art-field">X2<input type="number" data-object-prop="x2" value="${object.x2.toFixed(1)}"></label><label class="qmx-art-field">Y2<input type="number" data-object-prop="y2" value="${object.y2.toFixed(1)}"></label></div>`
                : `<div class="qmx-art-row"><label class="qmx-art-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label><label class="qmx-art-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label></div><div class="qmx-art-row"><label class="qmx-art-field">Width<input type="number" min="5" data-object-prop="width" value="${object.width.toFixed(1)}"></label><label class="qmx-art-field">Height<input type="number" min="5" data-object-prop="height" value="${object.height.toFixed(1)}"></label></div>`);

        const starFields = object.type === 'star'
            ? `<div class="qmx-art-row"><label class="qmx-art-field">Points<input type="number" min="3" max="24" data-object-prop="points" value="${object.points}"></label><label class="qmx-art-field">Inner ratio<input type="number" min=".1" max=".9" step=".05" data-object-prop="innerRatio" value="${object.innerRatio}"></label></div>`
            : '';

        const pathFields = object.type === 'path'
            ? `<label class="qmx-art-check"><input type="checkbox" data-object-prop="closed"${object.closed ? ' checked' : ''}> Closed path</label><label class="qmx-art-check"><input type="checkbox" data-object-prop="smooth"${object.smooth ? ' checked' : ''}> Smooth path</label>`
            : '';

        state.controls.props.innerHTML = `
<div class="qmx-art-fields">
    ${positionFields}
    ${starFields}
    ${pathFields}
    <div class="qmx-art-row">
        <label class="qmx-art-field">Stroke<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-art-field">Fill<input type="color" data-object-prop="fill" value="${object.fill === 'none' ? '#ffffff' : object.fill}"></label>
    </div>
    <div class="qmx-art-row">
        <label class="qmx-art-field">Stroke width<input type="number" min=".5" max="80" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
        <label class="qmx-art-field">Fill opacity<input type="number" min="0" max="1" step=".05" data-object-prop="fillOpacity" value="${object.fillOpacity}"></label>
    </div>
    <div class="qmx-art-row">
        <label class="qmx-art-field">Opacity<input type="number" min="0" max="1" step=".05" data-object-prop="opacity" value="${object.opacity}"></label>
        <label class="qmx-art-field">Rotation<input type="number" data-object-prop="rotation" value="${object.rotation || 0}"></label>
    </div>
    <label class="qmx-art-check"><input type="checkbox" data-object-prop="dash"${object.dash ? ' checked' : ''}> Dashed stroke</label>
    ${['path', 'line', 'arrow'].includes(object.type) ? `<label class="qmx-art-check"><input type="checkbox" data-object-prop="arrowStart"${object.arrowStart ? ' checked' : ''}> Start arrowhead</label><label class="qmx-art-check"><input type="checkbox" data-object-prop="arrowEnd"${object.arrowEnd ? ' checked' : ''}> End arrowhead</label>` : ''}
</div>`;
    }

    function onPropertyInput(event) {
        const control = event.target.closest('[data-object-prop]');
        const object = selectedObject();
        if (!control || !object) return;

        const prop = control.dataset.objectProp;

        if (['closed', 'smooth', 'dash', 'arrowStart', 'arrowEnd'].includes(prop)) {
            object[prop] = control.checked;
        } else if (prop === 'fontWeight') {
            object.fontWeight = control.checked ? 'bold' : 'normal';
        } else if (prop === 'fontStyle') {
            object.fontStyle = control.checked ? 'italic' : 'normal';
        } else if (['text', 'textColor', 'stroke'].includes(prop)) {
            object[prop] = control.value;
        } else if (prop === 'fill') {
            object.fill = control.value;
        } else {
            object[prop] = Number(control.value);
        }

        state.document = Diagram.normalizeSpec(state.document);
        render({ keepProperties: true });
    }

    function selectObject(id) {
        state.selectedId = id;
        render();
    }

    function onPointerDown(event) {
        if (!state.document || event.button !== 0) return;

        const point = svgPoint(event);
        const x = snap(point.x);
        const y = snap(point.y);

        if (state.activeTool === 'brush') {
            const object = createPath([{ x, y }], {
                smooth: true,
                closed: false,
                fill: 'none',
                fillOpacity: 0,
                strokeWidth: Math.max(2, state.document.defaultStrokeWidth)
            });
            state.document.objects.push(object);
            state.selectedId = object.id;
            state.interaction = {
                type: 'brush',
                pointerId: event.pointerId,
                objectId: object.id,
                last: { x, y }
            };
            state.svg.setPointerCapture(event.pointerId);
            render({ keepProperties: true });
            event.preventDefault();
            return;
        }

        if (state.activeTool === 'pen') {
            if (!state.pendingPen) {
                state.pendingPen = { points: [{ x, y }] };
            } else {
                state.pendingPen.points.push({ x, y });
            }
            render();
            event.preventDefault();
            return;
        }

        if (['line', 'arrow', 'rectangle', 'ellipse', 'star', 'text'].includes(state.activeTool)) {
            let object;
            if (state.activeTool === 'line') object = createLine(x, y, false);
            if (state.activeTool === 'arrow') object = createLine(x, y, true);
            if (['rectangle', 'ellipse', 'star'].includes(state.activeTool)) object = createShape(state.activeTool, x, y);
            if (state.activeTool === 'text') object = createText(x, y);

            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus(`${object.type} added.`);
            return;
        }

        const group = event.target.closest('[data-object-id]');
        const target = group
            ? state.document.objects.find((object) => object.id === group.dataset.objectId)
            : null;

        if (state.activeTool === 'eraser') {
            if (target) {
                state.document.objects = state.document.objects.filter((object) => object.id !== target.id);
                state.selectedId = null;
                pushHistory();
                render();
                setStatus('Object erased.');
            }
            return;
        }

        const handle = event.target.closest('[data-handle]');

        if (handle && selectedObject()) {
            state.interaction = {
                type: handle.dataset.handle,
                pointerId: event.pointerId,
                start: point,
                original: clone(selectedObject()),
                pointIndex: Number(handle.dataset.pointIndex)
            };
            state.svg.setPointerCapture(event.pointerId);
            event.preventDefault();
            return;
        }

        if (!target) {
            selectObject(null);
            return;
        }

        if (target.id !== state.selectedId) selectObject(target.id);

        state.interaction = {
            type: 'move',
            pointerId: event.pointerId,
            start: point,
            original: clone(target)
        };
        state.svg.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    function moveObject(object, original, dx, dy) {
        if (object.type === 'path') {
            object.points = original.points.map((point) => ({
                x: snap(point.x + dx),
                y: snap(point.y + dy)
            }));
            return;
        }

        if (['line', 'arrow'].includes(object.type)) {
            object.x1 = snap(original.x1 + dx);
            object.y1 = snap(original.y1 + dy);
            object.x2 = snap(original.x2 + dx);
            object.y2 = snap(original.y2 + dy);
            return;
        }

        object.x = snap(original.x + dx);
        object.y = snap(original.y + dy);
    }

    function onPointerMove(event) {
        const interaction = state.interaction;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        const object = state.document.objects.find((item) => item.id === (interaction.objectId || state.selectedId));
        if (!object) return;

        const point = svgPoint(event);
        const dx = point.x - interaction.start?.x;
        const dy = point.y - interaction.start?.y;

        if (interaction.type === 'brush') {
            const last = interaction.last;
            if (Math.hypot(point.x - last.x, point.y - last.y) >= 4) {
                object.points.push({ x: point.x, y: point.y });
                interaction.last = { x: point.x, y: point.y };
                render({ keepProperties: true });
            }
            return;
        }

        if (interaction.type === 'move') {
            moveObject(object, interaction.original, dx, dy);
        } else if (interaction.type === 'node' && object.points?.[interaction.pointIndex]) {
            object.points[interaction.pointIndex] = { x: snap(point.x), y: snap(point.y) };
        } else if (interaction.type === 'endpoint-1') {
            object.x1 = snap(point.x);
            object.y1 = snap(point.y);
        } else if (interaction.type === 'endpoint-2') {
            object.x2 = snap(point.x);
            object.y2 = snap(point.y);
        } else if (interaction.type === 'resize' && object.width != null) {
            object.width = Math.max(10, snap(interaction.original.width + dx * 2));
            object.height = Math.max(10, snap(interaction.original.height + dy * 2));
        }

        state.document = Diagram.normalizeSpec(state.document);
        render({ keepProperties: true });
    }

    function onPointerUp(event) {
        const interaction = state.interaction;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        try {
            state.svg.releasePointerCapture(event.pointerId);
        } catch (error) {
            // Pointer capture may already be released.
        }

        state.interaction = null;
        state.document = Diagram.normalizeSpec(state.document);
        pushHistory();
        render();
    }

    function onDoubleClick(event) {
        if (state.activeTool !== 'pen') return;
        event.preventDefault();
        finishPen();
    }

    function finishPen() {
        if (!state.pendingPen) return;

        if (state.pendingPen.points.length >= 2) {
            const object = createPath(state.pendingPen.points, {
                smooth: false,
                closed: false,
                fill: 'none',
                fillOpacity: 0
            });
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setStatus('Pen path added.');
        }

        state.pendingPen = null;
        setTool('select');
        render();
    }

    function deleteSelected() {
        const object = selectedObject();
        if (!object) return;
        state.document.objects = state.document.objects.filter((item) => item.id !== object.id);
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Object deleted.');
    }

    function duplicateSelected() {
        const object = selectedObject();
        if (!object) return;

        const copy = clone(object);
        copy.id = uid(copy.type);

        if (copy.type === 'path') {
            copy.points = copy.points.map((point) => ({ x: point.x + 28, y: point.y + 28 }));
        } else if (['line', 'arrow'].includes(copy.type)) {
            copy.x1 += 28;
            copy.y1 += 28;
            copy.x2 += 28;
            copy.y2 += 28;
        } else {
            copy.x += 28;
            copy.y += 28;
        }

        state.document.objects.push(copy);
        state.selectedId = copy.id;
        pushHistory();
        render();
        setStatus('Object duplicated.');
    }

    function bringFront() {
        const object = selectedObject();
        if (!object) return;
        state.document.objects = state.document.objects.filter((item) => item.id !== object.id);
        state.document.objects.push(object);
        pushHistory();
        render();
        setStatus('Object brought to front.');
    }

    function sendBack() {
        const object = selectedObject();
        if (!object) return;
        state.document.objects = state.document.objects.filter((item) => item.id !== object.id);
        state.document.objects.unshift(object);
        pushHistory();
        render();
        setStatus('Object sent to back.');
    }

    function clearCanvas() {
        if (state.document.objects.length && !window.confirm('Clear all vector objects?')) return;
        state.document.objects = [];
        state.selectedId = null;
        state.pendingPen = null;
        pushHistory();
        render();
        setStatus('Canvas cleared.');
    }

    function iconPreset() {
        const circle = createShape('ellipse', 500, 300);
        circle.width = circle.height = 270;
        circle.fill = '#dbeafe';
        circle.stroke = '#2563eb';
        circle.strokeWidth = 8;

        const star = createShape('star', 500, 292);
        star.width = star.height = 150;
        star.fill = '#f59e0b';
        star.stroke = '#b45309';
        star.strokeWidth = 5;
        star.points = 6;

        const text = createText(500, 470);
        text.text = 'ICON';
        text.fontSize = 36;
        text.textColor = '#1e3a8a';

        state.document.objects = [circle, star, text];
        state.selectedId = star.id;
        pushHistory();
        render();
        setStatus('Icon composition preset inserted.');
    }

    function calloutPreset() {
        const bubble = createShape('rectangle', 490, 265);
        bubble.width = 560;
        bubble.height = 210;
        bubble.radius = 34;
        bubble.fill = '#ecfeff';
        bubble.stroke = '#0891b2';
        bubble.strokeWidth = 6;

        const tail = createPath([
            { x: 360, y: 365 },
            { x: 310, y: 455 },
            { x: 430, y: 365 }
        ], {
            smooth: false,
            closed: true,
            stroke: '#0891b2',
            fill: '#ecfeff',
            fillOpacity: 1,
            strokeWidth: 6
        });

        const text = createText(490, 265);
        text.text = 'Important note';
        text.fontSize = 42;
        text.textColor = '#164e63';

        state.document.objects = [tail, bubble, text];
        state.selectedId = bubble.id;
        pushHistory();
        render();
        setStatus('Callout preset inserted.');
    }

    function badgePreset() {
        const outer = createShape('star', 500, 300);
        outer.width = outer.height = 360;
        outer.points = 18;
        outer.innerRatio = 0.82;
        outer.fill = '#fef3c7';
        outer.stroke = '#d97706';
        outer.strokeWidth = 5;

        const inner = createShape('ellipse', 500, 300);
        inner.width = inner.height = 250;
        inner.fill = '#fff7ed';
        inner.stroke = '#ea580c';
        inner.strokeWidth = 7;

        const text = createText(500, 300);
        text.text = 'AWARD';
        text.fontSize = 44;
        text.textColor = '#9a3412';

        state.document.objects = [outer, inner, text];
        state.selectedId = inner.id;
        pushHistory();
        render();
        setStatus('Badge preset inserted.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Freehand / Vector Art document?')) return;
        state.document = createDocument();
        state.selectedId = null;
        state.pendingPen = null;
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Freehand / Vector Art document.');
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

        if (replaceRange && Number.isInteger(replaceRange.start) && Number.isInteger(replaceRange.end)) {
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
        setStatus('Vector artwork inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'freehand-vector-art')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'freehand-vector-art';
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
            canvas.getContext('2d').drawImage(image, 0, 0);
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

        if (state.document.mode !== 'vector-art') {
            state.document = createDocument();
        }

        state.selectedId = null;
        state.pendingPen = null;
        state.activeTool = 'select';
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();

        state.root.hidden = false;
        document.body.dataset.qmxArtOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(context.initialSpec
            ? 'Existing Freehand / Vector Art loaded.'
            : 'Choose a tool or insert a preset.');

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;

        if (state.pendingPen) finishPen();
        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxArtOverflow || '';
        delete document.body.dataset.qmxArtOverflow;
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

        if (spec.mode !== 'vector-art') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }

        open({
            tool: { id: 'freehand-vector-art' },
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
            'freehand-vector-art',
            'freehand-art',
            'vector-art',
            'freehand-drawing',
            'freehand',
            'art'
        ].forEach((id) => {
            try {
                launcher.registerToolHandler(id, open);
                registered = true;
            } catch (error) {
                // Registries may expose only one canonical Freehand / Vector Art id.
            }
        });

        return registered;
    }

    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;

        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        if (event.key === 'Escape') {
            if (state.pendingPen) {
                state.pendingPen = null;
                setTool('select');
                render();
            } else {
                close();
            }
            event.preventDefault();
            return;
        }

        if (event.key === 'Enter' && state.pendingPen && !editing) {
            event.preventDefault();
            finishPen();
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

    window.QmxVectorArtEditor = Object.freeze({
        version: '1.0.0',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
