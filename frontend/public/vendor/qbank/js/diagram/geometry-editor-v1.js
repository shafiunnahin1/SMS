(function (window, document) {
    'use strict';

    if (window.QmxGeometryEditor?.version) return;
    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Geometry] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['point', 'Point', 'বিন্দু'],
        ['segment', 'Segment', 'রেখাংশ'],
        ['ray', 'Ray', 'রশ্মি'],
        ['infinite-line', 'Line', 'সরলরেখা'],
        ['circle', 'Circle', 'বৃত্ত'],
        ['angle', 'Angle', 'কোণ'],
        ['triangle', 'Triangle', 'ত্রিভুজ'],
        ['polygon', 'Polygon', 'বহুভুজ'],
        ['text', 'Text', 'লেখা']
    ];

    const state = {
        root: null, dialog: null, svg: null, gridLayer: null, axesLayer: null,
        objectLayer: null, draftLayer: null, selectionLayer: null,
        context: null, document: null, selectedId: null, activeTool: 'select',
        draft: [], interaction: null, history: [], historyIndex: -1, controls: {}
    };

    function uid(prefix = 'geo') {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[char]);
    }
    function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
    function selectedObject() { return state.document?.objects.find((item) => item.id === state.selectedId) || null; }
    function snapValue(value) {
        const size = state.document?.gridSize || 20;
        return state.document?.snap ? Math.round(value / size) * size : value;
    }
    function pointFromEvent(event) {
        const point = state.svg.createSVGPoint();
        point.x = event.clientX; point.y = event.clientY;
        const matrix = state.svg.getScreenCTM();
        const local = matrix ? point.matrixTransform(matrix.inverse()) : point;
        return { x: snapValue(local.x), y: snapValue(local.y) };
    }
    function createDocument() {
        return {
            version: 2, id: uid('geometry'), mode: 'geometry', title: 'Geometry Drawing',
            width: 900, height: 520, background: '#ffffff', gridSize: 20,
            showGrid: true, showAxes: false, snap: true, objects: []
        };
    }
    function nextPointLabel() {
        const labels = new Set(state.document.objects.filter((item) => item.type === 'point').map((item) => item.text));
        for (const label of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!labels.has(label)) return label;
        return `P${labels.size + 1}`;
    }
    function baseStyle(type) {
        return {
            id: uid(type), type, text: '', fill: type === 'polygon' ? 'transparent' : '#ffffff',
            stroke: '#0f172a', strokeWidth: 2, fontSize: 18, fontWeight: 'normal',
            textColor: '#0f172a', dash: false, opacity: 1, showMeasure: false
        };
    }
    function pushHistory() {
        const snapshot = JSON.stringify(state.document);
        if (state.history[state.historyIndex] === snapshot) return;
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(snapshot);
        if (state.history.length > 80) state.history.shift();
        state.historyIndex = state.history.length - 1;
        updateHistoryButtons();
    }
    function restoreHistory(index) {
        if (index < 0 || index >= state.history.length) return;
        state.historyIndex = index;
        state.document = Diagram.normalizeSpec(JSON.parse(state.history[index]));
        state.selectedId = null; state.draft = []; state.interaction = null;
        syncDocumentControls(); render(); updateHistoryButtons();
    }
    function updateHistoryButtons() {
        if (!state.controls.undo) return;
        state.controls.undo.disabled = state.historyIndex <= 0;
        state.controls.redo.disabled = state.historyIndex >= state.history.length - 1;
    }
    function undo() { restoreHistory(state.historyIndex - 1); }
    function redo() { restoreHistory(state.historyIndex + 1); }

    function addStyles() {
        if (document.getElementById('qmx-geometry-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'qmx-geometry-editor-styles';
        style.textContent = `
.qmx-geo-editor[hidden]{display:none!important}.qmx-geo-editor{position:fixed;inset:0;z-index:10110;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.68);backdrop-filter:blur(2px)}
.qmx-geo-dialog{width:min(1480px,100%);height:min(95vh,950px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.36)}
.qmx-geo-header{display:flex;align-items:center;gap:9px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}.qmx-geo-title{margin-right:auto}.qmx-geo-title strong{display:block}.qmx-geo-title span{display:block;color:#64748b;font-size:11px}.qmx-geo-btn,.qmx-geo-tool{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}.qmx-geo-btn:hover,.qmx-geo-tool:hover{border-color:#60a5fa;background:#eff6ff}.qmx-geo-btn:disabled{opacity:.45;cursor:not-allowed}.qmx-geo-btn.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-geo-btn.is-danger{color:#b91c1c}.qmx-geo-close{font-size:20px;line-height:1}
.qmx-geo-workspace{min-height:0;flex:1;display:grid;grid-template-columns:190px minmax(0,1fr) 270px;gap:10px;padding:10px}.qmx-geo-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}.qmx-geo-panel h3{margin:0 0 8px;font-size:13px}.qmx-geo-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-geo-tool{min-height:54px;padding:7px 5px;font-size:11px}.qmx-geo-tool span{display:block;margin-top:2px;color:#64748b;font-size:10px;font-weight:500}.qmx-geo-tool.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.qmx-geo-help{margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.5}
.qmx-geo-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}.qmx-geo-stage{display:block;width:min(100%,1100px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none;user-select:none}.qmx-geo-object{cursor:move}.qmx-geo-object line,.qmx-geo-object circle,.qmx-geo-object polygon,.qmx-geo-object polyline,.qmx-geo-object text{pointer-events:none}.qmx-geo-hit{fill:none;stroke:transparent;stroke-width:18}.qmx-geo-hit-fill{fill:transparent;stroke:transparent;stroke-width:14}.qmx-geo-object .qmx-geo-hit{pointer-events:stroke}.qmx-geo-object .qmx-geo-hit-fill{pointer-events:all}.qmx-geo-select-box{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}.qmx-geo-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:crosshair}.qmx-geo-draft{fill:none;stroke:#2563eb;stroke-width:2;stroke-dasharray:7 5;vector-effect:non-scaling-stroke;pointer-events:none}.qmx-geo-draft-point{fill:#2563eb;pointer-events:none}
.qmx-geo-fields{display:grid;gap:9px}.qmx-geo-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}.qmx-geo-field input,.qmx-geo-field textarea,.qmx-geo-field select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400}.qmx-geo-field textarea{min-height:62px;resize:vertical}.qmx-geo-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-geo-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}.qmx-geo-divider{margin:10px 0;border:0;border-top:1px solid #e2e8f0}.qmx-geo-empty{padding:15px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-geo-footer{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}.qmx-geo-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-geo-footer .qmx-geo-btn:first-of-type{margin-left:auto}
@media(max-width:1000px){.qmx-geo-workspace{grid-template-columns:150px minmax(0,1fr) 230px}.qmx-geo-tools{grid-template-columns:1fr}}
@media(max-width:720px){.qmx-geo-editor{padding:0}.qmx-geo-dialog{width:100%;height:100%;border-radius:0}.qmx-geo-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(340px,1fr) auto;overflow:auto}.qmx-geo-panel{overflow:visible}.qmx-geo-tools{grid-template-columns:repeat(5,1fr)}.qmx-geo-header{overflow-x:auto}.qmx-geo-title span{display:none}}
`;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;
        addStyles();
        const root = document.createElement('div');
        root.className = 'qmx-geo-editor'; root.hidden = true;
        root.innerHTML = `
<section class="qmx-geo-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-geo-title">
<header class="qmx-geo-header"><div class="qmx-geo-title"><strong id="qmx-geo-title">Geometry Drawing</strong><span>Editable higher-mathematics geometry editor</span></div><button type="button" class="qmx-geo-btn" data-geo-new>New</button><button type="button" class="qmx-geo-btn" data-geo-undo>Undo</button><button type="button" class="qmx-geo-btn" data-geo-redo>Redo</button><button type="button" class="qmx-geo-btn" data-geo-duplicate>Duplicate</button><button type="button" class="qmx-geo-btn is-danger" data-geo-delete>Delete</button><button type="button" class="qmx-geo-btn qmx-geo-close" data-geo-close aria-label="Close">×</button></header>
<div class="qmx-geo-workspace">
<aside class="qmx-geo-panel"><h3>Geometry tools</h3><div class="qmx-geo-tools" data-geo-tools></div><div class="qmx-geo-help"><strong>Drawing:</strong> Point/Text use one click. Segment, Ray, Line and Circle use two clicks. Angle and Triangle use three clicks. Polygon uses multiple clicks; press Enter or Finish Polygon.<br><br><strong>Edit:</strong> Select mode, click an object, drag it or drag blue handles.</div><button type="button" class="qmx-geo-btn" data-geo-finish style="width:100%;margin-top:10px">Finish Polygon</button></aside>
<main class="qmx-geo-stage-wrap"><svg class="qmx-geo-stage" data-geo-svg tabindex="0" aria-label="Geometry drawing canvas"><defs><marker id="qmx-geo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0f172a"/></marker><pattern id="qmx-geo-grid-small" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern><pattern id="qmx-geo-grid" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="url(#qmx-geo-grid-small)"/><path d="M 100 0 L 0 0 0 100" fill="none" stroke="#cbd5e1" stroke-width="1"/></pattern></defs><rect data-geo-bg width="100%" height="100%"/><g data-geo-grid-layer></g><g data-geo-axes-layer></g><g data-geo-object-layer></g><g data-geo-draft-layer></g><g data-geo-selection-layer></g></svg></main>
<aside class="qmx-geo-panel"><h3>Document</h3><div class="qmx-geo-fields"><label class="qmx-geo-field">Title<input data-doc-prop="title"></label><div class="qmx-geo-row"><label class="qmx-geo-field">Width<input type="number" min="240" max="2400" data-doc-prop="width"></label><label class="qmx-geo-field">Height<input type="number" min="180" max="1800" data-doc-prop="height"></label></div><label class="qmx-geo-field">Background<input type="color" data-doc-prop="background"></label><label class="qmx-geo-field">Grid size<input type="number" min="5" max="100" data-doc-prop="gridSize"></label><label class="qmx-geo-check"><input type="checkbox" data-doc-prop="showGrid"> Show grid</label><label class="qmx-geo-check"><input type="checkbox" data-doc-prop="showAxes"> Show axes</label><label class="qmx-geo-check"><input type="checkbox" data-doc-prop="snap"> Snap to grid</label></div><hr class="qmx-geo-divider"><h3>Selected object</h3><div data-geo-properties></div></aside>
</div>
<footer class="qmx-geo-footer"><span class="qmx-geo-status" data-geo-status aria-live="polite"></span><button type="button" class="qmx-geo-btn" data-geo-export-svg>Export SVG</button><button type="button" class="qmx-geo-btn" data-geo-export-png>Export PNG</button><button type="button" class="qmx-geo-btn is-primary" data-geo-insert>Insert into question</button></footer>
</section>`;
        document.body.appendChild(root);
        state.root = root; state.dialog = root.querySelector('.qmx-geo-dialog');
        state.svg = root.querySelector('[data-geo-svg]'); state.gridLayer = root.querySelector('[data-geo-grid-layer]');
        state.axesLayer = root.querySelector('[data-geo-axes-layer]'); state.objectLayer = root.querySelector('[data-geo-object-layer]');
        state.draftLayer = root.querySelector('[data-geo-draft-layer]'); state.selectionLayer = root.querySelector('[data-geo-selection-layer]');
        state.controls = {
            bg: root.querySelector('[data-geo-bg]'), tools: root.querySelector('[data-geo-tools]'),
            props: root.querySelector('[data-geo-properties]'), status: root.querySelector('[data-geo-status]'),
            undo: root.querySelector('[data-geo-undo]'), redo: root.querySelector('[data-geo-redo]'),
            finish: root.querySelector('[data-geo-finish]')
        };
        TOOL_DEFS.forEach(([id, label, bn]) => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'qmx-geo-tool';
            button.dataset.tool = id; button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<span>${esc(bn)}</span>`; state.controls.tools.appendChild(button);
        });
        state.controls.tools.addEventListener('click', (event) => { const button = event.target.closest('[data-tool]'); if (button) setTool(button.dataset.tool); });
        root.querySelector('[data-geo-close]').addEventListener('click', close);
        root.querySelector('[data-geo-new]').addEventListener('click', newDocument);
        state.controls.undo.addEventListener('click', undo); state.controls.redo.addEventListener('click', redo);
        root.querySelector('[data-geo-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-geo-duplicate]').addEventListener('click', duplicateSelected);
        state.controls.finish.addEventListener('click', finishPolygon);
        root.querySelector('[data-geo-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-geo-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-geo-insert]').addEventListener('click', insertIntoQuestion);
        root.querySelectorAll('[data-doc-prop]').forEach((control) => {
            control.addEventListener('input', onDocumentInput); control.addEventListener('change', () => { onDocumentInput({ currentTarget: control }); pushHistory(); });
        });
        state.controls.props.addEventListener('input', onPropertyInput);
        state.controls.props.addEventListener('change', () => pushHistory());
        state.svg.addEventListener('pointerdown', onPointerDown);
        state.svg.addEventListener('pointermove', onPointerMove);
        state.svg.addEventListener('pointerup', onPointerUp);
        state.svg.addEventListener('pointercancel', onPointerUp);
        state.svg.addEventListener('dblclick', onDoubleClick);
        document.addEventListener('keydown', onKeydown);
    }

    function setTool(tool) {
        state.activeTool = TOOL_DEFS.some(([id]) => id === tool) ? tool : 'select';
        state.draft = [];
        state.controls.tools.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('is-active', button.dataset.tool === state.activeTool));
        setStatus(state.activeTool === 'select' ? 'Select and drag objects.' : `${TOOL_DEFS.find(([id]) => id === state.activeTool)?.[1] || 'Tool'} tool active.`);
        renderDraft();
    }

    function onDocumentInput(event) {
        const control = event.currentTarget; const prop = control.dataset.docProp;
        if (!prop || !state.document) return;
        if (['showGrid', 'showAxes', 'snap'].includes(prop)) state.document[prop] = control.checked;
        else if (['width', 'height', 'gridSize'].includes(prop)) state.document[prop] = Number(control.value);
        else state.document[prop] = control.value;
        state.document = Diagram.normalizeSpec(state.document);
        render();
    }

    function syncDocumentControls() {
        state.root.querySelectorAll('[data-doc-prop]').forEach((control) => {
            const prop = control.dataset.docProp; const value = state.document[prop];
            if (control.type === 'checkbox') control.checked = Boolean(value); else control.value = value;
        });
    }

    function objectBounds(object) {
        if (object.type === 'point') return { x: object.x - 10, y: object.y - 10, w: 20, h: 20 };
        if (['segment', 'ray', 'infinite-line'].includes(object.type)) {
            const x = Math.min(object.x1, object.x2), y = Math.min(object.y1, object.y2);
            return { x, y, w: Math.max(1, Math.abs(object.x2 - object.x1)), h: Math.max(1, Math.abs(object.y2 - object.y1)) };
        }
        if (object.type === 'circle') return { x: object.cx - object.r, y: object.cy - object.r, w: object.r * 2, h: object.r * 2 };
        if (object.type === 'angle') {
            const xs = [object.ax, object.vx, object.bx], ys = [object.ay, object.vy, object.by];
            return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        }
        if (object.type === 'polygon') {
            const xs = object.points.map((p) => p.x), ys = object.points.map((p) => p.y);
            return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        }
        return { x: object.x, y: object.y, w: object.w, h: object.h };
    }

    function geometryLabel(object, x, y, anchor = 'start') {
        if (!object.text) return '';
        return `<text x="${x}" y="${y}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" text-anchor="${anchor}" font-family="Arial, Noto Sans Bengali, sans-serif">${esc(object.text)}</text>`;
    }
    function objectMarkup(object) {
        const selected = object.id === state.selectedId;
        const stroke = esc(object.stroke), fill = esc(object.fill), dash = object.dash ? ' stroke-dasharray="8 5"' : '';
        const line = `fill="none" stroke="${stroke}" stroke-width="${object.strokeWidth}"${dash} vector-effect="non-scaling-stroke"`;
        const shape = `fill="${fill}" stroke="${stroke}" stroke-width="${object.strokeWidth}"${dash} vector-effect="non-scaling-stroke"`;
        let content = '';
        if (object.type === 'point') {
            content = `<circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="${stroke}"/>${geometryLabel(object, object.x + 10, object.y - 10)}<circle class="qmx-geo-hit-fill" cx="${object.x}" cy="${object.y}" r="14"/>`;
        } else if (['segment', 'ray', 'infinite-line'].includes(object.type)) {
            let x1 = object.x1, y1 = object.y1, x2 = object.x2, y2 = object.y2;
            if (object.type === 'infinite-line') { let dx = x2 - x1, dy = y2 - y1; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len; x1 -= dx * 5000; y1 -= dy * 5000; x2 += dx * 5000; y2 += dy * 5000; }
            const marker = object.type === 'ray' ? ' marker-end="url(#qmx-geo-arrow)"' : '';
            content = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${line}${marker}/><line class="qmx-geo-hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${geometryLabel(object, (object.x1 + object.x2) / 2, (object.y1 + object.y2) / 2 - 9, 'middle')}`;
        } else if (object.type === 'circle') {
            content = `<circle cx="${object.cx}" cy="${object.cy}" r="${object.r}" ${shape}/><circle class="qmx-geo-hit" cx="${object.cx}" cy="${object.cy}" r="${object.r}"/>${geometryLabel(object, object.cx + object.r + 8, object.cy - 8)}`;
        } else if (object.type === 'angle') {
            content = `<line x1="${object.vx}" y1="${object.vy}" x2="${object.ax}" y2="${object.ay}" ${line}/><line x1="${object.vx}" y1="${object.vy}" x2="${object.bx}" y2="${object.by}" ${line}/><polyline class="qmx-geo-hit" points="${object.ax},${object.ay} ${object.vx},${object.vy} ${object.bx},${object.by}"/>${geometryLabel(object, object.vx + 12, object.vy - 12)}`;
        } else if (object.type === 'polygon') {
            const points = object.points.map((p) => `${p.x},${p.y}`).join(' '); const tag = object.closed ? 'polygon' : 'polyline';
            content = `<${tag} points="${points}" ${shape}/><${tag} class="qmx-geo-hit-fill" points="${points}"/>`;
            if (object.text) { const b = objectBounds(object); content += geometryLabel(object, b.x + b.w / 2, b.y + b.h / 2, 'middle'); }
        } else {
            content = `<rect class="qmx-geo-hit-fill" x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}"/><text x="${object.x + object.w / 2}" y="${object.y + object.h / 2}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Noto Sans Bengali, sans-serif">${esc(object.text || 'Text')}</text>`;
        }
        return `<g class="qmx-geo-object${selected ? ' is-selected' : ''}" data-object-id="${esc(object.id)}">${content}</g>`;
    }

    function renderGrid() {
        const size = state.document.gridSize;
        const small = state.svg.querySelector('#qmx-geo-grid-small'); const large = state.svg.querySelector('#qmx-geo-grid');
        small.setAttribute('width', size); small.setAttribute('height', size); small.querySelector('path').setAttribute('d', `M ${size} 0 L 0 0 0 ${size}`);
        large.setAttribute('width', size * 5); large.setAttribute('height', size * 5); large.querySelector('path').setAttribute('d', `M ${size * 5} 0 L 0 0 0 ${size * 5}`);
        state.gridLayer.innerHTML = state.document.showGrid ? '<rect width="100%" height="100%" fill="url(#qmx-geo-grid)" pointer-events="none"/>' : '';
        if (state.document.showAxes) {
            const cx = state.document.width / 2, cy = state.document.height / 2;
            state.axesLayer.innerHTML = `<line x1="0" y1="${cy}" x2="${state.document.width}" y2="${cy}" stroke="#94a3b8"/><line x1="${cx}" y1="0" x2="${cx}" y2="${state.document.height}" stroke="#94a3b8"/><text x="${state.document.width - 18}" y="${cy - 7}" fill="#64748b" font-size="14">x</text><text x="${cx + 8}" y="18" fill="#64748b" font-size="14">y</text>`;
        } else state.axesLayer.innerHTML = '';
    }

    function selectionMarkup(object) {
        if (!object) return '';
        const b = objectBounds(object); let handles = '';
        const handle = (x, y, name) => `<circle class="qmx-geo-handle" data-handle="${name}" cx="${x}" cy="${y}" r="6"/>`;
        if (object.type === 'point') handles = handle(object.x, object.y, 'point');
        else if (['segment', 'ray', 'infinite-line'].includes(object.type)) handles = handle(object.x1, object.y1, 'p1') + handle(object.x2, object.y2, 'p2');
        else if (object.type === 'circle') handles = handle(object.cx, object.cy, 'center') + handle(object.cx + object.r, object.cy, 'radius');
        else if (object.type === 'angle') handles = handle(object.ax, object.ay, 'a') + handle(object.vx, object.vy, 'v') + handle(object.bx, object.by, 'b');
        else if (object.type === 'polygon') handles = object.points.map((point, index) => handle(point.x, point.y, `vertex-${index}`)).join('');
        else handles = handle(object.x + object.w, object.y + object.h, 'resize');
        return `<rect class="qmx-geo-select-box" x="${b.x - 7}" y="${b.y - 7}" width="${Math.max(14, b.w + 14)}" height="${Math.max(14, b.h + 14)}"/>${handles}`;
    }

    function renderDraft() {
        const points = state.draft;
        if (!points.length) { state.draftLayer.innerHTML = ''; return; }
        const circles = points.map((point) => `<circle class="qmx-geo-draft-point" cx="${point.x}" cy="${point.y}" r="4"/>`).join('');
        const polyline = points.length > 1 ? `<polyline class="qmx-geo-draft" points="${points.map((point) => `${point.x},${point.y}`).join(' ')}"/>` : '';
        state.draftLayer.innerHTML = polyline + circles;
    }

    function render(options = {}) {
        if (!state.document) return;
        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.controls.bg.setAttribute('fill', state.document.background);
        renderGrid();
        state.objectLayer.innerHTML = state.document.objects.map(objectMarkup).join('');
        state.selectionLayer.innerHTML = selectionMarkup(selectedObject());
        renderDraft();
        if (!options.keepProperties) renderProperties();
        updateHistoryButtons();
    }

    function selectObject(id) { state.selectedId = id; render(); }

    function onPointerDown(event) {
        if (event.button !== 0) return;
        const handle = event.target.closest('[data-handle]'); const group = event.target.closest('[data-object-id]');
        const point = pointFromEvent(event);
        if (handle && selectedObject()) {
            event.preventDefault(); state.svg.setPointerCapture(event.pointerId);
            state.interaction = { kind: 'handle', pointerId: event.pointerId, handle: handle.dataset.handle, start: point, original: clone(selectedObject()) };
            return;
        }
        if (group) {
            event.preventDefault(); const id = group.dataset.objectId; if (state.selectedId !== id) state.selectedId = id;
            state.svg.setPointerCapture(event.pointerId);
            state.interaction = { kind: 'move', pointerId: event.pointerId, start: point, original: clone(selectedObject()) };
            render(); return;
        }
        if (state.activeTool === 'select') { selectObject(null); return; }
        createFromTool(point);
    }

    function createFromTool(point) {
        const tool = state.activeTool;
        if (tool === 'point') {
            const object = { ...baseStyle('point'), x: point.x, y: point.y, radius: 5, text: nextPointLabel(), fill: '#0f172a' };
            state.document.objects.push(object); state.selectedId = object.id; pushHistory(); render(); return;
        }
        if (tool === 'text') {
            const object = { ...baseStyle('text'), x: point.x, y: point.y, w: 160, h: 42, text: 'লেখা', fill: 'transparent' };
            state.document.objects.push(object); state.selectedId = object.id; pushHistory(); render(); return;
        }
        state.draft.push(point); renderDraft();
        if (['segment', 'ray', 'infinite-line', 'circle'].includes(tool) && state.draft.length === 2) finishTwoPoint(tool);
        else if (tool === 'angle' && state.draft.length === 3) finishAngle();
        else if (tool === 'triangle' && state.draft.length === 3) finishTriangle();
    }

    function finishTwoPoint(tool) {
        const [a, b] = state.draft; let object;
        if (tool === 'circle') object = { ...baseStyle('circle'), cx: a.x, cy: a.y, r: Math.max(5, Math.hypot(b.x - a.x, b.y - a.y)), fill: 'transparent' };
        else object = { ...baseStyle(tool), x1: a.x, y1: a.y, x2: b.x, y2: b.y, fill: 'transparent', showMeasure: tool === 'segment' };
        state.document.objects.push(object); state.selectedId = object.id; state.draft = []; pushHistory(); render();
    }
    function finishAngle() {
        const [a, v, b] = state.draft; const object = { ...baseStyle('angle'), ax: a.x, ay: a.y, vx: v.x, vy: v.y, bx: b.x, by: b.y, fill: 'transparent', showMeasure: true };
        state.document.objects.push(object); state.selectedId = object.id; state.draft = []; pushHistory(); render();
    }
    function finishTriangle() {
        const object = { ...baseStyle('polygon'), points: state.draft.map(clone), closed: true, fill: 'transparent' };
        state.document.objects.push(object); state.selectedId = object.id; state.draft = []; pushHistory(); render();
    }
    function finishPolygon() {
        if (state.activeTool !== 'polygon' || state.draft.length < 3) { setStatus('Polygon needs at least three points.'); return; }
        const object = { ...baseStyle('polygon'), points: state.draft.map(clone), closed: true, fill: 'transparent' };
        state.document.objects.push(object); state.selectedId = object.id; state.draft = []; pushHistory(); render(); setStatus('Polygon created.');
    }
    function onDoubleClick(event) { if (state.activeTool === 'polygon' && state.draft.length >= 3) { event.preventDefault(); finishPolygon(); } }

    function moveObject(target, original, dx, dy) {
        const sx = (value) => snapValue(value + dx), sy = (value) => snapValue(value + dy);
        if (target.type === 'point') { target.x = sx(original.x); target.y = sy(original.y); }
        else if (['segment', 'ray', 'infinite-line'].includes(target.type)) { target.x1 = sx(original.x1); target.y1 = sy(original.y1); target.x2 = sx(original.x2); target.y2 = sy(original.y2); }
        else if (target.type === 'circle') { target.cx = sx(original.cx); target.cy = sy(original.cy); }
        else if (target.type === 'angle') { target.ax = sx(original.ax); target.ay = sy(original.ay); target.vx = sx(original.vx); target.vy = sy(original.vy); target.bx = sx(original.bx); target.by = sy(original.by); }
        else if (target.type === 'polygon') target.points = original.points.map((point) => ({ x: sx(point.x), y: sy(point.y) }));
        else { target.x = sx(original.x); target.y = sy(original.y); }
    }

    function dragHandle(target, original, handle, point) {
        if (target.type === 'point') { target.x = point.x; target.y = point.y; }
        else if (['segment', 'ray', 'infinite-line'].includes(target.type)) {
            if (handle === 'p1') { target.x1 = point.x; target.y1 = point.y; } else { target.x2 = point.x; target.y2 = point.y; }
        } else if (target.type === 'circle') {
            if (handle === 'center') { target.cx = point.x; target.cy = point.y; }
            else target.r = Math.max(5, Math.hypot(point.x - target.cx, point.y - target.cy));
        } else if (target.type === 'angle') {
            if (handle === 'a') { target.ax = point.x; target.ay = point.y; }
            else if (handle === 'v') { const dx = point.x - original.vx, dy = point.y - original.vy; target.vx = point.x; target.vy = point.y; target.ax = original.ax + dx; target.ay = original.ay + dy; target.bx = original.bx + dx; target.by = original.by + dy; }
            else { target.bx = point.x; target.by = point.y; }
        } else if (target.type === 'polygon' && handle.startsWith('vertex-')) {
            const index = Number(handle.split('-')[1]); target.points[index] = { x: point.x, y: point.y };
        } else if (target.type === 'text') { target.w = Math.max(30, point.x - target.x); target.h = Math.max(24, point.y - target.y); }
    }

    function onPointerMove(event) {
        if (!state.interaction || event.pointerId !== state.interaction.pointerId) return;
        const point = pointFromEvent(event); const object = selectedObject(); if (!object) return;
        if (state.interaction.kind === 'move') moveObject(object, state.interaction.original, point.x - state.interaction.start.x, point.y - state.interaction.start.y);
        else dragHandle(object, state.interaction.original, state.interaction.handle, point);
        render();
    }
    function onPointerUp(event) {
        if (!state.interaction || event.pointerId !== state.interaction.pointerId) return;
        try { state.svg.releasePointerCapture(event.pointerId); } catch (error) {}
        state.interaction = null; pushHistory(); render();
    }

    function renderProperties() {
        const object = selectedObject(); if (!object) { state.controls.props.innerHTML = '<div class="qmx-geo-empty">Select an object to edit its geometry and style.</div>'; return; }
        let coordinates = '';
        const numberField = (label, prop, value) => `<label class="qmx-geo-field">${label}<input type="number" step="0.1" data-prop="${prop}" value="${value}"></label>`;
        if (object.type === 'point') coordinates = `<div class="qmx-geo-row">${numberField('X', 'x', object.x)}${numberField('Y', 'y', object.y)}</div>`;
        else if (['segment', 'ray', 'infinite-line'].includes(object.type)) coordinates = `<div class="qmx-geo-row">${numberField('X1', 'x1', object.x1)}${numberField('Y1', 'y1', object.y1)}</div><div class="qmx-geo-row">${numberField('X2', 'x2', object.x2)}${numberField('Y2', 'y2', object.y2)}</div>`;
        else if (object.type === 'circle') coordinates = `<div class="qmx-geo-row">${numberField('Center X', 'cx', object.cx)}${numberField('Center Y', 'cy', object.cy)}</div>${numberField('Radius', 'r', object.r)}`;
        else if (object.type === 'angle') coordinates = `<div class="qmx-geo-row">${numberField('Vertex X', 'vx', object.vx)}${numberField('Vertex Y', 'vy', object.vy)}</div>`;
        else if (object.type === 'text') coordinates = `<div class="qmx-geo-row">${numberField('X', 'x', object.x)}${numberField('Y', 'y', object.y)}</div><div class="qmx-geo-row">${numberField('Width', 'w', object.w)}${numberField('Height', 'h', object.h)}</div>`;
        const supportsFill = ['circle', 'polygon'].includes(object.type);
        const supportsMeasure = ['segment', 'circle', 'angle'].includes(object.type);
        state.controls.props.innerHTML = `<div class="qmx-geo-fields"><label class="qmx-geo-field">Label / text<textarea data-prop="text">${esc(object.text || '')}</textarea></label>${coordinates}<div class="qmx-geo-row"><label class="qmx-geo-field">Stroke<input type="color" data-prop="stroke" value="${object.stroke === 'transparent' ? '#0f172a' : object.stroke}"></label>${supportsFill ? `<label class="qmx-geo-field">Fill<input type="color" data-prop="fill" value="${object.fill === 'transparent' ? '#ffffff' : object.fill}"></label>` : '<span></span>'}</div><div class="qmx-geo-row">${numberField('Line width', 'strokeWidth', object.strokeWidth)}${numberField('Font size', 'fontSize', object.fontSize)}</div><label class="qmx-geo-check"><input type="checkbox" data-prop="dash" ${object.dash ? 'checked' : ''}> Dashed line</label>${supportsFill ? `<label class="qmx-geo-check"><input type="checkbox" data-prop="transparentFill" ${object.fill === 'transparent' ? 'checked' : ''}> Transparent fill</label>` : ''}${supportsMeasure ? `<label class="qmx-geo-check"><input type="checkbox" data-prop="showMeasure" ${object.showMeasure ? 'checked' : ''}> Show measurement</label>` : ''}</div>`;
    }

    function onPropertyInput(event) {
        const input = event.target.closest('[data-prop]'); const object = selectedObject(); if (!input || !object) return;
        const prop = input.dataset.prop;
        if (prop === 'transparentFill') object.fill = input.checked ? 'transparent' : '#ffffff';
        else if (['dash', 'showMeasure'].includes(prop)) object[prop] = input.checked;
        else if (['text', 'stroke', 'fill'].includes(prop)) object[prop] = input.value;
        else object[prop] = Number(input.value);
        state.document = Diagram.normalizeSpec(state.document); render({ keepProperties: true });
    }

    function deleteSelected() {
        if (!state.selectedId) return; state.document.objects = state.document.objects.filter((item) => item.id !== state.selectedId); state.selectedId = null; pushHistory(); render(); setStatus('Object deleted.');
    }
    function duplicateSelected() {
        const object = selectedObject(); if (!object) return; const copy = clone(object); copy.id = uid(object.type); moveObject(copy, object, 20, 20); state.document.objects.push(copy); state.selectedId = copy.id; pushHistory(); render(); setStatus('Object duplicated.');
    }
    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new geometry drawing?')) return;
        state.document = createDocument(); state.selectedId = null; state.draft = []; state.history = []; state.historyIndex = -1; pushHistory(); syncDocumentControls(); setTool('select'); render(); setStatus('New geometry drawing.');
    }

    function makeToken() { return `[[qmx-diagram:${Diagram.encodeSpec(state.document)}]]`; }
    function insertIntoQuestion() {
        const textarea = state.context?.textarea;
        if (!textarea) { setStatus('No target question field was found.'); return; }
        const token = makeToken(); const replaceRange = state.context?.replaceRange; textarea.focus();
        if (replaceRange && Number.isInteger(replaceRange.start) && Number.isInteger(replaceRange.end)) textarea.setRangeText(token, replaceRange.start, replaceRange.end, 'end');
        else { const start = textarea.selectionStart ?? textarea.value.length, end = textarea.selectionEnd ?? start; const prefix = start > 0 && !/\n$/.test(textarea.value.slice(0, start)) ? '\n' : ''; const suffix = end < textarea.value.length && !/^\n/.test(textarea.value.slice(end)) ? '\n' : ''; textarea.setRangeText(prefix + token + suffix, start, end, 'end'); }
        textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.dispatchEvent(new Event('change', { bubbles: true }));
        setStatus('Geometry diagram inserted. Save the question to persist it.'); window.setTimeout(close, 220);
    }
    function safeFilename(value) { return String(value || 'geometry').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'geometry'; }
    function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    function exportSvg() { downloadBlob(new Blob([Diagram.svgMarkup(state.document)], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(state.document.title)}.svg`); setStatus('SVG exported.'); }
    function exportPng() {
        const svg = Diagram.svgMarkup(state.document); const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })); const image = new Image();
        image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = state.document.width; canvas.height = state.document.height; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); URL.revokeObjectURL(url); canvas.toBlob((blob) => { if (blob) downloadBlob(blob, `${safeFilename(state.document.title)}.png`); }, 'image/png'); setStatus('PNG exported.'); };
        image.onerror = () => { URL.revokeObjectURL(url); setStatus('PNG export failed.'); }; image.src = url;
    }
    function setStatus(message) { if (state.controls.status) state.controls.status.textContent = message; }

    function open(context = {}) {
        buildEditor(); state.context = context; state.document = context.initialSpec ? Diagram.normalizeSpec(context.initialSpec) : createDocument();
        if (state.document.mode !== 'geometry') state.document = createDocument();
        state.selectedId = null; state.activeTool = 'select'; state.draft = []; state.interaction = null; state.history = []; state.historyIndex = -1; pushHistory(); syncDocumentControls(); setTool('select'); render();
        state.root.hidden = false; document.body.dataset.qmxGeoOverflow = document.body.style.overflow || ''; document.body.style.overflow = 'hidden';
        setStatus(context.initialSpec ? 'Existing geometry diagram loaded.' : 'Choose a geometry tool and draw on the canvas.'); window.setTimeout(() => state.svg.focus(), 0);
    }
    function close() { if (!state.root || state.root.hidden) return; state.root.hidden = true; document.body.style.overflow = document.body.dataset.qmxGeoOverflow || ''; delete document.body.dataset.qmxGeoOverflow; state.context?.textarea?.focus?.(); }
    function findTokenTextarea(token) { return Array.from(document.querySelectorAll('textarea')).find((textarea) => textarea.value.includes(token)) || null; }
    function openFromPreview(figure) {
        const payload = String(figure?.dataset.qmxDiagramPayload || ''); if (!payload) return false;
        let spec; try { spec = Diagram.decodePayload(payload); } catch (error) { return false; }
        if (spec.mode !== 'geometry') return false;
        const token = `[[qmx-diagram:${payload}]]`; const textarea = findTokenTextarea(token) || window.QmxDiagramLauncher?.getActiveTextarea?.(); let replaceRange = null;
        if (textarea) { const start = textarea.value.indexOf(token); if (start >= 0) replaceRange = { start, end: start + token.length }; }
        open({ tool: { id: 'geometry' }, textarea, initialSpec: spec, replaceRange, editMode: true }); return true;
    }
    function registerHandlers() { const launcher = window.QmxDiagramLauncher; if (!launcher?.registerToolHandler) return false; launcher.registerToolHandler('geometry', open); return true; }
    function onKeydown(event) {
        if (!state.root || state.root.hidden) return; const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
        if (event.key === 'Escape') { if (state.draft.length) { state.draft = []; renderDraft(); setStatus('Draft cancelled.'); } else close(); event.preventDefault(); return; }
        if (event.key === 'Enter' && state.activeTool === 'polygon' && !editing) { event.preventDefault(); finishPolygon(); }
        if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) { event.preventDefault(); deleteSelected(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && !editing) { event.preventDefault(); duplicateSelected(); }
    }
    function init() { buildEditor(); if (!registerHandlers()) document.addEventListener('qmx:diagram-launcher-ready', registerHandlers, { once: true }); }

    window.QmxGeometryEditor = Object.freeze({ version: '1.0.0', open, close, openFromPreview });
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})(window, document);
