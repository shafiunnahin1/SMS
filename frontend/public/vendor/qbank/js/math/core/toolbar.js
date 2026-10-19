const TOOLBAR_CONTAINER_SELECTOR = '[data-math-toolbar]';
const SEARCH_INPUT_SELECTOR = '[data-math-toolbar-search]';
const RIBBON_STYLE_ATTRIBUTE = 'data-qmx-standalone-math-ribbons';
export const RIBBON_ARCHITECTURE_VERSION = '1.0.2';
export const GRAPH_EDIT_BRIDGE_VERSION = '2.1.2';

export const RIBBON_DEFINITIONS = Object.freeze([
    {
        id: 'equation',
        label: 'Equation',
        title: 'Equation Builder',
        keywords: ['equation', 'formula', 'latex', 'fraction', 'root'],
        icon: '<span class="qmx-equation-ribbon-symbol" aria-hidden="true">∑</span>',
    },
    {
        id: 'graph',
        label: 'Graph',
        title: 'Graph Builder — functions, statistics, geometry and 3D',
        keywords: ['graph', 'bar chart', 'statistics', 'plot', 'geometry', '3d'],
        icon: `
            <svg class="qmx-ribbon-svg qmx-graph-bar-chart-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3 20.5H21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <rect x="4.5" y="11.5" width="3.6" height="8" rx="0.8" fill="currentColor" opacity="0.72"/>
                <rect x="10.2" y="5" width="3.6" height="14.5" rx="0.8" fill="currentColor"/>
                <rect x="15.9" y="8.2" width="3.6" height="11.3" rx="0.8" fill="currentColor" opacity="0.86"/>
            </svg>
        `,
    },
    {
        id: 'animation',
        label: 'Animation',
        title: 'Animation Platform — independent ribbon',
        keywords: ['animation', 'timeline', 'play', 'motion', 'time dependent'],
        icon: `
            <svg class="qmx-ribbon-svg qmx-animation-ribbon-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M8 6.4L17 12L8 17.6Z" fill="currentColor"/>
                <path d="M4 20H20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                <circle cx="7" cy="20" r="1.5" fill="currentColor"/>
                <circle cx="17" cy="20" r="1.5" fill="currentColor" opacity="0.55"/>
            </svg>
        `,
    },
]);

let toolbarInitialized = false;

function ensureRibbonStyles() {
    if (typeof document === 'undefined' || document.querySelector(`style[${RIBBON_STYLE_ATTRIBUTE}]`)) {
        return;
    }

    const style = document.createElement('style');
    style.setAttribute(RIBBON_STYLE_ATTRIBUTE, '1');
    style.textContent = `
        [data-math-toolbar].qmx-math-independent-ribbons {
            display: inline-flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            gap: 7px !important;
            min-width: max-content;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            outline: 0 !important;
            overflow: visible !important;
        }
        [data-math-toolbar].qmx-math-independent-ribbons::before,
        [data-math-toolbar].qmx-math-independent-ribbons::after {
            display: none !important;
            content: none !important;
        }
        [data-math-toolbar] .qmx-math-independent-ribbon {
            display: inline-flex !important;
            flex: 0 0 auto !important;
            align-items: center !important;
            gap: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }
        [data-math-toolbar] .qmx-math-independent-ribbon + .qmx-math-independent-ribbon {
            margin-left: 0 !important;
        }
        [data-math-toolbar] .qmx-math-independent-ribbon .qmx-ribbon-controls {
            display: inline-flex !important;
            padding: 0 !important;
            gap: 0 !important;
        }
        [data-math-toolbar] .qmx-independent-ribbon-button .label {
            display: none !important;
        }
        [data-math-toolbar] .qmx-math-independent-ribbon-title {
            display: none !important;
        }
        [data-math-toolbar] .qmx-independent-ribbon-button {
            color: #334155;
            border: 1px solid transparent !important;
            border-radius: 10px !important;
            background: transparent !important;
            box-shadow: none !important;
        }
        [data-math-toolbar] .qmx-independent-ribbon-button:hover,
        [data-math-toolbar] .qmx-independent-ribbon-button:focus-visible {
            color: #1d4ed8;
            background: #eff6ff !important;
            outline: 2px solid transparent;
        }
        [data-math-toolbar] .qmx-independent-ribbon-button:active {
            background: #dbeafe !important;
        }
        [data-math-toolbar] .qmx-independent-ribbon-button .icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        [data-math-toolbar] .qmx-ribbon-svg {
            display: block;
            width: 21px;
            height: 21px;
            overflow: visible;
        }
        [data-math-toolbar] .qmx-graph-bar-chart-icon {
            width: 22px;
            height: 22px;
        }
        [data-math-toolbar] .qmx-equation-ribbon-symbol {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            font-family: "Cambria Math", "STIX Two Math", "Times New Roman", serif;
            font-size: 22px;
            font-weight: 700;
            line-height: 1;
        }
        [data-math-toolbar] .qmx-math-independent-ribbon.is-unavailable {
            border-style: dashed !important;
            border-color: #cbd5e1 !important;
            background: #f8fafc !important;
            box-shadow: none !important;
        }
        [data-math-toolbar] .qmx-independent-ribbon-button:disabled {
            cursor: not-allowed;
            color: #94a3b8;
            opacity: 0.78;
            background: transparent;
            border-color: transparent;
        }
        [data-math-toolbar] .qmx-independent-ribbon-button:disabled:hover {
            color: #94a3b8;
            background: transparent;
            border-color: transparent;
        }
        @media (max-width: 767px) {
            [data-math-toolbar].qmx-math-independent-ribbons {
                gap: 5px !important;
            }
            [data-math-toolbar] .qmx-math-independent-ribbon {
                padding: 0 !important;
            }
        }
    `;
    (document.head || document.documentElement).appendChild(style);
}

