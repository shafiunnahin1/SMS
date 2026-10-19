import {
    GRAPH_COLORS,
    clamp,
    compileMathExpression,
    safeColor,
    svgPathFromPoints,
    toEnglishDigits,
} from '../graph-utils.js';

const CURVE_KINDS = new Set(['curve', 'function']);
const OPERATION_KINDS = new Set([
    'tangent',
    'normal',
    'secant',
    'area',
    'integral',
    'between',
    'markers',
    'points',
    'analyze',
]);

function normalizeKind(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
}

function normalizePanelPlacement(value) {
    const normalized = String(value || 'auto').trim().toLowerCase();
    return ['auto', 'inside', 'left', 'right', 'bottom', 'hidden'].includes(normalized)
        ? normalized
        : 'auto';
}

function normalizeLegendPlacement(value) {
    const normalized = String(value || 'auto').trim().toLowerCase();
    return ['auto', 'inside', 'left', 'right', 'bottom', 'hidden'].includes(normalized)
        ? normalized
        : 'auto';
}

function calculusDensity(spec) {
    const operations = Array.isArray(spec.operations) ? spec.operations : [];
    const curves = Array.isArray(spec.curves) ? spec.curves : [];
    const markerWeight = operations.some((operation) => operation.kind === 'markers') ? 4 : 0;
    return curves.length + operations.length * 2 + markerWeight;
}

function resolvedPanelPlacement(spec, baseWidth = 720) {
    const requested = normalizePanelPlacement(spec.panelPlacement);
    if (!spec.showCalculationPanel || requested === 'hidden') return 'hidden';
    if (requested !== 'auto') return requested;

    const dense = calculusDensity(spec) >= 9 || spec.maxCalculationRows >= 8;
    if (!dense) return 'inside';
    return baseWidth >= 620 ? 'right' : 'bottom';
}

function resolvedLegendPlacement(spec, panelPlacement, baseWidth = 720) {
    const requested = normalizeLegendPlacement(spec.legendPlacement);
    if (spec.legend === false || requested === 'hidden') return 'hidden';
    if (requested !== 'auto') return requested;

    if (['left', 'right', 'bottom'].includes(panelPlacement)) return panelPlacement;
    if (calculusDensity(spec) >= 9) return baseWidth >= 620 ? 'right' : 'bottom';
    return 'inside';
}

function calculusLayoutPlan(spec, dimensions = {}) {
    const baseWidth = Number(dimensions.width) || 720;
    const panelPlacement = resolvedPanelPlacement(spec, baseWidth);
    const legendPlacement = resolvedLegendPlacement(spec, panelPlacement, baseWidth);
    const sideSize = Math.round(clamp(spec.outsidePanelWidth, 190, 380, 270));
    const bottomSize = Math.round(clamp(spec.outsidePanelHeight, 105, 280, 165));
    const usesLeft = panelPlacement === 'left' || legendPlacement === 'left';
    const usesRight = panelPlacement === 'right' || legendPlacement === 'right';
    const usesBottom = panelPlacement === 'bottom' || legendPlacement === 'bottom';

    return {
        extraLeft: usesLeft ? sideSize : 0,
        extraRight: usesRight ? sideSize : 0,
        extraBottom: usesBottom ? bottomSize : 0,
        meta: {
            panelPlacement,
            legendPlacement,
            dense: calculusDensity(spec) >= 9,
        },
    };
}

function normalizeCurveKey(value) {
    return String(value || '').trim().toLowerCase();
}

function parseColor(parts, fallback) {
    const candidate = parts.find((part) => /^#[0-9a-f]{6}$/i.test(String(part || '').trim()));
    return safeColor(candidate, fallback);
}

function parseOpacity(parts, fallback) {
    for (const part of parts) {
        const match = String(part || '').match(/^(?:opacity|alpha)\s*=\s*(\d*\.?\d+)$/i);
        if (match) return clamp(match[1], .03, .9, fallback);
    }
    return fallback;
}

function parseKeyValues(parts) {
    const result = {};

    parts.forEach((part) => {
        String(part || '')
            .split(/\s*,\s*/)
            .map((item) => item.trim())
            .filter(Boolean)
            .forEach((item) => {
                const match = item.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/);
                if (match) {
                    result[match[1].toLowerCase()] = match[2].trim();
                }
            });
    });

    return result;
}

function numberOption(options, names, fallback = NaN) {
    for (const name of names) {
        const value = Number(toEnglishDigits(options[name]));
        if (Number.isFinite(value)) return value;
    }
    return fallback;
}

function textOption(options, names, fallback = '') {
    for (const name of names) {
        if (options[name] !== undefined && String(options[name]).trim()) {
            return String(options[name]).trim();
        }
    }
    return fallback;
}

function parseMarkerItems(value) {
    const normalized = String(value || '')
        .toLowerCase()
        .replace(/\bx\s*[- ]?intercepts?\b/g, 'x-intercepts')
        .replace(/\by\s*[- ]?intercepts?\b/g, 'y-intercept')
        .replace(/\bturning\s*[- ]?points?\b/g, 'extrema')
        .replace(/\bmaxima?\b/g, 'extrema')
        .replace(/\bminima?\b/g, 'extrema')
        .split(/\s*,\s*|\s*;\s*/)
        .map((item) => item.trim())
        .filter(Boolean);

    const expanded = [];

    normalized.forEach((item) => {
        if (item === 'intercepts' || item === 'all-intercepts') {
            expanded.push('x-intercepts', 'y-intercept');
        } else if (item === 'all') {
            expanded.push('x-intercepts', 'y-intercept', 'extrema', 'stationary');
        } else if (['x-intercepts', 'y-intercept', 'extrema', 'stationary'].includes(item)) {
            expanded.push(item);
        }
    });

    return [...new Set(expanded.length
        ? expanded
        : ['x-intercepts', 'y-intercept', 'extrema', 'stationary'])];
}

function curveLine(curve) {
    const color = curve.color ? ` | ${curve.color}` : '';
    return `curve | ${curve.label} | ${curve.expression}${color}`;
}

function operationLine(operation) {
    const color = operation.color ? ` | ${operation.color}` : '';
    const opacity = Number.isFinite(Number(operation.opacity))
        ? ` | opacity=${Number(operation.opacity)}`
        : '';

    if (operation.kind === 'tangent' || operation.kind === 'normal') {
        return `${operation.kind} | ${operation.curve} | x=${operation.x}${color}`;
    }

    if (operation.kind === 'secant') {
        return `secant | ${operation.curve} | x1=${operation.x1}, x2=${operation.x2}${color}`;
    }

    if (operation.kind === 'area' || operation.kind === 'integral') {
        return `${operation.kind} | ${operation.curve} | from=${operation.from}, to=${operation.to}, baseline=${operation.baseline}, mode=${operation.mode}${color}${opacity}`;
    }

    if (operation.kind === 'between') {
        return `between | ${operation.curveA} | ${operation.curveB} | from=${operation.from}, to=${operation.to}, mode=${operation.mode}${color}${opacity}`;
    }

    if (operation.kind === 'markers') {
        return `markers | ${operation.curve} | ${operation.items.join(', ')}${color}`;
    }

    return '';
}

export function formatCalculusInput(curves, operations) {
    return [
        ...(curves || []).map(curveLine),
        ...(operations || []).map(operationLine).filter(Boolean),
    ].join('\n');
}

function parseCurve(parts, index) {
    const label = String(parts[1] || `f${index + 1}`).trim().slice(0, 80);
    const expression = String(parts[2] || '').trim().slice(0, 1000);
    return {
        label,
        key: normalizeCurveKey(label),
        expression,
        color: parseColor(parts.slice(3), GRAPH_COLORS[index % GRAPH_COLORS.length]),
        visible: true,
    };
}

