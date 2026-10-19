(function (window, document) {
    'use strict';

    if (window.QmxFiniteStateMachineEditor?.version) return;
    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX FSM] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['fsm-state', 'State', 'অবস্থা'],
        ['fsm-accept-state', 'Accept state', 'গ্রহণ অবস্থা'],
        ['fsm-initial-state', 'Start state', 'শুরু অবস্থা'],
        ['fsm-transition', 'Smart transition', 'স্মার্ট রূপান্তর'],
        ['fsm-loop', 'Self-loop', 'স্ব-লুপ'],
        ['fsm-table', 'State table', 'অবস্থা সারণি'],
        ['text', 'Annotation', 'টীকা']
    ];
    const PORTS = ['n', 'e', 's', 'w'];

    const state = {
        root: null, canvas: null, svg: null, context: null, document: null,
        selectedId: null, activeTool: 'select', interaction: null, connectionStart: null,
        history: [], historyIndex: -1, controls: {}
    };

    function uid(prefix = 'fsm') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]); }
    function clamp(value, min, max, fallback = min) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
    function snap(value) { const step = Number(state.document?.gridSize || 20); return state.document?.snap ? Math.round(value / step) * step : value; }
    function selectedObject() { return state.document?.objects.find((object) => object.id === state.selectedId) || null; }
    function stateObjects() { return state.document?.objects.filter((object) => object.type === 'fsm-state') || []; }

    function createDocument() {
        return {
            version: 23,
            id: uid('finite-state-machine'),
            mode: 'finite-state-machine',
            title: 'Finite State Machine / Automata Diagram',
            width: 1100,
            height: 650,
            background: '#ffffff',
            gridSize: 20,
            automataShowGrid: true,
            automataShowStateLabels: true,
            automataShowTransitionLabels: true,
            snap: true,
            objects: []
        };
    }

    function makeState(overrides = {}) {
        return {
            id: uid('fsm-state'), type: 'fsm-state', x: 360, y: 280, radius: 48,
            label: 'q0', output: '', accepting: false, initial: false,
            fill: '#ffffff', stroke: '#0f172a', lineWidth: 3,
            ...overrides
        };
    }

    function defaultObject(type) {
        if (type === 'fsm-state') return makeState();
        if (type === 'fsm-accept-state') return makeState({ label: 'qf', accepting: true });
        if (type === 'fsm-initial-state') return makeState({ label: 'q0', initial: true });
        if (type === 'fsm-table') return {
            id: uid('fsm-table'), type: 'fsm-table', x: 650, y: 100, width: 380, rowHeight: 36,
            title: 'State Transition Table', headers: ['State', '0', '1'],
            rows: [['→q0', 'q0', 'q1'], ['*q1', 'q0', 'q1']],
            headerFill: '#dbeafe', stroke: '#334155', textColor: '#0f172a'
        };
        return { id: uid('text'), type: 'text', x: 70, y: 70, text: 'Finite-state machine', color: '#0f172a', fontSize: 20, fontWeight: 'bold' };
    }

    function portPosition(object, key) {
        const r = Number(object.radius || 48);
        if (key === 'n') return { x: object.x, y: object.y - r, key };
        if (key === 's') return { x: object.x, y: object.y + r, key };
        if (key === 'w') return { x: object.x - r, y: object.y, key };
        return { x: object.x + r, y: object.y, key: 'e' };
    }

    function nearestPort(object, point) {
        return PORTS.map((key) => portPosition(object, key)).sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
    }

    function addTransition(sourceObject, sourceKey, targetObject, targetKey, label = '0') {
        const same = sourceObject.id === targetObject.id;
        const transition = {
            id: uid('fsm-transition'), type: 'fsm-transition',
            sourceId: sourceObject.id, targetId: targetObject.id,
            sourcePort: sourceKey || (same ? 'n' : 'e'), targetPort: targetKey || (same ? 'n' : 'w'),
            label, curve: same ? -95 : 0, loopAngle: -90,
            stroke: '#0f172a', lineWidth: 3, dashed: false, arrow: true
        };
        state.document.objects.push(transition);
        state.selectedId = transition.id;
        state.connectionStart = null;
        pushHistory(); render(); setStatus(same ? 'Self-loop created.' : 'Smart state-to-state transition created.');
    }

    function connectPort(objectId, portKey) {
        const object = state.document.objects.find((item) => item.id === objectId && item.type === 'fsm-state');
        if (!object) return;
        if (!state.connectionStart) {
            state.connectionStart = { objectId, portKey };
            setStatus(`Transition source selected: ${object.label} (${portKey.toUpperCase()}). Choose a destination point.`);
            render();
            return;
        }
        const source = state.document.objects.find((item) => item.id === state.connectionStart.objectId && item.type === 'fsm-state');
        if (!source) { state.connectionStart = null; render(); return; }
        addTransition(source, state.connectionStart.portKey, object, portKey, source.id === object.id ? 'a' : '0');
        state.activeTool = 'select';
        updateToolButtons();
    }

    function addObject(type) {
        const object = defaultObject(type);
        const count = state.document.objects.length;
        if ('x' in object) object.x = snap(Number(object.x) + (count % 5) * 20);
        if ('y' in object) object.y = snap(Number(object.y) + (count % 4) * 20);
        if (object.type === 'fsm-state') {
            const index = stateObjects().length;
            object.label = object.accepting ? `q${index}` : (object.initial && index === 0 ? 'q0' : `q${index}`);
        }
        state.document.objects.push(object);
        state.selectedId = object.id;
        pushHistory(); render(); setStatus(`${type} added.`);
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
        state.connectionStart = null;
        state.interaction = null;
        syncDocumentControls(); render(); updateHistoryButtons();
    }
    function undo() { restoreHistory(state.historyIndex - 1); }
    function redo() { restoreHistory(state.historyIndex + 1); }
    function updateHistoryButtons() {
        if (!state.controls.undo) return;
        state.controls.undo.disabled = state.historyIndex <= 0;
        state.controls.redo.disabled = state.historyIndex >= state.history.length - 1;
    }

    function updateToolButtons() {
        state.controls.tools?.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === state.activeTool));
    }

    function setTool(tool) {
        state.activeTool = tool;
        state.connectionStart = null;
        updateToolButtons();
        if (tool === 'fsm-transition') {
            setStatus('Smart transition: click a source connection point, then a destination point.');
            render(); return;
        }
        if (tool === 'fsm-loop') {
            setStatus('Self-loop: click a state or one of its connection points.');
            render(); return;
        }
        if (tool !== 'select') {
            addObject(tool);
            state.activeTool = 'select'; updateToolButtons();
        } else render();
    }

    function selectionMarkup() {
        if (!state.document) return '';
        const selected = selectedObject();
        let markup = '<g data-fsm-editor-overlay="1">';
        if (selected?.type === 'fsm-state') {
            markup += `<circle cx="${selected.x}" cy="${selected.y}" r="${Number(selected.radius) + 8}" fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="7 5"/>`;
        } else if (selected?.type === 'fsm-table') {
            const columns = Math.max(1, selected.headers?.length || 1, ...(selected.rows || []).map((row) => row.length));
            const height = Number(selected.rowHeight || 36) * ((selected.rows?.length || 0) + 2);
            markup += `<rect x="${selected.x - 7}" y="${selected.y - 7}" width="${Number(selected.width) + 14}" height="${height + 14}" fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="7 5"/>`;
        } else if (selected?.type === 'text') {
            markup += `<circle cx="${selected.x}" cy="${selected.y}" r="8" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>`;
        }
        if (state.activeTool === 'fsm-transition' || state.activeTool === 'fsm-loop' || selected?.type === 'fsm-state') {
            stateObjects().forEach((object) => {
                PORTS.forEach((key) => {
                    const point = portPosition(object, key);
                    const started = state.connectionStart?.objectId === object.id && state.connectionStart?.portKey === key;
                    markup += `<circle data-fsm-port-object="${esc(object.id)}" data-fsm-port-key="${key}" cx="${point.x}" cy="${point.y}" r="${started ? 9 : 7}" fill="${started ? '#16a34a' : '#2563eb'}" stroke="#ffffff" stroke-width="2" style="cursor:crosshair"/>`;
                });
            });
        }
        return markup + '</g>';
    }

    function render() {
        if (!state.canvas || !state.document) return;
        state.document = Diagram.normalizeSpec(state.document);
        let svg = Diagram.svgMarkup(state.document);
        svg = svg.replace('</svg>', `${selectionMarkup()}</svg>`);
        state.canvas.innerHTML = svg;
        state.svg = state.canvas.querySelector('svg');
        syncSelectedControls();
        updateSummary();
    }

    function field(label, key, value, type = 'text', attrs = '') {
        return `<div class="qmx-fsm-field"><label>${esc(label)}</label><input type="${type}" data-object="${esc(key)}" value="${esc(value)}" ${attrs}></div>`;
    }
    function check(label, key, checked) {
        return `<label class="qmx-fsm-check"><input type="checkbox" data-object="${esc(key)}" ${checked ? 'checked' : ''}> ${esc(label)}</label>`;
    }
    function textarea(label, key, value) {
        return `<div class="qmx-fsm-field"><label>${esc(label)}</label><textarea data-object="${esc(key)}">${esc(value)}</textarea></div>`;
    }

    function syncSelectedControls() {
        const panel = state.controls.selected;
        if (!panel) return;
        const object = selectedObject();
        if (!object) { panel.innerHTML = '<div class="qmx-fsm-empty">Select a state, transition, state table or annotation.</div>'; return; }
        let html = `<div class="qmx-fsm-type">${esc(object.type)}</div>`;
        if (object.type === 'fsm-state') {
            html += field('State label', 'label', object.label);
            html += field('Moore output', 'output', object.output || '');
            html += `<div class="qmx-fsm-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Radius', 'radius', object.radius, 'number', 'min="24" max="160"')}${field('Line width', 'lineWidth', object.lineWidth, 'number', 'min="1" max="20" step="0.5"')}</div>`;
            html += `${check('Accepting state', 'accepting', object.accepting)}${check('Initial state', 'initial', object.initial)}`;
            html += `<div class="qmx-fsm-grid2">${field('Fill', 'fill', object.fill, 'color')}${field('Stroke', 'stroke', object.stroke, 'color')}</div>`;
        } else if (object.type === 'fsm-transition') {
            const states = stateObjects();
            const options = (selectedId) => states.map((item) => `<option value="${esc(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${esc(item.label)}</option>`).join('');
            const portOptions = (selectedKey) => PORTS.map((key) => `<option value="${key}" ${key === selectedKey ? 'selected' : ''}>${key.toUpperCase()}</option>`).join('');
            html += field('Transition label', 'label', object.label);
            html += `<div class="qmx-fsm-field"><label>Source state</label><select data-object="sourceId">${options(object.sourceId)}</select></div>`;
            html += `<div class="qmx-fsm-field"><label>Destination state</label><select data-object="targetId">${options(object.targetId)}</select></div>`;
            html += `<div class="qmx-fsm-grid2"><div class="qmx-fsm-field"><label>Source point</label><select data-object="sourcePort">${portOptions(object.sourcePort)}</select></div><div class="qmx-fsm-field"><label>Target point</label><select data-object="targetPort">${portOptions(object.targetPort)}</select></div></div>`;
            html += `<div class="qmx-fsm-grid2">${field('Curve', 'curve', object.curve, 'number', 'min="-400" max="400"')}${field('Line width', 'lineWidth', object.lineWidth, 'number', 'min="1" max="20" step="0.5"')}</div>`;
            html += `${check('Dashed', 'dashed', object.dashed)}${check('Arrow head', 'arrow', object.arrow)}`;
            html += field('Stroke', 'stroke', object.stroke, 'color');
        } else if (object.type === 'fsm-table') {
            html += field('Table title', 'title', object.title);
            html += textarea('Headers — comma separated', 'headersText', (object.headers || []).join(', '));
            html += textarea('Rows — one comma-separated row per line', 'rowsText', (object.rows || []).map((row) => row.join(', ')).join('\n'));
            html += `<div class="qmx-fsm-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Width', 'width', object.width, 'number', 'min="180" max="1500"')}${field('Row height', 'rowHeight', object.rowHeight, 'number', 'min="22" max="100"')}</div>`;
        } else {
            html += textarea('Text', 'text', object.text);
            html += `<div class="qmx-fsm-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Font size', 'fontSize', object.fontSize, 'number', 'min="8" max="120"')}${field('Color', 'color', object.color, 'color')}</div>`;
            html += check('Bold', 'fontWeight', object.fontWeight === 'bold');
        }
        panel.innerHTML = html;
    }

    function updateSummary() {
        const summary = state.controls.summary;
        if (!summary) return;
        const counts = {};
        state.document.objects.forEach((object) => { counts[object.type] = (counts[object.type] || 0) + 1; });
        summary.textContent = `${state.document.objects.length} object(s) · ${counts['fsm-state'] || 0} state · ${counts['fsm-transition'] || 0} transition · ${counts['fsm-table'] || 0} table`;
    }

    function syncDocumentControls() {
        if (!state.root || !state.document) return;
        state.root.querySelectorAll('[data-doc]').forEach((control) => {
            const key = control.dataset.doc;
            if (control.type === 'checkbox') control.checked = Boolean(state.document[key]);
            else control.value = state.document[key] ?? '';
        });
    }

    function onRootInput(event) {
        const docKey = event.target.dataset.doc;
        if (docKey) {
            const value = event.target.type === 'checkbox' ? event.target.checked : (event.target.type === 'number' ? Number(event.target.value) : event.target.value);
            state.document[docKey] = value;
            render(); pushHistory(); return;
        }
        const key = event.target.dataset.object;
        if (!key) return;
        const object = selectedObject();
        if (!object) return;
        let value = event.target.type === 'checkbox' ? event.target.checked : (event.target.type === 'number' ? Number(event.target.value) : event.target.value);
        if (key === 'headersText') object.headers = String(value).split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12);
        else if (key === 'rowsText') object.rows = String(value).split(/\r?\n/).map((line) => line.split(',').map((item) => item.trim()).slice(0, 12)).filter((row) => row.some(Boolean)).slice(0, 40);
        else if (key === 'fontWeight') object.fontWeight = value ? 'bold' : 'normal';
        else object[key] = value;
        render(); pushHistory(); setStatus('Automata object updated.');
    }

    function svgPoint(event) {
        if (!state.svg) return { x: 0, y: 0 };
        const rect = state.svg.getBoundingClientRect();
        return { x: (event.clientX - rect.left) * state.document.width / rect.width, y: (event.clientY - rect.top) * state.document.height / rect.height };
    }

    function onCanvasPointerDown(event) {
        if (!state.svg?.contains(event.target)) return;
        const port = event.target.closest?.('[data-fsm-port-object]');
        if (port) return;
        const group = event.target.closest?.('[data-qmx-object]');
        if (!group) { if (state.activeTool === 'select') { state.selectedId = null; render(); } return; }
        const object = state.document.objects.find((item) => item.id === group.getAttribute('data-qmx-object'));
        if (!object) return;
        const point = svgPoint(event);
        if (state.activeTool === 'fsm-transition' && object.type === 'fsm-state') {
            const nearest = nearestPort(object, point); connectPort(object.id, nearest.key); event.preventDefault(); return;
        }
        if (state.activeTool === 'fsm-loop' && object.type === 'fsm-state') {
            addTransition(object, 'n', object, 'n', 'a'); state.activeTool = 'select'; updateToolButtons(); event.preventDefault(); return;
        }
        state.selectedId = object.id;
        if (state.activeTool !== 'select') { render(); return; }
        if (['fsm-state', 'fsm-table', 'text'].includes(object.type)) {
            state.interaction = { type: 'move', objectId: object.id, start: point, x: Number(object.x), y: Number(object.y) };
            event.preventDefault();
        }
        render();
    }

    function onPointerMove(event) {
        if (!state.interaction || !state.document) return;
        const object = state.document.objects.find((item) => item.id === state.interaction.objectId);
        if (!object) return;
        const point = svgPoint(event);
        object.x = snap(state.interaction.x + point.x - state.interaction.start.x);
        object.y = snap(state.interaction.y + point.y - state.interaction.start.y);
        render();
    }

    function onPointerUp() {
        if (!state.interaction) return;
        state.interaction = null;
        pushHistory(); setStatus('Object moved; connected transitions followed automatically.');
    }

    function onRootClick(event) {
        const port = event.target.closest?.('[data-fsm-port-object]');
        if (port) {
            if (state.activeTool === 'fsm-loop') {
                const object = state.document.objects.find((item) => item.id === port.dataset.fsmPortObject);
                if (object) addTransition(object, port.dataset.fsmPortKey, object, port.dataset.fsmPortKey, 'a');
                state.activeTool = 'select'; updateToolButtons();
            } else {
                if (state.activeTool !== 'fsm-transition') { state.activeTool = 'fsm-transition'; updateToolButtons(); }
                connectPort(port.dataset.fsmPortObject, port.dataset.fsmPortKey);
            }
            return;
        }
        const tool = event.target.closest?.('[data-tool]');
        if (tool) { setTool(tool.dataset.tool); return; }
        const preset = event.target.closest?.('[data-preset]');
        if (preset) { applyPreset(preset.dataset.preset); return; }
        const action = event.target.closest?.('[data-act]')?.dataset.act;
        if (!action) return;
        ({ new: newDocument, undo, redo, duplicate: duplicateSelected, delete: deleteSelected, close,
            'export-svg': exportSvg, 'export-png': exportPng, insert: insertIntoQuestion }[action]?.());
    }

    function transition(source, target, label, options = {}) {
        return { id: uid('fsm-transition'), type: 'fsm-transition', sourceId: source.id, targetId: target.id,
            sourcePort: options.sourcePort || (source === target ? 'n' : (target.x >= source.x ? 'e' : 'w')),
            targetPort: options.targetPort || (source === target ? 'n' : (target.x >= source.x ? 'w' : 'e')),
            label, curve: options.curve ?? (source === target ? -95 : 0), loopAngle: options.loopAngle ?? -90,
            stroke: options.stroke || '#0f172a', lineWidth: options.lineWidth || 3, dashed: Boolean(options.dashed), arrow: options.arrow !== false };
    }
    function table(x, y, title, headers, rows, options = {}) { return { id: uid('fsm-table'), type: 'fsm-table', x, y, width: options.width || 380, rowHeight: options.rowHeight || 34, title, headers, rows, headerFill: options.headerFill || '#dbeafe', stroke: '#334155', textColor: '#0f172a' }; }
    function note(x, y, text) { return { id: uid('text'), type: 'text', x, y, text, color: '#0f172a', fontSize: 20, fontWeight: 'bold' }; }

    function applyPreset(type) {
        if (type === 'clear') {
            state.document.objects = []; state.selectedId = null; pushHistory(); render(); setStatus('Automata canvas cleared.'); return;
        }
        const objects = [];
        if (type === 'ending-01') {
            const q0 = makeState({ x: 220, y: 300, label: 'q0', initial: true });
            const q1 = makeState({ x: 500, y: 300, label: 'q1' });
            const q2 = makeState({ x: 790, y: 300, label: 'q2', accepting: true });
            objects.push(q0, q1, q2,
                transition(q0, q0, '1', { sourcePort: 'n', targetPort: 'n' }), transition(q0, q1, '0'),
                transition(q1, q1, '0', { sourcePort: 's', targetPort: 's', curve: 95 }), transition(q1, q2, '1'),
                transition(q2, q1, '0', { sourcePort: 'w', targetPort: 'e', curve: 75 }), transition(q2, q0, '1', { sourcePort: 's', targetPort: 's', curve: 150 }),
                note(390, 90, 'DFA: binary strings ending in 01'));
        } else if (type === 'even-ones') {
            const even = makeState({ x: 310, y: 300, label: 'Even', initial: true, accepting: true });
            const odd = makeState({ x: 720, y: 300, label: 'Odd' });
            objects.push(even, odd,
                transition(even, even, '0', { sourcePort: 'n', targetPort: 'n' }), transition(odd, odd, '0', { sourcePort: 'n', targetPort: 'n' }),
                transition(even, odd, '1', { sourcePort: 'e', targetPort: 'w', curve: -60 }), transition(odd, even, '1', { sourcePort: 'w', targetPort: 'e', curve: -60 }),
                note(380, 90, 'DFA: even number of 1s'));
        } else if (type === 'substring-101') {
            const q0 = makeState({ x: 140, y: 300, label: 'q0', initial: true });
            const q1 = makeState({ x: 390, y: 300, label: 'q1' });
            const q2 = makeState({ x: 640, y: 300, label: 'q2' });
            const q3 = makeState({ x: 890, y: 300, label: 'q3', accepting: true });
            objects.push(q0, q1, q2, q3, transition(q0,q0,'0',{sourcePort:'n',targetPort:'n'}), transition(q0,q1,'1'), transition(q1,q1,'1',{sourcePort:'n',targetPort:'n'}), transition(q1,q2,'0'), transition(q2,q0,'0',{curve:120,sourcePort:'s',targetPort:'s'}), transition(q2,q3,'1'), transition(q3,q3,'0,1',{sourcePort:'n',targetPort:'n'}), note(410,90,'DFA: contains substring 101'));
        } else if (type === 'nfa-ab') {
            const q0 = makeState({ x: 240, y: 300, label: 'q0', initial: true });
            const q1 = makeState({ x: 520, y: 220, label: 'q1' });
            const q2 = makeState({ x: 800, y: 300, label: 'q2', accepting: true });
            objects.push(q0,q1,q2, transition(q0,q0,'a,b',{sourcePort:'s',targetPort:'s',curve:95}), transition(q0,q1,'a',{sourcePort:'e',targetPort:'w'}), transition(q1,q2,'b',{sourcePort:'e',targetPort:'w'}), note(410,90,'NFA: strings containing ab'));
        } else if (type === 'mealy') {
            const s0 = makeState({ x: 280, y: 300, label: 'S0', initial: true });
            const s1 = makeState({ x: 730, y: 300, label: 'S1' });
            objects.push(s0,s1, transition(s0,s0,'0/0',{sourcePort:'n',targetPort:'n'}), transition(s0,s1,'1/0',{curve:-55}), transition(s1,s0,'0/0',{curve:-55}), transition(s1,s1,'1/1',{sourcePort:'n',targetPort:'n'}), note(390,90,'Mealy sequence detector'));
        } else if (type === 'moore') {
            const a = makeState({ x: 220, y: 300, label: 'A', output: '0', initial: true });
            const b = makeState({ x: 520, y: 190, label: 'B', output: '0' });
            const c = makeState({ x: 820, y: 300, label: 'C', output: '1', accepting: true });
            objects.push(a,b,c, transition(a,a,'0',{sourcePort:'s',targetPort:'s',curve:90}), transition(a,b,'1'), transition(b,a,'0',{curve:70,sourcePort:'w',targetPort:'e'}), transition(b,c,'1'), transition(c,a,'0,1',{curve:155,sourcePort:'s',targetPort:'s'}), note(390,70,'Moore machine (state/output)'));
        } else if (type === 'state-table') {
            objects.push(table(180,120,'DFA State Transition Table',['State','0','1'],[['→q0','q0','q1'],['q1','q2','q1'],['*q2','q0','q1']],{width:720,rowHeight:52}), note(330,70,'Editable automata state table'));
        } else if (type === 'pda') {
            const q0 = makeState({ x: 230, y: 300, label: 'q0', initial: true });
            const q1 = makeState({ x: 540, y: 300, label: 'q1' });
            const q2 = makeState({ x: 850, y: 300, label: 'qf', accepting: true });
            objects.push(q0,q1,q2, transition(q0,q1,'ε, ε → $'), transition(q1,q1,'(, X → (X',{sourcePort:'n',targetPort:'n'}), transition(q1,q1,'), ( → ε',{sourcePort:'s',targetPort:'s',curve:95}), transition(q1,q2,'ε, $ → ε'), note(350,80,'PDA: balanced parentheses'));
        }
        state.document.objects = objects;
        state.selectedId = objects[0]?.id || null;
        state.connectionStart = null;
        pushHistory(); syncDocumentControls(); render(); setStatus(`${type} preset inserted.`);
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        const deletedId = state.selectedId;
        state.document.objects = state.document.objects.filter((object) => object.id !== deletedId && object.sourceId !== deletedId && object.targetId !== deletedId);
        state.selectedId = null; state.connectionStart = null; pushHistory(); render(); setStatus('Object and attached transitions deleted.');
    }

    function duplicateSelected() {
        const object = selectedObject(); if (!object) return;
        const copy = clone(object); copy.id = uid(object.type);
        if (copy.type === 'fsm-transition') { copy.curve = Number(copy.curve || 0) + 35; copy.label = `${copy.label}′`; }
        else { copy.x = Number(copy.x || 0) + 30; copy.y = Number(copy.y || 0) + 30; if (copy.type === 'fsm-state') copy.label = `${copy.label}′`; }
        state.document.objects.push(copy); state.selectedId = copy.id; pushHistory(); render(); setStatus('Object duplicated.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Finite State Machine document?')) return;
        state.document = createDocument(); state.selectedId = null; state.connectionStart = null; state.history = []; state.historyIndex = -1;
        pushHistory(); syncDocumentControls(); setTool('select'); render(); setStatus('New Finite State Machine document.');
    }

    function makeToken() { return `[[qmx-diagram:${Diagram.encodeSpec(state.document)}]]`; }
    function insertIntoQuestion() {
        const textarea = state.context?.textarea;
        if (!textarea) { setStatus('No target question field was found.'); return; }
        const token = makeToken(); const range = state.context?.replaceRange; textarea.focus();
        if (range && Number.isInteger(range.start) && Number.isInteger(range.end)) textarea.setRangeText(token, range.start, range.end, 'end');
        else {
            const start = textarea.selectionStart ?? textarea.value.length; const end = textarea.selectionEnd ?? start;
            const prefix = start > 0 && !/\n$/.test(textarea.value.slice(0, start)) ? '\n' : '';
            const suffix = end < textarea.value.length && !/^\n/.test(textarea.value.slice(end)) ? '\n' : '';
            textarea.setRangeText(prefix + token + suffix, start, end, 'end');
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.dispatchEvent(new Event('change', { bubbles: true }));
        setStatus('Finite State Machine diagram inserted. Save the question to persist it.'); window.setTimeout(close, 220);
    }

    function safeFilename(value) { return String(value || 'finite-state-machine').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'finite-state-machine'; }
    function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    function exportSvg() { downloadBlob(new Blob([Diagram.svgMarkup(state.document)], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(state.document.title)}.svg`); setStatus('SVG exported.'); }
    function exportPng() {
        const svg = Diagram.svgMarkup(state.document); const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })); const image = new Image();
        image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = state.document.width; canvas.height = state.document.height; canvas.getContext('2d').drawImage(image, 0, 0); URL.revokeObjectURL(url); canvas.toBlob((blob) => blob && downloadBlob(blob, `${safeFilename(state.document.title)}.png`), 'image/png'); setStatus('PNG exported.'); };
        image.onerror = () => { URL.revokeObjectURL(url); setStatus('PNG export failed.'); }; image.src = url;
    }

    function addStyles() {
        if (document.getElementById('qmx-fsm-editor-styles')) return;
        const style = document.createElement('style'); style.id = 'qmx-fsm-editor-styles';
        style.textContent = `.qmx-fsm-editor[hidden]{display:none!important}.qmx-fsm-editor{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);padding:14px;display:flex;align-items:center;justify-content:center;font:14px/1.35 "Segoe UI",Arial,sans-serif;color:#0f172a}.qmx-fsm-shell{width:min(1540px,calc(100vw - 28px));height:min(950px,calc(100vh - 28px));background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.35);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}.qmx-fsm-header,.qmx-fsm-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #dbe4ef}.qmx-fsm-footer{border-top:1px solid #dbe4ef;border-bottom:0}.qmx-fsm-title{font-weight:800;font-size:17px}.qmx-fsm-subtitle{font-size:12px;color:#64748b}.qmx-fsm-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.qmx-fsm-btn,.qmx-fsm-tool,.qmx-fsm-preset{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer}.qmx-fsm-btn:hover,.qmx-fsm-tool:hover,.qmx-fsm-preset:hover{border-color:#2563eb}.qmx-fsm-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}.qmx-fsm-btn.danger{color:#dc2626}.qmx-fsm-btn:disabled{opacity:.45;cursor:not-allowed}.qmx-fsm-main{min-height:0;display:grid;grid-template-columns:245px minmax(0,1fr) 330px;gap:10px;padding:10px;background:#e7eef7}.qmx-fsm-panel{background:#fff;border:1px solid #d7e0ec;border-radius:12px;padding:10px;overflow:auto;min-height:0}.qmx-fsm-tools,.qmx-fsm-presets{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.qmx-fsm-tool{padding:8px 6px;font-size:12px}.qmx-fsm-tool small{display:block;color:#64748b;font-weight:500;margin-top:2px}.qmx-fsm-tool.active{background:#dbeafe;border-color:#2563eb;color:#1d4ed8}.qmx-fsm-preset{font-size:12px;padding:8px 6px}.qmx-fsm-section{font-weight:800;margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0}.qmx-fsm-canvas-wrap{min-width:0;min-height:0;background:#cbd5e1;border-radius:12px;padding:10px;overflow:auto;display:flex;align-items:center;justify-content:center}.qmx-fsm-canvas{width:100%;min-width:520px}.qmx-fsm-canvas svg{display:block;width:100%;height:auto;max-height:760px;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none}.qmx-fsm-canvas [data-qmx-object]{cursor:move}.qmx-fsm-field{margin:7px 0}.qmx-fsm-field label{display:block;font-weight:700;font-size:12px;margin-bottom:4px}.qmx-fsm-field input,.qmx-fsm-field select,.qmx-fsm-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:inherit}.qmx-fsm-field textarea{min-height:90px;resize:vertical}.qmx-fsm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-fsm-check{display:block;margin:8px 0}.qmx-fsm-type,.qmx-fsm-summary{margin-top:8px;padding:9px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px}.qmx-fsm-empty{color:#64748b;text-align:center;padding:20px 4px}.qmx-fsm-status{color:#64748b;min-height:18px}@media(max-width:980px){.qmx-fsm-editor{padding:0}.qmx-fsm-shell{width:100vw;height:100vh;border-radius:0}.qmx-fsm-main{grid-template-columns:185px minmax(0,1fr)}.qmx-fsm-main>.qmx-fsm-panel:last-child{grid-column:1/-1;max-height:350px}.qmx-fsm-title{font-size:15px}}`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;
        addStyles();
        const root = document.createElement('div'); root.className = 'qmx-fsm-editor'; root.hidden = true;
        root.innerHTML = `<div class="qmx-fsm-shell" role="dialog" aria-modal="true" aria-label="Finite State Machine editor">
          <header class="qmx-fsm-header"><div><div class="qmx-fsm-title">Finite State Machine / Automata Diagram</div><div class="qmx-fsm-subtitle">DFA, NFA, Mealy and Moore machines with smart point-to-point transitions</div></div><div class="qmx-fsm-actions"><button class="qmx-fsm-btn" data-act="new">New</button><button class="qmx-fsm-btn" data-act="undo">Undo</button><button class="qmx-fsm-btn" data-act="redo">Redo</button><button class="qmx-fsm-btn" data-act="duplicate">Duplicate</button><button class="qmx-fsm-btn danger" data-act="delete">Delete</button><button class="qmx-fsm-btn" data-act="close">×</button></div></header>
          <main class="qmx-fsm-main">
            <aside class="qmx-fsm-panel"><strong>Automata tools</strong><div class="qmx-fsm-tools" data-tools></div><div class="qmx-fsm-section">Machine presets</div><div class="qmx-fsm-presets"><button class="qmx-fsm-preset" data-preset="ending-01">Ends in 01</button><button class="qmx-fsm-preset" data-preset="even-ones">Even number of 1s</button><button class="qmx-fsm-preset" data-preset="substring-101">Contains 101</button><button class="qmx-fsm-preset" data-preset="nfa-ab">NFA contains ab</button><button class="qmx-fsm-preset" data-preset="mealy">Mealy detector</button><button class="qmx-fsm-preset" data-preset="moore">Moore machine</button><button class="qmx-fsm-preset" data-preset="state-table">State table</button><button class="qmx-fsm-preset" data-preset="pda">PDA parentheses</button><button class="qmx-fsm-preset" data-preset="clear">Clear objects</button></div><p class="qmx-fsm-subtitle">Use Smart transition, then click a source connection point and a destination connection point. Transitions remain attached when states move.</p></aside>
            <section class="qmx-fsm-canvas-wrap"><div class="qmx-fsm-canvas" data-canvas></div></section>
            <aside class="qmx-fsm-panel"><strong>Document</strong><div class="qmx-fsm-field"><label>Title</label><input data-doc="title"></div><div class="qmx-fsm-grid2"><div class="qmx-fsm-field"><label>Width</label><input type="number" min="480" max="2400" data-doc="width"></div><div class="qmx-fsm-field"><label>Height</label><input type="number" min="300" max="1800" data-doc="height"></div><div class="qmx-fsm-field"><label>Grid size</label><input type="number" min="5" max="100" data-doc="gridSize"></div><div class="qmx-fsm-field"><label>Background</label><input type="color" data-doc="background"></div></div><label class="qmx-fsm-check"><input type="checkbox" data-doc="automataShowGrid"> Show grid</label><label class="qmx-fsm-check"><input type="checkbox" data-doc="automataShowStateLabels"> Show state/output labels</label><label class="qmx-fsm-check"><input type="checkbox" data-doc="automataShowTransitionLabels"> Show transition labels</label><label class="qmx-fsm-check"><input type="checkbox" data-doc="snap"> Snap to grid</label><hr><strong>Selected object</strong><div data-selected></div><div class="qmx-fsm-summary" data-summary></div></aside>
          </main>
          <footer class="qmx-fsm-footer"><div class="qmx-fsm-status" data-status></div><div class="qmx-fsm-actions"><button class="qmx-fsm-btn" data-act="export-svg">Export SVG</button><button class="qmx-fsm-btn" data-act="export-png">Export PNG</button><button class="qmx-fsm-btn primary" data-act="insert">Insert into question</button></div></footer>
        </div>`;
        document.body.appendChild(root); state.root = root; state.canvas = root.querySelector('[data-canvas]');
        state.controls = { tools: root.querySelector('[data-tools]'), selected: root.querySelector('[data-selected]'), summary: root.querySelector('[data-summary]'), status: root.querySelector('[data-status]'), undo: root.querySelector('[data-act="undo"]'), redo: root.querySelector('[data-act="redo"]') };
        TOOL_DEFS.forEach(([id, label, bn]) => { const button = document.createElement('button'); button.className = 'qmx-fsm-tool'; button.dataset.tool = id; button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<small>${esc(bn)}</small>`; state.controls.tools.appendChild(button); });
        root.addEventListener('click', onRootClick); root.addEventListener('change', onRootInput); root.addEventListener('input', onRootInput); state.canvas.addEventListener('pointerdown', onCanvasPointerDown); document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp); document.addEventListener('keydown', onKeydown);
    }

    function setStatus(message) { if (state.controls.status) state.controls.status.textContent = message; }
    function open(context = {}) {
        buildEditor(); state.context = context; state.document = context.initialSpec ? Diagram.normalizeSpec(context.initialSpec) : createDocument();
        if (state.document.mode !== 'finite-state-machine') state.document = createDocument();
        state.selectedId = null; state.activeTool = 'select'; state.interaction = null; state.connectionStart = null; state.history = []; state.historyIndex = -1;
        pushHistory(); syncDocumentControls(); setTool('select'); render(); state.root.hidden = false; document.body.dataset.qmxFsmOverflow = document.body.style.overflow || ''; document.body.style.overflow = 'hidden'; setStatus(context.initialSpec ? 'Existing Finite State Machine loaded.' : 'Choose an automata tool or preset.');
    }
    function close() { if (!state.root || state.root.hidden) return; state.root.hidden = true; document.body.style.overflow = document.body.dataset.qmxFsmOverflow || ''; delete document.body.dataset.qmxFsmOverflow; state.context?.textarea?.focus?.(); }
    function findTokenTextarea(token) { return Array.from(document.querySelectorAll('textarea')).find((textarea) => textarea.value.includes(token)) || null; }
    function openFromPreview(figure) {
        const payload = String(figure?.dataset.qmxDiagramPayload || ''); if (!payload) return false;
        let spec; try { spec = Diagram.decodePayload(payload); } catch (error) { return false; }
        if (spec.mode !== 'finite-state-machine') return false;
        const token = `[[qmx-diagram:${payload}]]`; const textarea = findTokenTextarea(token) || window.QmxDiagramLauncher?.getActiveTextarea?.(); let replaceRange = null;
        if (textarea) { const start = textarea.value.indexOf(token); if (start >= 0) replaceRange = { start, end: start + token.length }; }
        open({ tool: { id: 'finite-state-machine' }, textarea, initialSpec: spec, replaceRange, editMode: true }); return true;
    }
    function registerHandlers() {
        const launcher = window.QmxDiagramLauncher; if (!launcher?.registerToolHandler) return false; let registered = false;
        ['finite-state-machine', 'fsm', 'automata', 'state-machine', 'dfa', 'nfa'].forEach((id) => { try { launcher.registerToolHandler(id, open); registered = true; } catch (error) { /* Alias may already be registered. */ } }); return registered;
    }
    function onKeydown(event) {
        if (!state.root || state.root.hidden) return; const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
        if (event.key === 'Escape' && ['fsm-transition','fsm-loop'].includes(state.activeTool)) { setTool('select'); setStatus('Transition connection cancelled.'); event.preventDefault(); return; }
        if (event.key === 'Escape') { close(); event.preventDefault(); return; }
        if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) { event.preventDefault(); deleteSelected(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && !editing) { event.preventDefault(); duplicateSelected(); }
    }
    function init() { buildEditor(); if (!registerHandlers()) document.addEventListener('qmx:diagram-launcher-ready', registerHandlers, { once: true }); }

    window.QmxFiniteStateMachineEditor = Object.freeze({ version: '1.0.0', open, close, openFromPreview });
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})(window, document);
