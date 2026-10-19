import LatexBuilder from '../../core/latex-builder.js';
import { escapeLatex } from '../../core/utils.js';

// Ensure KaTeX display blocks are left-aligned site-wide for editor and preview
function ensureKatexLeftAlign() {
    if (typeof document === 'undefined') return;
    if (document.querySelector('style[data-qmx-katex-left]')) return;
    const s = document.createElement('style');
    s.setAttribute('data-qmx-katex-left', '1');
    s.textContent = `
/* Left-align KaTeX display math for editor and previews */
.katex-display { text-align: left !important; }
:root { --keyboard-zindex: 20000; }
.ui-menu,
.ui-menu-container,
.ML__virtual-keyboard {
    --ui-font-family: Arial, Helvetica, "Segoe UI", sans-serif !important;
    font-family: Arial, Helvetica, "Segoe UI", sans-serif !important;
}
.ui-menu-container > li,
.ui-menu-container > li > .label,
.ui-menu-container > li > kbd {
    font-family: Arial, Helvetica, "Segoe UI", sans-serif !important;
}
.qmx-equation-modal-popup .swal2-close {
    font-family: Arial, Helvetica, "Segoe UI", sans-serif !important;
}
.qmx-equation-symbol-button {
    font-family: "QMX Noto Sans", "QMX Noto Symbols Math", "QMX Noto Symbols UI", "Segoe UI Symbol", "Segoe UI Emoji", sans-serif !important;
}
@media (max-width: 767px) {
    .swal2-container:has(.qmx-equation-modal-popup) {
        padding: 4px !important;
        align-items: flex-start !important;
    }
    .qmx-equation-modal-popup {
        width: calc(100vw - 8px) !important;
        max-width: none !important;
        max-height: calc(100dvh - 8px) !important;
        margin: 4px 0 !important;
        border-radius: 14px !important;
        overflow: hidden !important;
    }
    .qmx-equation-modal-title {
        padding: 14px 42px 10px !important;
        font-size: 22px !important;
    }
    .qmx-equation-modal-content {
        overflow-y: auto !important;
        padding: 0 8px !important;
    }
    .qmx-equation-dialog {
        gap: 10px !important;
        padding: 10px !important;
        border-radius: 12px !important;
        box-shadow: none !important;
    }
    .qmx-equation-textarea {
        min-height: 42dvh !important;
        padding: 12px !important;
        font-size: 24px !important;
    }
    .qmx-equation-modal-popup .swal2-actions {
        position: sticky;
        bottom: 0;
        z-index: 2;
        width: 100%;
        margin: 0 !important;
        padding: 10px max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
        background: #fff;
        border-top: 1px solid #e2e8f0;
    }
    .qmx-equation-modal-confirm,
    .qmx-equation-modal-cancel {
        min-height: 44px;
        min-width: 96px;
    }
}
`;
    document.head.appendChild(s);
    // also adjust any already-rendered KaTeX display blocks on the page
    try {
        document.querySelectorAll('.katex-display').forEach((el) => { el.style.textAlign = 'left'; });
        document.querySelectorAll('.qmx-equation-preview-render').forEach((el) => {
            el.style.justifyContent = 'flex-start';
            el.style.alignItems = 'flex-start';
        });
    } catch (err) {
        // ignore in non-DOM contexts
    }
}

ensureKatexLeftAlign();

const ELEMENT_TYPES = [
    { id: 'fraction', label: 'Fraction' },
    { id: 'superscript', label: 'Superscript' },
    { id: 'subscript', label: 'Subscript' },
    { id: 'sqrt', label: 'Square root' },
    { id: 'parentheses', label: 'Parentheses' },
    { id: 'brackets', label: 'Brackets' }
];

const OPERATORS = [
    { label: '+', value: '+' },
    { label: '-', value: '-' },
    { label: '×', value: '\\times' },
    { label: '÷', value: '\\div' },
    { label: '=', value: '=' }
];

function createPaletteButton(label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qmx-equation-palette-button';
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
}

function buildPalette(container, onSelectType, onSelectOperator) {
    const palette = document.createElement('div');
    palette.className = 'qmx-equation-palette';

    const elementHeading = document.createElement('div');
    elementHeading.className = 'qmx-equation-palette-heading';
    elementHeading.textContent = 'Elements';
    palette.appendChild(elementHeading);

    ELEMENT_TYPES.forEach((element) => {
        const button = createPaletteButton(element.label, () => onSelectType(element.id));
        palette.appendChild(button);
    });

    const operatorHeading = document.createElement('div');
    operatorHeading.className = 'qmx-equation-palette-heading';
    operatorHeading.textContent = 'Operators';
    palette.appendChild(operatorHeading);

    OPERATORS.forEach((operator) => {
        const button = createPaletteButton(operator.label, () => onSelectOperator(operator.value));
        palette.appendChild(button);
    });

    container.appendChild(palette);
}

function createField(labelText, initialValue = '', placeholder = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'qmx-equation-field';

    const label = document.createElement('label');
    label.className = 'qmx-equation-field-label';
    label.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'qmx-equation-field-input';
    input.value = initialValue;
    input.placeholder = placeholder;

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return { wrapper, input };
}

function parseExpression(state) {
    if (!state || !Array.isArray(state.elements) || state.elements.length === 0) {
        return '';
    }

    return state.elements.map((element) => {
        switch (element.type) {
            case 'fraction':
                return LatexBuilder.fraction(element.numerator || 'a', element.denominator || 'b');
            case 'superscript':
                return LatexBuilder.power(element.base || 'x', element.exponent || '2');
            case 'subscript':
                return LatexBuilder.subscript(element.base || 'x', element.subscript || '1');
            case 'sqrt':
                return LatexBuilder.sqrt(element.value || 'x');
            case 'parentheses':
                return LatexBuilder.bracket(element.content || 'x', 'round');
            case 'brackets':
                return LatexBuilder.bracket(element.content || 'x', element.bracketType || 'square');
            case 'operator':
                return element.value || '';
            case 'literal':
                return escapeLatex(element.value || '');
            default:
                return '';
        }
    }).join('');
}

