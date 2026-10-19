import {
    compileMathExpression,
    toEnglishDigits,
} from './graph-utils.js';

export const TEXTBOOK_INPUT_ENGINE_VERSION = '2.1.0';

const GRAPH_VARIABLES = new Set(['x', 'y', 'z', 't']);
const FUNCTION_NAMES = new Set([
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'sqrt', 'abs', 'exp', 'log', 'ln', 'floor', 'ceil',
    'sinh', 'cosh', 'tanh', 'min', 'max', 'arg',
]);
const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2'];

function unique(values) {
    return [...new Set(values)];
}

function numberText(value, digits = 7) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const scale = 10 ** digits;
    const rounded = Math.round(number * scale) / scale;
    return String(Object.is(rounded, -0) ? 0 : rounded);
}

function convertSuperscriptRuns(value) {
    const map = {
        '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
        '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
        '⁻': '-', '⁺': '+',
    };
    return String(value || '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (run) => (
        `^${[...run].map((character) => map[character] || '').join('')}`
    ));
}

function convertSubscriptRuns(value) {
    const map = {
        '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
        '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    };
    return String(value || '').replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (run) => (
        `_${[...run].map((character) => map[character] || '').join('')}`
    ));
}

function replaceLatexFractions(value) {
    let result = String(value || '');
    for (let index = 0; index < 12; index += 1) {
        const next = result.replace(
            /\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
            '(($1)/(($2)))',
        );
        if (next === result) break;
        result = next;
    }
    return result;
}

function replaceLatexRoots(value) {
    let result = String(value || '');
    for (let index = 0; index < 8; index += 1) {
        const next = result
            .replace(/\\sqrt\s*\[2\]\s*\{([^{}]+)\}/g, 'sqrt($1)')
            .replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)');
        if (next === result) break;
        result = next;
    }
    return result;
}

function unwrapLatexNames(value) {
    let result = String(value || '');
    for (let index = 0; index < 8; index += 1) {
        const next = result
            .replace(/\\(?:mathrm|mathbf|mathit|operatorname|text)\s*\{([^{}]+)\}/g, '$1')
            .replace(/\\(?:vec|overrightarrow|overline)\s*\{([^{}]+)\}/g, '$1')
            .replace(/\\hat\s*\{([ijk])\}/g, '$1');
        if (next === result) break;
        result = next;
    }
    return result;
}

function convertInverseTrig(value) {
    let result = String(value || '');
    const names = [
        ['sin', 'asin'],
        ['cos', 'acos'],
        ['tan', 'atan'],
    ];
    names.forEach(([source, target]) => {
        const patterns = [
            new RegExp(`\\\\?${source}\\s*\\^\\s*\\(?-1\\)?\\s*\\(([^()]+)\\)`, 'gi'),
            new RegExp(`\\\\?${source}\\s*\\^\\s*\\(?-1\\)?\\s*([A-Za-z0-9_]+)`, 'gi'),
        ];
        result = result.replace(patterns[0], `${target}($1)`);
        result = result.replace(patterns[1], `${target}($1)`);
    });
    return result;
}

function convertAbsoluteBars(value) {
    let result = String(value || '');
    for (let index = 0; index < 6; index += 1) {
        const next = result.replace(/\|([^|\n]{1,240})\|/g, 'abs($1)');
        if (next === result) break;
        result = next;
    }
    return result;
}

