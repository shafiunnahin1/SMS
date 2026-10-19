import {
    GRAPH_COLORS,
    clamp,
    compileMathExpression,
    safeColor,
    svgPathFromPoints,
    toEnglishDigits,
} from '../graph-utils.js';

function normalizeConditionText(value) {
    return toEnglishDigits(String(value || ''))
        .replace(/[−–—]/g, '-')
        .replace(/[≤]/g, '<=')
        .replace(/[≥]/g, '>=')
        .replace(/[∧]/g, '&&')
        .replace(/\bAND\b/gi, '&&')
        .replace(/\s+/g, ' ')
        .trim();
}

function colorFromParts(parts, fallback) {
    const match = parts.find((part) => /^#[0-9a-f]{6}$/i.test(String(part || '').trim()));
    return safeColor(match, fallback);
}

function opacityFromParts(parts, fallback) {
    for (const part of parts) {
        const match = String(part || '').match(/^(?:opacity|alpha)\s*=\s*(\d*\.?\d+)$/i);
        if (match) return clamp(match[1], .03, .9, fallback);
    }
    return fallback;
}

function relationFromParts(leftText, operator, rightText) {
    const left = String(leftText || '').trim();
    const right = String(rightText || '').trim();
    const leftFn = compileMathExpression(left, ['x', 'y']);
    const rightFn = compileMathExpression(right, ['x', 'y']);
    return {
        left,
        right,
        operator,
        leftFn,
        rightFn,
        valid: Boolean(leftFn && rightFn),
        strict: operator === '<' || operator === '>',
        equality: operator === '=' || operator === '==',
        source: `${left} ${operator} ${right}`,
    };
}

function expandClause(clause) {
    const source = normalizeConditionText(clause);
    if (!source) return [];

    const chained = source.match(/^(.+?)\s*(<=|>=|<|>)\s*([xy])\s*(<=|>=|<|>)\s*(.+)$/i);
    if (chained) {
        return [
            relationFromParts(chained[1], chained[2], chained[3]),
            relationFromParts(chained[3], chained[4], chained[5]),
        ];
    }

    const relation = source.match(/^(.+?)\s*(<=|>=|==|=|<|>)\s*(.+)$/);
    if (!relation) {
        return [{
            left: source,
            right: '',
            operator: '',
            leftFn: null,
            rightFn: null,
            valid: false,
            strict: false,
            equality: false,
            source,
        }];
    }

    return [relationFromParts(relation[1], relation[2], relation[3])];
}

export function parseRegionCondition(condition) {
    const source = normalizeConditionText(condition);
    const clauses = source
        .split(/\s*(?:&&|;)\s*/)
        .map((item) => item.trim())
        .filter(Boolean);

    const relations = clauses.flatMap(expandClause).slice(0, 16);
    return {
        source,
        relations,
        valid: relations.length > 0 && relations.every((relation) => relation.valid),
        error: relations.length
            ? (relations.find((relation) => !relation.valid)
                ? `Inequality বোঝা যায়নি: ${relations.find((relation) => !relation.valid).source}`
                : '')
            : 'কমপক্ষে একটি inequality লিখুন।',
    };
}

function parseRegionLine(line, index, defaultOpacity) {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('//')) return null;

    const parts = trimmed.split(/\s*\|\s*/).map((part) => part.trim());
    const fallbackColor = GRAPH_COLORS[index % GRAPH_COLORS.length];

    let label = `Region ${index + 1}`;
    let conditionText = '';

    if (parts.length >= 2) {
        label = String(parts[0] || label).slice(0, 80);
        conditionText = String(parts[1] || '').replace(/^\s*(?:condition|where)\s*=\s*/i, '').trim();
    } else {
        const natural = trimmed.match(/^([^:]{1,80})\s*:\s*(.+)$/);
        if (natural) {
            label = natural[1].trim();
            conditionText = natural[2].trim();
        } else {
            conditionText = trimmed;
        }
    }

    const condition = parseRegionCondition(conditionText);

    return {
        label,
        conditionText,
        condition,
        color: colorFromParts(parts.slice(2), fallbackColor),
        opacity: opacityFromParts(parts.slice(2), defaultOpacity),
        visible: true,
    };
}

