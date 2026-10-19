import {
    GRAPH_COLORS,
    compileMathExpression,
    toEnglishDigits,
} from './graph-utils.js';

import {
    TEXTBOOK_INPUT_ENGINE_VERSION,
    applyTextbookConstants,
    extractTextbookStatements,
    normalizeTextbookMathText,
    parseTextbookIntent,
    recognizeTextbookGraphCandidates,
    textbookCompilerExpression,
} from './graph-textbook-input.js?v=20260801-guest-browser-storage-1';

export const GRAPH_BUILDER_UX_VERSION = '2.2.1';
export { TEXTBOOK_INPUT_ENGINE_VERSION };

const EPSILON = 1e-7;
const MAX_DATA_ROWS = 50001;

function closeEnough(left, right, tolerance = 1e-6) {
    return Number.isFinite(left)
        && Number.isFinite(right)
        && Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

function finite(value, fallback = NaN) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function roundValue(value, digits = 8) {
    if (!Number.isFinite(value)) return value;
    const scale = 10 ** digits;
    const rounded = Math.round(value * scale) / scale;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function displayNumber(value) {
    const number = roundValue(value, 6);
    if (!Number.isFinite(number)) return '';
    return String(number);
}

function stripOuterMathDelimiters(value) {
    return String(value || '')
        .replace(/^\s*\\\(([\s\S]*)\\\)\s*$/, '$1')
        .replace(/^\s*\\\[([\s\S]*)\\\]\s*$/, '$1')
        .replace(/^\s*\$+([\s\S]*?)\$+\s*$/, '$1');
}

function replaceLatexFractions(value) {
    let result = String(value || '');
    for (let index = 0; index < 8; index += 1) {
        const next = result.replace(
            /\\(?:d?frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
            '(($1)/(($2)))',
        );
        if (next === result) break;
        result = next;
    }
    return result;
}

export function normalizeUniversalMathText(value) {
    return normalizeTextbookMathText(stripOuterMathDelimiters(value));
}

function compilerExpression(value) {
    return textbookCompilerExpression(value);
}

export function extractEquationCandidates(source) {
    const raw = String(source || '');
    const candidates = [];

    const add = (value) => {
        const normalized = normalizeUniversalMathText(value)
            .replace(/^[,;:.\s]+|[,;:.\s]+$/g, '')
            .trim();
        if (!normalized.includes('=')) return;
        if (normalized.length < 3 || normalized.length > 1200) return;
        if (!candidates.includes(normalized)) candidates.push(normalized);
    };

    extractTextbookStatements(raw).forEach(add);

    for (const match of raw.matchAll(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$([^$\n]+)\$/g)) {
        add(match[1] || match[2] || match[3]);
    }

    const mathAlphabet = String.raw`A-Za-z0-9_πθλΣΔ∞√²³⁴+\-−–—*/×÷^=().,\[\]{}\\\s`;
    const equationPattern = new RegExp(`[${mathAlphabet}]{1,500}=[${mathAlphabet}]{1,500}`, 'g');
    for (const match of raw.matchAll(equationPattern)) add(match[0]);

    if (!candidates.length && raw.includes('=')) {
        const equalIndex = raw.indexOf('=');
        const left = raw.slice(Math.max(0, equalIndex - 250), equalIndex);
        const right = raw.slice(equalIndex + 1, equalIndex + 251);
        add(`${left}=${right}`);
    }

    return candidates;
}

function equationFunction(equation, variables = ['x', 'y']) {
    const normalized = normalizeUniversalMathText(equation);
    const equalIndex = normalized.indexOf('=');
    if (equalIndex < 0) return null;

    const left = compilerExpression(normalized.slice(0, equalIndex));
    const right = compilerExpression(normalized.slice(equalIndex + 1));
    if (!left || !right) return null;

    const evaluator = compileMathExpression(`(${left})-(${right})`, variables);
    if (!evaluator) return null;
    return {
        evaluator,
        left,
        right,
        normalized,
    };
}

function inferQuadratic2d(equation) {
    const compiled = equationFunction(equation, ['x', 'y']);
    if (!compiled) return null;
    const fn = compiled.evaluator;
    const sample = (x, y) => finite(fn(x, y));

    const f00 = sample(0, 0);
    const f10 = sample(1, 0);
    const fm10 = sample(-1, 0);
    const f01 = sample(0, 1);
    const f0m1 = sample(0, -1);
    const f11 = sample(1, 1);
    if (![f00, f10, fm10, f01, f0m1, f11].every(Number.isFinite)) return null;

    const coefficients = {
        A: (f10 + fm10 - 2 * f00) / 2,
        B: f11 - f10 - f01 + f00,
        C: (f01 + f0m1 - 2 * f00) / 2,
        D: (f10 - fm10) / 2,
        E: (f01 - f0m1) / 2,
        F: f00,
    };

    const verificationPoints = [
        [2, 0], [0, 2], [2, 1], [-1, 2], [1.5, -0.5],
    ];
    const valid = verificationPoints.every(([x, y]) => {
        const expected = coefficients.A * x * x
            + coefficients.B * x * y
            + coefficients.C * y * y
            + coefficients.D * x
            + coefficients.E * y
            + coefficients.F;
        const actual = sample(x, y);
        return closeEnough(actual, expected, 2e-5);
    });

    return valid ? { ...compiled, coefficients } : null;
}

function parseRequestedLabels(source) {
    const text = String(source || '');
    const respectively = text.match(
        /(?:যথাক্রমে|respectively)\s*([A-Za-zΑ-Ωα-ω])\s*(?:ও|এবং|and|,|&)\s*([A-Za-zΑ-Ωα-ω])/i,
    );
    if (respectively) return { x: respectively[1], y: respectively[2] };

    if (/(?:অক্ষ|axis)/i.test(text)) {
        const interceptLabels = text.match(
            /x[^A-Za-zΑ-Ωα-ω]{0,40}([A-WZΑ-Ωα-ω])[^A-Za-zΑ-Ωα-ω]{0,80}y[^A-Za-zΑ-Ωα-ω]{0,40}([A-WZΑ-Ωα-ω])/i,
        );
        if (interceptLabels) return { x: interceptLabels[1], y: interceptLabels[2] };
    }
    return { x: 'A', y: 'B' };
}

export function parseGraphInstructions(source) {
    const text = String(source || '');
    const lower = text.toLowerCase();
    const mentionsAxes = (
        /(x|এক্স)\s*[- ]?(?:অক্ষ|axis)/i.test(text)
        && /(y|ওয়াই|ওয়াই)\s*[- ]?(?:অক্ষ|axis)/i.test(text)
    );
    const intersection = /ছেদ|intersect|intercept/i.test(text);
    const labels = parseRequestedLabels(text);

    const textbookIntent = parseTextbookIntent(text);

    return {
        showIntercepts: (mentionsAxes && intersection) || textbookIntent.intercepts,
        xLabel: labels.x,
        yLabel: labels.y,
        showOrigin: /মূলবিন্দু|origin|\bO\b/.test(text),
        showTriangle: /ত্রিভুজ|triangle/i.test(text),
        showArea: /ক্ষেত্রফল|area/i.test(text),
        showDistance: /দূরত্ব|distance/i.test(text),
        showSlope: /ঢাল|slope/i.test(text),
        showTangent: textbookIntent.tangent,
        showNormal: textbookIntent.normal,
        showFocus: textbookIntent.focus,
        showDirectrix: textbookIntent.directrix,
        showAsymptote: textbookIntent.asymptote,
        showVertex: textbookIntent.vertex,
        showBoundedRegion: textbookIntent.boundedRegion,
        showLocus: textbookIntent.locus,
        textbookIntent,
        raw: text.trim().slice(0, 5000),
        lower,
    };
}

function rangeFromPoints(points, minimumSpan = 8) {
    const xs = points.map((item) => item.x).filter(Number.isFinite);
    const ys = points.map((item) => item.y).filter(Number.isFinite);
    if (!xs.length || !ys.length) return { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

    const padded = (values) => {
        let minimum = Math.min(...values, 0);
        let maximum = Math.max(...values, 0);
        if (maximum - minimum < minimumSpan) {
            const center = (minimum + maximum) / 2;
            minimum = center - minimumSpan / 2;
            maximum = center + minimumSpan / 2;
        }
        const pad = Math.max(1, (maximum - minimum) * 0.18);
        return [Math.floor(minimum - pad), Math.ceil(maximum + pad)];
    };

    const [xMin, xMax] = padded(xs);
    const [yMin, yMax] = padded(ys);
    return { xMin, xMax, yMin, yMax };
}

function lineRecognition(equation, source, inferred) {
    const { A, B, C, D, E, F } = inferred.coefficients;
    if (Math.abs(A) > EPSILON || Math.abs(B) > EPSILON || Math.abs(C) > EPSILON) return null;
    if (Math.abs(D) < EPSILON && Math.abs(E) < EPSILON) return null;

    const instruction = parseGraphInstructions(source);
    const xIntercept = Math.abs(D) > EPSILON ? -F / D : NaN;
    const yIntercept = Math.abs(E) > EPSILON ? -F / E : NaN;
    const xName = instruction.xLabel || 'A';
    const yName = instruction.yLabel || 'B';

    const points = [];
    if (Number.isFinite(xIntercept)) points.push({ name: xName, x: xIntercept, y: 0 });
    if (Number.isFinite(yIntercept)) points.push({ name: yName, x: 0, y: yIntercept });

    if (
        points.length >= 2
        && Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) < 1e-7
    ) {
        points.splice(0, points.length);
    }

    if (points.length < 2) {
        if (Math.abs(E) > EPSILON) {
            points.splice(0, points.length,
                { name: 'P', x: -4, y: -(D * -4 + F) / E },
                { name: 'Q', x: 4, y: -(D * 4 + F) / E });
        } else {
            const x = -F / D;
            points.splice(0, points.length,
                { name: 'P', x, y: -4 },
                { name: 'Q', x, y: 4 });
        }
    }

    const commands = points.map((item, index) => (
        `point | ${item.name} | x=${displayNumber(item.x)}, y=${displayNumber(item.y)} | locked | ${index === 0 ? '#2563eb' : '#ea580c'}`
    ));
    commands.push(`line | l | ${points[0].name} | ${points[1].name} | #0f172a`);

    const originNameConflict = points.some((item) => item.name === 'O');
    if ((instruction.showOrigin || instruction.showTriangle || instruction.showArea) && !originNameConflict) {
        commands.push('point | O | x=0, y=0 | locked | #16a34a');
    }
    if (
        (instruction.showTriangle || instruction.showArea)
        && Number.isFinite(xIntercept)
        && Number.isFinite(yIntercept)
        && Math.abs(xIntercept) > EPSILON
        && Math.abs(yIntercept) > EPSILON
    ) {
        commands.push(`polygon | T | O,${xName},${yName} | #2563eb | fill=#60a5fa | opacity=0.16`);
        if (instruction.showArea) commands.push('measure | areaT | area | T');
    }
    if (instruction.showSlope && Math.abs(E) > EPSILON) {
        commands.push(`measure | slopeL | slope | ${points[0].name} | ${points[1].name}`);
    }

    const range = rangeFromPoints([
        ...points,
        { x: 0, y: 0 },
    ]);

    const featureLabels = [];
    if (Number.isFinite(xIntercept)) featureLabels.push(`x-intercept ${xName}=(${displayNumber(xIntercept)}, 0)`);
    if (Number.isFinite(yIntercept)) featureLabels.push(`y-intercept ${yName}=(0, ${displayNumber(yIntercept)})`);
    if (instruction.showTriangle || instruction.showArea) featureLabels.push('intercept triangle');

    return {
        family: 'straight-line',
        familyLabel: 'সরলরেখা',
        confidence: 0.99,
        equation,
        instruction,
        features: featureLabels,
        spec: {
            type: 'geometry',
            title: 'Straight line and intercepts',
            expression: commands.join('\n'),
            ...range,
            aspectLock: true,
            legend: true,
            showSummary: true,
            sourceEquation: equation,
            sourceInstruction: instruction.raw,
            recognitionFamily: 'straight-line',
            recognitionVersion: GRAPH_BUILDER_UX_VERSION,
        },
    };
}

function circleRecognition(equation, inferred) {
    const { A, B, C, D, E, F } = inferred.coefficients;
    if (Math.abs(B) > 1e-5 || Math.abs(A) < EPSILON || !closeEnough(A, C, 1e-5)) return null;

    const h = -D / (2 * A);
    const k = -E / (2 * A);
    const radiusSquared = h * h + k * k - F / A;
    if (!(radiusSquared > EPSILON)) return null;
    const radius = Math.sqrt(radiusSquared);
    const pad = radius * 1.25;

    return {
        family: 'circle',
        familyLabel: 'বৃত্ত',
        confidence: 0.99,
        equation,
        instruction: parseGraphInstructions(equation),
        features: [
            `কেন্দ্র (${displayNumber(h)}, ${displayNumber(k)})`,
            `ব্যাসার্ধ ${displayNumber(radius)}`,
        ],
        spec: {
            type: 'circle',
            title: 'Circle',
            params: { h, k, radius },
            xMin: Math.floor(h - pad),
            xMax: Math.ceil(h + pad),
            yMin: Math.floor(k - pad),
            yMax: Math.ceil(k + pad),
            aspectLock: true,
            sourceEquation: equation,
            recognitionFamily: 'circle',
            recognitionVersion: GRAPH_BUILDER_UX_VERSION,
        },
    };
}

function conicRecognition(equation, inferred) {
    const { A, B, C, D, E, F } = inferred.coefficients;
    if (Math.abs(B) > 1e-5) return null;

    // Vertical parabola: A(x-h)^2 = -E(y-k)
    if (Math.abs(A) > EPSILON && Math.abs(C) < EPSILON && Math.abs(E) > EPSILON) {
        const h = -D / (2 * A);
        const remainder = F - (D * D) / (4 * A);
        const k = -remainder / E;
        const p = -E / (4 * A);
        return {
            family: 'parabola',
            familyLabel: 'পরাবৃত্ত',
            confidence: 0.96,
            equation,
            instruction: parseGraphInstructions(equation),
            features: [`শীর্ষ (${displayNumber(h)}, ${displayNumber(k)})`, `p=${displayNumber(p)}`],
            spec: {
                type: 'parabola',
                title: 'Parabola',
                params: { h, k, p, orientation: 'vertical' },
                xMin: h - 10, xMax: h + 10,
                yMin: Math.min(k - 3, k + 12 * Math.sign(p || 1)),
                yMax: Math.max(k + 3, k + 12 * Math.sign(p || 1)),
                aspectLock: true,
                sourceEquation: equation,
                recognitionFamily: 'parabola',
                recognitionVersion: GRAPH_BUILDER_UX_VERSION,
            },
        };
    }

    // Horizontal parabola: C(y-k)^2 = -D(x-h)
    if (Math.abs(C) > EPSILON && Math.abs(A) < EPSILON && Math.abs(D) > EPSILON) {
        const k = -E / (2 * C);
        const remainder = F - (E * E) / (4 * C);
        const h = -remainder / D;
        const p = -D / (4 * C);
        return {
            family: 'parabola',
            familyLabel: 'পরাবৃত্ত',
            confidence: 0.96,
            equation,
            instruction: parseGraphInstructions(equation),
            features: [`শীর্ষ (${displayNumber(h)}, ${displayNumber(k)})`, `p=${displayNumber(p)}`],
            spec: {
                type: 'parabola',
                title: 'Parabola',
                params: { h, k, p, orientation: 'horizontal' },
                xMin: Math.min(h - 3, h + 12 * Math.sign(p || 1)),
                xMax: Math.max(h + 3, h + 12 * Math.sign(p || 1)),
                yMin: k - 10, yMax: k + 10,
                aspectLock: true,
                sourceEquation: equation,
                recognitionFamily: 'parabola',
                recognitionVersion: GRAPH_BUILDER_UX_VERSION,
            },
        };
    }

    if (Math.abs(A) < EPSILON || Math.abs(C) < EPSILON) return null;
    const h = -D / (2 * A);
    const k = -E / (2 * C);
    const centeredConstant = F - (D * D) / (4 * A) - (E * E) / (4 * C);
    const rightSide = -centeredConstant;
    if (Math.abs(rightSide) < EPSILON) return null;

    const xSquare = rightSide / A;
    const ySquare = rightSide / C;

    if (xSquare > EPSILON && ySquare > EPSILON) {
        const a = Math.sqrt(xSquare);
        const b = Math.sqrt(ySquare);
        return {
            family: 'ellipse',
            familyLabel: 'উপবৃত্ত',
            confidence: 0.96,
            equation,
            instruction: parseGraphInstructions(equation),
            features: [
                `কেন্দ্র (${displayNumber(h)}, ${displayNumber(k)})`,
                `অর্ধ-অক্ষ ${displayNumber(a)}, ${displayNumber(b)}`,
            ],
            spec: {
                type: 'ellipse',
                title: 'Ellipse',
                params: { h, k, a, b },
                xMin: h - a * 1.3, xMax: h + a * 1.3,
                yMin: k - b * 1.3, yMax: k + b * 1.3,
                aspectLock: true,
                sourceEquation: equation,
                recognitionFamily: 'ellipse',
                recognitionVersion: GRAPH_BUILDER_UX_VERSION,
            },
        };
    }

    if (xSquare * ySquare < -EPSILON) {
        const horizontal = xSquare > 0;
        const a = Math.sqrt(Math.abs(horizontal ? xSquare : ySquare));
        const b = Math.sqrt(Math.abs(horizontal ? ySquare : xSquare));
        return {
            family: 'hyperbola',
            familyLabel: 'অধিবৃত্ত',
            confidence: 0.95,
            equation,
            instruction: parseGraphInstructions(equation),
            features: [
                `কেন্দ্র (${displayNumber(h)}, ${displayNumber(k)})`,
                `${horizontal ? 'অনুভূমিক' : 'উল্লম্ব'} transverse axis`,
            ],
            spec: {
                type: 'hyperbola',
                title: 'Hyperbola',
                params: { h, k, a, b, orientation: horizontal ? 'horizontal' : 'vertical' },
                xMin: h - Math.max(8, a * 3), xMax: h + Math.max(8, a * 3),
                yMin: k - Math.max(8, b * 3), yMax: k + Math.max(8, b * 3),
                aspectLock: true,
                sourceEquation: equation,
                recognitionFamily: 'hyperbola',
                recognitionVersion: GRAPH_BUILDER_UX_VERSION,
            },
        };
    }

    return null;
}

function explicitFunctionRecognition(equation) {
    const normalized = normalizeUniversalMathText(equation);
    const match = normalized.match(/^\s*(?:y|[A-Za-z]\w*\s*\(\s*x\s*\))\s*=\s*(.+)$/i);
    if (!match || !/\bx\b/i.test(match[1])) return null;
    const expression = compilerExpression(match[1]);
    if (!compileMathExpression(expression, ['x'])) return null;

    return {
        family: 'function',
        familyLabel: 'ফাংশন',
        confidence: 0.92,
        equation,
        instruction: parseGraphInstructions(equation),
        features: ['explicit function of x'],
        spec: {
            type: 'function',
            title: 'Function graph',
            expression,
            series: [{ label: equation, expression, color: '#2563eb' }],
            xMin: -10, xMax: 10, yMin: -10, yMax: 10,
            sourceEquation: equation,
            recognitionFamily: 'function',
            recognitionVersion: GRAPH_BUILDER_UX_VERSION,
        },
    };
}

function vectorRecognition(equation) {
    const normalized = normalizeUniversalMathText(equation).replace(/\s+/g, '');
    const match = normalized.match(/^([A-Za-z][A-Za-z0-9_]*)=([+-]?(?:\d+(?:\.\d+)?)?)i([+-](?:\d+(?:\.\d+)?)?)j$/i);
    if (!match) return null;

    const coefficient = (value, fallback) => {
        if (value === '' || value === '+') return fallback;
        if (value === '-') return -fallback;
        return Number(value);
    };
    const x = coefficient(match[2], 1);
    const y = coefficient(match[3], 1);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const name = match[1];
    const range = rangeFromPoints([{ x: 0, y: 0 }, { x, y }], 8);
    return {
        family: 'vector',
        familyLabel: 'ভেক্টর',
        confidence: 0.93,
        equation,
        instruction: parseGraphInstructions(equation),
        features: [`উপাংশ (${displayNumber(x)}, ${displayNumber(y)})`],
        spec: {
            type: 'geometry',
            title: `Vector ${name}`,
            expression: [
                'point | O | x=0, y=0 | locked | #0f172a',
                `point | A | x=${displayNumber(x)}, y=${displayNumber(y)} | locked | #2563eb`,
                `ray | ${name} | O | A | #2563eb`,
                `measure | magnitude | distance | O | A`,
            ].join('\n'),
            ...range,
            aspectLock: true,
            sourceEquation: equation,
            recognitionFamily: 'vector',
            recognitionVersion: GRAPH_BUILDER_UX_VERSION,
        },
    };
}

export function recognizeUniversalGraph(source) {
    const rawSource = String(source || '').trim();
    const equations = extractEquationCandidates(rawSource);
    const attempts = recognizeTextbookGraphCandidates(rawSource);

    equations.forEach((originalEquation) => {
        const equation = applyTextbookConstants(originalEquation, rawSource);
        const preserveOriginal = (attempt) => {
            if (!attempt) return null;
            return {
                ...attempt,
                equation: originalEquation,
                spec: {
                    ...attempt.spec,
                    sourceEquation: originalEquation,
                    normalizedEquation: equation,
                    textbookInputVersion: TEXTBOOK_INPUT_ENGINE_VERSION,
                },
            };
        };

        const vector = preserveOriginal(vectorRecognition(equation));
        if (vector) attempts.push(vector);

        const polynomialCandidate = !/\b(?:abs|sin|cos|tan|asin|acos|atan|sqrt|exp|log|ln|floor|ceil|sinh|cosh|tanh)\s*\([^)]*[xy][^)]*\)/i.test(equation);
        const inferred = polynomialCandidate ? inferQuadratic2d(equation) : null;
        if (inferred) {
            const line = preserveOriginal(lineRecognition(equation, rawSource, inferred));
            if (line) attempts.push(line);
            const circle = preserveOriginal(circleRecognition(equation, inferred));
            if (circle) attempts.push(circle);
            const conic = preserveOriginal(conicRecognition(equation, inferred));
            if (conic) attempts.push(conic);
        }

        const explicit = preserveOriginal(explicitFunctionRecognition(equation));
        if (explicit) attempts.push(explicit);
    });

    attempts.sort((left, right) => right.confidence - left.confidence);
    const best = attempts[0] || null;
    if (!best) {
        return {
            recognized: false,
            confidence: 0,
            source: rawSource,
            equations,
            message: equations.length
                ? 'সমীকরণ পাওয়া গেছে, কিন্তু graph family নিশ্চিতভাবে শনাক্ত হয়নি।'
                : 'কোনো graphable equation পাওয়া যায়নি।',
        };
    }

    return {
        ...best,
        recognized: true,
        source: rawSource,
        equations,
        spec: {
            axisMode: best.spec?.axisMode || 'auto',
            autoRangePadding: Number.isFinite(Number(best.spec?.autoRangePadding))
                ? Number(best.spec.autoRangePadding)
                : 0.12,
            ...best.spec,
            sourceText: rawSource.slice(0, 12000),
            sourceEquation: best.equation,
            originalTextbookInput: rawSource.slice(0, 12000),
            textbookInputVersion: best.spec?.textbookInputVersion || TEXTBOOK_INPUT_ENGINE_VERSION,
        },
    };
}

function numericCell(value) {
    const normalized = toEnglishDigits(String(value ?? ''))
        .replace(/[−–—]/g, '-')
        .replace(/,/g, '')
        .trim();
    if (!normalized) return NaN;
    const number = Number(normalized.replace(/%$/, ''));
    return Number.isFinite(number) ? number : NaN;
}

function splitDelimitedLine(line, delimiter = null) {
    const source = String(line || '').trim();
    if (!source) return [];
    if (delimiter) return source.split(delimiter).map((item) => item.trim());

    const candidates = [
        ['\t', source.split(/\t/)],
        ['|', source.split(/\s*\|\s*/)],
        [',', source.split(/\s*,\s*/)],
        [';', source.split(/\s*;\s*/)],
        ['space', source.split(/\s{2,}/)],
    ];
    const best = candidates
        .map(([name, items]) => [name, items.map((item) => item.trim())])
        .filter(([, items]) => items.length >= 2)
        .sort((left, right) => right[1].length - left[1].length)[0];

    return best ? best[1] : [source];
}

function normalizeRows(rows) {
    const cleaned = (rows || [])
        .map((row) => (row || []).map((cell) => String(cell ?? '').trim()))
        .filter((row) => row.some(Boolean))
        .slice(0, MAX_DATA_ROWS);
    const width = Math.max(0, ...cleaned.map((row) => row.length));
    return cleaned.map((row) => Array.from({ length: width }, (_, index) => row[index] || ''));
}

export function parseDataTableText(value) {
    const source = String(value || '').trim();
    if (!source) return { rows: [], headers: [], body: [], delimiter: null };

    if (/<table[\s>]/i.test(source) && typeof DOMParser !== 'undefined') {
        const documentValue = new DOMParser().parseFromString(source, 'text/html');
        const table = documentValue.querySelector('table');
        if (table) {
            const rows = Array.from(table.rows).map((row) => (
                Array.from(row.cells).map((cell) => cell.textContent.trim())
            ));
            return tableModel(rows);
        }
    }

    const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return { rows: [], headers: [], body: [], delimiter: null };

    const first = splitDelimitedLine(lines[0]);
    let delimiter = null;
    if (lines[0].includes('\t')) delimiter = /\t/;
    else if (lines[0].includes('|')) delimiter = /\s*\|\s*/;
    else if (lines[0].includes(',')) delimiter = /\s*,\s*/;
    else if (lines[0].includes(';')) delimiter = /\s*;\s*/;
    else if (/\s{2,}/.test(lines[0])) delimiter = /\s{2,}/;

    const rows = lines.map((line) => splitDelimitedLine(line, delimiter));
    return { ...tableModel(rows), delimiter };
}

function tableModel(rowsInput) {
    const rows = normalizeRows(rowsInput);
    if (!rows.length) return { rows: [], headers: [], body: [] };

    const width = rows[0].length;
    const firstNumeric = rows[0].filter((cell) => Number.isFinite(numericCell(cell))).length;
    const later = rows.slice(1, Math.min(rows.length, 8));
    const laterNumericAverage = later.length
        ? later.reduce((sum, row) => sum + row.filter((cell) => Number.isFinite(numericCell(cell))).length, 0) / later.length
        : 0;
    const hasHeader = rows.length > 1 && (
        firstNumeric < Math.max(1, width / 2)
        || laterNumericAverage > firstNumeric
    );
    const headers = hasHeader
        ? rows[0].map((cell, index) => cell || `Column ${index + 1}`)
        : Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
    const body = hasHeader ? rows.slice(1) : rows;

    return { rows, headers, body, hasHeader };
}

export function rowsToDelimitedText(rows, delimiter = '\t') {
    return normalizeRows(rows).map((row) => row.join(delimiter)).join('\n');
}

function intervalBounds(value) {
    const normalized = toEnglishDigits(String(value || ''))
        .replace(/[−–—]/g, '-')
        .trim();
    const match = normalized.match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to|থেকে)\s*(-?\d+(?:\.\d+)?)\s*$/i);
    if (!match) return null;
    const lower = Number(match[1]);
    const upper = Number(match[2]);
    return Number.isFinite(lower) && Number.isFinite(upper) && upper > lower
        ? { lower, upper, midpoint: (lower + upper) / 2 }
        : null;
}