export function normalizeTextbookMathText(value) {
    let result = toEnglishDigits(String(value || ''))
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u20D7\u0302]/g, '')
        .replace(/\\left|\\right/g, '')
        .replace(/\\,/g, ' ')
        .replace(/\\!/g, '')
        .replace(/\\;/g, ' ')
        .replace(/\\quad|\\qquad/g, ' ')
        .replace(/\\cdot|\\times/g, '*')
        .replace(/\\div/g, '/')
        .replace(/\\leqslant|\\leq/g, '<=')
        .replace(/\\geqslant|\\geq/g, '>=')
        .replace(/\\neq/g, '!=')
        .replace(/\\equiv/g, '=')
        .replace(/[≤≦]/g, '<=')
        .replace(/[≥≧]/g, '>=')
        .replace(/[≠]/g, '!=')
        .replace(/[≡]/g, '=')
        .replace(/[−–—]/g, '-')
        .replace(/[×·⋅]/g, '*')
        .replace(/÷/g, '/')
        .replace(/[→⃗]/g, '')
        .replace(/\\pi|π/g, 'pi')
        .replace(/\\alpha|α/g, 'alpha')
        .replace(/\\beta|β/g, 'beta')
        .replace(/\\gamma|γ/g, 'gamma')
        .replace(/\\theta|θ/g, 'theta')
        .replace(/\\lambda|λ/g, 'lambda')
        .replace(/\\mu|μ/g, 'mu')
        .replace(/\\Delta|Δ/g, 'Delta')
        .replace(/\\Sigma|Σ/g, 'Sigma')
        .replace(/\\sin\b/g, 'sin')
        .replace(/\\cos\b/g, 'cos')
        .replace(/\\tan\b/g, 'tan')
        .replace(/\\log\b/g, 'log')
        .replace(/\\ln\b/g, 'ln')
        .replace(/\\exp\b/g, 'exp');

    result = unwrapLatexNames(result);
    result = replaceLatexFractions(result);
    result = replaceLatexRoots(result);
    result = convertSuperscriptRuns(result);
    result = convertSubscriptRuns(result);
    result = convertInverseTrig(result);
    result = convertAbsoluteBars(result);

    result = result
        .replace(/(\d+(?:\.\d+)?)\s*°/g, '(($1)*pi/180)')
        .replace(/[{}]/g, (token) => token === '{' ? '(' : ')')
        .replace(/\s+/g, ' ')
        .trim();

    return result;
}

export function textbookCompilerExpression(value) {
    let normalized = splitImplicitLetterProducts(normalizeTextbookMathText(value))
        .replace(/([A-Za-z0-9_)])\s+(?=(?:sin|cos|tan|asin|acos|atan|sqrt|abs|log|ln|exp)\b)/gi, '$1*')
        .replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|abs|log|ln|exp)\s+((?:[-+]?\d+(?:\.\d+)?\s*)?[A-Za-z][A-Za-z0-9_]*(?:\s*\^\s*[-+]?\d+)?)/gi, '$1($2)');

    let result = normalized
        .replace(/\s+/g, '')
        .replace(/(\d|\))(?=[A-Za-z(])/g, '$1*')
        .replace(/([A-Za-z_][A-Za-z0-9_]*)(?=\()/g, '$1')
        .replace(/(\))(?=\d|[A-Za-z])/g, '$1*');

    [
        'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
        'sqrt', 'abs', 'exp', 'log', 'ln', 'floor', 'ceil',
        'sinh', 'cosh', 'tanh', 'arg',
    ].forEach((name) => {
        const broken = name.split('').join('\\*');
        result = result.replace(new RegExp(`${broken}\\*?\\(`, 'g'), `${name}(`);
    });

    result = result
        .replace(/p\*i/g, 'pi')
        .replace(/a\*l\*p\*h\*a/g, 'alpha')
        .replace(/b\*e\*t\*a/g, 'beta')
        .replace(/g\*a\*m\*m\*a/g, 'gamma')
        .replace(/t\*h\*e\*t\*a/g, 'theta')
        .replace(/l\*a\*m\*b\*d\*a/g, 'lambda');

    return result;
}

function splitImplicitLetterProducts(value) {
    const preserved = new Set([
        ...FUNCTION_NAMES,
        'pi', 'alpha', 'beta', 'gamma', 'theta', 'lambda', 'mu',
        'Delta', 'Sigma', 'Re', 'Im',
    ]);
    return String(value || '').replace(/\b[A-Za-z]{2,}\b/g, (token) => (
        preserved.has(token) || preserved.has(token.toLowerCase())
            ? token
            : token.split('').join('*')
    ));
}

function safeNumericExpression(value) {
    const source = textbookCompilerExpression(value);
    if (!source || /[^0-9+\-*/().pi]/i.test(source)) return NaN;
    const replaced = source.replace(/\bpi\b/g, String(Math.PI));
    try {
        // Arithmetic only after the strict character whitelist above.
        const output = Function(`"use strict"; return (${replaced});`)();
        return Number.isFinite(Number(output)) ? Number(output) : NaN;
    } catch {
        return NaN;
    }
}

