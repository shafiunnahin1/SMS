import { compileMathExpression } from './graph-utils.js';
import GraphRegistry from './graph-registry.js';

export const GRAPH_AXIS_CONTROL_VERSION = '2.1.1';

const MAX_SAMPLE_COUNT = 720;
const MIN_SPAN = 1e-6;

function finiteValues(values) {
    return (Array.isArray(values) ? values : [])
        .map(Number)
        .filter(Number.isFinite);
}

function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, number));
}

function paddedRange(values, {
    padding = 0.12,
    includeZero = false,
    minimumSpan = 2,
    symmetric = false,
} = {}) {
    const finite = finiteValues(values);
    if (!finite.length) return null;

    let minimum = Math.min(...finite);
    let maximum = Math.max(...finite);

    if (includeZero) {
        minimum = Math.min(minimum, 0);
        maximum = Math.max(maximum, 0);
    }

    if (symmetric) {
        const extent = Math.max(Math.abs(minimum), Math.abs(maximum), minimumSpan / 2);
        minimum = -extent;
        maximum = extent;
    }

    if (!(maximum - minimum > MIN_SPAN)) {
        const center = (minimum + maximum) / 2;
        const half = Math.max(1, minimumSpan / 2, Math.abs(center) * 0.08);
        minimum = center - half;
        maximum = center + half;
    }

    const gap = Math.max(
        (maximum - minimum) * clamp(padding, 0, 0.5, 0.12),
        Math.min(1, (maximum - minimum) * 0.02),
    );

    return [minimum - gap, maximum + gap];
}

function groupedHistogramExtent(spec) {
    const bins = Array.isArray(spec.groupedBins) ? spec.groupedBins : [];
    const starts = finiteValues(bins.map((bin) => bin?.start));
    const ends = finiteValues(bins.map((bin) => bin?.end));
    const counts = finiteValues(bins.map((bin) => bin?.count));
    if (!starts.length || !ends.length || !counts.length) return null;

    return {
        x: paddedRange([...starts, ...ends], { padding: 0.04, minimumSpan: 2 }),
        y: paddedRange(counts, { padding: 0.12, includeZero: true, minimumSpan: 2 }),
    };
}

function rawHistogramExtent(spec) {
    const values = finiteValues(spec.values);
    if (!values.length) return null;

    const x = paddedRange(values, { padding: 0.08, minimumSpan: 2 });
    const binCount = Math.max(2, Math.min(60, Math.round(Number(spec.binCount) || Math.ceil(Math.sqrt(values.length)))));
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    let maximumCount = values.length;

    if (maximum > minimum) {
        const width = (maximum - minimum) / binCount;
        const counts = Array.from({ length: binCount }, () => 0);
        values.forEach((value) => {
            const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - minimum) / width)));
            counts[index] += 1;
        });
        maximumCount = Math.max(...counts, 1);
    }

    return {
        x,
        y: paddedRange([0, maximumCount], { padding: 0.12, includeZero: true, minimumSpan: 2 }),
    };
}

