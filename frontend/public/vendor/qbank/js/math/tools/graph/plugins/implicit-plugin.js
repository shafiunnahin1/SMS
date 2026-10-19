import {
    GRAPH_COLORS,
    clamp,
    compileMathExpression,
    safeColor,
    toEnglishDigits,
} from '../graph-utils.js';

const CURVE_KINDS = new Set(['implicit', 'level', 'field']);
const OPERATION_KINDS = new Set([
    'tangent',
    'tangent-implicit',
    'normal',
    'normal-implicit',
    'gradient',
    'intersections',
    'intersection',
    'area-inside',
    'shade',
    'inside',
    'critical',
    'critical-points',
    'singular',
    'singular-points',
]);

function normalizeKind(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, '-');
}

function normalizePlacement(value) {
    const normalized = String(value || 'auto').trim().toLowerCase();
    return ['auto', 'inside', 'left', 'right', 'bottom', 'hidden'].includes(normalized)
        ? normalized
        : 'auto';
}

export function normalizeImplicitSource(value) {
    return toEnglishDigits(String(value || ''))
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[｜∣│¦ǀ]/g, '|')
        .replace(/[−–—]/g, '-')
        .replace(/\r\n?/g, '\n');
}

function splitParts(line) {
    return normalizeImplicitSource(line)
        .split(/\s*\|\s*/)
        .map((part) => part.trim());
}