export function extractTextbookStatements(source) {
    const sourceWithBreaks = String(source || '').replace(/\r?\n/g, ' __QMX_LINE_BREAK__ ');
    const normalized = normalizeTextbookMathText(sourceWithBreaks)
        .replace(/__QMX_LINE_BREAK__/g, '\n')
        .replace(/\\\(|\\\)|\\\[|\\\]|\$+/g, '\n')
        .replace(/,\s*(?=[A-Za-z][A-Za-z0-9_]*\s*(?:<=|>=|!=|=|<|>))/g, '\n')
        .replace(/\b(?:and|AND)\b/g, '\n')
        .replace(/(?:এবং|ও)\s+(?=[A-Za-z0-9_(])/g, '\n');

    const fragments = normalized.split(/[\n;।]+/).map((item) => item.trim()).filter(Boolean);
    const statements = [];
    const relationPattern = /(?:[-+]?\d+(?:\.\d+)?|[A-Za-z][A-Za-z0-9_]*|\([^()\n]{1,180}\))[\sA-Za-z0-9_().,[\]|^+\-*/]*?(?:<=|>=|!=|=|<|>)[\sA-Za-z0-9_().,[\]|^+\-*/]+/g;

    const add = (value) => {
        let candidate = String(value || '')
            .replace(/^[,.:]+|[,.:\s]+$/g, '')
            .trim();
        if (!candidate || !/(?:<=|>=|!=|=|<|>)/.test(candidate)) return;

        // Strip a textbook label such as S=...=0 without discarding the equation.
        const label = candidate.match(/^[A-Za-z][A-Za-z0-9_]*\s*=\s*(.+(?:<=|>=|!=|=|<|>).+)$/);
        if (label) candidate = label[1].trim();

        if (candidate.length > 1200) candidate = candidate.slice(0, 1200);
        if (!statements.includes(candidate)) statements.push(candidate);
    };

    fragments.forEach((fragment) => {
        const matches = [...fragment.matchAll(relationPattern)];
        if (matches.length) matches.forEach((match) => add(match[0]));
        else if (/(?:<=|>=|!=|=|<|>)/.test(fragment)) add(fragment);
    });

    return statements.slice(0, 30);
}

function parseComplexLiteral(value) {
    let source = normalizeTextbookMathText(value)
        .replace(/\s+/g, '')
        .replace(/^\((.*)\)$/, '$1')
        .replace(/\*/g, '');

    if (!source) return null;
    if (!source.includes('i')) {
        const real = Number(source);
        return Number.isFinite(real) ? { re: real, im: 0 } : null;
    }

    if (!source.endsWith('i')) return null;
    source = source.slice(0, -1);

    let split = -1;
    for (let index = 1; index < source.length; index += 1) {
        if (source[index] === '+' || source[index] === '-') split = index;
    }

    let realText = '0';
    let imaginaryText = source;
    if (split > 0) {
        realText = source.slice(0, split);
        imaginaryText = source.slice(split);
    }

    const real = Number(realText);
    let imaginary;
    if (imaginaryText === '' || imaginaryText === '+') imaginary = 1;
    else if (imaginaryText === '-') imaginary = -1;
    else imaginary = Number(imaginaryText);

    return Number.isFinite(real) && Number.isFinite(imaginary)
        ? { re: real, im: imaginary }
        : null;
}

export function extractTextbookAssignments(source) {
    const normalized = normalizeTextbookMathText(source);
    const assignments = {};
    const complexAssignments = {};

    for (const match of normalized.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s*=\s*(\(?[-+]?\d+(?:\.\d+)?(?:\s*[+\-]\s*\d*(?:\.\d+)?i)?\)?)/g)) {
        const name = match[1];
        if (GRAPH_VARIABLES.has(name) || ['s', 'v', 'P', 'V', 'F', 'E'].includes(name)) continue;

        const complex = parseComplexLiteral(match[2]);
        if (complex && Math.abs(complex.im) > 0) {
            complexAssignments[name] = complex;
            continue;
        }

        const numeric = safeNumericExpression(match[2]);
        if (Number.isFinite(numeric)) assignments[name] = numeric;
    }

    for (const match of normalized.matchAll(/\b(alpha|beta|gamma|theta|lambda|mu|a|b|c|h|k|m|n|p|q|r|u)\s*=\s*([^,;।\n]+)/g)) {
        const numeric = safeNumericExpression(match[2]);
        if (Number.isFinite(numeric)) assignments[match[1]] = numeric;
    }

    return { numeric: assignments, complex: complexAssignments };
}

