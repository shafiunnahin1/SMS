import { renderToolList } from './tool-renderer.js';

const COMMAND_PALETTE_ID = 'qmx-command-palette';
const COMMAND_PALETTE_INPUT_ID = 'qmx-command-palette-input';
const PALETTE_VISIBLE_CLASS = 'qmx-command-palette--visible';

function normalizeQuery(value) {
    return String(value || '').trim().toLowerCase();
}

function createsPalette() {
    let palette = document.getElementById(COMMAND_PALETTE_ID);
    if (palette) {
        return palette;
    }

    palette = document.createElement('div');
    palette.id = COMMAND_PALETTE_ID;
    palette.className = 'qmx-command-palette';
    palette.innerHTML = `
        <div class="qmx-command-palette-shell">
            <input id="${COMMAND_PALETTE_INPUT_ID}" class="qmx-command-palette-input" type="search" placeholder="Type a math tool or command..." autocomplete="off" />
            <div class="qmx-command-palette-list"></div>
        </div>
    `;
    document.body.appendChild(palette);

    const input = palette.querySelector('input');
    input.addEventListener('input', renderCommandPalette);
    input.addEventListener('keydown', handlePaletteKeyboard);

    palette.addEventListener('click', (event) => {
        if (event.target === palette) {
            hideCommandPalette();
        }
    });

    return palette;
}

function renderCommandPalette() {
    const palette = createsPalette();
    const input = palette.querySelector('input');
    const list = palette.querySelector('.qmx-command-palette-list');
    const query = input.value;
    const editor = window.MathEditor;

    if (!editor) {
        return;
    }

    renderToolList({
        container: list,
        tools: editor.getTools(),
        query,
        emptyMessage: 'No tools match that query.',
        emptyClassName: 'qmx-command-palette-empty',
        buttonClassName: 'qmx-command-item',
        groupByCategory: false,
        contentBuilder: (tool) => {
            const label = tool.metadata?.label || tool.id;
            const description = tool.metadata?.description || '';
            const shortcut = tool.metadata?.shortcut ? ` (${tool.metadata.shortcut})` : '';
            return `
                <div class="qmx-command-item-label">${label}${shortcut}</div>
                <div class="qmx-command-item-description">${description}</div>
            `;
        },
        onToolSelect: (tool) => {
            editor.openTool(tool.id);
            hideCommandPalette();
        }
    });
}

function showCommandPalette() {
    const palette = createsPalette();
    palette.classList.add(PALETTE_VISIBLE_CLASS);
    const input = palette.querySelector('input');
    input.value = '';
    renderCommandPalette();
    input.focus();
}

function hideCommandPalette() {
    const palette = document.getElementById(COMMAND_PALETTE_ID);
    if (!palette) {
        return;
    }
    palette.classList.remove(PALETTE_VISIBLE_CLASS);
}

function handlePaletteKeyboard(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        hideCommandPalette();
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault();
        const first = document.querySelector('#' + COMMAND_PALETTE_ID + ' .qmx-command-item');
        first?.click();
    }
}

function registerPaletteShortcut() {
    window.addEventListener('keydown', (event) => {
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const isCtrl = event.ctrlKey || (isMac && event.metaKey);
        if (
            event.key.toLowerCase() === 'p'
            && event.shiftKey
            && isCtrl
            && !event.altKey
        ) {
            event.preventDefault();
            showCommandPalette();
        }
    });
}

registerPaletteShortcut();
