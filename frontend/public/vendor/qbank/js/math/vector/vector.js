window.MathVector = {
    __deprecated: true,
    openVectorBuilder(textarea) {
        if (window.MathEditor && typeof window.MathEditor.openTool === 'function') {
            return window.MathEditor.openTool('vector', { textarea });
        }

        if (!textarea) {
            return null;
        }

        return null;
    }
};