function parseOperation(parts, index, defaultOpacity) {
    const kind = normalizeKind(parts[0]);
    const fallbackColor = GRAPH_COLORS[(index + 2) % GRAPH_COLORS.length];

    if (kind === 'tangent' || kind === 'normal') {
        const options = parseKeyValues(parts.slice(2));
        return {
            kind,
            curve: String(parts[1] || '').trim().slice(0, 80),
            x: numberOption(options, ['x', 'at'], 0),
            color: parseColor(parts.slice(2), fallbackColor),
        };
    }

    if (kind === 'secant') {
        const options = parseKeyValues(parts.slice(2));
        return {
            kind,
            curve: String(parts[1] || '').trim().slice(0, 80),
            x1: numberOption(options, ['x1', 'from'], -1),
            x2: numberOption(options, ['x2', 'to'], 1),
            color: parseColor(parts.slice(2), fallbackColor),
        };
    }

    if (kind === 'area' || kind === 'integral') {
        const options = parseKeyValues(parts.slice(2));
        return {
            kind,
            curve: String(parts[1] || '').trim().slice(0, 80),
            from: numberOption(options, ['from', 'a', 'x1'], -1),
            to: numberOption(options, ['to', 'b', 'x2'], 1),
            baseline: numberOption(options, ['baseline', 'base', 'y'], 0),
            mode: textOption(
                options,
                ['mode'],
                kind === 'integral' ? 'signed' : 'absolute',
            ).toLowerCase() === 'signed' ? 'signed' : 'absolute',
            color: parseColor(parts.slice(2), fallbackColor),
            opacity: parseOpacity(parts.slice(2), defaultOpacity),
        };
    }

    if (kind === 'between') {
        const options = parseKeyValues(parts.slice(3));
        return {
            kind,
            curveA: String(parts[1] || '').trim().slice(0, 80),
            curveB: String(parts[2] || '').trim().slice(0, 80),
            from: numberOption(options, ['from', 'a', 'x1'], -1),
            to: numberOption(options, ['to', 'b', 'x2'], 1),
            mode: textOption(options, ['mode'], 'absolute').toLowerCase() === 'signed'
                ? 'signed'
                : 'absolute',
            color: parseColor(parts.slice(3), fallbackColor),
            opacity: parseOpacity(parts.slice(3), defaultOpacity),
        };
    }

    if (kind === 'markers' || kind === 'points' || kind === 'analyze') {
        return {
            kind: 'markers',
            curve: String(parts[1] || '').trim().slice(0, 80),
            items: parseMarkerItems(parts[2]),
            color: parseColor(parts.slice(2), '#111827'),
        };
    }

    return null;
}

export function normalizeCalculusSource(value) {
    return toEnglishDigits(String(value || ''))
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[｜∣│¦ǀ]/g, '|')
        .replace(/[−–—]/g, '-')
        .replace(/\r\n?/g, '\n');
}

function splitCalculusParts(line) {
    return normalizeCalculusSource(line)
        .split(/\s*\|\s*/)
        .map((part) => part.trim());
}

function hasCurveCommand(source) {
    return normalizeCalculusSource(source)
        .split(/\n/)
        .some((line) => {
            const parts = splitCalculusParts(line.trim());
            return CURVE_KINDS.has(normalizeKind(parts[0]));
        });
}

