(function (window, document) {
    'use strict';

    if (window.QmxRayOpticsEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Ray Optics] Diagram renderer must load first.');
        return;
    }

    const TOOLS = [
        ['select', 'Select', 'নির্বাচন'],
        ['object-arrow', 'Object', 'বস্তু'],
        ['convex-lens', 'Convex Lens', 'উত্তল লেন্স'],
        ['concave-lens', 'Concave Lens', 'অবতল লেন্স'],
        ['concave-mirror', 'Concave Mirror', 'অবতল দর্পণ'],
        ['convex-mirror', 'Convex Mirror', 'উত্তল দর্পণ'],
        ['plane-mirror', 'Plane Mirror', 'সমতল দর্পণ'],
        ['manual-ray', 'Manual Ray', 'আলোকরশ্মি'],
        ['text', 'Text', 'লেখা']
    ];

    const state = {
        root: null,
        svg: null,
        gridLayer: null,
        constructionLayer: null,
        objectLayer: null,
        draftLayer: null,
        selectionLayer: null,
        context: null,
        document: null,
        activeTool: 'select',
        selectedId: null,
        interaction: null,
        rayDraft: null,
        history: [],
        historyIndex: -1,
        controls: {}
    };

    function uid(prefix = 'optics') {
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
            version: 5,
            id: uid('ray-optics'),
            mode: 'ray-optics',
            title: 'Ray Optics Diagram',
            width: 1000,
            height: 600,
            background: '#ffffff',
            gridSize: 20,
            showGrid: true,
            snap: true,
            axisY: 300,
            showAxis: true,
            showFocalPoints: true,
            showTwoF: true,
            showPrincipalRays: true,
            showImage: true,
            showMeasurements: true,
            rayColor: '#2563eb',
            virtualRayColor: '#7c3aed',
            objects: []
        };
    }

    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
    }

    function opticalElement() {
        return state.document?.objects.find((object) => object.type === 'optical-element') || null;
    }

    function objectArrow() {
        return state.document?.objects.find((object) => object.type === 'object-arrow') || null;
    }

    function snapValue(value) {
        const grid = state.document?.gridSize || 20;
        return state.document?.snap ? Math.round(value / grid) * grid : value;
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

    function makeOpticalElement(opticalType, x) {
        return {
            id: uid('optical-element'),
            type: 'optical-element',
            opticalType,
            x,
            height: 250,
            focalLength: 120,
            label: opticalType.includes('lens') ? 'Lens' : 'Mirror',
            stroke: '#0f172a',
            fill: '#dbeafe',
            strokeWidth: 3,
            opacity: 1
        };
    }

    function makeObjectArrow(x, height = 130) {
        return {
            id: uid('object-arrow'),
            type: 'object-arrow',
            x,
            height,
            label: 'Object',
            stroke: '#16a34a',
            strokeWidth: 4,
            opacity: 1
        };
    }

    function makeManualRay(x1, y1, x2, y2) {
        return {
            id: uid('manual-ray'),
            type: 'manual-ray',
            x1,
            y1,
            x2,
            y2,
            label: '',
            stroke: '#f97316',
            strokeWidth: 2.5,
            dash: false,
            arrow: true,
            opacity: 1
        };
    }

    function makeText(x, y) {
        return {
            id: uid('text'),
            type: 'text',
            x,
            y,
            text: 'Label',
            textColor: '#0f172a',
            fontSize: 18,
            fontWeight: 'normal',
            rotation: 0,
            opacity: 1
        };
    }

    function focalSign(element) {
        if (!element) return 0;
        if (element.opticalType === 'convex-lens' || element.opticalType === 'concave-mirror') {
            return Math.abs(element.focalLength);
        }
        if (element.opticalType === 'concave-lens' || element.opticalType === 'convex-mirror') {
            return -Math.abs(element.focalLength);
        }
        return 0;
    }

    function computeImage(spec = state.document) {
        const element = spec.objects.find((object) => object.type === 'optical-element');
        const object = spec.objects.find((item) => item.type === 'object-arrow');
        if (!element || !object) return null;

        const u = element.x - object.x;
        if (u <= 2) return null;

        if (element.opticalType === 'plane-mirror') {
            return {
                x: element.x + u,
                height: object.height,
                u,
                v: u,
                magnification: 1,
                virtual: true,
                atInfinity: false
            };
        }

        const f = focalSign(element);
        const denominator = u - f;
        if (Math.abs(denominator) < 0.001) {
            return {
                x: null,
                height: null,
                u,
                v: Infinity,
                magnification: Infinity,
                virtual: false,
                atInfinity: true
            };
        }

        const v = (f * u) / denominator;
        const isMirror = element.opticalType.includes('mirror');
        const x = isMirror ? element.x - v : element.x + v;
        const magnification = -v / u;

        return {
            x,
            height: object.height * magnification,
            u,
            v,
            magnification,
            virtual: v < 0,
            atInfinity: false
        };
    }

    function pointAtX(start, through, targetX) {
        const dx = through.x - start.x;
        if (Math.abs(dx) < 0.001) return { x: targetX, y: through.y };
        const t = (targetX - start.x) / dx;
        return {
            x: targetX,
            y: start.y + (through.y - start.y) * t
        };
    }

    function principalRaySegments() {
        if (!state.document.showPrincipalRays) return [];

        const element = opticalElement();
        const object = objectArrow();
        const image = computeImage();

        if (!element || !object || !image || image.atInfinity) return [];

        const axisY = state.document.axisY;
        const objectTop = { x: object.x, y: axisY - object.height };
        const imageTop = { x: image.x, y: axisY - image.height };
        const isMirror = element.opticalType.includes('mirror');
        const virtual = image.virtual || element.opticalType === 'plane-mirror';
        const boundaryX = isMirror ? 0 : state.document.width;

        const hits = [
            { x: element.x, y: objectTop.y },
            { x: element.x, y: axisY }
        ];

        return hits.map((hit, index) => {
            const incoming = [objectTop, hit];

            if (!virtual) {
                return {
                    id: `principal-${index}`,
                    incoming,
                    outgoing: [hit, imageTop],
                    extension: null
                };
            }

            const actualEnd = pointAtX(imageTop, hit, boundaryX);
            return {
                id: `principal-${index}`,
                incoming,
                outgoing: [hit, actualEnd],
                extension: [hit, imageTop]
            };
        });
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
        state.rayDraft = null;
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
        if (document.getElementById('qmx-ray-optics-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-ray-optics-editor-styles';
        style.textContent = `
.qmx-optics-editor[hidden]{display:none!important}
.qmx-optics-editor{position:fixed;inset:0;z-index:10160;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.7);backdrop-filter:blur(2px)}
.qmx-optics-dialog{width:min(1550px,100%);height:min(96vh,980px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.38)}
.qmx-optics-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-optics-title{margin-right:auto}.qmx-optics-title strong{display:block}.qmx-optics-title span{display:block;color:#64748b;font-size:11px}
.qmx-optics-btn,.qmx-optics-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-optics-btn:hover,.qmx-optics-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-optics-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-optics-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-optics-btn.is-danger{color:#b91c1c}.qmx-optics-close{font-size:20px;line-height:1}
.qmx-optics-workspace{min-height:0;flex:1;display:grid;grid-template-columns:220px minmax(0,1fr) 300px;gap:10px;padding:10px}
.qmx-optics-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-optics-panel h3{margin:0 0 8px;font-size:13px}.qmx-optics-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-optics-tool{min-height:58px;padding:6px 5px;font-size:10px}.qmx-optics-tool span{display:block;margin-top:2px;color:#64748b;font-size:9px;font-weight:500}
.qmx-optics-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-optics-quick{display:grid;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0}
.qmx-optics-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-optics-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-optics-stage{display:block;width:min(100%,1180px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none;user-select:none}
.qmx-optics-object{cursor:move}.qmx-optics-hit{fill:transparent;stroke:transparent;stroke-width:18;pointer-events:all}
.qmx-optics-ray-hit{fill:none;stroke:transparent;stroke-width:18;pointer-events:stroke}
.qmx-optics-select-box{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-optics-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair;pointer-events:all}
.qmx-optics-draft{fill:none;stroke:#f97316;stroke-width:3;stroke-dasharray:7 5;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-optics-fields{display:grid;gap:9px}.qmx-optics-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-optics-field input,.qmx-optics-field textarea,.qmx-optics-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-optics-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-optics-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-optics-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-optics-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-optics-summary{margin-top:10px;padding:9px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.55}
.qmx-optics-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-optics-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-optics-footer .qmx-optics-btn:first-of-type{margin-left:auto}
@media(max-width:1050px){.qmx-optics-workspace{grid-template-columns:180px minmax(0,1fr) 250px}.qmx-optics-tools{grid-template-columns:1fr}}
@media(max-width:760px){.qmx-optics-editor{padding:0}.qmx-optics-dialog{width:100%;height:100%;border-radius:0}.qmx-optics-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(350px,1fr) auto;overflow:auto}.qmx-optics-panel{overflow:visible}.qmx-optics-tools{grid-template-columns:repeat(3,1fr)}.qmx-optics-header{overflow-x:auto}.qmx-optics-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-optics-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-optics-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-optics-title">
<header class="qmx-optics-header">
    <div class="qmx-optics-title">
        <strong id="qmx-optics-title">Ray Optics Diagram</strong>
        <span>Lens, mirror, focal points, object/image and principal ray construction</span>
    </div>
    <button type="button" class="qmx-optics-btn" data-optics-new>New</button>
    <button type="button" class="qmx-optics-btn" data-optics-undo>Undo</button>
    <button type="button" class="qmx-optics-btn" data-optics-redo>Redo</button>
    <button type="button" class="qmx-optics-btn" data-optics-duplicate>Duplicate</button>
    <button type="button" class="qmx-optics-btn is-danger" data-optics-delete>Delete</button>
    <button type="button" class="qmx-optics-btn qmx-optics-close" data-optics-close aria-label="Close">×</button>
</header>
<div class="qmx-optics-workspace">
    <aside class="qmx-optics-panel">
        <h3>Optics tools</h3>
        <div class="qmx-optics-tools" data-optics-tools></div>
        <div class="qmx-optics-quick">
            <button type="button" class="qmx-optics-btn" data-optics-convex-preset>Convex lens example</button>
            <button type="button" class="qmx-optics-btn" data-optics-mirror-preset>Concave mirror example</button>
            <button type="button" class="qmx-optics-btn" data-optics-clear-rays>Remove manual rays</button>
        </div>
        <p class="qmx-optics-help">
            Place one optical element and one object arrow. The image and principal rays are calculated automatically.
            Manual Ray adds additional annotated rays.
        </p>
    </aside>
    <main class="qmx-optics-stage-wrap">
        <svg class="qmx-optics-stage" data-optics-svg viewBox="0 0 1000 600" tabindex="0" aria-label="Ray optics diagram canvas">
            <defs>
                <marker id="qmx-optics-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke"></path>
                </marker>
            </defs>
            <rect data-optics-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-optics-grid-layer></g>
            <g data-optics-construction-layer></g>
            <g data-optics-object-layer></g>
            <g data-optics-draft-layer></g>
            <g data-optics-selection-layer></g>
        </svg>
    </main>
    <aside class="qmx-optics-panel">
        <h3>Document</h3>
        <div class="qmx-optics-fields">
            <label class="qmx-optics-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-optics-row">
                <label class="qmx-optics-field">Width<input type="number" min="240" max="2400" data-doc-prop="width"></label>
                <label class="qmx-optics-field">Height<input type="number" min="180" max="1800" data-doc-prop="height"></label>
            </div>
            <div class="qmx-optics-row">
                <label class="qmx-optics-field">Axis Y<input type="number" min="20" data-doc-prop="axisY"></label>
                <label class="qmx-optics-field">Grid size<input type="number" min="5" max="100" data-doc-prop="gridSize"></label>
            </div>
            <label class="qmx-optics-field">Background<input type="color" data-doc-prop="background"></label>
            <div class="qmx-optics-row">
                <label class="qmx-optics-field">Ray colour<input type="color" data-doc-prop="rayColor"></label>
                <label class="qmx-optics-field">Virtual ray<input type="color" data-doc-prop="virtualRayColor"></label>
            </div>
            <label class="qmx-optics-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label>
            <label class="qmx-optics-check"><input type="checkbox" data-doc-prop="snap"> Snap to grid</label>
            <label class="qmx-optics-check"><input type="checkbox" data-doc-prop="showAxis"> Show principal axis</label>
            <label class="qmx-optics-check"><input type="checkbox" data-doc-prop="showFocalPoints"> Show focal points</label>
            <label class="qmx-optics-check"><input type="checkbox" data-doc-prop="showTwoF"> Show 2F / C points</label>
            <label class="qmx-optics-check"><input type="checkbox" data-doc-prop="showPrincipalRays"> Show principal rays</label>
            <label class="qmx-optics-check"><input type="checkbox" data-doc-prop="showImage"> Show calculated image</label>
            <label class="qmx-optics-check"><input type="checkbox" data-doc-prop="showMeasurements"> Show u, v and magnification</label>
        </div>
        <hr class="qmx-optics-divider">
        <h3>Selected object</h3>
        <div data-optics-properties></div>
        <div class="qmx-optics-summary" data-optics-summary></div>
    </aside>
</div>
<footer class="qmx-optics-footer">
    <span class="qmx-optics-status" data-optics-status aria-live="polite"></span>
    <button type="button" class="qmx-optics-btn" data-optics-export-svg>Export SVG</button>
    <button type="button" class="qmx-optics-btn" data-optics-export-png>Export PNG</button>
    <button type="button" class="qmx-optics-btn is-primary" data-optics-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.svg = root.querySelector('[data-optics-svg]');
        state.gridLayer = root.querySelector('[data-optics-grid-layer]');
        state.constructionLayer = root.querySelector('[data-optics-construction-layer]');
        state.objectLayer = root.querySelector('[data-optics-object-layer]');
        state.draftLayer = root.querySelector('[data-optics-draft-layer]');
        state.selectionLayer = root.querySelector('[data-optics-selection-layer]');
        state.controls = {
            bg: root.querySelector('[data-optics-bg]'),
            tools: root.querySelector('[data-optics-tools]'),
            props: root.querySelector('[data-optics-properties]'),
            summary: root.querySelector('[data-optics-summary]'),
            status: root.querySelector('[data-optics-status]'),
            undo: root.querySelector('[data-optics-undo]'),
            redo: root.querySelector('[data-optics-redo]')
        };

        TOOLS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-optics-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        state.controls.tools.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (button) setTool(button.dataset.tool);
        });

        root.querySelector('[data-optics-close]').addEventListener('click', close);
        root.querySelector('[data-optics-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-optics-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-optics-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-optics-convex-preset]').addEventListener('click', addConvexPreset);
        root.querySelector('[data-optics-mirror-preset]').addEventListener('click', addMirrorPreset);
        root.querySelector('[data-optics-clear-rays]').addEventListener('click', clearManualRays);
        root.querySelector('[data-optics-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-optics-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-optics-insert]').addEventListener('click', insertIntoQuestion);

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
        state.rayDraft = null;
        state.controls.tools.querySelectorAll('[data-tool]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tool === state.activeTool);
        });
        render();
        setStatus(state.activeTool === 'manual-ray'
            ? 'Drag on the canvas to add a manual ray.'
            : (state.activeTool === 'select'
                ? 'Select and drag an optical element, object, ray or text.'
                : `${TOOLS.find(([id]) => id === state.activeTool)?.[1] || 'Tool'} placement tool active.`));
    }

    function onDocumentInput(event) {
        const control = event.currentTarget;
        const prop = control.dataset.docProp;
        if (!prop || !state.document) return;

        if ([
            'showGrid', 'snap', 'showAxis', 'showFocalPoints', 'showTwoF',
            'showPrincipalRays', 'showImage', 'showMeasurements'
        ].includes(prop)) {
            state.document[prop] = control.checked;
        } else if (['width', 'height', 'axisY', 'gridSize'].includes(prop)) {
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

    function opticalElementMarkup(object, interactive = true) {
        const axisY = state.document.axisY;
        const top = axisY - object.height / 2;
        const bottom = axisY + object.height / 2;
        const stroke = esc(object.stroke);
        const fill = esc(object.fill);
        const width = object.strokeWidth;
        let symbol = '';

        if (object.opticalType === 'convex-lens') {
            symbol = `<path d="M ${object.x} ${top} C ${object.x - 35} ${top + object.height * .2}, ${object.x - 35} ${bottom - object.height * .2}, ${object.x} ${bottom} C ${object.x + 35} ${bottom - object.height * .2}, ${object.x + 35} ${top + object.height * .2}, ${object.x} ${top} Z" fill="${fill}" fill-opacity=".6" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
        } else if (object.opticalType === 'concave-lens') {
            symbol = `<path d="M ${object.x - 20} ${top} C ${object.x + 12} ${top + object.height * .2}, ${object.x + 12} ${bottom - object.height * .2}, ${object.x - 20} ${bottom} L ${object.x + 20} ${bottom} C ${object.x - 12} ${bottom - object.height * .2}, ${object.x - 12} ${top + object.height * .2}, ${object.x + 20} ${top} Z" fill="${fill}" fill-opacity=".55" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
        } else if (object.opticalType === 'plane-mirror') {
            symbol = `<line x1="${object.x}" y1="${top}" x2="${object.x}" y2="${bottom}" stroke="${stroke}" stroke-width="${width + 1}" vector-effect="non-scaling-stroke"/>${Array.from({ length: 9 }, (_, i) => {
                const y = top + 12 + i * ((object.height - 24) / 8);
                return `<line x1="${object.x + 4}" y1="${y}" x2="${object.x + 20}" y2="${y - 12}" stroke="${stroke}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
            }).join('')}`;
        } else {
            const concave = object.opticalType === 'concave-mirror';
            const bow = concave ? -32 : 32;
            symbol = `<path d="M ${object.x} ${top} Q ${object.x + bow} ${axisY} ${object.x} ${bottom}" fill="none" stroke="${stroke}" stroke-width="${width + 1}" vector-effect="non-scaling-stroke"/>${Array.from({ length: 9 }, (_, i) => {
                const y = top + 12 + i * ((object.height - 24) / 8);
                const offset = concave ? 8 : -8;
                return `<line x1="${object.x + offset}" y1="${y}" x2="${object.x + offset + (concave ? 15 : -15)}" y2="${y - 10}" stroke="${stroke}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
            }).join('')}`;
        }

        const caption = object.label
            ? `<text x="${object.x}" y="${bottom + 24}" fill="${stroke}" font-size="15" font-weight="600" text-anchor="middle">${esc(object.label)}</text>`
            : '';
        const hit = interactive
            ? `<rect class="qmx-optics-hit" x="${object.x - 40}" y="${top}" width="80" height="${object.height}"/>`
            : '';

        return `${symbol}${caption}${hit}`;
    }

    function arrowMarkup(object, image = false) {
        const axisY = state.document.axisY;
        const topY = axisY - object.height;
        const dash = image ? ' stroke-dasharray="8 5"' : '';
        const labelY = object.height >= 0 ? topY - 12 : topY + 24;
        return `
<line x1="${object.x}" y1="${axisY}" x2="${object.x}" y2="${topY}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke" marker-end="url(#qmx-optics-arrow)"/>
<text x="${object.x}" y="${labelY}" fill="${esc(object.stroke)}" font-size="15" font-weight="700" text-anchor="middle">${esc(object.label || (image ? 'Image' : 'Object'))}</text>
${image ? '' : `<rect class="qmx-optics-hit" x="${object.x - 18}" y="${Math.min(axisY, topY) - 12}" width="36" height="${Math.abs(object.height) + 24}"/>`}`;
    }

    function manualRayMarkup(object) {
        const dash = object.dash ? ' stroke-dasharray="8 5"' : '';
        const marker = object.arrow ? ' marker-end="url(#qmx-optics-arrow)"' : '';
        const label = object.label
            ? `<text x="${(object.x1 + object.x2) / 2}" y="${(object.y1 + object.y2) / 2 - 10}" fill="${esc(object.stroke)}" font-size="14" font-weight="600" text-anchor="middle">${esc(object.label)}</text>`
            : '';
        return `
<line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash}${marker} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>
${label}
<line class="qmx-optics-ray-hit" x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}"/>`;
    }

    function textMarkup(object) {
        return `
<text x="${object.x}" y="${object.y}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})">${esc(object.text)}</text>
<rect class="qmx-optics-hit" x="${object.x - 60}" y="${object.y - 24}" width="120" height="48"/>`;
    }

    function focalMarkup() {
        const element = opticalElement();
        if (!element || !state.document.showFocalPoints || element.opticalType === 'plane-mirror') return '';

        const axisY = state.document.axisY;
        const f = Math.abs(element.focalLength);
        const isLens = element.opticalType.includes('lens');
        const convergingMirror = element.opticalType === 'concave-mirror';
        const points = [];

        if (isLens) {
            points.push({ x: element.x - f, label: 'F' }, { x: element.x + f, label: 'F′' });
            if (state.document.showTwoF) {
                points.push({ x: element.x - 2 * f, label: '2F' }, { x: element.x + 2 * f, label: '2F′' });
            }
        } else {
            const direction = convergingMirror ? -1 : 1;
            points.push({ x: element.x + direction * f, label: 'F' });
            if (state.document.showTwoF) points.push({ x: element.x + direction * 2 * f, label: 'C' });
        }

        return points.map((point) => `
<circle cx="${point.x}" cy="${axisY}" r="4.5" fill="#dc2626"/>
<text x="${point.x}" y="${axisY + 21}" fill="#b91c1c" font-size="14" font-weight="700" text-anchor="middle">${point.label}</text>`).join('');
    }

    function constructionMarkup() {
        const axisY = state.document.axisY;
        let markup = state.document.showAxis
            ? `<line x1="20" y1="${axisY}" x2="${state.document.width - 20}" y2="${axisY}" stroke="#64748b" stroke-width="1.8" marker-end="url(#qmx-optics-arrow)" vector-effect="non-scaling-stroke"/><text x="${state.document.width - 35}" y="${axisY - 10}" fill="#475569" font-size="14">Principal axis</text>`
            : '';

        markup += focalMarkup();

        principalRaySegments().forEach((ray) => {
            markup += `<polyline points="${ray.incoming.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="${esc(state.document.rayColor)}" stroke-width="2.4" marker-end="url(#qmx-optics-arrow)" vector-effect="non-scaling-stroke"/>`;
            markup += `<polyline points="${ray.outgoing.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="${esc(state.document.rayColor)}" stroke-width="2.4" marker-end="url(#qmx-optics-arrow)" vector-effect="non-scaling-stroke"/>`;
            if (ray.extension) {
                markup += `<polyline points="${ray.extension.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="${esc(state.document.virtualRayColor)}" stroke-width="2" stroke-dasharray="8 6" vector-effect="non-scaling-stroke"/>`;
            }
        });

        const image = computeImage();
        if (state.document.showImage && image && !image.atInfinity) {
            markup += arrowMarkup({
                x: image.x,
                height: image.height,
                label: image.virtual ? 'Virtual image' : 'Image',
                stroke: image.virtual ? state.document.virtualRayColor : '#dc2626',
                strokeWidth: 4,
                opacity: 1
            }, image.virtual);
        }

        return markup;
    }

    function objectMarkup(object) {
        if (object.type === 'optical-element') {
            return `<g class="qmx-optics-object" data-object-id="${esc(object.id)}">${opticalElementMarkup(object)}</g>`;
        }
        if (object.type === 'object-arrow') {
            return `<g class="qmx-optics-object" data-object-id="${esc(object.id)}">${arrowMarkup(object)}</g>`;
        }
        if (object.type === 'manual-ray') {
            return `<g class="qmx-optics-object" data-object-id="${esc(object.id)}">${manualRayMarkup(object)}</g>`;
        }
        return `<g class="qmx-optics-object" data-object-id="${esc(object.id)}">${textMarkup(object)}</g>`;
    }

    function bounds(object) {
        const axisY = state.document.axisY;
        if (object.type === 'optical-element') {
            return { x: object.x - 42, y: axisY - object.height / 2, w: 84, h: object.height };
        }
        if (object.type === 'object-arrow') {
            return {
                x: object.x - 20,
                y: Math.min(axisY, axisY - object.height) - 12,
                w: 40,
                h: Math.abs(object.height) + 24
            };
        }
        if (object.type === 'manual-ray') {
            return {
                x: Math.min(object.x1, object.x2),
                y: Math.min(object.y1, object.y2),
                w: Math.abs(object.x2 - object.x1),
                h: Math.abs(object.y2 - object.y1)
            };
        }
        return { x: object.x - 65, y: object.y - 28, w: 130, h: 56 };
    }

    function selectionMarkup() {
        const object = selectedObject();
        if (!object) return '';

        const box = bounds(object);
        let markup = `<rect class="qmx-optics-select-box" x="${box.x - 7}" y="${box.y - 7}" width="${Math.max(1, box.w) + 14}" height="${Math.max(1, box.h) + 14}"/>`;

        if (object.type === 'object-arrow') {
            markup += `<circle class="qmx-optics-handle" data-handle="arrow-tip" cx="${object.x}" cy="${state.document.axisY - object.height}" r="7"/>`;
        } else if (object.type === 'optical-element') {
            markup += `<circle class="qmx-optics-handle" data-handle="element-top" cx="${object.x}" cy="${state.document.axisY - object.height / 2}" r="7"/>`;
        } else if (object.type === 'manual-ray') {
            markup += `<circle class="qmx-optics-handle" data-handle="ray-start" cx="${object.x1}" cy="${object.y1}" r="7"/><circle class="qmx-optics-handle" data-handle="ray-end" cx="${object.x2}" cy="${object.y2}" r="7"/>`;
        }

        return markup;
    }

    function renderDraft() {
        if (!state.rayDraft) {
            state.draftLayer.innerHTML = '';
            return;
        }

        state.draftLayer.innerHTML = `<line class="qmx-optics-draft" x1="${state.rayDraft.start.x}" y1="${state.rayDraft.start.y}" x2="${state.rayDraft.current.x}" y2="${state.rayDraft.current.y}" marker-end="url(#qmx-optics-arrow)"/>`;
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;

        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        state.gridLayer.innerHTML = gridMarkup();
        state.constructionLayer.innerHTML = constructionMarkup();
        state.objectLayer.innerHTML = state.document.objects.map(objectMarkup).join('');
        state.selectionLayer.innerHTML = selectionMarkup();
        renderDraft();

        if (!options.keepProperties) renderProperties();
        renderSummary();
        updateHistoryButtons();
    }

    function renderSummary() {
        const image = computeImage();
        if (!opticalElement() || !objectArrow()) {
            state.controls.summary.textContent = 'Place an optical element and an object arrow to calculate the image.';
            return;
        }

        if (!image) {
            state.controls.summary.textContent = 'The object must be on the left side of the optical element.';
            return;
        }

        if (image.atInfinity) {
            state.controls.summary.textContent = 'Object is at the focal point: image forms at infinity.';
            return;
        }

        const type = image.virtual ? 'Virtual' : 'Real';
        const orientation = image.height * objectArrow().height < 0 ? 'inverted' : 'upright';
        state.controls.summary.textContent =
            `${type}, ${orientation} image · u = ${image.u.toFixed(1)} px · v = ${image.v.toFixed(1)} px · m = ${image.magnification.toFixed(2)}`;
    }

    function renderProperties() {
        const object = selectedObject();

        if (!object) {
            state.controls.props.innerHTML = `<div class="qmx-optics-empty">Select an optical element, object, ray or text.</div>`;
            return;
        }

        if (object.type === 'optical-element') {
            state.controls.props.innerHTML = `
<div class="qmx-optics-fields">
    <label class="qmx-optics-field">Optical element
        <select data-object-prop="opticalType">
            ${['convex-lens','concave-lens','concave-mirror','convex-mirror','plane-mirror'].map((type) => `<option value="${type}"${object.opticalType === type ? ' selected' : ''}>${type}</option>`).join('')}
        </select>
    </label>
    <label class="qmx-optics-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-optics-row">
        <label class="qmx-optics-field">X position<input type="number" step="1" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-optics-field">Height<input type="number" min="60" data-object-prop="height" value="${object.height.toFixed(1)}"></label>
    </div>
    <label class="qmx-optics-field">Focal length<input type="number" min="20" max="800" data-object-prop="focalLength" value="${object.focalLength.toFixed(1)}"></label>
    <div class="qmx-optics-row">
        <label class="qmx-optics-field">Line colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-optics-field">Fill<input type="color" data-object-prop="fill" value="${object.fill}"></label>
    </div>
    <label class="qmx-optics-field">Line width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
</div>`;
            return;
        }

        if (object.type === 'object-arrow') {
            state.controls.props.innerHTML = `
<div class="qmx-optics-fields">
    <label class="qmx-optics-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-optics-row">
        <label class="qmx-optics-field">X position<input type="number" step="1" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-optics-field">Height<input type="number" step="1" data-object-prop="height" value="${object.height.toFixed(1)}"></label>
    </div>
    <div class="qmx-optics-row">
        <label class="qmx-optics-field">Colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-optics-field">Width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
    </div>
</div>`;
            return;
        }

        if (object.type === 'manual-ray') {
            state.controls.props.innerHTML = `
<div class="qmx-optics-fields">
    <label class="qmx-optics-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-optics-row">
        <label class="qmx-optics-field">Start X<input type="number" data-object-prop="x1" value="${object.x1.toFixed(1)}"></label>
        <label class="qmx-optics-field">Start Y<input type="number" data-object-prop="y1" value="${object.y1.toFixed(1)}"></label>
    </div>
    <div class="qmx-optics-row">
        <label class="qmx-optics-field">End X<input type="number" data-object-prop="x2" value="${object.x2.toFixed(1)}"></label>
        <label class="qmx-optics-field">End Y<input type="number" data-object-prop="y2" value="${object.y2.toFixed(1)}"></label>
    </div>
    <div class="qmx-optics-row">
        <label class="qmx-optics-field">Colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-optics-field">Width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
    </div>
    <label class="qmx-optics-check"><input type="checkbox" data-object-prop="dash"${object.dash ? ' checked' : ''}> Dashed ray</label>
    <label class="qmx-optics-check"><input type="checkbox" data-object-prop="arrow"${object.arrow ? ' checked' : ''}> Arrow head</label>
</div>`;
            return;
        }

        state.controls.props.innerHTML = `
<div class="qmx-optics-fields">
    <label class="qmx-optics-field">Text<textarea data-object-prop="text">${esc(object.text)}</textarea></label>
    <div class="qmx-optics-row">
        <label class="qmx-optics-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-optics-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-optics-row">
        <label class="qmx-optics-field">Font size<input type="number" min="8" max="96" data-object-prop="fontSize" value="${object.fontSize}"></label>
        <label class="qmx-optics-field">Rotation<input type="number" data-object-prop="rotation" value="${object.rotation}"></label>
    </div>
    <label class="qmx-optics-field">Text colour<input type="color" data-object-prop="textColor" value="${object.textColor}"></label>
    <label class="qmx-optics-check"><input type="checkbox" data-object-prop="fontWeight"${object.fontWeight === 'bold' ? ' checked' : ''}> Bold</label>
</div>`;
    }

    function onPropertyInput(event) {
        const control = event.target.closest('[data-object-prop]');
        const object = selectedObject();
        if (!control || !object) return;

        const prop = control.dataset.objectProp;

        if (['dash', 'arrow'].includes(prop)) {
            object[prop] = control.checked;
        } else if (prop === 'fontWeight') {
            object.fontWeight = control.checked ? 'bold' : 'normal';
        } else if ([
            'opticalType', 'label', 'stroke', 'fill', 'text', 'textColor'
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

    function placeOpticalElement(type, x) {
        const existing = opticalElement();
        if (existing) {
            existing.opticalType = type;
            existing.x = x;
            existing.label = type.includes('lens') ? 'Lens' : 'Mirror';
            state.selectedId = existing.id;
        } else {
            const object = makeOpticalElement(type, x);
            state.document.objects.push(object);
            state.selectedId = object.id;
        }
        pushHistory();
        render();
        setStatus('Optical element placed.');
    }

    function placeObjectArrow(x) {
        const existing = objectArrow();
        if (existing) {
            existing.x = x;
            state.selectedId = existing.id;
        } else {
            const object = makeObjectArrow(x);
            state.document.objects.push(object);
            state.selectedId = object.id;
        }
        pushHistory();
        render();
        setStatus('Object arrow placed.');
    }

    function onPointerDown(event) {
        if (!state.document || event.button !== 0) return;

        const point = pointFromEvent(event);
        const handle = event.target.closest('[data-handle]');
        const group = event.target.closest('[data-object-id]');

        if (state.activeTool === 'manual-ray') {
            state.rayDraft = {
                pointerId: event.pointerId,
                start: point,
                current: point
            };
            state.svg.setPointerCapture(event.pointerId);
            renderDraft();
            event.preventDefault();
            return;
        }

        if (state.activeTool === 'object-arrow') {
            placeObjectArrow(point.x);
            setTool('select');
            return;
        }

        if ([
            'convex-lens', 'concave-lens', 'concave-mirror', 'convex-mirror', 'plane-mirror'
        ].includes(state.activeTool)) {
            placeOpticalElement(state.activeTool, point.x);
            setTool('select');
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

        if (state.activeTool !== 'select') return;

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
            return;
        }

        selectObject(null);
    }

    function onPointerMove(event) {
        if (state.rayDraft && state.rayDraft.pointerId === event.pointerId) {
            state.rayDraft.current = pointFromEvent(event);
            renderDraft();
            return;
        }

        const interaction = state.interaction;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        const object = selectedObject();
        if (!object) return;

        const point = pointFromEvent(event);
        const dx = point.x - interaction.start.x;
        const dy = point.y - interaction.start.y;

        if (interaction.type === 'move') {
            if (object.type === 'optical-element' || object.type === 'object-arrow') {
                object.x = interaction.original.x + dx;
            } else if (object.type === 'manual-ray') {
                object.x1 = interaction.original.x1 + dx;
                object.y1 = interaction.original.y1 + dy;
                object.x2 = interaction.original.x2 + dx;
                object.y2 = interaction.original.y2 + dy;
            } else {
                object.x = interaction.original.x + dx;
                object.y = interaction.original.y + dy;
            }
        } else if (interaction.type === 'arrow-tip' && object.type === 'object-arrow') {
            object.height = state.document.axisY - point.y;
        } else if (interaction.type === 'element-top' && object.type === 'optical-element') {
            object.height = Math.max(60, 2 * Math.abs(state.document.axisY - point.y));
        } else if (interaction.type === 'ray-start' && object.type === 'manual-ray') {
            object.x1 = point.x;
            object.y1 = point.y;
        } else if (interaction.type === 'ray-end' && object.type === 'manual-ray') {
            object.x2 = point.x;
            object.y2 = point.y;
        }

        state.document = Diagram.normalizeSpec(state.document);
        render({ keepProperties: true });
    }

    function onPointerUp(event) {
        if (state.rayDraft && state.rayDraft.pointerId === event.pointerId) {
            const end = pointFromEvent(event);
            const length = Math.hypot(
                end.x - state.rayDraft.start.x,
                end.y - state.rayDraft.start.y
            );

            if (length >= 8) {
                const object = makeManualRay(
                    state.rayDraft.start.x,
                    state.rayDraft.start.y,
                    end.x,
                    end.y
                );
                state.document.objects.push(object);
                state.selectedId = object.id;
                pushHistory();
                setStatus('Manual ray added.');
            } else {
                setStatus('Drag farther to create a ray.');
            }

            state.rayDraft = null;
            try {
                state.svg.releasePointerCapture(event.pointerId);
            } catch (error) {
                // Capture may already be released.
            }
            render();
            return;
        }

        const interaction = state.interaction;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        try {
            state.svg.releasePointerCapture(event.pointerId);
        } catch (error) {
            // Capture may already be released.
        }

        state.interaction = null;
        pushHistory();
        render();
    }

    function duplicateSelected() {
        const object = selectedObject();
        if (!object) return;

        if (object.type === 'optical-element' || object.type === 'object-arrow') {
            setStatus('Only one optical element and one object arrow are used per construction.');
            return;
        }

        const copy = clone(object);
        copy.id = uid(object.type);

        if (copy.type === 'manual-ray') {
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

    function deleteSelected() {
        if (!state.selectedId) return;
        state.document.objects = state.document.objects.filter((object) => object.id !== state.selectedId);
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Object deleted.');
    }

    function clearManualRays() {
        const count = state.document.objects.filter((object) => object.type === 'manual-ray').length;
        if (!count) return;

        state.document.objects = state.document.objects.filter((object) => object.type !== 'manual-ray');
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Manual rays removed.');
    }

    function applyPreset(opticalType, elementX, objectX, objectHeight, focalLength) {
        state.document.objects = state.document.objects.filter((object) =>
            !['optical-element', 'object-arrow', 'manual-ray'].includes(object.type)
        );
        const element = makeOpticalElement(opticalType, elementX);
        element.focalLength = focalLength;
        const object = makeObjectArrow(objectX, objectHeight);
        state.document.objects.unshift(element, object);
        state.selectedId = object.id;
        pushHistory();
        render();
    }

    function addConvexPreset() {
        applyPreset('convex-lens', 560, 220, 130, 120);
        setStatus('Convex lens example inserted.');
    }

    function addMirrorPreset() {
        applyPreset('concave-mirror', 720, 260, 130, 140);
        setStatus('Concave mirror example inserted.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Ray Optics diagram?')) return;

        state.document = createDocument();
        state.selectedId = null;
        state.interaction = null;
        state.rayDraft = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Ray Optics diagram.');
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
        setStatus('Ray Optics diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'ray-optics')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'ray-optics';
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

        if (state.document.mode !== 'ray-optics') {
            state.document = createDocument();
        }

        state.selectedId = null;
        state.activeTool = 'select';
        state.interaction = null;
        state.rayDraft = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();

        state.root.hidden = false;
        document.body.dataset.qmxOpticsOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(context.initialSpec
            ? 'Existing Ray Optics diagram loaded.'
            : 'Place an optical element and object arrow, or use a preset.');

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;
        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxOpticsOverflow || '';
        delete document.body.dataset.qmxOpticsOverflow;
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

        if (spec.mode !== 'ray-optics') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }

        open({
            tool: { id: 'ray-optics' },
            textarea,
            initialSpec: spec,
            replaceRange,
            editMode: true
        });

        return true;
    }

    let handlersRegistered = false;

    function registerHandlers() {
        const launcher = window.QmxDiagramLauncher;
        if (!launcher?.registerToolHandler) return false;
        if (handlersRegistered) return true;

        let registered = false;

        ['ray-optics', 'optics', 'ray-diagram'].forEach((id) => {
            try {
                launcher.registerToolHandler(id, open);
                if (id === 'ray-optics') registered = true;
            } catch (error) {
                const message = String(error?.message || error);
                if (!/unknown diagram tool|already registered|duplicate/i.test(message)) {
                    throw error;
                }
            }
        });

        handlersRegistered = registered;
        return registered;
    }

    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;

        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        if (event.key === 'Escape') {
            if (state.rayDraft) {
                state.rayDraft = null;
                render();
                setStatus('Ray draft cancelled.');
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

    window.QmxRayOpticsEditor = Object.freeze({
        version: '1.0.1',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
