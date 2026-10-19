(function (window, document) {
    'use strict';

    if (window.QmxCrossSectionEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Cross-section] Diagram renderer must load first.');
        return;
    }

    const TOOLS = [
        ['select', 'Select', 'নির্বাচন'],
        ['terrain', 'Terrain Profile', 'ভূ-প্রকৃতি'],
        ['layer', 'Geological Layer', 'শিলা স্তর'],
        ['river', 'River / Channel', 'নদী / খাল'],
        ['water', 'Water / Sea', 'জল / সমুদ্র'],
        ['fault', 'Fault', 'চ্যুতি'],
        ['dimension', 'Dimension', 'মাত্রা'],
        ['text', 'Annotation', 'টীকা']
    ];

    const HATCHES = [
        ['solid', 'Solid'],
        ['diagonal', 'Diagonal'],
        ['cross', 'Cross hatch'],
        ['dots', 'Dots']
    ];

    const COLOURS = [
        '#c2410c', '#d97706', '#65a30d', '#0891b2',
        '#7c3aed', '#dc2626', '#475569'
    ];

    const state = {
        root: null,
        svg: null,
        gridLayer: null,
        layerLayer: null,
        terrainLayer: null,
        featureLayer: null,
        textLayer: null,
        selectionLayer: null,
        context: null,
        document: null,
        activeTool: 'select',
        selectedId: null,
        interaction: null,
        history: [],
        historyIndex: -1,
        controls: {}
    };

    function uid(prefix = 'xsec') {
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
            version: 10,
            id: uid('cross-section'),
            mode: 'cross-section',
            title: 'Cross-section / Profile Diagram',
            width: 1000,
            height: 600,
            background: '#ffffff',
            gridSize: 20,
            showGrid: true,
            snapToGrid: true,
            showAxes: true,
            showSeaLevel: false,
            seaLevelY: 350,
            horizontalLabel: 'Distance',
            verticalLabel: 'Elevation',
            verticalExaggeration: 1,
            objects: []
        };
    }

    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
    }

    function objectsByType(type) {
        return state.document.objects.filter((object) => object.type === type);
    }

    function pointFromEvent(event) {
        const point = state.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        const local = matrix ? point.matrixTransform(matrix.inverse()) : point;
        return { x: local.x, y: local.y };
    }

    function defaultTerrainPoints(x, y) {
        return [
            { x: x - 280, y: y + 70 },
            { x: x - 190, y: y + 15 },
            { x: x - 105, y: y + 45 },
            { x: x - 20, y: y - 35 },
            { x: x + 70, y: y - 5 },
            { x: x + 165, y: y + 55 },
            { x: x + 280, y: y + 25 }
        ];
    }

    function makeTerrain(x, y) {
        const index = objectsByType('terrain').length;
        return {
            id: uid('terrain'),
            type: 'terrain',
            points: defaultTerrainPoints(x, y),
            baselineY: Math.min(state.document.height - 55, y + 210),
            label: index ? `Profile ${index + 1}` : 'Terrain profile',
            stroke: '#334155',
            fill: '#d6d3d1',
            fillOpacity: 0.28,
            strokeWidth: 4,
            hatch: 'solid',
            smooth: false,
            opacity: 1
        };
    }

    function makeLayer(x, y) {
        const count = objectsByType('layer').length;
        const colour = COLOURS[count % COLOURS.length];

        return {
            id: uid('layer'),
            type: 'layer',
            label: `Layer ${count + 1}`,
            points: [
                { x: x - 260, y: y - 55 },
                { x: x - 90, y: y - 25 },
                { x: x + 85, y: y - 45 },
                { x: x + 260, y: y - 10 },
                { x: x + 260, y: y + 85 },
                { x: x + 85, y: y + 60 },
                { x: x - 90, y: y + 80 },
                { x: x - 260, y: y + 45 }
            ],
            stroke: colour,
            fill: colour,
            fillOpacity: 0.34,
            strokeWidth: 2.5,
            hatch: count % 2 ? 'diagonal' : 'solid',
            opacity: 1
        };
    }

    function makeRiver(x, y) {
        return {
            id: uid('river'),
            type: 'river',
            x,
            y,
            width: 150,
            depth: 70,
            waterDepth: 35,
            label: 'River',
            stroke: '#0369a1',
            fill: '#38bdf8',
            fillOpacity: 0.72,
            strokeWidth: 3,
            opacity: 1
        };
    }

    function makeWater(x, y) {
        return {
            id: uid('water'),
            type: 'water',
            x,
            y,
            width: 260,
            height: 135,
            label: 'Sea',
            stroke: '#0284c7',
            fill: '#7dd3fc',
            fillOpacity: 0.55,
            strokeWidth: 2.5,
            hatch: 'solid',
            opacity: 1
        };
    }

    function makeFault(x, y) {
        return {
            id: uid('fault'),
            type: 'fault',
            x1: x - 80,
            y1: y - 160,
            x2: x + 80,
            y2: y + 160,
            label: 'Fault',
            stroke: '#dc2626',
            strokeWidth: 4,
            dash: true,
            showArrows: true,
            opacity: 1
        };
    }

    function makeDimension(x, y) {
        return {
            id: uid('dimension'),
            type: 'dimension',
            x1: x - 130,
            y1: y,
            x2: x + 130,
            y2: y,
            label: '260 m',
            offset: -22,
            stroke: '#0f172a',
            strokeWidth: 2,
            opacity: 1
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
        if (document.getElementById('qmx-cross-section-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-cross-section-editor-styles';
        style.textContent = `
.qmx-xsec-editor[hidden]{display:none!important}
.qmx-xsec-editor{position:fixed;inset:0;z-index:10260;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.7);backdrop-filter:blur(2px)}
.qmx-xsec-dialog{width:min(1560px,100%);height:min(96vh,980px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.38)}
.qmx-xsec-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-xsec-title{margin-right:auto}.qmx-xsec-title strong{display:block}.qmx-xsec-title span{display:block;color:#64748b;font-size:11px}
.qmx-xsec-btn,.qmx-xsec-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-xsec-btn:hover,.qmx-xsec-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-xsec-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-xsec-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-xsec-btn.is-danger{color:#b91c1c}.qmx-xsec-close{font-size:20px;line-height:1}
.qmx-xsec-workspace{min-height:0;flex:1;display:grid;grid-template-columns:225px minmax(0,1fr) 310px;gap:10px;padding:10px}
.qmx-xsec-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-xsec-panel h3{margin:0 0 8px;font-size:13px}.qmx-xsec-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-xsec-tool{min-height:58px;padding:6px 5px;font-size:10px}.qmx-xsec-tool span{display:block;margin-top:2px;color:#64748b;font-size:9px;font-weight:500}
.qmx-xsec-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-xsec-quick{display:grid;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0}
.qmx-xsec-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-xsec-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-xsec-stage{display:block;width:min(100%,1180px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none;user-select:none}
.qmx-xsec-object{cursor:move}.qmx-xsec-hit{fill:transparent;stroke:transparent;stroke-width:20;pointer-events:all}
.qmx-xsec-select{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-xsec-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair;pointer-events:all}
.qmx-xsec-fields{display:grid;gap:9px}.qmx-xsec-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-xsec-field input,.qmx-xsec-field textarea,.qmx-xsec-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-xsec-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-xsec-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-xsec-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-xsec-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-xsec-summary{margin-top:10px;padding:9px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.55}
.qmx-xsec-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-xsec-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-xsec-footer .qmx-xsec-btn:first-of-type{margin-left:auto}
@media(max-width:1050px){.qmx-xsec-workspace{grid-template-columns:185px minmax(0,1fr) 255px}.qmx-xsec-tools{grid-template-columns:1fr}}
@media(max-width:760px){.qmx-xsec-editor{padding:0}.qmx-xsec-dialog{width:100%;height:100%;border-radius:0}.qmx-xsec-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(350px,1fr) auto;overflow:auto}.qmx-xsec-panel{overflow:visible}.qmx-xsec-tools{grid-template-columns:repeat(2,1fr)}.qmx-xsec-header{overflow-x:auto}.qmx-xsec-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-xsec-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-xsec-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-xsec-title">
<header class="qmx-xsec-header">
    <div class="qmx-xsec-title">
        <strong id="qmx-xsec-title">Cross-section / Profile Diagram</strong>
        <span>Terrain profiles, geological layers, rivers, coasts, faults and dimensions</span>
    </div>
    <button type="button" class="qmx-xsec-btn" data-xsec-new>New</button>
    <button type="button" class="qmx-xsec-btn" data-xsec-undo>Undo</button>
    <button type="button" class="qmx-xsec-btn" data-xsec-redo>Redo</button>
    <button type="button" class="qmx-xsec-btn" data-xsec-duplicate>Duplicate</button>
    <button type="button" class="qmx-xsec-btn is-danger" data-xsec-delete>Delete</button>
    <button type="button" class="qmx-xsec-btn qmx-xsec-close" data-xsec-close aria-label="Close">×</button>
</header>
<div class="qmx-xsec-workspace">
    <aside class="qmx-xsec-panel">
        <h3>Profile tools</h3>
        <div class="qmx-xsec-tools" data-xsec-tools></div>
        <div class="qmx-xsec-quick">
            <button type="button" class="qmx-xsec-btn" data-xsec-terrain-preset>Terrain profile</button>
            <button type="button" class="qmx-xsec-btn" data-xsec-geology-preset>Geological section</button>
            <button type="button" class="qmx-xsec-btn" data-xsec-river-preset>River valley</button>
            <button type="button" class="qmx-xsec-btn" data-xsec-coast-preset>Coastal section</button>
        </div>
        <p class="qmx-xsec-help">
            Select a terrain or layer to edit individual vertices. Drag ordinary objects to reposition them.
            Geological fills support solid, diagonal, cross-hatch and dot patterns.
        </p>
    </aside>
    <main class="qmx-xsec-stage-wrap">
        <svg class="qmx-xsec-stage" data-xsec-svg viewBox="0 0 1000 600" tabindex="0" aria-label="Cross-section and profile canvas">
            <defs>
                <marker id="qmx-xsec-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke"></path>
                </marker>
            </defs>
            <rect data-xsec-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-xsec-grid-layer></g>
            <g data-xsec-layer-layer></g>
            <g data-xsec-terrain-layer></g>
            <g data-xsec-feature-layer></g>
            <g data-xsec-text-layer></g>
            <g data-xsec-selection-layer></g>
        </svg>
    </main>
    <aside class="qmx-xsec-panel">
        <h3>Document</h3>
        <div class="qmx-xsec-fields">
            <label class="qmx-xsec-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-xsec-row">
                <label class="qmx-xsec-field">Width<input type="number" min="320" max="2400" data-doc-prop="width"></label>
                <label class="qmx-xsec-field">Height<input type="number" min="220" max="1800" data-doc-prop="height"></label>
            </div>
            <div class="qmx-xsec-row">
                <label class="qmx-xsec-field">Grid size<input type="number" min="5" max="100" data-doc-prop="gridSize"></label>
                <label class="qmx-xsec-field">Background<input type="color" data-doc-prop="background"></label>
            </div>
            <div class="qmx-xsec-row">
                <label class="qmx-xsec-field">Horizontal label<input type="text" data-doc-prop="horizontalLabel"></label>
                <label class="qmx-xsec-field">Vertical label<input type="text" data-doc-prop="verticalLabel"></label>
            </div>
            <label class="qmx-xsec-field">Vertical exaggeration<input type="number" min=".1" max="100" step=".1" data-doc-prop="verticalExaggeration"></label>
            <label class="qmx-xsec-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label>
            <label class="qmx-xsec-check"><input type="checkbox" data-doc-prop="snapToGrid"> Snap to grid</label>
            <label class="qmx-xsec-check"><input type="checkbox" data-doc-prop="showAxes"> Show profile axes and labels</label>
            <label class="qmx-xsec-check"><input type="checkbox" data-doc-prop="showSeaLevel"> Show sea-level line</label>
            <label class="qmx-xsec-field">Sea-level Y<input type="number" data-doc-prop="seaLevelY"></label>
        </div>
        <hr class="qmx-xsec-divider">
        <h3>Selected object</h3>
        <div data-xsec-properties></div>
        <div class="qmx-xsec-summary" data-xsec-summary></div>
    </aside>
</div>
<footer class="qmx-xsec-footer">
    <span class="qmx-xsec-status" data-xsec-status aria-live="polite"></span>
    <button type="button" class="qmx-xsec-btn" data-xsec-export-svg>Export SVG</button>
    <button type="button" class="qmx-xsec-btn" data-xsec-export-png>Export PNG</button>
    <button type="button" class="qmx-xsec-btn is-primary" data-xsec-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.svg = root.querySelector('[data-xsec-svg]');
        state.gridLayer = root.querySelector('[data-xsec-grid-layer]');
        state.layerLayer = root.querySelector('[data-xsec-layer-layer]');
        state.terrainLayer = root.querySelector('[data-xsec-terrain-layer]');
        state.featureLayer = root.querySelector('[data-xsec-feature-layer]');
        state.textLayer = root.querySelector('[data-xsec-text-layer]');
        state.selectionLayer = root.querySelector('[data-xsec-selection-layer]');
        state.controls = {
            bg: root.querySelector('[data-xsec-bg]'),
            tools: root.querySelector('[data-xsec-tools]'),
            props: root.querySelector('[data-xsec-properties]'),
            summary: root.querySelector('[data-xsec-summary]'),
            status: root.querySelector('[data-xsec-status]'),
            undo: root.querySelector('[data-xsec-undo]'),
            redo: root.querySelector('[data-xsec-redo]')
        };

        TOOLS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-xsec-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        state.controls.tools.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (button) setTool(button.dataset.tool);
        });

        root.querySelector('[data-xsec-close]').addEventListener('click', close);
        root.querySelector('[data-xsec-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-xsec-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-xsec-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-xsec-terrain-preset]').addEventListener('click', terrainPreset);
        root.querySelector('[data-xsec-geology-preset]').addEventListener('click', geologyPreset);
        root.querySelector('[data-xsec-river-preset]').addEventListener('click', riverPreset);
        root.querySelector('[data-xsec-coast-preset]').addEventListener('click', coastPreset);
        root.querySelector('[data-xsec-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-xsec-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-xsec-insert]').addEventListener('click', insertIntoQuestion);

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
        state.controls.tools.querySelectorAll('[data-tool]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tool === state.activeTool);
        });

        setStatus(state.activeTool === 'select'
            ? 'Select, drag or edit vertices.'
            : `Click the canvas to add ${TOOLS.find(([id]) => id === state.activeTool)?.[1] || 'object'}.`);
    }

    function onDocumentInput(event) {
        const control = event.currentTarget;
        const prop = control.dataset.docProp;
        if (!prop || !state.document) return;

        if (['showGrid', 'snapToGrid', 'showAxes', 'showSeaLevel'].includes(prop)) {
            state.document[prop] = control.checked;
        } else if (['width', 'height', 'gridSize', 'seaLevelY', 'verticalExaggeration'].includes(prop)) {
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

    function patternId(object) {
        return `qmx-xsec-pattern-${String(object.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
    }

    function patternDef(object) {
        if (!object.hatch || object.hatch === 'solid') return '';

        const id = patternId(object);
        const fill = esc(object.fill);
        const opacity = object.fillOpacity;

        if (object.hatch === 'dots') {
            return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${fill}" fill-opacity="${opacity * 0.45}"/><circle cx="4" cy="4" r="2" fill="${fill}" fill-opacity="${Math.min(1, opacity + 0.3)}"/></pattern>`;
        }

        if (object.hatch === 'cross') {
            return `<pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${fill}" fill-opacity="${opacity * 0.4}"/><path d="M0 0 L16 16 M16 0 L0 16" stroke="${fill}" stroke-opacity="${Math.min(1, opacity + 0.25)}" stroke-width="2"/></pattern>`;
        }

        return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><rect width="14" height="14" fill="${fill}" fill-opacity="${opacity * 0.4}"/><line x1="0" y1="0" x2="0" y2="14" stroke="${fill}" stroke-opacity="${Math.min(1, opacity + 0.3)}" stroke-width="3"/></pattern>`;
    }

    function fillValue(object) {
        return object.hatch && object.hatch !== 'solid'
            ? `url(#${patternId(object)})`
            : object.fill;
    }

    function pointsString(points) {
        return points.map((point) => `${point.x},${point.y}`).join(' ');
    }

    function smoothPath(points) {
        if (!points.length) return '';
        if (points.length < 3) {
            return `M ${points[0].x} ${points[0].y} ` +
                points.slice(1).map((point) => `L ${point.x} ${point.y}`).join(' ');
        }

        let path = `M ${points[0].x} ${points[0].y}`;
        for (let index = 0; index < points.length - 1; index += 1) {
            const current = points[index];
            const next = points[index + 1];
            const midX = (current.x + next.x) / 2;
            const midY = (current.y + next.y) / 2;
            path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
        }
        const last = points[points.length - 1];
        path += ` T ${last.x} ${last.y}`;
        return path;
    }

    function gridMarkup() {
        const pieces = [];

        if (state.document.showGrid) {
            const size = state.document.gridSize;
            pieces.push(`<defs><pattern id="qmx-xsec-grid-live" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${state.document.width}" height="${state.document.height}" fill="url(#qmx-xsec-grid-live)" pointer-events="none"/>`);
        }

        if (state.document.showSeaLevel) {
            pieces.push(`<line x1="40" y1="${state.document.seaLevelY}" x2="${state.document.width - 40}" y2="${state.document.seaLevelY}" stroke="#0284c7" stroke-width="2" stroke-dasharray="9 6" vector-effect="non-scaling-stroke"/><text x="${state.document.width - 50}" y="${state.document.seaLevelY - 8}" fill="#0369a1" font-size="12" text-anchor="end">Sea level</text>`);
        }

        if (state.document.showAxes) {
            const bottom = state.document.height - 35;
            pieces.push(`<line x1="45" y1="${bottom}" x2="${state.document.width - 35}" y2="${bottom}" stroke="#64748b" stroke-width="1.5" marker-end="url(#qmx-xsec-arrow)" vector-effect="non-scaling-stroke"/><line x1="45" y1="${bottom}" x2="45" y2="35" stroke="#64748b" stroke-width="1.5" marker-end="url(#qmx-xsec-arrow)" vector-effect="non-scaling-stroke"/><text x="${state.document.width / 2}" y="${state.document.height - 8}" fill="#475569" font-size="13" font-weight="700" text-anchor="middle">${esc(state.document.horizontalLabel)}</text><text x="16" y="${state.document.height / 2}" fill="#475569" font-size="13" font-weight="700" text-anchor="middle" transform="rotate(-90 16 ${state.document.height / 2})">${esc(state.document.verticalLabel)}</text><text x="${state.document.width - 45}" y="30" fill="#64748b" font-size="11" text-anchor="end">VE ×${state.document.verticalExaggeration}</text>`);
        }

        return pieces.join('');
    }

    function layerMarkup(object) {
        return `
<g class="qmx-xsec-object" data-object-id="${esc(object.id)}">
    <defs>${patternDef(object)}</defs>
    <polygon points="${pointsString(object.points)}" fill="${fillValue(object)}" fill-opacity="${object.hatch === 'solid' ? object.fillOpacity : 1}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <text x="${object.points.reduce((sum, point) => sum + point.x, 0) / object.points.length}" y="${object.points.reduce((sum, point) => sum + point.y, 0) / object.points.length}" fill="${esc(object.stroke)}" font-size="15" font-weight="700" text-anchor="middle">${esc(object.label)}</text>
    <polygon class="qmx-xsec-hit" points="${pointsString(object.points)}"/>
</g>`;
    }

    function terrainMarkup(object) {
        const first = object.points[0];
        const last = object.points[object.points.length - 1];
        const linePath = object.smooth
            ? smoothPath(object.points)
            : `M ${object.points.map((point) => `${point.x} ${point.y}`).join(' L ')}`;
        const fillPath = `${linePath} L ${last.x} ${object.baselineY} L ${first.x} ${object.baselineY} Z`;
        const labelPoint = object.points[Math.floor(object.points.length / 2)];

        return `
<g class="qmx-xsec-object" data-object-id="${esc(object.id)}">
    <defs>${patternDef(object)}</defs>
    <path d="${fillPath}" fill="${fillValue(object)}" fill-opacity="${object.hatch === 'solid' ? object.fillOpacity : 1}" stroke="none" opacity="${object.opacity}"/>
    <path d="${linePath}" fill="none" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <text x="${labelPoint.x}" y="${labelPoint.y - 16}" fill="${esc(object.stroke)}" font-size="14" font-weight="700" text-anchor="middle">${esc(object.label)}</text>
    <path class="qmx-xsec-hit" d="${linePath}" fill="none"/>
</g>`;
    }

    function riverMarkup(object) {
        const left = object.x - object.width / 2;
        const right = object.x + object.width / 2;
        const bottom = object.y + object.depth;
        const waterY = object.y + Math.max(8, object.depth - object.waterDepth);
        const waterLeft = object.x - object.width * 0.28;
        const waterRight = object.x + object.width * 0.28;
        const channel = `M ${left} ${object.y} Q ${object.x - object.width * 0.18} ${bottom} ${object.x} ${bottom} Q ${object.x + object.width * 0.18} ${bottom} ${right} ${object.y}`;
        const water = `M ${waterLeft} ${waterY} Q ${object.x} ${bottom + 4} ${waterRight} ${waterY} Z`;

        return `
<g class="qmx-xsec-object" data-object-id="${esc(object.id)}">
    <path d="${channel}" fill="none" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>
    <path d="${water}" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.stroke)}" stroke-width="${Math.max(1, object.strokeWidth - 1)}" opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>
    <text x="${object.x}" y="${object.y - 12}" fill="${esc(object.stroke)}" font-size="14" font-weight="700" text-anchor="middle">${esc(object.label)}</text>
    <rect class="qmx-xsec-hit" x="${left}" y="${object.y - 20}" width="${object.width}" height="${object.depth + 40}"/>
</g>`;
    }

    function waterMarkup(object) {
        const left = object.x - object.width / 2;
        const top = object.y - object.height / 2;

        return `
<g class="qmx-xsec-object" data-object-id="${esc(object.id)}">
    <defs>${patternDef(object)}</defs>
    <rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" fill="${fillValue(object)}" fill-opacity="${object.hatch === 'solid' ? object.fillOpacity : 1}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>
    <path d="M ${left} ${top + 12} q 20 -12 40 0 t 40 0 t 40 0 t 40 0 t 40 0" fill="none" stroke="${esc(object.stroke)}" stroke-width="2" opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>
    <text x="${object.x}" y="${object.y}" fill="${esc(object.stroke)}" font-size="15" font-weight="700" text-anchor="middle">${esc(object.label)}</text>
    <rect class="qmx-xsec-hit" x="${left}" y="${top}" width="${object.width}" height="${object.height}"/>
</g>`;
    }

    function faultMarkup(object) {
        const midX = (object.x1 + object.x2) / 2;
        const midY = (object.y1 + object.y2) / 2;
        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const arrows = object.showArrows
            ? `<path d="M ${midX - 18} ${midY - 18} l 12 -12 M ${midX + 18} ${midY + 18} l -12 12" fill="none" stroke="${esc(object.stroke)}" stroke-width="2" marker-end="url(#qmx-xsec-arrow)" vector-effect="non-scaling-stroke"/>`
            : '';

        return `
<g class="qmx-xsec-object" data-object-id="${esc(object.id)}">
    <line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>
    ${arrows}
    <text x="${midX + 16}" y="${midY - 8}" fill="${esc(object.stroke)}" font-size="14" font-weight="700">${esc(object.label)}</text>
    <line class="qmx-xsec-hit" x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}"/>
</g>`;
    }

    function dimensionMarkup(object) {
        const midX = (object.x1 + object.x2) / 2;
        const midY = (object.y1 + object.y2) / 2;
        const dx = object.x2 - object.x1;
        const dy = object.y2 - object.y1;
        const length = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / length;
        const ny = dx / length;
        const labelX = midX + nx * object.offset;
        const labelY = midY + ny * object.offset;

        return `
<g class="qmx-xsec-object" data-object-id="${esc(object.id)}">
    <line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" marker-start="url(#qmx-xsec-arrow)" marker-end="url(#qmx-xsec-arrow)" opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>
    <rect x="${labelX - Math.max(28, object.label.length * 3.5)}" y="${labelY - 14}" width="${Math.max(56, object.label.length * 7)}" height="22" rx="5" fill="#ffffff" fill-opacity=".9"/>
    <text x="${labelX}" y="${labelY + 2}" fill="${esc(object.stroke)}" font-size="13" font-weight="700" text-anchor="middle">${esc(object.label)}</text>
    <line class="qmx-xsec-hit" x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}"/>
</g>`;
    }

    function textMarkup(object) {
        return `
<g class="qmx-xsec-object" data-object-id="${esc(object.id)}">
    <text x="${object.x}" y="${object.y}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})">${esc(object.text)}</text>
    <rect class="qmx-xsec-hit" x="${object.x - 75}" y="${object.y - 35}" width="150" height="70"/>
</g>`;
    }

    function featureMarkup(object) {
        if (object.type === 'river') return riverMarkup(object);
        if (object.type === 'water') return waterMarkup(object);
        if (object.type === 'fault') return faultMarkup(object);
        if (object.type === 'dimension') return dimensionMarkup(object);
        return '';
    }

    function selectionMarkup() {
        const object = selectedObject();
        if (!object) return '';

        if (['terrain', 'layer'].includes(object.type)) {
            const handles = object.points.map((point, index) =>
                `<circle class="qmx-xsec-handle" data-handle="vertex" data-point-index="${index}" cx="${point.x}" cy="${point.y}" r="7"/>`
            ).join('');

            const minX = Math.min(...object.points.map((point) => point.x));
            const maxX = Math.max(...object.points.map((point) => point.x));
            const minY = Math.min(...object.points.map((point) => point.y));
            const maxY = Math.max(...object.points.map((point) => point.y));

            return `<rect class="qmx-xsec-select" x="${minX - 8}" y="${minY - 8}" width="${maxX - minX + 16}" height="${maxY - minY + 16}"/>${handles}`;
        }

        if (['fault', 'dimension'].includes(object.type)) {
            return `
<line class="qmx-xsec-select" x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}"/>
<circle class="qmx-xsec-handle" data-handle="endpoint-1" cx="${object.x1}" cy="${object.y1}" r="7"/>
<circle class="qmx-xsec-handle" data-handle="endpoint-2" cx="${object.x2}" cy="${object.y2}" r="7"/>`;
        }

        if (object.type === 'text') {
            return `<rect class="qmx-xsec-select" x="${object.x - 80}" y="${object.y - 40}" width="160" height="80"/>`;
        }

        const width = object.width;
        const height = object.type === 'river' ? object.depth : object.height;
        const left = object.x - width / 2;
        const top = object.type === 'river' ? object.y : object.y - height / 2;

        return `
<rect class="qmx-xsec-select" x="${left - 7}" y="${top - 7}" width="${width + 14}" height="${height + 14}"/>
<circle class="qmx-xsec-handle" data-handle="box-resize" cx="${left + width}" cy="${top + height}" r="7"/>`;
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;

        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        state.gridLayer.innerHTML = gridMarkup();
        state.layerLayer.innerHTML = objectsByType('layer').map(layerMarkup).join('');
        state.terrainLayer.innerHTML = objectsByType('terrain').map(terrainMarkup).join('');
        state.featureLayer.innerHTML = state.document.objects
            .filter((object) => ['river', 'water', 'fault', 'dimension'].includes(object.type))
            .map(featureMarkup)
            .join('');
        state.textLayer.innerHTML = objectsByType('text').map(textMarkup).join('');
        state.selectionLayer.innerHTML = selectionMarkup();

        if (!options.keepProperties) renderProperties();
        renderSummary();
        updateHistoryButtons();
    }

    function renderSummary() {
        state.controls.summary.textContent =
            `${objectsByType('terrain').length} profile(s) · ` +
            `${objectsByType('layer').length} geological layer(s) · ` +
            `${objectsByType('river').length} river/channel(s) · ` +
            `${objectsByType('water').length} water body(ies) · ` +
            `${objectsByType('fault').length} fault(s)`;
    }

    function hatchOptions(value) {
        return HATCHES.map(([id, label]) =>
            `<option value="${id}"${value === id ? ' selected' : ''}>${esc(label)}</option>`
        ).join('');
    }

    function renderProperties() {
        const object = selectedObject();

        if (!object) {
            state.controls.props.innerHTML = `<div class="qmx-xsec-empty">Select a profile object or vertex.</div>`;
            return;
        }

        if (object.type === 'text') {
            state.controls.props.innerHTML = `
<div class="qmx-xsec-fields">
    <label class="qmx-xsec-field">Text<textarea data-object-prop="text">${esc(object.text)}</textarea></label>
    <div class="qmx-xsec-row">
        <label class="qmx-xsec-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-xsec-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-xsec-row">
        <label class="qmx-xsec-field">Font size<input type="number" min="8" max="96" data-object-prop="fontSize" value="${object.fontSize}"></label>
        <label class="qmx-xsec-field">Rotation<input type="number" data-object-prop="rotation" value="${object.rotation}"></label>
    </div>
    <label class="qmx-xsec-field">Text colour<input type="color" data-object-prop="textColor" value="${object.textColor}"></label>
    <label class="qmx-xsec-check"><input type="checkbox" data-object-prop="fontWeight"${object.fontWeight === 'bold' ? ' checked' : ''}> Bold</label>
</div>`;
            return;
        }

        if (['fault', 'dimension'].includes(object.type)) {
            state.controls.props.innerHTML = `
<div class="qmx-xsec-fields">
    <label class="qmx-xsec-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-xsec-row">
        <label class="qmx-xsec-field">X1<input type="number" data-object-prop="x1" value="${object.x1.toFixed(1)}"></label>
        <label class="qmx-xsec-field">Y1<input type="number" data-object-prop="y1" value="${object.y1.toFixed(1)}"></label>
    </div>
    <div class="qmx-xsec-row">
        <label class="qmx-xsec-field">X2<input type="number" data-object-prop="x2" value="${object.x2.toFixed(1)}"></label>
        <label class="qmx-xsec-field">Y2<input type="number" data-object-prop="y2" value="${object.y2.toFixed(1)}"></label>
    </div>
    <div class="qmx-xsec-row">
        <label class="qmx-xsec-field">Colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-xsec-field">Width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
    </div>
    ${object.type === 'fault'
        ? `<label class="qmx-xsec-check"><input type="checkbox" data-object-prop="dash"${object.dash ? ' checked' : ''}> Dashed fault</label><label class="qmx-xsec-check"><input type="checkbox" data-object-prop="showArrows"${object.showArrows ? ' checked' : ''}> Show movement arrows</label>`
        : `<label class="qmx-xsec-field">Label offset<input type="number" data-object-prop="offset" value="${object.offset}"></label>`}
</div>`;
            return;
        }

        if (['terrain', 'layer'].includes(object.type)) {
            state.controls.props.innerHTML = `
<div class="qmx-xsec-fields">
    <label class="qmx-xsec-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-xsec-row">
        <label class="qmx-xsec-field">Line colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-xsec-field">Fill colour<input type="color" data-object-prop="fill" value="${object.fill}"></label>
    </div>
    <div class="qmx-xsec-row">
        <label class="qmx-xsec-field">Line width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
        <label class="qmx-xsec-field">Fill opacity<input type="number" min="0" max="1" step=".05" data-object-prop="fillOpacity" value="${object.fillOpacity}"></label>
    </div>
    <label class="qmx-xsec-field">Shading<select data-object-prop="hatch">${hatchOptions(object.hatch)}</select></label>
    ${object.type === 'terrain'
        ? `<label class="qmx-xsec-field">Fill baseline Y<input type="number" data-object-prop="baselineY" value="${object.baselineY}"></label><label class="qmx-xsec-check"><input type="checkbox" data-object-prop="smooth"${object.smooth ? ' checked' : ''}> Smooth profile line</label>`
        : ''}
    <div class="qmx-xsec-summary">${object.points.length} editable vertices. Drag the blue handles on the canvas.</div>
</div>`;
            return;
        }

        state.controls.props.innerHTML = `
<div class="qmx-xsec-fields">
    <label class="qmx-xsec-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-xsec-row">
        <label class="qmx-xsec-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-xsec-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-xsec-row">
        <label class="qmx-xsec-field">Width<input type="number" min="20" data-object-prop="width" value="${object.width.toFixed(1)}"></label>
        <label class="qmx-xsec-field">${object.type === 'river' ? 'Depth' : 'Height'}<input type="number" min="10" data-object-prop="${object.type === 'river' ? 'depth' : 'height'}" value="${object.type === 'river' ? object.depth : object.height}"></label>
    </div>
    ${object.type === 'river'
        ? `<label class="qmx-xsec-field">Water depth<input type="number" min="2" data-object-prop="waterDepth" value="${object.waterDepth}"></label>`
        : `<label class="qmx-xsec-field">Shading<select data-object-prop="hatch">${hatchOptions(object.hatch)}</select></label>`}
    <div class="qmx-xsec-row">
        <label class="qmx-xsec-field">Line colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-xsec-field">Fill colour<input type="color" data-object-prop="fill" value="${object.fill}"></label>
    </div>
    <div class="qmx-xsec-row">
        <label class="qmx-xsec-field">Line width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
        <label class="qmx-xsec-field">Fill opacity<input type="number" min="0" max="1" step=".05" data-object-prop="fillOpacity" value="${object.fillOpacity}"></label>
    </div>
</div>`;
    }

    function onPropertyInput(event) {
        const control = event.target.closest('[data-object-prop]');
        const object = selectedObject();
        if (!control || !object) return;

        const prop = control.dataset.objectProp;

        if (['dash', 'showArrows', 'smooth'].includes(prop)) {
            object[prop] = control.checked;
        } else if (prop === 'fontWeight') {
            object.fontWeight = control.checked ? 'bold' : 'normal';
        } else if ([
            'label', 'stroke', 'fill', 'hatch', 'text', 'textColor'
        ].includes(prop)) {
            object[prop] = control.value;
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

    function objectCenter(object) {
        if (object.points?.length) {
            return {
                x: object.points.reduce((sum, point) => sum + point.x, 0) / object.points.length,
                y: object.points.reduce((sum, point) => sum + point.y, 0) / object.points.length
            };
        }

        if (['fault', 'dimension'].includes(object.type)) {
            return {
                x: (object.x1 + object.x2) / 2,
                y: (object.y1 + object.y2) / 2
            };
        }

        return { x: object.x, y: object.y };
    }

    function onPointerDown(event) {
        if (!state.document || event.button !== 0) return;

        const point = pointFromEvent(event);

        if (state.activeTool !== 'select') {
            let object = null;
            const x = snap(point.x);
            const y = snap(point.y);

            if (state.activeTool === 'terrain') object = makeTerrain(x, y);
            if (state.activeTool === 'layer') object = makeLayer(x, y);
            if (state.activeTool === 'river') object = makeRiver(x, y);
            if (state.activeTool === 'water') object = makeWater(x, y);
            if (state.activeTool === 'fault') object = makeFault(x, y);
            if (state.activeTool === 'dimension') object = makeDimension(x, y);
            if (state.activeTool === 'text') object = makeText(x, y);

            if (object) {
                state.document.objects.push(object);
                state.selectedId = object.id;
                pushHistory();
                setTool('select');
                render();
                setStatus(`${object.label || object.type} added.`);
            }
            return;
        }

        const handle = event.target.closest('[data-handle]');
        const group = event.target.closest('[data-object-id]');
        const target = group
            ? state.document.objects.find((object) => object.id === group.dataset.objectId)
            : null;

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
        if (object.points?.length) {
            object.points = original.points.map((point) => ({
                x: snap(point.x + dx),
                y: snap(point.y + dy)
            }));

            if (object.type === 'terrain') {
                object.baselineY = snap(original.baselineY + dy);
            }
            return;
        }

        if (['fault', 'dimension'].includes(object.type)) {
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

        const object = selectedObject();
        if (!object) return;

        const point = pointFromEvent(event);
        const dx = point.x - interaction.start.x;
        const dy = point.y - interaction.start.y;

        if (interaction.type === 'move') {
            moveObject(object, interaction.original, dx, dy);
        } else if (interaction.type === 'vertex' && object.points?.[interaction.pointIndex]) {
            object.points[interaction.pointIndex] = {
                x: snap(point.x),
                y: snap(point.y)
            };
        } else if (interaction.type === 'endpoint-1') {
            object.x1 = snap(point.x);
            object.y1 = snap(point.y);
        } else if (interaction.type === 'endpoint-2') {
            object.x2 = snap(point.x);
            object.y2 = snap(point.y);
        } else if (interaction.type === 'box-resize') {
            const original = interaction.original;
            object.width = Math.max(20, snap(original.width + dx * 2));

            if (object.type === 'river') {
                object.depth = Math.max(10, snap(original.depth + dy));
                object.waterDepth = Math.min(object.depth, object.waterDepth);
            } else {
                object.height = Math.max(10, snap(original.height + dy * 2));
            }
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

        if (copy.points?.length) {
            copy.points = copy.points.map((point) => ({
                x: point.x + 30,
                y: point.y + 30
            }));

            if (copy.type === 'terrain') copy.baselineY += 30;
        } else if (['fault', 'dimension'].includes(copy.type)) {
            copy.x1 += 30;
            copy.y1 += 30;
            copy.x2 += 30;
            copy.y2 += 30;
        } else {
            copy.x += 30;
            copy.y += 30;
        }

        copy.label = `${copy.label || copy.type} copy`;
        state.document.objects.push(copy);
        state.selectedId = copy.id;
        pushHistory();
        render();
        setStatus('Object duplicated.');
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

    function terrainPreset() {
        const terrain = makeTerrain(state.document.width / 2, 250);
        terrain.points = [
            { x: 90, y: 360 },
            { x: 210, y: 250 },
            { x: 330, y: 300 },
            { x: 470, y: 170 },
            { x: 610, y: 230 },
            { x: 760, y: 320 },
            { x: 910, y: 270 }
        ];
        terrain.baselineY = 500;
        terrain.label = 'Topographic profile';

        const dimension = makeDimension(500, 535);
        dimension.x1 = 120;
        dimension.x2 = 880;
        dimension.y1 = dimension.y2 = 525;
        dimension.label = 'Profile distance';

        state.document.objects = [terrain, dimension];
        state.selectedId = terrain.id;
        pushHistory();
        render();
        setStatus('Terrain profile preset inserted.');
    }

    function geologyPreset() {
        const layer1 = makeLayer(500, 390);
        layer1.label = 'Sandstone';
        layer1.fill = '#d97706';
        layer1.stroke = '#b45309';
        layer1.hatch = 'dots';
        layer1.points = [
            { x: 80, y: 300 }, { x: 300, y: 330 }, { x: 540, y: 285 }, { x: 920, y: 330 },
            { x: 920, y: 410 }, { x: 540, y: 370 }, { x: 300, y: 410 }, { x: 80, y: 380 }
        ];

        const layer2 = makeLayer(500, 445);
        layer2.label = 'Shale';
        layer2.fill = '#65a30d';
        layer2.stroke = '#4d7c0f';
        layer2.hatch = 'diagonal';
        layer2.points = [
            { x: 80, y: 380 }, { x: 300, y: 410 }, { x: 540, y: 370 }, { x: 920, y: 410 },
            { x: 920, y: 490 }, { x: 540, y: 455 }, { x: 300, y: 495 }, { x: 80, y: 465 }
        ];

        const layer3 = makeLayer(500, 505);
        layer3.label = 'Granite';
        layer3.fill = '#7c3aed';
        layer3.stroke = '#6d28d9';
        layer3.hatch = 'cross';
        layer3.points = [
            { x: 80, y: 465 }, { x: 300, y: 495 }, { x: 540, y: 455 }, { x: 920, y: 490 },
            { x: 920, y: 545 }, { x: 80, y: 545 }
        ];

        const terrain = makeTerrain(500, 240);
        terrain.points = [
            { x: 80, y: 300 }, { x: 220, y: 250 }, { x: 350, y: 285 },
            { x: 500, y: 185 }, { x: 660, y: 245 }, { x: 800, y: 215 }, { x: 920, y: 330 }
        ];
        terrain.fillOpacity = 0.04;
        terrain.baselineY = 545;
        terrain.label = 'Ground surface';

        const fault = makeFault(650, 355);
        fault.x1 = 590;
        fault.y1 = 160;
        fault.x2 = 720;
        fault.y2 = 540;

        state.document.objects = [layer3, layer2, layer1, terrain, fault];
        state.selectedId = terrain.id;
        pushHistory();
        render();
        setStatus('Geological section preset inserted.');
    }

    function riverPreset() {
        const layer = makeLayer(500, 430);
        layer.label = 'Alluvium';
        layer.fill = '#d97706';
        layer.stroke = '#b45309';
        layer.hatch = 'dots';
        layer.points = [
            { x: 80, y: 330 }, { x: 300, y: 350 }, { x: 430, y: 410 }, { x: 570, y: 410 }, { x: 700, y: 350 }, { x: 920, y: 330 },
            { x: 920, y: 520 }, { x: 80, y: 520 }
        ];

        const terrain = makeTerrain(500, 270);
        terrain.points = [
            { x: 80, y: 285 }, { x: 230, y: 250 }, { x: 360, y: 310 },
            { x: 440, y: 390 }, { x: 500, y: 425 }, { x: 560, y: 390 },
            { x: 650, y: 300 }, { x: 790, y: 245 }, { x: 920, y: 285 }
        ];
        terrain.fillOpacity = 0.06;
        terrain.baselineY = 520;
        terrain.label = 'River valley profile';

        const river = makeRiver(500, 390);
        river.width = 145;
        river.depth = 55;
        river.waterDepth = 27;

        const text = makeText(500, 475);
        text.text = 'Floodplain deposits';
        text.fontSize = 15;

        state.document.objects = [layer, terrain, river, text];
        state.selectedId = river.id;
        pushHistory();
        render();
        setStatus('River valley preset inserted.');
    }

    function coastPreset() {
        const landLayer = makeLayer(350, 430);
        landLayer.label = 'Coastal sediment';
        landLayer.fill = '#d97706';
        landLayer.stroke = '#b45309';
        landLayer.hatch = 'diagonal';
        landLayer.points = [
            { x: 70, y: 300 }, { x: 260, y: 330 }, { x: 430, y: 370 }, { x: 560, y: 420 },
            { x: 560, y: 520 }, { x: 70, y: 520 }
        ];

        const terrain = makeTerrain(380, 275);
        terrain.points = [
            { x: 70, y: 255 }, { x: 210, y: 285 }, { x: 350, y: 310 },
            { x: 470, y: 355 }, { x: 560, y: 420 }
        ];
        terrain.fillOpacity = 0.05;
        terrain.baselineY = 520;
        terrain.label = 'Coastal profile';

        const sea = makeWater(755, 420);
        sea.x = 745;
        sea.y = 435;
        sea.width = 370;
        sea.height = 170;
        sea.label = 'Sea';

        state.document.showSeaLevel = true;
        state.document.seaLevelY = 350;
        state.document.objects = [landLayer, terrain, sea];
        state.selectedId = sea.id;
        syncDocumentControls();
        pushHistory();
        render();
        setStatus('Coastal section preset inserted.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Cross-section / Profile diagram?')) return;

        state.document = createDocument();
        state.selectedId = null;
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Cross-section / Profile diagram.');
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
        setStatus('Cross-section diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'cross-section-profile')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'cross-section-profile';
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

        if (state.document.mode !== 'cross-section') {
            state.document = createDocument();
        }

        state.selectedId = null;
        state.activeTool = 'select';
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();

        state.root.hidden = false;
        document.body.dataset.qmxXsecOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(context.initialSpec
            ? 'Existing Cross-section / Profile diagram loaded.'
            : 'Choose a profile preset or add objects.');

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;

        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxXsecOverflow || '';
        delete document.body.dataset.qmxXsecOverflow;
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

        if (spec.mode !== 'cross-section') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }

        open({
            tool: { id: 'cross-section' },
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
            'cross-section',
            'cross-section-profile',
            'cross-section-diagram',
            'profile-diagram',
            'terrain-profile',
            'xsec'
        ].forEach((id) => {
            try {
                launcher.registerToolHandler(id, open);
                registered = true;
            } catch (error) {
                // Registries may expose only the canonical cross-section id.
            }
        });

        return registered;
    }

    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;

        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        if (event.key === 'Escape') {
            close();
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

    window.QmxCrossSectionEditor = Object.freeze({
        version: '1.0.0',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
