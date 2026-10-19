import {
    GRAPH_COLORS,
    clamp,
    safeColor,
    toEnglishDigits,
} from '../graph-utils.js';

const POINT_KINDS = new Set(['point']);
const DERIVED_POINT_KINDS = new Set(['midpoint', 'intersection', 'line-intersection']);
const OBJECT_KINDS = new Set([
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
]);
const MEASURE_KINDS = new Set(['measure', 'measurement']);

function normalizeKind(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, '-');
}

function normalizeName(value) {
    return String(value || '').trim().slice(0, 80);
}

export function normalizeGeometrySource(value) {
    return toEnglishDigits(String(value || ''))
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[｜∣│¦ǀ]/g, '|')
        .replace(/[−–—]/g, '-')
        .replace(/\r\n?/g, '\n');
}

function splitParts(line) {
    return normalizeGeometrySource(line)
        .split(/\s*\|\s*/)
        .map((part) => part.trim());
}

function joined(parts) {
    return String((parts || []).join(' , '));
}

function colorOption(parts, fallback) {
    const source = joined(parts);
    const explicit = source.match(/\b(?:color|stroke)\s*=\s*(#[0-9a-f]{6})\b/i)?.[1];
    const positional = parts.find((part) => /^#[0-9a-f]{6}$/i.test(String(part || '').trim()));
    return safeColor(explicit || positional, fallback);
}

function fillOption(parts, fallback = 'none') {
    const source = joined(parts);
    const match = source.match(/\bfill\s*=\s*(#[0-9a-f]{6}|none)\b/i);
    if (!match) return fallback;
    return match[1].toLowerCase() === 'none' ? 'none' : safeColor(match[1], fallback);
}

function numberOption(parts, names, fallback = NaN) {
    const source = joined(parts);
    for (const name of names) {
        const pattern = new RegExp(
            `(?:^|[,;\\s])${name}\\s*=\\s*([-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?)`,
            'i',
        );
        const match = source.match(pattern);
        if (match) {
            const value = Number(match[1]);
            if (Number.isFinite(value)) return value;
        }
    }
    return fallback;
}

function textOption(parts, names, fallback = '') {
    const source = joined(parts);
    for (const name of names) {
        const pattern = new RegExp(
            `(?:^|[,;\\s])${name}\\s*=\\s*([^,;|]+)`,
            'i',
        );
        const match = source.match(pattern);
        if (match && String(match[1]).trim()) return String(match[1]).trim();
    }
    return fallback;
}

function booleanOption(parts, names, fallback = false) {
    const source = joined(parts);
    for (const name of names) {
        if (new RegExp(`(?:^|[,;\\s])${name}(?:$|[,;\\s])`, 'i').test(source)) return true;
        const match = source.match(
            new RegExp(`(?:^|[,;\\s])${name}\\s*=\\s*(true|false|1|0|yes|no|on|off)`, 'i'),
        );
        if (match) return ['true', '1', 'yes', 'on'].includes(match[1].toLowerCase());
    }
    return fallback;
}

function namesFrom(value) {
    return String(value || '')
        .split(/\s*,\s*|\s+/)
        .map((item) => normalizeName(item))
        .filter(Boolean);
}

function parsePoint(parts, index) {
    const optionParts = parts.slice(2);
    const locked = booleanOption(optionParts, ['locked', 'lock'], false);
    const draggable = booleanOption(optionParts, ['draggable', 'free'], !locked);
    return {
        kind: 'point',
        label: normalizeName(parts[1] || `P${index + 1}`),
        x: numberOption(optionParts, ['x'], 0),
        y: numberOption(optionParts, ['y'], 0),
        draggable: locked ? false : draggable,
        locked,
        visible: !booleanOption(optionParts, ['hidden'], false),
        color: colorOption(optionParts, GRAPH_COLORS[index % GRAPH_COLORS.length]),
        size: numberOption(optionParts, ['size', 'r'], NaN),
    };
}

function parseDerivedPoint(parts, index) {
    let kind = normalizeKind(parts[0]);
    if (kind === 'line-intersection') kind = 'intersection';

    if (kind === 'midpoint') {
        return {
            kind,
            label: normalizeName(parts[1] || `M${index + 1}`),
            a: normalizeName(parts[2]),
            b: normalizeName(parts[3]),
            color: colorOption(parts.slice(4), '#7c3aed'),
            visible: !booleanOption(parts.slice(4), ['hidden'], false),
        };
    }

    const firstPair = namesFrom(parts[2]);
    const secondPair = namesFrom(parts[3]);
    return {
        kind: 'intersection',
        label: normalizeName(parts[1] || `X${index + 1}`),
        a: firstPair[0] || '',
        b: firstPair[1] || '',
        c: secondPair[0] || '',
        d: secondPair[1] || '',
        color: colorOption(parts.slice(4), '#dc2626'),
        visible: !booleanOption(parts.slice(4), ['hidden'], false),
    };
}

function parseObject(parts, index, defaultFillOpacity) {
    let kind = normalizeKind(parts[0]);
    if (kind === 'triangle' || kind === 'quadrilateral') kind = 'polygon';
    if (kind === 'perp-bisector') kind = 'perpendicular-bisector';

    const label = normalizeName(parts[1] || `${kind}${index + 1}`);
    const fallbackColor = GRAPH_COLORS[(index + 2) % GRAPH_COLORS.length];

    if (['segment', 'ray', 'line'].includes(kind)) {
        return {
            kind,
            label,
            a: normalizeName(parts[2]),
            b: normalizeName(parts[3]),
            color: colorOption(parts.slice(4), fallbackColor),
            width: numberOption(parts.slice(4), ['width'], NaN),
            dashed: booleanOption(parts.slice(4), ['dashed', 'dash'], false),
            visible: !booleanOption(parts.slice(4), ['hidden'], false),
        };
    }

    if (kind === 'polygon') {
        const vertices = namesFrom(parts[2]);
        return {
            kind,
            label,
            vertices,
            color: colorOption(parts.slice(3), fallbackColor),
            fill: fillOption(parts.slice(3), fallbackColor),
            opacity: clamp(
                numberOption(parts.slice(3), ['opacity', 'alpha'], defaultFillOpacity),
                0,
                .95,
                defaultFillOpacity,
            ),
            width: numberOption(parts.slice(3), ['width'], NaN),
            visible: !booleanOption(parts.slice(3), ['hidden'], false),
        };
    }

    if (kind === 'circle') {
        const optionParts = parts.slice(2);
        const source = joined(optionParts);
        const center = source.match(/\bcenter\s*=\s*([A-Za-z][A-Za-z0-9_-]*)/i)?.[1]
            || normalizeName(parts[2]);
        const radius = numberOption(optionParts, ['r', 'radius'], NaN);
        const throughMatch = source.match(
            /\bthrough\s*=\s*([A-Za-z][A-Za-z0-9_-]*(?:\s*,\s*[A-Za-z][A-Za-z0-9_-]*){0,2})/i,
        );
        let through = throughMatch ? namesFrom(throughMatch[1]) : [];
        if (!through.length && parts.length >= 5 && !/=/.test(String(parts[2] || ''))) {
            through = [normalizeName(parts[2]), normalizeName(parts[3]), normalizeName(parts[4])].filter(Boolean);
        }
        return {
            kind,
            label,
            center: normalizeName(center),
            radius,
            through,
            color: colorOption(optionParts, fallbackColor),
            fill: fillOption(optionParts, 'none'),
            opacity: clamp(
                numberOption(optionParts, ['opacity', 'alpha'], defaultFillOpacity),
                0,
                .95,
                defaultFillOpacity,
            ),
            width: numberOption(optionParts, ['width'], NaN),
            visible: !booleanOption(optionParts, ['hidden'], false),
        };
    }

    if (kind === 'parallel' || kind === 'perpendicular') {
        const optionParts = parts.slice(2);
        const source = joined(optionParts);
        const through = source.match(/\bthrough\s*=\s*([A-Za-z][A-Za-z0-9_-]*)/i)?.[1]
            || normalizeName(parts[2]);
        const lineMatch = source.match(
            /\bline\s*=\s*([A-Za-z][A-Za-z0-9_-]*)\s*,\s*([A-Za-z][A-Za-z0-9_-]*)/i,
        );
        const pair = lineMatch
            ? [lineMatch[1], lineMatch[2]]
            : namesFrom(parts[3]);
        return {
            kind,
            label,
            through: normalizeName(through),
            a: normalizeName(pair[0]),
            b: normalizeName(pair[1]),
            color: colorOption(optionParts, fallbackColor),
            width: numberOption(optionParts, ['width'], NaN),
            dashed: booleanOption(optionParts, ['dashed', 'dash'], true),
            visible: !booleanOption(optionParts, ['hidden'], false),
        };
    }

    if (kind === 'perpendicular-bisector') {
        return {
            kind,
            label,
            a: normalizeName(parts[2]),
            b: normalizeName(parts[3]),
            color: colorOption(parts.slice(4), fallbackColor),
            width: numberOption(parts.slice(4), ['width'], NaN),
            dashed: booleanOption(parts.slice(4), ['dashed', 'dash'], true),
            visible: !booleanOption(parts.slice(4), ['hidden'], false),
        };
    }

    if (kind === 'angle-bisector') {
        return {
            kind,
            label,
            a: normalizeName(parts[2]),
            b: normalizeName(parts[3]),
            c: normalizeName(parts[4]),
            color: colorOption(parts.slice(5), fallbackColor),
            width: numberOption(parts.slice(5), ['width'], NaN),
            dashed: booleanOption(parts.slice(5), ['dashed', 'dash'], true),
            visible: !booleanOption(parts.slice(5), ['hidden'], false),
        };
    }

    return null;
}

function parseMeasure(parts, index) {
    const type = normalizeKind(parts[2] || 'distance');
    return {
        kind: 'measure',
        label: normalizeName(parts[1] || `m${index + 1}`),
        measureType: type,
        refs: parts.slice(3)
            .flatMap((part) => namesFrom(part))
            .filter(Boolean),
        color: colorOption(parts.slice(3), '#0f172a'),
        visible: !booleanOption(parts.slice(3), ['hidden'], false),
    };
}

export function parseGeometryInput(text, defaultFillOpacity = .14) {
    const points = [];
    const derivedPoints = [];
    const objects = [];
    const measures = [];
    const errors = [];

    normalizeGeometrySource(text)
        .split(/\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'))
        .slice(0, 140)
        .forEach((line, lineIndex) => {
            const parts = splitParts(line);
            const kind = normalizeKind(parts[0]);

            if (POINT_KINDS.has(kind)) {
                points.push(parsePoint(parts, points.length));
                return;
            }

            if (DERIVED_POINT_KINDS.has(kind)) {
                derivedPoints.push(parseDerivedPoint(parts, derivedPoints.length));
                return;
            }

            if (OBJECT_KINDS.has(kind)) {
                const object = parseObject(parts, objects.length, defaultFillOpacity);
                if (object) objects.push(object);
                return;
            }

            if (MEASURE_KINDS.has(kind)) {
                measures.push(parseMeasure(parts, measures.length));
                return;
            }

            errors.push(`Line ${lineIndex + 1}: unknown geometry command "${parts[0] || ''}".`);
        });

    return {
        points: points.slice(0, 80),
        derivedPoints: derivedPoints.slice(0, 40),
        objects: objects.slice(0, 100),
        measures: measures.slice(0, 80),
        errors,
    };
}

function pointLine(point) {
    const state = point.draggable === false ? 'locked' : 'draggable';
    const color = point.color ? ` | ${point.color}` : '';
    const size = Number.isFinite(Number(point.size)) ? ` | size=${Number(point.size)}` : '';
    return `point | ${point.label} | x=${Number(point.x)}, y=${Number(point.y)} | ${state}${color}${size}`;
}

function derivedPointLine(point) {
    const color = point.color ? ` | ${point.color}` : '';
    if (point.kind === 'midpoint') {
        return `midpoint | ${point.label} | ${point.a} | ${point.b}${color}`;
    }
    return `intersection | ${point.label} | ${point.a},${point.b} | ${point.c},${point.d}${color}`;
}

function objectLine(object) {
    const color = object.color ? ` | ${object.color}` : '';
    const width = Number.isFinite(Number(object.width)) ? ` | width=${Number(object.width)}` : '';
    const dash = object.dashed ? ' | dashed' : '';

    if (['segment', 'ray', 'line'].includes(object.kind)) {
        return `${object.kind} | ${object.label} | ${object.a} | ${object.b}${color}${width}${dash}`;
    }

    if (object.kind === 'polygon') {
        const fill = object.fill && object.fill !== 'none' ? ` | fill=${object.fill}` : ' | fill=none';
        return `polygon | ${object.label} | ${object.vertices.join(',')}${color}${fill} | opacity=${Number(object.opacity)}${width}`;
    }

    if (object.kind === 'circle') {
        let definition = '';
        if (object.through?.length >= 3) definition = `through=${object.through.slice(0, 3).join(',')}`;
        else if (object.center && object.through?.length) definition = `center=${object.center}, through=${object.through[0]}`;
        else definition = `center=${object.center}, r=${Number(object.radius)}`;
        const fill = object.fill && object.fill !== 'none' ? ` | fill=${object.fill}` : '';
        return `circle | ${object.label} | ${definition}${color}${fill} | opacity=${Number(object.opacity)}${width}`;
    }

    if (object.kind === 'parallel' || object.kind === 'perpendicular') {
        return `${object.kind} | ${object.label} | through=${object.through} | line=${object.a},${object.b}${color}${width}${dash}`;
    }

    if (object.kind === 'perpendicular-bisector') {
        return `perpendicular-bisector | ${object.label} | ${object.a} | ${object.b}${color}${width}${dash}`;
    }

    if (object.kind === 'angle-bisector') {
        return `angle-bisector | ${object.label} | ${object.a} | ${object.b} | ${object.c}${color}${width}${dash}`;
    }

    return '';
}

function measureLine(measure) {
    const color = measure.color ? ` | ${measure.color}` : '';
    return `measure | ${measure.label} | ${measure.measureType} | ${measure.refs.join(' | ')}${color}`;
}

export function formatGeometryInput(points, derivedPoints, objects, measures) {
    return [
        ...(points || []).map(pointLine),
        ...(derivedPoints || []).map(derivedPointLine),
        ...(objects || []).map(objectLine).filter(Boolean),
        ...(measures || []).map(measureLine),
    ].join('\n');
}

function hasGeometryCommand(source) {
    return normalizeGeometrySource(source)
        .split(/\n/)
        .some((line) => {
            const kind = normalizeKind(splitParts(line)[0]);
            return POINT_KINDS.has(kind)
                || DERIVED_POINT_KINDS.has(kind)
                || OBJECT_KINDS.has(kind)
                || MEASURE_KINDS.has(kind);
        });
}

function normalizeGeometrySpec(spec) {
    const source = normalizeGeometrySource(spec.expression);
    const parsedSource = parseGeometryInput(source, spec.defaultFillOpacity);
    const arrayState = {
        points: Array.isArray(spec.points) ? spec.points : [],
        derivedPoints: Array.isArray(spec.derivedPoints) ? spec.derivedPoints : [],
        objects: Array.isArray(spec.objects) ? spec.objects : [],
        measures: Array.isArray(spec.measures) ? spec.measures : [],
        errors: Array.isArray(spec.parseErrors) ? spec.parseErrors : [],
    };
    const parsed = hasGeometryCommand(source)
        ? parsedSource
        : (arrayState.points.length ? arrayState : parsedSource);

    const points = parsed.points.slice(0, 80).map((point, index) => ({
        kind: 'point',
        label: normalizeName(point?.label || `P${index + 1}`),
        x: clamp(point?.x, -1e9, 1e9, 0),
        y: clamp(point?.y, -1e9, 1e9, 0),
        draggable: point?.locked === true ? false : point?.draggable !== false,
        locked: point?.locked === true || point?.draggable === false,
        visible: point?.visible !== false,
        color: safeColor(point?.color, GRAPH_COLORS[index % GRAPH_COLORS.length]),
        size: clamp(point?.size, 2, 16, spec.pointSize),
    }));

    const derivedPoints = parsed.derivedPoints.slice(0, 40).map((point, index) => ({
        ...point,
        kind: normalizeKind(point?.kind),
        label: normalizeName(point?.label || `D${index + 1}`),
        a: normalizeName(point?.a),
        b: normalizeName(point?.b),
        c: normalizeName(point?.c),
        d: normalizeName(point?.d),
        visible: point?.visible !== false,
        color: safeColor(point?.color, '#7c3aed'),
    }));

    const objects = parsed.objects.slice(0, 100).map((object, index) => ({
        ...object,
        kind: normalizeKind(object?.kind),
        label: normalizeName(object?.label || `G${index + 1}`),
        a: normalizeName(object?.a),
        b: normalizeName(object?.b),
        c: normalizeName(object?.c),
        through: Array.isArray(object?.through)
            ? object.through.map(normalizeName).filter(Boolean)
            : normalizeName(object?.through),
        center: normalizeName(object?.center),
        vertices: Array.isArray(object?.vertices) ? object.vertices.map(normalizeName).filter(Boolean) : [],
        color: safeColor(object?.color, GRAPH_COLORS[(index + 2) % GRAPH_COLORS.length]),
        fill: object?.fill === 'none' ? 'none' : safeColor(object?.fill, object?.color),
        opacity: clamp(object?.opacity, 0, .95, spec.defaultFillOpacity),
        width: clamp(object?.width, .5, 10, spec.lineWidth),
        radius: clamp(object?.radius, 0, 1e9, 0),
        dashed: object?.dashed === true,
        visible: object?.visible !== false,
    }));

    const measures = parsed.measures.slice(0, 80).map((measure, index) => ({
        ...measure,
        kind: 'measure',
        label: normalizeName(measure?.label || `m${index + 1}`),
        measureType: normalizeKind(measure?.measureType || 'distance'),
        refs: Array.isArray(measure?.refs) ? measure.refs.map(normalizeName).filter(Boolean) : [],
        color: safeColor(measure?.color, '#0f172a'),
        visible: measure?.visible !== false,
    }));

    return {
        ...spec,
        points,
        derivedPoints,
        objects,
        measures,
        parseErrors: parsed.errors || [],
        expression: points.length
            ? formatGeometryInput(points, derivedPoints, objects, measures)
            : source,
        pointSize: clamp(spec.pointSize, 2, 16, 5),
        lineWidth: clamp(spec.lineWidth, .5, 10, 2.2),
        defaultFillOpacity: clamp(spec.defaultFillOpacity, 0, .95, .14),
        showPointLabels: spec.showPointLabels !== false,
        showObjectLabels: spec.showObjectLabels === true,
        showMeasurements: spec.showMeasurements !== false,
        coordinateDecimals: Math.round(clamp(spec.coordinateDecimals, 0, 8, 2)),
        measurementDecimals: Math.round(clamp(spec.measurementDecimals, 0, 8, 3)),
        smartMeasurementLabels: spec.smartMeasurementLabels !== false,
        measurementLabelSpacing: clamp(spec.measurementLabelSpacing, 1, 20, 5),
        maxMeasurementLabels: Math.round(clamp(spec.maxMeasurementLabels, 0, 40, 14)),
        snapToGrid: spec.snapToGrid !== false,
        gridSnapStep: clamp(spec.gridSnapStep, 1e-9, 1e9, 1),
        snapToPoints: spec.snapToPoints !== false,
        snapDistancePx: clamp(spec.snapDistancePx, 2, 40, 12),
        constrainToPlot: spec.constrainToPlot !== false,
        dragUpdatesLive: spec.dragUpdatesLive !== false,
        showConstructionSummary: spec.showConstructionSummary !== false,
        maxSummaryRows: Math.round(clamp(spec.maxSummaryRows, 2, 30, 12)),
        summaryPlacement: ['auto', 'inside', 'left', 'right', 'bottom', 'hidden'].includes(spec.summaryPlacement)
            ? spec.summaryPlacement
            : 'auto',
        legendPlacement: ['auto', 'inside', 'left', 'right', 'bottom', 'hidden'].includes(spec.legendPlacement)
            ? spec.legendPlacement
            : 'auto',
        outsidePanelWidth: Math.round(clamp(spec.outsidePanelWidth, 190, 420, 270)),
        outsidePanelHeight: Math.round(clamp(spec.outsidePanelHeight, 110, 300, 160)),
        aspectLock: spec.aspectLock !== false,
    };
}

function mapPoint(point) {
    return {
        x: Number(point.x),
        y: Number(point.y),
        label: point.label,
        color: point.color,
        visible: point.visible !== false,
        draggable: point.draggable === true,
        sourceKind: point.kind || 'point',
        size: point.size,
    };
}

function lineIntersection(a, b, c, d) {
    const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) return null;
    const determinant1 = a.x * b.y - a.y * b.x;
    const determinant2 = c.x * d.y - c.y * d.x;
    return {
        x: (determinant1 * (c.x - d.x) - (a.x - b.x) * determinant2) / denominator,
        y: (determinant1 * (c.y - d.y) - (a.y - b.y) * determinant2) / denominator,
    };
}

function circumcircle(a, b, c) {
    const denominator = 2 * (
        a.x * (b.y - c.y)
        + b.x * (c.y - a.y)
        + c.x * (a.y - b.y)
    );
    if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) return null;

    const a2 = a.x * a.x + a.y * a.y;
    const b2 = b.x * b.x + b.y * b.y;
    const c2 = c.x * c.x + c.y * c.y;
    const center = {
        x: (
            a2 * (b.y - c.y)
            + b2 * (c.y - a.y)
            + c2 * (a.y - b.y)
        ) / denominator,
        y: (
            a2 * (c.x - b.x)
            + b2 * (a.x - c.x)
            + c2 * (b.x - a.x)
        ) / denominator,
    };
    return {
        center,
        radius: Math.hypot(center.x - a.x, center.y - a.y),
    };
}

function unitVector(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length < 1e-12) return null;
    return { x: dx / length, y: dy / length };
}

function polygonArea(points) {
    if (!Array.isArray(points) || points.length < 3) return NaN;
    let sum = 0;
    points.forEach((point, index) => {
        const next = points[(index + 1) % points.length];
        sum += point.x * next.y - next.x * point.y;
    });
    return Math.abs(sum) / 2;
}

function polygonPerimeter(points) {
    if (!Array.isArray(points) || points.length < 2) return NaN;
    return points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return sum + Math.hypot(next.x - point.x, next.y - point.y);
    }, 0);
}

function polygonCentroid(points) {
    if (!Array.isArray(points) || !points.length) return null;
    const areaSigned = points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2;

    if (Math.abs(areaSigned) < 1e-12) {
        return {
            x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
            y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        };
    }

    let x = 0;
    let y = 0;
    points.forEach((point, index) => {
        const next = points[(index + 1) % points.length];
        const cross = point.x * next.y - next.x * point.y;
        x += (point.x + next.x) * cross;
        y += (point.y + next.y) * cross;
    });
    return {
        x: x / (6 * areaSigned),
        y: y / (6 * areaSigned),
    };
}

export function resolveGeometry(specInput) {
    const spec = normalizeGeometrySpec(specInput);
    const pointMap = new Map();
    const resolvedPoints = [];
    const unresolved = [];

    spec.points.forEach((point) => {
        const resolved = mapPoint(point);
        pointMap.set(point.label, resolved);
        resolvedPoints.push(resolved);
    });

    const pending = [...spec.derivedPoints];
    for (let pass = 0; pass < 8 && pending.length; pass += 1) {
        let progress = false;
        for (let index = pending.length - 1; index >= 0; index -= 1) {
            const definition = pending[index];
            let point = null;

            if (definition.kind === 'midpoint') {
                const a = pointMap.get(definition.a);
                const b = pointMap.get(definition.b);
                if (a && b) point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            } else if (definition.kind === 'intersection') {
                const a = pointMap.get(definition.a);
                const b = pointMap.get(definition.b);
                const c = pointMap.get(definition.c);
                const d = pointMap.get(definition.d);
                if (a && b && c && d) point = lineIntersection(a, b, c, d);
            }

            if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
                const resolved = {
                    ...point,
                    label: definition.label,
                    color: definition.color,
                    visible: definition.visible !== false,
                    draggable: false,
                    sourceKind: definition.kind,
                    size: spec.pointSize,
                };
                pointMap.set(definition.label, resolved);
                resolvedPoints.push(resolved);
                pending.splice(index, 1);
                progress = true;
            }
        }
        if (!progress) break;
    }
    unresolved.push(...pending.map((item) => `${item.kind} ${item.label}`));

    const resolvedObjects = [];
    const objectMap = new Map();

    spec.objects.forEach((object) => {
        if (object.visible === false) return;
        let resolved = null;

        if (['segment', 'ray', 'line'].includes(object.kind)) {
            const a = pointMap.get(object.a);
            const b = pointMap.get(object.b);
            if (a && b) resolved = { ...object, aPoint: a, bPoint: b };
        } else if (object.kind === 'polygon') {
            const vertices = object.vertices.map((name) => pointMap.get(name)).filter(Boolean);
            if (vertices.length === object.vertices.length && vertices.length >= 3) {
                resolved = {
                    ...object,
                    vertexPoints: vertices,
                    area: polygonArea(vertices),
                    perimeter: polygonPerimeter(vertices),
                    centroid: polygonCentroid(vertices),
                };
            }
        } else if (object.kind === 'circle') {
            let circle = null;
            if (object.through?.length >= 3) {
                const points = object.through.slice(0, 3).map((name) => pointMap.get(name));
                if (points.every(Boolean)) circle = circumcircle(points[0], points[1], points[2]);
            } else {
                const center = pointMap.get(object.center);
                if (center && object.through?.length) {
                    const through = pointMap.get(object.through[0]);
                    if (through) circle = {
                        center,
                        radius: Math.hypot(through.x - center.x, through.y - center.y),
                    };
                } else if (center && Number.isFinite(object.radius) && object.radius > 0) {
                    circle = { center, radius: object.radius };
                }
            }
            if (circle && Number.isFinite(circle.radius) && circle.radius > 0) {
                resolved = { ...object, centerPoint: circle.center, radius: circle.radius };
            }
        } else if (object.kind === 'parallel' || object.kind === 'perpendicular') {
            const through = pointMap.get(object.through);
            const a = pointMap.get(object.a);
            const b = pointMap.get(object.b);
            const direction = a && b ? unitVector(a, b) : null;
            if (through && direction) {
                resolved = {
                    ...object,
                    throughPoint: through,
                    direction: object.kind === 'parallel'
                        ? direction
                        : { x: -direction.y, y: direction.x },
                };
            }
        } else if (object.kind === 'perpendicular-bisector') {
            const a = pointMap.get(object.a);
            const b = pointMap.get(object.b);
            const direction = a && b ? unitVector(a, b) : null;
            if (a && b && direction) {
                resolved = {
                    ...object,
                    throughPoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
                    direction: { x: -direction.y, y: direction.x },
                };
            }
        } else if (object.kind === 'angle-bisector') {
            const a = pointMap.get(object.a);
            const b = pointMap.get(object.b);
            const c = pointMap.get(object.c);
            const u = a && b ? unitVector(b, a) : null;
            const v = b && c ? unitVector(b, c) : null;
            if (a && b && c && u && v) {
                let direction = { x: u.x + v.x, y: u.y + v.y };
                const length = Math.hypot(direction.x, direction.y);
                if (length < 1e-12) direction = { x: -u.y, y: u.x };
                else direction = { x: direction.x / length, y: direction.y / length };
                resolved = { ...object, throughPoint: b, direction };
            }
        }

        if (resolved) {
            resolvedObjects.push(resolved);
            objectMap.set(object.label, resolved);
        } else {
            unresolved.push(`${object.kind} ${object.label}`);
        }
    });

    return {
        spec,
        pointMap,
        points: resolvedPoints,
        objects: resolvedObjects,
        objectMap,
        unresolved,
    };
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

function lineBoundarySegment(point, direction, context, ray = false) {
    const dx = direction.x;
    const dy = direction.y;
    const candidates = [];
    const epsilon = 1e-12;

    const add = (x, y, t) => {
        if (
            Number.isFinite(x)
            && Number.isFinite(y)
            && x >= context.xMin - 1e-9
            && x <= context.xMax + 1e-9
            && y >= context.yMin - 1e-9
            && y <= context.yMax + 1e-9
            && (!ray || t >= -1e-10)
        ) {
            candidates.push({ x, y, t });
        }
    };

    if (Math.abs(dx) > epsilon) {
        [context.xMin, context.xMax].forEach((x) => {
            const t = (x - point.x) / dx;
            add(x, point.y + t * dy, t);
        });
    }
    if (Math.abs(dy) > epsilon) {
        [context.yMin, context.yMax].forEach((y) => {
            const t = (y - point.y) / dy;
            add(point.x + t * dx, y, t);
        });
    }

    const unique = [];
    candidates.forEach((candidate) => {
        if (!unique.some((item) => Math.hypot(item.x - candidate.x, item.y - candidate.y) < 1e-8)) {
            unique.push(candidate);
        }
    });
    unique.sort((a, b) => a.t - b.t);

    if (ray) {
        const end = unique.filter((item) => item.t >= -1e-10).sort((a, b) => b.t - a.t)[0];
        return end ? [point, end] : null;
    }
    if (unique.length < 2) return null;
    return [unique[0], unique[unique.length - 1]];
}

function pathBetween(a, b, context) {
    return `M${context.sx(a.x).toFixed(2)},${context.sy(a.y).toFixed(2)} L${context.sx(b.x).toFixed(2)},${context.sy(b.y).toFixed(2)}`;
}

function objectStroke(object, spec) {
    return {
        color: safeColor(object.color, spec.color),
        width: clamp(object.width, .5, 10, spec.lineWidth),
        dash: object.dashed ? '7 5' : '',
    };
}

function labelMarkup(text, point, color, context, fontSize = 10) {
    const x = context.sx(point.x);
    const y = context.sy(point.y);
    const value = String(text || '');
    const width = Math.max(28, value.length * fontSize * .58 + 9);
    return `<g class="qmx-geometry-object-label"><rect x="${x - width / 2}" y="${y - fontSize - 9}" width="${width}" height="${fontSize + 7}" rx="3" fill="#fff" fill-opacity=".9" stroke="#e2e8f0"/><text x="${x}" y="${y - 6}" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="${safeColor(color, '#0f172a')}">${context.escapeXml(value)}</text></g>`;
}

function arrowHead(start, end, color, context) {
    const x0 = context.sx(start.x);
    const y0 = context.sy(start.y);
    const x1 = context.sx(end.x);
    const y1 = context.sy(end.y);
    const length = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ux = (x1 - x0) / length;
    const uy = (y1 - y0) / length;
    const size = 8;
    return `<path d="M${x1},${y1} L${x1 - ux * size - uy * size * .55},${y1 - uy * size + ux * size * .55} L${x1 - ux * size + uy * size * .55},${y1 - uy * size - ux * size * .55} Z" fill="${color}"/>`;
}

function renderObject(object, spec, context) {
    const stroke = objectStroke(object, spec);
    const dash = stroke.dash ? ` stroke-dasharray="${stroke.dash}"` : '';
    const label = spec.showObjectLabels;
    const parts = [];

    if (object.kind === 'segment') {
        parts.push(`<path class="qmx-geometry-segment" d="${pathBetween(object.aPoint, object.bPoint, context)}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}"${dash} clip-path="url(#${context.clipId})"/>`);
        if (label) parts.push(labelMarkup(object.label, {
            x: (object.aPoint.x + object.bPoint.x) / 2,
            y: (object.aPoint.y + object.bPoint.y) / 2,
        }, stroke.color, context));
    } else if (object.kind === 'ray') {
        const direction = unitVector(object.aPoint, object.bPoint);
        const segment = direction ? lineBoundarySegment(object.aPoint, direction, context, true) : null;
        if (segment) {
            parts.push(`<path class="qmx-geometry-ray" d="${pathBetween(segment[0], segment[1], context)}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}"${dash} clip-path="url(#${context.clipId})"/>`);
            parts.push(arrowHead(segment[0], segment[1], stroke.color, context));
        }
    } else if (object.kind === 'line') {
        const direction = unitVector(object.aPoint, object.bPoint);
        const segment = direction ? lineBoundarySegment(object.aPoint, direction, context, false) : null;
        if (segment) parts.push(`<path class="qmx-geometry-line" d="${pathBetween(segment[0], segment[1], context)}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}"${dash} clip-path="url(#${context.clipId})"/>`);
    } else if (object.kind === 'polygon') {
        const points = object.vertexPoints
            .map((point) => `${context.sx(point.x).toFixed(2)},${context.sy(point.y).toFixed(2)}`)
            .join(' ');
        parts.push(`<polygon class="qmx-geometry-polygon" points="${points}" fill="${object.fill === 'none' ? 'none' : object.fill}" fill-opacity="${object.opacity}" stroke="${stroke.color}" stroke-width="${stroke.width}"${dash} clip-path="url(#${context.clipId})"/>`);
        if (label && object.centroid) parts.push(labelMarkup(object.label, object.centroid, stroke.color, context));
    } else if (object.kind === 'circle') {
        const cx = context.sx(object.centerPoint.x);
        const cy = context.sy(object.centerPoint.y);
        const rx = Math.abs(context.sx(object.centerPoint.x + object.radius) - cx);
        const ry = Math.abs(context.sy(object.centerPoint.y + object.radius) - cy);
        parts.push(`<ellipse class="qmx-geometry-circle" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${object.fill === 'none' ? 'none' : object.fill}" fill-opacity="${object.opacity}" stroke="${stroke.color}" stroke-width="${stroke.width}"${dash} clip-path="url(#${context.clipId})"/>`);
        if (label) parts.push(labelMarkup(object.label, {
            x: object.centerPoint.x,
            y: object.centerPoint.y + object.radius,
        }, stroke.color, context));
    } else if (['parallel', 'perpendicular', 'perpendicular-bisector', 'angle-bisector'].includes(object.kind)) {
        const segment = lineBoundarySegment(object.throughPoint, object.direction, context, false);
        if (segment) parts.push(`<path class="qmx-geometry-construction qmx-geometry-${object.kind}" d="${pathBetween(segment[0], segment[1], context)}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}"${dash} clip-path="url(#${context.clipId})"/>`);
    }

    return parts.join('');
}

function angleValue(a, b, c) {
    const u = unitVector(b, a);
    const v = unitVector(b, c);
    if (!u || !v) return NaN;
    const dot = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
    return Math.acos(dot) * 180 / Math.PI;
}

function angleArc(a, b, c, color, context) {
    const u = unitVector(b, a);
    const v = unitVector(b, c);
    if (!u || !v) return '';
    const start = Math.atan2(u.y, u.x);
    let end = Math.atan2(v.y, v.x);
    let delta = end - start;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;
    end = start + delta;

    const radiusUnits = Math.min(
        Math.abs(context.xMax - context.xMin),
        Math.abs(context.yMax - context.yMin),
    ) * .055;
    const point1 = {
        x: b.x + Math.cos(start) * radiusUnits,
        y: b.y + Math.sin(start) * radiusUnits,
    };
    const point2 = {
        x: b.x + Math.cos(end) * radiusUnits,
        y: b.y + Math.sin(end) * radiusUnits,
    };
    const rx = Math.abs(context.sx(b.x + radiusUnits) - context.sx(b.x));
    const ry = Math.abs(context.sy(b.y + radiusUnits) - context.sy(b.y));
    const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
    const sweep = delta < 0 ? 1 : 0;

    return `<path class="qmx-geometry-angle-arc" d="M${context.sx(point1.x)},${context.sy(point1.y)} A${rx},${ry} 0 ${largeArc} ${sweep} ${context.sx(point2.x)},${context.sy(point2.y)}" fill="none" stroke="${color}" stroke-width="1.8"/>`;
}

export function calculateGeometryMeasure(measure, resolved) {
    const points = resolved.pointMap;
    const objects = resolved.objectMap;
    const refs = measure.refs || [];
    const type = measure.measureType;

    if (type === 'distance') {
        const a = points.get(refs[0]);
        const b = points.get(refs[1]);
        if (!a || !b) return null;
        return {
            value: Math.hypot(b.x - a.x, b.y - a.y),
            position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            points: [a, b],
            suffix: '',
        };
    }

    if (type === 'slope') {
        const a = points.get(refs[0]);
        const b = points.get(refs[1]);
        if (!a || !b) return null;
        const dx = b.x - a.x;
        return {
            value: Math.abs(dx) < 1e-12 ? Infinity : (b.y - a.y) / dx,
            position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            points: [a, b],
            suffix: '',
        };
    }

    if (type === 'angle') {
        const a = points.get(refs[0]);
        const b = points.get(refs[1]);
        const c = points.get(refs[2]);
        if (!a || !b || !c) return null;
        return {
            value: angleValue(a, b, c),
            position: b,
            points: [a, b, c],
            suffix: '°',
        };
    }

    if (type === 'coordinate' || type === 'coordinates') {
        const point = points.get(refs[0]);
        if (!point) return null;
        return {
            value: null,
            text: `(${point.x}, ${point.y})`,
            position: point,
            points: [point],
            suffix: '',
        };
    }

    if (type === 'area' || type === 'perimeter') {
        const polygon = objects.get(refs[0]);
        if (!polygon || polygon.kind !== 'polygon') return null;
        return {
            value: type === 'area' ? polygon.area : polygon.perimeter,
            position: polygon.centroid,
            object: polygon,
            suffix: '',
        };
    }

    if (type === 'radius' || type === 'diameter') {
        const circle = objects.get(refs[0]);
        if (!circle || circle.kind !== 'circle') return null;
        return {
            value: type === 'radius' ? circle.radius : circle.radius * 2,
            position: {
                x: circle.centerPoint.x + circle.radius * .55,
                y: circle.centerPoint.y,
            },
            object: circle,
            suffix: '',
        };
    }

    return null;
}

function boxesOverlap(a, b, padding = 0) {
    return !(
        a.x + a.width + padding <= b.x
        || b.x + b.width + padding <= a.x
        || a.y + a.height + padding <= b.y
        || b.y + b.height + padding <= a.y
    );
}

function measurementText(measure, result, spec) {
    const valueText = result.text || (
        Number.isFinite(result.value)
            ? `${formatNumber(result.value, spec.measurementDecimals)}${result.suffix || ''}`
            : 'undefined'
    );
    return `${measure.label}=${valueText}`;
}

function pointAvoidanceBoxes(resolved, spec, context) {
    const boxes = [];
    resolved.points.forEach((point) => {
        const x = context.sx(point.x);
        const y = context.sy(point.y);
        const size = clamp(point.size, 2, 16, spec.pointSize);
        boxes.push({
            x: x - size - 3,
            y: y - size - 3,
            width: size * 2 + 6,
            height: size * 2 + 6,
        });

        if (spec.showPointLabels) {
            const width = Math.max(16, String(point.label || '').length * 6.4 + 5);
            boxes.push({
                x: x + size + 2,
                y: y - size - 15,
                width,
                height: 14,
            });
        }
    });
    return boxes;
}

function measurementCandidates(anchor, width, height, spacing, context, index) {
    const x = context.sx(anchor.x);
    const y = context.sy(anchor.y);
    const ring = Math.floor(index / 8);
    const gap = spacing + 7 + ring * (height + spacing);
    return [
        { x: x - width / 2, y: y - height - gap, width, height, name: 'north' },
        { x: x - width / 2, y: y + gap, width, height, name: 'south' },
        { x: x + gap, y: y - height / 2, width, height, name: 'east' },
        { x: x - width - gap, y: y - height / 2, width, height, name: 'west' },
        { x: x + gap, y: y - height - gap, width, height, name: 'north-east' },
        { x: x - width - gap, y: y - height - gap, width, height, name: 'north-west' },
        { x: x + gap, y: y + gap, width, height, name: 'south-east' },
        { x: x - width - gap, y: y + gap, width, height, name: 'south-west' },
    ];
}

function measurementBoxInsidePlot(box, context) {
    return (
        box.x >= context.margin.left + 2
        && box.y >= context.margin.top + 2
        && box.x + box.width <= context.margin.left + context.plotWidth - 2
        && box.y + box.height <= context.margin.top + context.plotHeight - 2
    );
}

function measurementLabelMarkup(entry, box, spec, context) {
    const { measure, result, text } = entry;
    const color = safeColor(measure.color, '#0f172a');
    const anchorX = context.sx(result.position.x);
    const anchorY = context.sy(result.position.y);
    const leaderX = Math.max(box.x, Math.min(anchorX, box.x + box.width));
    const leaderY = Math.max(box.y, Math.min(anchorY, box.y + box.height));
    const leader = Math.hypot(leaderX - anchorX, leaderY - anchorY) > 7
        ? `<line class="qmx-geometry-measure-leader" x1="${anchorX}" y1="${anchorY}" x2="${leaderX}" y2="${leaderY}" stroke="${color}" stroke-width=".75" stroke-opacity=".72"/>`
        : '';
    const angle = (
        measure.measureType === 'angle'
        && result.points?.length === 3
    ) ? angleArc(
        result.points[0],
        result.points[1],
        result.points[2],
        color,
        context,
    ) : '';

    return [
        angle,
        `<g class="qmx-geometry-measure-label" data-qmx-measure="${context.escapeXml(measure.label)}" data-qmx-measure-position="${box.name}" data-qmx-measure-box="${box.x.toFixed(2)},${box.y.toFixed(2)},${box.width.toFixed(2)},${box.height.toFixed(2)}">`,
        leader,
        `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="3" fill="#fff" fill-opacity=".94" stroke="#dbe3ee"/>`,
        `<text x="${box.x + box.width / 2}" y="${box.y + box.height - 5}" text-anchor="middle" font-size="10" font-weight="700" fill="${color}">${context.escapeXml(text)}</text>`,
        `</g>`,
    ].join('');
}

function layoutMeasurementLabels(entries, resolved, spec, context) {
    if (!entries.length || spec.maxMeasurementLabels <= 0) {
        return { markup: '', boxes: [], omitted: entries.length };
    }

    const reserved = pointAvoidanceBoxes(resolved, spec, context);
    const placed = [];
    const parts = [];
    const visible = entries.slice(0, spec.maxMeasurementLabels);

    visible.forEach((entry, index) => {
        const width = Math.max(46, Math.min(190, entry.text.length * 5.9 + 12));
        const height = 19;
        let box = null;

        if (spec.smartMeasurementLabels) {
            const candidates = measurementCandidates(
                entry.result.position,
                width,
                height,
                spec.measurementLabelSpacing,
                context,
                index,
            );
            box = candidates.find((candidate) => (
                measurementBoxInsidePlot(candidate, context)
                && !reserved.some((other) => boxesOverlap(candidate, other, 2))
                && !placed.some((other) => boxesOverlap(candidate, other, spec.measurementLabelSpacing))
            )) || null;
        }

        if (!box) {
            const anchorX = context.sx(entry.result.position.x);
            const anchorY = context.sy(entry.result.position.y);
            const fallback = {
                x: Math.max(
                    context.margin.left + 2,
                    Math.min(
                        context.margin.left + context.plotWidth - width - 2,
                        anchorX - width / 2,
                    ),
                ),
                y: Math.max(
                    context.margin.top + 2,
                    Math.min(
                        context.margin.top + context.plotHeight - height - 2,
                        anchorY - height - 8 - index * (height + 2),
                    ),
                ),
                width,
                height,
                name: 'fallback',
            };
            if (!placed.some((other) => boxesOverlap(fallback, other, 1))) box = fallback;
        }

        if (!box) return;
        placed.push(box);
        parts.push(measurementLabelMarkup(entry, box, spec, context));
    });

    return {
        markup: parts.join(''),
        boxes: placed,
        omitted: Math.max(0, entries.length - placed.length),
    };
}

function resolvedSummaryPlacement(spec, width) {
    if (!spec.showConstructionSummary || spec.summaryPlacement === 'hidden') return 'hidden';
    if (spec.summaryPlacement !== 'auto') return spec.summaryPlacement;
    return width >= 620 ? 'right' : 'bottom';
}

function resolvedLegendPlacement(spec, summaryPlacement, width) {
    if (!spec.legend || spec.legendPlacement === 'hidden') return 'hidden';
    if (spec.legendPlacement !== 'auto') return spec.legendPlacement;
    if (['left', 'right', 'bottom'].includes(summaryPlacement)) return summaryPlacement;
    return width >= 620 ? 'right' : 'bottom';
}

function geometryLayout(spec, dimensions = {}) {
    const width = Number(dimensions.width) || 720;
    const summaryPlacement = resolvedSummaryPlacement(spec, width);
    const legendPlacement = resolvedLegendPlacement(spec, summaryPlacement, width);

    return {
        extraLeft: summaryPlacement === 'left' || legendPlacement === 'left'
            ? spec.outsidePanelWidth
            : 0,
        extraRight: summaryPlacement === 'right' || legendPlacement === 'right'
            ? spec.outsidePanelWidth
            : 0,
        extraBottom: summaryPlacement === 'bottom' || legendPlacement === 'bottom'
            ? spec.outsidePanelHeight
            : 0,
        meta: { summaryPlacement, legendPlacement },
    };
}

function summaryBox(placement, context, preferredWidth, preferredHeight) {
    const inset = 8;

    if (['left', 'right', 'bottom'].includes(placement)) {
        const band = context.bands?.[placement];
        if (!band) return null;
        if (placement === 'bottom') {
            return {
                x: band.x + inset,
                y: band.y + inset,
                width: Math.min(preferredWidth, band.width * .58),
                height: Math.min(preferredHeight, band.height - inset * 2),
                name: 'outside-bottom',
            };
        }
        const sameLegend = context.layout?.legendPlacement === placement;
        const y = band.y + (sameLegend ? Math.min(180, band.height * .46) : inset);
        return {
            x: band.x + inset,
            y,
            width: Math.max(130, band.width - inset * 2),
            height: Math.max(68, Math.min(preferredHeight, band.y + band.height - inset - y)),
            name: `outside-${placement}`,
        };
    }

    return {
        x: context.margin.left + 8,
        y: context.margin.top + context.plotHeight - Math.min(preferredHeight, context.plotHeight - 16) - 8,
        width: Math.min(preferredWidth, context.plotWidth - 16),
        height: Math.min(preferredHeight, context.plotHeight - 16),
        name: 'inside',
    };
}

function summaryPanel(rows, spec, context) {
    const placement = context.layout?.summaryPlacement
        || resolvedSummaryPlacement(spec, context.baseWidth);
    if (!rows.length || placement === 'hidden') return { markup: '', box: null };

    const compact = context.baseWidth <= 520;
    const lineHeight = compact ? 15 : 17;
    const fontSize = compact ? 9 : 10;
    const clipped = rows.slice(0, spec.maxSummaryRows);
    const preferredWidth = Math.min(
        520,
        Math.max(260, Math.max(...clipped.map((row) => row.length), 20) * fontSize * .56 + 24),
    );
    const preferredHeight = 30 + clipped.length * lineHeight
        + (rows.length > clipped.length ? 12 : 0);
    const box = summaryBox(placement, context, preferredWidth, preferredHeight);
    if (!box) return { markup: '', box: null };

    const maxRows = Math.max(1, Math.floor((box.height - 38) / lineHeight));
    const visible = clipped.slice(0, maxRows);
    const omitted = Math.max(0, rows.length - visible.length);
    const parts = [
        `<g class="qmx-geometry-summary" data-qmx-panel-position="${box.name}" data-qmx-box="${box.x.toFixed(2)},${box.y.toFixed(2)},${box.width.toFixed(2)},${box.height.toFixed(2)}">`,
        `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="7" fill="#fff" fill-opacity=".96" stroke="#cbd5e1"/>`,
        `<text x="${box.x + 10}" y="${box.y + 18}" font-size="11" font-weight="800" fill="#0f172a">Geometry measurements</text>`,
    ];
    visible.forEach((row, index) => {
        const text = row.length > 78 ? `${row.slice(0, 77)}…` : row;
        parts.push(`<text x="${box.x + 10}" y="${box.y + 36 + index * lineHeight}" font-size="${fontSize}" fill="#334155">${context.escapeXml(text)}</text>`);
    });
    if (omitted) {
        parts.push(`<text x="${box.x + box.width - 10}" y="${box.y + box.height - 7}" text-anchor="end" font-size="9" fill="#64748b">+${omitted} more</text>`);
    }
    parts.push('</g>');
    return { markup: parts.join(''), box };
}

function legendPositions(placement) {
    if (placement === 'left') return ['outside-left-top', 'outside-left-bottom'];
    if (placement === 'right') return ['outside-right-top', 'outside-right-bottom'];
    if (placement === 'bottom') return ['outside-bottom-right', 'outside-bottom-left'];
    if (placement === 'hidden') return [];
    return ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
}

function renderPoint(point, spec, context) {
    if (point.visible === false) return '';
    const x = context.sx(point.x);
    const y = context.sy(point.y);
    const size = clamp(point.size, 2, 16, spec.pointSize);
    const direct = point.sourceKind === 'point';
    const draggable = direct && point.draggable;
    const cursor = draggable ? 'cursor:grab' : 'cursor:default';
    const dragAttributes = draggable
        ? ` data-qmx-geometry-point="${context.escapeXml(point.label)}" data-qmx-point-x="${point.x}" data-qmx-point-y="${point.y}" tabindex="0" role="button" aria-label="Drag point ${context.escapeXml(point.label)}"`
        : '';
    const marker = point.sourceKind === 'midpoint'
        ? `<rect x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}" rx="1" fill="${point.color}" stroke="#fff" stroke-width="1.2"/>`
        : (point.sourceKind === 'intersection'
            ? `<path d="M${x},${y - size} L${x + size},${y} L${x},${y + size} L${x - size},${y} Z" fill="${point.color}" stroke="#fff" stroke-width="1.2"/>`
            : `<circle cx="${x}" cy="${y}" r="${size}" fill="${point.color}" stroke="#fff" stroke-width="1.2"/>`);
    const label = spec.showPointLabels
        ? `<text x="${x + size + 4}" y="${y - size - 3}" font-size="10.5" font-weight="800" fill="#0f172a" stroke="#fff" stroke-width="3" paint-order="stroke">${context.escapeXml(point.label)}</text>`
        : '';

    return `<g class="qmx-geometry-point${draggable ? ' is-draggable' : ''}"${dragAttributes} style="${cursor}"><title>${context.escapeXml(`${point.label} ${coordinateText(point, spec.coordinateDecimals)}${draggable ? ' — drag to move' : ''}`)}</title>${marker}${label}</g>`;
}

function renderGeometry(spec, context) {
    const resolved = resolveGeometry(spec);
    const content = [];
    const rows = [];
    const legend = [];
    const measurementEntries = [];

    content.push(
        `<rect class="qmx-geometry-drag-surface" x="${context.margin.left}" y="${context.margin.top}" width="${context.plotWidth}" height="${context.plotHeight}" fill="transparent" pointer-events="none" data-plot-x="${context.margin.left}" data-plot-y="${context.margin.top}" data-plot-width="${context.plotWidth}" data-plot-height="${context.plotHeight}" data-x-min="${context.xMin}" data-x-max="${context.xMax}" data-y-min="${context.yMin}" data-y-max="${context.yMax}"/>`,
    );

    resolved.objects.forEach((object) => {
        content.push(renderObject(object, spec, context));
        legend.push({
            label: object.label,
            color: object.color,
            kind: object.kind === 'polygon' || object.kind === 'circle' && object.fill !== 'none'
                ? 'box'
                : 'line',
        });
    });

    if (spec.showMeasurements) {
        spec.measures.forEach((measure) => {
            if (measure.visible === false) return;
            const result = calculateGeometryMeasure(measure, resolved);
            if (!result) {
                rows.push(`${measure.label}: unresolved measurement`);
                return;
            }
            const text = measurementText(measure, result, spec);
            const valueText = text.slice(String(measure.label).length + 1);
            rows.push(`${measure.label} (${measure.measureType}) = ${valueText}`);
            measurementEntries.push({ measure, result, text });
        });
    }

    const measurementLayout = layoutMeasurementLabels(
        measurementEntries,
        resolved,
        spec,
        context,
    );
    content.push(measurementLayout.markup);
    if (measurementLayout.omitted) {
        rows.push(`${measurementLayout.omitted} measurement label${measurementLayout.omitted === 1 ? '' : 's'} hidden to avoid overlap`);
    }

    resolved.points.forEach((point) => content.push(renderPoint(point, spec, context)));

    if (resolved.unresolved.length) {
        rows.push(`Unresolved: ${resolved.unresolved.slice(0, 6).join(', ')}`);
    }
    rows.unshift(
        `${resolved.points.length} points, ${resolved.objects.length} constructions`,
    );

    const panel = summaryPanel(rows, spec, context);
    content.push(panel.markup);

    const legendPlacement = context.layout?.legendPlacement
        || resolvedLegendPlacement(spec, context.layout?.summaryPlacement, context.baseWidth);

    return {
        content: content.join(''),
        legend,
        legendOptions: {
            hidden: legendPlacement === 'hidden',
            avoidBoxes: panel.box ? [panel.box] : [],
            preferredPositions: legendPositions(legendPlacement),
        },
    };
}

export function updateGeometryPoint(specInput, pointName, x, y) {
    const spec = normalizeGeometrySpec(specInput);
    const name = normalizeName(pointName);
    const points = spec.points.map((point) => (
        point.label === name && point.draggable !== false
            ? { ...point, x: Number(x), y: Number(y) }
            : point
    ));
    return normalizeGeometrySpec({
        ...spec,
        points,
        expression: formatGeometryInput(points, spec.derivedPoints, spec.objects, spec.measures),
    });
}

function snappedCoordinate(value, step) {
    return Math.round(value / step) * step;
}

export function snapGeometryPoint(specInput, pointName, x, y, context) {
    const spec = normalizeGeometrySpec(specInput);
    let nextX = Number(x);
    let nextY = Number(y);

    if (spec.constrainToPlot && context) {
        nextX = Math.max(context.xMin, Math.min(context.xMax, nextX));
        nextY = Math.max(context.yMin, Math.min(context.yMax, nextY));
    }

    if (spec.snapToGrid && spec.gridSnapStep > 0) {
        nextX = snappedCoordinate(nextX, spec.gridSnapStep);
        nextY = snappedCoordinate(nextY, spec.gridSnapStep);
    }

    if (spec.snapToPoints && context) {
        const thresholdX = spec.snapDistancePx / Math.max(1, context.plotWidth)
            * Math.abs(context.xMax - context.xMin);
        const thresholdY = spec.snapDistancePx / Math.max(1, context.plotHeight)
            * Math.abs(context.yMax - context.yMin);
        const resolved = resolveGeometry(spec);
        let nearest = null;
        let best = Infinity;
        resolved.points.forEach((point) => {
            if (point.label === pointName) return;
            const dx = (point.x - nextX) / Math.max(thresholdX, 1e-12);
            const dy = (point.y - nextY) / Math.max(thresholdY, 1e-12);
            const distance = Math.hypot(dx, dy);
            if (distance <= 1 && distance < best) {
                nearest = point;
                best = distance;
            }
        });
        if (nearest) {
            nextX = nearest.x;
            nextY = nearest.y;
        }
    }

    return { x: nextX, y: nextY };
}

function svgCoordinates(event, svg) {
    if (!svg?.createSVGPoint) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    return point.matrixTransform(matrix.inverse());
}

function dragContext(preview) {
    const svg = preview.querySelector('svg');
    const surface = preview.querySelector('.qmx-geometry-drag-surface');
    if (!svg || !surface) return null;
    return {
        svg,
        plotX: Number(surface.dataset.plotX),
        plotY: Number(surface.dataset.plotY),
        plotWidth: Number(surface.dataset.plotWidth),
        plotHeight: Number(surface.dataset.plotHeight),
        xMin: Number(surface.dataset.xMin),
        xMax: Number(surface.dataset.xMax),
        yMin: Number(surface.dataset.yMin),
        yMax: Number(surface.dataset.yMax),
    };
}

function pointerToGraph(event, preview) {
    const context = dragContext(preview);
    if (!context) return null;
    const point = svgCoordinates(event, context.svg);
    if (!point) return null;
    return {
        context,
        x: context.xMin
            + (point.x - context.plotX) / context.plotWidth * (context.xMax - context.xMin),
        y: context.yMax
            - (point.y - context.plotY) / context.plotHeight * (context.yMax - context.yMin),
    };
}

function bindGeometryPreview({ preview, spec, updateSpec }) {
    if (!preview || typeof updateSpec !== 'function') return;
    preview.querySelectorAll('[data-qmx-geometry-point]').forEach((node) => {
        node.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            const pointName = node.dataset.qmxGeometryPoint;
            let workingSpec = normalizeGeometrySpec(spec);
            let frame = 0;
            let latest = null;

            const applyLatest = () => {
                frame = 0;
                if (!latest) return;
                const mapped = pointerToGraph(latest, preview);
                if (!mapped) return;
                const snapped = snapGeometryPoint(
                    workingSpec,
                    pointName,
                    mapped.x,
                    mapped.y,
                    mapped.context,
                );
                workingSpec = updateGeometryPoint(
                    workingSpec,
                    pointName,
                    snapped.x,
                    snapped.y,
                );
                updateSpec(workingSpec);
            };

            const move = (moveEvent) => {
                latest = moveEvent;
                if (workingSpec.dragUpdatesLive === false) return;
                if (!frame) frame = requestAnimationFrame(applyLatest);
            };

            const finish = (upEvent) => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', finish);
                window.removeEventListener('pointercancel', finish);
                if (frame) cancelAnimationFrame(frame);
                latest = upEvent;
                applyLatest();
            };

            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', finish, { once: true });
            window.addEventListener('pointercancel', finish, { once: true });
        });
    });
}