function buildElement(type, formState) {
    switch (type) {
        case 'fraction':
            if (!formState.numerator || !formState.denominator) return null;
            return {
                type: 'fraction',
                numerator: formState.numerator,
                denominator: formState.denominator,
                display: `(${formState.numerator}/${formState.denominator})`
            };
        case 'superscript':
            if (!formState.base || !formState.exponent) return null;
            return {
                type: 'superscript',
                base: formState.base,
                exponent: formState.exponent,
                display: `${formState.base}^${formState.exponent}`
            };
        case 'subscript':
            if (!formState.base || !formState.subscript) return null;
            return {
                type: 'subscript',
                base: formState.base,
                subscript: formState.subscript,
                display: `${formState.base}_${formState.subscript}`
            };
        case 'sqrt':
            if (!formState.value) return null;
            return {
                type: 'sqrt',
                value: formState.value,
                display: `√${formState.value}`
            };
        case 'parentheses':
            if (!formState.content) return null;
            return {
                type: 'parentheses',
                content: formState.content,
                display: `(${formState.content})`
            };
        case 'brackets':
            if (!formState.content) return null;
            return {
                type: 'brackets',
                content: formState.content,
                bracketType: formState.bracketType,
                display: `[${formState.content}]`
            };
        default:
            if (!formState.literal) return null;
            return {
                type: 'literal',
                value: formState.literal,
                display: formState.literal
            };
    }
}

function sampleLatex(type, formState) {
    switch (type) {
        case 'fraction':
            return LatexBuilder.fraction(formState.numerator, formState.denominator);
        case 'superscript':
            return LatexBuilder.power(formState.base, formState.exponent);
        case 'subscript':
            return LatexBuilder.subscript(formState.base, formState.subscript);
        case 'sqrt':
            return LatexBuilder.sqrt(formState.value);
        case 'parentheses':
            return LatexBuilder.bracket(formState.content, 'round');
        case 'brackets':
            return LatexBuilder.bracket(formState.content, formState.bracketType);
        default:
            return escapeLatex(formState.literal);
    }
}

