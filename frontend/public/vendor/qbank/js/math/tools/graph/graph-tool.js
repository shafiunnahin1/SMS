import {
    GraphRegistry,
    normalizeSpec,
    validateGraphSpec,
    encodeGraphToken,
    decodeGraphToken,
    detectGraphSpec,
    graphSvg,
} from './graph-core.js?v=20260801-guest-browser-storage-1';

import {
    GRAPH_AXIS_CONTROL_VERSION,
    calculateGraphAutoRange,
    graphAxisSummary,
    resolveGraphAxisRange,
} from './graph-axis-range.js?v=20260801-guest-browser-storage-1';

import {
    GRAPH_BUILDER_UX_VERSION,
    TEXTBOOK_INPUT_ENGINE_VERSION,
    analyzeDataTable,
    buildAdvancedStatisticsSpec,
    buildStatisticsSpec,
    collectPageDataTables,
    escapeGraphUxHtml,
    findPageEquationSuggestions,
    parseDataTableText,
    recognizeUniversalGraph,
    rowsToDelimitedText,
} from './graph-ux-v2.js?v=20260801-guest-browser-storage-1';

import {
    GRAPH_DATASET_STORAGE_VERSION,
    GraphDatasetApiError,
    deleteGraphDataset,
    fetchGraphDataset,
    graphDatasetCapabilities,
    graphDatasetReference,
    graphDatasetSourceType,
    listGraphDatasets,
    saveGraphDataset,
} from './graph-dataset-client.js?v=20260801-guest-browser-storage-1';

const STYLE_ID = 'qmx-graph-platform-style';

