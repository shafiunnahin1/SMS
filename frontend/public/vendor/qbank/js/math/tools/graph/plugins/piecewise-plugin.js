import {
    GRAPH_COLORS,
    clamp,
    compileMathExpression,
    safeColor,
    svgPathFromPoints,
    toEnglishDigits,
} from '../graph-utils.js';
import {
    domainBoundaries,
    domainSampleBounds,
    domainToText,
    parseDomain,
} from './piecewise-utils.js';

function colorFromParts(parts, fallback) {
    const value = parts.find((part) => /^#[0-9a-f]{6}$/i.test(String(part || '').trim()));
    return safeColor(value, fallback);
}

function stripFunctionPrefix(value) {
    return String(value || '')
        .replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '')
        .trim();
}

function parsePiecewiseLine(line, index) {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('//')) return null;
    const parts = trimmed.split(/\s*\|\s*/).map((part) => part.trim());
    const fallbackColor = GRAPH_COLORS[index % GRAPH_COLORS.length];

    let label = `Piece ${index + 1}`;
    let expression = '';
    let domainText = 'all';

    if (parts.length >= 3) {
        label = String(parts[0] || label).slice(0, 80);
        expression = stripFunctionPrefix(parts[1]);
        domainText = String(parts[2] || 'all').replace(/^\s*(?:domain|where)\s*=\s*/i, '').trim();
    } else if (parts.length === 2) {
        expression = stripFunctionPrefix(parts[0]);
        domainText = String(parts[1] || 'all').replace(/^\s*(?:domain|where)\s*=\s*/i, '').trim();
    } else {
        const natural = trimmed.match(/^([^:]{1,80})\s*:\s*(.+?)\s+(?:if|when)\s+(.+)$/i);
        if (!natural) return null;
        label = natural[1].trim();
        expression = stripFunctionPrefix(natural[2]);
        domainText = natural[3].trim();
    }

    return {
        label,
        expression: expression || '0',
        domainText: domainText || 'all',
        domain: parseDomain(domainText || 'all'),
        color: colorFromParts(parts, fallbackColor),
        visible: true,
    };
}

export function parsePiecewiseInput(text) {
    return String(text || '')
        .split(/\r?\n/)
        .map(parsePiecewiseLine)
        .filter(Boolean)
        .slice(0, 30);
}

export function formatPiecewiseInput(pieces) {
    return (pieces || []).map((piece) => {
        const color = piece.color ? ` | ${piece.color}` : '';
        return `${piece.label || 'Piece'} | ${piece.expression || '0'} | ${piece.domainText || domainToText(piece.domain)}${color}`;
    }).join('\n');
}

function normalizePieces(spec) {
    const source = Array.isArray(spec.pieces) && spec.pieces.length
        ? spec.pieces
        : parsePiecewiseInput(spec.expression);
    return source.slice(0, 30).map((piece, index) => {
        const domainText = String(piece?.domainText || piece?.condition || domainToText(piece?.domain || 'all')).slice(0, 240);
        return {
            label: String(piece?.label || `Piece ${index + 1}`).slice(0, 80),
            expression: stripFunctionPrefix(piece?.expression || '0').slice(0, 1000),
            domainText,
            domain: parseDomain(domainText),
            color: safeColor(piece?.color, spec.colors?.[index] || GRAPH_COLORS[index % GRAPH_COLORS.length]),
            visible: piece?.visible !== false,
        };
    });
}

function samplePiece(piece, spec, context) {
    const fn = compileMathExpression(piece.expression, ['x']);
    if (!fn || !piece.domain?.valid) return null;
    const bounds = domainSampleBounds(piece.domain, context.xMin, context.xMax, spec.samples);
    if (!bounds) return [];
    const totalSpan = Math.max(1e-12, context.xMax - context.xMin);
    const pieceSpan = Math.max(0, bounds.maximum - bounds.minimum);
    const count = Math.max(2, Math.min(spec.samples, Math.ceil(spec.samples * pieceSpan / totalSpan)));
    const points = [];
    for (let index = 0; index <= count; index += 1) {
        const x = bounds.minimum + (bounds.maximum - bounds.minimum) * index / count;
        points.push([x, fn(x)]);
    }
    return points;
}