function parseColor(parts, fallback) {
    const candidate = parts.find((part) => /^#[0-9a-f]{6}$/i.test(String(part || '').trim()));
    return safeColor(candidate, fallback);
}

function parseOpacity(parts, fallback) {
    for (const part of parts) {
        const match = String(part || '').match(/^(?:opacity|alpha)\s*=\s*(\d*\.?\d+)$/i);
        if (match) return clamp(match[1], .02, .9, fallback);
    }
    return fallback;
}

function joinedOptions(parts) {
    return String((parts || []).join(' , '));
}

function numberOption(parts, names, fallback = NaN) {
    const source = joinedOptions(parts);
    for (const name of names) {
        const pattern = new RegExp(`(?:^|[,;\\s])${name}\\s*=\\s*([-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?)`, 'i');
        const match = source.match(pattern);
        if (match) {
            const value = Number(match[1]);
            if (Number.isFinite(value)) return value;
        }
    }
    return fallback;
}

function textOption(parts, names, fallback = '') {
    const source = joinedOptions(parts);
    for (const name of names) {
        const pattern = new RegExp(`(?:^|[,;\\s])${name}\\s*=\\s*([^,;|]+)`, 'i');
        const match = source.match(pattern);
        if (match && String(match[1]).trim()) return String(match[1]).trim();
    }
    return fallback;
}

function pointOption(parts, fallback = null) {
    const source = joinedOptions(parts);
    const pointMatch = source.match(
        /(?:point|at)\s*=\s*\(?\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*\)?/i,
    );
    if (pointMatch) {
        return {
            x: Number(pointMatch[1]),
            y: Number(pointMatch[2]),
        };
    }

    const x = numberOption(parts, ['x'], NaN);
    const y = numberOption(parts, ['y'], NaN);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    return fallback;
}

function normalizeEquationExpression(value) {
    const source = normalizeImplicitSource(value).trim();
    if (!source) return '';

    const equality = source.match(/^(.+?)\s*=\s*(.+)$/);
    if (
        equality
        && !/[<>]=?/.test(source)
        && !/^[A-Za-z]\w*\s*\(\s*x\s*,\s*y\s*\)\s*$/i.test(equality[1].trim())
    ) {
        return `( ${equality[1].trim()} ) - ( ${equality[2].trim()} )`;
    }

    const namedDefinition = source.match(
        /^[A-Za-z]\w*\s*\(\s*x\s*,\s*y\s*\)\s*=\s*(.+)$/i,
    );
    if (namedDefinition) return namedDefinition[1].trim();

    return source;
}

function curveLine(curve) {
    const color = curve.color ? ` | ${curve.color}` : '';
    const level = Number(curve.level) !== 0 ? ` | level=${Number(curve.level)}` : '';
    return `implicit | ${curve.label} | ${curve.expression}${level}${color}`;
}

function operationLine(operation) {
    const color = operation.color ? ` | ${operation.color}` : '';

    if (['tangent', 'normal', 'gradient'].includes(operation.kind)) {
        const scale = operation.kind === 'gradient' && Number.isFinite(Number(operation.scale))
            ? `, scale=${Number(operation.scale)}`
            : '';
        return `${operation.kind} | ${operation.curve} | point=${operation.x},${operation.y}${scale}${color}`;
    }

    if (operation.kind === 'intersections') {
        return `intersections | ${operation.curveA} | ${operation.curveB}${color}`;
    }

    if (operation.kind === 'area-inside') {
        const opacity = Number.isFinite(Number(operation.opacity))
            ? ` | opacity=${Number(operation.opacity)}`
            : '';
        return `area-inside | ${operation.curve} | side=${operation.side}${color}${opacity}`;
    }

    if (operation.kind === 'critical' || operation.kind === 'singular') {
        return `${operation.kind} | ${operation.curve}${color}`;
    }

    return '';
}

export function formatImplicitInput(curves, operations) {
    return [
        ...(curves || []).map(curveLine),
        ...(operations || []).map(operationLine).filter(Boolean),
    ].join('\n');
}

function parseCurve(parts, index) {
    const kind = normalizeKind(parts[0]);
    const label = String(parts[1] || `F${index + 1}`).trim().slice(0, 80);
    const expression = normalizeEquationExpression(parts[2]).slice(0, 1000);
    const optionParts = parts.slice(3);
    const fallbackColor = GRAPH_COLORS[index % GRAPH_COLORS.length];

    return {
        kind: 'implicit',
        label,
        key: label.toLowerCase(),
        expression,
        level: numberOption(
            optionParts,
            ['level', 'value', 'c'],
            kind === 'level' ? 0 : 0,
        ),
        color: parseColor(optionParts, fallbackColor),
        visible: true,
    };
}

function parseOperation(parts, index, defaultOpacity, defaultVectorLength) {
    let kind = normalizeKind(parts[0]);
    const fallbackColor = GRAPH_COLORS[(index + 2) % GRAPH_COLORS.length];

    if (kind === 'tangent-implicit') kind = 'tangent';
    if (kind === 'normal-implicit') kind = 'normal';
    if (kind === 'intersection') kind = 'intersections';
    if (['shade', 'inside'].includes(kind)) kind = 'area-inside';
    if (kind === 'critical-points') kind = 'critical';
    if (kind === 'singular-points') kind = 'singular';

    if (['tangent', 'normal', 'gradient'].includes(kind)) {
        const point = pointOption(parts.slice(2), { x: 0, y: 0 });
        return {
            kind,
            curve: String(parts[1] || '').trim().slice(0, 80),
            x: point.x,
            y: point.y,
            scale: numberOption(parts.slice(2), ['scale', 'length'], defaultVectorLength),
            color: parseColor(parts.slice(2), fallbackColor),
        };
    }

    if (kind === 'intersections') {
        return {
            kind,
            curveA: String(parts[1] || '').trim().slice(0, 80),
            curveB: String(parts[2] || '').trim().slice(0, 80),
            color: parseColor(parts.slice(3), '#111827'),
        };
    }

    if (kind === 'area-inside') {
        const sideText = textOption(parts.slice(2), ['side', 'sign'], 'negative')
            .trim()
            .toLowerCase();
        return {
            kind,
            curve: String(parts[1] || '').trim().slice(0, 80),
            side: ['positive', '+', 'outside'].includes(sideText) ? 'positive' : 'negative',
            color: parseColor(parts.slice(2), fallbackColor),
            opacity: parseOpacity(parts.slice(2), defaultOpacity),
        };
    }

    if (kind === 'critical' || kind === 'singular') {
        return {
            kind,
            curve: String(parts[1] || '').trim().slice(0, 80),
            color: parseColor(parts.slice(2), kind === 'singular' ? '#dc2626' : '#7c3aed'),
        };
    }

    return null;
}

export function parseImplicitInput(text, defaultOpacity = .22, defaultVectorLength = 2) {
    const curves = [];
    const operations = [];
    const errors = [];

    normalizeImplicitSource(text)
        .split(/\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'))
        .slice(0, 90)
        .forEach((line, lineIndex) => {
            const parts = splitParts(line);
            const kind = normalizeKind(parts[0]);

            if (CURVE_KINDS.has(kind)) {
                if (parts.length < 3 || !String(parts[2] || '').trim()) {
                    errors.push(`Line ${lineIndex + 1}: implicit expression missing.`);
                    return;
                }
                curves.push(parseCurve(parts, curves.length));
                return;
            }

            if (OPERATION_KINDS.has(kind)) {
                const operation = parseOperation(
                    parts,
                    operations.length,
                    defaultOpacity,
                    defaultVectorLength,
                );
                if (operation) operations.push(operation);
                return;
            }

            errors.push(`Line ${lineIndex + 1}: unknown implicit command "${parts[0] || ''}".`);
        });

    return {
        curves: curves.slice(0, 16),
        operations: operations.slice(0, 48),
        errors,
    };
}

function hasImplicitCommand(source) {
    return normalizeImplicitSource(source)
        .split(/\n/)
        .some((line) => CURVE_KINDS.has(normalizeKind(splitParts(line)[0])));
}

function normalizeImplicitSpec(spec) {
    const source = normalizeImplicitSource(spec.expression);
    const parsedSource = parseImplicitInput(
        source,
        spec.fillOpacity,
        spec.vectorLength,
    );
    const arrayState = {
        curves: Array.isArray(spec.curves) ? spec.curves : [],
        operations: Array.isArray(spec.operations) ? spec.operations : [],
        errors: Array.isArray(spec.parseErrors) ? spec.parseErrors : [],
    };
    const parsed = hasImplicitCommand(source)
        ? parsedSource
        : (arrayState.curves.length ? arrayState : parsedSource);

    const curves = parsed.curves.slice(0, 16).map((curve, index) => ({
        label: String(curve?.label || `F${index + 1}`).slice(0, 80),
        key: String(curve?.label || `F${index + 1}`).trim().toLowerCase(),
        expression: normalizeEquationExpression(curve?.expression).slice(0, 1000),
        level: clamp(curve?.level, -1e9, 1e9, 0),
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
        opacity: clamp(operation?.opacity, .02, .9, spec.fillOpacity),
        scale: clamp(operation?.scale, .1, 100, spec.vectorLength),
    }));

    return {
        ...spec,
        curves,
        operations,
        parseErrors: parsed.errors || [],
        expression: curves.length ? formatImplicitInput(curves, operations) : source,
        contourResolution: Math.round(clamp(spec.contourResolution, 28, 220, 110)),
        curveWidth: clamp(spec.curveWidth, .5, 8, 2.4),
        derivativeStep: clamp(spec.derivativeStep, 1e-7, .5, .0005),
        intersectionResolution: Math.round(clamp(spec.intersectionResolution, 24, 180, 84)),
        intersectionTolerance: clamp(spec.intersectionTolerance, 1e-8, 1, .001),
        criticalResolution: Math.round(clamp(spec.criticalResolution, 16, 120, 44)),
        fillResolution: Math.round(clamp(spec.fillResolution, 20, 220, 100)),
        fillOpacity: clamp(spec.fillOpacity, .02, .9, .22),
        pointSize: clamp(spec.pointSize, 2, 12, 5),
        vectorLength: clamp(spec.vectorLength, .1, 100, 2),
        showCoordinates: spec.showCoordinates !== false,
        coordinateDecimals: Math.round(clamp(spec.coordinateDecimals, 0, 8, 3)),
        maxCoordinateLabels: Math.round(clamp(spec.maxCoordinateLabels, 0, 40, 14)),
        showCalculationPanel: spec.showCalculationPanel !== false,
        maxCalculationRows: Math.round(clamp(spec.maxCalculationRows, 2, 24, 12)),
        panelPlacement: normalizePlacement(spec.panelPlacement),
        legendPlacement: normalizePlacement(spec.legendPlacement),
        outsidePanelWidth: Math.round(clamp(spec.outsidePanelWidth, 190, 420, 280)),
        outsidePanelHeight: Math.round(clamp(spec.outsidePanelHeight, 110, 300, 175)),
        labelPadding: clamp(spec.labelPadding, 1, 14, 4),
    };
}

function compileCurves(spec) {
    const compiled = [];
    const byKey = new Map();

    spec.curves.forEach((curve) => {
        const fn = compileMathExpression(curve.expression, ['x', 'y']);
        const entry = { ...curve, fn };
        compiled.push(entry);
        byKey.set(curve.key, entry);
    });

    return { compiled, byKey };
}

function curveByName(byKey, value) {
    return byKey.get(String(value || '').trim().toLowerCase()) || null;
}

function safeValue(fn, x, y) {
    if (typeof fn !== 'function') return NaN;
    const value = fn(x, y);
    return Number.isFinite(value) ? value : NaN;
}

export function gradientAt(fn, x, y, baseStep = .0005) {
    const scale = 1 + Math.max(Math.abs(x), Math.abs(y)) * .03;
    const h = Math.max(1e-7, Math.min(.5, Math.abs(Number(baseStep) || .0005) * scale));
    const fx1 = safeValue(fn, x + h, y);
    const fx0 = safeValue(fn, x - h, y);
    const fy1 = safeValue(fn, x, y + h);
    const fy0 = safeValue(fn, x, y - h);

    return {
        x: Number.isFinite(fx1) && Number.isFinite(fx0) ? (fx1 - fx0) / (2 * h) : NaN,
        y: Number.isFinite(fy1) && Number.isFinite(fy0) ? (fy1 - fy0) / (2 * h) : NaN,
    };
}

export function hessianAt(fn, x, y, baseStep = .0005) {
    const h = Math.max(1e-5, Math.min(.5, Math.sqrt(Math.abs(Number(baseStep) || .0005)) * .35));
    const f = safeValue(fn, x, y);
    const fxp = safeValue(fn, x + h, y);
    const fxm = safeValue(fn, x - h, y);
    const fyp = safeValue(fn, x, y + h);
    const fym = safeValue(fn, x, y - h);
    const fpp = safeValue(fn, x + h, y + h);
    const fpm = safeValue(fn, x + h, y - h);
    const fmp = safeValue(fn, x - h, y + h);
    const fmm = safeValue(fn, x - h, y - h);

    if (![f, fxp, fxm, fyp, fym, fpp, fpm, fmp, fmm].every(Number.isFinite)) {
        return { xx: NaN, xy: NaN, yy: NaN };
    }

    return {
        xx: (fxp - 2 * f + fxm) / (h * h),
        yy: (fyp - 2 * f + fym) / (h * h),
        xy: (fpp - fpm - fmp + fmm) / (4 * h * h),
    };
}

function interpolatePoint(a, b, va, vb) {
    const denominator = vb - va;
    const ratio = Math.abs(denominator) < 1e-15 ? .5 : -va / denominator;
    const bounded = Math.max(0, Math.min(1, ratio));
    return [
        a[0] + (b[0] - a[0]) * bounded,
        a[1] + (b[1] - a[1]) * bounded,
    ];
}

function uniquePoints(points, tolerance) {
    const result = [];
    points.forEach((point) => {
        if (!point || !point.every(Number.isFinite)) return;
        if (!result.some((existing) => Math.hypot(
            existing[0] - point[0],
            existing[1] - point[1],
        ) <= tolerance)) {
            result.push(point);
        }
    });
    return result;
}

export function marchingSquaresSegments(
    fn,
    level,
    bounds,
    resolution = 110,
    aspectRatio = 1,
) {
    const xMin = Number(bounds.xMin);
    const xMax = Number(bounds.xMax);
    const yMin = Number(bounds.yMin);
    const yMax = Number(bounds.yMax);
    const nx = Math.max(16, Math.min(260, Math.round(resolution)));
    const ny = Math.max(12, Math.min(260, Math.round(nx * Math.max(.25, aspectRatio))));
    const grid = [];

    for (let row = 0; row <= ny; row += 1) {
        const y = yMin + (yMax - yMin) * row / ny;
        const values = [];
        for (let column = 0; column <= nx; column += 1) {
            const x = xMin + (xMax - xMin) * column / nx;
            const value = safeValue(fn, x, y);
            values.push(Number.isFinite(value) ? value - level : NaN);
        }
        grid.push(values);
    }

    const segments = [];
    const pointTolerance = Math.max(
        Math.abs(xMax - xMin) / nx,
        Math.abs(yMax - yMin) / ny,
    ) * 1e-6;

    for (let row = 0; row < ny; row += 1) {
        for (let column = 0; column < nx; column += 1) {
            const x0 = xMin + (xMax - xMin) * column / nx;
            const x1 = xMin + (xMax - xMin) * (column + 1) / nx;
            const y0 = yMin + (yMax - yMin) * row / ny;
            const y1 = yMin + (yMax - yMin) * (row + 1) / ny;
            const corners = [
                [x0, y0],
                [x1, y0],
                [x1, y1],
                [x0, y1],
            ];
            const values = [
                grid[row][column],
                grid[row][column + 1],
                grid[row + 1][column + 1],
                grid[row + 1][column],
            ];
            const hits = [];

            for (let edge = 0; edge < 4; edge += 1) {
                const next = (edge + 1) % 4;
                const a = values[edge];
                const b = values[next];
                if (!Number.isFinite(a) || !Number.isFinite(b)) continue;

                if (Math.abs(a) < 1e-14) hits.push(corners[edge]);
                if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
                    hits.push(interpolatePoint(corners[edge], corners[next], a, b));
                }
            }

            const cleanHits = uniquePoints(hits, pointTolerance);
            if (cleanHits.length === 2) {
                segments.push([cleanHits[0], cleanHits[1]]);
            } else if (cleanHits.length >= 4) {
                const center = safeValue(fn, (x0 + x1) / 2, (y0 + y1) / 2) - level;
                if (Number.isFinite(center) && center < 0) {
                    segments.push([cleanHits[0], cleanHits[3]], [cleanHits[1], cleanHits[2]]);
                } else {
                    segments.push([cleanHits[0], cleanHits[1]], [cleanHits[2], cleanHits[3]]);
                }
            }
        }
    }

    return segments;
}

function contourPath(segments, context) {
    return segments.map((segment) => (
        `M${context.sx(segment[0][0]).toFixed(2)},${context.sy(segment[0][1]).toFixed(2)} `
        + `L${context.sx(segment[1][0]).toFixed(2)},${context.sy(segment[1][1]).toFixed(2)}`
    )).join(' ');
}

function signMatches(value, level, side) {
    if (!Number.isFinite(value)) return false;
    return side === 'positive' ? value >= level : value <= level;
}

export function estimateImplicitArea(
    fn,
    level,
    bounds,
    resolution = 100,
    side = 'negative',
) {
    const nx = Math.max(20, Math.min(300, Math.round(resolution)));
    const width = Math.abs(bounds.xMax - bounds.xMin);
    const height = Math.abs(bounds.yMax - bounds.yMin);
    const aspect = height / Math.max(1e-12, width);
    const ny = Math.max(20, Math.min(300, Math.round(nx * aspect)));
    let included = 0;

    for (let row = 0; row < ny; row += 1) {
        const y = bounds.yMin + (bounds.yMax - bounds.yMin) * (row + .5) / ny;
        for (let column = 0; column < nx; column += 1) {
            const x = bounds.xMin + (bounds.xMax - bounds.xMin) * (column + .5) / nx;
            if (signMatches(safeValue(fn, x, y), level, side)) included += 1;
        }
    }

    return width * height * included / (nx * ny);
}

function shadedAreaMarkup(curve, operation, spec, context) {
    const nx = Math.max(20, Math.min(220, Math.round(spec.fillResolution)));
    const ny = Math.max(
        18,
        Math.min(
            220,
            Math.round(nx * context.plotHeight / Math.max(1, context.plotWidth)),
        ),
    );
    const dx = (context.xMax - context.xMin) / nx;
    const dy = (context.yMax - context.yMin) / ny;
    const parts = [];
    let included = 0;

    for (let row = 0; row < ny; row += 1) {
        const y0 = context.yMin + row * dy;
        const y1 = y0 + dy;
        const y = (y0 + y1) / 2;
        let runStart = -1;

        const flush = (endIndex) => {
            if (runStart < 0) return;
            const x0 = context.xMin + runStart * dx;
            const x1 = context.xMin + endIndex * dx;
            const left = context.sx(x0) - .25;
            const right = context.sx(x1) + .25;
            const top = context.sy(y1) - .25;
            const bottom = context.sy(y0) + .25;
            parts.push(
                `<rect class="qmx-implicit-fill" x="${left}" y="${top}" width="${Math.max(.5, right - left)}" height="${Math.max(.5, bottom - top)}" fill="${operation.color}" fill-opacity="${operation.opacity}" clip-path="url(#${context.clipId})"/>`,
            );
            runStart = -1;
        };

        for (let column = 0; column < nx; column += 1) {
            const x = context.xMin + (column + .5) * dx;
            const inside = signMatches(
                safeValue(curve.fn, x, y),
                curve.level,
                operation.side,
            );
            if (inside) {
                included += 1;
                if (runStart < 0) runStart = column;
            } else {
                flush(column);
            }
        }
        flush(nx);
    }

    const viewArea = Math.abs(
        (context.xMax - context.xMin) * (context.yMax - context.yMin),
    );
    return {
        markup: parts.join(''),
        area: viewArea * included / (nx * ny),
    };
}

function projectToLevel(curve, point, spec) {
    let x = Number(point.x);
    let y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !curve?.fn) return null;

    const span = Math.max(
        Math.abs(spec.xMax - spec.xMin),
        Math.abs(spec.yMax - spec.yMin),
        1,
    );

    for (let index = 0; index < 18; index += 1) {
        const value = safeValue(curve.fn, x, y) - curve.level;
        const gradient = gradientAt(curve.fn, x, y, spec.derivativeStep);
        const normSquared = gradient.x * gradient.x + gradient.y * gradient.y;
        if (!Number.isFinite(value) || !Number.isFinite(normSquared) || normSquared < 1e-18) break;
        if (Math.abs(value) <= spec.intersectionTolerance) break;

        let factor = value / normSquared;
        const magnitude = Math.abs(factor) * Math.sqrt(normSquared);
        if (magnitude > span * .2) factor *= span * .2 / magnitude;
        x -= factor * gradient.x;
        y -= factor * gradient.y;
    }

    const value = safeValue(curve.fn, x, y) - curve.level;
    if (!Number.isFinite(value)) return null;
    return { x, y, residual: value };
}