export function parseCalculusInput(text, defaultOpacity = .24) {
    const curves = [];
    const operations = [];
    const errors = [];

    normalizeCalculusSource(text)
        .split(/\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'))
        .slice(0, 80)
        .forEach((line, index) => {
            const parts = splitCalculusParts(line);
            const kind = normalizeKind(parts[0]);

            if (CURVE_KINDS.has(kind)) {
                if (parts.length < 3 || !parts[2]) {
                    errors.push(`Line ${index + 1}: curve expression missing.`);
                    return;
                }
                curves.push(parseCurve(parts, curves.length));
                return;
            }

            if (OPERATION_KINDS.has(kind)) {
                const operation = parseOperation(parts, operations.length, defaultOpacity);
                if (operation) operations.push(operation);
                return;
            }

            errors.push(`Line ${index + 1}: unknown calculus command "${parts[0] || ''}".`);
        });

    return {
        curves: curves.slice(0, 16),
        operations: operations.slice(0, 48),
        errors,
    };
}

function normalizeCalculusSpec(spec) {
    const source = normalizeCalculusSource(spec.expression);
    const parsedSource = parseCalculusInput(source, spec.shadingOpacity);
    const arrayState = {
        curves: Array.isArray(spec.curves) ? spec.curves : [],
        operations: Array.isArray(spec.operations) ? spec.operations : [],
        errors: Array.isArray(spec.parseErrors) ? spec.parseErrors : [],
    };

    // The textarea is authoritative whenever it contains a curve command.
    // This repairs stale/empty arrays caused by mixed browser module caches.
    const parsed = hasCurveCommand(source)
        ? parsedSource
        : (arrayState.curves.length ? arrayState : parsedSource);

    const curves = parsed.curves.slice(0, 16).map((curve, index) => ({
        label: String(curve?.label || `f${index + 1}`).slice(0, 80),
        key: normalizeCurveKey(curve?.label || `f${index + 1}`),
        expression: String(curve?.expression || '').slice(0, 1000),
        color: safeColor(
            curve?.color,
            spec.colors?.[index] || GRAPH_COLORS[index % GRAPH_COLORS.length],
        ),
        visible: curve?.visible !== false,
    }));

    const operations = parsed.operations.slice(0, 48).map((operation, index) => ({
        ...operation,
        kind: normalizeKind(operation?.kind),
        color: safeColor(
            operation?.color,
            spec.colors?.[(index + 2) % (spec.colors?.length || GRAPH_COLORS.length)]
                || GRAPH_COLORS[(index + 2) % GRAPH_COLORS.length],
        ),
        opacity: clamp(operation?.opacity, .03, .9, spec.shadingOpacity),
    }));

    return {
        ...spec,
        curves,
        operations,
        parseErrors: parsed.errors || [],
        expression: curves.length ? formatCalculusInput(curves, operations) : source,
        samples: clamp(spec.samples, 180, 3000, 1000),
        curveLineWidth: clamp(spec.curveLineWidth, .5, 8, 2.5),
        derivativeStep: clamp(spec.derivativeStep, 1e-7, .25, .0001),
        integrationIntervals: Math.round(clamp(spec.integrationIntervals, 40, 4000, 800)),
        analysisSamples: Math.round(clamp(spec.analysisSamples, 120, 3000, 1000)),
        pointSize: clamp(spec.pointSize, 2, 12, 5),
        shadingOpacity: clamp(spec.shadingOpacity, .03, .9, .24),
        showCoordinates: spec.showCoordinates !== false,
        coordinateDecimals: Math.round(clamp(spec.coordinateDecimals, 0, 8, 3)),
        showCalculationPanel: spec.showCalculationPanel !== false,
        maxCalculationRows: Math.round(clamp(spec.maxCalculationRows, 2, 20, 10)),
        showDerivativeValues: spec.showDerivativeValues !== false,
        smartLabelLayout: spec.smartLabelLayout !== false,
        maxCoordinateLabels: Math.round(clamp(spec.maxCoordinateLabels, 0, 40, 12)),
        labelPadding: clamp(spec.labelPadding, 1, 12, 4),
        smartPanelPosition: spec.smartPanelPosition !== false,
        compactSummaryRows: Math.round(clamp(spec.compactSummaryRows, 2, 12, 6)),
        panelPlacement: normalizePanelPlacement(spec.panelPlacement),
        legendPlacement: normalizeLegendPlacement(spec.legendPlacement),
        outsidePanelWidth: Math.round(clamp(spec.outsidePanelWidth, 190, 380, 270)),
        outsidePanelHeight: Math.round(clamp(spec.outsidePanelHeight, 105, 280, 165)),
        advancedCollisionSolver: spec.advancedCollisionSolver !== false,
    };
}

function compileCurves(spec) {
    const compiled = [];
    const byKey = new Map();

    spec.curves.forEach((curve) => {
        const fn = compileMathExpression(curve.expression, ['x']);
        const entry = { ...curve, fn };
        compiled.push(entry);
        byKey.set(curve.key, entry);
    });

    return { compiled, byKey };
}

function getCurve(byKey, name) {
    return byKey.get(normalizeCurveKey(name)) || null;
}

function safeValue(fn, x) {
    if (typeof fn !== 'function') return NaN;
    const value = fn(x);
    return Number.isFinite(value) ? value : NaN;
}

export function derivativeAt(fn, x, baseStep = .0001) {
    const h = Math.max(
        1e-8,
        Math.min(.25, Math.abs(Number(baseStep) || .0001) * (1 + Math.abs(x) * .05)),
    );
    const fm2 = safeValue(fn, x - 2 * h);
    const fm1 = safeValue(fn, x - h);
    const fp1 = safeValue(fn, x + h);
    const fp2 = safeValue(fn, x + 2 * h);

    if ([fm2, fm1, fp1, fp2].every(Number.isFinite)) {
        return (-fp2 + 8 * fp1 - 8 * fm1 + fm2) / (12 * h);
    }

    if (Number.isFinite(fm1) && Number.isFinite(fp1)) {
        return (fp1 - fm1) / (2 * h);
    }

    return NaN;
}

function secondDerivativeAt(fn, x, baseStep = .0001) {
    const h = Math.max(
        1e-6,
        Math.min(.35, Math.sqrt(Math.abs(Number(baseStep) || .0001)) * (1 + Math.abs(x) * .03)),
    );
    const fm = safeValue(fn, x - h);
    const f0 = safeValue(fn, x);
    const fp = safeValue(fn, x + h);
    if (![fm, f0, fp].every(Number.isFinite)) return NaN;
    return (fm - 2 * f0 + fp) / (h * h);
}

function bisection(fn, left, right, iterations = 60) {
    let a = left;
    let b = right;
    let fa = safeValue(fn, a);
    let fb = safeValue(fn, b);

    if (!Number.isFinite(fa) || !Number.isFinite(fb)) return NaN;
    if (Math.abs(fa) < 1e-14) return a;
    if (Math.abs(fb) < 1e-14) return b;
    if (fa * fb > 0) return NaN;

    for (let index = 0; index < iterations; index += 1) {
        const middle = (a + b) / 2;
        const fm = safeValue(fn, middle);
        if (!Number.isFinite(fm)) return NaN;
        if (Math.abs(fm) < 1e-12 || Math.abs(b - a) < 1e-10) return middle;

        if (fa * fm <= 0) {
            b = middle;
            fb = fm;
        } else {
            a = middle;
            fa = fm;
        }
    }

    return (a + b) / 2;
}

function minimizeAbsolute(fn, left, right, iterations = 40) {
    let a = left;
    let b = right;

    for (let index = 0; index < iterations; index += 1) {
        const oneThird = a + (b - a) / 3;
        const twoThirds = b - (b - a) / 3;
        const f1 = Math.abs(safeValue(fn, oneThird));
        const f2 = Math.abs(safeValue(fn, twoThirds));

        if (!Number.isFinite(f1) || !Number.isFinite(f2)) break;
        if (f1 <= f2) b = twoThirds;
        else a = oneThird;
    }

    return (a + b) / 2;
}

function addUniqueRoot(roots, value, tolerance) {
    if (!Number.isFinite(value)) return;
    if (!roots.some((existing) => Math.abs(existing - value) <= tolerance)) {
        roots.push(value);
    }
}

function findRoots(fn, minimum, maximum, samples = 1000, zeroTolerance = 1e-6) {
    const count = Math.max(80, Math.min(5000, Math.round(samples)));
    const step = (maximum - minimum) / count;
    const roots = [];
    const dedupeTolerance = Math.max(1e-7, Math.abs(maximum - minimum) * 2e-6);
    const values = [];

    for (let index = 0; index <= count; index += 1) {
        const x = minimum + step * index;
        values.push([x, safeValue(fn, x)]);
    }

    for (let index = 1; index < values.length; index += 1) {
        const [x0, y0] = values[index - 1];
        const [x1, y1] = values[index];

        if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
        if (Math.abs(y0) <= zeroTolerance) addUniqueRoot(roots, x0, dedupeTolerance);
        if (y0 * y1 < 0) {
            addUniqueRoot(roots, bisection(fn, x0, x1), dedupeTolerance);
        }
    }

    for (let index = 1; index < values.length - 1; index += 1) {
        const [x, y] = values[index];
        const previous = values[index - 1][1];
        const next = values[index + 1][1];

        if (![previous, y, next].every(Number.isFinite)) continue;
        if (Math.abs(y) <= Math.abs(previous) && Math.abs(y) <= Math.abs(next)) {
            const candidate = minimizeAbsolute(
                fn,
                values[index - 1][0],
                values[index + 1][0],
            );
            const candidateValue = Math.abs(safeValue(fn, candidate));
            if (candidateValue <= zeroTolerance) {
                addUniqueRoot(roots, candidate, dedupeTolerance);
            }
        }
    }

    return roots.sort((a, b) => a - b);
}

function stationaryPoints(fn, spec, context) {
    const derivative = (x) => derivativeAt(fn, x, spec.derivativeStep);
    const scale = Math.max(
        1,
        Math.abs(context.yMax - context.yMin) / Math.max(1e-9, Math.abs(context.xMax - context.xMin)),
    );
    const roots = findRoots(
        derivative,
        context.xMin,
        context.xMax,
        spec.analysisSamples,
        scale * 2e-5,
    );

    const delta = Math.max(
        Math.abs(context.xMax - context.xMin) / Math.max(2000, spec.analysisSamples * 2),
        spec.derivativeStep * 20,
    );

    return roots.map((x) => {
        const y = safeValue(fn, x);
        const left = safeValue(fn, x - delta);
        const right = safeValue(fn, x + delta);
        const second = secondDerivativeAt(fn, x, spec.derivativeStep);
        let kind = 'stationary';

        if ([left, y, right].every(Number.isFinite)) {
            if (y < left && y < right) kind = 'minimum';
            else if (y > left && y > right) kind = 'maximum';
            else if (Number.isFinite(second) && second > 1e-5) kind = 'minimum';
            else if (Number.isFinite(second) && second < -1e-5) kind = 'maximum';
        }

        return { x, y, kind, derivative: derivativeAt(fn, x, spec.derivativeStep) };
    }).filter((point) => Number.isFinite(point.y));
}

export function integrateSimpson(fn, minimum, maximum, intervals = 800, absolute = false) {
    let a = Number(minimum);
    let b = Number(maximum);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return 0;

    let sign = 1;
    if (b < a) {
        [a, b] = [b, a];
        sign = -1;
    }

    let n = Math.max(2, Math.min(10000, Math.round(intervals)));
    if (n % 2) n += 1;
    const h = (b - a) / n;

    const evaluate = (x) => {
        const value = safeValue(fn, x);
        if (!Number.isFinite(value)) return NaN;
        return absolute ? Math.abs(value) : value;
    };

    let sum = evaluate(a) + evaluate(b);
    if (!Number.isFinite(sum)) return NaN;

    for (let index = 1; index < n; index += 1) {
        const value = evaluate(a + index * h);
        if (!Number.isFinite(value)) return NaN;
        sum += (index % 2 ? 4 : 2) * value;
    }

    return sign * sum * h / 3;
}

function formatNumber(value, decimals = 3) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 'undefined';
    if (Math.abs(number) < 10 ** (-decimals) / 2) return '0';
    const fixed = number.toFixed(decimals);
    return fixed.replace(/\.?0+$/, '');
}