function endpointMarkup(pieces, spec, context) {
    if (!spec.showEndpoints) return '';
    const endpoints = [];
    pieces.forEach((piece, pieceIndex) => {
        if (piece.visible === false || !piece.domain?.valid) return;
        const fn = compileMathExpression(piece.expression, ['x']);
        if (!fn) return;
        domainBoundaries(piece.domain).forEach((boundary) => {
            if (boundary.x < context.xMin - 1e-9 || boundary.x > context.xMax + 1e-9) return;
            const y = fn(boundary.x);
            if (!Number.isFinite(y) || !context.inExtendedBounds(boundary.x, y)) return;
            endpoints.push({
                x: boundary.x,
                y,
                inclusive: boundary.inclusive,
                color: safeColor(piece.color, context.colors[pieceIndex % context.colors.length]),
                label: piece.label,
            });
        });
    });

    endpoints.sort((left, right) => Number(left.inclusive) - Number(right.inclusive));
    const content = [];
    endpoints.forEach((endpoint, index) => {
        const cx = context.sx(endpoint.x);
        const cy = context.sy(endpoint.y);
        const fill = endpoint.inclusive ? endpoint.color : safeColor(spec.background, '#ffffff');
        const state = endpoint.inclusive ? 'closed' : 'open';
        content.push(`<circle cx="${cx}" cy="${cy}" r="${spec.endpointSize}" fill="${fill}" stroke="${endpoint.color}" stroke-width="2.2" clip-path="url(#${context.clipId})"><title>${context.escapeXml(`${endpoint.label}: ${state} endpoint (${endpoint.x}, ${endpoint.y})`)}</title></circle>`);
        if (spec.showEndpointLabels && index < spec.endpointLabelLimit) {
            const decimals = spec.endpointDecimals;
            const xText = Number(endpoint.x.toFixed(decimals));
            const yText = Number(endpoint.y.toFixed(decimals));
            content.push(`<text x="${cx + 7}" y="${cy - 8}" font-size="10.5" font-weight="700" fill="${endpoint.color}">${context.escapeXml(`(${xText}, ${yText})`)}</text>`);
        }
    });
    return content.join('');
}

function autoRange(spec) {
    const finiteMins = spec.pieces.map((piece) => piece.domain?.min).filter(Number.isFinite);
    const finiteMaxs = spec.pieces.map((piece) => piece.domain?.max).filter(Number.isFinite);
    let xMin = Number(spec.xMin);
    let xMax = Number(spec.xMax);
    if (finiteMins.length && spec.pieces.every((piece) => Number.isFinite(piece.domain?.min))) xMin = Math.min(...finiteMins);
    if (finiteMaxs.length && spec.pieces.every((piece) => Number.isFinite(piece.domain?.max))) xMax = Math.max(...finiteMaxs);
    if (!(xMax > xMin)) { xMin = -10; xMax = 10; }
    const xGap = Math.max(1, (xMax - xMin) * .08);
    xMin -= xGap;
    xMax += xGap;

    const values = [];
    spec.pieces.forEach((piece) => {
        const fn = compileMathExpression(piece.expression, ['x']);
        if (!fn || !piece.domain?.valid) return;
        const bounds = domainSampleBounds(piece.domain, xMin, xMax, 240);
        if (!bounds) return;
        for (let index = 0; index <= 240; index += 1) {
            const x = bounds.minimum + (bounds.maximum - bounds.minimum) * index / 240;
            const y = fn(x);
            if (Number.isFinite(y) && Math.abs(y) < 1e9) values.push(y);
        }
    });
    if (!values.length) return { xMin, xMax, yMin: -10, yMax: 10 };
    let yMin = Math.min(...values);
    let yMax = Math.max(...values);
    if (!(yMax > yMin)) { yMin -= 1; yMax += 1; }
    const yGap = Math.max(.5, (yMax - yMin) * .12);
    return { xMin, xMax, yMin: yMin - yGap, yMax: yMax + yGap };
}

