(function (window) {
    'use strict';
    const current = window.QmxDiagramRegistry;
    if (!current?.tools || !current?.subjects) return;
    const TOOL_ID = 'plant-anatomy';
    const tool = Object.freeze({
        id: TOOL_ID,
        label: 'Plant Anatomy / Botanical Structure Diagram',
        labelBn: 'উদ্ভিদ অঙ্গসংস্থান / বোটানি চিত্র',
        category: 'biology',
        badge: 'BOTANY',
        description: 'Whole plants, roots, stems, leaves, flowers, tissues, vascular bundles, smart labels and transport arrows.',
        status: 'planned'
    });
    const tools = Array.from(current.tools, (item) => Object.freeze({ ...item }));
    const old = tools.findIndex((item) => item.id === TOOL_ID);
    if (old >= 0) tools.splice(old, 1, tool);
    else {
        const anchor = tools.findIndex((item) => item.id === 'human-anatomy');
        tools.splice(anchor >= 0 ? anchor + 1 : tools.length, 0, tool);
    }
    const recommendedSubjects = new Set(['general', 'biology', 'agriculture']);
    const subjects = Array.from(current.subjects, (subject) => {
        const copy = { ...subject, aliases: Array.from(subject.aliases || []) };
        const recommended = Array.from(subject.recommended || []);
        if (recommendedSubjects.has(copy.id) && !recommended.includes(TOOL_ID)) {
            const anchor = recommended.indexOf('human-anatomy');
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
        const value = normalize(label); if (!value) return frozenSubjects[0];
        let best = frozenSubjects[0], score = 0;
        frozenSubjects.forEach((subject) => (subject.aliases || []).forEach((alias) => {
            const a = normalize(alias); let next = 0;
            if (value === a) next = 1000 + a.length;
            else if (value.includes(a)) next = 500 + a.length;
            else if (a.includes(value)) next = 100 + value.length;
            if (next > score) { best = subject; score = next; }
        }));
        return best;
    }
    window.QmxDiagramRegistry = Object.freeze({ version: '1.19.0', tools: frozenTools, subjects: frozenSubjects, categoryLabels, findSubject, findTool, detectSubject });
})(window);