export function analyzeDataTable(modelInput) {
    const model = modelInput?.headers ? modelInput : tableModel(modelInput?.rows || modelInput || []);
    const columns = model.headers.map((header, index) => {
        const values = model.body.map((row) => row[index] || '');
        const numericCount = values.filter((value) => Number.isFinite(numericCell(value))).length;
        const intervalCount = values.filter((value) => intervalBounds(value)).length;
        return {
            index,
            header,
            values,
            numericRatio: values.length ? numericCount / values.length : 0,
            intervalRatio: values.length ? intervalCount / values.length : 0,
            type: intervalCount >= Math.max(2, values.length * 0.6)
                ? 'interval'
                : numericCount >= Math.max(2, values.length * 0.7)
                    ? 'number'
                    : 'text',
        };
    });

    const numeric = columns.filter((column) => column.type === 'number');
    const intervals = columns.filter((column) => column.type === 'interval');
    const text = columns.filter((column) => column.type === 'text');
    let recommendation = 'bar';
    let reason = 'Category এবং numeric value পাওয়া গেছে।';

    if (intervals.length && numeric.length) {
        recommendation = numeric.length > 1 ? 'multi-line' : 'histogram';
        reason = numeric.length > 1
            ? 'Class interval-এর সঙ্গে একাধিক numeric series পাওয়া গেছে।'
            : 'Class interval এবং frequency column পাওয়া গেছে।';
    } else if (numeric.length >= 2) {
        const firstHeader = String(numeric[0].header || '').toLowerCase();
        const semanticCategory = /class|category|grade|group|section|শ্রেণি|শ্রেণী|বিভাগ|দল/.test(firstHeader);
        const hasCategory = text.length > 0 || semanticCategory;
        if (/time|date|year|month|দিন|সময়|সময়|বছর|মাস/.test(firstHeader)) {
            recommendation = numeric.length > 2 ? 'multi-line' : 'line';
            reason = numeric.length > 2
                ? 'Ordered/time column এবং একাধিক numeric value series পাওয়া গেছে।'
                : 'Ordered/time column এবং numeric value পাওয়া গেছে।';
        } else if (hasCategory && numeric.length > 1) {
            recommendation = 'grouped-bar';
            reason = 'Category column-এর সঙ্গে একাধিক numeric series পাওয়া গেছে।';
        } else {
            recommendation = numeric.length > 2 ? 'scientific-scatter' : 'scatter';
            reason = numeric.length > 2
                ? 'একটি X column এবং একাধিক numeric Y series পাওয়া গেছে।'
                : 'দুইটি numeric column পাওয়া গেছে।';
        }
    } else if (numeric.length === 1 && !text.length) {
        recommendation = 'histogram';
        reason = 'একটি raw numeric observation column পাওয়া গেছে।';
    } else if (numeric.length === 1) {
        recommendation = 'bar';
        reason = 'Category এবং numeric value পাওয়া গেছে।';
    }

    return {
        ...model,
        columns,
        numeric,
        intervals,
        text,
        recommendation,
        reason,
        defaultCategoryColumn: intervals[0]?.index ?? text[0]?.index ?? numeric[0]?.index ?? 0,
        defaultValueColumn: numeric.find((column) => column.index !== (intervals[0]?.index ?? text[0]?.index))?.index
            ?? numeric[0]?.index
            ?? Math.min(1, columns.length - 1),
    };
}