function coordinateText(point, decimals) {
    return `(${formatNumber(point.x, decimals)}, ${formatNumber(point.y, decimals)})`;
}

function curvePath(curve, spec, context) {
    const count = Math.max(180, Math.min(3000, Math.round(spec.samples)));
    const points = [];

    for (let index = 0; index <= count; index += 1) {
        const x = context.xMin + (context.xMax - context.xMin) * index / count;
        points.push([x, safeValue(curve.fn, x)]);
    }

    return svgPathFromPoints(points, context, {
        breakDistance: context.plotHeight * .65,
    });
}

function linePathFromSlope(slope, intercept, context) {
    if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return '';
    const points = [
        [context.xMin, slope * context.xMin + intercept],
        [context.xMax, slope * context.xMax + intercept],
    ];
    return svgPathFromPoints(points, context, {
        breakDistance: Infinity,
    });
}

function verticalLinePath(x, context) {
    if (!Number.isFinite(x)) return '';
    return `M${context.sx(x).toFixed(2)},${context.sy(context.yMin).toFixed(2)} L${context.sx(x).toFixed(2)},${context.sy(context.yMax).toFixed(2)}`;
}

function areaStripPath(fnTop, fnBottom, minimum, maximum, context, samples = 320) {
    const a = Math.min(minimum, maximum);
    const b = Math.max(minimum, maximum);
    const count = Math.max(24, Math.min(1000, Math.round(samples)));
    let path = '';

    for (let index = 0; index < count; index += 1) {
        const x0 = a + (b - a) * index / count;
        const x1 = a + (b - a) * (index + 1) / count;
        const top0 = safeValue(fnTop, x0);
        const top1 = safeValue(fnTop, x1);
        const bottom0 = safeValue(fnBottom, x0);
        const bottom1 = safeValue(fnBottom, x1);

        if (![top0, top1, bottom0, bottom1].every(Number.isFinite)) continue;

        path += [
            `M${context.sx(x0).toFixed(2)},${context.sy(bottom0).toFixed(2)}`,
            `L${context.sx(x0).toFixed(2)},${context.sy(top0).toFixed(2)}`,
            `L${context.sx(x1).toFixed(2)},${context.sy(top1).toFixed(2)}`,
            `L${context.sx(x1).toFixed(2)},${context.sy(bottom1).toFixed(2)} Z`,
        ].join(' ');
    }

    return path;
}

function rectOverlapArea(a, b) {
    if (!a || !b) return 0;
    const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return width * height;
}

function pointInsideBox(point, box, padding = 0) {
    return point
        && box
        && point.x >= box.x - padding
        && point.x <= box.x + box.width + padding
        && point.y >= box.y - padding
        && point.y <= box.y + box.height + padding;
}

function boxInsidePlot(box, context, padding = 2) {
    return box.x >= context.margin.left + padding
        && box.y >= context.margin.top + padding
        && box.x + box.width <= context.margin.left + context.plotWidth - padding
        && box.y + box.height <= context.margin.top + context.plotHeight - padding;
}

function boxScore(box, avoidBoxes, geometryPoints, context, requirePlot = true) {
    let score = requirePlot && !boxInsidePlot(box, context, 2) ? 1e9 : 0;
    (avoidBoxes || []).forEach((other) => {
        score += rectOverlapArea(box, other) * 45;
    });
    (geometryPoints || []).forEach((point) => {
        if (pointInsideBox(point, box, 1)) {
            score += 80 * Math.max(1, Number(point.weight) || 1);
        }
    });
    return score;
}

function markerPriority(marker) {
    if (marker.types.includes('tangent') || marker.types.includes('normal')) return 100;
    if (marker.types.includes('maximum') || marker.types.includes('minimum')) return 90;
    if (marker.types.includes('x-intercept') || marker.types.includes('y-intercept')) return 80;
    if (marker.types.includes('secant endpoint')) return 70;
    if (marker.types.includes('stationary')) return 60;
    return 40;
}

function markerShapeOnly(marker, spec, context) {
    const x = context.sx(marker.x);
    const y = context.sy(marker.y);
    const size = spec.pointSize;
    const color = safeColor(marker.color, '#111827');
    const title = context.escapeXml(
        `${marker.curve}: ${marker.types.join(', ')} ${coordinateText(marker, spec.coordinateDecimals)}`,
    );

    let shape;
    if (marker.types.includes('maximum') || marker.types.includes('minimum')) {
        shape = `<path d="M${x},${y - size} L${x + size},${y} L${x},${y + size} L${x - size},${y} Z" fill="${color}" stroke="#ffffff" stroke-width="1.2"/>`;
    } else if (marker.types.includes('stationary')) {
        shape = `<circle cx="${x}" cy="${y}" r="${size}" fill="#ffffff" stroke="${color}" stroke-width="2"/>`;
    } else if (marker.types.includes('y-intercept')) {
        shape = `<rect x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}" rx="1" fill="${color}" stroke="#ffffff" stroke-width="1.2"/>`;
    } else {
        shape = `<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" stroke="#ffffff" stroke-width="1.2"/>`;
    }

    return `<g class="qmx-calculus-marker"><title>${title}</title>${shape}</g>`;
}

function labelCandidates(marker, text, spec, context) {
    const x = context.sx(marker.x);
    const y = context.sy(marker.y);
    const compact = context.baseWidth <= 520 || context.plotWidth <= 450;
    const fontSize = compact ? 9.2 : 10.5;
    const width = Math.max(38, text.length * fontSize * .57 + 9);
    const height = fontSize + 8;
    const baseGap = spec.pointSize + spec.labelPadding;
    const candidates = [];
    const directions = [
        [1, -1, 'north-east'], [-1, -1, 'north-west'],
        [1, 1, 'south-east'], [-1, 1, 'south-west'],
        [0, -1, 'north'], [0, 1, 'south'],
        [1, 0, 'east'], [-1, 0, 'west'],
    ];
    const rings = spec.advancedCollisionSolver ? [1, 1.8, 2.7] : [1];

    rings.forEach((ring) => {
        directions.forEach(([dx, dy, name]) => {
            const gap = baseGap * ring;
            let left;
            let top;
            if (dx > 0) left = x + gap;
            else if (dx < 0) left = x - width - gap;
            else left = x - width / 2;
            if (dy > 0) top = y + gap;
            else if (dy < 0) top = y - height - gap;
            else top = y - height / 2;
            candidates.push({
                x: left,
                y: top,
                width,
                height,
                name: ring === 1 ? name : `${name}-${ring}`,
                ring,
            });
        });
    });

    return { candidates, fontSize, markerX: x, markerY: y };
}

