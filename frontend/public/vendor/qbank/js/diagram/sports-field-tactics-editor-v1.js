(function (window, document) {
    'use strict';

    if (window.QmxSportsFieldEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Sports Field] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFINITIONS = [
        ['select', 'Select', 'নির্বাচন'],
        ['player-a', 'Team A player', 'দল ক'],
        ['player-b', 'Team B player', 'দল খ'],
        ['ball', 'Ball', 'বল'],
        ['movement', 'Movement arrow', 'চলাচল'],
        ['pass', 'Pass arrow', 'পাস'],
        ['zone', 'Zone', 'এলাকা'],
        ['cone', 'Cone / marker', 'কোন'],
        ['text', 'Text', 'লেখা']
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

    function uid(prefix = 'sport') {
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
            version: 12,
            id: uid('sports-field'),
            mode: 'sports-field',
            title: 'Sports Field / Tactics',
            width: 1000,
            height: 600,
            background: '#ffffff',
            fieldType: 'soccer',
            fieldColor: '#15803d',
            fieldLineColor: '#ffffff',
            fieldLineWidth: 3,
            showFieldLabels: true,
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
        if (document.getElementById('qmx-sports-field-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-sports-field-editor-styles';
        style.textContent = `
.qmx-sports-editor[hidden]{display:none!important}
.qmx-sports-editor{position:fixed;inset:0;z-index:10290;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.74);backdrop-filter:blur(2px)}
.qmx-sports-dialog{width:min(1580px,100%);height:min(96vh,990px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.42)}
.qmx-sports-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-sports-title{margin-right:auto}.qmx-sports-title strong{display:block}.qmx-sports-title span{display:block;color:#64748b;font-size:11px}
.qmx-sports-btn,.qmx-sports-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-sports-btn:hover,.qmx-sports-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-sports-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-sports-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-sports-btn.is-danger{color:#b91c1c}.qmx-sports-close{font-size:20px;line-height:1}
.qmx-sports-workspace{min-height:0;flex:1;display:grid;grid-template-columns:235px minmax(0,1fr) 310px;gap:10px;padding:10px}
.qmx-sports-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-sports-panel h3{margin:0 0 8px;font-size:13px}.qmx-sports-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-sports-tool{min-height:57px;padding:6px 5px;font-size:10px}.qmx-sports-tool span{display:block;margin-top:2px;color:#64748b;font-size:9px;font-weight:500}
.qmx-sports-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-sports-quick{display:grid;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0}
.qmx-sports-group-title{margin-top:10px;color:#475569;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.qmx-sports-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-sports-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-sports-stage{display:block;width:min(100%,1180px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.17);touch-action:none;user-select:none}
.qmx-sports-object{cursor:move}.qmx-sports-hit{fill:transparent;stroke:transparent;stroke-width:22;pointer-events:all}
.qmx-sports-select{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-sports-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair;pointer-events:all}
.qmx-sports-fields{display:grid;gap:9px}.qmx-sports-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-sports-field input,.qmx-sports-field textarea,.qmx-sports-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-sports-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-sports-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-sports-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-sports-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-sports-summary{margin-top:10px;padding:9px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.55}
.qmx-sports-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-sports-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-sports-footer .qmx-sports-btn:first-of-type{margin-left:auto}
@media(max-width:1050px){.qmx-sports-workspace{grid-template-columns:190px minmax(0,1fr) 255px}.qmx-sports-tools{grid-template-columns:1fr}}
@media(max-width:760px){.qmx-sports-editor{padding:0}.qmx-sports-dialog{width:100%;height:100%;border-radius:0}.qmx-sports-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(350px,1fr) auto;overflow:auto}.qmx-sports-panel{overflow:visible}.qmx-sports-tools{grid-template-columns:repeat(2,1fr)}.qmx-sports-header{overflow-x:auto}.qmx-sports-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-sports-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-sports-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-sports-title">
<header class="qmx-sports-header">
    <div class="qmx-sports-title">
        <strong id="qmx-sports-title">Sports Field / Tactics</strong>
        <span>Fields, courts, players, formations, zones and movement arrows</span>
    </div>
    <button type="button" class="qmx-sports-btn" data-sports-new>New</button>
    <button type="button" class="qmx-sports-btn" data-sports-undo>Undo</button>
    <button type="button" class="qmx-sports-btn" data-sports-redo>Redo</button>
    <button type="button" class="qmx-sports-btn" data-sports-duplicate>Duplicate</button>
    <button type="button" class="qmx-sports-btn is-danger" data-sports-delete>Delete</button>
    <button type="button" class="qmx-sports-btn qmx-sports-close" data-sports-close aria-label="Close">×</button>
</header>
<div class="qmx-sports-workspace">
    <aside class="qmx-sports-panel">
        <h3>Tactics tools</h3>
        <div class="qmx-sports-tools" data-sports-tools></div>
        <div class="qmx-sports-group-title">Field presets</div>
        <div class="qmx-sports-quick">
            <button type="button" class="qmx-sports-btn" data-field-preset="soccer">Soccer field</button>
            <button type="button" class="qmx-sports-btn" data-field-preset="basketball">Basketball court</button>
            <button type="button" class="qmx-sports-btn" data-field-preset="cricket">Cricket field</button>
            <button type="button" class="qmx-sports-btn" data-field-preset="generic">Generic court</button>
        </div>
        <div class="qmx-sports-group-title">Formation presets</div>
        <div class="qmx-sports-quick">
            <button type="button" class="qmx-sports-btn" data-formation="442">Soccer 4-4-2</button>
            <button type="button" class="qmx-sports-btn" data-formation="433">Soccer 4-3-3</button>
            <button type="button" class="qmx-sports-btn" data-formation="basket212">Basketball 2-1-2</button>
            <button type="button" class="qmx-sports-btn" data-formation="cricket-ring">Cricket fielding ring</button>
            <button type="button" class="qmx-sports-btn" data-formation="corner">Corner-kick plan</button>
            <button type="button" class="qmx-sports-btn" data-sports-clear>Clear tactics</button>
        </div>
        <p class="qmx-sports-help">
            Drag movement or pass arrows from start to destination. Select players, balls,
            zones, cones or arrows to move and edit them.
        </p>
    </aside>
    <main class="qmx-sports-stage-wrap">
        <svg class="qmx-sports-stage" data-sports-svg viewBox="0 0 1000 600" tabindex="0" aria-label="Sports tactics canvas">
            <defs>
                <marker id="qmx-sports-editor-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke"></path>
                </marker>
            </defs>
            <rect data-sports-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-sports-field></g>
            <g data-sports-objects></g>
            <g data-sports-selection></g>
        </svg>
    </main>
    <aside class="qmx-sports-panel">
        <h3>Document</h3>
        <div class="qmx-sports-fields">
            <label class="qmx-sports-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-sports-row">
                <label class="qmx-sports-field">Width<input type="number" min="320" max="2400" data-doc-prop="width"></label>
                <label class="qmx-sports-field">Height<input type="number" min="220" max="1800" data-doc-prop="height"></label>
            </div>
            <label class="qmx-sports-field">Field / court
                <select data-doc-prop="fieldType">
                    <option value="soccer">Soccer</option>
                    <option value="basketball">Basketball</option>
                    <option value="cricket">Cricket</option>
                    <option value="generic">Generic court</option>
                </select>
            </label>
            <div class="qmx-sports-row">
                <label class="qmx-sports-field">Field colour<input type="color" data-doc-prop="fieldColor"></label>
                <label class="qmx-sports-field">Line colour<input type="color" data-doc-prop="fieldLineColor"></label>
            </div>
            <div class="qmx-sports-row">
                <label class="qmx-sports-field">Line width<input type="number" min=".5" max="20" step=".5" data-doc-prop="fieldLineWidth"></label>
                <label class="qmx-sports-field">Grid size<input type="number" min="5" max="100" data-doc-prop="gridSize"></label>
            </div>
            <label class="qmx-sports-field">Background<input type="color" data-doc-prop="background"></label>
            <label class="qmx-sports-check"><input type="checkbox" data-doc-prop="showFieldLabels"> Show field labels</label>
            <label class="qmx-sports-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label>
            <label class="qmx-sports-check"><input type="checkbox" data-doc-prop="snapToGrid"> Snap to grid</label>
        </div>
        <hr class="qmx-sports-divider">
        <h3>Selected object</h3>
        <div data-sports-properties></div>
        <div class="qmx-sports-summary" data-sports-summary></div>
    </aside>
</div>
<footer class="qmx-sports-footer">
    <span class="qmx-sports-status" data-sports-status aria-live="polite"></span>
    <button type="button" class="qmx-sports-btn" data-sports-export-svg>Export SVG</button>
    <button type="button" class="qmx-sports-btn" data-sports-export-png>Export PNG</button>
    <button type="button" class="qmx-sports-btn is-primary" data-sports-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.svg = root.querySelector('[data-sports-svg]');
        state.controls = {
            bg: root.querySelector('[data-sports-bg]'),
            field: root.querySelector('[data-sports-field]'),
            objects: root.querySelector('[data-sports-objects]'),
            selection: root.querySelector('[data-sports-selection]'),
            tools: root.querySelector('[data-sports-tools]'),
            props: root.querySelector('[data-sports-properties]'),
            summary: root.querySelector('[data-sports-summary]'),
            status: root.querySelector('[data-sports-status]'),
            undo: root.querySelector('[data-sports-undo]'),
            redo: root.querySelector('[data-sports-redo]')
        };

        TOOL_DEFINITIONS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-sports-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        state.controls.tools.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (button) setTool(button.dataset.tool);
        });

        root.querySelector('[data-sports-close]').addEventListener('click', close);
        root.querySelector('[data-sports-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-sports-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-sports-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-sports-clear]').addEventListener('click', clearTactics);
        root.querySelector('[data-sports-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-sports-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-sports-insert]').addEventListener('click', insertIntoQuestion);

        root.querySelectorAll('[data-field-preset]').forEach((button) => {
            button.addEventListener('click', () => setFieldPreset(button.dataset.fieldPreset));
        });

        root.querySelectorAll('[data-formation]').forEach((button) => {
            button.addEventListener('click', () => applyFormation(button.dataset.formation));
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
        state.activeTool = TOOL_DEFINITIONS.some(([id]) => id === tool) ? tool : 'select';
        state.interaction = null;
        state.controls.tools.querySelectorAll('[data-tool]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tool === state.activeTool);
        });

        if (state.activeTool === 'movement' || state.activeTool === 'pass') {
            setStatus('Drag from the start position to the destination.');
        } else if (state.activeTool === 'select') {
            setStatus('Select and drag a player, ball, zone, cone, text or arrow.');
        } else {
            setStatus(`Click the field to add ${TOOL_DEFINITIONS.find(([id]) => id === state.activeTool)?.[1] || 'object'}.`);
        }
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

    function playerObject(x, y, team = 'A', label = '') {
        const teamA = team === 'A';
        return {
            id: uid('player'),
            type: 'player',
            x,
            y,
            team,
            number: '',
            label,
            color: teamA ? '#2563eb' : '#dc2626',
            textColor: '#ffffff',
            radius: 20
        };
    }

    function ballObject(x, y) {
        return {
            id: uid('ball'),
            type: 'ball',
            x,
            y,
            sport: state.document.fieldType === 'basketball'
                ? 'basketball'
                : (state.document.fieldType === 'cricket' ? 'cricket' : 'soccer'),
            size: 14,
            color: state.document.fieldType === 'cricket' ? '#b91c1c' : '#ffffff'
        };
    }

    function arrowObject(x1, y1, x2, y2, pass = false) {
        return {
            id: uid(pass ? 'pass' : 'movement'),
            type: 'arrow',
            x1,
            y1,
            x2,
            y2,
            label: pass ? 'Pass' : 'Run',
            color: pass ? '#f59e0b' : '#2563eb',
            width: 5,
            dash: pass,
            curve: 0,
            arrowEnd: true
        };
    }

    function zoneObject(x, y) {
        return {
            id: uid('zone'),
            type: 'zone',
            x,
            y,
            width: 220,
            height: 130,
            shape: 'rectangle',
            label: 'Zone',
            fill: '#facc15',
            fillOpacity: 0.22,
            stroke: '#ca8a04',
            strokeWidth: 3,
            textColor: '#713f12'
        };
    }

    function coneObject(x, y) {
        return {
            id: uid('cone'),
            type: 'cone',
            x,
            y,
            size: 22,
            color: '#f97316',
            label: ''
        };
    }

    function textObject(x, y) {
        return {
            id: uid('text'),
            type: 'text',
            x,
            y,
            text: 'Tactics note',
            color: '#0f172a',
            fontSize: 28,
            fontWeight: 'bold'
        };
    }

    function gridMarkup() {
        if (!state.document.showGrid) return '';
        const size = state.document.gridSize;
        return `<defs><pattern id="qmx-sports-grid-live" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="1"/></pattern></defs><rect width="${state.document.width}" height="${state.document.height}" fill="url(#qmx-sports-grid-live)" pointer-events="none"/>`;
    }

    function fieldMarkup() {
        const spec = state.document;
        const width = spec.width;
        const height = spec.height;
        const margin = Math.max(28, Math.min(width, height) * 0.07);
        const x = margin;
        const y = margin;
        const w = width - margin * 2;
        const h = height - margin * 2;
        const line = esc(spec.fieldLineColor);
        const fill = esc(spec.fieldColor);
        const sw = spec.fieldLineWidth;
        const labels = spec.showFieldLabels;
        const pieces = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${line}" stroke-width="${sw}" rx="${spec.fieldType === 'cricket' ? h / 2 : 0}"/>`];

        if (spec.fieldType === 'soccer') {
            const boxW = w * 0.17;
            const boxH = h * 0.52;
            const goalW = w * 0.065;
            const goalH = h * 0.26;
            pieces.push(
                `<line x1="${width / 2}" y1="${y}" x2="${width / 2}" y2="${y + h}" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(w, h) * 0.12}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${width / 2}" cy="${height / 2}" r="${sw * 1.5}" fill="${line}"/>`,
                `<rect x="${x}" y="${height / 2 - boxH / 2}" width="${boxW}" height="${boxH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x + w - boxW}" y="${height / 2 - boxH / 2}" width="${boxW}" height="${boxH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x}" y="${height / 2 - goalH / 2}" width="${goalW}" height="${goalH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x + w - goalW}" y="${height / 2 - goalH / 2}" width="${goalW}" height="${goalH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x - 12}" y="${height / 2 - h * .12}" width="12" height="${h * .24}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x + w}" y="${height / 2 - h * .12}" width="12" height="${h * .24}" fill="none" stroke="${line}" stroke-width="${sw}"/>`
            );
            if (labels) {
                pieces.push(`<text x="${x + 18}" y="${y + 24}" fill="${line}" font-size="15" font-weight="700">HOME</text><text x="${x + w - 18}" y="${y + 24}" fill="${line}" font-size="15" font-weight="700" text-anchor="end">AWAY</text>`);
            }
        } else if (spec.fieldType === 'basketball') {
            const keyW = w * 0.17;
            const keyH = h * 0.34;
            pieces.push(
                `<line x1="${width / 2}" y1="${y}" x2="${width / 2}" y2="${y + h}" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(w, h) * .11}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x}" y="${height / 2 - keyH / 2}" width="${keyW}" height="${keyH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x + w - keyW}" y="${height / 2 - keyH / 2}" width="${keyW}" height="${keyH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${x + keyW}" cy="${height / 2}" r="${keyH * .32}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${x + w - keyW}" cy="${height / 2}" r="${keyH * .32}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<line x1="${x + 28}" y1="${height / 2 - 45}" x2="${x + 28}" y2="${height / 2 + 45}" stroke="${line}" stroke-width="${sw + 1}"/>`,
                `<line x1="${x + w - 28}" y1="${height / 2 - 45}" x2="${x + w - 28}" y2="${height / 2 + 45}" stroke="${line}" stroke-width="${sw + 1}"/>`,
                `<circle cx="${x + 42}" cy="${height / 2}" r="8" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${x + w - 42}" cy="${height / 2}" r="8" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<path d="M ${x + 90} ${y} Q ${x + w * .22} ${height / 2} ${x + 90} ${y + h}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<path d="M ${x + w - 90} ${y} Q ${x + w * .78} ${height / 2} ${x + w - 90} ${y + h}" fill="none" stroke="${line}" stroke-width="${sw}"/>`
            );
            if (labels) {
                pieces.push(`<text x="${width / 2}" y="${y + 22}" fill="${line}" font-size="14" font-weight="700" text-anchor="middle">BASKETBALL COURT</text>`);
            }
        } else if (spec.fieldType === 'cricket') {
            const pitchW = w * .30;
            const pitchH = h * .16;
            pieces.push(
                `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${w * .36}" ry="${h * .34}" fill="none" stroke="${line}" stroke-width="${sw}" stroke-dasharray="10 8"/>`,
                `<rect x="${width / 2 - pitchW / 2}" y="${height / 2 - pitchH / 2}" width="${pitchW}" height="${pitchH}" fill="#c9a66b" stroke="${line}" stroke-width="${sw}"/>`,
                `<line x1="${width / 2 - pitchW / 2 + 24}" y1="${height / 2 - pitchH / 2}" x2="${width / 2 - pitchW / 2 + 24}" y2="${height / 2 + pitchH / 2}" stroke="${line}" stroke-width="${sw}"/>`,
                `<line x1="${width / 2 + pitchW / 2 - 24}" y1="${height / 2 - pitchH / 2}" x2="${width / 2 + pitchW / 2 - 24}" y2="${height / 2 + pitchH / 2}" stroke="${line}" stroke-width="${sw}"/>`,
                `<g stroke="${line}" stroke-width="${Math.max(2, sw)}"><line x1="${width / 2 - pitchW / 2 + 10}" y1="${height / 2 - 12}" x2="${width / 2 - pitchW / 2 + 10}" y2="${height / 2 + 12}"/><line x1="${width / 2 - pitchW / 2 + 16}" y1="${height / 2 - 12}" x2="${width / 2 - pitchW / 2 + 16}" y2="${height / 2 + 12}"/><line x1="${width / 2 + pitchW / 2 - 10}" y1="${height / 2 - 12}" x2="${width / 2 + pitchW / 2 - 10}" y2="${height / 2 + 12}"/><line x1="${width / 2 + pitchW / 2 - 16}" y1="${height / 2 - 12}" x2="${width / 2 + pitchW / 2 - 16}" y2="${height / 2 + 12}"/></g>`
            );
            if (labels) {
                pieces.push(`<text x="${width / 2}" y="${y + 24}" fill="${line}" font-size="15" font-weight="700" text-anchor="middle">CRICKET FIELD</text>`);
            }
        } else {
            pieces.push(
                `<line x1="${width / 2}" y1="${y}" x2="${width / 2}" y2="${y + h}" stroke="${line}" stroke-width="${sw}"/>`,
                `<line x1="${x}" y1="${height / 2}" x2="${x + w}" y2="${height / 2}" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(w, h) * .10}" fill="none" stroke="${line}" stroke-width="${sw}"/>`
            );
            if (labels) {
                pieces.push(`<text x="${width / 2}" y="${y + 24}" fill="${line}" font-size="15" font-weight="700" text-anchor="middle">TACTICS COURT</text>`);
            }
        }

        pieces.push(gridMarkup());
        return pieces.join('');
    }

    function arrowPath(object) {
        if (!object.curve) return `M ${object.x1} ${object.y1} L ${object.x2} ${object.y2}`;
        const midX = (object.x1 + object.x2) / 2;
        const midY = (object.y1 + object.y2) / 2;
        const dx = object.x2 - object.x1;
        const dy = object.y2 - object.y1;
        const length = Math.max(1, Math.hypot(dx, dy));
        const controlX = midX - (dy / length) * object.curve;
        const controlY = midY + (dx / length) * object.curve;
        return `M ${object.x1} ${object.y1} Q ${controlX} ${controlY} ${object.x2} ${object.y2}`;
    }

    function ballMarkup(object) {
        const parts = [`<circle cx="${object.x}" cy="${object.y}" r="${object.size}" fill="${esc(object.color)}" stroke="#0f172a" stroke-width="2" vector-effect="non-scaling-stroke"/>`];

        if (object.sport === 'soccer') {
            parts.push(`<polygon points="${object.x},${object.y - object.size * .45} ${object.x + object.size * .43},${object.y - object.size * .13} ${object.x + object.size * .27},${object.y + object.size * .38} ${object.x - object.size * .27},${object.y + object.size * .38} ${object.x - object.size * .43},${object.y - object.size * .13}" fill="#0f172a"/>`);
        } else if (object.sport === 'basketball') {
            parts.push(`<path d="M ${object.x - object.size} ${object.y} H ${object.x + object.size} M ${object.x} ${object.y - object.size} V ${object.y + object.size} M ${object.x - object.size * .75} ${object.y - object.size * .66} Q ${object.x} ${object.y} ${object.x + object.size * .75} ${object.y + object.size * .66} M ${object.x - object.size * .75} ${object.y + object.size * .66} Q ${object.x} ${object.y} ${object.x + object.size * .75} ${object.y - object.size * .66}" fill="none" stroke="#0f172a" stroke-width="1.5"/>`);
        } else if (object.sport === 'cricket') {
            parts.push(`<path d="M ${object.x - object.size * .75} ${object.y - object.size * .25} Q ${object.x} ${object.y} ${object.x + object.size * .75} ${object.y + object.size * .25}" fill="none" stroke="#ffffff" stroke-width="2"/>`);
        }

        return parts.join('');
    }

    function objectMarkup(object) {
        if (object.type === 'player') {
            const number = object.number || (object.team === 'A' ? 'A' : (object.team === 'B' ? 'B' : 'N'));
            return `<g class="qmx-sports-object" data-object-id="${esc(object.id)}"><circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="${esc(object.color)}" stroke="#ffffff" stroke-width="3"/><circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="none" stroke="#0f172a" stroke-width="1.5" opacity=".55"/><text x="${object.x}" y="${object.y}" fill="${esc(object.textColor)}" font-size="${Math.max(10, object.radius * .75)}" font-weight="800" text-anchor="middle" dominant-baseline="middle">${esc(number)}</text>${object.label ? `<text x="${object.x}" y="${object.y + object.radius + 17}" fill="#0f172a" font-size="13" font-weight="700" text-anchor="middle" paint-order="stroke" stroke="#ffffff" stroke-width="4">${esc(object.label)}</text>` : ''}<circle class="qmx-sports-hit" cx="${object.x}" cy="${object.y}" r="${object.radius + 12}"/></g>`;
        }

        if (object.type === 'ball') {
            return `<g class="qmx-sports-object" data-object-id="${esc(object.id)}">${ballMarkup(object)}<circle class="qmx-sports-hit" cx="${object.x}" cy="${object.y}" r="${object.size + 12}"/></g>`;
        }

        if (object.type === 'arrow') {
            const path = arrowPath(object);
            const labelX = (object.x1 + object.x2) / 2;
            const labelY = (object.y1 + object.y2) / 2 - 9;
            return `<g class="qmx-sports-object" data-object-id="${esc(object.id)}"><path d="${path}" fill="none" stroke="${esc(object.color)}" stroke-width="${object.width}"${object.dash ? ' stroke-dasharray="12 8"' : ''} stroke-linecap="round" marker-end="url(#qmx-sports-editor-arrow)" vector-effect="non-scaling-stroke"/>${object.label ? `<text x="${labelX}" y="${labelY}" fill="${esc(object.color)}" font-size="14" font-weight="800" text-anchor="middle" paint-order="stroke" stroke="#ffffff" stroke-width="4">${esc(object.label)}</text>` : ''}<path class="qmx-sports-hit" d="${path}" fill="none"/></g>`;
        }

        if (object.type === 'zone') {
            const shape = object.shape === 'ellipse'
                ? `<ellipse cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" stroke-dasharray="9 6"/>`
                : `<rect x="${object.x - object.width / 2}" y="${object.y - object.height / 2}" width="${object.width}" height="${object.height}" rx="18" fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}" stroke-dasharray="9 6"/>`;
            const hit = object.shape === 'ellipse'
                ? `<ellipse class="qmx-sports-hit" cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}"/>`
                : `<rect class="qmx-sports-hit" x="${object.x - object.width / 2}" y="${object.y - object.height / 2}" width="${object.width}" height="${object.height}"/>`;
            return `<g class="qmx-sports-object" data-object-id="${esc(object.id)}">${shape}${object.label ? `<text x="${object.x}" y="${object.y}" fill="${esc(object.textColor)}" font-size="18" font-weight="800" text-anchor="middle" dominant-baseline="middle">${esc(object.label)}</text>` : ''}${hit}</g>`;
        }

        if (object.type === 'cone') {
            const points = `${object.x},${object.y - object.size} ${object.x - object.size * .72},${object.y + object.size} ${object.x + object.size * .72},${object.y + object.size}`;
            return `<g class="qmx-sports-object" data-object-id="${esc(object.id)}"><polygon points="${points}" fill="${esc(object.color)}" stroke="#ffffff" stroke-width="2"/><line x1="${object.x - object.size * .75}" y1="${object.y + object.size * .22}" x2="${object.x + object.size * .75}" y2="${object.y + object.size * .22}" stroke="#ffffff" stroke-width="3"/>${object.label ? `<text x="${object.x}" y="${object.y + object.size + 16}" fill="#0f172a" font-size="12" font-weight="700" text-anchor="middle">${esc(object.label)}</text>` : ''}<polygon class="qmx-sports-hit" points="${points}"/></g>`;
        }

        return `<g class="qmx-sports-object" data-object-id="${esc(object.id)}"><text x="${object.x}" y="${object.y}" fill="${esc(object.color)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#ffffff" stroke-width="5">${esc(object.text)}</text><rect class="qmx-sports-hit" x="${object.x - 110}" y="${object.y - 40}" width="220" height="80"/></g>`;
    }

    function objectBounds(object) {
        if (object.type === 'arrow') {
            return {
                minX: Math.min(object.x1, object.x2),
                minY: Math.min(object.y1, object.y2),
                maxX: Math.max(object.x1, object.x2),
                maxY: Math.max(object.y1, object.y2)
            };
        }

        if (object.type === 'zone') {
            return {
                minX: object.x - object.width / 2,
                minY: object.y - object.height / 2,
                maxX: object.x + object.width / 2,
                maxY: object.y + object.height / 2
            };
        }

        const radius = object.type === 'player'
            ? object.radius + 12
            : (object.type === 'ball'
                ? object.size + 12
                : (object.type === 'cone' ? object.size + 12 : 110));

        return {
            minX: object.x - radius,
            minY: object.y - radius,
            maxX: object.x + radius,
            maxY: object.y + radius
        };
    }

    function selectionMarkup() {
        const object = selectedObject();
        if (!object) return '';

        if (object.type === 'arrow') {
            return `<path class="qmx-sports-select" d="${arrowPath(object)}"/><circle class="qmx-sports-handle" data-handle="endpoint-1" cx="${object.x1}" cy="${object.y1}" r="7"/><circle class="qmx-sports-handle" data-handle="endpoint-2" cx="${object.x2}" cy="${object.y2}" r="7"/>`;
        }

        const bounds = objectBounds(object);
        const resize = object.type === 'zone'
            ? `<circle class="qmx-sports-handle" data-handle="resize" cx="${bounds.maxX}" cy="${bounds.maxY}" r="7"/>`
            : '';

        return `<rect class="qmx-sports-select" x="${bounds.minX - 7}" y="${bounds.minY - 7}" width="${bounds.maxX - bounds.minX + 14}" height="${bounds.maxY - bounds.minY + 14}"/>${resize}`;
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;
        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        state.controls.field.innerHTML = fieldMarkup();
        state.controls.objects.innerHTML = state.document.objects.map(objectMarkup).join('');
        state.controls.selection.innerHTML = selectionMarkup();

        if (!options.keepProperties) renderProperties();
        renderSummary();
        updateHistoryButtons();
    }

    function renderSummary() {
        const playersA = state.document.objects.filter((object) => object.type === 'player' && object.team === 'A').length;
        const playersB = state.document.objects.filter((object) => object.type === 'player' && object.team === 'B').length;
        const arrows = state.document.objects.filter((object) => object.type === 'arrow').length;
        const zones = state.document.objects.filter((object) => object.type === 'zone').length;
        state.controls.summary.textContent = `${playersA} Team A · ${playersB} Team B · ${arrows} arrow(s) · ${zones} zone(s)`;
    }

    function renderProperties() {
        const object = selectedObject();

        if (!object) {
            state.controls.props.innerHTML = `<div class="qmx-sports-empty">Select a player, ball, arrow, zone, cone or text.</div>`;
            return;
        }

        if (object.type === 'player') {
            state.controls.props.innerHTML = `
<div class="qmx-sports-fields">
    <label class="qmx-sports-field">Team<select data-object-prop="team"><option value="A"${object.team === 'A' ? ' selected' : ''}>Team A</option><option value="B"${object.team === 'B' ? ' selected' : ''}>Team B</option><option value="neutral"${object.team === 'neutral' ? ' selected' : ''}>Neutral</option></select></label>
    <div class="qmx-sports-row"><label class="qmx-sports-field">Number<input type="text" data-object-prop="number" value="${esc(object.number)}"></label><label class="qmx-sports-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label></div>
    <div class="qmx-sports-row"><label class="qmx-sports-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label><label class="qmx-sports-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label></div>
    <div class="qmx-sports-row"><label class="qmx-sports-field">Player colour<input type="color" data-object-prop="color" value="${object.color}"></label><label class="qmx-sports-field">Text colour<input type="color" data-object-prop="textColor" value="${object.textColor}"></label></div>
    <label class="qmx-sports-field">Radius<input type="number" min="8" max="70" data-object-prop="radius" value="${object.radius}"></label>
</div>`;
            return;
        }

        if (object.type === 'ball') {
            state.controls.props.innerHTML = `
<div class="qmx-sports-fields">
    <label class="qmx-sports-field">Ball type<select data-object-prop="sport"><option value="soccer"${object.sport === 'soccer' ? ' selected' : ''}>Soccer</option><option value="basketball"${object.sport === 'basketball' ? ' selected' : ''}>Basketball</option><option value="cricket"${object.sport === 'cricket' ? ' selected' : ''}>Cricket</option><option value="generic"${object.sport === 'generic' ? ' selected' : ''}>Generic</option></select></label>
    <div class="qmx-sports-row"><label class="qmx-sports-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label><label class="qmx-sports-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label></div>
    <div class="qmx-sports-row"><label class="qmx-sports-field">Size<input type="number" min="5" max="80" data-object-prop="size" value="${object.size}"></label><label class="qmx-sports-field">Colour<input type="color" data-object-prop="color" value="${object.color}"></label></div>
</div>`;
            return;
        }

        if (object.type === 'arrow') {
            state.controls.props.innerHTML = `
<div class="qmx-sports-fields">
    <label class="qmx-sports-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-sports-row"><label class="qmx-sports-field">X1<input type="number" data-object-prop="x1" value="${object.x1.toFixed(1)}"></label><label class="qmx-sports-field">Y1<input type="number" data-object-prop="y1" value="${object.y1.toFixed(1)}"></label></div>
    <div class="qmx-sports-row"><label class="qmx-sports-field">X2<input type="number" data-object-prop="x2" value="${object.x2.toFixed(1)}"></label><label class="qmx-sports-field">Y2<input type="number" data-object-prop="y2" value="${object.y2.toFixed(1)}"></label></div>
    <div class="qmx-sports-row"><label class="qmx-sports-field">Colour<input type="color" data-object-prop="color" value="${object.color}"></label><label class="qmx-sports-field">Width<input type="number" min=".5" max="30" step=".5" data-object-prop="width" value="${object.width}"></label></div>
    <label class="qmx-sports-field">Curve<input type="number" min="-500" max="500" data-object-prop="curve" value="${object.curve}"></label>
    <label class="qmx-sports-check"><input type="checkbox" data-object-prop="dash"${object.dash ? ' checked' : ''}> Dashed pass line</label>
</div>`;
            return;
        }

        if (object.type === 'zone') {
            state.controls.props.innerHTML = `
<div class="qmx-sports-fields">
    <label class="qmx-sports-field">Shape<select data-object-prop="shape"><option value="rectangle"${object.shape === 'rectangle' ? ' selected' : ''}>Rectangle</option><option value="ellipse"${object.shape === 'ellipse' ? ' selected' : ''}>Ellipse</option></select></label>
    <label class="qmx-sports-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-sports-row"><label class="qmx-sports-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label><label class="qmx-sports-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label></div>
    <div class="qmx-sports-row"><label class="qmx-sports-field">Width<input type="number" min="10" data-object-prop="width" value="${object.width}"></label><label class="qmx-sports-field">Height<input type="number" min="10" data-object-prop="height" value="${object.height}"></label></div>
    <div class="qmx-sports-row"><label class="qmx-sports-field">Fill<input type="color" data-object-prop="fill" value="${object.fill}"></label><label class="qmx-sports-field">Stroke<input type="color" data-object-prop="stroke" value="${object.stroke}"></label></div>
    <div class="qmx-sports-row"><label class="qmx-sports-field">Fill opacity<input type="number" min="0" max="1" step=".05" data-object-prop="fillOpacity" value="${object.fillOpacity}"></label><label class="qmx-sports-field">Stroke width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label></div>
</div>`;
            return;
        }

        if (object.type === 'cone') {
            state.controls.props.innerHTML = `
<div class="qmx-sports-fields">
    <label class="qmx-sports-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-sports-row"><label class="qmx-sports-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label><label class="qmx-sports-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label></div>
    <div class="qmx-sports-row"><label class="qmx-sports-field">Size<input type="number" min="5" max="100" data-object-prop="size" value="${object.size}"></label><label class="qmx-sports-field">Colour<input type="color" data-object-prop="color" value="${object.color}"></label></div>
</div>`;
            return;
        }

        state.controls.props.innerHTML = `
<div class="qmx-sports-fields">
    <label class="qmx-sports-field">Text<textarea data-object-prop="text">${esc(object.text)}</textarea></label>
    <div class="qmx-sports-row"><label class="qmx-sports-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label><label class="qmx-sports-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label></div>
    <div class="qmx-sports-row"><label class="qmx-sports-field">Font size<input type="number" min="8" max="120" data-object-prop="fontSize" value="${object.fontSize}"></label><label class="qmx-sports-field">Colour<input type="color" data-object-prop="color" value="${object.color}"></label></div>
    <label class="qmx-sports-check"><input type="checkbox" data-object-prop="fontWeight"${object.fontWeight === 'bold' ? ' checked' : ''}> Bold</label>
</div>`;
    }

    function onDocumentInput(event) {
        const control = event.currentTarget;
        const prop = control.dataset.docProp;
        if (!prop || !state.document) return;

        if (['showFieldLabels', 'showGrid', 'snapToGrid'].includes(prop)) {
            state.document[prop] = control.checked;
        } else if (['width', 'height', 'fieldLineWidth', 'gridSize'].includes(prop)) {
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

    function onPropertyInput(event) {
        const control = event.target.closest('[data-object-prop]');
        const object = selectedObject();
        if (!control || !object) return;

        const prop = control.dataset.objectProp;
        if (['dash'].includes(prop)) {
            object[prop] = control.checked;
        } else if (prop === 'fontWeight') {
            object.fontWeight = control.checked ? 'bold' : 'normal';
        } else if (['team', 'number', 'label', 'sport', 'shape', 'color', 'textColor', 'fill', 'stroke', 'text'].includes(prop)) {
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

        if (state.activeTool === 'player-a' || state.activeTool === 'player-b') {
            const object = playerObject(x, y, state.activeTool === 'player-a' ? 'A' : 'B');
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Player added.');
            return;
        }

        if (state.activeTool === 'ball') {
            const object = ballObject(x, y);
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Ball added.');
            return;
        }

        if (state.activeTool === 'zone') {
            const object = zoneObject(x, y);
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Tactical zone added.');
            return;
        }

        if (state.activeTool === 'cone') {
            const object = coneObject(x, y);
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Cone added.');
            return;
        }

        if (state.activeTool === 'text') {
            const object = textObject(x, y);
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Tactics text added.');
            return;
        }

        if (state.activeTool === 'movement' || state.activeTool === 'pass') {
            const object = arrowObject(x, y, x, y, state.activeTool === 'pass');
            state.document.objects.push(object);
            state.selectedId = object.id;
            state.interaction = {
                type: 'draw-arrow',
                pointerId: event.pointerId,
                objectId: object.id
            };
            state.svg.setPointerCapture(event.pointerId);
            render();
            event.preventDefault();
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
        if (object.type === 'arrow') {
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

        if (interaction.type === 'draw-arrow') {
            object.x2 = snap(point.x);
            object.y2 = snap(point.y);
            render({ keepProperties: true });
            return;
        }

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
        } else if (interaction.type === 'resize' && object.type === 'zone') {
            object.width = Math.max(20, snap(interaction.original.width + dx * 2));
            object.height = Math.max(20, snap(interaction.original.height + dy * 2));
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

        if (interaction.type === 'draw-arrow') {
            const object = state.document.objects.find((item) => item.id === interaction.objectId);
            if (object && Math.hypot(object.x2 - object.x1, object.y2 - object.y1) < 10) {
                object.x2 = object.x1 + 150;
            }
            setTool('select');
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

        if (copy.type === 'arrow') {
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

    function clearTactics() {
        if (state.document.objects.length && !window.confirm('Clear all players and tactics objects?')) return;
        state.document.objects = [];
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Tactics cleared.');
    }

    function setFieldPreset(type) {
        state.document.fieldType = type;

        if (type === 'soccer') {
            state.document.fieldColor = '#15803d';
            state.document.fieldLineColor = '#ffffff';
        } else if (type === 'basketball') {
            state.document.fieldColor = '#c58a4a';
            state.document.fieldLineColor = '#ffffff';
        } else if (type === 'cricket') {
            state.document.fieldColor = '#4d9f4d';
            state.document.fieldLineColor = '#ffffff';
        } else {
            state.document.fieldColor = '#f8fafc';
            state.document.fieldLineColor = '#334155';
        }

        state.document = Diagram.normalizeSpec(state.document);
        syncDocumentControls();
        pushHistory();
        render();
        setStatus(`${type} field preset applied.`);
    }

    function addPlayers(team, positions, labels = []) {
        positions.forEach(([x, y], index) => {
            const object = playerObject(x, y, team, labels[index] || '');
            object.number = String(index + 1);
            state.document.objects.push(object);
        });
    }

    function applyFormation(name) {
        state.document.objects = [];
        state.selectedId = null;

        if (name === '442') {
            setFieldPreset('soccer');
            addPlayers('A', [
                [100, 300],
                [240, 135], [240, 245], [240, 355], [240, 465],
                [470, 120], [470, 240], [470, 360], [470, 480],
                [720, 230], [720, 370]
            ], ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LM', 'LCM', 'RCM', 'RM', 'ST', 'ST']);
        } else if (name === '433') {
            setFieldPreset('soccer');
            addPlayers('A', [
                [100, 300],
                [250, 135], [250, 245], [250, 355], [250, 465],
                [480, 170], [480, 300], [480, 430],
                [730, 145], [760, 300], [730, 455]
            ], ['GK', 'LB', 'LCB', 'RCB', 'RB', 'CM', 'DM', 'CM', 'LW', 'CF', 'RW']);
        } else if (name === 'basket212') {
            setFieldPreset('basketball');
            addPlayers('A', [
                [260, 205], [260, 395],
                [500, 300],
                [740, 205], [740, 395]
            ], ['G', 'G', 'C', 'F', 'F']);
            state.document.objects.push(ballObject(500, 300));
        } else if (name === 'cricket-ring') {
            setFieldPreset('cricket');
            addPlayers('A', [
                [500, 300],
                [500, 140], [500, 460],
                [330, 180], [330, 420],
                [670, 180], [670, 420],
                [220, 300], [780, 300],
                [380, 300], [620, 300]
            ], ['WK', 'Long-on', 'Long-off', 'Cover', 'Mid-wicket', 'Point', 'Square leg', 'Deep cover', 'Deep square', 'Slip', 'Bowler']);
            state.document.objects.push(ballObject(500, 300));
        } else if (name === 'corner') {
            setFieldPreset('soccer');
            addPlayers('A', [[870, 510], [770, 340], [810, 300], [840, 260], [720, 300]], ['CK', 'A1', 'A2', 'A3', 'A4']);
            addPlayers('B', [[900, 300], [860, 350], [860, 250], [820, 385]], ['GK', 'D1', 'D2', 'D3']);
            state.document.objects.push(arrowObject(870, 510, 810, 300, true));
            state.document.objects.push(arrowObject(720, 300, 820, 250, false));
            const zone = zoneObject(835, 300);
            zone.width = 210;
            zone.height = 270;
            zone.shape = 'ellipse';
            zone.label = 'Target zone';
            state.document.objects.push(zone);
        }

        state.document = Diagram.normalizeSpec(state.document);
        pushHistory();
        syncDocumentControls();
        render();
        setStatus('Formation preset inserted.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Sports Field / Tactics document?')) return;
        state.document = createDocument();
        state.selectedId = null;
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Sports Field / Tactics document.');
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
        setStatus('Sports tactics diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'sports-field-tactics')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'sports-field-tactics';
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

        if (state.document.mode !== 'sports-field') {
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
        document.body.dataset.qmxSportsOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(context.initialSpec
            ? 'Existing Sports Field / Tactics diagram loaded.'
            : 'Choose a field, formation or tactics tool.');

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;
        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxSportsOverflow || '';
        delete document.body.dataset.qmxSportsOverflow;
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

        if (spec.mode !== 'sports-field') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }

        open({
            tool: { id: 'sports-layout' },
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
            'sports-layout',
            'sports-field-tactics',
            'sports-field',
            'sports-tactics',
            'sports-diagram',
            'sports',
            'tactics'
        ].forEach((id) => {
            try {
                launcher.registerToolHandler(id, open);
                registered = true;
            } catch (error) {
                // Older registries expose the canonical sports-layout id.
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

    window.QmxSportsFieldEditor = Object.freeze({
        version: '1.0.1',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
