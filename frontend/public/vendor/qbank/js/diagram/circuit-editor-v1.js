(function (window, document) {
    'use strict';

    if (window.QmxCircuitEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Circuit] Diagram renderer must load first.');
        return;
    }

    const SYMBOLS = [
        ['select', 'Select', 'নির্বাচন'],
        ['wire', 'Wire', 'তার'],
        ['junction', 'Junction', 'সংযোগবিন্দু'],
        ['resistor', 'Resistor', 'রোধক'],
        ['capacitor', 'Capacitor', 'ধারক'],
        ['inductor', 'Inductor', 'আবেশক'],
        ['cell', 'Cell', 'কোষ'],
        ['battery', 'Battery', 'ব্যাটারি'],
        ['dc-source', 'DC Source', 'ডিসি উৎস'],
        ['ac-source', 'AC Source', 'এসি উৎস'],
        ['switch', 'Switch', 'সুইচ'],
        ['lamp', 'Lamp', 'বাতি'],
        ['fuse', 'Fuse', 'ফিউজ'],
        ['diode', 'Diode', 'ডায়োড'],
        ['led', 'LED', 'এলইডি'],
        ['ammeter', 'Ammeter', 'অ্যামিটার'],
        ['voltmeter', 'Voltmeter', 'ভোল্টমিটার'],
        ['ground', 'Ground', 'গ্রাউন্ড']
    ];

    const COMPONENT_DEFAULTS = {
        junction: { w: 22, h: 22, label: '', value: '' },
        resistor: { w: 120, h: 64, label: 'R1', value: '1 kΩ' },
        capacitor: { w: 110, h: 70, label: 'C1', value: '10 μF' },
        inductor: { w: 125, h: 70, label: 'L1', value: '10 mH' },
        cell: { w: 110, h: 70, label: 'E1', value: '1.5 V' },
        battery: { w: 130, h: 75, label: 'B1', value: '9 V' },
        'dc-source': { w: 110, h: 80, label: 'V1', value: 'DC' },
        'ac-source': { w: 110, h: 80, label: 'V1', value: 'AC' },
        switch: { w: 120, h: 70, label: 'S1', value: '' },
        lamp: { w: 110, h: 80, label: 'L1', value: '' },
        fuse: { w: 115, h: 65, label: 'F1', value: '' },
        diode: { w: 115, h: 65, label: 'D1', value: '' },
        led: { w: 125, h: 80, label: 'LED1', value: '' },
        ammeter: { w: 110, h: 80, label: 'A1', value: '' },
        voltmeter: { w: 110, h: 80, label: 'V1', value: '' },
        ground: { w: 70, h: 90, label: 'GND', value: '' }
    };

    const state = {
        root: null,
        svg: null,
        gridLayer: null,
        wireLayer: null,
        componentLayer: null,
        draftLayer: null,
        terminalLayer: null,
        selectionLayer: null,
        context: null,
        document: null,
        activeTool: 'select',
        selectedId: null,
        interaction: null,
        wireDraft: null,
        history: [],
        historyIndex: -1,
        controls: {}
    };

    function uid(prefix = 'circuit') {
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
            version: 4,
            id: uid('circuit'),
            mode: 'circuit',
            title: 'Circuit Diagram',
            width: 1000,
            height: 600,
            background: '#ffffff',
            gridSize: 20,
            showGrid: true,
            snap: true,
            objects: []
        };
    }

    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
    }

    function components() {
        return state.document.objects.filter((object) => object.type === 'component');
    }

    function wires() {
        return state.document.objects.filter((object) => object.type === 'wire');
    }

    function snapValue(value) {
        const grid = state.document?.gridSize || 20;
        return state.document?.snap ? Math.round(value / grid) * grid : value;
    }

    function pointFromEvent(event) {
        const svgPoint = state.svg.createSVGPoint();
        svgPoint.x = event.clientX;
        svgPoint.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        const local = matrix ? svgPoint.matrixTransform(matrix.inverse()) : svgPoint;
        return { x: snapValue(local.x), y: snapValue(local.y) };
    }

    function baseTerminals(symbol) {
        if (symbol === 'ground') return [{ id: 't', x: 0, y: -30 }];
        if (symbol === 'junction') return [{ id: 't', x: 0, y: 0 }];
        return [
            { id: 'a', x: -50, y: 0 },
            { id: 'b', x: 50, y: 0 }
        ];
    }

    function terminalWorld(component, terminalId) {
        const terminal = baseTerminals(component.symbol)
            .find((item) => item.id === terminalId) || baseTerminals(component.symbol)[0];

        let x = terminal.x * (component.w / 100);
        let y = terminal.y * (component.h / 60);

        if (component.flipX) x = -x;

        const radians = (Number(component.rotation) || 0) * Math.PI / 180;
        const rx = x * Math.cos(radians) - y * Math.sin(radians);
        const ry = x * Math.sin(radians) + y * Math.cos(radians);

        return {
            x: component.x + rx,
            y: component.y + ry
        };
    }

    function resolveAnchor(anchor, fallbackPoint) {
        if (!anchor?.componentId) return fallbackPoint;
        const component = components().find((item) => item.id === anchor.componentId);
        return component
            ? terminalWorld(component, anchor.terminalId)
            : fallbackPoint;
    }

    function wireEndpoints(wire) {
        return {
            start: resolveAnchor(wire.startAnchor, wire.startPoint),
            end: resolveAnchor(wire.endAnchor, wire.endPoint)
        };
    }

    function wirePathPoints(wire, endOverride = null) {
        const endpoints = wireEndpoints(wire);
        const start = endpoints.start;
        const end = endOverride || endpoints.end;

        if (wire.route === 'direct') return [start, end];

        if (wire.horizontalFirst !== false) {
            const middleX = (start.x + end.x) / 2;
            return [
                start,
                { x: middleX, y: start.y },
                { x: middleX, y: end.y },
                end
            ];
        }

        const middleY = (start.y + end.y) / 2;
        return [
            start,
            { x: start.x, y: middleY },
            { x: end.x, y: middleY },
            end
        ];
    }

    function pointsAttribute(points) {
        return points.map((point) => `${point.x},${point.y}`).join(' ');
    }

    function nearestTerminal(point, maxDistance = 18) {
        let best = null;
        let distance = maxDistance;

        components().forEach((component) => {
            baseTerminals(component.symbol).forEach((terminal) => {
                const world = terminalWorld(component, terminal.id);
                const current = Math.hypot(world.x - point.x, world.y - point.y);
                if (current < distance) {
                    distance = current;
                    best = {
                        anchor: {
                            componentId: component.id,
                            terminalId: terminal.id
                        },
                        point: world
                    };
                }
            });
        });

        return best;
    }

    function createComponent(symbol, x, y) {
        const defaults = COMPONENT_DEFAULTS[symbol] || COMPONENT_DEFAULTS.resistor;
        return {
            id: uid(symbol),
            type: 'component',
            symbol,
            x,
            y,
            w: defaults.w,
            h: defaults.h,
            rotation: 0,
            flipX: false,
            label: defaults.label,
            value: defaults.value,
            stroke: '#0f172a',
            fill: '#ffffff',
            strokeWidth: 2.4,
            opacity: 1
        };
    }

    function createWire(startData, endData) {
        return {
            id: uid('wire'),
            type: 'wire',
            startAnchor: startData.anchor || null,
            endAnchor: endData.anchor || null,
            startPoint: clone(startData.point),
            endPoint: clone(endData.point),
            route: 'orthogonal',
            horizontalFirst: true,
            stroke: '#0f172a',
            strokeWidth: 2.5,
            dash: false,
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
        state.wireDraft = null;
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
        if (document.getElementById('qmx-circuit-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-circuit-editor-styles';
        style.textContent = `
.qmx-circuit-editor[hidden]{display:none!important}
.qmx-circuit-editor{position:fixed;inset:0;z-index:10140;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.7);backdrop-filter:blur(2px)}
.qmx-circuit-dialog{width:min(1550px,100%);height:min(96vh,980px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.38)}
.qmx-circuit-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-circuit-title{margin-right:auto}.qmx-circuit-title strong{display:block}.qmx-circuit-title span{display:block;color:#64748b;font-size:11px}
.qmx-circuit-btn,.qmx-circuit-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-circuit-btn:hover,.qmx-circuit-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-circuit-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-circuit-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-circuit-btn.is-danger{color:#b91c1c}.qmx-circuit-close{font-size:20px;line-height:1}
.qmx-circuit-workspace{min-height:0;flex:1;display:grid;grid-template-columns:225px minmax(0,1fr) 290px;gap:10px;padding:10px}
.qmx-circuit-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-circuit-panel h3{margin:0 0 8px;font-size:13px}.qmx-circuit-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-circuit-tool{min-height:54px;padding:6px 5px;font-size:10px}.qmx-circuit-tool span{display:block;margin-top:2px;color:#64748b;font-size:9px;font-weight:500}
.qmx-circuit-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-circuit-quick{display:grid;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0}
.qmx-circuit-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-circuit-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-circuit-stage{display:block;width:min(100%,1180px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none;user-select:none}
.qmx-circuit-component,.qmx-circuit-wire{cursor:move}
.qmx-circuit-hit{fill:none;stroke:transparent;stroke-width:18;pointer-events:stroke}
.qmx-circuit-component-hit{fill:transparent;stroke:transparent;stroke-width:14;pointer-events:all}
.qmx-circuit-terminal{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair;pointer-events:all}
.qmx-circuit-terminal.is-connected{fill:#2563eb}
.qmx-circuit-select-box{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-circuit-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair;pointer-events:all}
.qmx-circuit-draft{fill:none;stroke:#2563eb;stroke-width:3;stroke-dasharray:7 5;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-circuit-fields{display:grid;gap:9px}.qmx-circuit-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-circuit-field input,.qmx-circuit-field textarea,.qmx-circuit-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-circuit-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-circuit-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-circuit-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-circuit-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-circuit-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-circuit-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-circuit-footer .qmx-circuit-btn:first-of-type{margin-left:auto}
@media(max-width:1050px){.qmx-circuit-workspace{grid-template-columns:180px minmax(0,1fr) 245px}.qmx-circuit-tools{grid-template-columns:1fr}}
@media(max-width:760px){.qmx-circuit-editor{padding:0}.qmx-circuit-dialog{width:100%;height:100%;border-radius:0}.qmx-circuit-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(350px,1fr) auto;overflow:auto}.qmx-circuit-panel{overflow:visible}.qmx-circuit-tools{grid-template-columns:repeat(4,1fr)}.qmx-circuit-header{overflow-x:auto}.qmx-circuit-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-circuit-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-circuit-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-circuit-title">
<header class="qmx-circuit-header">
    <div class="qmx-circuit-title">
        <strong id="qmx-circuit-title">Circuit Diagram</strong>
        <span>Electrical components, terminals and connectivity-aware wires</span>
    </div>
    <button type="button" class="qmx-circuit-btn" data-circuit-new>New</button>
    <button type="button" class="qmx-circuit-btn" data-circuit-undo>Undo</button>
    <button type="button" class="qmx-circuit-btn" data-circuit-redo>Redo</button>
    <button type="button" class="qmx-circuit-btn" data-circuit-rotate>Rotate 90°</button>
    <button type="button" class="qmx-circuit-btn" data-circuit-flip>Flip</button>
    <button type="button" class="qmx-circuit-btn" data-circuit-duplicate>Duplicate</button>
    <button type="button" class="qmx-circuit-btn is-danger" data-circuit-delete>Delete</button>
    <button type="button" class="qmx-circuit-btn qmx-circuit-close" data-circuit-close aria-label="Close">×</button>
</header>
<div class="qmx-circuit-workspace">
    <aside class="qmx-circuit-panel">
        <h3>Components</h3>
        <div class="qmx-circuit-tools" data-circuit-tools></div>
        <div class="qmx-circuit-quick">
            <button type="button" class="qmx-circuit-btn" data-circuit-series>Insert series circuit</button>
            <button type="button" class="qmx-circuit-btn" data-circuit-clear-wires>Remove all wires</button>
        </div>
        <p class="qmx-circuit-help">
            Wire tool: click a terminal or canvas point, then click the destination.
            Blue terminal dots indicate connection points. Connected wires follow components when moved or rotated.
        </p>
    </aside>
    <main class="qmx-circuit-stage-wrap">
        <svg class="qmx-circuit-stage" data-circuit-svg viewBox="0 0 1000 600" tabindex="0" aria-label="Circuit diagram canvas">
            <rect data-circuit-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-circuit-grid-layer></g>
            <g data-circuit-wire-layer></g>
            <g data-circuit-component-layer></g>
            <g data-circuit-draft-layer></g>
            <g data-circuit-terminal-layer></g>
            <g data-circuit-selection-layer></g>
        </svg>
    </main>
    <aside class="qmx-circuit-panel">
        <h3>Document</h3>
        <div class="qmx-circuit-fields">
            <label class="qmx-circuit-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-circuit-row">
                <label class="qmx-circuit-field">Width<input type="number" min="240" max="2400" data-doc-prop="width"></label>
                <label class="qmx-circuit-field">Height<input type="number" min="180" max="1800" data-doc-prop="height"></label>
            </div>
            <label class="qmx-circuit-field">Grid size<input type="number" min="5" max="100" data-doc-prop="gridSize"></label>
            <label class="qmx-circuit-field">Background<input type="color" data-doc-prop="background"></label>
            <label class="qmx-circuit-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label>
            <label class="qmx-circuit-check"><input type="checkbox" data-doc-prop="snap"> Snap to grid</label>
        </div>
        <hr class="qmx-circuit-divider">
        <h3>Selected object</h3>
        <div data-circuit-properties></div>
    </aside>
</div>
<footer class="qmx-circuit-footer">
    <span class="qmx-circuit-status" data-circuit-status aria-live="polite"></span>
    <button type="button" class="qmx-circuit-btn" data-circuit-export-svg>Export SVG</button>
    <button type="button" class="qmx-circuit-btn" data-circuit-export-png>Export PNG</button>
    <button type="button" class="qmx-circuit-btn is-primary" data-circuit-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.svg = root.querySelector('[data-circuit-svg]');
        state.gridLayer = root.querySelector('[data-circuit-grid-layer]');
        state.wireLayer = root.querySelector('[data-circuit-wire-layer]');
        state.componentLayer = root.querySelector('[data-circuit-component-layer]');
        state.draftLayer = root.querySelector('[data-circuit-draft-layer]');
        state.terminalLayer = root.querySelector('[data-circuit-terminal-layer]');
        state.selectionLayer = root.querySelector('[data-circuit-selection-layer]');
        state.controls = {
            bg: root.querySelector('[data-circuit-bg]'),
            tools: root.querySelector('[data-circuit-tools]'),
            props: root.querySelector('[data-circuit-properties]'),
            status: root.querySelector('[data-circuit-status]'),
            undo: root.querySelector('[data-circuit-undo]'),
            redo: root.querySelector('[data-circuit-redo]')
        };

        SYMBOLS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-circuit-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        state.controls.tools.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (button) setTool(button.dataset.tool);
        });

        root.querySelector('[data-circuit-close]').addEventListener('click', close);
        root.querySelector('[data-circuit-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-circuit-rotate]').addEventListener('click', rotateSelected);
        root.querySelector('[data-circuit-flip]').addEventListener('click', flipSelected);
        root.querySelector('[data-circuit-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-circuit-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-circuit-series]').addEventListener('click', addSeriesCircuit);
        root.querySelector('[data-circuit-clear-wires]').addEventListener('click', clearWires);
        root.querySelector('[data-circuit-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-circuit-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-circuit-insert]').addEventListener('click', insertIntoQuestion);

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
        state.activeTool = SYMBOLS.some(([id]) => id === tool) ? tool : 'select';
        state.interaction = null;
        state.wireDraft = null;
        state.controls.tools.querySelectorAll('[data-tool]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tool === state.activeTool);
        });
        render();
        setStatus(state.activeTool === 'wire'
            ? 'Click the first terminal or point, then click the destination.'
            : (state.activeTool === 'select'
                ? 'Select and drag components or wires.'
                : `${SYMBOLS.find(([id]) => id === state.activeTool)?.[1] || 'Component'} placement tool active.`));
    }

    function onDocumentInput(event) {
        const control = event.currentTarget;
        const prop = control.dataset.docProp;
        if (!prop || !state.document) return;

        if (['showGrid', 'snap'].includes(prop)) {
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

    function symbolLocalMarkup(component) {
        const stroke = esc(component.stroke);
        const width = component.strokeWidth;
        const common = `fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`;
        const lead = `<line x1="-50" y1="0" x2="-28" y2="0" ${common}/><line x1="28" y1="0" x2="50" y2="0" ${common}/>`;
        let symbol = '';

        switch (component.symbol) {
            case 'junction':
                symbol = `<circle cx="0" cy="0" r="7" fill="${stroke}"/>`;
                break;
            case 'resistor':
                symbol = `${lead}<polyline points="-28,0 -20,-15 -10,15 0,-15 10,15 20,-15 28,0" ${common}/>`;
                break;
            case 'capacitor':
                symbol = `<line x1="-50" y1="0" x2="-9" y2="0" ${common}/><line x1="9" y1="0" x2="50" y2="0" ${common}/><line x1="-9" y1="-24" x2="-9" y2="24" ${common}/><line x1="9" y1="-24" x2="9" y2="24" ${common}/>`;
                break;
            case 'inductor':
                symbol = `<line x1="-50" y1="0" x2="-32" y2="0" ${common}/><path d="M -32 0 C -32 -21 -16 -21 -16 0 C -16 -21 0 -21 0 0 C 0 -21 16 -21 16 0 C 16 -21 32 -21 32 0" ${common}/><line x1="32" y1="0" x2="50" y2="0" ${common}/>`;
                break;
            case 'cell':
                symbol = `<line x1="-50" y1="0" x2="-8" y2="0" ${common}/><line x1="8" y1="0" x2="50" y2="0" ${common}/><line x1="-8" y1="-17" x2="-8" y2="17" ${common}/><line x1="8" y1="-28" x2="8" y2="28" ${common}/>`;
                break;
            case 'battery':
                symbol = `<line x1="-50" y1="0" x2="-24" y2="0" ${common}/><line x1="24" y1="0" x2="50" y2="0" ${common}/><line x1="-24" y1="-16" x2="-24" y2="16" ${common}/><line x1="-13" y1="-27" x2="-13" y2="27" ${common}/><line x1="0" y1="-16" x2="0" y2="16" ${common}/><line x1="13" y1="-27" x2="13" y2="27" ${common}/><line x1="24" y1="-16" x2="24" y2="16" ${common}/>`;
                break;
            case 'dc-source':
                symbol = `${lead}<circle cx="0" cy="0" r="27" fill="${esc(component.fill)}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><line x1="-9" y1="-8" x2="9" y2="-8" ${common}/><line x1="0" y1="-17" x2="0" y2="1" ${common}/><line x1="-9" y1="10" x2="9" y2="10" ${common}/>`;
                break;
            case 'ac-source':
                symbol = `${lead}<circle cx="0" cy="0" r="27" fill="${esc(component.fill)}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><path d="M -16 2 C -10 -14 -4 -14 2 2 C 8 18 14 18 19 2" ${common}/>`;
                break;
            case 'switch':
                symbol = `<line x1="-50" y1="0" x2="-24" y2="0" ${common}/><line x1="24" y1="0" x2="50" y2="0" ${common}/><circle cx="-24" cy="0" r="4" fill="${stroke}"/><circle cx="24" cy="0" r="4" fill="${stroke}"/><line x1="-20" y1="-3" x2="16" y2="-22" ${common}/>`;
                break;
            case 'lamp':
                symbol = `${lead}<circle cx="0" cy="0" r="27" fill="${esc(component.fill)}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><line x1="-18" y1="-18" x2="18" y2="18" ${common}/><line x1="-18" y1="18" x2="18" y2="-18" ${common}/>`;
                break;
            case 'fuse':
                symbol = `${lead}<rect x="-28" y="-13" width="56" height="26" rx="4" fill="${esc(component.fill)}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><path d="M -21 0 C -12 -10 -3 10 6 0 C 15 -10 20 3 22 0" ${common}/>`;
                break;
            case 'diode':
                symbol = `<line x1="-50" y1="0" x2="-23" y2="0" ${common}/><line x1="18" y1="0" x2="50" y2="0" ${common}/><polygon points="-23,-22 -23,22 13,0" fill="${esc(component.fill)}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><line x1="16" y1="-24" x2="16" y2="24" ${common}/>`;
                break;
            case 'led':
                symbol = `<line x1="-50" y1="0" x2="-23" y2="0" ${common}/><line x1="18" y1="0" x2="50" y2="0" ${common}/><polygon points="-23,-22 -23,22 13,0" fill="${esc(component.fill)}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><line x1="16" y1="-24" x2="16" y2="24" ${common}/><path d="M 14 -25 L 29 -39 M 22 -21 L 37 -35" ${common}/><path d="M 29 -39 l -7 2 l 4 5 M 37 -35 l -7 2 l 4 5" ${common}/>`;
                break;
            case 'ammeter':
            case 'voltmeter': {
                const meter = component.symbol === 'ammeter' ? 'A' : 'V';
                symbol = `${lead}<circle cx="0" cy="0" r="27" fill="${esc(component.fill)}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><text x="0" y="1" fill="${stroke}" font-size="27" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${meter}</text>`;
                break;
            }
            case 'ground':
                symbol = `<line x1="0" y1="-30" x2="0" y2="3" ${common}/><line x1="-25" y1="3" x2="25" y2="3" ${common}/><line x1="-17" y1="12" x2="17" y2="12" ${common}/><line x1="-9" y1="21" x2="9" y2="21" ${common}/>`;
                break;
            default:
                symbol = `${lead}<rect x="-28" y="-18" width="56" height="36" fill="${esc(component.fill)}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
        }

        return symbol;
    }

    function componentMarkup(component) {
        const sx = component.w / 100;
        const sy = component.h / 60;
        const flip = component.flipX ? -1 : 1;
        const labelY = component.y + Math.abs(component.h) / 2 + 20;
        const caption = [component.label, component.value].filter(Boolean).join(' · ');
        const label = caption
            ? `<text x="${component.x}" y="${labelY}" fill="${esc(component.stroke)}" font-size="15" font-weight="600" text-anchor="middle" font-family="Arial, Noto Sans Bengali, sans-serif">${esc(caption)}</text>`
            : '';

        return `
<g class="qmx-circuit-component" data-object-id="${esc(component.id)}">
    <g transform="translate(${component.x} ${component.y}) rotate(${component.rotation}) scale(${flip} 1) scale(${sx} ${sy})" opacity="${component.opacity}">
        ${symbolLocalMarkup(component)}
        <rect class="qmx-circuit-component-hit" x="-50" y="-30" width="100" height="60"/>
    </g>
    ${label}
</g>`;
    }

    function wireMarkup(wire) {
        const points = wirePathPoints(wire);
        const dash = wire.dash ? ' stroke-dasharray="8 5"' : '';
        return `
<g class="qmx-circuit-wire" data-object-id="${esc(wire.id)}">
    <polyline points="${pointsAttribute(points)}" fill="none" stroke="${esc(wire.stroke)}" stroke-width="${wire.strokeWidth}"${dash} opacity="${wire.opacity}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <polyline class="qmx-circuit-hit" points="${pointsAttribute(points)}"/>
</g>`;
    }

    function isTerminalConnected(componentId, terminalId) {
        return wires().some((wire) =>
            (wire.startAnchor?.componentId === componentId && wire.startAnchor?.terminalId === terminalId) ||
            (wire.endAnchor?.componentId === componentId && wire.endAnchor?.terminalId === terminalId)
        );
    }

    function terminalsMarkup() {
        const showAll = state.activeTool === 'wire';
        const selected = selectedObject();
        return components().flatMap((component) => {
            if (!showAll && selected?.id !== component.id) return [];
            return baseTerminals(component.symbol).map((terminal) => {
                const point = terminalWorld(component, terminal.id);
                const connected = isTerminalConnected(component.id, terminal.id);
                return `<circle class="qmx-circuit-terminal${connected ? ' is-connected' : ''}" data-terminal-component="${esc(component.id)}" data-terminal-id="${esc(terminal.id)}" cx="${point.x}" cy="${point.y}" r="7"/>`;
            });
        }).join('');
    }

    function objectBounds(object) {
        if (object.type === 'component') {
            return {
                x: object.x - object.w / 2,
                y: object.y - object.h / 2,
                w: object.w,
                h: object.h
            };
        }

        const points = wirePathPoints(object);
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        return {
            x: Math.min(...xs),
            y: Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs),
            h: Math.max(...ys) - Math.min(...ys)
        };
    }

    function selectionMarkup() {
        const object = selectedObject();
        if (!object) return '';

        const bounds = objectBounds(object);
        let markup = `<rect class="qmx-circuit-select-box" x="${bounds.x - 8}" y="${bounds.y - 8}" width="${Math.max(1, bounds.w) + 16}" height="${Math.max(1, bounds.h) + 16}"/>`;

        if (object.type === 'wire') {
            const endpoints = wireEndpoints(object);
            markup += `<circle class="qmx-circuit-handle" data-handle="wire-start" cx="${endpoints.start.x}" cy="${endpoints.start.y}" r="7"/><circle class="qmx-circuit-handle" data-handle="wire-end" cx="${endpoints.end.x}" cy="${endpoints.end.y}" r="7"/>`;
        }

        return markup;
    }

    function renderDraft() {
        if (!state.wireDraft) {
            state.draftLayer.innerHTML = '';
            return;
        }

        const temp = createWire(
            state.wireDraft.start,
            { point: state.wireDraft.current, anchor: null }
        );
        temp.horizontalFirst = state.wireDraft.horizontalFirst;
        state.draftLayer.innerHTML = `<polyline class="qmx-circuit-draft" points="${pointsAttribute(wirePathPoints(temp, state.wireDraft.current))}"/>`;
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;

        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        state.gridLayer.innerHTML = gridMarkup();
        state.wireLayer.innerHTML = wires().map(wireMarkup).join('');
        state.componentLayer.innerHTML = components().map(componentMarkup).join('');
        state.terminalLayer.innerHTML = terminalsMarkup();
        state.selectionLayer.innerHTML = selectionMarkup();
        renderDraft();

        if (!options.keepProperties) renderProperties();
        updateHistoryButtons();
    }

    function renderProperties() {
        const object = selectedObject();

        if (!object) {
            state.controls.props.innerHTML = `<div class="qmx-circuit-empty">Select a component or wire.</div>`;
            return;
        }

        if (object.type === 'wire') {
            state.controls.props.innerHTML = `
<div class="qmx-circuit-fields">
    <label class="qmx-circuit-field">Route
        <select data-object-prop="route">
            <option value="orthogonal"${object.route === 'orthogonal' ? ' selected' : ''}>Orthogonal</option>
            <option value="direct"${object.route === 'direct' ? ' selected' : ''}>Direct</option>
        </select>
    </label>
    <label class="qmx-circuit-check"><input type="checkbox" data-object-prop="horizontalFirst"${object.horizontalFirst !== false ? ' checked' : ''}> Horizontal first</label>
    <div class="qmx-circuit-row">
        <label class="qmx-circuit-field">Colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-circuit-field">Width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
    </div>
    <label class="qmx-circuit-check"><input type="checkbox" data-object-prop="dash"${object.dash ? ' checked' : ''}> Dashed wire</label>
    <div class="qmx-circuit-empty">Drag an endpoint handle to reconnect or detach it.</div>
</div>`;
            return;
        }

        state.controls.props.innerHTML = `
<div class="qmx-circuit-fields">
    <label class="qmx-circuit-field">Component
        <select data-object-prop="symbol">
            ${Object.keys(COMPONENT_DEFAULTS).map((symbol) => `<option value="${symbol}"${object.symbol === symbol ? ' selected' : ''}>${symbol}</option>`).join('')}
        </select>
    </label>
    <label class="qmx-circuit-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <label class="qmx-circuit-field">Value<input type="text" data-object-prop="value" value="${esc(object.value)}"></label>
    <div class="qmx-circuit-row">
        <label class="qmx-circuit-field">X<input type="number" step="1" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-circuit-field">Y<input type="number" step="1" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-circuit-row">
        <label class="qmx-circuit-field">Width<input type="number" min="20" data-object-prop="w" value="${object.w.toFixed(1)}"></label>
        <label class="qmx-circuit-field">Height<input type="number" min="20" data-object-prop="h" value="${object.h.toFixed(1)}"></label>
    </div>
    <div class="qmx-circuit-row">
        <label class="qmx-circuit-field">Rotation °<input type="number" step="15" data-object-prop="rotation" value="${object.rotation}"></label>
        <label class="qmx-circuit-field">Line width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
    </div>
    <div class="qmx-circuit-row">
        <label class="qmx-circuit-field">Line colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-circuit-field">Fill<input type="color" data-object-prop="fill" value="${object.fill}"></label>
    </div>
    <label class="qmx-circuit-check"><input type="checkbox" data-object-prop="flipX"${object.flipX ? ' checked' : ''}> Flip horizontally</label>
</div>`;
    }

    function selectObject(id) {
        state.selectedId = id;
        render();
    }

    function onPropertyInput(event) {
        const control = event.target.closest('[data-object-prop]');
        const object = selectedObject();
        if (!control || !object) return;

        const prop = control.dataset.objectProp;

        if (['dash', 'horizontalFirst', 'flipX'].includes(prop)) {
            object[prop] = control.checked;
        } else if (['symbol', 'label', 'value', 'stroke', 'fill', 'route'].includes(prop)) {
            object[prop] = control.value;
            if (prop === 'symbol' && COMPONENT_DEFAULTS[object.symbol]) {
                const defaults = COMPONENT_DEFAULTS[object.symbol];
                object.w = defaults.w;
                object.h = defaults.h;
            }
        } else {
            object[prop] = Number(control.value);
        }

        state.document = Diagram.normalizeSpec(state.document);
        render({ keepProperties: true });
    }

    function terminalFromTarget(target) {
        const terminal = target.closest?.('[data-terminal-component]');
        if (!terminal) return null;
        const component = components().find((item) => item.id === terminal.dataset.terminalComponent);
        if (!component) return null;
        return {
            anchor: {
                componentId: component.id,
                terminalId: terminal.dataset.terminalId
            },
            point: terminalWorld(component, terminal.dataset.terminalId)
        };
    }

    function beginOrFinishWire(event, point) {
        const terminal = terminalFromTarget(event.target);
        const endpoint = terminal || { anchor: null, point };

        if (!state.wireDraft) {
            state.wireDraft = {
                start: endpoint,
                current: endpoint.point,
                horizontalFirst: true
            };
            render();
            setStatus('Choose the destination terminal or canvas point.');
            return;
        }

        const startPoint = state.wireDraft.start.point;
        if (Math.hypot(endpoint.point.x - startPoint.x, endpoint.point.y - startPoint.y) < 6) {
            setStatus('Choose a different destination.');
            return;
        }

        const wire = createWire(state.wireDraft.start, endpoint);
        state.document.objects.push(wire);
        state.selectedId = wire.id;
        state.wireDraft = null;
        pushHistory();
        render();
        setStatus('Wire connected.');
    }

    function onPointerDown(event) {
        if (!state.document || event.button !== 0) return;

        const point = pointFromEvent(event);
        const handle = event.target.closest('[data-handle]');
        const group = event.target.closest('[data-object-id]');

        if (state.activeTool === 'wire') {
            beginOrFinishWire(event, point);
            event.preventDefault();
            return;
        }

        if (state.activeTool !== 'select') {
            const component = createComponent(state.activeTool, point.x, point.y);
            state.document.objects.push(component);
            state.selectedId = component.id;
            pushHistory();
            render();
            setStatus(`${SYMBOLS.find(([id]) => id === state.activeTool)?.[1] || 'Component'} added.`);
            event.preventDefault();
            return;
        }

        if (handle && selectedObject()?.type === 'wire') {
            const object = selectedObject();
            const endpoint = handle.dataset.handle === 'wire-start' ? 'start' : 'end';
            state.interaction = {
                type: 'wire-end',
                endpoint,
                pointerId: event.pointerId,
                original: clone(object)
            };
            if (endpoint === 'start') {
                object.startAnchor = null;
                object.startPoint = point;
            } else {
                object.endAnchor = null;
                object.endPoint = point;
            }
            state.svg.setPointerCapture(event.pointerId);
            event.preventDefault();
            return;
        }

        if (group) {
            const id = group.dataset.objectId;
            const object = state.document.objects.find((item) => item.id === id);
            if (!object) return;

            if (id !== state.selectedId) selectObject(id);

            state.interaction = {
                type: object.type === 'component' ? 'move-component' : 'move-wire',
                pointerId: event.pointerId,
                start: point,
                original: clone(object)
            };
            state.svg.setPointerCapture(event.pointerId);
            event.preventDefault();
            return;
        }

        selectObject(null);
    }

    function onPointerMove(event) {
        const point = pointFromEvent(event);

        if (state.activeTool === 'wire' && state.wireDraft) {
            const terminal = nearestTerminal(point);
            state.wireDraft.current = terminal?.point || point;
            renderDraft();
        }

        const interaction = state.interaction;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        const object = selectedObject();
        if (!object) return;

        if (interaction.type === 'move-component') {
            object.x = interaction.original.x + (point.x - interaction.start.x);
            object.y = interaction.original.y + (point.y - interaction.start.y);
        } else if (interaction.type === 'move-wire') {
            const dx = point.x - interaction.start.x;
            const dy = point.y - interaction.start.y;

            if (!interaction.original.startAnchor) {
                object.startPoint.x = interaction.original.startPoint.x + dx;
                object.startPoint.y = interaction.original.startPoint.y + dy;
            }

            if (!interaction.original.endAnchor) {
                object.endPoint.x = interaction.original.endPoint.x + dx;
                object.endPoint.y = interaction.original.endPoint.y + dy;
            }
        } else if (interaction.type === 'wire-end') {
            if (interaction.endpoint === 'start') {
                object.startAnchor = null;
                object.startPoint = point;
            } else {
                object.endAnchor = null;
                object.endPoint = point;
            }
        }

        state.document = Diagram.normalizeSpec(state.document);
        render({ keepProperties: true });
    }

    function onPointerUp(event) {
        const interaction = state.interaction;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        const object = selectedObject();
        const point = pointFromEvent(event);

        if (object?.type === 'wire' && interaction.type === 'wire-end') {
            const terminal = nearestTerminal(point);
            if (terminal) {
                if (interaction.endpoint === 'start') {
                    object.startAnchor = terminal.anchor;
                    object.startPoint = terminal.point;
                } else {
                    object.endAnchor = terminal.anchor;
                    object.endPoint = terminal.point;
                }
                setStatus('Wire endpoint connected to terminal.');
            } else {
                setStatus('Wire endpoint detached.');
            }
        }

        try {
            state.svg.releasePointerCapture(event.pointerId);
        } catch (error) {
            // Pointer capture may already have been released.
        }

        state.interaction = null;
        pushHistory();
        render();
    }

    function rotateSelected() {
        const object = selectedObject();
        if (!object || object.type !== 'component') return;
        object.rotation = ((Number(object.rotation) || 0) + 90) % 360;
        pushHistory();
        render();
        setStatus('Component rotated 90°.');
    }

    function flipSelected() {
        const object = selectedObject();
        if (!object || object.type !== 'component') return;
        object.flipX = !object.flipX;
        pushHistory();
        render();
        setStatus('Component flipped.');
    }

    function duplicateSelected() {
        const object = selectedObject();
        if (!object) return;

        const copy = clone(object);
        copy.id = uid(object.type);

        if (copy.type === 'component') {
            copy.x += 30;
            copy.y += 30;
        } else {
            copy.startAnchor = null;
            copy.endAnchor = null;
            copy.startPoint.x += 30;
            copy.startPoint.y += 30;
            copy.endPoint.x += 30;
            copy.endPoint.y += 30;
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

        if (object.type === 'component') {
            state.document.objects.forEach((wire) => {
                if (wire.type !== 'wire') return;

                if (wire.startAnchor?.componentId === object.id) {
                    wire.startPoint = terminalWorld(object, wire.startAnchor.terminalId);
                    wire.startAnchor = null;
                }

                if (wire.endAnchor?.componentId === object.id) {
                    wire.endPoint = terminalWorld(object, wire.endAnchor.terminalId);
                    wire.endAnchor = null;
                }
            });
        }

        state.document.objects = state.document.objects.filter((item) => item.id !== object.id);
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Object deleted.');
    }

    function clearWires() {
        if (!wires().length) return;
        if (!window.confirm('Remove all wires from this circuit?')) return;
        state.document.objects = state.document.objects.filter((object) => object.type !== 'wire');
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('All wires removed.');
    }

    function addSeriesCircuit() {
        const y = state.document.height / 2;
        const battery = createComponent('battery', 180, y);
        const resistor = createComponent('resistor', 500, y - 120);
        const lamp = createComponent('lamp', 800, y);
        const switchComponent = createComponent('switch', 500, y + 120);

        const componentList = [battery, resistor, lamp, switchComponent];
        state.document.objects.push(...componentList);

        const endpoint = (component, terminalId) => ({
            anchor: { componentId: component.id, terminalId },
            point: terminalWorld(component, terminalId)
        });

        const circuitWires = [
            createWire(endpoint(battery, 'b'), endpoint(resistor, 'a')),
            createWire(endpoint(resistor, 'b'), endpoint(lamp, 'a')),
            createWire(endpoint(lamp, 'b'), endpoint(switchComponent, 'b')),
            createWire(endpoint(switchComponent, 'a'), endpoint(battery, 'a'))
        ];

        state.document.objects.push(...circuitWires);
        state.selectedId = resistor.id;
        pushHistory();
        render();
        setStatus('Series circuit inserted.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new circuit diagram?')) return;
        state.document = createDocument();
        state.selectedId = null;
        state.interaction = null;
        state.wireDraft = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New circuit diagram.');
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
        setStatus('Circuit diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'circuit-diagram')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'circuit-diagram';
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

        if (state.document.mode !== 'circuit') {
            state.document = createDocument();
        }

        state.selectedId = null;
        state.activeTool = 'select';
        state.interaction = null;
        state.wireDraft = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();

        state.root.hidden = false;
        document.body.dataset.qmxCircuitOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(context.initialSpec
            ? 'Existing circuit diagram loaded.'
            : 'Place components, then connect their terminals with the Wire tool.');

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;

        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxCircuitOverflow || '';
        delete document.body.dataset.qmxCircuitOverflow;
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

        if (spec.mode !== 'circuit') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }

        open({
            tool: { id: 'circuit' },
            textarea,
            initialSpec: spec,
            replaceRange,
            editMode: true
        });

        return true;
    }

    function registerHandler() {
        const launcher = window.QmxDiagramLauncher;
        if (!launcher?.registerToolHandler) return false;
        launcher.registerToolHandler('circuit', open);
        return true;
    }

    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;

        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        if (event.key === 'Escape') {
            if (state.wireDraft) {
                state.wireDraft = null;
                render();
                setStatus('Wire draft cancelled.');
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

        if (event.key.toLowerCase() === 'r' && !editing) {
            rotateSelected();
        }
    }

    function init() {
        buildEditor();

        if (!registerHandler()) {
            document.addEventListener('qmx:diagram-launcher-ready', registerHandler, { once: true });
        }
    }

    window.QmxCircuitEditor = Object.freeze({
        version: '1.0.0',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