function lineRectangleSegment(point, direction, context) {
    const dx = Number(direction.x);
    const dy = Number(direction.y);
    const x0 = Number(point.x);
    const y0 = Number(point.y);
    const candidates = [];
    const epsilon = 1e-12;

    if (Math.abs(dx) > epsilon) {
        [context.xMin, context.xMax].forEach((x) => {
            const t = (x - x0) / dx;
            const y = y0 + t * dy;
            if (y >= context.yMin - 1e-9 && y <= context.yMax + 1e-9) {
                candidates.push({ x, y, t });
            }
        });
    }

    if (Math.abs(dy) > epsilon) {
        [context.yMin, context.yMax].forEach((y) => {
            const t = (y - y0) / dy;
            const x = x0 + t * dx;
            if (x >= context.xMin - 1e-9 && x <= context.xMax + 1e-9) {
                candidates.push({ x, y, t });
            }
        });
    }

    const unique = [];
    candidates.forEach((candidate) => {
        if (!unique.some((item) => Math.hypot(item.x - candidate.x, item.y - candidate.y) < 1e-8)) {
            unique.push(candidate);
        }
    });
    unique.sort((a, b) => a.t - b.t);

    if (unique.length < 2) return null;
    return [unique[0], unique[unique.length - 1]];
}

