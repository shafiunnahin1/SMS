(function (window, document) {
    'use strict';

    if (window.QmxTechnicalDrawingEditor?.version) return;
    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Technical Drawing] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['line', 'Visible line', 'দৃশ্যমান রেখা'],
        ['hidden-line', 'Hidden line', 'অদৃশ্য রেখা'],
        ['centre-line', 'Centreline', 'কেন্দ্ররেখা'],
        ['construction-line', 'Construction', 'সহায়ক রেখা'],
        ['extension-line', 'Extension line', 'প্রসারণ রেখা'],
        ['rectangle', 'Rectangle', 'আয়তক্ষেত্র'],
        ['circle', 'Circle', 'বৃত্ত'],
        ['arc', 'Arc', 'চাপ'],
        ['polyline', 'Polyline', 'বহুরেখা'],
        ['dimension', 'Dimension', 'মাত্রা'],
        ['leader', 'Leader / note', 'লিডার'],
        ['hatch', 'Hatch / section', 'হ্যাচিং'],
        ['centre-mark', 'Centre mark', 'কেন্দ্রচিহ্ন'],
        ['text', 'Text', 'লেখা'],
        ['title-block', 'Title block', 'শিরোনাম ঘর']
    ];

    const state = {
        root: null, canvas: null, svg: null, context: null, document: null,
        selectedId: null, activeTool: 'select', pending: null, polyline: null,
        interaction: null, history: [], historyIndex: -1, controls: {}
    };

    function uid(prefix = 'tech') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]); }
    function clamp(value, min, max, fallback = min) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
    function selectedObject() { return state.document?.objects.find((object) => object.id === state.selectedId) || null; }

    function createDocument() {
        return {
            version: 17,
            id: uid('technical-drawing'),
            mode: 'technical-drawing',
            title: 'Technical Drawing / Engineering Drawing',
            width: 1000,
            height: 600,
            background: '#ffffff',
            gridSize: 20,
            techShowGrid: true,
            techShowBorder: true,
            techShowTitleBlock: false,
            techScale: '1:1',
            techUnits: 'mm',
            techLineWidth: 2.5,
            snap: true,
            objects: []
        };
    }

    function lineObject(x1, y1, x2, y2, style = 'visible') {
        const styles = {
            visible: { stroke: '#0f172a', width: 3, dash: '' },
            hidden: { stroke: '#334155', width: 2, dash: '10 7' },
            centre: { stroke: '#2563eb', width: 1.8, dash: '18 6 3 6' },
            construction: { stroke: '#94a3b8', width: 1.2, dash: '5 5' },
            extension: { stroke: '#475569', width: 1.5, dash: '' }
        }[style] || {};
        return { id: uid('tech-line'), type: 'tech-line', x1, y1, x2, y2, lineStyle: style, stroke: styles.stroke || '#0f172a', strokeWidth: styles.width || 2.5, dash: styles.dash || '' };
    }
    function rectObject(x, y, w, h) { return { id: uid('tech-rect'), type: 'tech-rect', x, y, w, h, stroke: '#0f172a', strokeWidth: 3, fill: 'transparent', fillOpacity: 0 }; }
    function circleObject(cx, cy, r) { return { id: uid('tech-circle'), type: 'tech-circle', cx, cy, r, stroke: '#0f172a', strokeWidth: 3, fill: 'transparent', fillOpacity: 0 }; }
    function arcObject(cx, cy, r, startAngle, endAngle) { return { id: uid('tech-arc'), type: 'tech-arc', cx, cy, r, startAngle, endAngle, stroke: '#0f172a', strokeWidth: 3, fill: 'none' }; }
    function polylineObject(points) { return { id: uid('tech-polyline'), type: 'tech-polyline', points, closed: false, stroke: '#0f172a', strokeWidth: 3, fill: 'transparent', fillOpacity: 0 }; }
    function dimensionObject(x1, y1, x2, y2) { return { id: uid('tech-dim'), type: 'tech-dimension', x1, y1, x2, y2, offset: 42, label: '', units: state.document.techUnits || 'mm', precision: 0, stroke: '#0f172a', strokeWidth: 1.8, textColor: '#0f172a', fontSize: 17, outside: false }; }
    function leaderObject(x1, y1, x2, y2) { return { id: uid('tech-leader'), type: 'tech-leader', x1, y1, x2, y2, text: 'Note', stroke: '#0f172a', strokeWidth: 1.8, textColor: '#0f172a', fontSize: 18 }; }
    function hatchObject(x, y, w, h) { return { id: uid('tech-hatch'), type: 'tech-hatch', x, y, w, h, angle: 45, spacing: 14, stroke: '#64748b', strokeWidth: 1.3, fill: '#f8fafc', fillOpacity: 0.3, label: 'SECTION' }; }
    function centreMarkObject(cx, cy) { return { id: uid('tech-centre'), type: 'tech-centre-mark', cx, cy, size: 26, stroke: '#2563eb', strokeWidth: 1.6 }; }
    function textObject(x, y) { return { id: uid('tech-text'), type: 'text', x, y, text: 'Technical note', color: '#0f172a', fontSize: 20, fontWeight: 'normal', rotation: 0 }; }
    function titleBlockObject(x, y, w = 420, h = 110) { return { id: uid('tech-title'), type: 'tech-title-block', x, y, w, h, title: state.document.title, drawingNo: 'DRG-001', scale: state.document.techScale, sheet: '1 / 1', drawnBy: 'QMX', date: new Date().toISOString().slice(0, 10), stroke: '#0f172a', strokeWidth: 1.8, fill: '#ffffff' }; }

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
        state.selectedId = null; state.pending = null; state.polyline = null; state.interaction = null;
        syncDocumentControls(); render(); updateHistoryButtons();
    }
    function undo() { restoreHistory(state.historyIndex - 1); }
    function redo() { restoreHistory(state.historyIndex + 1); }
    function updateHistoryButtons() { if (state.controls.undo) { state.controls.undo.disabled = state.historyIndex <= 0; state.controls.redo.disabled = state.historyIndex >= state.history.length - 1; } }

    function localPoint(event) {
        if (!state.svg) return { x: 0, y: 0 };
        const p = state.svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
        const m = state.svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : p;
    }
    function snapPoint(point, bypass = false) {
        if (!state.document.snap || bypass) return point;
        const step = clamp(state.document.gridSize, 5, 100, 20);
        return { x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step };
    }
    function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
    function angle(a, b) { return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; }

    function setTool(tool) {
        state.activeTool = tool;
        state.pending = null;
        if (tool !== 'polyline') state.polyline = null;
        state.controls.tools?.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
        setStatus(tool === 'select' ? 'Select and drag an object or its blue handles.' : `Tool: ${tool}. Click on the drawing sheet.`);
        render();
    }

    function addObject(object, message) {
        state.document.objects.push(object);
        state.selectedId = object.id;
        pushHistory(); render(); setStatus(message);
    }

    function finishPolyline() {
        if (!state.polyline || state.polyline.points.length < 2) { state.polyline = null; render(); return; }
        addObject(polylineObject(state.polyline.points.map((p) => ({...p}))), 'Polyline added.');
        state.polyline = null;
    }

    function onCanvasClick(event) {
        if (state.activeTool === 'select') return;
        let point = localPoint(event);
        if (state.document.snap && !event.altKey) {
            const step = clamp(state.document.gridSize, 5, 100, 20);
            point = { x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step };
        }
        const tool = state.activeTool;
        if (tool === 'text') { addObject(textObject(point.x, point.y), 'Text added.'); setTool('select'); return; }
        if (tool === 'centre-mark') { addObject(centreMarkObject(point.x, point.y), 'Centre mark added.'); setTool('select'); return; }
        if (tool === 'polyline') {
            if (!state.polyline) state.polyline = { points: [point] };
            else state.polyline.points.push(point);
            render(); setStatus('Polyline point added. Double-click or press Finish polyline.'); return;
        }
        if (!state.pending) { state.pending = { tool, point }; render(); setStatus('Choose the second point.'); return; }
        const start = state.pending.point;
        state.pending = null;
        if (tool === 'line') addObject(lineObject(start.x, start.y, point.x, point.y, 'visible'), 'Visible line added.');
        else if (tool === 'hidden-line') addObject(lineObject(start.x, start.y, point.x, point.y, 'hidden'), 'Hidden line added.');
        else if (tool === 'centre-line') addObject(lineObject(start.x, start.y, point.x, point.y, 'centre'), 'Centreline added.');
        else if (tool === 'construction-line') addObject(lineObject(start.x, start.y, point.x, point.y, 'construction'), 'Construction line added.');
        else if (tool === 'extension-line') addObject(lineObject(start.x, start.y, point.x, point.y, 'extension'), 'Extension line added.');
        else if (tool === 'rectangle') addObject(rectObject(Math.min(start.x, point.x), Math.min(start.y, point.y), Math.abs(point.x - start.x), Math.abs(point.y - start.y)), 'Rectangle added.');
        else if (tool === 'circle') addObject(circleObject(start.x, start.y, Math.max(4, dist(start, point))), 'Circle added.');
        else if (tool === 'arc') addObject(arcObject(start.x, start.y, Math.max(4, dist(start, point)), 0, angle(start, point)), 'Arc added.');
        else if (tool === 'dimension') addObject(dimensionObject(start.x, start.y, point.x, point.y), 'Dimension added with extension lines.');
        else if (tool === 'leader') addObject(leaderObject(start.x, start.y, point.x, point.y), 'Leader note added.');
        else if (tool === 'hatch') addObject(hatchObject(Math.min(start.x, point.x), Math.min(start.y, point.y), Math.abs(point.x - start.x), Math.abs(point.y - start.y)), 'Section hatch added.');
        else if (tool === 'title-block') addObject(titleBlockObject(Math.min(start.x, point.x), Math.min(start.y, point.y), Math.max(160, Math.abs(point.x - start.x)), Math.max(70, Math.abs(point.y - start.y))), 'Title block added.');
        setTool('select');
    }

    function objectBounds(object) {
        if (object.type === 'tech-line' || object.type === 'tech-dimension' || object.type === 'tech-leader') return { x: Math.min(object.x1, object.x2), y: Math.min(object.y1, object.y2), w: Math.abs(object.x2-object.x1), h: Math.abs(object.y2-object.y1) };
        if (object.type === 'tech-rect' || object.type === 'tech-hatch' || object.type === 'tech-title-block') return { x: object.x, y: object.y, w: object.w, h: object.h };
        if (object.type === 'tech-circle' || object.type === 'tech-arc') return { x: object.cx-object.r, y: object.cy-object.r, w: object.r*2, h: object.r*2 };
        if (object.type === 'tech-centre-mark') return { x: object.cx-object.size, y: object.cy-object.size, w: object.size*2, h: object.size*2 };
        if (object.type === 'tech-polyline') { const xs=object.points.map(p=>p.x), ys=object.points.map(p=>p.y); return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}; }
        if (object.type === 'text') return { x: object.x, y: object.y-object.fontSize, w: Math.max(70, object.text.length*object.fontSize*.55), h: object.fontSize*1.4 };
        return {x:0,y:0,w:0,h:0};
    }

    function translateObject(object, dx, dy) {
        if (['tech-line','tech-dimension','tech-leader'].includes(object.type)) { object.x1 += dx; object.y1 += dy; object.x2 += dx; object.y2 += dy; }
        else if (['tech-rect','tech-hatch','tech-title-block'].includes(object.type)) { object.x += dx; object.y += dy; }
        else if (['tech-circle','tech-arc','tech-centre-mark'].includes(object.type)) { object.cx += dx; object.cy += dy; }
        else if (object.type === 'tech-polyline') object.points.forEach((p)=>{p.x+=dx;p.y+=dy;});
        else if (object.type === 'text') { object.x += dx; object.y += dy; }
    }

    function handlesMarkup(object) {
        if (!object) return '';
        const handle = (x,y,name) => `<circle class="qmx-tech-handle" cx="${x}" cy="${y}" r="7" data-object-id="${esc(object.id)}" data-handle="${name}"/>`;
        let h='';
        if (['tech-line','tech-dimension','tech-leader'].includes(object.type)) h = handle(object.x1,object.y1,'p1')+handle(object.x2,object.y2,'p2');
        else if (['tech-rect','tech-hatch','tech-title-block'].includes(object.type)) h = handle(object.x,object.y,'nw')+handle(object.x+object.w,object.y+object.h,'se');
        else if (['tech-circle','tech-arc'].includes(object.type)) h = handle(object.cx,object.cy,'center')+handle(object.cx+object.r,object.cy,'radius');
        else if (object.type === 'tech-centre-mark') h = handle(object.cx,object.cy,'center')+handle(object.cx+object.size,object.cy,'size');
        else if (object.type === 'tech-polyline') h = object.points.map((p,i)=>handle(p.x,p.y,`point-${i}`)).join('');
        else if (object.type === 'text') h = handle(object.x,object.y,'text');
        const b=objectBounds(object); return `<rect class="qmx-tech-selection" x="${b.x-8}" y="${b.y-8}" width="${Math.max(16,b.w+16)}" height="${Math.max(16,b.h+16)}"/>${h}`;
    }

    function pendingMarkup() {
        if (!state.pending && !state.polyline) return '';
        let markup='';
        if (state.pending) markup += `<circle cx="${state.pending.point.x}" cy="${state.pending.point.y}" r="6" fill="#7c3aed"/><text x="${state.pending.point.x+10}" y="${state.pending.point.y-10}" fill="#7c3aed" font-size="14">1</text>`;
        if (state.polyline?.points?.length) markup += `<polyline points="${state.polyline.points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#7c3aed" stroke-width="2" stroke-dasharray="7 5"/>`;
        return markup;
    }

    function render() {
        if (!state.canvas || !state.document) return;
        state.document = Diagram.normalizeSpec(state.document);
        const body = Diagram.svgMarkup(state.document).replace(/^<svg[^>]*>|<\/svg>$/g, '');
        state.canvas.innerHTML = `<svg class="qmx-tech-svg" viewBox="0 0 ${state.document.width} ${state.document.height}" tabindex="0" aria-label="Technical drawing canvas">${body}${handlesMarkup(selectedObject())}${pendingMarkup()}</svg>`;
        state.svg = state.canvas.querySelector('svg');
        state.svg.addEventListener('click', (event) => {
            if (event.detail > 1 && state.activeTool === 'polyline') { event.preventDefault(); finishPolyline(); setTool('select'); return; }
            const target = event.target.closest('[data-object-id]');
            if (state.activeTool === 'select' && target && !target.dataset.handle) { state.selectedId = target.dataset.objectId; render(); return; }
            if (!target) onCanvasClick(event);
        });
        state.svg.addEventListener('pointerdown', onPointerDown);
        syncSelectionControls();
        updateSummary();
    }

    function onPointerDown(event) {
        const target = event.target.closest('[data-object-id]');
        if (!target || state.activeTool !== 'select') return;
        const object = state.document.objects.find((item)=>item.id===target.dataset.objectId);
        if (!object) return;
        state.selectedId = object.id;
        const p=localPoint(event);
        state.interaction={ objectId:object.id, handle:target.dataset.handle||'move', start:p, original:clone(object) };
        target.setPointerCapture?.(event.pointerId);
        event.preventDefault(); event.stopPropagation();
    }
    function onPointerMove(event) {
        if (!state.interaction || !state.svg) return;
        const object=state.document.objects.find((item)=>item.id===state.interaction.objectId); if(!object) return;
        const p=localPoint(event), o=state.interaction.original, h=state.interaction.handle;
        const dx=p.x-state.interaction.start.x, dy=p.y-state.interaction.start.y;
        Object.assign(object, clone(o));
        if(h==='move') translateObject(object,dx,dy);
        else if(h==='p1'){object.x1=p.x;object.y1=p.y;}
        else if(h==='p2'){object.x2=p.x;object.y2=p.y;}
        else if(h==='nw'){const right=o.x+o.w,bottom=o.y+o.h;object.x=Math.min(p.x,right-4);object.y=Math.min(p.y,bottom-4);object.w=right-object.x;object.h=bottom-object.y;}
        else if(h==='se'){object.w=Math.max(4,p.x-o.x);object.h=Math.max(4,p.y-o.y);}
        else if(h==='center'){object.cx=p.x;object.cy=p.y;}
        else if(h==='radius'){object.r=Math.max(4,Math.hypot(p.x-o.cx,p.y-o.cy));}
        else if(h==='size'){object.size=Math.max(4,Math.hypot(p.x-o.cx,p.y-o.cy));}
        else if(h==='text'){object.x=p.x;object.y=p.y;}
        else if(h.startsWith('point-')){const i=Number(h.slice(6));if(object.points?.[i]) object.points[i]={x:p.x,y:p.y};}
        render();
    }
    function onPointerUp() { if(!state.interaction) return; state.interaction=null; pushHistory(); render(); setStatus('Object updated.'); }

    function selectedFields(object) {
        if (!object) return '<p class="qmx-tech-empty">Select an object to edit its geometry and style.</p>';
        const field=(label,prop,type='text',attrs='')=>`<div class="qmx-tech-field"><label>${label}</label><input type="${type}" data-prop="${prop}" value="${esc(object[prop] ?? '')}" ${attrs}></div>`;
        const check=(label,prop)=>`<label class="qmx-tech-check"><input type="checkbox" data-prop="${prop}" ${object[prop]?'checked':''}> ${label}</label>`;
        let html=`<div class="qmx-tech-type">${esc(object.type)}</div>`;
        if(['tech-line','tech-dimension','tech-leader'].includes(object.type)) html+=`<div class="qmx-tech-grid2">${field('X1','x1','number')}${field('Y1','y1','number')}${field('X2','x2','number')}${field('Y2','y2','number')}</div>`;
        if(['tech-rect','tech-hatch','tech-title-block'].includes(object.type)) html+=`<div class="qmx-tech-grid2">${field('X','x','number')}${field('Y','y','number')}${field('Width','w','number')}${field('Height','h','number')}</div>`;
        if(['tech-circle','tech-arc'].includes(object.type)) html+=`<div class="qmx-tech-grid2">${field('Centre X','cx','number')}${field('Centre Y','cy','number')}${field('Radius','r','number','min="1"')}</div>`;
        if(object.type==='tech-line') html+=`<div class="qmx-tech-field"><label>Line type</label><select data-prop="lineStyle"><option value="visible" ${object.lineStyle==='visible'?'selected':''}>Visible</option><option value="hidden" ${object.lineStyle==='hidden'?'selected':''}>Hidden</option><option value="centre" ${object.lineStyle==='centre'?'selected':''}>Centreline</option><option value="construction" ${object.lineStyle==='construction'?'selected':''}>Construction</option><option value="extension" ${object.lineStyle==='extension'?'selected':''}>Extension</option></select></div>`;
        if(object.type==='tech-dimension') html+=field('Dimension label','label')+`<div class="qmx-tech-grid2">${field('Offset','offset','number')}${field('Units','units')}${field('Precision','precision','number','min="0" max="4"')}${field('Font size','fontSize','number')}</div>`+check('Outside arrows','outside');
        if(object.type==='tech-leader') html+=field('Leader text','text')+field('Font size','fontSize','number');
        if(object.type==='tech-hatch') html+=`<div class="qmx-tech-grid2">${field('Angle','angle','number')}${field('Spacing','spacing','number','min="4"')}${field('Label','label')}${field('Fill opacity','fillOpacity','number','min="0" max="1" step="0.05"')}</div>`;
        if(object.type==='tech-arc') html+=`<div class="qmx-tech-grid2">${field('Start angle','startAngle','number')}${field('End angle','endAngle','number')}</div>`;
        if(object.type==='tech-polyline') html+=check('Closed polyline','closed');
        if(object.type==='tech-centre-mark') html+=`<div class="qmx-tech-grid2">${field('Centre X','cx','number')}${field('Centre Y','cy','number')}${field('Size','size','number')}</div>`;
        if(object.type==='text') html+=`<div class="qmx-tech-field"><label>Text</label><textarea data-prop="text">${esc(object.text)}</textarea></div><div class="qmx-tech-grid2">${field('X','x','number')}${field('Y','y','number')}${field('Font size','fontSize','number')}${field('Rotation','rotation','number')}</div><label class="qmx-tech-check"><input type="checkbox" data-prop="fontWeight" ${object.fontWeight==='bold'?'checked':''}> Bold</label>`;
        if(object.type==='tech-title-block') html+=field('Drawing title','title')+`<div class="qmx-tech-grid2">${field('Drawing no.','drawingNo')}${field('Scale','scale')}${field('Sheet','sheet')}${field('Drawn by','drawnBy')}${field('Date','date')}</div>`;
        if(['tech-line','tech-rect','tech-circle','tech-arc','tech-polyline','tech-dimension','tech-leader','tech-hatch','tech-centre-mark','tech-title-block'].includes(object.type)) html+=`<div class="qmx-tech-grid2">${field('Stroke','stroke','color')}${field('Line width','strokeWidth','number','min="0.5" step="0.5"')}</div>`;
        return html;
    }

    function syncSelectionControls() { if(state.controls.selected) state.controls.selected.innerHTML=selectedFields(selectedObject()); }
    function updateSummary() {
        if(!state.controls.summary)return;
        const counts={}; state.document.objects.forEach(o=>counts[o.type]=(counts[o.type]||0)+1);
        state.controls.summary.textContent=`${state.document.objects.length} object(s) · ${Object.entries(counts).map(([k,v])=>`${v} ${k.replace('tech-','')}`).join(' · ')}`;
    }
    function syncDocumentControls() {
        state.root?.querySelectorAll('[data-doc]').forEach((input)=>{const key=input.dataset.doc; if(input.type==='checkbox')input.checked=Boolean(state.document[key]);else input.value=state.document[key]??'';});
    }

    function onRootInput(event) {
        const input=event.target;
        if(input.dataset.doc){const key=input.dataset.doc; let value=input.type==='checkbox'?input.checked:input.value; if(input.type==='number')value=Number(value); state.document[key]=value; if(key==='width')state.document.width=clamp(value,400,2400,1000); if(key==='height')state.document.height=clamp(value,260,1800,600); pushHistory();render();return;}
        if(input.dataset.prop){const object=selectedObject();if(!object)return;const key=input.dataset.prop;let value=input.type==='checkbox'?input.checked:input.value;if(input.type==='number')value=Number(value);if(key==='fontWeight')value=input.checked?'bold':'normal';object[key]=value;if(key==='lineStyle'){const map={visible:['#0f172a',3,''],hidden:['#334155',2,'10 7'],centre:['#2563eb',1.8,'18 6 3 6'],construction:['#94a3b8',1.2,'5 5'],extension:['#475569',1.5,'']};const s=map[value];object.stroke=s[0];object.strokeWidth=s[1];object.dash=s[2];}pushHistory();render();}
    }

    function onRootClick(event) {
        const toolButton=event.target.closest('[data-tool]');if(toolButton){setTool(toolButton.dataset.tool);return;}
        const preset=event.target.closest('[data-preset]');if(preset){applyPreset(preset.dataset.preset);return;}
        const act=event.target.closest('[data-act]')?.dataset.act;if(!act)return;
        ({new:newDocument,undo,redo,duplicate:duplicateSelected,delete:deleteSelected,close,insert:insertIntoQuestion,'export-svg':exportSvg,'export-png':exportPng,'finish-polyline':finishPolyline}[act]||(()=>{}))();
    }

    function applyPreset(type) {
        const w=state.document.width,h=state.document.height;
        state.document.objects=[];
        if(type==='orthographic'){
            state.document.objects.push(rectObject(110,90,250,150),rectObject(110,330,250,150),rectObject(540,90,220,150));
            state.document.objects.push(textObject(185,80),textObject(190,320),textObject(605,80));
            state.document.objects.at(-3).text='FRONT VIEW';state.document.objects.at(-2).text='TOP VIEW';state.document.objects.at(-1).text='SIDE VIEW';
            state.document.objects.push(lineObject(60,300,900,300,'construction'),lineObject(430,45,430,550,'construction'));
            state.document.objects.push(dimensionObject(110,90,360,90),dimensionObject(110,90,110,240));
        } else if(type==='isometric'){
            const p=(x,y)=>({x,y});
            state.document.objects.push(polylineObject([p(300,360),p(500,245),p(700,360),p(500,475),p(300,360)]));
            state.document.objects.push(polylineObject([p(300,360),p(300,180),p(500,65),p(700,180),p(700,360)]));
            state.document.objects.push(lineObject(300,180,500,295,'visible'),lineObject(700,180,500,295,'visible'),lineObject(500,65,500,245,'visible'));
            state.document.objects.push(dimensionObject(300,360,700,360));
        } else if(type==='sectioned-shaft'){
            state.document.objects.push(rectObject(170,210,660,180),circleObject(500,300,70),centreMarkObject(500,300),lineObject(100,300,900,300,'centre'));
            state.document.objects.push(hatchObject(170,210,260,180),hatchObject(570,210,260,180));
            state.document.objects.push(dimensionObject(170,210,830,210),dimensionObject(500,230,500,370));
            const note=leaderObject(650,190,760,120);note.text='SECTION A-A';state.document.objects.push(note);
        } else if(type==='dimensioned-plate'){
            state.document.objects.push(rectObject(190,160,620,280));
            [[310,250],[500,250],[690,250],[310,350],[500,350],[690,350]].forEach(([x,y])=>{state.document.objects.push(circleObject(x,y,24),centreMarkObject(x,y));});
            state.document.objects.push(dimensionObject(190,160,810,160),dimensionObject(190,160,190,440),dimensionObject(310,250,500,250));
            const lead=leaderObject(690,350,820,500);lead.text='6 HOLES Ø48';state.document.objects.push(lead);
        } else if(type==='title-block'){
            state.document.objects.push(titleBlockObject(w-455,h-130,420,100));
        } else if(type==='clear') { pushHistory();render();setStatus('Drawing cleared.');return; }
        state.selectedId=state.document.objects[0]?.id||null;pushHistory();render();setStatus(`${type} preset inserted.`);
    }

    function deleteSelected(){if(!state.selectedId)return;state.document.objects=state.document.objects.filter(o=>o.id!==state.selectedId);state.selectedId=null;pushHistory();render();setStatus('Object deleted.');}
    function duplicateSelected(){const o=selectedObject();if(!o)return;const c=clone(o);c.id=uid(o.type);translateObject(c,30,30);state.document.objects.push(c);state.selectedId=c.id;pushHistory();render();setStatus('Object duplicated.');}
    function newDocument(){if(state.document.objects.length&&!window.confirm('Start a new Technical Drawing document?'))return;state.document=createDocument();state.selectedId=null;state.history=[];state.historyIndex=-1;pushHistory();syncDocumentControls();setTool('select');render();setStatus('New Technical Drawing document.');}

    function makeToken(){return `[[qmx-diagram:${Diagram.encodeSpec(state.document)}]]`;}
    function insertIntoQuestion(){const textarea=state.context?.textarea;if(!textarea){setStatus('No target question field was found.');return;}const token=makeToken(),range=state.context?.replaceRange;textarea.focus();if(range&&Number.isInteger(range.start)&&Number.isInteger(range.end))textarea.setRangeText(token,range.start,range.end,'end');else{const start=textarea.selectionStart??textarea.value.length,end=textarea.selectionEnd??start,prefix=start>0&&!/\n$/.test(textarea.value.slice(0,start))?'\n':'',suffix=end<textarea.value.length&&!/^\n/.test(textarea.value.slice(end))?'\n':'';textarea.setRangeText(prefix+token+suffix,start,end,'end');}textarea.dispatchEvent(new Event('input',{bubbles:true}));textarea.dispatchEvent(new Event('change',{bubbles:true}));setStatus('Technical Drawing inserted. Save the question to persist it.');window.setTimeout(close,220);}
    function safeFilename(value){return String(value||'technical-drawing').replace(/[\\/:*?"<>|]+/g,'-').trim()||'technical-drawing';}
    function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
    function exportSvg(){downloadBlob(new Blob([Diagram.svgMarkup(state.document)],{type:'image/svg+xml;charset=utf-8'}),`${safeFilename(state.document.title)}.svg`);setStatus('SVG exported.');}
    function exportPng(){const svg=Diagram.svgMarkup(state.document),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=state.document.width;canvas.height=state.document.height;canvas.getContext('2d').drawImage(image,0,0);URL.revokeObjectURL(url);canvas.toBlob(blob=>blob&&downloadBlob(blob,`${safeFilename(state.document.title)}.png`),'image/png');setStatus('PNG exported.');};image.onerror=()=>{URL.revokeObjectURL(url);setStatus('PNG export failed.');};image.src=url;}

    function addStyles(){if(document.getElementById('qmx-technical-drawing-editor-styles'))return;const style=document.createElement('style');style.id='qmx-technical-drawing-editor-styles';style.textContent=`
    .qmx-tech-editor[hidden]{display:none!important}.qmx-tech-editor{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);padding:14px;display:flex;align-items:center;justify-content:center;font:14px/1.35 "Segoe UI",Arial,sans-serif;color:#0f172a}.qmx-tech-shell{width:min(1480px,calc(100vw - 28px));height:min(930px,calc(100vh - 28px));background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.35);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}.qmx-tech-header,.qmx-tech-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #dbe4ef}.qmx-tech-footer{border-top:1px solid #dbe4ef;border-bottom:0}.qmx-tech-title{font-weight:800;font-size:17px}.qmx-tech-subtitle{font-size:12px;color:#64748b}.qmx-tech-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.qmx-tech-btn,.qmx-tech-tool,.qmx-tech-preset{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer}.qmx-tech-btn:hover,.qmx-tech-tool:hover,.qmx-tech-preset:hover{border-color:#2563eb}.qmx-tech-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}.qmx-tech-btn.danger{color:#dc2626}.qmx-tech-btn:disabled{opacity:.45;cursor:not-allowed}.qmx-tech-main{min-height:0;display:grid;grid-template-columns:210px minmax(0,1fr) 300px;gap:10px;padding:10px;background:#e7eef7}.qmx-tech-panel{background:#fff;border:1px solid #d7e0ec;border-radius:12px;padding:10px;overflow:auto;min-height:0}.qmx-tech-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.qmx-tech-tool{padding:8px 4px;min-height:51px}.qmx-tech-tool small{display:block;font-weight:500;color:#64748b;margin-top:2px}.qmx-tech-tool.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.qmx-tech-section{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#475569;margin:14px 0 7px}.qmx-tech-presets{display:grid;gap:7px}.qmx-tech-canvas-wrap{background:#dfe7f1;border:1px solid #d1dbea;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px}.qmx-tech-canvas{width:100%;min-width:500px}.qmx-tech-svg{display:block;width:100%;height:auto;max-height:720px;background:#fff;box-shadow:0 6px 20px rgba(15,23,42,.12);touch-action:none}.qmx-tech-selection{fill:none;stroke:#2563eb;stroke-width:2;stroke-dasharray:7 5;pointer-events:none}.qmx-tech-handle{fill:#fff;stroke:#2563eb;stroke-width:3;cursor:grab}.qmx-tech-field{margin:7px 0}.qmx-tech-field label{display:block;font-weight:700;font-size:12px;margin-bottom:4px}.qmx-tech-field input,.qmx-tech-field select,.qmx-tech-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:inherit}.qmx-tech-field textarea{min-height:58px;resize:vertical}.qmx-tech-grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-tech-check{display:block;margin:8px 0}.qmx-tech-type,.qmx-tech-summary{margin-top:8px;padding:9px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px}.qmx-tech-empty{color:#64748b;text-align:center;padding:20px 4px}.qmx-tech-status{color:#64748b;min-height:18px}@media(max-width:920px){.qmx-tech-editor{padding:0}.qmx-tech-shell{width:100vw;height:100vh;border-radius:0}.qmx-tech-main{grid-template-columns:170px minmax(0,1fr)}.qmx-tech-main>.qmx-tech-panel:last-child{grid-column:1/-1;max-height:300px}.qmx-tech-title{font-size:15px}}`;
        document.head.appendChild(style);}

    function buildEditor(){if(state.root)return;addStyles();const root=document.createElement('div');root.className='qmx-tech-editor';root.hidden=true;root.innerHTML=`
    <div class="qmx-tech-shell" role="dialog" aria-modal="true" aria-label="Technical Drawing editor">
      <header class="qmx-tech-header"><div><div class="qmx-tech-title">Technical Drawing / Engineering Drawing</div><div class="qmx-tech-subtitle">Dimension lines, extension lines, centrelines, leaders, sections, orthographic and isometric constructions</div></div><div class="qmx-tech-actions"><button class="qmx-tech-btn" data-act="new">New</button><button class="qmx-tech-btn" data-act="undo">Undo</button><button class="qmx-tech-btn" data-act="redo">Redo</button><button class="qmx-tech-btn" data-act="finish-polyline">Finish polyline</button><button class="qmx-tech-btn" data-act="duplicate">Duplicate</button><button class="qmx-tech-btn danger" data-act="delete">Delete</button><button class="qmx-tech-btn" data-act="close">×</button></div></header>
      <main class="qmx-tech-main">
        <aside class="qmx-tech-panel"><strong>Technical tools</strong><div class="qmx-tech-tools" data-tools></div><div class="qmx-tech-section">Engineering presets</div><div class="qmx-tech-presets"><button class="qmx-tech-preset" data-preset="orthographic">Orthographic projection</button><button class="qmx-tech-preset" data-preset="isometric">Isometric block</button><button class="qmx-tech-preset" data-preset="sectioned-shaft">Sectioned shaft</button><button class="qmx-tech-preset" data-preset="dimensioned-plate">Dimensioned plate</button><button class="qmx-tech-preset" data-preset="title-block">Add title block</button><button class="qmx-tech-preset" data-preset="clear">Clear objects</button></div><p class="qmx-tech-subtitle">Two-point tools use two clicks. Polyline uses multiple clicks and Finish polyline. Hold Alt to bypass snapping.</p></aside>
        <section class="qmx-tech-canvas-wrap"><div class="qmx-tech-canvas" data-canvas></div></section>
        <aside class="qmx-tech-panel"><strong>Document</strong><div class="qmx-tech-field"><label>Title</label><input data-doc="title"></div><div class="qmx-tech-grid2"><div class="qmx-tech-field"><label>Width</label><input type="number" min="400" max="2400" data-doc="width"></div><div class="qmx-tech-field"><label>Height</label><input type="number" min="260" max="1800" data-doc="height"></div><div class="qmx-tech-field"><label>Grid size</label><input type="number" min="5" max="100" data-doc="gridSize"></div><div class="qmx-tech-field"><label>Units</label><select data-doc="techUnits"><option>mm</option><option>cm</option><option>m</option><option>in</option></select></div><div class="qmx-tech-field"><label>Scale</label><input data-doc="techScale"></div><div class="qmx-tech-field"><label>Background</label><input type="color" data-doc="background"></div></div><label class="qmx-tech-check"><input type="checkbox" data-doc="techShowGrid"> Show grid</label><label class="qmx-tech-check"><input type="checkbox" data-doc="techShowBorder"> Show drawing border</label><label class="qmx-tech-check"><input type="checkbox" data-doc="snap"> Snap to grid</label><hr><strong>Selected object</strong><div data-selected></div><div class="qmx-tech-summary" data-summary></div></aside>
      </main>
      <footer class="qmx-tech-footer"><div class="qmx-tech-status" data-status></div><div class="qmx-tech-actions"><button class="qmx-tech-btn" data-act="export-svg">Export SVG</button><button class="qmx-tech-btn" data-act="export-png">Export PNG</button><button class="qmx-tech-btn primary" data-act="insert">Insert into question</button></div></footer>
    </div>`;document.body.appendChild(root);state.root=root;state.canvas=root.querySelector('[data-canvas]');state.controls={tools:root.querySelector('[data-tools]'),selected:root.querySelector('[data-selected]'),summary:root.querySelector('[data-summary]'),status:root.querySelector('[data-status]'),undo:root.querySelector('[data-act="undo"]'),redo:root.querySelector('[data-act="redo"]')};TOOL_DEFS.forEach(([id,label,bn])=>{const b=document.createElement('button');b.className='qmx-tech-tool';b.dataset.tool=id;b.innerHTML=window.QmxDiagramToolButtonContent?window.QmxDiagramToolButtonContent(id,label,bn):`${esc(label)}<small>${esc(bn)}</small>`;state.controls.tools.appendChild(b);});root.addEventListener('click',onRootClick);root.addEventListener('change',onRootInput);root.addEventListener('input',onRootInput);document.addEventListener('pointermove',onPointerMove);document.addEventListener('pointerup',onPointerUp);document.addEventListener('keydown',onKeydown);}

    function setStatus(message){if(state.controls.status)state.controls.status.textContent=message;}
    function open(context={}){buildEditor();state.context=context;state.document=context.initialSpec?Diagram.normalizeSpec(context.initialSpec):createDocument();if(state.document.mode!=='technical-drawing')state.document=createDocument();state.selectedId=null;state.activeTool='select';state.pending=null;state.polyline=null;state.interaction=null;state.history=[];state.historyIndex=-1;pushHistory();syncDocumentControls();setTool('select');render();state.root.hidden=false;document.body.dataset.qmxTechOverflow=document.body.style.overflow||'';document.body.style.overflow='hidden';setStatus(context.initialSpec?'Existing Technical Drawing loaded.':'Choose a technical tool or engineering preset.');}
    function close(){if(!state.root||state.root.hidden)return;state.root.hidden=true;document.body.style.overflow=document.body.dataset.qmxTechOverflow||'';delete document.body.dataset.qmxTechOverflow;state.context?.textarea?.focus?.();}
    function findTokenTextarea(token){return Array.from(document.querySelectorAll('textarea')).find(t=>t.value.includes(token))||null;}
    function openFromPreview(figure){const payload=String(figure?.dataset.qmxDiagramPayload||'');if(!payload)return false;let spec;try{spec=Diagram.decodePayload(payload);}catch(e){return false;}if(spec.mode!=='technical-drawing')return false;const token=`[[qmx-diagram:${payload}]]`,textarea=findTokenTextarea(token)||window.QmxDiagramLauncher?.getActiveTextarea?.();let replaceRange=null;if(textarea){const start=textarea.value.indexOf(token);if(start>=0)replaceRange={start,end:start+token.length};}open({tool:{id:'technical-drawing'},textarea,initialSpec:spec,replaceRange,editMode:true});return true;}
    function registerHandlers(){const launcher=window.QmxDiagramLauncher;if(!launcher?.registerToolHandler)return false;let registered=false;['technical-drawing','technical','engineering-drawing','workshop-drawing','orthographic','isometric'].forEach(id=>{try{launcher.registerToolHandler(id,open);registered=true;}catch(e){}});return registered;}
    function onKeydown(event){if(!state.root||state.root.hidden)return;const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(event.key==='Escape'){if(state.pending||state.polyline){state.pending=null;state.polyline=null;render();setStatus('Current operation cancelled.');}else close();event.preventDefault();return;}if((event.key==='Delete'||event.key==='Backspace')&&!editing){event.preventDefault();deleteSelected();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='d'&&!editing){event.preventDefault();duplicateSelected();}}
    function init(){buildEditor();if(!registerHandlers())document.addEventListener('qmx:diagram-launcher-ready',registerHandlers,{once:true});}

    window.QmxTechnicalDrawingEditor=Object.freeze({version:'1.0.0',open,close,openFromPreview,finishPolyline});
    document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})(window, document);