function normalizeQuery(value) {
    return String(value || '').trim().toLowerCase();
}

function matchesDefinition(definition, query) {
    const normalized = normalizeQuery(query);
    if (!normalized) return true;

    return [
        definition.id,
        definition.label,
        definition.title,
        ...(definition.keywords || []),
    ].some((value) => String(value || '').toLowerCase().includes(normalized));
}

function getRegisteredTool(editor, id) {
    if (!editor) return null;
    if (typeof editor.getTool === 'function') return editor.getTool(id);
    if (typeof editor.getTools === 'function') {
        return editor.getTools().find((tool) => tool?.id === id) || null;
    }
    return null;
}

function prepareToolOptions(toolId) {
    if (toolId === 'equation') {
        return window.QmxPrepareEquationOpen?.() || {};
    }
    if (toolId === 'graph') {
        return window.QmxPrepareGraphOpen?.() || {};
    }
    if (toolId === 'animation') {
        return window.QmxPrepareAnimationOpen?.() || {};
    }
    return {};
}

function openDelayedLoader(title, text) {
    let shown = false;
    const timer = window.setTimeout(() => {
        shown = true;
        if (!window.Swal?.fire) return;
        window.Swal.fire({
            title,
            text,
            allowEscapeKey: false,
            allowEnterKey: false,
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: (popup) => {
                popup.dataset.qmxTransientLoader = '1';
                window.Swal.showLoading();
            },
        });
    }, 180);

    return () => {
        window.clearTimeout(timer);
        if (!shown) return;
        const popup = window.Swal?.getPopup?.();
        if (popup?.dataset?.qmxTransientLoader === '1') {
            window.Swal.close();
        }
    };
}

