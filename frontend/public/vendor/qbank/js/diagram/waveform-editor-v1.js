(function (window, document) {
    'use strict';

    if (window.QmxWaveformEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Waveform] Diagram renderer must load first.');
        return;
    }

    const TOOLS = [
        ['select', 'Select', 'নির্বাচন'],
        ['sine', 'Sine', 'সাইন'],
        ['cosine', 'Cosine', 'কোসাইন'],
        ['square', 'Square', 'স্কয়ার'],
        ['triangle', 'Triangle', 'ত্রিভুজ'],
        ['sawtooth', 'Sawtooth', 'স-টুথ'],
        ['pulse', 'Pulse', 'পালস'],
        ['marker', 'Marker', 'মার্কার'],
        ['text', 'Text', 'লেখা']
    ];

    const SERIES_COLOURS = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2'];

    const state = {
        root: null,
        svg: null,
        gridLayer: null,
        seriesLayer: null,
        annotationLayer: null,
        draftLayer: null,
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

    function uid(prefix = 'waveform') {
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
            version: 6,
            id: uid('waveform'),
            mode: 'waveform',
            title: 'Waveform Diagram',
            width: 1000,
            height: 600,
            background: '#ffffff',
            showGrid: true,
            showAxes: true,
            showLegend: true,
            showValues: true,
            duration: 2,
            yMin: -2,
            yMax: 2,
            xDivisions: 10,
            yDivisions: 8,
            xLabel: 'Time (s)',
            yLabel: 'Amplitude',
            objects: []
        };
    }

    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
    }

    function seriesObjects() {
        return state.document.objects.filter((object) => object.type === 'waveform');
    }

    function plotArea() {
        return {
            left: 76,
            top: 45,
            right: state.document.width - 35,
            bottom: state.document.height - 68
        };
    }

    function plotWidth() {
        const area = plotArea();
        return area.right - area.left;
    }

    function plotHeight() {
        const area = plotArea();
        return area.bottom - area.top;
    }

    function timeToX(time) {
        const area = plotArea();
        return area.left + (time / state.document.duration) * plotWidth();
    }

    function valueToY(value) {
        const area = plotArea();
        const span = state.document.yMax - state.document.yMin;
        return area.bottom - ((value - state.document.yMin) / span) * plotHeight();
    }

    function xToTime(x) {
        const area = plotArea();
        return clamp(
            ((x - area.left) / plotWidth()) * state.document.duration,
            0,
            state.document.duration,
            0
        );
    }

    function yToValue(y) {
        const area = plotArea();
        return clamp(
            state.document.yMin +
                ((area.bottom - y) / plotHeight()) *
                    (state.document.yMax - state.document.yMin),
            state.document.yMin,
            state.document.yMax,
            0
        );
    }

    function pointFromEvent(event) {
        const point = state.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        const local = matrix ? point.matrixTransform(matrix.inverse()) : point;
        return { x: local.x, y: local.y };
    }

    function makeWaveform(waveType) {
        const count = seriesObjects().length + 1;
        const defaults = {
            sine: { label: `Sine ${count}`, amplitude: 1, frequency: 1, phase: 0, dutyCycle: 50, bipolar: true },
            cosine: { label: `Cosine ${count}`, amplitude: 1, frequency: 1, phase: 0, dutyCycle: 50, bipolar: true },
            square: { label: `Square ${count}`, amplitude: 1, frequency: 1, phase: 0, dutyCycle: 50, bipolar: true },
            triangle: { label: `Triangle ${count}`, amplitude: 1, frequency: 1, phase: 0, dutyCycle: 50, bipolar: true },
            sawtooth: { label: `Sawtooth ${count}`, amplitude: 1, frequency: 1, phase: 0, dutyCycle: 50, bipolar: true },
            pulse: { label: `Pulse ${count}`, amplitude: 1, frequency: 2, phase: 0, dutyCycle: 25, bipolar: false }
        }[waveType];

        return {
            id: uid('wave'),
            type: 'waveform',
            waveType,
            label: defaults.label,
            amplitude: defaults.amplitude,
            frequency: defaults.frequency,
            phase: defaults.phase,
            offset: 0,
            dutyCycle: defaults.dutyCycle,
            damping: 0,
            bipolar: defaults.bipolar,
            stroke: SERIES_COLOURS[(count - 1) % SERIES_COLOURS.length],
            strokeWidth: 3,
            dash: false,
            opacity: 1,
            visible: true
        };
    }

    function makeMarker(time, value) {
        return {
            id: uid('marker'),
            type: 'marker',
            time,
            value,
            label: 'Marker',
            stroke: '#be123c',
            showVertical: true,
            showHorizontal: true,
            opacity: 1
        };
    }

    function makeText(time, value) {
        return {
            id: uid('text'),
            type: 'text',
            time,
            value,
            text: 'Label',
            textColor: '#0f172a',
            fontSize: 18,
            fontWeight: 'normal',
            rotation: 0,
            opacity: 1
        };
    }

    function phaseFraction(object) {
        return (object.phase / 360) % 1;
    }

    function waveformValue(object, time) {
        const cycles = object.frequency * time + phaseFraction(object);
        const fraction = ((cycles % 1) + 1) % 1;
        let base = 0;

        switch (object.waveType) {
            case 'cosine':
                base = Math.cos(2 * Math.PI * cycles);
                break;
            case 'square':
                base = fraction < object.dutyCycle / 100 ? 1 : (object.bipolar ? -1 : 0);
                break;
            case 'triangle':
                base = 1 - 4 * Math.abs(fraction - 0.5);
                if (!object.bipolar) base = (base + 1) / 2;
                break;
            case 'sawtooth':
                base = 2 * fraction - 1;
                if (!object.bipolar) base = fraction;
                break;
            case 'pulse':
                base = fraction < object.dutyCycle / 100 ? 1 : (object.bipolar ? -1 : 0);
                break;
            case 'sine':
            default:
                base = Math.sin(2 * Math.PI * cycles);
                break;
        }

        const envelope = object.damping > 0
            ? Math.exp(-object.damping * time)
            : 1;

        return object.offset + object.amplitude * base * envelope;
    }

    function waveformPath(object) {
        const samples = Math.min(
            1400,
            Math.max(320, Math.ceil(state.document.duration * object.frequency * 90))
        );
        const commands = [];
        let previousValue = null;

        for (let index = 0; index <= samples; index += 1) {
            const time = (index / samples) * state.document.duration;
            const value = waveformValue(object, time);
            const x = timeToX(time);
            const y = valueToY(value);

            if (
                previousValue !== null &&
                ['square', 'pulse'].includes(object.waveType) &&
                Math.abs(value - previousValue) > Math.max(0.001, object.amplitude * 0.5)
            ) {
                commands.push(`L ${x.toFixed(2)} ${valueToY(previousValue).toFixed(2)}`);
            }

            commands.push(`${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
            previousValue = value;
        }

        return commands.join(' ');
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
        if (document.getElementById('qmx-waveform-editor-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-waveform-editor-styles';
        style.textContent = `
.qmx-wave-editor[hidden]{display:none!important}
.qmx-wave-editor{position:fixed;inset:0;z-index:10180;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.7);backdrop-filter:blur(2px)}
.qmx-wave-dialog{width:min(1550px,100%);height:min(96vh,980px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.38)}
.qmx-wave-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}
.qmx-wave-title{margin-right:auto}.qmx-wave-title strong{display:block}.qmx-wave-title span{display:block;color:#64748b;font-size:11px}
.qmx-wave-btn,.qmx-wave-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}
.qmx-wave-btn:hover,.qmx-wave-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-wave-btn:disabled{opacity:.45;cursor:not-allowed}
.qmx-wave-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-wave-btn.is-danger{color:#b91c1c}.qmx-wave-close{font-size:20px;line-height:1}
.qmx-wave-workspace{min-height:0;flex:1;display:grid;grid-template-columns:220px minmax(0,1fr) 305px;gap:10px;padding:10px}
.qmx-wave-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}
.qmx-wave-panel h3{margin:0 0 8px;font-size:13px}.qmx-wave-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.qmx-wave-tool{min-height:58px;padding:6px 5px;font-size:10px}.qmx-wave-tool span{display:block;margin-top:2px;color:#64748b;font-size:9px;font-weight:500}
.qmx-wave-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.qmx-wave-quick{display:grid;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0}
.qmx-wave-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-wave-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}
.qmx-wave-stage{display:block;width:min(100%,1180px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none;user-select:none}
.qmx-wave-object{cursor:move}.qmx-wave-series-hit{fill:none;stroke:transparent;stroke-width:20;pointer-events:stroke}
.qmx-wave-hit{fill:transparent;stroke:transparent;stroke-width:18;pointer-events:all}
.qmx-wave-select{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}
.qmx-wave-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair;pointer-events:all}
.qmx-wave-fields{display:grid;gap:9px}.qmx-wave-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}
.qmx-wave-field input,.qmx-wave-field textarea,.qmx-wave-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}
.qmx-wave-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-wave-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}
.qmx-wave-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-wave-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-wave-summary{margin-top:10px;padding:9px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.55}
.qmx-wave-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}
.qmx-wave-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-wave-footer .qmx-wave-btn:first-of-type{margin-left:auto}
@media(max-width:1050px){.qmx-wave-workspace{grid-template-columns:180px minmax(0,1fr) 250px}.qmx-wave-tools{grid-template-columns:1fr}}
@media(max-width:760px){.qmx-wave-editor{padding:0}.qmx-wave-dialog{width:100%;height:100%;border-radius:0}.qmx-wave-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(350px,1fr) auto;overflow:auto}.qmx-wave-panel{overflow:visible}.qmx-wave-tools{grid-template-columns:repeat(3,1fr)}.qmx-wave-header{overflow-x:auto}.qmx-wave-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;

        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-wave-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-wave-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-wave-title">