function lineMarkup(point, direction, color, className, dash, context) {
    const segment = lineRectangleSegment(point, direction, context);
    if (!segment) return '';
    return `<path class="${className}" d="M${context.sx(segment[0].x).toFixed(2)},${context.sy(segment[0].y).toFixed(2)} L${context.sx(segment[1].x).toFixed(2)},${context.sy(segment[1].y).toFixed(2)}" fill="none" stroke="${color}" stroke-width="2.2"${dash ? ` stroke-dasharray="${dash}"` : ''} clip-path="url(#${context.clipId})"/>`;
}

function formatNumber(value, decimals = 3) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 'undefined';
    if (Math.abs(number) < 10 ** (-decimals) / 2) return '0';
    return number.toFixed(decimals).replace(/\.?0+$/, '');
}

function coordinateText(point, decimals) {
    return `(${formatNumber(point.x, decimals)}, ${formatNumber(point.y, decimals)})`;
}

function tangentEquation(gradient, point, decimals) {
    const a = gradient.x;
    const b = gradient.y;
    const c = -(a * point.x + b * point.y);
    if (Math.abs(b) < 1e-10 && Math.abs(a) > 1e-10) {
        return `x = ${formatNumber(-c / a, decimals)}`;
    }
    if (Math.abs(b) > 1e-10) {
        const slope = -a / b;
        const intercept = -c / b;
        return `y = ${formatNumber(slope, decimals)}x ${intercept >= 0 ? '+' : '-'} ${formatNumber(Math.abs(intercept), decimals)}`;
    }
    return 'undefined tangent';
}

function normalEquation(gradient, point, decimals) {
    if (Math.abs(gradient.x) < 1e-10 && Math.abs(gradient.y) > 1e-10) {
        return `x = ${formatNumber(point.x, decimals)}`;
    }
    if (Math.abs(gradient.x) > 1e-10) {
        const slope = gradient.y / gradient.x;
        const intercept = point.y - slope * point.x;
        return `y = ${formatNumber(slope, decimals)}x ${intercept >= 0 ? '+' : '-'} ${formatNumber(Math.abs(intercept), decimals)}`;
    }
    return 'undefined normal';
}

function gradientArrow(point, gradient, operation, spec, context) {
    const norm = Math.hypot(gradient.x, gradient.y);
    if (!Number.isFinite(norm) || norm < 1e-12) return '';

    const scale = Number(operation.scale) || spec.vectorLength;
    const end = {
        x: point.x + gradient.x / norm * scale,
        y: point.y + gradient.y / norm * scale,
    };
    const x0 = context.sx(point.x);
    const y0 = context.sy(point.y);
    const x1 = context.sx(end.x);
    const y1 = context.sy(end.y);
    const screenNorm = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ux = (x1 - x0) / screenNorm;
    const uy = (y1 - y0) / screenNorm;
    const size = 7;
    const leftX = x1 - ux * size - uy * size * .55;
    const leftY = y1 - uy * size + ux * size * .55;
    const rightX = x1 - ux * size + uy * size * .55;
    const rightY = y1 - uy * size - ux * size * .55;

    return [
        `<g class="qmx-implicit-gradient">`,
        `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${operation.color}" stroke-width="2.2" clip-path="url(#${context.clipId})"/>`,
        `<path d="M${x1},${y1} L${leftX},${leftY} L${rightX},${rightY} Z" fill="${operation.color}"/>`,
        `</g>`,
    ].join('');
}

function cellRange(values) {
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return null;
    return { min: Math.min(...finite), max: Math.max(...finite), minAbs: Math.min(...finite.map(Math.abs)) };
}

function refineIntersection(curveA, curveB, point, spec, context) {
    let x = point.x;
    let y = point.y;
    const maxStep = Math.max(
        Math.abs(context.xMax - context.xMin),
        Math.abs(context.yMax - context.yMin),
    ) * .15;

    for (let iteration = 0; iteration < 24; iteration += 1) {
        const f = safeValue(curveA.fn, x, y) - curveA.level;
        const g = safeValue(curveB.fn, x, y) - curveB.level;
        if (![f, g].every(Number.isFinite)) return null;
        if (Math.hypot(f, g) <= spec.intersectionTolerance) break;

        const gradientA = gradientAt(curveA.fn, x, y, spec.derivativeStep);
        const gradientB = gradientAt(curveB.fn, x, y, spec.derivativeStep);
        const determinant = gradientA.x * gradientB.y - gradientA.y * gradientB.x;
        if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;

        let dx = (-f * gradientB.y + gradientA.y * g) / determinant;
        let dy = (-gradientA.x * g + f * gradientB.x) / determinant;
        const length = Math.hypot(dx, dy);
        if (length > maxStep) {
            dx *= maxStep / length;
            dy *= maxStep / length;
        }
        x += dx;
        y += dy;

        if (
            x < context.xMin - 1 || x > context.xMax + 1
            || y < context.yMin - 1 || y > context.yMax + 1
        ) return null;
    }

    const residualA = Math.abs(safeValue(curveA.fn, x, y) - curveA.level);
    const residualB = Math.abs(safeValue(curveB.fn, x, y) - curveB.level);
    if (
        !Number.isFinite(residualA)
        || !Number.isFinite(residualB)
        || residualA > spec.intersectionTolerance * 8
        || residualB > spec.intersectionTolerance * 8
    ) return null;

    return { x, y, residual: Math.max(residualA, residualB) };
}

export function findImplicitIntersections(curveA, curveB, spec, context) {
    const resolution = Math.max(24, Math.min(180, Math.round(spec.intersectionResolution)));
    const nx = resolution;
    const ny = Math.max(
        18,
        Math.round(nx * context.plotHeight / Math.max(1, context.plotWidth)),
    );
    const gridA = [];
    const gridB = [];

    for (let row = 0; row <= ny; row += 1) {
        const y = context.yMin + (context.yMax - context.yMin) * row / ny;
        const rowA = [];
        const rowB = [];
        for (let column = 0; column <= nx; column += 1) {
            const x = context.xMin + (context.xMax - context.xMin) * column / nx;
            rowA.push(safeValue(curveA.fn, x, y) - curveA.level);
            rowB.push(safeValue(curveB.fn, x, y) - curveB.level);
        }
        gridA.push(rowA);
        gridB.push(rowB);
    }

    const results = [];
    const toleranceX = Math.abs(context.xMax - context.xMin) / nx * .8;
    const toleranceY = Math.abs(context.yMax - context.yMin) / ny * .8;
    const nearThreshold = spec.intersectionTolerance * 10;

    for (let row = 0; row < ny; row += 1) {
        for (let column = 0; column < nx; column += 1) {
            const valuesA = [
                gridA[row][column],
                gridA[row][column + 1],
                gridA[row + 1][column + 1],
                gridA[row + 1][column],
            ];
            const valuesB = [
                gridB[row][column],
                gridB[row][column + 1],
                gridB[row + 1][column + 1],
                gridB[row + 1][column],
            ];
            const rangeA = cellRange(valuesA);
            const rangeB = cellRange(valuesB);
            if (!rangeA || !rangeB) continue;

            const possibleA = rangeA.min <= 0 && rangeA.max >= 0 || rangeA.minAbs <= nearThreshold;
            const possibleB = rangeB.min <= 0 && rangeB.max >= 0 || rangeB.minAbs <= nearThreshold;
            if (!possibleA || !possibleB) continue;

            const point = refineIntersection(curveA, curveB, {
                x: context.xMin + (context.xMax - context.xMin) * (column + .5) / nx,
                y: context.yMin + (context.yMax - context.yMin) * (row + .5) / ny,
            }, spec, context);

            if (!point || !context.inBounds(point.x, point.y)) continue;
            if (!results.some((existing) => (
                Math.abs(existing.x - point.x) <= toleranceX
                && Math.abs(existing.y - point.y) <= toleranceY
            ))) {
                results.push(point);
            }
        }
    }

    return results.sort((a, b) => a.x - b.x || a.y - b.y);
}

