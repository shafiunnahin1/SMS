import {
    GRAPH_COLORS,
    clamp,
    compileMathExpression,
    formatTick,
    makeTicks,
    safeColor,
    toEnglishDigits,
} from '../graph-utils.js';

const ITEM_KINDS = new Set([
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
]);

function normalizeKind(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, '-');
}

export function normalizeSpace3dSource(value) {
    return toEnglishDigits(String(value || ''))
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[｜∣│¦ǀ]/g, '|')
        .replace(/[−–—]/g, '-')
        .replace(/\r\n?/g, '\n');
}

function splitParts(line) {
    return normalizeSpace3dSource(line)
        .split(/\s*\|\s*/)
        .map((part) => part.trim());
}

function joined(parts) {
    return String((parts || []).join(' ; '));
}

function optionChunks(parts) {
    return (parts || [])
        .flatMap((part) => String(part || '').split(/\s*;\s*/))
        .map((part) => part.trim())
        .filter(Boolean);
}

function parseColor(parts, fallback) {
    const source = optionChunks(parts);
    const explicit = source
        .map((part) => part.match(/^(?:color|stroke|fill)\s*=\s*(#[0-9a-f]{6})$/i)?.[1])
        .find(Boolean);
    const positional = source.find((part) => /^#[0-9a-f]{6}$/i.test(part));
    return safeColor(explicit || positional, fallback);
}

function parseOpacity(parts, fallback) {
    for (const part of optionChunks(parts)) {
        const match = part.match(/^(?:opacity|alpha)\s*=\s*(\d*\.?\d+)$/i);
        if (match) return clamp(match[1], 0.02, 1, fallback);
    }
    return fallback;
}

function parseBoolean(parts, names, fallback = false) {
    const chunks = optionChunks(parts);
    for (const name of names) {
        const exact = chunks.find((part) => part.toLowerCase() === name.toLowerCase());
        if (exact) return true;
        const match = chunks
            .map((part) => part.match(new RegExp(`^${name}\\s*=\\s*(true|false|1|0|yes|no|on|off)$`, 'i')))
            .find(Boolean);
        if (match) return ['true', '1', 'yes', 'on'].includes(match[1].toLowerCase());
    }
    return fallback;
}

function constantNumber(value, fallback = NaN) {
    const source = String(value ?? '').trim();
    if (!source) return fallback;
    const direct = Number(source);
    if (Number.isFinite(direct)) return direct;
    const evaluator = compileMathExpression(source, []);
    if (!evaluator) return fallback;
    const result = Number(evaluator());
    return Number.isFinite(result) ? result : fallback;
}

function numberOption(parts, names, fallback = NaN) {
    for (const part of optionChunks(parts)) {
        for (const name of names) {
            const match = part.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, 'i'));
            if (!match) continue;
            const result = constantNumber(match[1], NaN);
            if (Number.isFinite(result)) return result;
        }
    }
    return fallback;
}

function textOption(parts, names, fallback = '') {
    for (const part of optionChunks(parts)) {
        for (const name of names) {
            const match = part.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, 'i'));
            if (match && String(match[1]).trim()) return String(match[1]).trim();
        }
    }
    return fallback;
}

function rangeOption(parts, name, fallbackMin, fallbackMax) {
    for (const part of optionChunks(parts)) {
        const match = part.match(new RegExp(`^${name}\\s*=\\s*(.+?)\\s*\\.\\.\\s*(.+)$`, 'i'));
        if (!match) continue;
        const minimum = constantNumber(match[1], NaN);
        const maximum = constantNumber(match[2], NaN);
        if (Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum) {
            return [minimum, maximum];
        }
    }
    return [fallbackMin, fallbackMax];
}

function coordinateFromText(value, fallback = null) {
    const source = String(value || '').trim();
    if (!source) return fallback;

    const assignments = {};
    optionChunks([source]).forEach((part) => {
        const match = part.match(/^([xyz])\s*=\s*(.+)$/i);
        if (match) assignments[match[1].toLowerCase()] = constantNumber(match[2], NaN);
    });
    if (Number.isFinite(assignments.x) && Number.isFinite(assignments.y) && Number.isFinite(assignments.z)) {
        return { x: assignments.x, y: assignments.y, z: assignments.z };
    }

    const numbers = source.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
    if (numbers.length >= 3 && numbers.slice(0, 3).every(Number.isFinite)) {
        return { x: numbers[0], y: numbers[1], z: numbers[2] };
    }
    return fallback;
}

function assignmentExpressions(source, variables) {
    const result = {};
    const chunks = String(source || '')
        .split(/\s*;\s*/)
        .map((part) => part.trim())
        .filter(Boolean);

    chunks.forEach((part) => {
        const match = part.match(/^([A-Za-z]\w*)\s*=\s*(.+)$/);
        if (!match) return;
        const key = match[1].toLowerCase();
        if (variables.includes(key)) result[key] = match[2].trim();
    });
    return result;
}

function stripZDefinition(value) {
    const source = String(value || '').trim();
    const match = source.match(/^z\s*=\s*(.+)$/i);
    return match ? match[1].trim() : source;
}

function itemLine(item) {
    const color = item.color ? ` | ${item.color}` : '';
    const opacity = Number.isFinite(Number(item.opacity)) ? ` | opacity=${Number(item.opacity)}` : '';

    if (item.kind === 'surface') {
        const ranges = [];
        if (Number.isFinite(item.xMin) && Number.isFinite(item.xMax)) ranges.push(`x=${item.xMin}..${item.xMax}`);
        if (Number.isFinite(item.yMin) && Number.isFinite(item.yMax)) ranges.push(`y=${item.yMin}..${item.yMax}`);
        const options = ranges.length ? ` | ${ranges.join('; ')}` : '';
        return `surface | ${item.label} | ${item.expression}${options}${color}${opacity}`;
    }

    if (item.kind === 'plane') {
        return `plane | ${item.label} | z=${item.expression}${color}${opacity}`;
    }

    if (item.kind === 'parametric-surface') {
        return `parametric-surface | ${item.label} | x=${item.xExpression}; y=${item.yExpression}; z=${item.zExpression} | u=${item.uMin}..${item.uMax}; v=${item.vMin}..${item.vMax}${color}${opacity}`;
    }

    if (item.kind === 'sphere') {
        return `sphere | ${item.label} | center=${item.cx},${item.cy},${item.cz}; r=${item.radius}${color}${opacity}`;
    }

    if (item.kind === 'cylinder') {
        return `cylinder | ${item.label} | center=${item.cx},${item.cy}; r=${item.radius}; z=${item.zMin}..${item.zMax}${color}${opacity}`;
    }

    if (item.kind === 'cone') {
        return `cone | ${item.label} | center=${item.cx},${item.cy},${item.cz}; r=${item.radius}; height=${item.height}${color}${opacity}`;
    }

    if (item.kind === 'curve3d') {
        return `curve3d | ${item.label} | x=${item.xExpression}; y=${item.yExpression}; z=${item.zExpression} | t=${item.tMin}..${item.tMax}${color}`;
    }

    if (item.kind === 'point3d') {
        return `point3d | ${item.label} | ${item.x},${item.y},${item.z}${color}`;
    }

    if (['segment3d', 'line3d'].includes(item.kind)) {
        return `${item.kind} | ${item.label} | ${item.a} | ${item.b}${color}`;
    }

    if (item.kind === 'vector3d') {
        return `vector3d | ${item.label} | from=${item.from}; to=${item.to}${color}`;
    }

    return '';
}

export function formatSpace3dInput(items) {
    return (items || []).map(itemLine).filter(Boolean).join('\n');
}

function parseSurface(parts, index, defaultOpacity) {
    const kind = normalizeKind(parts[0]) === 'plane' ? 'plane' : 'surface';
    const fallback = GRAPH_COLORS[index % GRAPH_COLORS.length];
    const expression = stripZDefinition(parts[2]).slice(0, 1000);
    const [xMin, xMax] = rangeOption(parts.slice(3), 'x', NaN, NaN);
    const [yMin, yMax] = rangeOption(parts.slice(3), 'y', NaN, NaN);

    return {
        kind,
        label: String(parts[1] || `${kind === 'plane' ? 'P' : 'S'}${index + 1}`).trim().slice(0, 80),
        expression,
        xMin,
        xMax,
        yMin,
        yMax,
        color: parseColor(parts.slice(3), fallback),
        opacity: parseOpacity(parts.slice(3), kind === 'plane' ? 0.5 : defaultOpacity),
        visible: !parseBoolean(parts.slice(3), ['hidden'], false),
    };
}