function datasetHash(headers, rows) {
    const source = JSON.stringify([headers, rows]);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `ds_${(hash >>> 0).toString(36)}`;
}

function compactEmbeddedRows(headers, rows) {
    const limitedRows = rows.slice(0, 20000).map((row) => row.slice(0, 80));
    const estimated = JSON.stringify([headers, limitedRows]).length;
    if (limitedRows.length <= 400 && estimated <= 18000) {
        return {
            rows: limitedRows,
            storageMode: 'embedded',
            embeddedRowCount: limitedRows.length,
        };
    }
    return {
        rows: [],
        storageMode: 'summarized',
        embeddedRowCount: 0,
    };
}

function normalizeSelectedColumns(valueColumns, fallback) {
    const source = Array.isArray(valueColumns) ? valueColumns : [valueColumns ?? fallback];
    return [...new Set(source.map(Number).filter(Number.isInteger))].slice(0, 16);
}

function tableSortValue(row, categoryIndex) {
    const numeric = numericCell(row[categoryIndex]);
    if (Number.isFinite(numeric)) return numeric;
    const interval = intervalBounds(row[categoryIndex]);
    if (interval) return interval.lower;
    return String(row[categoryIndex] || '').toLocaleLowerCase();
}

function sortedStatisticsRows(rows, categoryIndex, sortMode) {
    if (!['ascending', 'descending'].includes(sortMode)) return rows.slice();
    const direction = sortMode === 'descending' ? -1 : 1;
    return rows.slice().sort((left, right) => {
        const a = tableSortValue(left, categoryIndex);
        const b = tableSortValue(right, categoryIndex);
        if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
        return String(a).localeCompare(String(b), undefined, { numeric: true }) * direction;
    });
}

