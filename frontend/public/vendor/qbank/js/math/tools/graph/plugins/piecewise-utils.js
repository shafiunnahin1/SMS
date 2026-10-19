import {
    compileMathExpression,
    toEnglishDigits,
} from '../graph-utils.js';

function cleanDomainSource(value) {
    return toEnglishDigits(String(value ?? ''))
        .replace(/[−–—]/g, '-')
        .replace(/[≤]/g, '<=')
        .replace(/[≥]/g, '>=')
        .replace(/[∞]/g, 'inf')
        .replace(/^\s*(?:domain|where)\s*=\s*/i, '')
        .replace(/^\s*(?:if|when)\s+/i, '')
        .replace(/^\s*x\s*(?:in|∈)\s*/i, '')
        .trim();
}

function finiteBound(value) {
    const raw = String(value ?? '').trim();
    if (/^\+?(?:inf|infinity)$/i.test(raw)) return Number.POSITIVE_INFINITY;
    if (/^-(?:inf|infinity)$/i.test(raw)) return Number.NEGATIVE_INFINITY;
    const evaluator = compileMathExpression(raw, ['x']);
    if (!evaluator) return NaN;
    return Number(evaluator(0));
}

function emptyDomain(source = '') {
    return {
        source,
        valid: true,
        min: Number.NEGATIVE_INFINITY,
        max: Number.POSITIVE_INFINITY,
        minInclusive: false,
        maxInclusive: false,
        error: '',
    };
}

function invalidDomain(source, error) {
    return {
        ...emptyDomain(source),
        valid: false,
        error: String(error || 'Domain বোঝা যায়নি।'),
    };
}

function tightenMinimum(domain, value, inclusive) {
    if (value > domain.min) {
        domain.min = value;
        domain.minInclusive = inclusive;
    } else if (value === domain.min) {
        domain.minInclusive = domain.minInclusive && inclusive;
    }
}

function tightenMaximum(domain, value, inclusive) {
    if (value < domain.max) {
        domain.max = value;
        domain.maxInclusive = inclusive;
    } else if (value === domain.max) {
        domain.maxInclusive = domain.maxInclusive && inclusive;
    }
}

function applyRelation(domain, leftRaw, operator, rightRaw) {
    const left = String(leftRaw).trim();
    const right = String(rightRaw).trim();
    const leftIsX = /^x$/i.test(left);
    const rightIsX = /^x$/i.test(right);
    if (leftIsX === rightIsX) return false;

    const bound = finiteBound(leftIsX ? right : left);
    if (!Number.isFinite(bound)) return false;

    if (leftIsX) {
        if (operator === '<') tightenMaximum(domain, bound, false);
        else if (operator === '<=') tightenMaximum(domain, bound, true);
        else if (operator === '>') tightenMinimum(domain, bound, false);
        else if (operator === '>=') tightenMinimum(domain, bound, true);
        else if (operator === '=' || operator === '==') {
            tightenMinimum(domain, bound, true);
            tightenMaximum(domain, bound, true);
        } else return false;
        return true;
    }

    if (operator === '<') tightenMinimum(domain, bound, false);
    else if (operator === '<=') tightenMinimum(domain, bound, true);
    else if (operator === '>') tightenMaximum(domain, bound, false);
    else if (operator === '>=') tightenMaximum(domain, bound, true);
    else if (operator === '=' || operator === '==') {
        tightenMinimum(domain, bound, true);
        tightenMaximum(domain, bound, true);
    } else return false;
    return true;
}

function parseRelation(domain, relation) {
    const compact = String(relation || '').replace(/\s+/g, '');
    if (!compact) return true;

    const chained = compact.match(/^(.+?)(<=|>=|<|>)x(<=|>=|<|>)(.+)$/i);
    if (chained) {
        return applyRelation(domain, chained[1], chained[2], 'x')
            && applyRelation(domain, 'x', chained[3], chained[4]);
    }

    const leftX = compact.match(/^x(<=|>=|==|=|<|>)(.+)$/i);
    if (leftX) return applyRelation(domain, 'x', leftX[1], leftX[2]);

    const rightX = compact.match(/^(.+?)(<=|>=|==|=|<|>)x$/i);
    if (rightX) return applyRelation(domain, rightX[1], rightX[2], 'x');

    return false;
}