function parseParametricSurface(parts, index, defaultOpacity) {
    const expressions = assignmentExpressions(parts[2], ['x', 'y', 'z']);
    const [uMin, uMax] = rangeOption(parts.slice(3), 'u', 0, Math.PI * 2);
    const [vMin, vMax] = rangeOption(parts.slice(3), 'v', 0, Math.PI * 2);

    return {
        kind: 'parametric-surface',
        label: String(parts[1] || `PS${index + 1}`).trim().slice(0, 80),
        xExpression: String(expressions.x || '').slice(0, 1000),
        yExpression: String(expressions.y || '').slice(0, 1000),
        zExpression: String(expressions.z || '').slice(0, 1000),
        uMin,
        uMax,
        vMin,
        vMax,
        color: parseColor(parts.slice(3), GRAPH_COLORS[index % GRAPH_COLORS.length]),
        opacity: parseOpacity(parts.slice(3), defaultOpacity),
        visible: !parseBoolean(parts.slice(3), ['hidden'], false),
    };
}

function parseShape(parts, index, defaultOpacity) {
    const kind = normalizeKind(parts[0]);
    const options = parts.slice(2);
    const fallback = GRAPH_COLORS[index % GRAPH_COLORS.length];

    if (kind === 'sphere') {
        const center = coordinateFromText(textOption(options, ['center'], '0,0,0'), { x: 0, y: 0, z: 0 });
        return {
            kind,
            label: String(parts[1] || `Sphere${index + 1}`).trim().slice(0, 80),
            cx: center.x,
            cy: center.y,
            cz: center.z,
            radius: Math.abs(numberOption(options, ['r', 'radius'], 3)),
            color: parseColor(options, fallback),
            opacity: parseOpacity(options, defaultOpacity),
            visible: !parseBoolean(options, ['hidden'], false),
        };
    }

    if (kind === 'cylinder') {
        const centerText = textOption(options, ['center'], '0,0');
        const centerNumbers = centerText.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [0, 0];
        const [zMin, zMax] = rangeOption(options, 'z', -3, 3);
        return {
            kind,
            label: String(parts[1] || `Cylinder${index + 1}`).trim().slice(0, 80),
            cx: Number.isFinite(centerNumbers[0]) ? centerNumbers[0] : 0,
            cy: Number.isFinite(centerNumbers[1]) ? centerNumbers[1] : 0,
            radius: Math.abs(numberOption(options, ['r', 'radius'], 2)),
            zMin,
            zMax,
            color: parseColor(options, fallback),
            opacity: parseOpacity(options, defaultOpacity),
            visible: !parseBoolean(options, ['hidden'], false),
        };
    }

    const center = coordinateFromText(textOption(options, ['center'], '0,0,0'), { x: 0, y: 0, z: 0 });
    return {
        kind: 'cone',
        label: String(parts[1] || `Cone${index + 1}`).trim().slice(0, 80),
        cx: center.x,
        cy: center.y,
        cz: center.z,
        radius: Math.abs(numberOption(options, ['r', 'radius'], 3)),
        height: numberOption(options, ['height', 'h'], 5),
        color: parseColor(options, fallback),
        opacity: parseOpacity(options, defaultOpacity),
        visible: !parseBoolean(options, ['hidden'], false),
    };
}

function parseCurve(parts, index) {
    const expressions = assignmentExpressions(parts[2], ['x', 'y', 'z']);
    const [tMin, tMax] = rangeOption(parts.slice(3), 't', -Math.PI * 2, Math.PI * 2);
    return {
        kind: 'curve3d',
        label: String(parts[1] || `C${index + 1}`).trim().slice(0, 80),
        xExpression: String(expressions.x || '').slice(0, 1000),
        yExpression: String(expressions.y || '').slice(0, 1000),
        zExpression: String(expressions.z || '').slice(0, 1000),
        tMin,
        tMax,
        color: parseColor(parts.slice(3), GRAPH_COLORS[index % GRAPH_COLORS.length]),
        width: numberOption(parts.slice(3), ['width'], NaN),
        visible: !parseBoolean(parts.slice(3), ['hidden'], false),
    };
}

function parsePoint(parts, index) {
    const point = coordinateFromText(parts[2], { x: 0, y: 0, z: 0 });
    return {
        kind: 'point3d',
        label: String(parts[1] || `P${index + 1}`).trim().slice(0, 80),
        x: point.x,
        y: point.y,
        z: point.z,
        color: parseColor(parts.slice(3), GRAPH_COLORS[index % GRAPH_COLORS.length]),
        size: numberOption(parts.slice(3), ['size', 'r'], NaN),
        visible: !parseBoolean(parts.slice(3), ['hidden'], false),
    };
}

function parseLineLike(parts, index) {
    const kind = normalizeKind(parts[0]) === 'line3d' ? 'line3d' : 'segment3d';
    return {
        kind,
        label: String(parts[1] || `L${index + 1}`).trim().slice(0, 80),
        a: String(parts[2] || '').trim().slice(0, 80),
        b: String(parts[3] || '').trim().slice(0, 80),
        color: parseColor(parts.slice(4), GRAPH_COLORS[index % GRAPH_COLORS.length]),
        width: numberOption(parts.slice(4), ['width'], NaN),
        dashed: parseBoolean(parts.slice(4), ['dashed', 'dash'], false),
        visible: !parseBoolean(parts.slice(4), ['hidden'], false),
    };
}

function parseVector(parts, index) {
    const options = parts.slice(2);
    const from = textOption(options, ['from', 'origin'], '0,0,0');
    const to = textOption(options, ['to', 'end'], '1,1,1');
    return {
        kind: 'vector3d',
        label: String(parts[1] || `v${index + 1}`).trim().slice(0, 80),
        from: String(from).trim().slice(0, 120),
        to: String(to).trim().slice(0, 120),
        color: parseColor(options, GRAPH_COLORS[index % GRAPH_COLORS.length]),
        width: numberOption(options, ['width'], NaN),
        visible: !parseBoolean(options, ['hidden'], false),
    };
}