function refineCritical(curve, point, spec, context) {
    let x = point.x;
    let y = point.y;
    const maxStep = Math.max(
        Math.abs(context.xMax - context.xMin),
        Math.abs(context.yMax - context.yMin),
    ) * .15;

    for (let iteration = 0; iteration < 24; iteration += 1) {
        const gradient = gradientAt(curve.fn, x, y, spec.derivativeStep);
        if (!Number.isFinite(gradient.x) || !Number.isFinite(gradient.y)) return null;
        if (Math.hypot(gradient.x, gradient.y) <= spec.intersectionTolerance) break;

        const hessian = hessianAt(curve.fn, x, y, spec.derivativeStep);
        const determinant = hessian.xx * hessian.yy - hessian.xy * hessian.xy;
        if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;

        let dx = (-gradient.x * hessian.yy + hessian.xy * gradient.y) / determinant;
        let dy = (-hessian.xx * gradient.y + hessian.xy * gradient.x) / determinant;
        const length = Math.hypot(dx, dy);
        if (length > maxStep) {
            dx *= maxStep / length;
            dy *= maxStep / length;
        }
        x += dx;
        y += dy;
    }

    const gradient = gradientAt(curve.fn, x, y, spec.derivativeStep);
    if (
        !Number.isFinite(gradient.x)
        || !Number.isFinite(gradient.y)
        || Math.hypot(gradient.x, gradient.y) > spec.intersectionTolerance * 8
    ) return null;

    const hessian = hessianAt(curve.fn, x, y, spec.derivativeStep);
    const determinant = hessian.xx * hessian.yy - hessian.xy * hessian.xy;
    let classification = 'degenerate';
    if (determinant > spec.intersectionTolerance) {
        classification = hessian.xx > 0 ? 'local minimum' : 'local maximum';
    } else if (determinant < -spec.intersectionTolerance) {
        classification = 'saddle';
    }

    return {
        x,
        y,
        value: safeValue(curve.fn, x, y),
        classification,
        determinant,
    };
}

export function findCriticalPoints(curve, spec, context) {
    const nx = Math.max(16, Math.min(120, Math.round(spec.criticalResolution)));
    const ny = Math.max(
        14,
        Math.round(nx * context.plotHeight / Math.max(1, context.plotWidth)),
    );
    const gx = [];
    const gy = [];

    for (let row = 0; row <= ny; row += 1) {
        const y = context.yMin + (context.yMax - context.yMin) * row / ny;
        const rowX = [];
        const rowY = [];
        for (let column = 0; column <= nx; column += 1) {
            const x = context.xMin + (context.xMax - context.xMin) * column / nx;
            const gradient = gradientAt(curve.fn, x, y, spec.derivativeStep);
            rowX.push(gradient.x);
            rowY.push(gradient.y);
        }
        gx.push(rowX);
        gy.push(rowY);
    }

    const results = [];
    const toleranceX = Math.abs(context.xMax - context.xMin) / nx * .9;
    const toleranceY = Math.abs(context.yMax - context.yMin) / ny * .9;

    for (let row = 0; row < ny; row += 1) {
        for (let column = 0; column < nx; column += 1) {
            const valuesX = [
                gx[row][column],
                gx[row][column + 1],
                gx[row + 1][column + 1],
                gx[row + 1][column],
            ];
            const valuesY = [
                gy[row][column],
                gy[row][column + 1],
                gy[row + 1][column + 1],
                gy[row + 1][column],
            ];
            const rangeX = cellRange(valuesX);
            const rangeY = cellRange(valuesY);
            if (!rangeX || !rangeY) continue;
            if (!(rangeX.min <= 0 && rangeX.max >= 0)) continue;
            if (!(rangeY.min <= 0 && rangeY.max >= 0)) continue;

            const point = refineCritical(curve, {
                x: context.xMin + (context.xMax - context.xMin) * (column + .5) / nx,
                y: context.yMin + (context.yMax - context.yMin) * (row + .5) / ny,
            }, spec, context);
            if (!point || !context.inBounds(point.x, point.y)) continue;

            if (!results.some((existing) => (
                Math.abs(existing.x - point.x) <= toleranceX
                && Math.abs(existing.y - point.y) <= toleranceY
            ))) {
                results.push(point);
            }
        }
    }

    return results.sort((a, b) => a.x - b.x || a.y - b.y);
}

function markerPriority(marker) {
    if (marker.type === 'intersection') return 100;
    if (marker.type === 'singular') return 95;
    if (marker.type === 'local maximum' || marker.type === 'local minimum') return 90;
    if (marker.type === 'saddle') return 85;
    if (marker.type === 'tangent' || marker.type === 'normal' || marker.type === 'gradient') return 80;
    return 50;
}

function overlaps(a, b, padding = 0) {
    return !(
        a.x + a.width + padding <= b.x
        || b.x + b.width + padding <= a.x
        || a.y + a.height + padding <= b.y
        || b.y + b.height + padding <= a.y
    );
}

function markerShape(marker, spec, context) {
    const x = context.sx(marker.x);
    const y = context.sy(marker.y);
    const size = spec.pointSize;
    const color = safeColor(marker.color, '#111827');

    if (marker.type === 'singular') {
        return `<path d="M${x - size},${y - size} L${x + size},${y + size} M${x + size},${y - size} L${x - size},${y + size}" stroke="${color}" stroke-width="2.4"/>`;
    }
    if (marker.type === 'saddle') {
        return `<path d="M${x},${y - size} L${x + size},${y} L${x},${y + size} L${x - size},${y} Z" fill="${color}" stroke="#fff" stroke-width="1"/>`;
    }
    if (marker.type === 'local maximum' || marker.type === 'local minimum') {
        return `<rect x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}" rx="1" fill="${color}" stroke="#fff" stroke-width="1"/>`;
    }
    return `<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" stroke="#fff" stroke-width="1.2"/>`;
}

