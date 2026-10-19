window.MathMatrix = {
    __deprecated: true,
    openMatrixBuilder(textarea) {
        if (window.MathEditor && typeof window.MathEditor.openTool === 'function') {
            return window.MathEditor.openTool('matrix', { textarea });
        }

        if (!textarea) {
            return null;
        }

        return null;
    }
};
