import { escapeLatex } from '../../core/utils.js';

function fractionDialogHtml(previousState = {}) {
    const expr = previousState.expression || '';
    return [
        '<div style="display:grid;gap:12px;max-width:480px;">',
        '<label style="display:flex;flex-direction:column;gap:6px;text-align:left;font-size:13px;color:#334155;">',
        '<span>Expression (e.g. a/b or (x2+y2)/2z)</span>',
        '<input id="swal-fraction-expression" class="swal2-input" value="' + (expr ? expr : 'a/b') + '" placeholder="(x2+y2)/2z" style="text-align:center;">',
        '</label>',
        '</div>'
    ].join('');
}

async function openFractionDialog({ editor, context }) {
    const previousState = editor.getToolState('fraction', context?.id || 'default') || {};

    const result = await editor.dialog.open({
        title: 'Insert fraction',
        html: fractionDialogHtml(previousState),
        showCancelButton: true,
        confirmButtonText: 'Insert',
        focusConfirm: false,
        preConfirm: () => {
            const expression = document.getElementById('swal-fraction-expression')?.value.trim() || '';

            if (!expression) {
                Swal.showValidationMessage('Please provide a fraction expression (e.g. a/b or (x2+y2)/2z).');
                return false;
            }

            return { expression };
        }
    });

    if (!result.isConfirmed || !result.value) {
        return null;
    }

    const state = {
        expression: result.value.expression
    };
    editor.setToolState('fraction', state, context?.id || 'default');
    return state;
}

function generateLatex(payload) {
    if (!payload) return '';

    // If caller provided an expression string, parse it; otherwise fallback to legacy numerator/denominator
    const expr = String(payload.expression || '').trim();
    if (expr) {
        // split at top-level slash
        function splitTopLevelSlash(s) {
            let depth = 0;
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (ch === '(') depth++;
                else if (ch === ')') depth = Math.max(0, depth - 1);
                else if (ch === '/' && depth === 0) {
                    return [s.slice(0, i), s.slice(i + 1)];
                }
            }
            return [s, null];
        }

        function convertSuperscripts(s) {
            // convert patterns like x2 -> x^{2}, and )(2) -> )^{2}
            let out = s;
            out = out.replace(/\)\s*(\d+)/g, (m, d) => `)^{${d}}`);
            out = out.replace(/([A-Za-z])\s*(\d+)/g, (m, p1, p2) => `${p1}^{${p2}}`);
            return out;
        }

        const [numRaw, denRaw] = splitTopLevelSlash(expr);
        if (denRaw !== null && denRaw !== undefined) {
            const num = convertSuperscripts(numRaw.trim());
            const den = convertSuperscripts(denRaw.trim());
            const frac = `\\frac{${num}}{${den}}`;
            return `\\(${frac}\\)`;
        }

        // no slash: convert superscripts and return inline math
        const converted = convertSuperscripts(expr);
        return `\\(${converted}\\)`;
    }

    // legacy support
    const numerator = String(payload.numerator || '').trim();
    const denominator = String(payload.denominator || '').trim();
    if (!numerator || !denominator) return '';
    const frac = `\\frac{${escapeLatex(numerator)}}{${escapeLatex(denominator)}}`;
    return `\\(${frac}\\)`;
}

function toolInsert({ editor, textarea, latex }) {
    return editor.insertLatex(textarea, latex);
}

function toolExecute({ editor, textarea, context, payload, latex, options }) {
    // Insert the generated LaTeX into the textarea so user can see rendered math.
    const finalLatex = generateLatex(payload) || latex;
    if (!finalLatex) return null;
    return editor.insertLatex(textarea, finalLatex, options);
}

function toolOpen(editor, options = {}) {
    return editor.openTool('fraction', options);
}

window.MathEditor.registerTool({
    id: 'fraction',
    metadata: {
        label: 'Fraction',
        icon: '⅟',
        category: 'algebra',
        description: 'Insert a simple fraction with numerator and denominator.',
        keywords: ['fraction', 'numerator', 'denominator', 'ratio'],
        shortcut: 'Ctrl+Alt+F',
        order: 90
    },
    dialog: openFractionDialog,
    generateLatex,
    insert: toolInsert,
    execute: toolExecute,
    open: toolOpen,
    render: () => null,
    destroy: () => null
});

window.MathFraction = {
    openFractionBuilder(textarea) {
        return window.MathEditor.openTool('fraction', { textarea });
    }
};
