(function (window, document) {
    'use strict';
    const TOOL_ID = 'weather-climate-diagram';
    const REGISTRY_VERSION = '1.23.2';
    const tool = Object.freeze({
        id: TOOL_ID,
        label: 'Meteorology / Weather & Climate Diagram',
        labelBn: 'আবহাওয়াবিজ্ঞান / আবহাওয়া ও জলবায়ু চিত্র',
        category: 'geography',
        badge: 'WEATHER',
        description: 'Weather maps, pressure systems, fronts, clouds, precipitation, wind, atmospheric layers and climate graphs.',
        status: 'planned'
    });
    // Latest registry owns the aggregate snapshot; older registry retries must not downgrade it.
    const normalize = (value) => String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    function installRegistry() {
        const current = window.QmxDiagramRegistry;
        if (!current?.tools || !current?.subjects) return false;
        if (current.version === REGISTRY_VERSION && current.tools.some((item) => item.id === TOOL_ID)) return true;
        const tools = Array.from(current.tools, (item) => Object.freeze({ ...item }));
        const old = tools.findIndex((item) => item.id === TOOL_ID);
        if (old >= 0) tools.splice(old, 1, tool);
        else {
            const anchor = tools.findIndex((item) => item.id === 'geology-diagram');
            tools.splice(anchor >= 0 ? anchor + 1 : tools.length, 0, tool);
        }
        const recommendedSubjects = new Set(['general', 'geography', 'physics', 'agriculture']);
        const subjects = Array.from(current.subjects, (subject) => {
            const copy = { ...subject, aliases: Array.from(subject.aliases || []) };
            const recommended = Array.from(subject.recommended || []).filter((id) => id !== TOOL_ID);
            if (recommendedSubjects.has(copy.id)) {
                const anchor = recommended.indexOf('geology-diagram');
                recommended.splice(anchor >= 0 ? anchor + 1 : recommended.length, 0, TOOL_ID);
            }
            copy.recommended = recommended;
            return Object.freeze(copy);
        });
        const frozenTools = Object.freeze(tools.map((item) => Object.freeze({ ...item })));
        const frozenSubjects = Object.freeze(subjects);
        const categoryLabels = current.categoryLabels;
        function findSubject(id) { return frozenSubjects.find((subject) => subject.id === id) || frozenSubjects[0]; }
        function findTool(id) { return frozenTools.find((item) => item.id === id) || null; }
        function detectSubject(label) {
            const value = normalize(label);
            if (!value) return frozenSubjects[0];
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
        window.QmxDiagramRegistry = Object.freeze({ version: REGISTRY_VERSION, tools: frozenTools, subjects: frozenSubjects, categoryLabels, findSubject, findTool, detectSubject });
        return true;
    }
    let attempts = 0;
    function signalRegistryUpdate(previous) {
        if (previous === window.QmxDiagramRegistry || typeof document.dispatchEvent !== 'function') return;
        try { document.dispatchEvent(new CustomEvent('qmx:diagram-tools-updated', { detail: { version: REGISTRY_VERSION, toolId: TOOL_ID } })); } catch (_) {}
    }
    function ensureRegistry() {
        const previous = window.QmxDiagramRegistry;
        installRegistry(); signalRegistryUpdate(previous);
        if (attempts < 240) { attempts += 1; window.setTimeout(ensureRegistry, 50); }
    }
    ensureRegistry();
    document.addEventListener('DOMContentLoaded', ensureRegistry, { once: true });
    window.addEventListener('load', ensureRegistry, { once: true });
    window.addEventListener('pageshow', ensureRegistry);
    window.addEventListener('focus', ensureRegistry);
    document.addEventListener('visibilitychange', ensureRegistry);
    document.addEventListener('qmx:diagram-registry-ready', ensureRegistry);
})(window, document);
