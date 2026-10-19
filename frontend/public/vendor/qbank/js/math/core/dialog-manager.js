export class DialogManager {
    constructor(editor) {
        this.editor = editor;
        this.activeToolId = null;
        this.activeDialog = null;
    }

    setActiveTool(tool) {
        this.activeToolId = tool?.id || null;
        return this.activeToolId;
    }

    open(options = {}) {
        if (!window.Swal) {
            return Promise.reject(new Error('SweetAlert2 is required'));
        }
        this.activeDialog = window.Swal.fire(options);
        this.emit('dialogOpen', { options });
        return this.activeDialog;
    }

    close() {
        if (window.Swal?.close) {
            window.Swal.close();
        }
        this.activeDialog = null;
        this.emit('dialogClosed');
    }

    restoreToolState(toolId, state, contextId = 'default') {
        if (!this.editor?.setToolState) {
            return null;
        }
        return this.editor.setToolState(toolId, state, contextId);
    }

    emit(eventName, payload = {}) {
        if (!this.editor?.eventBus) {
            return;
        }
        this.editor.eventBus.emit(eventName, {
            toolId: this.activeToolId,
            dialog: this.activeDialog,
            ...payload
        });
    }
}

export default DialogManager;