export function applyTextbookConstants(value, source = '') {
    let result = splitImplicitLetterProducts(normalizeTextbookMathText(value));
    const assignments = extractTextbookAssignments(source).numeric;

    Object.keys(assignments)
        .sort((left, right) => right.length - left.length)
        .forEach((name) => {
            result = result.replace(
                new RegExp(`(^|[^A-Za-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Za-z0-9_])`, 'g'),
                `$1(${numberText(assignments[name], 10)})`,
            );
        });

    return result;
}

export function parseTextbookIntent(source) {
    const text = String(source || '');
    const strictCount = (text.match(/<|>/g) || []).length;
    const inclusiveCount = (text.match(/≤|≥|<=|>=/g) || []).length;

    return {
        drawGraph: /লেখচিত্র|গ্রাফ|graph|অঙ্কন কর|আঁক/i.test(text),
        intercepts: /অক্ষ.*ছেদ|ছেদ.*অক্ষ|intercept/i.test(text),
        intersection: /ছেদবিন্দু|intersection/i.test(text),
        tangent: /স্পর্শক|tangent/i.test(text),
        normal: /অভিলম্ব|normal/i.test(text),
        focus: /উপকেন্দ্র|focus/i.test(text),
        directrix: /নিয়ামক|নিয়ামক|directrix/i.test(text),
        asymptote: /অসীমতট|asymptote/i.test(text),
        vertex: /শীর্ষবিন্দু|vertex/i.test(text),
        center: /কেন্দ্র|center/i.test(text),
        radius: /ব্যাসার্ধ|radius/i.test(text),
        boundedRegion: /আবদ্ধ অঞ্চল|সাধারণ অঞ্চল|feasible region|common region/i.test(text),
        shade: /ছায়া|ছায়া|shade|অঞ্চল দেখাও/i.test(text),
        area: /ক্ষেত্রফল|area/i.test(text),
        extrema: /সর্বোচ্চ|সর্বনিম্ন|maxim|minim/i.test(text),
        locus: /সঞ্চারপথ|locus/i.test(text),
        argand: /আরগ্যান্ড|argand|জটিল সমতল/i.test(text),
        resultant: /লব্ধি|resultant/i.test(text),
        component: /উপাংশ|component/i.test(text),
        strictCount,
        inclusiveCount,
    };
}

function canonicalRelation(statement, source) {
    const substituted = applyTextbookConstants(statement, source);
    const pieces = substituted.split(/(<=|>=|<|>)/);
    if (pieces.length < 3) return '';

    return pieces.map((piece, index) => (
        index % 2
            ? piece
            : textbookCompilerExpression(piece)
    )).join('');
}

function relationRange(statements) {
    const values = statements
        .flatMap((statement) => normalizeTextbookMathText(statement).match(/-?\d+(?:\.\d+)?/g) || [])
        .map(Number)
        .filter(Number.isFinite);
    const extent = values.length ? Math.max(6, Math.min(100, Math.max(...values.map(Math.abs)) + 4)) : 10;
    return { xMin: -extent, xMax: extent, yMin: -extent, yMax: extent };
}