export function parseSpace3dInput(text, defaultOpacity = 0.88) {
    const items = [];
    const errors = [];

    normalizeSpace3dSource(text)
        .split(/\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//'))
        .slice(0, 120)
        .forEach((line, lineIndex) => {
            const parts = splitParts(line);
            let kind = normalizeKind(parts[0]);
            if (kind === 'surface3d') kind = 'surface';
            if (kind === 'parametric-surface3d') kind = 'parametric-surface';
            if (kind === 'space-curve') kind = 'curve3d';

            let item = null;
            if (kind === 'surface' || kind === 'plane') item = parseSurface([kind, ...parts.slice(1)], items.length, defaultOpacity);
            else if (kind === 'parametric-surface') item = parseParametricSurface([kind, ...parts.slice(1)], items.length, defaultOpacity);
            else if (['sphere', 'cylinder', 'cone'].includes(kind)) item = parseShape([kind, ...parts.slice(1)], items.length, defaultOpacity);
            else if (kind === 'curve3d') item = parseCurve([kind, ...parts.slice(1)], items.length);
            else if (kind === 'point3d') item = parsePoint([kind, ...parts.slice(1)], items.length);
            else if (kind === 'segment3d' || kind === 'line3d') item = parseLineLike([kind, ...parts.slice(1)], items.length);
            else if (kind === 'vector3d') item = parseVector([kind, ...parts.slice(1)], items.length);

            if (!item) {
                errors.push(`Line ${lineIndex + 1}: unknown 3D command "${parts[0] || ''}".`);
                return;
            }
            items.push(item);
        });

    return { items, errors };
}

function normalizeItem(item, index, spec) {
    const kind = normalizeKind(item?.kind);
    const base = {
        ...item,
        kind,
        label: String(item?.label || `Item${index + 1}`).trim().slice(0, 80),
        color: safeColor(item?.color, GRAPH_COLORS[index % GRAPH_COLORS.length]),
        opacity: clamp(item?.opacity, 0.02, 1, spec.surfaceOpacity),
        width: clamp(item?.width, 0.5, 10, spec.lineWidth),
        size: clamp(item?.size, 2, 16, spec.pointSize),
        visible: item?.visible !== false,
    };

    if (kind === 'surface' || kind === 'plane') {
        return {
            ...base,
            expression: String(item?.expression || '').slice(0, 1000),
            xMin: Number.isFinite(Number(item?.xMin)) ? Number(item.xMin) : NaN,
            xMax: Number.isFinite(Number(item?.xMax)) ? Number(item.xMax) : NaN,
            yMin: Number.isFinite(Number(item?.yMin)) ? Number(item.yMin) : NaN,
            yMax: Number.isFinite(Number(item?.yMax)) ? Number(item.yMax) : NaN,
        };
    }

    if (kind === 'parametric-surface') {
        return {
            ...base,
            xExpression: String(item?.xExpression || '').slice(0, 1000),
            yExpression: String(item?.yExpression || '').slice(0, 1000),
            zExpression: String(item?.zExpression || '').slice(0, 1000),
            uMin: Number(item?.uMin),
            uMax: Number(item?.uMax),
            vMin: Number(item?.vMin),
            vMax: Number(item?.vMax),
        };
    }

    if (kind === 'curve3d') {
        return {
            ...base,
            xExpression: String(item?.xExpression || '').slice(0, 1000),
            yExpression: String(item?.yExpression || '').slice(0, 1000),
            zExpression: String(item?.zExpression || '').slice(0, 1000),
            tMin: Number(item?.tMin),
            tMax: Number(item?.tMax),
        };
    }

    if (kind === 'point3d') {
        return {
            ...base,
            x: Number(item?.x),
            y: Number(item?.y),
            z: Number(item?.z),
        };
    }

    if (kind === 'segment3d' || kind === 'line3d') {
        return {
            ...base,
            a: String(item?.a || '').trim().slice(0, 80),
            b: String(item?.b || '').trim().slice(0, 80),
            dashed: item?.dashed === true,
        };
    }

    if (kind === 'vector3d') {
        return {
            ...base,
            from: String(item?.from || '0,0,0').trim().slice(0, 120),
            to: String(item?.to || '1,1,1').trim().slice(0, 120),
        };
    }

    if (kind === 'sphere') {
        return {
            ...base,
            cx: Number(item?.cx),
            cy: Number(item?.cy),
            cz: Number(item?.cz),
            radius: Math.abs(Number(item?.radius)),
        };
    }

    if (kind === 'cylinder') {
        return {
            ...base,
            cx: Number(item?.cx),
            cy: Number(item?.cy),
            radius: Math.abs(Number(item?.radius)),
            zMin: Number(item?.zMin),
            zMax: Number(item?.zMax),
        };
    }

    return {
        ...base,
        kind: 'cone',
        cx: Number(item?.cx),
        cy: Number(item?.cy),
        cz: Number(item?.cz),
        radius: Math.abs(Number(item?.radius)),
        height: Number(item?.height),
    };
}

function hasSpace3dCommand(source) {
    return normalizeSpace3dSource(source)
        .split(/\n/)
        .some((line) => ITEM_KINDS.has(normalizeKind(splitParts(line)[0])));
}

function normalizePlacement(value) {
    const placement = String(value || 'auto').trim().toLowerCase();
    return ['auto', 'inside', 'right', 'bottom', 'hidden'].includes(placement)
        ? placement
        : 'auto';
}

function normalizeSpace3dSpec(spec) {
    const expression = normalizeSpace3dSource(spec.expression);
    const parsed = parseSpace3dInput(expression, spec.surfaceOpacity);
    const rawItems = hasSpace3dCommand(expression)
        ? parsed.items
        : (Array.isArray(spec.items) ? spec.items : parsed.items);

    const normalized = {
        ...spec,
        zMin: clamp(spec.zMin, -1e9, 1e9, -6),
        zMax: clamp(spec.zMax, -1e9, 1e9, 6),
        autoZRange: spec.axisMode === 'auto'
            ? true
            : (spec.axisMode === 'manual' ? false : spec.autoZRange !== false),
        azimuth: clamp(spec.azimuth, -720, 720, 42),
        elevation: clamp(spec.elevation, -85, 85, 28),
        zoom3d: clamp(spec.zoom3d, 0.35, 3, 1),
        projection3d: ['orthographic', 'perspective'].includes(spec.projection3d)
            ? spec.projection3d
            : 'perspective',
        perspectiveStrength: clamp(spec.perspectiveStrength, 0.1, 1.4, 0.58),
        equalScale3d: spec.equalScale3d !== false,
        surfaceResolution: Math.round(clamp(spec.surfaceResolution, 8, 55, 25)),
        curveSamples: Math.round(clamp(spec.curveSamples, 40, 1200, 280)),
        surfaceOpacity: clamp(spec.surfaceOpacity, 0.02, 1, 0.88),
        lineWidth: clamp(spec.lineWidth, 0.5, 10, 1.8),
        pointSize: clamp(spec.pointSize, 2, 16, 5),
        wireframe: spec.wireframe !== false,
        wireframeOpacity: clamp(spec.wireframeOpacity, 0, 1, 0.24),
        showContours: spec.showContours === true,
        contourCount: Math.round(clamp(spec.contourCount, 2, 20, 7)),
        colorMode: ['lighting', 'height', 'solid'].includes(spec.colorMode)
            ? spec.colorMode
            : 'lighting',
        ambientLight: clamp(spec.ambientLight, 0, 1, 0.36),
        showFloorGrid: spec.showFloorGrid !== false,
        floorZ: Number.isFinite(Number(spec.floorZ)) ? Number(spec.floorZ) : 0,
        show3dAxes: spec.show3dAxes !== false,
        showAxisLabels3d: spec.showAxisLabels3d !== false,
        zLabel: String(spec.zLabel ?? 'z').slice(0, 60),
        dragRotate: spec.dragRotate !== false,
        wheelZoom: spec.wheelZoom !== false,
        showPointLabels3d: spec.showPointLabels3d !== false,
        showSummary3d: spec.showSummary3d !== false,
        maxSummaryRows3d: Math.round(clamp(spec.maxSummaryRows3d, 2, 24, 10)),
        summaryPlacement3d: normalizePlacement(spec.summaryPlacement3d),
        legendPlacement3d: normalizePlacement(spec.legendPlacement3d),
        outsidePanelWidth3d: Math.round(clamp(spec.outsidePanelWidth3d, 200, 420, 260)),
        outsidePanelHeight3d: Math.round(clamp(spec.outsidePanelHeight3d, 110, 300, 160)),
        parseErrors: parsed.errors || [],
    };

    if (!(normalized.zMax > normalized.zMin)) {
        normalized.zMin = -6;
        normalized.zMax = 6;
    }

    const items = rawItems.slice(0, 100).map((item, index) => normalizeItem(item, index, normalized));

    return {
        ...normalized,
        items,
        expression: items.length ? formatSpace3dInput(items) : expression,
        aspectLock: false,
    };
}

function validPoint(point) {
    return point
        && Number.isFinite(point.x)
        && Number.isFinite(point.y)
        && Number.isFinite(point.z);
}

function point(x, y, z) {
    return { x: Number(x), y: Number(y), z: Number(z) };
}

function sampleFunctionSurface(item, spec) {
    const evaluator = compileMathExpression(item.expression, ['x', 'y']);
    if (!evaluator) return { ...item, grid: [], error: 'invalid expression' };

    const xMin = Number.isFinite(item.xMin) && Number.isFinite(item.xMax) && item.xMax > item.xMin
        ? item.xMin : spec.xMin;
    const xMax = Number.isFinite(item.xMin) && Number.isFinite(item.xMax) && item.xMax > item.xMin
        ? item.xMax : spec.xMax;
    const yMin = Number.isFinite(item.yMin) && Number.isFinite(item.yMax) && item.yMax > item.yMin
        ? item.yMin : spec.yMin;
    const yMax = Number.isFinite(item.yMin) && Number.isFinite(item.yMax) && item.yMax > item.yMin
        ? item.yMax : spec.yMax;

    const count = spec.surfaceResolution;
    const grid = [];
    for (let j = 0; j <= count; j += 1) {
        const y = yMin + (yMax - yMin) * j / count;
        const row = [];
        for (let i = 0; i <= count; i += 1) {
            const x = xMin + (xMax - xMin) * i / count;
            const z = evaluator(x, y);
            row.push(Number.isFinite(z) ? point(x, y, z) : null);
        }
        grid.push(row);
    }
    return { ...item, grid, xMin, xMax, yMin, yMax };
}

function sampleParametricSurface(item, spec) {
    const fx = compileMathExpression(item.xExpression, ['u', 'v']);
    const fy = compileMathExpression(item.yExpression, ['u', 'v']);
    const fz = compileMathExpression(item.zExpression, ['u', 'v']);
    if (!fx || !fy || !fz) return { ...item, grid: [], error: 'invalid parametric expression' };

    const count = spec.surfaceResolution;
    const grid = [];
    for (let j = 0; j <= count; j += 1) {
        const v = item.vMin + (item.vMax - item.vMin) * j / count;
        const row = [];
        for (let i = 0; i <= count; i += 1) {
            const u = item.uMin + (item.uMax - item.uMin) * i / count;
            const candidate = point(fx(u, v), fy(u, v), fz(u, v));
            row.push(validPoint(candidate) ? candidate : null);
        }
        grid.push(row);
    }
    return { ...item, grid };
}

function parametricMesh(item, spec, evaluator) {
    const count = spec.surfaceResolution;
    const grid = [];
    for (let j = 0; j <= count; j += 1) {
        const v = j / count;
        const row = [];
        for (let i = 0; i <= count; i += 1) {
            const u = i / count;
            const candidate = evaluator(u, v);
            row.push(validPoint(candidate) ? candidate : null);
        }
        grid.push(row);
    }
    return { ...item, grid };
}

function sampleSphere(item, spec) {
    return parametricMesh(item, spec, (u, v) => {
        const theta = u * Math.PI * 2;
        const phi = -Math.PI / 2 + v * Math.PI;
        const cosPhi = Math.cos(phi);
        return point(
            item.cx + item.radius * cosPhi * Math.cos(theta),
            item.cy + item.radius * cosPhi * Math.sin(theta),
            item.cz + item.radius * Math.sin(phi),
        );
    });
}

function sampleCylinder(item, spec) {
    return parametricMesh(item, spec, (u, v) => {
        const theta = u * Math.PI * 2;
        return point(
            item.cx + item.radius * Math.cos(theta),
            item.cy + item.radius * Math.sin(theta),
            item.zMin + (item.zMax - item.zMin) * v,
        );
    });
}

function sampleCone(item, spec) {
    return parametricMesh(item, spec, (u, v) => {
        const theta = u * Math.PI * 2;
        const radius = item.radius * (1 - v);
        return point(
            item.cx + radius * Math.cos(theta),
            item.cy + radius * Math.sin(theta),
            item.cz + item.height * v,
        );
    });
}

function sampleCurve(item, spec) {
    const fx = compileMathExpression(item.xExpression, ['t']);
    const fy = compileMathExpression(item.yExpression, ['t']);
    const fz = compileMathExpression(item.zExpression, ['t']);
    if (!fx || !fy || !fz) return { ...item, points: [], error: 'invalid curve expression' };

    const points = [];
    for (let index = 0; index <= spec.curveSamples; index += 1) {
        const t = item.tMin + (item.tMax - item.tMin) * index / spec.curveSamples;
        const candidate = point(fx(t), fy(t), fz(t));
        points.push(validPoint(candidate) ? candidate : null);
    }
    return { ...item, points };
}

function resolvePointReference(value, pointMap) {
    const name = String(value || '').trim();
    if (pointMap.has(name)) return pointMap.get(name);
    return coordinateFromText(name, null);
}

export function buildSpace3dScene(specInput) {
    const spec = normalizeSpace3dSpec(specInput);
    const pointMap = new Map();
    const sceneItems = [];
    const unresolved = [];

    spec.items.filter((item) => item.kind === 'point3d' && item.visible).forEach((item) => {
        const candidate = point(item.x, item.y, item.z);
        if (validPoint(candidate)) {
            pointMap.set(item.label, candidate);
            sceneItems.push({ ...item, point: candidate });
        } else {
            unresolved.push(item.label);
        }
    });

    spec.items.filter((item) => item.kind !== 'point3d' && item.visible).forEach((item) => {
        if (item.kind === 'surface' || item.kind === 'plane') {
            sceneItems.push(sampleFunctionSurface(item, spec));
        } else if (item.kind === 'parametric-surface') {
            sceneItems.push(sampleParametricSurface(item, spec));
        } else if (item.kind === 'sphere') {
            sceneItems.push(sampleSphere(item, spec));
        } else if (item.kind === 'cylinder') {
            sceneItems.push(sampleCylinder(item, spec));
        } else if (item.kind === 'cone') {
            sceneItems.push(sampleCone(item, spec));
        } else if (item.kind === 'curve3d') {
            sceneItems.push(sampleCurve(item, spec));
        } else if (item.kind === 'segment3d' || item.kind === 'line3d') {
            const a = resolvePointReference(item.a, pointMap);
            const b = resolvePointReference(item.b, pointMap);
            if (a && b) sceneItems.push({ ...item, aPoint: a, bPoint: b });
            else unresolved.push(item.label);
        } else if (item.kind === 'vector3d') {
            const fromPoint = resolvePointReference(item.from, pointMap);
            const toPoint = resolvePointReference(item.to, pointMap);
            if (fromPoint && toPoint) sceneItems.push({ ...item, fromPoint, toPoint });
            else unresolved.push(item.label);
        }
    });

    const allPoints = [];
    sceneItems.forEach((item) => {
        if (item.point) allPoints.push(item.point);
        if (item.aPoint) allPoints.push(item.aPoint, item.bPoint);
        if (item.fromPoint) allPoints.push(item.fromPoint, item.toPoint);
        if (Array.isArray(item.points)) item.points.filter(validPoint).forEach((candidate) => allPoints.push(candidate));
        if (Array.isArray(item.grid)) item.grid.forEach((row) => row.filter(validPoint).forEach((candidate) => allPoints.push(candidate)));
    });

    let zMin = spec.zMin;
    let zMax = spec.zMax;
    if (spec.autoZRange && allPoints.length) {
        const values = allPoints.map((candidate) => candidate.z).filter(Number.isFinite);
        if (values.length) {
            const minimum = Math.min(...values);
            const maximum = Math.max(...values);
            if (maximum > minimum) {
                const padding = (maximum - minimum) * 0.08;
                zMin = minimum - padding;
                zMax = maximum + padding;
            } else {
                zMin = minimum - 1;
                zMax = maximum + 1;
            }
        }
    }

    return { spec, items: sceneItems, pointMap, allPoints, unresolved, zMin, zMax };
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function subtract(a, b) {
    return point(a.x - b.x, a.y - b.y, a.z - b.z);
}

function cross(a, b) {
    return point(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
    );
}

function normalizeVector(vector) {
    const length = Math.hypot(vector.x, vector.y, vector.z);
    if (!Number.isFinite(length) || length < 1e-12) return point(0, 0, 1);
    return point(vector.x / length, vector.y / length, vector.z / length);
}

function averagePoint(points) {
    const count = points.length || 1;
    return point(
        points.reduce((sum, candidate) => sum + candidate.x, 0) / count,
        points.reduce((sum, candidate) => sum + candidate.y, 0) / count,
        points.reduce((sum, candidate) => sum + candidate.z, 0) / count,
    );
}

function hexToRgb(color) {
    const normalized = safeColor(color, '#2563eb').slice(1);
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    };
}

function rgbToHex({ r, g, b }) {
    const value = [r, g, b]
        .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
        .join('');
    return `#${value}`;
}

function mixColor(colorA, colorB, amount) {
    const a = hexToRgb(colorA);
    const b = hexToRgb(colorB);
    const t = Math.max(0, Math.min(1, amount));
    return rgbToHex({
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
    });
}

export function createSpace3dProjector(specInput, context, zMinInput, zMaxInput) {
    const spec = normalizeSpace3dSpec(specInput);
    const zMin = Number(zMinInput);
    const zMax = Number(zMaxInput);
    const xCenter = (spec.xMin + spec.xMax) / 2;
    const yCenter = (spec.yMin + spec.yMax) / 2;
    const zCenter = (zMin + zMax) / 2;
    const xSpan = Math.max(1e-9, spec.xMax - spec.xMin);
    const ySpan = Math.max(1e-9, spec.yMax - spec.yMin);
    const zSpan = Math.max(1e-9, zMax - zMin);
    const maxSpan = Math.max(xSpan, ySpan, zSpan);

    const azimuth = spec.azimuth * Math.PI / 180;
    const elevation = spec.elevation * Math.PI / 180;
    const forward = normalizeVector(point(
        Math.cos(elevation) * Math.cos(azimuth),
        Math.cos(elevation) * Math.sin(azimuth),
        Math.sin(elevation),
    ));
    const right = normalizeVector(point(-Math.sin(azimuth), Math.cos(azimuth), 0));
    const up = normalizeVector(cross(right, forward));
    const scale = Math.min(context.plotWidth, context.plotHeight) * 0.39 * spec.zoom3d;
    const centerX = context.margin.left + context.plotWidth / 2;
    const centerY = context.margin.top + context.plotHeight / 2 + 4;

    const normalizeWorld = (candidate) => {
        if (spec.equalScale3d) {
            return point(
                (candidate.x - xCenter) * 2 / maxSpan,
                (candidate.y - yCenter) * 2 / maxSpan,
                (candidate.z - zCenter) * 2 / maxSpan,
            );
        }
        return point(
            (candidate.x - xCenter) * 2 / xSpan,
            (candidate.y - yCenter) * 2 / ySpan,
            (candidate.z - zCenter) * 2 / zSpan,
        );
    };

    const project = (candidate) => {
        const normalized = normalizeWorld(candidate);
        const horizontal = dot(normalized, right);
        const vertical = dot(normalized, up);
        const depth = dot(normalized, forward);
        const distance = 3.8 / spec.perspectiveStrength;
        const perspective = spec.projection3d === 'perspective'
            ? distance / Math.max(0.45, distance - depth)
            : 1;

        return {
            x: centerX + horizontal * scale * perspective,
            y: centerY - vertical * scale * perspective,
            depth,
            perspective,
            world: candidate,
        };
    };

    return {
        spec,
        zMin,
        zMax,
        forward,
        right,
        up,
        scale,
        centerX,
        centerY,
        project,
        normalizeWorld,
    };
}

function faceNormal(points) {
    if (points.length < 3) return point(0, 0, 1);
    return normalizeVector(cross(
        subtract(points[1], points[0]),
        subtract(points[points.length - 1], points[0]),
    ));
}

function surfaceFill(item, points, projector, spec) {
    if (spec.colorMode === 'solid') return item.color;

    const center = averagePoint(points);
    if (spec.colorMode === 'height') {
        const t = Math.max(0, Math.min(1, (center.z - projector.zMin) / (projector.zMax - projector.zMin)));
        return mixColor(mixColor(item.color, '#ffffff', 0.44), item.color, 0.28 + t * 0.72);
    }

    const normal = faceNormal(points);
    const light = normalizeVector(point(-0.45, -0.3, 0.84));
    const intensity = spec.ambientLight + (1 - spec.ambientLight) * Math.abs(dot(normal, light));
    return mixColor('#0f172a', item.color, Math.max(0.16, Math.min(1, intensity)));
}

function pointsPath(projected) {
    return projected.map((candidate) => `${candidate.x.toFixed(2)},${candidate.y.toFixed(2)}`).join(' ');
}

function gridFaces(item, projector, spec) {
    const faces = [];
    const grid = item.grid || [];
    for (let row = 0; row < grid.length - 1; row += 1) {
        for (let column = 0; column < grid[row].length - 1; column += 1) {
            const world = [
                grid[row][column],
                grid[row][column + 1],
                grid[row + 1][column + 1],
                grid[row + 1][column],
            ];
            if (!world.every(validPoint)) continue;
            if (world.some((candidate) => candidate.z < projector.zMin || candidate.z > projector.zMax)) continue;
            if (world.some((candidate) => (
                candidate.x < spec.xMin || candidate.x > spec.xMax
                || candidate.y < spec.yMin || candidate.y > spec.yMax
            ))) continue;

            const projected = world.map(projector.project);
            const depth = projected.reduce((sum, candidate) => sum + candidate.depth, 0) / projected.length;
            const fill = surfaceFill(item, world, projector, spec);
            const stroke = spec.wireframe
                ? ` stroke="${mixColor(item.color, '#0f172a', 0.35)}" stroke-opacity="${spec.wireframeOpacity}" stroke-width=".55"`
                : '';

            faces.push({
                depth,
                markup: `<polygon class="qmx-space3d-face qmx-space3d-${item.kind}" points="${pointsPath(projected)}" fill="${fill}" fill-opacity="${item.opacity}"${stroke}/>`,
            });
        }
    }
    return faces;
}

function contourSegments(item, projector, spec) {
    if (!spec.showContours || item.kind !== 'surface' || !item.grid?.length) return [];

    const segments = [];
    const levels = [];
    for (let index = 1; index <= spec.contourCount; index += 1) {
        levels.push(projector.zMin + (projector.zMax - projector.zMin) * index / (spec.contourCount + 1));
    }

    const interpolate = (a, b, level) => {
        const denominator = b.z - a.z;
        if (Math.abs(denominator) < 1e-12) return null;
        const t = (level - a.z) / denominator;
        if (t < 0 || t > 1) return null;
        return point(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            level,
        );
    };

    for (const level of levels) {
        for (let row = 0; row < item.grid.length - 1; row += 1) {
            for (let column = 0; column < item.grid[row].length - 1; column += 1) {
                const corners = [
                    item.grid[row][column],
                    item.grid[row][column + 1],
                    item.grid[row + 1][column + 1],
                    item.grid[row + 1][column],
                ];
                if (!corners.every(validPoint)) continue;
                const intersections = [];
                [[0, 1], [1, 2], [2, 3], [3, 0]].forEach(([aIndex, bIndex]) => {
                    const a = corners[aIndex];
                    const b = corners[bIndex];
                    if ((a.z <= level && b.z >= level) || (a.z >= level && b.z <= level)) {
                        const candidate = interpolate(a, b, level);
                        if (candidate && !intersections.some((other) => Math.hypot(
                            other.x - candidate.x,
                            other.y - candidate.y,
                            other.z - candidate.z,
                        ) < 1e-8)) intersections.push(candidate);
                    }
                });

                if (intersections.length >= 2) {
                    for (let pair = 0; pair + 1 < intersections.length; pair += 2) {
                        const a = projector.project(intersections[pair]);
                        const b = projector.project(intersections[pair + 1]);
                        segments.push(`<line class="qmx-space3d-contour" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${mixColor(item.color, '#0f172a', 0.62)}" stroke-width="1.05" stroke-opacity=".78"/>`);
                    }
                }
            }
        }
    }
    return segments;
}

function linePrimitive(a, b, item, projector, extraClass = '') {
    const projectedA = projector.project(a);
    const projectedB = projector.project(b);
    const width = clamp(item.width, 0.5, 10, projector.spec.lineWidth);
    const dash = item.dashed ? ' stroke-dasharray="7 5"' : '';
    return {
        depth: (projectedA.depth + projectedB.depth) / 2,
        markup: `<line class="qmx-space3d-line ${extraClass}" x1="${projectedA.x}" y1="${projectedA.y}" x2="${projectedB.x}" y2="${projectedB.y}" stroke="${item.color}" stroke-width="${width}"${dash} stroke-linecap="round"/>`,
        projectedA,
        projectedB,
    };
}

function extendLineToBox(a, b, spec, zMin, zMax) {
    const direction = subtract(b, a);
    const candidates = [];
    const bounds = [
        ['x', spec.xMin], ['x', spec.xMax],
        ['y', spec.yMin], ['y', spec.yMax],
        ['z', zMin], ['z', zMax],
    ];

    bounds.forEach(([axis, bound]) => {
        if (Math.abs(direction[axis]) < 1e-12) return;
        const t = (bound - a[axis]) / direction[axis];
        const candidate = point(
            a.x + direction.x * t,
            a.y + direction.y * t,
            a.z + direction.z * t,
        );
        if (
            candidate.x >= spec.xMin - 1e-9 && candidate.x <= spec.xMax + 1e-9
            && candidate.y >= spec.yMin - 1e-9 && candidate.y <= spec.yMax + 1e-9
            && candidate.z >= zMin - 1e-9 && candidate.z <= zMax + 1e-9
        ) {
            candidates.push({ ...candidate, t });
        }
    });

    const unique = [];
    candidates.forEach((candidate) => {
        if (!unique.some((other) => Math.hypot(
            candidate.x - other.x,
            candidate.y - other.y,
            candidate.z - other.z,
        ) < 1e-8)) unique.push(candidate);
    });
    unique.sort((left, right) => left.t - right.t);
    return unique.length >= 2 ? [unique[0], unique[unique.length - 1]] : [a, b];
}

function arrowMarkup(projectedA, projectedB, color) {
    const dx = projectedB.x - projectedA.x;
    const dy = projectedB.y - projectedA.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const size = 9;
    const left = {
        x: projectedB.x - ux * size - uy * size * 0.55,
        y: projectedB.y - uy * size + ux * size * 0.55,
    };
    const right = {
        x: projectedB.x - ux * size + uy * size * 0.55,
        y: projectedB.y - uy * size - ux * size * 0.55,
    };
    return `<path class="qmx-space3d-arrow" d="M${projectedB.x},${projectedB.y} L${left.x},${left.y} L${right.x},${right.y} Z" fill="${color}"/>`;
}

function curvePrimitives(item, projector) {
    const primitives = [];
    const points = item.points || [];
    for (let index = 0; index < points.length - 1; index += 1) {
        const a = points[index];
        const b = points[index + 1];
        if (!validPoint(a) || !validPoint(b)) continue;
        if ([a, b].some((candidate) => (
            candidate.x < projector.spec.xMin || candidate.x > projector.spec.xMax
            || candidate.y < projector.spec.yMin || candidate.y > projector.spec.yMax
            || candidate.z < projector.zMin || candidate.z > projector.zMax
        ))) continue;
        primitives.push(linePrimitive(a, b, item, projector, 'qmx-space3d-curve'));
    }
    return primitives;
}

function axisAndGridMarkup(spec, projector, context) {
    const parts = [];
    const floorZ = Math.max(projector.zMin, Math.min(projector.zMax, spec.floorZ));

    if (spec.showFloorGrid) {
        const xTicks = makeTicks(spec.xMin, spec.xMax, Math.min(10, spec.tickCount));
        const yTicks = makeTicks(spec.yMin, spec.yMax, Math.min(10, spec.tickCount));
        xTicks.forEach((x) => {
            const a = projector.project(point(x, spec.yMin, floorZ));
            const b = projector.project(point(x, spec.yMax, floorZ));
            parts.push(`<line class="qmx-space3d-floor-grid" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#cbd5e1" stroke-width=".7" stroke-opacity=".55"/>`);
        });
        yTicks.forEach((y) => {
            const a = projector.project(point(spec.xMin, y, floorZ));
            const b = projector.project(point(spec.xMax, y, floorZ));
            parts.push(`<line class="qmx-space3d-floor-grid" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#cbd5e1" stroke-width=".7" stroke-opacity=".55"/>`);
        });
    }

    if (spec.show3dAxes) {
        const origin = point(
            spec.xMin <= 0 && spec.xMax >= 0 ? 0 : spec.xMin,
            spec.yMin <= 0 && spec.yMax >= 0 ? 0 : spec.yMin,
            projector.zMin <= 0 && projector.zMax >= 0 ? 0 : projector.zMin,
        );
        const axes = [
            { key: 'x', end: point(spec.xMax, origin.y, origin.z), color: '#dc2626', label: spec.xLabel || 'x' },
            { key: 'y', end: point(origin.x, spec.yMax, origin.z), color: '#16a34a', label: spec.yLabel || 'y' },
            { key: 'z', end: point(origin.x, origin.y, projector.zMax), color: '#2563eb', label: spec.zLabel || 'z' },
        ];

        axes.forEach((axis) => {
            const a = projector.project(origin);
            const b = projector.project(axis.end);
            parts.push(`<line class="qmx-space3d-axis qmx-space3d-axis-${axis.key}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${axis.color}" stroke-width="1.65"/>`);
            parts.push(arrowMarkup(a, b, axis.color));
            if (spec.showAxisLabels3d) {
                parts.push(`<text x="${b.x + 8}" y="${b.y - 5}" font-size="11" font-weight="800" fill="${axis.color}">${context.escapeXml(axis.label)}</text>`);
            }
        });
    }

    return parts.join('');
}

function pointLabelMarkup(item, projected, spec, context) {
    const size = clamp(item.size, 2, 16, spec.pointSize);
    const label = spec.showPointLabels3d
        ? `<text x="${projected.x + size + 4}" y="${projected.y - size - 3}" font-size="10.5" font-weight="800" fill="#0f172a" stroke="#fff" stroke-width="3" paint-order="stroke">${context.escapeXml(item.label)}</text>`
        : '';
    return `<g class="qmx-space3d-point"><circle cx="${projected.x}" cy="${projected.y}" r="${size}" fill="${item.color}" stroke="#fff" stroke-width="1.2"/><title>${context.escapeXml(`${item.label} (${formatTick(item.point.x)}, ${formatTick(item.point.y)}, ${formatTick(item.point.z)})`)}</title>${label}</g>`;
}

function resolvedPlacement(value, baseWidth) {
    const placement = normalizePlacement(value);
    if (placement !== 'auto') return placement;
    return baseWidth >= 620 ? 'right' : 'bottom';
}

function space3dLayout(specInput, dimensions = {}) {
    const spec = normalizeSpace3dSpec(specInput);
    const baseWidth = Number(dimensions.width) || 720;
    const summary = spec.showSummary3d
        ? resolvedPlacement(spec.summaryPlacement3d, baseWidth)
        : 'hidden';
    const legend = spec.legend
        ? resolvedPlacement(spec.legendPlacement3d, baseWidth)
        : 'hidden';

    return {
        extraRight: summary === 'right' || legend === 'right' ? spec.outsidePanelWidth3d : 0,
        extraBottom: summary === 'bottom' || legend === 'bottom' ? spec.outsidePanelHeight3d : 0,
        meta: {
            summaryPlacement3d: summary,
            legendPlacement3d: legend,
        },
    };
}

function summaryPanel(rows, spec, context) {
    if (!spec.showSummary3d || !rows.length) return { markup: '', box: null };
    const placement = context.layout?.summaryPlacement3d
        || resolvedPlacement(spec.summaryPlacement3d, context.baseWidth);
    if (placement === 'hidden') return { markup: '', box: null };

    let box;
    if (placement === 'right' && context.bands?.right) {
        const band = context.bands.right;
        box = {
            x: band.x + 8,
            y: band.y + Math.min(180, band.height * 0.45),
            width: band.width - 16,
            height: Math.min(190, band.height - Math.min(180, band.height * 0.45) - 8),
            name: 'outside-right',
        };
    } else if (placement === 'bottom' && context.bands?.bottom) {
        const band = context.bands.bottom;
        box = {
            x: band.x + 8,
            y: band.y + 8,
            width: Math.min(460, band.width * 0.62),
            height: band.height - 16,
            name: 'outside-bottom',
        };
    } else {
        box = {
            x: context.margin.left + 8,
            y: context.margin.top + context.plotHeight - 118,
            width: Math.min(330, context.plotWidth - 16),
            height: 110,
            name: 'inside',
        };
    }

    const lineHeight = 15;
    const maxRows = Math.max(1, Math.min(
        spec.maxSummaryRows3d,
        Math.floor((box.height - 38) / lineHeight),
    ));
    const visible = rows.slice(0, maxRows);
    const omitted = Math.max(0, rows.length - visible.length);
    const parts = [
        `<g class="qmx-space3d-summary" data-qmx-panel-position="${box.name}" data-qmx-box="${box.x},${box.y},${box.width},${box.height}">`,
        `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="7" fill="#fff" fill-opacity=".96" stroke="#cbd5e1"/>`,
        `<text x="${box.x + 10}" y="${box.y + 18}" font-size="11" font-weight="800" fill="#0f172a">3D scene summary</text>`,
    ];
    visible.forEach((row, index) => {
        const display = row.length > 58 ? `${row.slice(0, 57)}…` : row;
        parts.push(`<text x="${box.x + 10}" y="${box.y + 36 + index * lineHeight}" font-size="9.5" fill="#334155">${context.escapeXml(display)}</text>`);
    });
    if (omitted) {
        parts.push(`<text x="${box.x + box.width - 9}" y="${box.y + box.height - 7}" text-anchor="end" font-size="9" fill="#64748b">+${omitted} more</text>`);
    }
    parts.push('</g>');
    return { markup: parts.join(''), box };
}

function legendPositions(placement) {
    if (placement === 'right') return ['outside-right-top', 'outside-right-bottom'];
    if (placement === 'bottom') return ['outside-bottom-right', 'outside-bottom-left'];
    if (placement === 'hidden') return [];
    return ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
}

function renderSpace3d(specInput, context) {
    const scene = buildSpace3dScene(specInput);
    const { spec, items, zMin, zMax } = scene;
    const projector = createSpace3dProjector(spec, context, zMin, zMax);
    const primitives = [];
    const overlays = [];
    const pointOverlays = [];
    const legend = [];
    const rows = [];

    items.forEach((item) => {
        if (Array.isArray(item.grid)) {
            primitives.push(...gridFaces(item, projector, spec));
            overlays.push(...contourSegments(item, projector, spec));
            legend.push({ label: item.label, color: item.color, kind: 'box' });
        } else if (Array.isArray(item.points)) {
            primitives.push(...curvePrimitives(item, projector));
            legend.push({ label: item.label, color: item.color, kind: 'line' });
        } else if (item.kind === 'point3d' && item.point) {
            pointOverlays.push(pointLabelMarkup(item, projector.project(item.point), spec, context));
            legend.push({ label: item.label, color: item.color, kind: 'point' });
        } else if (item.kind === 'segment3d' || item.kind === 'line3d') {
            const endpoints = item.kind === 'line3d'
                ? extendLineToBox(item.aPoint, item.bPoint, spec, zMin, zMax)
                : [item.aPoint, item.bPoint];
            primitives.push(linePrimitive(endpoints[0], endpoints[1], item, projector, `qmx-space3d-${item.kind}`));
            legend.push({ label: item.label, color: item.color, kind: 'line' });
        } else if (item.kind === 'vector3d') {
            const primitive = linePrimitive(item.fromPoint, item.toPoint, item, projector, 'qmx-space3d-vector');
            primitive.markup += arrowMarkup(primitive.projectedA, primitive.projectedB, item.color);
            primitives.push(primitive);
            legend.push({ label: item.label, color: item.color, kind: 'line' });
        }
    });

    primitives.sort((left, right) => left.depth - right.depth);
    rows.push(`${items.length} objects, ${primitives.length} depth-sorted primitives`);
    rows.push(`view: azimuth ${formatTick(spec.azimuth)}°, elevation ${formatTick(spec.elevation)}°`);
    rows.push(`z range: ${formatTick(zMin)} to ${formatTick(zMax)}`);
    rows.push(`projection: ${spec.projection3d}, resolution ${spec.surfaceResolution}`);
    if (scene.unresolved.length) rows.push(`unresolved: ${scene.unresolved.slice(0, 5).join(', ')}`);

    const panel = summaryPanel(rows, spec, context);
    const legendPlacement = context.layout?.legendPlacement3d
        || resolvedPlacement(spec.legendPlacement3d, context.baseWidth);

    const rotationSurface = spec.dragRotate
        ? `<rect class="qmx-space3d-rotate-surface" data-qmx-space3d-rotate="1" x="${context.margin.left}" y="${context.margin.top}" width="${context.plotWidth}" height="${context.plotHeight}" fill="transparent" pointer-events="all"><title>Drag to rotate the 3D view</title></rect>`
        : '';

    return {
        content: [
            `<g class="qmx-space3d-scene" data-qmx-space3d-azimuth="${spec.azimuth}" data-qmx-space3d-elevation="${spec.elevation}">`,
            axisAndGridMarkup(spec, projector, context),
            primitives.map((primitive) => primitive.markup).join(''),
            overlays.join(''),
            pointOverlays.join(''),
            rotationSurface,
            `</g>`,
            panel.markup,
        ].join(''),
        legend,
        legendOptions: {
            hidden: legendPlacement === 'hidden',
            preferredPositions: legendPositions(legendPlacement),
            avoidBoxes: panel.box ? [panel.box] : [],
        },
    };
}

export function updateSpace3dView(specInput, azimuth, elevation, zoom3d = undefined) {
    return normalizeSpace3dSpec({
        ...specInput,
        azimuth,
        elevation,
        ...(zoom3d === undefined ? {} : { zoom3d }),
    });
}

function bindSpace3dPreview({ preview, spec, updateSpec }) {
    if (!preview || typeof updateSpec !== 'function') return;
    const surface = preview.querySelector('[data-qmx-space3d-rotate]');
    if (!surface) return;

    surface.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();

        const startX = event.clientX;
        const startY = event.clientY;
        const startAzimuth = Number(spec.azimuth) || 0;
        const startElevation = Number(spec.elevation) || 0;
        let latest = event;
        let frame = 0;

        const apply = () => {
            frame = 0;
            const dx = latest.clientX - startX;
            const dy = latest.clientY - startY;
            updateSpec(updateSpace3dView(
                spec,
                startAzimuth + dx * 0.45,
                Math.max(-85, Math.min(85, startElevation - dy * 0.35)),
            ));
        };

        const move = (moveEvent) => {
            latest = moveEvent;
            if (!frame) frame = requestAnimationFrame(apply);
        };

        const finish = (upEvent) => {
            latest = upEvent;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            if (frame) cancelAnimationFrame(frame);
            apply();
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish, { once: true });
        window.addEventListener('pointercancel', finish, { once: true });
    });

    if (spec.wheelZoom) {
        surface.addEventListener('wheel', (event) => {
            event.preventDefault();
            const factor = event.deltaY > 0 ? 0.92 : 1.08;
            updateSpec(updateSpace3dView(
                spec,
                spec.azimuth,
                spec.elevation,
                clamp(spec.zoom3d * factor, 0.35, 3, 1),
            ));
        }, { passive: false });
    }
}

