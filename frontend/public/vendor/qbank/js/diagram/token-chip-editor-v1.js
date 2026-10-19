(function (window, document) {
    'use strict';

    if (window.QmxTokenChips?.version) return;

    const TOKEN_PATTERN = /\[\[qmx-(graph|diagram):([A-Za-z0-9_-]{10,200000})\]\]/g;
    const statesBySource = new WeakMap();
    const statesByProxy = new WeakMap();
    const sources = new Set();

    function addStyles() {
        if (document.getElementById('qmx-token-chip-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'qmx-token-chip-editor-styles';
        style.textContent = `
            .qmx-token-raw-source {
                position: absolute !important;
                left: -10000px !important;
                top: auto !important;
                width: 1px !important;
                height: 1px !important;
                min-height: 1px !important;
                padding: 0 !important;
                opacity: 0 !important;
                pointer-events: none !important;
                overflow: hidden !important;
                clip-path: inset(50%) !important;
            }
            .qmx-token-chip-proxy {
                font-variant-ligatures: none;
            }
        `;
        document.head.appendChild(style);
    }

    function placeholder(type, number) {
        return type === 'graph'
            ? `⟦▥ Graph ${number}⟧`
            : `⟦◇ Diagram ${number}⟧`;
    }

    function rawToDisplay(raw) {
        const entries = [];
        const counts = { graph: 0, diagram: 0 };
        let display = '';
        let rawCursor = 0;
        let match;

        TOKEN_PATTERN.lastIndex = 0;
        while ((match = TOKEN_PATTERN.exec(raw)) !== null) {
            display += raw.slice(rawCursor, match.index);
            const type = match[1];
            counts[type] += 1;
            const label = placeholder(type, counts[type]);
            const displayStart = display.length;
            display += label;
            entries.push({
                type,
                token: match[0],
                label,
                rawStart: match.index,
                rawEnd: match.index + match[0].length,
                displayStart,
                displayEnd: display.length
            });
            rawCursor = match.index + match[0].length;
        }
        display += raw.slice(rawCursor);
        return { display, entries };
    }

    function rebuildRawFromDisplay(state, display) {
        const tokenMap = new Map(state.entries.map((entry) => [entry.label, entry.token]));
        const labels = Array.from(tokenMap.keys()).sort((a, b) => b.length - a.length);
        if (!labels.length) {
            return { raw: display, entries: [] };
        }

        const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const pattern = new RegExp(escaped.join('|'), 'g');
        const entries = [];
        let raw = '';
        let cursor = 0;
        let match;

        while ((match = pattern.exec(display)) !== null) {
            raw += display.slice(cursor, match.index);
            const token = tokenMap.get(match[0]);
            const rawStart = raw.length;
            raw += token;
            entries.push({
                type: token.startsWith('[[qmx-graph:') ? 'graph' : 'diagram',
                token,
                label: match[0],
                rawStart,
                rawEnd: raw.length,
                displayStart: match.index,
                displayEnd: match.index + match[0].length
            });
            cursor = match.index + match[0].length;
        }
        raw += display.slice(cursor);
        return { raw, entries };
    }

    function displayToRawOffset(entries, offset) {
        let delta = 0;
        for (const entry of entries) {
            if (offset < entry.displayStart) break;
            if (offset <= entry.displayEnd) {
                const midpoint = entry.displayStart + ((entry.displayEnd - entry.displayStart) / 2);
                return offset < midpoint ? entry.rawStart : entry.rawEnd;
            }
            delta += (entry.token.length - entry.label.length);
        }
        return offset + delta;
    }

    function rawToDisplayOffset(entries, offset) {
        let delta = 0;
        for (const entry of entries) {
            if (offset < entry.rawStart) break;
            if (offset <= entry.rawEnd) {
                const midpoint = entry.rawStart + ((entry.rawEnd - entry.rawStart) / 2);
                return offset < midpoint ? entry.displayStart : entry.displayEnd;
            }
            delta += (entry.token.length - entry.label.length);
        }
        return Math.max(0, offset - delta);
    }

    function syncSelectionToSource(state) {
        const start = state.proxy.selectionStart ?? 0;
        const end = state.proxy.selectionEnd ?? start;
        try {
            state.source.setSelectionRange(
                displayToRawOffset(state.entries, start),
                displayToRawOffset(state.entries, end),
                state.proxy.selectionDirection || 'none'
            );
        } catch (error) {
            // Some browsers can reject selection changes while a textarea is hidden.
        }
    }

    function renderFromSource(state, preserveFocus = true) {
        const raw = String(state.source.value || '');
        const sourceStart = state.source.selectionStart ?? raw.length;
        const sourceEnd = state.source.selectionEnd ?? sourceStart;
        const hadFocus = document.activeElement === state.proxy;
        const built = rawToDisplay(raw);

        state.entries = built.entries;
        state.rawSnapshot = raw;
        state.proxy.value = built.display;

        const displayStart = rawToDisplayOffset(state.entries, sourceStart);
        const displayEnd = rawToDisplayOffset(state.entries, sourceEnd);
        try {
            state.proxy.setSelectionRange(displayStart, displayEnd);
        } catch (error) {
            // Ignore selection restoration failures.
        }
        if (hadFocus && preserveFocus) state.proxy.focus({ preventScroll: true });
    }

    function onProxyInput(state) {
        const displayStart = state.proxy.selectionStart ?? 0;
        const displayEnd = state.proxy.selectionEnd ?? displayStart;
        const rebuilt = rebuildRawFromDisplay(state, state.proxy.value);

        state.entries = rebuilt.entries;
        state.rawSnapshot = rebuilt.raw;
        state.syncingFromProxy = true;
        state.source.value = rebuilt.raw;
        try {
            state.source.setSelectionRange(
                displayToRawOffset(state.entries, displayStart),
                displayToRawOffset(state.entries, displayEnd)
            );
        } catch (error) {
            // Ignore hidden-source selection failures.
        }

        state.source.dispatchEvent(new Event('input', { bubbles: true }));
        state.source.dispatchEvent(new Event('change', { bubbles: true }));
        state.syncingFromProxy = false;
    }

    function enhance(source) {
        if (!source || statesBySource.has(source)) return statesBySource.get(source) || null;

        addStyles();

        const proxy = source.cloneNode(false);
        proxy.removeAttribute('id');
        proxy.removeAttribute('name');
        proxy.removeAttribute('data-editor-textarea');
        proxy.removeAttribute('required');
        proxy.dataset.qmxTokenProxy = 'true';
        proxy.classList.add('qmx-token-chip-proxy');
        proxy.setAttribute('aria-label', source.getAttribute('aria-label') || 'Question content editor');
        proxy.autocomplete = 'off';

        source.classList.add('qmx-token-raw-source');
        source.dataset.qmxTokenRawSource = 'true';
        source.insertAdjacentElement('afterend', proxy);

        const state = {
            source,
            proxy,
            entries: [],
            rawSnapshot: '',
            syncingFromProxy: false
        };
        statesBySource.set(source, state);
        statesByProxy.set(proxy, state);
        sources.add(source);

        renderFromSource(state, false);

        proxy.addEventListener('input', () => onProxyInput(state));
        ['select', 'keyup', 'mouseup', 'pointerup', 'focus'].forEach((name) => {
            proxy.addEventListener(name, () => syncSelectionToSource(state));
        });

        source.addEventListener('input', () => {
            if (!state.syncingFromProxy) renderFromSource(state);
        });
        source.addEventListener('change', () => {
            if (!state.syncingFromProxy) renderFromSource(state);
        });

        return state;
    }

    function refresh(source) {
        const state = statesBySource.get(source);
        if (state) renderFromSource(state);
    }

    function resolveTextarea(element) {
        return statesByProxy.get(element)?.source || element || null;
    }

    function getProxy(source) {
        return statesBySource.get(source)?.proxy || null;
    }

    function focusSource(source) {
        const proxy = getProxy(source);
        if (proxy) {
            proxy.focus({ preventScroll: true });
            return proxy;
        }
        source?.focus?.();
        return source || null;
    }

    function init() {
        const source = document.querySelector('[data-editor-textarea]');
        if (!source) return;
        const state = enhance(source);

        document.addEventListener('pointerdown', (event) => {
            if (!event.target.closest('.qmx-editor-toolbar, [data-section-toolbar], [data-math-toolbar]')) return;
            if (document.activeElement === state.proxy) syncSelectionToSource(state);
        }, true);

        document.addEventListener('click', (event) => {
            if (!event.target.closest('[data-pattern-key], [data-pattern-field]')) return;
            window.setTimeout(() => renderFromSource(state, false), 0);
            window.setTimeout(() => renderFromSource(state, false), 60);
        });

        window.setInterval(() => {
            if (state.syncingFromProxy) return;
            if (String(state.source.value || '') !== state.rawSnapshot) {
                renderFromSource(state, document.activeElement === state.proxy);
            }
        }, 350);
    }

    window.QmxTokenChips = Object.freeze({
        version: '1.0.0',
        enhance,
        refresh,
        resolveTextarea,
        getProxy,
        focusSource
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
