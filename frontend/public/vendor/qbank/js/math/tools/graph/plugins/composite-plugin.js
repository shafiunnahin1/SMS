import {
    GRAPH_COLORS,
    clamp,
    compileMathExpression,
    formatTick,
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

const COMPOSITE_KINDS = new Set([
    'function', 'circle', 'ellipse', 'parabola', 'hyperbola', 'polar', 'parametric',
]);

const KIND_ALIASES = {
    f: 'function', fn: 'function', line: 'function', function: 'function',
    c: 'circle', circle: 'circle',
    e: 'ellipse', ellipse: 'ellipse',
    p: 'parabola', parabola: 'parabola',
    h: 'hyperbola', hyperbola: 'hyperbola',
    polar: 'polar', r: 'polar',
    param: 'parametric', parametric: 'parametric',
};

function normalizeKind(value) {
    return KIND_ALIASES[String(value || '').trim().toLowerCase()] || '';
}

function numberOr(value, fallback) {
    const number = Number(toEnglishDigits(value));
    return Number.isFinite(number) ? number : fallback;
}

function formatCoordinate(value, decimals = 2) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '';
    const precision = Math.max(0, Math.min(6, Number(decimals) || 0));
    const rounded = Number(numeric.toFixed(precision));
    return Object.is(rounded, -0) ? '0' : String(rounded);
}

function parseKeyValues(value) {
    const result = {};
    String(value || '').split(/\s*[,;]\s*/).filter(Boolean).forEach((piece) => {
        const match = piece.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/);
        if (!match) return;
        const key = match[1].toLowerCase();
        const raw = match[2].trim();
        const numeric = Number(toEnglishDigits(raw));
        result[key] = Number.isFinite(numeric) ? numeric : raw;
    });
    return result;
}

function colorFromParts(parts, fallback) {
    const match = parts.find((part) => /^#[0-9a-f]{6}$/i.test(String(part || '').trim()));
    return safeColor(match, fallback);
}

function parseCompositeLine(line, index) {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('//')) return null;

    const pieces = trimmed.split(/\s*\|\s*/).map((item) => item.trim());
    let kind = normalizeKind(pieces[0]);

    if (!kind) {
        const named = trimmed.match(/^([^:=]{1,80})\s*[:=]\s*(.+)$/);
        if (named) {
            return {
                kind: 'function',
                label: named[1].trim(),
                expression: named[2].trim(),
                color: GRAPH_COLORS[index % GRAPH_COLORS.length],
                visible: true,
            };
        }
        return {
            kind: 'function',
            label: `Function ${index + 1}`,
            expression: trimmed,
            color: GRAPH_COLORS[index % GRAPH_COLORS.length],
            visible: true,
        };
    }

    const fallbackColor = GRAPH_COLORS[index % GRAPH_COLORS.length];
    const color = colorFromParts(pieces, fallbackColor);
    const label = String(pieces[1] || `${kind[0].toUpperCase()}${kind.slice(1)} ${index + 1}`).slice(0, 80);

    if (kind === 'function') {
        const option = String(pieces[3] || '').trim();
        const domainText = /^#[0-9a-f]{6}$/i.test(option)
            ? 'all'
            : option.replace(/^\s*(?:domain|where)\s*=\s*/i, '').trim() || 'all';
        return {
            kind,
            label,
            expression: String(pieces[2] || 'x').slice(0, 1000),
            domainText,
            domain: parseDomain(domainText),
            color,
            visible: true,
        };
    }

    if (kind === 'polar') {
        const params = parseKeyValues(pieces[3]);
        return {
            kind,
            label,
            expression: String(pieces[2] || '4*cos(3*theta)').slice(0, 1000),
            thetaMin: numberOr(params.thetamin ?? params.min, 0),
            thetaMax: numberOr(params.thetamax ?? params.max, Math.PI * 2),
            color,
            visible: true,
        };
    }

    if (kind === 'parametric') {
        const params = parseKeyValues(pieces[4]);
        return {
            kind,
            label,
            xExpression: String(pieces[2] || 'cos(t)').slice(0, 1000),
            yExpression: String(pieces[3] || 'sin(t)').slice(0, 1000),
            tMin: numberOr(params.tmin ?? params.min, 0),
            tMax: numberOr(params.tmax ?? params.max, Math.PI * 2),
            color,
            visible: true,
        };
    }

    const params = parseKeyValues(pieces[2]);
    const orientation = String(params.orientation || params.o || 'horizontal').toLowerCase() === 'vertical'
        ? 'vertical'
        : 'horizontal';

    return {
        kind,
        label,
        h: numberOr(params.h, 0),
        k: numberOr(params.k, 0),
        radius: Math.abs(numberOr(params.r ?? params.radius, 4)),
        a: Math.abs(numberOr(params.a, kind === 'hyperbola' ? 3 : 5)),
        b: Math.abs(numberOr(params.b, kind === 'hyperbola' ? 2 : 3)),
        p: numberOr(params.p, 2),
        orientation,
        color,
        visible: true,
    };
}

export function parseCompositeInput(text) {
    return String(text || '')
        .split(/\r?\n/)
        .map(parseCompositeLine)
        .filter(Boolean)
        .slice(0, 20);
}

function objectParamsText(object) {
    if (object.kind === 'circle') return `h=${formatTick(object.h)}, k=${formatTick(object.k)}, r=${formatTick(object.radius)}`;
    if (object.kind === 'ellipse') return `h=${formatTick(object.h)}, k=${formatTick(object.k)}, a=${formatTick(object.a)}, b=${formatTick(object.b)}`;
    if (object.kind === 'parabola') return `h=${formatTick(object.h)}, k=${formatTick(object.k)}, p=${formatTick(object.p)}, orientation=${object.orientation}`;
    return `h=${formatTick(object.h)}, k=${formatTick(object.k)}, a=${formatTick(object.a)}, b=${formatTick(object.b)}, orientation=${object.orientation}`;
}

export function formatCompositeInput(objects) {
    return (objects || []).map((object) => {
        const color = object.color ? ` | ${object.color}` : '';
        if (object.kind === 'function') {
            const domain = object.domainText && object.domainText !== 'all' ? ` | domain=${object.domainText}` : '';
            return `function | ${object.label} | ${object.expression}${domain}${color}`;
        }
        if (object.kind === 'polar') {
            return `polar | ${object.label} | ${object.expression} | thetaMin=${formatTick(object.thetaMin)}, thetaMax=${formatTick(object.thetaMax)}${color}`;
        }
        if (object.kind === 'parametric') {
            return `parametric | ${object.label} | ${object.xExpression} | ${object.yExpression} | tMin=${formatTick(object.tMin)}, tMax=${formatTick(object.tMax)}${color}`;
        }
        return `${object.kind} | ${object.label} | ${objectParamsText(object)}${color}`;
    }).join('\n');
}

