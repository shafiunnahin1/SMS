(function (window, document) {
    'use strict';

    if (window.QmxDatabaseErEditor?.version) return;
    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX ERD] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['er-entity', 'Entity', 'এনটিটি'],
        ['er-weak-entity', 'Weak entity', 'দুর্বল এনটিটি'],
        ['er-relationship', 'Relationship', 'সম্পর্ক'],
        ['er-identifying-relationship', 'Identifying rel.', 'শনাক্তকারী সম্পর্ক'],
        ['er-attribute', 'Attribute', 'অ্যাট্রিবিউট'],
        ['er-key-attribute', 'Key attribute', 'কী অ্যাট্রিবিউট'],
        ['er-multivalued-attribute', 'Multivalued', 'বহুমান'],
        ['er-derived-attribute', 'Derived', 'উৎপন্ন'],
        ['er-connector', 'Smart connector', 'স্মার্ট সংযোগ'],
        ['er-table', 'Relational table', 'রিলেশন টেবিল'],
        ['text', 'Annotation', 'টীকা']
    ];
    const PORTS = ['n', 'e', 's', 'w'];
    const CONNECTABLE_TYPES = new Set(['er-entity', 'er-relationship', 'er-attribute', 'er-table']);

    const state = {
        root: null, canvas: null, svg: null, context: null, document: null,
        selectedId: null, activeTool: 'select', interaction: null, connectionStart: null,
        history: [], historyIndex: -1, controls: {}
    };

    function uid(prefix = 'er') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]); }
    function snap(value) { const step = Number(state.document?.gridSize || 20); return state.document?.snap ? Math.round(value / step) * step : value; }
    function selectedObject() { return state.document?.objects.find((object) => object.id === state.selectedId) || null; }
    function connectableObjects() { return state.document?.objects.filter((object) => CONNECTABLE_TYPES.has(object.type)) || []; }

    function createDocument() {
        return {
            version: 24,
            id: uid('database-er'),
            mode: 'database-er',
            title: 'Database ER / Relational Schema Diagram',
            width: 1180,
            height: 700,
            background: '#ffffff',
            gridSize: 20,
            erShowGrid: true,
            erShowCardinality: true,
            erShowAttributes: true,
            snap: true,
            objects: []
        };
    }

    function makeEntity(overrides = {}) {
        return {
            id: uid('er-entity'), type: 'er-entity', x: 280, y: 250, width: 220, height: 110,
            label: 'ENTITY', fields: ['id (PK)', 'name'], weak: false,
            fill: '#eff6ff', stroke: '#1d4ed8', lineWidth: 3,
            ...overrides
        };
    }
    function makeRelationship(overrides = {}) {
        return {
            id: uid('er-relationship'), type: 'er-relationship', x: 590, y: 300, width: 190, height: 110,
            label: 'RELATIONSHIP', identifying: false,
            fill: '#fff7ed', stroke: '#c2410c', lineWidth: 3,
            ...overrides
        };
    }
    function makeAttribute(overrides = {}) {
        return {
            id: uid('er-attribute'), type: 'er-attribute', x: 300, y: 100, width: 180, height: 74,
            label: 'attribute', key: false, multivalued: false, derived: false,
            fill: '#f8fafc', stroke: '#334155', lineWidth: 2.5,
            ...overrides
        };
    }
    function makeTable(overrides = {}) {
        return {
            id: uid('er-table'), type: 'er-table', x: 650, y: 100, width: 340, rowHeight: 34,
            label: 'RELATION', columns: ['id INT PK', 'name VARCHAR(100)', 'created_at DATETIME'],
            headerFill: '#dcfce7', fill: '#ffffff', stroke: '#166534', textColor: '#0f172a',
            ...overrides
        };
    }

    function defaultObject(type) {
        if (type === 'er-entity') return makeEntity();
        if (type === 'er-weak-entity') return makeEntity({ label: 'WEAK_ENTITY', weak: true, fill: '#fef2f2', stroke: '#b91c1c' });
        if (type === 'er-relationship') return makeRelationship();
        if (type === 'er-identifying-relationship') return makeRelationship({ label: 'IDENTIFIES', identifying: true, fill: '#fef2f2', stroke: '#b91c1c' });
        if (type === 'er-attribute') return makeAttribute();
        if (type === 'er-key-attribute') return makeAttribute({ label: 'primary_key', key: true, fill: '#fefce8', stroke: '#a16207' });
        if (type === 'er-multivalued-attribute') return makeAttribute({ label: 'phone', multivalued: true, fill: '#f0fdf4', stroke: '#15803d' });
        if (type === 'er-derived-attribute') return makeAttribute({ label: 'age', derived: true, fill: '#faf5ff', stroke: '#7e22ce' });
        if (type === 'er-table') return makeTable();
        return { id: uid('text'), type: 'text', x: 70, y: 70, text: 'Database model', color: '#0f172a', fontSize: 20, fontWeight: 'bold' };
    }

    function portPosition(object, key) {
        const x = Number(object.x || 0), y = Number(object.y || 0);
        let halfW = Number(object.width || 160) / 2;
        let halfH = Number(object.height || object.rowHeight * ((object.columns?.length || 0) + 1) || 80) / 2;
        if (object.type === 'er-table') {
            halfW = Number(object.width || 340) / 2;
            halfH = Number(object.rowHeight || 34) * ((object.columns?.length || 0) + 1) / 2;
        }
        if (key === 'n') return { x, y: y - halfH, key };
        if (key === 's') return { x, y: y + halfH, key };
        if (key === 'w') return { x: x - halfW, y, key };
        return { x: x + halfW, y, key: 'e' };
    }

    function nearestPort(object, point) {
        return PORTS.map((key) => portPosition(object, key)).sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
    }

    function addConnector(sourceObject, sourceKey, targetObject, targetKey, overrides = {}) {
        const connector = {
            id: uid('er-connector'), type: 'er-connector',
            sourceId: sourceObject.id, targetId: targetObject.id,
            sourcePort: sourceKey || 'e', targetPort: targetKey || 'w',
            label: '', sourceCardinality: '1', targetCardinality: 'N',
            sourceParticipation: 'partial', targetParticipation: 'partial',
            stroke: '#334155', lineWidth: 3, dashed: false, autoRoute: true,
            ...overrides
        };
        state.document.objects.push(connector);
        state.selectedId = connector.id;
        state.connectionStart = null;
        pushHistory(); render(); setStatus('Smart point-to-point ER connector created.');
    }

    function connectPort(objectId, portKey) {
        const object = state.document.objects.find((item) => item.id === objectId && CONNECTABLE_TYPES.has(item.type));
        if (!object) return;
        if (!state.connectionStart) {
            state.connectionStart = { objectId, portKey };
            setStatus(`Connection source selected: ${object.label || object.type}. Choose a destination point.`);
            render(); return;
        }
        const source = state.document.objects.find((item) => item.id === state.connectionStart.objectId && CONNECTABLE_TYPES.has(item.type));
        if (!source) { state.connectionStart = null; render(); return; }
        addConnector(source, state.connectionStart.portKey, object, portKey);
        state.activeTool = 'select'; updateToolButtons();
    }

    function addObject(type) {
        const object = defaultObject(type);
        const count = state.document.objects.length;
        if ('x' in object) object.x = snap(Number(object.x) + (count % 5) * 24);
        if ('y' in object) object.y = snap(Number(object.y) + (count % 4) * 24);
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
        state.selectedId = null; state.connectionStart = null; state.interaction = null;
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
        state.activeTool = tool; state.connectionStart = null; updateToolButtons();
        if (tool === 'er-connector') { setStatus('Smart connector: click a source connection point, then a destination point.'); render(); return; }
        if (tool !== 'select') { addObject(tool); state.activeTool = 'select'; updateToolButtons(); }
        else render();
    }

    function selectionMarkup() {
        if (!state.document) return '';
        const selected = selectedObject();
        let markup = '<g data-er-editor-overlay="1">';
        if (selected && CONNECTABLE_TYPES.has(selected.type)) {
            const boxW = Number(selected.width || 180), boxH = selected.type === 'er-table'
                ? Number(selected.rowHeight || 34) * ((selected.columns?.length || 0) + 1)
                : Number(selected.height || 80);
            markup += `<rect x="${selected.x - boxW / 2 - 8}" y="${selected.y - boxH / 2 - 8}" width="${boxW + 16}" height="${boxH + 16}" rx="8" fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="7 5"/>`;
        } else if (selected?.type === 'text') {
            markup += `<circle cx="${selected.x}" cy="${selected.y}" r="8" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>`;
        }
        if (state.activeTool === 'er-connector' || (selected && CONNECTABLE_TYPES.has(selected.type))) {
            connectableObjects().forEach((object) => PORTS.forEach((key) => {
                const point = portPosition(object, key);
                const started = state.connectionStart?.objectId === object.id && state.connectionStart?.portKey === key;
                markup += `<circle data-er-port-object="${esc(object.id)}" data-er-port-key="${key}" cx="${point.x}" cy="${point.y}" r="${started ? 9 : 7}" fill="${started ? '#16a34a' : '#2563eb'}" stroke="#ffffff" stroke-width="2" style="cursor:crosshair"/>`;
            }));
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
        syncSelectedControls(); updateSummary();
    }

    function field(label, key, value, type = 'text', attrs = '') {
        return `<div class="qmx-er-field"><label>${esc(label)}</label><input type="${type}" data-object="${esc(key)}" value="${esc(value)}" ${attrs}></div>`;
    }
    function check(label, key, checked) { return `<label class="qmx-er-check"><input type="checkbox" data-object="${esc(key)}" ${checked ? 'checked' : ''}> ${esc(label)}</label>`; }
    function textarea(label, key, value) { return `<div class="qmx-er-field"><label>${esc(label)}</label><textarea data-object="${esc(key)}">${esc(value)}</textarea></div>`; }
    function selectField(label, key, value, values) {
        return `<div class="qmx-er-field"><label>${esc(label)}</label><select data-object="${esc(key)}">${values.map((item) => `<option value="${esc(item)}" ${item === value ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select></div>`;
    }

    function syncSelectedControls() {
        const panel = state.controls.selected;
        if (!panel) return;
        const object = selectedObject();
        if (!object) { panel.innerHTML = '<div class="qmx-er-empty">Select an entity, relationship, attribute, connector, table or annotation.</div>'; return; }
        let html = `<div class="qmx-er-type">${esc(object.type)}</div>`;
        if (object.type === 'er-entity') {
            html += field('Entity name', 'label', object.label);
            html += textarea('Fields — one per line', 'fieldsText', (object.fields || []).join('\n'));
            html += `<div class="qmx-er-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Width', 'width', object.width, 'number', 'min="120" max="900"')}${field('Height', 'height', object.height, 'number', 'min="60" max="700"')}</div>`;
            html += check('Weak entity (double border)', 'weak', object.weak);
            html += `<div class="qmx-er-grid2">${field('Fill', 'fill', object.fill, 'color')}${field('Stroke', 'stroke', object.stroke, 'color')}</div>`;
        } else if (object.type === 'er-relationship') {
            html += field('Relationship name', 'label', object.label);
            html += `<div class="qmx-er-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Width', 'width', object.width, 'number', 'min="100" max="700"')}${field('Height', 'height', object.height, 'number', 'min="60" max="500"')}</div>`;
            html += check('Identifying relationship', 'identifying', object.identifying);
            html += `<div class="qmx-er-grid2">${field('Fill', 'fill', object.fill, 'color')}${field('Stroke', 'stroke', object.stroke, 'color')}</div>`;
        } else if (object.type === 'er-attribute') {
            html += field('Attribute name', 'label', object.label);
            html += `<div class="qmx-er-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Width', 'width', object.width, 'number', 'min="80" max="600"')}${field('Height', 'height', object.height, 'number', 'min="40" max="300"')}</div>`;
            html += check('Key attribute (underlined)', 'key', object.key);
            html += check('Multivalued (double ellipse)', 'multivalued', object.multivalued);
            html += check('Derived (dashed ellipse)', 'derived', object.derived);
            html += `<div class="qmx-er-grid2">${field('Fill', 'fill', object.fill, 'color')}${field('Stroke', 'stroke', object.stroke, 'color')}</div>`;
        } else if (object.type === 'er-connector') {
            const targets = connectableObjects();
            const options = (selectedId) => targets.map((item) => `<option value="${esc(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${esc(item.label || item.type)}</option>`).join('');
            const portOptions = (selectedKey) => PORTS.map((key) => `<option value="${key}" ${key === selectedKey ? 'selected' : ''}>${key.toUpperCase()}</option>`).join('');
            html += field('Relationship/role label', 'label', object.label || '');
            html += `<div class="qmx-er-field"><label>Source object</label><select data-object="sourceId">${options(object.sourceId)}</select></div><div class="qmx-er-field"><label>Target object</label><select data-object="targetId">${options(object.targetId)}</select></div>`;
            html += `<div class="qmx-er-grid2"><div class="qmx-er-field"><label>Source point</label><select data-object="sourcePort">${portOptions(object.sourcePort)}</select></div><div class="qmx-er-field"><label>Target point</label><select data-object="targetPort">${portOptions(object.targetPort)}</select></div></div>`;
            html += `<div class="qmx-er-grid2">${selectField('Source cardinality', 'sourceCardinality', object.sourceCardinality, ['1','N','M','0..1','1..1','0..*','1..*'])}${selectField('Target cardinality', 'targetCardinality', object.targetCardinality, ['1','N','M','0..1','1..1','0..*','1..*'])}</div>`;
            html += `<div class="qmx-er-grid2">${selectField('Source participation', 'sourceParticipation', object.sourceParticipation, ['partial','total'])}${selectField('Target participation', 'targetParticipation', object.targetParticipation, ['partial','total'])}</div>`;
            html += `${check('Dashed line', 'dashed', object.dashed)}${check('Automatic orthogonal route', 'autoRoute', object.autoRoute)}`;
            html += `<div class="qmx-er-grid2">${field('Line width', 'lineWidth', object.lineWidth, 'number', 'min="1" max="20" step="0.5"')}${field('Stroke', 'stroke', object.stroke, 'color')}</div>`;
        } else if (object.type === 'er-table') {
            html += field('Relation name', 'label', object.label);
            html += textarea('Columns — one per line', 'columnsText', (object.columns || []).join('\n'));
            html += `<div class="qmx-er-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Width', 'width', object.width, 'number', 'min="180" max="1500"')}${field('Row height', 'rowHeight', object.rowHeight, 'number', 'min="22" max="100"')}</div>`;
            html += `<div class="qmx-er-grid2">${field('Header fill', 'headerFill', object.headerFill, 'color')}${field('Stroke', 'stroke', object.stroke, 'color')}</div>`;
        } else {
            html += textarea('Text', 'text', object.text);
            html += `<div class="qmx-er-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Font size', 'fontSize', object.fontSize, 'number', 'min="8" max="120"')}${field('Color', 'color', object.color, 'color')}</div>`;
            html += check('Bold', 'fontWeight', object.fontWeight === 'bold');
        }
        panel.innerHTML = html;
    }

    function updateSummary() {
        const summary = state.controls.summary;
        if (!summary) return;
        const counts = {};
        state.document.objects.forEach((object) => { counts[object.type] = (counts[object.type] || 0) + 1; });
        summary.textContent = `${state.document.objects.length} object(s) · ${counts['er-entity'] || 0} entity · ${counts['er-relationship'] || 0} relationship · ${counts['er-attribute'] || 0} attribute · ${counts['er-connector'] || 0} connector · ${counts['er-table'] || 0} table`;
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
            state.document[docKey] = value; render(); pushHistory(); return;
        }
        const key = event.target.dataset.object;
        if (!key) return;
        const object = selectedObject(); if (!object) return;
        let value = event.target.type === 'checkbox' ? event.target.checked : (event.target.type === 'number' ? Number(event.target.value) : event.target.value);
        if (key === 'fieldsText') object.fields = String(value).split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 24);
        else if (key === 'columnsText') object.columns = String(value).split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 40);
        else if (key === 'fontWeight') object.fontWeight = value ? 'bold' : 'normal';
        else object[key] = value;
        render(); pushHistory(); setStatus('ER diagram object updated.');
    }

    function svgPoint(event) {
        if (!state.svg) return { x: 0, y: 0 };
        const rect = state.svg.getBoundingClientRect();
        return { x: (event.clientX - rect.left) * state.document.width / rect.width, y: (event.clientY - rect.top) * state.document.height / rect.height };
    }

    function onCanvasPointerDown(event) {
        if (!state.svg?.contains(event.target)) return;
        const port = event.target.closest?.('[data-er-port-object]');
        if (port) return;
        const group = event.target.closest?.('[data-qmx-object]');
        if (!group) { if (state.activeTool === 'select') { state.selectedId = null; render(); } return; }
        const object = state.document.objects.find((item) => item.id === group.getAttribute('data-qmx-object'));
        if (!object) return;
        const point = svgPoint(event);
        if (state.activeTool === 'er-connector' && CONNECTABLE_TYPES.has(object.type)) {
            const nearest = nearestPort(object, point); connectPort(object.id, nearest.key); event.preventDefault(); return;
        }
        state.selectedId = object.id;
        if (state.activeTool !== 'select') { render(); return; }
        if (CONNECTABLE_TYPES.has(object.type) || object.type === 'text') {
            state.interaction = { type: 'move', objectId: object.id, start: point, x: Number(object.x), y: Number(object.y) };
            event.preventDefault();
        }
        render();
    }
    function onPointerMove(event) {
        if (!state.interaction || !state.document) return;
        const object = state.document.objects.find((item) => item.id === state.interaction.objectId); if (!object) return;
        const point = svgPoint(event);
        object.x = snap(state.interaction.x + point.x - state.interaction.start.x);
        object.y = snap(state.interaction.y + point.y - state.interaction.start.y);
        render();
    }
    function onPointerUp() {
        if (!state.interaction) return;
        state.interaction = null; pushHistory(); setStatus('Object moved; attached connectors followed automatically.');
    }

    function onRootClick(event) {
        const port = event.target.closest?.('[data-er-port-object]');
        if (port) {
            if (state.activeTool !== 'er-connector') { state.activeTool = 'er-connector'; updateToolButtons(); }
            connectPort(port.dataset.erPortObject, port.dataset.erPortKey); return;
        }
        const tool = event.target.closest?.('[data-tool]'); if (tool) { setTool(tool.dataset.tool); return; }
        const preset = event.target.closest?.('[data-preset]'); if (preset) { applyPreset(preset.dataset.preset); return; }
        const action = event.target.closest?.('[data-act]')?.dataset.act; if (!action) return;
        ({ new: newDocument, undo, redo, duplicate: duplicateSelected, delete: deleteSelected, close,
            'export-svg': exportSvg, 'export-png': exportPng, insert: insertIntoQuestion }[action]?.());
    }

    function connector(source, target, sourceCardinality = '1', targetCardinality = 'N', options = {}) {
        return {
            id: uid('er-connector'), type: 'er-connector', sourceId: source.id, targetId: target.id,
            sourcePort: options.sourcePort || (target.x >= source.x ? 'e' : 'w'),
            targetPort: options.targetPort || (target.x >= source.x ? 'w' : 'e'),
            label: options.label || '', sourceCardinality, targetCardinality,
            sourceParticipation: options.sourceParticipation || 'partial', targetParticipation: options.targetParticipation || 'partial',
            stroke: options.stroke || '#334155', lineWidth: options.lineWidth || 3, dashed: Boolean(options.dashed), autoRoute: options.autoRoute !== false
        };
    }
    function note(x, y, text, options = {}) { return { id: uid('text'), type: 'text', x, y, text, color: options.color || '#0f172a', fontSize: options.fontSize || 20, fontWeight: options.bold === false ? 'normal' : 'bold' }; }

    function applyPreset(type) {
        if (type === 'clear') { state.document.objects = []; state.selectedId = null; pushHistory(); render(); setStatus('ER canvas cleared.'); return; }
        const objects = [];
        if (type === 'student-course') {
            const student = makeEntity({ x: 230, y: 340, label: 'STUDENT', fields: ['student_id (PK)', 'name', 'email'] });
            const enroll = makeRelationship({ x: 590, y: 340, label: 'ENROLLS' });
            const course = makeEntity({ x: 950, y: 340, label: 'COURSE', fields: ['course_id (PK)', 'title', 'credits'] });
            const sid = makeAttribute({ x: 170, y: 120, label: 'student_id', key: true });
            const grade = makeAttribute({ x: 590, y: 120, label: 'grade' });
            const cid = makeAttribute({ x: 1010, y: 120, label: 'course_id', key: true });
            objects.push(student, enroll, course, sid, grade, cid,
                connector(student, enroll, '1', 'N'), connector(enroll, course, 'N', '1'),
                connector(sid, student, '1', '1', { sourcePort: 's', targetPort: 'n' }), connector(grade, enroll, '1', '1', { sourcePort: 's', targetPort: 'n' }), connector(cid, course, '1', '1', { sourcePort: 's', targetPort: 'n' }),
                note(420, 60, 'Student–Course Enrollment ER Model'));
        } else if (type === 'library') {
            const member = makeEntity({ x: 190, y: 350, label: 'MEMBER', fields: ['member_id (PK)', 'name', 'phone'] });
            const borrow = makeRelationship({ x: 500, y: 350, label: 'BORROWS' });
            const copy = makeEntity({ x: 810, y: 350, label: 'BOOK_COPY', fields: ['copy_id (PK)', 'status', 'shelf_no'] });
            const book = makeEntity({ x: 1020, y: 120, label: 'BOOK', fields: ['isbn (PK)', 'title', 'author'] });
            objects.push(member, borrow, copy, book,
                connector(member, borrow, '1', 'N'), connector(borrow, copy, 'N', '1'), connector(book, copy, '1', 'N', { sourcePort: 's', targetPort: 'n', label: 'has copies' }),
                note(420, 65, 'Library Management ER Diagram'));
        } else if (type === 'ecommerce') {
            const customer = makeEntity({ x: 180, y: 260, label: 'CUSTOMER', fields: ['customer_id (PK)', 'name', 'email'] });
            const order = makeEntity({ x: 570, y: 260, label: 'ORDER', fields: ['order_id (PK)', 'order_date', 'total'] });
            const item = makeEntity({ x: 950, y: 260, label: 'PRODUCT', fields: ['product_id (PK)', 'name', 'price'] });
            const places = makeRelationship({ x: 375, y: 480, label: 'PLACES' });
            const contains = makeRelationship({ x: 760, y: 480, label: 'CONTAINS' });
            objects.push(customer, order, item, places, contains,
                connector(customer, places, '1', 'N', { sourcePort: 's', targetPort: 'w' }), connector(places, order, 'N', '1', { sourcePort: 'e', targetPort: 's' }),
                connector(order, contains, '1', 'N', { sourcePort: 's', targetPort: 'w' }), connector(contains, item, 'N', 'N', { sourcePort: 'e', targetPort: 's' }),
                note(420, 65, 'E-commerce ER Model'));
        } else if (type === 'hospital') {
            const patient = makeEntity({ x: 180, y: 320, label: 'PATIENT', fields: ['patient_id (PK)', 'name', 'dob'] });
            const appointment = makeEntity({ x: 580, y: 320, label: 'APPOINTMENT', fields: ['appointment_id (PK)', 'date_time', 'status'] });
            const doctor = makeEntity({ x: 980, y: 320, label: 'DOCTOR', fields: ['doctor_id (PK)', 'name', 'specialty'] });
            objects.push(patient, appointment, doctor,
                connector(patient, appointment, '1', 'N', { label: 'books' }), connector(appointment, doctor, 'N', '1', { label: 'assigned to' }),
                note(430, 75, 'Hospital Appointment Data Model'));
        } else if (type === 'weak-entity') {
            const employee = makeEntity({ x: 250, y: 330, label: 'EMPLOYEE', fields: ['employee_id (PK)', 'name'] });
            const identifies = makeRelationship({ x: 590, y: 330, label: 'HAS_DEPENDENT', identifying: true, fill: '#fef2f2', stroke: '#b91c1c' });
            const dependent = makeEntity({ x: 940, y: 330, label: 'DEPENDENT', fields: ['dependent_name (partial key)', 'relationship'], weak: true, fill: '#fef2f2', stroke: '#b91c1c' });
            objects.push(employee, identifies, dependent,
                connector(employee, identifies, '1', 'N', { targetParticipation: 'total' }), connector(identifies, dependent, '1', 'N', { targetParticipation: 'total' }),
                note(430, 80, 'Weak Entity and Identifying Relationship'));
        } else if (type === 'attributes') {
            const person = makeEntity({ x: 590, y: 390, label: 'PERSON', fields: [] });
            const id = makeAttribute({ x: 250, y: 130, label: 'person_id', key: true });
            const name = makeAttribute({ x: 460, y: 120, label: 'name' });
            const phone = makeAttribute({ x: 720, y: 120, label: 'phone', multivalued: true });
            const age = makeAttribute({ x: 950, y: 130, label: 'age', derived: true });
            objects.push(person, id, name, phone, age,
                connector(id, person, '1', '1', { sourcePort: 's', targetPort: 'n' }), connector(name, person, '1', '1', { sourcePort: 's', targetPort: 'n' }), connector(phone, person, '1', 'N', { sourcePort: 's', targetPort: 'n' }), connector(age, person, '1', '1', { sourcePort: 's', targetPort: 'n', dashed: true }),
                note(390, 55, 'Key, Multivalued and Derived Attributes'));
        } else if (type === 'relational-schema') {
            objects.push(
                makeTable({ x: 250, y: 250, label: 'STUDENT', columns: ['student_id INT PK', 'name VARCHAR(100)', 'email VARCHAR(120) UNIQUE'] }),
                makeTable({ x: 590, y: 250, label: 'ENROLLMENT', columns: ['student_id INT PK, FK', 'course_id INT PK, FK', 'grade CHAR(2)'] }),
                makeTable({ x: 930, y: 250, label: 'COURSE', columns: ['course_id INT PK', 'title VARCHAR(150)', 'credits INT'] }),
                note(425, 55, 'Relational Schema with Primary and Foreign Keys')
            );
            objects.push(connector(objects[0], objects[1], '1', 'N', { label: 'FK student_id' }), connector(objects[2], objects[1], '1', 'N', { label: 'FK course_id', sourcePort: 'w', targetPort: 'e' }));
        } else if (type === 'cardinality') {
            const a = makeEntity({ x: 180, y: 180, label: 'ONE', fields: ['id (PK)'] });
            const b = makeEntity({ x: 560, y: 180, label: 'OPTIONAL_ONE', fields: ['id (PK)'] });
            const c = makeEntity({ x: 180, y: 470, label: 'PARENT', fields: ['id (PK)'] });
            const d = makeEntity({ x: 560, y: 470, label: 'CHILD', fields: ['id (PK)', 'parent_id (FK)'] });
            const e = makeEntity({ x: 950, y: 330, label: 'MANY', fields: ['id (PK)'] });
            objects.push(a,b,c,d,e, connector(a,b,'1','0..1'), connector(c,d,'1','1..*'), connector(d,e,'0..*','N'), note(720,80,'Cardinality and Participation Examples'));
        }
        state.document.objects = objects; state.selectedId = objects.find((object) => object.type !== 'er-connector')?.id || null;
        state.connectionStart = null; pushHistory(); syncDocumentControls(); render(); setStatus(`${type} preset inserted.`);
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        const deletedId = state.selectedId;
        state.document.objects = state.document.objects.filter((object) => object.id !== deletedId && object.sourceId !== deletedId && object.targetId !== deletedId);
        state.selectedId = null; state.connectionStart = null; pushHistory(); render(); setStatus('Object and attached connectors deleted.');
    }
    function duplicateSelected() {
        const object = selectedObject(); if (!object) return;
        const copy = clone(object); copy.id = uid(object.type);
        if (copy.type === 'er-connector') { copy.label = copy.label ? `${copy.label}′` : ''; copy.dashed = !copy.dashed; }
        else { copy.x = Number(copy.x || 0) + 30; copy.y = Number(copy.y || 0) + 30; if (copy.label) copy.label = `${copy.label}_COPY`; }
        state.document.objects.push(copy); state.selectedId = copy.id; pushHistory(); render(); setStatus('Object duplicated.');
    }
    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Database ER document?')) return;
        state.document = createDocument(); state.selectedId = null; state.connectionStart = null; state.history = []; state.historyIndex = -1;
        pushHistory(); syncDocumentControls(); setTool('select'); render(); setStatus('New Database ER document.');
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
        setStatus('Database ER diagram inserted. Save the question to persist it.'); window.setTimeout(close, 220);
    }

    function safeFilename(value) { return String(value || 'database-er').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'database-er'; }
    function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    function exportSvg() { downloadBlob(new Blob([Diagram.svgMarkup(state.document)], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(state.document.title)}.svg`); setStatus('SVG exported.'); }
    function exportPng() {
        const svg = Diagram.svgMarkup(state.document); const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })); const image = new Image();
        image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = state.document.width; canvas.height = state.document.height; canvas.getContext('2d').drawImage(image, 0, 0); URL.revokeObjectURL(url); canvas.toBlob((blob) => blob && downloadBlob(blob, `${safeFilename(state.document.title)}.png`), 'image/png'); setStatus('PNG exported.'); };
        image.onerror = () => { URL.revokeObjectURL(url); setStatus('PNG export failed.'); }; image.src = url;
    }

    function addStyles() {
        if (document.getElementById('qmx-er-editor-styles')) return;
        const style = document.createElement('style'); style.id = 'qmx-er-editor-styles';
        style.textContent = `.qmx-er-editor[hidden]{display:none!important}.qmx-er-editor{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);padding:14px;display:flex;align-items:center;justify-content:center;font:14px/1.35 "Segoe UI",Arial,sans-serif;color:#0f172a}.qmx-er-shell{width:min(1580px,calc(100vw - 28px));height:min(960px,calc(100vh - 28px));background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.35);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}.qmx-er-header,.qmx-er-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #dbe4ef}.qmx-er-footer{border-top:1px solid #dbe4ef;border-bottom:0}.qmx-er-title{font-weight:800;font-size:17px}.qmx-er-subtitle{font-size:12px;color:#64748b}.qmx-er-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.qmx-er-btn,.qmx-er-tool,.qmx-er-preset{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer}.qmx-er-btn:hover,.qmx-er-tool:hover,.qmx-er-preset:hover{border-color:#2563eb}.qmx-er-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}.qmx-er-btn.danger{color:#dc2626}.qmx-er-btn:disabled{opacity:.45;cursor:not-allowed}.qmx-er-main{min-height:0;display:grid;grid-template-columns:265px minmax(0,1fr) 340px;gap:10px;padding:10px;background:#e7eef7}.qmx-er-panel{background:#fff;border:1px solid #d7e0ec;border-radius:12px;padding:10px;overflow:auto;min-height:0}.qmx-er-tools,.qmx-er-presets{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.qmx-er-tool{padding:8px 6px;font-size:12px}.qmx-er-tool small{display:block;color:#64748b;font-weight:500;margin-top:2px}.qmx-er-tool.active{background:#dbeafe;border-color:#2563eb;color:#1d4ed8}.qmx-er-preset{font-size:12px;padding:8px 6px}.qmx-er-section{font-weight:800;margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0}.qmx-er-canvas-wrap{min-width:0;min-height:0;background:#cbd5e1;border-radius:12px;padding:10px;overflow:auto;display:flex;align-items:center;justify-content:center}.qmx-er-canvas{width:100%;min-width:560px}.qmx-er-canvas svg{display:block;width:100%;height:auto;max-height:770px;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none}.qmx-er-canvas [data-qmx-object]{cursor:move}.qmx-er-field{margin:7px 0}.qmx-er-field label{display:block;font-weight:700;font-size:12px;margin-bottom:4px}.qmx-er-field input,.qmx-er-field select,.qmx-er-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:inherit}.qmx-er-field textarea{min-height:90px;resize:vertical}.qmx-er-grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-er-check{display:block;margin:8px 0}.qmx-er-type,.qmx-er-summary{margin-top:8px;padding:9px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px}.qmx-er-empty{color:#64748b;text-align:center;padding:20px 4px}.qmx-er-status{color:#64748b;min-height:18px}@media(max-width:1000px){.qmx-er-editor{padding:0}.qmx-er-shell{width:100vw;height:100vh;border-radius:0}.qmx-er-main{grid-template-columns:190px minmax(0,1fr)}.qmx-er-main>.qmx-er-panel:last-child{grid-column:1/-1;max-height:350px}.qmx-er-title{font-size:15px}}`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;
        addStyles();
        const root = document.createElement('div'); root.className = 'qmx-er-editor'; root.hidden = true;
        root.innerHTML = `<div class="qmx-er-shell" role="dialog" aria-modal="true" aria-label="Database ER editor">
          <header class="qmx-er-header"><div><div class="qmx-er-title">Database ER / Relational Schema Diagram</div><div class="qmx-er-subtitle">Entities, relationships, attributes, cardinality and smart point-to-point connectors</div></div><div class="qmx-er-actions"><button class="qmx-er-btn" data-act="new">New</button><button class="qmx-er-btn" data-act="undo">Undo</button><button class="qmx-er-btn" data-act="redo">Redo</button><button class="qmx-er-btn" data-act="duplicate">Duplicate</button><button class="qmx-er-btn danger" data-act="delete">Delete</button><button class="qmx-er-btn" data-act="close">×</button></div></header>
          <main class="qmx-er-main">
            <aside class="qmx-er-panel"><strong>ER modelling tools</strong><div class="qmx-er-tools" data-tools></div><div class="qmx-er-section">Database presets</div><div class="qmx-er-presets"><button class="qmx-er-preset" data-preset="student-course">Student–Course</button><button class="qmx-er-preset" data-preset="library">Library</button><button class="qmx-er-preset" data-preset="ecommerce">E-commerce</button><button class="qmx-er-preset" data-preset="hospital">Hospital</button><button class="qmx-er-preset" data-preset="weak-entity">Weak entity</button><button class="qmx-er-preset" data-preset="attributes">Attribute types</button><button class="qmx-er-preset" data-preset="relational-schema">Relational schema</button><button class="qmx-er-preset" data-preset="cardinality">Cardinality</button><button class="qmx-er-preset" data-preset="clear">Clear objects</button></div><p class="qmx-er-subtitle">Use Smart connector, then click a source port and a destination port. Connectors remain attached when objects move.</p></aside>
            <section class="qmx-er-canvas-wrap"><div class="qmx-er-canvas" data-canvas></div></section>
            <aside class="qmx-er-panel"><strong>Document</strong><div class="qmx-er-field"><label>Title</label><input data-doc="title"></div><div class="qmx-er-grid2"><div class="qmx-er-field"><label>Width</label><input type="number" min="480" max="2400" data-doc="width"></div><div class="qmx-er-field"><label>Height</label><input type="number" min="300" max="1800" data-doc="height"></div><div class="qmx-er-field"><label>Grid size</label><input type="number" min="5" max="100" data-doc="gridSize"></div><div class="qmx-er-field"><label>Background</label><input type="color" data-doc="background"></div></div><label class="qmx-er-check"><input type="checkbox" data-doc="erShowGrid"> Show grid</label><label class="qmx-er-check"><input type="checkbox" data-doc="erShowCardinality"> Show cardinality</label><label class="qmx-er-check"><input type="checkbox" data-doc="erShowAttributes"> Show entity fields</label><label class="qmx-er-check"><input type="checkbox" data-doc="snap"> Snap to grid</label><hr><strong>Selected object</strong><div data-selected></div><div class="qmx-er-summary" data-summary></div></aside>
          </main>
          <footer class="qmx-er-footer"><div class="qmx-er-status" data-status></div><div class="qmx-er-actions"><button class="qmx-er-btn" data-act="export-svg">Export SVG</button><button class="qmx-er-btn" data-act="export-png">Export PNG</button><button class="qmx-er-btn primary" data-act="insert">Insert into question</button></div></footer>
        </div>`;
        document.body.appendChild(root); state.root = root; state.canvas = root.querySelector('[data-canvas]');
        state.controls = { tools: root.querySelector('[data-tools]'), selected: root.querySelector('[data-selected]'), summary: root.querySelector('[data-summary]'), status: root.querySelector('[data-status]'), undo: root.querySelector('[data-act="undo"]'), redo: root.querySelector('[data-act="redo"]') };
        TOOL_DEFS.forEach(([id, label, bn]) => { const button = document.createElement('button'); button.className = 'qmx-er-tool'; button.dataset.tool = id; button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<small>${esc(bn)}</small>`; state.controls.tools.appendChild(button); });
        root.addEventListener('click', onRootClick); root.addEventListener('change', onRootInput); root.addEventListener('input', onRootInput); state.canvas.addEventListener('pointerdown', onCanvasPointerDown); document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp); document.addEventListener('keydown', onKeydown);
    }

    function setStatus(message) { if (state.controls.status) state.controls.status.textContent = message; }
    function open(context = {}) {
        buildEditor(); state.context = context; state.document = context.initialSpec ? Diagram.normalizeSpec(context.initialSpec) : createDocument();
        if (state.document.mode !== 'database-er') state.document = createDocument();
        state.selectedId = null; state.activeTool = 'select'; state.interaction = null; state.connectionStart = null; state.history = []; state.historyIndex = -1;
        pushHistory(); syncDocumentControls(); setTool('select'); render(); state.root.hidden = false; document.body.dataset.qmxErOverflow = document.body.style.overflow || ''; document.body.style.overflow = 'hidden'; setStatus(context.initialSpec ? 'Existing Database ER diagram loaded.' : 'Choose an ER tool or preset.');
    }
    function close() { if (!state.root || state.root.hidden) return; state.root.hidden = true; document.body.style.overflow = document.body.dataset.qmxErOverflow || ''; delete document.body.dataset.qmxErOverflow; state.context?.textarea?.focus?.(); }
    function findTokenTextarea(token) { return Array.from(document.querySelectorAll('textarea')).find((textarea) => textarea.value.includes(token)) || null; }
    function openFromPreview(figure) {
        const payload = String(figure?.dataset.qmxDiagramPayload || ''); if (!payload) return false;
        let spec; try { spec = Diagram.decodePayload(payload); } catch (error) { return false; }
        if (spec.mode !== 'database-er') return false;
        const token = `[[qmx-diagram:${payload}]]`; const textarea = findTokenTextarea(token) || window.QmxDiagramLauncher?.getActiveTextarea?.(); let replaceRange = null;
        if (textarea) { const start = textarea.value.indexOf(token); if (start >= 0) replaceRange = { start, end: start + token.length }; }
        open({ tool: { id: 'database-er' }, textarea, initialSpec: spec, replaceRange, editMode: true }); return true;
    }
    function registerHandlers() {
        const launcher = window.QmxDiagramLauncher; if (!launcher?.registerToolHandler) return false; let registered = false;
        ['database-er', 'erd', 'entity-relationship', 'database-schema', 'relational-schema'].forEach((id) => { try { launcher.registerToolHandler(id, open); registered = true; } catch (error) { /* Alias may already be registered. */ } }); return registered;
    }
    function onKeydown(event) {
        if (!state.root || state.root.hidden) return; const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
        if (event.key === 'Escape' && state.activeTool === 'er-connector') { setTool('select'); setStatus('Connector creation cancelled.'); event.preventDefault(); return; }
        if (event.key === 'Escape') { close(); event.preventDefault(); return; }
        if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) { event.preventDefault(); deleteSelected(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && !editing) { event.preventDefault(); duplicateSelected(); }
    }
    function init() { buildEditor(); if (!registerHandlers()) document.addEventListener('qmx:diagram-launcher-ready', registerHandlers, { once: true }); }

    window.QmxDatabaseErEditor = Object.freeze({ version: '1.0.0', open, close, openFromPreview });
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})(window, document);