function transformFrequencyValues(values, mode) {
    const finite = values.map((value) => Number.isFinite(Number(value)) ? Number(value) : 0);
    if (!['relative', 'percent'].includes(mode)) return finite;
    const total = finite.reduce((sum, value) => sum + Math.max(0, value), 0);
    if (!(total > 0)) return finite.map(() => 0);
    return finite.map((value) => (
        mode === 'percent'
            ? Math.max(0, value) / total * 100
            : Math.max(0, value) / total
    ));
}

function compactNumber(value, digits = 8) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const scale = 10 ** digits;
    const rounded = Math.round(number * scale) / scale;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function regressionSummary(xValues, yValues) {
    const pairs = [];
    const count = Math.min(xValues.length, yValues.length);
    for (let index = 0; index < count; index += 1) {
        const x = Number(xValues[index]);
        const y = Number(yValues[index]);
        if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
    }
    if (pairs.length < 2) return null;

    const x = pairs.map((item) => item[0]);
    const y = pairs.map((item) => item[1]);
    const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
    const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
    let numerator = 0;
    let denominatorX = 0;
    let denominatorY = 0;
    let sumXX = 0;
    let sumXY = 0;

    for (let index = 0; index < x.length; index += 1) {
        const dx = x[index] - meanX;
        const dy = y[index] - meanY;
        numerator += dx * dy;
        denominatorX += dx * dx;
        denominatorY += dy * dy;
        sumXX += x[index] * x[index];
        sumXY += x[index] * y[index];
    }

    const slopeDenominator = x.length * sumXX - x.reduce((sum, value) => sum + value, 0) ** 2;
    if (Math.abs(slopeDenominator) < 1e-15) return null;
    const sumX = x.reduce((sum, value) => sum + value, 0);
    const sumY = y.reduce((sum, value) => sum + value, 0);
    const slope = (x.length * sumXY - sumX * sumY) / slopeDenominator;
    const intercept = (sumY - slope * sumX) / x.length;
    const correlationDenominator = Math.sqrt(denominatorX * denominatorY);
    const r = correlationDenominator > 1e-15 ? numerator / correlationDenominator : 0;

    let residual = 0;
    let total = 0;
    for (let index = 0; index < x.length; index += 1) {
        const predicted = slope * x[index] + intercept;
        residual += (y[index] - predicted) ** 2;
        total += (y[index] - meanY) ** 2;
    }

    return {
        slope,
        intercept,
        r,
        r2: total > 1e-15 ? 1 - residual / total : 1,
        n: x.length,
    };
}

