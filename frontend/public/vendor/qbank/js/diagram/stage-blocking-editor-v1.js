(function (window, document) {
    'use strict';

    if (window.QmxStageBlockingEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Stage Blocking] Diagram renderer must load first.');
        return;
    }

    const TOOLS = [
        ['select', 'Select', 'নির্বাচন'],
        ['actor-a', 'Actor A', 'অভিনেতা ক'],
        ['actor-b', 'Actor B', 'অভিনেতা খ'],
        ['prop', 'Prop', 'মঞ্চসামগ্রী'],
        ['entrance', 'Entrance / Exit', 'প্রবেশ / প্রস্থান'],
        ['movement', 'Movement path', 'চলাচলের পথ'],
        ['zone', 'Blocking zone', 'অবস্থান এলাকা'],
        ['light', 'Lighting area', 'আলোক এলাকা'],
        ['text', 'Text', 'টীকা']
    ];

    const state = {
        root: null,
        svg: null,
        document: null,
        context: null,
        selectedId: null,
        activeTool: 'select',
        interaction: null,
        history: [],
        historyIndex: -1,
        controls: {}
    };

    function uid(prefix = 'stage') {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[character]);
    }

    function createDocument() {
        return {
            version: 13,
            id: uid('stage-blocking'),
            mode: 'stage-blocking',
            title: 'Stage / Blocking Plan',
            width: 1000,
            height: 600,
            background: '#ffffff',
            stageType: 'proscenium',
            stageColor: '#f5f0e6',
            stageLineColor: '#334155',
            stageLineWidth: 3,
            showStageLabels: true,
            showAudience: true,
            showWings: true,
            showGrid: false,
            gridSize: 20,
            snapToGrid: false,
            objects: []
        };
    }

    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
    }

    function snap(value) {
        if (!state.document?.snapToGrid) return value;
        return Math.round(value / state.document.gridSize) * state.document.gridSize;
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
        if (document.getElementById('qmx-stage-blocking-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-stage-blocking-editor-styles';
        style.textContent = `
.qmx-stage-editor[hidden]{display:none!important}
.qmx-stage-editor{position:fixed;inset:0;z-index:10300;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.74);backdrop-filter:blur(2px)}
.qmx-stage-dialog{width:min(1580px,100%);height:min(96vh,990px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.42)}
.qmx-stage-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-stage-title{margin-right:auto}.qmx-stage-title strong{display:block}.qmx-stage-title span{display:block;color:#64748b;font-size:11px}
.qmx-stage-btn,.qmx-stage-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-stage-btn:hover,.qmx-stage-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-stage-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-stage-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-stage-btn.is-danger{color:#b91c1c}.qmx-stage-close{font-size:20px;line-height:1}
.qmx-stage-workspace{min-height:0;flex:1;display:grid;grid-template-columns:235px minmax(0,1fr) 310px;gap:10px;padding:10px}
.qmx-stage-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-stage-panel h3{margin:0 0 8px;font-size:13px}.qmx-stage-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-stage-tool{min-height:57px;padding:6px 5px;font-size:10px}.qmx-stage-tool span{display:block;margin-top:2px;color:#64748b;font-size:9px;font-weight:500}
.qmx-stage-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-stage-quick{display:grid;gap:7px;margin-top:10px}.qmx-stage-group-title{margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;color:#475569;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.qmx-stage-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-stage-canvas{display:block;width:min(100%,1180px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.17);touch-action:none;user-select:none}
.qmx-stage-object{cursor:move}.qmx-stage-hit{fill:transparent;stroke:transparent;stroke-width:22;pointer-events:all}
.qmx-stage-select{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-stage-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair;pointer-events:all}
.qmx-stage-fields{display:grid;gap:9px}.qmx-stage-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-stage-field input,.qmx-stage-field textarea,.qmx-stage-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-stage-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-stage-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-stage-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-stage-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-stage-summary{margin-top:10px;padding:9px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.55}
.qmx-stage-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-stage-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-stage-footer .qmx-stage-btn:first-of-type{margin-left:auto}
@media(max-width:1050px){.qmx-stage-workspace{grid-template-columns:190px minmax(0,1fr) 255px}.qmx-stage-tools{grid-template-columns:1fr}}
@media(max-width:760px){.qmx-stage-editor{padding:0}.qmx-stage-dialog{width:100%;height:100%;border-radius:0}.qmx-stage-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(350px,1fr) auto;overflow:auto}.qmx-stage-panel{overflow:visible}.qmx-stage-tools{grid-template-columns:repeat(2,1fr)}.qmx-stage-header{overflow-x:auto}.qmx-stage-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-stage-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-stage-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-stage-title">
<header class="qmx-stage-header">
    <div class="qmx-stage-title">
        <strong id="qmx-stage-title">Stage / Blocking Plan</strong>
        <span>Stage layouts, performers, props, entrances, movement paths and lighting areas</span>
    </div>
    <button type="button" class="qmx-stage-btn" data-stage-new>New</button>
    <button type="button" class="qmx-stage-btn" data-stage-undo>Undo</button>
    <button type="button" class="qmx-stage-btn" data-stage-redo>Redo</button>
    <button type="button" class="qmx-stage-btn" data-stage-duplicate>Duplicate</button>
    <button type="button" class="qmx-stage-btn is-danger" data-stage-delete>Delete</button>
    <button type="button" class="qmx-stage-btn qmx-stage-close" data-stage-close aria-label="Close">×</button>
</header>
<div class="qmx-stage-workspace">
    <aside class="qmx-stage-panel">
        <h3>Blocking tools</h3>
        <div class="qmx-stage-tools" data-stage-tools></div>

        <div class="qmx-stage-group-title">Stage presets</div>
        <div class="qmx-stage-quick">
            <button type="button" class="qmx-stage-btn" data-stage-preset="proscenium">Proscenium stage</button>
            <button type="button" class="qmx-stage-btn" data-stage-preset="thrust">Thrust stage</button>
            <button type="button" class="qmx-stage-btn" data-stage-preset="arena">Arena stage</button>
            <button type="button" class="qmx-stage-btn" data-stage-preset="black-box">Black-box theatre</button>
        </div>

        <div class="qmx-stage-group-title">Blocking presets</div>
        <div class="qmx-stage-quick">
            <button type="button" class="qmx-stage-btn" data-blocking-preset="dialogue">Two-person dialogue</button>
            <button type="button" class="qmx-stage-btn" data-blocking-preset="cross">Entrance and cross</button>
            <button type="button" class="qmx-stage-btn" data-blocking-preset="ensemble">Ensemble tableau</button>
            <button type="button" class="qmx-stage-btn" data-blocking-preset="lighting">Lighting focus plan</button>
            <button type="button" class="qmx-stage-btn" data-stage-clear>Clear objects</button>
        </div>

        <p class="qmx-stage-help">
            Actors, props and zones can be dragged. Movement paths have editable endpoints.
            Use the property panel to change labels, facing, prop type and lighting opacity.
        </p>
    </aside>

    <main class="qmx-stage-wrap">
        <svg class="qmx-stage-canvas" data-stage-svg viewBox="0 0 1000 600" tabindex="0" aria-label="Stage blocking plan canvas">
            <defs>
                <marker id="qmx-stage-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke"></path>
                </marker>
            </defs>
            <rect data-stage-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-stage-base></g>
            <g data-stage-objects></g>
            <g data-stage-selection></g>
        </svg>
    </main>

    <aside class="qmx-stage-panel">
        <h3>Document</h3>
        <div class="qmx-stage-fields">
            <label class="qmx-stage-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-stage-row">
                <label class="qmx-stage-field">Width<input type="number" min="320" max="2400" data-doc-prop="width"></label>
                <label class="qmx-stage-field">Height<input type="number" min="220" max="1800" data-doc-prop="height"></label>
            </div>
            <label class="qmx-stage-field">Stage type
                <select data-doc-prop="stageType">
                    <option value="proscenium">Proscenium</option>
                    <option value="thrust">Thrust</option>
                    <option value="arena">Arena</option>
                    <option value="black-box">Black box</option>
                </select>
            </label>
            <div class="qmx-stage-row">
                <label class="qmx-stage-field">Stage colour<input type="color" data-doc-prop="stageColor"></label>
                <label class="qmx-stage-field">Line colour<input type="color" data-doc-prop="stageLineColor"></label>
            </div>
            <div class="qmx-stage-row">
                <label class="qmx-stage-field">Line width<input type="number" min=".5" max="20" step=".5" data-doc-prop="stageLineWidth"></label>
                <label class="qmx-stage-field">Grid size<input type="number" min="5" max="100" data-doc-prop="gridSize"></label>
            </div>
            <label class="qmx-stage-field">Background<input type="color" data-doc-prop="background"></label>
            <label class="qmx-stage-check"><input type="checkbox" data-doc-prop="showStageLabels"> Show stage labels</label>
            <label class="qmx-stage-check"><input type="checkbox" data-doc-prop="showAudience"> Show audience</label>
            <label class="qmx-stage-check"><input type="checkbox" data-doc-prop="showWings"> Show wings / backstage</label>
            <label class="qmx-stage-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label>
            <label class="qmx-stage-check"><input type="checkbox" data-doc-prop="snapToGrid"> Snap to grid</label>
        </div>

        <hr class="qmx-stage-divider">
        <h3>Selected object</h3>
        <div data-stage-properties></div>
        <div class="qmx-stage-summary" data-stage-summary></div>
    </aside>
</div>
<footer class="qmx-stage-footer">
    <span class="qmx-stage-status" data-stage-status aria-live="polite"></span>
    <button type="button" class="qmx-stage-btn" data-stage-export-svg>Export SVG</button>
    <button type="button" class="qmx-stage-btn" data-stage-export-png>Export PNG</button>
    <button type="button" class="qmx-stage-btn is-primary" data-stage-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.svg = root.querySelector('[data-stage-svg]');
        state.controls = {
            bg: root.querySelector('[data-stage-bg]'),
            base: root.querySelector('[data-stage-base]'),
            objects: root.querySelector('[data-stage-objects]'),
            selection: root.querySelector('[data-stage-selection]'),
            tools: root.querySelector('[data-stage-tools]'),
            props: root.querySelector('[data-stage-properties]'),
            summary: root.querySelector('[data-stage-summary]'),
            status: root.querySelector('[data-stage-status]'),
            undo: root.querySelector('[data-stage-undo]'),
            redo: root.querySelector('[data-stage-redo]')
        };

        TOOLS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-stage-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        state.controls.tools.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (button) setTool(button.dataset.tool);
        });

        root.querySelector('[data-stage-close]').addEventListener('click', close);
        root.querySelector('[data-stage-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-stage-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-stage-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-stage-clear]').addEventListener('click', clearObjects);
        root.querySelector('[data-stage-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-stage-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-stage-insert]').addEventListener('click', insertIntoQuestion);

        root.querySelectorAll('[data-stage-preset]').forEach((button) => {
            button.addEventListener('click', () => applyStagePreset(button.dataset.stagePreset));
        });

        root.querySelectorAll('[data-blocking-preset]').forEach((button) => {
            button.addEventListener('click', () => applyBlockingPreset(button.dataset.blockingPreset));
        });

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

        if (state.activeTool === 'select') setStatus('Select and drag an actor, prop, path, zone, light or text.');
        else setStatus(`Click the stage to add ${TOOLS.find(([id]) => id === state.activeTool)?.[1] || 'object'}.`);
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

    function createActor(x, y, group = 'A', label = '') {
        return {
            id: uid('actor'),
            type: 'actor',
            x,
            y,
            group,
            number: String(state.document.objects.filter((object) => object.type === 'actor' && object.group === group).length + 1),
            label: label || `Actor ${group}`,
            color: group === 'B' ? '#dc2626' : '#2563eb',
            textColor: '#ffffff',
            radius: 22,
            facing: group === 'B' ? 180 : 0
        };
    }

    function createProp(x, y, propType = 'table') {
        return {
            id: uid('prop'),
            type: 'prop',
            x,
            y,
            width: propType === 'chair' ? 55 : 120,
            height: propType === 'chair' ? 55 : 70,
            propType,
            label: propType.charAt(0).toUpperCase() + propType.slice(1),
            fill: '#d6b98c',
            stroke: '#6b4f2b',
            strokeWidth: 3,
            rotation: 0
        };
    }

    function createEntrance(x, y) {
        return {
            id: uid('entrance'),
            type: 'entrance',
            x,
            y,
            width: 72,
            height: 26,
            side: x < state.document.width / 2 ? 'left' : 'right',
            label: `E${state.document.objects.filter((object) => object.type === 'entrance').length + 1}`,
            color: '#0f766e'
        };
    }

    function createMovement(x, y) {
        return {
            id: uid('movement'),
            type: 'movement',
            x1: x - 120,
            y1: y + 55,
            x2: x + 120,
            y2: y - 55,
            curve: 0,
            label: 'Cross',
            color: '#7c3aed',
            width: 5,
            dash: false
        };
    }

    function createZone(x, y) {
        return {
            id: uid('zone'),
            type: 'zone',
            x,
            y,
            width: 220,
            height: 130,
            shape: 'rectangle',
            label: 'Playing area',
            fill: '#facc15',
            fillOpacity: 0.18,
            stroke: '#ca8a04',
            strokeWidth: 3,
            textColor: '#713f12'
        };
    }

    function createLight(x, y) {
        return {
            id: uid('light'),
            type: 'light',
            x,
            y,
            radius: 90,
            label: 'Light',
            color: '#f59e0b',
            opacity: 0.28
        };
    }

    function createText(x, y) {
        return {
            id: uid('text'),
            type: 'text',
            x,
            y,
            text: 'Blocking note',
            color: '#0f172a',
            fontSize: 28,
            fontWeight: 'bold'
        };
    }

    function onDocumentInput(event) {
        const control = event.currentTarget;
        const prop = control.dataset.docProp;
        if (!prop || !state.document) return;

        if (['showStageLabels', 'showAudience', 'showWings', 'showGrid', 'snapToGrid'].includes(prop)) {
            state.document[prop] = control.checked;
        } else if (['width', 'height', 'gridSize', 'stageLineWidth'].includes(prop)) {
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

    function stageGridMarkup() {
        if (!state.document.showGrid) return '';
        const size = state.document.gridSize;
        return `<defs><pattern id="qmx-stage-grid-live" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${state.document.width}" height="${state.document.height}" fill="url(#qmx-stage-grid-live)" pointer-events="none"/>`;
    }

    function audienceMarkup() {
        if (!state.document.showAudience) return '';

        const width = state.document.width;
        const height = state.document.height;
        const rows = [];
        const rowY = height - 70;

        for (let index = 0; index < 12; index += 1) {
            const x = 80 + index * ((width - 160) / 11);
            rows.push(`<circle cx="${x}" cy="${rowY}" r="7" fill="#94a3b8"/><circle cx="${x}" cy="${rowY + 25}" r="7" fill="#cbd5e1"/>`);
        }

        if (state.document.stageType === 'arena') {
            for (let index = 0; index < 9; index += 1) {
                const y = 95 + index * ((height - 190) / 8);
                rows.push(`<circle cx="45" cy="${y}" r="7" fill="#94a3b8"/><circle cx="${width - 45}" cy="${y}" r="7" fill="#94a3b8"/>`);
            }
        }

        return rows.join('');
    }

    function baseMarkup() {
        const documentSpec = state.document;
        const width = documentSpec.width;
        const height = documentSpec.height;
        const stroke = esc(documentSpec.stageLineColor);
        const fill = esc(documentSpec.stageColor);
        const lineWidth = documentSpec.stageLineWidth;
        const labels = [];

        let stage = '';

        if (documentSpec.stageType === 'thrust') {
            stage = `<path d="M 150 55 H ${width - 150} V ${height - 240} L ${width - 245} ${height - 115} H 245 L 150 ${height - 240} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lineWidth}"/>`;
            if (documentSpec.showStageLabels) {
                labels.push(`<text x="${width / 2}" y="85" text-anchor="middle" font-size="18" font-weight="800" fill="${stroke}">UPSTAGE</text>`);
                labels.push(`<text x="${width / 2}" y="${height - 135}" text-anchor="middle" font-size="18" font-weight="800" fill="${stroke}">THRUST / DOWNSTAGE</text>`);
            }
        } else if (documentSpec.stageType === 'arena') {
            stage = `<rect x="175" y="105" width="${width - 350}" height="${height - 240}" rx="75" fill="${fill}" stroke="${stroke}" stroke-width="${lineWidth}"/><line x1="${width / 2}" y1="105" x2="${width / 2}" y2="${height - 135}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="8 6" opacity=".45"/>`;
            if (documentSpec.showStageLabels) {
                labels.push(`<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="20" font-weight="800" fill="${stroke}">ARENA PLAYING AREA</text>`);
            }
        } else if (documentSpec.stageType === 'black-box') {
            stage = `<rect x="65" y="50" width="${width - 130}" height="${height - 140}" fill="${fill}" stroke="${stroke}" stroke-width="${lineWidth}"/><rect x="105" y="90" width="${width - 210}" height="${height - 220}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="8 6" opacity=".55"/>`;
            if (documentSpec.showStageLabels) {
                labels.push(`<text x="${width / 2}" y="82" text-anchor="middle" font-size="18" font-weight="800" fill="${stroke}">BLACK-BOX PERFORMANCE SPACE</text>`);
            }
        } else {
            stage = `<rect x="95" y="55" width="${width - 190}" height="${height - 180}" fill="${fill}" stroke="${stroke}" stroke-width="${lineWidth}"/><line x1="95" y1="${height - 125}" x2="${width - 95}" y2="${height - 125}" stroke="${stroke}" stroke-width="${lineWidth}"/><line x1="${width / 2}" y1="55" x2="${width / 2}" y2="${height - 125}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="8 6" opacity=".45"/>`;
            if (documentSpec.showWings) {
                stage += `<rect x="28" y="95" width="67" height="${height - 265}" fill="#e2e8f0" stroke="${stroke}" stroke-width="2"/><rect x="${width - 95}" y="95" width="67" height="${height - 265}" fill="#e2e8f0" stroke="${stroke}" stroke-width="2"/>`;
            }
            if (documentSpec.showStageLabels) {
                labels.push(`<text x="${width / 2}" y="84" text-anchor="middle" font-size="18" font-weight="800" fill="${stroke}">UPSTAGE</text>`);
                labels.push(`<text x="${width / 2}" y="${height - 142}" text-anchor="middle" font-size="18" font-weight="800" fill="${stroke}">DOWNSTAGE / APRON</text>`);
                labels.push(`<text x="125" y="${height / 2}" text-anchor="middle" font-size="14" font-weight="700" fill="${stroke}">STAGE LEFT</text>`);
                labels.push(`<text x="${width - 125}" y="${height / 2}" text-anchor="middle" font-size="14" font-weight="700" fill="${stroke}">STAGE RIGHT</text>`);
            }
        }

        return stage + audienceMarkup() + labels.join('') + stageGridMarkup();
    }

    function movementPath(object) {
        if (!object.curve) return `M ${object.x1} ${object.y1} L ${object.x2} ${object.y2}`;
        const midpointX = (object.x1 + object.x2) / 2;
        const midpointY = (object.y1 + object.y2) / 2;
        const dx = object.x2 - object.x1;
        const dy = object.y2 - object.y1;
        const length = Math.max(1, Math.hypot(dx, dy));
        const controlX = midpointX - (dy / length) * object.curve;
        const controlY = midpointY + (dx / length) * object.curve;
        return `M ${object.x1} ${object.y1} Q ${controlX} ${controlY} ${object.x2} ${object.y2}`;
    }

    function propShape(object) {
        const left = object.x - object.width / 2;
        const top = object.y - object.height / 2;
        const common = `fill="${esc(object.fill)}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"`;

        if (object.propType === 'chair') {
            return `<rect x="${left + object.width * .18}" y="${top + object.height * .28}" width="${object.width * .64}" height="${object.height * .45}" rx="5" ${common}/><line x1="${left + object.width * .22}" y1="${top + object.height * .72}" x2="${left + object.width * .18}" y2="${top + object.height}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"/><line x1="${left + object.width * .78}" y1="${top + object.height * .72}" x2="${left + object.width * .82}" y2="${top + object.height}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"/><line x1="${left + object.width * .22}" y1="${top + object.height * .28}" x2="${left + object.width * .22}" y2="${top}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"/><line x1="${left + object.width * .78}" y1="${top + object.height * .28}" x2="${left + object.width * .78}" y2="${top}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"/>`;
        }

        if (object.propType === 'door') {
            return `<rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" fill="none" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"/><path d="M ${left} ${top + object.height} A ${object.width} ${object.height} 0 0 1 ${left + object.width} ${top}" fill="none" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" stroke-dasharray="6 5"/>`;
        }

        if (object.propType === 'sofa') {
            return `<rect x="${left}" y="${top + object.height * .25}" width="${object.width}" height="${object.height * .65}" rx="18" ${common}/><rect x="${left + 10}" y="${top}" width="${object.width - 20}" height="${object.height * .45}" rx="14" ${common}/>`;
        }

        if (object.propType === 'platform') {
            return `<rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="5" ${common}/><line x1="${left}" y1="${top + object.height * .72}" x2="${left + object.width}" y2="${top + object.height * .72}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"/>`;
        }

        return `<rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="7" ${common}/><line x1="${left + 12}" y1="${top + object.height}" x2="${left + 12}" y2="${top + object.height + 14}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"/><line x1="${left + object.width - 12}" y1="${top + object.height}" x2="${left + object.width - 12}" y2="${top + object.height + 14}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"/>`;
    }

    function objectMarkup(object) {
        if (object.type === 'actor') {
            const angle = object.facing * Math.PI / 180;
            const fx = object.x + Math.cos(angle) * (object.radius + 17);
            const fy = object.y + Math.sin(angle) * (object.radius + 17);
            return `<g class="qmx-stage-object" data-object-id="${esc(object.id)}"><circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="${esc(object.color)}" stroke="#ffffff" stroke-width="3"/><circle cx="${object.x}" cy="${object.y}" r="${object.radius + 2}" fill="none" stroke="#64748b" stroke-width="1.5"/><text x="${object.x}" y="${object.y + 5}" text-anchor="middle" font-size="${Math.max(10, object.radius * .75)}" font-weight="800" fill="${esc(object.textColor)}">${esc(object.number)}</text><line x1="${object.x}" y1="${object.y}" x2="${fx}" y2="${fy}" stroke="${esc(object.color)}" stroke-width="4" marker-end="url(#qmx-stage-arrow)"/><text x="${object.x}" y="${object.y + object.radius + 20}" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a" paint-order="stroke" stroke="#ffffff" stroke-width="4">${esc(object.label)}</text><circle class="qmx-stage-hit" cx="${object.x}" cy="${object.y}" r="${object.radius + 12}"/></g>`;
        }

        if (object.type === 'prop') {
            return `<g class="qmx-stage-object" data-object-id="${esc(object.id)}" transform="rotate(${object.rotation} ${object.x} ${object.y})">${propShape(object)}<text x="${object.x}" y="${object.y + object.height / 2 + 22}" text-anchor="middle" font-size="13" font-weight="700" fill="#334155" paint-order="stroke" stroke="#ffffff" stroke-width="4">${esc(object.label)}</text><rect class="qmx-stage-hit" x="${object.x - object.width / 2}" y="${object.y - object.height / 2}" width="${object.width}" height="${object.height + 25}"/></g>`;
        }

        if (object.type === 'entrance') {
            const direction = object.side === 'left' ? 1 : -1;
            const x2 = object.x + direction * object.width;
            return `<g class="qmx-stage-object" data-object-id="${esc(object.id)}"><line x1="${object.x}" y1="${object.y}" x2="${x2}" y2="${object.y}" stroke="${esc(object.color)}" stroke-width="6" marker-end="url(#qmx-stage-arrow)"/><line x1="${object.x}" y1="${object.y - object.height}" x2="${object.x}" y2="${object.y + object.height}" stroke="${esc(object.color)}" stroke-width="5"/><text x="${object.x + direction * (object.width / 2)}" y="${object.y - 13}" text-anchor="middle" font-size="14" font-weight="800" fill="${esc(object.color)}">${esc(object.label)}</text><line class="qmx-stage-hit" x1="${object.x - 10}" y1="${object.y}" x2="${x2}" y2="${object.y}"/></g>`;
        }

        if (object.type === 'movement') {
            const path = movementPath(object);
            const labelX = (object.x1 + object.x2) / 2;
            const labelY = (object.y1 + object.y2) / 2 - 12;
            return `<g class="qmx-stage-object" data-object-id="${esc(object.id)}"><path d="${path}" fill="none" stroke="${esc(object.color)}" stroke-width="${object.width}"${object.dash ? ' stroke-dasharray="12 8"' : ''} stroke-linecap="round" marker-end="url(#qmx-stage-arrow)" vector-effect="non-scaling-stroke"/><text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="14" font-weight="800" fill="${esc(object.color)}" paint-order="stroke" stroke="#ffffff" stroke-width="4">${esc(object.label)}</text><path class="qmx-stage-hit" d="${path}" fill="none"/></g>`;
        }

        if (object.type === 'zone') {
            const shape = object.shape === 'ellipse'
                ? `<ellipse cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" stroke-dasharray="9 6"/>`
                : `<rect x="${object.x - object.width / 2}" y="${object.y - object.height / 2}" width="${object.width}" height="${object.height}" rx="18" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" stroke-dasharray="9 6"/>`;
            return `<g class="qmx-stage-object" data-object-id="${esc(object.id)}">${shape}<text x="${object.x}" y="${object.y + 5}" text-anchor="middle" font-size="16" font-weight="800" fill="${esc(object.textColor)}">${esc(object.label)}</text><rect class="qmx-stage-hit" x="${object.x - object.width / 2}" y="${object.y - object.height / 2}" width="${object.width}" height="${object.height}"/></g>`;
        }

        if (object.type === 'light') {
            return `<g class="qmx-stage-object" data-object-id="${esc(object.id)}"><circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="${esc(object.color)}" fill-opacity="${object.opacity}" stroke="${esc(object.color)}" stroke-width="3" stroke-dasharray="8 6"/><circle cx="${object.x}" cy="${object.y}" r="9" fill="${esc(object.color)}"/><text x="${object.x}" y="${object.y + 5}" text-anchor="middle" font-size="12" font-weight="900" fill="#ffffff">L</text><text x="${object.x}" y="${object.y + object.radius + 20}" text-anchor="middle" font-size="14" font-weight="800" fill="${esc(object.color)}">${esc(object.label)}</text><circle class="qmx-stage-hit" cx="${object.x}" cy="${object.y}" r="${object.radius}"/></g>`;
        }

        return `<g class="qmx-stage-object" data-object-id="${esc(object.id)}"><text x="${object.x}" y="${object.y}" text-anchor="middle" dominant-baseline="middle" font-size="${object.fontSize}" font-weight="${object.fontWeight}" fill="${esc(object.color)}" paint-order="stroke" stroke="#ffffff" stroke-width="5">${esc(object.text)}</text><rect class="qmx-stage-hit" x="${object.x - 120}" y="${object.y - 40}" width="240" height="80"/></g>`;
    }

    function objectBounds(object) {
        if (object.type === 'movement') {
            return {
                minX: Math.min(object.x1, object.x2),
                minY: Math.min(object.y1, object.y2),
                maxX: Math.max(object.x1, object.x2),
                maxY: Math.max(object.y1, object.y2)
            };
        }

        if (object.type === 'actor') {
            return {
                minX: object.x - object.radius - 10,
                minY: object.y - object.radius - 10,
                maxX: object.x + object.radius + 10,
                maxY: object.y + object.radius + 32
            };
        }

        if (object.type === 'light') {
            return {
                minX: object.x - object.radius,
                minY: object.y - object.radius,
                maxX: object.x + object.radius,
                maxY: object.y + object.radius + 28
            };
        }

        if (object.type === 'entrance') {
            const x2 = object.x + (object.side === 'left' ? object.width : -object.width);
            return {
                minX: Math.min(object.x, x2) - 10,
                minY: object.y - object.height - 20,
                maxX: Math.max(object.x, x2) + 10,
                maxY: object.y + object.height
            };
        }

        if (object.type === 'text') {
            return {
                minX: object.x - 120,
                minY: object.y - 40,
                maxX: object.x + 120,
                maxY: object.y + 40
            };
        }

        return {
            minX: object.x - object.width / 2,
            minY: object.y - object.height / 2,
            maxX: object.x + object.width / 2,
            maxY: object.y + object.height / 2 + 25
        };
    }

    function selectionMarkup() {
        const object = selectedObject();
        if (!object) return '';

        if (object.type === 'movement') {
            return `<path class="qmx-stage-select" d="${movementPath(object)}"/><circle class="qmx-stage-handle" data-handle="endpoint-1" cx="${object.x1}" cy="${object.y1}" r="7"/><circle class="qmx-stage-handle" data-handle="endpoint-2" cx="${object.x2}" cy="${object.y2}" r="7"/>`;
        }

        const bounds = objectBounds(object);
        let handle = '';

        if (['prop', 'zone'].includes(object.type)) {
            handle = `<circle class="qmx-stage-handle" data-handle="resize" cx="${bounds.maxX}" cy="${bounds.maxY - 25}" r="7"/>`;
        } else if (['actor', 'light'].includes(object.type)) {
            handle = `<circle class="qmx-stage-handle" data-handle="radius" cx="${object.x + object.radius}" cy="${object.y}" r="7"/>`;
        }

        return `<rect class="qmx-stage-select" x="${bounds.minX - 8}" y="${bounds.minY - 8}" width="${bounds.maxX - bounds.minX + 16}" height="${bounds.maxY - bounds.minY + 16}"/>${handle}`;
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;

        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        state.controls.base.innerHTML = baseMarkup();
        state.controls.objects.innerHTML = state.document.objects.map(objectMarkup).join('');
        state.controls.selection.innerHTML = selectionMarkup();

        if (!options.keepProperties) renderProperties();
        renderSummary();
        updateHistoryButtons();
    }

    function renderSummary() {
        const actors = state.document.objects.filter((object) => object.type === 'actor').length;
        const props = state.document.objects.filter((object) => object.type === 'prop').length;
        const paths = state.document.objects.filter((object) => object.type === 'movement').length;
        const zones = state.document.objects.filter((object) => ['zone', 'light'].includes(object.type)).length;

        state.controls.summary.textContent = `${actors} actor(s) · ${props} prop(s) · ${paths} movement path(s) · ${zones} zone/light area(s)`;
    }

    function renderProperties() {
        const object = selectedObject();

        if (!object) {
            state.controls.props.innerHTML = `<div class="qmx-stage-empty">Select an actor, prop, entrance, path, zone, light or text.</div>`;
            return;
        }

        if (object.type === 'actor') {
            state.controls.props.innerHTML = `
<div class="qmx-stage-fields">
    <div class="qmx-stage-row">
        <label class="qmx-stage-field">Number<input type="text" data-object-prop="number" value="${esc(object.number)}"></label>
        <label class="qmx-stage-field">Group<select data-object-prop="group"><option value="A"${object.group === 'A' ? ' selected' : ''}>A</option><option value="B"${object.group === 'B' ? ' selected' : ''}>B</option><option value="neutral"${object.group === 'neutral' ? ' selected' : ''}>Neutral</option></select></label>
    </div>
    <label class="qmx-stage-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-stage-row">
        <label class="qmx-stage-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-stage-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-stage-row">
        <label class="qmx-stage-field">Radius<input type="number" min="8" max="70" data-object-prop="radius" value="${object.radius}"></label>
        <label class="qmx-stage-field">Facing °<input type="number" data-object-prop="facing" value="${object.facing}"></label>
    </div>
    <div class="qmx-stage-row">
        <label class="qmx-stage-field">Colour<input type="color" data-object-prop="color" value="${object.color}"></label>
        <label class="qmx-stage-field">Text colour<input type="color" data-object-prop="textColor" value="${object.textColor}"></label>
    </div>
</div>`;
            return;
        }

        if (object.type === 'prop') {
            state.controls.props.innerHTML = `
<div class="qmx-stage-fields">
    <label class="qmx-stage-field">Prop type<select data-object-prop="propType"><option value="table"${object.propType === 'table' ? ' selected' : ''}>Table</option><option value="chair"${object.propType === 'chair' ? ' selected' : ''}>Chair</option><option value="door"${object.propType === 'door' ? ' selected' : ''}>Door</option><option value="sofa"${object.propType === 'sofa' ? ' selected' : ''}>Sofa</option><option value="platform"${object.propType === 'platform' ? ' selected' : ''}>Platform</option></select></label>
    <label class="qmx-stage-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-stage-row"><label class="qmx-stage-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label><label class="qmx-stage-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label></div>
    <div class="qmx-stage-row"><label class="qmx-stage-field">Width<input type="number" min="10" data-object-prop="width" value="${object.width}"></label><label class="qmx-stage-field">Height<input type="number" min="10" data-object-prop="height" value="${object.height}"></label></div>
    <div class="qmx-stage-row"><label class="qmx-stage-field">Fill<input type="color" data-object-prop="fill" value="${object.fill}"></label><label class="qmx-stage-field">Stroke<input type="color" data-object-prop="stroke" value="${object.stroke}"></label></div>
    <div class="qmx-stage-row"><label class="qmx-stage-field">Stroke width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label><label class="qmx-stage-field">Rotation<input type="number" data-object-prop="rotation" value="${object.rotation}"></label></div>
</div>`;
            return;
        }

        if (object.type === 'entrance') {
            state.controls.props.innerHTML = `
<div class="qmx-stage-fields">
    <label class="qmx-stage-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <label class="qmx-stage-field">Direction<select data-object-prop="side"><option value="left"${object.side === 'left' ? ' selected' : ''}>Arrow right</option><option value="right"${object.side === 'right' ? ' selected' : ''}>Arrow left</option></select></label>
    <div class="qmx-stage-row"><label class="qmx-stage-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label><label class="qmx-stage-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label></div>
    <div class="qmx-stage-row"><label class="qmx-stage-field">Length<input type="number" min="20" data-object-prop="width" value="${object.width}"></label><label class="qmx-stage-field">Colour<input type="color" data-object-prop="color" value="${object.color}"></label></div>
</div>`;
            return;
        }

        if (object.type === 'movement') {
            state.controls.props.innerHTML = `
<div class="qmx-stage-fields">
    <label class="qmx-stage-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-stage-row"><label class="qmx-stage-field">X1<input type="number" data-object-prop="x1" value="${object.x1.toFixed(1)}"></label><label class="qmx-stage-field">Y1<input type="number" data-object-prop="y1" value="${object.y1.toFixed(1)}"></label></div>
    <div class="qmx-stage-row"><label class="qmx-stage-field">X2<input type="number" data-object-prop="x2" value="${object.x2.toFixed(1)}"></label><label class="qmx-stage-field">Y2<input type="number" data-object-prop="y2" value="${object.y2.toFixed(1)}"></label></div>
    <div class="qmx-stage-row"><label class="qmx-stage-field">Curve<input type="number" min="-500" max="500" data-object-prop="curve" value="${object.curve}"></label><label class="qmx-stage-field">Width<input type="number" min=".5" max="30" step=".5" data-object-prop="width" value="${object.width}"></label></div>
    <label class="qmx-stage-field">Colour<input type="color" data-object-prop="color" value="${object.color}"></label>
    <label class="qmx-stage-check"><input type="checkbox" data-object-prop="dash"${object.dash ? ' checked' : ''}> Dashed path</label>
</div>`;
            return;
        }

        if (object.type === 'zone') {
            state.controls.props.innerHTML = `
<div class="qmx-stage-fields">
    <label class="qmx-stage-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <label class="qmx-stage-field">Shape<select data-object-prop="shape"><option value="rectangle"${object.shape === 'rectangle' ? ' selected' : ''}>Rectangle</option><option value="ellipse"${object.shape === 'ellipse' ? ' selected' : ''}>Ellipse</option></select></label>
    <div class="qmx-stage-row"><label class="qmx-stage-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label><label class="qmx-stage-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label></div>
    <div class="qmx-stage-row"><label class="qmx-stage-field">Width<input type="number" min="10" data-object-prop="width" value="${object.width}"></label><label class="qmx-stage-field">Height<input type="number" min="10" data-object-prop="height" value="${object.height}"></label></div>
    <div class="qmx-stage-row"><label class="qmx-stage-field">Fill<input type="color" data-object-prop="fill" value="${object.fill}"></label><label class="qmx-stage-field">Stroke<input type="color" data-object-prop="stroke" value="${object.stroke}"></label></div>
    <div class="qmx-stage-row"><label class="qmx-stage-field">Opacity<input type="number" min="0" max="1" step=".05" data-object-prop="fillOpacity" value="${object.fillOpacity}"></label><label class="qmx-stage-field">Stroke width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label></div>
</div>`;
            return;
        }

        if (object.type === 'light') {
            state.controls.props.innerHTML = `
<div class="qmx-stage-fields">
    <label class="qmx-stage-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-stage-row"><label class="qmx-stage-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label><label class="qmx-stage-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label></div>
    <div class="qmx-stage-row"><label class="qmx-stage-field">Radius<input type="number" min="10" max="500" data-object-prop="radius" value="${object.radius}"></label><label class="qmx-stage-field">Opacity<input type="number" min="0" max="1" step=".05" data-object-prop="opacity" value="${object.opacity}"></label></div>
    <label class="qmx-stage-field">Colour<input type="color" data-object-prop="color" value="${object.color}"></label>
</div>`;
            return;
        }

        state.controls.props.innerHTML = `
<div class="qmx-stage-fields">
    <label class="qmx-stage-field">Text<textarea data-object-prop="text">${esc(object.text)}</textarea></label>
    <div class="qmx-stage-row"><label class="qmx-stage-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label><label class="qmx-stage-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label></div>
    <div class="qmx-stage-row"><label class="qmx-stage-field">Font size<input type="number" min="8" max="120" data-object-prop="fontSize" value="${object.fontSize}"></label><label class="qmx-stage-field">Colour<input type="color" data-object-prop="color" value="${object.color}"></label></div>
    <label class="qmx-stage-check"><input type="checkbox" data-object-prop="fontWeight"${object.fontWeight === 'bold' ? ' checked' : ''}> Bold</label>
</div>`;
    }

    function onPropertyInput(event) {
        const control = event.target.closest('[data-object-prop]');
        const object = selectedObject();
        if (!control || !object) return;

        const prop = control.dataset.objectProp;

        if (['dash'].includes(prop)) {
            object[prop] = control.checked;
        } else if (prop === 'fontWeight') {
            object.fontWeight = control.checked ? 'bold' : 'normal';
        } else if (['number', 'label', 'text', 'group', 'propType', 'side', 'shape', 'color', 'textColor', 'fill', 'stroke'].includes(prop)) {
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

    function onPointerDown(event) {
        if (!state.document || event.button !== 0) return;

        const point = svgPoint(event);
        const x = snap(point.x);
        const y = snap(point.y);

        if (state.activeTool !== 'select') {
            let object;

            if (state.activeTool === 'actor-a') object = createActor(x, y, 'A');
            if (state.activeTool === 'actor-b') object = createActor(x, y, 'B');
            if (state.activeTool === 'prop') object = createProp(x, y);
            if (state.activeTool === 'entrance') object = createEntrance(x, y);
            if (state.activeTool === 'movement') object = createMovement(x, y);
            if (state.activeTool === 'zone') object = createZone(x, y);
            if (state.activeTool === 'light') object = createLight(x, y);
            if (state.activeTool === 'text') object = createText(x, y);

            if (object) {
                state.document.objects.push(object);
                state.selectedId = object.id;
                pushHistory();
                setTool('select');
                render();
                setStatus(`${object.type} added.`);
            }
            return;
        }

        const group = event.target.closest('[data-object-id]');
        const target = group
            ? state.document.objects.find((object) => object.id === group.dataset.objectId)
            : null;

        const handle = event.target.closest('[data-handle]');

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
        if (object.type === 'movement') {
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

        const point = svgPoint(event);
        const dx = point.x - interaction.start.x;
        const dy = point.y - interaction.start.y;

        if (interaction.type === 'move') {
            moveObject(object, interaction.original, dx, dy);
        } else if (interaction.type === 'endpoint-1') {
            object.x1 = snap(point.x);
            object.y1 = snap(point.y);
        } else if (interaction.type === 'endpoint-2') {
            object.x2 = snap(point.x);
            object.y2 = snap(point.y);
        } else if (interaction.type === 'resize' && object.width != null) {
            object.width = Math.max(10, snap(interaction.original.width + dx * 2));
            object.height = Math.max(10, snap(interaction.original.height + dy * 2));
        } else if (interaction.type === 'radius' && object.radius != null) {
            object.radius = Math.max(8, Math.hypot(point.x - object.x, point.y - object.y));
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

    function duplicateSelected() {
        const object = selectedObject();
        if (!object) return;

        const copy = clone(object);
        copy.id = uid(copy.type);

        if (copy.type === 'movement') {
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

    function deleteSelected() {
        const object = selectedObject();
        if (!object) return;

        state.document.objects = state.document.objects.filter((item) => item.id !== object.id);
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Object deleted.');
    }

    function clearObjects() {
        if (state.document.objects.length && !window.confirm('Clear all blocking objects?')) return;
        state.document.objects = [];
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Blocking objects cleared.');
    }

    function applyStagePreset(type) {
        const styles = {
            proscenium: { stageColor: '#f5f0e6', stageLineColor: '#334155', showAudience: true, showWings: true },
            thrust: { stageColor: '#f1e7d0', stageLineColor: '#475569', showAudience: true, showWings: false },
            arena: { stageColor: '#e8dfca', stageLineColor: '#475569', showAudience: true, showWings: false },
            'black-box': { stageColor: '#e2e8f0', stageLineColor: '#0f172a', showAudience: false, showWings: false }
        };

        state.document.stageType = type;
        Object.assign(state.document, styles[type] || styles.proscenium);
        pushHistory();
        syncDocumentControls();
        render();
        setStatus(`${type.replace('-', ' ')} stage preset applied.`);
    }

    function applyBlockingPreset(type) {
        const width = state.document.width;
        const height = state.document.height;
        const cx = width / 2;
        const cy = height / 2;

        if (type === 'dialogue') {
            const left = createActor(cx - 145, cy, 'A', 'Speaker 1');
            left.facing = 0;
            const right = createActor(cx + 145, cy, 'B', 'Speaker 2');
            right.facing = 180;
            const table = createProp(cx, cy + 20, 'table');
            const zone = createZone(cx, cy);
            zone.width = 430;
            zone.height = 210;
            zone.label = 'Dialogue focus';
            state.document.objects = [zone, table, left, right];
        } else if (type === 'cross') {
            const entrance = createEntrance(105, cy + 70);
            entrance.side = 'left';
            entrance.label = 'Entrance';
            const actor = createActor(180, cy + 70, 'A', 'Lead');
            actor.facing = -20;
            const movement = createMovement(cx, cy);
            movement.x1 = 180;
            movement.y1 = cy + 70;
            movement.x2 = width - 210;
            movement.y2 = cy - 90;
            movement.curve = -80;
            movement.label = 'Cross to SR';
            state.document.objects = [entrance, actor, movement];
        } else if (type === 'ensemble') {
            const positions = [
                [cx - 210, cy + 80, 'A', '1'],
                [cx - 105, cy - 10, 'B', '2'],
                [cx, cy + 55, 'A', '3'],
                [cx + 105, cy - 10, 'B', '4'],
                [cx + 210, cy + 80, 'A', '5']
            ];
            state.document.objects = positions.map(([x, y, group, number]) => {
                const actor = createActor(x, y, group, `Actor ${number}`);
                actor.number = number;
                actor.facing = -90;
                return actor;
            });
            const text = createText(cx, cy - 125);
            text.text = 'Ensemble tableau';
            state.document.objects.push(text);
        } else {
            const actor = createActor(cx, cy + 30, 'A', 'Principal');
            actor.facing = -90;
            const warm = createLight(cx - 120, cy);
            warm.label = 'Warm special';
            warm.color = '#f59e0b';
            const cool = createLight(cx + 120, cy);
            cool.label = 'Cool special';
            cool.color = '#38bdf8';
            const zone = createZone(cx, cy + 20);
            zone.shape = 'ellipse';
            zone.width = 360;
            zone.height = 230;
            zone.label = 'Focus area';
            state.document.objects = [zone, warm, cool, actor];
        }

        state.selectedId = state.document.objects[0]?.id || null;
        pushHistory();
        render();
        setStatus(`${type} blocking preset inserted.`);
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Stage / Blocking Plan?')) return;

        state.document = createDocument();
        state.selectedId = null;
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Stage / Blocking Plan.');
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
        setStatus('Stage blocking plan inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'stage-blocking-plan')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'stage-blocking-plan';
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

        if (state.document.mode !== 'stage-blocking') {
            state.document = createDocument();
        }

        state.selectedId = null;
        state.interaction = null;
        state.activeTool = 'select';
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();

        state.root.hidden = false;
        document.body.dataset.qmxStageOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(context.initialSpec
            ? 'Existing Stage / Blocking Plan loaded.'
            : 'Choose a blocking tool or insert a preset.');

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;

        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxStageOverflow || '';
        delete document.body.dataset.qmxStageOverflow;
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

        if (spec.mode !== 'stage-blocking') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }

        open({
            tool: { id: 'stage-blocking' },
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
            'stage-blocking',
            'stage-blocking-plan',
            'stage-plan',
            'blocking-plan',
            'stage-layout',
            'stage-diagram',
            'stage',
            'blocking'
        ].forEach((id) => {
            try {
                launcher.registerToolHandler(id, open);
                registered = true;
            } catch (error) {
                // Registries may expose only one canonical Stage / Blocking Plan id.
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

    window.QmxStageBlockingEditor = Object.freeze({
        version: '1.0.0',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