function markerMarkup(markers, spec, context, avoidBoxes = []) {
    const parts = [];
    const boxes = [...avoidBoxes];
    const compact = context.baseWidth <= 520 || context.plotWidth <= 450;
    const limit = Math.min(
        spec.maxCoordinateLabels,
        compact ? Math.min(7, spec.maxCoordinateLabels) : spec.maxCoordinateLabels,
    );
    let labelsShown = 0;

    markers.forEach((marker) => {
        parts.push(`<g class="qmx-implicit-marker"><title>${context.escapeXml(`${marker.label}: ${coordinateText(marker, spec.coordinateDecimals)}`)}</title>${markerShape(marker, spec, context)}</g>`);
    });

    if (!spec.showCoordinates || limit <= 0) {
        return { markup: parts.join(''), boxes: [], omitted: markers.length };
    }

    const sorted = [...markers].sort((a, b) => markerPriority(b) - markerPriority(a));
    const fontSize = compact ? 9.1 : 10.3;

    sorted.forEach((marker) => {
        if (labelsShown >= limit) return;
        const text = coordinateText(marker, spec.coordinateDecimals);
        const width = Math.max(42, text.length * fontSize * .58 + 10);
        const height = fontSize + 8;
        const px = context.sx(marker.x);
        const py = context.sy(marker.y);
        const gap = spec.pointSize + spec.labelPadding;
        const candidates = [
            { x: px + gap, y: py - height - gap, width, height, name: 'ne' },
            { x: px - width - gap, y: py - height - gap, width, height, name: 'nw' },
            { x: px + gap, y: py + gap, width, height, name: 'se' },
            { x: px - width - gap, y: py + gap, width, height, name: 'sw' },
            { x: px - width / 2, y: py - height - gap * 1.8, width, height, name: 'n' },
            { x: px - width / 2, y: py + gap * 1.8, width, height, name: 's' },
        ];

        const valid = candidates.find((box) => (
            box.x >= context.margin.left + 1
            && box.y >= context.margin.top + 1
            && box.x + box.width <= context.margin.left + context.plotWidth - 1
            && box.y + box.height <= context.margin.top + context.plotHeight - 1
            && !boxes.some((other) => overlaps(box, other, 2))
        ));

        if (!valid) return;
        boxes.push(valid);
        labelsShown += 1;

        const leaderX = Math.max(valid.x, Math.min(px, valid.x + valid.width));
        const leaderY = Math.max(valid.y, Math.min(py, valid.y + valid.height));
        const leader = Math.hypot(leaderX - px, leaderY - py) > 8
            ? `<line x1="${px}" y1="${py}" x2="${leaderX}" y2="${leaderY}" stroke="#64748b" stroke-width=".7"/>`
            : '';

        parts.push(
            `<g class="qmx-implicit-coordinate-label" data-qmx-label-position="${valid.name}">${leader}<rect x="${valid.x}" y="${valid.y}" width="${valid.width}" height="${valid.height}" rx="3" fill="#fff" fill-opacity=".92" stroke="#e2e8f0"/><text x="${valid.x + 5}" y="${valid.y + valid.height - 4}" font-size="${fontSize}" font-weight="700" fill="#0f172a">${context.escapeXml(text)}</text></g>`,
        );
    });

    return {
        markup: parts.join(''),
        boxes: boxes.slice(avoidBoxes.length),
        omitted: Math.max(0, markers.length - labelsShown),
    };
}

function implicitDensity(spec) {
    return (spec.curves?.length || 0) + (spec.operations?.length || 0) * 2;
}

function resolvedPanelPlacement(spec, baseWidth) {
    const requested = normalizePlacement(spec.panelPlacement);
    if (!spec.showCalculationPanel || requested === 'hidden') return 'hidden';
    if (requested !== 'auto') return requested;
    if (!(spec.operations?.length)) return 'hidden';
    return baseWidth >= 620 ? 'right' : 'bottom';
}

function resolvedLegendPlacement(spec, panelPlacement, baseWidth) {
    const requested = normalizePlacement(spec.legendPlacement);
    if (spec.legend === false || requested === 'hidden') return 'hidden';
    if (requested !== 'auto') return requested;
    if (['left', 'right', 'bottom'].includes(panelPlacement)) return panelPlacement;
    return implicitDensity(spec) >= 5
        ? (baseWidth >= 620 ? 'right' : 'bottom')
        : 'inside';
}

function implicitLayoutPlan(spec, dimensions = {}) {
    const baseWidth = Number(dimensions.width) || 720;
    const panelPlacement = resolvedPanelPlacement(spec, baseWidth);
    const legendPlacement = resolvedLegendPlacement(spec, panelPlacement, baseWidth);
    const side = spec.outsidePanelWidth;
    const bottom = spec.outsidePanelHeight;

    return {
        extraLeft: panelPlacement === 'left' || legendPlacement === 'left' ? side : 0,
        extraRight: panelPlacement === 'right' || legendPlacement === 'right' ? side : 0,
        extraBottom: panelPlacement === 'bottom' || legendPlacement === 'bottom' ? bottom : 0,
        meta: {
            panelPlacement,
            legendPlacement,
        },
    };
}

function insidePanelCandidates(width, height, context) {
    const inset = 8;
    return [
        { x: context.margin.left + inset, y: context.margin.top + context.plotHeight - height - inset, width, height, name: 'inside-bottom-left' },
        { x: context.margin.left + context.plotWidth - width - inset, y: context.margin.top + context.plotHeight - height - inset, width, height, name: 'inside-bottom-right' },
        { x: context.margin.left + inset, y: context.margin.top + inset, width, height, name: 'inside-top-left' },
        { x: context.margin.left + context.plotWidth - width - inset, y: context.margin.top + inset, width, height, name: 'inside-top-right' },
    ];
}

function panelBandBox(placement, context, preferredWidth, preferredHeight) {
    const band = context.bands?.[placement];
    if (!band) return null;
    const inset = 8;
    const width = placement === 'bottom'
        ? Math.min(preferredWidth, band.width * .58)
        : Math.max(130, band.width - inset * 2);
    let height = Math.min(preferredHeight, band.height - inset * 2);
    let y = band.y + inset;

    if (['left', 'right'].includes(placement)) {
        const legendSameBand = context.layout?.legendPlacement === placement;
        y = legendSameBand
            ? band.y + Math.min(185, band.height * .48) + inset
            : band.y + band.height - height - inset;
        if (legendSameBand) {
            height = Math.min(height, band.y + band.height - inset - y);
        }
    }

    return {
        x: band.x + inset,
        y,
        width,
        height: Math.max(68, height),
        name: `outside-${placement}`,
    };
}

function resultPanel(rows, spec, context) {
    const placement = context.layout?.panelPlacement
        || resolvedPanelPlacement(spec, context.baseWidth);
    if (!spec.showCalculationPanel || !rows.length || placement === 'hidden') {
        return { markup: '', box: null, placement: 'hidden' };
    }

    const compact = context.baseWidth <= 520 || context.plotWidth <= 450;
    const fontSize = compact ? 9 : 10.2;
    const lineHeight = compact ? 15 : 17;
    const maxChars = compact ? 42 : 72;
    const clippedRows = rows.slice(0, spec.maxCalculationRows).map((row) => {
        const text = String(row || '');
        return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
    });
    const maximumLength = Math.max(18, ...clippedRows.map((row) => row.length));
    const preferredWidth = Math.min(550, Math.max(270, maximumLength * fontSize * .56 + 24));
    const preferredHeight = 30 + clippedRows.length * lineHeight
        + (rows.length > clippedRows.length ? 12 : 0);
    let box = ['left', 'right', 'bottom'].includes(placement)
        ? panelBandBox(placement, context, preferredWidth, preferredHeight)
        : null;

    if (!box) {
        const width = Math.min(context.plotWidth - 16, preferredWidth);
        const height = Math.min(context.plotHeight - 16, preferredHeight);
        box = insidePanelCandidates(width, height, context)[0];
    }

    if (!box) return { markup: '', box: null, placement: 'hidden' };

    const maxRowsByHeight = Math.max(1, Math.floor((box.height - 38) / lineHeight));
    const visibleRows = clippedRows.slice(0, maxRowsByHeight);
    const omitted = Math.max(0, rows.length - visibleRows.length);
    const parts = [
        `<g class="qmx-implicit-panel" data-qmx-panel-position="${box.name}" data-qmx-box="${box.x.toFixed(2)},${box.y.toFixed(2)},${box.width.toFixed(2)},${box.height.toFixed(2)}">`,
        `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="7" fill="#fff" fill-opacity=".96" stroke="#cbd5e1"/>`,
        `<text x="${box.x + 10}" y="${box.y + 18}" font-size="11" font-weight="800" fill="#0f172a">Implicit / multivariable results</text>`,
    ];

    visibleRows.forEach((row, index) => {
        parts.push(
            `<text x="${box.x + 10}" y="${box.y + 36 + index * lineHeight}" font-size="${fontSize}" fill="#334155">${context.escapeXml(row)}</text>`,
        );
    });
    if (omitted) {
        parts.push(
            `<text x="${box.x + box.width - 10}" y="${box.y + box.height - 7}" text-anchor="end" font-size="9" fill="#64748b">+${omitted} more</text>`,
        );
    }
    parts.push('</g>');

    return { markup: parts.join(''), box, placement };
}

