(function (window, document) {
    'use strict';

    if (window.QmxDigitalLogicEditor?.version) return;
    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Digital Logic] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['and', 'AND gate', 'AND গেট'],
        ['or', 'OR gate', 'OR গেট'],
        ['not', 'NOT gate', 'NOT গেট'],
        ['nand', 'NAND gate', 'NAND গেট'],
        ['nor', 'NOR gate', 'NOR গেট'],
        ['xor', 'XOR gate', 'XOR গেট'],
        ['xnor', 'XNOR gate', 'XNOR গেট'],
        ['logic-input', 'Input', 'ইনপুট'],
        ['logic-output', 'Output', 'আউটপুট'],
        ['logic-wire', 'Smart wire', 'স্মার্ট সংযোগ'],
        ['logic-block', 'Logic block', 'লজিক ব্লক'],
        ['logic-truth-table', 'Truth table', 'ট্রুথ টেবিল'],
        ['text', 'Annotation', 'টীকা']
    ];

    const state = {
        root: null,
        canvas: null,
        svg: null,
        context: null,
        document: null,
        selectedId: null,
        activeTool: 'select',
        interaction: null,
        connectionStart: null,
        history: [],
        historyIndex: -1,
        controls: {}
    };

    function uid(prefix = 'logic') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]); }
    function clamp(value, min, max, fallback = min) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
    function snap(value) { const step = Number(state.document?.gridSize || 20); return state.document?.snap ? Math.round(value / step) * step : value; }
    function selectedObject() { return state.document?.objects.find((object) => object.id === state.selectedId) || null; }

    function logicPorts(object) {
        if (!object) return [];
        if (object.type === 'logic-input') return [{ objectId: object.id, key: 'out', role: 'output', side: 'right', x: Number(object.x) + 38, y: Number(object.y), label: object.label || 'Input' }];
        if (object.type === 'logic-output') return [{ objectId: object.id, key: 'in', role: 'input', side: 'left', x: Number(object.x) - 38, y: Number(object.y), label: object.label || 'Output' }];
        if (object.type === 'logic-gate') {
            const labels = object.inputLabels?.length ? object.inputLabels : (object.gateType === 'not' || object.gateType === 'buffer' ? ['A'] : ['A', 'B']);
            const ports = labels.map((label, index) => ({
                objectId: object.id, key: `in:${index}`, role: 'input', side: 'left',
                x: Number(object.x), y: Number(object.y) + Number(object.height) * (index + 1) / (labels.length + 1),
                label: `${object.label || object.gateType} ${label || `IN${index + 1}`}`
            }));
            ports.push({ objectId: object.id, key: 'out', role: 'output', side: 'right', x: Number(object.x) + Number(object.width), y: Number(object.y) + Number(object.height) / 2, label: `${object.label || object.gateType} ${object.outputLabel || 'Y'}` });
            return ports;
        }
        if (object.type === 'logic-block') {
            const left = object.pinsLeft?.length ? object.pinsLeft : ['A'];
            const right = object.pinsRight?.length ? object.pinsRight : ['Y'];
            return [
                ...left.map((label, index) => ({ objectId: object.id, key: `left:${index}`, role: 'input', side: 'left', x: Number(object.x) - 24, y: Number(object.y) + Number(object.height) * (index + 1) / (left.length + 1), label: `${object.label} ${label}` })),
                ...right.map((label, index) => ({ objectId: object.id, key: `right:${index}`, role: 'output', side: 'right', x: Number(object.x) + Number(object.width) + 24, y: Number(object.y) + Number(object.height) * (index + 1) / (right.length + 1), label: `${object.label} ${label}` }))
            ];
        }
        return [];
    }

    function resolvePort(ref) {
        if (!ref?.objectId || !ref?.portKey || !state.document) return null;
        const object = state.document.objects.find((item) => item.id === ref.objectId);
        return logicPorts(object).find((port) => port.key === ref.portKey) || null;
    }

    function portRef(port) { return port ? { objectId: port.objectId, portKey: port.key } : null; }
    function portDescription(ref) { const port = resolvePort(ref); return port ? port.label : 'Not connected'; }

    function compactRoute(points) {
        const clean = [];
        points.forEach((point) => {
            const next = { x: Number(point.x), y: Number(point.y) };
            const previous = clean[clean.length - 1];
            if (!previous || Math.abs(previous.x - next.x) > .01 || Math.abs(previous.y - next.y) > .01) clean.push(next);
        });
        for (let index = clean.length - 2; index > 0; index--) {
            const a = clean[index - 1], b = clean[index], c = clean[index + 1];
            if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) clean.splice(index, 1);
        }
        return clean.length >= 2 ? clean : points.slice(0, 2);
    }

    function smartRoute(start, end) {
        const stub = Math.max(20, Number(state.document?.gridSize || 20));
        const startDirection = start.side === 'left' ? -1 : 1;
        const endDirection = end.side === 'left' ? -1 : 1;
        const s1 = { x: start.x + startDirection * stub, y: start.y };
        const e1 = { x: end.x + endDirection * stub, y: end.y };
        const points = [{ x: start.x, y: start.y }, s1];
        if (Math.abs(start.y - end.y) < .01 && ((startDirection > 0 && end.x >= start.x) || (startDirection < 0 && end.x <= start.x))) {
            points.push({ x: end.x, y: end.y });
            return compactRoute(points);
        }
        if (startDirection > 0 && endDirection < 0 && s1.x <= e1.x) {
            const middleX = snap((s1.x + e1.x) / 2);
            points.push({ x: middleX, y: s1.y }, { x: middleX, y: e1.y }, e1);
        } else if (startDirection < 0 && endDirection > 0 && s1.x >= e1.x) {
            const middleX = snap((s1.x + e1.x) / 2);
            points.push({ x: middleX, y: s1.y }, { x: middleX, y: e1.y }, e1);
        } else {
            const detourX = startDirection > 0
                ? snap(Math.max(s1.x, e1.x, start.x, end.x) + stub * 2)
                : snap(Math.min(s1.x, e1.x, start.x, end.x) - stub * 2);
            points.push({ x: detourX, y: s1.y }, { x: detourX, y: e1.y }, e1);
        }
        points.push({ x: end.x, y: end.y });
        return compactRoute(points);
    }

    function refreshConnectedWire(wire) {
        if (!wire || wire.type !== 'logic-wire' || !wire.autoRoute) return;
        const source = resolvePort(wire.sourcePort);
        const target = resolvePort(wire.targetPort);
        if (source && target) wire.points = smartRoute(source, target);
    }

    function refreshConnectedWires(objectId = null) {
        state.document?.objects.forEach((object) => {
            if (object.type !== 'logic-wire' || !object.autoRoute) return;
            if (objectId && object.sourcePort?.objectId !== objectId && object.targetPort?.objectId !== objectId) return;
            refreshConnectedWire(object);
        });
    }

    function createDocument() {
        return {
            version: 22,
            id: uid('digital-logic'),
            mode: 'digital-logic',
            title: 'Logic Gate / Digital Electronics Diagram',
            width: 1100,
            height: 650,
            background: '#ffffff',
            gridSize: 20,
            logicShowGrid: true,
            logicShowPinLabels: true,
            logicShowValues: true,
            snap: true,
            objects: []
        };
    }

    function gateObject(gateType = 'and') {
        const labels = {
            and: 'AND', or: 'OR', not: 'NOT', nand: 'NAND', nor: 'NOR', xor: 'XOR', xnor: 'XNOR', buffer: 'BUF'
        };
        return {
            id: uid('logic-gate'),
            type: 'logic-gate',
            gateType,
            x: 360,
            y: 240,
            width: gateType === 'not' || gateType === 'buffer' ? 92 : 120,
            height: 80,
            label: labels[gateType] || gateType.toUpperCase(),
            inputLabels: gateType === 'not' || gateType === 'buffer' ? ['A'] : ['A', 'B'],
            outputLabel: 'Y',
            fill: '#ffffff',
            stroke: '#0f172a',
            lineWidth: 3,
            showLabel: true
        };
    }

    function defaultObject(type) {
        if (['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor', 'buffer'].includes(type)) return gateObject(type);
        if (type === 'logic-input') return {
            id: uid(type), type, x: 110, y: 250, label: 'A', value: '0', color: '#2563eb', radius: 8, showValue: true
        };
        if (type === 'logic-output') return {
            id: uid(type), type, x: 930, y: 250, label: 'Y', value: '0', color: '#dc2626', radius: 8, showValue: true
        };
        if (type === 'logic-wire') return {
            id: uid(type), type, points: [{ x: 180, y: 250 }, { x: 280, y: 250 }, { x: 280, y: 300 }, { x: 360, y: 300 }],
            label: '', stroke: '#0f172a', lineWidth: 3, dashed: false, junctions: true, autoRoute: false, sourcePort: null, targetPort: null
        };
        if (type === 'logic-block') return {
            id: uid(type), type, x: 410, y: 210, width: 220, height: 170,
            label: 'D Flip-Flop', subLabel: 'Sequential logic',
            pinsLeft: ['D', 'CLK'], pinsRight: ['Q', 'Q̅'],
            fill: '#f8fafc', stroke: '#0f172a', lineWidth: 3, clockPin: true
        };
        if (type === 'logic-truth-table') return {
            id: uid(type), type, x: 650, y: 100, width: 350, rowHeight: 34,
            title: 'Truth Table', headers: ['A', 'B', 'Y'],
            rows: [['0', '0', '0'], ['0', '1', '0'], ['1', '0', '0'], ['1', '1', '1']],
            headerFill: '#dbeafe', stroke: '#334155', textColor: '#0f172a'
        };
        return {
            id: uid('text'), type: 'text', x: 80, y: 70, text: 'Digital logic diagram', color: '#0f172a', fontSize: 20, fontWeight: 'bold'
        };
    }

    function pushHistory() {
        if (!state.document) return;
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

    function undo() { restoreHistory(state.historyIndex - 1); }
    function redo() { restoreHistory(state.historyIndex + 1); }
    function updateHistoryButtons() {
        if (!state.controls.undo) return;
        state.controls.undo.disabled = state.historyIndex <= 0;
        state.controls.redo.disabled = state.historyIndex >= state.history.length - 1;
    }

    function setTool(tool) {
        state.activeTool = tool;
        state.connectionStart = null;
        state.controls.tools?.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
        if (tool === 'logic-wire') {
            setStatus('Smart wire: click an output/input connection point, then click the opposite point.');
            render();
            return;
        }
        if (tool !== 'select') {
            addObject(tool);
            state.activeTool = 'select';
            state.controls.tools?.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === 'select'));
        } else {
            render();
        }
    }

    function addObject(type) {
        const object = defaultObject(type);
        const count = state.document.objects.length;
        if ('x' in object) object.x = snap(Number(object.x) + (count % 4) * 20);
        if ('y' in object) object.y = snap(Number(object.y) + (count % 3) * 20);
        if (object.type === 'logic-wire') object.points = object.points.map((point) => ({ x: snap(point.x + (count % 3) * 20), y: snap(point.y + (count % 2) * 20) }));
        state.document.objects.push(object);
        state.selectedId = object.id;
        pushHistory();
        render();
        setStatus(`${object.label || object.title || object.type} added.`);
    }

    function objectBounds(object) {
        if (!object) return null;
        if (object.type === 'logic-wire') {
            const xs = object.points.map((point) => point.x);
            const ys = object.points.map((point) => point.y);
            return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(20, Math.max(...xs) - Math.min(...xs)), height: Math.max(20, Math.max(...ys) - Math.min(...ys)) };
        }
        if (object.type === 'logic-input' || object.type === 'logic-output') return { x: object.x - 18, y: object.y - 18, width: 36, height: 36 };
        if (object.type === 'text') return { x: object.x - 5, y: object.y - object.fontSize, width: Math.max(80, String(object.text).length * object.fontSize * 0.55), height: object.fontSize + 10 };
        if (object.type === 'logic-truth-table') return { x: object.x, y: object.y, width: object.width, height: object.rowHeight * (object.rows.length + 2) };
        return { x: object.x, y: object.y, width: object.width, height: object.height };
    }

    function createSvgNode(name, attrs = {}) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', name);
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    }

    function drawSelectionOverlay() {
        const object = selectedObject();
        if (!object || !state.svg) return;
        const group = createSvgNode('g', { 'data-editor-selection': '1', 'pointer-events': 'none' });
        const bounds = objectBounds(object);
        if (bounds) {
            group.appendChild(createSvgNode('rect', {
                x: bounds.x - 7, y: bounds.y - 7, width: bounds.width + 14, height: bounds.height + 14,
                rx: 6, fill: '#2563eb', 'fill-opacity': '.04', stroke: '#2563eb', 'stroke-width': '2', 'stroke-dasharray': '7 5'
            }));
        }
        if (object.type === 'logic-wire') {
            object.points.forEach((point, index) => {
                const handle = createSvgNode('circle', {
                    cx: point.x, cy: point.y, r: 7, fill: '#ffffff', stroke: '#2563eb', 'stroke-width': '3',
                    'data-wire-point': String(index), 'data-qmx-object': object.id, 'pointer-events': 'all', cursor: 'move'
                });
                group.appendChild(handle);
            });
        }
        state.svg.appendChild(group);
    }

    function drawConnectionPorts() {
        if (state.activeTool !== 'logic-wire' || !state.svg) return;
        const group = createSvgNode('g', { 'data-smart-wire-ports': '1' });
        state.document.objects.forEach((object) => logicPorts(object).forEach((port) => {
            const isStart = state.connectionStart?.objectId === port.objectId && state.connectionStart?.portKey === port.key;
            const circle = createSvgNode('circle', {
                cx: port.x, cy: port.y, r: isStart ? 10 : 7,
                fill: port.role === 'output' ? '#16a34a' : '#2563eb', stroke: isStart ? '#f59e0b' : '#ffffff',
                'stroke-width': isStart ? '4' : '3', 'data-logic-port-object': port.objectId,
                'data-logic-port-key': port.key, 'data-logic-port-role': port.role,
                'pointer-events': 'all', cursor: 'crosshair'
            });
            const title = createSvgNode('title');
            title.textContent = `${port.role === 'output' ? 'Source' : 'Destination'}: ${port.label}`;
            circle.appendChild(title);
            group.appendChild(circle);
        }));
        state.svg.appendChild(group);
    }

    function connectPort(objectId, portKey) {
        const object = state.document.objects.find((item) => item.id === objectId);
        const port = logicPorts(object).find((item) => item.key === portKey);
        if (!port) return;
        if (!state.connectionStart) {
            state.connectionStart = portRef(port);
            render();
            setStatus(`${port.role === 'output' ? 'Source' : 'Destination'} selected: ${port.label}. Now click the opposite connection point.`);
            return;
        }
        const first = resolvePort(state.connectionStart);
        if (!first) { state.connectionStart = portRef(port); render(); return; }
        if (first.objectId === port.objectId && first.key === port.key) {
            state.connectionStart = null;
            render();
            setStatus('Connection start cleared. Click a connection point.');
            return;
        }
        if (first.role === port.role) {
            state.connectionStart = portRef(port);
            render();
            setStatus(`Choose an ${port.role === 'output' ? 'input' : 'output'} point to complete the wire.`);
            return;
        }
        const source = first.role === 'output' ? first : port;
        const target = first.role === 'input' ? first : port;
        const duplicate = state.document.objects.find((item) => item.type === 'logic-wire' && item.sourcePort?.objectId === source.objectId && item.sourcePort?.portKey === source.key && item.targetPort?.objectId === target.objectId && item.targetPort?.portKey === target.key);
        if (duplicate) {
            state.selectedId = duplicate.id;
            state.connectionStart = null;
            state.activeTool = 'select';
            state.controls.tools?.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === 'select'));
            render();
            setStatus('That point-to-point connection already exists.');
            return;
        }
        const wire = defaultObject('logic-wire');
        wire.sourcePort = portRef(source);
        wire.targetPort = portRef(target);
        wire.autoRoute = true;
        wire.points = smartRoute(source, target);
        state.document.objects.push(wire);
        state.selectedId = wire.id;
        state.connectionStart = null;
        state.activeTool = 'select';
        state.controls.tools?.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === 'select'));
        pushHistory();
        render();
        setStatus(`Smart wire connected: ${source.label} → ${target.label}. Moving either object will reroute it automatically.`);
    }

    function render() {
        if (!state.canvas || !state.document) return;
        state.document = Diagram.normalizeSpec(state.document);
        refreshConnectedWires();
        state.canvas.innerHTML = Diagram.svgMarkup(state.document, { className: 'qmx-logic-svg' });
        state.svg = state.canvas.querySelector('svg');
        if (state.svg) {
            state.svg.setAttribute('tabindex', '0');
            state.svg.addEventListener('pointerdown', onPointerDown);
            drawSelectionOverlay();
            drawConnectionPorts();
        }
        syncSelectionControls();
        updateSummary();
        updateHistoryButtons();
    }

    function svgPoint(event) {
        const rect = state.svg.getBoundingClientRect();
        const viewBox = state.svg.viewBox.baseVal;
        return {
            x: (event.clientX - rect.left) * viewBox.width / rect.width + viewBox.x,
            y: (event.clientY - rect.top) * viewBox.height / rect.height + viewBox.y
        };
    }

    function onPointerDown(event) {
        if (event.button !== 0) return;
        const portHandle = event.target.closest?.('[data-logic-port-key]');
        if (portHandle && state.activeTool === 'logic-wire') {
            connectPort(portHandle.getAttribute('data-logic-port-object'), portHandle.getAttribute('data-logic-port-key'));
            event.preventDefault();
            return;
        }
        const pointHandle = event.target.closest?.('[data-wire-point]');
        const objectNode = event.target.closest?.('[data-qmx-object]');
        const id = objectNode?.getAttribute('data-qmx-object') || null;
        if (!id) {
            if (state.activeTool !== 'logic-wire') state.selectedId = null;
            render();
            return;
        }
        state.selectedId = id;
        const object = selectedObject();
        if (!object) return;
        const start = svgPoint(event);
        state.interaction = {
            id,
            start,
            original: clone(object),
            wirePoint: pointHandle ? Number(pointHandle.getAttribute('data-wire-point')) : null
        };
        state.svg.setPointerCapture?.(event.pointerId);
        render();
        event.preventDefault();
    }

    function onPointerMove(event) {
        if (!state.interaction || !state.document || state.root?.hidden) return;
        const object = selectedObject();
        if (!object) return;
        const now = svgPoint(event);
        const dx = now.x - state.interaction.start.x;
        const dy = now.y - state.interaction.start.y;
        Object.assign(object, clone(state.interaction.original));
        if (object.type === 'logic-wire') {
            object.autoRoute = false;
            object.sourcePort = null;
            object.targetPort = null;
            if (Number.isInteger(state.interaction.wirePoint)) {
                const index = state.interaction.wirePoint;
                object.points[index] = { x: snap(now.x), y: snap(now.y) };
            } else {
                object.points = object.points.map((point) => ({ x: snap(point.x + dx), y: snap(point.y + dy) }));
            }
        } else {
            object.x = snap(Number(object.x) + dx);
            object.y = snap(Number(object.y) + dy);
            refreshConnectedWires(object.id);
        }
        render();
    }

    function onPointerUp() {
        if (!state.interaction) return;
        state.interaction = null;
        pushHistory();
        render();
        setStatus('Logic object updated.');
    }

    function field(label, prop, type = 'text', attrs = '') {
        const object = selectedObject();
        return `<div class="qmx-logic-field"><label>${label}</label><input type="${type}" data-prop="${prop}" value="${esc(object?.[prop] ?? '')}" ${attrs}></div>`;
    }
    function check(label, prop) {
        const object = selectedObject();
        return `<label class="qmx-logic-check"><input type="checkbox" data-prop="${prop}" ${object?.[prop] ? 'checked' : ''}> ${label}</label>`;
    }
    function selectField(label, prop, options) {
        const object = selectedObject();
        return `<div class="qmx-logic-field"><label>${label}</label><select data-prop="${prop}">${options.map(([value, text]) => `<option value="${esc(value)}" ${object?.[prop] === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></div>`;
    }
    function csv(value) { return Array.isArray(value) ? value.join(', ') : String(value || ''); }
    function tableRowsText(rows) { return Array.isArray(rows) ? rows.map((row) => row.join(',')).join('\n') : ''; }

    function selectedFields(object) {
        if (!object) return '<p class="qmx-logic-empty">Select a gate, input/output, wire, block, truth table or annotation.</p>';
        if (object.type === 'logic-gate') return `<div class="qmx-logic-type">logic-gate</div><div class="qmx-logic-grid2">${selectField('Gate type', 'gateType', [['and','AND'],['or','OR'],['not','NOT'],['nand','NAND'],['nor','NOR'],['xor','XOR'],['xnor','XNOR'],['buffer','Buffer']])}${field('Label','label')}${field('X','x','number','step="1"')}${field('Y','y','number','step="1"')}${field('Width','width','number','min="60" max="400"')}${field('Height','height','number','min="40" max="300"')}${field('Stroke','stroke','color')}${field('Fill','fill','color')}${field('Line width','lineWidth','number','min="0.5" max="20" step="0.5"')}${field('Output label','outputLabel')}</div><div class="qmx-logic-field"><label>Input labels (comma separated)</label><input data-array-prop="inputLabels" value="${esc(csv(object.inputLabels))}"></div>${check('Show gate label','showLabel')}`;
        if (object.type === 'logic-input' || object.type === 'logic-output') return `<div class="qmx-logic-type">${object.type}</div><div class="qmx-logic-grid2">${field('Label','label')}${field('Value','value')}${field('X','x','number')}${field('Y','y','number')}${field('Colour','color','color')}${field('Radius','radius','number','min="3" max="30"')}</div>${check('Show logic value','showValue')}`;
        if (object.type === 'logic-wire') return `<div class="qmx-logic-type">logic-wire</div><div class="qmx-logic-grid2">${field('Label','label')}${field('Stroke','stroke','color')}${field('Line width','lineWidth','number','min="0.5" max="20" step="0.5"')}</div>${check('Dashed wire','dashed')}${check('Show junction dots','junctions')}${check('Automatic point-to-point routing','autoRoute')}<div class="qmx-logic-connection"><strong>Source:</strong> ${esc(portDescription(object.sourcePort))}<br><strong>Target:</strong> ${esc(portDescription(object.targetPort))}</div><button type="button" class="qmx-logic-btn" data-act="reconnect-wire">Reconnect endpoints</button><p class="qmx-logic-help">Smart wires stay attached and reroute when a gate, terminal or block moves. Dragging a blue route handle converts the wire to a manual route.</p>`;
        if (object.type === 'logic-block') return `<div class="qmx-logic-type">logic-block</div><div class="qmx-logic-grid2">${field('Label','label')}${field('Subtitle','subLabel')}${field('X','x','number')}${field('Y','y','number')}${field('Width','width','number','min="100" max="600"')}${field('Height','height','number','min="80" max="500"')}${field('Stroke','stroke','color')}${field('Fill','fill','color')}${field('Line width','lineWidth','number','min="0.5" max="20" step="0.5"')}</div><div class="qmx-logic-field"><label>Left pins</label><input data-array-prop="pinsLeft" value="${esc(csv(object.pinsLeft))}"></div><div class="qmx-logic-field"><label>Right pins</label><input data-array-prop="pinsRight" value="${esc(csv(object.pinsRight))}"></div>${check('Clock pin marker','clockPin')}`;
        if (object.type === 'logic-truth-table') return `<div class="qmx-logic-type">logic-truth-table</div><div class="qmx-logic-grid2">${field('Title','title')}${field('X','x','number')}${field('Y','y','number')}${field('Width','width','number','min="180" max="900"')}${field('Row height','rowHeight','number','min="22" max="80"')}${field('Header fill','headerFill','color')}${field('Stroke','stroke','color')}${field('Text colour','textColor','color')}</div><div class="qmx-logic-field"><label>Headers (comma separated)</label><input data-array-prop="headers" value="${esc(csv(object.headers))}"></div><div class="qmx-logic-field"><label>Rows (one comma-separated row per line)</label><textarea data-table-rows="rows">${esc(tableRowsText(object.rows))}</textarea></div>`;
        return `<div class="qmx-logic-type">text</div><div class="qmx-logic-field"><label>Text</label><textarea data-prop="text">${esc(object.text)}</textarea></div><div class="qmx-logic-grid2">${field('X','x','number')}${field('Y','y','number')}${field('Colour','color','color')}${field('Font size','fontSize','number','min="8" max="120"')}</div><label class="qmx-logic-check"><input type="checkbox" data-prop="fontWeight" ${object.fontWeight === 'bold' ? 'checked' : ''}> Bold</label>`;
    }

    function syncSelectionControls() {
        if (state.controls.selected) state.controls.selected.innerHTML = selectedFields(selectedObject());
    }

    function updateSummary() {
        if (!state.controls.summary || !state.document) return;
        const counts = {};
        state.document.objects.forEach((object) => { counts[object.type] = (counts[object.type] || 0) + 1; });
        state.controls.summary.textContent = `${state.document.objects.length} object(s) · ${Object.entries(counts).map(([key, value]) => `${value} ${key.replace('logic-', '')}`).join(' · ')}`;
    }

    function syncDocumentControls() {
        state.root?.querySelectorAll('[data-doc]').forEach((input) => {
            const key = input.dataset.doc;
            if (input.type === 'checkbox') input.checked = Boolean(state.document[key]);
            else input.value = state.document[key] ?? '';
        });
    }

    function onRootInput(event) {
        if (event.type === 'input' && !event.target.matches('textarea[data-prop="text"], textarea[data-table-rows]')) return;
        const input = event.target;
        if (input.dataset.doc) {
            const key = input.dataset.doc;
            let value = input.type === 'checkbox' ? input.checked : input.value;
            if (input.type === 'number') value = Number(value);
            state.document[key] = value;
            if (key === 'width') state.document.width = clamp(value, 480, 2400, 1100);
            if (key === 'height') state.document.height = clamp(value, 300, 1800, 650);
            if (key === 'gridSize') state.document.gridSize = clamp(value, 5, 100, 20);
            refreshConnectedWires(); pushHistory(); render(); return;
        }
        const object = selectedObject();
        if (!object) return;
        if (input.dataset.arrayProp) {
            object[input.dataset.arrayProp] = String(input.value || '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12);
            refreshConnectedWires(object.id); pushHistory(); render(); return;
        }
        if (input.dataset.tableRows) {
            object.rows = String(input.value || '').split(/\r?\n/).map((line) => line.split(',').map((cell) => cell.trim())).filter((row) => row.some(Boolean)).slice(0, 32);
            refreshConnectedWires(object.id); pushHistory(); render(); return;
        }
        if (input.dataset.prop) {
            const key = input.dataset.prop;
            let value = input.type === 'checkbox' ? input.checked : input.value;
            if (input.type === 'number') value = Number(value);
            if (key === 'fontWeight') value = input.checked ? 'bold' : 'normal';
            object[key] = value;
            if (object.type === 'logic-gate' && key === 'gateType') {
                const labels = { and: 'AND', or: 'OR', not: 'NOT', nand: 'NAND', nor: 'NOR', xor: 'XOR', xnor: 'XNOR', buffer: 'BUF' };
                object.label = labels[value] || String(value).toUpperCase();
                if (value === 'not' || value === 'buffer') object.inputLabels = [object.inputLabels?.[0] || 'A'];
                else if ((object.inputLabels || []).length < 2) object.inputLabels = ['A', 'B'];
            }
            if (object.type === 'logic-wire' && key === 'autoRoute') refreshConnectedWire(object);
            else refreshConnectedWires(object.id);
            pushHistory(); render();
        }
    }

    function onRootClick(event) {
        const toolButton = event.target.closest('[data-tool]');
        if (toolButton) { setTool(toolButton.dataset.tool); return; }
        const preset = event.target.closest('[data-preset]');
        if (preset) { applyPreset(preset.dataset.preset); return; }
        const action = event.target.closest('[data-act]')?.dataset.act;
        if (!action) return;
        ({
            new: newDocument,
            undo,
            redo,
            duplicate: duplicateSelected,
            delete: deleteSelected,
            'reconnect-wire': () => { state.selectedId = null; setTool('logic-wire'); },
            close,
            insert: insertIntoQuestion,
            'export-svg': exportSvg,
            'export-png': exportPng
        }[action] || (() => {}))();
    }

    function gate(gateType, x, y, label, extras = {}) { return { ...gateObject(gateType), x, y, label: label || gateType.toUpperCase(), ...extras }; }
    function input(x, y, label, value = '0', extras = {}) { return { ...defaultObject('logic-input'), x, y, label, value, ...extras }; }
    function output(x, y, label, value = '0', extras = {}) { return { ...defaultObject('logic-output'), x, y, label, value, ...extras }; }
    function wire(points, label = '', extras = {}) { return { ...defaultObject('logic-wire'), points, label, ...extras }; }
    function block(x, y, width, height, label, pinsLeft, pinsRight, extras = {}) { return { ...defaultObject('logic-block'), x, y, width, height, label, pinsLeft, pinsRight, ...extras }; }
    function table(x, y, title, headers, rows, extras = {}) { return { ...defaultObject('logic-truth-table'), x, y, title, headers, rows, ...extras }; }
    function note(x, y, text, extras = {}) { return { ...defaultObject('text'), x, y, text, ...extras }; }

    function resetPreset(title) {
        state.document.objects = [];
        state.document.title = title;
        state.selectedId = null;
    }

    function applyPreset(type) {
        if (!state.document) return;
        if (type === 'clear') {
            resetPreset('Logic Gate / Digital Electronics Diagram');
            pushHistory(); syncDocumentControls(); render(); setStatus('All digital-logic objects cleared.'); return;
        }
        if (type === 'basic-gates') {
            resetPreset('Basic Logic Gates');
            state.document.objects.push(
                input(80, 150, 'A'), input(80, 230, 'B'), gate('and', 250, 130, 'AND'), output(500, 170, 'Y'),
                wire([{x:95,y:150},{x:250,y:150}]), wire([{x:95,y:230},{x:180,y:230},{x:180,y:190},{x:250,y:190}]), wire([{x:370,y:170},{x:500,y:170}]),
                input(80, 360, 'A'), input(80, 440, 'B'), gate('or', 250, 340, 'OR'), output(500, 380, 'Y'),
                wire([{x:95,y:360},{x:250,y:360}]), wire([{x:95,y:440},{x:180,y:440},{x:180,y:400},{x:250,y:400}]), wire([{x:370,y:380},{x:500,y:380}]),
                gate('not', 690, 200, 'NOT'), input(590, 240, 'A'), output(910, 240, 'Y'), wire([{x:605,y:240},{x:690,y:240}]), wire([{x:790,y:240},{x:910,y:240}]),
                note(70, 70, 'Basic AND, OR and NOT gates')
            );
        } else if (type === 'universal-gates') {
            resetPreset('Universal Logic Gates');
            state.document.objects.push(
                input(90, 190, 'A'), input(90, 270, 'B'), gate('nand', 300, 170, 'NAND'), output(570, 210, 'Y'),
                wire([{x:105,y:190},{x:300,y:190}]), wire([{x:105,y:270},{x:220,y:270},{x:220,y:230},{x:300,y:230}]), wire([{x:430,y:210},{x:570,y:210}]),
                input(90, 410, 'A'), input(90, 490, 'B'), gate('nor', 300, 390, 'NOR'), output(570, 430, 'Y'),
                wire([{x:105,y:410},{x:300,y:410}]), wire([{x:105,y:490},{x:220,y:490},{x:220,y:450},{x:300,y:450}]), wire([{x:430,y:430},{x:570,y:430}]),
                table(700, 150, 'NAND / NOR Truth Table', ['A','B','NAND','NOR'], [['0','0','1','1'],['0','1','1','0'],['1','0','1','0'],['1','1','0','0']], { width: 340 }),
                note(70, 75, 'NAND and NOR are universal gates')
            );
        } else if (type === 'half-adder') {
            resetPreset('Half Adder');
            state.document.objects.push(
                input(80, 220, 'A'), input(80, 360, 'B'),
                gate('xor', 360, 170, 'XOR', { outputLabel: 'S' }),
                gate('and', 360, 360, 'AND', { outputLabel: 'C' }),
                output(720, 210, 'SUM'), output(720, 400, 'CARRY'),
                wire([{x:95,y:220},{x:260,y:220},{x:260,y:190},{x:360,y:190}]),
                wire([{x:95,y:360},{x:220,y:360},{x:220,y:230},{x:360,y:230}]),
                wire([{x:95,y:220},{x:190,y:220},{x:190,y:380},{x:360,y:380}], '', { junctions: true }),
                wire([{x:95,y:360},{x:280,y:360},{x:280,y:420},{x:360,y:420}], '', { junctions: true }),
                wire([{x:480,y:210},{x:720,y:210}]), wire([{x:480,y:400},{x:720,y:400}]),
                table(790, 175, 'Half-Adder Truth Table', ['A','B','S','C'], [['0','0','0','0'],['0','1','1','0'],['1','0','1','0'],['1','1','0','1']], { width: 280 }),
                note(70, 80, 'Half Adder: S = A ⊕ B, C = A·B')
            );
        } else if (type === 'full-adder') {
            resetPreset('Full Adder');
            state.document.objects.push(
                input(80, 190, 'A'), input(80, 290, 'B'), input(80, 390, 'Cᵢₙ'),
                block(330, 150, 260, 300, 'FULL ADDER', ['A','B','Cᵢₙ'], ['SUM','Cₒᵤₜ'], { subLabel: 'Combinational circuit', fill: '#eff6ff' }),
                output(820, 230, 'SUM'), output(820, 370, 'Cₒᵤₜ'),
                wire([{x:95,y:190},{x:330,y:190}]), wire([{x:95,y:290},{x:250,y:290},{x:250,y:300},{x:330,y:300}]), wire([{x:95,y:390},{x:330,y:390}]),
                wire([{x:590,y:240},{x:820,y:240}]), wire([{x:590,y:360},{x:820,y:360}]),
                table(760, 450, 'Full-Adder Summary', ['Inputs','Output'], [['A,B,Cᵢₙ','SUM,Cₒᵤₜ']], { width: 300, rowHeight: 38 }),
                note(70, 75, 'Full Adder block with three inputs and two outputs')
            );
        } else if (type === 'sr-latch') {
            resetPreset('SR Latch with NOR Gates');
            state.document.objects.push(
                input(80, 180, 'S'), input(80, 450, 'R'),
                gate('nor', 340, 140, 'NOR', { outputLabel: 'Q' }), gate('nor', 340, 390, 'NOR', { outputLabel: 'Q̅' }),
                output(810, 180, 'Q'), output(810, 430, 'Q̅'),
                wire([{x:95,y:180},{x:340,y:180}]), wire([{x:95,y:450},{x:340,y:430}]),
                wire([{x:470,y:180},{x:810,y:180}]), wire([{x:470,y:430},{x:810,y:430}]),
                wire([{x:620,y:180},{x:620,y:330},{x:290,y:330},{x:290,y:450},{x:340,y:450}], 'feedback'),
                wire([{x:620,y:430},{x:620,y:300},{x:270,y:300},{x:270,y:200},{x:340,y:200}], 'feedback'),
                note(70, 75, 'Cross-coupled NOR-gate SR latch')
            );
        } else if (type === 'd-flipflop') {
            resetPreset('D Flip-Flop');
            state.document.objects.push(
                input(100, 230, 'D'), input(100, 360, 'CLK'),
                block(360, 160, 300, 300, 'D FLIP-FLOP', ['D','CLK'], ['Q','Q̅'], { subLabel: 'Positive-edge triggered', clockPin: true, fill: '#f0fdf4' }),
                output(900, 235, 'Q'), output(900, 365, 'Q̅'),
                wire([{x:115,y:230},{x:360,y:230}]), wire([{x:115,y:360},{x:360,y:360}]), wire([{x:660,y:235},{x:900,y:235}]), wire([{x:660,y:365},{x:900,y:365}]),
                note(70, 80, 'D-type flip-flop block and clock input')
            );
        } else if (type === 'mux') {
            resetPreset('2-to-1 Multiplexer');
            state.document.objects.push(
                input(80, 190, 'I₀'), input(80, 300, 'I₁'), input(80, 450, 'S'),
                block(360, 140, 300, 330, '2:1 MUX', ['I₀','I₁','S'], ['Y'], { subLabel: 'Y = S̅I₀ + SI₁', fill: '#fff7ed' }),
                output(900, 300, 'Y'),
                wire([{x:95,y:190},{x:360,y:190}]), wire([{x:95,y:300},{x:360,y:300}]), wire([{x:95,y:450},{x:260,y:450},{x:260,y:410},{x:360,y:410}]), wire([{x:660,y:300},{x:900,y:300}]),
                table(740, 390, 'Selection', ['S','Y'], [['0','I₀'],['1','I₁']], { width: 250, rowHeight: 38 }),
                note(70, 75, '2-to-1 multiplexer')
            );
        } else if (type === 'truth-table') {
            resetPreset('Logic Gate Truth Tables');
            state.document.objects.push(
                table(90, 120, 'AND', ['A','B','Y'], [['0','0','0'],['0','1','0'],['1','0','0'],['1','1','1']], { width: 280 }),
                table(410, 120, 'OR', ['A','B','Y'], [['0','0','0'],['0','1','1'],['1','0','1'],['1','1','1']], { width: 280, headerFill: '#dcfce7' }),
                table(730, 120, 'XOR', ['A','B','Y'], [['0','0','0'],['0','1','1'],['1','0','1'],['1','1','0']], { width: 280, headerFill: '#fef3c7' }),
                table(410, 390, 'NOT', ['A','Y'], [['0','1'],['1','0']], { width: 280, headerFill: '#fee2e2' }),
                note(70, 65, 'Common logic-gate truth tables')
            );
        }
        state.selectedId = state.document.objects[0]?.id || null;
        pushHistory();
        syncDocumentControls();
        render();
        setStatus(`${type} preset inserted.`);
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        const deletedId = state.selectedId;
        state.document.objects = state.document.objects.filter((object) => object.id !== deletedId && object.sourcePort?.objectId !== deletedId && object.targetPort?.objectId !== deletedId);
        state.selectedId = null;
        state.connectionStart = null;
        pushHistory(); render(); setStatus('Logic object and its attached smart wires deleted.');
    }

    function duplicateSelected() {
        const object = selectedObject();
        if (!object) return;
        const copy = clone(object);
        copy.id = uid(object.type);
        if (copy.type === 'logic-wire') copy.points = copy.points.map((point) => ({ x: point.x + 20, y: point.y + 20 }));
        else { copy.x = Number(copy.x || 0) + 20; copy.y = Number(copy.y || 0) + 20; }
        state.document.objects.push(copy);
        state.selectedId = copy.id;
        pushHistory(); render(); setStatus('Logic object duplicated.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Digital Logic document?')) return;
        state.document = createDocument();
        state.selectedId = null;
        state.connectionStart = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory(); syncDocumentControls(); setTool('select'); render(); setStatus('New Digital Logic document.');
    }

    function makeToken() { return `[[qmx-diagram:${Diagram.encodeSpec(state.document)}]]`; }
    function insertIntoQuestion() {
        const textarea = state.context?.textarea;
        if (!textarea) { setStatus('No target question field was found.'); return; }
        const token = makeToken();
        const range = state.context?.replaceRange;
        textarea.focus();
        if (range && Number.isInteger(range.start) && Number.isInteger(range.end)) textarea.setRangeText(token, range.start, range.end, 'end');
        else {
            const start = textarea.selectionStart ?? textarea.value.length;
            const end = textarea.selectionEnd ?? start;
            const prefix = start > 0 && !/\n$/.test(textarea.value.slice(0, start)) ? '\n' : '';
            const suffix = end < textarea.value.length && !/^\n/.test(textarea.value.slice(end)) ? '\n' : '';
            textarea.setRangeText(prefix + token + suffix, start, end, 'end');
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        setStatus('Digital Logic diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) { return String(value || 'digital-logic').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'digital-logic'; }
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = filename;
        document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function exportSvg() {
        downloadBlob(new Blob([Diagram.svgMarkup(state.document)], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(state.document.title)}.svg`);
        setStatus('SVG exported.');
    }
    function exportPng() {
        const svg = Diagram.svgMarkup(state.document);
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = state.document.width; canvas.height = state.document.height;
            canvas.getContext('2d').drawImage(image, 0, 0);
            URL.revokeObjectURL(url);
            canvas.toBlob((blob) => blob && downloadBlob(blob, `${safeFilename(state.document.title)}.png`), 'image/png');
            setStatus('PNG exported.');
        };
        image.onerror = () => { URL.revokeObjectURL(url); setStatus('PNG export failed.'); };
        image.src = url;
    }

    function addStyles() {
        if (document.getElementById('qmx-digital-logic-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'qmx-digital-logic-editor-styles';
        style.textContent = `.qmx-logic-editor[hidden]{display:none!important}.qmx-logic-editor{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);padding:14px;display:flex;align-items:center;justify-content:center;font:14px/1.35 "Segoe UI",Arial,sans-serif;color:#0f172a}.qmx-logic-shell{width:min(1540px,calc(100vw - 28px));height:min(950px,calc(100vh - 28px));background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.35);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}.qmx-logic-header,.qmx-logic-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #dbe4ef}.qmx-logic-footer{border-top:1px solid #dbe4ef;border-bottom:0}.qmx-logic-title{font-weight:800;font-size:17px}.qmx-logic-subtitle{font-size:12px;color:#64748b}.qmx-logic-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.qmx-logic-btn,.qmx-logic-tool,.qmx-logic-preset{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer}.qmx-logic-btn:hover,.qmx-logic-tool:hover,.qmx-logic-preset:hover{border-color:#2563eb}.qmx-logic-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}.qmx-logic-btn.danger{color:#dc2626}.qmx-logic-btn:disabled{opacity:.45;cursor:not-allowed}.qmx-logic-main{min-height:0;display:grid;grid-template-columns:245px minmax(0,1fr) 330px;gap:10px;padding:10px;background:#e7eef7}.qmx-logic-panel{background:#fff;border:1px solid #d7e0ec;border-radius:12px;padding:10px;overflow:auto;min-height:0}.qmx-logic-tools,.qmx-logic-presets{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.qmx-logic-tool{padding:8px 6px;font-size:12px}.qmx-logic-tool small{display:block;color:#64748b;font-weight:500;margin-top:2px}.qmx-logic-tool.active{background:#dbeafe;border-color:#2563eb;color:#1d4ed8}.qmx-logic-preset{font-size:12px;padding:8px 6px}.qmx-logic-section{font-weight:800;margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0}.qmx-logic-canvas-wrap{min-width:0;min-height:0;background:#cbd5e1;border-radius:12px;padding:10px;overflow:auto;display:flex;align-items:center;justify-content:center}.qmx-logic-canvas{width:100%;min-width:520px}.qmx-logic-canvas svg{display:block;width:100%;height:auto;max-height:760px;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none}.qmx-logic-canvas [data-qmx-object]{cursor:move}.qmx-logic-field{margin:7px 0}.qmx-logic-field label{display:block;font-weight:700;font-size:12px;margin-bottom:4px}.qmx-logic-field input,.qmx-logic-field select,.qmx-logic-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:inherit}.qmx-logic-field textarea{min-height:90px;resize:vertical}.qmx-logic-grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-logic-check{display:block;margin:8px 0}.qmx-logic-type,.qmx-logic-summary{margin-top:8px;padding:9px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px}.qmx-logic-empty{color:#64748b;text-align:center;padding:20px 4px}.qmx-logic-help{color:#64748b;font-size:12px}.qmx-logic-connection{margin:9px 0;padding:9px;border-radius:8px;background:#f0fdf4;color:#166534;font-size:12px}.qmx-logic-status{color:#64748b;min-height:18px}@media(max-width:980px){.qmx-logic-editor{padding:0}.qmx-logic-shell{width:100vw;height:100vh;border-radius:0}.qmx-logic-main{grid-template-columns:185px minmax(0,1fr)}.qmx-logic-main>.qmx-logic-panel:last-child{grid-column:1/-1;max-height:350px}.qmx-logic-title{font-size:15px}}`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;
        addStyles();
        const root = document.createElement('div');
        root.className = 'qmx-logic-editor';
        root.hidden = true;
        root.innerHTML = `<div class="qmx-logic-shell" role="dialog" aria-modal="true" aria-label="Digital Logic editor">
          <header class="qmx-logic-header"><div><div class="qmx-logic-title">Logic Gate / Digital Electronics Diagram</div><div class="qmx-logic-subtitle">Logic gates, smart point-to-point wires, truth tables, adders, multiplexers and flip-flop blocks</div></div><div class="qmx-logic-actions"><button class="qmx-logic-btn" data-act="new">New</button><button class="qmx-logic-btn" data-act="undo">Undo</button><button class="qmx-logic-btn" data-act="redo">Redo</button><button class="qmx-logic-btn" data-act="duplicate">Duplicate</button><button class="qmx-logic-btn danger" data-act="delete">Delete</button><button class="qmx-logic-btn" data-act="close">×</button></div></header>
          <main class="qmx-logic-main">
            <aside class="qmx-logic-panel"><strong>Digital-logic tools</strong><div class="qmx-logic-tools" data-tools></div><div class="qmx-logic-section">Circuit presets</div><div class="qmx-logic-presets"><button class="qmx-logic-preset" data-preset="basic-gates">Basic gates</button><button class="qmx-logic-preset" data-preset="universal-gates">Universal gates</button><button class="qmx-logic-preset" data-preset="half-adder">Half adder</button><button class="qmx-logic-preset" data-preset="full-adder">Full adder</button><button class="qmx-logic-preset" data-preset="sr-latch">SR latch</button><button class="qmx-logic-preset" data-preset="d-flipflop">D flip-flop</button><button class="qmx-logic-preset" data-preset="mux">2:1 MUX</button><button class="qmx-logic-preset" data-preset="truth-table">Truth tables</button><button class="qmx-logic-preset" data-preset="clear">Clear objects</button></div><p class="qmx-logic-subtitle">Use Smart wire, click a source terminal/pin, then click a destination pin. Connected wires follow objects automatically.</p></aside>
            <section class="qmx-logic-canvas-wrap"><div class="qmx-logic-canvas" data-canvas></div></section>
            <aside class="qmx-logic-panel"><strong>Document</strong><div class="qmx-logic-field"><label>Title</label><input data-doc="title"></div><div class="qmx-logic-grid2"><div class="qmx-logic-field"><label>Width</label><input type="number" min="480" max="2400" data-doc="width"></div><div class="qmx-logic-field"><label>Height</label><input type="number" min="300" max="1800" data-doc="height"></div><div class="qmx-logic-field"><label>Grid size</label><input type="number" min="5" max="100" data-doc="gridSize"></div><div class="qmx-logic-field"><label>Background</label><input type="color" data-doc="background"></div></div><label class="qmx-logic-check"><input type="checkbox" data-doc="logicShowGrid"> Show grid</label><label class="qmx-logic-check"><input type="checkbox" data-doc="logicShowPinLabels"> Show pin labels</label><label class="qmx-logic-check"><input type="checkbox" data-doc="logicShowValues"> Show logic values</label><label class="qmx-logic-check"><input type="checkbox" data-doc="snap"> Snap to grid</label><hr><strong>Selected object</strong><div data-selected></div><div class="qmx-logic-summary" data-summary></div></aside>
          </main>
          <footer class="qmx-logic-footer"><div class="qmx-logic-status" data-status></div><div class="qmx-logic-actions"><button class="qmx-logic-btn" data-act="export-svg">Export SVG</button><button class="qmx-logic-btn" data-act="export-png">Export PNG</button><button class="qmx-logic-btn primary" data-act="insert">Insert into question</button></div></footer>
        </div>`;
        document.body.appendChild(root);
        state.root = root;
        state.canvas = root.querySelector('[data-canvas]');
        state.controls = {
            tools: root.querySelector('[data-tools]'),
            selected: root.querySelector('[data-selected]'),
            summary: root.querySelector('[data-summary]'),
            status: root.querySelector('[data-status]'),
            undo: root.querySelector('[data-act="undo"]'),
            redo: root.querySelector('[data-act="redo"]')
        };
        TOOL_DEFS.forEach(([id, label, bn]) => {
            const button = document.createElement('button');
            button.className = 'qmx-logic-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<small>${esc(bn)}</small>`;
            state.controls.tools.appendChild(button);
        });
        root.addEventListener('click', onRootClick);
        root.addEventListener('change', onRootInput);
        root.addEventListener('input', onRootInput);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('keydown', onKeydown);
    }

    function setStatus(message) { if (state.controls.status) state.controls.status.textContent = message; }

    function open(context = {}) {
        buildEditor();
        state.context = context;
        state.document = context.initialSpec ? Diagram.normalizeSpec(context.initialSpec) : createDocument();
        if (state.document.mode !== 'digital-logic') state.document = createDocument();
        state.selectedId = null;
        state.activeTool = 'select';
        state.interaction = null;
        state.connectionStart = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory(); syncDocumentControls(); setTool('select'); render();
        state.root.hidden = false;
        document.body.dataset.qmxLogicOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';
        setStatus(context.initialSpec ? 'Existing Digital Logic diagram loaded.' : 'Choose a logic tool or circuit preset.');
    }

    function close() {
        if (!state.root || state.root.hidden) return;
        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxLogicOverflow || '';
        delete document.body.dataset.qmxLogicOverflow;
        state.context?.textarea?.focus?.();
    }

    function findTokenTextarea(token) { return Array.from(document.querySelectorAll('textarea')).find((textarea) => textarea.value.includes(token)) || null; }
    function openFromPreview(figure) {
        const payload = String(figure?.dataset.qmxDiagramPayload || '');
        if (!payload) return false;
        let spec;
        try { spec = Diagram.decodePayload(payload); }
        catch (error) { return false; }
        if (spec.mode !== 'digital-logic') return false;
        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) || window.QmxDiagramLauncher?.getActiveTextarea?.();
        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }
        open({ tool: { id: 'digital-logic' }, textarea, initialSpec: spec, replaceRange, editMode: true });
        return true;
    }

    function registerHandlers() {
        const launcher = window.QmxDiagramLauncher;
        if (!launcher?.registerToolHandler) return false;
        let registered = false;
        ['digital-logic', 'logic-gate', 'logic-diagram', 'digital-electronics', 'boolean-circuit'].forEach((id) => {
            try { launcher.registerToolHandler(id, open); registered = true; }
            catch (error) { /* Alias may already be registered. */ }
        });
        return registered;
    }

    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;
        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
        if (event.key === 'Escape' && state.activeTool === 'logic-wire') { setTool('select'); setStatus('Smart-wire connection cancelled.'); event.preventDefault(); return; }
        if (event.key === 'Escape') { close(); event.preventDefault(); return; }
        if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) { event.preventDefault(); deleteSelected(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && !editing) { event.preventDefault(); duplicateSelected(); }
    }

    function init() {
        buildEditor();
        if (!registerHandlers()) document.addEventListener('qmx:diagram-launcher-ready', registerHandlers, { once: true });
    }

    window.QmxDigitalLogicEditor = Object.freeze({ version: '1.1.0', open, close, openFromPreview });
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})(window, document);