<header class="qmx-wave-header">
    <div class="qmx-wave-title">
        <strong id="qmx-wave-title">Waveform Diagram</strong>
        <span>Analog and digital signals with amplitude, frequency, phase and annotations</span>
    </div>
    <button type="button" class="qmx-wave-btn" data-wave-new>New</button>
    <button type="button" class="qmx-wave-btn" data-wave-undo>Undo</button>
    <button type="button" class="qmx-wave-btn" data-wave-redo>Redo</button>
    <button type="button" class="qmx-wave-btn" data-wave-duplicate>Duplicate</button>
    <button type="button" class="qmx-wave-btn is-danger" data-wave-delete>Delete</button>
    <button type="button" class="qmx-wave-btn qmx-wave-close" data-wave-close aria-label="Close">×</button>
</header>
<div class="qmx-wave-workspace">
    <aside class="qmx-wave-panel">
        <h3>Waveforms</h3>
        <div class="qmx-wave-tools" data-wave-tools></div>
        <div class="qmx-wave-quick">
            <button type="button" class="qmx-wave-btn" data-wave-sine-preset>Analog signals</button>
            <button type="button" class="qmx-wave-btn" data-wave-digital-preset>Digital signals</button>
            <button type="button" class="qmx-wave-btn" data-wave-clear-series>Remove all signals</button>
        </div>
        <p class="qmx-wave-help">
            Click a waveform type to add a signal. Drag a selected signal horizontally to change phase and vertically to change offset.
            Marker and Text tools are placed directly on the plot.
        </p>
    </aside>
    <main class="qmx-wave-stage-wrap">
        <svg class="qmx-wave-stage" data-wave-svg viewBox="0 0 1000 600" tabindex="0" aria-label="Waveform diagram canvas">
            <defs>
                <clipPath id="qmx-wave-clip"><rect data-wave-clip-rect></rect></clipPath>
            </defs>
            <rect data-wave-bg width="100%" height="100%" fill="#ffffff"></rect>
            <g data-wave-grid-layer></g>
            <g data-wave-series-layer clip-path="url(#qmx-wave-clip)"></g>
            <g data-wave-annotation-layer></g>
            <g data-wave-draft-layer></g>
            <g data-wave-selection-layer></g>
        </svg>
    </main>
    <aside class="qmx-wave-panel">
        <h3>Document</h3>
        <div class="qmx-wave-fields">
            <label class="qmx-wave-field">Title<input type="text" data-doc-prop="title"></label>
            <div class="qmx-wave-row">
                <label class="qmx-wave-field">Width<input type="number" min="320" max="2400" data-doc-prop="width"></label>
                <label class="qmx-wave-field">Height<input type="number" min="220" max="1800" data-doc-prop="height"></label>
            </div>
            <div class="qmx-wave-row">
                <label class="qmx-wave-field">Duration (s)<input type="number" min=".01" max="1000" step=".1" data-doc-prop="duration"></label>
                <label class="qmx-wave-field">X divisions<input type="number" min="2" max="40" data-doc-prop="xDivisions"></label>
            </div>
            <div class="qmx-wave-row">
                <label class="qmx-wave-field">Y minimum<input type="number" step=".1" data-doc-prop="yMin"></label>
                <label class="qmx-wave-field">Y maximum<input type="number" step=".1" data-doc-prop="yMax"></label>
            </div>
            <label class="qmx-wave-field">Y divisions<input type="number" min="2" max="40" data-doc-prop="yDivisions"></label>
            <div class="qmx-wave-row">
                <label class="qmx-wave-field">X label<input type="text" data-doc-prop="xLabel"></label>
                <label class="qmx-wave-field">Y label<input type="text" data-doc-prop="yLabel"></label>
            </div>
            <label class="qmx-wave-field">Background<input type="color" data-doc-prop="background"></label>
            <label class="qmx-wave-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label>
            <label class="qmx-wave-check"><input type="checkbox" data-doc-prop="showAxes"> Show axes</label>
            <label class="qmx-wave-check"><input type="checkbox" data-doc-prop="showLegend"> Show legend</label>
            <label class="qmx-wave-check"><input type="checkbox" data-doc-prop="showValues"> Show scale values</label>
        </div>
        <hr class="qmx-wave-divider">
        <h3>Selected object</h3>
        <div data-wave-properties></div>
        <div class="qmx-wave-summary" data-wave-summary></div>
    </aside>