function lttbDownsample(xValues, yValues, threshold = 1500) {
    const count = Math.min(xValues.length, yValues.length);
    if (threshold >= count || threshold <= 2) {
        return {
            x: xValues.slice(0, count),
            y: yValues.slice(0, count),
            indexes: Array.from({ length: count }, (_, index) => index),
        };
    }

    const sampledIndexes = [0];
    const every = (count - 2) / (threshold - 2);
    let a = 0;

    for (let bucket = 0; bucket < threshold - 2; bucket += 1) {
        const averageStart = Math.floor((bucket + 1) * every) + 1;
        const averageEnd = Math.min(count, Math.floor((bucket + 2) * every) + 1);
        let averageX = 0;
        let averageY = 0;
        const averageLength = Math.max(1, averageEnd - averageStart);

        for (let index = averageStart; index < averageEnd; index += 1) {
            averageX += Number(xValues[index]) || 0;
            averageY += Number(yValues[index]) || 0;
        }
        averageX /= averageLength;
        averageY /= averageLength;

        const rangeStart = Math.floor(bucket * every) + 1;
        const rangeEnd = Math.min(count - 1, Math.floor((bucket + 1) * every) + 1);
        const pointAX = Number(xValues[a]) || 0;
        const pointAY = Number(yValues[a]) || 0;
        let maximumArea = -1;
        let selected = rangeStart;

        for (let index = rangeStart; index < rangeEnd; index += 1) {
            const area = Math.abs(
                (pointAX - averageX) * ((Number(yValues[index]) || 0) - pointAY)
                - (pointAX - (Number(xValues[index]) || 0)) * (averageY - pointAY)
            ) * .5;
            if (area > maximumArea) {
                maximumArea = area;
                selected = index;
            }
        }

        sampledIndexes.push(selected);
        a = selected;
    }

    sampledIndexes.push(count - 1);
    return {
        x: sampledIndexes.map((index) => xValues[index]),
        y: sampledIndexes.map((index) => yValues[index]),
        indexes: sampledIndexes,
    };
}

