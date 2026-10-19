(function (window, document) {
    'use strict';

    if (window.QmxVennSetEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Venn] Diagram renderer must load first.');
        return;
    }

    const TOOLS = [
        ['select', 'Select', 'নির্বাচন'],
        ['circle-set', 'Circle Set', 'বৃত্ত সেট'],
        ['ellipse-set', 'Ellipse Set', 'উপবৃত্ত সেট'],
        ['text', 'Region Label', 'অঞ্চল লেবেল']
    ];

    const SET_COLOURS = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2'];

    const SHADE_MODES = [
        ['none', 'No shading'],
        ['a', 'Set A'],
        ['b', 'Set B'],
        ['union', 'A ∪ B'],
        ['intersection', 'A ∩ B'],
        ['a-only', 'A \\ B'],
        ['b-only', 'B \\ A'],
        ['symmetric-difference', 'A △ B'],
        ['complement-a', 'A′'],
        ['complement-b', 'B′'],
        ['complement-union', '(A ∪ B)′']
    ];

    const state = {
        root: null,
        svg: null,
        shadeLayer: null,
        setLayer: null,
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

    function uid(prefix = 'venn') {
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
            version: 7,
            id: uid('venn-set'),
            mode: 'venn-set',
            title: 'Venn & Set Diagram',
            width: 1000,
            height: 600,
            background: '#ffffff',
            showUniversalSet: true,
            universalLabel: 'U',
            universalPadding: 55,
            shadeMode: 'none',
            shadeColor: '#f59e0b',
            shadeOpacity: 0.35,
            shadeSetA: '',
            shadeSetB: '',
            objects: []
        };
    }

    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
    }

    function setObjects() {
        return state.document.objects.filter((object) => object.type === 'set');
    }

    function textObjects() {
        return state.document.objects.filter((object) => object.type === 'text');
    }

    function universalBounds() {
        const padding = state.document.universalPadding;
        return {
            x: padding,
            y: padding,
            width: state.document.width - padding * 2,
            height: state.document.height - padding * 2
        };
    }

    function pointFromEvent(event) {
        const point = state.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        const local = matrix ? point.matrixTransform(matrix.inverse()) : point;
        return { x: local.x, y: local.y };
    }

    function nextSetLabel() {
        const labels = setObjects().map((object) => object.label);
        for (const label of ['A', 'B', 'C', 'D', 'E', 'F']) {
            if (!labels.includes(label)) return label;
        }
        return `S${setObjects().length + 1}`;
    }

    function makeSet(shape, x, y) {
        const index = setObjects().length;
        const circular = shape === 'circle';
        return {
            id: uid('set'),
            type: 'set',
            shape,
            label: nextSetLabel(),
            x,
            y,
            rx: circular ? 150 : 180,
            ry: circular ? 150 : 120,
            rotation: 0,
            stroke: SET_COLOURS[index % SET_COLOURS.length],
            fill: SET_COLOURS[index % SET_COLOURS.length],
            fillOpacity: 0.06,
            strokeWidth: 3,
            dash: false,
            opacity: 1,
            labelPosition: 'top'
        };
    }

    function makeText(x, y) {
        return {
            id: uid('text'),
            type: 'text',
            x,
            y,
            text: 'Region',
            textColor: '#0f172a',
            fontSize: 20,
            fontWeight: 'bold',
            rotation: 0,
            opacity: 1
        };
    }

    function setById(id) {
        return setObjects().find((object) => object.id === id) || null;
    }

    function resolvedShadeSets() {
        const sets = setObjects();
        const a = setById(state.document.shadeSetA) || sets[0] || null;
        const b = setById(state.document.shadeSetB) || sets.find((item) => item.id !== a?.id) || null;
        return { a, b };
    }

    function sanitizeId(value) {
        return String(value || 'venn').replace(/[^A-Za-z0-9_-]/g, '');
    }

    function ellipseTag(object, attributes = '') {
        const transform = object.rotation
            ? ` transform="rotate(${object.rotation} ${object.x} ${object.y})"`
            : '';
        return `<ellipse cx="${object.x}" cy="${object.y}" rx="${object.rx}" ry="${object.ry}"${transform}${attributes}/>`;
    }

    function shadeMarkup() {
        const mode = state.document.shadeMode;
        if (mode === 'none') return '';

        const { a, b } = resolvedShadeSets();
        if (!a) return '';

        const bounds = universalBounds();
        const baseId = `qmx-venn-${sanitizeId(state.document.id)}`;
        const colour = esc(state.document.shadeColor);
        const opacity = state.document.shadeOpacity;
        const fillAttrs = ` fill="${colour}" fill-opacity="${opacity}" pointer-events="none"`;
        const universeRect = `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="4"${fillAttrs}/>`;
        const aFill = ellipseTag(a, fillAttrs);
        const bFill = b ? ellipseTag(b, fillAttrs) : '';

        if (mode === 'a') return aFill;
        if (mode === 'b') return bFill;
        if (mode === 'union') return aFill + bFill;

        if (mode === 'intersection' && b) {
            return `<defs><clipPath id="${baseId}-clip-a">${ellipseTag(a, ' fill="#fff"')}</clipPath></defs><g clip-path="url(#${baseId}-clip-a)">${ellipseTag(b, fillAttrs)}</g>`;
        }

        if (mode === 'a-only' && b) {
            return `<defs><mask id="${baseId}-mask-b"><rect width="100%" height="100%" fill="#fff"/>${ellipseTag(b, ' fill="#000"')}</mask></defs><g mask="url(#${baseId}-mask-b)">${aFill}</g>`;
        }

        if (mode === 'b-only' && b) {
            return `<defs><mask id="${baseId}-mask-a"><rect width="100%" height="100%" fill="#fff"/>${ellipseTag(a, ' fill="#000"')}</mask></defs><g mask="url(#${baseId}-mask-a)">${bFill}</g>`;
        }

        if (mode === 'symmetric-difference' && b) {
            return `<defs>
                <mask id="${baseId}-mask-a"><rect width="100%" height="100%" fill="#fff"/>${ellipseTag(a, ' fill="#000"')}</mask>
                <mask id="${baseId}-mask-b"><rect width="100%" height="100%" fill="#fff"/>${ellipseTag(b, ' fill="#000"')}</mask>
            </defs>
            <g mask="url(#${baseId}-mask-b)">${aFill}</g>
            <g mask="url(#${baseId}-mask-a)">${bFill}</g>`;
        }

        if (mode === 'complement-a') {
            return `<defs><mask id="${baseId}-mask-a"><rect width="100%" height="100%" fill="#fff"/>${ellipseTag(a, ' fill="#000"')}</mask></defs><g mask="url(#${baseId}-mask-a)">${universeRect}</g>`;
        }

        if (mode === 'complement-b' && b) {
            return `<defs><mask id="${baseId}-mask-b"><rect width="100%" height="100%" fill="#fff"/>${ellipseTag(b, ' fill="#000"')}</mask></defs><g mask="url(#${baseId}-mask-b)">${universeRect}</g>`;
        }

        if (mode === 'complement-union' && b) {
            return `<defs><mask id="${baseId}-mask-union"><rect width="100%" height="100%" fill="#fff"/>${ellipseTag(a, ' fill="#000"')}${ellipseTag(b, ' fill="#000"')}</mask></defs><g mask="url(#${baseId}-mask-union)">${universeRect}</g>`;
        }

        return '';
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
        if (document.getElementById('qmx-venn-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-venn-editor-styles';
        style.textContent = `
.qmx-venn-editor[hidden]{display:none!important}
.qmx-venn-editor{position:fixed;inset:0;z-index:10200;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.7);backdrop-filter:blur(2px)}
.qmx-venn-dialog{width:min(1550px,100%);height:min(96vh,980px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.38)}
.qmx-venn-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-venn-title{margin-right:auto}.qmx-venn-title strong{display:block}.qmx-venn-title span{display:block;color:#64748b;font-size:11px}
.qmx-venn-btn,.qmx-venn-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-venn-btn:hover,.qmx-venn-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-venn-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-venn-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-venn-btn.is-danger{color:#b91c1c}.qmx-venn-close{font-size:20px;line-height:1}
.qmx-venn-workspace{min-height:0;flex:1;display:grid;grid-template-columns:220px minmax(0,1fr) 305px;gap:10px;padding:10px}
.qmx-venn-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-venn-panel h3{margin:0 0 8px;font-size:13px}.qmx-venn-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-venn-tool{min-height:58px;padding:6px 5px;font-size:10px}.qmx-venn-tool span{display:block;margin-top:2px;color:#64748b;font-size:9px;font-weight:500}
.qmx-venn-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-venn-quick{display:grid;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0}
.qmx-venn-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-venn-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-venn-stage{display:block;width:min(100%,1180px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none;user-select:none}
.qmx-venn-object{cursor:move}.qmx-venn-hit{fill:transparent;stroke:transparent;stroke-width:20;pointer-events:all}
.qmx-venn-select{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-venn-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair;pointer-events:all}
.qmx-venn-fields{display:grid;gap:9px}.qmx-venn-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-venn-field input,.qmx-venn-field textarea,.qmx-venn-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-venn-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-venn-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-venn-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-venn-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-venn-summary{margin-top:10px;padding:9px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.55}
.qmx-venn-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-venn-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-venn-footer .qmx-venn-btn:first-of-type{margin-left:auto}
@media(max-width:1050px){.qmx-venn-workspace{grid-template-columns:180px minmax(0,1fr) 250px}.qmx-venn-tools{grid-template-columns:1fr}}
@media(max-width:760px){.qmx-venn-editor{padding:0}.qmx-venn-dialog{width:100%;height:100%;border-radius:0}.qmx-venn-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(350px,1fr) auto;overflow:auto}.qmx-venn-panel{overflow:visible}.qmx-venn-tools{grid-template-columns:repeat(2,1fr)}.qmx-venn-header{overflow-x:auto}.qmx-venn-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-venn-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-venn-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-venn-title">
<header class="qmx-venn-header">
    <div class="qmx-venn-title">
        <strong id="qmx-venn-title">Venn & Set Diagram</strong>
        <span>Universal set, circle/ellipse sets, region shading and labels</span>
    </div>
    <button type="button" class="qmx-venn-btn" data-venn-new>New</button>
    <button type="button" class="qmx-venn-btn" data-venn-undo>Undo</button>
    <button type="button" class="qmx-venn-btn" data-venn-redo>Redo</button>
    <button type="button" class="qmx-venn-btn" data-venn-duplicate>Duplicate</button>
    <button type="button" class="qmx-venn-btn is-danger" data-venn-delete>Delete</button>
    <button type="button" class="qmx-venn-btn qmx-venn-close" data-venn-close aria-label="Close">×</button>
</header>
<div class="qmx-venn-workspace">
    <aside class="qmx-venn-panel">
        <h3>Set tools</h3>
        <div class="qmx-venn-tools" data-venn-tools></div>
        <div class="qmx-venn-quick">
            <button type="button" class="qmx-venn-btn" data-venn-two-set>Two-set preset</button>
            <button type="button" class="qmx-venn-btn" data-venn-three-set>Three-set preset</button>
            <button type="button" class="qmx-venn-btn" data-venn-clear-shading>Clear shading</button>
        </div>
        <p class="qmx-venn-help">
            Add circle or ellipse sets, drag them into position, then choose Set A, Set B and a shading operation.
            Region labels remain independently draggable.
        </p>
    </aside>
    <main class="qmx-venn-stage-wrap">
        <svg class="qmx-venn-stage" data-venn-svg viewBox="0 0 1000 600" tabindex="0" aria-label="Venn and set diagram canvas">
            <rect data-venn-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-venn-shade-layer></g>
            <g data-venn-set-layer></g>
            <g data-venn-text-layer></g>
            <g data-venn-selection-layer></g>
        </svg>
    </main>
    <aside class="qmx-venn-panel">
        <h3>Document</h3>
        <div class="qmx-venn-fields">
            <label class="qmx-venn-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-venn-row">
                <label class="qmx-venn-field">Width<input type="number" min="320" max="2400" data-doc-prop="width"></label>
                <label class="qmx-venn-field">Height<input type="number" min="220" max="1800" data-doc-prop="height"></label>
            </div>
            <label class="qmx-venn-field">Background<input type="color" data-doc-prop="background"></label>
            <label class="qmx-venn-check"><input type="checkbox" data-doc-prop="showUniversalSet"> Show universal set</label>
            <div class="qmx-venn-row">
                <label class="qmx-venn-field">Universal label<input type="text" data-doc-prop="universalLabel"></label>
                <label class="qmx-venn-field">Padding<input type="number" min="10" max="250" data-doc-prop="universalPadding"></label>
            </div>
            <label class="qmx-venn-field">Shading operation
                <select data-doc-prop="shadeMode">
                    ${SHADE_MODES.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('')}
                </select>
            </label>
            <div class="qmx-venn-row">
                <label class="qmx-venn-field">Set A<select data-doc-prop="shadeSetA"></select></label>
                <label class="qmx-venn-field">Set B<select data-doc-prop="shadeSetB"></select></label>
            </div>
            <div class="qmx-venn-row">
                <label class="qmx-venn-field">Shade colour<input type="color" data-doc-prop="shadeColor"></label>
                <label class="qmx-venn-field">Opacity<input type="number" min="0" max="1" step=".05" data-doc-prop="shadeOpacity"></label>
            </div>
        </div>
        <hr class="qmx-venn-divider">
        <h3>Selected object</h3>
        <div data-venn-properties></div>
        <div class="qmx-venn-summary" data-venn-summary></div>
    </aside>
</div>
<footer class="qmx-venn-footer">
    <span class="qmx-venn-status" data-venn-status aria-live="polite"></span>
    <button type="button" class="qmx-venn-btn" data-venn-export-svg>Export SVG</button>
    <button type="button" class="qmx-venn-btn" data-venn-export-png>Export PNG</button>
    <button type="button" class="qmx-venn-btn is-primary" data-venn-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.svg = root.querySelector('[data-venn-svg]');
        state.shadeLayer = root.querySelector('[data-venn-shade-layer]');
        state.setLayer = root.querySelector('[data-venn-set-layer]');
        state.textLayer = root.querySelector('[data-venn-text-layer]');
        state.selectionLayer = root.querySelector('[data-venn-selection-layer]');
        state.controls = {
            bg: root.querySelector('[data-venn-bg]'),
            tools: root.querySelector('[data-venn-tools]'),
            props: root.querySelector('[data-venn-properties]'),
            summary: root.querySelector('[data-venn-summary]'),
            status: root.querySelector('[data-venn-status]'),
            undo: root.querySelector('[data-venn-undo]'),
            redo: root.querySelector('[data-venn-redo]')
        };

        TOOLS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-venn-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        state.controls.tools.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (button) setTool(button.dataset.tool);
        });

        root.querySelector('[data-venn-close]').addEventListener('click', close);
        root.querySelector('[data-venn-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-venn-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-venn-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-venn-two-set]').addEventListener('click', twoSetPreset);
        root.querySelector('[data-venn-three-set]').addEventListener('click', threeSetPreset);
        root.querySelector('[data-venn-clear-shading]').addEventListener('click', clearShading);
        root.querySelector('[data-venn-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-venn-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-venn-insert]').addEventListener('click', insertIntoQuestion);

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
            ? 'Select and drag sets or region labels.'
            : `Click the canvas to place ${TOOLS.find(([id]) => id === state.activeTool)?.[1] || 'object'}.`);
    }

    function refreshSetSelectors() {
        const sets = setObjects();
        const options = [
            '<option value="">Automatic</option>',
            ...sets.map((object) => `<option value="${esc(object.id)}">${esc(object.label || object.id)}</option>`)
        ].join('');

        ['shadeSetA', 'shadeSetB'].forEach((prop) => {
            const control = state.root.querySelector(`[data-doc-prop="${prop}"]`);
            if (!control) return;
            const value = state.document[prop] || '';
            control.innerHTML = options;
            control.value = sets.some((object) => object.id === value) ? value : '';
        });
    }

    function onDocumentInput(event) {
        const control = event.currentTarget;
        const prop = control.dataset.docProp;
        if (!prop || !state.document) return;

        if (prop === 'showUniversalSet') {
            state.document[prop] = control.checked;
        } else if (['width', 'height', 'universalPadding', 'shadeOpacity'].includes(prop)) {
            state.document[prop] = Number(control.value);
        } else {
            state.document[prop] = control.value;
        }

        state.document = Diagram.normalizeSpec(state.document);
        render();
    }

    function syncDocumentControls() {
        refreshSetSelectors();
        state.root.querySelectorAll('[data-doc-prop]').forEach((control) => {
            const value = state.document[control.dataset.docProp];
            if (control.type === 'checkbox') control.checked = Boolean(value);
            else control.value = value ?? '';
        });
    }

    function setMarkup(object) {
        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const transform = object.rotation
            ? ` transform="rotate(${object.rotation} ${object.x} ${object.y})"`
            : '';
        const labelY = object.labelPosition === 'bottom'
            ? object.y + object.ry + 25
            : object.y - object.ry - 14;

        return `
<g class="qmx-venn-object" data-object-id="${esc(object.id)}">
    <ellipse cx="${object.x}" cy="${object.y}" rx="${object.rx}" ry="${object.ry}"${transform} fill="${esc(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>
    <text x="${object.x}" y="${labelY}" fill="${esc(object.stroke)}" font-size="20" font-weight="700" text-anchor="middle">${esc(object.label)}</text>
    <ellipse class="qmx-venn-hit" cx="${object.x}" cy="${object.y}" rx="${object.rx}" ry="${object.ry}"${transform}/>
</g>`;
    }

    function textMarkup(object) {
        return `
<g class="qmx-venn-object" data-object-id="${esc(object.id)}">
    <text x="${object.x}" y="${object.y}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})">${esc(object.text)}</text>
    <rect class="qmx-venn-hit" x="${object.x - 70}" y="${object.y - 30}" width="140" height="60"/>
</g>`;
    }

    function universalMarkup() {
        if (!state.document.showUniversalSet) return '';
        const bounds = universalBounds();
        return `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="5" fill="none" stroke="#334155" stroke-width="2.5" vector-effect="non-scaling-stroke"/><text x="${bounds.x + 15}" y="${bounds.y + 27}" fill="#0f172a" font-size="20" font-weight="700">${esc(state.document.universalLabel)}</text>`;
    }

    function selectionMarkup() {
        const object = selectedObject();
        if (!object) return '';

        if (object.type === 'set') {
            return `
<rect class="qmx-venn-select" x="${object.x - object.rx - 8}" y="${object.y - object.ry - 8}" width="${object.rx * 2 + 16}" height="${object.ry * 2 + 16}"/>
<circle class="qmx-venn-handle" data-handle="set-rx" cx="${object.x + object.rx}" cy="${object.y}" r="7"/>
<circle class="qmx-venn-handle" data-handle="set-ry" cx="${object.x}" cy="${object.y - object.ry}" r="7"/>`;
        }

        return `<rect class="qmx-venn-select" x="${object.x - 75}" y="${object.y - 35}" width="150" height="70"/>`;
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;

        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        state.shadeLayer.innerHTML = universalMarkup() + shadeMarkup();
        state.setLayer.innerHTML = setObjects().map(setMarkup).join('');
        state.textLayer.innerHTML = textObjects().map(textMarkup).join('');
        state.selectionLayer.innerHTML = selectionMarkup();

        refreshSetSelectors();
        if (!options.keepProperties) renderProperties();
        renderSummary();
        updateHistoryButtons();
    }

    function renderSummary() {
        const { a, b } = resolvedShadeSets();
        const operation = SHADE_MODES.find(([value]) => value === state.document.shadeMode)?.[1] || 'No shading';
        state.controls.summary.textContent =
            `${setObjects().length} set(s) · ${operation}` +
            (a ? ` · A = ${a.label}` : '') +
            (b ? ` · B = ${b.label}` : '');
    }

    function renderProperties() {
        const object = selectedObject();

        if (!object) {
            state.controls.props.innerHTML = `<div class="qmx-venn-empty">Select a set or region label.</div>`;
            return;
        }

        if (object.type === 'set') {
            state.controls.props.innerHTML = `
<div class="qmx-venn-fields">
    <label class="qmx-venn-field">Shape
        <select data-object-prop="shape">
            <option value="circle"${object.shape === 'circle' ? ' selected' : ''}>Circle</option>
            <option value="ellipse"${object.shape === 'ellipse' ? ' selected' : ''}>Ellipse</option>
        </select>
    </label>
    <label class="qmx-venn-field">Set label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-venn-row">
        <label class="qmx-venn-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-venn-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-venn-row">
        <label class="qmx-venn-field">Radius X<input type="number" min="20" data-object-prop="rx" value="${object.rx.toFixed(1)}"></label>
        <label class="qmx-venn-field">Radius Y<input type="number" min="20" data-object-prop="ry" value="${object.ry.toFixed(1)}"></label>
    </div>
    <div class="qmx-venn-row">
        <label class="qmx-venn-field">Rotation<input type="number" step="5" data-object-prop="rotation" value="${object.rotation}"></label>
        <label class="qmx-venn-field">Line width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
    </div>
    <div class="qmx-venn-row">
        <label class="qmx-venn-field">Line colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-venn-field">Fill colour<input type="color" data-object-prop="fill" value="${object.fill}"></label>
    </div>
    <label class="qmx-venn-field">Fill opacity<input type="number" min="0" max="1" step=".05" data-object-prop="fillOpacity" value="${object.fillOpacity}"></label>
    <label class="qmx-venn-field">Label position
        <select data-object-prop="labelPosition">
            <option value="top"${object.labelPosition === 'top' ? ' selected' : ''}>Top</option>
            <option value="bottom"${object.labelPosition === 'bottom' ? ' selected' : ''}>Bottom</option>
        </select>
    </label>
    <label class="qmx-venn-check"><input type="checkbox" data-object-prop="dash"${object.dash ? ' checked' : ''}> Dashed border</label>
</div>`;
            return;
        }

        state.controls.props.innerHTML = `
<div class="qmx-venn-fields">
    <label class="qmx-venn-field">Text<textarea data-object-prop="text">${esc(object.text)}</textarea></label>
    <div class="qmx-venn-row">
        <label class="qmx-venn-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-venn-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-venn-row">
        <label class="qmx-venn-field">Font size<input type="number" min="8" max="96" data-object-prop="fontSize" value="${object.fontSize}"></label>
        <label class="qmx-venn-field">Rotation<input type="number" data-object-prop="rotation" value="${object.rotation}"></label>
    </div>
    <label class="qmx-venn-field">Text colour<input type="color" data-object-prop="textColor" value="${object.textColor}"></label>
    <label class="qmx-venn-check"><input type="checkbox" data-object-prop="fontWeight"${object.fontWeight === 'bold' ? ' checked' : ''}> Bold</label>
</div>`;
    }

    function onPropertyInput(event) {
        const control = event.target.closest('[data-object-prop]');
        const object = selectedObject();
        if (!control || !object) return;

        const prop = control.dataset.objectProp;

        if (prop === 'dash') {
            object.dash = control.checked;
        } else if (prop === 'fontWeight') {
            object.fontWeight = control.checked ? 'bold' : 'normal';
        } else if ([
            'shape', 'label', 'stroke', 'fill', 'labelPosition',
            'text', 'textColor'
        ].includes(prop)) {
            object[prop] = control.value;

            if (prop === 'shape' && object.type === 'set') {
                if (object.shape === 'circle') {
                    const radius = (object.rx + object.ry) / 2;
                    object.rx = radius;
                    object.ry = radius;
                }
            }
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

        const point = pointFromEvent(event);

        if (state.activeTool === 'circle-set' || state.activeTool === 'ellipse-set') {
            const shape = state.activeTool === 'circle-set' ? 'circle' : 'ellipse';
            const object = makeSet(shape, point.x, point.y);
            state.document.objects.push(object);
            state.selectedId = object.id;

            if (!state.document.shadeSetA) {
                state.document.shadeSetA = object.id;
            } else if (!state.document.shadeSetB && state.document.shadeSetA !== object.id) {
                state.document.shadeSetB = object.id;
            }

            pushHistory();
            setTool('select');
            render();
            setStatus(`${object.label} set added.`);
            return;
        }

        if (state.activeTool === 'text') {
            const object = makeText(point.x, point.y);
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Region label added.');
            return;
        }

        if (state.activeTool !== 'select') return;

        const handle = event.target.closest('[data-handle]');
        const group = event.target.closest('[data-object-id]');

        if (handle && selectedObject()?.type === 'set') {
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

        if (!group) {
            selectObject(null);
            return;
        }

        const id = group.dataset.objectId;
        const object = state.document.objects.find((item) => item.id === id);
        if (!object) return;

        if (id !== state.selectedId) selectObject(id);

        state.interaction = {
            type: 'move',
            pointerId: event.pointerId,
            start: point,
            original: clone(object)
        };
        state.svg.setPointerCapture(event.pointerId);
        event.preventDefault();
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
            object.x = interaction.original.x + dx;
            object.y = interaction.original.y + dy;
        } else if (interaction.type === 'set-rx' && object.type === 'set') {
            object.rx = Math.max(20, Math.abs(point.x - object.x));
            if (object.shape === 'circle') object.ry = object.rx;
        } else if (interaction.type === 'set-ry' && object.type === 'set') {
            object.ry = Math.max(20, Math.abs(point.y - object.y));
            if (object.shape === 'circle') object.rx = object.ry;
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
        copy.x += 35;
        copy.y += 35;

        if (copy.type === 'set') {
            copy.label = nextSetLabel();
            copy.stroke = SET_COLOURS[setObjects().length % SET_COLOURS.length];
            copy.fill = copy.stroke;
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

        if (state.document.shadeSetA === object.id) state.document.shadeSetA = '';
        if (state.document.shadeSetB === object.id) state.document.shadeSetB = '';

        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Object deleted.');
    }

    function clearShading() {
        state.document.shadeMode = 'none';
        pushHistory();
        syncDocumentControls();
        render();
        setStatus('Shading cleared.');
    }

    function applyPreset(count) {
        state.document.objects = state.document.objects.filter((object) => object.type === 'text');
        const cx = state.document.width / 2;
        const cy = state.document.height / 2 + 10;

        const a = makeSet('circle', cx - 105, cy);
        a.label = 'A';
        a.rx = a.ry = 170;

        const b = makeSet('circle', cx + 105, cy);
        b.label = 'B';
        b.rx = b.ry = 170;

        const sets = [a, b];

        if (count === 3) {
            a.y = cy + 55;
            b.y = cy + 55;

            const c = makeSet('circle', cx, cy - 95);
            c.label = 'C';
            c.rx = c.ry = 170;
            sets.push(c);
        }

        state.document.objects.unshift(...sets);
        state.document.shadeSetA = a.id;
        state.document.shadeSetB = b.id;
        state.document.shadeMode = 'intersection';
        state.selectedId = a.id;
        pushHistory();
        syncDocumentControls();
        render();
    }

    function twoSetPreset() {
        applyPreset(2);
        setStatus('Two-set preset inserted.');
    }

    function threeSetPreset() {
        applyPreset(3);
        setStatus('Three-set preset inserted.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Venn & Set diagram?')) return;

        state.document = createDocument();
        state.selectedId = null;
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Venn & Set diagram.');
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
        setStatus('Venn & Set diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'venn-set-diagram')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'venn-set-diagram';
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

        if (state.document.mode !== 'venn-set') {
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
        document.body.dataset.qmxVennOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(context.initialSpec
            ? 'Existing Venn & Set diagram loaded.'
            : 'Add sets or choose a preset.');

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;

        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxVennOverflow || '';
        delete document.body.dataset.qmxVennOverflow;
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

        if (spec.mode !== 'venn-set') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }

        open({
            tool: { id: 'venn-set' },
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
            'venn-diagram',
            'venn-set',
            'venn',
            'set-diagram',
            'venn-tree'
        ].forEach((id) => {
            try {
                launcher.registerToolHandler(id, open);
                registered = true;
            } catch (error) {
                // Older registries only expose the canonical venn-diagram id.
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

    window.QmxVennSetEditor = Object.freeze({
        version: '1.0.1',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