function geometryAutoRange(specInput) {
    const resolved = resolveGeometry(specInput);
    const xs = [];
    const ys = [];
    resolved.points.forEach((point) => {
        xs.push(point.x);
        ys.push(point.y);
    });
    resolved.objects.forEach((object) => {
        if (object.kind === 'circle') {
            xs.push(object.centerPoint.x - object.radius, object.centerPoint.x + object.radius);
            ys.push(object.centerPoint.y - object.radius, object.centerPoint.y + object.radius);
        }
    });
    if (!xs.length || !ys.length) return null;
    let xMin = Math.min(...xs);
    let xMax = Math.max(...xs);
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    const xPad = Math.max(1, (xMax - xMin) * .18);
    const yPad = Math.max(1, (yMax - yMin) * .18);
    if (xMin === xMax) {
        xMin -= 2;
        xMax += 2;
    } else {
        xMin -= xPad;
        xMax += xPad;
    }
    if (yMin === yMax) {
        yMin -= 2;
        yMax += 2;
    } else {
        yMin -= yPad;
        yMax += yPad;
    }
    return { xMin, xMax, yMin, yMax };
}

export function registerGeometryGraph(registry) {
    if (registry.has('geometry')) return;

    registry.register({
        id: 'geometry',
        label: 'Interactive Geometry',
        group: 'Geometry & Construction',
        description: [
            'Graph Builder preview-তে draggable point সরালে dependent construction live update হয়।',
            'Saved question/details page-এ geometry static SVG হিসেবে থাকে; Edit Graph-এ আবার draggable হয়।',
            '',
            'Commands:',
            'point | A | x=-3, y=-2 | draggable|locked | optional color',
            'midpoint | M | A | B | optional color',
            'intersection | X | A,B | C,D | optional color',
            'segment/ray/line | label | A | B | optional color',
            'polygon | label | A,B,C,... | fill=#hex | opacity=0.14',
            'circle | label | center=A,r=3 OR center=A,through=B OR through=A,B,C',
            'parallel/perpendicular | label | through=C | line=A,B',
            'perpendicular-bisector | label | A | B',
            'angle-bisector | label | A | B | C',
            'measure | label | distance|slope|angle|area|perimeter|radius|coordinate | references',
        ].join('\n'),
        defaults: {
            expression: [
                'point | A | x=-4, y=-2 | draggable | #2563eb',
                'point | B | x=4, y=-2 | draggable | #ea580c',
                'point | C | x=0, y=4 | draggable | #16a34a',
                'midpoint | M | A | B | #7c3aed',
                'polygon | T | A,B,C | #2563eb | fill=#60a5fa | opacity=0.16',
                'segment | AM | A | M | #9333ea',
                'perpendicular-bisector | p | A | B | #dc2626 | dashed',
                'angle-bisector | q | A | C | B | #0f766e | dashed',
                'circle | K | through=A,B,C | #f59e0b | fill=none',
                'measure | dAB | distance | A | B',
                'measure | angleACB | angle | A | C | B',
                'measure | areaT | area | T',
            ].join('\n'),
            points: [],
            derivedPoints: [],
            objects: [],
            measures: [],
            pointSize: 5,
            lineWidth: 2.2,
            defaultFillOpacity: .14,
            showPointLabels: true,
            showObjectLabels: false,
            showMeasurements: true,
            coordinateDecimals: 2,
            measurementDecimals: 3,
            smartMeasurementLabels: true,
            measurementLabelSpacing: 5,
            maxMeasurementLabels: 14,
            snapToGrid: true,
            gridSnapStep: 1,
            snapToPoints: true,
            snapDistancePx: 12,
            constrainToPlot: true,
            dragUpdatesLive: true,
            showConstructionSummary: true,
            maxSummaryRows: 12,
            summaryPlacement: 'auto',
            legendPlacement: 'auto',
            outsidePanelWidth: 270,
            outsidePanelHeight: 160,
            aspectLock: true,
        },
        layout(spec, dimensions) {
            return geometryLayout(normalizeGeometrySpec(spec), dimensions);
        },
        editor: {
            mode: 'geometry',
            inputLabel: 'Geometry construction commands',
            placeholder: [
                'point | A | x=-3, y=-2 | draggable | #2563eb',
                'point | B | x=3, y=-2 | draggable | #ea580c',
                'point | C | x=0, y=4 | draggable | #16a34a',
                'midpoint | M | A | B',
                'segment | AB | A | B',
                'line | l | A | C',
                'ray | r | B | C',
                'polygon | T | A,B,C | fill=#60a5fa | opacity=0.16',
                'circle | K | through=A,B,C',
                'parallel | p | through=C | line=A,B',
                'perpendicular | n | through=C | line=A,B',
                'perpendicular-bisector | pb | A | B',
                'angle-bisector | ab | A | C | B',
                'measure | dAB | distance | A | B',
                'measure | mAB | slope | A | B',
                'measure | angleACB | angle | A | C | B',
                'measure | areaT | area | T',
            ].join('\n'),
            fields: [
                { key: 'pointSize', label: 'Point marker size', type: 'number', min: 2, max: 16, step: .5 },
                { key: 'lineWidth', label: 'Default line width', type: 'number', min: .5, max: 10, step: .25 },
                { key: 'defaultFillOpacity', label: 'Default polygon/circle opacity', type: 'number', min: 0, max: .95, step: .01 },
                { key: 'showPointLabels', label: 'Show point labels', type: 'checkbox' },
                { key: 'showObjectLabels', label: 'Show construction labels', type: 'checkbox' },
                { key: 'showMeasurements', label: 'Show measurements', type: 'checkbox' },
                { key: 'coordinateDecimals', label: 'Coordinate decimal places', type: 'number', min: 0, max: 8, step: 1 },
                { key: 'measurementDecimals', label: 'Measurement decimal places', type: 'number', min: 0, max: 8, step: 1 },
                { key: 'smartMeasurementLabels', label: 'Smart measurement-label layout', type: 'checkbox' },
                { key: 'measurementLabelSpacing', label: 'Measurement-label spacing', type: 'number', min: 1, max: 20, step: 1 },
                { key: 'maxMeasurementLabels', label: 'Maximum measurement labels', type: 'number', min: 0, max: 40, step: 1 },
                { key: 'snapToGrid', label: 'Snap draggable points to grid', type: 'checkbox' },
                { key: 'gridSnapStep', label: 'Grid snap step', type: 'number', min: .000001, max: 1000000, step: .1 },
                { key: 'snapToPoints', label: 'Snap to other points', type: 'checkbox' },
                { key: 'snapDistancePx', label: 'Point snap distance (px)', type: 'number', min: 2, max: 40, step: 1 },
                { key: 'constrainToPlot', label: 'Keep dragged points inside plot', type: 'checkbox' },
                { key: 'dragUpdatesLive', label: 'Live-update dependencies while dragging', type: 'checkbox' },
                { key: 'showConstructionSummary', label: 'Show measurement summary', type: 'checkbox' },
                { key: 'maxSummaryRows', label: 'Maximum summary rows', type: 'number', min: 2, max: 30, step: 1 },
                { key: 'summaryPlacement', label: 'Summary panel position', type: 'select', options: [['auto', 'Auto'], ['inside', 'Inside plot'], ['left', 'Outside left'], ['right', 'Outside right'], ['bottom', 'Outside bottom'], ['hidden', 'Hidden']] },
                { key: 'legendPlacement', label: 'Legend position', type: 'select', options: [['auto', 'Auto'], ['inside', 'Inside plot'], ['left', 'Outside left'], ['right', 'Outside right'], ['bottom', 'Outside bottom'], ['hidden', 'Hidden']] },
                { key: 'outsidePanelWidth', label: 'Outside side-band width', type: 'number', min: 190, max: 420, step: 10 },
                { key: 'outsidePanelHeight', label: 'Outside bottom-band height', type: 'number', min: 110, max: 300, step: 10 },
            ],
        },
        parseInput(text) {
            const expression = normalizeGeometrySource(text);
            const parsed = parseGeometryInput(expression);
            return {
                expression,
                points: parsed.points,
                derivedPoints: parsed.derivedPoints,
                objects: parsed.objects,
                measures: parsed.measures,
                parseErrors: parsed.errors,
            };
        },
        formatInput(spec) {
            const formatted = formatGeometryInput(
                spec.points,
                spec.derivedPoints,
                spec.objects,
                spec.measures,
            );
            return formatted || normalizeGeometrySource(spec.expression);
        },
        normalize: normalizeGeometrySpec,
        validate(spec) {
            const effective = normalizeGeometrySpec(spec);
            if (effective.parseErrors?.length) return [effective.parseErrors[0]];
            if (!effective.points?.length) return ['কমপক্ষে একটি point command লিখুন।'];

            const names = new Set();
            for (const point of [...effective.points, ...effective.derivedPoints]) {
                if (!point.label) return ['প্রতিটি point-এর একটি label প্রয়োজন।'];
                if (names.has(point.label)) return [`Duplicate point label: ${point.label}`];
                names.add(point.label);
            }

            const resolved = resolveGeometry(effective);
            if (resolved.unresolved.length) {
                return [`Unresolved geometry reference: ${resolved.unresolved[0]}`];
            }

            for (const object of effective.objects) {
                if (object.kind === 'polygon' && object.vertices.length < 3) {
                    return [`${object.label}: polygon-এর কমপক্ষে ৩টি point প্রয়োজন।`];
                }
            }

            for (const measure of effective.measures) {
                if (!calculateGeometryMeasure(measure, resolved)) {
                    return [`${measure.label}: measurement reference invalid.`];
                }
            }

            return [];
        },
        detect(source) {
            const lines = normalizeGeometrySource(source)
                .split(/\n/)
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('//'));
            const kinds = lines.map((line) => normalizeKind(splitParts(line)[0]));
            const pointCount = kinds.filter((kind) => POINT_KINDS.has(kind)).length;
            const constructionCount = kinds.filter((kind) => (
                DERIVED_POINT_KINDS.has(kind)
                || OBJECT_KINDS.has(kind)
                || MEASURE_KINDS.has(kind)
            )).length;

            if (pointCount) {
                const parsed = parseGeometryInput(source);
                return {
                    score: 165 + Math.min(18, pointCount + constructionCount * 2),
                    spec: {
                        expression: normalizeGeometrySource(source),
                        points: parsed.points,
                        derivedPoints: parsed.derivedPoints,
                        objects: parsed.objects,
                        measures: parsed.measures,
                        aspectLock: true,
                    },
                };
            }
            return null;
        },
        autoRange: geometryAutoRange,
        bindPreview: bindGeometryPreview,
        render: renderGeometry,
    });
}
