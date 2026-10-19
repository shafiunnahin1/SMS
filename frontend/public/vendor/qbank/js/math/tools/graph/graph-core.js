import GraphRegistry from './graph-registry.js';
import {
    GRAPH_AXIS_CONTROL_VERSION,
    resolveGraphAxisRange,
} from './graph-axis-range.js?v=20260801-guest-browser-storage-1';
import { registerBuiltinGraphs } from './plugins/builtin-plugins.js?v=20260801-guest-browser-storage-1';
import { registerPiecewiseGraph } from './plugins/piecewise-plugin.js?v=20260731-piecewise-1';
import { registerRegionGraph } from './plugins/region-plugin.js?v=20260731-region-1';
import { registerCalculusGraph } from './plugins/calculus-plugin.js?v=20260731-calculus-input-fix-1';
import { registerImplicitGraph } from './plugins/implicit-plugin.js?v=20260731-implicit-1';
import { registerGeometryGraph } from './plugins/geometry-plugin.js?v=20260731-exact-update-1';
import { registerSpace3dGraph } from './plugins/space3d-plugin.js?v=20260801-guest-browser-storage-1';
import { registerCompositeGraph } from './plugins/composite-plugin.js?v=20260731-piecewise-1';
import {
    STATISTICS_SCIENTIFIC_PLUGIN_VERSION,
    registerStatisticsScientificGraphs,
} from './plugins/statistics-scientific-plugin.js?v=20260801-guest-browser-storage-1';
import {
    GRAPH_COLORS,
    clamp,
    escapeAttribute,
    escapeXml,
    finiteArray,
    formatTick,
    makeTicks,
    normalizeColors,
    safeColor,
    stringArray,
    toEnglishDigits,
    uniqueId,
} from './graph-utils.js';

const TOKEN_PATTERN = /\[\[qmx-graph:([A-Za-z0-9_-]{10,60000})\]\]/g;
const TOKEN_EXACT_PATTERN = /^\[\[qmx-graph:([A-Za-z0-9_-]+)\]\]$/;

registerBuiltinGraphs(GraphRegistry);
registerPiecewiseGraph(GraphRegistry);
registerRegionGraph(GraphRegistry);
registerCalculusGraph(GraphRegistry);
registerImplicitGraph(GraphRegistry);
registerGeometryGraph(GraphRegistry);
registerSpace3dGraph(GraphRegistry);
registerStatisticsScientificGraphs(GraphRegistry);
registerCompositeGraph(GraphRegistry);