function seriesXAxis(row, rowIndex, categoryIndex, intervalMode = 'midpoint') {
    const interval = intervalBounds(row[categoryIndex]);
    if (interval) {
        if (intervalMode === 'lower') return interval.lower;
        if (intervalMode === 'upper') return interval.upper;
        return interval.midpoint;
    }
    const numeric = numericCell(row[categoryIndex]);
    return Number.isFinite(numeric) ? numeric : rowIndex + 1;
}

export function buildAdvancedStatisticsSpec({
    model,
    chartType,
    categoryColumn,
    valueColumns,
    valueColumn,
    errorColumn = -1,
    errorMode = 'none',
    constantError = 0,
    regression = false,
    showRegressionEquation = true,
    showCorrelation = true,
    frequencyMode = 'raw',
    ogiveDirection = 'less-than',
    sortMode = 'source',
    title = '',
    xLabel = '',
    yLabel = '',
}) {
    const analysis = model?.columns ? model : analyzeDataTable(model);
    const categoryIndex = Number(categoryColumn);
    const selectedValueColumns = normalizeSelectedColumns(valueColumns, valueColumn)
        .filter((index) => index >= 0 && index < analysis.headers.length);
    const selected = selectedValueColumns.length
        ? selectedValueColumns
        : [Number(analysis.defaultValueColumn)];
    const sortedRows = sortedStatisticsRows(analysis.body || [], categoryIndex, sortMode);
    const categories = sortedRows.map((row, index) => row[categoryIndex] || String(index + 1));
    const compact = compactEmbeddedRows(analysis.headers, sortedRows);
    const hash = datasetHash(analysis.headers, sortedRows);
    const errorIndex = Number(errorColumn);

    const sourceData = {
        headers: analysis.headers,
        rows: compact.rows,
        rowCount: sortedRows.length,
        embeddedRowCount: compact.embeddedRowCount,
        storageMode: compact.storageMode,
        datasetHash: hash,
        categoryColumn: categoryIndex,
        valueColumn: selected[0],
        valueColumns: selected,
        errorColumn: Number.isInteger(errorIndex) ? errorIndex : -1,
        chartType,
        sortMode,
        frequencyMode,
        ogiveDirection,
        errorMode,
        constantError: Math.abs(Number(constantError)) || 0,
        regression: regression === true,
        showRegressionEquation: showRegressionEquation !== false,
        showCorrelation: showCorrelation !== false,
        importedBy: 'statistics-workspace-v2.2.1',
    };

    const firstValueHeader = analysis.headers[selected[0]] || 'Value';
    const base = {
        axisMode: 'auto',
        autoRangePadding: .12,
        title: title || 'Statistical graph',
        xLabel: xLabel || analysis.headers[categoryIndex] || 'X',
        yLabel: yLabel || (
            frequencyMode === 'percent'
                ? 'Percentage (%)'
                : frequencyMode === 'relative'
                    ? 'Relative frequency'
                    : firstValueHeader
        ),
        sourceData,
        statisticsWorkspaceVersion: GRAPH_BUILDER_UX_VERSION,
        datasetMode: compact.storageMode,
        sourceRowCount: sortedRows.length,
        renderedPointLimit: Math.max(160, Math.floor(1200 / Math.max(1, selected.length))),
        width: 780,
        height: 460,
        legend: true,
    };

    const perSeriesPointLimit = Math.max(160, Math.floor(1200 / Math.max(1, selected.length)));

    const series = selected.map((columnIndex, seriesIndex) => {
        const rawValues = sortedRows.map((row) => numericCell(row[columnIndex]));
        const values = transformFrequencyValues(rawValues, frequencyMode);
        const x = sortedRows.map((row, rowIndex) => (
            seriesXAxis(row, rowIndex, categoryIndex, 'midpoint')
        ));
        const errorY = sortedRows.map((row) => {
            if (errorMode === 'constant') return Math.abs(Number(constantError)) || 0;
            if (errorMode === 'column' && errorIndex >= 0) {
                const value = Math.abs(numericCell(row[errorIndex]));
                return Number.isFinite(value) ? value : 0;
            }
            return 0;
        });

        const validX = [];
        const validY = [];
        const validErrors = [];
        x.forEach((xValue, index) => {
            const yValue = values[index];
            if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) return;
            validX.push(xValue);
            validY.push(yValue);
            validErrors.push(errorY[index] || 0);
        });

        const summary = regression ? regressionSummary(validX, validY) : null;
        const sampled = lttbDownsample(validX, validY, perSeriesPointLimit);
        return {
            label: analysis.headers[columnIndex] || `Series ${seriesIndex + 1}`,
            color: GRAPH_COLORS?.[seriesIndex % GRAPH_COLORS.length],
            x: sampled.x.map((value) => compactNumber(value)),
            y: sampled.y.map((value) => compactNumber(value)),
            errorY: sampled.indexes.map((index) => compactNumber(validErrors[index] || 0)),
            regressionSummary: summary,
            sourcePointCount: validX.length,
            renderedPointCount: sampled.x.length,
        };
    });

    if (chartType === 'grouped-bar' || chartType === 'stacked-bar') {
        return {
            ...base,
            type: chartType,
            labels: categories,
            series: series.map((item, index) => ({
                label: item.label,
                color: item.color,
                values: transformFrequencyValues(
                    sortedRows.map((row) => numericCell(row[selected[index]])),
                    frequencyMode,
                ),
            })),
            showValues: false,
        };
    }

    if (chartType === 'bar' || chartType === 'pie') {
        const values = transformFrequencyValues(
            sortedRows.map((row) => numericCell(row[selected[0]])),
            frequencyMode,
        );
        return {
            ...base,
            type: chartType,
            labels: categories,
            values,
            showAxes: chartType !== 'pie',
        };
    }

    if (chartType === 'histogram') {
        const paired = sortedRows.map((row, index) => ({
            category: categories[index],
            interval: intervalBounds(row[categoryIndex]),
            value: numericCell(row[selected[0]]),
        })).filter((item) => Number.isFinite(item.value));

        const intervalRows = paired.filter((item) => item.interval);
        if (intervalRows.length >= 2) {
            const counts = transformFrequencyValues(
                intervalRows.map((item) => item.value),
                frequencyMode,
            );
            return {
                ...base,
                type: 'histogram',
                groupedBins: intervalRows.map((item, index) => ({
                    start: item.interval.lower,
                    end: item.interval.upper,
                    count: counts[index],
                    label: item.category,
                })),
                values: [],
                xLabel: xLabel || analysis.headers[categoryIndex] || 'Class interval',
            };
        }

        return {
            ...base,
            type: 'histogram',
            values: sortedRows
                .map((row) => numericCell(row[selected[0]]))
                .filter(Number.isFinite),
            xLabel: xLabel || firstValueHeader,
            yLabel: yLabel || 'Frequency',
        };
    }

    if (chartType === 'frequency-polygon' || chartType === 'ogive') {
        const cumulativeSeries = selected.map((columnIndex, seriesIndex) => {
            const rowsWithValues = sortedRows.map((row, rowIndex) => ({
                row,
                interval: intervalBounds(row[categoryIndex]),
                x: seriesXAxis(
                    row,
                    rowIndex,
                    categoryIndex,
                    chartType === 'ogive'
                        ? (ogiveDirection === 'more-than' ? 'lower' : 'upper')
                        : 'midpoint',
                ),
                value: numericCell(row[columnIndex]),
            })).filter((item) => Number.isFinite(item.value));

            let y = transformFrequencyValues(
                rowsWithValues.map((item) => item.value),
                frequencyMode,
            );
            if (chartType === 'ogive') {
                if (ogiveDirection === 'more-than') {
                    let cumulative = y.reduce((sum, value) => sum + Math.max(0, value), 0);
                    y = y.map((value) => {
                        const current = cumulative;
                        cumulative -= Math.max(0, value);
                        return current;
                    });
                } else {
                    let cumulative = 0;
                    y = y.map((value) => (cumulative += Math.max(0, value)));
                }
            }

            return {
                label: analysis.headers[columnIndex] || `Series ${seriesIndex + 1}`,
                color: GRAPH_COLORS?.[seriesIndex % GRAPH_COLORS.length],
                x: rowsWithValues.map((item) => item.x),
                y,
                connect: true,
            };
        });

        if (cumulativeSeries.length === 1) {
            return {
                ...base,
                type: chartType,
                x: cumulativeSeries[0].x,
                y: cumulativeSeries[0].y,
                cumulativeInput: chartType === 'ogive',
                seriesLabel: cumulativeSeries[0].label,
                ogiveDirection,
            };
        }

        return {
            ...base,
            type: 'multi-line',
            series: cumulativeSeries,
            showPoints: true,
            connect: true,
            regression: false,
            subtitle: chartType === 'ogive'
                ? `${ogiveDirection === 'more-than' ? 'More-than' : 'Less-than'} ogive`
                : 'Frequency polygon',
        };
    }

    if (chartType === 'box' || chartType === 'dot') {
        return {
            ...base,
            type: chartType,
            values: sortedRows
                .map((row) => numericCell(row[selected[0]]))
                .filter(Number.isFinite),
            xLabel: xLabel || firstValueHeader,
        };
    }

    const multiType = chartType === 'error-bar'
        ? 'error-bar'
        : chartType === 'scientific-scatter' || chartType === 'scatter'
            ? (selected.length > 1 || regression || errorMode !== 'none'
                ? 'scientific-scatter'
                : 'scatter')
            : selected.length > 1
                ? 'multi-line'
                : 'line';

    if (multiType === 'line' || multiType === 'scatter') {
        const first = series[0];
        return {
            ...base,
            type: multiType,
            x: first.x,
            y: first.y,
            labels: categories.slice(0, first.x.length),
            connect: multiType === 'line',
            showPoints: true,
            regression,
        };
    }

    return {
        ...base,
        type: multiType,
        series,
        connect: multiType === 'multi-line',
        showPoints: true,
        regression,
        showRegressionEquation,
        showCorrelation,
        errorBars: multiType === 'error-bar' || errorMode !== 'none',
    };
}