function space3dAutoRange(specInput) {
    const scene = buildSpace3dScene({
        ...specInput,
        autoZRange: false,
    });
    if (!scene.allPoints.length) return null;

    const x = scene.allPoints.map((candidate) => candidate.x).filter(Number.isFinite);
    const y = scene.allPoints.map((candidate) => candidate.y).filter(Number.isFinite);
    const z = scene.allPoints.map((candidate) => candidate.z).filter(Number.isFinite);
    if (!x.length || !y.length || !z.length) return null;

    const range = (values) => {
        let minimum = Math.min(...values);
        let maximum = Math.max(...values);
        if (minimum === maximum) {
            minimum -= 1;
            maximum += 1;
        } else {
            const padding = (maximum - minimum) * 0.1;
            minimum -= padding;
            maximum += padding;
        }
        return [minimum, maximum];
    };

    const [xMin, xMax] = range(x);
    const [yMin, yMax] = range(y);
    const [zMin, zMax] = range(z);
    return { xMin, xMax, yMin, yMax, zMin, zMax };
}

export function registerSpace3dGraph(registry) {
    if (registry.has('space3d')) return;

    registry.register({
        id: 'space3d',
        label: '3D Surfaces & Space Geometry',
        group: '3D & Multivariable',
        axes: 'custom',
        description: [
            'Surface, parametric surface, sphere, cylinder, cone, 3D curve, point, line and vector.',
            'Graph Builder/Edit Graph preview-তে drag করে view rotate করুন এবং mouse wheel দিয়ে zoom করুন।',
            '',
            'Commands:',
            'surface | label | z=f(x,y) | optional x=a..b; y=c..d | color | opacity',
            'plane | label | z=ax+by+c | color | opacity',
            'parametric-surface | label | x=...; y=...; z=... | u=a..b; v=c..d | color',
            'sphere | label | center=x,y,z; r=value | color | opacity',
            'cylinder | label | center=x,y; r=value; z=a..b | color | opacity',
            'cone | label | center=x,y,z; r=value; height=value | color | opacity',
            'curve3d | label | x=...; y=...; z=... | t=a..b | color',
            'point3d | label | x,y,z | color',
            'segment3d/line3d | label | point A | point B | color',
            'vector3d | label | from=A or x,y,z; to=B or x,y,z | color',
        ].join('\n'),
        defaults: {
            expression: [
                'surface | Ripple | 3*sin(sqrt(x^2+y^2))/(1+0.18*(x^2+y^2)) | #2563eb | opacity=0.90',
            ].join('\n'),
            items: [],
            zMin: -4,
            zMax: 4,
            autoZRange: true,
            azimuth: 42,
            elevation: 28,
            zoom3d: 1,
            projection3d: 'perspective',
            perspectiveStrength: 0.58,
            equalScale3d: true,
            surfaceResolution: 25,
            curveSamples: 280,
            surfaceOpacity: 0.88,
            lineWidth: 1.8,
            pointSize: 5,
            wireframe: true,
            wireframeOpacity: 0.24,
            showContours: false,
            contourCount: 7,
            colorMode: 'lighting',
            ambientLight: 0.36,
            showFloorGrid: true,
            floorZ: 0,
            show3dAxes: true,
            showAxisLabels3d: true,
            zLabel: 'z',
            dragRotate: true,
            wheelZoom: true,
            showPointLabels3d: true,
            showSummary3d: true,
            maxSummaryRows3d: 10,
            summaryPlacement3d: 'auto',
            legendPlacement3d: 'auto',
            outsidePanelWidth3d: 260,
            outsidePanelHeight3d: 160,
            aspectLock: false,
        },
        layout: space3dLayout,
        editor: {
            mode: 'space3d',
            inputLabel: '3D scene commands',
            placeholder: [
                'surface | S | sin(sqrt(x^2+y^2)) | #2563eb',
                'plane | P | z=0.5*x-0.2*y+1 | #16a34a | opacity=0.45',
                'parametric-surface | T | x=(3+cos(v))*cos(u); y=(3+cos(v))*sin(u); z=sin(v) | u=0..2*pi; v=0..2*pi | #7c3aed',
                'sphere | K | center=0,0,0; r=3 | #8b5cf6 | opacity=0.72',
                'curve3d | H | x=3*cos(t); y=3*sin(t); z=t/3 | t=-6*pi..6*pi | #ea580c',
                'point3d | A | 2,1,3 | #dc2626',
                'point3d | B | -2,3,1 | #16a34a',
                'segment3d | AB | A | B | #0f172a',
                'vector3d | v | from=0,0,0; to=A | #9333ea',
            ].join('\n'),
            fields: [
                { key: 'zMin', label: 'Z minimum', type: 'number', step: 0.5 },
                { key: 'zMax', label: 'Z maximum', type: 'number', step: 0.5 },
                { key: 'azimuth', label: 'View azimuth (degrees)', type: 'number', min: -720, max: 720, step: 1 },
                { key: 'elevation', label: 'View elevation (degrees)', type: 'number', min: -85, max: 85, step: 1 },
                { key: 'zoom3d', label: '3D zoom', type: 'number', min: 0.35, max: 3, step: 0.05 },
                { key: 'projection3d', label: 'Projection', type: 'select', options: [['perspective', 'Perspective'], ['orthographic', 'Orthographic']] },
                { key: 'perspectiveStrength', label: 'Perspective strength', type: 'number', min: 0.1, max: 1.4, step: 0.05 },
                { key: 'equalScale3d', label: 'Equal X/Y/Z scale', type: 'checkbox' },
                { key: 'surfaceResolution', label: 'Surface mesh resolution', type: 'number', min: 8, max: 55, step: 1 },
                { key: 'curveSamples', label: '3D curve samples', type: 'number', min: 40, max: 1200, step: 20 },
                { key: 'surfaceOpacity', label: 'Default surface opacity', type: 'number', min: 0.02, max: 1, step: 0.02 },
                { key: 'lineWidth', label: 'Line/vector width', type: 'number', min: 0.5, max: 10, step: 0.25 },
                { key: 'pointSize', label: '3D point size', type: 'number', min: 2, max: 16, step: 0.5 },
                { key: 'wireframe', label: 'Show surface wireframe', type: 'checkbox' },
                { key: 'wireframeOpacity', label: 'Wireframe opacity', type: 'number', min: 0, max: 1, step: 0.02 },
                { key: 'showContours', label: 'Show horizontal contours', type: 'checkbox' },
                { key: 'contourCount', label: 'Contour levels', type: 'number', min: 2, max: 20, step: 1 },
                { key: 'colorMode', label: 'Surface coloring', type: 'select', options: [['lighting', 'Lighting'], ['height', 'Height gradient'], ['solid', 'Solid']] },
                { key: 'ambientLight', label: 'Ambient light', type: 'number', min: 0, max: 1, step: 0.02 },
                { key: 'showFloorGrid', label: 'Show XY floor grid', type: 'checkbox' },
                { key: 'floorZ', label: 'Floor-grid Z level', type: 'number', step: 0.5 },
                { key: 'show3dAxes', label: 'Show 3D axes', type: 'checkbox' },
                { key: 'showAxisLabels3d', label: 'Show X/Y/Z labels', type: 'checkbox' },
                { key: 'zLabel', label: 'Z-axis label', type: 'text' },
                { key: 'dragRotate', label: 'Drag preview to rotate', type: 'checkbox' },
                { key: 'wheelZoom', label: 'Mouse-wheel zoom', type: 'checkbox' },
                { key: 'showPointLabels3d', label: 'Show 3D point labels', type: 'checkbox' },
                { key: 'showSummary3d', label: 'Show 3D scene summary', type: 'checkbox' },
                { key: 'maxSummaryRows3d', label: 'Maximum summary rows', type: 'number', min: 2, max: 24, step: 1 },
                { key: 'summaryPlacement3d', label: 'Summary panel position', type: 'select', options: [['auto', 'Auto'], ['inside', 'Inside'], ['right', 'Outside right'], ['bottom', 'Outside bottom'], ['hidden', 'Hidden']] },
                { key: 'legendPlacement3d', label: 'Legend position', type: 'select', options: [['auto', 'Auto'], ['inside', 'Inside'], ['right', 'Outside right'], ['bottom', 'Outside bottom'], ['hidden', 'Hidden']] },
                { key: 'outsidePanelWidth3d', label: 'Outside side-band width', type: 'number', min: 200, max: 420, step: 10 },
                { key: 'outsidePanelHeight3d', label: 'Outside bottom-band height', type: 'number', min: 110, max: 300, step: 10 },
            ],
        },
        parseInput(text) {
            const expression = normalizeSpace3dSource(text);
            const parsed = parseSpace3dInput(expression);
            return {
                expression,
                items: parsed.items,
                parseErrors: parsed.errors,
            };
        },
        formatInput(spec) {
            return formatSpace3dInput(spec.items) || normalizeSpace3dSource(spec.expression);
        },
        normalize: normalizeSpace3dSpec,
        validate(specInput) {
            const spec = normalizeSpace3dSpec(specInput);
            if (spec.parseErrors?.length) return [spec.parseErrors[0]];
            if (!spec.items.length) return ['কমপক্ষে একটি 3D command লিখুন।'];
            if (!(spec.zMax > spec.zMin)) return ['Z maximum অবশ্যই Z minimum-এর চেয়ে বড় হবে।'];

            const labels = new Set();
            for (const item of spec.items) {
                if (!item.label) return ['প্রতিটি 3D object-এর label প্রয়োজন।'];
                if (labels.has(item.label)) return [`Duplicate 3D label: ${item.label}`];
                labels.add(item.label);

                if ((item.kind === 'surface' || item.kind === 'plane')
                    && !compileMathExpression(item.expression, ['x', 'y'])) {
                    return [`${item.label}: invalid z=f(x,y) expression.`];
                }
                if (item.kind === 'parametric-surface') {
                    if (
                        !compileMathExpression(item.xExpression, ['u', 'v'])
                        || !compileMathExpression(item.yExpression, ['u', 'v'])
                        || !compileMathExpression(item.zExpression, ['u', 'v'])
                        || !(item.uMax > item.uMin)
                        || !(item.vMax > item.vMin)
                    ) return [`${item.label}: invalid parametric-surface definition.`];
                }
                if (item.kind === 'curve3d') {
                    if (
                        !compileMathExpression(item.xExpression, ['t'])
                        || !compileMathExpression(item.yExpression, ['t'])
                        || !compileMathExpression(item.zExpression, ['t'])
                        || !(item.tMax > item.tMin)
                    ) return [`${item.label}: invalid 3D curve definition.`];
                }
                if (item.kind === 'sphere' && !(item.radius > 0)) return [`${item.label}: sphere radius must be positive.`];
                if (item.kind === 'cylinder' && (!(item.radius > 0) || !(item.zMax > item.zMin))) {
                    return [`${item.label}: invalid cylinder definition.`];
                }
                if (item.kind === 'cone' && (!(item.radius > 0) || Math.abs(item.height) < 1e-12)) {
                    return [`${item.label}: invalid cone definition.`];
                }
            }

            const scene = buildSpace3dScene(spec);
            if (scene.unresolved.length) return [`Unresolved 3D reference: ${scene.unresolved[0]}`];
            return [];
        },
        detect(source) {
            const lines = normalizeSpace3dSource(source)
                .split(/\n/)
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('//'));
            const kinds = lines.map((line) => normalizeKind(splitParts(line)[0]));
            const count = kinds.filter((kind) => ITEM_KINDS.has(kind)).length;
            if (!count) return null;
            const parsed = parseSpace3dInput(source);
            return {
                score: 190 + Math.min(24, count * 3),
                spec: {
                    expression: normalizeSpace3dSource(source),
                    items: parsed.items,
                    xMin: -6,
                    xMax: 6,
                    yMin: -6,
                    yMax: 6,
                    zMin: -6,
                    zMax: 6,
                    aspectLock: false,
                },
            };
        },
        autoRange: space3dAutoRange,
        bindPreview: bindSpace3dPreview,
        render: renderSpace3d,
    });
}
