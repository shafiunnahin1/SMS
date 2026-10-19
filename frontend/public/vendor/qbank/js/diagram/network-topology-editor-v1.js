(function (window, document) {
    'use strict';

    if (window.QmxNetworkTopologyEditor?.version) return;
    const Diagram = window.QmxDiagram;
    if (!Diagram) {
        console.error('[QMX Network] Diagram renderer must load first.');
        return;
    }

    const TOOL_DEFS = [
        ['select', 'Select', 'নির্বাচন'],
        ['router', 'Router', 'রাউটার'],
        ['switch', 'Switch', 'সুইচ'],
        ['server', 'Server', 'সার্ভার'],
        ['client', 'Desktop', 'ডেস্কটপ'],
        ['laptop', 'Laptop', 'ল্যাপটপ'],
        ['cloud', 'Cloud / Internet', 'ক্লাউড'],
        ['firewall', 'Firewall', 'ফায়ারওয়াল'],
        ['access-point', 'Access point', 'অ্যাক্সেস পয়েন্ট'],
        ['database', 'Database', 'ডেটাবেস'],
        ['printer', 'Printer', 'প্রিন্টার'],
        ['mobile', 'Mobile', 'মোবাইল'],
        ['network-link', 'Smart link', 'স্মার্ট সংযোগ'],
        ['network-zone', 'Subnet / Zone', 'সাবনেট / জোন'],
        ['network-table', 'Address table', 'অ্যাড্রেস টেবিল'],
        ['text', 'Annotation', 'টীকা']
    ];
    const PORTS = ['n', 'e', 's', 'w'];
    const DEVICE_TYPES = new Set(['router', 'switch', 'server', 'client', 'laptop', 'cloud', 'firewall', 'access-point', 'database', 'printer', 'mobile', 'generic']);

    const state = {
        root: null, canvas: null, svg: null, context: null, document: null,
        selectedId: null, activeTool: 'select', interaction: null, connectionStart: null,
        history: [], historyIndex: -1, controls: {}
    };

    function uid(prefix = 'network') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]); }
    function snap(value) { const step = Number(state.document?.gridSize || 20); return state.document?.snap ? Math.round(value / step) * step : value; }
    function selectedObject() { return state.document?.objects.find((object) => object.id === state.selectedId) || null; }
    function devices() { return state.document?.objects.filter((object) => object.type === 'network-device') || []; }

    function createDocument() {
        return {
            version: 25,
            id: uid('network-topology'),
            mode: 'network-topology',
            title: 'Computer Network / Topology Diagram',
            width: 1180,
            height: 700,
            background: '#ffffff',
            gridSize: 20,
            networkShowGrid: true,
            networkShowLabels: true,
            networkShowIp: true,
            networkShowLinkLabels: true,
            networkShowZones: true,
            snap: true,
            objects: []
        };
    }

    function palette(type) {
        return ({
            router: ['#ede9fe', '#6d28d9'], switch: ['#dbeafe', '#1d4ed8'], server: ['#dcfce7', '#15803d'],
            client: ['#f8fafc', '#334155'], laptop: ['#f8fafc', '#475569'], cloud: ['#e0f2fe', '#0369a1'],
            firewall: ['#fee2e2', '#b91c1c'], 'access-point': ['#fef3c7', '#b45309'], database: ['#f3e8ff', '#7e22ce'],
            printer: ['#ecfeff', '#0e7490'], mobile: ['#f1f5f9', '#0f172a'], generic: ['#f8fafc', '#334155']
        })[type] || ['#f8fafc', '#334155'];
    }

    function makeDevice(deviceType, overrides = {}) {
        const [fill, stroke] = palette(deviceType);
        const labels = { router: 'Router', switch: 'Switch', server: 'Server', client: 'PC', laptop: 'Laptop', cloud: 'Internet', firewall: 'Firewall', 'access-point': 'Wi-Fi AP', database: 'Database', printer: 'Printer', mobile: 'Mobile', generic: 'Device' };
        return {
            id: uid('network-device'), type: 'network-device', deviceType,
            x: 300, y: 260, width: deviceType === 'cloud' ? 150 : 130, height: deviceType === 'server' ? 110 : 90,
            label: labels[deviceType] || 'Device', subtitle: '', ip: '',
            fill, stroke, iconColor: stroke, lineWidth: 3,
            ...overrides
        };
    }
    function makeZone(overrides = {}) {
        return { id: uid('network-zone'), type: 'network-zone', x: 360, y: 360, width: 520, height: 360, label: 'LAN / Subnet', fill: '#eff6ff', stroke: '#60a5fa', lineWidth: 2, dashed: true, ...overrides };
    }
    function makeTable(overrides = {}) {
        return { id: uid('network-table'), type: 'network-table', x: 650, y: 100, width: 460, rowHeight: 34, title: 'IP Addressing Table', headers: ['Device', 'Interface', 'IP / Prefix'], rows: [['Router', 'G0/0', '192.168.1.1/24'], ['Server', 'eth0', '192.168.1.10/24']], headerFill: '#dbeafe', stroke: '#1d4ed8', textColor: '#0f172a', ...overrides };
    }
    function defaultObject(type) {
        if (DEVICE_TYPES.has(type)) return makeDevice(type);
        if (type === 'network-zone') return makeZone();
        if (type === 'network-table') return makeTable();
        return { id: uid('text'), type: 'text', x: 70, y: 70, text: 'Network topology', color: '#0f172a', fontSize: 20, fontWeight: 'bold' };
    }

    function portPosition(object, key) {
        const x = Number(object.x || 0), y = Number(object.y || 0), halfW = Number(object.width || 130) / 2, halfH = Number(object.height || 90) / 2;
        if (key === 'n') return { x, y: y - halfH, key };
        if (key === 's') return { x, y: y + halfH, key };
        if (key === 'w') return { x: x - halfW, y, key };
        return { x: x + halfW, y, key: 'e' };
    }
    function nearestPort(object, point) {
        return PORTS.map((key) => portPosition(object, key)).sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
    }

    function addLink(sourceObject, sourceKey, targetObject, targetKey, overrides = {}) {
        const link = {
            id: uid('network-link'), type: 'network-link', sourceId: sourceObject.id, targetId: targetObject.id,
            sourcePort: sourceKey || 'e', targetPort: targetKey || 'w',
            label: '', bandwidth: '1 Gbps', linkType: 'ethernet', direction: 'none',
            stroke: '#334155', lineWidth: 3, dashed: false, autoRoute: true,
            ...overrides
        };
        state.document.objects.push(link); state.selectedId = link.id; state.connectionStart = null;
        pushHistory(); render(); setStatus('Smart point-to-point network link created.');
    }
    function connectPort(objectId, portKey) {
        const object = state.document.objects.find((item) => item.id === objectId && item.type === 'network-device');
        if (!object) return;
        if (!state.connectionStart) {
            state.connectionStart = { objectId, portKey };
            setStatus(`Source selected: ${object.label || object.deviceType}. Choose a destination port.`); render(); return;
        }
        const source = state.document.objects.find((item) => item.id === state.connectionStart.objectId && item.type === 'network-device');
        if (!source) { state.connectionStart = null; render(); return; }
        addLink(source, state.connectionStart.portKey, object, portKey);
        state.activeTool = 'select'; updateToolButtons();
    }

    function addObject(type) {
        const object = defaultObject(type); const count = state.document.objects.length;
        if ('x' in object) object.x = snap(Number(object.x) + (count % 5) * 24);
        if ('y' in object) object.y = snap(Number(object.y) + (count % 4) * 24);
        state.document.objects.push(object); state.selectedId = object.id; pushHistory(); render(); setStatus(`${type} added.`);
    }
    function pushHistory() {
        if (!state.document) return; const snapshot = JSON.stringify(state.document);
        if (state.history[state.historyIndex] === snapshot) return;
        state.history = state.history.slice(0, state.historyIndex + 1); state.history.push(snapshot);
        if (state.history.length > 100) state.history.shift(); state.historyIndex = state.history.length - 1; updateHistoryButtons();
    }
    function restoreHistory(index) {
        if (index < 0 || index >= state.history.length) return;
        state.historyIndex = index; state.document = Diagram.normalizeSpec(JSON.parse(state.history[index]));
        state.selectedId = null; state.connectionStart = null; state.interaction = null; syncDocumentControls(); render(); updateHistoryButtons();
    }
    function undo() { restoreHistory(state.historyIndex - 1); }
    function redo() { restoreHistory(state.historyIndex + 1); }
    function updateHistoryButtons() {
        if (!state.controls.undo) return; state.controls.undo.disabled = state.historyIndex <= 0; state.controls.redo.disabled = state.historyIndex >= state.history.length - 1;
    }
    function updateToolButtons() { state.controls.tools?.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === state.activeTool)); }
    function setTool(tool) {
        state.activeTool = tool; state.connectionStart = null; updateToolButtons();
        if (tool === 'network-link') { setStatus('Smart link: click a source port, then a destination port.'); render(); return; }
        if (tool !== 'select') { addObject(tool); state.activeTool = 'select'; updateToolButtons(); } else render();
    }

    function selectionMarkup() {
        if (!state.document) return '';
        const selected = selectedObject(); let markup = '<g data-network-editor-overlay="1">';
        if (selected && ['network-device', 'network-zone', 'network-table'].includes(selected.type)) {
            const width = Number(selected.width || 130); const height = selected.type === 'network-table' ? Number(selected.rowHeight || 34) * ((selected.rows?.length || 0) + 2) : Number(selected.height || 90);
            const left = selected.type === 'network-table' ? Number(selected.x || 0) : Number(selected.x || 0) - width / 2;
            const top = selected.type === 'network-table' ? Number(selected.y || 0) : Number(selected.y || 0) - height / 2;
            markup += `<rect x="${left - 8}" y="${top - 8}" width="${width + 16}" height="${height + 16}" rx="8" fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="7 5"/>`;
        } else if (selected?.type === 'text') markup += `<circle cx="${selected.x}" cy="${selected.y}" r="8" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>`;
        if (state.activeTool === 'network-link' || selected?.type === 'network-device') {
            devices().forEach((object) => PORTS.forEach((key) => {
                const point = portPosition(object, key); const started = state.connectionStart?.objectId === object.id && state.connectionStart?.portKey === key;
                markup += `<circle data-network-port-object="${esc(object.id)}" data-network-port-key="${key}" cx="${point.x}" cy="${point.y}" r="${started ? 9 : 7}" fill="${started ? '#16a34a' : '#2563eb'}" stroke="#ffffff" stroke-width="2" style="cursor:crosshair"/>`;
            }));
        }
        return markup + '</g>';
    }
    function render() {
        if (!state.canvas || !state.document) return;
        state.document = Diagram.normalizeSpec(state.document); let svg = Diagram.svgMarkup(state.document);
        svg = svg.replace('</svg>', `${selectionMarkup()}</svg>`); state.canvas.innerHTML = svg; state.svg = state.canvas.querySelector('svg');
        syncSelectedControls(); updateSummary();
    }

    function field(label, key, value, type = 'text', attrs = '') { return `<div class="qmx-net-field"><label>${esc(label)}</label><input type="${type}" data-object="${esc(key)}" value="${esc(value)}" ${attrs}></div>`; }
    function check(label, key, checked) { return `<label class="qmx-net-check"><input type="checkbox" data-object="${esc(key)}" ${checked ? 'checked' : ''}> ${esc(label)}</label>`; }
    function textarea(label, key, value) { return `<div class="qmx-net-field"><label>${esc(label)}</label><textarea data-object="${esc(key)}">${esc(value)}</textarea></div>`; }
    function selectField(label, key, value, values) { return `<div class="qmx-net-field"><label>${esc(label)}</label><select data-object="${esc(key)}">${values.map((item) => `<option value="${esc(item)}" ${item === value ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select></div>`; }

    function syncSelectedControls() {
        const panel = state.controls.selected; if (!panel) return; const object = selectedObject();
        if (!object) { panel.innerHTML = '<div class="qmx-net-empty">Select a device, link, zone, table or annotation.</div>'; return; }
        let html = `<div class="qmx-net-type">${esc(object.type)}${object.deviceType ? ` · ${esc(object.deviceType)}` : ''}</div>`;
        if (object.type === 'network-device') {
            html += selectField('Device type', 'deviceType', object.deviceType, Array.from(DEVICE_TYPES));
            html += field('Label', 'label', object.label); html += field('Subtitle / interface', 'subtitle', object.subtitle || ''); html += field('IP address', 'ip', object.ip || '');
            html += `<div class="qmx-net-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Width', 'width', object.width, 'number', 'min="70" max="500"')}${field('Height', 'height', object.height, 'number', 'min="50" max="400"')}</div>`;
            html += `<div class="qmx-net-grid2">${field('Fill', 'fill', object.fill, 'color')}${field('Stroke', 'stroke', object.stroke, 'color')}${field('Icon', 'iconColor', object.iconColor, 'color')}${field('Line width', 'lineWidth', object.lineWidth, 'number', 'min="1" max="20" step="0.5"')}</div>`;
        } else if (object.type === 'network-link') {
            const options = (selectedId) => devices().map((item) => `<option value="${esc(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${esc(item.label || item.deviceType)}</option>`).join('');
            const portOptions = (selectedKey) => PORTS.map((key) => `<option value="${key}" ${key === selectedKey ? 'selected' : ''}>${key.toUpperCase()}</option>`).join('');
            html += field('Link label', 'label', object.label || ''); html += field('Bandwidth', 'bandwidth', object.bandwidth || '');
            html += selectField('Link type', 'linkType', object.linkType, ['ethernet', 'fiber', 'wan', 'wireless', 'vpn']); html += selectField('Direction', 'direction', object.direction, ['none', 'forward', 'both']);
            html += `<div class="qmx-net-field"><label>Source device</label><select data-object="sourceId">${options(object.sourceId)}</select></div><div class="qmx-net-field"><label>Target device</label><select data-object="targetId">${options(object.targetId)}</select></div>`;
            html += `<div class="qmx-net-grid2"><div class="qmx-net-field"><label>Source port</label><select data-object="sourcePort">${portOptions(object.sourcePort)}</select></div><div class="qmx-net-field"><label>Target port</label><select data-object="targetPort">${portOptions(object.targetPort)}</select></div></div>`;
            html += `${check('Dashed line', 'dashed', object.dashed)}${check('Automatic orthogonal route', 'autoRoute', object.autoRoute)}`;
            html += `<div class="qmx-net-grid2">${field('Line width', 'lineWidth', object.lineWidth, 'number', 'min="1" max="20" step="0.5"')}${field('Stroke', 'stroke', object.stroke, 'color')}</div>`;
        } else if (object.type === 'network-zone') {
            html += field('Zone / subnet label', 'label', object.label); html += `<div class="qmx-net-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Width', 'width', object.width, 'number', 'min="160" max="1800"')}${field('Height', 'height', object.height, 'number', 'min="120" max="1200"')}</div>`;
            html += check('Dashed border', 'dashed', object.dashed); html += `<div class="qmx-net-grid2">${field('Fill', 'fill', object.fill, 'color')}${field('Stroke', 'stroke', object.stroke, 'color')}</div>`;
        } else if (object.type === 'network-table') {
            html += field('Table title', 'title', object.title); html += textarea('Headers — one per line', 'headersText', (object.headers || []).join('\n')); html += textarea('Rows — comma separated, one row per line', 'rowsText', (object.rows || []).map((row) => row.join(', ')).join('\n'));
            html += `<div class="qmx-net-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Width', 'width', object.width, 'number', 'min="220" max="1600"')}${field('Row height', 'rowHeight', object.rowHeight, 'number', 'min="22" max="100"')}</div>`;
            html += `<div class="qmx-net-grid2">${field('Header fill', 'headerFill', object.headerFill, 'color')}${field('Stroke', 'stroke', object.stroke, 'color')}</div>`;
        } else {
            html += textarea('Text', 'text', object.text); html += `<div class="qmx-net-grid2">${field('X', 'x', object.x, 'number')}${field('Y', 'y', object.y, 'number')}${field('Font size', 'fontSize', object.fontSize, 'number', 'min="8" max="120"')}${field('Color', 'color', object.color, 'color')}</div>`; html += check('Bold', 'fontWeight', object.fontWeight === 'bold');
        }
        panel.innerHTML = html;
    }
    function updateSummary() {
        const summary = state.controls.summary; if (!summary) return; const counts = {};
        state.document.objects.forEach((object) => { counts[object.type] = (counts[object.type] || 0) + 1; });
        summary.textContent = `${state.document.objects.length} object(s) · ${counts['network-device'] || 0} device · ${counts['network-link'] || 0} link · ${counts['network-zone'] || 0} zone · ${counts['network-table'] || 0} table`;
    }
    function syncDocumentControls() {
        if (!state.root || !state.document) return; state.root.querySelectorAll('[data-doc]').forEach((control) => { const key = control.dataset.doc; if (control.type === 'checkbox') control.checked = Boolean(state.document[key]); else control.value = state.document[key] ?? ''; });
    }
    function onRootInput(event) {
        const docKey = event.target.dataset.doc;
        if (docKey) { const value = event.target.type === 'checkbox' ? event.target.checked : (event.target.type === 'number' ? Number(event.target.value) : event.target.value); state.document[docKey] = value; render(); pushHistory(); return; }
        const key = event.target.dataset.object; if (!key) return; const object = selectedObject(); if (!object) return;
        let value = event.target.type === 'checkbox' ? event.target.checked : (event.target.type === 'number' ? Number(event.target.value) : event.target.value);
        if (key === 'headersText') object.headers = String(value).split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
        else if (key === 'rowsText') object.rows = String(value).split(/\r?\n/).map((line) => line.split(',').map((item) => item.trim()).slice(0, 12)).filter((row) => row.some(Boolean)).slice(0, 40);
        else if (key === 'fontWeight') object.fontWeight = value ? 'bold' : 'normal';
        else if (key === 'deviceType') { object.deviceType = value; const [fill, stroke] = palette(value); object.fill = fill; object.stroke = stroke; object.iconColor = stroke; }
        else object[key] = value;
        render(); pushHistory(); setStatus('Network diagram object updated.');
    }

    function svgPoint(event) { if (!state.svg) return { x: 0, y: 0 }; const rect = state.svg.getBoundingClientRect(); return { x: (event.clientX - rect.left) * state.document.width / rect.width, y: (event.clientY - rect.top) * state.document.height / rect.height }; }
    function onCanvasPointerDown(event) {
        if (!state.svg?.contains(event.target)) return;
        const port = event.target.closest?.('[data-network-port-object]'); if (port) return;
        const group = event.target.closest?.('[data-qmx-object]');
        if (!group) { if (state.activeTool === 'select') { state.selectedId = null; render(); } return; }
        const object = state.document.objects.find((item) => item.id === group.getAttribute('data-qmx-object')); if (!object) return; const point = svgPoint(event);
        if (state.activeTool === 'network-link' && object.type === 'network-device') { const nearest = nearestPort(object, point); connectPort(object.id, nearest.key); event.preventDefault(); return; }
        state.selectedId = object.id; if (state.activeTool !== 'select') { render(); return; }
        if (['network-device', 'network-zone', 'network-table', 'text'].includes(object.type)) {
            state.interaction = { type: 'move', objectId: object.id, start: point, x: Number(object.x), y: Number(object.y) }; event.preventDefault();
        }
        render();
    }
    function onPointerMove(event) {
        if (!state.interaction || !state.document) return; const object = state.document.objects.find((item) => item.id === state.interaction.objectId); if (!object) return; const point = svgPoint(event);
        object.x = snap(state.interaction.x + point.x - state.interaction.start.x); object.y = snap(state.interaction.y + point.y - state.interaction.start.y); render();
    }
    function onPointerUp() { if (!state.interaction) return; state.interaction = null; pushHistory(); setStatus('Object moved; attached links rerouted automatically.'); }
    function onRootClick(event) {
        const port = event.target.closest?.('[data-network-port-object]');
        if (port) { if (state.activeTool !== 'network-link') { state.activeTool = 'network-link'; updateToolButtons(); } connectPort(port.dataset.networkPortObject, port.dataset.networkPortKey); return; }
        const tool = event.target.closest?.('[data-tool]'); if (tool) { setTool(tool.dataset.tool); return; }
        const preset = event.target.closest?.('[data-preset]'); if (preset) { applyPreset(preset.dataset.preset); return; }
        const action = event.target.closest?.('[data-act]')?.dataset.act; if (!action) return;
        ({ new: newDocument, undo, redo, duplicate: duplicateSelected, delete: deleteSelected, close, 'export-svg': exportSvg, 'export-png': exportPng, insert: insertIntoQuestion }[action]?.());
    }

    function link(source, target, options = {}) {
        return { id: uid('network-link'), type: 'network-link', sourceId: source.id, targetId: target.id,
            sourcePort: options.sourcePort || (target.x >= source.x ? 'e' : 'w'), targetPort: options.targetPort || (target.x >= source.x ? 'w' : 'e'),
            label: options.label || '', bandwidth: options.bandwidth || '1 Gbps', linkType: options.linkType || 'ethernet', direction: options.direction || 'none',
            stroke: options.stroke || '#334155', lineWidth: options.lineWidth || 3, dashed: Boolean(options.dashed), autoRoute: options.autoRoute !== false };
    }
    function note(x, y, text, options = {}) { return { id: uid('text'), type: 'text', x, y, text, color: options.color || '#0f172a', fontSize: options.fontSize || 20, fontWeight: options.bold === false ? 'normal' : 'bold' }; }

    function applyPreset(type) {
        if (type === 'clear') { state.document.objects = []; state.selectedId = null; pushHistory(); render(); setStatus('Network canvas cleared.'); return; }
        const objects = [];
        if (type === 'star-lan') {
            const sw = makeDevice('switch', { x: 590, y: 350, label: 'Core Switch', ip: '192.168.10.2' });
            const positions = [[220,180,'PC-1','192.168.10.11'],[590,130,'PC-2','192.168.10.12'],[960,180,'PC-3','192.168.10.13'],[260,560,'Printer','192.168.10.30'],[900,560,'Server','192.168.10.10']];
            const devs = positions.map(([x,y,label,ip], i) => makeDevice(i===3?'printer':i===4?'server':'client', { x,y,label,ip })); objects.push(makeZone({ x:590,y:350,width:980,height:600,label:'192.168.10.0/24 LAN' }), sw, ...devs, ...devs.map((d)=>link(sw,d,{bandwidth:'1 Gbps'})), note(420,55,'Star Topology LAN'));
        } else if (type === 'office-lan') {
            const internet = makeDevice('cloud',{x:120,y:120,label:'Internet'}), firewall=makeDevice('firewall',{x:340,y:120,label:'Firewall'}), router=makeDevice('router',{x:560,y:120,label:'Edge Router',ip:'203.0.113.2'}), sw=makeDevice('switch',{x:560,y:350,label:'Access Switch',ip:'10.10.10.2'}), ap=makeDevice('access-point',{x:300,y:540,label:'Wi-Fi AP',ip:'10.10.10.3'}), server=makeDevice('server',{x:820,y:350,label:'File Server',ip:'10.10.10.10'}), pc=makeDevice('client',{x:820,y:540,label:'Office PC',ip:'10.10.10.21'}), laptop=makeDevice('laptop',{x:300,y:650,label:'Laptop',ip:'10.10.10.31'});
            objects.push(makeZone({x:600,y:480,width:950,height:420,label:'Office LAN 10.10.10.0/24'}),internet,firewall,router,sw,ap,server,pc,laptop,link(internet,firewall,{linkType:'wan',bandwidth:'100 Mbps'}),link(firewall,router,{bandwidth:'1 Gbps'}),link(router,sw,{bandwidth:'1 Gbps'}),link(sw,ap),link(sw,server),link(sw,pc),link(ap,laptop,{linkType:'wireless',dashed:true,bandwidth:'Wi-Fi 6'}),note(430,55,'Small Office Network'));
        } else if (type === 'client-server') {
            const server=makeDevice('server',{x:590,y:180,label:'Application Server',ip:'172.16.0.10'}), db=makeDevice('database',{x:900,y:180,label:'Database',ip:'172.16.0.20'}), sw=makeDevice('switch',{x:590,y:390,label:'LAN Switch'}), clients=[makeDevice('client',{x:220,y:590,label:'Client A',ip:'172.16.0.101'}),makeDevice('client',{x:590,y:590,label:'Client B',ip:'172.16.0.102'}),makeDevice('laptop',{x:960,y:590,label:'Client C',ip:'172.16.0.103'})];
            objects.push(server,db,sw,...clients,link(server,db,{label:'SQL',bandwidth:'10 Gbps'}),link(server,sw),...clients.map((c)=>link(sw,c)),note(430,60,'Client–Server Architecture'));
        } else if (type === 'wifi') {
            const router=makeDevice('router',{x:590,y:170,label:'Wireless Router',ip:'192.168.0.1'}), ap=makeDevice('access-point',{x:590,y:360,label:'Access Point',ip:'192.168.0.2'}), devices=[makeDevice('laptop',{x:260,y:570,label:'Laptop',ip:'192.168.0.11'}),makeDevice('mobile',{x:590,y:570,label:'Phone',ip:'192.168.0.12'}),makeDevice('printer',{x:920,y:570,label:'Wi-Fi Printer',ip:'192.168.0.20'})];
            objects.push(router,ap,...devices,link(router,ap,{bandwidth:'1 Gbps'}),...devices.map((d)=>link(ap,d,{linkType:'wireless',dashed:true,bandwidth:'Wi-Fi'})),note(430,60,'Wireless LAN Topology'));
        } else if (type === 'wan-vpn') {
            const hq=makeDevice('router',{x:200,y:350,label:'HQ Router',ip:'198.51.100.10'}), cloud=makeDevice('cloud',{x:590,y:350,label:'Internet / MPLS'}), branch=makeDevice('router',{x:980,y:350,label:'Branch Router',ip:'203.0.113.10'}), hqsw=makeDevice('switch',{x:200,y:570,label:'HQ LAN'}), brsw=makeDevice('switch',{x:980,y:570,label:'Branch LAN'});
            objects.push(hq,cloud,branch,hqsw,brsw,link(hq,cloud,{linkType:'vpn',dashed:true,label:'IPsec VPN',bandwidth:'200 Mbps',direction:'both'}),link(cloud,branch,{linkType:'vpn',dashed:true,label:'IPsec VPN',bandwidth:'100 Mbps',direction:'both'}),link(hq,hqsw),link(branch,brsw),note(430,70,'Site-to-Site WAN / VPN'));
        } else if (type === 'ring') {
            const positions=[[590,120],[920,250],[850,560],[330,560],[260,250]]; const nodes=positions.map(([x,y],i)=>makeDevice('switch',{x,y,label:`Switch ${i+1}`})); objects.push(...nodes); nodes.forEach((n,i)=>objects.push(link(n,nodes[(i+1)%nodes.length],{linkType:'fiber',bandwidth:'10 Gbps'}))); objects.push(note(470,55,'Ring Topology'));
        } else if (type === 'mesh') {
            const nodes=[makeDevice('router',{x:260,y:180,label:'R1'}),makeDevice('router',{x:920,y:180,label:'R2'}),makeDevice('router',{x:260,y:560,label:'R3'}),makeDevice('router',{x:920,y:560,label:'R4'})]; objects.push(...nodes); for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)objects.push(link(nodes[i],nodes[j],{linkType:'wan',bandwidth:'100 Mbps'})); objects.push(note(470,70,'Full Mesh Topology'));
        } else if (type === 'three-tier') {
            const core=makeDevice('switch',{x:590,y:130,label:'Core Switch'}), dist1=makeDevice('switch',{x:340,y:330,label:'Distribution-1'}), dist2=makeDevice('switch',{x:840,y:330,label:'Distribution-2'}), acc1=makeDevice('switch',{x:200,y:550,label:'Access-1'}), acc2=makeDevice('switch',{x:480,y:550,label:'Access-2'}), acc3=makeDevice('switch',{x:700,y:550,label:'Access-3'}), acc4=makeDevice('switch',{x:980,y:550,label:'Access-4'}); objects.push(core,dist1,dist2,acc1,acc2,acc3,acc4,link(core,dist1,{linkType:'fiber',bandwidth:'40 Gbps'}),link(core,dist2,{linkType:'fiber',bandwidth:'40 Gbps'}),link(dist1,acc1,{linkType:'fiber',bandwidth:'10 Gbps'}),link(dist1,acc2,{linkType:'fiber',bandwidth:'10 Gbps'}),link(dist2,acc3,{linkType:'fiber',bandwidth:'10 Gbps'}),link(dist2,acc4,{linkType:'fiber',bandwidth:'10 Gbps'}),note(430,60,'Three-Tier Campus Network'));
        } else if (type === 'addressing') {
            objects.push(makeTable({x:350,y:170,width:500,title:'IPv4 Addressing Plan',headers:['Device','Interface','IP / Prefix'],rows:[['R1','G0/0','10.0.0.1/30'],['R1','G0/1','192.168.1.1/24'],['SW1','VLAN 1','192.168.1.2/24'],['Server','eth0','192.168.1.10/24']]}), note(400,80,'Network Addressing Table'));
        }
        state.document.objects = objects; state.selectedId = objects.find((object) => object.type !== 'network-link')?.id || null; state.connectionStart = null; pushHistory(); syncDocumentControls(); render(); setStatus(`${type} preset inserted.`);
    }

    function deleteSelected() {
        if (!state.selectedId) return; const deletedId = state.selectedId;
        state.document.objects = state.document.objects.filter((object) => object.id !== deletedId && object.sourceId !== deletedId && object.targetId !== deletedId);
        state.selectedId = null; state.connectionStart = null; pushHistory(); render(); setStatus('Object and attached links deleted.');
    }
    function duplicateSelected() {
        const object = selectedObject(); if (!object) return; const copy = clone(object); copy.id = uid(object.type);
        if (copy.type === 'network-link') { copy.label = copy.label ? `${copy.label}′` : ''; copy.dashed = !copy.dashed; }
        else { copy.x = Number(copy.x || 0) + 30; copy.y = Number(copy.y || 0) + 30; if (copy.label) copy.label = `${copy.label} COPY`; }
        state.document.objects.push(copy); state.selectedId = copy.id; pushHistory(); render(); setStatus('Object duplicated.');
    }
    function newDocument() {
        if (state.document.objects.length && !window.confirm('Start a new Network Topology document?')) return;
        state.document = createDocument(); state.selectedId = null; state.connectionStart = null; state.history = []; state.historyIndex = -1; pushHistory(); syncDocumentControls(); setTool('select'); render(); setStatus('New Network Topology document.');
    }
    function makeToken() { return `[[qmx-diagram:${Diagram.encodeSpec(state.document)}]]`; }
    function insertIntoQuestion() {
        const textarea = state.context?.textarea; if (!textarea) { setStatus('No target question field was found.'); return; }
        const token = makeToken(); const range = state.context?.replaceRange; textarea.focus();
        if (range && Number.isInteger(range.start) && Number.isInteger(range.end)) textarea.setRangeText(token, range.start, range.end, 'end');
        else { const start = textarea.selectionStart ?? textarea.value.length; const end = textarea.selectionEnd ?? start; const prefix = start > 0 && !/\n$/.test(textarea.value.slice(0, start)) ? '\n' : ''; const suffix = end < textarea.value.length && !/^\n/.test(textarea.value.slice(end)) ? '\n' : ''; textarea.setRangeText(prefix + token + suffix, start, end, 'end'); }
        textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.dispatchEvent(new Event('change', { bubbles: true })); setStatus('Network topology inserted. Save the question to persist it.'); window.setTimeout(close, 220);
    }
    function safeFilename(value) { return String(value || 'network-topology').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'network-topology'; }
    function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const linkElement = document.createElement('a'); linkElement.href = url; linkElement.download = filename; document.body.appendChild(linkElement); linkElement.click(); linkElement.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    function exportSvg() { downloadBlob(new Blob([Diagram.svgMarkup(state.document)], { type: 'image/svg+xml;charset=utf-8' }), `${safeFilename(state.document.title)}.svg`); setStatus('SVG exported.'); }
    function exportPng() { const svg = Diagram.svgMarkup(state.document); const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })); const image = new Image(); image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = state.document.width; canvas.height = state.document.height; canvas.getContext('2d').drawImage(image, 0, 0); URL.revokeObjectURL(url); canvas.toBlob((blob) => blob && downloadBlob(blob, `${safeFilename(state.document.title)}.png`), 'image/png'); setStatus('PNG exported.'); }; image.onerror = () => { URL.revokeObjectURL(url); setStatus('PNG export failed.'); }; image.src = url; }

    function addStyles() {
        if (document.getElementById('qmx-network-editor-styles')) return; const style = document.createElement('style'); style.id = 'qmx-network-editor-styles';
        style.textContent = `.qmx-net-editor[hidden]{display:none!important}.qmx-net-editor{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);padding:14px;display:flex;align-items:center;justify-content:center;font:14px/1.35 "Segoe UI",Arial,sans-serif;color:#0f172a}.qmx-net-shell{width:min(1580px,calc(100vw - 28px));height:min(960px,calc(100vh - 28px));background:#fff;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.35);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}.qmx-net-header,.qmx-net-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #dbe4ef}.qmx-net-footer{border-top:1px solid #dbe4ef;border-bottom:0}.qmx-net-title{font-weight:800;font-size:17px}.qmx-net-subtitle{font-size:12px;color:#64748b}.qmx-net-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.qmx-net-btn,.qmx-net-tool,.qmx-net-preset{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 11px;font-weight:700;cursor:pointer}.qmx-net-btn:hover,.qmx-net-tool:hover,.qmx-net-preset:hover{border-color:#2563eb}.qmx-net-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}.qmx-net-btn.danger{color:#dc2626}.qmx-net-btn:disabled{opacity:.45;cursor:not-allowed}.qmx-net-main{min-height:0;display:grid;grid-template-columns:270px minmax(0,1fr) 340px;gap:10px;padding:10px;background:#e7eef7}.qmx-net-panel{background:#fff;border:1px solid #d7e0ec;border-radius:12px;padding:10px;overflow:auto;min-height:0}.qmx-net-tools,.qmx-net-presets{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.qmx-net-tool{padding:8px 6px;font-size:12px}.qmx-net-tool small{display:block;color:#64748b;font-weight:500;margin-top:2px}.qmx-net-tool.active{background:#dbeafe;border-color:#2563eb;color:#1d4ed8}.qmx-net-preset{font-size:12px;padding:8px 6px}.qmx-net-section{font-weight:800;margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0}.qmx-net-canvas-wrap{min-width:0;min-height:0;background:#cbd5e1;border-radius:12px;padding:10px;overflow:auto;display:flex;align-items:center;justify-content:center}.qmx-net-canvas{width:100%;min-width:560px}.qmx-net-canvas svg{display:block;width:100%;height:auto;max-height:770px;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.16);touch-action:none}.qmx-net-canvas [data-qmx-object]{cursor:move}.qmx-net-field{margin:7px 0}.qmx-net-field label{display:block;font-weight:700;font-size:12px;margin-bottom:4px}.qmx-net-field input,.qmx-net-field select,.qmx-net-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:inherit}.qmx-net-field textarea{min-height:82px;resize:vertical}.qmx-net-grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px}.qmx-net-check{display:block;margin:8px 0}.qmx-net-type,.qmx-net-summary{margin-top:8px;padding:9px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px}.qmx-net-empty{color:#64748b;text-align:center;padding:20px 4px}.qmx-net-status{color:#64748b;min-height:18px}@media(max-width:1000px){.qmx-net-editor{padding:0}.qmx-net-shell{width:100vw;height:100vh;border-radius:0}.qmx-net-main{grid-template-columns:190px minmax(0,1fr)}.qmx-net-main>.qmx-net-panel:last-child{grid-column:1/-1;max-height:350px}.qmx-net-title{font-size:15px}}`;
        document.head.appendChild(style);
    }
    function buildEditor() {
        if (state.root) return; addStyles(); const root = document.createElement('div'); root.className = 'qmx-net-editor'; root.hidden = true;
        root.innerHTML = `<div class="qmx-net-shell" role="dialog" aria-modal="true" aria-label="Computer Network topology editor"><header class="qmx-net-header"><div><div class="qmx-net-title">Computer Network / Topology Diagram</div><div class="qmx-net-subtitle">Devices, subnets, IP labels and smart point-to-point links</div></div><div class="qmx-net-actions"><button class="qmx-net-btn" data-act="new">New</button><button class="qmx-net-btn" data-act="undo">Undo</button><button class="qmx-net-btn" data-act="redo">Redo</button><button class="qmx-net-btn" data-act="duplicate">Duplicate</button><button class="qmx-net-btn danger" data-act="delete">Delete</button><button class="qmx-net-btn" data-act="close">×</button></div></header><main class="qmx-net-main"><aside class="qmx-net-panel"><strong>Network devices & tools</strong><div class="qmx-net-tools" data-tools></div><div class="qmx-net-section">Topology presets</div><div class="qmx-net-presets"><button class="qmx-net-preset" data-preset="star-lan">Star LAN</button><button class="qmx-net-preset" data-preset="office-lan">Office LAN</button><button class="qmx-net-preset" data-preset="client-server">Client–Server</button><button class="qmx-net-preset" data-preset="wifi">Wi-Fi LAN</button><button class="qmx-net-preset" data-preset="wan-vpn">WAN / VPN</button><button class="qmx-net-preset" data-preset="ring">Ring</button><button class="qmx-net-preset" data-preset="mesh">Full Mesh</button><button class="qmx-net-preset" data-preset="three-tier">Three-tier</button><button class="qmx-net-preset" data-preset="addressing">Addressing table</button><button class="qmx-net-preset" data-preset="clear">Clear objects</button></div><p class="qmx-net-subtitle">Choose Smart link, click a source connection point, then a destination point. Links stay attached while devices move.</p></aside><section class="qmx-net-canvas-wrap"><div class="qmx-net-canvas" data-canvas></div></section><aside class="qmx-net-panel"><strong>Document</strong><div class="qmx-net-field"><label>Title</label><input data-doc="title"></div><div class="qmx-net-grid2"><div class="qmx-net-field"><label>Width</label><input type="number" min="480" max="2400" data-doc="width"></div><div class="qmx-net-field"><label>Height</label><input type="number" min="300" max="1800" data-doc="height"></div><div class="qmx-net-field"><label>Grid size</label><input type="number" min="5" max="100" data-doc="gridSize"></div><div class="qmx-net-field"><label>Background</label><input type="color" data-doc="background"></div></div><label class="qmx-net-check"><input type="checkbox" data-doc="networkShowGrid"> Show grid</label><label class="qmx-net-check"><input type="checkbox" data-doc="networkShowLabels"> Show device labels</label><label class="qmx-net-check"><input type="checkbox" data-doc="networkShowIp"> Show IP addresses</label><label class="qmx-net-check"><input type="checkbox" data-doc="networkShowLinkLabels"> Show link labels</label><label class="qmx-net-check"><input type="checkbox" data-doc="networkShowZones"> Show subnet zones</label><label class="qmx-net-check"><input type="checkbox" data-doc="snap"> Snap to grid</label><hr><strong>Selected object</strong><div data-selected></div><div class="qmx-net-summary" data-summary></div></aside></main><footer class="qmx-net-footer"><div class="qmx-net-status" data-status></div><div class="qmx-net-actions"><button class="qmx-net-btn" data-act="export-svg">Export SVG</button><button class="qmx-net-btn" data-act="export-png">Export PNG</button><button class="qmx-net-btn primary" data-act="insert">Insert into question</button></div></footer></div>`;
        document.body.appendChild(root); state.root = root; state.canvas = root.querySelector('[data-canvas]'); state.controls = { tools: root.querySelector('[data-tools]'), selected: root.querySelector('[data-selected]'), summary: root.querySelector('[data-summary]'), status: root.querySelector('[data-status]'), undo: root.querySelector('[data-act="undo"]'), redo: root.querySelector('[data-act="redo"]') };
        TOOL_DEFS.forEach(([id,label,bn]) => { const button = document.createElement('button'); button.className = 'qmx-net-tool'; button.dataset.tool = id; button.innerHTML = window.QmxDiagramToolButtonContent ? window.QmxDiagramToolButtonContent(id, label, bn) : `${esc(label)}<small>${esc(bn)}</small>`; state.controls.tools.appendChild(button); });
        root.addEventListener('click', onRootClick); root.addEventListener('change', onRootInput); root.addEventListener('input', onRootInput); state.canvas.addEventListener('pointerdown', onCanvasPointerDown); document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp); document.addEventListener('keydown', onKeydown);
    }
    function setStatus(message) { if (state.controls.status) state.controls.status.textContent = message; }
    function open(context = {}) { buildEditor(); state.context = context; state.document = context.initialSpec ? Diagram.normalizeSpec(context.initialSpec) : createDocument(); if (state.document.mode !== 'network-topology') state.document = createDocument(); state.selectedId = null; state.activeTool = 'select'; state.interaction = null; state.connectionStart = null; state.history = []; state.historyIndex = -1; pushHistory(); syncDocumentControls(); setTool('select'); render(); state.root.hidden = false; document.body.dataset.qmxNetworkOverflow = document.body.style.overflow || ''; document.body.style.overflow = 'hidden'; setStatus(context.initialSpec ? 'Existing Network Topology loaded.' : 'Choose a device, smart link or preset.'); }
    function close() { if (!state.root || state.root.hidden) return; state.root.hidden = true; document.body.style.overflow = document.body.dataset.qmxNetworkOverflow || ''; delete document.body.dataset.qmxNetworkOverflow; state.context?.textarea?.focus?.(); }
    function findTokenTextarea(token) { return Array.from(document.querySelectorAll('textarea')).find((textarea) => textarea.value.includes(token)) || null; }
    function openFromPreview(figure) { const payload = String(figure?.dataset.qmxDiagramPayload || ''); if (!payload) return false; let spec; try { spec = Diagram.decodePayload(payload); } catch (error) { return false; } if (spec.mode !== 'network-topology') return false; const token = `[[qmx-diagram:${payload}]]`; const textarea = findTokenTextarea(token) || window.QmxDiagramLauncher?.getActiveTextarea?.(); let replaceRange = null; if (textarea) { const start = textarea.value.indexOf(token); if (start >= 0) replaceRange = { start, end: start + token.length }; } open({ tool: { id: 'network-topology' }, textarea, initialSpec: spec, replaceRange, editMode: true }); return true; }
    function registerHandlers() { const launcher = window.QmxDiagramLauncher; if (!launcher?.registerToolHandler) return false; let registered = false; ['network-topology', 'computer-network', 'network-diagram', 'topology-diagram', 'network'].forEach((id) => { try { launcher.registerToolHandler(id, open); registered = true; } catch (error) { /* Alias may already be registered. */ } }); return registered; }
    function onKeydown(event) { if (!state.root || state.root.hidden) return; const editing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName); if (event.key === 'Escape' && state.activeTool === 'network-link') { setTool('select'); setStatus('Link creation cancelled.'); event.preventDefault(); return; } if (event.key === 'Escape') { close(); event.preventDefault(); return; } if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) { event.preventDefault(); deleteSelected(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && !editing) { event.preventDefault(); duplicateSelected(); } }
    function init() { buildEditor(); if (!registerHandlers()) document.addEventListener('qmx:diagram-launcher-ready', registerHandlers, { once: true }); }

    window.QmxNetworkTopologyEditor = Object.freeze({ version: '1.0.0', open, close, openFromPreview });
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})(window, document);
