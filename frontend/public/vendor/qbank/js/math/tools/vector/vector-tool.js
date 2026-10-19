import { buildVectorLatex, escapeLatex } from '../../core/utils.js';

async function openVectorDialog({ editor, context }) {
    const previousState = editor.getToolState('vector', context?.id || 'default') || null;
    const previousOrientation = previousState?.orientation || 'column';
    const previousLength = previousState?.length || 3;
    const previousValues = Array.isArray(previousState?.values) ? previousState.values : [];

    const settings = await editor.dialog.open({
        title: 'Vector settings',
        html:
            '<div style="display:grid;gap:12px;max-width:100%;text-align:left;">' +
            '<label style="font-size:13px;color:#334155;">Orientation<br>' +
            '<select id="swal-vector-orientation" class="swal2-input" style="width:100%;">' +
            '<option value="column"' + (previousOrientation === 'column' ? ' selected' : '') + '>Column</option>' +
            '<option value="row"' + (previousOrientation === 'row' ? ' selected' : '') + '>Row</option>' +
            '</select></label>' +
            '<label style="font-size:13px;color:#334155;">Length<br>' +
            '<input id="swal-vector-length" type="number" class="swal2-input" min="1" max="10" value="' + previousLength + '" style="width:100%;"></label>' +
            '</div>',
        showCancelButton: true,
        confirmButtonText: 'Next',
        customClass: {
            popup: 'qmx-math-dialog-popup',
            htmlContainer: 'qmx-math-dialog-content'
        },
        preConfirm: () => {
            const orientation = document.getElementById('swal-vector-orientation')?.value || 'column';
            const length = parseInt(document.getElementById('swal-vector-length')?.value || '0', 10);
            if (Number.isNaN(length) || length < 1) {
                Swal.showValidationMessage('Enter a valid vector length.');
                return false;
            }
            return { orientation, length };
        }
    });

    if (!settings.isConfirmed || !settings.value) {
        return null;
    }

    const { orientation, length } = settings.value;
    const inputsHtml = Array.from({ length }, (_, index) => {
        const value = previousValues[index] || '';
        return '<input id="swal-vector-cell-' + (index + 1) + '" class="swal2-input" placeholder="v' + (index + 1) + '" value="' + escapeLatex(value) + '" style="width:100%;box-sizing:border-box;text-align:center;">';
    }).join('');

    const valuesResult = await editor.dialog.open({
        title: 'Vector values',
        html: '<div style="display:grid;gap:8px;max-width:100%;">' + inputsHtml + '</div>',
        showCancelButton: true,
        confirmButtonText: 'Insert',
        focusConfirm: false,
        customClass: {
            popup: 'qmx-math-dialog-popup',
            htmlContainer: 'qmx-math-dialog-content'
        },
        preConfirm: () => {
            const values = [];
            for (let i = 1; i <= length; i++) {
                const input = document.getElementById('swal-vector-cell-' + i);
                values.push(input ? escapeLatex(input.value.trim() || '0') : '0');
            }
            return values;
        }
    });

    if (!valuesResult.isConfirmed || !valuesResult.value) {
        return null;
    }

    const state = {
        orientation,
        values: valuesResult.value,
        length
    };
    editor.setToolState('vector', state, context?.id || 'default');
    return state;
}

function generateLatex(payload) {
    return buildVectorLatex(payload.values, payload.orientation);
}

function toolInsert({ editor, textarea, latex }) {
    return editor.insertLatex(textarea, latex);
}

function toolOpen(editor, options = {}) {
    return editor.openTool('vector', options);
}

window.MathEditor.registerTool({
    id: 'vector',
    metadata: {
        label: 'Vector',
        icon: 'vector',
        category: 'algebra',
        description: 'Insert a row or column vector with values.',
        keywords: ['vector', 'column', 'row', 'array'],
        shortcut: 'Ctrl+Alt+V',
        order: 110
    },
    dialog: openVectorDialog,
    generateLatex,
    insert: toolInsert,
    open: toolOpen,
    render: () => null,
    destroy: () => null
});

window.MathVector = {
    openVectorBuilder(textarea) {
        return window.MathEditor.openTool('vector', { textarea });
    }
};
