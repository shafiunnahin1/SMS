(function (window) {
    'use strict';

    const current = window.QmxDiagramRegistry;
    if (!current?.tools || !current?.subjects) return;

    const TOOL_ID = 'statistical-diagram';
    const tool = Object.freeze({
        id: TOOL_ID,
        label: 'Statistical Diagram / Data Chart',
        labelBn: 'পরিসংখ্যান চিত্র / ডেটা চার্ট',
        category: 'mathematics',
        badge: 'STAT',
        description: 'Bar charts, histograms, frequency polygons, ogives, pie charts, box plots and scatter plots.',
        status: 'planned'
    });

    const tools = Array.from(current.tools, (item) => Object.freeze({ ...item }));
    const existingIndex = tools.findIndex((item) => item.id === TOOL_ID);
    if (existingIndex >= 0) tools.splice(existingIndex, 1, tool);
    else {
        const technicalIndex = tools.findIndex((item) => item.id === 'technical-drawing');
        tools.splice(technicalIndex >= 0 ? technicalIndex + 1 : tools.length, 0, tool);
    }

    const recommendedSubjects = new Set(['general', 'higher-mathematics', 'economics', 'business']);
    const subjects = Array.from(current.subjects, (subject) => {
        const copy = { ...subject, aliases: Array.from(subject.aliases || []) };
        const recommended = Array.from(subject.recommended || []);
        if (recommendedSubjects.has(copy.id) && !recommended.includes(TOOL_ID)) {
            const anchor = recommended.indexOf('technical-drawing');
            recommended.splice(anchor >= 0 ? anchor + 1 : recommended.length, 0, TOOL_ID);
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
        version: '1.5.0',
        tools: frozenTools,
        subjects: frozenSubjects,
        categoryLabels,
        findSubject,
        findTool,
        detectSubject
    });
})(window);
