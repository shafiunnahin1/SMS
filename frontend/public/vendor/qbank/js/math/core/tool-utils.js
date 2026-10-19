export const DEFAULT_TOOL_METADATA = {
    label: '',
    icon: '∑',
    category: 'other',
    description: '',
    keywords: [],
    shortcut: '',
    order: Number.MAX_SAFE_INTEGER
};

export function normalizeCategory(category) {
    return String(category || DEFAULT_TOOL_METADATA.category).trim().toLowerCase();
}

export function formatCategoryLabel(category) {
    if (!category || normalizeCategory(category) === DEFAULT_TOOL_METADATA.category) {
        return 'Other';
    }
    return String(category).replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeKeywords(keywords) {
    if (!keywords) {
        return [];
    }
    if (Array.isArray(keywords)) {
        return keywords.map((keyword) => String(keyword).trim().toLowerCase()).filter(Boolean);
    }
    return String(keywords)
        .split(/[,\s]+/)
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean);
}

export function normalizeTextValue(value) {
    return String(value || '').trim().toLowerCase();
}

export function matchesToolQuery(tool, query) {
    if (!query) {
        return true;
    }
    const normalized = normalizeTextValue(query);
    const label = normalizeTextValue(tool.metadata?.label || tool.id);
    const description = normalizeTextValue(tool.metadata?.description);
    const category = normalizeTextValue(tool.metadata?.category);
    const id = normalizeTextValue(tool.id);
    const keywords = normalizeKeywords(tool.metadata?.keywords).join(' ');
    return [label, description, category, id, keywords].some((value) => value.includes(normalized));
}

export function compareToolOrder(a, b) {
    const orderA = Number.isFinite(a.metadata?.order) ? a.metadata.order : DEFAULT_TOOL_METADATA.order;
    const orderB = Number.isFinite(b.metadata?.order) ? b.metadata.order : DEFAULT_TOOL_METADATA.order;
    return orderA - orderB;
}

export function normalizeShortcut(shortcut) {
    if (!shortcut) {
        return '';
    }
    return String(shortcut)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/\++/g, '+');
}

export function shortcutMatchesEvent(event, shortcut) {
    const normalized = normalizeShortcut(shortcut);
    if (!normalized) {
        return false;
    }

    const parts = normalized.split('+').filter(Boolean);
    const keyPart = parts.pop();
    const modifiers = new Set(parts);

    if (modifiers.has('ctrl') !== event.ctrlKey) {
        return false;
    }
    if (modifiers.has('shift') !== event.shiftKey) {
        return false;
    }
    if (modifiers.has('alt') !== event.altKey) {
        return false;
    }
    if (modifiers.has('meta') !== event.metaKey) {
        return false;
    }

    return event.key.toLowerCase() === keyPart.toLowerCase();
}

export function validateToolContract(tool) {
    if (!tool || !tool.id) {
        throw new Error('Tool definition must include id');
    }
    if (!tool.dialog || typeof tool.dialog !== 'function') {
        throw new Error(`Tool '${tool.id}' must provide a dialog function`);
    }
    if (!tool.generateLatex || typeof tool.generateLatex !== 'function') {
        throw new Error(`Tool '${tool.id}' must provide a generateLatex function`);
    }
    if (tool.insert && typeof tool.insert !== 'function') {
        throw new Error(`Tool '${tool.id}' has invalid insert function`);
    }
    if (!tool.metadata || typeof tool.metadata !== 'object') {
        throw new Error(`Tool '${tool.id}' must provide metadata object`);
    }
}

export function ensureToolMetadata(tool) {
    tool.metadata = {
        ...DEFAULT_TOOL_METADATA,
        ...tool.metadata
    };
    if (!tool.metadata.label) {
        tool.metadata.label = tool.id;
    }
    if (!Array.isArray(tool.metadata.keywords)) {
        tool.metadata.keywords = normalizeKeywords(tool.metadata.keywords);
    }
    return tool;
}