function normalizeObject(raw, index, colors) {
    const kind = normalizeKind(raw?.kind || raw?.type) || 'function';
    const fallbackColor = colors[index % colors.length] || GRAPH_COLORS[index % GRAPH_COLORS.length];
    const base = {
        kind,
        label: String(raw?.label || `${kind[0].toUpperCase()}${kind.slice(1)} ${index + 1}`).slice(0, 80),
        color: safeColor(raw?.color, fallbackColor),
        visible: raw?.visible !== false,
    };

    if (kind === 'function') {
        const domainText = String(raw?.domainText || raw?.domain || 'all').replace(/^\s*(?:domain|where)\s*=\s*/i, '').slice(0, 240);
        return { ...base, expression: String(raw?.expression || 'x').slice(0, 1000).trim(), domainText, domain: parseDomain(domainText) };
    }
    if (kind === 'polar') {
        return {
            ...base,
            expression: String(raw?.expression || '4*cos(3*theta)').slice(0, 1000).trim(),
            thetaMin: clamp(raw?.thetaMin, -100 * Math.PI, 100 * Math.PI, 0),
            thetaMax: clamp(raw?.thetaMax, -100 * Math.PI, 100 * Math.PI, Math.PI * 2),
        };
    }
    if (kind === 'parametric') {
        return {
            ...base,
            xExpression: String(raw?.xExpression || 'cos(t)').slice(0, 1000).trim(),
            yExpression: String(raw?.yExpression || 'sin(t)').slice(0, 1000).trim(),
            tMin: clamp(raw?.tMin, -1e4, 1e4, 0),
            tMax: clamp(raw?.tMax, -1e4, 1e4, Math.PI * 2),
        };
    }

    return {
        ...base,
        h: clamp(raw?.h, -1e6, 1e6, 0),
        k: clamp(raw?.k, -1e6, 1e6, 0),
        radius: Math.abs(clamp(raw?.radius ?? raw?.r, -1e6, 1e6, 4)),
        a: Math.abs(clamp(raw?.a, -1e6, 1e6, kind === 'hyperbola' ? 3 : 5)),
        b: Math.abs(clamp(raw?.b, -1e6, 1e6, kind === 'hyperbola' ? 2 : 3)),
        p: clamp(raw?.p, -1e6, 1e6, 2),
        orientation: raw?.orientation === 'vertical' ? 'vertical' : 'horizontal',
    };
}

function sampleFunction(object, spec, context) {
    const fn = compileMathExpression(object.expression, ['x']);
    if (!fn || !object.domain?.valid) return null;
    const bounds = domainSampleBounds(object.domain, context.xMin, context.xMax, spec.samples);
    if (!bounds) return [[]];
    const totalSpan = Math.max(1e-12, context.xMax - context.xMin);
    const count = Math.max(2, Math.min(spec.samples, Math.ceil(spec.samples * (bounds.maximum - bounds.minimum) / totalSpan)));
    const points = [];
    for (let index = 0; index <= count; index += 1) {
        const x = bounds.minimum + (bounds.maximum - bounds.minimum) * index / count;
        points.push([x, fn(x)]);
    }
    return [points];
}

function samplePolar(object, spec) {
    const fn = compileMathExpression(object.expression, ['theta']);
    if (!fn) return null;
    const points = [];
    for (let index = 0; index <= spec.samples; index += 1) {
        const theta = object.thetaMin + (object.thetaMax - object.thetaMin) * index / spec.samples;
        const radius = fn(theta);
        points.push([radius * Math.cos(theta), radius * Math.sin(theta)]);
    }
    return [points];
}

function sampleParametric(object, spec) {
    const fx = compileMathExpression(object.xExpression, ['t']);
    const fy = compileMathExpression(object.yExpression, ['t']);
    if (!fx || !fy) return null;
    const points = [];
    for (let index = 0; index <= spec.samples; index += 1) {
        const t = object.tMin + (object.tMax - object.tMin) * index / spec.samples;
        points.push([fx(t), fy(t)]);
    }
    return [points];
}

function sampleConic(object, spec, context) {
    const { h, k } = object;
    if (object.kind === 'circle' || object.kind === 'ellipse') {
        const points = [];
        const rx = object.kind === 'circle' ? object.radius : object.a;
        const ry = object.kind === 'circle' ? object.radius : object.b;
        const count = Math.max(360, Math.min(1200, spec.samples));
        for (let index = 0; index <= count; index += 1) {
            const angle = Math.PI * 2 * index / count;
            points.push([h + rx * Math.cos(angle), k + ry * Math.sin(angle)]);
        }
        return [points];
    }

    if (object.kind === 'parabola') {
        const points = [];
        const focal = Math.abs(object.p) < 1e-12 ? 2 : object.p;
        const minimum = object.orientation === 'vertical' ? context.xMin - h : context.yMin - k;
        const maximum = object.orientation === 'vertical' ? context.xMax - h : context.yMax - k;
        for (let index = 0; index <= spec.samples; index += 1) {
            const t = minimum + (maximum - minimum) * index / spec.samples;
            if (object.orientation === 'vertical') points.push([h + t, k + (t * t) / (4 * focal)]);
            else points.push([h + (t * t) / (4 * focal), k + t]);
        }
        return [points];
    }

    const positive = [];
    const negative = [];
    const count = Math.max(420, Math.min(1200, spec.samples));
    for (let index = 0; index <= count; index += 1) {
        const t = -3.6 + 7.2 * index / count;
        if (object.orientation === 'horizontal') {
            positive.push([h + object.a * Math.cosh(t), k + object.b * Math.sinh(t)]);
            negative.push([h - object.a * Math.cosh(t), k + object.b * Math.sinh(t)]);
        } else {
            positive.push([h + object.b * Math.sinh(t), k + object.a * Math.cosh(t)]);
            negative.push([h + object.b * Math.sinh(t), k - object.a * Math.cosh(t)]);
        }
    }
    return [positive, negative];
}

function sampleObject(object, spec, context) {
    if (object.kind === 'function') return sampleFunction(object, spec, context);
    if (object.kind === 'polar') return samplePolar(object, spec);
    if (object.kind === 'parametric') return sampleParametric(object, spec);
    return sampleConic(object, spec, context);
}

function makeObjectEvaluator(object, spec, context, pathIndex = 0) {
    if (object.kind === 'function') {
        const fn = compileMathExpression(object.expression, ['x']);
        if (!fn || !object.domain?.valid) return null;
        const bounds = domainSampleBounds(object.domain, context.xMin, context.xMax, spec.samples);
        if (!bounds) return null;
        return {
            min: bounds.minimum,
            max: bounds.maximum,
            evaluate: (x) => [x, fn(x)],
        };
    }

    if (object.kind === 'polar') {
        const fn = compileMathExpression(object.expression, ['theta']);
        if (!fn) return null;
        return {
            min: object.thetaMin,
            max: object.thetaMax,
            evaluate: (theta) => {
                const radius = fn(theta);
                return [radius * Math.cos(theta), radius * Math.sin(theta)];
            },
        };
    }

    if (object.kind === 'parametric') {
        const fx = compileMathExpression(object.xExpression, ['t']);
        const fy = compileMathExpression(object.yExpression, ['t']);
        if (!fx || !fy) return null;
        return {
            min: object.tMin,
            max: object.tMax,
            evaluate: (t) => [fx(t), fy(t)],
        };
    }

    if (object.kind === 'circle' || object.kind === 'ellipse') {
        const rx = object.kind === 'circle' ? object.radius : object.a;
        const ry = object.kind === 'circle' ? object.radius : object.b;
        return {
            min: 0,
            max: Math.PI * 2,
            evaluate: (angle) => [
                object.h + rx * Math.cos(angle),
                object.k + ry * Math.sin(angle),
            ],
        };
    }

    if (object.kind === 'parabola') {
        const focal = Math.abs(object.p) < 1e-12 ? 2 : object.p;
        const minimum = object.orientation === 'vertical'
            ? context.xMin - object.h
            : context.yMin - object.k;
        const maximum = object.orientation === 'vertical'
            ? context.xMax - object.h
            : context.yMax - object.k;
        return {
            min: minimum,
            max: maximum,
            evaluate: (parameter) => (
                object.orientation === 'vertical'
                    ? [object.h + parameter, object.k + (parameter * parameter) / (4 * focal)]
                    : [object.h + (parameter * parameter) / (4 * focal), object.k + parameter]
            ),
        };
    }

    const branch = pathIndex === 0 ? 1 : -1;
    return {
        min: -3.6,
        max: 3.6,
        evaluate: (parameter) => (
            object.orientation === 'horizontal'
                ? [
                    object.h + branch * object.a * Math.cosh(parameter),
                    object.k + object.b * Math.sinh(parameter),
                ]
                : [
                    object.h + object.b * Math.sinh(parameter),
                    object.k + branch * object.a * Math.cosh(parameter),
                ]
        ),
    };
}