function utf8ToBase64Url(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToUtf8(value) {
    const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function validRange(minimum, maximum, fallbackMinimum, fallbackMaximum) {
    let min = clamp(minimum, -1e9, 1e9, fallbackMinimum);
    let max = clamp(maximum, -1e9, 1e9, fallbackMaximum);
    if (!(max > min)) {
        min = fallbackMinimum;
        max = fallbackMaximum;
    }
    if (max - min < 1e-9) {
        const center = (min + max) / 2;
        min = center - 1;
        max = center + 1;
    }
    return [min, max];
}

function migrateLegacy(input) {
    const migrated = { ...(input || {}) };
    if (migrated.type === 'function' && !migrated.series?.length && migrated.expression) {
        migrated.series = [{
            expression: migrated.expression,
            label: migrated.expression,
            color: migrated.color,
        }];
    }
    if (['bar', 'histogram', 'pie', 'box', 'dot'].includes(migrated.type)
        && (!Array.isArray(migrated.values) || !migrated.values.length)
        && Array.isArray(migrated.y)) {
        migrated.values = migrated.y;
    }
    return migrated;
}

export function normalizeSpec(input = {}) {
    const migrated = migrateLegacy(input);
    const type = GraphRegistry.has(migrated.type) ? migrated.type : 'function';
    const [xMin, xMax] = validRange(migrated.xMin, migrated.xMax, -10, 10);
    const [yMin, yMax] = validRange(migrated.yMin, migrated.yMax, -10, 10);
    const axisMode = migrated.axisMode === 'auto' || migrated.axisMode === 'manual'
        ? migrated.axisMode
        : (migrated.autoZRange === true ? 'auto' : 'manual');
    const autoRangePadding = clamp(migrated.autoRangePadding, 0, 0.5, 0.12);
    const colors = normalizeColors(migrated.colors);
    const base = {
        version: 1,
        id: String(migrated.id || uniqueId('graph')).slice(0, 120),
        type,
        title: String(migrated.title || '').slice(0, 160),
        subtitle: String(migrated.subtitle || '').slice(0, 240),
        expression: String(migrated.expression || '').slice(0, 1000),
        xLabel: String(migrated.xLabel ?? 'x').slice(0, 60),
        yLabel: String(migrated.yLabel ?? 'y').slice(0, 60),
        xMin,
        xMax,
        yMin,
        yMax,
        axisMode,
        autoRangePadding,
        labels: stringArray(migrated.labels),
        x: finiteArray(migrated.x),
        y: finiteArray(migrated.y),
        values: finiteArray(migrated.values),
        colors,
        color: safeColor(migrated.color, colors[0]),
        background: safeColor(migrated.background, '#ffffff'),
        grid: migrated.grid !== false,
        minorGrid: migrated.minorGrid === true,
        showAxes: migrated.showAxes !== false,
        showTickLabels: migrated.showTickLabels !== false,
        legend: migrated.legend !== false,
        tickCount: clamp(migrated.tickCount, 2, 20, 10),
        aspectLock: migrated.aspectLock,
        source: String(migrated.source || '').slice(0, 5000),
        width: clamp(migrated.width, 360, 1600, 720),
        height: clamp(migrated.height, 240, 1000, 420),
        params: migrated.params && typeof migrated.params === 'object' ? { ...migrated.params } : {},
        series: Array.isArray(migrated.series) ? migrated.series.slice(0, 50).map((item) => ({ ...item })) : [],
        ...Object.fromEntries(Object.entries(migrated).filter(([key, value]) => (
            value !== undefined && !['version', 'id', 'type'].includes(key)
        ))),
    };
    const pluginSpec = GraphRegistry.normalize(type, base);
    return {
        ...pluginSpec,
        version: 1,
        id: String(pluginSpec.id || base.id).slice(0, 120),
        type,
        title: String(pluginSpec.title || '').slice(0, 160),
        subtitle: String(pluginSpec.subtitle || '').slice(0, 240),
        xLabel: String(pluginSpec.xLabel ?? 'x').slice(0, 60),
        yLabel: String(pluginSpec.yLabel ?? 'y').slice(0, 60),
        xMin,
        xMax,
        yMin,
        yMax,
        axisMode: pluginSpec.axisMode === 'auto' ? 'auto' : (pluginSpec.axisMode === 'manual' ? 'manual' : axisMode),
        autoRangePadding: clamp(pluginSpec.autoRangePadding, 0, 0.5, autoRangePadding),
        colors,
        color: safeColor(pluginSpec.color, colors[0]),
        background: safeColor(pluginSpec.background, '#ffffff'),
        grid: pluginSpec.grid !== false,
        minorGrid: pluginSpec.minorGrid === true,
        showAxes: pluginSpec.showAxes !== false,
        showTickLabels: pluginSpec.showTickLabels !== false,
        legend: pluginSpec.legend !== false,
        tickCount: clamp(pluginSpec.tickCount, 2, 20, 10),
        aspectLock: pluginSpec.aspectLock === true,
        width: clamp(pluginSpec.width, 360, 1600, 720),
        height: clamp(pluginSpec.height, 240, 1000, 420),
        source: String(pluginSpec.source || '').slice(0, 5000),
    };
}

export function validateGraphSpec(input) {
    const spec = normalizeSpec(input);
    const errors = [];
    if (!(spec.xMax > spec.xMin)) errors.push('X maximum অবশ্যই X minimum-এর চেয়ে বড় হবে।');
    if (!(spec.yMax > spec.yMin)) errors.push('Y maximum অবশ্যই Y minimum-এর চেয়ে বড় হবে।');
    return [...errors, ...GraphRegistry.validate(spec)];
}

export function encodeGraphToken(spec) {
    const normalized = normalizeSpec(spec);
    return `[[qmx-graph:${utf8ToBase64Url(JSON.stringify(normalized))}]]`;
}

export function decodeGraphToken(token) {
    const match = String(token || '').match(TOKEN_EXACT_PATTERN);
    if (!match) return null;
    try {
        const parsed = JSON.parse(base64UrlToUtf8(match[1]));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return normalizeSpec(parsed);
    } catch (error) {
        return null;
    }
}

export function detectGraphSpec(rawSource = '') {
    const source = String(rawSource || '');
    const detected = GraphRegistry.detect(source);
    if (detected?.spec) return normalizeSpec({ ...detected.spec, source: rawSource });

    const numbers = toEnglishDigits(source).match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (numbers.length >= 3) {
        return normalizeSpec({
            type: 'line',
            x: numbers.map((_, index) => index + 1),
            y: numbers,
            source: rawSource,
        });
    }
    return normalizeSpec({ type: 'function', expression: 'x^2', source: rawSource });
}

function applyAspectLock(spec, plotWidth, plotHeight) {
    let { xMin, xMax, yMin, yMax } = spec;
    if (!spec.aspectLock) return { xMin, xMax, yMin, yMax };
    const xCenter = (xMin + xMax) / 2;
    const yCenter = (yMin + yMax) / 2;
    const xUnitsPerPixel = (xMax - xMin) / plotWidth;
    const yUnitsPerPixel = (yMax - yMin) / plotHeight;
    const target = Math.max(xUnitsPerPixel, yUnitsPerPixel);
    const halfX = target * plotWidth / 2;
    const halfY = target * plotHeight / 2;
    xMin = xCenter - halfX;
    xMax = xCenter + halfX;
    yMin = yCenter - halfY;
    yMax = yCenter + halfY;
    return { xMin, xMax, yMin, yMax };
}

function axisMarkup(spec, context) {
    if (!spec.showAxes) return '';
    const parts = [];
    const xTicks = makeTicks(context.xMin, context.xMax, spec.tickCount);
    const yTicks = makeTicks(context.yMin, context.yMax, spec.tickCount);

    if (spec.minorGrid && spec.grid) {
        const subdivisions = 5;
        const xStep = xTicks.length > 1 ? (xTicks[1] - xTicks[0]) / subdivisions : 0;
        const yStep = yTicks.length > 1 ? (yTicks[1] - yTicks[0]) / subdivisions : 0;
        if (xStep > 0) {
            for (let value = Math.ceil(context.xMin / xStep) * xStep; value <= context.xMax; value += xStep) {
                parts.push(`<line x1="${context.sx(value)}" y1="${context.margin.top}" x2="${context.sx(value)}" y2="${context.margin.top + context.plotHeight}" stroke="#f1f5f9" stroke-width=".7"/>`);
            }
        }
        if (yStep > 0) {
            for (let value = Math.ceil(context.yMin / yStep) * yStep; value <= context.yMax; value += yStep) {
                parts.push(`<line x1="${context.margin.left}" y1="${context.sy(value)}" x2="${context.margin.left + context.plotWidth}" y2="${context.sy(value)}" stroke="#f1f5f9" stroke-width=".7"/>`);
            }
        }
    }

    if (spec.grid) {
        xTicks.forEach((value) => {
            parts.push(`<line x1="${context.sx(value)}" y1="${context.margin.top}" x2="${context.sx(value)}" y2="${context.margin.top + context.plotHeight}" stroke="#e2e8f0"/>`);
        });
        yTicks.forEach((value) => {
            parts.push(`<line x1="${context.margin.left}" y1="${context.sy(value)}" x2="${context.margin.left + context.plotWidth}" y2="${context.sy(value)}" stroke="#e2e8f0"/>`);
        });
    }

    const axisY = context.yMin <= 0 && context.yMax >= 0 ? context.sy(0) : context.margin.top + context.plotHeight;
    const axisX = context.xMin <= 0 && context.xMax >= 0 ? context.sx(0) : context.margin.left;
    parts.push(`<rect x="${context.margin.left}" y="${context.margin.top}" width="${context.plotWidth}" height="${context.plotHeight}" fill="none" stroke="#94a3b8"/>`);
    parts.push(`<line x1="${context.margin.left}" y1="${axisY}" x2="${context.margin.left + context.plotWidth}" y2="${axisY}" stroke="#0f172a" stroke-width="1.35"/>`);
    parts.push(`<line x1="${axisX}" y1="${context.margin.top}" x2="${axisX}" y2="${context.margin.top + context.plotHeight}" stroke="#0f172a" stroke-width="1.35"/>`);

    if (spec.showTickLabels) {
        xTicks.forEach((value) => {
            if (Math.abs(value) < 1e-12 && context.yMin <= 0 && context.yMax >= 0) return;
            parts.push(`<line x1="${context.sx(value)}" y1="${axisY - 4}" x2="${context.sx(value)}" y2="${axisY + 4}" stroke="#0f172a"/>`);
            parts.push(`<text x="${context.sx(value)}" y="${Math.min(context.margin.top + context.plotHeight + 16, axisY + 16)}" text-anchor="middle" font-size="10.5" fill="#475569">${escapeXml(formatTick(value))}</text>`);
        });
        yTicks.forEach((value) => {
            if (Math.abs(value) < 1e-12 && context.xMin <= 0 && context.xMax >= 0) return;
            parts.push(`<line x1="${axisX - 4}" y1="${context.sy(value)}" x2="${axisX + 4}" y2="${context.sy(value)}" stroke="#0f172a"/>`);
            parts.push(`<text x="${Math.max(8, axisX - 7)}" y="${context.sy(value) + 3.5}" text-anchor="end" font-size="10.5" fill="#475569">${escapeXml(formatTick(value))}</text>`);
        });
    }

    if (spec.xLabel) {
        parts.push(`<text x="${context.margin.left + context.plotWidth / 2}" y="${context.margin.top + context.plotHeight + 38}" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">${escapeXml(spec.xLabel)}</text>`);
    }
    if (spec.yLabel) {
        parts.push(`<text x="${context.margin.left - 47}" y="${context.margin.top + context.plotHeight / 2}" text-anchor="middle" font-size="12" font-weight="600" fill="#334155" transform="rotate(-90 ${context.margin.left - 47} ${context.margin.top + context.plotHeight / 2})">${escapeXml(spec.yLabel)}</text>`);
    }
    return parts.join('');
}

function legendRectOverlapArea(a, b) {
    if (!a || !b) return 0;
    const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return width * height;
}

function legendBoxScore(box, options) {
    let score = 0;
    (options.avoidBoxes || []).forEach((other) => {
        score += legendRectOverlapArea(box, other) * 20;
    });
    (options.heatPoints || []).forEach((point) => {
        if (point.x >= box.x && point.x <= box.x + box.width
            && point.y >= box.y && point.y <= box.y + box.height) {
            score += 60 * Math.max(1, Number(point.weight) || 1);
        }
    });
    return score;
}

function legendMarkup(entries, context, options = {}) {
    if (!entries?.length || options.hidden) return '';
    const compact = context.baseWidth <= 520 || context.plotWidth <= 450;
    const lineHeight = compact ? 17 : 20;
    const fontSize = compact ? 9.1 : 10.4;
    const requestedMax = Math.max(1, Math.min(30, Number(options.maxItems) || 18));
    const allItems = entries.slice(0, requestedMax);
    const hiddenCount = Math.max(0, entries.length - allItems.length);
    const maxRows = Math.max(2, Math.floor((context.plotHeight * .48 - 14) / lineHeight));
    const columns = Math.max(1, Math.min(3, Math.ceil(allItems.length / maxRows)));
    const rows = Math.max(1, Math.ceil(allItems.length / columns));
    const maxChars = compact ? 18 : (columns > 1 ? 20 : 28);
    const labels = allItems.map((item) => {
        const text = String(item.label || '');
        return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
    });
    const maximumLength = Math.max(...labels.map((label) => label.length), 4);
    const columnWidth = Math.min(compact ? 150 : 210, Math.max(92, maximumLength * fontSize * .57 + 34));
    const preferredWidth = columnWidth * columns + 8;
    const footerHeight = hiddenCount ? 13 : 0;
    const preferredHeight = rows * lineHeight + 14 + footerHeight;
    const inset = 8;

    const candidates = {
        'top-right': { x: context.margin.left + context.plotWidth - Math.min(context.plotWidth - 16, preferredWidth) - inset, y: context.margin.top + inset, width: Math.min(context.plotWidth - 16, preferredWidth), height: Math.min(context.plotHeight - 16, preferredHeight) },
        'top-left': { x: context.margin.left + inset, y: context.margin.top + inset, width: Math.min(context.plotWidth - 16, preferredWidth), height: Math.min(context.plotHeight - 16, preferredHeight) },
        'bottom-right': { x: context.margin.left + context.plotWidth - Math.min(context.plotWidth - 16, preferredWidth) - inset, y: context.margin.top + context.plotHeight - Math.min(context.plotHeight - 16, preferredHeight) - inset, width: Math.min(context.plotWidth - 16, preferredWidth), height: Math.min(context.plotHeight - 16, preferredHeight) },
        'bottom-left': { x: context.margin.left + inset, y: context.margin.top + context.plotHeight - Math.min(context.plotHeight - 16, preferredHeight) - inset, width: Math.min(context.plotWidth - 16, preferredWidth), height: Math.min(context.plotHeight - 16, preferredHeight) },
    };

    const addSideCandidates = (name) => {
        const band = context.bands?.[name];
        if (!band) return;
        const width = Math.max(110, band.width - inset * 2);
        const height = Math.min(preferredHeight, band.height - inset * 2);
        candidates[`outside-${name}-top`] = { x: band.x + inset, y: band.y + inset, width, height };
        candidates[`outside-${name}-bottom`] = { x: band.x + inset, y: band.y + band.height - height - inset, width, height };
    };
    addSideCandidates('left');
    addSideCandidates('right');

    const bottomBand = context.bands?.bottom;
    if (bottomBand) {
        const width = Math.min(preferredWidth, Math.max(130, bottomBand.width * .42));
        const height = Math.min(preferredHeight, bottomBand.height - inset * 2);
        candidates['outside-bottom-left'] = { x: bottomBand.x + inset, y: bottomBand.y + inset, width, height };
        candidates['outside-bottom-right'] = { x: bottomBand.x + bottomBand.width - width - inset, y: bottomBand.y + inset, width, height };
    }

    const requestedOrder = options.preferredPositions?.length
        ? options.preferredPositions
        : ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
    const order = requestedOrder.filter((name) => candidates[name]);
    const fallbackOrder = Object.keys(candidates);
    const finalOrder = order.length ? order : fallbackOrder;
    let position = finalOrder[0];
    let box = candidates[position];
    let bestScore = Infinity;

    finalOrder.forEach((name, index) => {
        const candidate = candidates[name];
        if (!candidate) return;
        const score = legendBoxScore(candidate, options) + index * .01;
        if (score < bestScore) {
            bestScore = score;
            box = candidate;
            position = name;
        }
    });

    const availableRows = Math.max(1, Math.floor((box.height - 14 - footerHeight) / lineHeight));
    const actualColumns = position.startsWith('outside-left') || position.startsWith('outside-right')
        ? 1
        : Math.max(1, Math.min(columns, Math.ceil(allItems.length / availableRows)));
    const actualRows = Math.max(1, Math.ceil(allItems.length / actualColumns));
    const actualColumnWidth = box.width / actualColumns;
    const visibleCapacity = Math.max(1, actualRows * actualColumns);
    const visibleItems = allItems.slice(0, visibleCapacity);
    const overflow = hiddenCount + Math.max(0, allItems.length - visibleItems.length);

    const parts = [
        `<g class="qmx-graph-legend" data-qmx-legend-position="${position}" data-qmx-legend-columns="${actualColumns}" data-qmx-layout="${compact ? 'compact' : 'regular'}" data-qmx-box="${box.x.toFixed(2)},${box.y.toFixed(2)},${box.width.toFixed(2)},${box.height.toFixed(2)}">`,
        `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="6" fill="#ffffff" fill-opacity=".94" stroke="#cbd5e1"/>`,
    ];

    visibleItems.forEach((item, index) => {
        const column = Math.floor(index / availableRows);
        const row = index % availableRows;
        const columnX = box.x + 8 + column * actualColumnWidth;
        const rowY = box.y + 15 + row * lineHeight;
        const color = safeColor(item.color, context.colors[index % context.colors.length]);
        if (item.kind === 'point') parts.push(`<circle cx="${columnX + 5}" cy="${rowY - 3}" r="4" fill="${color}"/>`);
        else if (item.kind === 'box') parts.push(`<rect x="${columnX}" y="${rowY - 8}" width="10" height="10" fill="${color}"/>`);
        else parts.push(`<line x1="${columnX}" y1="${rowY - 3}" x2="${columnX + 13}" y2="${rowY - 3}" stroke="${color}" stroke-width="3"/>`);
        const availableChars = Math.max(8, Math.floor((actualColumnWidth - 28) / (fontSize * .57)));
        const raw = String(item.label || '');
        const display = raw.length > availableChars ? `${raw.slice(0, availableChars - 1)}…` : raw;
        parts.push(`<text x="${columnX + 19}" y="${rowY}" font-size="${fontSize}" fill="#334155">${escapeXml(display)}</text>`);
    });

    if (overflow) {
        parts.push(`<text x="${box.x + box.width - 8}" y="${box.y + box.height - 5}" text-anchor="end" font-size="9" fill="#64748b">+${overflow} more</text>`);
    }
    parts.push('</g>');
    return parts.join('');
}

export function graphSvg(input, requestedWidth, requestedHeight) {
    const normalizedSpec = normalizeSpec(input);
    const spec = resolveGraphAxisRange(normalizedSpec);
    const plugin = GraphRegistry.get(spec.type);
    const baseWidth = clamp(requestedWidth ?? spec.width, 360, 1600, 720);
    const baseHeight = clamp(requestedHeight ?? spec.height, 240, 1000, 420);
    let layoutPlan = {};
    try {
        layoutPlan = typeof plugin?.layout === 'function'
            ? (plugin.layout(spec, { width: baseWidth, height: baseHeight }) || {})
            : {};
    } catch (error) {
        console.warn(`Graph layout planning failed: ${spec.type}`, error);
        layoutPlan = {};
    }
    const extraLeft = clamp(layoutPlan.extraLeft, 0, 420, 0);
    const extraRight = clamp(layoutPlan.extraRight, 0, 420, 0);
    const extraBottom = clamp(layoutPlan.extraBottom, 0, 320, 0);
    const extraTop = clamp(layoutPlan.extraTop, 0, 220, 0);
    const width = baseWidth + extraLeft + extraRight;
    const height = baseHeight + extraTop + extraBottom;
    const titleLines = (spec.title ? 1 : 0) + (spec.subtitle ? 1 : 0);
    const baseMargin = {
        left: plugin?.axes === 'none' ? 24 : 62,
        right: 24,
        top: 22 + titleLines * 22,
        bottom: plugin?.axes === 'none' ? 24 : 52,
    };
    const margin = {
        left: baseMargin.left + extraLeft,
        right: baseMargin.right + extraRight,
        top: baseMargin.top + extraTop,
        bottom: baseMargin.bottom + extraBottom,
    };
    const plotWidth = baseWidth - baseMargin.left - baseMargin.right;
    const plotHeight = baseHeight - baseMargin.top - baseMargin.bottom;
    const adjusted = applyAspectLock(spec, plotWidth, plotHeight);
    const { xMin, xMax, yMin, yMax } = adjusted;
    const sx = (x) => margin.left + ((x - xMin) / (xMax - xMin)) * plotWidth;
    const sy = (y) => margin.top + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight;
    const clipId = `clip_${String(spec.id).replace(/[^A-Za-z0-9_-]/g, '')}_${Math.random().toString(36).slice(2, 7)}`;
    const context = {
        spec,
        width,
        height,
        baseWidth,
        baseHeight,
        margin,
        plotWidth,
        plotHeight,
        layout: layoutPlan.meta || {},
        bands: {
            left: extraLeft > 0 ? { x: 0, y: margin.top, width: extraLeft, height: plotHeight } : null,
            right: extraRight > 0 ? { x: margin.left + plotWidth + baseMargin.right, y: margin.top, width: extraRight, height: plotHeight } : null,
            bottom: extraBottom > 0 ? { x: margin.left, y: margin.top + plotHeight + baseMargin.bottom, width: plotWidth, height: extraBottom } : null,
            top: extraTop > 0 ? { x: margin.left, y: 0, width: plotWidth, height: extraTop } : null,
        },
        xMin,
        xMax,
        yMin,
        yMax,
        sx,
        sy,
        colors: spec.colors,
        clipId,
        escapeXml,
        inBounds: (x, y) => x >= xMin && x <= xMax && y >= yMin && y <= yMax,
        inExtendedBounds: (x, y) => x >= xMin - (xMax - xMin) * .05
            && x <= xMax + (xMax - xMin) * .05
            && y >= yMin - (yMax - yMin) * 1.5
            && y <= yMax + (yMax - yMin) * 1.5,
        message: (text, color = '#475569', row = 0) => `<text x="${width / 2}" y="${height / 2 + row * 18}" text-anchor="middle" font-size="13" fill="${safeColor(color, '#475569')}">${escapeXml(text)}</text>`,
    };

    let rendered = { content: '', legend: [] };
    try {
        const output = plugin?.render(spec, context);
        rendered = typeof output === 'string' ? { content: output, legend: [] } : (output || rendered);
    } catch (error) {
        console.error(`Graph renderer failed: ${spec.type}`, error);
        rendered = { content: context.message('Graph render করা যায়নি।', '#dc2626'), legend: [] };
    }

    const parts = [
        `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(spec.title || plugin?.label || 'Graph')}" xmlns="http://www.w3.org/2000/svg">`,
        `<rect width="100%" height="100%" fill="${spec.background}"/>`,
        `<defs><clipPath id="${clipId}"><rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"/></clipPath></defs>`,
    ];
    if (spec.title) parts.push(`<text x="${margin.left + plotWidth / 2}" y="24" text-anchor="middle" font-size="17" font-weight="700" fill="#0f172a">${escapeXml(spec.title)}</text>`);
    if (spec.subtitle) parts.push(`<text x="${margin.left + plotWidth / 2}" y="${spec.title ? 44 : 24}" text-anchor="middle" font-size="11.5" fill="#64748b">${escapeXml(spec.subtitle)}</text>`);
    if (plugin?.axes !== 'none' && plugin?.axes !== 'custom') parts.push(axisMarkup(spec, context));
    parts.push(rendered.content || '');
    if (spec.legend) parts.push(legendMarkup(rendered.legend || [], context, rendered.legendOptions || {}));
    parts.push('</svg>');
    return parts.join('');
}

export function tokensToHtml(controlledHtml) {
    TOKEN_PATTERN.lastIndex = 0;
    return String(controlledHtml || '').replace(TOKEN_PATTERN, (token) => {
        const spec = decodeGraphToken(token);
        if (!spec) return token;
        const payload = token.slice('[[qmx-graph:'.length, -2);
        return `<figure class="qmx-graph" data-qmx-graph="${escapeAttribute(payload)}" data-qmx-graph-type="${escapeAttribute(spec.type)}" tabindex="0">${graphSvg(spec)}${spec.title ? `<figcaption>${escapeXml(spec.title)}</figcaption>` : ''}</figure>`;
    });
}

export function renderGraphElement(element) {
    const payload = element?.dataset?.qmxGraph;
    if (!payload) return null;
    const spec = decodeGraphToken(`[[qmx-graph:${payload}]]`);
    if (!spec) return null;
    element.dataset.qmxGraphType = spec.type;
    element.innerHTML = `${graphSvg(spec)}${spec.title ? `<figcaption>${escapeXml(spec.title)}</figcaption>` : ''}`;
    return spec;
}

export function getGraphPlugins() {
    return GraphRegistry.list().map((plugin) => ({
        id: plugin.id,
        label: plugin.label,
        group: plugin.group,
        description: plugin.description,
        editor: plugin.editor,
    }));
}

export { GraphRegistry };

window.QmxGraph = {
    version: '1.8.0',
    axisControlVersion: GRAPH_AXIS_CONTROL_VERSION,
    statisticsScientificVersion: STATISTICS_SCIENTIFIC_PLUGIN_VERSION,
    normalizeSpec,
    validateGraphSpec,
    encodeGraphToken,
    decodeGraphToken,
    detectGraphSpec,
    graphSvg,
    tokensToHtml,
    renderGraphElement,
    getGraphPlugins,
    registry: GraphRegistry,
};
