(function (window, document) {
    'use strict';

    if (window.QmxDisplayRenderer?.version) return;

    const GRAPH_PATTERN = /\[\[qmx-graph:([A-Za-z0-9_-]{10,200000})\]\]/g;
    const DIAGRAM_PATTERN = /\[\[qmx-diagram:([A-Za-z0-9_-]{10,200000})\]\]/g;
    const TOKEN_PATTERN = /\[\[qmx-(graph|diagram):([A-Za-z0-9_-]{10,200000})\]\]/g;

    const CONTAINER_SELECTORS = [
        '.qmx-content-paragraph',
        '.question-content',
        '.qmx-question-content',
        '.qmx-answer-content',
        '.qmx-explanation-content',
        '[data-question-content]',
        '[data-qmx-content]',
        '.question-body',
        '.question-part',
        '.question-card',
        '.paper-question',
        '.print-question',
        '.qmx-paper-question',
        '.qmx-question-block'
    ];

    const SKIP_SELECTOR = [
        'textarea',
        'input',
        'select',
        'option',
        'script',
        'style',
        'code',
        'pre',
        'template',
        'noscript',
        '[contenteditable="true"]',
        '[data-qmx-diagram]',
        '[data-qmx-graph]',
        '.qmx-editor',
        '.qmx-fullscreen-editor',
        '.qmx-token-chip-editor'
    ].join(',');

    let graphAssetsPromise = null;
    let scheduled = false;
    let observer = null;

    function addStyles() {
        if (document.getElementById('qmx-display-renderer-styles')) return;

        const style = document.createElement('style');
        style.id = 'qmx-display-renderer-styles';
        style.textContent = `
.qmx-display-render-scope .qmx-graph,
.qmx-display-render-scope .qmx-diagram,
.qmx-graph,
.qmx-diagram {
    display: block;
    width: min(100%, 1050px);
    max-width: 100%;
    margin: 14px auto;
    break-inside: avoid;
    page-break-inside: avoid;
    text-align: center;
}
.qmx-display-render-scope .qmx-graph svg,
.qmx-display-render-scope .qmx-diagram svg,
.qmx-graph svg,
.qmx-diagram svg {
    display: block;
    width: auto;
    max-width: 100%;
    height: auto;
    max-height: 560px;
    margin: 0 auto;
}
.qmx-display-render-scope .qmx-graph figcaption,
.qmx-display-render-scope .qmx-diagram figcaption,
.qmx-graph figcaption,
.qmx-diagram figcaption {
    padding-top: 6px;
    color: #475569;
    font-size: 12px;
    text-align: center;
}
.qmx-display-token-error {
    display: inline-block;
    padding: 4px 7px;
    border: 1px solid #fecaca;
    border-radius: 6px;
    background: #fef2f2;
    color: #b91c1c;
    font-size: 12px;
    font-weight: 700;
}
@media print {
    .qmx-graph,
    .qmx-diagram {
        width: 100% !important;
        max-width: 100% !important;
        margin: 8mm auto !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
    }
    .qmx-graph svg,
    .qmx-diagram svg {
        width: 100% !important;
        max-width: 100% !important;
        max-height: none !important;
    }
}`;
        document.head.appendChild(style);
    }

    function containsGraphToken(root = document.body) {
        return Boolean(root?.textContent?.includes('[[qmx-graph:'));
    }

    function containsDiagramToken(root = document.body) {
        return Boolean(root?.textContent?.includes('[[qmx-diagram:'));
    }

    function copyScriptAttributes(source, target) {
        [
            'type',
            'nomodule',
            'crossorigin',
            'integrity',
            'referrerpolicy',
            'nonce'
        ].forEach((name) => {
            if (source.hasAttribute(name)) {
                target.setAttribute(name, source.getAttribute(name) || '');
            }
        });
    }

    function existingScriptFor(sourceUrl) {
        const absolute = new URL(sourceUrl, document.baseURI).href;
        return Array.from(document.scripts).find((script) => script.src === absolute) || null;
    }

    function executeTemplateScript(source) {
        return new Promise((resolve) => {
            const src = source.getAttribute('src');

            if (src) {
                const existing = existingScriptFor(src);
                if (existing) {
                    if (existing.dataset.qmxLoaded === '1' || window.QmxGraph?.tokensToHtml) {
                        resolve();
                        return;
                    }

                    const finish = () => resolve();
                    existing.addEventListener('load', finish, { once: true });
                    existing.addEventListener('error', finish, { once: true });
                    window.setTimeout(finish, 1800);
                    return;
                }

                const script = document.createElement('script');
                copyScriptAttributes(source, script);
                script.src = new URL(src, document.baseURI).href;
                script.async = false;
                script.dataset.qmxDisplayAsset = '1';

                const finish = () => {
                    script.dataset.qmxLoaded = '1';
                    resolve();
                };

                script.addEventListener('load', finish, { once: true });
                script.addEventListener('error', () => {
                    console.warn('[QMX Display] Could not load graph asset:', script.src);
                    finish();
                }, { once: true });

                document.head.appendChild(script);
                window.setTimeout(finish, 5000);
                return;
            }

            const code = source.textContent || '';
            if (!code.trim()) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            copyScriptAttributes(source, script);
            script.textContent = code;
            script.dataset.qmxDisplayAsset = '1';

            if ((source.getAttribute('type') || '').toLowerCase() === 'module') {
                script.addEventListener('load', resolve, { once: true });
                script.addEventListener('error', resolve, { once: true });
                document.head.appendChild(script);
                window.setTimeout(resolve, 1800);
                return;
            }

            document.head.appendChild(script);
            script.remove();
            resolve();
        });
    }

    async function loadGraphAssets() {
        if (window.QmxGraph?.tokensToHtml) return true;
        if (graphAssetsPromise) return graphAssetsPromise;

        graphAssetsPromise = (async () => {
            const template = document.getElementById('qmx-display-graph-assets');
            if (!template?.content) return false;

            const scripts = Array.from(template.content.querySelectorAll('script'));
            for (const script of scripts) {
                if (window.QmxGraph?.tokensToHtml) break;
                await executeTemplateScript(script);
            }

            const started = Date.now();
            while (!window.QmxGraph?.tokensToHtml && Date.now() - started < 3500) {
                await new Promise((resolve) => window.setTimeout(resolve, 80));
            }

            if (!window.QmxGraph?.tokensToHtml) {
                console.warn('[QMX Display] QmxGraph renderer was not initialized.');
                return false;
            }

            document.dispatchEvent(new CustomEvent('qmx:display-graph-ready'));
            return true;
        })().finally(() => {
            if (!window.QmxGraph?.tokensToHtml) graphAssetsPromise = null;
        });

        return graphAssetsPromise;
    }

    function renderedTokenHtml(kind, token) {
        try {
            if (kind === 'diagram') {
                return window.QmxDiagram?.tokensToHtml
                    ? window.QmxDiagram.tokensToHtml(token)
                    : null;
            }

            return window.QmxGraph?.tokensToHtml
                ? window.QmxGraph.tokensToHtml(token)
                : null;
        } catch (error) {
            console.warn(`[QMX Display] ${kind} token rendering failed.`, error);
            return '<span class="qmx-display-token-error">[Invalid media token]</span>';
        }
    }

    function replaceTextNode(node) {
        const source = node.nodeValue || '';
        if (!source.includes('[[qmx-')) return 0;

        TOKEN_PATTERN.lastIndex = 0;
        const matches = Array.from(source.matchAll(TOKEN_PATTERN));
        if (!matches.length) return 0;

        const fragment = document.createDocumentFragment();
        let cursor = 0;
        let rendered = 0;

        matches.forEach((match) => {
            const token = match[0];
            const kind = match[1];
            const index = match.index ?? 0;

            if (index > cursor) {
                fragment.appendChild(document.createTextNode(source.slice(cursor, index)));
            }

            const html = renderedTokenHtml(kind, token);
            if (!html) {
                fragment.appendChild(document.createTextNode(token));
            } else {
                const template = document.createElement('template');
                template.innerHTML = html;
                fragment.appendChild(template.content);
                rendered += 1;
            }

            cursor = index + token.length;
        });

        if (cursor < source.length) {
            fragment.appendChild(document.createTextNode(source.slice(cursor)));
        }

        if (!rendered) return 0;

        node.replaceWith(fragment);
        return rendered;
    }

    function candidateContainers(root = document) {
        const containers = Array.from(
            root.querySelectorAll?.(CONTAINER_SELECTORS.join(',')) || []
        );

        if (containers.length) {
            return containers.filter((container, index) =>
                !containers.some((other, otherIndex) =>
                    otherIndex !== index && other.contains(container)
                )
            );
        }

        const fallback = root.querySelector?.('main, article, [role="main"]');
        return fallback ? [fallback] : [document.body];
    }

    function hydrateContainer(container) {
        if (!container || container.matches?.(SKIP_SELECTOR)) return 0;

        container.classList?.add('qmx-display-render-scope');

        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (!node.nodeValue?.includes('[[qmx-')) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    const parent = node.parentElement;
                    if (!parent || parent.closest(SKIP_SELECTOR)) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        return nodes.reduce((count, node) => count + replaceTextNode(node), 0);
    }

    function typesetMath() {
        const mathJax = window.MathJax;
        if (mathJax?.typesetPromise) {
            mathJax.typesetPromise().catch(() => {});
        } else if (mathJax?.Hub?.Queue) {
            mathJax.Hub.Queue(['Typeset', mathJax.Hub]);
        }
    }

    async function hydrate(root = document) {
        addStyles();

        if (containsGraphToken(root.body || root) && !window.QmxGraph?.tokensToHtml) {
            await loadGraphAssets();
        }

        if (containsDiagramToken(root.body || root) && window.QmxDiagram?.hydrate) {
            window.QmxDiagram.hydrate(root);
        }

        const rendered = candidateContainers(root)
            .reduce((count, container) => count + hydrateContainer(container), 0);

        if (rendered > 0) {
            typesetMath();
            document.dispatchEvent(new CustomEvent('qmx:display-rendered', {
                detail: { rendered }
            }));
        }

        return rendered;
    }

    function scheduleHydrate() {
        if (scheduled) return;
        scheduled = true;

        window.requestAnimationFrame(() => {
            scheduled = false;
            hydrate(document);
        });
    }

    function init() {
        addStyles();
        hydrate(document);

        if (!observer && document.body) {
            observer = new MutationObserver((mutations) => {
                const relevant = mutations.some((mutation) =>
                    Array.from(mutation.addedNodes || []).some((node) =>
                        node.nodeType === Node.TEXT_NODE
                            ? node.nodeValue?.includes('[[qmx-')
                            : node.textContent?.includes('[[qmx-')
                    )
                );

                if (relevant) scheduleHydrate();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }

        window.addEventListener('beforeprint', () => {
            hydrate(document);
        });

        document.addEventListener('qmx:display-graph-ready', scheduleHydrate);
    }

    window.QmxDisplayRenderer = Object.freeze({
        version: '2.5.2',
        hydrate,
        loadGraphAssets,
        graphPattern: GRAPH_PATTERN,
        diagramPattern: DIAGRAM_PATTERN
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