function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .qmx-graph-builder{display:grid;grid-template-columns:minmax(320px,390px) minmax(0,1fr);gap:18px;text-align:left;padding:2px;align-items:start;overflow:visible}
        .qmx-graph-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-content:start;max-height:76vh;overflow-y:auto;overscroll-behavior:contain;padding-right:8px}
        .qmx-graph-section{grid-column:1/-1;margin:5px 0 0;padding-top:8px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:12px;font-weight:800;letter-spacing:.02em}
        .qmx-graph-field{display:grid;gap:5px;color:#475569;font-size:12px;font-weight:700;min-width:0}
        .qmx-graph-field.is-wide{grid-column:1/-1}
        .qmx-graph-field input,.qmx-graph-field select,.qmx-graph-field textarea{box-sizing:border-box;width:100%;min-height:38px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;font:inherit;font-weight:400}
        .qmx-graph-field textarea{resize:vertical;line-height:1.45;min-height:132px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
        .qmx-graph-checkbox{display:flex;align-items:center;gap:7px;min-height:38px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#334155;font-weight:600}
        .qmx-graph-checkbox input{width:auto;min-height:auto;margin:0}
        .qmx-graph-actions{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px}
        .qmx-graph-action{border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:7px 10px;color:#334155;font-size:12px;font-weight:700;cursor:pointer}
        .qmx-graph-action:hover{background:#f1f5f9}
        .qmx-graph-builder-preview{position:sticky;top:0;align-self:start;height:76vh;max-height:700px;min-height:300px;display:grid;place-items:center;border:1px solid #e2e8f0;border-radius:12px;background:#fff;overflow:auto}
        .qmx-graph-builder-preview svg{display:block;width:100%;height:auto;max-height:70vh;touch-action:none}.qmx-geometry-point.is-draggable{cursor:grab;outline:none}.qmx-geometry-point.is-draggable:hover circle,.qmx-geometry-point.is-draggable:focus circle{stroke:#0f172a;stroke-width:2.5}.qmx-space3d-rotate-surface{cursor:grab}.qmx-space3d-rotate-surface:active{cursor:grabbing}
        .qmx-graph-help{grid-column:1/-1;margin:0;padding:8px 10px;border-radius:8px;background:#eff6ff;color:#1e40af;font-size:11.5px;line-height:1.45;white-space:pre-line}
        .qmx-graph-errors{grid-column:1/-1;margin:0;padding:8px 10px;border-radius:8px;background:#fef2f2;color:#b91c1c;font-size:12px;line-height:1.45}
        .qmx-graph-errors:empty{display:none}
        .qmx-graph-left-pane{display:grid;align-content:start;min-width:0}
        .qmx-graph-ux-panel{display:grid;gap:14px;align-content:start;padding:2px}
        .qmx-graph-ux-panel[hidden]{display:none!important}
        .qmx-graph-ux-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .qmx-graph-ux-header h2{margin:0;color:#0f172a;font-size:20px;line-height:1.25}
        .qmx-graph-ux-header p{margin:4px 0 0;color:#64748b;font-size:12px;line-height:1.45}
        .qmx-graph-ux-back{border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:7px 10px;color:#334155;font-size:12px;font-weight:800;cursor:pointer}
        .qmx-graph-ux-back:hover{background:#f8fafc}
        .qmx-graph-source-card{display:grid;gap:9px;padding:13px;border:1px solid #bfdbfe;border-radius:12px;background:#eff6ff}
        .qmx-graph-source-card strong{color:#1e3a8a;font-size:13px}
        .qmx-graph-source-equation{padding:8px 10px;border-radius:8px;background:#fff;color:#0f172a;font:700 15px/1.45 "Cambria Math","STIX Two Math",serif;overflow-wrap:anywhere}
        .qmx-graph-source-features{display:flex;flex-wrap:wrap;gap:6px}
        .qmx-graph-source-feature{padding:4px 7px;border-radius:999px;background:#dbeafe;color:#1e40af;font-size:10.5px;font-weight:700}
        .qmx-graph-primary-action{border:1px solid #2563eb;border-radius:9px;background:#2563eb;padding:9px 12px;color:#fff;font-size:12px;font-weight:800;cursor:pointer}
        .qmx-graph-primary-action:hover{background:#1d4ed8}
        .qmx-graph-category-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .qmx-graph-category-card{display:grid;grid-template-columns:auto 1fr;gap:9px;text-align:left;border:1px solid #dbe3ef;border-radius:12px;background:#fff;padding:12px;cursor:pointer;min-height:82px}
        .qmx-graph-category-card:hover,.qmx-graph-category-card:focus-visible{border-color:#93c5fd;background:#f8fbff;outline:none}
        .qmx-graph-category-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:#eff6ff;color:#1d4ed8;font-size:18px;font-weight:900}
        .qmx-graph-category-card strong{display:block;color:#0f172a;font-size:12.5px}
        .qmx-graph-category-card small{display:block;margin-top:3px;color:#64748b;font-size:10.5px;line-height:1.35}
        .qmx-graph-suggestions{display:grid;gap:7px}
        .qmx-graph-suggestion{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;padding:8px 10px}
        .qmx-graph-suggestion span{min-width:0;color:#334155;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .qmx-graph-suggestion button{flex:0 0 auto;border:1px solid #cbd5e1;border-radius:7px;background:#fff;padding:5px 8px;color:#1d4ed8;font-size:10px;font-weight:800;cursor:pointer}
        .qmx-universal-equation-input,.qmx-stat-data-input{box-sizing:border-box;width:100%;min-height:118px;padding:10px 11px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;font:14px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical}
        .qmx-equation-detection{min-height:62px;padding:10px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;color:#334155;font-size:12px;line-height:1.5}
        .qmx-equation-detection.is-success{border-color:#bbf7d0;background:#f0fdf4;color:#166534}
        .qmx-equation-detection.is-error{border-color:#fecaca;background:#fef2f2;color:#b91c1c}
        .qmx-graph-ux-actions{display:flex;flex-wrap:wrap;gap:8px}
        .qmx-graph-secondary-action{border:1px solid #cbd5e1;border-radius:9px;background:#fff;padding:8px 10px;color:#334155;font-size:11px;font-weight:800;cursor:pointer}
        .qmx-stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .qmx-stat-grid .qmx-graph-field{font-size:11px}
        .qmx-stat-table-preview{max-height:240px;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff}
        .qmx-stat-table-preview table{width:100%;border-collapse:collapse;font-size:10.5px}
        .qmx-stat-table-preview th,.qmx-stat-table-preview td{padding:6px 7px;border:1px solid #e2e8f0;text-align:left;white-space:nowrap}
        .qmx-stat-table-preview th{position:sticky;top:0;background:#f8fafc;color:#334155}
        .qmx-stat-summary{padding:8px 10px;border-radius:9px;background:#f8fafc;color:#475569;font-size:11px;line-height:1.45}
        .qmx-axis-control-card{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:11px;border:1px solid #bfdbfe;border-radius:11px;background:#eff6ff}
        .qmx-axis-control-card.is-manual{border-color:#cbd5e1;background:#f8fafc}
        .qmx-axis-control-card .qmx-graph-field.is-wide{grid-column:1/-1}
        .qmx-axis-range-summary{grid-column:1/-1;padding:7px 9px;border-radius:8px;background:#fff;color:#334155;font-size:10.5px;font-weight:700;line-height:1.45}
        .qmx-axis-range-actions{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:7px}
        .qmx-axis-range-field.is-disabled{opacity:.55}
        .qmx-axis-range-field.is-disabled input{cursor:not-allowed;background:#f1f5f9}
        .qmx-stat-axis-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:10px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff}
        .qmx-stat-axis-card.is-manual{border-color:#cbd5e1;background:#f8fafc}
        .qmx-stat-axis-card .qmx-graph-field.is-wide{grid-column:1/-1}
        .qmx-stat-analysis-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:10px;border:1px solid #ddd6fe;border-radius:10px;background:#faf5ff}
        .qmx-stat-analysis-card .qmx-graph-field.is-wide{grid-column:1/-1}
        .qmx-stat-analysis-card[hidden],.qmx-stat-option-hidden{display:none!important}
        .qmx-stat-multi-select{min-height:112px!important}
        .qmx-stat-file-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
        .qmx-stat-file-name{color:#64748b;font-size:10.5px;overflow-wrap:anywhere}
        .qmx-stat-dataset-badge{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:10px;font-weight:800}
        .qmx-stat-warning{padding:8px 10px;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:10.5px;line-height:1.45}
        .qmx-dataset-storage-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:10px;border:1px solid #bae6fd;border-radius:10px;background:#f0f9ff}
        .qmx-dataset-storage-card .qmx-graph-field.is-wide{grid-column:1/-1}
        .qmx-dataset-storage-actions{grid-column:1/-1;display:flex;align-items:center;flex-wrap:wrap;gap:7px}
        .qmx-dataset-status{grid-column:1/-1;padding:7px 9px;border-radius:8px;background:#fff;color:#475569;font-size:10.5px;line-height:1.45;border:1px solid #e2e8f0}
        .qmx-dataset-status.is-ready{background:#ecfdf5;color:#166534;border-color:#bbf7d0}
        .qmx-dataset-status.is-warning{background:#fff7ed;color:#9a3412;border-color:#fed7aa}
        .qmx-dataset-status.is-error{background:#fef2f2;color:#991b1b;border-color:#fecaca}
        .qmx-dataset-storage-card[hidden]{display:none!important}
        .qmx-graph-controls-toolbar{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}
        .qmx-graph-controls-toolbar-right{display:flex;gap:7px}
        .qmx-graph-controls.qmx-essential-only>.qmx-graph-section:not([data-qmx-essential]),
        .qmx-graph-controls.qmx-essential-only>.qmx-graph-field:not([data-qmx-essential]),
        .qmx-graph-controls.qmx-essential-only>.qmx-graph-checkbox:not([data-qmx-essential]){display:none!important}
        .qmx-graph-controls.qmx-essential-only .qmx-graph-help{display:none}
        .qmx-graph-controls.qmx-essential-only [data-qmx-dynamic-area]{display:contents}
        @media(max-width:850px){.qmx-graph-builder{grid-template-columns:1fr;overflow:visible}.qmx-graph-builder-preview{top:0;height:42vh;max-height:360px;min-height:240px}.qmx-graph-controls{grid-template-columns:1fr;max-height:48vh}.qmx-graph-field,.qmx-graph-field.is-wide{grid-column:1/-1}.qmx-graph-category-grid,.qmx-stat-grid,.qmx-axis-control-card,.qmx-stat-axis-card,.qmx-stat-analysis-card,.qmx-dataset-storage-card{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
}

function section(text) {
    const element = document.createElement('div');
    element.className = 'qmx-graph-section';
    element.textContent = text;
    return element;
}

function field(label, control, wide = false) {
    const wrapper = document.createElement('label');
    wrapper.className = `qmx-graph-field${wide ? ' is-wide' : ''}`;
    const caption = document.createElement('span');
    caption.textContent = label;
    wrapper.append(caption, control);
    return wrapper;
}

function input(type = 'text', value = '') {
    const element = document.createElement('input');
    element.type = type;
    if (type !== 'checkbox') element.value = value ?? '';
    return element;
}

function checkbox(label, checked = false) {
    const wrapper = document.createElement('label');
    wrapper.className = 'qmx-graph-checkbox';
    const control = input('checkbox');
    control.checked = Boolean(checked);
    const text = document.createElement('span');
    text.textContent = label;
    wrapper.append(control, text);
    return { wrapper, control };
}

function getPath(object, path) {
    return String(path).split('.').reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
    const keys = String(path).split('.');
    let target = object;
    keys.slice(0, -1).forEach((key) => {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        target = target[key];
    });
    target[keys[keys.length - 1]] = value;
}

function pluginFor(type) {
    return GraphRegistry.get(type) || GraphRegistry.get('function');
}

function looksLikePiecewiseDsl(value) {
    const lines = String(value || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'));
    const matches = lines.filter((line) => {
        const pieces = line.split(/\s*\|\s*/).map((piece) => piece.trim());
        const first = String(pieces[0] || '').toLowerCase();
        if (['function', 'line', 'polar', 'parametric', 'circle', 'ellipse', 'parabola', 'hyperbola'].includes(first)) return false;
        const condition = pieces.length >= 3 ? pieces[2] : pieces[1];
        if (/\by\b/i.test(condition || '') && /(?:<=|>=|<|>)/.test(condition || '')) return false;
        return pieces.length >= 2 && /(?:<=|>=|<|>|\[[^\]]*,|\([^)]*,)/.test(condition || '');
    });
    return matches.length >= 2;
}






function normalizeSpace3dEditorSource(value) {
    return String(value || '')
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[｜∣│¦ǀ]/g, '|')
        .replace(/[−–—]/g, '-')
        .replace(/\r\n?/g, '\n');
}

function looksLikeSpace3dDsl(value) {
    const kinds = normalizeSpace3dEditorSource(value)
        .split(/\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'))
        .map((line) => String(line.split(/\s*\|\s*/)[0] || '')
            .trim()
            .toLowerCase()
            .replace(/[_\s]+/g, '-'));

    return kinds.some((kind) => [
        'surface',
        'surface3d',
        'plane',
        'parametric-surface',
        'parametric-surface3d',
        'sphere',
        'cylinder',
        'cone',
        'curve3d',
        'space-curve',
        'point3d',
        'segment3d',
        'line3d',
        'vector3d',
    ].includes(kind));
}

function normalizeGeometryEditorSource(value) {
    return String(value || '')
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[｜∣│¦ǀ]/g, '|')
        .replace(/\r\n?/g, '\n');
}

function looksLikeGeometryDsl(value) {
    const kinds = normalizeGeometryEditorSource(value)
        .split(/\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'))
        .map((line) => String(line.split(/\s*\|\s*/)[0] || '')
            .trim()
            .toLowerCase()
            .replace(/[_\s]+/g, '-'));

    return kinds.includes('point')
        && kinds.some((kind) => [
            'midpoint',
            'intersection',
            'line-intersection',
            'segment',
            'ray',
            'line',
            'polygon',
            'triangle',
            'quadrilateral',
            'circle',
            'parallel',
            'perpendicular',
            'perpendicular-bisector',
            'perp-bisector',
            'angle-bisector',
            'measure',
            'measurement',
        ].includes(kind));
}

function looksLikeImplicitDsl(value) {
    return normalizeImplicitEditorSource(value)
        .split(/\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'))
        .some((line) => {
            const kind = String(line.split(/\s*\|\s*/)[0] || '')
                .trim()
                .toLowerCase()
                .replace(/[_\s]+/g, '-');
            return ['implicit', 'level', 'field'].includes(kind);
        });
}

function normalizeImplicitEditorSource(value) {
    return String(value || '')
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[｜∣│¦ǀ]/g, '|')
        .replace(/\r\n?/g, '\n');
}

function looksLikeCalculusDsl(value) {
    const lines = String(value || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'));

    const kinds = lines.map((line) => String(
        line.split(/\s*\|\s*/)[0] || '',
    ).trim().toLowerCase());

    const hasCurve = kinds.some((kind) => ['curve', 'function'].includes(kind));
    const hasOperation = kinds.some((kind) => [
        'tangent',
        'normal',
        'secant',
        'area',
        'integral',
        'between',
        'markers',
        'points',
        'analyze',
    ].includes(kind));

    return hasCurve && hasOperation;
}

function looksLikeRegionDsl(value) {
    const lines = String(value || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'));

    return lines.some((line) => {
        const pieces = line.split(/\s*\|\s*/).map((piece) => piece.trim());
        const condition = pieces.length >= 2 ? pieces[1] : line;
        return /(?:<=|>=|<|>)/.test(condition)
            && (
                /\by\b/i.test(condition)
                || /\bx\b.*\by\b|\by\b.*\bx\b/i.test(condition)
                || /&&/.test(condition)
            );
    });
}

function looksLikeCompositeDsl(value) {
    if (looksLikeSpace3dDsl(value) || looksLikeGeometryDsl(value)) return false;

    const lines = String(value || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'));

    return lines.some((line) => {
        const pieces = line.split(/\s*\|\s*/).map((piece) => piece.trim());
        const kind = String(pieces[0] || '').toLowerCase();

        if (['function', 'line', 'polar', 'parametric'].includes(kind)) return pieces.length >= 3;

        if (['circle', 'ellipse', 'parabola', 'hyperbola'].includes(kind)) {
            return pieces.length >= 3 && /\b(?:h|k|r|radius|a|b|p|orientation)\s*=/i.test(pieces[2] || '');
        }

        return false;
    });
}

function commonOnly(spec) {
    const keys = [
        'id', 'title', 'subtitle', 'xLabel', 'yLabel',
        'xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax',
        'axisMode', 'autoRangePadding', 'autoZRange',
        'color', 'colors', 'background', 'grid', 'minorGrid', 'showAxes', 'showTickLabels',
        'legend', 'tickCount', 'aspectLock', 'width', 'height', 'source',
        'sourceData', 'statisticsWorkspaceVersion', 'datasetMode',
        'sourceRowCount', 'renderedPointLimit', 'datasetRef', 'datasetStorageVersion',
    ];
    return Object.fromEntries(keys.map((key) => [key, spec[key]]));
}

function makeDynamicControl(definition, value) {
    let control;
    if (definition.type === 'select') {
        control = document.createElement('select');
        (definition.options || []).forEach(([optionValue, label]) => control.add(new Option(label, optionValue)));
        control.value = value ?? definition.options?.[0]?.[0] ?? '';
    } else if (definition.type === 'checkbox') {
        control = input('checkbox');
        control.checked = Boolean(value);
    } else {
        control = input(definition.type || 'text', value ?? '');
        ['min', 'max', 'step', 'placeholder'].forEach((attribute) => {
            if (definition[attribute] !== undefined) control.setAttribute(attribute, definition[attribute]);
        });
    }
    control.dataset.graphPath = definition.key;
    return control;
}

function dynamicValue(control, definition) {
    if (definition.type === 'checkbox') return control.checked;
    if (definition.type === 'number') return control.value === '' ? undefined : Number(control.value);
    return control.value;
}

function calculateAutoRange(spec) {
    const plugin = pluginFor(spec.type);
    if (typeof plugin?.autoRange === 'function') {
        try {
            const customRange = plugin.autoRange(spec);
            if (customRange && Number.isFinite(customRange.xMin) && Number.isFinite(customRange.xMax)
                && Number.isFinite(customRange.yMin) && Number.isFinite(customRange.yMax)) return customRange;
        } catch (error) {
            console.warn(`Auto range failed: ${spec.type}`, error);
        }
    }
    const padding = (min, max) => {
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        if (min === max) return [min - 1, max + 1];
        const gap = (max - min) * .12;
        return [min - gap, max + gap];
    };
    if (spec.x?.length && spec.y?.length) {
        const x = padding(Math.min(...spec.x), Math.max(...spec.x));
        const y = padding(Math.min(...spec.y), Math.max(...spec.y));
        return x && y ? { xMin: x[0], xMax: x[1], yMin: y[0], yMax: y[1] } : null;
    }
    const p = spec.params || {};
    if (spec.type === 'circle') {
        const h = Number(p.h) || 0, k = Number(p.k) || 0, r = Math.abs(Number(p.radius) || 4) * 1.18;
        return { xMin: h - r, xMax: h + r, yMin: k - r, yMax: k + r };
    }
    if (spec.type === 'ellipse') {
        const h = Number(p.h) || 0, k = Number(p.k) || 0;
        const a = Math.abs(Number(p.a) || 5) * 1.18, b = Math.abs(Number(p.b) || 3) * 1.18;
        return { xMin: h - a, xMax: h + a, yMin: k - b, yMax: k + b };
    }
    if (spec.type === 'parabola') {
        const h = Number(p.h) || 0, k = Number(p.k) || 0, focal = Number(p.p) || 2;
        if (p.orientation === 'horizontal') return { xMin: Math.min(h - 2, h + 12 * Math.sign(focal)), xMax: Math.max(h + 2, h + 12 * Math.sign(focal)), yMin: k - 10, yMax: k + 10 };
        return { xMin: h - 10, xMax: h + 10, yMin: Math.min(k - 2, k + 12 * Math.sign(focal)), yMax: Math.max(k + 2, k + 12 * Math.sign(focal)) };
    }
    if (spec.type === 'hyperbola') {
        const h = Number(p.h) || 0, k = Number(p.k) || 0;
        const a = Math.abs(Number(p.a) || 3) * 3, b = Math.abs(Number(p.b) || 2) * 3;
        return { xMin: h - a, xMax: h + a, yMin: k - b, yMax: k + b };
    }
    if (spec.type === 'dot' && spec.values?.length) {
        const x = padding(Math.min(...spec.values), Math.max(...spec.values));
        const counts = new Map();
        let maxCount = 1;
        spec.values.forEach((value) => { const count = (counts.get(value) || 0) + 1; counts.set(value, count); maxCount = Math.max(maxCount, count); });
        return { xMin: x[0], xMax: x[1], yMin: 0, yMax: maxCount + 1 };
    }
    return null;
}

const TEMPLATES = [
    { id: '', label: 'Template নির্বাচন করুন' },
    { id: 'quadratic', label: 'Math: Quadratic + line', spec: { type: 'function', title: 'Function comparison', expression: 'Quadratic = x^2 - 4\nLine = 2*x + 1', xMin: -6, xMax: 6, yMin: -8, yMax: 20 } },
    { id: 'trig', label: 'Math: Sine and cosine', spec: { type: 'function', title: 'Trigonometric functions', expression: 'sin(x)\ncos(x)', xMin: -6.4, xMax: 6.4, yMin: -1.5, yMax: 1.5 } },
    { id: 'rose', label: 'Math: Polar rose', spec: { type: 'polar', title: 'Polar rose', expression: '4*cos(3*theta)', xMin: -5, xMax: 5, yMin: -5, yMax: 5, aspectLock: true } },
    { id: 'parametric-circle', label: 'Math: Parametric circle', spec: { type: 'parametric', title: 'Parametric circle', series: [{ label: 'Circle', xExpression: '4*cos(t)', yExpression: '4*sin(t)' }], xMin: -5, xMax: 5, yMin: -5, yMax: 5, aspectLock: true } },
    { id: 'piecewise-basic', label: 'Math: Piecewise function', spec: { type: 'piecewise', title: 'Piecewise function', expression: 'Left | x^2 | x < 0\nMiddle | 2*x + 1 | 0 <= x < 3\nRight | 7 | x >= 3', xMin: -5, xMax: 7, yMin: -2, yMax: 12 } },
    { id: 'step-function', label: 'Math: Step function', spec: { type: 'piecewise', title: 'Step function', expression: 'Step 1 | -2 | x < -1\nStep 2 | 1 | -1 <= x < 2\nStep 3 | 4 | x >= 2', xMin: -5, xMax: 5, yMin: -4, yMax: 6 } },
    { id: 'restricted-domain', label: 'Math: Domain-restricted curve', spec: { type: 'piecewise', title: 'Restricted domain', expression: 'Arc | sqrt(9-x^2) | [-3, 3]', xMin: -5, xMax: 5, yMin: -1, yMax: 5, aspectLock: true } },
    { id: 'region-above-parabola', label: 'Calculus: Region above a parabola', spec: { type: 'region', title: 'Region above y = x²', expression: 'Above parabola | y >= x^2 | #3b82f6 | opacity=0.24', xMin: -5, xMax: 5, yMin: -2, yMax: 10 } },
    { id: 'region-between-curves', label: 'Calculus: Region between two curves', spec: { type: 'region', title: 'Area between curves', expression: 'Between curves | y >= x^2 && y <= 2*x+3 && x >= -1 && x <= 3 | #22c55e | opacity=0.28', xMin: -3, xMax: 5, yMin: -3, yMax: 10 } },
    { id: 'region-circle', label: 'Math: Inside a circle', spec: { type: 'region', title: 'Inside x² + y² ≤ 16', expression: 'Inside circle | x^2 + y^2 <= 16 | #8b5cf6 | opacity=0.24', xMin: -5, xMax: 5, yMin: -5, yMax: 5, aspectLock: true } },
    { id: 'region-feasible', label: 'Optimization: Common feasible region', spec: { type: 'region', title: 'Common feasible region', expression: 'Feasible | y >= x^2 && y <= 2*x+3 && x >= -2 && x <= 3 | #16a34a | opacity=0.30', xMin: -4, xMax: 5, yMin: -3, yMax: 10 } },
    { id: 'calculus-tangent-normal', label: 'Calculus: Tangent and normal', spec: { type: 'calculus', title: 'Tangent and normal', expression: 'curve | f | x^2 | #2563eb\ntangent | f | x=1 | #dc2626\nnormal | f | x=1 | #16a34a', xMin: -4, xMax: 5, yMin: -4, yMax: 12 } },
    { id: 'calculus-secant', label: 'Calculus: Secant line', spec: { type: 'calculus', title: 'Secant line', expression: 'curve | f | x^2 - 2 | #2563eb\nsecant | f | x1=-1, x2=2 | #9333ea', xMin: -4, xMax: 5, yMin: -5, yMax: 12 } },
    { id: 'calculus-integral', label: 'Calculus: Definite integral', spec: { type: 'calculus', title: 'Definite integral', expression: 'curve | f | x^2 - 4 | #2563eb\nintegral | f | from=-2, to=2, baseline=0, mode=signed | #0ea5e9 | opacity=0.26', xMin: -4, xMax: 4, yMin: -6, yMax: 10 } },
    { id: 'calculus-between', label: 'Calculus: Area between curves', spec: { type: 'calculus', title: 'Area between curves', expression: 'curve | f | x^2 | #2563eb\ncurve | g | 2*x+3 | #ea580c\nbetween | f | g | from=-1, to=3, mode=absolute | #22c55e | opacity=0.28', xMin: -3, xMax: 5, yMin: -3, yMax: 12 } },
    { id: 'calculus-analysis', label: 'Calculus: Intercepts and extrema', spec: { type: 'calculus', title: 'Intercepts and extrema', expression: 'curve | f | x^3 - 3*x | #2563eb\nmarkers | f | intercepts, extrema, stationary | #111827', xMin: -3, xMax: 3, yMin: -5, yMax: 5 } },
    { id: 'implicit-ellipse-calculus', label: 'Multivariable: Ellipse tangent, normal & gradient', spec: { type: 'implicit', title: 'Implicit ellipse calculus', expression: 'implicit | E | 9*x^2 + 4*y^2 - 36 | #2563eb\ntangent | E | point=2,0 | #dc2626\nnormal | E | point=2,0 | #16a34a\ngradient | E | point=2,0 | scale=2 | #7c3aed\narea-inside | E | side=negative | #60a5fa | opacity=0.20', xMin: -4, xMax: 4, yMin: -5, yMax: 5, aspectLock: true } },
    { id: 'implicit-intersections', label: 'Multivariable: Two implicit-curve intersections', spec: { type: 'implicit', title: 'Implicit intersections', expression: 'implicit | C | x^2 + y^2 - 16 | #2563eb\nimplicit | L | y - x | #ea580c\nintersections | C | L | #111827', xMin: -5, xMax: 5, yMin: -5, yMax: 5, aspectLock: true } },
    { id: 'implicit-level-critical', label: 'Multivariable: Level curve and critical point', spec: { type: 'implicit', title: 'Level curve and saddle point', expression: 'level | F | x^2 - y^2 | level=0 | #2563eb\ncritical | F | #7c3aed\nsingular | F | #dc2626', xMin: -5, xMax: 5, yMin: -5, yMax: 5, aspectLock: true } },
    { id: 'space3d-ripple', label: '3D: Ripple surface', spec: { type: 'space3d', title: 'Damped radial ripple', expression: 'surface | Ripple | 3*sin(sqrt(x^2+y^2))/(1+0.18*(x^2+y^2)) | #2563eb | opacity=0.90', xMin: -7, xMax: 7, yMin: -7, yMax: 7, zMin: -3, zMax: 3, autoZRange: true, showContours: true, contourCount: 7, azimuth: 42, elevation: 28, width: 760, height: 460 } },
    { id: 'space3d-saddle', label: '3D: Saddle surface and tangent plane', spec: { type: 'space3d', title: 'Saddle surface with plane', expression: 'surface | Saddle | 0.22*(x^2-y^2) | #2563eb | opacity=0.84\nplane | P | z=1.2*x-0.6*y | #16a34a | opacity=0.38', xMin: -6, xMax: 6, yMin: -6, yMax: 6, zMin: -8, zMax: 8, autoZRange: false, azimuth: 38, elevation: 25, width: 760, height: 460 } },
    { id: 'space3d-torus', label: '3D: Parametric torus', spec: { type: 'space3d', title: 'Parametric torus', expression: 'parametric-surface | Torus | x=(3+cos(v))*cos(u); y=(3+cos(v))*sin(u); z=sin(v) | u=0..2*pi; v=0..2*pi | #7c3aed | opacity=0.92', xMin: -5, xMax: 5, yMin: -5, yMax: 5, zMin: -2, zMax: 2, autoZRange: true, azimuth: 38, elevation: 24, width: 760, height: 460 } },
    { id: 'space3d-helix-sphere', label: '3D: Helix, sphere and vector', spec: { type: 'space3d', title: 'Space curve and sphere', expression: 'sphere | K | center=0,0,0; r=3 | #8b5cf6 | opacity=0.62\ncurve3d | H | x=4*cos(t); y=4*sin(t); z=t/3 | t=-6*pi..6*pi | #ea580c\npoint3d | A | 2,1,3 | #dc2626\nvector3d | v | from=0,0,0; to=A | #16a34a', xMin: -6, xMax: 6, yMin: -6, yMax: 6, zMin: -7, zMax: 7, autoZRange: false, azimuth: 45, elevation: 26, width: 760, height: 460 } },
    { id: 'space3d-space-geometry', label: '3D: Points, line, segment and vectors', spec: { type: 'space3d', title: 'Space geometry construction', expression: 'point3d | A | -4,-2,-1 | #2563eb\npoint3d | B | 4,2,3 | #ea580c\npoint3d | C | -1,4,5 | #16a34a\nsegment3d | AB | A | B | #0f172a\nline3d | AC | A | C | #7c3aed | dashed\nvector3d | OB | from=0,0,0; to=B | #dc2626\nplane | P | z=0.35*x-0.2*y+1 | #0ea5e9 | opacity=0.32', xMin: -7, xMax: 7, yMin: -7, yMax: 7, zMin: -5, zMax: 7, autoZRange: false, azimuth: 40, elevation: 27, width: 760, height: 460 } },
    { id: 'geometry-triangle', label: 'Geometry: Draggable triangle construction', spec: { type: 'geometry', title: 'Dynamic triangle construction', expression: 'point | A | x=-4, y=-2 | draggable | #2563eb\npoint | B | x=4, y=-2 | draggable | #ea580c\npoint | C | x=0, y=4 | draggable | #16a34a\nmidpoint | M | A | B | #7c3aed\npolygon | T | A,B,C | #2563eb | fill=#60a5fa | opacity=0.16\nsegment | AM | A | M | #9333ea\nperpendicular-bisector | p | A | B | #dc2626 | dashed\nangle-bisector | q | A | C | B | #0f766e | dashed\ncircle | K | through=A,B,C | #f59e0b | fill=none\nmeasure | dAB | distance | A | B\nmeasure | angleACB | angle | A | C | B\nmeasure | areaT | area | T', xMin: -7, xMax: 7, yMin: -5, yMax: 7, aspectLock: true } },
    { id: 'geometry-parallel-perpendicular', label: 'Geometry: Parallel and perpendicular lines', spec: { type: 'geometry', title: 'Parallel and perpendicular construction', expression: 'point | A | x=-4, y=-2 | draggable | #2563eb\npoint | B | x=3, y=2 | draggable | #ea580c\npoint | C | x=-1, y=4 | draggable | #16a34a\nline | l | A | B | #2563eb\nparallel | p | through=C | line=A,B | #16a34a | dashed\nperpendicular | n | through=C | line=A,B | #dc2626 | dashed\nmeasure | slopeAB | slope | A | B', xMin: -7, xMax: 7, yMin: -6, yMax: 7, aspectLock: true } },
    { id: 'geometry-circle-three-points', label: 'Geometry: Circle through three draggable points', spec: { type: 'geometry', title: 'Circle through three points', expression: 'point | A | x=-3, y=-1 | draggable | #2563eb\npoint | B | x=3, y=-1 | draggable | #ea580c\npoint | C | x=0, y=4 | draggable | #16a34a\ncircle | K | through=A,B,C | #7c3aed | fill=#c4b5fd | opacity=0.12\npolygon | T | A,B,C | #475569 | fill=none\nmeasure | radiusK | radius | K\nmeasure | areaT | area | T', xMin: -7, xMax: 7, yMin: -6, yMax: 7, aspectLock: true } },
    { id: 'composite-intersections', label: 'Math: Mixed shapes with intersections', spec: { type: 'composite', title: 'Mixed curves and intersections', expression: 'function | Quadratic | x^2 - 4\nfunction | Line | 2*x + 1\ncircle | Circle | h=0, k=0, r=4', xMin: -7, xMax: 7, yMin: -8, yMax: 14, aspectLock: true } },
    { id: 'composite-separated', label: 'Math: Multiple non-intersecting shapes', spec: { type: 'composite', title: 'Non-intersecting circles', expression: 'circle | Circle 1 | h=-6, k=0, r=2\ncircle | Circle 2 | h=0, k=0, r=2\ncircle | Circle 3 | h=6, k=0, r=2\nellipse | Ellipse | h=0, k=6, a=3, b=1.5', xMin: -10, xMax: 10, yMin: -4, yMax: 9, aspectLock: true } },
    { id: 'normal-data', label: 'Statistics: Histogram sample', spec: { type: 'histogram', title: 'Distribution', values: [12,14,15,15,16,17,18,18,18,19,20,21,22,24,25], binCount: 6 } },
    { id: 'vector-rotation', label: 'Engineering: Rotational vector field', spec: { type: 'vector-field', title: 'Rotational field', pExpression: '-y', qExpression: 'x', xMin: -5, xMax: 5, yMin: -5, yMax: 5, aspectLock: true } },
    { id: 'contour-circle', label: 'Engineering: Circular contours', spec: { type: 'contour', title: 'Level curves', expression: 'x^2 + y^2', levels: [1,4,9,16,25], levelsText: '1, 4, 9, 16, 25', xMin: -6, xMax: 6, yMin: -6, yMax: 6, aspectLock: true } },
];


function graphUxButton(text, className = 'qmx-graph-secondary-action') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    return button;
}

function graphUxHeader(titleText, descriptionText, backButton = null) {
    const header = document.createElement('div');
    header.className = 'qmx-graph-ux-header';
    const copy = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = titleText;
    const description = document.createElement('p');
    description.textContent = descriptionText;
    copy.append(title, description);
    header.appendChild(copy);
    if (backButton) header.appendChild(backButton);
    return header;
}

function graphUxCategory(id, icon, title, description) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qmx-graph-category-card';
    button.dataset.graphWorkspace = id;
    button.innerHTML = `
        <span class="qmx-graph-category-icon" aria-hidden="true">${icon}</span>
        <span><strong>${escapeGraphUxHtml(title)}</strong><small>${escapeGraphUxHtml(description)}</small></span>
    `;
    return button;
}

function markEssential(element) {
    if (element) element.dataset.qmxEssential = '1';
    return element;
}

function tablePreviewHtml(analysis, limit = 35) {
    if (!analysis?.headers?.length) return '<div class="qmx-stat-summary">Data table পাওয়া যায়নি।</div>';
    const head = analysis.headers.map((header) => `<th>${escapeGraphUxHtml(header)}</th>`).join('');
    const rows = analysis.body.slice(0, limit).map((row) => (
        `<tr>${analysis.headers.map((_, index) => `<td>${escapeGraphUxHtml(row[index] || '')}</td>`).join('')}</tr>`
    )).join('');
    const omitted = Math.max(0, analysis.body.length - limit);
    return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>${omitted ? `<div class="qmx-stat-summary">আরও ${omitted} row preview-তে দেখানো হয়নি; graph-এ সব row ব্যবহৃত হবে।</div>` : ''}`;
}


function normalizeRecoveredEditSpec(spec) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
    try {
        return normalizeSpec({
            ...spec,
            axisMode: spec.axisMode === 'auto' || spec.axisMode === 'manual'
                ? spec.axisMode
                : (spec.autoZRange === true ? 'auto' : 'manual'),
        });
    } catch (error) {
        console.error('Graph edit initial-spec normalization failed.', error);
        return null;
    }
}

export function recoverGraphEditSpec(options) {
    const direct = normalizeRecoveredEditSpec(options?.initialSpec);
    if (direct) {
        return {
            spec: direct,
            source: 'initialSpec',
        };
    }

    const tokenCandidates = [
        options?.existingGraphToken,
        options?.selectedGraphToken,
        options?.selectedGraphPayload
            ? `[[qmx-graph:${String(options.selectedGraphPayload)}]]`
            : '',
    ].filter(Boolean);

    for (const candidate of tokenCandidates) {
        const decoded = decodeGraphToken(String(candidate));
        if (decoded) {
            return {
                spec: normalizeRecoveredEditSpec(decoded),
                source: 'exact-token',
            };
        }
    }

    const textarea = options?.textarea;
    const start = Number(options?.replaceRange?.start);
    const end = Number(options?.replaceRange?.end);
    if (
        textarea
        && Number.isInteger(start)
        && Number.isInteger(end)
        && start >= 0
        && end > start
        && end <= String(textarea.value || '').length
    ) {
        const rangedToken = String(textarea.value || '').slice(start, end);
        const decoded = decodeGraphToken(rangedToken);
        if (decoded) {
            return {
                spec: normalizeRecoveredEditSpec(decoded),
                source: 'replace-range',
            };
        }
    }

    return {
        spec: null,
        source: '',
    };
}

export function graphEditContractRequested(options) {
    return Boolean(
        options?.editMode
        || options?.initialSpec
        || options?.existingGraphToken
        || options?.selectedGraphToken
        || options?.selectedGraphPayload
        || options?.replaceRange
    );
}

async function graphDialog({ editor, context, options }) {
    installStyles();

    const editRequested = graphEditContractRequested(options);
    const recoveredEdit = recoverGraphEditSpec(options);
    const suppliedInitialSpec = recoveredEdit.spec;
    const isEditMode = Boolean(editRequested && suppliedInitialSpec);

    if (editRequested && !suppliedInitialSpec) {
        graphUpdateError(
            'Selected graph token could not be decoded. No graph was changed. Select the graph again and retry.'
        );
        return null;
    }

    const initialSource = options?.initialSource || context?.getSelection?.()?.text || '';
    const allPageEquationSuggestions = isEditMode ? [] : findPageEquationSuggestions();
    const directInitialRecognition = isEditMode
        ? { recognized: false, confidence: 0, source: initialSource, equations: [] }
        : recognizeUniversalGraph(initialSource);
    const contextualSuggestion = directInitialRecognition.recognized
        ? allPageEquationSuggestions.find((item) => (
            item.recognition?.equation === directInitialRecognition.equation
            && item.recognition?.source?.length > initialSource.length
        ))
        : null;
    const initialRecognition = contextualSuggestion?.recognition || directInitialRecognition;

    let current = normalizeSpec(
        suppliedInitialSpec
        || (initialRecognition.recognized
            ? { ...initialRecognition.spec, axisMode: initialRecognition.spec?.axisMode || 'auto' }
            : detectGraphSpec(initialSource))
    );
    let explicitTypeLock = suppliedInitialSpec?.type || null;
    let activeMode = 'home';
    let controlsExtraOpen = Boolean(isEditMode && !suppliedInitialSpec?.sourceEquation);
    let equationRecognition = initialRecognition;
    let statisticsAnalysis = null;
    let activeDatasetRef = graphDatasetReference(current.datasetRef);
    let restoredDataset = null;
    let datasetRestoreError = '';
    let datasetVersionChanged = false;
    let datasetDirty = false;
    let datasetSourceKind = current.sourceData?.sourceType || 'manual';
    let datasetCatalog = [];
    let datasetApiReady = false;
    let datasetOwnershipMode = 'unknown';

    if (activeDatasetRef?.uuid) {
        try {
            const tokenDatasetRef = { ...activeDatasetRef };
            restoredDataset = await fetchGraphDataset(activeDatasetRef.uuid);
            if (restoredDataset?.headers && restoredDataset?.rows) {
                datasetVersionChanged = Number(restoredDataset.version) !== Number(tokenDatasetRef.version)
                    || (
                        Boolean(tokenDatasetRef.checksum)
                        && Boolean(restoredDataset.checksum)
                        && restoredDataset.checksum !== tokenDatasetRef.checksum
                    );
                activeDatasetRef = graphDatasetReference(restoredDataset);
                current = normalizeSpec({
                    ...current,
                    datasetRef: activeDatasetRef,
                    datasetMode: 'database',
                    datasetStorageVersion: GRAPH_DATASET_STORAGE_VERSION,
                    sourceRowCount: restoredDataset.rowCount,
                    sourceData: {
                        ...(current.sourceData || {}),
                        headers: restoredDataset.headers,
                        rows: restoredDataset.rows,
                        rowCount: restoredDataset.rowCount,
                        embeddedRowCount: restoredDataset.rowCount,
                        storageMode: 'database',
                        datasetId: restoredDataset.uuid,
                    },
                });
                datasetApiReady = true;
            }
        } catch (error) {
            datasetRestoreError = error?.message || 'Saved dataset restore করা যায়নি।';
            console.warn('Graph dataset restore failed.', error);
        }
    }

    const container = document.createElement('div');
    container.className = 'qmx-graph-builder';
    container.dataset.graphBuilderUxVersion = GRAPH_BUILDER_UX_VERSION;
    container.dataset.graphAxisControlVersion = GRAPH_AXIS_CONTROL_VERSION;
    container.dataset.graphDatasetStorageVersion = GRAPH_DATASET_STORAGE_VERSION;

    const leftPane = document.createElement('div');
    leftPane.className = 'qmx-graph-left-pane';

    const homePanel = document.createElement('section');
    homePanel.className = 'qmx-graph-ux-panel';
    homePanel.dataset.graphUxPanel = 'home';

    const equationPanel = document.createElement('section');
    equationPanel.className = 'qmx-graph-ux-panel';
    equationPanel.dataset.graphUxPanel = 'equation';
    equationPanel.hidden = true;

    const statisticsPanel = document.createElement('section');
    statisticsPanel.className = 'qmx-graph-ux-panel';
    statisticsPanel.dataset.graphUxPanel = 'statistics';
    statisticsPanel.hidden = true;

    const controls = document.createElement('div');
    controls.className = 'qmx-graph-controls';
    controls.hidden = true;

    const preview = document.createElement('div');
    preview.className = 'qmx-graph-builder-preview';
    const errors = document.createElement('div');
    errors.className = 'qmx-graph-errors';
    const dynamicArea = document.createElement('div');
    dynamicArea.style.display = 'contents';
    dynamicArea.dataset.qmxDynamicArea = '1';

    const template = document.createElement('select');
    TEMPLATES.forEach((item) => template.add(new Option(item.label, item.id)));

    const type = document.createElement('select');
    GraphRegistry.groups().forEach((plugins, groupName) => {
        const group = document.createElement('optgroup');
        group.label = groupName;
        plugins.forEach((plugin) => group.appendChild(new Option(plugin.label, plugin.id)));
        type.appendChild(group);
    });

    const mainInput = document.createElement('textarea');
    mainInput.rows = 7;
    const mainField = field('Input', mainInput, true);
    const help = document.createElement('p');
    help.className = 'qmx-graph-help';

    const title = input('text');
    const subtitle = input('text');
    const xLabel = input('text');
    const yLabel = input('text');
    const xMin = input('number'), xMax = input('number'), yMin = input('number'), yMax = input('number');
    [xMin, xMax, yMin, yMax].forEach((item) => { item.step = 'any'; });

    const axisMode = document.createElement('select');
    axisMode.add(new Option('Auto adjust — data/equation অনুযায়ী', 'auto'));
    axisMode.add(new Option('Manual adjust — নিজে range দিন', 'manual'));

    const autoRangePadding = input('number');
    autoRangePadding.min = '0';
    autoRangePadding.max = '0.5';
    autoRangePadding.step = '0.01';

    const color = input('color');
    const tickCount = input('number'); tickCount.min = '2'; tickCount.max = '20'; tickCount.step = '1';
    const width = input('number'); width.min = '360'; width.max = '1600'; width.step = '20';
    const height = input('number'); height.min = '240'; height.max = '1000'; height.step = '20';
    const grid = checkbox('Major grid');
    const minorGrid = checkbox('Minor grid');
    const showAxes = checkbox('Show axes');
    const showTickLabels = checkbox('Tick labels');
    const legend = checkbox('Legend');
    const aspectLock = checkbox('Equal axis scale');

    const controlsToolbar = document.createElement('div');
    controlsToolbar.className = 'qmx-graph-controls-toolbar';
    const controlsBack = graphUxButton('← গ্রাফের ধরন', 'qmx-graph-ux-back');
    const controlsToolbarRight = document.createElement('div');
    controlsToolbarRight.className = 'qmx-graph-controls-toolbar-right';
    const optionsToggle = graphUxButton('অতিরিক্ত অপশন');
    controlsToolbarRight.append(optionsToggle);
    controlsToolbar.append(controlsBack, controlsToolbarRight);

    const graphTypeSection = markEssential(section('Graph type'));
    const templateField = markEssential(field('Template', template, true));
    const typeField = markEssential(field('Graph type', type, true));
    markEssential(mainField);
    const labelsSection = markEssential(section('Labels and appearance'));
    const titleField = markEssential(field('Title', title, true));
    const subtitleField = field('Subtitle', subtitle, true);
    const xLabelField = markEssential(field('X label', xLabel));
    const yLabelField = markEssential(field('Y label', yLabel));
    const colorField = field('Primary color', color);
    const tickField = field('Major ticks', tickCount);
    markEssential(grid.wrapper);
    markEssential(showAxes.wrapper);
    markEssential(showTickLabels.wrapper);
    markEssential(legend.wrapper);
    markEssential(aspectLock.wrapper);
    const rangeSection = section('Axis adjustment and output size');

    const axisControlCard = document.createElement('div');
    axisControlCard.className = 'qmx-axis-control-card';
    axisControlCard.dataset.qmxEssential = '1';

    const axisModeField = field('Axis adjustment', axisMode, true);
    const autoPaddingField = field('Auto padding (0–0.5)', autoRangePadding);
    const xMinField = field('X minimum', xMin);
    const xMaxField = field('X maximum', xMax);
    const yMinField = field('Y minimum', yMin);
    const yMaxField = field('Y maximum', yMax);
    [xMinField, xMaxField, yMinField, yMaxField].forEach((element) => {
        element.classList.add('qmx-axis-range-field');
    });

    const axisRangeSummary = document.createElement('div');
    axisRangeSummary.className = 'qmx-axis-range-summary';

    const axisRangeActions = document.createElement('div');
    axisRangeActions.className = 'qmx-axis-range-actions';
    const fitRangeButton = graphUxButton('Fit to data');
    const resetRangeButton = graphUxButton('Reset range');
    axisRangeActions.append(fitRangeButton, resetRangeButton);

    axisControlCard.append(
        axisModeField,
        autoPaddingField,
        axisRangeSummary,
        xMinField,
        xMaxField,
        yMinField,
        yMaxField,
        axisRangeActions,
    );

    controls.append(
        controlsToolbar,
        graphTypeSection,
        templateField,
        typeField,
        mainField,
        help,
        dynamicArea,
        labelsSection,
        titleField,
        subtitleField,
        xLabelField,
        yLabelField,
        colorField,
        tickField,
        grid.wrapper, minorGrid.wrapper, showAxes.wrapper, showTickLabels.wrapper,
        legend.wrapper, aspectLock.wrapper,
        rangeSection,
        axisControlCard,
        field('SVG width', width), field('SVG height', height),
    );

    const actions = document.createElement('div');
    actions.className = 'qmx-graph-actions';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'qmx-graph-action';
    resetButton.textContent = 'Reset graph type';
    actions.append(resetButton);
    controls.append(actions, errors);
    leftPane.append(homePanel, equationPanel, statisticsPanel, controls);
    container.append(leftPane, preview);

    let dynamicDefinitions = [];
    let dynamicControls = new Map();
    let dynamicWrappers = new Map();

    const updateDynamicFields = () => {
        dynamicArea.replaceChildren();
        dynamicControls = new Map();
        dynamicWrappers = new Map();
        const plugin = pluginFor(current.type);
        dynamicDefinitions = plugin.editor?.fields || [];
        if (dynamicDefinitions.length) dynamicArea.appendChild(section('Type-specific settings'));
        dynamicDefinitions.forEach((definition) => {
            const control = makeDynamicControl(definition, getPath(current, definition.key));
            dynamicControls.set(definition.key, control);
            if (definition.type === 'checkbox') {
                const wrap = document.createElement('label');
                wrap.className = 'qmx-graph-checkbox';
                const text = document.createElement('span');
                text.textContent = definition.label;
                wrap.append(control, text);
                dynamicWrappers.set(definition.key, wrap);
                dynamicArea.appendChild(wrap);
            } else {
                const wrap = field(definition.label, control, definition.wide === true || definition.type === 'text');
                dynamicWrappers.set(definition.key, wrap);
                dynamicArea.appendChild(wrap);
            }
        });
    };

    const setRangeFieldState = (wrapper, control, disabled) => {
        if (!wrapper || !control) return;
        control.disabled = disabled;
        wrapper.classList.toggle('is-disabled', disabled);
        wrapper.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    };

    const updateAxisControls = ({ refreshValues = true } = {}) => {
        const automatic = current.axisMode === 'auto';
        if (automatic) {
            current = normalizeSpec(resolveGraphAxisRange(current));
        }

        axisMode.value = automatic ? 'auto' : 'manual';
        autoRangePadding.value = Number.isFinite(Number(current.autoRangePadding))
            ? Number(current.autoRangePadding)
            : 0.12;
        axisControlCard.classList.toggle('is-manual', !automatic);

        if (refreshValues) {
            xMin.value = current.xMin;
            xMax.value = current.xMax;
            yMin.value = current.yMin;
            yMax.value = current.yMax;
        }

        [xMinField, xMaxField, yMinField, yMaxField].forEach((wrapper, index) => {
            setRangeFieldState(wrapper, [xMin, xMax, yMin, yMax][index], automatic);
        });

        ['zMin', 'zMax'].forEach((key) => {
            const control = dynamicControls.get(key);
            const wrapper = dynamicWrappers.get(key);
            if (control && refreshValues && Number.isFinite(Number(current[key]))) {
                control.value = current[key];
            }
            setRangeFieldState(wrapper, control, automatic);
        });

        const autoZControl = dynamicControls.get('autoZRange');
        const autoZWrapper = dynamicWrappers.get('autoZRange');
        if (autoZControl) {
            autoZControl.checked = automatic;
            autoZControl.disabled = true;
        }
        if (autoZWrapper) autoZWrapper.hidden = true;

        axisRangeSummary.textContent = `${automatic ? 'Auto adjust' : 'Manual adjust'} • ${graphAxisSummary(current)}`;
    };

    const syncControlsFromCurrent = () => {
        const plugin = pluginFor(current.type);
        type.value = current.type;
        title.value = current.title || '';
        subtitle.value = current.subtitle || '';
        xLabel.value = current.xLabel || '';
        yLabel.value = current.yLabel || '';
        axisMode.value = current.axisMode === 'auto' ? 'auto' : 'manual';
        autoRangePadding.value = Number.isFinite(Number(current.autoRangePadding))
            ? Number(current.autoRangePadding)
            : 0.12;
        xMin.value = current.xMin;
        xMax.value = current.xMax;
        yMin.value = current.yMin;
        yMax.value = current.yMax;
        color.value = current.color;
        tickCount.value = current.tickCount;
        width.value = current.width;
        height.value = current.height;
        grid.control.checked = current.grid;
        minorGrid.control.checked = current.minorGrid;
        showAxes.control.checked = current.showAxes;
        showTickLabels.control.checked = current.showTickLabels;
        legend.control.checked = current.legend;
        aspectLock.control.checked = current.aspectLock;
        mainInput.value = typeof plugin.formatInput === 'function'
            ? plugin.formatInput(current)
            : (current.expression || '');
        mainInput.placeholder = plugin.editor?.placeholder || '';
        mainInput.rows = current.type === 'composite' ? 13 : (['piecewise', 'region', 'calculus', 'implicit', 'geometry', 'space3d'].includes(current.type) ? 13 : 7);
        mainField.firstElementChild.textContent = plugin.editor?.inputLabel || 'Input';
        mainField.hidden = plugin.editor?.mode === 'none';
        help.textContent = plugin.description || '';
        updateDynamicFields();
        updateAxisControls();
    };

    const readCurrent = () => {
        const selectedType = explicitTypeLock || type.value;
        if (type.value !== selectedType) type.value = selectedType;
        const plugin = pluginFor(selectedType);
        const parsed = typeof plugin.parseInput === 'function' ? plugin.parseInput(mainInput.value) : {};
        const raw = {
            ...current,
            ...parsed,
            type: selectedType,
            title: title.value,
            subtitle: subtitle.value,
            xLabel: xLabel.value,
            yLabel: yLabel.value,
            xMin: xMin.value,
            xMax: xMax.value,
            yMin: yMin.value,
            yMax: yMax.value,
            axisMode: axisMode.value === 'auto' ? 'auto' : 'manual',
            autoRangePadding: autoRangePadding.value,
            autoZRange: axisMode.value === 'auto',
            color: color.value,
            tickCount: tickCount.value,
            width: width.value,
            height: height.value,
            grid: grid.control.checked,
            minorGrid: minorGrid.control.checked,
            showAxes: showAxes.control.checked,
            showTickLabels: showTickLabels.control.checked,
            legend: legend.control.checked,
            aspectLock: aspectLock.control.checked,
        };
        dynamicDefinitions.forEach((definition) => {
            const control = dynamicControls.get(definition.key);
            if (control) setPath(raw, definition.key, dynamicValue(control, definition));
        });
        current = normalizeSpec(raw);
        if (current.axisMode === 'auto') {
            current = normalizeSpec(resolveGraphAxisRange(current));
        }

        // Recover when an older cached module left the parsed curve array empty.
        if (
            type.value === 'calculus'
            && (!Array.isArray(current.curves) || current.curves.length === 0)
            && /(^|\n)\s*curve\s*[|｜∣│¦ǀ]/i.test(mainInput.value)
            && typeof plugin.parseInput === 'function'
        ) {
            const recovered = plugin.parseInput(mainInput.value);
            current = normalizeSpec({
                ...raw,
                ...recovered,
                type: 'calculus',
                expression: mainInput.value,
            });
            if (current.axisMode === 'auto') {
                current = normalizeSpec(resolveGraphAxisRange(current));
            }
        }

        return current;
    };

    const switchToSpace3dFromInput = () => {
        if (type.value === 'space3d' || !looksLikeSpace3dDsl(mainInput.value)) return false;
        const preserved = commonOnly({
            ...current,
            title: title.value,
            subtitle: subtitle.value,
            xLabel: xLabel.value,
            yLabel: yLabel.value,
            xMin: xMin.value,
            xMax: xMax.value,
            yMin: yMin.value,
            yMax: yMax.value,
            color: color.value,
            tickCount: tickCount.value,
            width: width.value,
            height: height.value,
            grid: grid.control.checked,
            minorGrid: minorGrid.control.checked,
            showAxes: showAxes.control.checked,
            showTickLabels: showTickLabels.control.checked,
            legend: legend.control.checked,
            aspectLock: aspectLock.control.checked,
        });
        const source = mainInput.value;
        explicitTypeLock = 'space3d';
        current = normalizeSpec({
            ...preserved,
            type: 'space3d',
            expression: source,
            aspectLock: false,
        });
        type.value = 'space3d';
        syncControlsFromCurrent();
        errors.textContent = '3D scene syntax detected.';
        return true;
    };

    const switchToGeometryFromInput = () => {
        if (type.value === 'geometry' || !looksLikeGeometryDsl(mainInput.value)) return false;
        const preserved = commonOnly({
            ...current,
            title: title.value,
            subtitle: subtitle.value,
            xLabel: xLabel.value,
            yLabel: yLabel.value,
            xMin: xMin.value,
            xMax: xMax.value,
            yMin: yMin.value,
            yMax: yMax.value,
            color: color.value,
            tickCount: tickCount.value,
            width: width.value,
            height: height.value,
            grid: grid.control.checked,
            minorGrid: minorGrid.control.checked,
            showAxes: showAxes.control.checked,
            showTickLabels: showTickLabels.control.checked,
            legend: legend.control.checked,
            aspectLock: aspectLock.control.checked,
        });
        const source = mainInput.value;
        explicitTypeLock = 'geometry';
        current = normalizeSpec({
            ...preserved,
            type: 'geometry',
            expression: source,
            aspectLock: true,
        });
        type.value = 'geometry';
        syncControlsFromCurrent();
        errors.textContent = 'Interactive geometry syntax detected.';
        return true;
    };

    const switchToImplicitFromInput = () => {
        if (type.value === 'implicit' || !looksLikeImplicitDsl(mainInput.value)) return false;
        const preserved = commonOnly({
            ...current,
            title: title.value,
            subtitle: subtitle.value,
            xLabel: xLabel.value,
            yLabel: yLabel.value,
            xMin: xMin.value,
            xMax: xMax.value,
            yMin: yMin.value,
            yMax: yMax.value,
            color: color.value,
            tickCount: tickCount.value,
            width: width.value,
            height: height.value,
            grid: grid.control.checked,
            minorGrid: minorGrid.control.checked,
            showAxes: showAxes.control.checked,
            showTickLabels: showTickLabels.control.checked,
            legend: legend.control.checked,
            aspectLock: aspectLock.control.checked,
        });
        const source = mainInput.value;
        current = normalizeSpec({ ...preserved, type: 'implicit', expression: source });
        type.value = 'implicit';
        syncControlsFromCurrent();
        errors.textContent = 'Implicit / multivariable command syntax detected.';
        return true;
    };

    const switchToCalculusFromInput = () => {
        if (type.value === 'calculus' || !looksLikeCalculusDsl(mainInput.value)) return false;
        const preserved = commonOnly({
            ...current,
            title: title.value,
            subtitle: subtitle.value,
            xLabel: xLabel.value,
            yLabel: yLabel.value,
            xMin: xMin.value,
            xMax: xMax.value,
            yMin: yMin.value,
            yMax: yMax.value,
            color: color.value,
            tickCount: tickCount.value,
            width: width.value,
            height: height.value,
            grid: grid.control.checked,
            minorGrid: minorGrid.control.checked,
            showAxes: showAxes.control.checked,
            showTickLabels: showTickLabels.control.checked,
            legend: legend.control.checked,
            aspectLock: aspectLock.control.checked,
        });
        const source = mainInput.value;
        current = normalizeSpec({ ...preserved, type: 'calculus', expression: source });
        type.value = 'calculus';
        syncControlsFromCurrent();
        errors.textContent = 'Calculus command syntax detected. Graph type automatically changed to Calculus Tools.';
        return true;
    };

    const switchToRegionFromInput = () => {
        if (type.value === 'region' || !looksLikeRegionDsl(mainInput.value)) return false;
        const preserved = commonOnly({
            ...current,
            title: title.value,
            subtitle: subtitle.value,
            xLabel: xLabel.value,
            yLabel: yLabel.value,
            xMin: xMin.value,
            xMax: xMax.value,
            yMin: yMin.value,
            yMax: yMax.value,
            color: color.value,
            tickCount: tickCount.value,
            width: width.value,
            height: height.value,
            grid: grid.control.checked,
            minorGrid: minorGrid.control.checked,
            showAxes: showAxes.control.checked,
            showTickLabels: showTickLabels.control.checked,
            legend: legend.control.checked,
            aspectLock: aspectLock.control.checked,
        });
        const source = mainInput.value;
        current = normalizeSpec({ ...preserved, type: 'region', expression: source });
        type.value = 'region';
        syncControlsFromCurrent();
        errors.textContent = 'Inequality syntax detected. Graph type automatically changed to Region / Inequality Shading.';
        return true;
    };

    const switchToPiecewiseFromInput = () => {
        if (type.value === 'piecewise' || !looksLikePiecewiseDsl(mainInput.value)) return false;
        const preserved = commonOnly({
            ...current,
            title: title.value,
            subtitle: subtitle.value,
            xLabel: xLabel.value,
            yLabel: yLabel.value,
            xMin: xMin.value,
            xMax: xMax.value,
            yMin: yMin.value,
            yMax: yMax.value,
            color: color.value,
            tickCount: tickCount.value,
            width: width.value,
            height: height.value,
            grid: grid.control.checked,
            minorGrid: minorGrid.control.checked,
            showAxes: showAxes.control.checked,
            showTickLabels: showTickLabels.control.checked,
            legend: legend.control.checked,
            aspectLock: aspectLock.control.checked,
        });
        const source = mainInput.value;
        current = normalizeSpec({ ...preserved, type: 'piecewise', expression: source });
        type.value = 'piecewise';
        syncControlsFromCurrent();
        errors.textContent = 'Piecewise/domain syntax detected. Graph type automatically changed to Piecewise / Domain Restricted.';
        return true;
    };

    const switchToCompositeFromInput = () => {
        if (
            explicitTypeLock === 'space3d'
            || type.value === 'space3d'
            || looksLikeSpace3dDsl(mainInput.value)
            || explicitTypeLock === 'geometry'
            || type.value === 'geometry'
            || looksLikeGeometryDsl(mainInput.value)
            || type.value === 'composite'
            || !looksLikeCompositeDsl(mainInput.value)
        ) return false;

        const preserved = commonOnly({
            ...current,
            title: title.value,
            subtitle: subtitle.value,
            xLabel: xLabel.value,
            yLabel: yLabel.value,
            xMin: xMin.value,
            xMax: xMax.value,
            yMin: yMin.value,
            yMax: yMax.value,
            color: color.value,
            tickCount: tickCount.value,
            width: width.value,
            height: height.value,
            grid: grid.control.checked,
            minorGrid: minorGrid.control.checked,
            showAxes: showAxes.control.checked,
            showTickLabels: showTickLabels.control.checked,
            legend: legend.control.checked,
            aspectLock: aspectLock.control.checked,
        });

        const source = mainInput.value;
        current = normalizeSpec({ ...preserved, type: 'composite', expression: source });
        type.value = 'composite';
        syncControlsFromCurrent();
        errors.textContent = 'Composite syntax detected. Graph type automatically changed to Composite / Multi-Shape.';
        return true;
    };

    let refreshTimer = null;

    const renderPreview = () => {
        preview.innerHTML = graphSvg(current);
        const activePlugin = pluginFor(current.type);
        if (typeof activePlugin.bindPreview === 'function') {
            activePlugin.bindPreview({
                preview,
                spec: current,
                updateSpec: (nextSpec) => {
                    current = normalizeSpec(nextSpec);
                    const plugin = pluginFor(current.type);
                    mainInput.value = typeof plugin.formatInput === 'function'
                        ? plugin.formatInput(current)
                        : (current.expression || '');
                    const validationErrors = validateGraphSpec(current);
                    errors.textContent = validationErrors.join(' ');
                    renderPreview();
                },
            });
        }
    };

    const refresh = (immediate = false) => {
        window.clearTimeout(refreshTimer);
        const render = () => {
            readCurrent();
            const validationErrors = validateGraphSpec(current);
            errors.textContent = validationErrors.join(' ');
            renderPreview();
        };
        if (immediate) render();
        else refreshTimer = window.setTimeout(render, 80);
    };

    const pageTables = collectPageDataTables();
    const pageEquationSuggestions = allPageEquationSuggestions
        .filter((item) => item.recognition?.equation !== initialRecognition?.equation)
        .slice(0, 6);

    const updateControlsMode = () => {
        controls.classList.toggle('qmx-essential-only', !controlsExtraOpen);
        optionsToggle.textContent = controlsExtraOpen ? 'প্রয়োজনীয় অপশন' : 'অতিরিক্ত অপশন';
    };

    const applySpec = (spec, { lock = true, sync = true } = {}) => {
        const preservedId = current?.id;
        current = normalizeSpec({
            ...spec,
            ...(preservedId ? { id: preservedId } : {}),
        });
        if (current.axisMode === 'auto') {
            current = normalizeSpec(resolveGraphAxisRange(current));
        }
        explicitTypeLock = lock ? current.type : null;
        if (sync) syncControlsFromCurrent();
        const validationErrors = validateGraphSpec(current);
        errors.textContent = validationErrors.join(' ');
        renderPreview();
    };

    const showHomePreview = () => {
        preview.innerHTML = `
            <div style="max-width:430px;padding:28px;text-align:center;color:#475569">
                <div style="font-size:42px;line-height:1">▥</div>
                <h3 style="margin:10px 0 6px;color:#0f172a;font-size:18px">গ্রাফ তৈরির পদ্ধতি নির্বাচন করুন</h3>
                <p style="margin:0;font-size:12px;line-height:1.55">সমীকরণ, প্রশ্নের নির্দেশ, data table অথবা প্রয়োজনীয় graph family নির্বাচন করলে preview এখানে দেখা যাবে।</p>
            </div>
        `;
    };

    const showMode = (mode, { render = true } = {}) => {
        activeMode = mode;
        homePanel.hidden = mode !== 'home';
        equationPanel.hidden = mode !== 'equation';
        statisticsPanel.hidden = mode !== 'statistics';
        controls.hidden = mode !== 'controls';

        if (mode === 'home') {
            showHomePreview();
            return;
        }
        if (mode === 'controls') updateControlsMode();
        if (render) renderPreview();
    };

    const renderHomePanel = () => {
        homePanel.replaceChildren();
        homePanel.appendChild(graphUxHeader(
            'কী থেকে গ্রাফ তৈরি করবেন?',
            'বইয়ে ছাপা সমীকরণ, বাংলা নির্দেশ, data table এবং mathematical intent হুবহু ব্যবহার করুন।',
        ));

        if (initialRecognition.recognized) {
            const sourceCard = document.createElement('div');
            sourceCard.className = 'qmx-graph-source-card';
            const featureHtml = (initialRecognition.features || [])
                .map((item) => `<span class="qmx-graph-source-feature">${escapeGraphUxHtml(item)}</span>`)
                .join('');
            sourceCard.innerHTML = `
                <strong>নির্বাচিত লেখা থেকে ${escapeGraphUxHtml(initialRecognition.familyLabel)} শনাক্ত হয়েছে</strong>
                <div class="qmx-graph-source-equation">${escapeGraphUxHtml(initialRecognition.equation)}</div>
                <div class="qmx-graph-source-features">${featureHtml}</div>
            `;
            const create = graphUxButton('এই লেখা থেকে গ্রাফ তৈরি করুন', 'qmx-graph-primary-action');
            create.addEventListener('click', () => {
                equationSource.value = initialRecognition.source || initialSource || initialRecognition.equation;
                updateEquationRecognition(true);
                showMode('equation');
            });
            sourceCard.appendChild(create);
            homePanel.appendChild(sourceCard);
        }

        const categoryGrid = document.createElement('div');
        categoryGrid.className = 'qmx-graph-category-grid';
        [
            ['equation', 'ƒ', 'বইয়ের অঙ্ক বা সূত্র', 'printed notation, বাংলা নির্দেশ, অসমতা, Argand, কনিক ও vector'],
            ['statistics', '▥', 'Data ও পরিসংখ্যান', 'প্রশ্নের table, paste data, histogram, ogive ও chart'],
            ['geometry', '△', 'স্থানাঙ্ক ও জ্যামিতি', 'বিন্দু, রেখা, বহুভুজ ও construction'],
            ['calculus', '∫', 'ক্যালকুলাস ও বিশ্লেষণ', 'tangent, normal, extrema, area ও region'],
            ['scientific', '⌁', 'বৈজ্ঞানিক data graph', 'measurement, motion, rate ও calibration data'],
            ['space3d', '3D', '3D ও বহুচলক', 'surface, plane, space curve ও vector'],
            ['all', '⋯', 'সব graph type', 'বর্তমান পূর্ণ Graph Platform ও সব rendering option'],
        ].forEach(([id, icon, titleText, description]) => {
            categoryGrid.appendChild(graphUxCategory(id, icon, titleText, description));
        });
        homePanel.appendChild(categoryGrid);

        if (pageEquationSuggestions.length) {
            const suggestionWrap = document.createElement('div');
            suggestionWrap.className = 'qmx-graph-suggestions';
            const label = document.createElement('strong');
            label.textContent = 'প্রশ্ন, উত্তর বা ব্যাখ্যায় পাওয়া সমীকরণ';
            label.style.cssText = 'color:#334155;font-size:12px';
            suggestionWrap.appendChild(label);
            pageEquationSuggestions.forEach((item) => {
                const row = document.createElement('div');
                row.className = 'qmx-graph-suggestion';
                const copy = document.createElement('span');
                copy.textContent = `${item.sourceLabel}: ${item.recognition.equation}`;
                const use = graphUxButton('ব্যবহার করুন');
                use.addEventListener('click', () => {
                    equationSource.value = item.recognition.source || item.recognition.equation;
                    updateEquationRecognition(true);
                    showMode('equation');
                });
                row.append(copy, use);
                suggestionWrap.appendChild(row);
            });
            homePanel.appendChild(suggestionWrap);
        }
    };

    const equationBack = graphUxButton('← ফিরে যান', 'qmx-graph-ux-back');
    const equationSource = document.createElement('textarea');
    equationSource.className = 'qmx-universal-equation-input';
    equationSource.rows = 7;
    equationSource.placeholder = [
        '3x − 4y − 12 = 0 সরলরেখাটি x ও y অক্ষকে যথাক্রমে A ও B বিন্দুতে ছেদ করে',
        'S ≡ x² + y² + 4x − 6y − 12 = 0',
        'x²/25 + y²/9 = 1',
        'y = sin⁻¹x',
        '2x − y ≤ 4 এবং x + y ≥ 2',
        'z = 3 + 2i',
        'a⃗ = 2î + 3ĵ − 4k̂',
    ].join('\n');

    const equationDetection = document.createElement('div');
    equationDetection.className = 'qmx-equation-detection';
    const equationOptions = graphUxButton('গ্রাফের অতিরিক্ত অপশন');
    const equationNew = graphUxButton('অন্য ধরনের গ্রাফ');
    const equationActions = document.createElement('div');
    equationActions.className = 'qmx-graph-ux-actions';
    equationActions.append(equationOptions, equationNew);

    equationPanel.append(
        graphUxHeader(
            'সমীকরণ ও নির্দেশ থেকে গ্রাফ',
            'বই, প্রশ্ন বা গবেষণাপত্রে যেভাবে ছাপা আছে সেভাবেই লিখুন। মূল input অপরিবর্তিত সংরক্ষিত থাকবে।',
            equationBack,
        ),
        field('সমীকরণ, সূত্র অথবা সম্পূর্ণ নির্দেশ', equationSource, true),
        equationDetection,
        equationActions,
    );

    let equationTimer = null;
    const updateEquationDetectionCopy = () => {
        equationDetection.classList.remove('is-success', 'is-error');
        if (!equationRecognition?.recognized) {
            equationDetection.classList.add('is-error');
            equationDetection.textContent = equationRecognition?.message || 'সমীকরণ শনাক্ত হয়নি।';
            return;
        }

        equationDetection.classList.add('is-success');
        const features = equationRecognition.features?.length
            ? `\n${equationRecognition.features.join(' • ')}`
            : '';
        equationDetection.textContent = [
            `শনাক্ত হয়েছে: ${equationRecognition.familyLabel}`,
            equationRecognition.equation,
            features.trim(),
            `Textbook Input Engine v${TEXTBOOK_INPUT_ENGINE_VERSION} • মূল লেখা অপরিবর্তিত থাকবে`,
        ].filter(Boolean).join('\n');
    };

    const updateEquationRecognition = (immediate = false) => {
        window.clearTimeout(equationTimer);
        const run = () => {
            equationRecognition = recognizeUniversalGraph(equationSource.value);
            updateEquationDetectionCopy();
            if (equationRecognition.recognized) {
                applySpec({
                    ...equationRecognition.spec,
                    sourceText: equationSource.value.slice(0, 12000),
                    originalTextbookInput: equationSource.value.slice(0, 12000),
                }, { lock: true, sync: false });
            } else {
                preview.innerHTML = `
                    <div style="max-width:430px;padding:28px;text-align:center;color:#64748b">
                        <strong style="display:block;color:#0f172a;margin-bottom:7px">Preview অপেক্ষমাণ</strong>
                        সমীকরণ নিশ্চিতভাবে শনাক্ত হলে graph preview দেখা যাবে।
                    </div>
                `;
            }
        };
        if (immediate) run();
        else equationTimer = window.setTimeout(run, 100);
    };

    equationSource.addEventListener('input', () => updateEquationRecognition(false));
    equationBack.addEventListener('click', () => showMode('home'));
    equationNew.addEventListener('click', () => showMode('home'));
    equationOptions.addEventListener('click', () => {
        if (!equationRecognition?.recognized) return;
        controlsExtraOpen = false;
        syncControlsFromCurrent();
        showMode('controls');
    });

    const statBack = graphUxButton('← ফিরে যান', 'qmx-graph-ux-back');
    const statSourceSelect = document.createElement('select');
    statSourceSelect.add(new Option('নতুন data লিখুন বা paste করুন', 'manual'));
    pageTables.forEach((item, index) => {
        statSourceSelect.add(new Option(
            `${item.sourceLabel} — Table ${item.tableIndex + 1} (${item.model.body.length} rows × ${item.model.headers.length} columns)`,
            `page:${index}`,
        ));
    });

    const statDataInput = document.createElement('textarea');
    statDataInput.className = 'qmx-stat-data-input';
    statDataInput.rows = 10;
    statDataInput.placeholder = [
        'Class\tSection A\tSection B\tError',
        '1\t12\t15\t0.8',
        '2\t18\t17\t1.1',
        '3\t9\t14\t0.6',
        '',
        'Excel, Word, CSV/TSV অথবা webpage table paste করা যাবে। সর্বোচ্চ 50,000 row parse হবে; full source Dataset Storage-এ রাখা যাবে।',
    ].join('\n');

    const statChart = document.createElement('select');
    [
        ['bar', 'Bar chart — single series'],
        ['grouped-bar', 'Grouped bar — multiple series'],
        ['stacked-bar', 'Stacked bar — multiple series'],
        ['line', 'Line chart — single series'],
        ['multi-line', 'Multi-series line chart'],
        ['scatter', 'Scatter plot — basic'],
        ['scientific-scatter', 'Scientific scatter — regression/correlation'],
        ['error-bar', 'Error-bar plot — uncertainty'],
        ['histogram', 'Histogram'],
        ['frequency-polygon', 'Frequency polygon'],
        ['ogive', 'Ogive'],
        ['pie', 'Pie chart'],
        ['box', 'Box plot'],
        ['dot', 'Dot plot'],
    ].forEach(([value, label]) => statChart.add(new Option(label, value)));

    const statCategory = document.createElement('select');
    const statValue = document.createElement('select');
    statValue.multiple = true;
    statValue.size = 5;
    statValue.className = 'qmx-stat-multi-select';

    const statErrorColumn = document.createElement('select');
    statErrorColumn.add(new Option('কোনো error column নয়', '-1'));

    const statFrequencyMode = document.createElement('select');
    statFrequencyMode.add(new Option('Raw value / frequency', 'raw'));
    statFrequencyMode.add(new Option('Relative frequency', 'relative'));
    statFrequencyMode.add(new Option('Percentage frequency', 'percent'));

    const statOgiveDirection = document.createElement('select');
    statOgiveDirection.add(new Option('Less-than ogive', 'less-than'));
    statOgiveDirection.add(new Option('More-than ogive', 'more-than'));

    const statSortMode = document.createElement('select');
    statSortMode.add(new Option('Source order', 'source'));
    statSortMode.add(new Option('Ascending X/category', 'ascending'));
    statSortMode.add(new Option('Descending X/category', 'descending'));

    const statRegression = input('checkbox');
    statRegression.checked = false;
    const statShowRegressionEquation = input('checkbox');
    statShowRegressionEquation.checked = true;
    const statShowCorrelation = input('checkbox');
    statShowCorrelation.checked = true;

    const statErrorMode = document.createElement('select');
    statErrorMode.add(new Option('No error bars', 'none'));
    statErrorMode.add(new Option('Use error column', 'column'));
    statErrorMode.add(new Option('Use constant ± error', 'constant'));

    const statConstantError = input('number');
    statConstantError.min = '0';
    statConstantError.step = 'any';
    statConstantError.value = '0';

    const statFileInput = document.createElement('input');
    statFileInput.type = 'file';
    statFileInput.accept = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain';
    statFileInput.hidden = true;
    const statTitle = input('text');
    statTitle.placeholder = 'Graph title';
    const statXLabel = input('text');
    const statYLabel = input('text');

    const statAxisMode = document.createElement('select');
    statAxisMode.add(new Option('Auto adjust — data অনুযায়ী', 'auto'));
    statAxisMode.add(new Option('Manual adjust — নিজে range দিন', 'manual'));

    const statXMin = input('number');
    const statXMax = input('number');
    const statYMin = input('number');
    const statYMax = input('number');
    [statXMin, statXMax, statYMin, statYMax].forEach((control) => {
        control.step = 'any';
    });

    const statPreview = document.createElement('div');
    statPreview.className = 'qmx-stat-table-preview';
    const statSummary = document.createElement('div');
    statSummary.className = 'qmx-stat-summary';
    const statDatasetWarning = document.createElement('div');
    statDatasetWarning.className = 'qmx-stat-warning';
    statDatasetWarning.hidden = true;

    const statPersistDataset = input('checkbox');
    statPersistDataset.checked = true;
    const statPersistWrap = document.createElement('label');
    statPersistWrap.className = 'qmx-graph-checkbox';
    statPersistWrap.append(
        statPersistDataset,
        document.createTextNode('পূর্ণ source data Dataset Storage-এ সংরক্ষণ করুন'),
    );

    const statDatasetName = input('text');
    statDatasetName.placeholder = 'Dataset name';
    statDatasetName.value = activeDatasetRef?.name || current.title || 'Graph dataset';

    const statSavedDataset = document.createElement('select');
    statSavedDataset.add(new Option('Saved dataset নির্বাচন করুন', ''));

    const statRefreshDatasets = graphUxButton('Refresh list');
    const statLoadDataset = graphUxButton('Load selected');
    const statSaveAsNewDataset = graphUxButton('Save as new copy');
    const statDeleteDataset = graphUxButton('Delete unused');
    const statDatasetStatus = document.createElement('div');
    statDatasetStatus.className = 'qmx-dataset-status';
    statDatasetStatus.textContent = datasetRestoreError
        ? datasetRestoreError
        : activeDatasetRef?.uuid
            ? `Dataset reference: ${activeDatasetRef.name || activeDatasetRef.uuid}`
            : 'Dataset Storage availability পরীক্ষা করা হচ্ছে…';

    const statDatasetStorageCard = document.createElement('div');
    statDatasetStorageCard.className = 'qmx-dataset-storage-card';
    const statDatasetActions = document.createElement('div');
    statDatasetActions.className = 'qmx-dataset-storage-actions';
    statDatasetActions.append(
        statRefreshDatasets,
        statLoadDataset,
        statSaveAsNewDataset,
        statDeleteDataset,
    );
    statDatasetStorageCard.append(
        statPersistWrap,
        field('Dataset name', statDatasetName),
        field('Existing saved dataset', statSavedDataset, true),
        statDatasetActions,
        statDatasetStatus,
    );

    const statOptions = graphUxButton('গ্রাফের অতিরিক্ত অপশন');
    const statImportFile = graphUxButton('CSV/TSV file নির্বাচন');
    const statFileName = document.createElement('span');
    statFileName.className = 'qmx-stat-file-name';
    statFileName.textContent = 'কোনো file নির্বাচন করা হয়নি';
    const statFileRow = document.createElement('div');
    statFileRow.className = 'qmx-stat-file-row';
    statFileRow.append(statImportFile, statFileName, statFileInput);

    const statActions = document.createElement('div');
    statActions.className = 'qmx-graph-ux-actions';
    statActions.append(statOptions);

    const statGrid = document.createElement('div');
    statGrid.className = 'qmx-stat-grid';
    statGrid.append(
        field('Data source', statSourceSelect, true),
        field('Chart type', statChart),
        field('Category / X / interval column', statCategory),
        field('Value / Y / frequency columns — Ctrl/Shift দিয়ে একাধিক নির্বাচন', statValue, true),
        field('Title', statTitle, true),
        field('X-axis label', statXLabel),
        field('Y-axis label', statYLabel),
    );

    const statAnalysisCard = document.createElement('div');
    statAnalysisCard.className = 'qmx-stat-analysis-card';

    const statRegressionWrap = document.createElement('label');
    statRegressionWrap.className = 'qmx-graph-checkbox';
    statRegressionWrap.append(statRegression, document.createTextNode('Linear regression'));

    const statRegressionEquationWrap = document.createElement('label');
    statRegressionEquationWrap.className = 'qmx-graph-checkbox';
    statRegressionEquationWrap.append(
        statShowRegressionEquation,
        document.createTextNode('Show regression equation'),
    );

    const statCorrelationWrap = document.createElement('label');
    statCorrelationWrap.className = 'qmx-graph-checkbox';
    statCorrelationWrap.append(
        statShowCorrelation,
        document.createTextNode('Show r and R²'),
    );

    const statErrorModeField = field('Error-bar source', statErrorMode);
    const statErrorColumnField = field('Error / uncertainty column', statErrorColumn);
    const statConstantErrorField = field('Constant ± error', statConstantError);
    const statFrequencyModeField = field('Frequency/value mode', statFrequencyMode);
    const statOgiveDirectionField = field('Ogive direction', statOgiveDirection);
    const statSortModeField = field('X/category order', statSortMode);

    statAnalysisCard.append(
        statRegressionWrap,
        statRegressionEquationWrap,
        statCorrelationWrap,
        statErrorModeField,
        statErrorColumnField,
        statConstantErrorField,
        statFrequencyModeField,
        statOgiveDirectionField,
        statSortModeField,
    );

    const statAxisCard = document.createElement('div');
    statAxisCard.className = 'qmx-stat-axis-card';
    const statAxisModeField = field('Axis adjustment', statAxisMode, true);
    const statXMinField = field('X minimum', statXMin);
    const statXMaxField = field('X maximum', statXMax);
    const statYMinField = field('Y minimum', statYMin);
    const statYMaxField = field('Y maximum', statYMax);
    [statXMinField, statXMaxField, statYMinField, statYMaxField].forEach((wrapper) => {
        wrapper.classList.add('qmx-axis-range-field');
    });
    const statAxisSummary = document.createElement('div');
    statAxisSummary.className = 'qmx-axis-range-summary';
    const statAxisActions = document.createElement('div');
    statAxisActions.className = 'qmx-axis-range-actions';
    const statFitRange = graphUxButton('Fit to data');
    const statResetRange = graphUxButton('Reset range');
    statAxisActions.append(statFitRange, statResetRange);
    statAxisCard.append(
        statAxisModeField,
        statAxisSummary,
        statXMinField,
        statXMaxField,
        statYMinField,
        statYMaxField,
        statAxisActions,
    );

    statisticsPanel.append(
        graphUxHeader(
            'Data ও পরিসংখ্যান',
            'প্রশ্ন, উত্তর বা ব্যাখ্যার table ব্যবহার করুন—অথবা বড় data table সরাসরি paste করুন।',
            statBack,
        ),
        statGrid,
        statFileRow,
        statDatasetStorageCard,
        statAnalysisCard,
        statAxisCard,
        field('Editable data table (tab, comma, semicolon, pipe অথবা multiple-space)', statDataInput, true),
        statSummary,
        statDatasetWarning,
        statPreview,
        statActions,
    );

    let statTimer = null;
    let statChartTouched = false;
    let statColumnSignature = '';

    const setDatasetStatus = (message, state = '') => {
        statDatasetStatus.textContent = String(message || '');
        statDatasetStatus.classList.toggle('is-ready', state === 'ready');
        statDatasetStatus.classList.toggle('is-warning', state === 'warning');
        statDatasetStatus.classList.toggle('is-error', state === 'error');
    };

    const datasetOptionLabel = (dataset) => {
        const state = dataset.inUse ? 'attached' : 'unused';
        return `${dataset.name} — ${Number(dataset.rowCount).toLocaleString()} rows × ${dataset.columnCount} columns — ${state}`;
    };

    const populateDatasetCatalog = (datasets) => {
        datasetCatalog = Array.isArray(datasets) ? datasets : [];
        const selectedUuid = activeDatasetRef?.uuid || statSavedDataset.value;
        statSavedDataset.replaceChildren(new Option('Saved dataset নির্বাচন করুন', ''));
        datasetCatalog.forEach((dataset) => {
            statSavedDataset.add(new Option(datasetOptionLabel(dataset), dataset.uuid));
        });
        if (selectedUuid && datasetCatalog.some((dataset) => dataset.uuid === selectedUuid)) {
            statSavedDataset.value = selectedUuid;
        }
    };

    const refreshDatasetCatalog = async ({ force = false, quiet = false } = {}) => {
        try {
            if (!quiet) setDatasetStatus('Dataset Storage-এর saved dataset list লোড হচ্ছে…');
            const capabilities = await graphDatasetCapabilities({ force });
            datasetApiReady = true;
            datasetOwnershipMode = capabilities?.ownership?.mode || 'unknown';
            populateDatasetCatalog(await listGraphDatasets({ limit: 60, force }));

            const ownershipLabel = datasetOwnershipMode === 'guest_browser'
                ? 'Guest browser storage'
                : datasetOwnershipMode === 'authenticated_user'
                    ? 'User dataset storage'
                    : 'Dataset Storage';
            const suffix = datasetCatalog.length
                ? `${datasetCatalog.length}টি saved dataset পাওয়া গেছে।`
                : 'এখনো কোনো saved dataset নেই।';
            setDatasetStatus(
                activeDatasetRef?.uuid
                    ? `${activeDatasetRef.name || 'Dataset'} • ${activeDatasetRef.rowCount.toLocaleString()} rows • version ${activeDatasetRef.version} • ${ownershipLabel} • ${suffix}`
                    : `${ownershipLabel} ready • ${suffix}`,
                'ready',
            );
            return true;
        } catch (error) {
            datasetApiReady = false;
            populateDatasetCatalog([]);
            setDatasetStatus(
                error?.message || 'Dataset Storage API পাওয়া যায়নি।',
                activeDatasetRef?.uuid ? 'warning' : 'error',
            );
            return false;
        }
    };

    const selectedStatValueColumns = () => (
        Array.from(statValue.selectedOptions)
            .map((option) => Number(option.value))
            .filter(Number.isInteger)
    );

    const selectStatValueColumns = (indexes) => {
        const selected = new Set((Array.isArray(indexes) ? indexes : [indexes])
            .map(Number)
            .filter(Number.isInteger));
        Array.from(statValue.options).forEach((option) => {
            option.selected = selected.has(Number(option.value));
        });
        if (!statValue.selectedOptions.length && statValue.options.length) {
            statValue.options[0].selected = true;
        }
    };

    const populateStatColumns = (analysis) => {
        const signature = analysis.headers.join('\u001f');
        if (signature === statColumnSignature) return;

        const previousCategory = Number(statCategory.value);
        const previousValues = selectedStatValueColumns();
        const previousError = Number(statErrorColumn.value);

        statColumnSignature = signature;
        statCategory.replaceChildren();
        statValue.replaceChildren();
        statErrorColumn.replaceChildren(new Option('কোনো error column নয়', '-1'));

        analysis.headers.forEach((header, index) => {
            statCategory.add(new Option(header, String(index)));
            statValue.add(new Option(header, String(index)));
            statErrorColumn.add(new Option(header, String(index)));
        });

        const categoryIndex = Number.isInteger(previousCategory)
            && previousCategory >= 0
            && previousCategory < analysis.headers.length
                ? previousCategory
                : analysis.defaultCategoryColumn;
        statCategory.value = String(categoryIndex);

        const inferredErrorIndex = analysis.headers.findIndex((header) => (
            /error|uncertainty|standard deviation|std\.? dev|\bsd\b|standard error|\bse\b|ত্রুটি|অনিশ্চয়তা|অনিশ্চয়তা/i
                .test(String(header || ''))
        ));
        const numericIndexes = analysis.numeric
            .map((column) => column.index)
            .filter((index) => index !== categoryIndex && index !== inferredErrorIndex);
        const recommendedMultiple = ['grouped-bar', 'stacked-bar', 'multi-line', 'scientific-scatter', 'error-bar']
            .includes(analysis.recommendation);
        const defaultValues = previousValues.length
            ? previousValues.filter((index) => index < analysis.headers.length)
            : recommendedMultiple
                ? numericIndexes.slice(0, 6)
                : [analysis.defaultValueColumn];

        selectStatValueColumns(defaultValues.length ? defaultValues : [analysis.defaultValueColumn]);

        statErrorColumn.value = previousError >= 0 && previousError < analysis.headers.length
            ? String(previousError)
            : inferredErrorIndex >= 0
                ? String(inferredErrorIndex)
                : '-1';
        if (inferredErrorIndex >= 0 && statChart.value === 'error-bar') {
            statErrorMode.value = 'column';
        }
        statXLabel.value = analysis.headers[categoryIndex] || '';
        const selectedHeaders = selectedStatValueColumns()
            .map((index) => analysis.headers[index])
            .filter(Boolean);
        statYLabel.value = selectedHeaders.length > 1
            ? 'Value'
            : selectedHeaders[0] || analysis.headers[analysis.defaultValueColumn] || '';
    };

    const ensureValueSelectionForChart = () => {
        if (!statisticsAnalysis?.headers?.length) return;
        const multipleChart = [
            'grouped-bar', 'stacked-bar', 'multi-line',
            'scientific-scatter', 'error-bar',
        ].includes(statChart.value);
        const currentSelection = selectedStatValueColumns();

        if (multipleChart && currentSelection.length <= 1) {
            const categoryIndex = Number(statCategory.value);
            const candidates = statisticsAnalysis.numeric
                .map((column) => column.index)
                .filter((index) => index !== categoryIndex)
                .slice(0, 8);
            if (candidates.length > 1) selectStatValueColumns(candidates);
        }
    };

    const updateStatisticsOptionVisibility = () => {
        const chart = statChart.value;
        const regressionVisible = ['scatter', 'scientific-scatter', 'error-bar'].includes(chart);
        const errorVisible = ['scientific-scatter', 'error-bar'].includes(chart);
        const frequencyVisible = [
            'bar', 'grouped-bar', 'stacked-bar', 'histogram',
            'frequency-polygon', 'ogive', 'pie',
        ].includes(chart);

        statRegressionWrap.hidden = !regressionVisible;
        statRegressionEquationWrap.hidden = !regressionVisible;
        statCorrelationWrap.hidden = !regressionVisible;
        statErrorModeField.hidden = !errorVisible;
        statErrorColumnField.hidden = !errorVisible || statErrorMode.value !== 'column';
        statConstantErrorField.hidden = !errorVisible || statErrorMode.value !== 'constant';
        statFrequencyModeField.hidden = !frequencyVisible;
        statOgiveDirectionField.hidden = chart !== 'ogive';

        if (!errorVisible) statErrorMode.value = 'none';
        if (!regressionVisible) statRegression.checked = false;
    };

    const updateStatisticsAxisDisplay = (specInput = current, { writeValues = true } = {}) => {
        const automatic = statAxisMode.value !== 'manual';
        const spec = automatic ? resolveGraphAxisRange(specInput) : specInput;
        statAxisCard.classList.toggle('is-manual', !automatic);

        if (writeValues) {
            statXMin.value = spec.xMin;
            statXMax.value = spec.xMax;
            statYMin.value = spec.yMin;
            statYMax.value = spec.yMax;
        }

        [statXMinField, statXMaxField, statYMinField, statYMaxField].forEach((wrapper, index) => {
            const control = [statXMin, statXMax, statYMin, statYMax][index];
            control.disabled = automatic;
            wrapper.classList.toggle('is-disabled', automatic);
            wrapper.setAttribute('aria-disabled', automatic ? 'true' : 'false');
        });

        statAxisSummary.textContent = `${automatic ? 'Auto adjust' : 'Manual adjust'} • ${graphAxisSummary(spec)}`;
    };

    const statisticsRangeValues = () => ({
        xMin: statXMin.value,
        xMax: statXMax.value,
        yMin: statYMin.value,
        yMax: statYMax.value,
    });

    const updateStatistics = (immediate = false) => {
        window.clearTimeout(statTimer);
        const run = () => {
            const model = parseDataTableText(statDataInput.value);
            statisticsAnalysis = analyzeDataTable(model);
            if (!statisticsAnalysis.body.length || statisticsAnalysis.headers.length < 1) {
                statSummary.textContent = 'কমপক্ষে একটি numeric data column দিন।';
                statPreview.innerHTML = tablePreviewHtml(null);
                preview.innerHTML = '<div style="padding:28px;text-align:center;color:#64748b">Data দিলে graph preview দেখা যাবে।</div>';
                return;
            }

            populateStatColumns(statisticsAnalysis);
            if (!statChartTouched) {
                statChart.value = Array.from(statChart.options)
                    .some((option) => option.value === statisticsAnalysis.recommendation)
                        ? statisticsAnalysis.recommendation
                        : 'bar';
            }
            updateStatisticsOptionVisibility();

            if (!statTitle.value) {
                statTitle.value = `${statChart.options[statChart.selectedIndex]?.text || 'Statistical'} graph`;
            }

            const valueColumns = selectedStatValueColumns();
            if (!valueColumns.length) {
                statSummary.textContent = 'কমপক্ষে একটি Value / Y column নির্বাচন করুন।';
                return;
            }

            let spec = buildAdvancedStatisticsSpec({
                model: statisticsAnalysis,
                chartType: statChart.value,
                categoryColumn: statCategory.value,
                valueColumns,
                valueColumn: valueColumns[0],
                errorColumn: statErrorColumn.value,
                errorMode: statErrorMode.value,
                constantError: statConstantError.value,
                regression: statRegression.checked,
                showRegressionEquation: statShowRegressionEquation.checked,
                showCorrelation: statShowCorrelation.checked,
                frequencyMode: statFrequencyMode.value,
                ogiveDirection: statOgiveDirection.value,
                sortMode: statSortMode.value,
                title: statTitle.value,
                xLabel: statXLabel.value,
                yLabel: statYLabel.value,
            });

            spec = normalizeSpec({
                ...spec,
                ...(activeDatasetRef && statPersistDataset.checked ? {
                    datasetRef: activeDatasetRef,
                    datasetStorageVersion: GRAPH_DATASET_STORAGE_VERSION,
                    datasetMode: 'database',
                    sourceData: {
                        ...(spec.sourceData || {}),
                        datasetId: activeDatasetRef.uuid,
                        storageMode: 'database',
                    },
                } : {}),
                axisMode: statAxisMode.value === 'manual' ? 'manual' : 'auto',
                autoRangePadding: 0.12,
                ...(statAxisMode.value === 'manual' ? statisticsRangeValues() : {}),
            });
            if (spec.axisMode === 'auto') spec = normalizeSpec(resolveGraphAxisRange(spec));

            applySpec(spec, { lock: true, sync: false });
            updateStatisticsAxisDisplay(current);

            const selectedHeaders = valueColumns
                .map((index) => statisticsAnalysis.headers[index])
                .filter(Boolean);
            const datasetMode = activeDatasetRef && statPersistDataset.checked
                ? 'database'
                : current.sourceData?.storageMode || current.datasetMode || 'embedded';
            const renderedCount = Array.isArray(current.series)
                ? current.series.reduce(
                    (maximum, item) => Math.max(maximum, Number(item.renderedPointCount) || item.x?.length || 0),
                    0,
                )
                : current.x?.length || current.values?.length || current.labels?.length || 0;

            statSummary.innerHTML = [
                `${statisticsAnalysis.body.length.toLocaleString()} rows × ${statisticsAnalysis.headers.length} columns`,
                `${selectedHeaders.length} series: ${escapeGraphUxHtml(selectedHeaders.join(', '))}`,
                `প্রস্তাবিত: ${escapeGraphUxHtml(statisticsAnalysis.recommendation)}`,
                graphAxisSummary(current),
                `<span class="qmx-stat-dataset-badge">${
                    datasetMode === 'database'
                        ? `Database dataset${datasetDirty ? ' • pending update' : ''}`
                        : datasetMode === 'summarized'
                            ? 'Summarized dataset'
                            : 'Embedded dataset'
                }</span>`,
                renderedCount ? `Rendered points/category count: ${renderedCount.toLocaleString()}` : '',
            ].filter(Boolean).join(' • ');

            const databaseWillPersist = statPersistDataset.checked && datasetApiReady;
            statDatasetWarning.hidden = databaseWillPersist || datasetMode !== 'summarized';
            statDatasetWarning.textContent = !databaseWillPersist && datasetMode === 'summarized'
                ? `Dataset Storage ব্যবহার না হলে বড় dataset (${statisticsAnalysis.body.length.toLocaleString()} rows) শুধু graph-ready summary/downsample হিসেবে token-এ থাকবে। পূর্ণ source পুনরুদ্ধারের জন্য Dataset Storage চালু রাখুন।`
                : '';

            statPreview.innerHTML = tablePreviewHtml(statisticsAnalysis);
        };
        if (immediate) run();
        else statTimer = window.setTimeout(run, 100);
    };

    const datasetGraphMetadata = () => ({
        chart_type: statChart.value,
        category_column: Number(statCategory.value),
        value_columns: selectedStatValueColumns(),
        error_column: Number(statErrorColumn.value),
        frequency_mode: statFrequencyMode.value,
        ogive_direction: statOgiveDirection.value,
        sort_mode: statSortMode.value,
        file_name: statFileInput.files?.[0]?.name || null,
        client_version: GRAPH_DATASET_STORAGE_VERSION,
    });

    const stripDatasetReference = () => {
        const sourceData = { ...(current.sourceData || {}) };
        delete sourceData.datasetId;
        sourceData.storageMode = Array.isArray(sourceData.rows) && sourceData.rows.length
            ? 'embedded'
            : sourceData.storageMode === 'database'
                ? 'summarized'
                : sourceData.storageMode;

        const next = {
            ...current,
            sourceData,
            datasetMode: sourceData.storageMode || current.datasetMode || 'embedded',
        };
        delete next.datasetRef;
        delete next.datasetStorageVersion;
        current = normalizeSpec(next);
    };

    const persistStatisticsDataset = async () => {
        if (!statPersistDataset.checked) {
            stripDatasetReference();
            return null;
        }

        if (!statisticsAnalysis?.body?.length) {
            throw new GraphDatasetApiError('সংরক্ষণের জন্য dataset rows পাওয়া যায়নি।');
        }

        if (!datasetApiReady) {
            const available = await refreshDatasetCatalog({ force: true, quiet: true });
            if (!available) {
                throw new GraphDatasetApiError(
                    'Dataset Storage API প্রস্তুত নয়। Migration, provider এবং login session যাচাই করুন।'
                );
            }
        }

        let saved = activeDatasetRef;
        if (!saved || datasetDirty) {
            setDatasetStatus(
                saved ? 'Dataset-এর পূর্ণ source data update হচ্ছে…' : 'নতুন dataset সংরক্ষণ হচ্ছে…'
            );
            saved = await saveGraphDataset({
                datasetRef: activeDatasetRef,
                name: statDatasetName.value || statTitle.value || 'Graph dataset',
                sourceType: datasetSourceKind || 'manual',
                headers: statisticsAnalysis.headers,
                rows: statisticsAnalysis.body,
                metadata: datasetGraphMetadata(),
            });
        }

        if (!saved?.uuid) {
            throw new GraphDatasetApiError('Dataset Storage কোনো valid dataset reference ফেরত দেয়নি।');
        }

        activeDatasetRef = graphDatasetReference(saved);
        datasetDirty = false;
        datasetApiReady = true;
        statDatasetName.value = activeDatasetRef.name;

        current = normalizeSpec({
            ...current,
            datasetRef: activeDatasetRef,
            datasetStorageVersion: GRAPH_DATASET_STORAGE_VERSION,
            datasetMode: 'database',
            sourceRowCount: activeDatasetRef.rowCount,
            sourceData: {
                ...(current.sourceData || {}),
                headers: statisticsAnalysis.headers,
                rows: [],
                rowCount: activeDatasetRef.rowCount,
                embeddedRowCount: 0,
                storageMode: 'database',
                datasetId: activeDatasetRef.uuid,
                sourceType: datasetSourceKind || 'manual',
            },
        });

        setDatasetStatus(
            `${activeDatasetRef.name} • ${activeDatasetRef.rowCount.toLocaleString()} rows • version ${activeDatasetRef.version} • ${activeDatasetRef.storageDriver}`,
            'ready',
        );
        await refreshDatasetCatalog({ force: true, quiet: true });
        return activeDatasetRef;
    };

    const loadSavedDataset = async (uuid) => {
        if (!uuid) {
            setDatasetStatus('Saved dataset নির্বাচন করুন।', 'warning');
            return;
        }

        try {
            setDatasetStatus('Saved dataset-এর পূর্ণ rows লোড হচ্ছে…');
            const dataset = await fetchGraphDataset(uuid);
            if (!dataset?.headers || !dataset?.rows) {
                throw new GraphDatasetApiError('Saved dataset-এর rows পাওয়া যায়নি।');
            }

            activeDatasetRef = graphDatasetReference(dataset);
            restoredDataset = dataset;
            datasetApiReady = true;
            datasetDirty = false;
            datasetSourceKind = 'saved_dataset';
            statPersistDataset.checked = true;
            statDatasetName.value = dataset.name;
            statSourceSelect.value = 'manual';
            statDataInput.value = rowsToDelimitedText([dataset.headers, ...dataset.rows]);
            statFileName.textContent = `Saved dataset • ${dataset.rowCount.toLocaleString()} rows`;
            statChartTouched = false;
            statColumnSignature = '';
            updateStatistics(true);
            setDatasetStatus(
                `${dataset.name} • ${dataset.rowCount.toLocaleString()} rows × ${dataset.columnCount} columns • version ${dataset.version}`,
                'ready',
            );
        } catch (error) {
            console.error('Saved graph dataset load failed.', error);
            setDatasetStatus(error?.message || 'Saved dataset লোড করা যায়নি।', 'error');
        }
    };

    const deleteSelectedDataset = async () => {
        const uuid = statSavedDataset.value;
        const dataset = datasetCatalog.find((item) => item.uuid === uuid);
        if (!dataset) {
            setDatasetStatus('Delete করার জন্য একটি unused dataset নির্বাচন করুন।', 'warning');
            return;
        }

        if (dataset.inUse) {
            setDatasetStatus('Saved question-এর সঙ্গে যুক্ত dataset UI থেকে delete করা যাবে না।', 'warning');
            return;
        }

        const confirmation = window.Swal?.fire
            ? await window.Swal.fire({
                icon: 'warning',
                title: 'Delete unused dataset?',
                text: `${dataset.name} (${dataset.rowCount.toLocaleString()} rows) স্থায়ীভাবে মুছে যাবে।`,
                showCancelButton: true,
                confirmButtonText: 'Delete dataset',
                confirmButtonColor: '#b91c1c',
            })
            : { isConfirmed: window.confirm(`Delete dataset "${dataset.name}"?`) };

        if (!confirmation?.isConfirmed) return;

        try {
            setDatasetStatus('Dataset delete হচ্ছে…');
            await deleteGraphDataset(uuid);
            if (activeDatasetRef?.uuid === uuid) {
                activeDatasetRef = null;
                restoredDataset = null;
                datasetDirty = true;
                stripDatasetReference();
            }
            await refreshDatasetCatalog({ force: true });
        } catch (error) {
            console.error('Graph dataset delete failed.', error);
            setDatasetStatus(error?.message || 'Dataset delete করা যায়নি।', 'error');
        }
    };

    const loadStatisticsSource = () => {
        const sourceValue = statSourceSelect.value;
        datasetSourceKind = graphDatasetSourceType(sourceValue);

        if (sourceValue === 'manual') {
            if (!statDataInput.value.trim()) statDataInput.value = '';
        } else if (sourceValue.startsWith('page:')) {
            const selected = pageTables[Number(sourceValue.slice(5))];
            if (selected) statDataInput.value = rowsToDelimitedText(selected.rows);
        }

        datasetDirty = true;
        statChartTouched = false;
        statColumnSignature = '';
        updateStatistics(true);
    };

    statSourceSelect.addEventListener('change', loadStatisticsSource);
    statDataInput.addEventListener('input', () => {
        datasetDirty = true;
        datasetSourceKind = statSourceSelect.value === 'manual'
            ? 'manual'
            : graphDatasetSourceType(statSourceSelect.value);
        statColumnSignature = '';
        updateStatistics(false);
    });
    statChart.addEventListener('change', () => {
        statChartTouched = true;
        ensureValueSelectionForChart();
        updateStatisticsOptionVisibility();
        updateStatistics(true);
    });

    [
        statCategory,
        statValue,
        statTitle,
        statXLabel,
        statYLabel,
        statErrorColumn,
        statFrequencyMode,
        statOgiveDirection,
        statSortMode,
        statRegression,
        statShowRegressionEquation,
        statShowCorrelation,
        statErrorMode,
        statConstantError,
    ].forEach((control) => {
        control.addEventListener('input', () => {
            if (control === statErrorMode) updateStatisticsOptionVisibility();
            updateStatistics(false);
        });
        control.addEventListener('change', () => {
            if (control === statErrorMode) updateStatisticsOptionVisibility();
            updateStatistics(true);
        });
    });

    statImportFile.addEventListener('click', () => statFileInput.click());
    statFileInput.addEventListener('change', async () => {
        const file = statFileInput.files?.[0];
        if (!file) return;

        if (file.size > 15 * 1024 * 1024) {
            statSummary.textContent = 'File 15 MB-এর বেশি। CSV/TSV file ছোট করুন অথবা প্রয়োজনীয় columns রাখুন।';
            statFileInput.value = '';
            return;
        }

        try {
            const content = (await file.text()).replace(/^\uFEFF/, '');
            statSourceSelect.value = 'manual';
            datasetSourceKind = 'file';
            datasetDirty = true;
            statDataInput.value = content;
            statFileName.textContent = `${file.name} • ${(file.size / 1024).toFixed(1)} KB`;
            statChartTouched = false;
            statColumnSignature = '';
            updateStatistics(true);
        } catch (error) {
            console.error('Statistics file import failed.', error);
            statSummary.textContent = 'CSV/TSV file পড়া যায়নি।';
        }
    });
    statRefreshDatasets.addEventListener('click', () => {
        refreshDatasetCatalog({ force: true });
    });
    statLoadDataset.addEventListener('click', () => {
        loadSavedDataset(statSavedDataset.value);
    });
    statDeleteDataset.addEventListener('click', deleteSelectedDataset);
    statSaveAsNewDataset.addEventListener('click', () => {
        const previousName = statDatasetName.value.trim()
            || activeDatasetRef?.name
            || statTitle.value.trim()
            || 'Graph dataset';
        activeDatasetRef = null;
        restoredDataset = null;
        datasetVersionChanged = false;
        datasetDirty = true;
        statPersistDataset.checked = true;
        statDatasetName.value = / copy$/i.test(previousName)
            ? previousName
            : `${previousName} copy`;
        statSavedDataset.value = '';
        stripDatasetReference();
        setDatasetStatus(
            'Next Insert/Update-এ নতুন independent dataset তৈরি হবে।',
            'warning',
        );
        updateStatistics(true);
    });
    statSavedDataset.addEventListener('change', () => {
        const selected = datasetCatalog.find((item) => item.uuid === statSavedDataset.value);
        if (selected) {
            setDatasetStatus(
                `${selected.name} • ${selected.rowCount.toLocaleString()} rows × ${selected.columnCount} columns • ${selected.inUse ? 'attached' : 'unused'}`,
                'ready',
            );
        }
    });
    statPersistDataset.addEventListener('change', () => {
        if (!statPersistDataset.checked) {
            setDatasetStatus(
                'Dataset Storage বন্ধ আছে। Graph token-এ embedded অথবা summarized data থাকবে।',
                'warning',
            );
        } else {
            refreshDatasetCatalog({ quiet: true }).then(() => updateStatistics(true));
        }
        updateStatistics(true);
    });
    statDatasetName.addEventListener('input', () => {
        if (activeDatasetRef && statDatasetName.value.trim() !== activeDatasetRef.name) {
            datasetDirty = true;
        }
    });

    statAxisMode.addEventListener('change', () => {
        if (statAxisMode.value === 'manual') {
            const fitted = resolveGraphAxisRange({
                ...current,
                axisMode: 'auto',
            });
            statXMin.value = fitted.xMin;
            statXMax.value = fitted.xMax;
            statYMin.value = fitted.yMin;
            statYMax.value = fitted.yMax;
        }
        updateStatistics(true);
    });

    [statXMin, statXMax, statYMin, statYMax].forEach((control) => {
        control.addEventListener('input', () => {
            if (statAxisMode.value === 'manual') updateStatistics(false);
        });
        control.addEventListener('change', () => {
            if (statAxisMode.value === 'manual') updateStatistics(true);
        });
    });

    statFitRange.addEventListener('click', () => {
        if (!statisticsAnalysis?.body?.length) return;
        const range = calculateGraphAutoRange({
            ...current,
            axisMode: 'auto',
        });
        if (!range) {
            statSummary.textContent = 'এই data-এর automatic range নির্ণয় করা যায়নি।';
            return;
        }
        statXMin.value = range.xMin;
        statXMax.value = range.xMax;
        statYMin.value = range.yMin;
        statYMax.value = range.yMax;
        current = normalizeSpec({
            ...current,
            ...range,
            axisMode: statAxisMode.value === 'manual' ? 'manual' : 'auto',
        });
        updateStatisticsAxisDisplay(current);
        renderPreview();
    });

    statResetRange.addEventListener('click', () => {
        statAxisMode.value = 'auto';
        statXMin.value = -10;
        statXMax.value = 10;
        statYMin.value = -10;
        statYMax.value = 10;
        updateStatistics(true);
    });

    statBack.addEventListener('click', () => showMode('home'));
    statOptions.addEventListener('click', () => {
        if (!statisticsAnalysis?.body?.length) return;
        controlsExtraOpen = false;
        syncControlsFromCurrent();
        showMode('controls');
    });

    homePanel.addEventListener('click', (event) => {
        const card = event.target.closest('[data-graph-workspace]');
        if (!card) return;
        const workspace = card.dataset.graphWorkspace;

        if (workspace === 'equation') {
            if (!equationSource.value) equationSource.value = initialSource || '';
            if (equationSource.value.trim()) updateEquationRecognition(true);
            else {
                equationRecognition = { recognized: false, message: 'সমীকরণ লিখুন অথবা প্রশ্ন থেকে select করুন।' };
                updateEquationDetectionCopy();
                preview.innerHTML = '<div style="padding:28px;text-align:center;color:#64748b">সমীকরণ লিখলে preview দেখা যাবে।</div>';
            }
            showMode('equation', { render: false });
            return;
        }

        if (workspace === 'statistics') {
            if (pageTables.length && statSourceSelect.value === 'manual' && !statDataInput.value.trim()) {
                const preferredIndex = Math.max(0, pageTables.findIndex((item) => item.selected));
                statSourceSelect.value = `page:${preferredIndex}`;
                loadStatisticsSource();
            } else {
                updateStatistics(true);
            }
            showMode('statistics', { render: Boolean(statisticsAnalysis?.body?.length) });
            return;
        }

        const defaults = {
            geometry: { type: 'geometry', axisMode: 'auto' },
            calculus: { type: 'calculus', axisMode: 'auto' },
            scientific: { type: 'line', title: 'Scientific data graph', axisMode: 'auto' },
            space3d: { type: 'space3d', axisMode: 'auto', autoZRange: true },
        }[workspace];

        if (defaults) {
            current = normalizeSpec({ ...commonOnly(current), ...defaults });
            explicitTypeLock = null;
            controlsExtraOpen = workspace === 'space3d';
            syncControlsFromCurrent();
            showMode('controls');
            return;
        }

        if (workspace === 'all') {
            explicitTypeLock = null;
            controlsExtraOpen = true;
            syncControlsFromCurrent();
            showMode('controls');
        }
    });

    controlsBack.addEventListener('click', () => {
        if (current.statisticsWorkspaceVersion) {
            showMode('statistics');
        } else if (current.sourceEquation) {
            equationSource.value = current.sourceText || [current.sourceEquation, current.sourceInstruction].filter(Boolean).join(' ');
            equationRecognition = recognizeUniversalGraph(equationSource.value);
            updateEquationDetectionCopy();
            showMode('equation');
        } else {
            showMode('home');
        }
    });

    optionsToggle.addEventListener('click', () => {
        controlsExtraOpen = !controlsExtraOpen;
        updateControlsMode();
    });

    renderHomePanel();

    if (current.statisticsWorkspaceVersion || pageTables.length || activeDatasetRef?.uuid) {
        refreshDatasetCatalog({ quiet: true });
    }

    type.addEventListener('change', () => {
        explicitTypeLock = null;
        const previousType = current.type;
        const nextType = type.value;
        const preserved = commonOnly({
            ...current,
            title: title.value,
            subtitle: subtitle.value,
            xLabel: xLabel.value,
            yLabel: yLabel.value,
            xMin: xMin.value,
            xMax: xMax.value,
            yMin: yMin.value,
            yMax: yMax.value,
            color: color.value,
            tickCount: tickCount.value,
            width: width.value,
            height: height.value,
            grid: grid.control.checked,
            minorGrid: minorGrid.control.checked,
            showAxes: showAxes.control.checked,
            showTickLabels: showTickLabels.control.checked,
            legend: legend.control.checked,
            aspectLock: aspectLock.control.checked,
        });
        const pairedTypes = [
            'scatter', 'line', 'frequency-polygon', 'ogive',
            'multi-line', 'scientific-scatter', 'error-bar',
        ];
        const barTypes = ['bar', 'grouped-bar', 'stacked-bar'];
        let keepData = {};
        if (pairedTypes.includes(previousType) && pairedTypes.includes(nextType)) {
            keepData = {
                x: current.x,
                y: current.y,
                labels: current.labels,
                series: current.series,
                errorY: current.errorY,
                errorX: current.errorX,
                regression: current.regression,
                showRegressionEquation: current.showRegressionEquation,
                showCorrelation: current.showCorrelation,
                errorBars: current.errorBars,
            };
        } else if (barTypes.includes(previousType) && barTypes.includes(nextType)) {
            keepData = {
                labels: current.labels,
                values: current.values,
                series: current.series,
            };
        }
        current = normalizeSpec({ ...preserved, ...keepData, type: nextType });
        syncControlsFromCurrent();
        refresh(true);
    });

    template.addEventListener('change', () => {
        const selected = TEMPLATES.find((item) => item.id === template.value);
        if (!selected?.spec) {
            explicitTypeLock = null;
            return;
        }
        explicitTypeLock = selected.spec.type;
        current = normalizeSpec({ ...commonOnly(current), ...selected.spec });
        type.value = current.type;
        syncControlsFromCurrent();
        refresh(true);
    });

    const fitCurrentRange = ({ keepMode = true } = {}) => {
        readCurrent();
        const previousMode = current.axisMode;
        const range = calculateGraphAutoRange({
            ...current,
            axisMode: 'auto',
            autoZRange: true,
        });
        if (!range) {
            errors.textContent = 'এই graph type-এর জন্য automatic range নির্ণয় করা যায়নি; Manual adjust ব্যবহার করুন।';
            return false;
        }

        current = normalizeSpec({
            ...current,
            ...range,
            axisMode: keepMode ? previousMode : 'auto',
            autoZRange: keepMode ? previousMode === 'auto' : true,
        });
        syncControlsFromCurrent();
        renderPreview();
        errors.textContent = '';
        return true;
    };

    fitRangeButton.addEventListener('click', () => {
        fitCurrentRange({ keepMode: true });
    });

    resetRangeButton.addEventListener('click', () => {
        current = normalizeSpec({
            ...current,
            axisMode: 'auto',
            autoZRange: true,
            autoRangePadding: 0.12,
            xMin: -10,
            xMax: 10,
            yMin: -10,
            yMax: 10,
            zMin: -6,
            zMax: 6,
        });
        const range = calculateGraphAutoRange(current);
        if (range) current = normalizeSpec({ ...current, ...range });
        syncControlsFromCurrent();
        renderPreview();
        errors.textContent = '';
    });

    axisMode.addEventListener('change', () => {
        if (axisMode.value === 'auto') {
            current = normalizeSpec({
                ...current,
                axisMode: 'auto',
                autoZRange: true,
                autoRangePadding: autoRangePadding.value,
            });
            const range = calculateGraphAutoRange(current);
            if (range) current = normalizeSpec({ ...current, ...range });
        } else {
            current = normalizeSpec({
                ...resolveGraphAxisRange(current),
                axisMode: 'manual',
                autoZRange: false,
            });
        }
        syncControlsFromCurrent();
        renderPreview();
        errors.textContent = '';
    });

    autoRangePadding.addEventListener('input', () => {
        if (axisMode.value !== 'auto') return;
        current = normalizeSpec({
            ...current,
            axisMode: 'auto',
            autoRangePadding: autoRangePadding.value,
        });
        const range = calculateGraphAutoRange(current);
        if (range) current = normalizeSpec({ ...current, ...range });
        syncControlsFromCurrent();
        renderPreview();
    });

    resetButton.addEventListener('click', () => {
        current = normalizeSpec({ ...commonOnly(current), type: current.type });
        syncControlsFromCurrent();
        refresh(true);
    });

    controls.addEventListener('input', (event) => {
        if (
            event.target === type
            || event.target === template
            || event.target === axisMode
            || event.target === autoRangePadding
        ) return;
        if (event.target === mainInput && explicitTypeLock) {
            refresh(false);
            return;
        }
        if (event.target === mainInput && switchToSpace3dFromInput()) {
            refresh(true);
            return;
        }
        if (event.target === mainInput && switchToGeometryFromInput()) {
            refresh(true);
            return;
        }
        if (event.target === mainInput && switchToImplicitFromInput()) {
            refresh(true);
            return;
        }
        if (event.target === mainInput && switchToCalculusFromInput()) {
            refresh(true);
            return;
        }
        if (event.target === mainInput && switchToRegionFromInput()) {
            refresh(true);
            return;
        }
        if (event.target === mainInput && switchToCompositeFromInput()) {
            refresh(true);
            return;
        }
        if (event.target === mainInput && switchToPiecewiseFromInput()) {
            refresh(true);
            return;
        }
        refresh(false);
    });
    controls.addEventListener('change', (event) => {
        if (
            event.target === type
            || event.target === template
            || event.target === axisMode
            || event.target === autoRangePadding
        ) return;
        refresh(true);
    });

    syncControlsFromCurrent();

    if (isEditMode) {
        if (current.statisticsWorkspaceVersion) {
            let storedHeaders = Array.isArray(current.sourceData?.headers)
                ? current.sourceData.headers.slice()
                : [current.xLabel || 'X', current.yLabel || 'Y'];
            let storedRows = Array.isArray(current.sourceData?.rows)
                ? current.sourceData.rows
                : [];
            let reconstructed = false;

            if (!storedRows.length && Array.isArray(current.series) && current.series.length) {
                const barSeries = current.series.every((series) => Array.isArray(series.values));
                if (barSeries && Array.isArray(current.labels)) {
                    storedHeaders = [
                        current.xLabel || 'Category',
                        ...current.series.map((series, index) => series.label || `Series ${index + 1}`),
                    ];
                    storedRows = current.labels.map((label, rowIndex) => [
                        label,
                        ...current.series.map((series) => series.values?.[rowIndex] ?? ''),
                    ]);
                    reconstructed = true;
                } else {
                    const primaryX = current.series[0]?.x || [];
                    storedHeaders = [
                        current.xLabel || 'X',
                        ...current.series.map((series, index) => series.label || `Series ${index + 1}`),
                    ];
                    storedRows = primaryX.map((xValue, rowIndex) => [
                        xValue,
                        ...current.series.map((series) => series.y?.[rowIndex] ?? ''),
                    ]);
                    reconstructed = true;
                }
            } else if (!storedRows.length && Array.isArray(current.x) && Array.isArray(current.y)) {
                storedRows = current.x.map((value, index) => [value, current.y[index]]);
                reconstructed = true;
            } else if (!storedRows.length && Array.isArray(current.values)) {
                storedRows = current.values.map((value, index) => [
                    current.labels?.[index] ?? index + 1,
                    value,
                ]);
                reconstructed = true;
            }

            statDataInput.value = rowsToDelimitedText([storedHeaders, ...storedRows]);
            statisticsAnalysis = analyzeDataTable(parseDataTableText(statDataInput.value));
            populateStatColumns(statisticsAnalysis);

            const storedCategory = Number(current.sourceData?.categoryColumn);
            if (Number.isInteger(storedCategory) && statCategory.options[storedCategory]) {
                statCategory.value = String(storedCategory);
            }

            const storedValues = Array.isArray(current.sourceData?.valueColumns)
                ? current.sourceData.valueColumns
                : Number.isInteger(Number(current.sourceData?.valueColumn))
                    ? [Number(current.sourceData.valueColumn)]
                    : reconstructed && current.series?.length
                        ? current.series.map((_, index) => index + 1)
                        : [statisticsAnalysis.defaultValueColumn];
            selectStatValueColumns(storedValues);

            const storedErrorColumn = Number(current.sourceData?.errorColumn);
            statErrorColumn.value = Number.isInteger(storedErrorColumn)
                && Array.from(statErrorColumn.options).some((option) => Number(option.value) === storedErrorColumn)
                    ? String(storedErrorColumn)
                    : '-1';

            statChartTouched = true;
            const restoredChart = current.sourceData?.chartType || current.type;
            if (Array.from(statChart.options).some((option) => option.value === restoredChart)) {
                statChart.value = restoredChart;
            }

            statFrequencyMode.value = current.sourceData?.frequencyMode || 'raw';
            statOgiveDirection.value = current.sourceData?.ogiveDirection || 'less-than';
            statSortMode.value = current.sourceData?.sortMode || 'source';
            statErrorMode.value = current.sourceData?.errorMode || (current.errorBars ? 'column' : 'none');
            statConstantError.value = current.sourceData?.constantError ?? 0;
            statRegression.checked = current.sourceData?.regression === true || current.regression === true;
            statShowRegressionEquation.checked = current.sourceData?.showRegressionEquation !== false
                && current.showRegressionEquation !== false;
            statShowCorrelation.checked = current.sourceData?.showCorrelation !== false
                && current.showCorrelation !== false;

            statTitle.value = current.title || '';
            statXLabel.value = current.xLabel || '';
            statYLabel.value = current.yLabel || '';
            statAxisMode.value = current.axisMode === 'auto' ? 'auto' : 'manual';
            statXMin.value = current.xMin;
            statXMax.value = current.xMax;
            statYMin.value = current.yMin;
            statYMax.value = current.yMax;

            statPersistDataset.checked = Boolean(activeDatasetRef?.uuid);
            statDatasetName.value = activeDatasetRef?.name || current.title || 'Graph dataset';
            datasetSourceKind = current.sourceData?.sourceType
                || (activeDatasetRef ? 'saved_dataset' : 'manual');
            datasetDirty = false;

            updateStatisticsOptionVisibility();
            updateStatistics(true);

            if (activeDatasetRef?.uuid && restoredDataset?.rows) {
                setDatasetStatus(
                    datasetVersionChanged
                        ? `${activeDatasetRef.name} dataset version ${activeDatasetRef.version}-এ পরিবর্তিত হয়েছে। Update graph করলে latest rows token-এ sync হবে।`
                        : `${activeDatasetRef.name} • ${activeDatasetRef.rowCount.toLocaleString()} rows • পূর্ণ source restored • version ${activeDatasetRef.version}`,
                    datasetVersionChanged ? 'warning' : 'ready',
                );
                statDatasetWarning.hidden = !datasetVersionChanged;
                statDatasetWarning.textContent = datasetVersionChanged
                    ? 'Saved graph-এর dataset reference পুরোনো। Latest dataset দিয়ে preview পুনর্গঠিত হয়েছে; Update graph চাপুন।'
                    : '';
            } else if (datasetRestoreError) {
                statDatasetWarning.hidden = false;
                statDatasetWarning.textContent = `${datasetRestoreError} Graph-ready summary দিয়ে editor খোলা হয়েছে।`;
                setDatasetStatus(datasetRestoreError, 'error');
            } else if (reconstructed || current.sourceData?.storageMode === 'summarized') {
                statDatasetWarning.hidden = false;
                statDatasetWarning.textContent = 'এই graph summarized/downsampled copy থেকে পুনরুদ্ধার হয়েছে। পূর্ণ source পেতে original CSV/table import করে Dataset Storage চালু রাখুন।';
            }
            showMode('statistics');
        } else if (current.sourceEquation) {
            equationSource.value = current.sourceText
                || [current.sourceEquation, current.sourceInstruction].filter(Boolean).join(' ');
            equationRecognition = recognizeUniversalGraph(equationSource.value);
            updateEquationDetectionCopy();
            showMode('equation');
        } else {
            controlsExtraOpen = true;
            showMode('controls');
        }
    } else if (initialRecognition.recognized) {
        equationSource.value = initialRecognition.source || initialSource || initialRecognition.equation;
        equationRecognition = initialRecognition;
        updateEquationDetectionCopy();
        showMode('equation');
    } else if (pageTables.some((item) => item.selected)) {
        const selectedIndex = pageTables.findIndex((item) => item.selected);
        statSourceSelect.value = `page:${Math.max(0, selectedIndex)}`;
        loadStatisticsSource();
        showMode('statistics');
    } else {
        showMode('home');
    }

    const result = await editor.dialog.open({
        title: isEditMode ? 'Edit Graph' : 'Graph Builder',
        html: container,
        showCloseButton: true,
        showCancelButton: true,
        confirmButtonText: isEditMode ? 'Update graph' : 'Insert graph',
        cancelButtonText: 'Cancel',
        focusConfirm: false,
        width: '1240px',
        customClass: { popup: 'qmx-graph-modal-popup' },
        preConfirm: async () => {
            if (activeMode === 'home') {
                Swal.showValidationMessage('সমীকরণ, data অথবা একটি graph family নির্বাচন করুন।');
                return false;
            }
            if (activeMode === 'equation' && !equationRecognition?.recognized) {
                Swal.showValidationMessage(equationRecognition?.message || 'সমীকরণ শনাক্ত হয়নি।');
                return false;
            }
            if (activeMode === 'statistics') {
                updateStatistics(true);
            }
            if (activeMode === 'controls') readCurrent();

            if (activeMode === 'statistics' || current.statisticsWorkspaceVersion) {
                if (!statisticsAnalysis?.body?.length) {
                    Swal.showValidationMessage('Statistics graph-এর জন্য data table দিন।');
                    return false;
                }

                try {
                    await persistStatisticsDataset();
                } catch (error) {
                    console.error('Graph dataset persistence failed.', error);
                    const suffix = error?.code === 'DATASET_VERSION_CONFLICT'
                        ? ' Saved dataset reload করে আবার চেষ্টা করুন।'
                        : '';
                    Swal.showValidationMessage(
                        `${error?.message || 'Dataset Storage-এ data সংরক্ষণ করা যায়নি।'}${suffix}`
                    );
                    return false;
                }
            }

            const validationErrors = validateGraphSpec(current);
            if (validationErrors.length) {
                Swal.showValidationMessage(validationErrors[0]);
                return false;
            }

            const tokenLength = encodeGraphToken(current).length;
            if (tokenLength > 60000) {
                Swal.showValidationMessage(
                    `Graph data খুব বড় (${tokenLength.toLocaleString()} characters)। অপ্রয়োজনীয় row/column কমিয়ে আবার চেষ্টা করুন।`
                );
                return false;
            }
            return current;
        },
    });
    return result.isConfirmed ? result.value : null;
}


function graphUpdateError(message) {
    const text = String(message || 'The selected graph could not be updated.');
    if (window.Swal?.fire) {
        window.Swal.fire({
            icon: 'error',
            title: 'Graph update failed',
            text,
        });
    } else if (typeof window.alert === 'function') {
        window.alert(text);
    }
    return null;
}

function isGraphToken(value) {
    return /^\[\[qmx-graph:[A-Za-z0-9_-]{10,60000}\]\]$/.test(String(value || ''));
}

function findExactTokenRange(source, token, preferredRange = null) {
    const text = String(source || '');
    const expected = String(token || '');

    if (!isGraphToken(expected)) return null;

    const preferredStart = Number(preferredRange?.start);
    const preferredEnd = Number(preferredRange?.end);
    if (
        Number.isInteger(preferredStart)
        && Number.isInteger(preferredEnd)
        && preferredStart >= 0
        && preferredEnd >= preferredStart
        && preferredEnd <= text.length
        && text.slice(preferredStart, preferredEnd) === expected
    ) {
        return { start: preferredStart, end: preferredEnd };
    }

    const matches = [];
    let offset = 0;
    while (offset <= text.length - expected.length) {
        const index = text.indexOf(expected, offset);
        if (index < 0) break;
        matches.push({ start: index, end: index + expected.length });
        offset = index + Math.max(1, expected.length);
    }

    if (!matches.length) return null;
    if (matches.length === 1) return matches[0];

    if (Number.isInteger(preferredStart)) {
        return matches.sort(
            (left, right) => Math.abs(left.start - preferredStart) - Math.abs(right.start - preferredStart),
        )[0];
    }

    return null;
}

function replaceGraphTokenExact({ editor, textarea, latex, options }) {
    if (!textarea) return graphUpdateError('The graph source field is unavailable.');

    const newSpec = decodeGraphToken(latex);
    if (!newSpec || !isGraphToken(latex)) {
        return graphUpdateError('The updated graph token is invalid. No source text was changed.');
    }

    const existingToken = String(options?.existingGraphToken || '');
    const before = String(textarea.value || '');
    const range = findExactTokenRange(before, existingToken, options?.replaceRange);

    if (!range) {
        return graphUpdateError(
            'The original graph token is no longer at the expected location. No source text was changed.',
        );
    }

    const currentToken = before.slice(range.start, range.end);
    const currentSpec = decodeGraphToken(currentToken);
    if (!currentSpec) {
        return graphUpdateError('The original graph token is malformed. No source text was changed.');
    }

    const candidate = before.slice(0, range.start) + latex + before.slice(range.end);
    const insertedSlice = candidate.slice(range.start, range.start + latex.length);
    if (insertedSlice !== latex || !decodeGraphToken(insertedSlice)) {
        return graphUpdateError('Updated-token validation failed. No source text was changed.');
    }

    const localWindowStart = Math.max(0, range.start - 18);
    const localWindowEnd = Math.min(candidate.length, range.start + latex.length + 18);
    const localWindow = candidate.slice(localWindowStart, localWindowEnd);
    const completeTokens = localWindow.match(/\[\[qmx-graph:[A-Za-z0-9_-]{10,60000}\]\]/g) || [];
    if (completeTokens.length !== 1 || completeTokens[0] !== latex) {
        return graphUpdateError('Nested or duplicate graph-token insertion was blocked.');
    }

    textarea.setRangeText(latex, range.start, range.end, 'end');
    const cursor = range.start + latex.length;
    textarea.setSelectionRange(cursor, cursor);
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const after = String(textarea.value || '');
    if (
        after !== candidate
        || after.slice(range.start, cursor) !== latex
        || !decodeGraphToken(after.slice(range.start, cursor))
    ) {
        textarea.value = before;
        textarea.setSelectionRange(range.start, range.end);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return graphUpdateError('The graph update could not be verified and was rolled back.');
    }

    editor?.history?.record?.({
        type: 'insert',
        textarea,
        start: range.start,
        before,
        after,
        text: latex,
    });
    editor?.eventBus?.emit?.('contentInserted', {
        textarea,
        latex,
        before,
        after,
        result: {
            start: range.start,
            end: cursor,
            text: latex,
            replacedGraph: true,
        },
    });

    return {
        before,
        after,
        start: range.start,
        end: cursor,
        text: latex,
        replacedGraph: true,
        previousGraphType: currentSpec.type,
        updatedGraphType: newSpec.type,
    };
}

window.MathEditor.registerTool({
    id: 'graph',
    metadata: {
        label: 'Graph',
        icon: '⌁',
        category: 'visualization',
        description: 'Mathematics, statistics and engineering graph builder',
        keywords: [
            'graph', 'plot', 'chart', 'statistics', 'data table', 'equation recognition', 'universal graph', 'textbook input', 'printed notation', 'bangla instruction', 'argand', 'inequality', 'function', 'polar', 'parametric',
            'circle', 'ellipse', 'parabola', 'hyperbola', 'histogram', 'ogive', 'grouped bar', 'stacked bar', 'multi series line', 'scientific scatter', 'error bar', 'linear regression', 'correlation', 'csv import', 'dataset storage', 'database dataset', 'saved dataset',
            'box plot', 'vector field', 'contour', 'composite', 'multi-shape',
            'intersection', 'mixed curves', 'piecewise', 'domain restriction', 'step function', 'open endpoint', 'closed endpoint',
            'region', 'inequality', 'shading', 'feasible region', 'area between curves',
            'calculus', 'tangent', 'normal', 'secant', 'definite integral', 'intercepts', 'extrema', 'stationary point',
            'implicit', 'level curve', 'multivariable', 'gradient', 'critical point', 'saddle point', 'singular point', 'implicit intersection',
            'geometry', 'interactive geometry', 'draggable point', 'triangle', 'polygon', 'midpoint', 'perpendicular bisector', 'angle bisector', 'parallel line', 'construction', 'measurement', 'snap to grid',
            '3d', '3d surface', 'space geometry', 'surface plot', 'parametric surface', 'sphere', 'cylinder', 'cone', 'helix', 'space curve', 'plane', '3d vector', 'perspective', 'wireframe', 'drag rotate',
            'smart layout', 'label collision', 'responsive legend', 'automatic panel position',
        ],
        order: 96,
    },
    dialog: async (args) => {
        try {
            return await graphDialog(args);
        } catch (error) {
            console.error('Edit Graph modal failed to open.', error);
            graphUpdateError(
                error?.message
                    ? `Edit Graph modal failed: ${error.message}`
                    : 'Edit Graph modal failed to open.'
            );
            return null;
        }
    },
    generateLatex: (payload) => encodeGraphToken(payload),
    execute: ({ editor, textarea, latex, options }) => {
        if (options?.existingGraphToken || options?.replaceRange) {
            return replaceGraphTokenExact({ editor, textarea, latex, options });
        }
        return editor.insertLatex(textarea, latex, {
            wrapWithNewlines: options?.wrapWithNewlines ?? true,
        });
    },
});
