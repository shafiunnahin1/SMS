export const GRAPH_COLORS = [
    '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c',
    '#0891b2', '#be123c', '#4f46e5', '#65a30d', '#c026d3',
];

export function toEnglishDigits(value) {
    const bn = '০১২৩৪৫৬৭৮৯';
    return String(value ?? '').replace(/[০-৯]/g, (digit) => String(bn.indexOf(digit)));
}

export function clamp(value, minimum, maximum, fallback = minimum) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

export function positiveInteger(value, fallback = 10, maximum = 200) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(maximum, Math.max(1, number)) : fallback;
}

export function finiteArray(value, maximum = 5000) {
    return Array.isArray(value)
        ? value.slice(0, maximum).map(Number).filter(Number.isFinite)
        : [];
}

export function stringArray(value, maximum = 500, itemMaximum = 120) {
    return Array.isArray(value)
        ? value.slice(0, maximum).map((item) => String(item ?? '').slice(0, itemMaximum))
        : [];
}

export function escapeXml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    }[character]));
}

export function escapeAttribute(value) {
    return escapeXml(value).replace(/`/g, '&#96;');
}

export function safeColor(value, fallback = GRAPH_COLORS[0]) {
    return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
}

export function normalizeColors(value, fallback = GRAPH_COLORS) {
    const colors = Array.isArray(value)
        ? value.map((item, index) => safeColor(item, fallback[index % fallback.length])).slice(0, 50)
        : [];
    return colors.length ? colors : fallback.slice();
}

export function splitLines(value) {
    return String(value ?? '')
        .split(/\r?\n|;/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function splitSeriesExpressions(value) {
    if (Array.isArray(value)) {
        return value.slice(0, 20).map((item) => {
            if (typeof item === 'string') return { expression: item.trim(), label: item.trim() };
            return {
                expression: String(item?.expression ?? '').trim(),
                label: String(item?.label ?? item?.expression ?? '').trim().slice(0, 80),
                color: safeColor(item?.color, ''),
            };
        }).filter((item) => item.expression);
    }

    return splitLines(value).slice(0, 20).map((line) => {
        const match = line.match(/^([^:=]{1,80})\s*[:=]\s*(.+)$/);
        if (match) {
            const left = match[1].trim();
            const expression = match[2].trim();
            if (/^(?:y|r|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\))$/i.test(left)) {
                return { label: expression, expression };
            }
            return { label: left, expression };
        }
        return { label: line, expression: line };
    });
}

const FUNCTION_NAMES = new Set([
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'sqrt', 'abs', 'exp', 'log', 'ln', 'log10', 'floor', 'ceil', 'round',
    'sinh', 'cosh', 'tanh', 'min', 'max', 'pow', 'sign',
]);
const CONSTANT_NAMES = new Set(['pi', 'e']);
const BLOCKED_NAMES = /(?:constructor|prototype|__proto__|window|document|globalThis|global|self|this|eval|Function|fetch|XMLHttpRequest|import|export|class|new|return|while|for|do|switch|try|catch|throw)/i;

function normalizeMathSource(expression) {
    return toEnglishDigits(expression)
        .replace(/[−–—]/g, '-')
        .replace(/[×·⋅]/g, '*')
        .replace(/÷/g, '/')
        .replace(/π/gi, 'pi')
        .replace(/θ/gi, 'theta')
        .replace(/\^/g, '**')
        .trim();
}

function addImplicitMultiplication(source, variables) {
    let result = source;
    const variablePattern = variables.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    result = result.replace(new RegExp(`(\\d|\\))\\s*(${variablePattern}|pi|e)\\b`, 'gi'), '$1*$2');
    result = result.replace(/(\d|\))\s*(sin|cos|tan|asin|acos|atan|atan2|sqrt|abs|exp|log|ln|log10|floor|ceil|round|sinh|cosh|tanh|min|max|pow|sign)\b/gi, '$1*$2');
    result = result.replace(new RegExp(`\\b(${variablePattern}|pi|e)\\s*(\\d)`, 'gi'), '$1*$2');
    result = result.replace(/\)\s*\(/g, ')*(');
    result = result.replace(/(\d|\))\s*\(/g, '$1*(');
    variables.forEach((variable) => {
        const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(`\\b${escaped}\\s*\\(`, 'gi'), `${variable}*(`);
    });
    return result;
}

export function compileMathExpression(expression, variables = ['x']) {
    const normalizedVariables = [...new Set(variables.map((item) => String(item).trim()).filter(Boolean))];
    let safe = normalizeMathSource(expression);
    if (!safe || safe.length > 1000 || BLOCKED_NAMES.test(safe)) return null;
    if (/[^0-9A-Za-z_+\-*/().,\s]/.test(safe)) return null;

    safe = safe.replace(
        /\b(sin|cos|tan|asin|acos|atan|sqrt|abs|exp|log|ln|log10|floor|ceil|round|sinh|cosh|tanh|sign)\s+([A-Za-z0-9_.+-]+)/gi,
        '$1($2)'
    );
    safe = addImplicitMultiplication(safe, normalizedVariables);

    const identifiers = safe.match(/[A-Za-z_]\w*/g) || [];
    const allowedVariables = new Set(normalizedVariables);
    for (const identifier of identifiers) {
        const lower = identifier.toLowerCase();
        if (!allowedVariables.has(identifier) && !allowedVariables.has(lower)
            && !FUNCTION_NAMES.has(lower) && !CONSTANT_NAMES.has(lower)) {
            return null;
        }
    }

    const replacements = {
        sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
        asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan', atan2: 'Math.atan2',
        sqrt: 'Math.sqrt', abs: 'Math.abs', exp: 'Math.exp',
        log: 'Math.log10', log10: 'Math.log10', ln: 'Math.log',
        floor: 'Math.floor', ceil: 'Math.ceil', round: 'Math.round',
        sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh',
        min: 'Math.min', max: 'Math.max', pow: 'Math.pow', sign: 'Math.sign',
        pi: 'Math.PI', e: 'Math.E',
    };
    Object.entries(replacements).forEach(([name, replacement]) => {
        safe = safe.replace(new RegExp(`\\b${name}\\b`, 'gi'), replacement);
    });

    try {
        const evaluator = new Function(...normalizedVariables, `"use strict"; return (${safe});`);
        return (...args) => {
            try {
                const result = Number(evaluator(...args));
                return Number.isFinite(result) ? result : NaN;
            } catch (error) {
                return NaN;
            }
        };
    } catch (error) {
        return null;
    }
}

export function parseCoordinateData(text) {
    const x = [];
    const y = [];
    const labels = [];
    String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line, index) => {
        const cleaned = toEnglishDigits(line);
        const pieces = cleaned.split(/[,;:\t]/).map((item) => item.trim()).filter(Boolean);
        const numbers = cleaned.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) || [];
        if (numbers.length >= 2) {
            x.push(numbers[0]);
            y.push(numbers[1]);
            labels.push(pieces.length > 2 ? pieces.slice(2).join(' ') : String(index + 1));
        } else if (numbers.length === 1) {
            x.push(index + 1);
            y.push(numbers[0]);
            labels.push(pieces.length > 1 ? pieces[0] : String(index + 1));
        }
    });
    return { x, y, labels };
}

export function parseCategoryData(text) {
    const labels = [];
    const values = [];
    String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line, index) => {
        const pieces = toEnglishDigits(line).split(/[,;:\t]/).map((item) => item.trim());
        const rawValue = pieces.pop();
        const value = Number(rawValue);
        if (Number.isFinite(value)) {
            labels.push((pieces.join(' ') || String(index + 1)).slice(0, 120));
            values.push(value);
        }
    });
    return { labels, values };
}

export function parseNumberList(text) {
    return (toEnglishDigits(text).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || [])
        .map(Number)
        .filter(Number.isFinite)
        .slice(0, 10000);
}

export function niceNumber(value, round = false) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const exponent = Math.floor(Math.log10(value));
    const fraction = value / (10 ** exponent);
    let niceFraction;
    if (round) {
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3) niceFraction = 2;
        else if (fraction < 7) niceFraction = 5;
        else niceFraction = 10;
    } else if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * (10 ** exponent);
}

export function makeTicks(minimum, maximum, requested = 10) {
    const min = Number(minimum);
    const max = Number(maximum);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
    const count = Math.max(2, Math.min(20, Number(requested) || 10));
    const range = niceNumber(max - min, false);
    const step = niceNumber(range / (count - 1), true);
    const start = Math.ceil(min / step) * step;
    const ticks = [];
    for (let value = start, guard = 0; value <= max + step * 1e-9 && guard < 100; value += step, guard += 1) {
        const clean = Math.abs(value) < step * 1e-9 ? 0 : Number(value.toPrecision(12));
        ticks.push(clean);
    }
    return ticks;
}

export function formatTick(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const absolute = Math.abs(number);
    if ((absolute >= 100000 || (absolute > 0 && absolute < 0.001))) return number.toExponential(2);
    return String(Number(number.toFixed(6)));
}

export function quantile(sortedValues, probability) {
    if (!sortedValues.length) return NaN;
    const position = (sortedValues.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sortedValues[lower];
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

export function linearRegression(xValues, yValues) {
    const count = Math.min(xValues.length, yValues.length);
    if (count < 2) return null;
    let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    for (let index = 0; index < count; index += 1) {
        const x = Number(xValues[index]);
        const y = Number(yValues[index]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        sumX += x; sumY += y; sumXX += x * x; sumXY += x * y;
    }
    const denominator = count * sumXX - sumX * sumX;
    if (Math.abs(denominator) < 1e-12) return null;
    const slope = (count * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / count;
    return { slope, intercept };
}

export function svgPathFromPoints(points, context, options = {}) {
    const breakDistance = Number(options.breakDistance) || Infinity;
    let path = '';
    let drawing = false;
    let previous = null;
    points.forEach((point) => {
        const x = Number(point?.[0]);
        const y = Number(point?.[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !context.inExtendedBounds(x, y)) {
            drawing = false;
            previous = null;
            return;
        }
        const screenX = context.sx(x);
        const screenY = context.sy(y);
        if (previous && Math.hypot(screenX - previous[0], screenY - previous[1]) > breakDistance) {
            drawing = false;
        }
        path += `${drawing ? 'L' : 'M'}${screenX.toFixed(2)},${screenY.toFixed(2)} `;
        drawing = true;
        previous = [screenX, screenY];
    });
    return path.trim();
}

export function uniqueId(prefix = 'qmx') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
