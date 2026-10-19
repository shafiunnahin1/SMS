import { buildMatrixLatex, escapeLatex } from '../../core/utils.js';

function matrixInputHtml(rows, cols, initialMatrix = []) {
    let html = '<div class="qmx-matrix-grid-wrap" style="max-width:100%;overflow:auto;padding:4px;"><div style="display:grid;grid-template-columns:repeat(' + cols + ', minmax(64px, 1fr));gap:8px;width:max-content;min-width:100%;">';
    for (let row = 1; row <= rows; row++) {
        for (let col = 1; col <= cols; col++) {
            const value = initialMatrix[row - 1]?.[col - 1] || '';
            html += '<input id="swal-matrix-cell-' + row + '-' + col + '" class="swal2-input" placeholder="a' + row + col + '" value="' + escapeLatex(value) + '" style="width:64px;min-width:64px;max-width:64px;box-sizing:border-box;text-align:center;">';
        }
    }
    html += '</div></div>';
    return html;
}

async function openMatrixDialog({ editor, context }) {
    const previousState = editor.getToolState('matrix', context?.id || 'default') || null;
    const initialRows = previousState?.rows || 2;
    const initialCols = previousState?.cols || 2;
    const initialBracketType = previousState?.bracketType || 'pmatrix';
    const initialMatrix = Array.isArray(previousState?.matrix) ? previousState.matrix : [];
    const result = await editor.dialog.open({
        title: 'Matrix dimensions',
        html:
            '<div style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">' +
            '<label style="display:flex;flex-direction:column;text-align:left;font-size:13px;color:#334155;">Rows<br><input id="swal-matrix-rows" type="number" class="swal2-input" min="1" max="12" value="' + initialRows + '" style="width:100px;"></label>' +
            '<label style="display:flex;flex-direction:column;text-align:left;font-size:13px;color:#334155;">Columns<br><input id="swal-matrix-cols" type="number" class="swal2-input" min="1" max="12" value="' + initialCols + '" style="width:100px;"></label>' +
            '<label style="display:flex;flex-direction:column;text-align:left;font-size:13px;color:#334155;">Bracket<br><select id="swal-matrix-bracket" class="swal2-input" style="width:100px;">' +
            '<option value="pmatrix"' + (initialBracketType === 'pmatrix' ? ' selected' : '') + '>( )</option>' +
            '<option value="bmatrix"' + (initialBracketType === 'bmatrix' ? ' selected' : '') + '> [ ]</option>' +
            '<option value="Bmatrix"' + (initialBracketType === 'Bmatrix' ? ' selected' : '') + '>\{ \}</option>' +
            '<option value="vmatrix"' + (initialBracketType === 'vmatrix' ? ' selected' : '') + '>| |</option>' +
            '<option value="Vmatrix"' + (initialBracketType === 'Vmatrix' ? ' selected' : '') + '>\| \|</option>' +
            '</select></label>' +
            '</div>',
        showCancelButton: true,
        confirmButtonText: 'Next',
        customClass: {
            popup: 'qmx-math-dialog-popup',
            htmlContainer: 'qmx-math-dialog-content'
        },
        preConfirm: () => {
            const rows = parseInt(document.getElementById('swal-matrix-rows')?.value || '0', 10);
            const cols = parseInt(document.getElementById('swal-matrix-cols')?.value || '0', 10);
            const bracketType = document.getElementById('swal-matrix-bracket')?.value || 'pmatrix';
            if (Number.isNaN(rows) || rows < 1 || Number.isNaN(cols) || cols < 1) {
                Swal.showValidationMessage('Enter valid row and column counts.');
                return false;
            }
            return { rows, cols, bracketType };
        }
    });

    if (!result.isConfirmed || !result.value) {
        return null;
    }

    const { rows, cols, bracketType } = result.value;
    const valueResult = await editor.dialog.open({
        title: 'Matrix values',
        html: matrixInputHtml(rows, cols, initialMatrix),
        showCancelButton: true,
        confirmButtonText: 'Insert',
        focusConfirm: false,
        customClass: {
            popup: 'qmx-math-dialog-popup',
            htmlContainer: 'qmx-math-dialog-content'
        },
        preConfirm: () => {
            const matrix = [];
            for (let row = 1; row <= rows; row++) {
                const line = [];
                for (let col = 1; col <= cols; col++) {
                    const input = document.getElementById('swal-matrix-cell-' + row + '-' + col);
                    line.push(input ? escapeLatex(input.value.trim() || '0') : '0');
                }
                matrix.push(line);
            }
            return matrix;
        }
    });

    if (!valueResult.isConfirmed || !valueResult.value) {
        return null;
    }

    const state = {
        rows,
        cols,
        bracketType,
        matrix: valueResult.value
    };
    editor.setToolState('matrix', state, context?.id || 'default');
    return state;
}

function generateLatex(payload) {
    if (!payload || !Array.isArray(payload.matrix)) {
        return '';
    }
    return buildMatrixLatex(payload.matrix, payload.bracketType);
}

function toolInsert({ editor, textarea, latex }) {
    return editor.insertLatex(textarea, latex);
}

function toolOpen(editor, options = {}) {
    return editor.openTool('matrix', options);
}

window.MathEditor.registerTool({
    id: 'matrix',
    metadata: {
        label: 'Matrix',
        icon: 'matrix',
        category: 'algebra',
        description: 'Insert a matrix using a guided builder.',
        keywords: ['matrix', 'array', 'linear algebra', 'bracket'],
        shortcut: 'Ctrl+Alt+M',
        order: 100
    },
    dialog: openMatrixDialog,
    generateLatex,
    insert: toolInsert,
    open: toolOpen,
    render: () => null,
    destroy: () => null
});

window.MathMatrix = {
    openMatrixBuilder(textarea) {
        return window.MathEditor.openTool('matrix', { textarea });
    }
};