function recognizeInequality(source, statements) {
    const normalizedSource = normalizeTextbookMathText(source);
    const intervalRelations = [];
    for (const match of normalizedSource.matchAll(/\b([xy])\s*∈\s*([[(])\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*([\])])/g)) {
        const variable = match[1];
        const lowerOperator = match[2] === '[' ? '<=' : '<';
        const upperOperator = match[5] === ']' ? '<=' : '<';
        intervalRelations.push(`${match[3]} ${lowerOperator} ${variable} ${upperOperator} ${match[4]}`);
    }

    const relations = [
        ...statements.filter((statement) => /(?:<=|>=|<|>)/.test(statement)),
        ...intervalRelations,
    ];
    if (!relations.length) return null;

    const canonical = relations
        .map((statement) => canonicalRelation(statement, source))
        .filter((statement) => /[xy]/i.test(statement) && /(?:<=|>=|<|>)/.test(statement));

    if (!canonical.length) return null;

    const variables = unique(canonical.flatMap((item) => item.match(/\b[xy]\b/g) || []));
    const oneDimensional = variables.length === 1;
    const intent = parseTextbookIntent(source);
    const range = relationRange(relations);
    const featureList = [
        canonical.length > 1 ? `${canonical.length}টি inequality-এর common region` : 'inequality region',
    ];
    if (intent.strictCount) featureList.push('strict boundary dashed');
    if (intent.inclusiveCount) featureList.push('inclusive boundary solid');

    return {
        family: oneDimensional ? 'one-variable-inequality' : 'inequality-region',
        familyLabel: oneDimensional ? 'এক চলকের অসমতা' : 'অসমতা ও আবদ্ধ অঞ্চল',
        confidence: canonical.length > 1 ? 0.995 : 0.97,
        equation: relations.join(' ; '),
        instruction: intent,
        features: featureList,
        spec: {
            type: 'region',
            title: oneDimensional ? 'Inequality interval' : 'Common inequality region',
            expression: `Textbook region | ${canonical.join(' && ')} | #2563eb | opacity=0.24`,
            ...range,
            ...(oneDimensional ? { yMin: -2, yMax: 2 } : {}),
            aspectLock: !oneDimensional,
            sourceEquation: relations.join(' ; '),
            recognitionFamily: oneDimensional ? 'one-variable-inequality' : 'inequality-region',
            textbookInputVersion: TEXTBOOK_INPUT_ENGINE_VERSION,
        },
    };
}

function identifiers(expression) {
    return unique(
        (String(expression || '').match(/[A-Za-z][A-Za-z0-9_]*/g) || [])
            .filter((name) => !FUNCTION_NAMES.has(name) && !['pi', 'e'].includes(name)),
    );
}

function replaceIndependentVariable(expression, variable) {
    if (variable === 'x') return expression;
    return expression.replace(
        new RegExp(`(^|[^A-Za-z0-9_])${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Za-z0-9_])`, 'g'),
        '$1x',
    );
}