function createEquationDialog({ editor, context, initialSource = '' }) {
    const previousState = editor.getToolState('equation', context?.id || 'default') || { expression: '' };
    const handedOffSource = String(window.QmxEquationInitialLatex || '');
    window.QmxEquationInitialLatex = '';
    const selectedSource = String(initialSource || handedOffSource || context?.getSelection?.()?.text || '').trim();
    const inlineSelection = selectedSource.match(/^\\\(([\s\S]*)\\\)$/);
    const displaySelection = selectedSource.match(/^\\\[([\s\S]*)\\\]$/);
    const selectedLatex = String(inlineSelection?.[1] ?? displaySelection?.[1] ?? selectedSource).trim();
    const container = document.createElement('div');
    container.className = 'qmx-equation-dialog';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '18px';
    container.style.maxWidth = '940px';
    container.style.width = '100%';
    container.style.padding = '22px';
    container.style.background = '#f8fafc';
    container.style.borderRadius = '22px';
    container.style.boxShadow = '0 22px 60px rgba(15, 23, 42, 0.15)';

    const hasVisualMathEditor = typeof window.MathfieldElement === 'function';
    const initialValue = selectedLatex
        || previousState.latex
        || convertExpressionToLatex(previousState.expression || '');
    const textarea = hasVisualMathEditor
        ? new window.MathfieldElement()
        : document.createElement('textarea');
    textarea.id = 'qmx-equation-input';
    textarea.className = 'qmx-equation-textarea';
    textarea.style.width = '100%';
    textarea.style.minHeight = '240px';
    textarea.style.padding = '18px 20px';
    textarea.style.border = '1px solid #d4d4d4';
    textarea.style.borderRadius = '12px';
    textarea.style.background = '#ffffff';
    textarea.style.boxShadow = 'inset 0 1px 4px rgba(0, 0, 0, 0.04)';
    textarea.style.fontSize = hasVisualMathEditor ? '28px' : '15px';
    textarea.style.lineHeight = '1.65';
    textarea.style.color = '#1c1c1c';
    textarea.style.boxSizing = 'border-box';
    textarea.style.outline = 'none';
    textarea.style.transition = 'border-color 0.2s ease, box-shadow 0.2s ease';
    textarea.style.setProperty('--ui-font-family', 'Arial, Helvetica, "Segoe UI", sans-serif');
    textarea.setAttribute('aria-label', 'Visual equation editor');

    if (hasVisualMathEditor) {
        textarea.smartFence = true;
        textarea.smartSuperscript = true;
        textarea.mathVirtualKeyboardPolicy = 'auto';
        textarea.value = initialValue;
    } else {
        textarea.rows = 6;
        textarea.style.fontFamily = 'Segoe UI, Calibri, Candara, sans-serif';
        textarea.style.resize = 'vertical';
        textarea.placeholder = '(x2+y2)/2z';
        textarea.value = selectedLatex || previousState.expression || '';
    }

    textarea.addEventListener('focus', () => {
        textarea.style.borderColor = '#5b9df9';
        textarea.style.boxShadow = '0 0 0 4px rgba(91, 157, 249, 0.12)';
    });
    textarea.addEventListener('blur', () => {
        textarea.style.borderColor = '#d4d4d4';
        textarea.style.boxShadow = 'inset 0 1px 4px rgba(0, 0, 0, 0.04)';
    });

    // Prevent the parent dialog from treating Enter as confirmation.
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
        }
    });

    // helper to insert text at cursor position in the textarea
    function insertAtCursor(text) {
        textarea.focus();
        if (hasVisualMathEditor) {
            textarea.insert(text, {
                focus: true,
                insertionMode: 'replaceSelection',
                selectionMode: 'placeholder'
            });
            return;
        }

        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || 0;
        const before = textarea.value.slice(0, start);
        const after = textarea.value.slice(end);
        textarea.value = before + text + after;
        const newPos = start + text.length;
        textarea.selectionStart = textarea.selectionEnd = newPos;
        // trigger input event to update preview
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function insertAndPlaceCursor(text, placeOffsetFromEnd = 1) {
        if (hasVisualMathEditor) {
            insertAtCursor(text);
            return;
        }

        // insert and move cursor inside parentheses if text contains () or places specified
        textarea.focus();
        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || 0;
        const before = textarea.value.slice(0, start);
        const after = textarea.value.slice(end);
        textarea.value = before + text + after;
        // position cursor inside parentheses if pattern found
        const parenIndex = text.indexOf('(');
        const closeIndex = text.indexOf(')');
        if (parenIndex >= 0 && closeIndex >= 0 && closeIndex > parenIndex) {
            const cursorPos = start + parenIndex + 1;
            textarea.selectionStart = textarea.selectionEnd = cursorPos;
        } else {
            const newPos = start + text.length - placeOffsetFromEnd;
            textarea.selectionStart = textarea.selectionEnd = Math.max(start, newPos);
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // symbol palette: grouped categories with human-readable labels and LaTeX tokens
    function createSymbolPalette() {
        const palette = document.createElement('div');
        palette.className = 'qmx-equation-symbol-palette';
        // make palette visually boxed and scrollable when large
        palette.style.border = '1px solid rgba(148, 163, 184, 0.35)';
        palette.style.padding = '14px';
        palette.style.borderRadius = '16px';
        palette.style.maxHeight = '340px';
        palette.style.overflow = 'auto';
        palette.style.background = '#fff';
        palette.style.marginBottom = '20px';
        palette.style.boxShadow = '0 18px 46px rgba(15, 23, 42, 0.1)';

        const toolbar = document.createElement('div');
        toolbar.style.display = 'flex';
        toolbar.style.alignItems = 'center';
        toolbar.style.justifyContent = 'space-between';
        toolbar.style.gap = '12px';
        toolbar.style.marginBottom = '14px';

        const title = document.createElement('div');
        title.textContent = 'Symbol Library';
        title.style.fontWeight = '700';
        title.style.color = '#1e293b';
        title.style.fontSize = '14px';
        toolbar.appendChild(title);

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search symbols…';
        searchInput.style.flex = '1';
        searchInput.style.minWidth = '180px';
        searchInput.style.padding = '10px 12px';
        searchInput.style.border = '1px solid rgba(148, 163, 184, 0.35)';
        searchInput.style.borderRadius = '12px';
        searchInput.style.background = '#f8fafc';
        searchInput.style.color = '#0f172a';
        searchInput.style.fontSize = '13px';
        searchInput.style.outline = 'none';
        searchInput.addEventListener('focus', () => { searchInput.style.borderColor = 'rgba(96, 165, 250, 0.8)'; });
        searchInput.addEventListener('blur', () => { searchInput.style.borderColor = 'rgba(148, 163, 184, 0.35)'; });
        toolbar.appendChild(searchInput);
        palette.appendChild(toolbar);

        const groups = [
            {
                title: 'Greek (lowercase)',
                items: [
                    { latex: '\\alpha', label: 'α' }, { latex: '\\beta', label: 'β' }, { latex: '\\gamma', label: 'γ' }, { latex: '\\delta', label: 'δ' }, { latex: '\\epsilon', label: 'ε' },
                    { latex: '\\varepsilon', label: 'ε' }, { latex: '\\zeta', label: 'ζ' }, { latex: '\\eta', label: 'η' }, { latex: '\\theta', label: 'θ' }, { latex: '\\vartheta', label: 'ϑ' },
                    { latex: '\\iota', label: 'ι' }, { latex: '\\kappa', label: 'κ' }, { latex: '\\lambda', label: 'λ' }, { latex: '\\mu', label: 'μ' }, { latex: '\\nu', label: 'ν' },
                    { latex: '\\xi', label: 'ξ' }, { latex: '\\omicron', label: 'o' }, { latex: '\\pi', label: 'π' }, { latex: '\\varpi', label: 'ϖ' }, { latex: '\\rho', label: 'ρ' },
                    { latex: '\\varrho', label: 'ϱ' }, { latex: '\\sigma', label: 'σ' }, { latex: '\\varsigma', label: 'ς' }, { latex: '\\tau', label: 'τ' }, { latex: '\\upsilon', label: 'υ' },
                    { latex: '\\phi', label: 'φ' }, { latex: '\\varphi', label: 'ϕ' }, { latex: '\\chi', label: 'χ' }, { latex: '\\psi', label: 'ψ' }, { latex: '\\omega', label: 'ω' }
                ]
            },
            {
                title: 'Greek (uppercase)',
                items: [
                    { latex: '\\Gamma', label: 'Γ' }, { latex: '\\Delta', label: 'Δ' }, { latex: '\\Theta', label: 'Θ' }, { latex: '\\Lambda', label: 'Λ' }, { latex: '\\Xi', label: 'Ξ' },
                    { latex: '\\Pi', label: 'Π' }, { latex: '\\Sigma', label: 'Σ' }, { latex: '\\Upsilon', label: 'Υ' }, { latex: '\\Phi', label: 'Φ' }, { latex: '\\Psi', label: 'Ψ' },
                    { latex: '\\Omega', label: 'Ω' }
                ]
            },
            {
                title: 'Binary Operators',
                items: [
                    { latex: '\\pm', label: '±' }, { latex: '\\mp', label: '∓' }, { latex: '\\times', label: '×' }, { latex: '\\cdot', label: '·' }, { latex: '\\div', label: '÷' },
                    { latex: '\\ast', label: '∗' }, { latex: '\\star', label: '⋆' }, { latex: '\\circ', label: '∘' }, { latex: '\\oplus', label: '⊕' }, { latex: '\\ominus', label: '⊖' },
                    { latex: '\\otimes', label: '⊗' }, { latex: '\\oslash', label: '⊘' }, { latex: '\\odot', label: '⊙' }, { latex: '\\boxplus', label: '⊞' }, { latex: '\\boxminus', label: '⊟' },
                    { latex: '\\boxtimes', label: '⊠' }, { latex: '\\boxdot', label: '⊡' }, { latex: '\\dotplus', label: '⊕' }, { latex: '\\wedge', label: '∧' }, { latex: '\\vee', label: '∨' },
                    { latex: '\\cap', label: '∩' }, { latex: '\\cup', label: '∪' }, { latex: '\\setminus', label: '\\' }, { latex: '\\land', label: '∧' }, { latex: '\\lor', label: '∨' }
                ]
            },
            {
                title: 'Relations',
                items: [
                    { latex: '\\leq', label: '≤' }, { latex: '\\geq', label: '≥' }, { latex: '\\neq', label: '≠' }, { latex: '\\approx', label: '≈' }, { latex: '\\sim', label: '∼' },
                    { latex: '\\simeq', label: '≃' }, { latex: '\\cong', label: '≅' }, { latex: '\\equiv', label: '≡' }, { latex: '\\propto', label: '∝' }, { latex: '\\ll', label: '≪' },
                    { latex: '\\gg', label: '≫' }, { latex: '\\subset', label: '⊂' }, { latex: '\\subseteq', label: '⊆' }, { latex: '\\supset', label: '⊃' }, { latex: '\\supseteq', label: '⊇' },
                    { latex: '\\nsubseteq', label: '⊄' }, { latex: '\\parallel', label: '∥' }, { latex: '\\perp', label: '⊥' }, { latex: '\\models', label: '⊧' }, { latex: '\\vdash', label: '⊢' },
                    { latex: '\\vDash', label: '⊨' }, { latex: '\\Vdash', label: '⊩' }
                ]
            },
            {
                title: 'Set Theory & Logic',
                items: [
                    { latex: '\\in', label: '∈' }, { latex: '\\notin', label: '∉' }, { latex: '\\ni', label: '∋' }, { latex: '\\emptyset', label: '∅' }, { latex: '\\varnothing', label: '∅' },
                    { latex: '\\forall', label: '∀' }, { latex: '\\exists', label: '∃' }, { latex: '\\nexists', label: '∄' }, { latex: '\\cup', label: '∪' }, { latex: '\\cap', label: '∩' },
                    { latex: '\\setminus', label: '∖' }, { latex: '\\subseteq', label: '⊆' }, { latex: '\\supseteq', label: '⊇' }, { latex: '\\top', label: '⊤' }, { latex: '\\bot', label: '⊥' }
                ]
            },
            {
                title: 'Arrows',
                items: [
                    { latex: '\\rightarrow', label: '→' }, { latex: '\\leftarrow', label: '←' }, { latex: '\\leftrightarrow', label: '↔' }, { latex: '\\Rightarrow', label: '⇒' }, { latex: '\\Leftarrow', label: '⇐' },
                    { latex: '\\Leftrightarrow', label: '⇔' }, { latex: '\\longrightarrow', label: '⟶' }, { latex: '\\longleftarrow', label: '⟵' }, { latex: '\\longleftrightarrow', label: '⟷' },
                    { latex: '\\mapsto', label: '↦' }, { latex: '\\longmapsto', label: '⟼' }, { latex: '\\uparrow', label: '↑' }, { latex: '\\downarrow', label: '↓' }, { latex: '\\updownarrow', label: '↕' },
                    { latex: '\\Uparrow', label: '⇑' }, { latex: '\\Downarrow', label: '⇓' }, { latex: '\\Updownarrow', label: '⇕' }, { latex: '\\nearrow', label: '↗' }, { latex: '\\searrow', label: '↘' },
                    { latex: '\\nwarrow', label: '↖' }, { latex: '\\swarrow', label: '↙' }, { latex: '\\hookrightarrow', label: '↪' }, { latex: '\\hookleftarrow', label: '↩' },
                    { latex: '\\rightharpoonup', label: '⇀' }, { latex: '\\rightharpoondown', label: '⇁' }, { latex: '\\leftharpoonup', label: '↽' }, { latex: '\\leftharpoondown', label: '↾' },
                    { latex: '\\rightleftharpoons', label: '⇌' }, { latex: '\\leftrightharpoons', label: '⇋' }, { latex: '\\looparrowright', label: '⥲' }, { latex: '\\circlearrowright', label: '↻' }
                ]
            },
            {
                title: 'Big Operators & Calculus',
                items: [
                    { latex: '\\int', label: '∫' }, { latex: '\\iint', label: '∬' }, { latex: '\\iiint', label: '∭' }, { latex: '\\oint', label: '∮' },
                    { latex: '\\sum', label: '∑' }, { latex: '\\prod', label: '∏' }, { latex: '\\coprod', label: '∐' }, { latex: '\\bigcap', label: '⋂' }, { latex: '\\bigcup', label: '⋃' },
                    { latex: '\\bigwedge', label: '⋀' }, { latex: '\\bigvee', label: '⋁' }, { latex: '\\bigoplus', label: '⊕' }, { latex: '\\bigotimes', label: '⊗' },
                    { latex: '\\bigodot', label: '⊙' }, { latex: '\\lim', label: 'lim' }, { latex: '\\log', label: 'log' }, { latex: '\\ln', label: 'ln' }, { latex: '\\sin', label: 'sin' },
                    { latex: '\\cos', label: 'cos' }, { latex: '\\tan', label: 'tan' }, { latex: '\\cot', label: 'cot' }, { latex: '\\sec', label: 'sec' }, { latex: '\\csc', label: 'csc' },
                    { latex: '\\partial', label: '∂' }, { latex: '\\nabla', label: '∇' }, { latex: '\\infty', label: '∞' }
                ]
            },
            {
                title: 'Roots',
                items: [
                    { latex: '\\sqrt{x}', label: '√', insert: 'sqrt()' },
                    { latex: '\\sqrt[3]{x}', label: '∛', insert: 'root(3,)' },
                    { latex: '\\sqrt[4]{x}', label: '⁴√', insert: 'root(4,)' },
                    { latex: '\\sqrt[5]{x}', label: '⁵√', insert: 'root(5,)' }
                ]
            },
            {
                title: 'Delimiters & Dots',
                items: [
                    { latex: '\\lbrace', label: '{' }, { latex: '\\rbrace', label: '}' }, { latex: '\\langle', label: '⟨' }, { latex: '\\rangle', label: '⟩' },
                    { latex: '\\lceil', label: '⌈' }, { latex: '\\rceil', label: '⌉' }, { latex: '\\lfloor', label: '⌊' }, { latex: '\\rfloor', label: '⌋' },
                    { latex: '\\vert', label: '|' }, { latex: '\\Vert', label: '∥' }, { latex: '\\lvert', label: '|' }, { latex: '\\rvert', label: '|' },
                    { latex: '\\ldots', label: '…' }, { latex: '\\cdots', label: '⋯' }, { latex: '\\vdots', label: '⋮' }, { latex: '\\ddots', label: '⋱' }
                ]
            },
            {
                title: 'Font Styles & Number Sets',
                items: [
                    { latex: '\\mathbb{R}', label: 'ℝ' }, { latex: '\\mathbb{Z}', label: 'ℤ' }, { latex: '\\mathbb{N}', label: 'ℕ' }, { latex: '\\mathbb{Q}', label: 'ℚ' },
                    { latex: '\\mathbb{C}', label: 'ℂ' }, { latex: '\\mathcal{A}', label: 'A' }, { latex: '\\mathfrak{A}', label: 'A' }, { latex: '\\mathbf{x}', label: 'x' },
                    { latex: '\\mathit{x}', label: 'x' }, { latex: '\\mathsf{A}', label: 'A' }, { latex: '\\mathtt{A}', label: 'A' }, { latex: '\\mathrm{A}', label: 'A' },
                    { latex: '\\imath', label: 'ı' }, { latex: '\\jmath', label: 'ȷ' }, { latex: '\\hat{x}', label: 'x̂' }, { latex: '\\bar{x}', label: 'x̄' },
                    { latex: '\\tilde{x}', label: 'x̃' }, { latex: '\\widehat{XYZ}', label: 'XYẐ' }, { latex: '\\widetilde{XYZ}', label: 'XYZ̃' }
                ]
            },
            {
                title: 'Miscellaneous',
                items: [
                    { latex: '\\degree', label: '°' }, { latex: '\\pm', label: '±' }, { latex: '\\neg', label: '¬' }, { latex: '\\therefore', label: '∴' },
                    { latex: '\\because', label: '∵' }, { latex: '\\angle', label: '∠' }, { latex: '\\triangle', label: '△' }, { latex: '\\square', label: '□' },
                    { latex: '\\lozenge', label: '◊' }, { latex: '\\hbar', label: 'ħ' }, { latex: '\\copyright', label: '©' }, { latex: '\\circledR', label: '®' },
                    { latex: '\\pounds', label: '£' }, { latex: '\\$', label: '$' }, { latex: '\\%', label: '%' }, { latex: '\\_', label: '_' }, { latex: '\\#', label: '#' }
                ]
            }
        ];

        const groupRows = [];

        groups.forEach((group) => {
            const heading = document.createElement('div');
            heading.className = 'qmx-equation-symbol-heading';
            heading.textContent = group.title;
            heading.style.fontWeight = '700';
            heading.style.marginTop = '16px';
            heading.style.marginBottom = '10px';
            heading.style.color = '#334155';
            heading.style.fontSize = '13px';
            palette.appendChild(heading);

            const row = document.createElement('div');
            row.className = 'qmx-equation-symbol-row';
            row.style.display = 'flex';
            row.style.flexWrap = 'wrap';
            row.style.gap = '6px';
            row.style.marginBottom = '10px';
            group.items.forEach((it) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'qmx-equation-symbol-button';
                btn.title = it.latex;
                btn.dataset.searchText = (it.label + ' ' + it.latex).toLowerCase();
                // prefer a readable label; if KaTeX is available, render the latex for nice display
                if (window.katex && typeof window.katex.renderToString === 'function') {
                    try {
                        btn.innerHTML = window.katex.renderToString(it.latex, { throwOnError: false, displayMode: false });
                    } catch (e) {
                        btn.textContent = it.label || it.latex.replace(/\\/g, '');
                    }
                } else {
                    btn.textContent = it.label || it.latex.replace(/\\/g, '');
                }
                btn.style.margin = '2px';
                btn.style.padding = '8px 10px';
                btn.style.minWidth = '34px';
                btn.style.height = '34px';
                btn.style.border = '1px solid rgba(148, 163, 184, 0.35)';
                btn.style.borderRadius = '10px';
                btn.style.background = '#f8fafc';
                btn.style.color = '#0f172a';
                btn.style.cursor = 'pointer';
                btn.style.transition = 'all 0.15s ease';
                btn.style.fontSize = '14px';
                btn.addEventListener('mouseenter', () => {
                    btn.style.background = '#eef2ff';
                    btn.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.background = '#f8fafc';
                    btn.style.borderColor = 'rgba(148, 163, 184, 0.35)';
                });
                btn.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    if (hasVisualMathEditor) {
                        insertAtCursor(it.latex);
                    } else if (it.insert) {
                        insertAndPlaceCursor(it.insert);
                    } else {
                        insertAtCursor(it.latex);
                    }
                });
                row.appendChild(btn);
            });
            palette.appendChild(row);
            groupRows.push({ heading, row });
        });

        function filterSymbols(query) {
            const normalized = String(query || '').trim().toLowerCase();
            groupRows.forEach(({ heading, row }) => {
                let visibleCount = 0;
                Array.from(row.children).forEach((btn) => {
                    const isVisible = !normalized || btn.dataset.searchText.includes(normalized);
                    btn.style.display = isVisible ? 'inline-flex' : 'none';
                    if (isVisible) visibleCount += 1;
                });
                const groupVisible = visibleCount > 0;
                heading.style.display = groupVisible ? 'block' : 'none';
                row.style.display = groupVisible ? 'flex' : 'none';
            });
        }

        searchInput.addEventListener('input', () => filterSymbols(searchInput.value));

        return { palette, groups };
    }

    const { groups: symbolGroups } = createSymbolPalette();

    function installSymbolLibraryMenuItem() {
        if (!hasVisualMathEditor || !('menuItems' in textarea)) return;

        const currentItems = Array.from(textarea.menuItems || []);
        if (currentItems.some((item) => item?.ariaLabel === 'Symbol Library')) return;

        const symbolSubmenu = symbolGroups.map((group, groupIndex) => ({
            label: group.title,
            ariaLabel: group.title,
            submenu: group.items.map((item, itemIndex) => ({
                id: `qmx-symbol-${groupIndex}-${itemIndex}`,
                label: item.label || item.latex,
                ariaLabel: item.latex,
                onMenuSelect: () => insertAtCursor(item.latex)
            }))
        }));

        textarea.menuItems = [
            {
                label: 'Symbol Library',
                ariaLabel: 'Symbol Library',
                submenu: symbolSubmenu
            },
            { type: 'divider' },
            ...currentItems
        ];
    }

    function getCurrentLatex() {
        if (hasVisualMathEditor) {
            return String(textarea.getValue('latex') || '').trim();
        }
        return convertExpressionToLatex(textarea.value || '');
    }

    container.appendChild(textarea);

    return {
        container,
        installSymbolLibraryMenuItem,
        setInitialValue: () => {
            if (hasVisualMathEditor && typeof textarea.setValue === 'function') {
                textarea.setValue(initialValue, { silenceNotifications: true });
            } else if (hasVisualMathEditor) {
                textarea.value = initialValue;
            } else {
                textarea.value = selectedLatex || previousState.expression || '';
            }
        },
        getState: () => hasVisualMathEditor
            ? { latex: getCurrentLatex() }
            : { expression: textarea.value }
    };
}