function layoutMarkerLabels(markers, spec, context, geometryPoints = [], avoidBoxes = []) {
    const markup = [];
    const boxes = [];
    const occupied = [...(avoidBoxes || [])];
    const compact = context.baseWidth <= 520 || context.plotWidth <= 450;
    const limit = Math.max(
        0,
        Math.min(
            spec.maxCoordinateLabels,
            compact ? Math.min(spec.maxCoordinateLabels, 6) : spec.maxCoordinateLabels,
        ),
    );

    markers.forEach((marker) => markup.push(markerShapeOnly(marker, spec, context)));
    if (!spec.showCoordinates || limit === 0) {
        return { markup: markup.join(''), boxes, omitted: markers.length };
    }

    const sorted = [...markers].sort((a, b) => markerPriority(b) - markerPriority(a));
    let shown = 0;

    sorted.forEach((marker) => {
        if (shown >= limit) return;
        const text = coordinateText(marker, spec.coordinateDecimals);
        const candidateData = labelCandidates(marker, text, spec, context);
        let best = null;
        let bestScore = Infinity;

        candidateData.candidates.forEach((box) => {
            const nearbyGeometry = geometryPoints.filter((point) => (
                Math.abs(point.x - candidateData.markerX) > spec.pointSize * 2
                || Math.abs(point.y - candidateData.markerY) > spec.pointSize * 2
            ));
            let score = boxScore(box, occupied, nearbyGeometry, context, true);
            score += (box.ring - 1) * 9;
            if (score < bestScore) {
                best = box;
                bestScore = score;
            }
        });

        if (!best || !boxInsidePlot(best, context, 1)) return;
        const collisionThreshold = best.width * best.height * (spec.advancedCollisionSolver ? 1.1 : 7);
        if (spec.smartLabelLayout && bestScore > collisionThreshold) return;

        boxes.push(best);
        occupied.push(best);
        shown += 1;
        const textX = best.x + 4.5;
        const textY = best.y + best.height - 4.5;
        const leaderX = Math.max(best.x, Math.min(candidateData.markerX, best.x + best.width));
        const leaderY = Math.max(best.y, Math.min(candidateData.markerY, best.y + best.height));
        const distance = Math.hypot(leaderX - candidateData.markerX, leaderY - candidateData.markerY);
        const leader = distance > 9
            ? `<polyline points="${candidateData.markerX},${candidateData.markerY} ${(candidateData.markerX + leaderX) / 2},${candidateData.markerY} ${leaderX},${leaderY}" fill="none" stroke="#64748b" stroke-width=".75"/>`
            : '';

        markup.push(
            `<g class="qmx-calculus-coordinate-label" data-qmx-label-position="${best.name}" data-qmx-box="${best.x.toFixed(2)},${best.y.toFixed(2)},${best.width.toFixed(2)},${best.height.toFixed(2)}">${leader}<rect x="${best.x}" y="${best.y}" width="${best.width}" height="${best.height}" rx="3" fill="#ffffff" fill-opacity=".9" stroke="#e2e8f0" stroke-width=".5"/><text x="${textX}" y="${textY}" font-size="${candidateData.fontSize}" font-weight="700" fill="#0f172a">${context.escapeXml(text)}</text></g>`,
        );
    });

    return {
        markup: markup.join(''),
        boxes,
        omitted: Math.max(0, markers.length - shown),
    };
}

function addMarker(markers, marker, context) {
    if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)) return;
    const toleranceX = Math.abs(context.xMax - context.xMin) * 2e-5;
    const toleranceY = Math.abs(context.yMax - context.yMin) * 2e-5;
    const existing = markers.find((item) => (
        item.curve === marker.curve
        && Math.abs(item.x - marker.x) <= toleranceX
        && Math.abs(item.y - marker.y) <= toleranceY
    ));

    if (existing) {
        existing.types = [...new Set([...existing.types, ...marker.types])];
        return;
    }

    markers.push(marker);
}

function truncateLayoutText(value, maximum) {
    const text = String(value || '');
    if (text.length <= maximum) return text;
    return `${text.slice(0, Math.max(1, maximum - 1))}…`;
}

function insidePanelCandidates(width, height, context) {
    const inset = 8;
    const left = context.margin.left + inset;
    const right = context.margin.left + context.plotWidth - width - inset;
    const top = context.margin.top + inset;
    const bottom = context.margin.top + context.plotHeight - height - inset;
    return [
        { x: left, y: bottom, width, height, name: 'inside-bottom-left' },
        { x: right, y: bottom, width, height, name: 'inside-bottom-right' },
        { x: left, y: top, width, height, name: 'inside-top-left' },
        { x: right, y: top, width, height, name: 'inside-top-right' },
    ];
}

function panelBandBox(placement, context, preferredWidth, preferredHeight) {
    const band = context.bands?.[placement];
    if (!band) return null;
    const inset = 8;
    const width = placement === 'bottom'
        ? Math.min(preferredWidth, Math.max(120, band.width * .58))
        : Math.max(120, band.width - inset * 2);
    let height = Math.min(preferredHeight, Math.max(70, band.height - inset * 2));
    let y = placement === 'bottom'
        ? band.y + inset
        : band.y + band.height - height - inset;

    if (['left', 'right'].includes(placement)
        && context.layout?.legendPlacement === placement) {
        const reservedForLegend = Math.min(180, Math.max(120, band.height * .48));
        const availableHeight = Math.max(70, band.height - reservedForLegend - inset * 3);
        height = Math.min(preferredHeight, availableHeight);
        y = band.y + reservedForLegend + inset * 1.5;
    }

    return { x: band.x + inset, y, width, height, name: `outside-${placement}` };
}

function calculationPanel(rows, spec, context, avoidBoxes = [], geometryPoints = []) {
    const placement = context.layout?.panelPlacement
        || resolvedPanelPlacement(spec, context.baseWidth);
    if (!spec.showCalculationPanel || !rows.length || placement === 'hidden') {
        return { markup: '', box: null, visibleRows: 0, placement: 'hidden' };
    }

    const compact = context.baseWidth <= 520 || context.plotWidth <= 450;
    const baseRowLimit = compact
        ? Math.min(spec.maxCalculationRows, spec.compactSummaryRows)
        : spec.maxCalculationRows;
    const lineHeight = compact ? 15 : 17;
    const fontSize = compact ? 9.2 : 10.3;
    const titleSize = compact ? 10 : 11;
    const maxChars = compact ? 44 : 76;
    const desiredRows = rows.slice(0, baseRowLimit);
    const preliminaryRows = desiredRows.map((row) => truncateLayoutText(row, maxChars));
    const maximumLength = Math.max(...preliminaryRows.map((row) => row.length), 20);
    const preferredWidth = Math.max(
        compact ? 210 : 270,
        Math.min(compact ? 330 : 540, maximumLength * fontSize * .56 + 24),
    );
    const preferredHeight = 28 + preliminaryRows.length * lineHeight
        + (rows.length > preliminaryRows.length ? 12 : 0);

    let box;
    if (['left', 'right', 'bottom'].includes(placement)) {
        box = panelBandBox(placement, context, preferredWidth, preferredHeight);
    }

    if (!box) {
        const width = Math.min(context.plotWidth - 16, preferredWidth);
        const height = Math.min(context.plotHeight - 16, preferredHeight);
        const candidates = insidePanelCandidates(width, height, context);
        box = candidates[0];

        if (spec.smartPanelPosition || placement === 'auto') {
            let bestScore = Infinity;
            candidates.forEach((candidate, index) => {
                let score = boxScore(candidate, avoidBoxes, geometryPoints, context, true);
                if (candidate.name === 'inside-top-right') score += 35;
                score += index * .01;
                if (score < bestScore) {
                    bestScore = score;
                    box = candidate;
                }
            });
        }
    }

    if (!box) return { markup: '', box: null, visibleRows: 0, placement: 'hidden' };

    const maximumRowsByHeight = Math.max(1, Math.floor((box.height - 38) / lineHeight));
    const rowLimit = Math.min(baseRowLimit, maximumRowsByHeight);
    const displayRows = rows.slice(0, rowLimit).map((row) => truncateLayoutText(
        row,
        placement === 'bottom' ? Math.max(36, Math.floor(box.width / (fontSize * .56)) - 4) : maxChars,
    ));
    const omitted = Math.max(0, rows.length - displayRows.length);
    const parts = [
        `<g class="qmx-calculus-panel" data-qmx-panel-position="${box.name}" data-qmx-layout="${compact ? 'compact' : 'regular'}" data-qmx-box="${box.x.toFixed(2)},${box.y.toFixed(2)},${box.width.toFixed(2)},${box.height.toFixed(2)}">`,
        `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="7" fill="#ffffff" fill-opacity=".96" stroke="#cbd5e1"/>`,
        `<text x="${box.x + 10}" y="${box.y + 17}" font-size="${titleSize}" font-weight="800" fill="#0f172a">Calculus results</text>`,
    ];

    displayRows.forEach((row, index) => {
        parts.push(
            `<text x="${box.x + 10}" y="${box.y + 35 + index * lineHeight}" font-size="${fontSize}" fill="#334155">${context.escapeXml(row)}</text>`,
        );
    });

    if (omitted) {
        parts.push(
            `<text x="${box.x + box.width - 10}" y="${box.y + box.height - 7}" text-anchor="end" font-size="9" fill="#64748b">+${omitted} more</text>`,
        );
    }

    parts.push('</g>');
    return { markup: parts.join(''), box, visibleRows: displayRows.length, placement };
}