function dataChartRange(spec) {
    const type = String(spec.type || '');

    if (['scatter', 'line', 'frequency-polygon', 'ogive'].includes(type)) {
        const x = paddedRange(spec.x, {
            padding: type === 'ogive' ? 0.06 : 0.1,
            minimumSpan: 2,
        });
        const y = paddedRange(spec.y, {
            padding: 0.12,
            includeZero: type === 'frequency-polygon' || type === 'ogive',
            minimumSpan: 2,
        });
        return x && y ? { xMin: x[0], xMax: x[1], yMin: y[0], yMax: y[1] } : null;
    }

    if (type === 'bar') {
        const values = finiteValues(spec.values);
        if (!values.length) return null;
        const x = [-0.5, Math.max(1.5, values.length - 0.5)];
        const y = paddedRange(values, { padding: 0.12, includeZero: true, minimumSpan: 2 });
        return { xMin: x[0], xMax: x[1], yMin: y[0], yMax: y[1] };
    }

    if (type === 'histogram') {
        const extent = groupedHistogramExtent(spec) || rawHistogramExtent(spec);
        return extent ? {
            xMin: extent.x[0], xMax: extent.x[1],
            yMin: extent.y[0], yMax: extent.y[1],
        } : null;
    }

    if (type === 'box') {
        const x = paddedRange(spec.values, { padding: 0.1, minimumSpan: 2 });
        return x ? { xMin: x[0], xMax: x[1], yMin: 0, yMax: 2 } : null;
    }

    if (type === 'dot') {
        const values = finiteValues(spec.values);
        if (!values.length) return null;
        const counts = new Map();
        let maximumCount = 1;
        values.forEach((value) => {
            const count = (counts.get(value) || 0) + 1;
            counts.set(value, count);
            maximumCount = Math.max(maximumCount, count);
        });
        const x = paddedRange(values, { padding: 0.1, minimumSpan: 2 });
        const y = paddedRange([0, maximumCount], { padding: 0.12, includeZero: true, minimumSpan: 2 });
        return { xMin: x[0], xMax: x[1], yMin: y[0], yMax: y[1] };
    }

    return null;
}

function conicRange(spec) {
    const parameters = spec.params || {};
    const h = Number(parameters.h) || 0;
    const k = Number(parameters.k) || 0;

    if (spec.type === 'circle') {
        const radius = Math.max(0.1, Math.abs(Number(parameters.radius) || 4));
        const extent = radius * 1.18;
        return { xMin: h - extent, xMax: h + extent, yMin: k - extent, yMax: k + extent };
    }

    if (spec.type === 'ellipse') {
        const a = Math.max(0.1, Math.abs(Number(parameters.a) || 5)) * 1.18;
        const b = Math.max(0.1, Math.abs(Number(parameters.b) || 3)) * 1.18;
        return { xMin: h - a, xMax: h + a, yMin: k - b, yMax: k + b };
    }

    if (spec.type === 'parabola') {
        const focal = Number(parameters.p) || 2;
        const direction = Math.sign(focal) || 1;
        if (parameters.orientation === 'horizontal') {
            return {
                xMin: Math.min(h - 2, h + 12 * direction),
                xMax: Math.max(h + 2, h + 12 * direction),
                yMin: k - 10,
                yMax: k + 10,
            };
        }
        return {
            xMin: h - 10,
            xMax: h + 10,
            yMin: Math.min(k - 2, k + 12 * direction),
            yMax: Math.max(k + 2, k + 12 * direction),
        };
    }

    if (spec.type === 'hyperbola') {
        const a = Math.max(0.1, Math.abs(Number(parameters.a) || 3)) * 3;
        const b = Math.max(0.1, Math.abs(Number(parameters.b) || 2)) * 3;
        return { xMin: h - a, xMax: h + a, yMin: k - b, yMax: k + b };
    }

    return null;
}

function functionExpressions(spec) {
    if (Array.isArray(spec.series) && spec.series.length) {
        return spec.series
            .map((item) => String(item?.expression || '').trim())
            .filter(Boolean);
    }
    const expression = String(spec.expression || '').trim();
    return expression ? [expression] : [];
}