function convertExpressionToLatex(expr) {
    if (!expr || !expr.trim()) return '';
    const raw = String(expr).trim();

    // matrix syntax variants that all map to LaTeX bmatrix
    const matrixPatterns = [
        /^\[\[(?:[^\]]|\](?!\]))*\]\]$/,
        /^\{\{(?:[^\}]|\}(?!\}))*\}\}$/,
        /^\(\((?:[^\)]|\)(?!\)))*\)\)$/
    ];

    const matrixOuter = raw.match(/^(\[\[(?:[^\]]|\](?!\]))*\]\]|\{\{(?:[^\}]|\}(?!\}))*\}\}|\(\((?:[^\)]|\)(?!\)))*\)\))(.*)$/);
    if (matrixOuter) {
        const matrixText = matrixOuter[1];
        const suffix = matrixOuter[2] || '';
        const normalized = matrixText
            .replace(/^\[\[/, '')
            .replace(/\]\]$/, '')
            .replace(/^\{\{/, '')
            .replace(/\}\}$/, '')
            .replace(/^\(\(/, '')
            .replace(/\)\)$/, '');
        const rows = normalized.split(/(?:\]\s*,?\s*\[|\}\s*,?\s*\{|\)\s*,?\s*\()/).map((row) => row.trim()).filter(Boolean);
        const converted = rows.map((row) => {
            const cells = row.split(/(?:\s*,\s*|\s+)/).filter(Boolean);
            return cells.map((cell) => convertExpressionToLatex(cell)).join(' & ');
        }).join(' \\\\ ');
        // normalize suffix so multi-character superscripts/subscripts are braced
        let suffixNorm = String(suffix || '');
        // handle leading ^... and _... sequences (stop at whitespace)
        suffixNorm = suffixNorm.replace(/^\^(\{[^}]*\}|[^\s]+)/, (m, g1) => {
            return '^' + (g1.startsWith('{') ? g1 : '{' + g1 + '}');
        });
        suffixNorm = suffixNorm.replace(/^_(\{[^}]*\}|[^\s]+)/, (m, g1) => {
            return '_' + (g1.startsWith('{') ? g1 : '{' + g1 + '}');
        });

        return `\\begin{bmatrix}${converted}\\end{bmatrix}${suffixNorm}`;
    }

    function tokenize(text) {
        const tokens = [];
        const regex = /(\s+)|((?:pow|sqrt|root)\s*\()|(\\[A-Za-z]+)|([A-Za-z][A-Za-z0-9]*)|([0-9]+)|([\^_(),+\-*/={}]|\{|\})/g;
        let match;
        while ((match = regex.exec(text))) {
            if (match[1]) {
                tokens.push({ value: match[1], type: 'space' });
            } else {
                const val = match[2] || match[3] || match[4] || match[5] || match[6] || match[7];
                tokens.push({ value: val, type: 'token' });
            }
        }
        return tokens;
    }

    // If the input contains multiple lines, convert each line separately
    if (/\r?\n/.test(raw)) {
        const lines = raw.split(/\r?\n/);
        const convertedLines = lines.map((ln) => {
            const one = String(ln || '').trim();
            return one ? convertExpressionToLatex(one) : '';
        }).filter(Boolean);
        return convertedLines.join(' \\\\ ');
    }

    const tokens = tokenize(raw);
    // DEBUG: log tokens when expression contains relation or newline
    if (/=|\r?\n/.test(raw)) {
        try { console.log('convertExpressionToLatex tokens:', tokens.map(t=>t.value)); } catch (e) {}
    }
    let pos = 0;

    function current() {
        return tokens[pos] || null;
    }

    function next(offset = 1) {
        return tokens[pos + offset] || null;
    }

    function eat(expected) {
        if (current() && current().value === expected) {
            pos += 1;
            return true;
        }
        return false;
    }

    function skipSpaces() {
        while (current() && current().type === 'space') {
            pos += 1;
        }
    }

    function parseExpression() {
        let node = parseTerm();
        while (current() && current().type !== 'space' && (current().value === '+' || current().value === '-' || current().value === '=')) {
            const op = current().value;
            pos += 1;
            const right = parseTerm();
            if (op === '+') node = { type: 'add', left: node, right };
            else if (op === '-') node = { type: 'sub', left: node, right };
            else node = { type: 'eq', left: node, right };
        }
        return node;
    }

    function isImplicitMultiply(token) {
        if (!token) return false;
        return token.value === '(' || token.value === '{' || /^[A-Za-z0-9\\]/.test(token.value);
    }

    function parseTerm() {
        let node = parseFactor();
        while (current() && current().type !== 'space' && (current().value === '*' || current().value === '/' || isImplicitMultiply(current()))) {
            if (current().value === '*' || current().value === '/') {
                const op = current().value;
                pos += 1;
                const right = parseFactor();
                node = { type: op === '*' ? 'mul' : 'div', left: node, right };
            } else {
                const right = parseFactor();
                node = { type: 'mul', left: node, right };
            }
        }
        return node;
    }

    function parseFactor() {
        let node = parsePrimary();
        // collect optional sequence of ^ and _ and attach to base (primary-only operands)
        let foundSup = null;
        let foundSub = null;
        while (current() && (current().value === '^' || current().value === '_')) {
            const op = current().value;
            pos += 1;
            const right = parsePrimary();
            if (op === '^') {
                foundSup = foundSup ? { type: 'pow', left: foundSup, right } : right;
            } else {
                foundSub = foundSub ? { type: 'subscript', left: foundSub, right } : right;
            }
        }
        if (foundSup && foundSub) {
            return { type: 'subsup', base: node, sub: foundSub, sup: foundSup };
        }
        if (foundSup) return { type: 'pow', left: node, right: foundSup };
        if (foundSub) return { type: 'subscript', left: node, right: foundSub };
        return node;
    }

    function parseExpressionUntilSpace() {
        const node = parseTermUntilSpace();
        let result = node;
        while (current() && current().type !== 'space' && (current().value === '+' || current().value === '-' || current().value === '=')) {
            const op = current().value;
            pos += 1;
            const right = parseTermUntilSpace();
            if (op === '+') result = { type: 'add', left: result, right };
            else if (op === '-') result = { type: 'sub', left: result, right };
            else result = { type: 'eq', left: result, right };
        }
        return result;
    }

    function parseTermUntilSpace() {
        let node = parseFactorUntilSpace();
        while (current() && current().type !== 'space' && (current().value === '*' || current().value === '/' || isImplicitMultiply(current()))) {
            if (current().value === '*' || current().value === '/') {
                const op = current().value;
                pos += 1;
                const right = parseFactorUntilSpace();
                node = { type: op === '*' ? 'mul' : 'div', left: node, right };
            } else {
                const right = parseFactorUntilSpace();
                node = { type: 'mul', left: node, right };
            }
        }
        return node;
    }

    function parseFactorUntilSpace() {
        let node = parsePrimary();
        // collect optional sequence of ^ and _ (in any order) and attach to base
        let foundSup = null;
        let foundSub = null;
        while (current() && current().type !== 'space' && (current().value === '^' || current().value === '_')) {
            const op = current().value;
            pos += 1;
            const right = parseExpressionUntilSpace();
            if (op === '^') {
                // if we already had a sup, chain it (rare)
                foundSup = foundSup ? { type: 'pow', left: foundSup, right } : right;
            } else {
                foundSub = foundSub ? { type: 'subscript', left: foundSub, right } : right;
            }
        }
        if (foundSup && foundSub) {
            return { type: 'subsup', base: node, sub: foundSub, sup: foundSup };
        }
        if (foundSup) {
            return { type: 'pow', left: node, right: foundSup };
        }
        if (foundSub) {
            return { type: 'subscript', left: node, right: foundSub };
        }
        return node;
    }

    function parseArguments() {
        const args = [];
        if (eat(')')) {
            return args;
        }
        do {
            args.push(parseExpression());
        } while (eat(','));
        eat(')');
        return args;
    }

    // core primary parser that does not handle prefix ^/_
    function parsePrimaryCore() {
        const tok = current();
        if (!tok) return { type: 'atom', value: '' };

        if (tok.type === 'space') {
            pos += 1;
            return { type: 'space', value: tok.value };
        }

        if (tok.value === '(' || tok.value === '{') {
            const open = tok.value;
            const close = open === '{' ? '}' : ')';
            pos += 1;
            const node = parseExpression();
            eat(close);
            return { type: 'group', expr: node, delimiter: open };
        }

        const functionNames = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'sqrt', 'root', 'pow']);
        if (tok.type === 'token' && /^[A-Za-z][A-Za-z0-9]*$/.test(tok.value) && next() && next().value === '(' && functionNames.has(tok.value.toLowerCase())) {
            const name = tok.value;
            pos += 1;
            pos += 1; // consume '('
            const args = parseArguments();
            return { type: 'func', name, args };
        }

        if (/^sqrt\s*\($/i.test(tok.value)) {
            pos += 1;
            const value = parseExpression();
            eat(')');
            return { type: 'sqrt', value };
        }

        if (/^root\s*\($/i.test(tok.value)) {
            pos += 1;
            const first = parseExpression();
            if (eat(',')) {
                const second = parseExpression();
                eat(')');
                return { type: 'root', degree: first, value: second };
            }
            eat(')');
            return { type: 'root', degree: null, value: first };
        }

        if (/^pow\s*\($/i.test(tok.value)) {
            pos += 1;
            const base = parseExpression();
            eat(',');
            const exponent = parseExpression();
            eat(')');
            return { type: 'pow', left: base, right: exponent };
        }

        pos += 1;
        return { type: 'atom', value: tok.value };
    }

    // primary parser supporting prefix ^/_ (e.g. ^2_3a or _3^2a)
    function parsePrimary() {
        // collect prefix sequence of ^ and _ (their operands are primaries themselves)
        let foundSup = null;
        let foundSub = null;
        while (current() && (current().value === '^' || current().value === '_')) {
            const op = current().value;
            pos += 1;
            const operand = parsePrimaryCore();
            if (op === '^') {
                foundSup = foundSup ? { type: 'pow', left: foundSup, right: operand } : operand;
            } else {
                foundSub = foundSub ? { type: 'subscript', left: foundSub, right: operand } : operand;
            }
        }

        // now parse the actual base
        const base = parsePrimaryCore();
        if (foundSup && foundSub) {
            return { type: 'subsup', base, sub: foundSub, sup: foundSup, prefix: true };
        }
        if (foundSup) return { type: 'pow', left: base, right: foundSup };
        if (foundSub) return { type: 'subscript', left: base, right: foundSub };
        return base;
    }

    function render(node, depth = 0) {
        if (!node) return '';
        switch (node.type) {
            case 'space':
                if (!node.value) return '';
                if (/\r?\n/.test(node.value)) {
                    return '\\\\';
                }
                const count = (node.value || '').split('').filter((c) => c === ' ').length;
                if (count > 0) return '\\ '.repeat(count);
                return '';
            case 'atom':
                return node.value;
            case 'func':
                return `${node.name}(${node.args.map((arg) => render(arg, depth)).join(',')})`;
            case 'group': {
                const bracketMap = ['[', '{', '('];
                const open = node.delimiter && node.delimiter !== '(' ? node.delimiter : bracketMap[depth % bracketMap.length];
                const close = open === '{' ? '}' : open === '[' ? ']' : ')';
                return `${open}${render(node.expr, depth + 1)}${close}`;
            }
            case 'add':
                return `${render(node.left, depth)} + ${render(node.right, depth)}`;
            case 'sub':
                return `${render(node.left, depth)} - ${render(node.right, depth)}`;
            case 'subscript':
                return `${render(node.left, depth)}_{${render(node.right, depth)}}`;
            case 'mul':
                return `${render(node.left, depth)} ${render(node.right, depth)}`;
            case 'div':
                return renderDivision(node.left, node.right, depth);
            case 'eq':
                return `${render(node.left, depth)} = ${render(node.right, depth)}`;
            case 'pow':
                return `${wrapPowBase(node.left, depth)}^{${render(node.right, depth)}}`;
            case 'subsup':
                if (node.prefix) {
                    // place sup/sub to the left of the base
                    const leftSup = node.sup ? `^{${render(node.sup, depth)}}` : '';
                    const leftSub = node.sub ? `_{${render(node.sub, depth)}}` : '';
                    return `{}` + leftSup + leftSub + render(node.base, depth);
                }
                return `${render(node.base, depth)}_{${render(node.sub, depth)}}^{${render(node.sup, depth)}}`;
            case 'sqrt':
                return `\\sqrt{${render(node.value, depth)}}`;
            case 'root':
                if (node.degree) {
                    return `\\sqrt[${render(node.degree, depth)}]{${render(node.value, depth)}}`;
                }
                return `\\sqrt{${render(node.value, depth)}}`;
            default:
                return '';
        }
    }

    function renderDivision(left, right, depth = 0) {
        if (left.type === 'mul') {
            const factors = flattenMul(left);
            const last = factors.pop();
            const prefix = factors.map((factor) => render(factor, depth)).join(' ');
            const fraction = `\\frac{${render(last, depth)}}{${render(right, depth)}}`;
            return prefix ? `${prefix} ${fraction}` : fraction;
        }
        return `\\frac{${render(left, depth)}}{${render(right, depth)}}`;
    }

    function flattenMul(node) {
        if (!node) return [];
        if (node.type === 'mul') {
            return [...flattenMul(node.left), ...flattenMul(node.right)];
        }
        return [node];
    }

    function wrapPowBase(node, depth = 0) {
        if (!node) return '';
        if (['add', 'sub', 'div'].includes(node.type)) {
            return `(${render(node, depth)})`;
        }
        return render(node, depth);
    }

    // normalize combined subscript/superscript order so rendering is consistent
    function normalizeSubSuper(node) {
        if (!node || typeof node !== 'object') return node;
        // recursively normalize children first
        const copy = Object.assign({}, node);
        switch (copy.type) {
            case 'add': case 'sub': case 'mul': case 'div': case 'eq':
                copy.left = normalizeSubSuper(copy.left);
                copy.right = normalizeSubSuper(copy.right);
                return copy;
            case 'pow':
                copy.left = normalizeSubSuper(copy.left);
                copy.right = normalizeSubSuper(copy.right);
                // if left is subscript(base, sub) -> convert to subsup (suffix)
                if (copy.left && copy.left.type === 'subscript') {
                    return {
                        type: 'subsup',
                        base: normalizeSubSuper(copy.left.left),
                        sub: normalizeSubSuper(copy.left.right),
                        sup: normalizeSubSuper(copy.right),
                        prefix: false
                    };
                }
                return copy;
            case 'subscript':
                copy.left = normalizeSubSuper(copy.left);
                copy.right = normalizeSubSuper(copy.right);
                // if left is pow(base, sup) -> convert to subsup (suffix)
                if (copy.left && copy.left.type === 'pow') {
                    return {
                        type: 'subsup',
                        base: normalizeSubSuper(copy.left.left),
                        sub: normalizeSubSuper(copy.right),
                        sup: normalizeSubSuper(copy.left.right),
                        prefix: false
                    };
                }
                return copy;
            case 'func':
                copy.args = (copy.args || []).map(normalizeSubSuper);
                return copy;
            case 'group':
                copy.expr = normalizeSubSuper(copy.expr);
                return copy;
            case 'sqrt':
                copy.value = normalizeSubSuper(copy.value);
                return copy;
            case 'root':
                copy.degree = normalizeSubSuper(copy.degree);
                copy.value = normalizeSubSuper(copy.value);
                return copy;
            default:
                return copy;
        }
    }

    const firstAst = parseExpression();
    if (/=|\r?\n/.test(raw)) {
        try { console.log('convertExpressionToLatex AST (first):', firstAst); } catch (e) {}
    }
    const parts = [firstAst];
    while (pos < tokens.length) {
        const nextAst = parseExpression();
        parts.push(nextAst);
    }
    const normalizedParts = parts.map((p) => normalizeSubSuper(p));
    const out = normalizedParts.map((p) => render(p)).join(' ');
    return out.trim();
}

async function openEquationDialog({ editor, context, options }) {
    const dialogResult = createEquationDialog({
        editor,
        context,
        initialSource: options?.initialLatex || ''
    });

    const result = await editor.dialog.open({
        title: 'Equation Builder',
        html: dialogResult.container,
        showCloseButton: true,
        showCancelButton: true,
        confirmButtonText: 'Insert',
        cancelButtonText: 'Cancel',
        focusConfirm: false,
        width: '920px',
        customClass: {
            popup: 'qmx-equation-modal-popup',
            title: 'qmx-equation-modal-title',
            content: 'qmx-equation-modal-content',
            confirmButton: 'qmx-equation-modal-confirm',
            cancelButton: 'qmx-equation-modal-cancel'
        },
        didOpen: () => {
            setTimeout(() => {
                const input = document.getElementById('qmx-equation-input');
                if (input) {
                    dialogResult.setInitialValue();
                    dialogResult.installSymbolLibraryMenuItem();
                    input.focus();
                    if (typeof input.executeCommand === 'function') {
                        input.executeCommand('moveToMathfieldEnd');
                    } else if (typeof input.setSelectionRange === 'function') {
                        input.setSelectionRange(input.value.length, input.value.length);
                    }
                }
            }, 10);
        },
        preConfirm: () => {
            const state = dialogResult.getState();
            const value = state?.latex || state?.expression || '';
            if (!String(value).trim()) {
                Swal.showValidationMessage('Please enter an equation.');
                return false;
            }
            return state;
        }
    });

    if (!result.isConfirmed || !result.value) {
        return null;
    }

    const state = result.value;
    editor.setToolState('equation', state, context?.id || 'default');
    return state;
}

function generateLatex(payload) {
    if (!payload) return '';
    if (payload.latex) {
        const latex = String(payload.latex || '').trim();
        if (!latex) return '';
        const isDisplayMath = /\\begin\{(?:bmatrix|pmatrix|matrix|array|aligned|cases)\}|\\\\/.test(latex);
        return isDisplayMath ? `\\[${latex}\\]` : `\\(${latex}\\)`;
    }
    if (payload.expression) {
        const raw = String(payload.expression || '');
        // if multiple lines, create separate display blocks for each non-empty line
        if (/\r?\n/.test(raw)) {
            const lines = raw.split(/\r?\n/).map((ln) => String(ln || '').trim()).filter(Boolean);
            if (lines.length === 0) return '';
            const convertedLines = lines.map((ln) => convertExpressionToLatex(ln));
            // use an array environment with left column alignment so every line is left-aligned
            const body = convertedLines.join(' \\\\ ');
            return `\\[\\begin{array}{l}\n${body}\n\\end{array}\\]`;
        }

        const converted = convertExpressionToLatex(raw);
        const isDisplayMatrix = /\\begin\{bmatrix\}|\\begin\{array\}|\\\\/.test(converted);
        return isDisplayMatrix ? `\\[${converted}\\]` : `\\(${converted}\\)`;
    }
    return '';
}

function toolInsert({ editor, textarea, latex }) {
    return editor.insertLatex(textarea, latex);
}

function toolExecute({ editor, textarea, context, payload, latex, options }) {
    // payload contains { expression }
    const finalLatex = generateLatex(payload) || latex;
    if (!finalLatex) return null;
    try { console.log('Equation.toolExecute inserting latex:', finalLatex); } catch (e) {}
    return editor.insertLatex(textarea, finalLatex, options);
}

function toolOpen(editor, options = {}) {
    return editor.openTool('equation', options);
}

window.MathEditor.registerTool({
    id: 'equation',
    metadata: {
        label: 'Equation',
        icon: '∑',
        category: 'algebra',
        description: 'Build and insert LaTeX equations with fractions, powers, roots, and brackets.',
        keywords: ['equation', 'fraction', 'superscript', 'subscript', 'sqrt', 'brackets'],
        shortcut: 'Ctrl+Alt+E',
        order: 95
    },
    dialog: openEquationDialog,
    generateLatex,
    insert: toolInsert,
    execute: toolExecute,
    open: toolOpen,
    render: () => null,
    destroy: () => null
});
