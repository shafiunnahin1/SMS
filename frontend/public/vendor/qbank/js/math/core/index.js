import './editor.js';
import './toolbar.js?v=20260806-ribbon-wrap-1';
import './command-palette.js';
import './shortcut-manager.js';
import '../tools/matrix/matrix-tool.js';
import '../tools/vector/vector-tool.js';
import '../tools/equation/equation-tool.js?v=20260730-table-cell-equation-3';
import '../tools/graph/graph-tool.js?v=20260801-guest-browser-storage-1';

if (window.MathEditor) {
    window.MathEditor.eventBus.emit('mathEditorReady', window.MathEditor);
}