export function parseRegionInput(text, defaultOpacity = .24) {
    return String(text || '')
        .split(/\r?\n/)
        .map((line, index) => parseRegionLine(line, index, defaultOpacity))
        .filter(Boolean)
        .slice(0, 12);
}

export function formatRegionInput(regions) {
    return (regions || []).map((region) => {
        const color = region.color ? ` | ${region.color}` : '';
        const opacity = Number.isFinite(Number(region.opacity))
            ? ` | opacity=${Number(region.opacity)}`
            : '';
        return `${region.label || 'Region'} | ${region.conditionText || region.condition?.source || ''}${color}${opacity}`;
    }).join('\n');
}

function normalizeRegions(spec) {
    const source = Array.isArray(spec.regions) && spec.regions.length
        ? spec.regions
        : parseRegionInput(spec.expression, spec.fillOpacity);

    return source.slice(0, 12).map((region, index) => {
        const conditionText = String(
            region?.conditionText
            || region?.condition?.source
            || '',
        ).slice(0, 1000);
        return {
            label: String(region?.label || `Region ${index + 1}`).slice(0, 80),
            conditionText,
            condition: parseRegionCondition(conditionText),
            color: safeColor(
                region?.color,
                spec.colors?.[index] || GRAPH_COLORS[index % GRAPH_COLORS.length],
            ),
            opacity: clamp(region?.opacity, .03, .9, spec.fillOpacity),
            visible: region?.visible !== false,
        };
    });
}

function relationDifference(relation, x, y) {
    const left = relation.leftFn(x, y);
    const right = relation.rightFn(x, y);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
    return left - right;
}

function relationMatches(relation, x, y, epsilon = 1e-9) {
    const difference = relationDifference(relation, x, y);
    if (!Number.isFinite(difference)) return false;

    if (relation.operator === '<') return difference < -epsilon;
    if (relation.operator === '<=') return difference <= epsilon;
    if (relation.operator === '>') return difference > epsilon;
    if (relation.operator === '>=') return difference >= -epsilon;
    if (relation.operator === '=' || relation.operator === '==') {
        return Math.abs(difference) <= epsilon;
    }
    return false;
}

function regionMatches(region, x, y) {
    if (!region.condition?.valid) return false;
    return region.condition.relations.every((relation) => relationMatches(relation, x, y));
}

function fillRuns(region, spec, context) {
    const nx = Math.max(24, Math.min(220, Math.round(spec.resolution)));
    const ny = Math.max(
        18,
        Math.min(
            220,
            Math.round(nx * context.plotHeight / Math.max(1, context.plotWidth)),
        ),
    );
    const dx = (context.xMax - context.xMin) / nx;
    const dy = (context.yMax - context.yMin) / ny;
    const content = [];
    let included = 0;
    const total = nx * ny;

    for (let row = 0; row < ny; row += 1) {
        const y0 = context.yMin + row * dy;
        const y1 = y0 + dy;
        const y = (y0 + y1) / 2;
        let runStart = -1;

        const flush = (endIndex) => {
            if (runStart < 0) return;
            const x0 = context.xMin + runStart * dx;
            const x1 = context.xMin + endIndex * dx;
            const left = context.sx(x0) - .25;
            const right = context.sx(x1) + .25;
            const top = context.sy(y1) - .25;
            const bottom = context.sy(y0) + .25;
            content.push(
                `<rect class="qmx-region-cell" x="${left}" y="${top}" width="${Math.max(.5, right - left)}" height="${Math.max(.5, bottom - top)}" fill="${region.color}" fill-opacity="${region.opacity}" clip-path="url(#${context.clipId})"/>`,
            );
            runStart = -1;
        };

        for (let column = 0; column < nx; column += 1) {
            const x0 = context.xMin + column * dx;
            const x1 = x0 + dx;
            const x = (x0 + x1) / 2;
            const inside = regionMatches(region, x, y);
            if (inside) {
                included += 1;
                if (runStart < 0) runStart = column;
            } else {
                flush(column);
            }
        }
        flush(nx);
    }

    return {
        content: content.join(''),
        coverage: total ? included / total : 0,
    };
}