function legendPositions(placement) {
    if (placement === 'left') return ['outside-left-top', 'outside-left-bottom'];
    if (placement === 'right') return ['outside-right-top', 'outside-right-bottom'];
    if (placement === 'bottom') return ['outside-bottom-right', 'outside-bottom-left'];
    if (placement === 'hidden') return [];
    return ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
}

function addMarker(markers, marker, context) {
    if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)) return;
    const toleranceX = Math.abs(context.xMax - context.xMin) * 2e-5;
    const toleranceY = Math.abs(context.yMax - context.yMin) * 2e-5;
    const existing = markers.find((item) => (
        Math.abs(item.x - marker.x) <= toleranceX
        && Math.abs(item.y - marker.y) <= toleranceY
        && item.label === marker.label
    ));
    if (existing) {
        if (markerPriority(marker) > markerPriority(existing)) Object.assign(existing, marker);
        return;
    }
    markers.push(marker);
}

function renderImplicit(spec, context) {
    const { compiled, byKey } = compileCurves(spec);
    const content = [];
    const fills = [];
    const lines = [];
    const arrows = [];
    const markers = [];
    const rows = [];
    const legend = [];

    compiled.forEach((curve) => {
        if (curve.visible === false || !curve.fn) return;
        legend.push({
            label: `${curve.label}: ${curve.expression}${curve.level ? ` = ${curve.level}` : ' = 0'}`,
            color: curve.color,
            kind: 'line',
        });
    });

    spec.operations.forEach((operation) => {
        if (operation.kind === 'area-inside') {
            const curve = curveByName(byKey, operation.curve);
            if (!curve?.fn) return;
            const shaded = shadedAreaMarkup(curve, operation, spec, context);
            fills.push(shaded.markup);
            legend.push({
                label: `${operation.side} side of ${curve.label}`,
                color: operation.color,
                kind: 'box',
            });
            rows.push(
                `${curve.label}: ${operation.side} area in view ≈ ${formatNumber(shaded.area, 6)}`,
            );
            return;
        }

        if (['tangent', 'normal', 'gradient'].includes(operation.kind)) {
            const curve = curveByName(byKey, operation.curve);
            if (!curve?.fn) return;
            const projected = projectToLevel(
                curve,
                { x: operation.x, y: operation.y },
                spec,
            );
            if (!projected) return;
            const gradient = gradientAt(
                curve.fn,
                projected.x,
                projected.y,
                spec.derivativeStep,
            );
            const norm = Math.hypot(gradient.x, gradient.y);

            if (!Number.isFinite(norm) || norm < 1e-10) {
                rows.push(`${curve.label}: gradient is zero near ${coordinateText(projected, spec.coordinateDecimals)}; tangent/normal is singular.`);
                addMarker(markers, {
                    ...projected,
                    label: curve.label,
                    type: 'singular',
                    color: '#dc2626',
                }, context);
                return;
            }

            if (operation.kind === 'tangent') {
                lines.push(lineMarkup(
                    projected,
                    { x: -gradient.y, y: gradient.x },
                    operation.color,
                    'qmx-implicit-tangent',
                    '6 4',
                    context,
                ));
                rows.push(
                    `tangent ${curve.label} at ${coordinateText(projected, spec.coordinateDecimals)}: ${tangentEquation(gradient, projected, 5)}`,
                );
                legend.push({ label: `tangent ${curve.label}`, color: operation.color, kind: 'line' });
            } else if (operation.kind === 'normal') {
                lines.push(lineMarkup(
                    projected,
                    gradient,
                    operation.color,
                    'qmx-implicit-normal',
                    '8 4',
                    context,
                ));
                rows.push(
                    `normal ${curve.label} at ${coordinateText(projected, spec.coordinateDecimals)}: ${normalEquation(gradient, projected, 5)}`,
                );
                legend.push({ label: `normal ${curve.label}`, color: operation.color, kind: 'line' });
            } else {
                arrows.push(gradientArrow(projected, gradient, operation, spec, context));
                rows.push(
                    `∇${curve.label}${coordinateText(projected, spec.coordinateDecimals)} = <${formatNumber(gradient.x, 5)}, ${formatNumber(gradient.y, 5)}>`,
                );
                legend.push({ label: `gradient ${curve.label}`, color: operation.color, kind: 'line' });
            }

            addMarker(markers, {
                ...projected,
                label: curve.label,
                type: operation.kind,
                color: operation.color,
            }, context);
            return;
        }

        if (operation.kind === 'intersections') {
            const curveA = curveByName(byKey, operation.curveA);
            const curveB = curveByName(byKey, operation.curveB);
            if (!curveA?.fn || !curveB?.fn) return;
            const points = findImplicitIntersections(curveA, curveB, spec, context);
            rows.push(`${curveA.label} ∩ ${curveB.label}: ${points.length} point${points.length === 1 ? '' : 's'}`);
            points.forEach((point) => {
                rows.push(`${curveA.label} ∩ ${curveB.label}: ${coordinateText(point, spec.coordinateDecimals)}`);
                addMarker(markers, {
                    ...point,
                    label: `${curveA.label} ∩ ${curveB.label}`,
                    type: 'intersection',
                    color: operation.color,
                }, context);
            });
            return;
        }

        if (operation.kind === 'critical' || operation.kind === 'singular') {
            const curve = curveByName(byKey, operation.curve);
            if (!curve?.fn) return;
            const points = findCriticalPoints(curve, spec, context);
            const selected = operation.kind === 'singular'
                ? points.filter((point) => Math.abs(point.value - curve.level) <= spec.intersectionTolerance * 12)
                : points;

            rows.push(
                `${curve.label}: ${selected.length} ${operation.kind === 'singular' ? 'singular' : 'critical'} point${selected.length === 1 ? '' : 's'}`,
            );
            selected.forEach((point) => {
                const type = operation.kind === 'singular' ? 'singular' : point.classification;
                rows.push(
                    `${curve.label}: ${type} at ${coordinateText(point, spec.coordinateDecimals)}, value=${formatNumber(point.value, 5)}`,
                );
                addMarker(markers, {
                    ...point,
                    label: curve.label,
                    type,
                    color: operation.color,
                }, context);
            });
        }
    });

    content.push(...fills);

    compiled.forEach((curve) => {
        if (curve.visible === false || !curve.fn) return;
        const segments = marchingSquaresSegments(
            curve.fn,
            curve.level,
            context,
            spec.contourResolution,
            context.plotHeight / Math.max(1, context.plotWidth),
        );
        const path = contourPath(segments, context);
        if (path) {
            content.push(
                `<path class="qmx-implicit-curve" d="${path}" fill="none" stroke="${curve.color}" stroke-width="${spec.curveWidth}" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${context.clipId})"><title>${context.escapeXml(`${curve.label}: ${curve.expression} = ${curve.level}`)}</title></path>`,
            );
        } else {
            rows.push(`${curve.label}: no level curve found in current range.`);
        }
    });

    content.push(...lines, ...arrows);

    const panel = resultPanel(rows, spec, context);
    const markerLayout = markerMarkup(
        markers,
        spec,
        context,
        panel.box && panel.placement === 'inside' ? [panel.box] : [],
    );
    content.push(markerLayout.markup, panel.markup);

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
            preferredPositions: legendPositions(legendPlacement),
        },
    };
}

