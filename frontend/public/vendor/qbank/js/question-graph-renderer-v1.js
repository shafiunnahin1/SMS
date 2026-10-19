import {
    tokensToHtml,
} from './math/tools/graph/graph-core.js?v=20260801-guest-browser-storage-1';

const TOKEN_TEST = /\[\[qmx-graph:[A-Za-z0-9_-]{10,60000}\]\]/;
const CONTENT_SELECTOR = '[data-math-content]';
const STYLE_ID = 'qmx-static-graph-style';
let renderQueued = false;

function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .qmx-graph {
            box-sizing: border-box;
            display: block;
            width: min(100%, 860px);
            margin: 14px auto;
            padding: 10px;
            overflow: hidden;
            border: 1px solid #dbe4f0;
            border-radius: 12px;
            background: #ffffff;
        }

        .qmx-graph svg {
            display: block;
            width: 100%;
            height: auto;
            max-width: 100%;
        }

        .qmx-graph figcaption {
            padding: 7px 4px 1px;
            color: #475569;
            font-size: 12px;
            line-height: 1.4;
            text-align: center;
        }

        @media print {
            .qmx-graph {
                break-inside: avoid;
                border-color: #cbd5e1;
                box-shadow: none;
            }
        }
    `;
    document.head.appendChild(style);
}

function contentElements(root = document) {
    const elements = [];

    if (
        root instanceof Element
        && root.matches(CONTENT_SELECTOR)
    ) {
        elements.push(root);
    }

    if (
        root instanceof Document
        || root instanceof DocumentFragment
        || root instanceof Element
    ) {
        elements.push(...root.querySelectorAll(CONTENT_SELECTOR));
    }

    return Array.from(new Set(elements));
}

function renderElement(element) {
    if (!(element instanceof Element)) return false;

    const html = element.innerHTML;

    if (!TOKEN_TEST.test(html)) {
        TOKEN_TEST.lastIndex = 0;
        return false;
    }

    TOKEN_TEST.lastIndex = 0;
    const rendered = tokensToHtml(html);

    if (rendered === html) return false;

    element.innerHTML = rendered;
    element.dataset.qmxGraphsRendered = '1';
    return true;
}

function renderGraphs(root = document) {
    installStyles();

    let changed = false;

    contentElements(root).forEach((element) => {
        changed = renderElement(element) || changed;
    });

    if (
        changed
        && window.MathJax
        && typeof window.MathJax.typesetPromise === 'function'
    ) {
        const targets = contentElements(root);

        Promise.resolve(
            typeof window.MathJax.typesetClear === 'function'
                ? window.MathJax.typesetClear(targets)
                : undefined
        )
            .then(() => window.MathJax.typesetPromise(targets))
            .catch((error) => {
                console.debug('Graph post-render MathJax skipped.', error);
            });
    }

    return changed;
}

function queueRender(root = document) {
    if (renderQueued) return;
    renderQueued = true;

    window.requestAnimationFrame(() => {
        renderQueued = false;
        renderGraphs(root);
    });
}

function start() {
    renderGraphs(document);

    const observer = new MutationObserver((mutations) => {
        const containsToken = mutations.some((mutation) => {
            if (
                mutation.type === 'characterData'
                && mutation.target?.data
            ) {
                return TOKEN_TEST.test(mutation.target.data);
            }

            return Array.from(mutation.addedNodes || []).some((node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    return TOKEN_TEST.test(node.textContent || '');
                }

                if (node instanceof Element) {
                    return TOKEN_TEST.test(node.innerHTML || '');
                }

                return false;
            });
        });

        TOKEN_TEST.lastIndex = 0;

        if (containsToken) {
            queueRender(document);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
    });

    window.QmxStaticGraphs = {
        render: renderGraphs,
        queue: queueRender,
    };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {
        once: true,
    });
} else {
    start();
}