function safeCurvePoint(curve, parameter) {
    if (!curve) return null;
    try {
        const point = curve.evaluate(parameter);
        const x = Number(point?.[0]);
        const y = Number(point?.[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
    } catch (error) {
        return null;
    }
}

function curveDerivative(curve, parameter) {
    const span = Math.max(1e-9, Math.abs(curve.max - curve.min));
    const step = Math.max(1e-8, span * 1e-6);
    const leftParameter = Math.max(curve.min, parameter - step);
    const rightParameter = Math.min(curve.max, parameter + step);
    if (!(rightParameter > leftParameter)) return null;
    const left = safeCurvePoint(curve, leftParameter);
    const right = safeCurvePoint(curve, rightParameter);
    if (!left || !right) return null;
    const denominator = rightParameter - leftParameter;
    return [
        (right[0] - left[0]) / denominator,
        (right[1] - left[1]) / denominator,
    ];
}

function drawableSegments(paths, context, object, spec) {
    const segments = [];
    const diagonal = Math.hypot(context.plotWidth, context.plotHeight);
    const breakDistance = diagonal * 0.42;

    (paths || []).forEach((points, pathIndex) => {
        const curve = makeObjectEvaluator(object, spec, context, pathIndex);
        if (!curve || points.length < 2) return;
        const denominator = Math.max(1, points.length - 1);

        for (let index = 1; index < points.length; index += 1) {
            const a = points[index - 1];
            const b = points[index];
            if (!Number.isFinite(a?.[0]) || !Number.isFinite(a?.[1]) || !Number.isFinite(b?.[0]) || !Number.isFinite(b?.[1])) continue;
            if (!context.inExtendedBounds(a[0], a[1]) || !context.inExtendedBounds(b[0], b[1])) continue;
            const p1 = [context.sx(a[0]), context.sy(a[1])];
            const p2 = [context.sx(b[0]), context.sy(b[1])];
            if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) > breakDistance) continue;
            segments.push({
                p1,
                p2,
                world1: [a[0], a[1]],
                world2: [b[0], b[1]],
                u1: curve.min + (curve.max - curve.min) * (index - 1) / denominator,
                u2: curve.min + (curve.max - curve.min) * index / denominator,
                curve,
                pathIndex,
            });
        }
    });

    return segments;
}

function cross(a, b) {
    return a[0] * b[1] - a[1] * b[0];
}

function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1]];
}

function exactSegmentIntersection(a, b) {
    const p = a.p1;
    const q = b.p1;
    const r = subtract(a.p2, a.p1);
    const s = subtract(b.p2, b.p1);
    const denominator = cross(r, s);
    const qMinusP = subtract(q, p);
    if (Math.abs(denominator) < 1e-8) return null;
    const leftRatio = cross(qMinusP, s) / denominator;
    const rightRatio = cross(qMinusP, r) / denominator;
    const epsilon = 1e-6;
    if (leftRatio < -epsilon || leftRatio > 1 + epsilon || rightRatio < -epsilon || rightRatio > 1 + epsilon) return null;
    return {
        point: [p[0] + leftRatio * r[0], p[1] + leftRatio * r[1]],
        leftRatio,
        rightRatio,
    };
}

function closestPointOnSegmentDetailed(point, segment) {
    const dx = segment.p2[0] - segment.p1[0];
    const dy = segment.p2[1] - segment.p1[1];
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 1e-12) return { point: segment.p1.slice(), ratio: 0 };
    const ratio = Math.max(0, Math.min(1, ((point[0] - segment.p1[0]) * dx + (point[1] - segment.p1[1]) * dy) / lengthSquared));
    return {
        point: [segment.p1[0] + ratio * dx, segment.p1[1] + ratio * dy],
        ratio,
    };
}

function closestPointOnSegment(point, segment) {
    return closestPointOnSegmentDetailed(point, segment).point;
}

function closestSegmentCandidate(a, b) {
    const candidates = [];
    [a.p1, a.p2].forEach((point, leftRatio) => {
        const other = closestPointOnSegmentDetailed(point, b);
        candidates.push({
            distance: Math.hypot(point[0] - other.point[0], point[1] - other.point[1]),
            point: [(point[0] + other.point[0]) / 2, (point[1] + other.point[1]) / 2],
            leftRatio,
            rightRatio: other.ratio,
        });
    });
    [b.p1, b.p2].forEach((point, rightRatio) => {
        const other = closestPointOnSegmentDetailed(point, a);
        candidates.push({
            distance: Math.hypot(point[0] - other.point[0], point[1] - other.point[1]),
            point: [(point[0] + other.point[0]) / 2, (point[1] + other.point[1]) / 2],
            leftRatio: other.ratio,
            rightRatio,
        });
    });
    candidates.sort((left, right) => left.distance - right.distance);
    return candidates[0] || null;
}

function lerp(start, end, ratio) {
    return start + (end - start) * ratio;
}

