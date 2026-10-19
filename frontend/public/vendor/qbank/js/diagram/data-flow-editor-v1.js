(function (window, document) {
    'use strict';

    if (window.QmxDataFlowEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX DFD] Diagram renderer must load first.');
        return;
    }

    const TOOLS = [
        ['select', 'Select', 'নির্বাচন'],
        ['process', 'Process', 'প্রক্রিয়া'],
        ['external-entity', 'External Entity', 'বাহ্যিক সত্তা'],
        ['data-store', 'Data Store', 'ডেটা ভাণ্ডার'],
        ['data-flow', 'Data Flow', 'ডেটা প্রবাহ'],
        ['text', 'Annotation', 'টীকা']
    ];

    const COLOURS = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2'];

    const state = {
        root: null,
        svg: null,
        gridLayer: null,
        flowLayer: null,
        nodeLayer: null,
        textLayer: null,
        draftLayer: null,
        selectionLayer: null,
        context: null,
        document: null,
        activeTool: 'select',
        selectedId: null,
        interaction: null,
        pendingFlowSourceId: null,
        pointer: null,
        history: [],
        historyIndex: -1,
        controls: {}
    };

    function uid(prefix = 'dfd') {
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

    function snap(value) {
        if (!state.document.snapToGrid) return value;
        const size = state.document.gridSize;
        return Math.round(value / size) * size;
    }

    function createDocument() {
        return {
            version: 9,
            id: uid('data-flow'),
            mode: 'data-flow',
            title: 'Data-flow Diagram',
            width: 1000,
            height: 600,
            background: '#ffffff',
            gridSize: 20,
            showGrid: true,
            snapToGrid: true,
            showFlowLabels: true,
            notation: 'yourdon',
            connectorRoute: 'orthogonal',
            horizontalFirst: true,
            objects: []
        };
    }

    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
    }

    function nodes() {
        return state.document.objects.filter((object) =>
            ['process', 'external-entity', 'data-store'].includes(object.type)
        );
    }

    function flows() {
        return state.document.objects.filter((object) => object.type === 'data-flow');
    }

    function texts() {
        return state.document.objects.filter((object) => object.type === 'text');
    }

    function objectById(id) {
        return state.document.objects.find((object) => object.id === id) || null;
    }

    function pointFromEvent(event) {
        const point = state.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        const local = matrix ? point.matrixTransform(matrix.inverse()) : point;
        return { x: local.x, y: local.y };
    }

    function nextProcessNumber() {
        return String(
            nodes().filter((object) => object.type === 'process').length + 1
        );
    }

    function makeNode(type, x, y) {
        const index = nodes().length;
        const colour = COLOURS[index % COLOURS.length];

        if (type === 'process') {
            return {
                id: uid('process'),
                type: 'process',
                x,
                y,
                width: 170,
                height: 105,
                number: nextProcessNumber(),
                label: 'Process',
                description: '',
                stroke: colour,
                fill: '#ffffff',
                fillOpacity: 1,
                strokeWidth: 3,
                dash: false,
                opacity: 1
            };
        }

        if (type === 'external-entity') {
            return {
                id: uid('entity'),
                type: 'external-entity',
                x,
                y,
                width: 180,
                height: 82,
                label: 'External Entity',
                description: '',
                stroke: colour,
                fill: '#ffffff',
                fillOpacity: 1,
                strokeWidth: 3,
                dash: false,
                opacity: 1
            };
        }

        return {
            id: uid('store'),
            type: 'data-store',
            x,
            y,
            width: 210,
            height: 72,
            label: 'Data Store',
            storeCode: `D${nodes().filter((object) => object.type === 'data-store').length + 1}`,
            description: '',
            stroke: colour,
            fill: '#ffffff',
            fillOpacity: 1,
            strokeWidth: 3,
            dash: false,
            opacity: 1
        };
    }

    function makeFlow(fromId, toId) {
        const count = flows().length + 1;
        return {
            id: uid('flow'),
            type: 'data-flow',
            fromId,
            toId,
            label: `Data flow ${count}`,
            route: state.document.connectorRoute,
            horizontalFirst: state.document.horizontalFirst,
            stroke: '#0f172a',
            strokeWidth: 2.5,
            dash: false,
            opacity: 1,
            labelOffsetX: 0,
            labelOffsetY: -10
        };
    }

    function makeText(x, y) {
        return {
            id: uid('text'),
            type: 'text',
            x,
            y,
            text: 'Annotation',
            textColor: '#0f172a',
            fontSize: 18,
            fontWeight: 'normal',
            rotation: 0,
            opacity: 1
        };
    }

    function nodeBounds(object) {
        return {
            left: object.x - object.width / 2,
            right: object.x + object.width / 2,
            top: object.y - object.height / 2,
            bottom: object.y + object.height / 2
        };
    }

    function nodeAnchor(object, targetX, targetY) {
        const dx = targetX - object.x;
        const dy = targetY - object.y;

        if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) {
            return { x: object.x, y: object.y };
        }

        if (object.type === 'process' && state.document.notation === 'yourdon') {
            const rx = object.width / 2;
            const ry = object.height / 2;
            const scale = 1 / Math.sqrt(
                (dx * dx) / (rx * rx) +
                (dy * dy) / (ry * ry)
            );
            return {
                x: object.x + dx * scale,
                y: object.y + dy * scale
            };
        }

        const halfW = object.width / 2;
        const halfH = object.height / 2;
        const scaleX = Math.abs(dx) > 0 ? halfW / Math.abs(dx) : Infinity;
        const scaleY = Math.abs(dy) > 0 ? halfH / Math.abs(dy) : Infinity;
        const scale = Math.min(scaleX, scaleY);

        return {
            x: object.x + dx * scale,
            y: object.y + dy * scale
        };
    }

    function flowGeometry(object) {
        const from = objectById(object.fromId);
        const to = objectById(object.toId);

        if (!from || !to) {
            return {
                path: '',
                labelX: 0,
                labelY: 0,
                from: null,
                to: null
            };
        }

        const start = nodeAnchor(from, to.x, to.y);
        const end = nodeAnchor(to, from.x, from.y);
        const route = object.route || state.document.connectorRoute;
        let path;
        let labelX;
        let labelY;

        if (route === 'straight') {
            path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
            labelX = (start.x + end.x) / 2;
            labelY = (start.y + end.y) / 2;
        } else if (route === 'curved') {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const controlX = (start.x + end.x) / 2 - dy * 0.18;
            const controlY = (start.y + end.y) / 2 + dx * 0.18;
            path = `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;
            labelX = 0.25 * start.x + 0.5 * controlX + 0.25 * end.x;
            labelY = 0.25 * start.y + 0.5 * controlY + 0.25 * end.y;
        } else if (object.horizontalFirst) {
            const midX = (start.x + end.x) / 2;
            path = `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
            labelX = midX;
            labelY = (start.y + end.y) / 2;
        } else {
            const midY = (start.y + end.y) / 2;
            path = `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`;
            labelX = (start.x + end.x) / 2;
            labelY = midY;
        }

        return {
            path,
            labelX: labelX + object.labelOffsetX,
            labelY: labelY + object.labelOffsetY,
            from,
            to
        };
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
        state.interaction = null;
        state.pendingFlowSourceId = null;
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

    function addStyles() {
        if (document.getElementById('qmx-dfd-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-dfd-editor-styles';
        style.textContent = `
.qmx-dfd-editor[hidden]{display:none!important}
.qmx-dfd-editor{position:fixed;inset:0;z-index:10240;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.7);backdrop-filter:blur(2px)}
.qmx-dfd-dialog{width:min(1550px,100%);height:min(96vh,980px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.38)}
.qmx-dfd-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-dfd-title{margin-right:auto}.qmx-dfd-title strong{display:block}.qmx-dfd-title span{display:block;color:#64748b;font-size:11px}
.qmx-dfd-btn,.qmx-dfd-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-dfd-btn:hover,.qmx-dfd-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-dfd-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-dfd-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-dfd-btn.is-danger{color:#b91c1c}.qmx-dfd-close{font-size:20px;line-height:1}
.qmx-dfd-workspace{min-height:0;flex:1;display:grid;grid-template-columns:220px minmax(0,1fr) 310px;gap:10px;padding:10px}
.qmx-dfd-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-dfd-panel h3{margin:0 0 8px;font-size:13px}.qmx-dfd-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-dfd-tool{min-height:58px;padding:6px 5px;font-size:10px}.qmx-dfd-tool span{display:block;margin-top:2px;color:#64748b;font-size:9px;font-weight:500}
.qmx-dfd-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-dfd-quick{display:grid;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0}
.qmx-dfd-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-dfd-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-dfd-stage{display:block;width:min(100%,1180px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none;user-select:none}
.qmx-dfd-object{cursor:move}.qmx-dfd-flow{cursor:pointer}.qmx-dfd-hit{fill:transparent;stroke:transparent;stroke-width:20;pointer-events:all}
.qmx-dfd-select{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-dfd-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:nwse-resize;pointer-events:all}
.qmx-dfd-pending{filter:drop-shadow(0 0 4px rgba(37,99,235,.7))}
.qmx-dfd-fields{display:grid;gap:9px}.qmx-dfd-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-dfd-field input,.qmx-dfd-field textarea,.qmx-dfd-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-dfd-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-dfd-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-dfd-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-dfd-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-dfd-summary{margin-top:10px;padding:9px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.55}
.qmx-dfd-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-dfd-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-dfd-footer .qmx-dfd-btn:first-of-type{margin-left:auto}
@media(max-width:1050px){.qmx-dfd-workspace{grid-template-columns:180px minmax(0,1fr) 250px}.qmx-dfd-tools{grid-template-columns:1fr}}
@media(max-width:760px){.qmx-dfd-editor{padding:0}.qmx-dfd-dialog{width:100%;height:100%;border-radius:0}.qmx-dfd-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(350px,1fr) auto;overflow:auto}.qmx-dfd-panel{overflow:visible}.qmx-dfd-tools{grid-template-columns:repeat(2,1fr)}.qmx-dfd-header{overflow-x:auto}.qmx-dfd-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-dfd-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-dfd-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-dfd-title">
<header class="qmx-dfd-header">
    <div class="qmx-dfd-title">
        <strong id="qmx-dfd-title">Data-flow Diagram</strong>
        <span>Processes, external entities, data stores and directional data flows</span>
    </div>
    <button type="button" class="qmx-dfd-btn" data-dfd-new>New</button>
    <button type="button" class="qmx-dfd-btn" data-dfd-undo>Undo</button>
    <button type="button" class="qmx-dfd-btn" data-dfd-redo>Redo</button>
    <button type="button" class="qmx-dfd-btn" data-dfd-duplicate>Duplicate</button>
    <button type="button" class="qmx-dfd-btn is-danger" data-dfd-delete>Delete</button>
    <button type="button" class="qmx-dfd-btn qmx-dfd-close" data-dfd-close aria-label="Close">×</button>
</header>
<div class="qmx-dfd-workspace">
    <aside class="qmx-dfd-panel">
        <h3>DFD tools</h3>
        <div class="qmx-dfd-tools" data-dfd-tools></div>
        <div class="qmx-dfd-quick">
            <button type="button" class="qmx-dfd-btn" data-dfd-context-preset>Context diagram</button>
            <button type="button" class="qmx-dfd-btn" data-dfd-level1-preset>Level-1 preset</button>
            <button type="button" class="qmx-dfd-btn" data-dfd-remove-flows>Remove all flows</button>
        </div>
        <p class="qmx-dfd-help">
            Add nodes by clicking the canvas. For Data Flow, click a source node and then a destination node.
            Connected flows follow nodes automatically when moved or resized.
        </p>
    </aside>
    <main class="qmx-dfd-stage-wrap">
        <svg class="qmx-dfd-stage" data-dfd-svg viewBox="0 0 1000 600" tabindex="0" aria-label="Data-flow diagram canvas">
            <defs>
                <pattern id="qmx-dfd-grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" stroke-width="1"></path>
                </pattern>
                <marker id="qmx-dfd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke"></path>
                </marker>
            </defs>
            <rect data-dfd-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-dfd-grid-layer></g>
            <g data-dfd-flow-layer></g>
            <g data-dfd-node-layer></g>
            <g data-dfd-text-layer></g>
            <g data-dfd-draft-layer></g>
            <g data-dfd-selection-layer></g>
        </svg>
    </main>
    <aside class="qmx-dfd-panel">
        <h3>Document</h3>
        <div class="qmx-dfd-fields">
            <label class="qmx-dfd-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-dfd-row">
                <label class="qmx-dfd-field">Width<input type="number" min="320" max="2400" data-doc-prop="width"></label>
                <label class="qmx-dfd-field">Height<input type="number" min="220" max="1800" data-doc-prop="height"></label>
            </div>
            <label class="qmx-dfd-field">Notation
                <select data-doc-prop="notation">
                    <option value="yourdon">Yourdon / DeMarco</option>
                    <option value="gane-sarson">Gane–Sarson</option>
                </select>
            </label>
            <label class="qmx-dfd-field">Default connector route
                <select data-doc-prop="connectorRoute">
                    <option value="orthogonal">Orthogonal</option>
                    <option value="straight">Straight</option>
                    <option value="curved">Curved</option>
                </select>
            </label>
            <div class="qmx-dfd-row">
                <label class="qmx-dfd-field">Grid size<input type="number" min="5" max="100" data-doc-prop="gridSize"></label>
                <label class="qmx-dfd-field">Background<input type="color" data-doc-prop="background"></label>
            </div>
            <label class="qmx-dfd-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label>
            <label class="qmx-dfd-check"><input type="checkbox" data-doc-prop="snapToGrid"> Snap to grid</label>
            <label class="qmx-dfd-check"><input type="checkbox" data-doc-prop="showFlowLabels"> Show flow labels</label>
            <label class="qmx-dfd-check"><input type="checkbox" data-doc-prop="horizontalFirst"> Horizontal-first orthogonal route</label>
        </div>
        <hr class="qmx-dfd-divider">
        <h3>Selected object</h3>
        <div data-dfd-properties></div>
        <div class="qmx-dfd-summary" data-dfd-summary></div>
    </aside>
</div>
<footer class="qmx-dfd-footer">
    <span class="qmx-dfd-status" data-dfd-status aria-live="polite"></span>
    <button type="button" class="qmx-dfd-btn" data-dfd-export-svg>Export SVG</button>
    <button type="button" class="qmx-dfd-btn" data-dfd-export-png>Export PNG</button>
    <button type="button" class="qmx-dfd-btn is-primary" data-dfd-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.svg = root.querySelector('[data-dfd-svg]');
        state.gridLayer = root.querySelector('[data-dfd-grid-layer]');
        state.flowLayer = root.querySelector('[data-dfd-flow-layer]');
        state.nodeLayer = root.querySelector('[data-dfd-node-layer]');
        state.textLayer = root.querySelector('[data-dfd-text-layer]');
        state.draftLayer = root.querySelector('[data-dfd-draft-layer]');
        state.selectionLayer = root.querySelector('[data-dfd-selection-layer]');
        state.controls = {
            bg: root.querySelector('[data-dfd-bg]'),
            tools: root.querySelector('[data-dfd-tools]'),
            props: root.querySelector('[data-dfd-properties]'),
            summary: root.querySelector('[data-dfd-summary]'),
            status: root.querySelector('[data-dfd-status]'),
            undo: root.querySelector('[data-dfd-undo]'),
            redo: root.querySelector('[data-dfd-redo]')
        };

        TOOLS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-dfd-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        state.controls.tools.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (button) setTool(button.dataset.tool);
        });

        root.querySelector('[data-dfd-close]').addEventListener('click', close);
        root.querySelector('[data-dfd-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-dfd-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-dfd-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-dfd-context-preset]').addEventListener('click', contextPreset);
        root.querySelector('[data-dfd-level1-preset]').addEventListener('click', levelOnePreset);
        root.querySelector('[data-dfd-remove-flows]').addEventListener('click', removeAllFlows);
        root.querySelector('[data-dfd-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-dfd-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-dfd-insert]').addEventListener('click', insertIntoQuestion);

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
        document.addEventListener('keydown', onKeydown);
    }

    function setTool(tool) {
        state.activeTool = TOOLS.some(([id]) => id === tool) ? tool : 'select';
        state.interaction = null;

        if (state.activeTool !== 'data-flow') {
            state.pendingFlowSourceId = null;
        }

        state.controls.tools.querySelectorAll('[data-tool]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tool === state.activeTool);
        });

        render();

        if (state.activeTool === 'data-flow') {
            setStatus('Click a source node, then click a destination node.');
        } else if (state.activeTool === 'select') {
            setStatus('Select and drag nodes, flows or annotations.');
        } else {
            setStatus(`Click the canvas to add ${TOOLS.find(([id]) => id === state.activeTool)?.[1] || 'object'}.`);
        }
    }

    function onDocumentInput(event) {
        const control = event.currentTarget;
        const prop = control.dataset.docProp;
        if (!prop || !state.document) return;

        if (['showGrid', 'snapToGrid', 'showFlowLabels', 'horizontalFirst'].includes(prop)) {
            state.document[prop] = control.checked;
        } else if (['width', 'height', 'gridSize'].includes(prop)) {
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

    function gridMarkup() {
        if (!state.document.showGrid) return '';

        const size = state.document.gridSize;
        return `<pattern id="qmx-dfd-grid-live" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern><rect width="${state.document.width}" height="${state.document.height}" fill="url(#qmx-dfd-grid-live)" pointer-events="none"/>`;
    }

    function processMarkup(object) {
        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const left = object.x - object.width / 2;
        const top = object.y - object.height / 2;

        if (state.document.notation === 'gane-sarson') {
            const numberWidth = Math.min(48, object.width * 0.28);
            return `
<g class="qmx-dfd-object${state.pendingFlowSourceId === object.id ? ' qmx-dfd-pending' : ''}" data-object-id="${esc(object.id)}">
    <rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="14" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>
    <line x1="${left + numberWidth}" y1="${top}" x2="${left + numberWidth}" y2="${top + object.height}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" vector-effect="non-scaling-stroke"/>
    <text x="${left + numberWidth / 2}" y="${object.y}" fill="${esc(object.stroke)}" font-size="18" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(object.number)}</text>
    <text x="${left + numberWidth + (object.width - numberWidth) / 2}" y="${object.y - 5}" fill="#0f172a" font-size="17" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(object.label)}</text>
    ${object.description ? `<text x="${left + numberWidth + (object.width - numberWidth) / 2}" y="${object.y + 20}" fill="#64748b" font-size="11" text-anchor="middle">${esc(object.description)}</text>` : ''}
    <rect class="qmx-dfd-hit" x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="14"/>
</g>`;
        }

        return `
<g class="qmx-dfd-object${state.pendingFlowSourceId === object.id ? ' qmx-dfd-pending' : ''}" data-object-id="${esc(object.id)}">
    <ellipse cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>
    <text x="${object.x}" y="${object.y - 13}" fill="${esc(object.stroke)}" font-size="15" font-weight="700" text-anchor="middle">${esc(object.number)}</text>
    <text x="${object.x}" y="${object.y + 10}" fill="#0f172a" font-size="17" font-weight="700" text-anchor="middle">${esc(object.label)}</text>
    ${object.description ? `<text x="${object.x}" y="${object.y + 31}" fill="#64748b" font-size="11" text-anchor="middle">${esc(object.description)}</text>` : ''}
    <ellipse class="qmx-dfd-hit" cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}"/>
</g>`;
    }

    function externalEntityMarkup(object) {
        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const left = object.x - object.width / 2;
        const top = object.y - object.height / 2;

        return `
<g class="qmx-dfd-object${state.pendingFlowSourceId === object.id ? ' qmx-dfd-pending' : ''}" data-object-id="${esc(object.id)}">
    <rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="4" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>
    <text x="${object.x}" y="${object.y - 3}" fill="#0f172a" font-size="17" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(object.label)}</text>
    ${object.description ? `<text x="${object.x}" y="${object.y + 23}" fill="#64748b" font-size="11" text-anchor="middle">${esc(object.description)}</text>` : ''}
    <rect class="qmx-dfd-hit" x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="4"/>
