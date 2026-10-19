class GraphRegistryClass {
    constructor() {
        this.plugins = new Map();
    }

    register(plugin) {
        if (!plugin || typeof plugin !== 'object') {
            throw new TypeError('Graph plugin must be an object.');
        }
        const id = String(plugin.id || '').trim();
        if (!/^[a-z][a-z0-9-]{1,48}$/.test(id)) {
            throw new TypeError(`Invalid graph plugin id: ${id || '(empty)'}`);
        }
        if (this.plugins.has(id)) {
            throw new Error(`Graph plugin already registered: ${id}`);
        }
        if (typeof plugin.render !== 'function') {
            throw new TypeError(`Graph plugin ${id} must provide render(spec, context).`);
        }
        this.plugins.set(id, Object.freeze({
            label: id,
            group: 'Other',
            description: '',
            defaults: {},
            editor: { mode: 'data', fields: [] },
            normalize: (spec) => spec,
            validate: () => [],
            detect: null,
            ...plugin,
            id,
        }));
        return this.get(id);
    }

    unregister(id) {
        return this.plugins.delete(String(id || ''));
    }

    get(id) {
        return this.plugins.get(String(id || '')) || null;
    }

    has(id) {
        return this.plugins.has(String(id || ''));
    }

    list() {
        return Array.from(this.plugins.values());
    }

    groups() {
        const groups = new Map();
        this.list().forEach((plugin) => {
            if (!groups.has(plugin.group)) groups.set(plugin.group, []);
            groups.get(plugin.group).push(plugin);
        });
        return groups;
    }

    detect(source) {
        let best = null;
        this.plugins.forEach((plugin) => {
            if (typeof plugin.detect !== 'function') return;
            try {
                const result = plugin.detect(source);
                if (!result) return;
                const candidate = typeof result === 'number'
                    ? { score: result, spec: { type: plugin.id } }
                    : {
                        score: Number(result.score) || 0,
                        spec: { type: plugin.id, ...(result.spec || {}) },
                    };
                if (!best || candidate.score > best.score) best = candidate;
            } catch (error) {
                console.warn(`Graph detector failed: ${plugin.id}`, error);
            }
        });
        return best;
    }

    normalize(type, spec) {
        const plugin = this.get(type);
        if (!plugin) return spec;
        try {
            const definedSpec = Object.fromEntries(Object.entries(spec || {}).filter(([, value]) => value !== undefined));
            return plugin.normalize({ ...plugin.defaults, ...definedSpec }) || definedSpec;
        } catch (error) {
            console.warn(`Graph normalizer failed: ${type}`, error);
            const definedSpec = Object.fromEntries(Object.entries(spec || {}).filter(([, value]) => value !== undefined));
            return { ...plugin.defaults, ...definedSpec };
        }
    }

    validate(spec) {
        const plugin = this.get(spec?.type);
        if (!plugin) return [`Unknown graph type: ${spec?.type || '(empty)'}`];
        try {
            const errors = plugin.validate(spec);
            return Array.isArray(errors) ? errors.filter(Boolean).map(String) : [];
        } catch (error) {
            return [error?.message || `Validation failed for ${plugin.id}`];
        }
    }
}

export const GraphRegistry = new GraphRegistryClass();
export default GraphRegistry;