function clampNumber(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function worldToPixel(point, context) {
    return [context.sx(point[0]), context.sy(point[1])];
}

function pixelDistanceBetweenWorld(left, right, context) {
    const leftPixel = worldToPixel(left, context);
    const rightPixel = worldToPixel(right, context);
    return Math.hypot(leftPixel[0] - rightPixel[0], leftPixel[1] - rightPixel[1]);
}

function worldDistance(left, right) {
    return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function parameterBounds(segment, expansion = 0.75) {
    const minimum = Math.min(segment.u1, segment.u2);
    const maximum = Math.max(segment.u1, segment.u2);
    const span = Math.max(1e-10, maximum - minimum);
    return [
        Math.max(segment.curve.min, minimum - span * expansion),
        Math.min(segment.curve.max, maximum + span * expansion),
    ];
}

function tangentKind(leftCurve, leftParameter, rightCurve, rightParameter, threshold = 0.08) {
    const leftDerivative = curveDerivative(leftCurve, leftParameter);
    const rightDerivative = curveDerivative(rightCurve, rightParameter);
    if (!leftDerivative || !rightDerivative) return 'crossing';
    const leftLength = Math.hypot(leftDerivative[0], leftDerivative[1]);
    const rightLength = Math.hypot(rightDerivative[0], rightDerivative[1]);
    if (!(leftLength > 1e-12) || !(rightLength > 1e-12)) return 'tangent';
    const sine = Math.abs(cross(leftDerivative, rightDerivative)) / (leftLength * rightLength);
    return sine <= threshold ? 'tangent' : 'crossing';
}

function refinedPointResult(leftSegment, rightSegment, leftParameter, rightParameter, context, kind, refined) {
    const leftPoint = safeCurvePoint(leftSegment.curve, leftParameter);
    const rightPoint = safeCurvePoint(rightSegment.curve, rightParameter);
    if (!leftPoint || !rightPoint) return null;
    const world = [
        (leftPoint[0] + rightPoint[0]) / 2,
        (leftPoint[1] + rightPoint[1]) / 2,
    ];
    const pixel = worldToPixel(world, context);
    return {
        px: pixel[0],
        py: pixel[1],
        x: world[0],
        y: world[1],
        residualWorld: worldDistance(leftPoint, rightPoint),
        residualPixels: pixelDistanceBetweenWorld(leftPoint, rightPoint, context),
        kind,
        refined,
        approximate: !refined,
    };
}

function refineCrossingCandidate(leftSegment, rightSegment, candidate, context, spec) {
    let leftParameter = lerp(leftSegment.u1, leftSegment.u2, candidate.leftRatio);
    let rightParameter = lerp(rightSegment.u1, rightSegment.u2, candidate.rightRatio);
    const [leftMinimum, leftMaximum] = parameterBounds(leftSegment, 1.25);
    const [rightMinimum, rightMaximum] = parameterBounds(rightSegment, 1.25);
    const iterations = Math.max(3, Math.min(24, spec.refinementIterations));
    let refined = false;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const leftPoint = safeCurvePoint(leftSegment.curve, leftParameter);
        const rightPoint = safeCurvePoint(rightSegment.curve, rightParameter);
        const leftDerivative = curveDerivative(leftSegment.curve, leftParameter);
        const rightDerivative = curveDerivative(rightSegment.curve, rightParameter);
        if (!leftPoint || !rightPoint || !leftDerivative || !rightDerivative) break;

        const differenceX = leftPoint[0] - rightPoint[0];
        const differenceY = leftPoint[1] - rightPoint[1];
        if (pixelDistanceBetweenWorld(leftPoint, rightPoint, context) < 1e-7) {
            refined = true;
            break;
        }

        const a = leftDerivative[0];
        const b = -rightDerivative[0];
        const c = leftDerivative[1];
        const d = -rightDerivative[1];
        const determinant = a * d - b * c;
        if (Math.abs(determinant) < 1e-13) break;

        let leftDelta = ((-differenceX) * d - b * (-differenceY)) / determinant;
        let rightDelta = (a * (-differenceY) - (-differenceX) * c) / determinant;
        const leftSpan = Math.max(1e-10, leftMaximum - leftMinimum);
        const rightSpan = Math.max(1e-10, rightMaximum - rightMinimum);
        const damping = Math.max(
            1,
            Math.abs(leftDelta) / (leftSpan * 0.8),
            Math.abs(rightDelta) / (rightSpan * 0.8),
        );
        leftDelta /= damping;
        rightDelta /= damping;

        const nextLeft = clampNumber(leftParameter + leftDelta, leftMinimum, leftMaximum);
        const nextRight = clampNumber(rightParameter + rightDelta, rightMinimum, rightMaximum);
        if (Math.abs(nextLeft - leftParameter) + Math.abs(nextRight - rightParameter) < 1e-14) break;
        leftParameter = nextLeft;
        rightParameter = nextRight;
        refined = true;
    }

    const kind = tangentKind(
        leftSegment.curve,
        leftParameter,
        rightSegment.curve,
        rightParameter,
        spec.tangentAngleTolerance,
    );
    const result = refinedPointResult(
        leftSegment,
        rightSegment,
        leftParameter,
        rightParameter,
        context,
        kind,
        refined,
    );
    if (!result) return null;

    const rangeScale = Math.max(
        1,
        Math.abs(context.xMax - context.xMin),
        Math.abs(context.yMax - context.yMin),
    );
    const worldLimit = rangeScale * (refined ? 2e-6 : 1.5e-4);
    const pixelLimit = refined ? 0.35 : 1.2;
    return result.residualWorld <= worldLimit || result.residualPixels <= pixelLimit
        ? result
        : null;
}

function refineTangentCandidate(leftSegment, rightSegment, candidate, context, spec) {
    let leftParameter = lerp(leftSegment.u1, leftSegment.u2, candidate.leftRatio);
    let rightParameter = lerp(rightSegment.u1, rightSegment.u2, candidate.rightRatio);
    const [leftMinimum, leftMaximum] = parameterBounds(leftSegment, 2);
    const [rightMinimum, rightMaximum] = parameterBounds(rightSegment, 2);
    let leftStep = Math.max(1e-10, Math.abs(leftSegment.u2 - leftSegment.u1));
    let rightStep = Math.max(1e-10, Math.abs(rightSegment.u2 - rightSegment.u1));

    const objective = (leftValue, rightValue) => {
        const leftPoint = safeCurvePoint(leftSegment.curve, leftValue);
        const rightPoint = safeCurvePoint(rightSegment.curve, rightValue);
        if (!leftPoint || !rightPoint) return null;
        return {
            leftPoint,
            rightPoint,
            distance: worldDistance(leftPoint, rightPoint),
        };
    };

    let best = objective(leftParameter, rightParameter);
    if (!best) return null;

    for (let iteration = 0; iteration < 30; iteration += 1) {
        let improved = false;
        let selected = best;
        let selectedLeft = leftParameter;
        let selectedRight = rightParameter;

        for (const leftDirection of [-1, 0, 1]) {
            for (const rightDirection of [-1, 0, 1]) {
                if (leftDirection === 0 && rightDirection === 0) continue;
                const nextLeft = clampNumber(leftParameter + leftDirection * leftStep, leftMinimum, leftMaximum);
                const nextRight = clampNumber(rightParameter + rightDirection * rightStep, rightMinimum, rightMaximum);
                const trial = objective(nextLeft, nextRight);
                if (trial && trial.distance + 1e-15 < selected.distance) {
                    selected = trial;
                    selectedLeft = nextLeft;
                    selectedRight = nextRight;
                    improved = true;
                }
            }
        }

        if (improved) {
            best = selected;
            leftParameter = selectedLeft;
            rightParameter = selectedRight;
        } else {
            leftStep *= 0.5;
            rightStep *= 0.5;
        }

        if (leftStep + rightStep < 1e-12) break;
    }

    const kind = tangentKind(
        leftSegment.curve,
        leftParameter,
        rightSegment.curve,
        rightParameter,
        spec.tangentAngleTolerance,
    );
    if (kind !== 'tangent') return null;

    const result = refinedPointResult(
        leftSegment,
        rightSegment,
        leftParameter,
        rightParameter,
        context,
        'tangent',
        true,
    );
    if (!result) return null;

    const rangeScale = Math.max(
        1,
        Math.abs(context.xMax - context.xMin),
        Math.abs(context.yMax - context.yMin),
    );
    const worldLimit = Math.max(1e-8, rangeScale * 2e-6);
    return result.residualWorld <= worldLimit && result.residualPixels <= 0.2
        ? result
        : null;
}

function gridKeysForSegment(segment, cellSize, padding = 0) {
    const minX = Math.floor((Math.min(segment.p1[0], segment.p2[0]) - padding) / cellSize);
    const maxX = Math.floor((Math.max(segment.p1[0], segment.p2[0]) + padding) / cellSize);
    const minY = Math.floor((Math.min(segment.p1[1], segment.p2[1]) - padding) / cellSize);
    const maxY = Math.floor((Math.max(segment.p1[1], segment.p2[1]) + padding) / cellSize);
    const keys = [];
    for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) keys.push(`${x}:${y}`);
    }
    return keys;
}


function segmentPixelLength(segment) {
    return Math.hypot(
        segment.p2[0] - segment.p1[0],
        segment.p2[1] - segment.p1[1],
    );
}

function geometryPixelLength(geometry) {
    return (geometry.segments || []).reduce(
        (total, segment) => total + segmentPixelLength(segment),
        0,
    );
}

function makeSegmentIndex(segments, cellSize, padding) {
    const index = new Map();
    (segments || []).forEach((segment, segmentIndex) => {
        gridKeysForSegment(segment, cellSize, padding).forEach((key) => {
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(segmentIndex);
        });
    });
    return index;
}