function validateDomain(domain) {
    if (domain.min > domain.max) {
        domain.valid = false;
        domain.error = 'Domain-এর lower bound upper bound-এর চেয়ে বড়।';
        return domain;
    }
    if (domain.min === domain.max && !(domain.minInclusive && domain.maxInclusive)) {
        domain.valid = false;
        domain.error = 'এই domain-এ কোনো x নেই।';
    }
    return domain;
}

export function parseDomain(value) {
    const source = cleanDomainSource(value);
    if (!source || /^(?:all|otherwise|else|true|real|reals|r)$/i.test(source)) {
        return emptyDomain(source || 'all');
    }

    const interval = source.match(/^([[(])\s*(.+?)\s*,\s*(.+?)\s*([\])])$/);
    if (interval) {
        const minimum = finiteBound(interval[2]);
        const maximum = finiteBound(interval[3]);
        if (Number.isNaN(minimum) || Number.isNaN(maximum)) {
            return invalidDomain(source, 'Interval bound বোঝা যায়নি।');
        }
        return validateDomain({
            source,
            valid: true,
            min: minimum,
            max: maximum,
            minInclusive: interval[1] === '[',
            maxInclusive: interval[4] === ']',
            error: '',
        });
    }

    const domain = emptyDomain(source);
    const relations = source
        .replace(/\b(?:and)\b/gi, '&&')
        .replace(/[∧]/g, '&&')
        .split(/&&/)
        .map((item) => item.trim())
        .filter(Boolean);

    if (!relations.length || relations.some((relation) => !parseRelation(domain, relation))) {
        return invalidDomain(source, `Domain বোঝা যায়নি: ${source}`);
    }
    return validateDomain(domain);
}

export function domainContains(domainInput, x, epsilon = 1e-9) {
    const domain = domainInput?.valid !== undefined ? domainInput : parseDomain(domainInput);
    if (!domain.valid || !Number.isFinite(Number(x))) return false;
    const value = Number(x);
    if (Number.isFinite(domain.min)) {
        if (domain.minInclusive ? value < domain.min - epsilon : value <= domain.min + epsilon) return false;
    }
    if (Number.isFinite(domain.max)) {
        if (domain.maxInclusive ? value > domain.max + epsilon : value >= domain.max - epsilon) return false;
    }
    return true;
}

export function domainSampleBounds(domainInput, viewMin, viewMax, sampleCount = 800) {
    const domain = domainInput?.valid !== undefined ? domainInput : parseDomain(domainInput);
    if (!domain.valid) return null;
    let minimum = Math.max(Number(viewMin), domain.min);
    let maximum = Math.min(Number(viewMax), domain.max);
    if (minimum > maximum) return null;

    const viewSpan = Math.max(1e-12, Math.abs(Number(viewMax) - Number(viewMin)));
    const inward = viewSpan / Math.max(2000, Number(sampleCount) * 25);
    if (Number.isFinite(domain.min) && minimum === domain.min && !domain.minInclusive) minimum += inward;
    if (Number.isFinite(domain.max) && maximum === domain.max && !domain.maxInclusive) maximum -= inward;
    if (minimum > maximum) return null;
    return { minimum, maximum };
}

export function domainBoundaries(domainInput) {
    const domain = domainInput?.valid !== undefined ? domainInput : parseDomain(domainInput);
    if (!domain.valid) return [];
    const result = [];
    if (Number.isFinite(domain.min)) {
        result.push({ x: domain.min, inclusive: domain.minInclusive, side: 'min' });
    }
    if (Number.isFinite(domain.max) && domain.max !== domain.min) {
        result.push({ x: domain.max, inclusive: domain.maxInclusive, side: 'max' });
    }
    return result;
}

export function domainToText(domainInput) {
    const domain = domainInput?.valid !== undefined ? domainInput : parseDomain(domainInput);
    if (domain.source) return domain.source;
    if (!Number.isFinite(domain.min) && !Number.isFinite(domain.max)) return 'all';
    const left = Number.isFinite(domain.min) ? String(domain.min) : '-inf';
    const right = Number.isFinite(domain.max) ? String(domain.max) : 'inf';
    return `${domain.minInclusive ? '[' : '('}${left}, ${right}${domain.maxInclusive ? ']' : ')'}`;
}