export function registerImplicitGraph(registry) {
    if (registry.has('implicit')) return;

    registry.register({
        id: 'implicit',
        label: 'Implicit & Multivariable',
        group: 'Calculus & Regions',
        description: [
            'Commands:',
            'implicit | label | F(x,y) expression or equation | level=0 | optional color',
            'tangent/normal/gradient | curve label | point=x,y | optional scale/color',
            'intersections | curve A | curve B | optional color',
            'area-inside | curve label | side=negative|positive | color | opacity',
            'critical | field label | optional color',
            'singular | implicit curve label | optional color',
            'Equation input যেমন x^2+y^2=16 স্বয়ংক্রিয়ভাবে F(x,y)=0 আকারে রূপান্তর হয়।',
        ].join('\n'),
        defaults: {
            expression: [
                'implicit | E | 9*x^2 + 4*y^2 - 36 | #2563eb',
                'tangent | E | point=2,0 | #dc2626',
                'normal | E | point=2,0 | #16a34a',
                'gradient | E | point=2,0 | scale=2 | #7c3aed',
                'area-inside | E | side=negative | #60a5fa | opacity=0.20',
            ].join('\n'),
            curves: [],
            operations: [],
            contourResolution: 110,
            curveWidth: 2.4,
            derivativeStep: .0005,
            intersectionResolution: 84,
            intersectionTolerance: .001,
            criticalResolution: 44,
            fillResolution: 100,
            fillOpacity: .22,
            pointSize: 5,
            vectorLength: 2,
            showCoordinates: true,
            coordinateDecimals: 3,
            maxCoordinateLabels: 14,
            showCalculationPanel: true,
            maxCalculationRows: 12,
            panelPlacement: 'auto',
            legendPlacement: 'auto',
            outsidePanelWidth: 280,
            outsidePanelHeight: 175,
            labelPadding: 4,
        },
        layout(spec, dimensions) {
            return implicitLayoutPlan(normalizeImplicitSpec(spec), dimensions);
        },
        editor: {
            mode: 'implicit',
            inputLabel: 'Implicit / multivariable commands',
            placeholder: [
                'implicit | E | 9*x^2 + 4*y^2 - 36 | #2563eb',
                'implicit | C | x^2 + y^2 = 16 | #0ea5e9',
                'level | L | x^2 - y^2 | level=0 | #ea580c',
                'tangent | E | point=2,0 | #dc2626',
                'normal | E | point=2,0 | #16a34a',
                'gradient | E | point=2,0 | scale=2 | #7c3aed',
                'intersections | C | L | #111827',
                'area-inside | C | side=negative | #60a5fa | opacity=0.22',
                'critical | L | #7c3aed',
                'singular | L | #dc2626',
            ].join('\n'),
            fields: [
                { key: 'contourResolution', label: 'Implicit contour resolution', type: 'number', min: 28, max: 220, step: 4 },
                { key: 'curveWidth', label: 'Curve/line width', type: 'number', min: .5, max: 8, step: .25 },
                { key: 'derivativeStep', label: 'Gradient derivative step', type: 'number', min: .0000001, max: .5, step: .0001 },
                { key: 'intersectionResolution', label: 'Intersection search resolution', type: 'number', min: 24, max: 180, step: 4 },
                { key: 'intersectionTolerance', label: 'Numerical tolerance', type: 'number', min: .00000001, max: 1, step: .0001 },
                { key: 'criticalResolution', label: 'Critical-point search resolution', type: 'number', min: 16, max: 120, step: 4 },
                { key: 'fillResolution', label: 'Area-fill resolution', type: 'number', min: 20, max: 220, step: 4 },
                { key: 'fillOpacity', label: 'Default fill opacity', type: 'number', min: .02, max: .9, step: .01 },
                { key: 'pointSize', label: 'Point marker size', type: 'number', min: 2, max: 12, step: .5 },
                { key: 'vectorLength', label: 'Default gradient-vector length', type: 'number', min: .1, max: 100, step: .1 },
                { key: 'showCoordinates', label: 'Show point coordinates', type: 'checkbox' },
                { key: 'coordinateDecimals', label: 'Coordinate decimal places', type: 'number', min: 0, max: 8, step: 1 },
                { key: 'maxCoordinateLabels', label: 'Maximum coordinate labels', type: 'number', min: 0, max: 40, step: 1 },
                { key: 'labelPadding', label: 'Coordinate-label spacing', type: 'number', min: 1, max: 14, step: 1 },
                { key: 'showCalculationPanel', label: 'Show calculation summary', type: 'checkbox' },
                { key: 'maxCalculationRows', label: 'Maximum summary rows', type: 'number', min: 2, max: 24, step: 1 },
                { key: 'panelPlacement', label: 'Summary panel position', type: 'select', options: [['auto', 'Auto'], ['inside', 'Inside plot'], ['left', 'Outside left'], ['right', 'Outside right'], ['bottom', 'Outside bottom'], ['hidden', 'Hidden']] },
                { key: 'legendPlacement', label: 'Legend position', type: 'select', options: [['auto', 'Auto'], ['inside', 'Inside plot'], ['left', 'Outside left'], ['right', 'Outside right'], ['bottom', 'Outside bottom'], ['hidden', 'Hidden']] },
                { key: 'outsidePanelWidth', label: 'Outside side-band width', type: 'number', min: 190, max: 420, step: 10 },
                { key: 'outsidePanelHeight', label: 'Outside bottom-band height', type: 'number', min: 110, max: 300, step: 10 },
            ],
        },
        parseInput(text) {
            const expression = normalizeImplicitSource(text);
            const parsed = parseImplicitInput(expression);
            return {
                expression,
                curves: parsed.curves,
                operations: parsed.operations,
                parseErrors: parsed.errors,
            };
        },
        formatInput(spec) {
            const formatted = formatImplicitInput(spec.curves, spec.operations);
            return formatted || normalizeImplicitSource(spec.expression);
        },
        normalize: normalizeImplicitSpec,
        validate(spec) {
            const effective = normalizeImplicitSpec(spec);
            if (effective.parseErrors?.length) return [effective.parseErrors[0]];
            if (!effective.curves?.length) {
                return ['কমপক্ষে একটি implicit command লিখুন।'];
            }

            const { compiled, byKey } = compileCurves(effective);
            for (const curve of compiled) {
                if (!curve.expression || !curve.fn) {
                    return [`${curve.label}: F(x,y) expression invalid.`];
                }
            }

            for (const operation of effective.operations || []) {
                if (['tangent', 'normal', 'gradient', 'area-inside', 'critical', 'singular'].includes(operation.kind)) {
                    if (!curveByName(byKey, operation.curve)) {
                        return [`${operation.kind}: curve/field "${operation.curve}" পাওয়া যায়নি।`];
                    }
                }
                if (operation.kind === 'intersections') {
                    if (!curveByName(byKey, operation.curveA) || !curveByName(byKey, operation.curveB)) {
                        return ['intersections: একটি বা উভয় curve reference পাওয়া যায়নি।'];
                    }
                }
            }

            return [];
        },
        detect(source) {
            const lines = normalizeImplicitSource(source)
                .split(/\n/)
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('//'));
            const kinds = lines.map((line) => normalizeKind(splitParts(line)[0]));
            const curveCount = kinds.filter((kind) => CURVE_KINDS.has(kind)).length;
            const operationCount = kinds.filter((kind) => OPERATION_KINDS.has(kind)).length;

            if (curveCount) {
                const parsed = parseImplicitInput(source);
                return {
                    score: 150 + Math.min(12, curveCount * 2 + operationCount),
                    spec: {
                        expression: normalizeImplicitSource(source),
                        curves: parsed.curves,
                        operations: parsed.operations,
                    },
                };
            }

            return null;
        },
        render: renderImplicit,
    });
}
