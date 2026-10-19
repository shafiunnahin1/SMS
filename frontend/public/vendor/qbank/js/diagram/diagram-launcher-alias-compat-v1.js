(function (window, document) {
    'use strict';

    const VERSION = '1.0.6';
    const HOTFIX_VERSION = '3.4.3';

    const aliases = Object.freeze({
        'optics': 'ray-optics',
        'ray-diagram': 'ray-optics',

        'waveform-diagram': 'waveform',
        'signal-waveform': 'waveform',
        'wave': 'waveform',

        'venn-set': 'venn-diagram',
        'venn': 'venn-diagram',
        'set-diagram': 'venn-diagram',
        'venn-tree': 'venn-diagram',

        'timeline-diagram': 'timeline',
        'chronology': 'timeline',
        'event-timeline': 'timeline',

        'data-flow-diagram': 'data-flow',
        'dfd': 'data-flow',
        'dataflow': 'data-flow',
        'dataflow-diagram': 'data-flow',
        'data-flow-dfd': 'data-flow',

        'cross-section-profile': 'cross-section',
        'cross-section-diagram': 'cross-section',
        'profile-diagram': 'cross-section',
        'terrain-profile': 'cross-section',
        'xsec': 'cross-section',

        'freehand-vector-art': 'freehand-art',
        'vector-art': 'freehand-art',
        'freehand-drawing': 'freehand-art',
        'freehand': 'freehand-art',
        'art': 'freehand-art',

        'sports-field-tactics': 'sports-layout',
        'sports-field': 'sports-layout',
        'sports-tactics': 'sports-layout',
        'sports-diagram': 'sports-layout',
        'sports': 'sports-layout',
        'tactics': 'sports-layout',

        'stage-blocking': 'stage-plan',
        'stage-blocking-plan': 'stage-plan',
        'blocking-plan': 'stage-plan',
        'stage-layout': 'stage-plan',
        'stage-diagram': 'stage-plan',
        'stage': 'stage-plan',
        'blocking': 'stage-plan'
    });

    function normalizeToolId(id) {
        const value = String(id || '').trim();
        return aliases[value] || value;
    }

    function install() {
        const base = window.QmxDiagramLauncher;
        if (!base || typeof base.registerToolHandler !== 'function') {
            return false;
        }

        if (base.legacyAliasHotfix === HOTFIX_VERSION) {
            return true;
        }

        const registrations = new Map();

        function registerToolHandler(id, handler) {
            const canonicalId = normalizeToolId(id);

            if (typeof handler !== 'function') {
                throw new TypeError('Handler must be a function.');
            }

            if (registrations.get(canonicalId) === handler) {
                return function noopDisposer() {};
            }

            const dispose = base.registerToolHandler(canonicalId, handler);
            registrations.set(canonicalId, handler);

            return function disposeCompatibilityRegistration() {
                if (registrations.get(canonicalId) === handler) {
                    registrations.delete(canonicalId);
                }
                if (typeof dispose === 'function') {
                    return dispose();
                }
            };
        }

        const compatibilityApi = Object.freeze({
            ...base,
            version: VERSION,
            registerToolHandler,
            normalizeToolId,
            legacyAliases: aliases,
            legacyAliasHotfix: HOTFIX_VERSION
        });

        window.QmxDiagramLauncher = compatibilityApi;

        document.dispatchEvent?.(new CustomEvent('qmx:diagram-launcher-alias-ready', {
            detail: Object.freeze({
                version: VERSION,
                hotfixVersion: HOTFIX_VERSION,
                aliasCount: Object.keys(aliases).length
            })
        }));

        return true;
    }

    if (!install()) {
        document.addEventListener('qmx:diagram-launcher-ready', install, { once: true });
    }
})(window, document);
