(function (window, document) {
    'use strict';

    if (window.QmxTreeDiagramEditor?.version) return;
    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Tree Diagram] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['root', 'Root node', 'মূল নোড'],
        ['child', 'Child node', 'শাখা নোড'],
        ['leaf', 'Leaf node', 'পাতা নোড'],
        ['decision', 'Decision node', 'সিদ্ধান্ত'],
        ['edge', 'Connector', 'সংযোগ'],
        ['text', 'Text', 'লেখা']
    ];

    const state = {
        root: null,
        canvas: null,
        svg: null,
        context: null,
        document: null,
        selectedId: null,
        activeTool: 'select',
        edgeStartId: null,
        interaction: null,
        history: [],
        historyIndex: -1,
        controls: {}
    };

    function uid(prefix = 'tree') {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[char]);
    }
    function clamp(value, min, max, fallback = min) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
    }
    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
    }
    function selectedNode() {
        const object = selectedObject();
        return object?.type === 'tree-node' ? object : null;
    }
    function createDocument() {
        return {
            version: 16,
            id: uid('tree-diagram'),
            mode: 'tree-diagram',
            title: 'Tree Diagram',
            width: 1000,
            height: 600,
            background: '#ffffff',
            gridSize: 20,
            treeOrientation: 'vertical',
            treeShowGrid: false,
            treeShowEdgeLabels: true,
            treeShowProbabilities: true,
            treeLevelGap: 135,
            treeSiblingGap: 36,
            snap: true,
            objects: []
        };
    }
    function nodeObject(x, y, options = {}) {
        const kind = options.kind || 'branch';
        const defaults = {
            root: { label: 'Root', shape: 'rounded', fill: '#dbeafe', stroke: '#2563eb' },
            branch: { label: 'Branch', shape: 'rounded', fill: '#f8fafc', stroke: '#475569' },
            leaf: { label: 'Leaf', shape: 'circle', fill: '#dcfce7', stroke: '#16a34a' },
            decision: { label: 'Decision', shape: 'diamond', fill: '#fef3c7', stroke: '#d97706' }
        }[kind] || {};
        return {
            id: uid('tree-node'),
            type: 'tree-node',
            kind,
            x: clamp(x, 0, state.document?.width || 1000, 500),
            y: clamp(y, 0, state.document?.height || 600, 100),
            width: kind === 'leaf' ? 92 : 150,
            height: kind === 'leaf' ? 70 : 72,
            shape: defaults.shape || 'rounded',
            label: options.label || defaults.label || 'Node',
            subtitle: options.subtitle || '',
            fill: options.fill || defaults.fill || '#ffffff',
            stroke: options.stroke || defaults.stroke || '#334155',
            textColor: options.textColor || '#0f172a',
            strokeWidth: 2.5,
            fontSize: 19
        };
    }
    function edgeObject(from, to, options = {}) {
        return {
            id: uid('tree-edge'),
            type: 'tree-edge',
            from,
            to,
            label: String(options.label || ''),
            probability: String(options.probability || ''),
            color: options.color || '#475569',
            strokeWidth: clamp(options.strokeWidth, 1, 12, 2.5),
            dash: Boolean(options.dash),
            arrow: Boolean(options.arrow)
        };
    }
    function textObject(x, y, text = 'Tree note') {
        return {
            id: uid('tree-text'),
            type: 'text',
            x,
            y,
            text,
            color: '#0f172a',
            fontSize: 22,
            fontWeight: 'bold'
        };
    }
    function objectsOf(type) { return state.document.objects.filter((object) => object.type === type); }
    function nodeById(id) { return state.document.objects.find((object) => object.type === 'tree-node' && object.id === id) || null; }

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
        state.edgeStartId = null;
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

    function localPoint(event) {
        const svg = state.svg;
        if (!svg) return { x: 0, y: 0 };
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const matrix = svg.getScreenCTM();
        return matrix ? point.matrixTransform(matrix.inverse()) : point;
    }
    function snapPoint(point) {
        if (!state.document.snap) return point;
        const step = clamp(state.document.gridSize, 5, 100, 20);
        return {
            x: Math.round(point.x / step) * step,
            y: Math.round(point.y / step) * step
        };
    }
    function clampNodePosition(node) {
        node.x = clamp(node.x, node.width / 2 + 8, state.document.width - node.width / 2 - 8, state.document.width / 2);
        node.y = clamp(node.y, node.height / 2 + 8, state.document.height - node.height / 2 - 8, state.document.height / 2);
    }

    function addNode(kind, point, connectToSelected = false) {
        const node = nodeObject(point.x, point.y, { kind });
        state.document.objects.push(node);
        if (connectToSelected) {
            const parent = selectedNode();
            if (parent) state.document.objects.push(edgeObject(parent.id, node.id));
        }
        state.selectedId = node.id;
        pushHistory();
        render();
        setStatus(`${kind} node added.`);
    }
    function addEdge(from, to, options = {}) {
        if (!from || !to || from === to) return false;
        const duplicate = objectsOf('tree-edge').some((edge) => edge.from === from && edge.to === to);
        if (duplicate) {
            setStatus('Those nodes are already connected.');
            return false;
        }
        const edge = edgeObject(from, to, options);
        state.document.objects.push(edge);
        state.selectedId = edge.id;
        state.edgeStartId = null;
        pushHistory();
        render();
        setStatus('Connector added.');
        return true;
    }

    function graphLevels() {
        const nodes = objectsOf('tree-node');
        const edges = objectsOf('tree-edge');
        const incoming = new Map(nodes.map((node) => [node.id, 0]));
        const children = new Map(nodes.map((node) => [node.id, []]));
        edges.forEach((edge) => {
            if (incoming.has(edge.to) && children.has(edge.from)) {
                incoming.set(edge.to, incoming.get(edge.to) + 1);
                children.get(edge.from).push(edge.to);
            }
        });
        const roots = nodes.filter((node) => incoming.get(node.id) === 0);
        if (!roots.length && nodes.length) roots.push(nodes[0]);
        const levels = [];
        const visited = new Set();
        const queue = roots.map((node) => ({ id: node.id, level: 0 }));
        while (queue.length) {
            const item = queue.shift();
            if (visited.has(item.id)) continue;
            visited.add(item.id);
            if (!levels[item.level]) levels[item.level] = [];
            levels[item.level].push(item.id);
            (children.get(item.id) || []).forEach((id) => queue.push({ id, level: item.level + 1 }));
        }
        nodes.filter((node) => !visited.has(node.id)).forEach((node) => {
            if (!levels[0]) levels[0] = [];
            levels[0].push(node.id);
        });
        return levels;
    }
    function autoLayout() {
        const levels = graphLevels();
        if (!levels.length) {
            setStatus('Add nodes before auto layout.');
            return;
        }
        const vertical = state.document.treeOrientation !== 'horizontal';
        const margin = 85;
        const mainSpan = vertical ? state.document.height - margin * 2 : state.document.width - margin * 2;
        const levelGap = Math.min(clamp(state.document.treeLevelGap, 70, 300, 135), levels.length > 1 ? mainSpan / (levels.length - 1) : mainSpan);
        levels.forEach((ids, levelIndex) => {
            const crossSpan = vertical ? state.document.width - margin * 2 : state.document.height - margin * 2;
            ids.forEach((id, itemIndex) => {
                const node = nodeById(id);
                if (!node) return;
                const cross = ids.length === 1 ? crossSpan / 2 : (crossSpan * itemIndex) / (ids.length - 1);
                if (vertical) {
                    node.x = margin + cross;
                    node.y = margin + levelIndex * levelGap;
                } else {
                    node.x = margin + levelIndex * levelGap;
                    node.y = margin + cross;
                }
                clampNodePosition(node);
            });
        });
        pushHistory();
        render();
        setStatus('Tree layout arranged automatically.');
    }

    function render() {
        if (!state.canvas || !state.document) return;
        state.canvas.style.aspectRatio = `${state.document.width}/${state.document.height}`;
        state.canvas.innerHTML = Diagram.svgMarkup(state.document, { className: 'qmx-tree-svg' });
        state.svg = state.canvas.querySelector('svg');
        if (state.svg) {
            state.svg.setAttribute('tabindex', '0');
            renderSelectionOverlay();
        }
        renderSelectedControls();
        renderSummary();
        updateHistoryButtons();
    }
    function renderSelectionOverlay() {
        if (!state.svg) return;
        const object = selectedObject();
        if (!object) return;
        let markup = '';
        if (object.type === 'tree-node') {
            markup = `<rect class="qmx-tree-selection" x="${object.x - object.width / 2 - 7}" y="${object.y - object.height / 2 - 7}" width="${object.width + 14}" height="${object.height + 14}" rx="10"/>`;
        } else if (object.type === 'text') {
            markup = `<rect class="qmx-tree-selection" x="${object.x - 90}" y="${object.y - 28}" width="180" height="45" rx="8"/>`;
        } else if (object.type === 'tree-edge') {
            const from = nodeById(object.from);
            const to = nodeById(object.to);
            if (from && to) markup = `<line class="qmx-tree-selection" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/>`;
        }
        if (state.edgeStartId) {
            const start = nodeById(state.edgeStartId);
            if (start) markup += `<circle class="qmx-tree-edge-start" cx="${start.x}" cy="${start.y}" r="${Math.max(start.width, start.height) / 2 + 10}"/>`;
        }
        if (markup) state.svg.insertAdjacentHTML('beforeend', markup);
    }
    function renderSummary() {
        const nodes = objectsOf('tree-node').length;
        const edges = objectsOf('tree-edge').length;
        const texts = objectsOf('text').length;
        state.controls.summary.textContent = `${nodes} node(s) · ${edges} connector(s) · ${texts} annotation(s)`;
    }

    function field(label, key, value, type = 'text', attrs = '') {
        const safeValue = type === 'checkbox' ? '' : ` value="${esc(value)}"`;
        if (type === 'checkbox') return `<label class="qmx-tree-check"><input type="checkbox" data-sel="${key}" ${value ? 'checked' : ''}> ${esc(label)}</label>`;
        return `<div class="qmx-tree-field"><label>${esc(label)}</label><input type="${type}" data-sel="${key}"${safeValue} ${attrs}></div>`;
    }
    function renderSelectedControls() {
        const host = state.controls.selected;
        const object = selectedObject();
        if (!object) {
            host.innerHTML = '<div class="qmx-tree-empty">Select a node, connector or annotation.</div>';
            return;
        }
        if (object.type === 'tree-node') {
            host.innerHTML = `
                <div class="qmx-tree-field"><label>Node shape</label><select data-sel="shape">
                    ${['rounded', 'rectangle', 'circle', 'diamond'].map((shape) => `<option value="${shape}" ${object.shape === shape ? 'selected' : ''}>${shape}</option>`).join('')}
                </select></div>
                <div class="qmx-tree-field"><label>Label</label><textarea data-sel="label">${esc(object.label)}</textarea></div>
                <div class="qmx-tree-field"><label>Subtitle</label><input data-sel="subtitle" value="${esc(object.subtitle)}"></div>
                <div class="qmx-tree-grid2">${field('X', 'x', object.x, 'number', 'step="1"')}${field('Y', 'y', object.y, 'number', 'step="1"')}${field('Width', 'width', object.width, 'number', 'min="40"')}${field('Height', 'height', object.height, 'number', 'min="36"')}</div>
                <div class="qmx-tree-grid2">${field('Fill', 'fill', object.fill, 'color')}${field('Stroke', 'stroke', object.stroke, 'color')}${field('Text colour', 'textColor', object.textColor, 'color')}${field('Font size', 'fontSize', object.fontSize, 'number', 'min="8" max="80"')}</div>`;
        } else if (object.type === 'tree-edge') {
            host.innerHTML = `
                <div class="qmx-tree-field"><label>Branch label</label><input data-sel="label" value="${esc(object.label)}"></div>
                <div class="qmx-tree-field"><label>Probability / weight</label><input data-sel="probability" value="${esc(object.probability)}" placeholder="e.g. 1/2 or 0.5"></div>
                <div class="qmx-tree-grid2">${field('Line colour', 'color', object.color, 'color')}${field('Line width', 'strokeWidth', object.strokeWidth, 'number', 'min="1" max="12" step="0.5"')}</div>
                ${field('Dashed connector', 'dash', object.dash, 'checkbox')}
                ${field('Arrow at child', 'arrow', object.arrow, 'checkbox')}`;
        } else {
            host.innerHTML = `
                <div class="qmx-tree-field"><label>Text</label><textarea data-sel="text">${esc(object.text)}</textarea></div>
                <div class="qmx-tree-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Colour', 'color', object.color, 'color')}${field('Font size', 'fontSize', object.fontSize, 'number', 'min="8" max="120"')}</div>
                ${field('Bold', 'fontWeight', object.fontWeight === 'bold', 'checkbox')}`;
        }
    }

    function syncDocumentControls() {
        if (!state.root || !state.document) return;
        state.root.querySelectorAll('[data-doc]').forEach((input) => {
            const key = input.dataset.doc;
            if (!(key in state.document)) return;
            if (input.type === 'checkbox') input.checked = Boolean(state.document[key]);
            else input.value = state.document[key];
        });
    }

    function setTool(tool) {
        state.activeTool = tool;
        state.edgeStartId = null;
        state.controls.tools.querySelectorAll('[data-tool]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tool === tool);
        });
        const messages = {
            select: 'Select and drag nodes. Connector labels can be edited from the right panel.',
            root: 'Click the canvas to add a root node.',
            child: 'Select a parent, then click to add a connected child node.',
            leaf: 'Select a parent, then click to add a connected leaf node.',
            decision: 'Click to add a decision node; a selected parent is connected automatically.',
            edge: 'Click a source node and then a destination node.',
            text: 'Click the canvas to add an annotation.'
        };
        setStatus(messages[tool] || 'Choose a tool.');
        render();
    }

    function onCanvasPointerDown(event) {
        if (!state.svg || event.button !== 0) return;
        const hit = event.target.closest('[data-qmx-object-id]');
        const id = hit?.getAttribute('data-qmx-object-id') || null;
        const point = snapPoint(localPoint(event));

        if (state.activeTool === 'select') {
            state.selectedId = id;
            state.edgeStartId = null;
            const object = selectedObject();
            if (object && (object.type === 'tree-node' || object.type === 'text')) {
                state.interaction = { id: object.id, start: point, originalX: object.x, originalY: object.y, moved: false };
            }
            render();
            return;
        }

        if (state.activeTool === 'edge') {
            const node = id ? nodeById(id) : null;
            if (!node) {
                setStatus('Click directly on a node to create a connector.');
                return;
            }
            if (!state.edgeStartId) {
                state.edgeStartId = node.id;
                state.selectedId = node.id;
                setStatus('Source selected. Click the destination node.');
                render();
            } else if (state.edgeStartId === node.id) {
                state.edgeStartId = null;
                setStatus('Connector cancelled.');
                render();
            } else {
                addEdge(state.edgeStartId, node.id);
            }
            return;
        }

        if (state.activeTool === 'text') {
            const text = textObject(point.x, point.y);
            state.document.objects.push(text);
            state.selectedId = text.id;
            pushHistory();
            render();
            setStatus('Annotation added.');
            return;
        }

        const parent = selectedNode();
        if (state.activeTool === 'root') addNode('root', point, false);
        if (state.activeTool === 'child') {
            if (!parent) setStatus('Select a parent node first.');
            else addNode('branch', point, true);
        }
        if (state.activeTool === 'leaf') {
            if (!parent) setStatus('Select a parent node first.');
            else addNode('leaf', point, true);
        }
        if (state.activeTool === 'decision') addNode('decision', point, Boolean(parent));
    }
    function onPointerMove(event) {
        const interaction = state.interaction;
        if (!interaction || !state.document) return;
        const object = state.document.objects.find((item) => item.id === interaction.id);
        if (!object) return;
        const point = snapPoint(localPoint(event));
        object.x = interaction.originalX + point.x - interaction.start.x;
        object.y = interaction.originalY + point.y - interaction.start.y;
        if (object.type === 'tree-node') clampNodePosition(object);
        else {
            object.x = clamp(object.x, 0, state.document.width, 0);
            object.y = clamp(object.y, 0, state.document.height, 0);
        }
        interaction.moved = true;
        render();
    }
    function onPointerUp() {
        if (!state.interaction) return;
        const moved = state.interaction.moved;
        state.interaction = null;
        if (moved) pushHistory();
    }

    function onRootClick(event) {
        const tool = event.target.closest('[data-tool]');
        if (tool) { setTool(tool.dataset.tool); return; }
        const preset = event.target.closest('[data-preset]');
        if (preset) { applyPreset(preset.dataset.preset); return; }
        const action = event.target.closest('[data-act]')?.dataset.act;
        if (!action) return;
        const handlers = {
            new: newDocument,
            undo,
            redo,
            duplicate: duplicateSelected,
            delete: deleteSelected,
            'auto-layout': autoLayout,
            close,
            'export-svg': exportSvg,
            'export-png': exportPng,
            insert: insertIntoQuestion
        };
        (handlers[action] || (() => {}))();
    }
    function onRootInput(event) {
        const docKey = event.target.dataset.doc;
        const selKey = event.target.dataset.sel;
        if (docKey) {
            let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
            if (['width', 'height', 'gridSize', 'treeLevelGap', 'treeSiblingGap'].includes(docKey)) value = Number(value);
            state.document[docKey] = value;
            if (docKey === 'width' || docKey === 'height') objectsOf('tree-node').forEach(clampNodePosition);
            syncDocumentControls();
            pushHistory();
            render();
            return;
        }
        if (!selKey) return;
        const object = selectedObject();
        if (!object) return;
        let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        if (['x', 'y', 'width', 'height', 'fontSize', 'strokeWidth'].includes(selKey)) value = Number(value);
        if (selKey === 'fontWeight') value = event.target.checked ? 'bold' : 'normal';
        object[selKey] = value;
        if (object.type === 'tree-node') clampNodePosition(object);
        pushHistory();
        render();
    }

    function clearDocument() {
        state.document.objects = [];
        state.selectedId = null;
        state.edgeStartId = null;
    }
    function presetNode(id, x, y, label, kind = 'branch', subtitle = '') {
        const node = nodeObject(x, y, { kind, label, subtitle });
        node.id = id;
        return node;
    }
    function applyPreset(type) {
        clearDocument();
        const w = state.document.width;
        const h = state.document.height;
        const n = [];
        const e = [];

        if (type === 'classification') {
            n.push(
                presetNode('class-root', w / 2, 75, 'Living things', 'root'),
                presetNode('class-a', w * .32, 220, 'Plants', 'branch'),
                presetNode('class-b', w * .68, 220, 'Animals', 'branch'),
                presetNode('class-a1', w * .20, 405, 'Flowering', 'leaf'),
                presetNode('class-a2', w * .40, 405, 'Non-flowering', 'leaf'),
                presetNode('class-b1', w * .60, 405, 'Vertebrates', 'leaf'),
                presetNode('class-b2', w * .80, 405, 'Invertebrates', 'leaf')
            );
            [['class-root','class-a'],['class-root','class-b'],['class-a','class-a1'],['class-a','class-a2'],['class-b','class-b1'],['class-b','class-b2']].forEach(([a,b]) => e.push(edgeObject(a,b)));
        } else if (type === 'probability') {
            n.push(
                presetNode('prob-root', w / 2, 70, 'Start', 'root'),
                presetNode('prob-h', w * .32, 225, 'H', 'branch'),
                presetNode('prob-t', w * .68, 225, 'T', 'branch'),
                presetNode('prob-hh', w * .18, 420, 'HH', 'leaf'),
                presetNode('prob-ht', w * .40, 420, 'HT', 'leaf'),
                presetNode('prob-th', w * .60, 420, 'TH', 'leaf'),
                presetNode('prob-tt', w * .82, 420, 'TT', 'leaf')
            );
            [['prob-root','prob-h','H','1/2'],['prob-root','prob-t','T','1/2'],['prob-h','prob-hh','H','1/2'],['prob-h','prob-ht','T','1/2'],['prob-t','prob-th','H','1/2'],['prob-t','prob-tt','T','1/2']].forEach(([a,b,l,p]) => e.push(edgeObject(a,b,{label:l,probability:p})));
        } else if (type === 'decision') {
            n.push(
                presetNode('decision-root', w / 2, 85, 'Select plan', 'decision'),
                presetNode('decision-a', w * .32, 250, 'Plan A', 'branch', 'Low cost'),
                presetNode('decision-b', w * .68, 250, 'Plan B', 'branch', 'High return'),
                presetNode('decision-a1', w * .32, 445, 'Approve', 'leaf'),
                presetNode('decision-b1', w * .68, 445, 'Review', 'leaf')
            );
            e.push(edgeObject('decision-root','decision-a',{label:'Budget ≤ 50',arrow:true}),edgeObject('decision-root','decision-b',{label:'Budget > 50',arrow:true}),edgeObject('decision-a','decision-a1',{label:'Yes',arrow:true}),edgeObject('decision-b','decision-b1',{label:'Maybe',arrow:true}));
        } else if (type === 'binary') {
            n.push(
                presetNode('bin-1', w / 2, 65, '1', 'root'),
                presetNode('bin-2', w * .34, 210, '2', 'branch'),
                presetNode('bin-3', w * .66, 210, '3', 'branch'),
                presetNode('bin-4', w * .20, 395, '4', 'leaf'),
                presetNode('bin-5', w * .42, 395, '5', 'leaf'),
                presetNode('bin-6', w * .58, 395, '6', 'leaf'),
                presetNode('bin-7', w * .80, 395, '7', 'leaf')
            );
            [['bin-1','bin-2'],['bin-1','bin-3'],['bin-2','bin-4'],['bin-2','bin-5'],['bin-3','bin-6'],['bin-3','bin-7']].forEach(([a,b]) => e.push(edgeObject(a,b)));
        } else if (type === 'organization') {
            n.push(
                presetNode('org-root', w / 2, 70, 'Principal', 'root'),
                presetNode('org-a', w * .25, 230, 'Academic', 'branch'),
                presetNode('org-b', w * .50, 230, 'Administration', 'branch'),
                presetNode('org-c', w * .75, 230, 'Finance', 'branch'),
                presetNode('org-a1', w * .18, 425, 'Science', 'leaf'),
                presetNode('org-a2', w * .34, 425, 'Arts', 'leaf'),
                presetNode('org-b1', w * .50, 425, 'Office', 'leaf'),
                presetNode('org-c1', w * .70, 425, 'Accounts', 'leaf'),
                presetNode('org-c2', w * .84, 425, 'Audit', 'leaf')
            );
            [['org-root','org-a'],['org-root','org-b'],['org-root','org-c'],['org-a','org-a1'],['org-a','org-a2'],['org-b','org-b1'],['org-c','org-c1'],['org-c','org-c2']].forEach(([a,b]) => e.push(edgeObject(a,b)));
        } else if (type === 'clear') {
            pushHistory();
            render();
            setStatus('Tree cleared.');
            return;
        }

        state.document.objects = [...e, ...n];
        state.selectedId = n[0]?.id || null;
        pushHistory();
        render();
        setStatus(`${type} tree preset inserted.`);
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        const object = selectedObject();
        if (object?.type === 'tree-node') {
            state.document.objects = state.document.objects.filter((item) => item.id !== object.id && item.from !== object.id && item.to !== object.id);
        } else {
            state.document.objects = state.document.objects.filter((item) => item.id !== state.selectedId);
        }
        state.selectedId = null;
        state.edgeStartId = null;
        pushHistory();
        render();
        setStatus('Object deleted.');
    }
    function duplicateSelected() {
        const object = selectedObject();
        if (!object) return;
        if (object.type === 'tree-edge') {
            setStatus('Select a node or text object to duplicate.');
            return;
        }
        const copy = clone(object);
        copy.id = uid(object.type === 'tree-node' ? 'tree-node' : 'tree-text');
        copy.x += 35;
        copy.y += 35;
        if (copy.type === 'tree-node') clampNodePosition(copy);
        state.document.objects.push(copy);
        state.selectedId = copy.id;
        pushHistory();
        render();
        setStatus('Object duplicated.');
    }
    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Tree Diagram document?')) return;
        state.document = createDocument();
        state.selectedId = null;
        state.edgeStartId = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Tree Diagram document.');
    }

    function makeToken() { return `[[qmx-diagram:${Diagram.encodeSpec(state.document)}]]`; }
    function insertIntoQuestion() {
        const textarea = state.context?.textarea;
        if (!textarea) { setStatus('No target question field was found.'); return; }
        const token = makeToken();
        const range = state.context?.replaceRange;
        textarea.focus();
        if (range && Number.isInteger(range.start) && Number.isInteger(range.end)) {
            textarea.setRangeText(token, range.start, range.end, 'end');
        } else {
            const start = textarea.selectionStart ?? textarea.value.length;
            const end = textarea.selectionEnd ?? start;
            const prefix = start > 0 && !/\n$/.test(textarea.value.slice(0, start)) ? '\n' : '';
            const suffix = end < textarea.value.length && !/^\n/.test(textarea.value.slice(end)) ? '\n' : '';
            textarea.setRangeText(prefix + token + suffix, start, end, 'end');
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        setStatus('Tree Diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }
    function safeFilename(value) {
        return String(value || 'tree-diagram').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'tree-diagram';
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
        downloadBlob(new Blob([Diagram.svgMarkup(state.document)], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(state.document.title)}.svg`);
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
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            URL.revokeObjectURL(url);
            canvas.toBlob((blob) => blob && downloadBlob(blob, `${safeFilename(state.document.title)}.png`), 'image/png');
            setStatus('PNG exported.');
        };
        image.onerror = () => { URL.revokeObjectURL(url); setStatus('PNG export failed.'); };
        image.src = url;
    }

    function addStyles() {
        if (document.getElementById('qmx-tree-diagram-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'qmx-tree-diagram-editor-styles';
        style.textContent = `
        .qmx-tree-editor[hidden]{display:none!important}.qmx-tree-editor{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);padding:14px;display:flex;align-items:center;justify-content:center;font:14px/1.35 "Segoe UI",Arial,sans-serif;color:#0f172a}.qmx-tree-shell{width:min(1440px,calc(100vw - 28px));height:min(910px,calc(100vh - 28px));background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.35);display:grid;grid-template-rows:auto 1fr auto;overflow:hidden}.qmx-tree-header,.qmx-tree-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #dbe3ef}.qmx-tree-footer{border-top:1px solid #dbe3ef;border-bottom:0}.qmx-tree-title{font-size:18px;font-weight:800}.qmx-tree-subtitle{font-size:12px;color:#64748b}.qmx-tree-actions{display:flex;gap:8px;flex-wrap:wrap}.qmx-tree-btn{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer}.qmx-tree-btn:hover{background:#f8fafc}.qmx-tree-btn:disabled{opacity:.45;cursor:not-allowed}.qmx-tree-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}.qmx-tree-btn.danger{color:#dc2626}.qmx-tree-main{min-height:0;display:grid;grid-template-columns:205px minmax(0,1fr) 285px;gap:10px;padding:10px;background:#f8fafc}.qmx-tree-panel{background:#fff;border:1px solid #dbe3ef;border-radius:12px;padding:10px;overflow:auto}.qmx-tree-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px}.qmx-tree-tool{min-height:52px;border:1px solid #cbd5e1;background:#fff;border-radius:9px;font-weight:800;cursor:pointer}.qmx-tree-tool small{display:block;color:#64748b;font-weight:500}.qmx-tree-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.qmx-tree-section{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#475569;font-weight:800;margin:14px 0 8px}.qmx-tree-presets{display:grid;gap:7px}.qmx-tree-preset{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:8px;font-weight:700;cursor:pointer}.qmx-tree-canvas-wrap{border:1px solid #cbd5e1;border-radius:12px;background:#e8eef6;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px;min-width:0}.qmx-tree-canvas{width:min(100%,1000px);aspect-ratio:5/3;background:#fff;box-shadow:0 8px 25px rgba(15,23,42,.12)}.qmx-tree-canvas svg{display:block;width:100%;height:100%;touch-action:none;user-select:none}.qmx-tree-field{display:grid;gap:5px;margin-bottom:10px}.qmx-tree-field label{font-size:12px;font-weight:800;color:#334155}.qmx-tree-field input,.qmx-tree-field select,.qmx-tree-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;background:#fff;font:inherit}.qmx-tree-field textarea{min-height:58px;resize:vertical}.qmx-tree-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.qmx-tree-check{display:flex;gap:8px;align-items:center;margin:8px 0;font-weight:600}.qmx-tree-status{color:#64748b;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.qmx-tree-summary{background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;padding:9px;border-radius:9px;font-size:12px;margin-top:10px}.qmx-tree-selection{pointer-events:none;fill:none;stroke:#2563eb;stroke-width:2.5;stroke-dasharray:7 5}.qmx-tree-edge-start{pointer-events:none;fill:none;stroke:#7c3aed;stroke-width:3;stroke-dasharray:8 5}.qmx-tree-empty{color:#64748b;text-align:center;padding:24px 5px}@media(max-width:900px){.qmx-tree-editor{padding:0}.qmx-tree-shell{width:100vw;height:100vh;border-radius:0}.qmx-tree-main{grid-template-columns:165px minmax(0,1fr)}.qmx-tree-main>.qmx-tree-panel:last-child{grid-column:1/-1;max-height:310px}.qmx-tree-title{font-size:15px}}
        `;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;
        addStyles();
        const root = document.createElement('div');
        root.className = 'qmx-tree-editor';
        root.hidden = true;
        root.innerHTML = `
        <div class="qmx-tree-shell" role="dialog" aria-modal="true" aria-label="Tree Diagram editor">
          <header class="qmx-tree-header"><div><div class="qmx-tree-title">Tree Diagram</div><div class="qmx-tree-subtitle">Hierarchies, classifications, probability branches, decision trees and editable connectors</div></div><div class="qmx-tree-actions"><button class="qmx-tree-btn" data-act="new">New</button><button class="qmx-tree-btn" data-act="undo">Undo</button><button class="qmx-tree-btn" data-act="redo">Redo</button><button class="qmx-tree-btn" data-act="auto-layout">Auto layout</button><button class="qmx-tree-btn" data-act="duplicate">Duplicate</button><button class="qmx-tree-btn danger" data-act="delete">Delete</button><button class="qmx-tree-btn" data-act="close">×</button></div></header>
          <main class="qmx-tree-main">
            <aside class="qmx-tree-panel"><strong>Tree tools</strong><div class="qmx-tree-tools" data-tools></div><div class="qmx-tree-section">Tree presets</div><div class="qmx-tree-presets">
              <button class="qmx-tree-preset" data-preset="classification">Classification tree</button>
              <button class="qmx-tree-preset" data-preset="probability">Probability tree</button>
              <button class="qmx-tree-preset" data-preset="decision">Decision tree</button>
              <button class="qmx-tree-preset" data-preset="binary">Binary tree</button>
              <button class="qmx-tree-preset" data-preset="organization">Organization hierarchy</button>
              <button class="qmx-tree-preset" data-preset="clear">Clear objects</button>
            </div><p class="qmx-tree-subtitle">Child and leaf tools connect to the currently selected parent. Connector tool uses two node clicks.</p></aside>
            <section class="qmx-tree-canvas-wrap"><div class="qmx-tree-canvas" data-canvas></div></section>
            <aside class="qmx-tree-panel"><strong>Document</strong><div class="qmx-tree-field"><label>Title</label><input data-doc="title"></div><div class="qmx-tree-grid2"><div class="qmx-tree-field"><label>Width</label><input type="number" min="400" max="2400" data-doc="width"></div><div class="qmx-tree-field"><label>Height</label><input type="number" min="260" max="1800" data-doc="height"></div><div class="qmx-tree-field"><label>Orientation</label><select data-doc="treeOrientation"><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></select></div><div class="qmx-tree-field"><label>Grid size</label><input type="number" min="5" max="100" data-doc="gridSize"></div><div class="qmx-tree-field"><label>Level gap</label><input type="number" min="70" max="300" data-doc="treeLevelGap"></div><div class="qmx-tree-field"><label>Background</label><input type="color" data-doc="background"></div></div><label class="qmx-tree-check"><input type="checkbox" data-doc="treeShowGrid"> Show grid</label><label class="qmx-tree-check"><input type="checkbox" data-doc="treeShowEdgeLabels"> Show branch labels</label><label class="qmx-tree-check"><input type="checkbox" data-doc="treeShowProbabilities"> Show probabilities</label><label class="qmx-tree-check"><input type="checkbox" data-doc="snap"> Snap to grid</label><hr><strong>Selected object</strong><div data-selected></div><div class="qmx-tree-summary" data-summary></div></aside>
          </main>
          <footer class="qmx-tree-footer"><div class="qmx-tree-status" data-status></div><div class="qmx-tree-actions"><button class="qmx-tree-btn" data-act="export-svg">Export SVG</button><button class="qmx-tree-btn" data-act="export-png">Export PNG</button><button class="qmx-tree-btn primary" data-act="insert">Insert into question</button></div></footer>
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
            button.className = 'qmx-tree-tool';
            button.dataset.tool = id;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<small>${esc(bn)}</small>`;
            state.controls.tools.appendChild(button);
        });
        root.addEventListener('click', onRootClick);
        root.addEventListener('change', onRootInput);
        state.canvas.addEventListener('pointerdown', onCanvasPointerDown);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('keydown', onKeydown);
    }

    function setStatus(message) { if (state.controls.status) state.controls.status.textContent = message; }
    function open(context = {}) {
        buildEditor();
        state.context = context;
        state.document = context.initialSpec ? Diagram.normalizeSpec(context.initialSpec) : createDocument();
        if (state.document.mode !== 'tree-diagram') state.document = createDocument();
        state.selectedId = null;
        state.activeTool = 'select';
        state.edgeStartId = null;
        state.interaction = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        state.root.hidden = false;
        document.body.dataset.qmxTreeOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';
        setStatus(context.initialSpec ? 'Existing Tree Diagram loaded.' : 'Choose a tree tool or insert a preset.');
        window.setTimeout(() => state.svg?.focus?.(), 0);
    }
    function close() {
        if (!state.root || state.root.hidden) return;
        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxTreeOverflow || '';
        delete document.body.dataset.qmxTreeOverflow;
        state.context?.textarea?.focus?.();
    }
    function findTokenTextarea(token) {
        return Array.from(document.querySelectorAll('textarea')).find((textarea) => textarea.value.includes(token)) || null;
    }
    function openFromPreview(figure) {
        const payload = String(figure?.dataset.qmxDiagramPayload || '');
        if (!payload) return false;
        let spec;
        try { spec = Diagram.decodePayload(payload); }
        catch (error) { return false; }
        if (spec.mode !== 'tree-diagram') return false;
        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) || window.QmxDiagramLauncher?.getActiveTextarea?.();
        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }
        open({ tool: { id: 'tree-diagram' }, textarea, initialSpec: spec, replaceRange, editMode: true });
        return true;
    }
    function registerHandlers() {
        const launcher = window.QmxDiagramLauncher;
        if (!launcher?.registerToolHandler) return false;
        let registered = false;
        ['tree-diagram', 'tree', 'classification-tree', 'probability-tree', 'decision-tree', 'hierarchy-tree'].forEach((id) => {
            try { launcher.registerToolHandler(id, open); registered = true; }
            catch (error) { /* alias may already be registered */ }
        });
        return registered;
    }
    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;
        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
        if (event.key === 'Escape') {
            if (state.edgeStartId) { state.edgeStartId = null; render(); setStatus('Connector cancelled.'); }
            else close();
            event.preventDefault();
            return;
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) { event.preventDefault(); deleteSelected(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && !editing) { event.preventDefault(); duplicateSelected(); }
    }
    function init() {
        buildEditor();
        if (!registerHandlers()) document.addEventListener('qmx:diagram-launcher-ready', registerHandlers, { once: true });
    }

    window.QmxTreeDiagramEditor = Object.freeze({
        version: '1.0.0',
        open,
        close,
        openFromPreview,
        autoLayout
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