function geometryProbe(geometry, tolerance) {
    const cacheKey = Number(tolerance).toFixed(3);
    if (geometry._overlapProbe?.key === cacheKey) return geometry._overlapProbe;

    const segments = geometry.segments || [];
    const sampleLimit = 180;
    const stride = Math.max(1, Math.ceil(segments.length / sampleLimit));
    const samples = [];

    for (let index = 0; index < segments.length; index += stride) {
        const segment = segments[index];
        samples.push({
            pixel: [
                (segment.p1[0] + segment.p2[0]) / 2,
                (segment.p1[1] + segment.p2[1]) / 2,
            ],
            world: [
                (segment.world1[0] + segment.world2[0]) / 2,
                (segment.world1[1] + segment.world2[1]) / 2,
            ],
        });
        if (samples.length >= sampleLimit) break;
    }

    const cellSize = Math.max(8, tolerance * 6);
    const probe = {
        key: cacheKey,
        cellSize,
        index: makeSegmentIndex(segments, cellSize, tolerance + 1),
        length: geometryPixelLength(geometry),
        samples,
    };
    geometry._overlapProbe = probe;
    return probe;
}

function nearestDistanceToGeometry(sample, geometry, probe) {
    const point = sample.pixel;
    const baseX = Math.floor(point[0] / probe.cellSize);
    const baseY = Math.floor(point[1] / probe.cellSize);
    const candidates = new Set();

    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            const key = `${baseX + offsetX}:${baseY + offsetY}`;
            (probe.index.get(key) || []).forEach((segmentIndex) => {
                candidates.add(segmentIndex);
            });
        }
    }

    if (!candidates.size) {
        return { pixel: Number.POSITIVE_INFINITY, world: Number.POSITIVE_INFINITY };
    }

    let best = { pixel: Number.POSITIVE_INFINITY, world: Number.POSITIVE_INFINITY };
    candidates.forEach((segmentIndex) => {
        const segment = geometry.segments[segmentIndex];
        const nearest = closestPointOnSegmentDetailed(point, segment);
        const pixelDistance = Math.hypot(
            point[0] - nearest.point[0],
            point[1] - nearest.point[1],
        );
        if (pixelDistance > best.pixel) return;
        const targetWorld = [
            lerp(segment.world1[0], segment.world2[0], nearest.ratio),
            lerp(segment.world1[1], segment.world2[1], nearest.ratio),
        ];
        best = {
            pixel: pixelDistance,
            world: worldDistance(sample.world, targetWorld),
        };
    });
    return best;
}

function geometryCoverage(source, target, pixelTolerance, worldTolerance) {
    const sourceProbe = geometryProbe(source, pixelTolerance);
    const targetProbe = geometryProbe(target, pixelTolerance);
    if (!sourceProbe.samples.length || !target.segments?.length) return 0;

    let matched = 0;
    sourceProbe.samples.forEach((sample) => {
        const distance = nearestDistanceToGeometry(sample, target, targetProbe);
        if (distance.pixel <= pixelTolerance && distance.world <= worldTolerance) {
            matched += 1;
        }
    });
    return matched / sourceProbe.samples.length;
}

function detectGeometryOverlap(left, right, spec, context) {
    if (!left.segments?.length || !right.segments?.length) return null;

    // Pixel distance is used for fast spatial matching, while world distance
    // prevents two merely-close parallel curves from being called coincident.
    const pixelTolerance = Math.max(
        0.55,
        Math.min(1.35, spec.intersectionTolerance * 0.4),
    );
    const rangeScale = Math.max(
        1,
        Math.abs(context.xMax - context.xMin),
        Math.abs(context.yMax - context.yMin),
    );
    const worldTolerance = rangeScale * 3e-5;
    const leftProbe = geometryProbe(left, pixelTolerance);
    const rightProbe = geometryProbe(right, pixelTolerance);
    if (!(leftProbe.length > 0) || !(rightProbe.length > 0)) return null;

    const lengthRatio = leftProbe.length / rightProbe.length;
    const leftCoverage = geometryCoverage(left, right, pixelTolerance, worldTolerance);
    const rightCoverage = geometryCoverage(right, left, pixelTolerance, worldTolerance);
    const minimumCoverage = Math.min(leftCoverage, rightCoverage);
    const maximumCoverage = Math.max(leftCoverage, rightCoverage);

    if (
        lengthRatio >= 0.72
        && lengthRatio <= 1.38
        && minimumCoverage >= 0.88
    ) {
        return {
            kind: 'coincident',
            leftCoverage,
            rightCoverage,
        };
    }

    // This also handles one curve that lies along only part of another curve.
    if (minimumCoverage >= 0.30 && maximumCoverage >= 0.72) {
        return {
            kind: 'overlap',
            leftCoverage,
            rightCoverage,
        };
    }

    return null;
}

function addUniquePoint(points, point, tolerance, metadata) {
    const existing = points.find((item) => Math.hypot(item.px - point.px, item.py - point.py) <= tolerance);
    if (existing) {
        const count = existing.mergeCount + 1;
        existing.px = (existing.px * existing.mergeCount + point.px) / count;
        existing.py = (existing.py * existing.mergeCount + point.py) / count;
        existing.x = (existing.x * existing.mergeCount + point.x) / count;
        existing.y = (existing.y * existing.mergeCount + point.y) / count;
        existing.mergeCount = count;
        existing.pairs.add(metadata.pair);
        existing.objects.add(metadata.leftLabel);
        existing.objects.add(metadata.rightLabel);
        if (metadata.kind === 'crossing') existing.kind = 'crossing';
        existing.refined = existing.refined || metadata.refined === true;
        existing.approximate = existing.approximate && metadata.approximate === true;
        existing.residualWorld = Math.min(existing.residualWorld, point.residualWorld ?? Number.POSITIVE_INFINITY);
        existing.residualPixels = Math.min(existing.residualPixels, point.residualPixels ?? Number.POSITIVE_INFINITY);
        return existing;
    }

    const created = {
        ...point,
        pairs: new Set([metadata.pair]),
        objects: new Set([metadata.leftLabel, metadata.rightLabel]),
        kind: metadata.kind || point.kind || 'crossing',
        refined: metadata.refined === true,
        approximate: metadata.approximate === true,
        residualWorld: point.residualWorld ?? Number.POSITIVE_INFINITY,
        residualPixels: point.residualPixels ?? Number.POSITIVE_INFINITY,
        mergeCount: 1,
    };
    points.push(created);
    return created;
}

function intersectionsForPair(left, right, spec, context) {
    const tolerance = spec.intersectionTolerance;
    const points = [];
    const pair = `${left.label} × ${right.label}`;
    const overlapRelation = detectGeometryOverlap(left, right, spec, context);

    if (overlapRelation) {
        return {
            points: [],
            status: overlapRelation.kind,
            pair,
            leftLabel: left.label,
            rightLabel: right.label,
        };
    }

    const cellSize = Math.max(12, tolerance * 4);
    const index = makeSegmentIndex(right.segments, cellSize, tolerance);
    const candidatePairs = [];

    for (const segment of left.segments) {
        const candidateIndexes = new Set();
        gridKeysForSegment(segment, cellSize, tolerance).forEach((key) => {
            (index.get(key) || []).forEach((candidateIndex) => candidateIndexes.add(candidateIndex));
        });
        candidateIndexes.forEach((candidateIndex) => candidatePairs.push([segment, right.segments[candidateIndex]]));
    }

    for (const [segment, other] of candidatePairs) {
        const candidate = exactSegmentIntersection(segment, other);
        if (!candidate) continue;
        const refined = refineCrossingCandidate(segment, other, candidate, context, spec);
        if (!refined) continue;
        addUniquePoint(points, refined, Math.max(2, spec.intersectionMergeTolerance), {
            pair,
            leftLabel: left.label,
            rightLabel: right.label,
            kind: refined.kind,
            refined: refined.refined,
            approximate: refined.approximate,
        });
        if (points.length >= 60) break;
    }

    if (spec.detectTangencies && points.length < 60) {
        const tangentCandidates = new Map();
        candidatePairs.forEach(([segment, other]) => {
            const candidate = closestSegmentCandidate(segment, other);
            if (!candidate || candidate.distance > tolerance) return;
            const key = `${Math.floor(candidate.point[0] / 9)}:${Math.floor(candidate.point[1] / 9)}`;
            const current = tangentCandidates.get(key);
            if (!current || candidate.distance < current.candidate.distance) {
                tangentCandidates.set(key, { segment, other, candidate });
            }
        });

        [...tangentCandidates.values()]
            .sort((leftValue, rightValue) => leftValue.candidate.distance - rightValue.candidate.distance)
            .slice(0, 80)
            .forEach(({ segment, other, candidate }) => {
                const refined = refineTangentCandidate(segment, other, candidate, context, spec);
                if (!refined) return;
                addUniquePoint(points, refined, Math.max(2, spec.intersectionMergeTolerance), {
                    pair,
                    leftLabel: left.label,
                    rightLabel: right.label,
                    kind: 'tangent',
                    refined: true,
                    approximate: false,
                });
            });
    }

    return {
        points,
        status: points.length ? 'intersecting' : 'none',
        pair,
        leftLabel: left.label,
        rightLabel: right.label,
    };
}

