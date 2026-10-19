(function (window, document) {
    'use strict';

    if (window.QmxTimelineEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Timeline] Diagram renderer must load first.');
        return;
    }

    const TOOLS = [
        ['select', 'Select', 'নির্বাচন'],
        ['event', 'Event', 'ঘটনা'],
        ['milestone', 'Milestone', 'মাইলস্টোন'],
        ['period', 'Period / Range', 'সময়কাল'],
        ['text', 'Annotation', 'টীকা']
    ];

    const COLOURS = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2'];

    const state = {
        root: null,
        svg: null,
        gridLayer: null,
        axisLayer: null,
        objectLayer: null,
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

    function uid(prefix = 'timeline') {
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
            version: 8,
            id: uid('timeline'),
            mode: 'timeline',
            title: 'Timeline Diagram',
            width: 1000,
            height: 600,
            background: '#ffffff',
            orientation: 'horizontal',
            scaleMode: 'date',
            axisStart: '2020-01-01',
            axisEnd: '2025-01-01',
            tickCount: 10,
            showGrid: true,
            showTickLabels: true,
            showConnectors: true,
            axisColor: '#334155',
            axisWidth: 3,
            laneSpacing: 86,
            objects: []
        };
    }

    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
    }

    function timelineObjects() {
        return state.document.objects.filter((object) =>
            ['event', 'milestone', 'period'].includes(object.type)
        );
    }

    function annotationObjects() {
        return state.document.objects.filter((object) => object.type === 'text');
    }

    function axisArea() {
        return state.document.orientation === 'vertical'
            ? {
                start: 70,
                end: state.document.height - 70,
                fixed: state.document.width / 2
            }
            : {
                start: 75,
                end: state.document.width - 75,
                fixed: state.document.height / 2
            };
    }

    function axisLength() {
        const area = axisArea();
        return area.end - area.start;
    }

    function positionToPoint(position, lane = 0) {
        const area = axisArea();
        const p = clamp(position, 0, 1, 0.5);
        const laneOffset = lane * state.document.laneSpacing;

        return state.document.orientation === 'vertical'
            ? {
                x: area.fixed + laneOffset,
                y: area.start + p * axisLength(),
                axisX: area.fixed,
                axisY: area.start + p * axisLength()
            }
            : {
                x: area.start + p * axisLength(),
                y: area.fixed + laneOffset,
                axisX: area.start + p * axisLength(),
                axisY: area.fixed
            };
    }

    function pointToPosition(point) {
        const area = axisArea();
        const raw = state.document.orientation === 'vertical'
            ? (point.y - area.start) / axisLength()
            : (point.x - area.start) / axisLength();

        return clamp(raw, 0, 1, 0.5);
    }

    function pointToLane(point) {
        const area = axisArea();
        const raw = state.document.orientation === 'vertical'
            ? (point.x - area.fixed) / state.document.laneSpacing
            : (point.y - area.fixed) / state.document.laneSpacing;

        return Math.round(clamp(raw, -3, 3, 0));
    }

    function parseAxisValue(value) {
        const mode = state.document.scaleMode;

        if (mode === 'date') {
            const timestamp = Date.parse(String(value || ''));
            return Number.isFinite(timestamp) ? timestamp : null;
        }

        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function axisEndpoints() {
        let start = parseAxisValue(state.document.axisStart);
        let end = parseAxisValue(state.document.axisEnd);

        if (start === null || end === null || end <= start) {
            if (state.document.scaleMode === 'date') {
                start = Date.UTC(2020, 0, 1);
                end = Date.UTC(2025, 0, 1);
            } else {
                start = 0;
                end = 100;
            }
        }

        return { start, end };
    }

    function valueToPosition(value) {
        const parsed = parseAxisValue(value);
        const { start, end } = axisEndpoints();
        if (parsed === null) return null;
        return clamp((parsed - start) / (end - start), 0, 1, 0);
    }

    function positionToValue(position) {
        const { start, end } = axisEndpoints();
        const value = start + clamp(position, 0, 1, 0) * (end - start);

        if (state.document.scaleMode === 'date') {
            return new Date(value).toISOString().slice(0, 10);
        }

        if (state.document.scaleMode === 'year') {
            return String(Math.round(value));
        }

        return String(Number(value.toFixed(4)));
    }

    function formatPosition(position) {
        const value = positionToValue(position);

        if (state.document.scaleMode === 'date') {
            const date = new Date(`${value}T00:00:00Z`);
            if (state.document.tickCount <= 8) {
                return date.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    timeZone: 'UTC'
                });
            }
            return date.getUTCFullYear().toString();
        }

        return value;
    }

    function pointFromEvent(event) {
        const point = state.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        const local = matrix ? point.matrixTransform(matrix.inverse()) : point;
        return { x: local.x, y: local.y };
    }

    function nextColour() {
        return COLOURS[timelineObjects().length % COLOURS.length];
    }

    function makeEvent(type, position, lane) {
        const count = timelineObjects().filter((object) => object.type !== 'period').length + 1;

        return {
            id: uid(type),
            type,
            position,
            lane,
            title: type === 'milestone' ? `Milestone ${count}` : `Event ${count}`,
            description: '',
            dateLabel: '',
            color: nextColour(),
            markerSize: type === 'milestone' ? 12 : 9,
            cardWidth: 180,
            cardHeight: 64,
            opacity: 1,
            showDate: true
        };
    }

    function makePeriod(position, lane) {
        return {
            id: uid('period'),
            type: 'period',
            startPosition: clamp(position - 0.12, 0, 1, 0.2),
            endPosition: clamp(position + 0.12, 0, 1, 0.4),
            lane,
            title: `Period ${timelineObjects().filter((object) => object.type === 'period').length + 1}`,
            description: '',
            startLabel: '',
            endLabel: '',
            color: nextColour(),
            fillOpacity: 0.24,
            thickness: 30,
            opacity: 1,
            showDates: true
        };
    }

    function makeText(point) {
        return {
            id: uid('text'),
            type: 'text',
            x: point.x,
            y: point.y,
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
        if (document.getElementById('qmx-timeline-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-timeline-editor-styles';
        style.textContent = `
.qmx-timeline-editor[hidden]{display:none!important}
.qmx-timeline-editor{position:fixed;inset:0;z-index:10220;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.7);backdrop-filter:blur(2px)}
.qmx-timeline-dialog{width:min(1550px,100%);height:min(96vh,980px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.38)}
.qmx-timeline-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-timeline-title{margin-right:auto}.qmx-timeline-title strong{display:block}.qmx-timeline-title span{display:block;color:#64748b;font-size:11px}
.qmx-timeline-btn,.qmx-timeline-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-timeline-btn:hover,.qmx-timeline-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-timeline-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-timeline-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-timeline-btn.is-danger{color:#b91c1c}.qmx-timeline-close{font-size:20px;line-height:1}
.qmx-timeline-workspace{min-height:0;flex:1;display:grid;grid-template-columns:220px minmax(0,1fr) 310px;gap:10px;padding:10px}
.qmx-timeline-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-timeline-panel h3{margin:0 0 8px;font-size:13px}.qmx-timeline-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-timeline-tool{min-height:58px;padding:6px 5px;font-size:10px}.qmx-timeline-tool span{display:block;margin-top:2px;color:#64748b;font-size:9px;font-weight:500}
.qmx-timeline-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-timeline-quick{display:grid;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0}
.qmx-timeline-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-timeline-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-timeline-stage{display:block;width:min(100%,1180px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none;user-select:none}
.qmx-timeline-object{cursor:move}.qmx-timeline-hit{fill:transparent;stroke:transparent;stroke-width:20;pointer-events:all}
.qmx-timeline-select{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-timeline-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:ew-resize;pointer-events:all}
.qmx-timeline-fields{display:grid;gap:9px}.qmx-timeline-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-timeline-field input,.qmx-timeline-field textarea,.qmx-timeline-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-timeline-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-timeline-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-timeline-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-timeline-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-timeline-summary{margin-top:10px;padding:9px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.55}
.qmx-timeline-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-timeline-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-timeline-footer .qmx-timeline-btn:first-of-type{margin-left:auto}
@media(max-width:1050px){.qmx-timeline-workspace{grid-template-columns:180px minmax(0,1fr) 260px}.qmx-timeline-tools{grid-template-columns:1fr}}
@media(max-width:760px){.qmx-timeline-editor{padding:0}.qmx-timeline-dialog{width:100%;height:100%;border-radius:0}.qmx-timeline-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(350px,1fr) auto;overflow:auto}.qmx-timeline-panel{overflow:visible}.qmx-timeline-tools{grid-template-columns:repeat(2,1fr)}.qmx-timeline-header{overflow-x:auto}.qmx-timeline-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-timeline-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-timeline-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-timeline-title">
<header class="qmx-timeline-header">
    <div class="qmx-timeline-title">
        <strong id="qmx-timeline-title">Timeline Diagram</strong>
        <span>Events, milestones, periods, date scale, lanes and annotations</span>
    </div>
    <button type="button" class="qmx-timeline-btn" data-timeline-new>New</button>
    <button type="button" class="qmx-timeline-btn" data-timeline-undo>Undo</button>
    <button type="button" class="qmx-timeline-btn" data-timeline-redo>Redo</button>
    <button type="button" class="qmx-timeline-btn" data-timeline-duplicate>Duplicate</button>
    <button type="button" class="qmx-timeline-btn is-danger" data-timeline-delete>Delete</button>
    <button type="button" class="qmx-timeline-btn qmx-timeline-close" data-timeline-close aria-label="Close">×</button>
</header>
<div class="qmx-timeline-workspace">
    <aside class="qmx-timeline-panel">
        <h3>Timeline tools</h3>
        <div class="qmx-timeline-tools" data-timeline-tools></div>
        <div class="qmx-timeline-quick">
            <button type="button" class="qmx-timeline-btn" data-timeline-history-preset>Historical preset</button>
            <button type="button" class="qmx-timeline-btn" data-timeline-project-preset>Project preset</button>
            <button type="button" class="qmx-timeline-btn" data-timeline-clear>Remove all items</button>
        </div>
        <p class="qmx-timeline-help">
            Place events, milestones and periods on the axis. Drag along the axis to change time and across the axis to change lanes.
            Period end handles resize the date range.
        </p>
    </aside>
    <main class="qmx-timeline-stage-wrap">
        <svg class="qmx-timeline-stage" data-timeline-svg viewBox="0 0 1000 600" tabindex="0" aria-label="Timeline diagram canvas">
            <rect data-timeline-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-timeline-grid-layer></g>
            <g data-timeline-axis-layer></g>
            <g data-timeline-object-layer></g>
            <g data-timeline-selection-layer></g>
        </svg>
    </main>
    <aside class="qmx-timeline-panel">
        <h3>Document</h3>
        <div class="qmx-timeline-fields">
            <label class="qmx-timeline-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-timeline-row">
                <label class="qmx-timeline-field">Width<input type="number" min="360" max="2400" data-doc-prop="width"></label>
                <label class="qmx-timeline-field">Height<input type="number" min="260" max="1800" data-doc-prop="height"></label>
            </div>
            <label class="qmx-timeline-field">Orientation
                <select data-doc-prop="orientation">
                    <option value="horizontal">Horizontal</option>
                    <option value="vertical">Vertical</option>
                </select>
            </label>
            <label class="qmx-timeline-field">Scale type
                <select data-doc-prop="scaleMode">
                    <option value="date">Date</option>
                    <option value="year">Year</option>
                    <option value="number">Number</option>
                </select>
            </label>
            <div class="qmx-timeline-row">
                <label class="qmx-timeline-field">Axis start<input type="text" data-doc-prop="axisStart"></label>
                <label class="qmx-timeline-field">Axis end<input type="text" data-doc-prop="axisEnd"></label>
            </div>
            <div class="qmx-timeline-row">
                <label class="qmx-timeline-field">Ticks<input type="number" min="2" max="30" data-doc-prop="tickCount"></label>
                <label class="qmx-timeline-field">Lane spacing<input type="number" min="45" max="180" data-doc-prop="laneSpacing"></label>
            </div>
            <div class="qmx-timeline-row">
                <label class="qmx-timeline-field">Background<input type="color" data-doc-prop="background"></label>
                <label class="qmx-timeline-field">Axis colour<input type="color" data-doc-prop="axisColor"></label>
            </div>
            <label class="qmx-timeline-field">Axis width<input type="number" min=".5" max="20" step=".5" data-doc-prop="axisWidth"></label>
            <label class="qmx-timeline-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label>
            <label class="qmx-timeline-check"><input type="checkbox" data-doc-prop="showTickLabels"> Show tick labels</label>
            <label class="qmx-timeline-check"><input type="checkbox" data-doc-prop="showConnectors"> Show connectors</label>
        </div>
        <hr class="qmx-timeline-divider">
        <h3>Selected object</h3>
        <div data-timeline-properties></div>
        <div class="qmx-timeline-summary" data-timeline-summary></div>
    </aside>
</div>
<footer class="qmx-timeline-footer">
    <span class="qmx-timeline-status" data-timeline-status aria-live="polite"></span>
    <button type="button" class="qmx-timeline-btn" data-timeline-export-svg>Export SVG</button>
    <button type="button" class="qmx-timeline-btn" data-timeline-export-png>Export PNG</button>
    <button type="button" class="qmx-timeline-btn is-primary" data-timeline-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.svg = root.querySelector('[data-timeline-svg]');
        state.gridLayer = root.querySelector('[data-timeline-grid-layer]');
        state.axisLayer = root.querySelector('[data-timeline-axis-layer]');
        state.objectLayer = root.querySelector('[data-timeline-object-layer]');
        state.selectionLayer = root.querySelector('[data-timeline-selection-layer]');

        state.controls = {
            bg: root.querySelector('[data-timeline-bg]'),
            tools: root.querySelector('[data-timeline-tools]'),
            props: root.querySelector('[data-timeline-properties]'),
            summary: root.querySelector('[data-timeline-summary]'),
            status: root.querySelector('[data-timeline-status]'),
            undo: root.querySelector('[data-timeline-undo]'),
            redo: root.querySelector('[data-timeline-redo]')
        };

        TOOLS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-timeline-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        state.controls.tools.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (button) setTool(button.dataset.tool);
        });

        root.querySelector('[data-timeline-close]').addEventListener('click', close);
        root.querySelector('[data-timeline-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-timeline-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-timeline-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-timeline-history-preset]').addEventListener('click', historicalPreset);
        root.querySelector('[data-timeline-project-preset]').addEventListener('click', projectPreset);
        root.querySelector('[data-timeline-clear]').addEventListener('click', clearItems);
        root.querySelector('[data-timeline-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-timeline-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-timeline-insert]').addEventListener('click', insertIntoQuestion);

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
            ? 'Select and drag timeline items.'
            : `Click the canvas to place ${TOOLS.find(([id]) => id === state.activeTool)?.[1] || 'item'}.`);
    }

    function onDocumentInput(event) {
        const control = event.currentTarget;
        const prop = control.dataset.docProp;
        if (!prop || !state.document) return;

        if (['showGrid', 'showTickLabels', 'showConnectors'].includes(prop)) {
            state.document[prop] = control.checked;
        } else if ([
            'width', 'height', 'tickCount', 'laneSpacing', 'axisWidth'
        ].includes(prop)) {
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

        const area = axisArea();
        const parts = [];

        for (let index = 0; index <= state.document.tickCount; index += 1) {
            const p = index / state.document.tickCount;
            const point = positionToPoint(p, 0);

            if (state.document.orientation === 'vertical') {
                parts.push(`<line x1="35" y1="${point.axisY}" x2="${state.document.width - 35}" y2="${point.axisY}" stroke="#e2e8f0" stroke-width="1"/>`);
            } else {
                parts.push(`<line x1="${point.axisX}" y1="35" x2="${point.axisX}" y2="${state.document.height - 35}" stroke="#e2e8f0" stroke-width="1"/>`);
            }
        }

        return parts.join('');
    }

    function axisMarkup() {
        const area = axisArea();
        const parts = [];

        if (state.document.orientation === 'vertical') {
            parts.push(`<line x1="${area.fixed}" y1="${area.start}" x2="${area.fixed}" y2="${area.end}" stroke="${esc(state.document.axisColor)}" stroke-width="${state.document.axisWidth}" vector-effect="non-scaling-stroke"/>`);
        } else {
            parts.push(`<line x1="${area.start}" y1="${area.fixed}" x2="${area.end}" y2="${area.fixed}" stroke="${esc(state.document.axisColor)}" stroke-width="${state.document.axisWidth}" vector-effect="non-scaling-stroke"/>`);
        }

        for (let index = 0; index <= state.document.tickCount; index += 1) {
            const p = index / state.document.tickCount;
            const point = positionToPoint(p, 0);

            if (state.document.orientation === 'vertical') {
                parts.push(`<line x1="${point.axisX - 8}" y1="${point.axisY}" x2="${point.axisX + 8}" y2="${point.axisY}" stroke="${esc(state.document.axisColor)}" stroke-width="1.6"/>`);
                if (state.document.showTickLabels) {
                    parts.push(`<text x="${point.axisX + 16}" y="${point.axisY}" fill="#475569" font-size="12" dominant-baseline="middle">${esc(formatPosition(p))}</text>`);
                }
            } else {
                parts.push(`<line x1="${point.axisX}" y1="${point.axisY - 8}" x2="${point.axisX}" y2="${point.axisY + 8}" stroke="${esc(state.document.axisColor)}" stroke-width="1.6"/>`);
                if (state.document.showTickLabels) {
                    parts.push(`<text x="${point.axisX}" y="${point.axisY + 24}" fill="#475569" font-size="12" text-anchor="middle">${esc(formatPosition(p))}</text>`);
                }
            }
        }

        return parts.join('');
    }

    function eventCardPosition(object) {
        const point = positionToPoint(object.position, object.lane);
        const horizontal = state.document.orientation === 'horizontal';

        if (horizontal) {
            return {
                x: point.x - object.cardWidth / 2,
                y: object.lane < 0
                    ? point.y - object.cardHeight
                    : point.y,
                markerX: point.axisX,
                markerY: point.axisY,
                connectorX: point.x,
                connectorY: object.lane < 0 ? point.y : point.y
            };
        }

        return {
            x: object.lane < 0
                ? point.x - object.cardWidth
                : point.x,
            y: point.y - object.cardHeight / 2,
            markerX: point.axisX,
            markerY: point.axisY,
            connectorX: point.x,
            connectorY: point.y
        };
    }

    function eventMarkup(object) {
        const point = positionToPoint(object.position, object.lane);
        const card = eventCardPosition(object);
        const dateText = object.dateLabel || formatPosition(object.position);
        const marker = object.type === 'milestone'
            ? `<rect x="${point.axisX - object.markerSize}" y="${point.axisY - object.markerSize}" width="${object.markerSize * 2}" height="${object.markerSize * 2}" fill="${esc(object.color)}" transform="rotate(45 ${point.axisX} ${point.axisY})"/>`
            : `<circle cx="${point.axisX}" cy="${point.axisY}" r="${object.markerSize}" fill="${esc(object.color)}"/>`;
        const connector = state.document.showConnectors && object.lane !== 0
            ? `<line x1="${point.axisX}" y1="${point.axisY}" x2="${point.x}" y2="${point.y}" stroke="${esc(object.color)}" stroke-width="2" vector-effect="non-scaling-stroke"/>`
            : '';

        return `
<g class="qmx-timeline-object" data-object-id="${esc(object.id)}" opacity="${object.opacity}">
    ${connector}
    ${marker}
    <rect x="${card.x}" y="${card.y}" width="${object.cardWidth}" height="${object.cardHeight}" rx="10" fill="#ffffff" stroke="${esc(object.color)}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <rect x="${card.x}" y="${card.y}" width="7" height="${object.cardHeight}" rx="4" fill="${esc(object.color)}"/>
    <text x="${card.x + 16}" y="${card.y + 22}" fill="#0f172a" font-size="15" font-weight="700">${esc(object.title)}</text>
    ${object.showDate ? `<text x="${card.x + 16}" y="${card.y + 42}" fill="${esc(object.color)}" font-size="12" font-weight="600">${esc(dateText)}</text>` : ''}
    ${object.description ? `<text x="${card.x + 16}" y="${card.y + 57}" fill="#64748b" font-size="11">${esc(object.description)}</text>` : ''}
    <rect class="qmx-timeline-hit" x="${card.x}" y="${card.y}" width="${object.cardWidth}" height="${object.cardHeight}" rx="10"/>
</g>`;
    }

    function periodBounds(object) {
        const start = positionToPoint(object.startPosition, object.lane);
        const end = positionToPoint(object.endPosition, object.lane);
        const horizontal = state.document.orientation === 'horizontal';

        return horizontal
            ? {
                x: Math.min(start.x, end.x),
                y: start.y - object.thickness / 2,
                width: Math.abs(end.x - start.x),
                height: object.thickness,
                start,
                end
            }
            : {
                x: start.x - object.thickness / 2,
                y: Math.min(start.y, end.y),
                width: object.thickness,
                height: Math.abs(end.y - start.y),
                start,
                end
            };
    }

    function periodMarkup(object) {
        const box = periodBounds(object);
        const startText = object.startLabel || formatPosition(object.startPosition);
        const endText = object.endLabel || formatPosition(object.endPosition);
        const horizontal = state.document.orientation === 'horizontal';

        return `
<g class="qmx-timeline-object" data-object-id="${esc(object.id)}" opacity="${object.opacity}">
    <rect x="${box.x}" y="${box.y}" width="${Math.max(3, box.width)}" height="${Math.max(3, box.height)}" rx="8" fill="${esc(object.color)}" fill-opacity="${object.fillOpacity}" stroke="${esc(object.color)}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <text x="${box.x + box.width / 2}" y="${box.y + box.height / 2}" fill="${esc(object.color)}" font-size="14" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(object.title)}</text>
    ${object.showDates && horizontal ? `<text x="${box.x}" y="${box.y - 8}" fill="#475569" font-size="11" text-anchor="start">${esc(startText)}</text><text x="${box.x + box.width}" y="${box.y - 8}" fill="#475569" font-size="11" text-anchor="end">${esc(endText)}</text>` : ''}
    <rect class="qmx-timeline-hit" x="${box.x}" y="${box.y}" width="${Math.max(3, box.width)}" height="${Math.max(3, box.height)}" rx="8"/>
</g>`;
    }

    function textMarkup(object) {
        return `
<g class="qmx-timeline-object" data-object-id="${esc(object.id)}">
    <text x="${object.x}" y="${object.y}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})">${esc(object.text)}</text>
    <rect class="qmx-timeline-hit" x="${object.x - 75}" y="${object.y - 32}" width="150" height="64"/>
</g>`;
    }

    function selectionMarkup() {
        const object = selectedObject();
        if (!object) return '';

        if (object.type === 'period') {
            const box = periodBounds(object);
            const horizontal = state.document.orientation === 'horizontal';
            const startHandle = horizontal
                ? { x: box.x, y: box.y + box.height / 2 }
                : { x: box.x + box.width / 2, y: box.y };
            const endHandle = horizontal
                ? { x: box.x + box.width, y: box.y + box.height / 2 }
                : { x: box.x + box.width / 2, y: box.y + box.height };

            return `
<rect class="qmx-timeline-select" x="${box.x - 6}" y="${box.y - 6}" width="${box.width + 12}" height="${box.height + 12}"/>
<circle class="qmx-timeline-handle" data-handle="period-start" cx="${startHandle.x}" cy="${startHandle.y}" r="7"/>
<circle class="qmx-timeline-handle" data-handle="period-end" cx="${endHandle.x}" cy="${endHandle.y}" r="7"/>`;
        }

        if (object.type === 'text') {
            return `<rect class="qmx-timeline-select" x="${object.x - 80}" y="${object.y - 37}" width="160" height="74"/>`;
        }

        const card = eventCardPosition(object);
        return `<rect class="qmx-timeline-select" x="${card.x - 6}" y="${card.y - 6}" width="${object.cardWidth + 12}" height="${object.cardHeight + 12}"/>`;
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;

        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        state.gridLayer.innerHTML = gridMarkup();
        state.axisLayer.innerHTML = axisMarkup();
        state.objectLayer.innerHTML = [
            ...timelineObjects().map((object) =>
                object.type === 'period'
                    ? periodMarkup(object)
                    : eventMarkup(object)
            ),
            ...annotationObjects().map(textMarkup)
        ].join('');
        state.selectionLayer.innerHTML = selectionMarkup();

        if (!options.keepProperties) renderProperties();
        renderSummary();
        updateHistoryButtons();
    }

    function renderSummary() {
        const object = selectedObject();

        if (!object) {
            const events = state.document.objects.filter((item) => item.type === 'event').length;
            const milestones = state.document.objects.filter((item) => item.type === 'milestone').length;
            const periods = state.document.objects.filter((item) => item.type === 'period').length;
            state.controls.summary.textContent =
                `${events} event(s) · ${milestones} milestone(s) · ${periods} period(s)`;
            return;
        }

        if (object.type === 'period') {
            state.controls.summary.textContent =
                `${positionToValue(object.startPosition)} → ${positionToValue(object.endPosition)} · lane ${object.lane}`;
            return;
        }

        if (object.type === 'text') {
            state.controls.summary.textContent =
                `x = ${object.x.toFixed(1)} · y = ${object.y.toFixed(1)}`;
            return;
        }

        state.controls.summary.textContent =
            `${positionToValue(object.position)} · lane ${object.lane}`;
    }

    function valueInputType() {
        return state.document.scaleMode === 'date' ? 'date' : 'number';
    }

    function renderProperties() {
        const object = selectedObject();

        if (!object) {
            state.controls.props.innerHTML =
                `<div class="qmx-timeline-empty">Select an event, milestone, period or annotation.</div>`;
            return;
        }

        if (object.type === 'event' || object.type === 'milestone') {
            state.controls.props.innerHTML = `
<div class="qmx-timeline-fields">
    <label class="qmx-timeline-field">Type
        <select data-object-prop="type">
            <option value="event"${object.type === 'event' ? ' selected' : ''}>Event</option>
            <option value="milestone"${object.type === 'milestone' ? ' selected' : ''}>Milestone</option>
        </select>
    </label>
    <label class="qmx-timeline-field">Title<input type="text" data-object-prop="title" value="${esc(object.title)}"></label>
    <label class="qmx-timeline-field">Description<input type="text" data-object-prop="description" value="${esc(object.description)}"></label>
    <div class="qmx-timeline-row">
        <label class="qmx-timeline-field">Date / value<input type="${valueInputType()}" data-axis-value="position" value="${esc(positionToValue(object.position))}"></label>
        <label class="qmx-timeline-field">Lane<input type="number" min="-3" max="3" data-object-prop="lane" value="${object.lane}"></label>
    </div>
    <label class="qmx-timeline-field">Custom date label<input type="text" data-object-prop="dateLabel" value="${esc(object.dateLabel)}"></label>
    <div class="qmx-timeline-row">
        <label class="qmx-timeline-field">Colour<input type="color" data-object-prop="color" value="${object.color}"></label>
        <label class="qmx-timeline-field">Marker size<input type="number" min="4" max="40" data-object-prop="markerSize" value="${object.markerSize}"></label>
    </div>
    <div class="qmx-timeline-row">
        <label class="qmx-timeline-field">Card width<input type="number" min="100" max="500" data-object-prop="cardWidth" value="${object.cardWidth}"></label>
        <label class="qmx-timeline-field">Card height<input type="number" min="40" max="220" data-object-prop="cardHeight" value="${object.cardHeight}"></label>
    </div>
    <label class="qmx-timeline-check"><input type="checkbox" data-object-prop="showDate"${object.showDate ? ' checked' : ''}> Show date</label>
</div>`;
            return;
        }

        if (object.type === 'period') {
            state.controls.props.innerHTML = `
<div class="qmx-timeline-fields">
    <label class="qmx-timeline-field">Title<input type="text" data-object-prop="title" value="${esc(object.title)}"></label>
    <label class="qmx-timeline-field">Description<input type="text" data-object-prop="description" value="${esc(object.description)}"></label>
    <div class="qmx-timeline-row">
        <label class="qmx-timeline-field">Start<input type="${valueInputType()}" data-axis-value="startPosition" value="${esc(positionToValue(object.startPosition))}"></label>
        <label class="qmx-timeline-field">End<input type="${valueInputType()}" data-axis-value="endPosition" value="${esc(positionToValue(object.endPosition))}"></label>
    </div>
    <label class="qmx-timeline-field">Lane<input type="number" min="-3" max="3" data-object-prop="lane" value="${object.lane}"></label>
    <div class="qmx-timeline-row">
        <label class="qmx-timeline-field">Start label<input type="text" data-object-prop="startLabel" value="${esc(object.startLabel)}"></label>
        <label class="qmx-timeline-field">End label<input type="text" data-object-prop="endLabel" value="${esc(object.endLabel)}"></label>
    </div>
    <div class="qmx-timeline-row">
        <label class="qmx-timeline-field">Colour<input type="color" data-object-prop="color" value="${object.color}"></label>
        <label class="qmx-timeline-field">Thickness<input type="number" min="12" max="100" data-object-prop="thickness" value="${object.thickness}"></label>
    </div>
    <label class="qmx-timeline-field">Fill opacity<input type="number" min="0" max="1" step=".05" data-object-prop="fillOpacity" value="${object.fillOpacity}"></label>
    <label class="qmx-timeline-check"><input type="checkbox" data-object-prop="showDates"${object.showDates ? ' checked' : ''}> Show range dates</label>
</div>`;
            return;
        }

        state.controls.props.innerHTML = `
<div class="qmx-timeline-fields">
    <label class="qmx-timeline-field">Text<textarea data-object-prop="text">${esc(object.text)}</textarea></label>
    <div class="qmx-timeline-row">
        <label class="qmx-timeline-field">X<input type="number" data-object-prop="x" value="${object.x.toFixed(1)}"></label>
        <label class="qmx-timeline-field">Y<input type="number" data-object-prop="y" value="${object.y.toFixed(1)}"></label>
    </div>
    <div class="qmx-timeline-row">
        <label class="qmx-timeline-field">Font size<input type="number" min="8" max="96" data-object-prop="fontSize" value="${object.fontSize}"></label>
        <label class="qmx-timeline-field">Rotation<input type="number" data-object-prop="rotation" value="${object.rotation}"></label>
    </div>
    <label class="qmx-timeline-field">Text colour<input type="color" data-object-prop="textColor" value="${object.textColor}"></label>
    <label class="qmx-timeline-check"><input type="checkbox" data-object-prop="fontWeight"${object.fontWeight === 'bold' ? ' checked' : ''}> Bold</label>
</div>`;
    }

    function onPropertyInput(event) {
        const object = selectedObject();
        if (!object) return;

        const axisControl = event.target.closest('[data-axis-value]');
        if (axisControl) {
            const prop = axisControl.dataset.axisValue;
            const position = valueToPosition(axisControl.value);

            if (position !== null) {
                object[prop] = position;

                if (object.type === 'period' && object.endPosition < object.startPosition) {
                    if (prop === 'startPosition') object.endPosition = object.startPosition;
                    else object.startPosition = object.endPosition;
                }

                render({ keepProperties: true });
            }
            return;
        }

        const control = event.target.closest('[data-object-prop]');
        if (!control) return;

        const prop = control.dataset.objectProp;

        if (['showDate', 'showDates'].includes(prop)) {
            object[prop] = control.checked;
        } else if (prop === 'fontWeight') {
            object.fontWeight = control.checked ? 'bold' : 'normal';
        } else if ([
            'type', 'title', 'description', 'dateLabel', 'color',
            'startLabel', 'endLabel', 'text', 'textColor'
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

    function onPointerDown(event) {
        if (!state.document || event.button !== 0) return;

        const point = pointFromEvent(event);

        if (['event', 'milestone'].includes(state.activeTool)) {
            const object = makeEvent(
                state.activeTool,
                pointToPosition(point),
                pointToLane(point)
            );
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus(`${object.title} added.`);
            return;
        }

        if (state.activeTool === 'period') {
            const object = makePeriod(
                pointToPosition(point),
                pointToLane(point)
            );
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Period added.');
            return;
        }

        if (state.activeTool === 'text') {
            const object = makeText(point);
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
        const group = event.target.closest('[data-object-id]');

        if (handle && selectedObject()?.type === 'period') {
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
        const startPosition = pointToPosition(interaction.start);
        const currentPosition = pointToPosition(point);
        const deltaPosition = currentPosition - startPosition;

        if (interaction.type === 'period-start' && object.type === 'period') {
            object.startPosition = clamp(
                currentPosition,
                0,
                object.endPosition,
                object.startPosition
            );
        } else if (interaction.type === 'period-end' && object.type === 'period') {
            object.endPosition = clamp(
                currentPosition,
                object.startPosition,
                1,
                object.endPosition
            );
        } else if (interaction.type === 'move') {
            if (object.type === 'text') {
                object.x = interaction.original.x + (point.x - interaction.start.x);
                object.y = interaction.original.y + (point.y - interaction.start.y);
            } else if (object.type === 'period') {
                const width = interaction.original.endPosition - interaction.original.startPosition;
                let start = interaction.original.startPosition + deltaPosition;
                start = clamp(start, 0, 1 - width, interaction.original.startPosition);
                object.startPosition = start;
                object.endPosition = start + width;
                object.lane = pointToLane(point);
            } else {
                object.position = clamp(
                    interaction.original.position + deltaPosition,
                    0,
                    1,
                    interaction.original.position
                );
                object.lane = pointToLane(point);
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

        if (copy.type === 'text') {
            copy.x += 25;
            copy.y += 25;
        } else if (copy.type === 'period') {
            const width = copy.endPosition - copy.startPosition;
            copy.startPosition = clamp(copy.startPosition + 0.05, 0, 1 - width, copy.startPosition);
            copy.endPosition = copy.startPosition + width;
            copy.lane = clamp(copy.lane + 1, -3, 3, copy.lane);
            copy.title += ' copy';
        } else {
            copy.position = clamp(copy.position + 0.05, 0, 1, copy.position);
            copy.lane = clamp(copy.lane + 1, -3, 3, copy.lane);
            copy.title += ' copy';
        }

        state.document.objects.push(copy);
        state.selectedId = copy.id;
        pushHistory();
        render();
        setStatus('Item duplicated.');
    }

    function deleteSelected() {
        if (!state.selectedId) return;

        state.document.objects = state.document.objects.filter(
            (object) => object.id !== state.selectedId
        );
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Item deleted.');
    }

    function clearItems() {
        if (!state.document.objects.length) return;
        if (!window.confirm('Remove all timeline items?')) return;

        state.document.objects = [];
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('All timeline items removed.');
    }

    function historicalPreset() {
        state.document.scaleMode = 'year';
        state.document.axisStart = '1900';
        state.document.axisEnd = '2000';
        state.document.orientation = 'horizontal';
        state.document.objects = [];

        const entries = [
            ['Event 1905', 0.05, -1],
            ['Milestone 1947', 0.47, 1],
            ['Event 1971', 0.71, -1],
            ['Milestone 1990', 0.90, 1]
        ];

        entries.forEach(([title, position, lane], index) => {
            const object = makeEvent(index % 2 ? 'milestone' : 'event', position, lane);
            object.title = title;
            state.document.objects.push(object);
        });

        const period = makePeriod(0.3, 2);
        period.startPosition = 0.18;
        period.endPosition = 0.42;
        period.title = 'Historical period';
        state.document.objects.push(period);

        state.selectedId = state.document.objects[0]?.id || null;
        pushHistory();
        syncDocumentControls();
        render();
        setStatus('Historical timeline preset inserted.');
    }

    function projectPreset() {
        state.document.scaleMode = 'number';
        state.document.axisStart = '0';
        state.document.axisEnd = '12';
        state.document.orientation = 'horizontal';
        state.document.objects = [];

        const phases = [
            ['Planning', 0.05, 0.24, -2],
            ['Development', 0.22, 0.68, 2],
            ['Testing', 0.62, 0.84, -2]
        ];

        phases.forEach(([title, start, end, lane]) => {
            const period = makePeriod((start + end) / 2, lane);
            period.title = title;
            period.startPosition = start;
            period.endPosition = end;
            state.document.objects.push(period);
        });

        const launch = makeEvent('milestone', 0.88, 1);
        launch.title = 'Launch';
        state.document.objects.push(launch);

        state.selectedId = state.document.objects[0]?.id || null;
        pushHistory();
        syncDocumentControls();
        render();
        setStatus('Project timeline preset inserted.');
    }

    function newDocument() {
        if (
            state.document.objects.length &&
            !window.confirm('Start a new Timeline diagram?')
        ) return;

        state.document = createDocument();
        state.selectedId = null;
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Timeline diagram.');
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
            textarea.setRangeText(
                token,
                replaceRange.start,
                replaceRange.end,
                'end'
            );
        } else {
            const start = textarea.selectionStart ?? textarea.value.length;
            const end = textarea.selectionEnd ?? start;
            const prefix =
                start > 0 &&
                !/\n$/.test(textarea.value.slice(0, start))
                    ? '\n'
                    : '';
            const suffix =
                end < textarea.value.length &&
                !/^\n/.test(textarea.value.slice(end))
                    ? '\n'
                    : '';

            textarea.setRangeText(
                prefix + token + suffix,
                start,
                end,
                'end'
            );
        }

        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        setStatus('Timeline diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'timeline-diagram')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'timeline-diagram';
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
            new Blob(
                [Diagram.svgMarkup(state.document)],
                { type: 'image/svg+xml;charset=utf-8' }
            ),
            `${safeFilename(state.document.title)}.svg`
        );
        setStatus('SVG exported.');
    }

    function exportPng() {
        const svg = Diagram.svgMarkup(state.document);
        const url = URL.createObjectURL(
            new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
        );
        const image = new Image();

        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = state.document.width;
            canvas.height = state.document.height;
            canvas.getContext('2d').drawImage(image, 0, 0);
            URL.revokeObjectURL(url);

            canvas.toBlob((blob) => {
                if (blob) {
                    downloadBlob(
                        blob,
                        `${safeFilename(state.document.title)}.png`
                    );
                }
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
        if (state.controls.status) {
            state.controls.status.textContent = message;
        }
    }

    function open(context = {}) {
        buildEditor();
        state.context = context;
        state.document = context.initialSpec
            ? Diagram.normalizeSpec(context.initialSpec)
            : createDocument();

        if (state.document.mode !== 'timeline') {
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
        document.body.dataset.qmxTimelineOverflow =
            document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(
            context.initialSpec
                ? 'Existing Timeline diagram loaded.'
                : 'Add timeline items or choose a preset.'
        );

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;

        state.root.hidden = true;
        document.body.style.overflow =
            document.body.dataset.qmxTimelineOverflow || '';
        delete document.body.dataset.qmxTimelineOverflow;
        state.context?.textarea?.focus?.();
    }

    function findTokenTextarea(token) {
        return Array.from(document.querySelectorAll('textarea')).find(
            (textarea) => textarea.value.includes(token)
        ) || null;
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

        if (spec.mode !== 'timeline') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea =
            findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;

        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) {
                replaceRange = {
                    start,
                    end: start + token.length
                };
            }
        }

        open({
            tool: { id: 'timeline' },
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
            'timeline',
            'timeline-diagram',
            'chronology',
            'event-timeline'
        ].forEach((id) => {
            try {
                launcher.registerToolHandler(id, open);
                registered = true;
            } catch (error) {
                // Older registries only expose the canonical timeline id.
            }
        });

        return registered;
    }

    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;

        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(
            document.activeElement?.tagName
        );

        if (event.key === 'Escape') {
            close();
            event.preventDefault();
            return;
        }

        if (
            (event.key === 'Delete' || event.key === 'Backspace') &&
            !editing
        ) {
            event.preventDefault();
            deleteSelected();
        }

        if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'z'
        ) {
            event.preventDefault();
            event.shiftKey ? redo() : undo();
        }

        if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'y'
        ) {
            event.preventDefault();
            redo();
        }

        if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'd' &&
            !editing
        ) {
            event.preventDefault();
            duplicateSelected();
        }
    }

    function init() {
        buildEditor();

        if (!registerHandlers()) {
            document.addEventListener(
                'qmx:diagram-launcher-ready',
                registerHandlers,
                { once: true }
            );
        }
    }

    window.QmxTimelineEditor = Object.freeze({
        version: '1.0.0',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