function inverseTrigRange(expressions) {
    if (expressions.some((value) => /\b(?:asin|acos)\s*\(/.test(value))) {
        return { xMin: -1.2, xMax: 1.2, yMin: -2, yMax: 3.5 };
    }
    if (expressions.some((value) => /\batan\s*\(/.test(value))) {
        return { xMin: -10, xMax: 10, yMin: -2, yMax: 2 };
    }
    return { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
}

function recognizeExplicitRelations(source, statements) {
    const assignments = extractTextbookAssignments(source).numeric;
    const candidates = [];

    statements.forEach((statement, index) => {
        if (/(?:<=|>=|!=|<|>)/.test(statement)) return;
        const prepared = applyTextbookConstants(statement, source);
        const equalIndex = prepared.indexOf('=');
        if (equalIndex < 1) return;

        let left = prepared.slice(0, equalIndex).trim();
        const right = prepared.slice(equalIndex + 1).trim();
        const functionLeft = left.match(/^([A-Za-z][A-Za-z0-9_]*)\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)$/);
        let dependent = left;
        let declaredIndependent = '';

        if (functionLeft) {
            dependent = functionLeft[1];
            declaredIndependent = functionLeft[2];
        } else if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(left)) {
            return;
        }

        if (Object.prototype.hasOwnProperty.call(assignments, dependent)) return;

        let expression = textbookCompilerExpression(right);
        const names = identifiers(expression)
            .filter((name) => !Object.prototype.hasOwnProperty.call(assignments, name));
        const independent = declaredIndependent || names[0] || '';

        if (!independent || names.some((name) => name !== independent)) return;
        expression = replaceIndependentVariable(expression, independent);
        if (!compileMathExpression(expression, ['x'])) return;

        candidates.push({
            dependent,
            independent,
            expression,
            label: normalizeTextbookMathText(statement).slice(0, 120),
            color: COLORS[index % COLORS.length],
        });
    });

    if (!candidates.length) return null;
    const primaryIndependent = candidates[0].independent;
    const compatible = candidates.filter((item) => item.independent === primaryIndependent);
    if (!compatible.length) return null;

    const expressions = compatible.map((item) => item.expression);
    const range = inverseTrigRange(expressions);
    const isCoordinateFunction = compatible.every((item) => item.dependent === 'y' && item.independent === 'x');

    return {
        family: compatible.length > 1 ? 'multiple-functions' : (isCoordinateFunction ? 'function' : 'scientific-relation'),
        familyLabel: compatible.length > 1 ? 'একাধিক ফাংশনের লেখচিত্র' : (isCoordinateFunction ? 'ফাংশনের লেখচিত্র' : 'চলকসমূহের সম্পর্ক'),
        confidence: compatible.length > 1 ? 0.965 : (isCoordinateFunction ? 0.9 : 0.91),
        equation: compatible.map((item) => item.label).join(' ; '),
        instruction: parseTextbookIntent(source),
        features: [
            `${compatible.length}টি curve`,
            `${primaryIndependent} → x-axis`,
            `${compatible[0].dependent} → y-axis`,
        ],
        spec: {
            type: 'function',
            title: compatible.length > 1 ? 'Functions on the same axes' : compatible[0].label,
            expression: compatible[0].expression,
            series: compatible.map((item) => ({
                label: item.label,
                expression: item.expression,
                color: item.color,
            })),
            xLabel: primaryIndependent,
            yLabel: compatible.length === 1 ? compatible[0].dependent : 'value',
            ...range,
            sourceEquation: compatible.map((item) => item.label).join(' ; '),
            recognitionFamily: compatible.length > 1 ? 'multiple-functions' : 'textbook-function',
            textbookInputVersion: TEXTBOOK_INPUT_ENGINE_VERSION,
        },
    };
}

function calculusXValues(source) {
    const normalized = normalizeTextbookMathText(source);
    const values = [];
    for (const match of normalized.matchAll(/\bx\s*=\s*(-?\d+(?:\.\d+)?)/g)) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && !values.includes(value)) values.push(value);
    }
    if (!values.length) {
        const point = normalized.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*-?\d+(?:\.\d+)?\s*\)/);
        if (point) values.push(Number(point[1]));
    }
    const interval = normalized.match(/(-?\d+(?:\.\d+)?)\s*(?:থেকে|হতে|to)\s*(-?\d+(?:\.\d+)?)/i);
    if (interval) {
        const first = Number(interval[1]);
        const second = Number(interval[2]);
        if (Number.isFinite(first) && !values.includes(first)) values.push(first);
        if (Number.isFinite(second) && !values.includes(second)) values.push(second);
    }
    return values;
}

function recognizeCalculus(source, explicit) {
    if (!explicit?.spec?.series?.length) return null;
    const intent = parseTextbookIntent(source);
    if (!intent.tangent && !intent.normal && !intent.area && !intent.extrema) return null;

    const primary = explicit.spec.series[0];
    const xValues = calculusXValues(source);
    const operations = [];
    if (intent.tangent && Number.isFinite(xValues[0])) {
        operations.push(`tangent | f | x=${numberText(xValues[0])} | #dc2626`);
    }
    if (intent.normal && Number.isFinite(xValues[0])) {
        operations.push(`normal | f | x=${numberText(xValues[0])} | #16a34a`);
    }
    if (intent.area && xValues.length >= 2) {
        const from = Math.min(xValues[0], xValues[1]);
        const to = Math.max(xValues[0], xValues[1]);
        operations.push(`area | f | from=${numberText(from)}, to=${numberText(to)}, baseline=0, mode=absolute | #60a5fa | opacity=0.24`);
    }
    if (intent.extrema) {
        operations.push('markers | f | intercepts, extrema, stationary');
    }
    if (!operations.length) return null;

    const rangeValues = xValues.length ? xValues : [-4, 4];
    const minimum = Math.min(...rangeValues);
    const maximum = Math.max(...rangeValues);
    const pad = Math.max(3, (maximum - minimum) * 0.8 || 4);
    return {
        family: 'calculus-construction',
        familyLabel: 'ক্যালকুলাস লেখচিত্র',
        confidence: 0.998,
        equation: explicit.equation,
        instruction: intent,
        features: [
            intent.tangent ? 'স্পর্শক' : '',
            intent.normal ? 'অভিলম্ব' : '',
            intent.area ? 'আবদ্ধ ক্ষেত্র' : '',
            intent.extrema ? 'সর্বোচ্চ/সর্বনিম্ন বিন্দু' : '',
        ].filter(Boolean),
        spec: {
            type: 'calculus',
            title: 'Textbook calculus graph',
            expression: [
                `curve | f | ${primary.expression} | #2563eb`,
                ...operations,
            ].join('\n'),
            xMin: minimum - pad,
            xMax: maximum + pad,
            yMin: explicit.spec.yMin ?? -10,
            yMax: explicit.spec.yMax ?? 10,
            xLabel: explicit.spec.xLabel || 'x',
            yLabel: explicit.spec.yLabel || 'y',
            sourceEquation: explicit.equation,
            recognitionFamily: 'calculus-construction',
            textbookInputVersion: TEXTBOOK_INPUT_ENGINE_VERSION,
        },
    };
}

