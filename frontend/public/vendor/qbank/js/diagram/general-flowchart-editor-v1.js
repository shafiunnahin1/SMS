(function (window, document) {
    'use strict';

    if (window.QmxGeneralFlowchartEditor?.version) return;

    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Drawing] Diagram renderer must load first.');
        return;
    }

    const state = {
        root: null,
        dialog: null,
        svg: null,
        objectLayer: null,
        selectionLayer: null,
        gridRect: null,
        backgroundImage: null,
        context: null,
        document: null,
        selectedId: null,
        history: [],
        historyIndex: -1,
        interaction: null,
        snap: true,
        grid: true,
        importedImage: null,
        mode: 'general-drawing',
        controls: {}
    };

    const TYPES = {
        rect: { label: 'Rectangle', labelBn: 'আয়তক্ষেত্র', text: '' },
        ellipse: { label: 'Ellipse', labelBn: 'বৃত্ত / উপবৃত্ত', text: '' },
        triangle: { label: 'Triangle', labelBn: 'ত্রিভুজ', text: '' },
        text: { label: 'Text', labelBn: 'লেখা', text: 'লেখা' },
        line: { label: 'Line', labelBn: 'রেখা', text: '' },
        arrow: { label: 'Arrow', labelBn: 'তীর', text: '' },
        terminator: { label: 'Start / End', labelBn: 'শুরু / শেষ', text: 'Start' },
        process: { type: 'rect', label: 'Process', labelBn: 'প্রক্রিয়া', text: 'Process' },
        decision: { type: 'diamond', label: 'Decision', labelBn: 'সিদ্ধান্ত', text: 'Decision' },
        input: { type: 'parallelogram', label: 'Input / Output', labelBn: 'ইনপুট / আউটপুট', text: 'Input / Output' },
        document: { label: 'Document', labelBn: 'ডকুমেন্ট', text: 'Document' },
        diamond: { label: 'Diamond', labelBn: 'ডায়মন্ড', text: '' },
        parallelogram: { label: 'Parallelogram', labelBn: 'সামান্তরিক', text: '' }
    };

    function uid(prefix = 'obj') {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function snap(value) {
        const size = state.document?.gridSize || 10;
        return state.snap ? Math.round(value / size) * size : value;
    }

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[char]);
    }

    function createDocument(mode) {
        return {
            version: 1,
            id: uid('diagram'),
            mode: mode === 'flowchart' ? 'flowchart' : 'general-drawing',
            title: mode === 'flowchart' ? 'Flowchart' : 'General Drawing',
            width: 900,
            height: 520,
            background: '#ffffff',
            gridSize: 10,
            objects: []
        };
    }

    function defaultObject(typeKey) {
        const definition = TYPES[typeKey] || TYPES.rect;
        const type = definition.type || typeKey;
        const lineLike = type === 'line' || type === 'arrow';
        const textOnly = type === 'text';
        return {
            id: uid(type),
            type,
            x: 310 + Math.round(Math.random() * 60),
            y: 190 + Math.round(Math.random() * 50),
            w: lineLike ? 170 : (textOnly ? 180 : 170),
            h: lineLike ? 80 : (textOnly ? 45 : 84),
            text: definition.text || '',
            fill: lineLike || textOnly ? 'transparent' : '#ffffff',
            stroke: '#0f172a',
            strokeWidth: 2,
            fontSize: 20,
            fontWeight: 'normal',
            textColor: '#0f172a',
            dash: false,
            opacity: 1,
            rotation: 0
        };
    }

    function selectedObject() {
        return state.document?.objects.find((object) => object.id === state.selectedId) || null;
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
        state.selectedId = null;
        render();
        syncDocumentControls();
        updateHistoryButtons();
    }

    function undo() {
        restoreHistory(state.historyIndex - 1);
    }

    function redo() {
        restoreHistory(state.historyIndex + 1);
    }

    function updateHistoryButtons() {
        if (!state.controls.undo) return;
        state.controls.undo.disabled = state.historyIndex <= 0;
        state.controls.redo.disabled = state.historyIndex >= state.history.length - 1;
    }

    function addStyles() {
        if (document.getElementById('qmx-general-flowchart-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'qmx-general-flowchart-editor-styles';
        style.textContent = `
.qmx-draw-editor[hidden]{display:none!important}.qmx-draw-editor{position:fixed;inset:0;z-index:10080;display:grid;place-items:center;padding:10px;background:rgba(15,23,42,.66);backdrop-filter:blur(2px)}
.qmx-draw-dialog{width:min(1460px,100%);height:min(94vh,940px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;color:#0f172a;box-shadow:0 28px 90px rgba(15,23,42,.34)}
.qmx-draw-header{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #dbe4ef;background:#fff}.qmx-draw-title{min-width:180px;margin-right:auto}.qmx-draw-title strong{display:block}.qmx-draw-title span{display:block;color:#64748b;font-size:11px}
.qmx-draw-action,.qmx-draw-tool,.qmx-draw-close{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}.qmx-draw-action:hover,.qmx-draw-tool:hover,.qmx-draw-close:hover{border-color:#60a5fa;background:#eff6ff}.qmx-draw-action:disabled{cursor:not-allowed;opacity:.45}.qmx-draw-action.is-primary{border-color:#2563eb;background:#2563eb;color:#fff}.qmx-draw-action.is-danger{color:#b91c1c}.qmx-draw-close{font-size:20px;line-height:1;padding:6px 10px}
.qmx-draw-workspace{min-height:0;flex:1;display:grid;grid-template-columns:190px minmax(0,1fr) 250px;gap:10px;padding:10px}.qmx-draw-panel{min-height:0;overflow:auto;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:10px}.qmx-draw-panel h3{margin:0 0 8px;font-size:13px}.qmx-draw-palette{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-draw-tool{min-height:54px;padding:7px 5px;font-size:11px}.qmx-draw-tool span{display:block;color:#64748b;font-size:10px;font-weight:500;margin-top:2px}
.qmx-draw-import{display:grid;gap:7px;margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0}.qmx-draw-import input[type=file]{width:100%;font-size:11px}.qmx-draw-import label{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}.qmx-draw-import input[type=range]{width:100%}.qmx-draw-help{margin:10px 0 0;color:#64748b;font-size:10px;line-height:1.45}
.qmx-draw-stage-wrap{min-width:0;min-height:0;display:grid;place-items:center;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;background:#e2e8f0;padding:18px}.qmx-draw-stage{display:block;width:min(100%,1100px);height:auto;max-height:100%;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none;user-select:none}.qmx-draw-object{cursor:move}.qmx-draw-object.is-line{cursor:crosshair}.qmx-draw-selection-box{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke;pointer-events:none}.qmx-draw-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:nwse-resize}.qmx-draw-line-handle{cursor:crosshair}.qmx-draw-rotate-stem{stroke:#2563eb;stroke-width:1.5;vector-effect:non-scaling-stroke;pointer-events:none}.qmx-draw-rotate-handle{fill:#fff;stroke:#2563eb;stroke-width:2;vector-effect:non-scaling-stroke;cursor:grab}.qmx-draw-rotate-handle:active{cursor:grabbing}.qmx-draw-stage text{user-select:none;pointer-events:none}
.qmx-draw-properties{display:grid;gap:10px}.qmx-draw-field{display:grid;gap:4px;color:#475569;font-size:11px;font-weight:700}.qmx-draw-field input,.qmx-draw-field textarea,.qmx-draw-field select{width:100%;min-width:0;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:7px 8px;font-size:12px;font-weight:400;box-sizing:border-box}.qmx-draw-field textarea{min-height:68px;resize:vertical}.qmx-draw-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-draw-check{display:flex;align-items:center;gap:7px;color:#334155;font-size:12px;font-weight:600}.qmx-draw-property-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-draw-empty-props{padding:16px 5px;color:#64748b;font-size:12px;text-align:center}
.qmx-draw-footer{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid #dbe4ef;background:#fff}.qmx-draw-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;font-size:11px}.qmx-draw-footer .qmx-draw-action:first-of-type{margin-left:auto}.qmx-draw-image-note{border-radius:8px;background:#fff7ed;color:#9a3412;padding:7px;font-size:10px;line-height:1.4}
@media(max-width:1000px){.qmx-draw-workspace{grid-template-columns:150px minmax(0,1fr) 210px}.qmx-draw-palette{grid-template-columns:1fr}.qmx-draw-header{overflow-x:auto}.qmx-draw-title{min-width:150px}}
@media(max-width:720px){.qmx-draw-editor{padding:0}.qmx-draw-dialog{width:100%;height:100%;border-radius:0}.qmx-draw-workspace{grid-template-columns:1fr;grid-template-rows:auto minmax(330px,1fr) auto;overflow:auto}.qmx-draw-panel{overflow:visible}.qmx-draw-palette{grid-template-columns:repeat(4,1fr)}.qmx-draw-properties{grid-template-columns:repeat(2,minmax(0,1fr))}.qmx-draw-header{flex-wrap:nowrap}.qmx-draw-title span{display:none}.qmx-draw-footer{position:sticky;bottom:0}.qmx-draw-stage-wrap{min-height:380px}}
        `;
        document.head.appendChild(style);
    }

    function buildEditor() {
        if (state.root) return;
        addStyles();

        const root = document.createElement('div');
        root.className = 'qmx-draw-editor';
        root.hidden = true;
        root.innerHTML = `
<section class="qmx-draw-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-draw-title">
<header class="qmx-draw-header">
<div class="qmx-draw-title"><strong id="qmx-draw-title">Editable Drawing</strong><span data-draw-subtitle>General Drawing</span></div>
<button type="button" class="qmx-draw-action" data-draw-new>New</button>
<button type="button" class="qmx-draw-action" data-draw-undo>Undo</button>
<button type="button" class="qmx-draw-action" data-draw-redo>Redo</button>
<button type="button" class="qmx-draw-action" data-draw-duplicate>Duplicate</button>
<button type="button" class="qmx-draw-action is-danger" data-draw-delete>Delete</button>
<button type="button" class="qmx-draw-close" data-draw-close aria-label="Close">&times;</button>
</header>
<div class="qmx-draw-workspace">
<aside class="qmx-draw-panel">
<h3>Tools</h3>
<div class="qmx-draw-palette" data-draw-palette></div>
<div class="qmx-draw-import">
<h3>Import & Trace</h3>
<label>JPG/PNG reference<input type="file" accept="image/png,image/jpeg" data-draw-image></label>
<label>Reference opacity<input type="range" min="0.05" max="1" step="0.05" value="0.35" data-draw-image-opacity></label>
<label class="qmx-draw-check"><input type="checkbox" checked data-draw-image-visible> Show reference</label>
<button type="button" class="qmx-draw-action" data-draw-image-clear>Remove image</button>
<div class="qmx-draw-image-note">Imported image is a local tracing reference. It is excluded from the saved editable token in this MVP.</div>
</div>
<p class="qmx-draw-help">Select an object to drag it. Use the blue handle to resize. Double-click an object to edit its label.</p>
</aside>
<main class="qmx-draw-stage-wrap">
<svg class="qmx-draw-stage" data-draw-svg viewBox="0 0 900 520" role="application" aria-label="Editable diagram canvas">
<defs>
<pattern id="qmx-draw-grid-small" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern>
<marker id="qmx-draw-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0f172a"/></marker>
</defs>
<rect width="900" height="520" fill="#fff" data-draw-background></rect>
<rect width="900" height="520" fill="url(#qmx-draw-grid-small)" data-draw-grid></rect>
<image x="0" y="0" width="900" height="520" preserveAspectRatio="xMidYMid meet" opacity=".35" data-draw-background-image style="display:none;pointer-events:none"></image>
<g data-draw-objects></g><g data-draw-selection></g>
</svg>
</main>
<aside class="qmx-draw-panel">
<h3>Document</h3>
<div class="qmx-draw-properties">
<label class="qmx-draw-field">Title<input type="text" maxlength="300" data-doc-title></label>
<div class="qmx-draw-row"><label class="qmx-draw-field">Width<input type="number" min="240" max="2400" data-doc-width></label><label class="qmx-draw-field">Height<input type="number" min="180" max="1800" data-doc-height></label></div>
<label class="qmx-draw-field">Background<input type="color" value="#ffffff" data-doc-background></label>
<label class="qmx-draw-check"><input type="checkbox" checked data-doc-grid> Show grid</label>
<label class="qmx-draw-check"><input type="checkbox" checked data-doc-snap> Snap to grid</label>
</div>
<hr style="border:0;border-top:1px solid #e2e8f0;margin:13px 0">
<h3>Selected object</h3>
<div data-draw-properties></div>
</aside>
</div>
<footer class="qmx-draw-footer">
<span class="qmx-draw-status" data-draw-status aria-live="polite"></span>
<button type="button" class="qmx-draw-action" data-draw-export-svg>Export SVG</button>
<button type="button" class="qmx-draw-action" data-draw-export-png>Export PNG</button>
<button type="button" class="qmx-draw-action is-primary" data-draw-insert>Insert into question</button>
</footer>
</section>`;
        document.body.appendChild(root);

        state.root = root;
        state.dialog = root.querySelector('.qmx-draw-dialog');
        state.svg = root.querySelector('[data-draw-svg]');
        state.objectLayer = root.querySelector('[data-draw-objects]');
        state.selectionLayer = root.querySelector('[data-draw-selection]');
        state.gridRect = root.querySelector('[data-draw-grid]');
        state.backgroundImage = root.querySelector('[data-draw-background-image]');
        state.controls = {
            subtitle: root.querySelector('[data-draw-subtitle]'),
            palette: root.querySelector('[data-draw-palette]'),
            properties: root.querySelector('[data-draw-properties]'),
            status: root.querySelector('[data-draw-status]'),
            undo: root.querySelector('[data-draw-undo]'),
            redo: root.querySelector('[data-draw-redo]'),
            title: root.querySelector('[data-doc-title]'),
            width: root.querySelector('[data-doc-width]'),
            height: root.querySelector('[data-doc-height]'),
            background: root.querySelector('[data-doc-background]'),
            grid: root.querySelector('[data-doc-grid]'),
            snap: root.querySelector('[data-doc-snap]'),
            imageInput: root.querySelector('[data-draw-image]'),
            imageOpacity: root.querySelector('[data-draw-image-opacity]'),
            imageVisible: root.querySelector('[data-draw-image-visible]')
        };

        bindEvents();
    }

    function paletteTypes() {
        if (state.mode === 'flowchart') {
            return ['terminator', 'process', 'decision', 'input', 'document', 'arrow', 'line', 'text'];
        }
        return ['rect', 'ellipse', 'triangle', 'diamond', 'parallelogram', 'line', 'arrow', 'text'];
    }

    function renderPalette() {
        state.controls.palette.innerHTML = '';
        paletteTypes().forEach((typeKey) => {
            const definition = TYPES[typeKey];
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'qmx-draw-tool';
            button.dataset.drawAdd = typeKey;
            button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(definition.id, definition.label, definition.labelBn) : `${esc(definition.label)}<span>${esc(definition.labelBn)}</span>`;
            state.controls.palette.appendChild(button);
        });
    }

    function bindEvents() {
        const root = state.root;
        root.querySelector('[data-draw-close]').addEventListener('click', close);
        root.addEventListener('mousedown', (event) => { if (event.target === root) close(); });
        root.querySelector('[data-draw-new]').addEventListener('click', () => {
            if (!window.confirm('Start a new drawing? Current unsaved changes will be cleared.')) return;
            state.document = createDocument(state.mode);
            state.selectedId = null;
            state.importedImage = null;
            state.backgroundImage.removeAttribute('href');
            state.backgroundImage.style.display = 'none';
            state.history = [];
            state.historyIndex = -1;
            pushHistory();
            render();
            syncDocumentControls();
            setStatus('New drawing created.');
        });
        root.querySelector('[data-draw-undo]').addEventListener('click', undo);
        root.querySelector('[data-draw-redo]').addEventListener('click', redo);
        root.querySelector('[data-draw-duplicate]').addEventListener('click', duplicateSelected);
        root.querySelector('[data-draw-delete]').addEventListener('click', deleteSelected);
        root.querySelector('[data-draw-insert]').addEventListener('click', insertIntoQuestion);
        root.querySelector('[data-draw-export-svg]').addEventListener('click', exportSvg);
        root.querySelector('[data-draw-export-png]').addEventListener('click', exportPng);
        root.querySelector('[data-draw-image-clear]').addEventListener('click', clearImportedImage);

        state.controls.palette.addEventListener('click', (event) => {
            const button = event.target.closest('[data-draw-add]');
            if (!button) return;
            addObject(button.dataset.drawAdd);
        });

        state.controls.title.addEventListener('input', () => {
            state.document.title = state.controls.title.value;
            setStatus('Title updated.');
        });
        state.controls.title.addEventListener('change', pushHistory);
        state.controls.width.addEventListener('change', updateDocumentSize);
        state.controls.height.addEventListener('change', updateDocumentSize);
        state.controls.background.addEventListener('input', () => {
            state.document.background = state.controls.background.value;
            render();
        });
        state.controls.background.addEventListener('change', pushHistory);
        state.controls.grid.addEventListener('change', () => {
            state.grid = state.controls.grid.checked;
            render();
        });
        state.controls.snap.addEventListener('change', () => {
            state.snap = state.controls.snap.checked;
            setStatus(state.snap ? 'Grid snapping enabled.' : 'Grid snapping disabled.');
        });

        state.controls.imageInput.addEventListener('change', importImage);
        state.controls.imageOpacity.addEventListener('input', updateImageReference);
        state.controls.imageVisible.addEventListener('change', updateImageReference);

        state.svg.addEventListener('pointerdown', onPointerDown);
        state.svg.addEventListener('pointermove', onPointerMove);
        state.svg.addEventListener('pointerup', endInteraction);
        state.svg.addEventListener('pointercancel', endInteraction);
        state.svg.addEventListener('dblclick', onDoubleClick);
        // Background deselection is handled in onPointerDown.
        // Do not also deselect on click: pointer capture can retarget a
        // simple object click to the SVG root after pointerup.
        state.svg.dataset.qmxClickSelectionFix = '2.0.3';

        root.addEventListener('keydown', onKeydown);
    }

    function addObject(typeKey) {
        const object = defaultObject(typeKey);
        object.x = snap((state.document.width - object.w) / 2 + Math.random() * 60 - 30);
        object.y = snap((state.document.height - object.h) / 2 + Math.random() * 60 - 30);
        state.document.objects.push(object);
        state.selectedId = object.id;
        pushHistory();
        render();
        setStatus(`${TYPES[typeKey]?.label || typeKey} added.`);
    }

    function objectShapeMarkup(object) {
        const { x, y, w, h } = object;
        const x2 = x + w;
        const y2 = y + h;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const common = `fill="${esc(object.fill)}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${object.dash ? ' stroke-dasharray="8 5"' : ''} opacity="${object.opacity}" vector-effect="non-scaling-stroke"`;
        let shape = '';
        switch (object.type) {
            case 'ellipse':
                shape = `<ellipse cx="${cx}" cy="${cy}" rx="${Math.abs(w / 2)}" ry="${Math.abs(h / 2)}" ${common}/>`;
                break;
            case 'triangle':
                shape = `<polygon points="${cx},${y} ${x2},${y2} ${x},${y2}" ${common}/>`;
                break;
            case 'diamond':
                shape = `<polygon points="${cx},${y} ${x2},${cy} ${cx},${y2} ${x},${cy}" ${common}/>`;
                break;
            case 'terminator':
                shape = `<rect x="${Math.min(x, x2)}" y="${Math.min(y, y2)}" width="${Math.abs(w)}" height="${Math.abs(h)}" rx="${Math.min(Math.abs(h) / 2, 36)}" ${common}/>`;
                break;
            case 'parallelogram': {
                const slant = Math.min(28, Math.abs(w) / 4);
                shape = `<polygon points="${x + slant},${y} ${x2},${y} ${x2 - slant},${y2} ${x},${y2}" ${common}/>`;
                break;
            }
            case 'document': {
                const wave = Math.min(14, Math.abs(h) / 5);
                shape = `<path d="M ${x} ${y} H ${x2} V ${y2 - wave} C ${x2 - w * .25} ${y2 + wave}, ${x + w * .25} ${y2 - wave * 2}, ${x} ${y2} Z" ${common}/>`;
                break;
            }
            case 'line':
            case 'arrow':
                return `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${esc(object.stroke)}" stroke-width="${object.strokeWidth}"${object.dash ? ' stroke-dasharray="8 5"' : ''}${object.type === 'arrow' ? ' marker-end="url(#qmx-draw-arrow)"' : ''} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>`;
            case 'text':
                return `<rect x="${Math.min(x, x2)}" y="${Math.min(y, y2)}" width="${Math.max(Math.abs(w), 24)}" height="${Math.max(Math.abs(h), 24)}" fill="transparent" stroke="none" pointer-events="all"/>${textMarkup(object, cx, cy)}`;
            default:
                shape = `<rect x="${Math.min(x, x2)}" y="${Math.min(y, y2)}" width="${Math.abs(w)}" height="${Math.abs(h)}" rx="4" ${common}/>`;
        }
        return shape + textMarkup(object, cx, cy);
    }

    function textMarkup(object, x, y) {
        if (!object.text) return '';
        const lines = String(object.text).split(/\r?\n/).slice(0, 10);
        const lineHeight = object.fontSize * 1.22;
        const startY = y - ((lines.length - 1) * lineHeight) / 2;
        return `<text x="${x}" y="${startY}" fill="${esc(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Noto Sans Bengali, sans-serif">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`).join('')}</text>`;
    }

    function renderObjects() {
        state.objectLayer.innerHTML = state.document.objects.map((object) => {
            const lineClass = ['line', 'arrow'].includes(object.type) ? ' is-line' : '';
            const cx = object.x + object.w / 2;
            const cy = object.y + object.h / 2;
            const rotation = Number(object.rotation) || 0;
            const transform = rotation ? ` transform="rotate(${rotation} ${cx} ${cy})"` : '';
            return `<g class="qmx-draw-object${lineClass}" data-object-id="${esc(object.id)}"${transform}>${objectShapeMarkup(object)}</g>`;
        }).join('');
    }

    function renderSelection() {
        const object = selectedObject();
        state.selectionLayer.innerHTML = '';
        if (!object) return;
        const minX = Math.min(object.x, object.x + object.w);
        const minY = Math.min(object.y, object.y + object.h);
        const width = Math.abs(object.w);
        const height = Math.abs(object.h);
        const handleX = object.x + object.w;
        const handleY = object.y + object.h;
        const cx = object.x + object.w / 2;
        const cy = object.y + object.h / 2;
        const rotateX = minX + width / 2;
        const rotateY = minY - 34;
        const rotation = Number(object.rotation) || 0;
        const transform = rotation ? ` transform="rotate(${rotation} ${cx} ${cy})"` : '';
        state.selectionLayer.innerHTML = `<g${transform}><rect class="qmx-draw-selection-box" x="${minX - 4}" y="${minY - 4}" width="${Math.max(width + 8, 10)}" height="${Math.max(height + 8, 10)}"/><line class="qmx-draw-rotate-stem" x1="${rotateX}" y1="${minY - 4}" x2="${rotateX}" y2="${rotateY}"/><circle class="qmx-draw-rotate-handle" data-rotate-handle cx="${rotateX}" cy="${rotateY}" r="7"/><circle class="qmx-draw-handle${['line', 'arrow'].includes(object.type) ? ' qmx-draw-line-handle' : ''}" data-resize-handle cx="${handleX}" cy="${handleY}" r="7"/></g>`;
    }

    function render() {
        if (!state.document || !state.svg) return;
        state.svg.setAttribute('viewBox', `0 0 ${state.document.width} ${state.document.height}`);
        state.svg.querySelector('[data-draw-background]').setAttribute('width', state.document.width);
        state.svg.querySelector('[data-draw-background]').setAttribute('height', state.document.height);
        state.svg.querySelector('[data-draw-background]').setAttribute('fill', state.document.background);
        state.gridRect.setAttribute('width', state.document.width);
        state.gridRect.setAttribute('height', state.document.height);
        state.gridRect.style.display = state.grid ? '' : 'none';
        state.backgroundImage.setAttribute('width', state.document.width);
        state.backgroundImage.setAttribute('height', state.document.height);
        renderObjects();
        renderSelection();
        renderProperties();
        updateHistoryButtons();
    }

    function selectObject(id) {
        state.selectedId = id;
        renderSelection();
        renderProperties();
    }

    function renderProperties() {
        const container = state.controls.properties;
        const object = selectedObject();
        if (!object) {
            container.innerHTML = '<div class="qmx-draw-empty-props">Select an object to edit its properties.</div>';
            return;
        }
        container.innerHTML = `
<div class="qmx-draw-properties">
<label class="qmx-draw-field">Text<textarea data-object-property="text">${esc(object.text)}</textarea></label>
<div class="qmx-draw-row"><label class="qmx-draw-field">X<input type="number" data-object-property="x" value="${object.x}"></label><label class="qmx-draw-field">Y<input type="number" data-object-property="y" value="${object.y}"></label></div>
<div class="qmx-draw-row"><label class="qmx-draw-field">Width<input type="number" data-object-property="w" value="${object.w}"></label><label class="qmx-draw-field">Height<input type="number" data-object-property="h" value="${object.h}"></label></div>
<label class="qmx-draw-field">Rotation (degrees)<input type="number" min="-360" max="360" step="1" data-object-property="rotation" value="${Number(object.rotation) || 0}"></label>
<div class="qmx-draw-row"><label class="qmx-draw-field">Fill<input type="color" data-object-property="fill" value="${object.fill === 'transparent' ? '#ffffff' : esc(object.fill)}"></label><label class="qmx-draw-field">Stroke<input type="color" data-object-property="stroke" value="${esc(object.stroke)}"></label></div>
<div class="qmx-draw-row"><label class="qmx-draw-field">Line width<input type="number" min="0" max="20" step=".5" data-object-property="strokeWidth" value="${object.strokeWidth}"></label><label class="qmx-draw-field">Font size<input type="number" min="8" max="96" data-object-property="fontSize" value="${object.fontSize}"></label></div>
<label class="qmx-draw-field">Text color<input type="color" data-object-property="textColor" value="${esc(object.textColor)}"></label>
<label class="qmx-draw-check"><input type="checkbox" data-object-property="transparent" ${object.fill === 'transparent' ? 'checked' : ''}> Transparent fill</label>
<label class="qmx-draw-check"><input type="checkbox" data-object-property="dash" ${object.dash ? 'checked' : ''}> Dashed stroke</label>
<label class="qmx-draw-check"><input type="checkbox" data-object-property="fontWeight" ${object.fontWeight === 'bold' ? 'checked' : ''}> Bold text</label>
<div class="qmx-draw-property-actions"><button type="button" class="qmx-draw-action" data-object-front>Bring front</button><button type="button" class="qmx-draw-action" data-object-back>Send back</button></div>
</div>`;
        container.querySelectorAll('[data-object-property]').forEach((input) => {
            input.addEventListener('input', updateSelectedProperty);
            input.addEventListener('change', () => {
                pushHistory();
                render();
            });
        });
        container.querySelector('[data-object-front]').addEventListener('click', bringFront);
        container.querySelector('[data-object-back]').addEventListener('click', sendBack);
    }

    function updateSelectedProperty(event) {
        const object = selectedObject();
        if (!object) return;
        const key = event.target.dataset.objectProperty;
        if (key === 'transparent') object.fill = event.target.checked ? 'transparent' : '#ffffff';
        else if (key === 'dash') object.dash = event.target.checked;
        else if (key === 'fontWeight') object.fontWeight = event.target.checked ? 'bold' : 'normal';
        else if (['x', 'y', 'w', 'h', 'strokeWidth', 'fontSize', 'rotation'].includes(key)) object[key] = Number(event.target.value) || 0;
        else object[key] = event.target.value;
        renderObjects();
        renderSelection();
    }

    function syncDocumentControls() {
        state.controls.title.value = state.document.title || '';
        state.controls.width.value = state.document.width;
        state.controls.height.value = state.document.height;
        state.controls.background.value = state.document.background;
        state.controls.grid.checked = state.grid;
        state.controls.snap.checked = state.snap;
    }

    function updateDocumentSize() {
        state.document.width = clamp(Number(state.controls.width.value) || 900, 240, 2400);
        state.document.height = clamp(Number(state.controls.height.value) || 520, 180, 1800);
        syncDocumentControls();
        render();
        pushHistory();
    }

    function svgPoint(event) {
        const point = state.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const transformed = point.matrixTransform(state.svg.getScreenCTM().inverse());
        return { x: transformed.x, y: transformed.y };
    }

    function normalizeAngle(value) {
        let angle = Number(value) || 0;
        angle = ((angle + 180) % 360 + 360) % 360 - 180;
        return Math.round(angle * 10) / 10;
    }

    function onPointerDown(event) {
        const rotateHandle = event.target.closest('[data-rotate-handle]');
        const resizeHandle = event.target.closest('[data-resize-handle]');
        const group = event.target.closest('[data-object-id]');
        const point = svgPoint(event);
        if (rotateHandle && state.selectedId) {
            const object = selectedObject();
            const center = { x: object.x + object.w / 2, y: object.y + object.h / 2 };
            state.interaction = {
                type: 'rotate',
                pointerId: event.pointerId,
                center,
                startAngle: Math.atan2(point.y - center.y, point.x - center.x),
                original: clone(object)
            };
            state.svg.setPointerCapture(event.pointerId);
            event.preventDefault();
            return;
        }
        if (resizeHandle && state.selectedId) {
            const object = selectedObject();
            state.interaction = { type: 'resize', pointerId: event.pointerId, start: point, original: clone(object) };
            state.svg.setPointerCapture(event.pointerId);
            event.preventDefault();
            return;
        }
        if (group) {
            const id = group.dataset.objectId;
            selectObject(id);
            const object = selectedObject();
            state.interaction = { type: 'move', pointerId: event.pointerId, start: point, original: clone(object) };
            state.svg.setPointerCapture(event.pointerId);
            event.preventDefault();
            return;
        }
        selectObject(null);
    }

    function onPointerMove(event) {
        if (!state.interaction || state.interaction.pointerId !== event.pointerId) return;
        const object = selectedObject();
        if (!object) return;
        const point = svgPoint(event);
        if (state.interaction.type === 'rotate') {
            const currentAngle = Math.atan2(
                point.y - state.interaction.center.y,
                point.x - state.interaction.center.x
            );
            let rotation = (Number(state.interaction.original.rotation) || 0)
                + (currentAngle - state.interaction.startAngle) * 180 / Math.PI;
            if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
            object.rotation = normalizeAngle(rotation);
        } else {
            const dx = point.x - state.interaction.start.x;
            const dy = point.y - state.interaction.start.y;
            if (state.interaction.type === 'move') {
                object.x = snap(state.interaction.original.x + dx);
                object.y = snap(state.interaction.original.y + dy);
            } else {
                const radians = (Number(state.interaction.original.rotation) || 0) * Math.PI / 180;
                const localDx = Math.cos(radians) * dx + Math.sin(radians) * dy;
                const localDy = -Math.sin(radians) * dx + Math.cos(radians) * dy;
                object.w = snap(state.interaction.original.w + localDx);
                object.h = snap(state.interaction.original.h + localDy);
                if (!['line', 'arrow'].includes(object.type)) {
                    if (Math.abs(object.w) < 20) object.w = object.w < 0 ? -20 : 20;
                    if (Math.abs(object.h) < 20) object.h = object.h < 0 ? -20 : 20;
                }
            }
        }
        renderObjects();
        renderSelection();
    }

    function endInteraction(event) {
        if (!state.interaction || state.interaction.pointerId !== event.pointerId) return;
        if (state.svg.hasPointerCapture(event.pointerId)) state.svg.releasePointerCapture(event.pointerId);
        state.interaction = null;
        pushHistory();
        renderProperties();
    }

    function onDoubleClick(event) {
        const group = event.target.closest('[data-object-id]');
        if (!group) return;
        selectObject(group.dataset.objectId);
        const input = state.controls.properties.querySelector('[data-object-property="text"]');
        input?.focus();
        input?.select();
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        state.document.objects = state.document.objects.filter((object) => object.id !== state.selectedId);
        state.selectedId = null;
        pushHistory();
        render();
        setStatus('Object deleted.');
    }

    function duplicateSelected() {
        const object = selectedObject();
        if (!object) return;
        const copy = clone(object);
        copy.id = uid(copy.type);
        copy.x += 20;
        copy.y += 20;
        state.document.objects.push(copy);
        state.selectedId = copy.id;
        pushHistory();
        render();
        setStatus('Object duplicated.');
    }

    function bringFront() {
        const index = state.document.objects.findIndex((object) => object.id === state.selectedId);
        if (index < 0) return;
        const [object] = state.document.objects.splice(index, 1);
        state.document.objects.push(object);
        pushHistory();
        render();
    }

    function sendBack() {
        const index = state.document.objects.findIndex((object) => object.id === state.selectedId);
        if (index < 0) return;
        const [object] = state.document.objects.splice(index, 1);
        state.document.objects.unshift(object);
        pushHistory();
        render();
    }

    function importImage(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!['image/png', 'image/jpeg'].includes(file.type)) {
            setStatus('Only JPG and PNG images are supported.');
            event.target.value = '';
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            setStatus('Image must be 8 MB or smaller.');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            state.importedImage = String(reader.result || '');
            state.backgroundImage.setAttribute('href', state.importedImage);
            state.backgroundImage.style.display = '';
            state.controls.imageVisible.checked = true;
            updateImageReference();
            setStatus('Reference image imported. Trace it with editable shapes.');
        };
        reader.onerror = () => setStatus('Image import failed.');
        reader.readAsDataURL(file);
    }

    function updateImageReference() {
        const visible = Boolean(state.importedImage) && state.controls.imageVisible.checked;
        state.backgroundImage.style.display = visible ? '' : 'none';
        state.backgroundImage.setAttribute('opacity', state.controls.imageOpacity.value || '.35');
    }

    function clearImportedImage() {
        state.importedImage = null;
        state.backgroundImage.removeAttribute('href');
        state.backgroundImage.style.display = 'none';
        state.controls.imageInput.value = '';
        setStatus('Reference image removed.');
    }

    function makeToken() {
        const payload = Diagram.encodeSpec(state.document);
        return `[[qmx-diagram:${payload}]]`;
    }

    function insertIntoQuestion() {
        const textarea = state.context?.textarea;
        if (!textarea) {
            setStatus('No target question field was found. Close the editor, focus a text field and reopen Diagram.');
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
        setStatus('Diagram inserted into the question. Save the question to persist it.');
        window.setTimeout(close, 250);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function exportSvg() {
        const svg = Diagram.svgMarkup(state.document);
        downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(state.document.title)}.svg`);
        setStatus('SVG exported.');
    }

    function exportPng() {
        const svg = Diagram.svgMarkup(state.document);
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = state.document.width;
            canvas.height = state.document.height;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            URL.revokeObjectURL(url);
            canvas.toBlob((png) => {
                if (png) downloadBlob(png, `${safeFilename(state.document.title)}.png`);
            }, 'image/png');
            setStatus('PNG exported.');
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            setStatus('PNG export failed.');
        };
        image.src = url;
    }

    function safeFilename(value) {
        return String(value || 'diagram').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'diagram';
    }

    function setStatus(message) {
        if (state.controls.status) state.controls.status.textContent = message;
    }

    function onKeydown(event) {
        if (!state.root || state.root.hidden) return;
        const tag = document.activeElement?.tagName;
        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
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

    function open(context = {}) {
        buildEditor();
        state.context = context;
        state.mode = context.tool?.id === 'flowchart' || context.mode === 'flowchart' ? 'flowchart' : 'general-drawing';
        state.document = context.initialSpec
            ? Diagram.normalizeSpec(context.initialSpec)
            : createDocument(state.mode);
        state.document.mode = state.mode;
        state.selectedId = null;
        state.grid = true;
        state.snap = true;
        state.importedImage = null;
        state.backgroundImage.removeAttribute('href');
        state.backgroundImage.style.display = 'none';
        state.controls.imageInput.value = '';
        state.controls.imageOpacity.value = '.35';
        state.controls.imageVisible.checked = true;
        state.history = [];
        state.historyIndex = -1;
        pushHistory();
        renderPalette();
        syncDocumentControls();
        render();
        state.controls.subtitle.textContent = state.mode === 'flowchart' ? 'Flowchart Editor' : 'General Drawing Editor';
        setStatus(context.initialSpec ? 'Existing editable diagram loaded.' : 'Create shapes, import a tracing image, then insert into the question.');
        state.root.hidden = false;
        document.body.dataset.qmxDrawOverflow = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';
        window.setTimeout(() => state.svg.focus?.(), 0);
    }

    function close() {
        if (!state.root || state.root.hidden) return;
        state.root.hidden = true;
        document.body.style.overflow = document.body.dataset.qmxDrawOverflow || '';
        delete document.body.dataset.qmxDrawOverflow;
        state.context?.textarea?.focus?.();
    }

    function findTokenTextarea(token) {
        return Array.from(document.querySelectorAll('textarea')).find((textarea) => textarea.value.includes(token)) || null;
    }

    function openFromPreview(figure) {
        if (figure?.closest('[data-preview-readonly="true"]')) return;
        const payload = String(figure.dataset.qmxDiagramPayload || '');
        if (!payload) return;
        let spec;
        try { spec = Diagram.decodePayload(payload); }
        catch (error) { setStatus('Selected diagram could not be decoded.'); return; }
        if (spec.mode === 'geometry' && window.QmxGeometryEditor?.openFromPreview) {
            return window.QmxGeometryEditor.openFromPreview(figure);
        }
        if (spec.mode === 'coordinate-geometry' && window.QmxCoordinateGeometryEditor?.openFromPreview) {
            return window.QmxCoordinateGeometryEditor.openFromPreview(figure);
        }
        if (spec.mode === 'number-line' && window.QmxNumberLineEditor?.openFromPreview) {
            return window.QmxNumberLineEditor.openFromPreview(figure);
        }
        if (spec.mode === 'tree-diagram' && window.QmxTreeDiagramEditor?.openFromPreview) {
            return window.QmxTreeDiagramEditor.openFromPreview(figure);
        }
        if (spec.mode === 'technical-drawing' && window.QmxTechnicalDrawingEditor?.openFromPreview) {
            return window.QmxTechnicalDrawingEditor.openFromPreview(figure);
        }
        if (spec.mode === 'statistical-diagram' && window.QmxStatisticalDiagramEditor?.openFromPreview) {
            return window.QmxStatisticalDiagramEditor.openFromPreview(figure);
        }
        if (spec.mode === 'function-transformation' && window.QmxFunctionTransformationEditor?.openFromPreview) {
            return window.QmxFunctionTransformationEditor.openFromPreview(figure);
        }
        if (spec.mode === 'complex-plane' && window.QmxComplexPlaneEditor?.openFromPreview) {
            return window.QmxComplexPlaneEditor.openFromPreview(figure);
        }
        if (spec.mode === 'digital-logic' && window.QmxDigitalLogicEditor?.openFromPreview) {
            return window.QmxDigitalLogicEditor.openFromPreview(figure);
        }
        if (spec.mode === 'finite-state-machine' && window.QmxFiniteStateMachineEditor?.openFromPreview) {
            return window.QmxFiniteStateMachineEditor.openFromPreview(figure);
        }
        if (spec.mode === 'database-er' && window.QmxDatabaseErEditor?.openFromPreview) {
            return window.QmxDatabaseErEditor.openFromPreview(figure);
        }
        if (spec.mode === 'network-topology' && window.QmxNetworkTopologyEditor?.openFromPreview) {
            return window.QmxNetworkTopologyEditor.openFromPreview(figure);
        }
        if (spec.mode === 'uml-software-design' && window.QmxUmlSoftwareDesignEditor?.openFromPreview) {
            return window.QmxUmlSoftwareDesignEditor.openFromPreview(figure);
        }
        if (spec.mode === 'uml-sequence' && window.QmxUmlSequenceEditor?.openFromPreview) {
            return window.QmxUmlSequenceEditor.openFromPreview(figure);
        }
        if (spec.mode === 'uml-activity' && window.QmxUmlActivityEditor?.openFromPreview) {
            return window.QmxUmlActivityEditor.openFromPreview(figure);
        }
        if (spec.mode === 'cloud-deployment' && window.QmxCloudDeploymentEditor?.openFromPreview) {
            return window.QmxCloudDeploymentEditor.openFromPreview(figure);
        }
        if (spec.mode === 'chemical-structure' && window.QmxChemicalStructureEditor?.openFromPreview) {
            return window.QmxChemicalStructureEditor.openFromPreview(figure);
        }
        if (spec.mode === 'biological-cell' && window.QmxBiologicalCellEditor?.openFromPreview) {
            return window.QmxBiologicalCellEditor.openFromPreview(figure);
        }
        if (spec.mode === 'human-anatomy' && window.QmxHumanAnatomyEditor?.openFromPreview) {
            return window.QmxHumanAnatomyEditor.openFromPreview(figure);
        }
        if (spec.mode === 'plant-anatomy' && window.QmxPlantAnatomyEditor?.openFromPreview) {
            return window.QmxPlantAnatomyEditor.openFromPreview(figure);
        }
        if (spec.mode === 'genetics-diagram' && window.QmxGeneticsEditor?.openFromPreview) {
            return window.QmxGeneticsEditor.openFromPreview(figure);
        }
        if (spec.mode === 'ecology-diagram' && window.QmxEcologyEditor?.openFromPreview) {
            return window.QmxEcologyEditor.openFromPreview(figure);
        }
        if (spec.mode === 'geology-diagram' && window.QmxGeologyEditor?.openFromPreview) {
            return window.QmxGeologyEditor.openFromPreview(figure);
        }
        if (spec.mode === 'weather-climate-diagram' && window.QmxWeatherClimateEditor?.openFromPreview) {
            return window.QmxWeatherClimateEditor.openFromPreview(figure);
        }
        if (spec.mode === 'astronomy-diagram' && window.QmxAstronomyEditor?.openFromPreview) {
            return window.QmxAstronomyEditor.openFromPreview(figure);
        }
        if (spec.mode === 'hydrology-diagram' && window.QmxHydrologyEditor?.openFromPreview) {
            return window.QmxHydrologyEditor.openFromPreview(figure);
        }
        if (spec.mode === 'oceanography-diagram' && window.QmxOceanographyEditor?.openFromPreview) {
            return window.QmxOceanographyEditor.openFromPreview(figure);
        }
        if (spec.mode === 'environmental-science-diagram' && window.QmxEnvironmentalScienceEditor?.openFromPreview) {
            return window.QmxEnvironmentalScienceEditor.openFromPreview(figure);
        }
        if (spec.mode === 'vector-fbd' && window.QmxVectorFbdEditor?.openFromPreview) {
            return window.QmxVectorFbdEditor.openFromPreview(figure);
        }
        if (spec.mode === 'circuit' && window.QmxCircuitEditor?.openFromPreview) {
            return window.QmxCircuitEditor.openFromPreview(figure);
        }
        if (spec.mode === 'ray-optics' && window.QmxRayOpticsEditor?.openFromPreview) {
            return window.QmxRayOpticsEditor.openFromPreview(figure);
        }
        if (spec.mode === 'waveform' && window.QmxWaveformEditor?.openFromPreview) {
            return window.QmxWaveformEditor.openFromPreview(figure);
        }
        if (spec.mode === 'venn-set' && window.QmxVennSetEditor?.openFromPreview) {
            return window.QmxVennSetEditor.openFromPreview(figure);
        }
        if (spec.mode === 'timeline' && window.QmxTimelineEditor?.openFromPreview) {
            return window.QmxTimelineEditor.openFromPreview(figure);
        }
        if (spec.mode === 'data-flow' && window.QmxDataFlowEditor?.openFromPreview) {
            return window.QmxDataFlowEditor.openFromPreview(figure);
        }
        if (spec.mode === 'cross-section' && window.QmxCrossSectionEditor?.openFromPreview) {
            return window.QmxCrossSectionEditor.openFromPreview(figure);
        }
        if (spec.mode === 'vector-art' && window.QmxVectorArtEditor?.openFromPreview) {
            return window.QmxVectorArtEditor.openFromPreview(figure);
        }
        if (spec.mode === 'sports-field' && window.QmxSportsFieldEditor?.openFromPreview) {
            return window.QmxSportsFieldEditor.openFromPreview(figure);
        }
        if (spec.mode === 'stage-blocking' && window.QmxStageBlockingEditor?.openFromPreview) {
            return window.QmxStageBlockingEditor.openFromPreview(figure);
        }
        const token = `[[qmx-diagram:${payload}]]`;
        const textarea = findTokenTextarea(token) || window.QmxDiagramLauncher?.getActiveTextarea?.();
        let replaceRange = null;
        if (textarea) {
            const start = textarea.value.indexOf(token);
            if (start >= 0) replaceRange = { start, end: start + token.length };
        }
        open({
            tool: { id: spec.mode === 'flowchart' ? 'flowchart' : 'general-drawing' },
            textarea,
            initialSpec: spec,
            replaceRange,
            editMode: true
        });
    }

    function registerHandlers() {
        const launcher = window.QmxDiagramLauncher;
        if (!launcher?.registerToolHandler) return false;
        launcher.registerToolHandler('general-drawing', open);
        launcher.registerToolHandler('flowchart', open);
        return true;
    }

    function init() {
        buildEditor();
        if (!registerHandlers()) {
            document.addEventListener('qmx:diagram-launcher-ready', registerHandlers, { once: true });
        }
        document.addEventListener('click', (event) => {
            const figure = event.target.closest('.qmx-diagram[data-qmx-diagram]');
            if (!figure || figure.closest('[data-preview-readonly="true"]')) return;
            document.querySelectorAll('.qmx-diagram.is-selected').forEach((item) => item.classList.remove('is-selected'));
            figure.classList.add('is-selected');
        });
        document.addEventListener('dblclick', (event) => {
            const figure = event.target.closest('.qmx-diagram[data-qmx-diagram]');
            if (figure) openFromPreview(figure);
        });
    }

    window.QmxGeneralFlowchartEditor = Object.freeze({
        version: '1.0.3',
        open,
        close,
        openFromPreview
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
