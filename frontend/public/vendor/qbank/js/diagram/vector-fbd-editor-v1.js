(function (window, document) {
    'use strict';

    if (window.QmxVectorFbdEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Vector/FBD] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['body', 'Body', 'বস্তু'],
        ['vector', 'Vector', 'ভেক্টর'],
        ['weight', 'Weight', 'ওজন'],
        ['normal', 'Normal', 'লম্ব প্রতিক্রিয়া'],
        ['friction', 'Friction', 'ঘর্ষণ'],
        ['tension', 'Tension', 'টান'],
        ['applied', 'Applied', 'প্রয়োগ বল'],
        ['text', 'Text', 'লেখা']
    ];

    const PRESETS = {
        vector: { label: 'F', kind: 'force', stroke: '#2563eb' },
        weight: { label: 'W', kind: 'weight', stroke: '#dc2626' },
        normal: { label: 'N', kind: 'normal', stroke: '#16a34a' },
        friction: { label: 'f', kind: 'friction', stroke: '#ea580c' },
        tension: { label: 'T', kind: 'tension', stroke: '#7c3aed' },
        applied: { label: 'F', kind: 'applied', stroke: '#0284c7' }
    };

    const state = {
        root: null,
        dialog: null,
        svg: null,
        gridLayer: null,
        axesLayer: null,
        objectLayer: null,
        draftLayer: null,
        selectionLayer: null,
        context: null,
        document: null,
        selectedId: null,
        activeTool: 'select',
        interaction: null,
        history: [],
        historyIndex: -1,
        controls: {}
    };

    function uid(prefix = 'fbd') {
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
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    }

    function selectedObject() {
        return state.document?.objects.find((item) => item.id === state.selectedId) || null;
    }

    function createDocument() {
        return {
            version: 3,
            id: uid('vector-fbd'),
            mode: 'vector-fbd',
            title: 'Vector / Free-body Diagram',
            width: 900,
            height: 520,
            background: '#ffffff',
            gridSize: 20,
            showGrid: true,
            showAxes: true,
            snap: true,
            pixelsPerUnit: 20,
            unit: 'N',
            objects: []
        };
    }

    function snapValue(value) {
        const size = state.document?.gridSize || 20;
        return state.document?.snap ? Math.round(value / size) * size : value;
    }

    function pointFromEvent(event) {
        const point = state.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        const local = matrix ? point.matrixTransform(matrix.inverse()) : point;
        return {
            x: snapValue(local.x),
            y: snapValue(local.y)
        };
    }

    function vectorMagnitude(object) {
        return Math.hypot(object.x2 - object.x1, object.y2 - object.y1) /
            Math.max(1, state.document.pixelsPerUnit || 20);
    }

    function vectorAngle(object) {
        let angle = Math.atan2(-(object.y2 - object.y1), object.x2 - object.x1) * 180 / Math.PI;
        if (angle < 0) angle += 360;
        return angle;
    }

    function setVectorPolar(object, magnitude, angleDegrees) {
        const length = Math.max(0, Number(magnitude) || 0) *
            Math.max(1, state.document.pixelsPerUnit || 20);
        const radians = (Number(angleDegrees) || 0) * Math.PI / 180;
        object.x2 = object.x1 + Math.cos(radians) * length;
        object.y2 = object.y1 - Math.sin(radians) * length;
    }

    function makeBody(x, y) {
        return {
            id: uid('body'),
            type: 'body',
            x: x - 70,
            y: y - 45,
            w: 140,
            h: 90,
            shape: 'rect',
            text: 'm',
            fill: '#f8fafc',
            stroke: '#0f172a',
            strokeWidth: 2,
            textColor: '#0f172a',
            fontSize: 22,
            fontWeight: 'bold',
            rotation: 0,
            opacity: 1
        };
    }

    function makeVector(x1, y1, x2, y2, presetId = 'vector') {
        const preset = PRESETS[presetId] || PRESETS.vector;
        return {
            id: uid('vector'),
            type: 'vector',
            x1,
            y1,
            x2,
            y2,
            label: preset.label,
            kind: preset.kind,
            stroke: preset.stroke,
            strokeWidth: 3,
            dash: false,
            opacity: 1,
            showMagnitude: false,
            showAngle: false,
            showComponents: false,
            componentLabels: true
        };
    }

    function makeText(x, y) {
        return {
            id: uid('text'),
            type: 'text',
            x: x - 65,
            y: y - 20,
            w: 130,
            h: 40,
            text: 'Label',
            fill: 'transparent',
            stroke: 'transparent',
            strokeWidth: 0,
            textColor: '#0f172a',
            fontSize: 20,
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
        if (document.getElementById('qmx-vector-fbd-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-vector-fbd-editor-styles';
        style.textContent = `
.qmx-fbd-editor[hidden]{display:none!important}
.qmx-fbd-editor{position:fixed;inset:0;z-index:10120;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.68);backdrop-filter:blur(2px)}
.qmx-fbd-dialog{width:min(1500px,100%);height:min(95vh,950px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.36)}
.qmx-fbd-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-fbd-title{margin-right:auto}.qmx-fbd-title strong{display:block}.qmx-fbd-title span{display:block;color:#64748b;font-size:11px}
.qmx-fbd-btn,.qmx-fbd-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-fbd-btn:hover,.qmx-fbd-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-fbd-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-fbd-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-fbd-btn.is-danger{color:#b91c1c}.qmx-fbd-close{font-size:20px;line-height:1}
.qmx-fbd-workspace{min-height:0;flex:1;display:grid;grid-template-columns:205px minmax(0,1fr) 285px;gap:10px;padding:10px}
.qmx-fbd-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-fbd-panel h3{margin:0 0 8px;font-size:13px}.qmx-fbd-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-fbd-tool{min-height:56px;padding:7px 5px;font-size:11px}.qmx-fbd-tool span{display:block;margin-top:2px;color:#64748b;font-size:10px;font-weight:500}
.qmx-fbd-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-fbd-quick{display:grid;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0}
.qmx-fbd-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-fbd-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-fbd-stage{display:block;width:min(100%,1120px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none;user-select:none}
.qmx-fbd-object{cursor:move}.qmx-fbd-object>*{pointer-events:none}
.qmx-fbd-hit-line{fill:none;stroke:transparent;stroke-width:20;pointer-events:stroke}
.qmx-fbd-hit-fill{fill:transparent;stroke:transparent;stroke-width:14;pointer-events:all}
.qmx-fbd-select-box{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-fbd-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair;pointer-events:all}
.qmx-fbd-draft{fill:none;stroke:#2563eb;stroke-width:3;stroke-dasharray:7 5;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-fbd-fields{display:grid;gap:9px}.qmx-fbd-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-fbd-field input,.qmx-fbd-field textarea,.qmx-fbd-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-fbd-field textarea{min-height:60px;resize:vertical}.qmx-fbd-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-fbd-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-fbd-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-fbd-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-fbd-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-fbd-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-fbd-footer .qmx-fbd-btn:first-of-type{margin-left:auto}
@media(max-width:1020px){.qmx-fbd-workspace{grid-template-columns:165px minmax(0,1fr) 240px}.qmx-fbd-tools{grid-template-columns:1fr}}
@media(max-width:740px){.qmx-fbd-editor{padding:0}.qmx-fbd-dialog{width:100%;height:100%;border-radius:0}.qmx-fbd-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(350px,1fr) auto;overflow:auto}.qmx-fbd-panel{overflow:visible}.qmx-fbd-tools{grid-template-columns:repeat(5,1fr)}.qmx-fbd-header{overflow-x:auto}.qmx-fbd-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-fbd-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-fbd-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-fbd-title">
<header class="qmx-fbd-header">
    <div class="qmx-fbd-title">
        <strong id="qmx-fbd-title">Vector / Free-body Diagram</strong>
        <span>Force vectors, components, bodies, magnitude and direction</span>
    </div>
    <button type="button" class="qmx-fbd-btn" data-fbd-new>New</button>
    <button type="button" class="qmx-fbd-btn" data-fbd-undo>Undo</button>
    <button type="button" class="qmx-fbd-btn" data-fbd-redo>Redo</button>
    <button type="button" class="qmx-fbd-btn" data-fbd-duplicate>Duplicate</button>
    <button type="button" class="qmx-fbd-btn is-danger" data-fbd-delete>Delete</button>
    <button type="button" class="qmx-fbd-btn qmx-fbd-close" data-fbd-close aria-label="Close">×</button>
</header>
<div class="qmx-fbd-workspace">
    <aside class="qmx-fbd-panel">
        <h3>Tools</h3>
        <div class="qmx-fbd-tools" data-fbd-tools></div>
        <div class="qmx-fbd-quick">
            <button type="button" class="qmx-fbd-btn" data-fbd-standard>Standard FBD</button>
            <button type="button" class="qmx-fbd-btn" data-fbd-resultant>Add resultant</button>
        </div>
        <p class="qmx-fbd-help">
            Drag to draw a vector. Select a vector and drag either endpoint.
            Magnitude uses the document pixels-per-unit scale. Positive angles are counter-clockwise from +x.
        </p>
    </aside>
    <main class="qmx-fbd-stage-wrap">
        <svg class="qmx-fbd-stage" data-fbd-svg viewBox="0 0 900 520" tabindex="0" aria-label="Vector and free-body drawing canvas">
            <defs>
                <marker id="qmx-fbd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke"></path>
                </marker>
            </defs>
            <rect data-fbd-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-fbd-grid-layer></g>
            <g data-fbd-axes-layer></g>
            <g data-fbd-object-layer></g>
            <g data-fbd-draft-layer></g>
            <g data-fbd-selection-layer></g>
        </svg>
    </main>
    <aside class="qmx-fbd-panel">
        <h3>Document</h3>
        <div class="qmx-fbd-fields">
            <label class="qmx-fbd-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-fbd-row">
                <label class="qmx-fbd-field">Width<input type="number" min="240" max="2400" data-doc-prop="width"></label>
                <label class="qmx-fbd-field">Height<input type="number" min="180" max="1800" data-doc-prop="height"></label>
            </div>
            <div class="qmx-fbd-row">
                <label class="qmx-fbd-field">Grid size<input type="number" min="5" max="100" data-doc-prop="gridSize"></label>
                <label class="qmx-fbd-field">Pixels / unit<input type="number" min="1" max="500" data-doc-prop="pixelsPerUnit"></label>
            </div>
            <label class="qmx-fbd-field">Unit<input type="text" maxlength="12" data-doc-prop="unit"></label>
            <label class="qmx-fbd-field">Background<input type="color" data-doc-prop="background"></label>
            <label class="qmx-fbd-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label>
            <label class="qmx-fbd-check"><input type="checkbox" data-doc-prop="showAxes"> Show x-y axes</label>
            <label class="qmx-fbd-check"><input type="checkbox" data-doc-prop="snap"> Snap to grid</label>
        </div>
        <hr class="qmx-fbd-divider">
        <h3>Selected object</h3>
        <div data-fbd-properties></div>
    </aside>
</div>
<footer class="qmx-fbd-footer">
    <span class="qmx-fbd-status" data-fbd-status aria-live="polite"></span>
    <button type="button" class="qmx-fbd-btn" data-fbd-export-svg>Export SVG</button>
    <button type="button" class="qmx-fbd-btn" data-fbd-export-png>Export PNG</button>
    <button type="button" class="qmx-fbd-btn is-primary" data-fbd-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.dialog = root.querySelector('.qmx-fbd-dialog');
        state.svg = root.querySelector('[data-fbd-svg]');
        state.gridLayer = root.querySelector('[data-fbd-grid-layer]');
        state.axesLayer = root.querySelector('[data-fbd-axes-layer]');
        state.objectLayer = root.querySelector('[data-fbd-object-layer]');
        state.draftLayer = root.querySelector('[data-fbd-draft-layer]');
        state.selectionLayer = root.querySelector('[data-fbd-selection-layer]');
        state.controls = {
            bg: root.querySelector('[data-fbd-bg]'),
            tools: root.querySelector('[data-fbd-tools]'),
            props: root.querySelector('[data-fbd-properties]'),
            status: root.querySelector('[data-fbd-status]'),
            undo: root.querySelector('[data-fbd-undo]'),
            redo: root.querySelector('[data-fbd-redo]')
        };

        TOOL_DEFS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-fbd-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        state.controls.tools.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (button) setTool(button.dataset.tool);
        });

        root.querySelector('[data-fbd-close]').addEventListener('click', close);
        root.querySelector('[data-fbd-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-fbd-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-fbd-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-fbd-standard]').addEventListener('click', addStandardFbd);
        root.querySelector('[data-fbd-resultant]').addEventListener('click', addResultant);
        root.querySelector('[data-fbd-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-fbd-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-fbd-insert]').addEventListener('click', insertIntoQuestion);

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
        state.activeTool = TOOL_DEFS.some(([id]) => id === tool) ? tool : 'select';
        state.interaction = null;
        state.controls.tools.querySelectorAll('[data-tool]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tool === state.activeTool);
        });
        renderDraft();
        setStatus(state.activeTool === 'select'
            ? 'Select and drag bodies, vectors or labels.'
            : `${TOOL_DEFS.find(([id]) => id === state.activeTool)?.[1] || 'Tool'} tool active.`);
    }

    function onDocumentInput(event) {
        const control = event.currentTarget;
        const prop = control.dataset.docProp;
        if (!prop || !state.document) return;

        if (['showGrid', 'showAxes', 'snap'].includes(prop)) {
            state.document[prop] = control.checked;
        } else if (['width', 'height', 'gridSize', 'pixelsPerUnit'].includes(prop)) {
            state.document[prop] = Number(control.value);
        } else {
            state.document[prop] = control.value;
        }

        state.document = Diagram.normalizeSpec(state.document);
        render();
    }

    function syncDocumentControls() {
        state.root.querySelectorAll('[data-doc-prop]').forEach((control) => {
            const prop = control.dataset.docProp;
            const value = state.document[prop];
            if (control.type === 'checkbox') control.checked = Boolean(value);
            else control.value = value;
        });
    }

    function gridMarkup() {
        if (!state.document.showGrid) return '';
        const size = state.document.gridSize;
        const lines = [];
        for (let x = size; x < state.document.width; x += size) {
            const major = Math.round(x / size) % 5 === 0;
            lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${state.document.height}" stroke="${major ? '#cbd5e1' : '#e2e8f0'}" stroke-width="${major ? 1.1 : .7}"/>`);
        }
        for (let y = size; y < state.document.height; y += size) {
            const major = Math.round(y / size) % 5 === 0;
            lines.push(`<line x1="0" y1="${y}" x2="${state.document.width}" y2="${y}" stroke="${major ? '#cbd5e1' : '#e2e8f0'}" stroke-width="${major ? 1.1 : .7}"/>`);
        }
        return lines.join('');
    }

    function axesMarkup() {
        if (!state.document.showAxes) return '';
        const cx = state.document.width / 2;
        const cy = state.document.height / 2;
        return `
<line x1="0" y1="${cy}" x2="${state.document.width}" y2="${cy}" stroke="#64748b" stroke-width="1.5" marker-end="url(#qmx-fbd-arrow)"/>
<line x1="${cx}" y1="${state.document.height}" x2="${cx}" y2="0" stroke="#64748b" stroke-width="1.5" marker-end="url(#qmx-fbd-arrow)"/>
<text x="${state.document.width - 20}" y="${cy - 9}" fill="#475569" font-size="14">x</text>
<text x="${cx + 10}" y="20" fill="#475569" font-size="14">y</text>`;
    }

    function objectBounds(object) {
        if (object.type === 'vector') {
            const x = Math.min(object.x1, object.x2);
            const y = Math.min(object.y1, object.y2);
            return {
                x,
                y,
                w: Math.max(1, Math.abs(object.x2 - object.x1)),
                h: Math.max(1, Math.abs(object.y2 - object.y1))
            };
        }
        return {
            x: object.x,
            y: object.y,
            w: object.w,
            h: object.h
        };
    }

    function bodyMarkup(object) {
        const cx = object.x + object.w / 2;
        const cy = object.y + object.h / 2;
        const common = `fill="${esc(object.fill)}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}" vector-effect="non-scaling-stroke"`;
        const shape = object.shape === 'circle'
            ? `<ellipse cx="${cx}" cy="${cy}" rx="${Math.abs(object.w) / 2}" ry="${Math.abs(object.h) / 2}" ${common}/>`
            : `<rect x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" rx="7" ${common}/>`;
        const text = `<text x="${cx}" y="${cy}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Noto Sans Bengali, sans-serif">${esc(object.text || 'm')}</text>`;
        const hit = object.shape === 'circle'
            ? `<ellipse class="qmx-fbd-hit-fill" cx="${cx}" cy="${cy}" rx="${Math.abs(object.w) / 2}" ry="${Math.abs(object.h) / 2}"/>`
            : `<rect class="qmx-fbd-hit-fill" x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" rx="7"/>`;
        const content = `${shape}${text}${hit}`;
        return object.rotation
            ? `<g transform="rotate(${object.rotation} ${cx} ${cy})">${content}</g>`
            : content;
    }

    function vectorLabel(object) {
        const dx = object.x2 - object.x1;
        const dy = object.y2 - object.y1;
        const length = Math.hypot(dx, dy) || 1;
        const nx = -dy / length;
        const ny = dx / length;
        const mx = (object.x1 + object.x2) / 2 + nx * 16;
        const my = (object.y1 + object.y2) / 2 + ny * 16;
        const parts = [];
        if (object.label) parts.push(object.label);
        if (object.showMagnitude) {
            parts.push(`${vectorMagnitude(object).toFixed(2)} ${state.document.unit || 'N'}`);
        }
        if (object.showAngle) {
            parts.push(`${vectorAngle(object).toFixed(1)}°`);
        }
        if (!parts.length) return '';
        return `<text x="${mx}" y="${my}" fill="${esc(object.stroke)}" font-size="17" font-weight="bold" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Noto Sans Bengali, sans-serif">${esc(parts.join(' · '))}</text>`;
    }

    function vectorComponentsMarkup(object) {
        if (!object.showComponents) return '';
        const cornerX = object.x2;
        const cornerY = object.y1;
        const labelX = object.componentLabels
            ? `<text x="${(object.x1 + cornerX) / 2}" y="${object.y1 - 9}" fill="${esc(object.stroke)}" font-size="14" text-anchor="middle">Fₓ</text>`
            : '';
        const labelY = object.componentLabels
            ? `<text x="${cornerX + 12}" y="${(cornerY + object.y2) / 2}" fill="${esc(object.stroke)}" font-size="14">Fᵧ</text>`
            : '';
        return `
<line x1="${object.x1}" y1="${object.y1}" x2="${cornerX}" y2="${cornerY}" fill="none" stroke="${esc(object.stroke)}" stroke-width="1.7" stroke-dasharray="7 5" opacity=".78" marker-end="url(#qmx-fbd-arrow)"/>
<line x1="${cornerX}" y1="${cornerY}" x2="${object.x2}" y2="${object.y2}" fill="none" stroke="${esc(object.stroke)}" stroke-width="1.7" stroke-dasharray="7 5" opacity=".78" marker-end="url(#qmx-fbd-arrow)"/>
${labelX}${labelY}`;
    }

    function vectorMarkup(object) {
        const dash = object.dash ? ' stroke-dasharray="8 5"' : '';
        return `
${vectorComponentsMarkup(object)}
<line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" fill="none" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke" marker-end="url(#qmx-fbd-arrow)"/>
${vectorLabel(object)}
<line class="qmx-fbd-hit-line" x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}"/>`;
    }

    function textMarkup(object) {
        const cx = object.x + object.w / 2;
        const cy = object.y + object.h / 2;
        const content = `
<rect class="qmx-fbd-hit-fill" x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}"/>
<text x="${cx}" y="${cy}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Noto Sans Bengali, sans-serif">${esc(object.text || 'Label')}</text>`;
        return object.rotation
            ? `<g transform="rotate(${object.rotation} ${cx} ${cy})">${content}</g>`
            : content;
    }

    function objectMarkup(object) {
        const content = object.type === 'vector'
            ? vectorMarkup(object)
            : (object.type === 'body' ? bodyMarkup(object) : textMarkup(object));
        return `<g class="qmx-fbd-object" data-object-id="${esc(object.id)}">${content}</g>`;
    }

    function selectionMarkup(object) {
        if (!object) return '';
        if (object.type === 'vector') {
            const bounds = objectBounds(object);
            return `
<rect class="qmx-fbd-select-box" x="${bounds.x - 8}" y="${bounds.y - 8}" width="${bounds.w + 16}" height="${bounds.h + 16}"/>
<circle class="qmx-fbd-handle" data-handle="start" cx="${object.x1}" cy="${object.y1}" r="7"/>
<circle class="qmx-fbd-handle" data-handle="end" cx="${object.x2}" cy="${object.y2}" r="7"/>`;
        }
        const bounds = objectBounds(object);
        return `
<rect class="qmx-fbd-select-box" x="${bounds.x - 6}" y="${bounds.y - 6}" width="${bounds.w + 12}" height="${bounds.h + 12}"/>
<rect class="qmx-fbd-handle" data-handle="resize" x="${bounds.x + bounds.w - 7}" y="${bounds.y + bounds.h - 7}" width="14" height="14" rx="2"/>`;
    }

    function renderDraft() {
        if (!state.interaction || state.interaction.type !== 'draw-vector') {
            state.draftLayer.innerHTML = '';
            return;
        }
        const { start, current } = state.interaction;
        state.draftLayer.innerHTML = `<line class="qmx-fbd-draft" x1="${start.x}" y1="${start.y}" x2="${current.x}" y2="${current.y}" marker-end="url(#qmx-fbd-arrow)"/>`;
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;
        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        state.gridLayer.innerHTML = gridMarkup();
        state.axesLayer.innerHTML = axesMarkup();
        state.objectLayer.innerHTML = state.document.objects.map(objectMarkup).join('');
        state.selectionLayer.innerHTML = selectionMarkup(selectedObject());
        renderDraft();
        if (!options.keepProperties) renderProperties();
        updateHistoryButtons();
    }

    function renderProperties() {
        const object = selectedObject();
        if (!object) {
            state.controls.props.innerHTML = `<div class="qmx-fbd-empty">Select a body, vector or text label.</div>`;
            return;
        }

        if (object.type === 'vector') {
            state.controls.props.innerHTML = `
<div class="qmx-fbd-fields">
    <label class="qmx-fbd-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <label class="qmx-fbd-field">Force type
        <select data-object-prop="kind">
            ${['force','weight','normal','friction','tension','applied','resultant','component'].map((kind) => `<option value="${kind}"${object.kind === kind ? ' selected' : ''}>${kind}</option>`).join('')}
        </select>
    </label>
    <div class="qmx-fbd-row">
        <label class="qmx-fbd-field">Start X<input type="number" step="1" data-object-prop="x1" value="${object.x1.toFixed(1)}"></label>
        <label class="qmx-fbd-field">Start Y<input type="number" step="1" data-object-prop="y1" value="${object.y1.toFixed(1)}"></label>
    </div>
    <div class="qmx-fbd-row">
        <label class="qmx-fbd-field">Magnitude<input type="number" min="0" step=".1" data-vector-polar="magnitude" value="${vectorMagnitude(object).toFixed(2)}"></label>
        <label class="qmx-fbd-field">Angle °<input type="number" step="1" data-vector-polar="angle" value="${vectorAngle(object).toFixed(1)}"></label>
    </div>
    <div class="qmx-fbd-row">
        <label class="qmx-fbd-field">End X<input type="number" step="1" data-object-prop="x2" value="${object.x2.toFixed(1)}"></label>
        <label class="qmx-fbd-field">End Y<input type="number" step="1" data-object-prop="y2" value="${object.y2.toFixed(1)}"></label>
    </div>
    <div class="qmx-fbd-row">
        <label class="qmx-fbd-field">Colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-fbd-field">Width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
    </div>
    <label class="qmx-fbd-check"><input type="checkbox" data-object-prop="dash"${object.dash ? ' checked' : ''}> Dashed vector</label>
    <label class="qmx-fbd-check"><input type="checkbox" data-object-prop="showMagnitude"${object.showMagnitude ? ' checked' : ''}> Show magnitude</label>
    <label class="qmx-fbd-check"><input type="checkbox" data-object-prop="showAngle"${object.showAngle ? ' checked' : ''}> Show direction angle</label>
    <label class="qmx-fbd-check"><input type="checkbox" data-object-prop="showComponents"${object.showComponents ? ' checked' : ''}> Show x-y components</label>
    <label class="qmx-fbd-check"><input type="checkbox" data-object-prop="componentLabels"${object.componentLabels ? ' checked' : ''}> Label Fₓ and Fᵧ</label>
</div>`;
            return;
        }

        if (object.type === 'body') {
            state.controls.props.innerHTML = `
<div class="qmx-fbd-fields">
    <label class="qmx-fbd-field">Body label<input type="text" data-object-prop="text" value="${esc(object.text)}"></label>
    <label class="qmx-fbd-field">Shape
        <select data-object-prop="shape">
            <option value="rect"${object.shape === 'rect' ? ' selected' : ''}>Rectangle</option>
            <option value="circle"${object.shape === 'circle' ? ' selected' : ''}>Ellipse / particle</option>
        </select>
    </label>
    <div class="qmx-fbd-row">
        <label class="qmx-fbd-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-fbd-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-fbd-row">
        <label class="qmx-fbd-field">Width<input type="number" min="20" data-object-prop="w" value="${object.w.toFixed(1)}"></label>
        <label class="qmx-fbd-field">Height<input type="number" min="20" data-object-prop="h" value="${object.h.toFixed(1)}"></label>
    </div>
    <div class="qmx-fbd-row">
        <label class="qmx-fbd-field">Fill<input type="color" data-object-prop="fill" value="${object.fill}"></label>
        <label class="qmx-fbd-field">Border<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
    </div>
    <div class="qmx-fbd-row">
        <label class="qmx-fbd-field">Font size<input type="number" min="8" max="96" data-object-prop="fontSize" value="${object.fontSize}"></label>
        <label class="qmx-fbd-field">Rotation °<input type="number" step="1" data-object-prop="rotation" value="${object.rotation}"></label>
    </div>
</div>`;
            return;
        }

        state.controls.props.innerHTML = `
<div class="qmx-fbd-fields">
    <label class="qmx-fbd-field">Text<textarea data-object-prop="text">${esc(object.text)}</textarea></label>
    <div class="qmx-fbd-row">
        <label class="qmx-fbd-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-fbd-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-fbd-row">
        <label class="qmx-fbd-field">Font size<input type="number" min="8" max="96" data-object-prop="fontSize" value="${object.fontSize}"></label>
        <label class="qmx-fbd-field">Rotation °<input type="number" data-object-prop="rotation" value="${object.rotation}"></label>
    </div>
    <label class="qmx-fbd-field">Text colour<input type="color" data-object-prop="textColor" value="${object.textColor}"></label>
    <label class="qmx-fbd-check"><input type="checkbox" data-object-prop="fontWeight"${object.fontWeight === 'bold' ? ' checked' : ''}> Bold</label>
</div>`;
    }

    function selectObject(id) {
        state.selectedId = id;
        render();
    }

    function onPropertyInput(event) {
        const control = event.target.closest('[data-object-prop],[data-vector-polar]');
        const object = selectedObject();
        if (!control || !object) return;

        if (control.dataset.vectorPolar) {
            const magnitudeInput = state.controls.props.querySelector('[data-vector-polar="magnitude"]');
            const angleInput = state.controls.props.querySelector('[data-vector-polar="angle"]');
            setVectorPolar(object, Number(magnitudeInput.value), Number(angleInput.value));
        } else {
            const prop = control.dataset.objectProp;
            if (['dash', 'showMagnitude', 'showAngle', 'showComponents', 'componentLabels'].includes(prop)) {
                object[prop] = control.checked;
            } else if (prop === 'fontWeight') {
                object.fontWeight = control.checked ? 'bold' : 'normal';
            } else if (['text', 'label', 'shape', 'kind', 'stroke', 'fill', 'textColor'].includes(prop)) {
                object[prop] = control.value;
            } else {
                object[prop] = Number(control.value);
            }
        }

        state.document = Diagram.normalizeSpec(state.document);
        render({ keepProperties: true });
    }

    function moveObject(object, original, dx, dy) {
        if (object.type === 'vector') {
            object.x1 = original.x1 + dx;
            object.y1 = original.y1 + dy;
            object.x2 = original.x2 + dx;
            object.y2 = original.y2 + dy;
        } else {
            object.x = original.x + dx;
            object.y = original.y + dy;
        }
    }

    function onPointerDown(event) {
        if (!state.document || event.button !== 0) return;

        const point = pointFromEvent(event);
        const handle = event.target.closest('[data-handle]');
        const group = event.target.closest('[data-object-id]');

        if (state.activeTool === 'select') {
            if (handle && selectedObject()) {
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

            if (group) {
                const id = group.dataset.objectId;
                if (id !== state.selectedId) selectObject(id);
                state.interaction = {
                    type: 'move',
                    pointerId: event.pointerId,
                    start: point,
                    original: clone(state.document.objects.find((item) => item.id === id))
                };
                state.svg.setPointerCapture(event.pointerId);
                event.preventDefault();
                return;
            }

            selectObject(null);
            return;
        }

        if (state.activeTool === 'body') {
            const object = makeBody(point.x, point.y);
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Body added.');
            return;
        }

        if (state.activeTool === 'text') {
            const object = makeText(point.x, point.y);
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Text label added.');
            return;
        }

        if (PRESETS[state.activeTool]) {
            state.interaction = {
                type: 'draw-vector',
                pointerId: event.pointerId,
                presetId: state.activeTool,
                start: point,
                current: point
            };
            state.svg.setPointerCapture(event.pointerId);
            renderDraft();
            event.preventDefault();
        }
    }

    function onPointerMove(event) {
        const interaction = state.interaction;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        const point = pointFromEvent(event);

        if (interaction.type === 'draw-vector') {
            interaction.current = point;
            renderDraft();
            return;
        }

        const object = selectedObject();
        if (!object) return;

        const dx = point.x - interaction.start.x;
        const dy = point.y - interaction.start.y;

        if (interaction.type === 'move') {
            moveObject(object, interaction.original, dx, dy);
        } else if (interaction.type === 'start' && object.type === 'vector') {
            object.x1 = point.x;
            object.y1 = point.y;
        } else if (interaction.type === 'end' && object.type === 'vector') {
            object.x2 = point.x;
            object.y2 = point.y;
        } else if (interaction.type === 'resize' && object.type !== 'vector') {
            object.w = Math.max(20, interaction.original.w + dx);
            object.h = Math.max(20, interaction.original.h + dy);
        }

        state.document = Diagram.normalizeSpec(state.document);
        render({ keepProperties: true });
    }

    function onPointerUp(event) {
        const interaction = state.interaction;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        if (interaction.type === 'draw-vector') {
            const point = pointFromEvent(event);
            const length = Math.hypot(point.x - interaction.start.x, point.y - interaction.start.y);
            if (length >= 8) {
                const object = makeVector(
                    interaction.start.x,
                    interaction.start.y,
                    point.x,
                    point.y,
                    interaction.presetId
                );
                state.document.objects.push(object);
                state.selectedId = object.id;
                pushHistory();
                setStatus(`${object.label || 'Vector'} added.`);
            } else {
                setStatus('Drag farther to create a vector.');
            }
        } else {
            pushHistory();
        }

        try {
            state.svg.releasePointerCapture(event.pointerId);
        } catch (error) {
            // Pointer capture may already be released by the browser.
        }

        state.interaction = null;
        render();
    }

    function addStandardFbd() {
        const cx = state.document.width / 2;
        const cy = state.document.height / 2;
        const body = makeBody(cx, cy);
        const halfW = body.w / 2;
        const halfH = body.h / 2;

        const vectors = [
            makeVector(cx, cy - halfH, cx, cy - halfH - 120, 'normal'),
            makeVector(cx, cy + halfH, cx, cy + halfH + 120, 'weight'),
            makeVector(cx + halfW, cy, cx + halfW + 140, cy, 'applied'),
            makeVector(cx - halfW, cy, cx - halfW - 100, cy, 'friction')
        ];

        vectors.forEach((vector) => {
            vector.showMagnitude = false;
        });

        state.document.objects.push(body, ...vectors);
        state.selectedId = body.id;
        pushHistory();
        render();
        setStatus('Standard free-body diagram added.');
    }

    function addResultant() {
        const vectors = state.document.objects.filter((object) =>
            object.type === 'vector' &&
            !['resultant', 'component'].includes(object.kind)
        );

        if (!vectors.length) {
            setStatus('Add at least one force vector first.');
            return;
        }

        const sum = vectors.reduce((result, vector) => ({
            dx: result.dx + (vector.x2 - vector.x1),
            dy: result.dy + (vector.y2 - vector.y1)
        }), { dx: 0, dy: 0 });

        const body = selectedObject()?.type === 'body'
            ? selectedObject()
            : state.document.objects.find((object) => object.type === 'body');

        const x1 = body ? body.x + body.w / 2 : state.document.width / 2;
        const y1 = body ? body.y + body.h / 2 : state.document.height / 2;
        const resultant = makeVector(x1, y1, x1 + sum.dx, y1 + sum.dy, 'vector');
        resultant.label = 'R';
        resultant.kind = 'resultant';
        resultant.stroke = '#be123c';
        resultant.strokeWidth = 4;
        resultant.showMagnitude = true;
        resultant.showAngle = true;

        state.document.objects.push(resultant);
        state.selectedId = resultant.id;
        pushHistory();
        render();
        setStatus('Resultant vector added.');
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        state.document.objects = state.document.objects.filter((item) => item.id !== state.selectedId);
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
        if (copy.type === 'vector') {
            copy.x1 += 20;
            copy.y1 += 20;
            copy.x2 += 20;
            copy.y2 += 20;
        } else {
            copy.x += 20;
            copy.y += 20;
        }
        state.document.objects.push(copy);
        state.selectedId = copy.id;
        pushHistory();
        render();
        setStatus('Object duplicated.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Vector / Free-body diagram?')) return;
        state.document = createDocument();
        state.selectedId = null;
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Vector / Free-body diagram.');
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
        setStatus('Vector / Free-body diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'vector-fbd').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'vector-fbd';
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

        if (state.document.mode !== 'vector-fbd') {
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
        document.body.dataset.qmxFbdOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(context.initialSpec
            ? 'Existing Vector / Free-body diagram loaded.'
            : 'Choose a body or vector tool and draw on the canvas.');

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;
        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxFbdOverflow || '';
        delete document.body.dataset.qmxFbdOverflow;
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

        if (spec.mode !== 'vector-fbd') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }

        open({
            tool: { id: 'vector-fbd' },
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
        launcher.registerToolHandler('vector-fbd', open);
        return true;
    }

    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;

        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        if (event.key === 'Escape') {
            if (state.interaction?.type === 'draw-vector') {
                state.interaction = null;
                renderDraft();
                setStatus('Vector draft cancelled.');
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

    window.QmxVectorFbdEditor = Object.freeze({
        version: '1.0.0',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