function vectorComponents(value, sourceContext = '') {
    const source = applyTextbookConstants(value, sourceContext)
        .replace(/\s+/g, '')
        .replace(/\*/g, '');
    if (!source || /[()]/.test(source) || /(?:sin|cos|tan|sqrt|abs|log|ln|exp)/i.test(source)) return null;

    const termPattern = /([+\-]?(?:\d+(?:\.\d+)?)?)\s*([ijk])/g;
    const components = { i: 0, j: 0, k: 0 };
    let found = 0;

    for (const match of source.matchAll(termPattern)) {
        let coefficient = match[1];
        if (coefficient === '' || coefficient === '+') coefficient = '1';
        if (coefficient === '-') coefficient = '-1';
        const number = Number(coefficient);
        if (!Number.isFinite(number)) return null;
        components[match[2]] += number;
        found += 1;
    }

    const remainder = source.replace(termPattern, '').replace(/[+\-]/g, '');
    return found && !remainder ? components : null;
}

function recognizeVector(source, statements) {
    for (const statement of statements) {
        if (/(?:<=|>=|!=|<|>)/.test(statement)) continue;
        const equalIndex = statement.indexOf('=');
        if (equalIndex < 1) continue;

        const label = normalizeTextbookMathText(statement.slice(0, equalIndex))
            .replace(/[^A-Za-z0-9_]/g, '')
            .slice(0, 24) || 'v';
        if (/^z(?:_\d+)?$/i.test(label)) continue;

        const components = vectorComponents(statement.slice(equalIndex + 1), source);
        if (!components) continue;
        const { i: x, j: y, k: z } = components;
        const extent = Math.max(5, Math.ceil(Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) + 2));

        if (Math.abs(z) > 1e-10) {
            return {
                family: 'vector3d',
                familyLabel: 'ত্রিমাত্রিক ভেক্টর',
                confidence: 0.985,
                equation: statement,
                instruction: parseTextbookIntent(source),
                features: [`উপাংশ (${numberText(x)}, ${numberText(y)}, ${numberText(z)})`],
                spec: {
                    type: 'space3d',
                    title: `Vector ${label}`,
                    expression: [
                        `point3d | A | ${numberText(x)},${numberText(y)},${numberText(z)} | #dc2626`,
                        `vector3d | ${label} | from=0,0,0; to=A | #2563eb`,
                    ].join('\n'),
                    xMin: -extent, xMax: extent,
                    yMin: -extent, yMax: extent,
                    zMin: -extent, zMax: extent,
                    autoZRange: false,
                    xLabel: 'i', yLabel: 'j', zLabel: 'k',
                    sourceEquation: statement,
                    recognitionFamily: 'vector3d',
                    textbookInputVersion: TEXTBOOK_INPUT_ENGINE_VERSION,
                },
            };
        }

        return {
            family: 'vector',
            familyLabel: 'ভেক্টর',
            confidence: 0.98,
            equation: statement,
            instruction: parseTextbookIntent(source),
            features: [`উপাংশ (${numberText(x)}, ${numberText(y)})`],
            spec: {
                type: 'geometry',
                title: `Vector ${label}`,
                expression: [
                    'point | O | x=0, y=0 | locked | #0f172a',
                    `point | A | x=${numberText(x)}, y=${numberText(y)} | locked | #dc2626`,
                    `ray | ${label} | O | A | #2563eb`,
                    'measure | magnitude | distance | O | A',
                ].join('\n'),
                xMin: -extent, xMax: extent,
                yMin: -extent, yMax: extent,
                aspectLock: true,
                xLabel: 'i', yLabel: 'j',
                sourceEquation: statement,
                recognitionFamily: 'vector',
                textbookInputVersion: TEXTBOOK_INPUT_ENGINE_VERSION,
            },
        };
    }

    return null;
}