function pointLabel(point, spec) {
    return `(${formatCoordinate(point.x, spec.intersectionDecimals)}, ${formatCoordinate(point.y, spec.intersectionDecimals)})`;
}

function pairResultDescription(result, spec) {
    if (result.status === 'coincident') return `${result.pair} — coincident (infinitely many intersections)`;
    if (result.status === 'overlap') return `${result.pair} — overlapping segment`;
    if (result.status === 'none') return `${result.pair} — no intersection`;
    const labels = result.points.slice(0, 4).map((point) => {
        const suffix = point.kind === 'tangent' ? ' [tangent]' : '';
        return `${pointLabel(point, spec)}${suffix}`;
    });
    if (result.points.length > 4) labels.push(`+${result.points.length - 4} more`);
    return `${result.pair} — ${labels.join(', ')}`;
}

function truncateText(value, limit) {
    const text = String(value || '');
    return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
}

function renderIntersectionDetails(pairResults, spec, context) {
    if (!spec.showIntersectionDetails || !pairResults.length) return '';
    const visible = pairResults.slice(0, spec.intersectionDetailLimit);
    const fullText = pairResults.map((result) => pairResultDescription(result, spec)).join(' | ');
    const panelWidth = Math.min(context.plotWidth - 16, 370);
    const rowHeight = 16;
    const panelHeight = 29 + visible.length * rowHeight + (pairResults.length > visible.length ? 16 : 0);
    const x = context.margin.left + 8;
    const y = context.margin.top + context.plotHeight - panelHeight - 8;
    const content = [
        `<g class="qmx-intersection-details"><title>${context.escapeXml(fullText)}</title>`,
        `<rect x="${x}" y="${y}" width="${panelWidth}" height="${panelHeight}" rx="7" fill="#ffffff" fill-opacity=".94" stroke="#cbd5e1"/>`,
        `<text x="${x + 10}" y="${y + 18}" font-size="11" font-weight="800" fill="#0f172a">Intersection results</text>`,
    ];
    visible.forEach((result, index) => {
        const text = truncateText(pairResultDescription(result, spec), 58);
        content.push(`<text x="${x + 10}" y="${y + 36 + index * rowHeight}" font-size="9.7" fill="#334155">${context.escapeXml(text)}</text>`);
    });
    if (pairResults.length > visible.length) {
        content.push(`<text x="${x + 10}" y="${y + 36 + visible.length * rowHeight}" font-size="9.5" font-weight="700" fill="#64748b">+${pairResults.length - visible.length} more pair results</text>`);
    }
    content.push('</g>');
    return content.join('');
}

