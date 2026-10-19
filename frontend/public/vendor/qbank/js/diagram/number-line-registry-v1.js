(function (window) {
    'use strict';

    const current = window.QmxDiagramRegistry;
    if (!current?.tools || !current?.subjects) return;

    const TOOL_ID = 'number-line';
    const tool = Object.freeze({
        id: TOOL_ID,
        label: 'Number Line / Interval / Inequality',
        labelBn: 'সংখ্যারেখা / ব্যবধান / অসমতা',
        category: 'mathematics',
        badge: 'NLINE',
        description: 'Open and closed endpoints, intervals, rays, unions and compound inequalities.',
        status: 'planned'
    });

    const tools = Array.from(current.tools);
    if (!tools.some((item) => item.id === TOOL_ID)) {
        const coordinateIndex = tools.findIndex((item) => item.id === 'coordinate-geometry');
        tools.splice(coordinateIndex >= 0 ? coordinateIndex + 1 : tools.length, 0, tool);
    }

    const subjects = Array.from(current.subjects, (subject) => {
        const copy = { ...subject, aliases: Array.from(subject.aliases || []) };
        const recommended = Array.from(subject.recommended || []);
        if (['mathematics', 'higher-mathematics'].includes(copy.id) && !recommended.includes(TOOL_ID)) {
            const coordinateIndex = recommended.indexOf('coordinate-geometry');
            recommended.splice(coordinateIndex >= 0 ? coordinateIndex + 1 : 0, 0, TOOL_ID);
        }
        copy.recommended = recommended;
        return Object.freeze(copy);
    });

    const frozenTools = Object.freeze(tools.map((item) => Object.freeze({ ...item })));
    const frozenSubjects = Object.freeze(subjects);
    const categoryLabels = current.categoryLabels;
    const normalize = (value) => String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

    function findSubject(id) { return frozenSubjects.find((subject) => subject.id === id) || frozenSubjects[0]; }
    function findTool(id) { return frozenTools.find((item) => item.id === id) || null; }
    function detectSubject(label) {
        const value = normalize(label);
        if (!value) return frozenSubjects[0];
        let best = frozenSubjects[0];
        let score = 0;
        frozenSubjects.forEach((subject) => {
            (subject.aliases || []).forEach((alias) => {
                const normalizedAlias = normalize(alias);
                let nextScore = 0;
                if (value === normalizedAlias) nextScore = 1000 + normalizedAlias.length;
                else if (value.includes(normalizedAlias)) nextScore = 500 + normalizedAlias.length;
                else if (normalizedAlias.includes(value)) nextScore = 100 + value.length;
                if (nextScore > score) { best = subject; score = nextScore; }
            });
        });
        return best;
    }

    window.QmxDiagramRegistry = Object.freeze({
        version: '1.2.0', tools: frozenTools, subjects: frozenSubjects,
        categoryLabels, findSubject, findTool, detectSubject
    });
})(window);
