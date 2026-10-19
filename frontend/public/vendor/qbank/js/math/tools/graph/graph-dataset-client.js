export const GRAPH_DATASET_STORAGE_VERSION = '2.2.1.1';

const DEFAULT_BASE_URL = '/_qmx/graph-datasets';
let capabilitiesPromise = null;
let datasetCatalogPromise = null;

export class GraphDatasetApiError extends Error {
    constructor(message, {
        status = 0,
        code = '',
        details = null,
        response = null,
    } = {}) {
        super(message);
        this.name = 'GraphDatasetApiError';
        this.status = status;
        this.code = code;
        this.details = details;
        this.response = response;
    }
}

function trimSlash(value) {
    return String(value || '').replace(/\/+$/, '');
}

function datasetBaseUrl() {
    const configured = window.QmxGraphDatasetConfig?.baseUrl
        || document.querySelector('meta[name="qmx-graph-dataset-base"]')?.content
        || DEFAULT_BASE_URL;
    return trimSlash(configured) || DEFAULT_BASE_URL;
}

function csrfToken() {
    return window.QmxGraphDatasetConfig?.csrfToken
        || document.querySelector('meta[name="csrf-token"]')?.content
        || '';
}

function xsrfCookie() {
    const match = String(document.cookie || '')
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith('XSRF-TOKEN='));
    if (!match) return '';
    try {
        return decodeURIComponent(match.slice('XSRF-TOKEN='.length));
    } catch {
        return match.slice('XSRF-TOKEN='.length);
    }
}

async function datasetRequest(path = '', options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    headers.set('X-Requested-With', 'XMLHttpRequest');

    if (method !== 'GET' && method !== 'HEAD') {
        const token = csrfToken();
        const cookieToken = xsrfCookie();
        if (token) headers.set('X-CSRF-TOKEN', token);
        else if (cookieToken) headers.set('X-XSRF-TOKEN', cookieToken);
    }

    let body = options.body;
    if (body !== undefined && body !== null && !(body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetch(`${datasetBaseUrl()}${path}`, {
            ...options,
            method,
            headers,
            body,
            credentials: 'same-origin',
        });
    } catch (error) {
        throw new GraphDatasetApiError(
            'Dataset Storage API-তে সংযোগ করা যায়নি।',
            { code: 'NETWORK_ERROR', details: error },
        );
    }

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok || payload?.ok === false) {
        const validation = payload?.errors
            ? Object.values(payload.errors).flat().filter(Boolean)
            : [];
        const message = validation[0]
            || payload?.message
            || `Dataset Storage request failed (${response.status}).`;

        throw new GraphDatasetApiError(message, {
            status: response.status,
            code: payload?.code || '',
            details: payload?.errors || null,
            response: payload,
        });
    }

    return payload;
}

function normalizeDatasetMetadata(dataset) {
    if (!dataset || typeof dataset !== 'object') return null;
    const uuid = String(dataset.uuid || '');
    if (!/^[0-9a-f-]{36}$/i.test(uuid)) return null;

    return {
        uuid,
        name: String(dataset.name || 'Graph dataset'),
        sourceType: String(dataset.sourceType || 'manual'),
        rowCount: Number(dataset.rowCount) || 0,
        columnCount: Number(dataset.columnCount) || 0,
        checksum: String(dataset.checksum || ''),
        version: Number(dataset.version) || 1,
        storageDriver: String(dataset.storageDriver || 'database'),
        questionId: dataset.questionId ?? null,
        inUse: dataset.inUse === true,
        lastUsedAt: dataset.lastUsedAt || null,
        updatedAt: dataset.updatedAt || null,
        headers: Array.isArray(dataset.headers) ? dataset.headers : undefined,
        rows: Array.isArray(dataset.rows) ? dataset.rows : undefined,
    };
}

export async function graphDatasetCapabilities({ force = false } = {}) {
    if (!capabilitiesPromise || force) {
        capabilitiesPromise = datasetRequest('/capabilities')
            .catch((error) => {
                capabilitiesPromise = null;
                throw error;
            });
    }
    return capabilitiesPromise;
}

export async function listGraphDatasets({
    limit = 40,
    force = false,
} = {}) {
    if (!datasetCatalogPromise || force) {
        datasetCatalogPromise = datasetRequest(`/?limit=${Math.max(1, Math.min(100, Number(limit) || 40))}`)
            .then((payload) => (
                (Array.isArray(payload?.datasets) ? payload.datasets : [])
                    .map(normalizeDatasetMetadata)
                    .filter(Boolean)
            ))
            .catch((error) => {
                datasetCatalogPromise = null;
                throw error;
            });
    }
    return datasetCatalogPromise;
}

export async function fetchGraphDataset(uuid) {
    const payload = await datasetRequest(`/${encodeURIComponent(String(uuid || ''))}`);
    return normalizeDatasetMetadata(payload?.dataset);
}

export async function saveGraphDataset({
    datasetRef = null,
    name = 'Graph dataset',
    sourceType = 'manual',
    headers = [],
    rows = [],
    metadata = {},
} = {}) {
    const existingUuid = String(datasetRef?.uuid || '');
    const updating = /^[0-9a-f-]{36}$/i.test(existingUuid);

    const payload = await datasetRequest(
        updating ? `/${encodeURIComponent(existingUuid)}` : '/',
        {
            method: updating ? 'PUT' : 'POST',
            body: {
                name,
                source_type: sourceType,
                headers,
                rows,
                metadata,
                ...(updating ? { version: Number(datasetRef?.version) || 1 } : {}),
            },
        },
    );

    datasetCatalogPromise = null;
    return normalizeDatasetMetadata(payload?.dataset);
}

export async function deleteGraphDataset(uuid) {
    const payload = await datasetRequest(`/${encodeURIComponent(String(uuid || ''))}`, {
        method: 'DELETE',
    });
    datasetCatalogPromise = null;
    return payload?.deleted || uuid;
}

export function graphDatasetReference(dataset) {
    const normalized = normalizeDatasetMetadata(dataset);
    if (!normalized) return null;

    return {
        uuid: normalized.uuid,
        name: normalized.name,
        version: normalized.version,
        checksum: normalized.checksum,
        rowCount: normalized.rowCount,
        columnCount: normalized.columnCount,
        storageDriver: normalized.storageDriver,
    };
}

export function graphDatasetSourceType(sourceValue) {
    const source = String(sourceValue || 'manual');
    if (source.startsWith('page:')) return 'page_table';
    if (source.startsWith('saved:')) return 'saved_dataset';
    if (source === 'file') return 'file';
    return 'manual';
}