function legendPreferredPositions(placement) {
    if (placement === 'hidden') return [];
    if (placement === 'left') return ['outside-left-top', 'outside-left-bottom'];
    if (placement === 'right') return ['outside-right-top', 'outside-right-bottom'];
    if (placement === 'bottom') return ['outside-bottom-right', 'outside-bottom-left'];
    return ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
}

function operationLabel(operation, suffix = '') {
    const base = operation.kind === 'between'
        ? `${operation.curveA} ↔ ${operation.curveB}`
        : operation.curve;
    return `${operation.kind}: ${base}${suffix ? ` ${suffix}` : ''}`;
}

function renderCalculus(spec, context) {
    const { compiled, byKey } = compileCurves(spec);
    const content = [];
    const legend = [];
    const rows = [];
    const markers = [];
    const fills = [];
    const operationLines = [];
    const geometryPoints = [];

    const curveEntries = compiled.filter((curve) => curve.visible !== false && curve.fn);
    curveEntries.forEach((curve) => {
        for (let index = 0; index <= 90; index += 1) {
            const x = context.xMin + (context.xMax - context.xMin) * index / 90;
            const y = safeValue(curve.fn, x);
            if (Number.isFinite(y) && context.inExtendedBounds(x, y)) {
                geometryPoints.push({ x: context.sx(x), y: context.sy(y), weight: 1 });
            }
        }
    });
    curveEntries.forEach((curve) => {
        legend.push({
            label: `${curve.label}: ${curve.expression}`,
            color: curve.color,
            kind: 'line',
        });
    });

    spec.operations.forEach((operation) => {
        if (operation.kind === 'area' || operation.kind === 'integral') {
            const curve = getCurve(byKey, operation.curve);
            if (!curve?.fn) return;

            const baseline = Number(operation.baseline) || 0;
            const baselineFn = () => baseline;
            const difference = (x) => safeValue(curve.fn, x) - baseline;
            const result = integrateSimpson(
                difference,
                operation.from,
                operation.to,
                spec.integrationIntervals,
                operation.mode !== 'signed',
            );
            const path = areaStripPath(
                curve.fn,
                baselineFn,
                operation.from,
                operation.to,
                context,
                Math.min(600, spec.integrationIntervals / 2),
            );

            fills.push(
                `<path class="qmx-calculus-area" d="${path}" fill="${operation.color}" fill-opacity="${operation.opacity}" stroke="none" clip-path="url(#${context.clipId})"><title>${context.escapeXml(operationLabel(operation))}</title></path>`,
            );
            legend.push({
                label: `${operation.kind === 'integral' ? 'Integral' : 'Area'}: ${curve.label}`,
                color: operation.color,
                kind: 'box',
            });
            rows.push(
                `${operation.kind === 'integral' ? '∫' : 'Area'} ${curve.label} [${formatNumber(operation.from)}, ${formatNumber(operation.to)}] = ${formatNumber(result, 6)}`,
            );
            return;
        }

        if (operation.kind === 'between') {
            const curveA = getCurve(byKey, operation.curveA);
            const curveB = getCurve(byKey, operation.curveB);
            if (!curveA?.fn || !curveB?.fn) return;

            const difference = (x) => safeValue(curveA.fn, x) - safeValue(curveB.fn, x);
            const result = integrateSimpson(
                difference,
                operation.from,
                operation.to,
                spec.integrationIntervals,
                operation.mode !== 'signed',
            );
            const path = areaStripPath(
                curveA.fn,
                curveB.fn,
                operation.from,
                operation.to,
                context,
                Math.min(600, spec.integrationIntervals / 2),
            );

            fills.push(
                `<path class="qmx-calculus-between" d="${path}" fill="${operation.color}" fill-opacity="${operation.opacity}" stroke="none" clip-path="url(#${context.clipId})"><title>${context.escapeXml(operationLabel(operation))}</title></path>`,
            );
            legend.push({
                label: `Between ${curveA.label} and ${curveB.label}`,
                color: operation.color,
                kind: 'box',
            });
            rows.push(
                `Area(${curveA.label}, ${curveB.label}) [${formatNumber(operation.from)}, ${formatNumber(operation.to)}] = ${formatNumber(result, 6)}`,
            );
            return;
        }

        if (operation.kind === 'tangent' || operation.kind === 'normal') {
            const curve = getCurve(byKey, operation.curve);
            if (!curve?.fn) return;

            const x0 = Number(operation.x);
            const y0 = safeValue(curve.fn, x0);
            const tangentSlope = derivativeAt(curve.fn, x0, spec.derivativeStep);
            let slope = tangentSlope;
            let path = '';
            let equation = '';

            if (operation.kind === 'normal') {
                if (Math.abs(tangentSlope) < 1e-9) {
                    slope = Number.POSITIVE_INFINITY;
                    path = verticalLinePath(x0, context);
                    equation = `x = ${formatNumber(x0, 5)}`;
                } else {
                    slope = -1 / tangentSlope;
                }
            }

            if (!path && Number.isFinite(slope) && Number.isFinite(y0)) {
                const intercept = y0 - slope * x0;
                path = linePathFromSlope(slope, intercept, context);
                equation = `y = ${formatNumber(slope, 5)}x ${intercept >= 0 ? '+' : '-'} ${formatNumber(Math.abs(intercept), 5)}`;
            }

            if (path) {
                operationLines.push(
                    `<path class="qmx-calculus-${operation.kind}" d="${path}" fill="none" stroke="${operation.color}" stroke-width="${spec.curveLineWidth}" stroke-dasharray="${operation.kind === 'normal' ? '7 5' : '5 4'}" clip-path="url(#${context.clipId})"><title>${context.escapeXml(`${operation.kind} ${curve.label} at x=${x0}`)}</title></path>`,
                );
                legend.push({
                    label: `${operation.kind} ${curve.label} at x=${formatNumber(x0)}`,
                    color: operation.color,
                    kind: 'line',
                });
                addMarker(markers, {
                    x: x0,
                    y: y0,
                    curve: curve.label,
                    types: [operation.kind],
                    color: operation.color,
                }, context);
                if (Number.isFinite(slope)) {
                    geometryPoints.push(
                        { x: context.sx(context.xMin), y: context.sy(slope * context.xMin + (y0 - slope * x0)), weight: 2 },
                        { x: context.sx(context.xMax), y: context.sy(slope * context.xMax + (y0 - slope * x0)), weight: 2 },
                    );
                } else {
                    geometryPoints.push(
                        { x: context.sx(x0), y: context.sy(context.yMin), weight: 2 },
                        { x: context.sx(x0), y: context.sy(context.yMax), weight: 2 },
                    );
                }
                const derivativeSummary = spec.showDerivativeValues
                    ? (Number.isFinite(slope) ? `; m=${formatNumber(slope, 6)}` : '; vertical line')
                    : '';
                rows.push(
                    `${operation.kind} ${curve.label} at ${coordinateText({ x: x0, y: y0 }, spec.coordinateDecimals)}: ${equation}${derivativeSummary}`,
                );
            }
            return;
        }

        if (operation.kind === 'secant') {
            const curve = getCurve(byKey, operation.curve);
            if (!curve?.fn) return;

            const x1 = Number(operation.x1);
            const x2 = Number(operation.x2);
            const y1 = safeValue(curve.fn, x1);
            const y2 = safeValue(curve.fn, x2);
            const slope = (y2 - y1) / (x2 - x1);

            if ([x1, x2, y1, y2, slope].every(Number.isFinite) && Math.abs(x2 - x1) > 1e-12) {
                const intercept = y1 - slope * x1;
                const path = linePathFromSlope(slope, intercept, context);
                operationLines.push(
                    `<path class="qmx-calculus-secant" d="${path}" fill="none" stroke="${operation.color}" stroke-width="${spec.curveLineWidth}" stroke-dasharray="9 4" clip-path="url(#${context.clipId})"><title>${context.escapeXml(`secant ${curve.label}`)}</title></path>`,
                );
                legend.push({
                    label: `secant ${curve.label}`,
                    color: operation.color,
                    kind: 'line',
                });
                addMarker(markers, {
                    x: x1,
                    y: y1,
                    curve: curve.label,
                    types: ['secant endpoint'],
                    color: operation.color,
                }, context);
                addMarker(markers, {
                    x: x2,
                    y: y2,
                    curve: curve.label,
                    types: ['secant endpoint'],
                    color: operation.color,
                }, context);
                geometryPoints.push(
                    { x: context.sx(context.xMin), y: context.sy(slope * context.xMin + intercept), weight: 2 },
                    { x: context.sx(context.xMax), y: context.sy(slope * context.xMax + intercept), weight: 2 },
                );
                rows.push(
                    `secant ${curve.label}: m=${formatNumber(slope, 6)} through ${coordinateText({ x: x1, y: y1 }, spec.coordinateDecimals)}, ${coordinateText({ x: x2, y: y2 }, spec.coordinateDecimals)}`,
                );
            }
            return;
        }

        if (operation.kind === 'markers') {
            const curve = getCurve(byKey, operation.curve);
            if (!curve?.fn) return;

            const items = Array.isArray(operation.items)
                ? operation.items
                : parseMarkerItems(operation.items);
            const stationary = (
                items.includes('extrema') || items.includes('stationary')
            ) ? stationaryPoints(curve.fn, spec, context) : [];

            if (items.includes('x-intercepts')) {
                const derivativeRoots = stationary.map((point) => point.x);
                const zeroTolerance = Math.max(
                    1e-7,
                    Math.abs(context.yMax - context.yMin) * 2e-6,
                );
                const roots = findRoots(
                    curve.fn,
                    context.xMin,
                    context.xMax,
                    spec.analysisSamples,
                    zeroTolerance,
                );

                derivativeRoots.forEach((x) => {
                    if (Math.abs(safeValue(curve.fn, x)) <= zeroTolerance * 4) {
                        addUniqueRoot(
                            roots,
                            x,
                            Math.abs(context.xMax - context.xMin) * 2e-6,
                        );
                    }
                });

                roots.forEach((x) => {
                    addMarker(markers, {
                        x,
                        y: safeValue(curve.fn, x),
                        curve: curve.label,
                        types: ['x-intercept'],
                        color: operation.color,
                    }, context);
                });

                rows.push(`${curve.label}: ${roots.length} x-intercept${roots.length === 1 ? '' : 's'}`);
            }

            if (items.includes('y-intercept') && context.xMin <= 0 && context.xMax >= 0) {
                const y = safeValue(curve.fn, 0);
                if (Number.isFinite(y)) {
                    addMarker(markers, {
                        x: 0,
                        y,
                        curve: curve.label,
                        types: ['y-intercept'],
                        color: operation.color,
                    }, context);
                    rows.push(`${curve.label}: y-intercept ${coordinateText({ x: 0, y }, spec.coordinateDecimals)}`);
                }
            }

            stationary.forEach((point) => {
                if (point.kind === 'maximum' || point.kind === 'minimum') {
                    if (!items.includes('extrema')) return;
                } else if (!items.includes('stationary')) {
                    return;
                }

                addMarker(markers, {
                    x: point.x,
                    y: point.y,
                    curve: curve.label,
                    types: [point.kind],
                    color: point.kind === 'maximum'
                        ? '#dc2626'
                        : (point.kind === 'minimum' ? '#16a34a' : '#7c3aed'),
                }, context);
            });

            const maxima = stationary.filter((point) => point.kind === 'maximum');
            const minima = stationary.filter((point) => point.kind === 'minimum');
            const other = stationary.filter((point) => point.kind === 'stationary');

            if (items.includes('extrema')) {
                rows.push(`${curve.label}: ${maxima.length} local max, ${minima.length} local min`);
            }
            if (items.includes('stationary')) {
                rows.push(`${curve.label}: ${other.length} other stationary point${other.length === 1 ? '' : 's'}`);
            }
        }
    });

    content.push(...fills);

    curveEntries.forEach((curve) => {
        const path = curvePath(curve, spec, context);
        content.push(
            `<path class="qmx-calculus-curve" d="${path}" fill="none" stroke="${curve.color}" stroke-width="${spec.curveLineWidth}" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${context.clipId})"><title>${context.escapeXml(`${curve.label}: ${curve.expression}`)}</title></path>`,
        );
    });

    content.push(...operationLines);
    markers.forEach((marker) => {
        geometryPoints.push({ x: context.sx(marker.x), y: context.sy(marker.y), weight: 3 });
    });

    const panel = calculationPanel(rows, spec, context, [], geometryPoints);
    const panelAvoidBoxes = panel.box && panel.placement === 'inside'
        ? [panel.box]
        : [];
    const markerLayout = layoutMarkerLabels(
        markers,
        spec,
        context,
        geometryPoints,
        panelAvoidBoxes,
    );
    content.push(markerLayout.markup);
    content.push(panel.markup);

    const legendPlacement = context.layout?.legendPlacement
        || resolvedLegendPlacement(spec, panel.placement, context.baseWidth);
    return {
        content: content.join(''),
        legend,
        legendOptions: {
            hidden: legendPlacement === 'hidden',
            avoidBoxes: [
                ...markerLayout.boxes,
                ...(panel.box ? [panel.box] : []),
            ],
            heatPoints: geometryPoints,
            preferredPositions: legendPreferredPositions(legendPlacement),
        },
    };
}

