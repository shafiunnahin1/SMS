(function (window, document) {
    'use strict';

    if (window.QmxComplexPlaneEditor?.version) return;
    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Complex Plane] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['complex-point', 'Complex point', 'জটিল বিন্দু'],
        ['complex-vector', 'Vector from origin', 'মূলবিন্দু থেকে ভেক্টর'],
        ['complex-circle', 'Modulus / locus circle', 'মডুলাস / লোকাস বৃত্ত'],
        ['complex-arc', 'Argument arc', 'আর্গুমেন্ট চাপ'],
        ['complex-line', 'Locus line', 'লোকাস সরলরেখা'],
        ['complex-region', 'Polar region', 'পোলার অঞ্চল'],
        ['text', 'Annotation', 'টীকা']
    ];
    const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2', '#db2777', '#475569'];
    const state = {
        root: null, canvas: null, svg: null, context: null, document: null,
        selectedId: null, activeTool: 'select', interaction: null,
        history: [], historyIndex: -1, controls: {}
    };

    function uid(prefix = 'complex') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]); }
    function clamp(value, min, max, fallback = min) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
    function selectedObject() { return state.document?.objects.find((object) => object.id === state.selectedId) || null; }
    function snapValue(value) { const step = Number(state.document?.complexGridStep || 1); return state.document?.snap ? Math.round(value / step) * step : value; }
    function formatComplex(re, im) {
        const a = Math.abs(re) < 1e-9 ? 0 : Number(re.toFixed(3));
        const b = Math.abs(im) < 1e-9 ? 0 : Number(im.toFixed(3));
        if (b === 0) return `${a}`;
        if (a === 0) return `${b === 1 ? '' : b === -1 ? '−' : b}i`;
        return `${a} ${b >= 0 ? '+' : '−'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}i`;
    }

    function createDocument() {
        return {
            version: 20,
            id: uid('complex-plane'),
            mode: 'complex-plane',
            title: 'Complex Plane / Argand & Polar Diagram',
            width: 1000,
            height: 600,
            background: '#ffffff',
            gridSize: 20,
            complexXMin: -6,
            complexXMax: 6,
            complexYMin: -5,
            complexYMax: 5,
            complexGridStep: 1,
            complexShowGrid: true,
            complexShowAxes: true,
            complexShowTicks: true,
            complexShowPolarGrid: false,
            complexShowLabels: true,
            snap: true,
            objects: []
        };
    }

    function defaultObject(type) {
        if (type === 'complex-point') return {
            id: uid(type), type, re: 3, im: 2, label: 'z = 3 + 2i',
            color: '#dc2626', radius: 6, filled: true, showProjection: true, showValue: true
        };
        if (type === 'complex-vector') return {
            id: uid(type), type, re: 4, im: 3, label: 'z',
            color: '#2563eb', lineWidth: 3, dashed: false, showComponents: false
        };
        if (type === 'complex-circle') return {
            id: uid(type), type, centerRe: 0, centerIm: 0, radius: 3,
            label: '|z| = 3', stroke: '#7c3aed', fill: '#c4b5fd', fillOpacity: 0.08,
            lineWidth: 2.5, dashed: false
        };
        if (type === 'complex-arc') return {
            id: uid(type), type, radius: 1.5, startAngle: 0, endAngle: 45,
            label: 'arg z = 45°', stroke: '#ea580c', lineWidth: 3, dashed: false, arrow: true
        };
        if (type === 'complex-line') return {
            id: uid(type), type, x1: -5, y1: -1, x2: 5, y2: 3,
            label: 'Locus', stroke: '#16a34a', lineWidth: 2.5, dashed: true
        };
        if (type === 'complex-region') return {
            id: uid(type), type, innerRadius: 1.5, outerRadius: 4,
            startAngle: 25, endAngle: 120, label: 'Polar region',
            fill: '#93c5fd', fillOpacity: 0.28, stroke: '#2563eb', lineWidth: 2, dashed: false
        };
        return {
            id: uid('text'), type: 'text', re: -5.2, im: 4.2,
            text: 'Argand diagram', color: '#0f172a', fontSize: 18, fontWeight: 'bold'
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
        syncDocumentControls(); render(); updateHistoryButtons();
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
        if ('re' in object && object.type !== 'text') { object.re += (count % 3) * 0.4; object.im -= (count % 2) * 0.4; }
        if (object.type === 'text') object.im -= count * 0.3;
        state.document.objects.push(object); state.selectedId = object.id;
        pushHistory(); render(); setStatus(`${object.label || object.text || object.type} added.`);
    }

    function plotMetrics() { const d = state.document; return { left: 76, right: d.width - 36, top: 34, bottom: d.height - 58 }; }
    function coordToPixel(re, im) {
        const d = state.document, m = plotMetrics();
        return {
            x: m.left + ((re - d.complexXMin) / (d.complexXMax - d.complexXMin)) * (m.right - m.left),
            y: m.bottom - ((im - d.complexYMin) / (d.complexYMax - d.complexYMin)) * (m.bottom - m.top)
        };
    }
    function pixelToCoord(px, py) {
        const d = state.document, m = plotMetrics();
        return {
            re: d.complexXMin + ((px - m.left) / (m.right - m.left)) * (d.complexXMax - d.complexXMin),
            im: d.complexYMin + ((m.bottom - py) / (m.bottom - m.top)) * (d.complexYMax - d.complexYMin)
        };
    }
    function localPoint(event) {
        if (!state.svg) return { x: 0, y: 0 };
        const p = state.svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
        const matrix = state.svg.getScreenCTM(); return matrix ? p.matrixTransform(matrix.inverse()) : p;
    }

    function selectionMarkup(object) {
        if (!object) return '';
        if (object.type === 'complex-point' || object.type === 'complex-vector') {
            const p = coordToPixel(object.re, object.im);
            return `<circle class="qmx-complex-selection-point" cx="${p.x}" cy="${p.y}" r="13" data-object-id="${esc(object.id)}" data-handle="move"/>`;
        }
        if (object.type === 'complex-circle') {
            const c = coordToPixel(object.centerRe, object.centerIm), edge = coordToPixel(object.centerRe + object.radius, object.centerIm);
            return `<circle class="qmx-complex-selection-shape" cx="${c.x}" cy="${c.y}" r="${Math.abs(edge.x-c.x)}" data-object-id="${esc(object.id)}" data-handle="move"/>`;
        }
        if (object.type === 'complex-line') {
            const a = coordToPixel(object.x1, object.y1), b = coordToPixel(object.x2, object.y2);
            return `<line class="qmx-complex-selection-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" data-object-id="${esc(object.id)}" data-handle="move"/>`;
        }
        if (object.type === 'text') {
            const p = coordToPixel(object.re, object.im);
            return `<rect class="qmx-complex-selection-rect" x="${p.x-7}" y="${p.y-object.fontSize-7}" width="${Math.max(80,String(object.text).length*object.fontSize*.56)}" height="${object.fontSize+16}" data-object-id="${esc(object.id)}" data-handle="move"/>`;
        }
        const origin = coordToPixel(0, 0);
        return `<circle class="qmx-complex-selection-point" cx="${origin.x}" cy="${origin.y}" r="14" data-object-id="${esc(object.id)}" data-handle="move"/>`;
    }

    function render() {
        if (!state.canvas || !state.document) return;
        state.document = Diagram.normalizeSpec(state.document);
        const body = Diagram.svgMarkup(state.document).replace(/^<svg[^>]*>|<\/svg>$/g, '');
        state.canvas.innerHTML = `<svg class="qmx-complex-svg" viewBox="0 0 ${state.document.width} ${state.document.height}" tabindex="0" aria-label="Complex plane canvas">${body}${selectionMarkup(selectedObject())}</svg>`;
        state.svg = state.canvas.querySelector('svg');
        state.svg.addEventListener('click', (event) => {
            const target = event.target.closest('[data-object-id]');
            state.selectedId = target ? target.dataset.objectId : null;
            render();
        });
        state.svg.addEventListener('pointerdown', onPointerDown);
        syncSelectionControls(); updateSummary();
    }

    function onPointerDown(event) {
        const target = event.target.closest('[data-object-id]');
        if (!target || state.activeTool !== 'select') return;
        const object = state.document.objects.find((item) => item.id === target.dataset.objectId);
        if (!object) return;
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
        const point = localPoint(event), start = pixelToCoord(state.interaction.start.x, state.interaction.start.y), now = pixelToCoord(point.x, point.y);
        const dre = now.re - start.re, dim = now.im - start.im;
        Object.assign(object, clone(state.interaction.original));
        if (object.type === 'complex-point' || object.type === 'complex-vector' || object.type === 'text') {
            object.re = snapValue(object.re + dre); object.im = snapValue(object.im + dim);
            if (object.type === 'complex-point' && object.showValue) object.label = `z = ${formatComplex(object.re, object.im)}`;
        } else if (object.type === 'complex-circle') {
            object.centerRe = snapValue(object.centerRe + dre); object.centerIm = snapValue(object.centerIm + dim);
        } else if (object.type === 'complex-line') {
            object.x1 = snapValue(object.x1 + dre); object.x2 = snapValue(object.x2 + dre); object.y1 = snapValue(object.y1 + dim); object.y2 = snapValue(object.y2 + dim);
        } else if (object.type === 'complex-arc') {
            const angle = Math.atan2(now.im, now.re) * 180 / Math.PI; object.endAngle = Math.round(angle);
        } else if (object.type === 'complex-region') {
            const radius = Math.hypot(now.re, now.im); object.outerRadius = Math.max(object.innerRadius + 0.1, Number(radius.toFixed(2)));
        }
        render();
    }
    function onPointerUp() { if (!state.interaction) return; state.interaction = null; pushHistory(); render(); setStatus('Complex-plane object updated.'); }

    function field(label, prop, type = 'text', attrs = '') {
        const object = selectedObject();
        return `<div class="qmx-complex-field"><label>${label}</label><input type="${type}" data-prop="${prop}" value="${esc(object?.[prop] ?? '')}" ${attrs}></div>`;
    }
    function check(label, prop) { const object = selectedObject(); return `<label class="qmx-complex-check"><input type="checkbox" data-prop="${prop}" ${object?.[prop] ? 'checked' : ''}> ${label}</label>`; }
    function selectedFields(object) {
        if (!object) return '<p class="qmx-complex-empty">Select a complex point, vector, circle, arc, locus line, polar region or annotation.</p>';
        if (object.type === 'complex-point') return `<div class="qmx-complex-type">complex-point</div><div class="qmx-complex-grid2">${field('Real part','re','number','step="0.1"')}${field('Imaginary part','im','number','step="0.1"')}${field('Label','label')}${field('Colour','color','color')}${field('Radius','radius','number','min="2" max="30"')}</div>${check('Filled point','filled')}${check('Show projections','showProjection')}${check('Auto value label','showValue')}`;
        if (object.type === 'complex-vector') return `<div class="qmx-complex-type">complex-vector</div><div class="qmx-complex-grid2">${field('Real component','re','number','step="0.1"')}${field('Imaginary component','im','number','step="0.1"')}${field('Label','label')}${field('Colour','color','color')}${field('Line width','lineWidth','number','min="0.5" max="20" step="0.5"')}</div>${check('Dashed vector','dashed')}${check('Show components','showComponents')}`;
        if (object.type === 'complex-circle') return `<div class="qmx-complex-type">complex-circle</div><div class="qmx-complex-grid2">${field('Centre Re','centerRe','number','step="0.1"')}${field('Centre Im','centerIm','number','step="0.1"')}${field('Radius','radius','number','min="0.1" step="0.1"')}${field('Label','label')}${field('Stroke','stroke','color')}${field('Fill','fill','color')}${field('Fill opacity','fillOpacity','number','min="0" max="1" step="0.05"')}${field('Line width','lineWidth','number','min="0.5" max="20" step="0.5"')}</div>${check('Dashed circle','dashed')}`;
        if (object.type === 'complex-arc') return `<div class="qmx-complex-type">complex-arc</div><div class="qmx-complex-grid2">${field('Radius','radius','number','min="0.1" step="0.1"')}${field('Start angle °','startAngle','number','step="1"')}${field('End angle °','endAngle','number','step="1"')}${field('Label','label')}${field('Stroke','stroke','color')}${field('Line width','lineWidth','number','min="0.5" max="20" step="0.5"')}</div>${check('Dashed arc','dashed')}${check('Arrow end','arrow')}`;
        if (object.type === 'complex-line') return `<div class="qmx-complex-type">complex-line</div><div class="qmx-complex-grid2">${field('X1','x1','number','step="0.1"')}${field('Y1','y1','number','step="0.1"')}${field('X2','x2','number','step="0.1"')}${field('Y2','y2','number','step="0.1"')}${field('Label','label')}${field('Stroke','stroke','color')}${field('Line width','lineWidth','number','min="0.5" max="20" step="0.5"')}</div>${check('Dashed line','dashed')}`;
        if (object.type === 'complex-region') return `<div class="qmx-complex-type">complex-region</div><div class="qmx-complex-grid2">${field('Inner radius','innerRadius','number','min="0" step="0.1"')}${field('Outer radius','outerRadius','number','min="0.1" step="0.1"')}${field('Start angle °','startAngle','number','step="1"')}${field('End angle °','endAngle','number','step="1"')}${field('Label','label')}${field('Fill','fill','color')}${field('Fill opacity','fillOpacity','number','min="0" max="1" step="0.05"')}${field('Stroke','stroke','color')}${field('Line width','lineWidth','number','min="0.5" max="20" step="0.5"')}</div>${check('Dashed border','dashed')}`;
        return `<div class="qmx-complex-type">text</div><div class="qmx-complex-field"><label>Text</label><textarea data-prop="text">${esc(object.text)}</textarea></div><div class="qmx-complex-grid2">${field('Real coordinate','re','number','step="0.1"')}${field('Imaginary coordinate','im','number','step="0.1"')}${field('Colour','color','color')}${field('Font size','fontSize','number','min="8" max="96"')}</div><label class="qmx-complex-check"><input type="checkbox" data-prop="fontWeight" ${object.fontWeight === 'bold' ? 'checked' : ''}> Bold</label>`;
    }
    function syncSelectionControls() { if (state.controls.selected) state.controls.selected.innerHTML = selectedFields(selectedObject()); }
    function updateSummary() {
        if (!state.controls.summary) return;
        const counts = {}; state.document.objects.forEach((object) => counts[object.type] = (counts[object.type] || 0) + 1);
        state.controls.summary.textContent = `${state.document.objects.length} object(s) · ${Object.entries(counts).map(([key,value]) => `${value} ${key.replace('complex-','')}`).join(' · ')}`;
    }
    function syncDocumentControls() {
        state.root?.querySelectorAll('[data-doc]').forEach((input) => {
            const key = input.dataset.doc; if (input.type === 'checkbox') input.checked = Boolean(state.document[key]); else input.value = state.document[key] ?? '';
        });
    }

    function onRootInput(event) {
        if (event.type === 'input' && !event.target.matches('textarea[data-prop="text"]')) return;
        const input = event.target;
        if (input.dataset.doc) {
            const key = input.dataset.doc; let value = input.type === 'checkbox' ? input.checked : input.value;
            if (input.type === 'number') value = Number(value); state.document[key] = value;
            if (key === 'width') state.document.width = clamp(value, 480, 2400, 1000);
            if (key === 'height') state.document.height = clamp(value, 300, 1800, 600);
            if (key === 'complexXMax' && value <= state.document.complexXMin) state.document.complexXMax = state.document.complexXMin + 1;
            if (key === 'complexYMax' && value <= state.document.complexYMin) state.document.complexYMax = state.document.complexYMin + 1;
            pushHistory(); render(); return;
        }
        if (input.dataset.prop) {
            const object = selectedObject(); if (!object) return; const key = input.dataset.prop;
            let value = input.type === 'checkbox' ? input.checked : input.value; if (input.type === 'number') value = Number(value);
            if (key === 'fontWeight') value = input.checked ? 'bold' : 'normal'; object[key] = value;
            if (object.type === 'complex-point' && object.showValue && ['re','im'].includes(key)) object.label = `z = ${formatComplex(Number(object.re), Number(object.im))}`;
            pushHistory(); render();
        }
    }
    function onRootClick(event) {
        const toolButton = event.target.closest('[data-tool]'); if (toolButton) { setTool(toolButton.dataset.tool); return; }
        const preset = event.target.closest('[data-preset]'); if (preset) { applyPreset(preset.dataset.preset); return; }
        const action = event.target.closest('[data-act]')?.dataset.act; if (!action) return;
        ({ new: newDocument, undo, redo, duplicate: duplicateSelected, delete: deleteSelected, close,
           insert: insertIntoQuestion, 'export-svg': exportSvg, 'export-png': exportPng }[action] || (() => {}))();
    }

    function point(re, im, label, color = '#dc2626', extras = {}) { return { ...defaultObject('complex-point'), re, im, label, color, ...extras }; }
    function vector(re, im, label, color = '#2563eb', extras = {}) { return { ...defaultObject('complex-vector'), re, im, label, color, ...extras }; }
    function circle(centerRe, centerIm, radius, label, stroke = '#7c3aed', extras = {}) { return { ...defaultObject('complex-circle'), centerRe, centerIm, radius, label, stroke, ...extras }; }
    function arc(radius, startAngle, endAngle, label, stroke = '#ea580c', extras = {}) { return { ...defaultObject('complex-arc'), radius, startAngle, endAngle, label, stroke, ...extras }; }
    function line(x1, y1, x2, y2, label, stroke = '#16a34a', extras = {}) { return { ...defaultObject('complex-line'), x1, y1, x2, y2, label, stroke, ...extras }; }
    function note(re, im, text, color = '#0f172a') { return { ...defaultObject('text'), re, im, text, color }; }

    function applyPreset(type) {
        state.document.objects = []; state.document.complexShowPolarGrid = false;
        if (type === 'argand') {
            state.document.objects.push(point(3,2,'z₁ = 3 + 2i'), point(-2,1,'z₂ = −2 + i','#16a34a'), vector(3,2,'z₁'), vector(-2,1,'z₂','#16a34a'), note(-5.5,4.3,'Complex numbers on the Argand plane'));
        } else if (type === 'conjugate') {
            state.document.objects.push(point(3,2,'z = 3 + 2i'), point(3,-2,'z̄ = 3 − 2i','#2563eb'), vector(3,2,'z','#dc2626'), vector(3,-2,'z̄','#2563eb'), line(-6,0,6,0,'Reflection axis: real axis','#64748b',{ dashed:true }), note(-5.5,4.3,'Conjugate points are reflections in the real axis'));
        } else if (type === 'roots') {
            state.document.complexXMin=-1.7; state.document.complexXMax=1.7; state.document.complexYMin=-1.5; state.document.complexYMax=1.5; state.document.complexShowPolarGrid=true;
            state.document.objects.push(circle(0,0,1,'|z| = 1','#7c3aed'));
            for (let k=0;k<6;k++) { const a=2*Math.PI*k/6; state.document.objects.push(point(Math.cos(a),Math.sin(a),`ω${k}` , COLORS[k%COLORS.length], { showProjection:false, showValue:false, radius:5 })); }
            state.document.objects.push(note(-1.55,1.35,'Sixth roots of unity'));
        } else if (type === 'modulus-argument') {
            state.document.objects.push(vector(4,3,'z = 4 + 3i','#2563eb',{ showComponents:true }), point(4,3,'z = 4 + 3i','#dc2626'), circle(0,0,5,'|z| = 5','#7c3aed',{ dashed:true }), arc(1.8,0,36.87,'arg z ≈ 36.87°'), note(-5.5,4.3,'|z| = 5 and arg z = tan⁻¹(3/4)'));
        } else if (type === 'circle-locus') {
            state.document.objects.push(point(2,1,'a = 2 + i','#dc2626'), circle(2,1,3,'|z − (2+i)| = 3','#2563eb',{ fill:'#bfdbfe', fillOpacity:0.12 }), note(-5.5,4.3,'Circle locus with centre a and radius 3'));
        } else if (type === 'bisector') {
            state.document.objects.push(point(-2,1,'a = −2 + i','#dc2626'), point(3,-1,'b = 3 − i','#2563eb'), line(-1.5,-5,2.5,5,'|z − a| = |z − b|','#16a34a',{ dashed:false }), line(-2,1,3,-1,'segment ab','#94a3b8',{ dashed:true }), note(-5.5,4.3,'Perpendicular-bisector locus'));
        } else if (type === 'polar-region') {
            state.document.complexShowPolarGrid=true;
            state.document.objects.push({ ...defaultObject('complex-region'), innerRadius:1.5, outerRadius:4.5, startAngle:30, endAngle:125, label:'1.5 ≤ |z| ≤ 4.5, 30° ≤ arg z ≤ 125°' }, arc(4.5,30,125,'argument bounds','#7c3aed'), note(-5.5,4.3,'Polar annular sector'));
        } else if (type === 'rotation') {
            state.document.complexShowPolarGrid=true;
            state.document.objects.push(vector(3,1,'z = 3 + i','#2563eb'), vector(-1,3,'iz = −1 + 3i','#dc2626'), point(3,1,'z','#2563eb',{ showProjection:false, showValue:false }), point(-1,3,'iz','#dc2626',{ showProjection:false, showValue:false }), arc(1.7,18.435,108.435,'× i rotates 90°','#ea580c'), note(-5.5,4.3,'Multiplication by i: rotation through 90°'));
        } else if (type === 'clear') {
            state.selectedId = null; pushHistory(); render(); setStatus('All complex-plane objects cleared.'); return;
        }
        state.selectedId = state.document.objects[0]?.id || null; pushHistory(); syncDocumentControls(); render(); setStatus(`${type} preset inserted.`);
    }

    function deleteSelected() { if (!state.selectedId) return; state.document.objects = state.document.objects.filter((object) => object.id !== state.selectedId); state.selectedId=null; pushHistory(); render(); setStatus('Complex-plane object deleted.'); }
    function duplicateSelected() {
        const object = selectedObject(); if (!object) return; const copy = clone(object); copy.id = uid(object.type);
        if ('re' in copy) copy.re += 0.5; if ('im' in copy) copy.im += 0.5; if ('centerRe' in copy) { copy.centerRe += 0.5; copy.centerIm += 0.5; }
        if ('x1' in copy) { copy.x1 += 0.5; copy.x2 += 0.5; copy.y1 += 0.5; copy.y2 += 0.5; }
        state.document.objects.push(copy); state.selectedId=copy.id; pushHistory(); render(); setStatus('Complex-plane object duplicated.');
    }
    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Complex Plane document?')) return;
        state.document=createDocument(); state.selectedId=null; state.history=[]; state.historyIndex=-1; pushHistory(); syncDocumentControls(); setTool('select'); render(); setStatus('New Complex Plane document.');
    }

    function makeToken() { return `[[qmx-diagram:${Diagram.encodeSpec(state.document)}]]`; }
    function insertIntoQuestion() {
        const textarea=state.context?.textarea; if (!textarea) { setStatus('No target question field was found.'); return; }
        const token=makeToken(), range=state.context?.replaceRange; textarea.focus();
        if (range && Number.isInteger(range.start) && Number.isInteger(range.end)) textarea.setRangeText(token,range.start,range.end,'end');
        else { const start=textarea.selectionStart??textarea.value.length, end=textarea.selectionEnd??start; const prefix=start>0&&!/\n$/.test(textarea.value.slice(0,start))?'\n':''; const suffix=end<textarea.value.length&&!/^\n/.test(textarea.value.slice(end))?'\n':''; textarea.setRangeText(prefix+token+suffix,start,end,'end'); }
        textarea.dispatchEvent(new Event('input',{bubbles:true})); textarea.dispatchEvent(new Event('change',{bubbles:true}));
        setStatus('Complex Plane diagram inserted. Save the question to persist it.'); window.setTimeout(close,220);
    }
    function safeFilename(value) { return String(value||'complex-plane').replace(/[\\/:*?"<>|]+/g,'-').trim()||'complex-plane'; }
    function downloadBlob(blob,filename) { const url=URL.createObjectURL(blob), link=document.createElement('a'); link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),1000); }
    function exportSvg() { downloadBlob(new Blob([Diagram.svgMarkup(state.document)],{type:'image/svg+xml;charset=utf-8'}),`${safeFilename(state.document.title)}.svg`); setStatus('SVG exported.'); }
    function exportPng() {
        const svg=Diagram.svgMarkup(state.document), url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})), image=new Image();
        image.onload=()=>{ const canvas=document.createElement('canvas'); canvas.width=state.document.width; canvas.height=state.document.height; canvas.getContext('2d').drawImage(image,0,0); URL.revokeObjectURL(url); canvas.toBlob((blob)=>blob&&downloadBlob(blob,`${safeFilename(state.document.title)}.png`),'image/png'); setStatus('PNG exported.'); };
        image.onerror=()=>{URL.revokeObjectURL(url);setStatus('PNG export failed.');}; image.src=url;
    }

    function addStyles() {
        if (document.getElementById('qmx-complex-plane-editor-styles')) return;
        const style=document.createElement('style'); style.id='qmx-complex-plane-editor-styles';
        style.textContent=`.qmx-complex-editor[hidden]{display:none!important}.qmx-complex-editor{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);padding:14px;display:flex;align-items:center;justify-content:center;font:14px/1.35 "Segoe UI",Arial,sans-serif;color:#0f172a}.qmx-complex-shell{width:min(1480px,calc(100vw - 28px));height:min(930px,calc(100vh - 28px));background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.35);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}.qmx-complex-header,.qmx-complex-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #dbe4ef}.qmx-complex-footer{border-top:1px solid #dbe4ef;border-bottom:0}.qmx-complex-title{font-weight:800;font-size:17px}.qmx-complex-subtitle{font-size:12px;color:#64748b}.qmx-complex-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.qmx-complex-btn,.qmx-complex-tool,.qmx-complex-preset{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer}.qmx-complex-btn:hover,.qmx-complex-tool:hover,.qmx-complex-preset:hover{border-color:#2563eb}.qmx-complex-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}.qmx-complex-btn.danger{color:#dc2626}.qmx-complex-btn:disabled{opacity:.45;cursor:not-allowed}.qmx-complex-main{min-height:0;display:grid;grid-template-columns:240px minmax(0,1fr) 320px;gap:10px;padding:10px;background:#e7eef7}.qmx-complex-panel{background:#fff;border:1px solid #d7e0ec;border-radius:12px;padding:10px;overflow:auto;min-height:0}.qmx-complex-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.qmx-complex-tool{padding:8px 4px;min-height:55px}.qmx-complex-tool small{display:block;font-weight:500;color:#64748b;margin-top:2px}.qmx-complex-tool.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.qmx-complex-section{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#475569;margin:14px 0 7px}.qmx-complex-presets{display:grid;gap:7px}.qmx-complex-canvas-wrap{background:#dfe7f1;border:1px solid #d1dbea;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px}.qmx-complex-canvas{width:100%;min-width:520px}.qmx-complex-svg{display:block;width:100%;height:auto;max-height:720px;background:#fff;box-shadow:0 6px 20px rgba(15,23,42,.12);touch-action:none}.qmx-complex-selection-point{fill:none;stroke:#2563eb;stroke-width:3;stroke-dasharray:4 3;cursor:move}.qmx-complex-selection-line{stroke:#2563eb;stroke-width:10;opacity:.18;cursor:move}.qmx-complex-selection-shape,.qmx-complex-selection-rect{fill:#2563eb;fill-opacity:.05;stroke:#2563eb;stroke-width:2;stroke-dasharray:7 5;cursor:move}.qmx-complex-field{margin:7px 0}.qmx-complex-field label{display:block;font-weight:700;font-size:12px;margin-bottom:4px}.qmx-complex-field input,.qmx-complex-field select,.qmx-complex-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:inherit}.qmx-complex-field textarea{min-height:86px;resize:vertical}.qmx-complex-grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-complex-check{display:block;margin:8px 0}.qmx-complex-type,.qmx-complex-summary{margin-top:8px;padding:9px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px}.qmx-complex-empty{color:#64748b;text-align:center;padding:20px 4px}.qmx-complex-status{color:#64748b;min-height:18px}@media(max-width:920px){.qmx-complex-editor{padding:0}.qmx-complex-shell{width:100vw;height:100vh;border-radius:0}.qmx-complex-main{grid-template-columns:175px minmax(0,1fr)}.qmx-complex-main>.qmx-complex-panel:last-child{grid-column:1/-1;max-height:350px}.qmx-complex-title{font-size:15px}}`;
        document.head.appendChild(style);
    }
    function buildEditor() {
        if (state.root) return; addStyles();
        const root=document.createElement('div'); root.className='qmx-complex-editor'; root.hidden=true;
        root.innerHTML=`<div class="qmx-complex-shell" role="dialog" aria-modal="true" aria-label="Complex Plane editor">
          <header class="qmx-complex-header"><div><div class="qmx-complex-title">Complex Plane / Argand & Polar Diagram</div><div class="qmx-complex-subtitle">Complex points, vectors, modulus, argument, loci, roots of unity and polar regions</div></div><div class="qmx-complex-actions"><button class="qmx-complex-btn" data-act="new">New</button><button class="qmx-complex-btn" data-act="undo">Undo</button><button class="qmx-complex-btn" data-act="redo">Redo</button><button class="qmx-complex-btn" data-act="duplicate">Duplicate</button><button class="qmx-complex-btn danger" data-act="delete">Delete</button><button class="qmx-complex-btn" data-act="close">×</button></div></header>
          <main class="qmx-complex-main">
            <aside class="qmx-complex-panel"><strong>Complex-plane tools</strong><div class="qmx-complex-tools" data-tools></div><div class="qmx-complex-section">Argand and polar presets</div><div class="qmx-complex-presets"><button class="qmx-complex-preset" data-preset="argand">Basic Argand plane</button><button class="qmx-complex-preset" data-preset="conjugate">Conjugate points</button><button class="qmx-complex-preset" data-preset="roots">Roots of unity</button><button class="qmx-complex-preset" data-preset="modulus-argument">Modulus and argument</button><button class="qmx-complex-preset" data-preset="circle-locus">Circle locus</button><button class="qmx-complex-preset" data-preset="bisector">Equal-distance locus</button><button class="qmx-complex-preset" data-preset="polar-region">Polar region</button><button class="qmx-complex-preset" data-preset="rotation">Multiplication / rotation</button><button class="qmx-complex-preset" data-preset="clear">Clear objects</button></div><p class="qmx-complex-subtitle">Drag points, vectors, circles, lines and annotations. Arc and polar-region handles are centred at the origin.</p></aside>
            <section class="qmx-complex-canvas-wrap"><div class="qmx-complex-canvas" data-canvas></div></section>
            <aside class="qmx-complex-panel"><strong>Document</strong><div class="qmx-complex-field"><label>Title</label><input data-doc="title"></div><div class="qmx-complex-grid2"><div class="qmx-complex-field"><label>Width</label><input type="number" min="480" max="2400" data-doc="width"></div><div class="qmx-complex-field"><label>Height</label><input type="number" min="300" max="1800" data-doc="height"></div><div class="qmx-complex-field"><label>Real minimum</label><input type="number" step="0.1" data-doc="complexXMin"></div><div class="qmx-complex-field"><label>Real maximum</label><input type="number" step="0.1" data-doc="complexXMax"></div><div class="qmx-complex-field"><label>Imaginary minimum</label><input type="number" step="0.1" data-doc="complexYMin"></div><div class="qmx-complex-field"><label>Imaginary maximum</label><input type="number" step="0.1" data-doc="complexYMax"></div><div class="qmx-complex-field"><label>Grid step</label><input type="number" min="0.01" step="0.1" data-doc="complexGridStep"></div><div class="qmx-complex-field"><label>Background</label><input type="color" data-doc="background"></div></div><label class="qmx-complex-check"><input type="checkbox" data-doc="complexShowGrid"> Show Cartesian grid</label><label class="qmx-complex-check"><input type="checkbox" data-doc="complexShowAxes"> Show real and imaginary axes</label><label class="qmx-complex-check"><input type="checkbox" data-doc="complexShowTicks"> Show tick labels</label><label class="qmx-complex-check"><input type="checkbox" data-doc="complexShowPolarGrid"> Show polar grid</label><label class="qmx-complex-check"><input type="checkbox" data-doc="complexShowLabels"> Show axis labels</label><label class="qmx-complex-check"><input type="checkbox" data-doc="snap"> Snap to grid</label><hr><strong>Selected object</strong><div data-selected></div><div class="qmx-complex-summary" data-summary></div></aside>
          </main>
          <footer class="qmx-complex-footer"><div class="qmx-complex-status" data-status></div><div class="qmx-complex-actions"><button class="qmx-complex-btn" data-act="export-svg">Export SVG</button><button class="qmx-complex-btn" data-act="export-png">Export PNG</button><button class="qmx-complex-btn primary" data-act="insert">Insert into question</button></div></footer>
        </div>`;
        document.body.appendChild(root); state.root=root; state.canvas=root.querySelector('[data-canvas]');
        state.controls={tools:root.querySelector('[data-tools]'),selected:root.querySelector('[data-selected]'),summary:root.querySelector('[data-summary]'),status:root.querySelector('[data-status]'),undo:root.querySelector('[data-act="undo"]'),redo:root.querySelector('[data-act="redo"]')};
        TOOL_DEFS.forEach(([id,label,bn])=>{const button=document.createElement('button');button.className='qmx-complex-tool';button.dataset.tool=id;button.innerHTML=window.QmxDiagramToolButtonContent?window.QmxDiagramToolButtonContent(id,label,bn):`${esc(label)}<small>${esc(bn)}</small>`;state.controls.tools.appendChild(button);});
        root.addEventListener('click',onRootClick);root.addEventListener('change',onRootInput);root.addEventListener('input',onRootInput);document.addEventListener('pointermove',onPointerMove);document.addEventListener('pointerup',onPointerUp);document.addEventListener('keydown',onKeydown);
    }
    function setStatus(message) { if (state.controls.status) state.controls.status.textContent=message; }
    function open(context={}) {
        buildEditor(); state.context=context; state.document=context.initialSpec?Diagram.normalizeSpec(context.initialSpec):createDocument(); if(state.document.mode!=='complex-plane')state.document=createDocument();
        state.selectedId=null;state.activeTool='select';state.interaction=null;state.history=[];state.historyIndex=-1;pushHistory();syncDocumentControls();setTool('select');render();state.root.hidden=false;document.body.dataset.qmxComplexOverflow=document.body.style.overflow||'';document.body.style.overflow='hidden';setStatus(context.initialSpec?'Existing Complex Plane diagram loaded.':'Choose a complex-plane tool or preset.');
    }
    function close() { if(!state.root||state.root.hidden)return;state.root.hidden=true;document.body.style.overflow=document.body.dataset.qmxComplexOverflow||'';delete document.body.dataset.qmxComplexOverflow;state.context?.textarea?.focus?.(); }
    function findTokenTextarea(token){return Array.from(document.querySelectorAll('textarea')).find((textarea)=>textarea.value.includes(token))||null;}
    function openFromPreview(figure){const payload=String(figure?.dataset.qmxDiagramPayload||'');if(!payload)return false;let spec;try{spec=Diagram.decodePayload(payload);}catch(error){return false;}if(spec.mode!=='complex-plane')return false;const token=`[[qmx-diagram:${payload}]]`;const textarea=findTokenTextarea(token)||window.QmxDiagramLauncher?.getActiveTextarea?.();let replaceRange=null;if(textarea){const start=textarea.value.indexOf(token);if(start>=0)replaceRange={start,end:start+token.length};}open({tool:{id:'complex-plane'},textarea,initialSpec:spec,replaceRange,editMode:true});return true;}
    function registerHandlers(){const launcher=window.QmxDiagramLauncher;if(!launcher?.registerToolHandler)return false;let registered=false;['complex-plane','argand-diagram','argand-plane','polar-diagram','complex-number-diagram','complex-locus'].forEach((id)=>{try{launcher.registerToolHandler(id,open);registered=true;}catch(error){}});return registered;}
    function onKeydown(event){if(!state.root||state.root.hidden)return;const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(event.key==='Escape'){close();event.preventDefault();return;}if((event.key==='Delete'||event.key==='Backspace')&&!editing){event.preventDefault();deleteSelected();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='d'&&!editing){event.preventDefault();duplicateSelected();}}
    function init(){buildEditor();if(!registerHandlers())document.addEventListener('qmx:diagram-launcher-ready',registerHandlers,{once:true});}
    window.QmxComplexPlaneEditor=Object.freeze({version:'1.0.0',open,close,openFromPreview});
    document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})(window, document);