function renderIntersections(geometries, spec, context) {
    const allPoints = [];
    const pairResults = [];
    const intersectingPairs = new Set();
    const overlappingPairs = new Set();
    const coincidentPairs = new Set();
    const pairCount = geometries.length * (geometries.length - 1) / 2;

    for (let leftIndex = 0; leftIndex < geometries.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < geometries.length; rightIndex += 1) {
            const result = intersectionsForPair(
                geometries[leftIndex],
                geometries[rightIndex],
                spec,
                context,
            );
            pairResults.push(result);
            if (result.status === 'coincident') coincidentPairs.add(result.pair);
            if (result.status === 'overlap') overlappingPairs.add(result.pair);
            if (result.points.length) intersectingPairs.add(result.pair);
            result.points.forEach((point) => addUniquePoint(
                allPoints,
                point,
                Math.max(2, spec.intersectionMergeTolerance),
                {
                    pair: result.pair,
                    leftLabel: result.leftLabel,
                    rightLabel: result.rightLabel,
                    kind: point.kind,
                    refined: point.refined,
                    approximate: point.approximate,
                },
            ));
            if (allPoints.length >= spec.maxIntersections) break;
        }
        if (allPoints.length >= spec.maxIntersections) break;
    }

    const content = [];
    const coordinateItems = allPoints.map((point) => ({
        ...point,
        label: pointLabel(point, spec),
    }));

    if (spec.showIntersections) {
        coordinateItems.forEach((point) => {
            const pairLabel = [...point.pairs].join('; ');
            const objectLabel = [...point.objects].join(', ');
            const kindLabel = point.kind === 'tangent' ? 'tangent/touching' : 'crossing';
            const title = `${objectLabel}: ${point.label} — ${kindLabel}${point.refined ? ' (refined)' : ' (approx.)'} | ${pairLabel}`;
            const fill = point.kind === 'tangent' ? spec.tangentColor : spec.intersectionColor;
            if (point.kind === 'tangent') {
                const size = spec.intersectionPointSize * 1.55;
                content.push(`<rect x="${(point.px - size / 2).toFixed(2)}" y="${(point.py - size / 2).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" transform="rotate(45 ${point.px.toFixed(2)} ${point.py.toFixed(2)})" fill="${fill}" stroke="#ffffff" stroke-width="1.4" clip-path="url(#${context.clipId})"><title>${context.escapeXml(title)}</title></rect>`);
            } else {
                content.push(`<circle cx="${point.px.toFixed(2)}" cy="${point.py.toFixed(2)}" r="${spec.intersectionPointSize}" fill="${fill}" stroke="#ffffff" stroke-width="1.5" clip-path="url(#${context.clipId})"><title>${context.escapeXml(title)}</title></circle>`);
            }
            if (point.objects.size >= 3) {
                content.push(`<circle cx="${point.px.toFixed(2)}" cy="${point.py.toFixed(2)}" r="${(spec.intersectionPointSize + 3).toFixed(2)}" fill="none" stroke="#7c3aed" stroke-width="1.6" clip-path="url(#${context.clipId})"><title>${context.escapeXml(`${point.objects.size} curves meet at ${point.label}`)}</title></circle>`);
            }
        });
    }

    if (spec.showIntersections && spec.showIntersectionLabels) {
        const placed = [];
        const candidates = [
            { dx: 8, dy: -8, anchor: 'start' },
            { dx: 8, dy: 15, anchor: 'start' },
            { dx: -8, dy: -8, anchor: 'end' },
            { dx: -8, dy: 15, anchor: 'end' },
            { dx: 12, dy: 4, anchor: 'start' },
            { dx: -12, dy: 4, anchor: 'end' },
        ];

        coordinateItems
            .slice()
            .sort((left, right) => left.py - right.py || left.px - right.px)
            .slice(0, spec.intersectionLabelLimit)
            .forEach((point, index) => {
                const estimatedWidth = Math.max(36, point.label.length * 6.2);
                const estimatedHeight = 14;
                let selected = null;

                for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
                    const candidate = candidates[(index + candidateIndex) % candidates.length];
                    const textX = point.px + candidate.dx;
                    const textY = point.py + candidate.dy;
                    const left = candidate.anchor === 'end' ? textX - estimatedWidth : textX;
                    const box = {
                        left,
                        right: left + estimatedWidth,
                        top: textY - 11,
                        bottom: textY - 11 + estimatedHeight,
                    };
                    const inside = box.left >= context.margin.left
                        && box.right <= context.margin.left + context.plotWidth
                        && box.top >= context.margin.top
                        && box.bottom <= context.margin.top + context.plotHeight;
                    const collides = placed.some((other) => !(
                        box.right + 3 < other.left
                        || box.left - 3 > other.right
                        || box.bottom + 2 < other.top
                        || box.top - 2 > other.bottom
                    ));
                    if (inside && !collides) {
                        selected = { ...candidate, textX, textY, box };
                        break;
                    }
                }

                if (!selected) return;
                placed.push(selected.box);
                content.push(`<text x="${selected.textX.toFixed(2)}" y="${selected.textY.toFixed(2)}" text-anchor="${selected.anchor}" font-size="10.5" font-weight="700" fill="#111827" stroke="#ffffff" stroke-width="3" paint-order="stroke" clip-path="url(#${context.clipId})">${context.escapeXml(point.label)}</text>`);
            });
    }

    if (spec.showIntersectionSummary) {
        const nonIntersectingPairs = Math.max(
            0,
            pairCount
                - intersectingPairs.size
                - overlappingPairs.size
                - coincidentPairs.size,
        );
        const crossingCount = coordinateItems.filter((point) => point.kind === 'crossing').length;
        const tangentCount = coordinateItems.filter((point) => point.kind === 'tangent').length;
        const multiCurveCount = coordinateItems.filter((point) => point.objects.size >= 3).length;
        const summaryParts = [
            `${geometries.length} objects`,
            `${coordinateItems.length}${coordinateItems.length >= spec.maxIntersections ? '+' : ''} finite point${coordinateItems.length === 1 ? '' : 's'}`,
        ];
        if (crossingCount) summaryParts.push(`${crossingCount} crossing`);
        if (tangentCount) summaryParts.push(`${tangentCount} tangent`);
        if (multiCurveCount) summaryParts.push(`${multiCurveCount} multi-curve point${multiCurveCount === 1 ? '' : 's'}`);
        if (coincidentPairs.size) summaryParts.push(`${coincidentPairs.size} coincident pair${coincidentPairs.size === 1 ? '' : 's'}`);
        if (overlappingPairs.size) summaryParts.push(`${overlappingPairs.size} overlap pair${overlappingPairs.size === 1 ? '' : 's'}`);
        summaryParts.push(`${nonIntersectingPairs} non-intersecting pair${nonIntersectingPairs === 1 ? '' : 's'}`);
        if (spec.showIntersectionLabels && coordinateItems.length > spec.intersectionLabelLimit) {
            summaryParts.push(`${spec.intersectionLabelLimit} labels shown`);
        }
        const summary = summaryParts.join(' • ');
        const relationDetails = [
            coincidentPairs.size ? `Coincident: ${[...coincidentPairs].join('; ')}` : '',
            overlappingPairs.size ? `Overlap: ${[...overlappingPairs].join('; ')}` : '',
            pairResults.map((result) => pairResultDescription(result, spec)).join(' | '),
        ].filter(Boolean).join(' | ');
        const width = Math.min(context.plotWidth - 16, Math.max(210, summary.length * 5.7 + 18));
        const x = context.margin.left + 8;
        const y = context.margin.top + 8;
        content.push(`<g class="qmx-composite-summary"><title>${context.escapeXml(relationDetails)}</title><rect x="${x}" y="${y}" width="${width}" height="24" rx="6" fill="#ffffff" fill-opacity=".92" stroke="#cbd5e1"/><text x="${x + 9}" y="${y + 16}" font-size="10.2" font-weight="700" fill="#334155">${context.escapeXml(truncateText(summary, 105))}</text></g>`);
    }

    content.push(renderIntersectionDetails(pairResults, spec, context));
    return content.join('');
}

function compositeBounds(spec) {
    const points = [];
    const context = {
        xMin: spec.xMin,
        xMax: spec.xMax,
        yMin: spec.yMin,
        yMax: spec.yMax,
    };
    const limitedSpec = { ...spec, samples: Math.min(700, spec.samples) };
    spec.objects.forEach((object) => {
        const paths = sampleObject(object, limitedSpec, context) || [];
        paths.forEach((path) => path.forEach((point) => {
            const x = Number(point?.[0]);
            const y = Number(point?.[1]);
            if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e7 && Math.abs(y) < 1e7) points.push([x, y]);
        }));
    });
    if (!points.length) return null;
    let xMin = Math.min(...points.map((point) => point[0]));
    let xMax = Math.max(...points.map((point) => point[0]));
    let yMin = Math.min(...points.map((point) => point[1]));
    let yMax = Math.max(...points.map((point) => point[1]));
    const pad = (min, max) => {
        if (min === max) return [min - 1, max + 1];
        const gap = (max - min) * 0.12;
        return [min - gap, max + gap];
    };
    [xMin, xMax] = pad(xMin, xMax);
    [yMin, yMax] = pad(yMin, yMax);
    return { xMin, xMax, yMin, yMax };
}

function validateObject(object) {
    if (!COMPOSITE_KINDS.has(object.kind)) return `Unsupported object type: ${object.kind}`;
    if (object.kind === 'function' && !compileMathExpression(object.expression, ['x'])) return `${object.label}: function expression বোঝা যায়নি।`;
    if (object.kind === 'function' && !object.domain?.valid) return `${object.label}: ${object.domain?.error || 'domain invalid'}`;
    if (object.kind === 'polar' && !compileMathExpression(object.expression, ['theta'])) return `${object.label}: polar expression বোঝা যায়নি।`;
    if (object.kind === 'parametric' && (!compileMathExpression(object.xExpression, ['t']) || !compileMathExpression(object.yExpression, ['t']))) return `${object.label}: parametric expression বোঝা যায়নি।`;
    if (object.kind === 'circle' && !(object.radius > 0)) return `${object.label}: radius শূন্যের চেয়ে বড় হতে হবে।`;
    if (['ellipse', 'hyperbola'].includes(object.kind) && (!(object.a > 0) || !(object.b > 0))) return `${object.label}: a এবং b শূন্যের চেয়ে বড় হতে হবে।`;
    if (object.kind === 'parabola' && Math.abs(object.p) < 1e-12) return `${object.label}: p শূন্য হতে পারবে না।`;
    return '';
}

function restrictedFunctionEndpointMarkup(object, color, spec, context) {
    if (object.kind !== 'function' || !object.domain?.valid || object.domainText === 'all') return '';
    const fn = compileMathExpression(object.expression, ['x']);
    if (!fn) return '';
    const size = Math.max(3.5, spec.strokeWidth * 1.9);
    return domainBoundaries(object.domain).map((boundary) => {
        if (boundary.x < context.xMin - 1e-9 || boundary.x > context.xMax + 1e-9) return '';
        const y = fn(boundary.x);
        if (!Number.isFinite(y) || !context.inExtendedBounds(boundary.x, y)) return '';
        const fill = boundary.inclusive ? color : safeColor(spec.background, '#ffffff');
        const state = boundary.inclusive ? 'closed' : 'open';
        return `<circle cx="${context.sx(boundary.x)}" cy="${context.sy(y)}" r="${size}" fill="${fill}" stroke="${color}" stroke-width="2" clip-path="url(#${context.clipId})"><title>${context.escapeXml(`${object.label}: ${state} endpoint (${boundary.x}, ${y})`)}</title></circle>`;
    }).join('');
}