function normalizedSimple(value) {
    return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function directBoundaryPoints(relation, spec, context) {
    const left = normalizedSimple(relation.left);
    const right = normalizedSimple(relation.right);
    const count = Math.max(180, Math.min(1800, Math.round(spec.boundarySamples)));

    if (left === 'y' && !/\by\b/i.test(relation.right)) {
        const fn = compileMathExpression(relation.right, ['x']);
        if (!fn) return null;
        return Array.from({ length: count + 1 }, (_, index) => {
            const x = context.xMin + (context.xMax - context.xMin) * index / count;
            return [x, fn(x)];
        });
    }

    if (right === 'y' && !/\by\b/i.test(relation.left)) {
        const fn = compileMathExpression(relation.left, ['x']);
        if (!fn) return null;
        return Array.from({ length: count + 1 }, (_, index) => {
            const x = context.xMin + (context.xMax - context.xMin) * index / count;
            return [x, fn(x)];
        });
    }

    if (left === 'x' && !/[xy]/i.test(relation.right)) {
        const fn = compileMathExpression(relation.right, []);
        const x = fn ? fn() : NaN;
        return Number.isFinite(x) ? [[x, context.yMin], [x, context.yMax]] : null;
    }

    if (right === 'x' && !/[xy]/i.test(relation.left)) {
        const fn = compileMathExpression(relation.left, []);
        const x = fn ? fn() : NaN;
        return Number.isFinite(x) ? [[x, context.yMin], [x, context.yMax]] : null;
    }

    if (left === 'y' && !/[xy]/i.test(relation.right)) {
        const fn = compileMathExpression(relation.right, []);
        const y = fn ? fn() : NaN;
        return Number.isFinite(y) ? [[context.xMin, y], [context.xMax, y]] : null;
    }

    if (right === 'y' && !/[xy]/i.test(relation.left)) {
        const fn = compileMathExpression(relation.left, []);
        const y = fn ? fn() : NaN;
        return Number.isFinite(y) ? [[context.xMin, y], [context.xMax, y]] : null;
    }

    return null;
}

function interpolatePoint(a, b, va, vb) {
    const denominator = vb - va;
    const ratio = Math.abs(denominator) < 1e-12 ? .5 : -va / denominator;
    const bounded = Math.max(0, Math.min(1, ratio));
    return [
        a[0] + (b[0] - a[0]) * bounded,
        a[1] + (b[1] - a[1]) * bounded,
    ];
}

function implicitBoundarySegments(relation, spec, context) {
    const nx = Math.max(24, Math.min(140, Math.round(spec.boundaryResolution)));
    const ny = Math.max(
        18,
        Math.min(
            140,
            Math.round(nx * context.plotHeight / Math.max(1, context.plotWidth)),
        ),
    );
    const grid = [];

    for (let row = 0; row <= ny; row += 1) {
        const y = context.yMin + (context.yMax - context.yMin) * row / ny;
        const values = [];
        for (let column = 0; column <= nx; column += 1) {
            const x = context.xMin + (context.xMax - context.xMin) * column / nx;
            values.push(relationDifference(relation, x, y));
        }
        grid.push(values);
    }

    const segments = [];

    for (let row = 0; row < ny; row += 1) {
        for (let column = 0; column < nx; column += 1) {
            const x0 = context.xMin + (context.xMax - context.xMin) * column / nx;
            const x1 = context.xMin + (context.xMax - context.xMin) * (column + 1) / nx;
            const y0 = context.yMin + (context.yMax - context.yMin) * row / ny;
            const y1 = context.yMin + (context.yMax - context.yMin) * (row + 1) / ny;

            const corners = [
                [x0, y0],
                [x1, y0],
                [x1, y1],
                [x0, y1],
            ];
            const values = [
                grid[row][column],
                grid[row][column + 1],
                grid[row + 1][column + 1],
                grid[row + 1][column],
            ];
            const hits = [];

            for (let edge = 0; edge < 4; edge += 1) {
                const next = (edge + 1) % 4;
                const a = values[edge];
                const b = values[next];
                if (!Number.isFinite(a) || !Number.isFinite(b)) continue;

                const crosses = (a <= 0 && b > 0) || (a > 0 && b <= 0);
                if (crosses) {
                    hits.push(interpolatePoint(corners[edge], corners[next], a, b));
                }
            }

            if (hits.length === 2) segments.push([hits[0], hits[1]]);
            if (hits.length === 4) {
                segments.push([hits[0], hits[1]], [hits[2], hits[3]]);
            }
        }
    }

    return segments;
}

function boundaryMarkup(region, spec, context) {
    if (!spec.showBoundary) return '';

    const content = [];
    const seen = new Set();

    region.condition.relations.forEach((relation) => {
        const key = relation.source.replace(/\s+/g, '').toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        const dash = relation.strict ? ' stroke-dasharray="7 5"' : '';
        const direct = directBoundaryPoints(relation, spec, context);

        if (direct?.length) {
            const path = svgPathFromPoints(direct, context, {
                breakDistance: context.plotHeight * 1.4,
            });
            content.push(
                `<path class="qmx-region-boundary" d="${path}" fill="none" stroke="${region.color}" stroke-width="${spec.boundaryWidth}"${dash} stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${context.clipId})"><title>${context.escapeXml(relation.source)}</title></path>`,
            );
            return;
        }

        const segments = implicitBoundarySegments(relation, spec, context);
        if (!segments.length) return;

        const path = segments.map((segment) => (
            `M ${context.sx(segment[0][0])} ${context.sy(segment[0][1])} L ${context.sx(segment[1][0])} ${context.sy(segment[1][1])}`
        )).join(' ');

        content.push(
            `<path class="qmx-region-boundary" d="${path}" fill="none" stroke="${region.color}" stroke-width="${spec.boundaryWidth}"${dash} stroke-linecap="round" clip-path="url(#${context.clipId})"><title>${context.escapeXml(relation.source)}</title></path>`,
        );
    });

    return content.join('');
}

function summaryMarkup(regions, coverages, spec, context) {
    if (!spec.showRegionSummary) return '';
    const visible = regions.filter((region) => region.visible !== false);
    const commonCount = visible.filter((region) => region.condition.relations.length > 1).length;
    const averageCoverage = coverages.length
        ? coverages.reduce((sum, value) => sum + value, 0) / coverages.length
        : 0;
    const parts = [
        `${visible.length} shaded region${visible.length === 1 ? '' : 's'}`,
    ];
    if (commonCount) {
        parts.push(`${commonCount} common-feasible layer${commonCount === 1 ? '' : 's'}`);
    }
    parts.push(`avg. ${(averageCoverage * 100).toFixed(1)}% of view`);
    const summary = parts.join(' • ');
    const width = Math.min(context.plotWidth - 16, Math.max(190, summary.length * 6.1 + 18));
    const x = context.margin.left + 8;
    const y = context.margin.top + 8;
    return `<g class="qmx-region-summary"><rect x="${x}" y="${y}" width="${width}" height="24" rx="6" fill="#ffffff" fill-opacity=".92" stroke="#cbd5e1"/><text x="${x + 9}" y="${y + 16}" font-size="10.5" font-weight="700" fill="#334155">${context.escapeXml(summary)}</text></g>`;
}

export function registerRegionGraph(registry) {
    if (registry.has('region')) return;

    registry.register({
        id: 'region',
        label: 'Region / Inequality Shading',
        group: 'Calculus & Regions',
        description: [
            'প্রতি লাইনে: label | inequality/combined inequalities | optional color | optional opacity',
            'উদাহরণ: Above parabola | y >= x^2 | #3b82f6',
            'Common region: Feasible | y >= x^2 && y <= 2*x+3 && x >= -2 && x <= 3',
            'Strict < বা > boundary dashed; <= বা >= boundary solid হয়।',
        ].join('\n'),
        defaults: {
            expression: 'Above parabola | y >= x^2 | #3b82f6 | opacity=0.24',
            regions: [],
            resolution: 100,
            boundaryResolution: 72,
            boundarySamples: 700,
            fillOpacity: .24,
            showBoundary: true,
            boundaryWidth: 2,
            showRegionSummary: true,
        },
        editor: {
            mode: 'region',
            inputLabel: 'Regions: label | inequality | optional color | optional opacity',
            placeholder: 'Above parabola | y >= x^2 | #3b82f6\nBelow line | y <= 2*x+3 | #f59e0b\nFeasible | y >= x^2 && y <= 2*x+3 && x >= -2 && x <= 3 | #22c55e',
            fields: [
                { key: 'resolution', label: 'Fill resolution', type: 'number', min: 24, max: 220, step: 4 },
                { key: 'fillOpacity', label: 'Default fill opacity', type: 'number', min: .03, max: .9, step: .01 },
                { key: 'showBoundary', label: 'Show inequality boundaries', type: 'checkbox' },
                { key: 'boundaryWidth', label: 'Boundary line width', type: 'number', min: .5, max: 8, step: .25 },
                { key: 'boundaryResolution', label: 'Implicit boundary resolution', type: 'number', min: 24, max: 140, step: 4 },
                { key: 'boundarySamples', label: 'Function boundary samples', type: 'number', min: 180, max: 1800, step: 20 },
                { key: 'showRegionSummary', label: 'Show region summary', type: 'checkbox' },
            ],
        },
        parseInput(text) {
            return {
                expression: String(text || ''),
                regions: parseRegionInput(text),
            };
        },
        formatInput(spec) {
            return formatRegionInput(spec.regions);
        },
        normalize(spec) {
            const fillOpacity = clamp(spec.fillOpacity, .03, .9, .24);
            const regions = normalizeRegions({
                ...spec,
                fillOpacity,
            });
            return {
                ...spec,
                expression: formatRegionInput(regions),
                regions,
                resolution: clamp(spec.resolution, 24, 220, 100),
                boundaryResolution: clamp(spec.boundaryResolution, 24, 140, 72),
                boundarySamples: clamp(spec.boundarySamples, 180, 1800, 700),
                fillOpacity,
                showBoundary: spec.showBoundary !== false,
                boundaryWidth: clamp(spec.boundaryWidth, .5, 8, 2),
                showRegionSummary: spec.showRegionSummary !== false,
            };
        },
        validate(spec) {
            if (!spec.regions?.length) return ['কমপক্ষে একটি inequality region লিখুন।'];
            for (const region of spec.regions) {
                if (!region.condition?.valid) {
                    return [`${region.label}: ${region.condition?.error || 'inequality invalid'}`];
                }
            }
            return [];
        },
        detect(source) {
            const lines = String(source || '')
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('//'));
            const matches = lines.filter((line) => {
                const parts = line.split(/\s*\|\s*/);
                const condition = parts.length >= 2 ? parts[1] : line;
                return /(?:<=|>=|<|>)/.test(condition)
                    && (
                        /\by\b/i.test(condition)
                        || /\bx\b.*\by\b|\by\b.*\bx\b/i.test(condition)
                        || /&&/.test(condition)
                    );
            });
            return matches.length
                ? {
                    score: matches.length >= 2 ? 118 : 112,
                    spec: {
                        expression: source,
                        regions: parseRegionInput(source),
                    },
                }
                : null;
        },
        render(spec, context) {
            const content = [];
            const legend = [];
            const coverages = [];

            spec.regions.forEach((region, index) => {
                if (region.visible === false) return;
                if (!region.condition?.valid) {
                    content.push(context.message(`${region.label}: inequality বোঝা যায়নি।`, '#dc2626', index));
                    return;
                }

                const fill = region.condition.relations.some((relation) => !relation.equality)
                    ? fillRuns(region, spec, context)
                    : { content: '', coverage: 0 };

                content.push(fill.content);
                coverages.push(fill.coverage);
                content.push(boundaryMarkup(region, spec, context));
                legend.push({
                    label: `${region.label}: ${region.conditionText}`,
                    color: region.color,
                    kind: 'box',
                });
            });

            content.push(summaryMarkup(spec.regions, coverages, spec, context));

            return {
                content: content.join(''),
                legend,
            };
        },
    });
}