function autoRange(spec) {
    const normalized = normalizeCalculusSpec(spec);
    const { compiled } = compileCurves(normalized);
    const values = [];

    compiled.forEach((curve) => {
        if (!curve.fn || curve.visible === false) return;

        for (let index = 0; index <= 500; index += 1) {
            const x = normalized.xMin + (normalized.xMax - normalized.xMin) * index / 500;
            const y = safeValue(curve.fn, x);
            if (Number.isFinite(y) && Math.abs(y) < 1e9) values.push(y);
        }
    });

    if (!values.length) return null;

    let yMin = Math.min(...values);
    let yMax = Math.max(...values);

    normalized.operations.forEach((operation) => {
        if (operation.kind === 'area' || operation.kind === 'integral') {
            yMin = Math.min(yMin, Number(operation.baseline) || 0);
            yMax = Math.max(yMax, Number(operation.baseline) || 0);
        }
    });

    if (yMin === yMax) {
        yMin -= 1;
        yMax += 1;
    } else {
        const padding = (yMax - yMin) * .12;
        yMin -= padding;
        yMax += padding;
    }

    return {
        xMin: normalized.xMin,
        xMax: normalized.xMax,
        yMin,
        yMax,
    };
}

export function registerCalculusGraph(registry) {
    if (registry.has('calculus')) return;

    registry.register({
        id: 'calculus',
        label: 'Calculus Tools',
        group: 'Calculus & Regions',
        description: [
            'Commands:',
            'curve | label | expression | optional color',
            'tangent/normal | curve label | x=value | optional color',
            'secant | curve label | x1=value, x2=value | optional color',
            'area/integral | curve label | from=a, to=b, baseline=0, mode=absolute|signed | color | opacity=0.24',
            'between | curve A | curve B | from=a, to=b, mode=absolute|signed | color | opacity',
            'markers | curve label | intercepts, extrema, stationary | optional color',
        ].join('\n'),
        defaults: {
            expression: [
                'curve | f | x^3 - 3*x | #2563eb',
                'tangent | f | x=1 | #dc2626',
                'normal | f | x=1 | #16a34a',
                'markers | f | intercepts, extrema, stationary | #111827',
            ].join('\n'),
            curves: [],
            operations: [],
            samples: 1000,
            curveLineWidth: 2.5,
            derivativeStep: .0001,
            integrationIntervals: 800,
            analysisSamples: 1000,
            pointSize: 5,
            shadingOpacity: .24,
            showCoordinates: true,
            coordinateDecimals: 3,
            showCalculationPanel: true,
            maxCalculationRows: 10,
            showDerivativeValues: true,
            smartLabelLayout: true,
            maxCoordinateLabels: 12,
            labelPadding: 4,
            smartPanelPosition: true,
            compactSummaryRows: 6,
            panelPlacement: 'auto',
            legendPlacement: 'auto',
            outsidePanelWidth: 270,
            outsidePanelHeight: 165,
            advancedCollisionSolver: true,
        },
        layout(spec, dimensions) {
            return calculusLayoutPlan(normalizeCalculusSpec(spec), dimensions);
        },
        editor: {
            mode: 'calculus',
            inputLabel: 'Calculus commands',
            placeholder: [
                'curve | f | x^3 - 3*x | #2563eb',
                'curve | g | x+1 | #ea580c',
                'tangent | f | x=1 | #dc2626',
                'normal | f | x=1 | #16a34a',
                'secant | f | x1=-1, x2=2 | #9333ea',
                'area | f | from=-1, to=2, baseline=0, mode=absolute | #60a5fa | opacity=0.24',
                'between | f | g | from=-1, to=2 | #22c55e | opacity=0.28',
                'markers | f | intercepts, extrema, stationary',
            ].join('\n'),
            fields: [
                { key: 'samples', label: 'Curve samples', type: 'number', min: 180, max: 3000, step: 20 },
                { key: 'curveLineWidth', label: 'Curve/line width', type: 'number', min: .5, max: 8, step: .25 },
                { key: 'derivativeStep', label: 'Derivative step', type: 'number', min: .0000001, max: .25, step: .0001 },
                { key: 'integrationIntervals', label: 'Integration intervals', type: 'number', min: 40, max: 4000, step: 20 },
                { key: 'analysisSamples', label: 'Intercept/extrema samples', type: 'number', min: 120, max: 3000, step: 20 },
                { key: 'pointSize', label: 'Marker size', type: 'number', min: 2, max: 12, step: .5 },
                { key: 'shadingOpacity', label: 'Default area opacity', type: 'number', min: .03, max: .9, step: .01 },
                { key: 'showCoordinates', label: 'Show point coordinates', type: 'checkbox' },
                { key: 'coordinateDecimals', label: 'Coordinate decimal places', type: 'number', min: 0, max: 8, step: 1 },
                { key: 'showCalculationPanel', label: 'Show calculation summary', type: 'checkbox' },
                { key: 'maxCalculationRows', label: 'Maximum summary rows', type: 'number', min: 2, max: 20, step: 1 },
                { key: 'showDerivativeValues', label: 'Show slopes/equations', type: 'checkbox' },
                { key: 'smartLabelLayout', label: 'Smart coordinate-label layout', type: 'checkbox' },
                { key: 'maxCoordinateLabels', label: 'Maximum coordinate labels', type: 'number', min: 0, max: 40, step: 1 },
                { key: 'labelPadding', label: 'Label spacing', type: 'number', min: 1, max: 12, step: 1 },
                { key: 'smartPanelPosition', label: 'Automatic inside-panel corner', type: 'checkbox' },
                { key: 'panelPlacement', label: 'Summary panel position', type: 'select', options: [['auto', 'Auto'], ['inside', 'Inside plot'], ['left', 'Outside left'], ['right', 'Outside right'], ['bottom', 'Outside bottom'], ['hidden', 'Hidden']] },
                { key: 'legendPlacement', label: 'Legend position', type: 'select', options: [['auto', 'Auto'], ['inside', 'Inside plot'], ['left', 'Outside left'], ['right', 'Outside right'], ['bottom', 'Outside bottom'], ['hidden', 'Hidden']] },
                { key: 'outsidePanelWidth', label: 'Outside side-band width', type: 'number', min: 190, max: 380, step: 10 },
                { key: 'outsidePanelHeight', label: 'Outside bottom-band height', type: 'number', min: 105, max: 280, step: 10 },
                { key: 'advancedCollisionSolver', label: 'Advanced label/panel collision solver', type: 'checkbox' },
                { key: 'compactSummaryRows', label: 'Small-preview summary rows', type: 'number', min: 2, max: 12, step: 1 },
            ],
        },
        parseInput(text) {
            const expression = normalizeCalculusSource(text);
            const parsed = parseCalculusInput(expression);
            return {
                expression,
                curves: parsed.curves,
                operations: parsed.operations,
                parseErrors: parsed.errors,
            };
        },
        formatInput(spec) {
            const formatted = formatCalculusInput(spec.curves, spec.operations);
            return formatted || normalizeCalculusSource(spec.expression);
        },
        normalize: normalizeCalculusSpec,
        validate(spec) {
            const effective = normalizeCalculusSpec(spec);
            if (effective.parseErrors?.length) return [effective.parseErrors[0]];
            if (!effective.curves?.length) {
                return ['কমপক্ষে একটি curve command লিখুন। Input line অবশ্যই curve | label | expression আকারে লিখুন।'];
            }

            const { compiled, byKey } = compileCurves(effective);

            for (const curve of compiled) {
                if (!curve.expression || !curve.fn) {
                    return [`${curve.label}: function expression invalid.`];
                }
            }

            for (const operation of effective.operations || []) {
                if (['tangent', 'normal', 'secant', 'area', 'integral', 'markers'].includes(operation.kind)) {
                    if (!getCurve(byKey, operation.curve)) {
                        return [`${operation.kind}: curve "${operation.curve}" পাওয়া যায়নি।`];
                    }
                }

                if (operation.kind === 'between') {
                    if (!getCurve(byKey, operation.curveA) || !getCurve(byKey, operation.curveB)) {
                        return [`between: curve reference পাওয়া যায়নি।`];
                    }
                }

                if (operation.kind === 'secant' && Math.abs(operation.x2 - operation.x1) < 1e-12) {
                    return ['Secant-এর x1 এবং x2 আলাদা হতে হবে।'];
                }

                if (['area', 'integral', 'between'].includes(operation.kind)
                    && Math.abs(operation.to - operation.from) < 1e-12) {
                    return [`${operation.kind}: from এবং to আলাদা হতে হবে।`];
                }
            }

            return [];
        },
        detect(source) {
            const lines = String(source || '')
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('//'));

            const kinds = lines.map((line) => normalizeKind(line.split(/\s*\|\s*/)[0]));
            const curveCount = kinds.filter((kind) => CURVE_KINDS.has(kind)).length;
            const operationCount = kinds.filter((kind) => OPERATION_KINDS.has(kind)).length;

            if (curveCount && operationCount) {
                const parsed = parseCalculusInput(source);
                return {
                    score: 136 + Math.min(10, operationCount),
                    spec: {
                        expression: source,
                        curves: parsed.curves,
                        operations: parsed.operations,
                    },
                };
            }

            return null;
        },
        autoRange,
        render: renderCalculus,
    });
}
