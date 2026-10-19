(function (window, document) {
    'use strict';

    if (window.QmxFunctionTransformationEditor?.version) return;
    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Function Transformation] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['function-curve', 'Function curve', 'ফাংশন রেখা'],
        ['function-point', 'Point / intercept', 'বিন্দু / ছেদবিন্দু'],
        ['function-asymptote', 'Asymptote', 'অসীমতট'],
        ['function-line', 'Tangent / line', 'স্পর্শক / সরলরেখা'],
        ['function-domain', 'Domain band', 'ডোমেইন অঞ্চল'],
        ['text', 'Annotation', 'টীকা']
    ];

    const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2', '#db2777', '#475569'];
    const state = {
        root: null, canvas: null, svg: null, context: null, document: null,
        selectedId: null, activeTool: 'select', interaction: null,
        history: [], historyIndex: -1, controls: {}
    };

    function uid(prefix = 'function') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]); }
    function clamp(value, min, max, fallback = min) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
    function selectedObject() { return state.document?.objects.find((object) => object.id === state.selectedId) || null; }

    function createDocument() {
        return {
            version: 19,
            id: uid('function-transformation'),
            mode: 'function-transformation',
            title: 'Function Transformation / Curve Sketching',
            width: 1000,
            height: 600,
            background: '#ffffff',
            gridSize: 20,
            functionXMin: -10,
            functionXMax: 10,
            functionYMin: -6,
            functionYMax: 6,
            functionGridStep: 1,
            functionShowGrid: true,
            functionShowAxes: true,
            functionShowTicks: true,
            functionShowLegend: true,
            snap: true,
            objects: []
        };
    }

    function defaultObject(type) {
        if (type === 'function-curve') return {
            id: uid(type), type, expression: 'x^2', label: 'f(x) = x²',
            xMin: -10, xMax: 10, stroke: COLORS[0], lineWidth: 3,
            dashed: false, opacity: 1, samples: 420, pieces: []
        };
        if (type === 'function-point') return {
            id: uid(type), type, x: 0, y: 0, label: '(0, 0)',
            color: '#dc2626', radius: 6, filled: true, showGuide: false
        };
        if (type === 'function-asymptote') return {
            id: uid(type), type, orientation: 'vertical', value: 2,
            label: 'x = 2', stroke: '#dc2626', lineWidth: 2.5, dashed: true
        };
        if (type === 'function-line') return {
            id: uid(type), type, slope: 1, intercept: 0, label: 'y = x',
            stroke: '#16a34a', lineWidth: 2.5, dashed: false
        };
        if (type === 'function-domain') return {
            id: uid(type), type, xStart: -2, xEnd: 2, label: 'Domain: [−2, 2]',
            fill: '#93c5fd', fillOpacity: 0.2, stroke: '#2563eb', dashed: true
        };
        return {
            id: uid('text'), type: 'text', x: 1, y: 4.5,
            text: 'Transformation note', color: '#0f172a', fontSize: 18, fontWeight: 'bold'
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
        state.controls.tools?.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
        if (tool !== 'select') {
            addObject(tool);
            state.activeTool = 'select';
            state.controls.tools?.querySelector('[data-tool="select"]')?.classList.add('active');
            state.controls.tools?.querySelector(`[data-tool="${tool}"]`)?.classList.remove('active');
        }
    }

    function addObject(type) {
        const object = defaultObject(type);
        const count = state.document.objects.length;
        if (object.type === 'function-point') { object.x = -2 + count; object.y = 1; }
        if (object.type === 'text') { object.x = -6; object.y = 5 - count * 0.4; }
        state.document.objects.push(object);
        state.selectedId = object.id;
        pushHistory();
        render();
        setStatus(`${object.label || object.text || object.type} added.`);
    }

    function plotMetrics() {
        const d = state.document;
        return { left: 78, right: d.width - 34, top: 34, bottom: d.height - 58 };
    }
    function coordToPixel(x, y) {
        const d = state.document, m = plotMetrics();
        return {
            x: m.left + ((x - d.functionXMin) / (d.functionXMax - d.functionXMin)) * (m.right - m.left),
            y: m.bottom - ((y - d.functionYMin) / (d.functionYMax - d.functionYMin)) * (m.bottom - m.top)
        };
    }
    function pixelToCoord(px, py) {
        const d = state.document, m = plotMetrics();
        return {
            x: d.functionXMin + ((px - m.left) / (m.right - m.left)) * (d.functionXMax - d.functionXMin),
            y: d.functionYMin + ((m.bottom - py) / (m.bottom - m.top)) * (d.functionYMax - d.functionYMin)
        };
    }
    function localPoint(event) {
        if (!state.svg) return { x: 0, y: 0 };
        const p = state.svg.createSVGPoint();
        p.x = event.clientX; p.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        return matrix ? p.matrixTransform(matrix.inverse()) : p;
    }

    function selectionMarkup(object) {
        if (!object) return '';
        const d = state.document, m = plotMetrics();
        if (object.type === 'function-point') {
            const p = coordToPixel(object.x, object.y);
            return `<circle class="qmx-function-selection-point" cx="${p.x}" cy="${p.y}" r="12" data-object-id="${esc(object.id)}" data-handle="move"/>`;
        }
        if (object.type === 'function-asymptote') {
            if (object.orientation === 'horizontal') {
                const p = coordToPixel(0, object.value);
                return `<line class="qmx-function-selection-line" x1="${m.left}" y1="${p.y}" x2="${m.right}" y2="${p.y}" data-object-id="${esc(object.id)}" data-handle="move"/>`;
            }
            const p = coordToPixel(object.value, 0);
            return `<line class="qmx-function-selection-line" x1="${p.x}" y1="${m.top}" x2="${p.x}" y2="${m.bottom}" data-object-id="${esc(object.id)}" data-handle="move"/>`;
        }
        if (object.type === 'function-domain') {
            const a = coordToPixel(object.xStart, 0), b = coordToPixel(object.xEnd, 0);
            return `<rect class="qmx-function-selection-rect" x="${Math.min(a.x,b.x)}" y="${m.top}" width="${Math.max(8,Math.abs(b.x-a.x))}" height="${m.bottom-m.top}" data-object-id="${esc(object.id)}" data-handle="move"/>`;
        }
        if (object.type === 'text') {
            const p = coordToPixel(object.x, object.y);
            return `<rect class="qmx-function-selection-rect" x="${p.x-8}" y="${p.y-object.fontSize-8}" width="${Math.max(80, String(object.text).length*object.fontSize*.58)}" height="${object.fontSize+18}" data-object-id="${esc(object.id)}" data-handle="move"/>`;
        }
        return '';
    }

    function render() {
        if (!state.canvas || !state.document) return;
        state.document = Diagram.normalizeSpec(state.document);
        const body = Diagram.svgMarkup(state.document).replace(/^<svg[^>]*>|<\/svg>$/g, '');
        state.canvas.innerHTML = `<svg class="qmx-function-svg" viewBox="0 0 ${state.document.width} ${state.document.height}" tabindex="0" aria-label="Function transformation canvas">${body}${selectionMarkup(selectedObject())}</svg>`;
        state.svg = state.canvas.querySelector('svg');
        state.svg.addEventListener('click', (event) => {
            const target = event.target.closest('[data-object-id]');
            if (target) state.selectedId = target.dataset.objectId;
            else state.selectedId = null;
            render();
        });
        state.svg.addEventListener('pointerdown', onPointerDown);
        syncSelectionControls();
        updateSummary();
    }

    function onPointerDown(event) {
        const target = event.target.closest('[data-object-id]');
        if (!target || state.activeTool !== 'select') return;
        const object = state.document.objects.find((item) => item.id === target.dataset.objectId);
        if (!object || !['function-point','function-asymptote','function-domain','text'].includes(object.type)) return;
        state.selectedId = object.id;
        const point = localPoint(event);
        state.interaction = { objectId: object.id, start: point, original: clone(object) };
        target.setPointerCapture?.(event.pointerId);
        event.preventDefault(); event.stopPropagation();
    }

    function onPointerMove(event) {
        if (!state.interaction || !state.svg) return;
        const object = state.document.objects.find((item) => item.id === state.interaction.objectId);
        if (!object) return;
        const point = localPoint(event);
        const start = pixelToCoord(state.interaction.start.x, state.interaction.start.y);
        const now = pixelToCoord(point.x, point.y);
        const dx = now.x - start.x, dy = now.y - start.y;
        Object.assign(object, clone(state.interaction.original));
        if (object.type === 'function-point' || object.type === 'text') { object.x += dx; object.y += dy; }
        else if (object.type === 'function-asymptote') object.value += object.orientation === 'horizontal' ? dy : dx;
        else if (object.type === 'function-domain') { object.xStart += dx; object.xEnd += dx; }
        render();
    }
    function onPointerUp() {
        if (!state.interaction) return;
        state.interaction = null; pushHistory(); render(); setStatus('Function object updated.');
    }

    function field(label, prop, type = 'text', attrs = '') {
        const object = selectedObject();
        return `<div class="qmx-function-field"><label>${label}</label><input type="${type}" data-prop="${prop}" value="${esc(object?.[prop] ?? '')}" ${attrs}></div>`;
    }
    function check(label, prop) {
        const object = selectedObject();
        return `<label class="qmx-function-check"><input type="checkbox" data-prop="${prop}" ${object?.[prop] ? 'checked' : ''}> ${label}</label>`;
    }
    function piecesText(object) {
        return (object.pieces || []).map((piece) => `${piece.expression} | ${piece.xMin} | ${piece.xMax} | ${piece.closedStart ? 'closed' : 'open'} | ${piece.closedEnd ? 'closed' : 'open'}`).join('\n');
    }
    function selectedFields(object) {
        if (!object) return '<p class="qmx-function-empty">Select a curve, point, asymptote, line, domain band or annotation.</p>';
        if (object.type === 'function-curve') return `<div class="qmx-function-type">${esc(object.type)}</div>
            <div class="qmx-function-field"><label>Expression in x</label><input data-prop="expression" value="${esc(object.expression)}"></div>
            <div class="qmx-function-field"><label>Legend label</label><input data-prop="label" value="${esc(object.label)}"></div>
            <div class="qmx-function-field"><label>Piecewise rows: expression | xMin | xMax | closed/open | closed/open</label><textarea data-pieces-editor placeholder="Leave empty for a single function">${esc(piecesText(object))}</textarea></div>
            <div class="qmx-function-grid2">${field('X start','xMin','number')}${field('X end','xMax','number')}${field('Stroke','stroke','color')}${field('Line width','lineWidth','number','min="0.5" max="20" step="0.5"')}${field('Samples','samples','number','min="80" max="1600" step="20"')}${field('Opacity','opacity','number','min="0" max="1" step="0.05"')}</div>${check('Dashed curve','dashed')}`;
        if (object.type === 'function-point') return `<div class="qmx-function-type">${esc(object.type)}</div><div class="qmx-function-grid2">${field('X','x','number','step="0.1"')}${field('Y','y','number','step="0.1"')}${field('Label','label')}${field('Colour','color','color')}${field('Radius','radius','number','min="2" max="30"')}</div>${check('Filled point','filled')}${check('Show coordinate guides','showGuide')}`;
        if (object.type === 'function-asymptote') return `<div class="qmx-function-type">${esc(object.type)}</div><div class="qmx-function-field"><label>Orientation</label><select data-prop="orientation"><option value="vertical" ${object.orientation==='vertical'?'selected':''}>Vertical</option><option value="horizontal" ${object.orientation==='horizontal'?'selected':''}>Horizontal</option></select></div><div class="qmx-function-grid2">${field('Value','value','number','step="0.1"')}${field('Label','label')}${field('Stroke','stroke','color')}${field('Line width','lineWidth','number','min="0.5" max="20" step="0.5"')}</div>${check('Dashed','dashed')}`;
        if (object.type === 'function-line') return `<div class="qmx-function-type">${esc(object.type)}</div><div class="qmx-function-grid2">${field('Slope m','slope','number','step="0.1"')}${field('Intercept c','intercept','number','step="0.1"')}${field('Label','label')}${field('Stroke','stroke','color')}${field('Line width','lineWidth','number','min="0.5" max="20" step="0.5"')}</div>${check('Dashed','dashed')}`;
        if (object.type === 'function-domain') return `<div class="qmx-function-type">${esc(object.type)}</div><div class="qmx-function-grid2">${field('X start','xStart','number','step="0.1"')}${field('X end','xEnd','number','step="0.1"')}${field('Label','label')}${field('Fill','fill','color')}${field('Fill opacity','fillOpacity','number','min="0" max="1" step="0.05"')}${field('Stroke','stroke','color')}</div>${check('Dashed border','dashed')}`;
        return `<div class="qmx-function-type">text</div><div class="qmx-function-field"><label>Text</label><textarea data-prop="text">${esc(object.text)}</textarea></div><div class="qmx-function-grid2">${field('X','x','number','step="0.1"')}${field('Y','y','number','step="0.1"')}${field('Colour','color','color')}${field('Font size','fontSize','number','min="8" max="96"')}</div><label class="qmx-function-check"><input type="checkbox" data-prop="fontWeight" ${object.fontWeight === 'bold' ? 'checked' : ''}> Bold</label>`;
    }
    function syncSelectionControls() { if (state.controls.selected) state.controls.selected.innerHTML = selectedFields(selectedObject()); }
    function updateSummary() {
        if (!state.controls.summary) return;
        const counts = {};
        state.document.objects.forEach((object) => counts[object.type] = (counts[object.type] || 0) + 1);
        state.controls.summary.textContent = `${state.document.objects.length} object(s) · ${Object.entries(counts).map(([key,value]) => `${value} ${key.replace('function-','')}`).join(' · ')}`;
    }
    function syncDocumentControls() {
        state.root?.querySelectorAll('[data-doc]').forEach((input) => {
            const key = input.dataset.doc;
            if (input.type === 'checkbox') input.checked = Boolean(state.document[key]);
            else input.value = state.document[key] ?? '';
        });
    }
    function parsePieces(text) {
        return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
            const parts = line.split('|').map((part) => part.trim());
            if (parts.length < 3) return null;
            const xMin = Number(parts[1]), xMax = Number(parts[2]);
            if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) return null;
            return { expression: parts[0], xMin, xMax, closedStart: !/^open$/i.test(parts[3] || 'closed'), closedEnd: !/^open$/i.test(parts[4] || 'closed') };
        }).filter(Boolean).slice(0, 20);
    }

    function onRootInput(event) {
        if (event.type === 'input' && !event.target.matches('textarea[data-prop="text"]')) return;
        const input = event.target;
        if (input.matches('[data-pieces-editor]')) {
            const object = selectedObject(); if (!object) return;
            object.pieces = parsePieces(input.value); pushHistory(); render(); return;
        }
        if (input.dataset.doc) {
            const key = input.dataset.doc;
            let value = input.type === 'checkbox' ? input.checked : input.value;
            if (input.type === 'number') value = Number(value);
            state.document[key] = value;
            if (key === 'width') state.document.width = clamp(value, 480, 2400, 1000);
            if (key === 'height') state.document.height = clamp(value, 300, 1800, 600);
            if (key === 'functionXMax' && value <= state.document.functionXMin) state.document.functionXMax = state.document.functionXMin + 1;
            if (key === 'functionYMax' && value <= state.document.functionYMin) state.document.functionYMax = state.document.functionYMin + 1;
            pushHistory(); render(); return;
        }
        if (input.dataset.prop) {
            const object = selectedObject(); if (!object) return;
            const key = input.dataset.prop;
            let value = input.type === 'checkbox' ? input.checked : input.value;
            if (input.type === 'number') value = Number(value);
            if (key === 'fontWeight') value = input.checked ? 'bold' : 'normal';
            object[key] = value;
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
        ({ new: newDocument, undo, redo, duplicate: duplicateSelected, delete: deleteSelected, close,
           insert: insertIntoQuestion, 'export-svg': exportSvg, 'export-png': exportPng }[action] || (() => {}))();
    }

    function curve(expression, label, stroke, extras = {}) { return { ...defaultObject('function-curve'), expression, label, stroke, ...extras }; }
    function point(x, y, label, color = '#dc2626') { return { ...defaultObject('function-point'), x, y, label, color }; }
    function asymptote(orientation, value, label) { return { ...defaultObject('function-asymptote'), orientation, value, label }; }
    function line(slope, intercept, label, stroke = '#16a34a') { return { ...defaultObject('function-line'), slope, intercept, label, stroke }; }
    function note(x, y, text, color = '#0f172a') { return { ...defaultObject('text'), x, y, text, color }; }

    function applyPreset(type) {
        state.document.objects = [];
        if (type === 'parent') {
            state.document.functionXMin = -6; state.document.functionXMax = 6; state.document.functionYMin = -4; state.document.functionYMax = 8;
            state.document.objects.push(
                curve('x', 'y = x', COLORS[0]),
                curve('x^2', 'y = x²', COLORS[1]),
                curve('abs(x)', 'y = |x|', COLORS[2]),
                curve('sqrt(x)', 'y = √x', COLORS[3], { xMin: 0, xMax: 6 })
            );
        } else if (type === 'transform') {
            state.document.functionXMin = -6; state.document.functionXMax = 8; state.document.functionYMin = -8; state.document.functionYMax = 8;
            state.document.objects.push(
                curve('x^2', 'Parent: y = x²', '#94a3b8', { dashed: true }),
                curve('-2*(x-2)^2+3', 'y = −2(x−2)² + 3', COLORS[0]),
                point(2, 3, 'Vertex (2, 3)', COLORS[1]),
                asymptote('vertical', 2, 'Axis: x = 2'),
                note(-5.3, 7, 'Reflect, vertical stretch ×2, right 2, up 3', '#1d4ed8')
            );
        } else if (type === 'quadratic') {
            state.document.functionXMin = -2; state.document.functionXMax = 6; state.document.functionYMin = -4; state.document.functionYMax = 8;
            state.document.objects.push(
                curve('x^2-4*x+3', 'f(x) = x² − 4x + 3', COLORS[0]),
                point(1, 0, 'x-intercept (1, 0)'), point(3, 0, 'x-intercept (3, 0)'), point(0, 3, 'y-intercept (0, 3)'),
                point(2, -1, 'Turning point (2, −1)', COLORS[3]), asymptote('vertical', 2, 'Axis of symmetry x = 2')
            );
        } else if (type === 'rational') {
            state.document.functionXMin = -8; state.document.functionXMax = 10; state.document.functionYMin = -8; state.document.functionYMax = 8;
            state.document.objects.push(
                curve('(x+1)/(x-2)', 'f(x) = (x+1)/(x−2)', COLORS[0]),
                asymptote('vertical', 2, 'Vertical asymptote x = 2'),
                asymptote('horizontal', 1, 'Horizontal asymptote y = 1'),
                point(-1, 0, 'x-intercept (−1, 0)'), point(0, -0.5, 'y-intercept (0, −0.5)')
            );
        } else if (type === 'piecewise') {
            state.document.functionXMin = -8; state.document.functionXMax = 8; state.document.functionYMin = -6; state.document.functionYMax = 8;
            const c = curve('x', 'Piecewise function', COLORS[0]);
            c.pieces = [
                { expression: 'x+4', xMin: -8, xMax: -1, closedStart: false, closedEnd: false },
                { expression: 'x^2', xMin: -1, xMax: 2, closedStart: true, closedEnd: true },
                { expression: '6-x', xMin: 2, xMax: 8, closedStart: false, closedEnd: false }
            ];
            state.document.objects.push(c, point(-1, 1, '(−1, 1)', COLORS[1]), point(2, 4, '(2, 4)', COLORS[1]), note(-7, 7, 'Piecewise-defined function'));
        } else if (type === 'trig') {
            state.document.functionXMin = -6.5; state.document.functionXMax = 6.5; state.document.functionYMin = -4; state.document.functionYMax = 5;
            state.document.objects.push(
                curve('sin(x)', 'Parent: y = sin x', '#94a3b8', { dashed: true }),
                curve('2*sin(x-pi/2)+1', 'y = 2 sin(x−π/2) + 1', COLORS[0]),
                asymptote('horizontal', 1, 'Midline y = 1'), note(-6, 4.3, 'Amplitude 2 · phase shift π/2 · vertical shift 1', '#1d4ed8')
            );
        } else if (type === 'exp-log') {
            state.document.functionXMin = -6; state.document.functionXMax = 8; state.document.functionYMin = -5; state.document.functionYMax = 10;
            state.document.objects.push(
                curve('2^x', 'y = 2ˣ', COLORS[0]),
                curve('log(x)/log(2)', 'y = log₂x', COLORS[1], { xMin: 0.02, xMax: 8 }),
                asymptote('horizontal', 0, 'Exponential asymptote y = 0'),
                asymptote('vertical', 0, 'Logarithmic asymptote x = 0'),
                point(0, 1, '(0, 1)'), point(1, 0, '(1, 0)')
            );
        } else if (type === 'absolute') {
            state.document.functionXMin = -8; state.document.functionXMax = 8; state.document.functionYMin = -6; state.document.functionYMax = 8;
            state.document.objects.push(
                curve('abs(x)', 'Parent: y = |x|', '#94a3b8', { dashed: true }),
                curve('-abs(x+1)+4', 'y = −|x+1| + 4', COLORS[3]),
                point(-1, 4, 'Vertex (−1, 4)', COLORS[1]), asymptote('vertical', -1, 'Axis x = −1')
            );
        } else if (type === 'domain-range') {
            state.document.functionXMin = -8; state.document.functionXMax = 8; state.document.functionYMin = -5; state.document.functionYMax = 7;
            state.document.objects.push(
                { ...defaultObject('function-domain'), xStart: -3, xEnd: 5, label: 'Domain [−3, 5]' },
                curve('sqrt(x+3)', 'f(x) = √(x+3)', COLORS[0], { xMin: -3, xMax: 5 }),
                point(-3, 0, 'Endpoint (−3, 0)'), point(5, Math.sqrt(8), 'Endpoint (5, 2√2)'), note(-2.5, 6, 'Domain: [−3, 5] · Range: [0, 2√2]')
            );
        } else if (type === 'clear') {
            state.selectedId = null; pushHistory(); render(); setStatus('All function objects cleared.'); return;
        }
        state.selectedId = state.document.objects[0]?.id || null;
        pushHistory(); syncDocumentControls(); render(); setStatus(`${type} preset inserted.`);
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        state.document.objects = state.document.objects.filter((object) => object.id !== state.selectedId);
        state.selectedId = null; pushHistory(); render(); setStatus('Function object deleted.');
    }
    function duplicateSelected() {
        const object = selectedObject(); if (!object) return;
        const copy = clone(object); copy.id = uid(object.type);
        if ('x' in copy) copy.x += 0.5; if ('y' in copy) copy.y += 0.5;
        if ('value' in copy) copy.value += 0.5;
        if ('xStart' in copy) { copy.xStart += 0.5; copy.xEnd += 0.5; }
        copy.stroke = COLORS[state.document.objects.length % COLORS.length] || copy.stroke;
        state.document.objects.push(copy); state.selectedId = copy.id; pushHistory(); render(); setStatus('Function object duplicated.');
    }
    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Function Transformation document?')) return;
        state.document = createDocument(); state.selectedId = null; state.history = []; state.historyIndex = -1;
        pushHistory(); syncDocumentControls(); setTool('select'); render(); setStatus('New Function Transformation document.');
    }

    function makeToken() { return `[[qmx-diagram:${Diagram.encodeSpec(state.document)}]]`; }
    function insertIntoQuestion() {
        const textarea = state.context?.textarea;
        if (!textarea) { setStatus('No target question field was found.'); return; }
        const token = makeToken(); const range = state.context?.replaceRange; textarea.focus();
        if (range && Number.isInteger(range.start) && Number.isInteger(range.end)) textarea.setRangeText(token, range.start, range.end, 'end');
        else {
            const start = textarea.selectionStart ?? textarea.value.length, end = textarea.selectionEnd ?? start;
            const prefix = start > 0 && !/\n$/.test(textarea.value.slice(0, start)) ? '\n' : '';
            const suffix = end < textarea.value.length && !/^\n/.test(textarea.value.slice(end)) ? '\n' : '';
            textarea.setRangeText(prefix + token + suffix, start, end, 'end');
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        setStatus('Function Transformation diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) { return String(value || 'function-transformation').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'function-transformation'; }
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function exportSvg() { downloadBlob(new Blob([Diagram.svgMarkup(state.document)], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(state.document.title)}.svg`); setStatus('SVG exported.'); }
    function exportPng() {
        const svg = Diagram.svgMarkup(state.document), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas'); canvas.width = state.document.width; canvas.height = state.document.height;
            canvas.getContext('2d').drawImage(image, 0, 0); URL.revokeObjectURL(url);
            canvas.toBlob((blob) => blob && downloadBlob(blob, `${safeFilename(state.document.title)}.png`), 'image/png'); setStatus('PNG exported.');
        };
        image.onerror = () => { URL.revokeObjectURL(url); setStatus('PNG export failed.'); }; image.src = url;
    }

    function addStyles() {
        if (document.getElementById('qmx-function-transformation-editor-styles')) return;
        const style = document.createElement('style'); style.id = 'qmx-function-transformation-editor-styles';
        style.textContent = `.qmx-function-editor[hidden]{display:none!important}.qmx-function-editor{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);padding:14px;display:flex;align-items:center;justify-content:center;font:14px/1.35 "Segoe UI",Arial,sans-serif;color:#0f172a}.qmx-function-shell{width:min(1480px,calc(100vw - 28px));height:min(930px,calc(100vh - 28px));background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.35);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}.qmx-function-header,.qmx-function-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #dbe4ef}.qmx-function-footer{border-top:1px solid #dbe4ef;border-bottom:0}.qmx-function-title{font-weight:800;font-size:17px}.qmx-function-subtitle{font-size:12px;color:#64748b}.qmx-function-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.qmx-function-btn,.qmx-function-tool,.qmx-function-preset{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer}.qmx-function-btn:hover,.qmx-function-tool:hover,.qmx-function-preset:hover{border-color:#2563eb}.qmx-function-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}.qmx-function-btn.danger{color:#dc2626}.qmx-function-btn:disabled{opacity:.45;cursor:not-allowed}.qmx-function-main{min-height:0;display:grid;grid-template-columns:230px minmax(0,1fr) 320px;gap:10px;padding:10px;background:#e7eef7}.qmx-function-panel{background:#fff;border:1px solid #d7e0ec;border-radius:12px;padding:10px;overflow:auto;min-height:0}.qmx-function-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.qmx-function-tool{padding:8px 4px;min-height:55px}.qmx-function-tool small{display:block;font-weight:500;color:#64748b;margin-top:2px}.qmx-function-tool.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.qmx-function-section{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#475569;margin:14px 0 7px}.qmx-function-presets{display:grid;gap:7px}.qmx-function-canvas-wrap{background:#dfe7f1;border:1px solid #d1dbea;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px}.qmx-function-canvas{width:100%;min-width:520px}.qmx-function-svg{display:block;width:100%;height:auto;max-height:720px;background:#fff;box-shadow:0 6px 20px rgba(15,23,42,.12);touch-action:none}.qmx-function-selection-point{fill:none;stroke:#2563eb;stroke-width:3;stroke-dasharray:4 3;cursor:move}.qmx-function-selection-line{stroke:#2563eb;stroke-width:8;opacity:.18;cursor:move}.qmx-function-selection-rect{fill:#2563eb;fill-opacity:.06;stroke:#2563eb;stroke-width:2;stroke-dasharray:7 5;cursor:move}.qmx-function-field{margin:7px 0}.qmx-function-field label{display:block;font-weight:700;font-size:12px;margin-bottom:4px}.qmx-function-field input,.qmx-function-field select,.qmx-function-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:inherit}.qmx-function-field textarea{min-height:90px;resize:vertical}.qmx-function-grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-function-check{display:block;margin:8px 0}.qmx-function-type,.qmx-function-summary{margin-top:8px;padding:9px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px}.qmx-function-empty{color:#64748b;text-align:center;padding:20px 4px}.qmx-function-status{color:#64748b;min-height:18px}@media(max-width:920px){.qmx-function-editor{padding:0}.qmx-function-shell{width:100vw;height:100vh;border-radius:0}.qmx-function-main{grid-template-columns:175px minmax(0,1fr)}.qmx-function-main>.qmx-function-panel:last-child{grid-column:1/-1;max-height:350px}.qmx-function-title{font-size:15px}}`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return; addStyles();
        const root = document.createElement('div'); root.className = 'qmx-function-editor'; root.hidden = true;
        root.innerHTML = `<div class="qmx-function-shell" role="dialog" aria-modal="true" aria-label="Function Transformation editor">
          <header class="qmx-function-header"><div><div class="qmx-function-title">Function Transformation / Curve Sketching</div><div class="qmx-function-subtitle">Functions, transformations, intercepts, turning points, asymptotes, domains and piecewise graphs</div></div><div class="qmx-function-actions"><button class="qmx-function-btn" data-act="new">New</button><button class="qmx-function-btn" data-act="undo">Undo</button><button class="qmx-function-btn" data-act="redo">Redo</button><button class="qmx-function-btn" data-act="duplicate">Duplicate</button><button class="qmx-function-btn danger" data-act="delete">Delete</button><button class="qmx-function-btn" data-act="close">×</button></div></header>
          <main class="qmx-function-main">
            <aside class="qmx-function-panel"><strong>Function tools</strong><div class="qmx-function-tools" data-tools></div><div class="qmx-function-section">Curve presets</div><div class="qmx-function-presets"><button class="qmx-function-preset" data-preset="parent">Parent functions</button><button class="qmx-function-preset" data-preset="transform">Shift / stretch / reflection</button><button class="qmx-function-preset" data-preset="quadratic">Quadratic analysis</button><button class="qmx-function-preset" data-preset="rational">Rational asymptotes</button><button class="qmx-function-preset" data-preset="piecewise">Piecewise function</button><button class="qmx-function-preset" data-preset="trig">Trigonometric transformation</button><button class="qmx-function-preset" data-preset="exp-log">Exponential and logarithm</button><button class="qmx-function-preset" data-preset="absolute">Absolute-value transformation</button><button class="qmx-function-preset" data-preset="domain-range">Domain and range</button><button class="qmx-function-preset" data-preset="clear">Clear objects</button></div><p class="qmx-function-subtitle">Expressions support x, + − × ÷, powers, sin, cos, tan, abs, sqrt, exp, log, pi and e.</p></aside>
            <section class="qmx-function-canvas-wrap"><div class="qmx-function-canvas" data-canvas></div></section>
            <aside class="qmx-function-panel"><strong>Document</strong><div class="qmx-function-field"><label>Title</label><input data-doc="title"></div><div class="qmx-function-grid2"><div class="qmx-function-field"><label>Width</label><input type="number" min="480" max="2400" data-doc="width"></div><div class="qmx-function-field"><label>Height</label><input type="number" min="300" max="1800" data-doc="height"></div><div class="qmx-function-field"><label>X minimum</label><input type="number" step="0.1" data-doc="functionXMin"></div><div class="qmx-function-field"><label>X maximum</label><input type="number" step="0.1" data-doc="functionXMax"></div><div class="qmx-function-field"><label>Y minimum</label><input type="number" step="0.1" data-doc="functionYMin"></div><div class="qmx-function-field"><label>Y maximum</label><input type="number" step="0.1" data-doc="functionYMax"></div><div class="qmx-function-field"><label>Grid step</label><input type="number" min="0.01" step="0.1" data-doc="functionGridStep"></div><div class="qmx-function-field"><label>Background</label><input type="color" data-doc="background"></div></div><label class="qmx-function-check"><input type="checkbox" data-doc="functionShowGrid"> Show grid</label><label class="qmx-function-check"><input type="checkbox" data-doc="functionShowAxes"> Show axes</label><label class="qmx-function-check"><input type="checkbox" data-doc="functionShowTicks"> Show tick labels</label><label class="qmx-function-check"><input type="checkbox" data-doc="functionShowLegend"> Show legend</label><hr><strong>Selected object</strong><div data-selected></div><div class="qmx-function-summary" data-summary></div></aside>
          </main>
          <footer class="qmx-function-footer"><div class="qmx-function-status" data-status></div><div class="qmx-function-actions"><button class="qmx-function-btn" data-act="export-svg">Export SVG</button><button class="qmx-function-btn" data-act="export-png">Export PNG</button><button class="qmx-function-btn primary" data-act="insert">Insert into question</button></div></footer>
        </div>`;
        document.body.appendChild(root); state.root = root; state.canvas = root.querySelector('[data-canvas]');
        state.controls = { tools: root.querySelector('[data-tools]'), selected: root.querySelector('[data-selected]'), summary: root.querySelector('[data-summary]'), status: root.querySelector('[data-status]'), undo: root.querySelector('[data-act="undo"]'), redo: root.querySelector('[data-act="redo"]') };
        TOOL_DEFS.forEach(([id,label,bn]) => { const button = document.createElement('button'); button.className='qmx-function-tool'; button.dataset.tool=id; button.innerHTML=window.QmxDiagramToolButtonContent?window.QmxDiagramToolButtonContent(id,label,bn):`${esc(label)}<small>${esc(bn)}</small>`; state.controls.tools.appendChild(button); });
        root.addEventListener('click', onRootClick); root.addEventListener('change', onRootInput); root.addEventListener('input', onRootInput);
        document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp); document.addEventListener('keydown', onKeydown);
    }
    function setStatus(message) { if (state.controls.status) state.controls.status.textContent = message; }
    function open(context = {}) {
        buildEditor(); state.context = context;
        state.document = context.initialSpec ? Diagram.normalizeSpec(context.initialSpec) : createDocument();
        if (state.document.mode !== 'function-transformation') state.document = createDocument();
        state.selectedId = null; state.activeTool = 'select'; state.interaction = null; state.history = []; state.historyIndex = -1;
        pushHistory(); syncDocumentControls(); setTool('select'); render(); state.root.hidden = false;
        document.body.dataset.qmxFunctionOverflow = document.body.style.overflow || ''; document.body.style.overflow='hidden';
        setStatus(context.initialSpec ? 'Existing Function Transformation diagram loaded.' : 'Choose a function tool or curve preset.');
    }
    function close() {
        if (!state.root || state.root.hidden) return; state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxFunctionOverflow || ''; delete document.body.dataset.qmxFunctionOverflow; state.context?.textarea?.focus?.();
    }
    function findTokenTextarea(token) { return Array.from(document.querySelectorAll('textarea')).find((textarea) => textarea.value.includes(token)) || null; }
    function openFromPreview(figure) {
        const payload = String(figure?.dataset.qmxDiagramPayload || ''); if (!payload) return false;
        let spec; try { spec = Diagram.decodePayload(payload); } catch (error) { return false; }
        if (spec.mode !== 'function-transformation') return false;
        const token = `[[qmx-diagram:${payload}]]`; const textarea = findTokenTextarea(token) || window.QmxDiagramLauncher?.getActiveTextarea?.();
        let replaceRange = null; if (textarea) { const start = textarea.value.indexOf(token); if (start >= 0) replaceRange = { start, end: start + token.length }; }
        open({ tool: { id: 'function-transformation' }, textarea, initialSpec: spec, replaceRange, editMode: true }); return true;
    }
    function registerHandlers() {
        const launcher = window.QmxDiagramLauncher; if (!launcher?.registerToolHandler) return false; let registered = false;
        ['function-transformation','function-graph','curve-sketching','curve-sketch','function-curve','transformation-graph'].forEach((id) => { try { launcher.registerToolHandler(id, open); registered = true; } catch (error) {} });
        return registered;
    }
    function onKeydown(event) {
        if (!state.root || state.root.hidden) return; const editing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
        if (event.key === 'Escape') { close(); event.preventDefault(); return; }
        if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) { event.preventDefault(); deleteSelected(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && !editing) { event.preventDefault(); duplicateSelected(); }
    }
    function init() { buildEditor(); if (!registerHandlers()) document.addEventListener('qmx:diagram-launcher-ready', registerHandlers, { once: true }); }
    window.QmxFunctionTransformationEditor = Object.freeze({ version: '1.0.0', open, close, openFromPreview });
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})(window, document);