export function registerCompositeGraph(registry) {
    if (registry.has('composite')) return;

    registry.register({
        id: 'composite',
        label: 'Composite / Multi-Shape',
        group: 'Mathematics',
        description: [
            'একই coordinate plane-এ ২–২০টি function, conic, polar বা parametric object আঁকুন।',
            'Intersection Engine v2 crossing, tangent, coincident এবং multi-curve point আলাদা করে।',
            'Format: type | label | expression/parameters | optional color',
            'Example: circle | C1 | h=0, k=0, r=4',
            'Restricted function: function | Arc | sqrt(9-x^2) | domain=[-3,3]',
        ].join('\n'),
        defaults: {
            expression: [
                'function | Quadratic | x^2 - 4',
                'function | Line | 2*x + 1',
                'circle | Circle | h=0, k=0, r=4',
            ].join('\n'),
            samples: 700,
            strokeWidth: 2.4,
            showIntersections: true,
            showIntersectionLabels: false,
            showIntersectionSummary: true,
            detectTangencies: false,
            showIntersectionDetails: false,
            intersectionDetailLimit: 8,
            intersectionTolerance: 2.5,
            intersectionMergeTolerance: 3,
            refinementIterations: 12,
            tangentAngleTolerance: 0.08,
            intersectionPointSize: 5,
            intersectionColor: '#111827',
            tangentColor: '#d97706',
            intersectionLabelLimit: 8,
            intersectionDecimals: 3,
            maxIntersections: 120,
            aspectLock: true,
        },
        editor: {
            mode: 'composite',
            inputLabel: 'Objects (one per line)',
            placeholder: [
                'function | Quadratic | x^2 - 4',
                'circle | Circle A | h=0, k=0, r=4',
                'ellipse | Ellipse B | h=2, k=0, a=5, b=3',
                'parabola | Parabola C | h=0, k=-2, p=1.5, orientation=vertical',
                'function | Restricted | sqrt(9-x^2) | domain=[-3,3]',
            ].join('\n'),
            fields: [
                { key: 'samples', label: 'Samples per object', type: 'number', min: 200, max: 1800, step: 100 },
                { key: 'strokeWidth', label: 'Object line width', type: 'number', min: .5, max: 10, step: .5 },
                { key: 'showIntersections', label: 'Show intersection points', type: 'checkbox' },
                { key: 'showIntersectionLabels', label: 'Show coordinate labels', type: 'checkbox' },
                { key: 'showIntersectionSummary', label: 'Show intersection summary', type: 'checkbox' },
                { key: 'showIntersectionDetails', label: 'Show pair-wise result panel', type: 'checkbox' },
                { key: 'detectTangencies', label: 'High-precision tangent/touch detection', type: 'checkbox' },
                { key: 'intersectionDetailLimit', label: 'Maximum result-panel rows', type: 'number', min: 1, max: 20, step: 1 },
                { key: 'intersectionTolerance', label: 'Candidate search tolerance (px)', type: 'number', min: .5, max: 8, step: .5 },
                { key: 'intersectionMergeTolerance', label: 'Point grouping tolerance (px)', type: 'number', min: 1, max: 8, step: .5 },
                { key: 'refinementIterations', label: 'Numerical refinement iterations', type: 'number', min: 3, max: 24, step: 1 },
                { key: 'intersectionPointSize', label: 'Intersection point size', type: 'number', min: 2, max: 10, step: .5 },
                { key: 'intersectionColor', label: 'Crossing-point color', type: 'color' },
                { key: 'tangentColor', label: 'Tangent-point color', type: 'color' },
                { key: 'intersectionLabelLimit', label: 'Maximum coordinate labels', type: 'number', min: 0, max: 40, step: 1 },
                { key: 'intersectionDecimals', label: 'Coordinate decimal places', type: 'number', min: 0, max: 6, step: 1 },
                { key: 'maxIntersections', label: 'Maximum detected points', type: 'number', min: 10, max: 250, step: 10 },
            ],
        },
        parseInput(text) {
            return { expression: String(text || ''), objects: parseCompositeInput(text) };
        },
        formatInput(spec) {
            return formatCompositeInput(spec.objects);
        },
        normalize(spec) {
            const parsed = Array.isArray(spec.objects) && spec.objects.length
                ? spec.objects
                : parseCompositeInput(spec.expression);
            const objects = parsed.slice(0, 20).map((object, index) => normalizeObject(object, index, spec.colors || GRAPH_COLORS));
            return {
                ...spec,
                expression: formatCompositeInput(objects),
                objects,
                samples: clamp(spec.samples, 200, 1800, 700),
                strokeWidth: clamp(spec.strokeWidth, .5, 10, 2.4),
                showIntersections: spec.showIntersections !== false,
                showIntersectionLabels: spec.showIntersectionLabels === true,
                showIntersectionSummary: spec.showIntersectionSummary !== false,
                detectTangencies: spec.detectTangencies === true,
                showIntersectionDetails: spec.showIntersectionDetails === true,
                intersectionDetailLimit: clamp(spec.intersectionDetailLimit, 1, 20, 8),
                intersectionTolerance: clamp(spec.intersectionTolerance, .5, 8, 2.5),
                intersectionMergeTolerance: clamp(spec.intersectionMergeTolerance, 1, 8, 3),
                refinementIterations: clamp(spec.refinementIterations, 3, 24, 12),
                tangentAngleTolerance: clamp(spec.tangentAngleTolerance, .01, .25, .08),
                intersectionPointSize: clamp(spec.intersectionPointSize, 2, 10, 5),
                intersectionColor: safeColor(spec.intersectionColor, '#111827'),
                tangentColor: safeColor(spec.tangentColor, '#d97706'),
                intersectionLabelLimit: clamp(spec.intersectionLabelLimit, 0, 40, 8),
                intersectionDecimals: clamp(spec.intersectionDecimals, 0, 6, 3),
                maxIntersections: clamp(spec.maxIntersections, 10, 250, 120),
                aspectLock: spec.aspectLock !== false,
            };
        },
        validate(spec) {
            if (!spec.objects || spec.objects.length < 2) return ['Composite graph-এর জন্য কমপক্ষে দুইটি object লিখুন।'];
            const invalid = spec.objects.map(validateObject).find(Boolean);
            return invalid ? [invalid] : [];
        },
        autoRange(spec) {
            return compositeBounds(spec);
        },
        render(spec, context) {
            const geometries = [];
            const content = [];
            const legend = [];

            spec.objects.forEach((object, index) => {
                if (object.visible === false) return;
                const paths = sampleObject(object, spec, context);
                if (!paths) {
                    content.push(context.message(`${object.label} render করা যায়নি।`, '#dc2626', index));
                    return;
                }
                const color = safeColor(object.color, context.colors[index % context.colors.length]);
                paths.forEach((points) => {
                    const path = svgPathFromPoints(points, context, { breakDistance: Math.hypot(context.plotWidth, context.plotHeight) * .42 });
                    if (path) content.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="${spec.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${context.clipId})"/>`);
                });
                content.push(restrictedFunctionEndpointMarkup(object, color, spec, context));
                geometries.push({
                    label: object.label,
                    color,
                    paths,
                    segments: drawableSegments(paths, context, object, spec),
                });
                legend.push({ label: object.label, color, kind: 'line' });
            });

            if (geometries.length >= 2 && (spec.showIntersections || spec.showIntersectionSummary)) {
                content.push(renderIntersections(geometries, spec, context));
            }

            return { content: content.join(''), legend };
        },
    });
}
