import {
    normalizeShortcut,
    shortcutMatchesEvent
} from './tool-utils.js';

const SHORTCUT_KEYMAP = new Map();

function registerShortcut(tool) {
    if (!tool || !tool.id || !tool.metadata?.shortcut) {
        return;
    }
    const normalized = normalizeShortcut(tool.metadata.shortcut);
    if (!normalized) {
        return;
    }

    if (SHORTCUT_KEYMAP.has(normalized)) {
        console.warn(`MathEditor shortcut conflict: ${normalized} already registered by ${SHORTCUT_KEYMAP.get(normalized).id}`);
    }
    SHORTCUT_KEYMAP.set(normalized, tool);
}

function handleShortcutEvent(event) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target.isContentEditable) {
        return;
    }

    for (const [shortcut, tool] of SHORTCUT_KEYMAP.entries()) {
        if (shortcutMatchesEvent(event, shortcut)) {
            event.preventDefault();
            window.MathEditor?.openTool(tool.id);
            return;
        }
    }
}

function initializeShortcutManager() {
    window.addEventListener('keydown', handleShortcutEvent);

    const editor = window.MathEditor;
    if (editor) {
        editor.eventBus.on('toolRegistered', registerShortcut);
        editor.getTools().forEach(registerShortcut);
    }
}

initializeShortcutManager();
