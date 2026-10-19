(function (window, document) {
    'use strict';
    const TOOL_ID = 'oceanography-diagram';
    const REGISTRY_VERSION = '1.26.0';
    const tool = Object.freeze({
        id: TOOL_ID,
        label: 'Oceanography / Marine Science & Coastal Processes Diagram',
        labelBn: 'সমুদ্রবিদ্যা / সামুদ্রিক বিজ্ঞান ও উপকূলীয় প্রক্রিয়া চিত্র',
        category: 'geography',
        badge: 'OCEAN',
        description: 'Ocean basins, waves, tides, currents, coastal landforms, marine ecosystems, seafloor relief and depth profiles.',
        status: 'planned'
    });
    const normalize = (value) => String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    function compareVersions(left, right) {
        const a = String(left || '').split('.').map((part) => Number(part) || 0);
        const b = String(right || '').split('.').map((part) => Number(part) || 0);
        const length = Math.max(a.length, b.length);
        for (let index = 0; index < length; index += 1) {
            const delta = (a[index] || 0) - (b[index] || 0);
            if (delta) return delta > 0 ? 1 : -1;
        }
        return 0;
    }
    function installRegistry() {
        const current = window.QmxDiagramRegistry;
        if (!current?.tools || !current?.subjects) return false;
        if (compareVersions(current.version, REGISTRY_VERSION) > 0) return current.tools.some((item) => item.id === TOOL_ID);
        if (current.version === REGISTRY_VERSION && current.tools.some((item) => item.id === TOOL_ID)) return true;
        const tools = Array.from(current.tools, (item) => Object.freeze({ ...item }));
        const old = tools.findIndex((item) => item.id === TOOL_ID);
        if (old >= 0) tools.splice(old, 1, tool);
        else {
            const anchor = tools.findIndex((item) => item.id === 'hydrology-diagram');
            tools.splice(anchor >= 0 ? anchor + 1 : tools.length, 0, tool);
        }
        const recommendedSubjects = new Set(['general', 'geography', 'biology', 'physics']);
        const subjects = Array.from(current.subjects, (subject) => {
            const copy = { ...subject, aliases: Array.from(subject.aliases || []) };
            const recommended = Array.from(subject.recommended || []).filter((id) => id !== TOOL_ID);
            if (recommendedSubjects.has(copy.id)) {
                const anchor = recommended.indexOf('hydrology-diagram');
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