export function buildStatisticsSpec({
    model,
    chartType,
    categoryColumn,
    valueColumn,
    title = '',
    xLabel = '',
    yLabel = '',
}) {
    const analysis = model?.columns ? model : analyzeDataTable(model);
    const categoryIndex = Number(categoryColumn);
    const valueIndex = Number(valueColumn);
    const rows = analysis.body || [];
    const categories = rows.map((row, index) => row[categoryIndex] || String(index + 1));
    const values = rows.map((row) => numericCell(row[valueIndex])).filter(Number.isFinite);
    const paired = rows.map((row, index) => ({
        category: row[categoryIndex] || String(index + 1),
        value: numericCell(row[valueIndex]),
        x: numericCell(row[categoryIndex]),
        interval: intervalBounds(row[categoryIndex]),
        row,
    })).filter((item) => Number.isFinite(item.value));

    const sourceData = {
        headers: analysis.headers,
        rows: rows.slice(0, 5000).map((row) => row.slice(0, 80)),
        rowCount: rows.length,
        categoryColumn: categoryIndex,
        valueColumn: valueIndex,
        importedBy: 'statistics-workspace',
    };

    const base = {
        axisMode: 'auto',
        autoRangePadding: 0.12,
        title: title || 'Statistical graph',
        xLabel: xLabel || analysis.headers[categoryIndex] || 'Category',
        yLabel: yLabel || analysis.headers[valueIndex] || 'Value',
        sourceData,
        statisticsWorkspaceVersion: GRAPH_BUILDER_UX_VERSION,
        width: 760,
        height: 440,
        legend: true,
    };

    if (chartType === 'bar' || chartType === 'pie') {
        return {
            ...base,
            type: chartType,
            labels: paired.map((item) => item.category),
            values: paired.map((item) => item.value),
            showAxes: chartType !== 'pie',
        };
    }

    if (chartType === 'histogram') {
        const intervalRows = paired.filter((item) => item.interval);
        if (intervalRows.length >= 2) {
            return {
                ...base,
                type: 'histogram',
                groupedBins: intervalRows.map((item) => ({
                    start: item.interval.lower,
                    end: item.interval.upper,
                    count: item.value,
                    label: item.category,
                })),
                values: [],
                xLabel: xLabel || analysis.headers[categoryIndex] || 'Class interval',
                yLabel: yLabel || analysis.headers[valueIndex] || 'Frequency',
            };
        }

        const rawColumn = rows.map((row) => numericCell(row[valueIndex])).filter(Number.isFinite);
        return {
            ...base,
            type: 'histogram',
            values: rawColumn,
            xLabel: xLabel || analysis.headers[valueIndex] || 'Observation',
            yLabel: yLabel || 'Frequency',
        };
    }

    if (chartType === 'box' || chartType === 'dot') {
        return {
            ...base,
            type: chartType,
            values: rows.map((row) => numericCell(row[valueIndex])).filter(Number.isFinite),
            xLabel: xLabel || analysis.headers[valueIndex] || 'Observation',
        };
    }

    if (chartType === 'frequency-polygon') {
        const points = paired.map((item, index) => ({
            x: item.interval?.midpoint ?? (Number.isFinite(item.x) ? item.x : index + 1),
            y: item.value,
        }));
        return {
            ...base,
            type: 'frequency-polygon',
            x: points.map((item) => item.x),
            y: points.map((item) => item.y),
        };
    }

    if (chartType === 'ogive') {
        const points = paired.map((item, index) => ({
            x: item.interval?.upper ?? (Number.isFinite(item.x) ? item.x : index + 1),
            y: item.value,
        }));
        return {
            ...base,
            type: 'ogive',
            x: points.map((item) => item.x),
            y: points.map((item) => item.y),
            cumulativeInput: false,
        };
    }

    const points = paired.map((item, index) => ({
        x: Number.isFinite(item.x) ? item.x : index + 1,
        y: item.value,
        label: item.category,
    }));
    return {
        ...base,
        type: chartType === 'line' ? 'line' : 'scatter',
        x: points.map((item) => item.x),
        y: points.map((item) => item.y),
        labels: points.map((item) => item.label),
        connect: chartType === 'line',
        showPoints: true,
    };
}

