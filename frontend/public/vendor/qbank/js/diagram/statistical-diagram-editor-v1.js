(function (window, document) {
    'use strict';

    if (window.QmxStatisticalDiagramEditor?.version) return;
    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Statistical Diagram] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['stat-bar', 'Bar chart', 'দণ্ডচিত্র'],
        ['stat-histogram', 'Histogram', 'হিস্টোগ্রাম'],
        ['stat-frequency-polygon', 'Frequency polygon', 'গণসংখ্যা বহুভুজ'],
        ['stat-ogive', 'Ogive', 'ক্রমযোজিত রেখা'],
        ['stat-pie', 'Pie chart', 'বৃত্তচিত্র'],
        ['stat-box-plot', 'Box plot', 'বক্স প্লট'],
        ['stat-scatter', 'Scatter plot', 'বিক্ষেপ চিত্র']
    ];

    const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#475569'];

    const state = {
        root: null, canvas: null, svg: null, context: null, document: null,
        selectedId: null, activeTool: 'select', interaction: null,
        history: [], historyIndex: -1, controls: {}
    };

    function uid(prefix = 'stat') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]); }
    function clamp(value, min, max, fallback = min) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
    function selectedObject() { return state.document?.objects.find((object) => object.id === state.selectedId) || null; }

    function createDocument() {
        return {
            version: 18,
            id: uid('statistical-diagram'),
            mode: 'statistical-diagram',
            title: 'Statistical Diagram / Data Chart',
            width: 1000,
            height: 600,
            background: '#ffffff',
            gridSize: 20,
            statShowGrid: true,
            statShowLegend: true,
            statShowValues: true,
            statShowAxes: true,
            statXLabel: 'Category',
            statYLabel: 'Value',
            snap: true,
            objects: []
        };
    }

    function commonChart(type, title) {
        return {
            id: uid(type),
            type,
            x: 100,
            y: 80,
            w: 800,
            h: 430,
            title,
            labels: ['A', 'B', 'C', 'D', 'E'],
            values: [12, 20, 16, 28, 24],
            points: [{ x: 1, y: 2 }, { x: 2, y: 3.2 }, { x: 3, y: 4.1 }, { x: 4, y: 5.4 }, { x: 5, y: 5.9 }, { x: 6, y: 7.2 }],
            fiveNumber: [5, 12, 18, 26, 36],
            colors: COLORS.slice(),
            stroke: '#2563eb',
            fill: '#93c5fd',
            fillOpacity: 0.65,
            lineWidth: 3,
            showGrid: true,
            showLegend: true,
            showValues: true,
            showAxes: true,
            showTrendline: true,
            xLabel: 'Category',
            yLabel: 'Value'
        };
    }

    function defaultChart(type) {
        const titles = {
            'stat-bar': 'Bar Chart',
            'stat-histogram': 'Histogram',
            'stat-frequency-polygon': 'Frequency Polygon',
            'stat-ogive': 'Ogive / Cumulative Frequency',
            'stat-pie': 'Pie Chart',
            'stat-box-plot': 'Box Plot',
            'stat-scatter': 'Scatter Plot'
        };
        const object = commonChart(type, titles[type] || 'Statistical Chart');
        if (type === 'stat-histogram') {
            object.labels = ['0–10', '10–20', '20–30', '30–40', '40–50'];
            object.values = [4, 9, 15, 10, 6];
        } else if (type === 'stat-frequency-polygon') {
            object.labels = ['5', '15', '25', '35', '45'];
            object.values = [4, 9, 15, 10, 6];
        } else if (type === 'stat-ogive') {
            object.labels = ['10', '20', '30', '40', '50'];
            object.values = [4, 13, 28, 38, 44];
        } else if (type === 'stat-pie') {
            object.labels = ['Science', 'Arts', 'Commerce', 'Other'];
            object.values = [38, 26, 24, 12];
            object.showAxes = false;
            object.showGrid = false;
        } else if (type === 'stat-box-plot') {
            object.showAxes = true;
            object.showGrid = false;
            object.xLabel = 'Observed values';
            object.yLabel = '';
        } else if (type === 'stat-scatter') {
            object.showLegend = false;
            object.xLabel = 'X';
            object.yLabel = 'Y';
        }
        return object;
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
            addChart(tool);
            state.activeTool = 'select';
            state.controls.tools?.querySelector('[data-tool="select"]')?.classList.add('active');
            state.controls.tools?.querySelector(`[data-tool="${tool}"]`)?.classList.remove('active');
        }
    }

    function addChart(type) {
        const object = defaultChart(type);
        const offset = Math.min(80, state.document.objects.length * 22);
        object.x += offset;
        object.y += offset;
        object.w = Math.max(320, object.w - offset);
        object.h = Math.max(220, object.h - offset);
        state.document.objects.push(object);
        state.selectedId = object.id;
        pushHistory();
        render();
        setStatus(`${object.title} added.`);
    }

    function localPoint(event) {
        if (!state.svg) return { x: 0, y: 0 };
        const p = state.svg.createSVGPoint();
        p.x = event.clientX;
        p.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        return matrix ? p.matrixTransform(matrix.inverse()) : p;
    }

    function objectBounds(object) {
        return { x: object.x, y: object.y, w: object.w, h: object.h };
    }

    function translateObject(object, dx, dy) {
        object.x += dx;
        object.y += dy;
    }

    function handlesMarkup(object) {
        if (!object) return '';
        const b = objectBounds(object);
        const handle = (x, y, name) => `<circle class="qmx-stat-handle" cx="${x}" cy="${y}" r="7" data-object-id="${esc(object.id)}" data-handle="${name}"/>`;
        return `<rect class="qmx-stat-selection" x="${b.x - 8}" y="${b.y - 8}" width="${Math.max(16, b.w + 16)}" height="${Math.max(16, b.h + 16)}"/>${handle(b.x, b.y, 'nw')}${handle(b.x + b.w, b.y + b.h, 'se')}`;
    }

    function render() {
        if (!state.canvas || !state.document) return;
        state.document = Diagram.normalizeSpec(state.document);
        const body = Diagram.svgMarkup(state.document).replace(/^<svg[^>]*>|<\/svg>$/g, '');
        state.canvas.innerHTML = `<svg class="qmx-stat-svg" viewBox="0 0 ${state.document.width} ${state.document.height}" tabindex="0" aria-label="Statistical diagram canvas">${body}${handlesMarkup(selectedObject())}</svg>`;
        state.svg = state.canvas.querySelector('svg');
        state.svg.addEventListener('click', (event) => {
            const target = event.target.closest('[data-object-id]');
            if (target && !target.dataset.handle) {
                state.selectedId = target.dataset.objectId;
                render();
            } else if (!target) {
                state.selectedId = null;
                render();
            }
        });
        state.svg.addEventListener('pointerdown', onPointerDown);
        syncSelectionControls();
        updateSummary();
    }

    function onPointerDown(event) {
        const target = event.target.closest('[data-object-id]');
        if (!target || state.activeTool !== 'select') return;
        const object = state.document.objects.find((item) => item.id === target.dataset.objectId);
        if (!object) return;
        state.selectedId = object.id;
        const point = localPoint(event);
        state.interaction = {
            objectId: object.id,
            handle: target.dataset.handle || 'move',
            start: point,
            original: clone(object)
        };
        target.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    }

    function onPointerMove(event) {
        if (!state.interaction || !state.svg) return;
        const object = state.document.objects.find((item) => item.id === state.interaction.objectId);
        if (!object) return;
        const point = localPoint(event);
        const original = state.interaction.original;
        const dx = point.x - state.interaction.start.x;
        const dy = point.y - state.interaction.start.y;
        Object.assign(object, clone(original));
        if (state.interaction.handle === 'move') translateObject(object, dx, dy);
        else if (state.interaction.handle === 'nw') {
            const right = original.x + original.w;
            const bottom = original.y + original.h;
            object.x = Math.min(point.x, right - 180);
            object.y = Math.min(point.y, bottom - 140);
            object.w = right - object.x;
            object.h = bottom - object.y;
        } else if (state.interaction.handle === 'se') {
            object.w = Math.max(180, point.x - original.x);
            object.h = Math.max(140, point.y - original.y);
        }
        render();
    }

    function onPointerUp() {
        if (!state.interaction) return;
        state.interaction = null;
        pushHistory();
        render();
        setStatus('Chart updated.');
    }

    function pairsText(object) {
        if (object.type === 'stat-scatter') return (object.points || []).map((point) => `${point.x}, ${point.y}`).join('\n');
        if (object.type === 'stat-box-plot') return (object.fiveNumber || []).join(', ');
        return (object.labels || []).map((label, index) => `${label}, ${object.values?.[index] ?? 0}`).join('\n');
    }

    function field(label, prop, type = 'text', attrs = '') {
        const object = selectedObject();
        return `<div class="qmx-stat-field"><label>${label}</label><input type="${type}" data-prop="${prop}" value="${esc(object?.[prop] ?? '')}" ${attrs}></div>`;
    }
    function check(label, prop) {
        const object = selectedObject();
        return `<label class="qmx-stat-check"><input type="checkbox" data-prop="${prop}" ${object?.[prop] ? 'checked' : ''}> ${label}</label>`;
    }

    function selectedFields(object) {
        if (!object) return '<p class="qmx-stat-empty">Select a chart to edit its data, layout and style.</p>';
        let dataLabel = 'Data — one label,value pair per line';
        if (object.type === 'stat-scatter') dataLabel = 'Points — one x,y pair per line';
        if (object.type === 'stat-box-plot') dataLabel = 'Five-number summary — min, Q1, median, Q3, max';
        return `<div class="qmx-stat-type">${esc(object.type)}</div>
            <div class="qmx-stat-field"><label>Chart title</label><input data-prop="title" value="${esc(object.title)}"></div>
            <div class="qmx-stat-field"><label>${dataLabel}</label><textarea data-data-editor>${esc(pairsText(object))}</textarea></div>
            <div class="qmx-stat-grid2">
                ${field('X', 'x', 'number')}${field('Y', 'y', 'number')}
                ${field('Width', 'w', 'number', 'min="180"')}${field('Height', 'h', 'number', 'min="140"')}
                ${field('X-axis label', 'xLabel')}${field('Y-axis label', 'yLabel')}
                ${field('Stroke', 'stroke', 'color')}${field('Fill', 'fill', 'color')}
                ${field('Line width', 'lineWidth', 'number', 'min="1" max="20" step="0.5"')}
                ${field('Fill opacity', 'fillOpacity', 'number', 'min="0" max="1" step="0.05"')}
            </div>
            ${check('Show grid', 'showGrid')}
            ${check('Show axes', 'showAxes')}
            ${check('Show values', 'showValues')}
            ${check('Show legend', 'showLegend')}
            ${object.type === 'stat-scatter' ? check('Show trendline', 'showTrendline') : ''}`;
    }

    function syncSelectionControls() {
        if (state.controls.selected) state.controls.selected.innerHTML = selectedFields(selectedObject());
    }

    function updateSummary() {
        if (!state.controls.summary) return;
        const counts = {};
        state.document.objects.forEach((object) => counts[object.type] = (counts[object.type] || 0) + 1);
        state.controls.summary.textContent = `${state.document.objects.length} chart(s) · ${Object.entries(counts).map(([key, value]) => `${value} ${key.replace('stat-', '')}`).join(' · ')}`;
    }

    function syncDocumentControls() {
        state.root?.querySelectorAll('[data-doc]').forEach((input) => {
            const key = input.dataset.doc;
            if (input.type === 'checkbox') input.checked = Boolean(state.document[key]);
            else input.value = state.document[key] ?? '';
        });
    }

    function parseDataText(object, text) {
        const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (object.type === 'stat-scatter') {
            const points = lines.map((line) => line.split(/[\t,;]+/).map((part) => Number(part.trim())))
                .filter((parts) => parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]))
                .map((parts) => ({ x: parts[0], y: parts[1] }));
            if (points.length) object.points = points.slice(0, 100);
            return;
        }
        if (object.type === 'stat-box-plot') {
            const values = String(text || '').split(/[\s,;]+/).map(Number).filter(Number.isFinite).slice(0, 5);
            if (values.length === 5) object.fiveNumber = values;
            return;
        }
        const labels = [];
        const values = [];
        lines.forEach((line) => {
            const parts = line.split(/[\t,;]+/);
            if (parts.length < 2) return;
            const value = Number(parts.at(-1).trim());
            if (!Number.isFinite(value)) return;
            labels.push(parts.slice(0, -1).join(',').trim());
            values.push(value);
        });
        if (values.length) {
            object.labels = labels.slice(0, 50);
            object.values = values.slice(0, 50);
        }
    }

    function onRootInput(event) {
        if (event.type === 'input') return;
        const input = event.target;
        if (input.matches('[data-data-editor]')) {
            const object = selectedObject();
            if (!object) return;
            parseDataText(object, input.value);
            pushHistory();
            render();
            return;
        }
        if (input.dataset.doc) {
            const key = input.dataset.doc;
            let value = input.type === 'checkbox' ? input.checked : input.value;
            if (input.type === 'number') value = Number(value);
            state.document[key] = value;
            if (key === 'width') state.document.width = clamp(value, 400, 2400, 1000);
            if (key === 'height') state.document.height = clamp(value, 260, 1800, 600);
            pushHistory();
            render();
            return;
        }
        if (input.dataset.prop) {
            const object = selectedObject();
            if (!object) return;
            const key = input.dataset.prop;
            let value = input.type === 'checkbox' ? input.checked : input.value;
            if (input.type === 'number') value = Number(value);
            object[key] = value;
            pushHistory();
            render();
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
            close,
            insert: insertIntoQuestion,
            'export-svg': exportSvg,
            'export-png': exportPng
        }[action] || (() => {}))();
    }

    function applyPreset(type) {
        state.document.objects = [];
        if (type === 'results') {
            const chart = defaultChart('stat-bar');
            chart.title = 'Subject-wise Results';
            chart.labels = ['Bangla', 'English', 'Mathematics', 'Science', 'ICT'];
            chart.values = [72, 68, 85, 77, 81];
            state.document.objects.push(chart);
        } else if (type === 'frequency') {
            state.document.objects.push(defaultChart('stat-histogram'));
        } else if (type === 'cumulative') {
            state.document.objects.push(defaultChart('stat-ogive'));
        } else if (type === 'share') {
            state.document.objects.push(defaultChart('stat-pie'));
        } else if (type === 'summary') {
            state.document.objects.push(defaultChart('stat-box-plot'));
        } else if (type === 'correlation') {
            state.document.objects.push(defaultChart('stat-scatter'));
        } else if (type === 'dashboard') {
            const bar = defaultChart('stat-bar');
            bar.x = 55; bar.y = 45; bar.w = 430; bar.h = 250; bar.title = 'Monthly Sales';
            const pie = defaultChart('stat-pie');
            pie.x = 515; pie.y = 45; pie.w = 430; pie.h = 250; pie.title = 'Market Share';
            const scatter = defaultChart('stat-scatter');
            scatter.x = 180; scatter.y = 320; scatter.w = 640; scatter.h = 230; scatter.title = 'Study Time vs Score';
            state.document.objects.push(bar, pie, scatter);
        } else if (type === 'clear') {
            state.selectedId = null;
            pushHistory();
            render();
            setStatus('All charts cleared.');
            return;
        }
        state.selectedId = state.document.objects[0]?.id || null;
        pushHistory();
        render();
        setStatus(`${type} preset inserted.`);
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        state.document.objects = state.document.objects.filter((object) => object.id !== state.selectedId);
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Chart deleted.');
    }

    function duplicateSelected() {
        const object = selectedObject();
        if (!object) return;
        const copy = clone(object);
        copy.id = uid(object.type);
        copy.x += 28;
        copy.y += 28;
        state.document.objects.push(copy);
        state.selectedId = copy.id;
        pushHistory();
        render();
        setStatus('Chart duplicated.');
    }

    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Statistical Diagram document?')) return;
        state.document = createDocument();
        state.selectedId = null;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        syncDocumentControls();
        setTool('select');
        render();
        setStatus('New Statistical Diagram document.');
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
        setStatus('Statistical Diagram inserted. Save the question to persist it.');
        window.setTimeout(close, 220);
    }

    function safeFilename(value) {
        return String(value || 'statistical-diagram').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'statistical-diagram';
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
            canvas.getContext('2d').drawImage(image, 0, 0);
            URL.revokeObjectURL(url);
            canvas.toBlob((blob) => blob && downloadBlob(blob, `${safeFilename(state.document.title)}.png`), 'image/png');
            setStatus('PNG exported.');
        };
        image.onerror = () => { URL.revokeObjectURL(url); setStatus('PNG export failed.'); };
        image.src = url;
    }

    function addStyles() {
        if (document.getElementById('qmx-statistical-diagram-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'qmx-statistical-diagram-editor-styles';
        style.textContent = `
        .qmx-stat-editor[hidden]{display:none!important}.qmx-stat-editor{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);padding:14px;display:flex;align-items:center;justify-content:center;font:14px/1.35 "Segoe UI",Arial,sans-serif;color:#0f172a}.qmx-stat-shell{width:min(1480px,calc(100vw - 28px));height:min(930px,calc(100vh - 28px));background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.35);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}.qmx-stat-header,.qmx-stat-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #dbe4ef}.qmx-stat-footer{border-top:1px solid #dbe4ef;border-bottom:0}.qmx-stat-title{font-weight:800;font-size:17px}.qmx-stat-subtitle{font-size:12px;color:#64748b}.qmx-stat-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.qmx-stat-btn,.qmx-stat-tool,.qmx-stat-preset{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer}.qmx-stat-btn:hover,.qmx-stat-tool:hover,.qmx-stat-preset:hover{border-color:#2563eb}.qmx-stat-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}.qmx-stat-btn.danger{color:#dc2626}.qmx-stat-btn:disabled{opacity:.45;cursor:not-allowed}.qmx-stat-main{min-height:0;display:grid;grid-template-columns:220px minmax(0,1fr) 310px;gap:10px;padding:10px;background:#e7eef7}.qmx-stat-panel{background:#fff;border:1px solid #d7e0ec;border-radius:12px;padding:10px;overflow:auto;min-height:0}.qmx-stat-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.qmx-stat-tool{padding:8px 4px;min-height:55px}.qmx-stat-tool small{display:block;font-weight:500;color:#64748b;margin-top:2px}.qmx-stat-tool.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.qmx-stat-section{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#475569;margin:14px 0 7px}.qmx-stat-presets{display:grid;gap:7px}.qmx-stat-canvas-wrap{background:#dfe7f1;border:1px solid #d1dbea;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px}.qmx-stat-canvas{width:100%;min-width:500px}.qmx-stat-svg{display:block;width:100%;height:auto;max-height:720px;background:#fff;box-shadow:0 6px 20px rgba(15,23,42,.12);touch-action:none}.qmx-stat-selection{fill:none;stroke:#2563eb;stroke-width:2;stroke-dasharray:7 5;pointer-events:none}.qmx-stat-handle{fill:#fff;stroke:#2563eb;stroke-width:3;cursor:grab}.qmx-stat-field{margin:7px 0}.qmx-stat-field label{display:block;font-weight:700;font-size:12px;margin-bottom:4px}.qmx-stat-field input,.qmx-stat-field select,.qmx-stat-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:inherit}.qmx-stat-field textarea{min-height:105px;resize:vertical}.qmx-stat-grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-stat-check{display:block;margin:8px 0}.qmx-stat-type,.qmx-stat-summary{margin-top:8px;padding:9px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px}.qmx-stat-empty{color:#64748b;text-align:center;padding:20px 4px}.qmx-stat-status{color:#64748b;min-height:18px}@media(max-width:920px){.qmx-stat-editor{padding:0}.qmx-stat-shell{width:100vw;height:100vh;border-radius:0}.qmx-stat-main{grid-template-columns:170px minmax(0,1fr)}.qmx-stat-main>.qmx-stat-panel:last-child{grid-column:1/-1;max-height:320px}.qmx-stat-title{font-size:15px}}`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;
        addStyles();
        const root = document.createElement('div');
        root.className = 'qmx-stat-editor';
        root.hidden = true;
        root.innerHTML = `
        <div class="qmx-stat-shell" role="dialog" aria-modal="true" aria-label="Statistical Diagram editor">
          <header class="qmx-stat-header">
            <div><div class="qmx-stat-title">Statistical Diagram / Data Chart</div><div class="qmx-stat-subtitle">Bar charts, histograms, frequency polygons, ogives, pie charts, box plots and scatter plots</div></div>
            <div class="qmx-stat-actions"><button class="qmx-stat-btn" data-act="new">New</button><button class="qmx-stat-btn" data-act="undo">Undo</button><button class="qmx-stat-btn" data-act="redo">Redo</button><button class="qmx-stat-btn" data-act="duplicate">Duplicate</button><button class="qmx-stat-btn danger" data-act="delete">Delete</button><button class="qmx-stat-btn" data-act="close">×</button></div>
          </header>
          <main class="qmx-stat-main">
            <aside class="qmx-stat-panel"><strong>Statistical tools</strong><div class="qmx-stat-tools" data-tools></div><div class="qmx-stat-section">Data presets</div><div class="qmx-stat-presets"><button class="qmx-stat-preset" data-preset="results">Subject-wise results</button><button class="qmx-stat-preset" data-preset="frequency">Grouped frequency</button><button class="qmx-stat-preset" data-preset="cumulative">Cumulative frequency</button><button class="qmx-stat-preset" data-preset="share">Market-share pie</button><button class="qmx-stat-preset" data-preset="summary">Five-number summary</button><button class="qmx-stat-preset" data-preset="correlation">Correlation scatter</button><button class="qmx-stat-preset" data-preset="dashboard">Mixed dashboard</button><button class="qmx-stat-preset" data-preset="clear">Clear charts</button></div><p class="qmx-stat-subtitle">Choose a chart type, then edit the label/value data in the right panel. Drag a chart to move it; drag corner handles to resize.</p></aside>
            <section class="qmx-stat-canvas-wrap"><div class="qmx-stat-canvas" data-canvas></div></section>
            <aside class="qmx-stat-panel"><strong>Document</strong><div class="qmx-stat-field"><label>Title</label><input data-doc="title"></div><div class="qmx-stat-grid2"><div class="qmx-stat-field"><label>Width</label><input type="number" min="400" max="2400" data-doc="width"></div><div class="qmx-stat-field"><label>Height</label><input type="number" min="260" max="1800" data-doc="height"></div><div class="qmx-stat-field"><label>X-axis label</label><input data-doc="statXLabel"></div><div class="qmx-stat-field"><label>Y-axis label</label><input data-doc="statYLabel"></div><div class="qmx-stat-field"><label>Background</label><input type="color" data-doc="background"></div><div class="qmx-stat-field"><label>Grid size</label><input type="number" min="5" max="100" data-doc="gridSize"></div></div><label class="qmx-stat-check"><input type="checkbox" data-doc="statShowGrid"> Default grid</label><label class="qmx-stat-check"><input type="checkbox" data-doc="statShowAxes"> Default axes</label><label class="qmx-stat-check"><input type="checkbox" data-doc="statShowValues"> Default values</label><label class="qmx-stat-check"><input type="checkbox" data-doc="statShowLegend"> Default legend</label><hr><strong>Selected chart</strong><div data-selected></div><div class="qmx-stat-summary" data-summary></div></aside>
          </main>
          <footer class="qmx-stat-footer"><div class="qmx-stat-status" data-status></div><div class="qmx-stat-actions"><button class="qmx-stat-btn" data-act="export-svg">Export SVG</button><button class="qmx-stat-btn" data-act="export-png">Export PNG</button><button class="qmx-stat-btn primary" data-act="insert">Insert into question</button></div></footer>
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
            button.className = 'qmx-stat-tool';
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
        if (state.document.mode !== 'statistical-diagram') state.document = createDocument();
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
        document.body.dataset.qmxStatOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';
        setStatus(context.initialSpec ? 'Existing Statistical Diagram loaded.' : 'Choose a statistical chart or data preset.');
    }

    function close() {
        if (!state.root || state.root.hidden) return;
        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxStatOverflow || '';
        delete document.body.dataset.qmxStatOverflow;
        state.context?.textarea?.focus?.();
    }

    function findTokenTextarea(token) {
        return Array.from(document.querySelectorAll('textarea')).find((textarea) => textarea.value.includes(token)) || null;
    }

    function openFromPreview(figure) {
        const payload = String(figure?.dataset.qmxDiagramPayload || '');
        if (!payload) return false;
        let spec;
        try { spec = Diagram.decodePayload(payload); } catch (error) { return false; }
        if (spec.mode !== 'statistical-diagram') return false;
        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) || window.QmxDiagramLauncher?.getActiveTextarea?.();
        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }
        open({ tool: { id: 'statistical-diagram' }, textarea, initialSpec: spec, replaceRange, editMode: true });
        return true;
    }

    function registerHandlers() {
        const launcher = window.QmxDiagramLauncher;
        if (!launcher?.registerToolHandler) return false;
        let registered = false;
        ['statistical-diagram', 'statistics', 'data-chart', 'bar-chart', 'histogram', 'pie-chart', 'box-plot', 'scatter-plot'].forEach((id) => {
            try { launcher.registerToolHandler(id, open); registered = true; } catch (error) {}
        });
        return registered;
    }

    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;
        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
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

    window.QmxStatisticalDiagramEditor = Object.freeze({ version: '1.0.0', open, close, openFromPreview });
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})(window, document);
