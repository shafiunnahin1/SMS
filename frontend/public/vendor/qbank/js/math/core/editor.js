import {
    validateToolContract,
    ensureToolMetadata
} from './tool-utils.js';
import DialogManager from './dialog-manager.js';

(function (window) {
    if (window.MathEditor) {
        return;
    }

    class EventBus {
        constructor() {
            this.handlers = new Map();
        }

        on(event, callback) {
            if (!this.handlers.has(event)) {
                this.handlers.set(event, []);
            }
            this.handlers.get(event).push(callback);
        }

        off(event, callback) {
            const list = this.handlers.get(event);
            if (!list) {
                return;
            }
            this.handlers.set(event, list.filter((item) => item !== callback));
        }

        emit(event, payload) {
            const list = this.handlers.get(event) || [];
            list.forEach((callback) => callback(payload));
        }
    }

    class SelectionManager {
        getSelection(textarea) {
            if (!textarea) {
                return null;
            }
            return {
                start: textarea.selectionStart,
                end: textarea.selectionEnd,
                text: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)
            };
        }

        replaceSelection(textarea, text, { moveCursorToEnd = true } = {}) {
            if (!textarea) {
                return null;
            }
            const start = textarea.selectionStart;
            textarea.setRangeText(text, start, textarea.selectionEnd, 'end');
            textarea.focus();
            if (moveCursorToEnd) {
                const cursor = start + text.length;
                textarea.setSelectionRange(cursor, cursor);
            }
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            return {
                start,
                text,
                end: textarea.selectionEnd
            };
        }
    }

    class InsertEngine {
        constructor(editor) {
            this.editor = editor;
        }

        insert(textarea, latex, { wrapWithNewlines = true } = {}) {
            if (!textarea || !latex) {
                return null;
            }
            const content = wrapWithNewlines ? `\n${latex}\n` : latex;
            const before = textarea.value;
            const start = textarea.selectionStart;
            const result = this.editor.selection.replaceSelection(textarea, content, { moveCursorToEnd: true });
            const after = textarea.value;
            this.editor.history.record({
                type: 'insert',
                textarea,
                start,
                before,
                after,
                text: content
            });
            this.editor.eventBus.emit('contentInserted', {
                textarea,
                latex,
                result,
                before,
                after
            });
            return { before, after, start, text: content };
        }
    }

    class EditorContext {
        constructor(textarea, id = 'default') {
            this.id = id;
            this.textarea = textarea;
            this.active = false;
        }

        getSelection() {
            if (!this.textarea) {
                return null;
            }
            return {
                start: this.textarea.selectionStart,
                end: this.textarea.selectionEnd,
                text: this.textarea.value.slice(this.textarea.selectionStart, this.textarea.selectionEnd)
            };
        }
    }

    class ContextManager {
        constructor() {
            this.contexts = new Map();
            this.activeContextId = null;
        }

        register(textarea, id = 'default') {
            if (!textarea) {
                return null;
            }
            const context = new EditorContext(textarea, id);
            this.contexts.set(id, context);
            this.activeContextId = id;
            return context;
        }

        get(id = this.activeContextId) {
            return this.contexts.get(id) || null;
        }

        getActive() {
            return this.get(this.activeContextId);
        }

        setActive(id) {
            if (this.contexts.has(id)) {
                this.activeContextId = id;
            }
        }

        getOrCreate(textarea, id = 'default') {
            const existing = this.get(id);
            if (existing) {
                existing.textarea = textarea;
                return existing;
            }
            return this.register(textarea, id);
        }
    }

    class HistoryManager {
        constructor() {
            this.stack = [];
            this.index = -1;
        }

        record(action) {
            this.stack = this.stack.slice(0, this.index + 1);
            this.stack.push(action);
            this.index = this.stack.length - 1;
        }

        canUndo() {
            return this.index >= 0;
        }

        canRedo() {
            return this.index < this.stack.length - 1;
        }

        undo() {
            const action = this.stack[this.index];
            if (!action || action.type !== 'insert' || !action.textarea) {
                return;
            }
            action.textarea.value = action.before;
            action.textarea.dispatchEvent(new Event('input', { bubbles: true }));
            this.index -= 1;
        }

        redo() {
            const next = this.stack[this.index + 1];
            if (!next || next.type !== 'insert' || !next.textarea) {
                return;
            }
            next.textarea.value = next.after;
            next.textarea.dispatchEvent(new Event('input', { bubbles: true }));
            this.index += 1;
        }
    }

    class CursorManager {
        moveTo(textarea, position) {
            if (!textarea) {
                return;
            }
            textarea.setSelectionRange(position, position);
            textarea.focus();
        }

        moveBy(textarea, offset) {
            if (!textarea) {
                return;
            }
            const position = textarea.selectionEnd + offset;
            this.moveTo(textarea, position);
        }
    }

    class PlaceholderManager {
        constructor(editor) {
            this.editor = editor;
        }

        navigateNext(textarea) {
            if (!textarea) {
                return;
            }
            const value = textarea.value;
            const placeholderMatch = value.slice(textarea.selectionEnd).match(/\{\{[^}]+\}\}/);
            if (!placeholderMatch) {
                return;
            }
            const position = textarea.selectionEnd + placeholderMatch.index;
            textarea.setSelectionRange(position, position + placeholderMatch[0].length);
            textarea.focus();
        }
    }

    class TemplateEngine {
        render(template, context = {}) {
            return String(template).replace(/{{\s*([\w]+)\s*}}/g, (match, key) => {
                if (Object.prototype.hasOwnProperty.call(context, key)) {
                    return context[key];
                }
                return match;
            });
        }
    }

    class PreviewManager {
        constructor() {
            this.target = null;
        }

        setTarget(element) {
            this.target = element;
        }

        update(latex) {
            if (!this.target || !window.katex) {
                return;
            }
            try {
                window.katex.render(latex, this.target, { throwOnError: false });
            } catch (error) {
                this.target.textContent = latex;
            }
        }
    }

    class ToolStateManager {
        constructor() {
            this.states = new Map();
        }

        get(toolId, contextId = 'default') {
            const key = `${contextId}:${toolId}`;
            return this.states.get(key) || null;
        }

        set(toolId, state, contextId = 'default') {
            const key = `${contextId}:${toolId}`;
            this.states.set(key, state);
            return state;
        }

        clear(toolId, contextId = 'default') {
            const key = `${contextId}:${toolId}`;
            this.states.delete(key);
        }
    }

    class ToolRegistry {
        constructor() {
            this.tools = new Map();
        }

        register(tool) {
            if (!tool || !tool.id) {
                throw new Error('Tool definition must include id');
            }
            if (this.tools.has(tool.id)) {
                console.warn(`MathEditor tool replaced: ${tool.id}`);
            }
            this.tools.set(tool.id, tool);
        }

        get(id) {
            return this.tools.get(id);
        }

        getAll() {
            return Array.from(this.tools.values());
        }
    }

    class MathEditor {
        constructor() {
            this.eventBus = new EventBus();
            this.selection = new SelectionManager();
            this.history = new HistoryManager();
            this.cursor = new CursorManager();
            this.placeholder = new PlaceholderManager(this);
            this.template = new TemplateEngine();
            this.dialog = new DialogManager(this);
            this.preview = new PreviewManager();
            this.contextManager = new ContextManager();
            this.toolRegistry = new ToolRegistry();
            this.toolStateManager = new ToolStateManager();
            this.insertEngine = new InsertEngine(this);
            this.activeTextarea = null;

            document.addEventListener('DOMContentLoaded', () => {
                const textarea = document.querySelector('[data-editor-textarea]');
                if (textarea) {
                    this.setActiveTextarea(textarea);
                }
                document.addEventListener('focusin', (event) => {
                    const target = event.target;
                    if (target && target.tagName === 'TEXTAREA') {
                        this.setActiveTextarea(target);
                    }
                });
            });
        }

        setActiveTextarea(textarea, contextId = null) {
            if (!textarea) {
                return;
            }

            const resolvedContextId = contextId || textarea.dataset.mathEditorContext || textarea.id || 'default';
            const context = this.contextManager.getOrCreate(textarea, resolvedContextId);
            if (!context) {
                return;
            }
            this.contextManager.setActive(context.id);
            this.activeTextarea = textarea;
            this.eventBus.emit('activeTextareaChanged', { textarea, context });
        }

        getActiveTextarea() {
            return this.activeTextarea;
        }

        getContext(id = this.contextManager.activeContextId) {
            return this.contextManager.get(id);
        }

        getActiveContext() {
            return this.contextManager.getActive();
        }

        registerTool(tool) {
            validateToolContract(tool);
            ensureToolMetadata(tool);

            const defaultInsert = ({ editor, textarea, latex }) => editor.insertLatex(textarea, latex);
            if (!tool.insert) {
                tool.insert = defaultInsert;
            }
            if (!tool.open) {
                tool.open = (editor, options = {}) => editor.openTool(tool.id, options);
            }
            if (!tool.render) {
                tool.render = () => null;
            }
            if (!tool.destroy) {
                tool.destroy = () => null;
            }
            if (!tool.execute) {
                tool.execute = ({ editor, textarea, context, payload, latex, options }) => tool.insert({ editor, textarea, context, payload, latex, options });
            }

            this.toolRegistry.register(tool);
            this.eventBus.emit('toolRegistered', tool);
        }

        getTool(id) {
            return this.toolRegistry.get(id);
        }

        getTools() {
            return this.toolRegistry.getAll().sort((a, b) => {
                const orderA = Number.isFinite(a.metadata?.order) ? a.metadata.order : Number.MAX_SAFE_INTEGER;
                const orderB = Number.isFinite(b.metadata?.order) ? b.metadata.order : Number.MAX_SAFE_INTEGER;
                return orderA - orderB;
            });
        }

        async openTool(id, options = {}) {
            const tool = this.getTool(id);
            if (!tool) {
                return null;
            }
            const textarea = options.textarea || this.activeTextarea;
            if (!textarea) {
                return null;
            }
            const context = this.contextManager.getOrCreate(
                textarea,
                options.contextId || textarea.dataset.mathEditorContext || textarea.id || 'default'
            );
            this.dialog.setActiveTool(tool);
            const payload = await tool.dialog({ textarea, editor: this, context, options });
            if (!payload) {
                return null;
            }
            const latex = tool.generateLatex(payload);
            if (!latex) {
                return null;
            }
            return tool.execute({ editor: this, textarea, context, payload, latex, options });
        }

        insertLatex(textarea, latex, options = {}) {
            return this.insertEngine.insert(textarea, latex, options);
        }

        getToolState(toolId, contextId = 'default') {
            return this.toolStateManager.get(toolId, contextId);
        }

        setToolState(toolId, state, contextId = 'default') {
            return this.toolStateManager.set(toolId, state, contextId);
        }

        clearToolState(toolId, contextId = 'default') {
            this.toolStateManager.clear(toolId, contextId);
        }
    }

    window.MathEditor = new MathEditor();
})(window);