function complexPointSpec(label, value, sourceEquation) {
    const extent = Math.max(5, Math.ceil(Math.max(Math.abs(value.re), Math.abs(value.im)) + 2));
    return {
        type: 'geometry',
        title: `Argand point ${label}`,
        expression: [
            'point | O | x=0, y=0 | locked | #0f172a',
            `point | ${label} | x=${numberText(value.re)}, y=${numberText(value.im)} | locked | #dc2626`,
            `segment | O${label} | O | ${label} | #2563eb`,
        ].join('\n'),
        xMin: -extent, xMax: extent,
        yMin: -extent, yMax: extent,
        aspectLock: true,
        xLabel: 'Re(z)', yLabel: 'Im(z)',
        sourceEquation,
        recognitionFamily: 'argand-point',
        textbookInputVersion: TEXTBOOK_INPUT_ENGINE_VERSION,
    };
}

function resolveComplex(value, assignments) {
    const normalized = normalizeTextbookMathText(value).replace(/^\((.*)\)$/, '$1').trim();
    return assignments[normalized] || parseComplexLiteral(normalized);
}

function recognizeArgand(source, statements) {
    const assignments = extractTextbookAssignments(source).complex;
    const normalizedSource = normalizeTextbookMathText(source).replace(/\s+/g, '');

    const locusCircle = normalizedSource.match(/abs\(z-([^)]+|\([^)]+\))\)=([A-Za-z0-9_.()+\-*/]+)/i);
    if (locusCircle) {
        const center = resolveComplex(locusCircle[1], assignments);
        const radius = safeNumericExpression(locusCircle[2]);
        if (center && radius > 0) {
            return {
                family: 'argand-circle-locus',
                familyLabel: 'জটিল সংখ্যার বৃত্তাকার সঞ্চারপথ',
                confidence: 0.997,
                equation: locusCircle[0],
                instruction: parseTextbookIntent(source),
                features: [
                    `কেন্দ্র (${numberText(center.re)}, ${numberText(center.im)})`,
                    `ব্যাসার্ধ ${numberText(radius)}`,
                ],
                spec: {
                    type: 'circle',
                    title: 'Argand locus',
                    params: { h: center.re, k: center.im, radius },
                    xMin: center.re - radius * 1.35,
                    xMax: center.re + radius * 1.35,
                    yMin: center.im - radius * 1.35,
                    yMax: center.im + radius * 1.35,
                    aspectLock: true,
                    xLabel: 'Re(z)', yLabel: 'Im(z)',
                    sourceEquation: locusCircle[0],
                    recognitionFamily: 'argand-circle-locus',
                    textbookInputVersion: TEXTBOOK_INPUT_ENGINE_VERSION,
                },
            };
        }
    }

    for (const statement of statements) {
        const match = normalizeTextbookMathText(statement)
            .replace(/\s+/g, '')
            .match(/^(z(?:_\d+)?)=(.+)$/i);
        if (!match) continue;
        const value = resolveComplex(match[2], assignments);
        if (!value) continue;
        const label = match[1].toUpperCase().replace('_', '');
        return {
            family: 'argand-point',
            familyLabel: 'আরগ্যান্ড সমতলে জটিল সংখ্যা',
            confidence: 0.99,
            equation: statement,
            instruction: parseTextbookIntent(source),
            features: [`(${numberText(value.re)}, ${numberText(value.im)})`],
            spec: complexPointSpec(label, value, statement),
        };
    }

    return null;
}

export function recognizeTextbookGraphCandidates(source) {
    const statements = extractTextbookStatements(source);
    const attempts = [];

    const inequality = recognizeInequality(source, statements);
    if (inequality) attempts.push(inequality);

    const argand = recognizeArgand(source, statements);
    if (argand) attempts.push(argand);

    const vector = recognizeVector(source, statements);
    if (vector) attempts.push(vector);

    const explicit = recognizeExplicitRelations(source, statements);
    if (explicit) {
        const calculus = recognizeCalculus(source, explicit);
        if (calculus) attempts.push(calculus);
        attempts.push(explicit);
    }

    return attempts;
}