</g>`;
    }

    function dataStoreMarkup(object) {
        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const left = object.x - object.width / 2;
        const top = object.y - object.height / 2;
        const codeWidth = Math.min(48, object.width * 0.25);

        return `
<g class="qmx-dfd-object${state.pendingFlowSourceId === object.id ? ' qmx-dfd-pending' : ''}" data-object-id="${esc(object.id)}">
    <rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="none" opacity="${object.opacity}"/>
    <line x1="${left}" y1="${top}" x2="${left + object.width}" y2="${top}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} vector-effect="non-scaling-stroke"/>
    <line x1="${left}" y1="${top + object.height}" x2="${left + object.width}" y2="${top + object.height}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} vector-effect="non-scaling-stroke"/>
    <line x1="${left + codeWidth}" y1="${top}" x2="${left + codeWidth}" y2="${top + object.height}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" vector-effect="non-scaling-stroke"/>
    <text x="${left + codeWidth / 2}" y="${object.y}" fill="${esc(object.stroke)}" font-size="16" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(object.storeCode)}</text>
    <text x="${left + codeWidth + (object.width - codeWidth) / 2}" y="${object.y - 3}" fill="#0f172a" font-size="17" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(object.label)}</text>
    ${object.description ? `<text x="${left + codeWidth + (object.width - codeWidth) / 2}" y="${object.y + 23}" fill="#64748b" font-size="11" text-anchor="middle">${esc(object.description)}</text>` : ''}
    <rect class="qmx-dfd-hit" x="${left}" y="${top}" width="${object.width}" height="${object.height}"/>