</div>
<footer class="qmx-wave-footer">
    <span class="qmx-wave-status" data-wave-status aria-live="polite"></span>
    <button type="button" class="qmx-wave-btn" data-wave-export-svg>Export SVG</button>
    <button type="button" class="qmx-wave-btn" data-wave-export-png>Export PNG</button>
    <button type="button" class="qmx-wave-btn is-primary" data-wave-insert>Insert into question</button>
</footer>
</section>`;

        document.body.appendChild(root);

        state.root = root;
        state.svg = root.querySelector('[data-wave-svg]');
        state.gridLayer = root.querySelector('[data-wave-grid-layer]');
        state.seriesLayer = root.querySelector('[data-wave-series-layer]');
        state.annotationLayer = root.querySelector('[data-wave-annotation-layer]');
        state.draftLayer = root.querySelector('[data-wave-draft-layer]');
        state.selectionLayer = root.querySelector('[data-wave-selection-layer]');
        state.controls = {
            bg: root.querySelector('[data-wave-bg]'),
            clip: root.querySelector('[data-wave-clip-rect]'),
            tools: root.querySelector('[data-wave-tools]'),
            props: root.querySelector('[data-wave-properties]'),
            summary: root.querySelector('[data-wave-summary]'),
            status: root.querySelector('[data-wave-status]'),
            undo: root.querySelector('[data-wave-undo]'),
            redo: root.querySelector('[data-wave-redo]')
        };

        TOOLS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-wave-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`;
            state.controls.tools.appendChild(button);
        });

        state.controls.tools.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (!button) return;
            const tool = button.dataset.tool;

            if (['sine', 'cosine', 'square', 'triangle', 'sawtooth', 'pulse'].includes(tool)) {
                addWaveform(tool);
            } else {
                setTool(tool);
            }
        });

        root.querySelector('[data-wave-close]').addEventListener('click', close);
        root.querySelector('[data-wave-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo);
        state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-wave-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-wave-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-wave-sine-preset]').addEventListener('click', analogPreset);
        root.querySelector('[data-wave-digital-preset]').addEventListener('click', digitalPreset);
        root.querySelector('[data-wave-clear-series]').addEventListener('click', clearSeries);
        root.querySelector('[data-wave-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-wave-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-wave-insert]').addEventListener('click', insertIntoQuestion);

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
        render();
        setStatus(state.activeTool === 'marker'
            ? 'Click inside the plot to add a marker.'
            : (state.activeTool === 'text'
                ? 'Click inside the plot to add a text label.'
                : 'Select and drag signals, markers or text.'));
    }

    function addWaveform(waveType) {
        const object = makeWaveform(waveType);
        state.document.objects.push(object);
        state.selectedId = object.id;
        pushHistory();
        setTool('select');
        render();
        setStatus(`${object.label} added.`);
    }

    function onDocumentInput(event) {
        const control = event.currentTarget;
        const prop = control.dataset.docProp;
        if (!prop || !state.document) return;

        if (['showGrid', 'showAxes', 'showLegend', 'showValues'].includes(prop)) {
            state.document[prop] = control.checked;
        } else if ([
            'width', 'height', 'duration', 'yMin', 'yMax', 'xDivisions', 'yDivisions'
        ].includes(prop)) {
            state.document[prop] = Number(control.value);
        } else {
            state.document[prop] = control.value;
        }

        if (state.document.yMax <= state.document.yMin) {
            state.document.yMax = state.document.yMin + 1;
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
        const area = plotArea();
        const parts = [
            `<rect x="${area.left}" y="${area.top}" width="${plotWidth()}" height="${plotHeight()}" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>`
        ];

        for (let index = 0; index <= state.document.xDivisions; index += 1) {
            const time = (index / state.document.xDivisions) * state.document.duration;
            const x = timeToX(time);

            if (state.document.showGrid) {
                parts.push(`<line x1="${x}" y1="${area.top}" x2="${x}" y2="${area.bottom}" stroke="#dbe4ef" stroke-width="1"/>`);
            }

            if (state.document.showValues) {
                parts.push(`<text x="${x}" y="${area.bottom + 22}" fill="#475569" font-size="12" text-anchor="middle">${Number(time.toFixed(4))}</text>`);
            }
        }

        for (let index = 0; index <= state.document.yDivisions; index += 1) {
            const value = state.document.yMin +
                (index / state.document.yDivisions) *
                    (state.document.yMax - state.document.yMin);
            const y = valueToY(value);

            if (state.document.showGrid) {
                parts.push(`<line x1="${area.left}" y1="${y}" x2="${area.right}" y2="${y}" stroke="#dbe4ef" stroke-width="1"/>`);
            }

            if (state.document.showValues) {
                parts.push(`<text x="${area.left - 10}" y="${y}" fill="#475569" font-size="12" text-anchor="end" dominant-baseline="middle">${Number(value.toFixed(4))}</text>`);
            }
        }

        if (state.document.showAxes) {
            const zeroY = state.document.yMin <= 0 && state.document.yMax >= 0
                ? valueToY(0)
                : area.bottom;
            parts.push(`<line x1="${area.left}" y1="${zeroY}" x2="${area.right}" y2="${zeroY}" stroke="#334155" stroke-width="1.8"/>`);
            parts.push(`<line x1="${area.left}" y1="${area.top}" x2="${area.left}" y2="${area.bottom}" stroke="#334155" stroke-width="1.8"/>`);
        }

        parts.push(`<text x="${(area.left + area.right) / 2}" y="${state.document.height - 20}" fill="#0f172a" font-size="15" font-weight="600" text-anchor="middle">${esc(state.document.xLabel)}</text>`);
        parts.push(`<text x="23" y="${(area.top + area.bottom) / 2}" fill="#0f172a" font-size="15" font-weight="600" text-anchor="middle" transform="rotate(-90 23 ${(area.top + area.bottom) / 2})">${esc(state.document.yLabel)}</text>`);

        if (state.document.showLegend) {
            let y = area.top + 18;
            seriesObjects().filter((object) => object.visible).forEach((object) => {
                parts.push(`<line x1="${area.right - 145}" y1="${y}" x2="${area.right - 110}" y2="${y}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${object.dash ? ' stroke-dasharray="8 5"' : ''}/>`);
                parts.push(`<text x="${area.right - 102}" y="${y}" fill="#334155" font-size="12" dominant-baseline="middle">${esc(object.label)}</text>`);
                y += 20;
            });
        }

        return parts.join('');
    }

    function seriesMarkup(object) {
        if (!object.visible) return '';
        const dash = object.dash ? ' stroke-dasharray="8 5"' : '';
        const path = waveformPath(object);
        return `
<g class="qmx-wave-object" data-object-id="${esc(object.id)}">
    <path d="${path}" fill="none" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <path class="qmx-wave-series-hit" d="${path}"/>
</g>`;
    }

    function annotationMarkup(object) {
        const area = plotArea();

        if (object.type === 'marker') {
            const x = timeToX(object.time);
            const y = valueToY(object.value);
            const vertical = object.showVertical
                ? `<line x1="${x}" y1="${area.top}" x2="${x}" y2="${area.bottom}" stroke="${esc(object.stroke)}" stroke-width="1.6" stroke-dasharray="6 5" opacity=".75"/>`
                : '';
            const horizontal = object.showHorizontal
                ? `<line x1="${area.left}" y1="${y}" x2="${area.right}" y2="${y}" stroke="${esc(object.stroke)}" stroke-width="1.6" stroke-dasharray="6 5" opacity=".75"/>`
                : '';
            return `
<g class="qmx-wave-object" data-object-id="${esc(object.id)}">
    ${vertical}${horizontal}
    <circle cx="${x}" cy="${y}" r="6" fill="${esc(object.stroke)}" opacity="${object.opacity}"/>
    <text x="${x + 10}" y="${y - 10}" fill="${esc(object.stroke)}" font-size="13" font-weight="700">${esc(object.label)}</text>
    <circle class="qmx-wave-hit" cx="${x}" cy="${y}" r="18"/>
</g>`;
        }

        const x = timeToX(object.time);
        const y = valueToY(object.value);
        return `
<g class="qmx-wave-object" data-object-id="${esc(object.id)}">
    <text x="${x}" y="${y}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${x} ${y})">${esc(object.text)}</text>
    <rect class="qmx-wave-hit" x="${x - 65}" y="${y - 28}" width="130" height="56"/>
</g>`;
    }

    function selectionMarkup() {
        const object = selectedObject();
        if (!object) return '';

        const area = plotArea();

        if (object.type === 'waveform') {
            return `<rect class="qmx-wave-select" x="${area.left - 5}" y="${area.top - 5}" width="${plotWidth() + 10}" height="${plotHeight() + 10}"/>`;
        }

        const x = timeToX(object.time);
        const y = valueToY(object.value);
        return `<rect class="qmx-wave-select" x="${x - 18}" y="${y - 18}" width="36" height="36"/><circle class="qmx-wave-handle" cx="${x}" cy="${y}" r="7"/>`;
    }

    function render(options = {}) {
        if (!state.document || !state.svg) return;

        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);

        const area = plotArea();
        state.controls.clip.setAttribute('x', area.left);
        state.controls.clip.setAttribute('y', area.top);
        state.controls.clip.setAttribute('width', plotWidth());
        state.controls.clip.setAttribute('height', plotHeight());

        state.gridLayer.innerHTML = gridMarkup();
        state.seriesLayer.innerHTML = seriesObjects().map(seriesMarkup).join('');
        state.annotationLayer.innerHTML = state.document.objects
            .filter((object) => object.type !== 'waveform')
            .map(annotationMarkup)
            .join('');
        state.selectionLayer.innerHTML = selectionMarkup();

        if (!options.keepProperties) renderProperties();
        renderSummary();
        updateHistoryButtons();
    }

    function renderSummary() {
        const object = selectedObject();

        if (!object) {
            state.controls.summary.textContent =
                `${seriesObjects().length} signal(s) · ${state.document.duration} s window · ${state.document.yMin} to ${state.document.yMax}`;
            return;
        }

        if (object.type !== 'waveform') {
            state.controls.summary.textContent =
                `t = ${object.time.toFixed(4)} s · value = ${object.value.toFixed(4)}`;
            return;
        }

        const period = 1 / object.frequency;
        const peakToPeak = object.bipolar ? 2 * object.amplitude : object.amplitude;
        let rms = object.amplitude / Math.sqrt(2);

        if (['square', 'pulse'].includes(object.waveType)) {
            const duty = object.dutyCycle / 100;
            rms = object.bipolar
                ? object.amplitude
                : object.amplitude * Math.sqrt(duty);
        } else if (object.waveType === 'triangle') {
            rms = object.amplitude / Math.sqrt(3);
        }

        state.controls.summary.textContent =
            `Period = ${period.toFixed(4)} s · Peak-to-peak = ${peakToPeak.toFixed(4)} · RMS ≈ ${rms.toFixed(4)}`;
    }

    function renderProperties() {
        const object = selectedObject();

        if (!object) {
            state.controls.props.innerHTML = `<div class="qmx-wave-empty">Select a signal, marker or text label.</div>`;
            return;
        }

        if (object.type === 'waveform') {
            state.controls.props.innerHTML = `
<div class="qmx-wave-fields">
    <label class="qmx-wave-field">Waveform
        <select data-object-prop="waveType">
            ${['sine','cosine','square','triangle','sawtooth','pulse'].map((type) => `<option value="${type}"${object.waveType === type ? ' selected' : ''}>${type}</option>`).join('')}
        </select>
    </label>
    <label class="qmx-wave-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-wave-row">
        <label class="qmx-wave-field">Amplitude<input type="number" min="0" step=".05" data-object-prop="amplitude" value="${object.amplitude}"></label>
        <label class="qmx-wave-field">Frequency (Hz)<input type="number" min=".001" step=".05" data-object-prop="frequency" value="${object.frequency}"></label>
    </div>
    <div class="qmx-wave-row">
        <label class="qmx-wave-field">Phase (°)<input type="number" step="1" data-object-prop="phase" value="${object.phase}"></label>
        <label class="qmx-wave-field">Offset<input type="number" step=".05" data-object-prop="offset" value="${object.offset}"></label>
    </div>
    <div class="qmx-wave-row">
        <label class="qmx-wave-field">Duty cycle (%)<input type="number" min="1" max="99" step="1" data-object-prop="dutyCycle" value="${object.dutyCycle}"></label>
        <label class="qmx-wave-field">Damping<input type="number" min="0" max="20" step=".05" data-object-prop="damping" value="${object.damping}"></label>
    </div>
    <div class="qmx-wave-row">
        <label class="qmx-wave-field">Colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
        <label class="qmx-wave-field">Width<input type="number" min=".5" max="20" step=".5" data-object-prop="strokeWidth" value="${object.strokeWidth}"></label>
    </div>
    <label class="qmx-wave-check"><input type="checkbox" data-object-prop="bipolar"${object.bipolar ? ' checked' : ''}> Bipolar signal</label>
    <label class="qmx-wave-check"><input type="checkbox" data-object-prop="dash"${object.dash ? ' checked' : ''}> Dashed line</label>
    <label class="qmx-wave-check"><input type="checkbox" data-object-prop="visible"${object.visible ? ' checked' : ''}> Visible</label>
</div>`;
            return;
        }

        if (object.type === 'marker') {
            state.controls.props.innerHTML = `
<div class="qmx-wave-fields">
    <label class="qmx-wave-field">Label<input type="text" data-object-prop="label" value="${esc(object.label)}"></label>
    <div class="qmx-wave-row">
        <label class="qmx-wave-field">Time<input type="number" min="0" max="${state.document.duration}" step=".01" data-object-prop="time" value="${object.time}"></label>
        <label class="qmx-wave-field">Value<input type="number" step=".05" data-object-prop="value" value="${object.value}"></label>
    </div>
    <label class="qmx-wave-field">Colour<input type="color" data-object-prop="stroke" value="${object.stroke}"></label>
    <label class="qmx-wave-check"><input type="checkbox" data-object-prop="showVertical"${object.showVertical ? ' checked' : ''}> Vertical guide</label>
    <label class="qmx-wave-check"><input type="checkbox" data-object-prop="showHorizontal"${object.showHorizontal ? ' checked' : ''}> Horizontal guide</label>
</div>`;
            return;
        }

        state.controls.props.innerHTML = `
<div class="qmx-wave-fields">
    <label class="qmx-wave-field">Text<textarea data-object-prop="text">${esc(object.text)}</textarea></label>
    <div class="qmx-wave-row">
        <label class="qmx-wave-field">Time<input type="number" min="0" max="${state.document.duration}" step=".01" data-object-prop="time" value="${object.time}"></label>
        <label class="qmx-wave-field">Value<input type="number" step=".05" data-object-prop="value" value="${object.value}"></label>
    </div>
    <div class="qmx-wave-row">
        <label class="qmx-wave-field">Font size<input type="number" min="8" max="96" data-object-prop="fontSize" value="${object.fontSize}"></label>
        <label class="qmx-wave-field">Rotation<input type="number" data-object-prop="rotation" value="${object.rotation}"></label>
    </div>
    <label class="qmx-wave-field">Text colour<input type="color" data-object-prop="textColor" value="${object.textColor}"></label>
    <label class="qmx-wave-check"><input type="checkbox" data-object-prop="fontWeight"${object.fontWeight === 'bold' ? ' checked' : ''}> Bold</label>
</div>`;
    }

    function onPropertyInput(event) {
        const control = event.target.closest('[data-object-prop]');
        const object = selectedObject();
        if (!control || !object) return;

        const prop = control.dataset.objectProp;

        if ([
            'bipolar', 'dash', 'visible', 'showVertical', 'showHorizontal'
        ].includes(prop)) {
            object[prop] = control.checked;
        } else if (prop === 'fontWeight') {
            object.fontWeight = control.checked ? 'bold' : 'normal';
        } else if ([
            'waveType', 'label', 'stroke', 'text', 'textColor'
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
        const area = plotArea();
        const inside = point.x >= area.left && point.x <= area.right &&
            point.y >= area.top && point.y <= area.bottom;

        if (state.activeTool === 'marker' && inside) {
            const object = makeMarker(xToTime(point.x), yToValue(point.y));
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Marker added.');
            return;
        }

        if (state.activeTool === 'text' && inside) {
            const object = makeText(xToTime(point.x), yToValue(point.y));
            state.document.objects.push(object);
            state.selectedId = object.id;
            pushHistory();
            setTool('select');
            render();
            setStatus('Text label added.');
            return;
        }

        if (state.activeTool !== 'select') return;

        const group = event.target.closest('[data-object-id]');
        if (!group) {
            selectObject(null);
            return;
        }

        const id = group.dataset.objectId;
        const object = state.document.objects.find((item) => item.id === id);
        if (!object) return;

        if (id !== state.selectedId) selectObject(id);

        state.interaction = {
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

        if (object.type === 'waveform') {
            const phaseShift = -(dx / plotWidth()) *
                state.document.duration *
                object.frequency *
                360;
            const valueShift = -(dy / plotHeight()) *
                (state.document.yMax - state.document.yMin);
            object.phase = interaction.original.phase + phaseShift;
            object.offset = interaction.original.offset + valueShift;
        } else {
            object.time = clamp(
                interaction.original.time +
                    (dx / plotWidth()) * state.document.duration,
                0,
                state.document.duration,
                interaction.original.time
            );
            object.value = clamp(
                interaction.original.value -
                    (dy / plotHeight()) *
                        (state.document.yMax - state.document.yMin),
                state.document.yMin,
                state.document.yMax,
                interaction.original.value
            );
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

        if (copy.type === 'waveform') {
            copy.label = `${copy.label} copy`;
            copy.phase += 30;
            copy.offset += 0.2;
            copy.stroke = SERIES_COLOURS[seriesObjects().length % SERIES_COLOURS.length];
        } else {
            copy.time = clamp(copy.time + state.document.duration * 0.03, 0, state.document.duration, copy.time);
            copy.value = clamp(copy.value + (state.document.yMax - state.document.yMin) * 0.04, state.document.yMin, state.document.yMax, copy.value);
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

    function clearSeries() {
        if (!seriesObjects().length) return;
        if (!window.confirm('Remove all waveform signals?')) return;

        state.document.objects = state.document.objects.filter((object) => object.type !== 'waveform');
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('All signals removed.');
    }

    function analogPreset() {
        state.document.objects = state.document.objects.filter((object) => object.type !== 'waveform');

        const sine = makeWaveform('sine');
        sine.label = 'Input';
        sine.frequency = 1;
        sine.amplitude = 1;

        const cosine = makeWaveform('cosine');
        cosine.label = 'Phase shifted';
        cosine.frequency = 1;
        cosine.amplitude = 0.7;
        cosine.phase = 45;
        cosine.offset = 0.2;

        state.document.objects.unshift(sine, cosine);
        state.selectedId = sine.id;
        pushHistory();
        render();
        setStatus('Analog waveform preset inserted.');
    }

    function digitalPreset() {
        state.document.objects = state.document.objects.filter((object) => object.type !== 'waveform');

        const square = makeWaveform('square');
        square.label = 'Clock';
        square.frequency = 4;
        square.offset = 0.7;
        square.amplitude = 0.5;
        square.bipolar = false;

        const pulse = makeWaveform('pulse');
        pulse.label = 'Pulse';
        pulse.frequency = 2;
        pulse.dutyCycle = 20;
        pulse.offset = -0.8;
        pulse.amplitude = 0.8;
        pulse.bipolar = false;

        state.document.objects.unshift(square, pulse);
        state.selectedId = square.id;
        pushHistory();
        render();
        setStatus('Digital waveform preset inserted.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Waveform diagram?')) return;

        state.document = createDocument();
        state.selectedId = null;
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Waveform diagram.');
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
        setStatus('Waveform diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'waveform-diagram')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .trim() || 'waveform-diagram';
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

        if (state.document.mode !== 'waveform') {
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
        document.body.dataset.qmxWaveOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';

        setStatus(context.initialSpec
            ? 'Existing Waveform diagram loaded.'
            : 'Add a waveform or choose a preset.');

        window.setTimeout(() => state.svg.focus(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;
        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxWaveOverflow || '';
        delete document.body.dataset.qmxWaveOverflow;
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

        if (spec.mode !== 'waveform') return false;

        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) ||
            window.QmxDiagramLauncher?.getActiveTextarea?.();

        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }

        open({
            tool: { id: 'waveform' },
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

        ['waveform', 'waveform-diagram', 'signal-waveform', 'wave'].forEach((id) => {
            try {
                launcher.registerToolHandler(id, open);
                if (id === 'waveform') registered = true;
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

    window.QmxWaveformEditor = Object.freeze({
        version: '1.0.1',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