function createRibbonButton(definition, editor) {
    const tool = getRegisteredTool(editor, definition.id);
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'qmx-ribbon-button qmx-math-tool qmx-independent-ribbon-button';
    button.dataset.mathToolId = definition.id;
    button.dataset.qmxIndependentRibbon = definition.id;
    button.title = tool
        ? definition.title
        : `${definition.label} — platform not installed yet`;
    button.setAttribute('aria-label', definition.label);
    button.innerHTML = `
        <span class="icon">${definition.icon}</span>
        <span class="label">${definition.label}</span>
    `;

    if (!tool) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        return { button, available: false };
    }

    button.addEventListener('click', () => {
        let options = {};
        try {
            options = prepareToolOptions(definition.id) || {};
        } catch (error) {
            console.error(`${definition.label} open-options preparation failed.`, error);
            const message = error?.message
                ? `${definition.label} could not be opened: ${error.message}`
                : `${definition.label} could not be opened.`;
            if (window.Swal?.fire) {
                window.Swal.fire({
                    icon: 'error',
                    title: `${definition.label} unavailable`,
                    text: message,
                });
            } else if (typeof window.alert === 'function') {
                window.alert(message);
            }
            return;
        }

        if (options?.cancelOpen) {
            const message = options.graphEditError
                || window.QmxGraphEditOpenError
                || 'The selected graph could not be restored for editing.';
            if (window.Swal?.fire) {
                window.Swal.fire({
                    icon: 'error',
                    title: definition.id === 'graph'
                        ? 'Graph edit unavailable'
                        : `${definition.label} unavailable`,
                    text: message,
                });
            } else if (typeof window.alert === 'function') {
                window.alert(message);
            }
            return;
        }

        if (
            definition.id === 'graph'
            && (
                options?.initialSpec
                || options?.existingGraphToken
                || options?.replaceRange
                || options?.selectedGraphPayload
            )
        ) {
            options = {
                ...options,
                editMode: true,
            };
        }

        const closeLoader = definition.id === 'equation' || definition.id === 'graph'
            ? (() => {})
            : openDelayedLoader(
                definition.id === 'graph' ? 'Graph tools লোড হচ্ছে…' : `${definition.label} tools লোড হচ্ছে…`,
                definition.id === 'graph'
                    ? 'গ্রাফ মডাল প্রস্তুত করা হচ্ছে…'
                    : 'একটু অপেক্ষা করুন…'
            );

        try {
            const opened = editor.openTool(definition.id, options);
            if (opened && typeof opened.then === 'function') {
                Promise.resolve(opened).finally(closeLoader);
            } else {
                closeLoader();
            }
        } catch (error) {
            closeLoader();
            throw error;
        }
    });

    return { button, available: true };
}

function createRibbonGroup(definition, editor) {
    const group = document.createElement('div');
    group.className = 'qmx-ribbon-group qmx-math-independent-ribbon';
    group.dataset.qmxRibbonTool = definition.id;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `${definition.label} tool`);

    const title = document.createElement('div');
    title.className = 'qmx-ribbon-group-title qmx-math-independent-ribbon-title';
    title.textContent = definition.label;

    const controls = document.createElement('div');
    controls.className = 'qmx-ribbon-controls';

    const { button, available } = createRibbonButton(definition, editor);
    controls.appendChild(button);

    if (!available) {
        group.classList.add('is-unavailable');
        group.dataset.qmxToolStatus = 'not-installed';
    } else {
        group.dataset.qmxToolStatus = 'available';
    }

    group.appendChild(title);
    group.appendChild(controls);
    return group;
}

export function renderMathToolbar(editor, filterQuery = '') {
    const container = document.querySelector(TOOLBAR_CONTAINER_SELECTOR);
    if (!container || !editor) return;

    ensureRibbonStyles();
    container.classList.add('qmx-math-independent-ribbons', 'qmx-math-standalone-ribbons');
    container.innerHTML = '';

    const definitions = RIBBON_DEFINITIONS.filter((definition) => (
        matchesDefinition(definition, filterQuery)
    ));

    if (!definitions.length) {
        const empty = document.createElement('div');
        empty.className = 'qmx-math-toolbar-empty';
        empty.textContent = 'No math tools found.';
        container.appendChild(empty);
        return;
    }

    definitions.forEach((definition) => {
        container.appendChild(createRibbonGroup(definition, editor));
    });
}

export function initializeMathToolbar() {
    if (toolbarInitialized || typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }

    const editor = window.MathEditor;
    const container = document.querySelector(TOOLBAR_CONTAINER_SELECTOR);
    if (!editor || !container) return;

    toolbarInitialized = true;
    ensureRibbonStyles();

    const searchInput = document.querySelector(SEARCH_INPUT_SELECTOR);
    const refresh = () => renderMathToolbar(editor, searchInput?.value || '');

    if (searchInput) {
        searchInput.addEventListener('input', refresh);
    }

    editor.eventBus?.on?.('toolRegistered', refresh);
    refresh();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    initializeMathToolbar();
    window.addEventListener('DOMContentLoaded', initializeMathToolbar);
}