export function registerPiecewiseGraph(registry) {
    if (registry.has('piecewise')) return;
    registry.register({
        id: 'piecewise',
        label: 'Piecewise / Domain Restricted',
        group: 'Mathematics',
        description: [
            'প্রতি লাইনে: label | expression | domain | optional color',
            'Domain: x<0, 0<=x<3, x>=3, [-2, 4), (-inf, 0]',
            'Open/closed endpoint condition থেকেই নির্ধারিত হয়।',
        ].join('\n'),
        defaults: {
            expression: [
                'Left | x^2 | x < 0',
                'Middle | 2*x + 1 | 0 <= x < 3',
                'Right | 7 | x >= 3',
            ].join('\n'),
            samples: 1000,
            strokeWidth: 2.6,
            showEndpoints: true,
            endpointSize: 5,
            showEndpointLabels: false,
            endpointLabelLimit: 12,
            endpointDecimals: 2,
        },
        editor: {
            mode: 'piecewise',
            inputLabel: 'Pieces: label | expression | domain',
            placeholder: 'Left | x^2 | x < 0\nMiddle | 2*x+1 | 0 <= x < 3\nRight | 7 | x >= 3',
            fields: [
                { key: 'samples', label: 'Total samples', type: 'number', min: 200, max: 4000, step: 100 },
                { key: 'strokeWidth', label: 'Line width', type: 'number', min: .5, max: 10, step: .5 },
                { key: 'showEndpoints', label: 'Show open/closed endpoints', type: 'checkbox' },
                { key: 'endpointSize', label: 'Endpoint size', type: 'number', min: 2, max: 12, step: .5 },
                { key: 'showEndpointLabels', label: 'Show endpoint coordinates', type: 'checkbox' },
                { key: 'endpointLabelLimit', label: 'Maximum endpoint labels', type: 'number', min: 0, max: 40, step: 1 },
                { key: 'endpointDecimals', label: 'Endpoint decimal places', type: 'number', min: 0, max: 6, step: 1 },
            ],
        },
        parseInput(text) {
            return { expression: String(text || ''), pieces: parsePiecewiseInput(text) };
        },
        formatInput(spec) {
            return formatPiecewiseInput(spec.pieces);
        },
        normalize(spec) {
            const pieces = normalizePieces(spec);
            return {
                ...spec,
                expression: formatPiecewiseInput(pieces),
                pieces,
                samples: clamp(spec.samples, 200, 4000, 1000),
                strokeWidth: clamp(spec.strokeWidth, .5, 10, 2.6),
                showEndpoints: spec.showEndpoints !== false,
                endpointSize: clamp(spec.endpointSize, 2, 12, 5),
                showEndpointLabels: spec.showEndpointLabels === true,
                endpointLabelLimit: clamp(spec.endpointLabelLimit, 0, 40, 12),
                endpointDecimals: clamp(spec.endpointDecimals, 0, 6, 2),
            };
        },
        validate(spec) {
            if (!spec.pieces?.length) return ['কমপক্ষে একটি piece লিখুন।'];
            for (const piece of spec.pieces) {
                if (!compileMathExpression(piece.expression, ['x'])) {
                    return [`${piece.label}: expression বোঝা যায়নি।`];
                }
                if (!piece.domain?.valid) {
                    return [`${piece.label}: ${piece.domain?.error || 'domain invalid'}`];
                }
            }
            return [];
        },
        detect(source) {
            const lines = toEnglishDigits(source).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            const matches = lines.filter((line) => {
                const parts = line.split(/\s*\|\s*/);
                return parts.length >= 2 && /(?:<=|>=|<|>|\[[^\]]*,|\([^)]*,)/.test(parts[parts.length >= 3 ? 2 : 1] || '');
            });
            return matches.length >= 2
                ? { score: 108, spec: { expression: source, pieces: parsePiecewiseInput(source) } }
                : null;
        },
        autoRange,
        render(spec, context) {
            const content = [];
            const legend = [];
            spec.pieces.forEach((piece, index) => {
                if (piece.visible === false) return;
                const points = samplePiece(piece, spec, context);
                const color = safeColor(piece.color, context.colors[index % context.colors.length]);
                if (points === null) {
                    content.push(context.message(`${piece.label} render করা যায়নি।`, '#dc2626', index));
                    return;
                }
                if (points.length > 1) {
                    const path = svgPathFromPoints(points, context, { breakDistance: context.plotHeight * 1.3 });
                    content.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="${spec.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${context.clipId})"/>`);
                }
                legend.push({ label: `${piece.label}: ${piece.domainText}`, color, kind: 'line' });
            });
            content.push(endpointMarkup(spec.pieces, spec, context));
            return { content: content.join(''), legend };
        },
    });
}