function sourceLabel(key) {
    const button = typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll('[data-pattern-list] .qmx-pattern-btn'))
            .find((item) => item.dataset.patternKey === key || item.dataset.patternField === key)
        : null;
    return button?.textContent?.trim() || key || 'Source';
}

export function collectPageDataTables() {
    if (typeof document === 'undefined') return [];
    const preview = document.querySelector('[data-question-live-preview]');
    if (!preview) return [];

    const tables = [];
    preview.querySelectorAll('[data-preview-source-key]').forEach((block) => {
        const sourceKey = block.dataset.previewSourceKey || '';
        Array.from(block.querySelectorAll('table')).forEach((table, tableIndex) => {
            const rows = Array.from(table.rows).map((row) => (
                Array.from(row.cells).map((cell) => cell.textContent.trim())
            ));
            const model = tableModel(rows);
            if (!model.body.length || model.headers.length < 2) return;
            tables.push({
                id: `${sourceKey}:table:${tableIndex}`,
                sourceKey,
                sourceLabel: sourceLabel(sourceKey),
                tableIndex,
                selected: Boolean(table.querySelector('.qmx-preview-selected-cell')),
                model,
                rows,
            });
        });
    });

    tables.sort((left, right) => Number(right.selected) - Number(left.selected));
    return tables;
}

export function collectPageSourceText() {
    if (typeof document === 'undefined') return [];
    const preview = document.querySelector('[data-question-live-preview]');
    if (!preview) return [];
    return Array.from(preview.querySelectorAll('[data-preview-source-key]')).map((block) => ({
        key: block.dataset.previewSourceKey || '',
        label: sourceLabel(block.dataset.previewSourceKey || ''),
        text: block.textContent?.trim() || '',
        html: block.innerHTML || '',
    }));
}

export function findPageEquationSuggestions() {
    const suggestions = [];
    collectPageSourceText().forEach((block) => {
        const recognition = recognizeUniversalGraph(block.text);
        if (recognition.recognized) {
            suggestions.push({
                id: `${block.key}:${recognition.equation}`,
                sourceKey: block.key,
                sourceLabel: block.label,
                recognition,
            });
        }
    });
    return suggestions;
}

export function escapeGraphUxHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
