import {
    matchesToolQuery,
    compareToolOrder,
    normalizeCategory,
    formatCategoryLabel
} from './tool-utils.js';

export function filterTools(tools, query = '') {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) {
        return Array.from(tools || []);
    }
    return Array.from(tools || []).filter((tool) => matchesToolQuery(tool, normalized));
}

export function sortTools(tools) {
    return Array.from(tools || []).sort(compareToolOrder);
}

function createToolButton(tool, { onToolSelect, className, contentBuilder }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = tool.metadata?.title || tool.metadata?.label || tool.id;
    button.setAttribute('aria-label', tool.metadata?.label || tool.id);
    button.dataset.mathToolId = tool.id;
    button.innerHTML = contentBuilder(tool);
    button.addEventListener('click', () => {
        if (onToolSelect) {
            onToolSelect(tool);
        }
    });
    return button;
}

export function renderToolList({
    container,
    tools,
    query = '',
    emptyMessage = 'No tools found.',
    emptyClassName = 'qmx-math-toolbar-empty',
    onToolSelect,
    buttonClassName = 'qmx-ribbon-button qmx-math-tool',
    contentBuilder,
    groupByCategory = true,
    groupClassName = 'qmx-math-tool-group',
    groupTitleClassName = 'qmx-math-tool-group-title',
    groupItemsClassName = 'qmx-math-tool-group-items'
}) {
    if (!container) {
        return;
    }

    const visibleTools = sortTools(filterTools(tools, query));
    container.innerHTML = '';

    if (visibleTools.length === 0) {
        const empty = document.createElement('div');
        empty.className = emptyClassName;
        empty.textContent = emptyMessage;
        container.appendChild(empty);
        return;
    }

    if (!groupByCategory) {
        const list = document.createElement('div');
        list.className = 'qmx-math-tool-flat-list';
        visibleTools.forEach((tool) => {
            list.appendChild(createToolButton(tool, {
                onToolSelect,
                className: buttonClassName,
                contentBuilder
            }));
        });
        container.appendChild(list);
        return;
    }

    const groups = new Map();
    visibleTools.forEach((tool) => {
        const category = normalizeCategory(tool.metadata?.category);
        if (!groups.has(category)) {
            groups.set(category, []);
        }
        groups.get(category).push(tool);
    });

    groups.forEach((groupTools, category) => {
        const group = document.createElement('div');
        group.className = groupClassName;

        const title = document.createElement('div');
        title.className = groupTitleClassName;
        title.textContent = formatCategoryLabel(category);

        const items = document.createElement('div');
        items.className = groupItemsClassName;

        groupTools.forEach((tool) => {
            items.appendChild(createToolButton(tool, {
                onToolSelect,
                className: buttonClassName,
                contentBuilder
            }));
        });

        group.appendChild(title);
        group.appendChild(items);
        container.appendChild(group);
    });
}