function functionRange(spec) {
    if (!['function', 'piecewise'].includes(spec.type)) return null;

    const xMinimum = Number.isFinite(Number(spec.xMin)) ? Number(spec.xMin) : -10;
    const xMaximum = Number.isFinite(Number(spec.xMax)) ? Number(spec.xMax) : 10;
    if (!(xMaximum > xMinimum)) return null;

    const expressions = functionExpressions(spec);
    if (!expressions.length) return null;

    const values = [];
    const sampleCount = Math.max(120, Math.min(MAX_SAMPLE_COUNT, Math.round(Number(spec.samples) || 420)));

    expressions.forEach((expression) => {
        const evaluator = compileMathExpression(expression, ['x']);
        if (!evaluator) return;

        for (let index = 0; index <= sampleCount; index += 1) {
            const x = xMinimum + (xMaximum - xMinimum) * index / sampleCount;
            const y = Number(evaluator(x));
            if (Number.isFinite(y) && Math.abs(y) < 1e8) values.push(y);
        }
    });

    if (!values.length) return null;

    // Trim extreme discontinuity samples so asymptotes do not flatten the useful curve.
    const sorted = values.slice().sort((left, right) => left - right);
    const trim = sorted.length >= 80 ? Math.floor(sorted.length * 0.015) : 0;
    const useful = trim > 0 ? sorted.slice(trim, sorted.length - trim) : sorted;
    const y = paddedRange(useful, {
        padding: Number(spec.autoRangePadding) || 0.12,
        includeZero: useful.some((value) => value < 0) && useful.some((value) => value > 0),
        minimumSpan: 2,
    });

    return y ? { xMin: xMinimum, xMax: xMaximum, yMin: y[0], yMax: y[1] } : null;
}

function pluginRange(spec) {
    const plugin = GraphRegistry.get(spec.type);
    if (typeof plugin?.autoRange !== 'function') return null;

    try {
        const output = plugin.autoRange(spec);
        if (!output || typeof output !== 'object') return null;

        const result = {};
        ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'].forEach((key) => {
            const value = Number(output[key]);
            if (Number.isFinite(value)) result[key] = value;
        });
        return Object.keys(result).length >= 4 ? result : null;
    } catch (error) {
        console.warn(`Auto range failed: ${spec.type}`, error);
        return null;
    }
}

function validRange(range) {
    return range
        && Number.isFinite(Number(range.xMin))
        && Number.isFinite(Number(range.xMax))
        && Number.isFinite(Number(range.yMin))
        && Number.isFinite(Number(range.yMax))
        && Number(range.xMax) > Number(range.xMin)
        && Number(range.yMax) > Number(range.yMin);
}

export function calculateGraphAutoRange(specInput = {}) {
    const spec = { ...(specInput || {}) };
    const candidates = [
        pluginRange(spec),
        dataChartRange(spec),
        conicRange(spec),
        functionRange(spec),
    ];

    const range = candidates.find(validRange);
    if (!range) return null;

    if (
        Number.isFinite(Number(range.zMin))
        && Number.isFinite(Number(range.zMax))
        && Number(range.zMax) > Number(range.zMin)
    ) {
        return range;
    }

    if (
        Number.isFinite(Number(spec.zMin))
        && Number.isFinite(Number(spec.zMax))
        && Number(spec.zMax) > Number(spec.zMin)
    ) {
        return { ...range, zMin: Number(spec.zMin), zMax: Number(spec.zMax) };
    }

    return range;
}

export function resolveGraphAxisRange(specInput = {}) {
    const spec = { ...(specInput || {}) };
    if (spec.axisMode !== 'auto') return spec;

    const range = calculateGraphAutoRange(spec);
    return range ? { ...spec, ...range, axisMode: 'auto' } : spec;
}

export function graphAxisSummary(specInput = {}) {
    const spec = resolveGraphAxisRange(specInput);
    const parts = [
        `X: ${formatAxisNumber(spec.xMin)} → ${formatAxisNumber(spec.xMax)}`,
        `Y: ${formatAxisNumber(spec.yMin)} → ${formatAxisNumber(spec.yMax)}`,
    ];
    if (Number.isFinite(Number(spec.zMin)) && Number.isFinite(Number(spec.zMax))) {
        parts.push(`Z: ${formatAxisNumber(spec.zMin)} → ${formatAxisNumber(spec.zMax)}`);
    }
    return parts.join(' • ');
}

export function formatAxisNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    const magnitude = Math.abs(number);
    if (magnitude >= 1e6 || (magnitude > 0 && magnitude < 1e-4)) {
        return number.toExponential(3);
    }
    return String(Math.round(number * 10000) / 10000);
}
