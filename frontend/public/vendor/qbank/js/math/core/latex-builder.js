import { escapeLatex } from './utils.js';

const BRACKET_MAP = {
    round: ['(', ')'],
    square: ['[', ']'],
    curly: ['\\{', '\\}'],
    angle: ['\\langle', '\\rangle']
};

class LatexBuilder {
    static fraction(numerator, denominator) {
        return `\\frac{${escapeLatex(numerator)}}{${escapeLatex(denominator)}}`;
    }

    static power(base, exponent) {
        return `${base}^{${escapeLatex(exponent)}}`;
    }

    static subscript(base, value) {
        return `${base}_{${escapeLatex(value)}}`;
    }

    static sqrt(value) {
        return `\\sqrt{${escapeLatex(value)}}`;
    }

    static nthRoot(value, degree) {
        const deg = degree == null ? '' : escapeLatex(degree);
        if (!deg) return LatexBuilder.sqrt(value);
        return `\\sqrt[${deg}]{${escapeLatex(value)}}`;
    }

    static bracket(value, type = 'round') {
        const brackets = BRACKET_MAP[type] || BRACKET_MAP.round;
        return `${brackets[0]}${value}${brackets[1]}`;
    }
}

export default LatexBuilder;