</g>`;
    }

    function nodeMarkup(object) {
        if (object.type === 'process') return processMarkup(object);
        if (object.type === 'external-entity') return externalEntityMarkup(object);
        return dataStoreMarkup(object);
    }

    function flowMarkup(object) {
        const geometry = flowGeometry(object);
        if (!geometry.path) return '';

        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const label = state.document.showFlowLabels && object.label
            ? `<g pointer-events="none"><rect x="${geometry.labelX - Math.max(28, object.label.length * 3.6)}" y="${geometry.labelY - 14}" width="${Math.max(56, object.label.length * 7.2)}" height="22" rx="5" fill="#ffffff" fill-opacity=".92"/><text x="${geometry.labelX}" y="${geometry.labelY + 2}" fill="${esc(object.stroke)}" font-size="12" font-weight="700" text-anchor="middle">${esc(object.label)}</text></g>`
            : '';

        return `
<g class="qmx-dfd-flow" data-object-id="${esc(object.id)}">
    <path d="${geometry.path}" fill="none" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" marker-end="url(#qmx-dfd-arrow)" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <path class="qmx-dfd-hit" d="${geometry.path}" fill="none"/>
    ${label}
</g>`;
    }

    function textMarkup(object) {
        return `
<g class="qmx-dfd-object" data-object-id="${esc(object.id)}">
    <text x="${object.x}" y="${object.y}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})">${esc(object.text)}</text>
    <rect class="qmx-dfd-hit" x="${object.x - 75}" y="${object.y - 35}" width="150" height="70"/>
</g>`;
    }

    function draftMarkup() {
        if (state.activeTool !== 'data-flow' || !state.pendingFlowSourceId || !state.pointer) return '';

        const from = objectById(state.pendingFlowSourceId);
        if (!from) return '';

        const start = nodeAnchor(from, state.pointer.x, state.pointer.y);
        return `<path d="M ${start.x} ${start.y} L ${state.pointer.x} ${state.pointer.y}" fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="7 5" marker-end="url(#qmx-dfd-arrow)" pointer-events="none"/>`;
    }

    function selectionMarkup() {
        const object = selectedObject();
        if (!object) return '';

        if (object.type === 'data-flow') {
            const geometry = flowGeometry(object);
            if (!geometry.path) return '';
            return `<path class="qmx-dfd-select" d="${geometry.path}" stroke-width="${object.strokeWidth + 5}"/>`;
        }

        if (object.type === 'text') {
            return `<rect class="qmx-dfd-select" x="${object.x - 80}" y="${object.y - 40}" width="160" height="80"/>`;
        }

        const bounds = nodeBounds(object);
        return `
<rect class="qmx-dfd-select" x="${bounds.left - 7}" y="${bounds.top - 7}" width="${object.width + 14}" height="${object.height + 14}"/>
<circle class="qmx-dfd-handle" data-handle="node-resize" cx="${bounds.right}" cy="${bounds.bottom}" r="7"/>`;
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;

        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        state.gridLayer.innerHTML = gridMarkup();
        state.flowLayer.innerHTML = flows().map(flowMarkup).join('');
        state.nodeLayer.innerHTML = nodes().map(nodeMarkup).join('');
        state.textLayer.innerHTML = texts().map(textMarkup).join('');
        state.draftLayer.innerHTML = draftMarkup();
        state.selectionLayer.innerHTML = selectionMarkup();

        if (!options.keepProperties) renderProperties();
        renderSummary();
        updateHistoryButtons();
    }

    function renderSummary() {
        const processCount = nodes().filter((object) => object.type === 'process').length;
        const entityCount = nodes().filter((object) => object.type === 'external-entity').length;
        const storeCount = nodes().filter((object) => object.type === 'data-store').length;

        state.controls.summary.textContent =
            `${processCount} process(es) · ${entityCount} external entity(ies) · ${storeCount} data store(s) · ${flows().length} data flow(s)`;
    }

    function nodeOptions(selectedId) {
        return nodes()
            .map((node) => `<option value="${esc(node.id)}"${node.id === selectedId ? ' selected' : ''}>${esc(node.label || node.id)}</option>`)
            .join('');
    }

    function renderProperties() {
        const object = selectedObject();

        if (!object) {
            state.controls.props.innerHTML = `<div class="qmx-dfd-empty">Select a node, data flow or annotation.</div>`;
            return;
        }

        if (object.type === 'data-flow') {
            state.controls.props.innerHTML = `
<div class="qmx-dfd-fields">
    <label class="qmx-dfd-field">Flow label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-dfd-row">
        <label class="qmx-dfd-field">From<select data-object-prop="fromId">${nodeOptions(object.fromId)}</select></label>
        <label class="qmx-dfd-field">To<select data-object-prop="toId">${nodeOptions(object.toId)}</select></label>
    </div>
    <label class="qmx-dfd-field">Route
        <select data-object-prop="route">
            <option value="orthogonal"${object.route === 'orthogonal' ? ' selected' : ''}>Orthogonal</option>
            <option value="straight"${object.route === 'straight' ? ' selected' : ''}>Straight</option>
            <option value="curved"${object.route === 'curved' ? ' selected' : ''}>Curved</option>
        </select>
    </label>
    <div class="qmx-dfd-row">
        <label class="qmx-dfd-field">Colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-dfd-field">Width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
    </div>
    <div class="qmx-dfd-row">
        <label class="qmx-dfd-field">Label offset X<input type="number" step="1" data-object-prop="labelOffsetX" value="${object.labelOffsetX}"></label>
        <label class="qmx-dfd-field">Label offset Y<input type="number" step="1" data-object-prop="labelOffsetY" value="${object.labelOffsetY}"></label>
    </div>
    <label class="qmx-dfd-check"><input type="checkbox" data-object-prop="horizontalFirst"${object.horizontalFirst ? ' checked' : ''}> Horizontal-first orthogonal route</label>
    <label class="qmx-dfd-check"><input type="checkbox" data-object-prop="dash"${object.dash ? ' checked' : ''}> Dashed flow</label>
</div>`;
            return;
        }

        if (object.type === 'text') {
            state.controls.props.innerHTML = `
<div class="qmx-dfd-fields">
    <label class="qmx-dfd-field">Text<textarea data-object-prop="text">${esc(object.text)}</textarea></label>
    <div class="qmx-dfd-row">
        <label class="qmx-dfd-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-dfd-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-dfd-row">
        <label class="qmx-dfd-field">Font size<input type="number" min="8" max="96" data-object-prop="fontSize" value="${object.fontSize}"></label>
        <label class="qmx-dfd-field">Rotation<input type="number" data-object-prop="rotation" value="${object.rotation}"></label>
    </div>
    <label class="qmx-dfd-field">Text colour<input type="color" data-object-prop="textColor" value="${object.textColor}"></label>
    <label class="qmx-dfd-check"><input type="checkbox" data-object-prop="fontWeight"${object.fontWeight === 'bold' ? ' checked' : ''}> Bold</label>
</div>`;
            return;
        }

        const codeField = object.type === 'process'
            ? `<label class="qmx-dfd-field">Process number<input type="text" data-object-prop="number" value="${esc(object.number)}"></label>`
            : (object.type === 'data-store'
                ? `<label class="qmx-dfd-field">Store code<input type="text" data-object-prop="storeCode" value="${esc(object.storeCode)}"></label>`
                : '');

        state.controls.props.innerHTML = `
<div class="qmx-dfd-fields">
    <label class="qmx-dfd-field">Type
        <select data-object-prop="type">
            <option value="process"${object.type === 'process' ? ' selected' : ''}>Process</option>
            <option value="external-entity"${object.type === 'external-entity' ? ' selected' : ''}>External entity</option>
            <option value="data-store"${object.type === 'data-store' ? ' selected' : ''}>Data store</option>
        </select>
    </label>
    ${codeField}
    <label class="qmx-dfd-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <label class="qmx-dfd-field">Description<textarea data-object-prop="description">${esc(object.description)}</textarea></label>
    <div class="qmx-dfd-row">
        <label class="qmx-dfd-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-dfd-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-dfd-row">
        <label class="qmx-dfd-field">Width<input type="number" min="60" data-object-prop="width" value="${object.width.toFixed(1)}"></label>
        <label class="qmx-dfd-field">Height<input type="number" min="40" data-object-prop="height" value="${object.height.toFixed(1)}"></label>
    </div>
    <div class="qmx-dfd-row">
        <label class="qmx-dfd-field">Line colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-dfd-field">Fill colour<input type="color" data-object-prop="fill" value="${object.fill}"></label>
    </div>
    <div class="qmx-dfd-row">
        <label class="qmx-dfd-field">Line width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
        <label class="qmx-dfd-field">Fill opacity<input type="number" min="0" max="1" step=".05" data-object-prop="fillOpacity" value="${object.fillOpacity}"></label>
    </div>
    <label class="qmx-dfd-check"><input type="checkbox" data-object-prop="dash"${object.dash ? ' checked' : ''}> Dashed border</label>
</div>`;
    }

    function onPropertyInput(event) {
        const control = event.target.closest('[data-object-prop]');
        const object = selectedObject();
        if (!control || !object) return;

        const prop = control.dataset.objectProp;

        if (['dash', 'horizontalFirst'].includes(prop)) {
            object[prop] = control.checked;
        } else if (prop === 'fontWeight') {
            object.fontWeight = control.checked ? 'bold' : 'normal';
        } else if ([
            'type', 'number', 'storeCode', 'label', 'description',
            'stroke', 'fill', 'text', 'textColor', 'fromId',
            'toId', 'route'
        ].includes(prop)) {
            object[prop] = control.value;
        } else {
            object[prop] = Number(control.value);
        }

        if (object.type === 'data-flow' && object.fromId === object.toId) {
            const alternative = nodes().find((node) => node.id !== object.fromId);
            if (alternative) object.toId = alternative.id;
        }

        state.document = Diagram.normalizeSpec(state.document);
        render({ keepProperties: true });
    }

    function selectObject(id) {
        state.selectedId = id;
        render();
    }

    function createFlowFromClicks(nodeId) {
        if (!state.pendingFlowSourceId) {
            state.pendingFlowSourceId = nodeId;
            state.selectedId = nodeId;
            render();
            setStatus('Source selected. Click the destination node.');
            return;
        }

        if (state.pendingFlowSourceId === nodeId) {
            state.pendingFlowSourceId = null;
            render();
            setStatus('Flow creation cancelled.');
            return;
        }

        const flow = makeFlow(state.pendingFlowSourceId, nodeId);
        state.document.objects.unshift(flow);
        state.pendingFlowSourceId = null;
        state.selectedId = flow.id;
        pushHistory();
        setTool('select');
        render();
        setStatus('Data flow added.');
    }

    function onPointerDown(event) {
        if (!state.document || event.button !== 0) return;

        const point = pointFromEvent(event);
        state.pointer = point;

        const group = event.target.closest('[data-object-id]');
        const targetObject = group ? objectById(group.dataset.objectId) : null;

        if (state.activeTool === 'data-flow') {
            if (targetObject && ['process', 'external-entity', 'data-store'].includes(targetObject.type)) {
                createFlowFromClicks(targetObject.id);
            } else {
                setStatus('Click a process, external entity or data store.');
            }
            return;
        }

        if (['process', 'external-entity', 'data-store'].includes(state.activeTool)) {
            const object = makeNode(state.activeTool, snap(point.x), snap(point.y));
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus(`${object.label} added.`);
            return;
        }

        if (state.activeTool === 'text') {
            const object = makeText(snap(point.x), snap(point.y));
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Annotation added.');
            return;
        }

        if (state.activeTool !== 'select') return;

        const handle = event.target.closest('[data-handle]');

        if (handle && selectedObject() && ['process', 'external-entity', 'data-store'].includes(selectedObject().type)) {
            state.interaction = {
                type: handle.dataset.handle,
                pointerId: event.pointerId,
                start: point,
                original: clone(selectedObject())
            };
            state.svg.setPointerCapture(event.pointerId);
            event.preventDefault();
            return;
        }

        if (!targetObject) {
            selectObject(null);
            return;
        }

        if (targetObject.id !== state.selectedId) {
            selectObject(targetObject.id);
        }

        if (targetObject.type === 'data-flow') return;

        state.interaction = {
            type: 'move',
            pointerId: event.pointerId,
            start: point,
            original: clone(targetObject)
        };
        state.svg.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    function onPointerMove(event) {
        if (!state.document) return;

        state.pointer = pointFromEvent(event);

        if (state.activeTool === 'data-flow' && state.pendingFlowSourceId) {
            state.draftLayer.innerHTML = draftMarkup();
        }

        const interaction = state.interaction;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        const object = selectedObject();
        if (!object) return;

        const dx = state.pointer.x - interaction.start.x;
        const dy = state.pointer.y - interaction.start.y;

        if (interaction.type === 'move') {
            object.x = snap(interaction.original.x + dx);
            object.y = snap(interaction.original.y + dy);
        } else if (interaction.type === 'node-resize') {
            object.width = Math.max(60, snap(interaction.original.width + dx * 2));
            object.height = Math.max(40, snap(interaction.original.height + dy * 2));
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
        pushHistory();
        render();
    }

    function duplicateSelected() {
        const object = selectedObject();
        if (!object) return;

        const copy = clone(object);
        copy.id = uid(object.type);

        if (object.type === 'data-flow') {
            copy.label = `${copy.label} copy`;
            copy.labelOffsetY += 18;
        } else {
            copy.x += state.document.gridSize * 2;
            copy.y += state.document.gridSize * 2;

            if (copy.type === 'process') {
                copy.number = nextProcessNumber();
            } else if (copy.type === 'data-store') {
                copy.storeCode = `D${nodes().filter((node) => node.type === 'data-store').length + 1}`;
            }
        }

        state.document.objects.push(copy);
        state.selectedId = copy.id;
        pushHistory();
        render();
        setStatus('Object duplicated.');
    }

    function deleteSelected() {
        const object = selectedObject();
        if (!object) return;

        if (['process', 'external-entity', 'data-store'].includes(object.type)) {
            state.document.objects = state.document.objects.filter((item) =>
                item.id !== object.id &&
                !(item.type === 'data-flow' && (item.fromId === object.id || item.toId === object.id))
            );
        } else {
            state.document.objects = state.document.objects.filter((item) => item.id !== object.id);
        }

        state.pendingFlowSourceId = state.pendingFlowSourceId === object.id
            ? null
            : state.pendingFlowSourceId;
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Object deleted.');
    }

    function removeAllFlows() {
        if (!flows().length) return;
        if (!window.confirm('Remove all data flows?')) return;

        state.document.objects = state.document.objects.filter((object) => object.type !== 'data-flow');
        state.selectedId = null;
        state.pendingFlowSourceId = null;
        pushHistory();
        render();
        setStatus('All data flows removed.');
    }

    function addFlow(objects, from, to, label, route = 'orthogonal') {
        const flow = makeFlow(from.id, to.id);
        flow.label = label;
        flow.route = route;
        objects.unshift(flow);
        return flow;
    }

    function contextPreset() {
        const cx = state.document.width / 2;
        const cy = state.document.height / 2;

        const system = makeNode('process', cx, cy);
        system.number = '0';
        system.label = 'System';

        const customer = makeNode('external-entity', 160, cy - 120);
        customer.label = 'Customer';

        const admin = makeNode('external-entity', state.document.width - 160, cy - 120);
        admin.label = 'Administrator';

        const bank = makeNode('external-entity', cx, state.document.height - 100);
        bank.label = 'Payment Service';

        const objects = [system, customer, admin, bank];
        addFlow(objects, customer, system, 'Request');
        addFlow(objects, system, customer, 'Response');
        addFlow(objects, admin, system, 'Management data');
        addFlow(objects, system, bank, 'Payment request');
        addFlow(objects, bank, system, 'Payment status');

        state.document.objects = objects;
        state.selectedId = system.id;
        state.pendingFlowSourceId = null;
        pushHistory();
        render();
        setStatus('Context diagram preset inserted.');
    }

    function levelOnePreset() {
        const width = state.document.width;
        const height = state.document.height;

        const customer = makeNode('external-entity', 120, height / 2);
        customer.label = 'Customer';

        const process1 = makeNode('process', 340, 170);
        process1.number = '1.0';
        process1.label = 'Receive Request';

        const process2 = makeNode('process', 590, height / 2);
        process2.number = '2.0';
        process2.label = 'Process Data';

        const process3 = makeNode('process', 820, 170);
        process3.number = '3.0';
        process3.label = 'Produce Result';

        const store1 = makeNode('data-store', 350, height - 100);
        store1.storeCode = 'D1';
        store1.label = 'Requests';

        const store2 = makeNode('data-store', 760, height - 100);
        store2.storeCode = 'D2';
        store2.label = 'Records';

        const objects = [customer, process1, process2, process3, store1, store2];

        addFlow(objects, customer, process1, 'Request');
        addFlow(objects, process1, process2, 'Validated request');
        addFlow(objects, process1, store1, 'Save request');
        addFlow(objects, store1, process2, 'Request data');
        addFlow(objects, process2, store2, 'Update record');
        addFlow(objects, store2, process3, 'Record data');
        addFlow(objects, process2, process3, 'Processed data');
        addFlow(objects, process3, customer, 'Result');

        state.document.objects = objects;
        state.selectedId = process1.id;
        state.pendingFlowSourceId = null;
        pushHistory();
        render();
        setStatus('Level-1 DFD preset inserted.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Data-flow diagram?')) return;

        state.document = createDocument();
        state.selectedId = null;
        state.interaction = null;
        state.pendingFlowSourceId = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Data-flow diagram.');
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
        setStatus('Data-flow diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'data-flow-diagram')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'data-flow-diagram';
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

        if (state.document.mode !== 'data-flow') {
            state.document = createDocument();
        }

        state.selectedId = null;
        state.activeTool = 'select';
        state.interaction = null;
        state.pendingFlowSourceId = null;
        state.pointer = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();

        state.root.hidden = false;
        document.body.dataset.qmxDfdOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(context.initialSpec
            ? 'Existing Data-flow diagram loaded.'
            : 'Add DFD nodes or choose a preset.');

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;

        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxDfdOverflow || '';
        delete document.body.dataset.qmxDfdOverflow;
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

        if (spec.mode !== 'data-flow') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }

        open({
            tool: { id: 'data-flow' },
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
            'data-flow',
            'data-flow-diagram',
            'dfd',
            'dataflow',
            'dataflow-diagram',
            'data-flow-dfd'
        ].forEach((id) => {
            try {
                launcher.registerToolHandler(id, open);
                registered = true;
            } catch (error) {
                // Registries may expose only one canonical Data-flow tool id.
            }
        });

        return registered;
    }

    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;

        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        if (event.key === 'Escape') {
            if (state.pendingFlowSourceId) {
                state.pendingFlowSourceId = null;
                render();
                setStatus('Flow creation cancelled.');
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

    window.QmxDataFlowEditor = Object.freeze({
        version: '1.0.0',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
