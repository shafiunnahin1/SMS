import {
    GRAPH_COLORS,
    clamp,
    compileMathExpression,
    finiteArray,
    formatTick,
    linearRegression,
    parseCategoryData,
    parseCoordinateData,
    parseNumberList,
    quantile,
    safeColor,
    splitLines,
    splitSeriesExpressions,
    stringArray,
    svgPathFromPoints,
    toEnglishDigits,
} from '../graph-utils.js';

function errorsForExpressionSeries(spec, key = 'series') {
    const items = Array.isArray(spec[key]) ? spec[key] : [];
    return items.length ? [] : ['কমপক্ষে একটি expression লিখুন।'];
}

function normalizeSeries(spec, fallbackExpression = 'x^2') {
    const source = Array.isArray(spec.series) && spec.series.length
        ? spec.series
        : splitSeriesExpressions(spec.expression || fallbackExpression);
    return source.slice(0, 20).map((item, index) => {
        const rawExpression = String(item?.expression || fallbackExpression).slice(0, 1000).trim();
        const expression = rawExpression.replace(/^(?:y|r|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\))\s*=\s*/i, '').trim();
        const rawLabel = String(item?.label || expression || `Series ${index + 1}`).slice(0, 80);
        const label = /^(?:y|r)\s*=/i.test(rawLabel) ? expression : rawLabel;
        return {
            label,
            expression,
            color: safeColor(item?.color, spec.colors?.[index] || GRAPH_COLORS[index % GRAPH_COLORS.length]),
            visible: item?.visible !== false,
            fill: item?.fill === true,
        };
    }).filter((item) => item.expression.trim());
}

function formatSeries(series) {
    return (series || []).map((item) => {
        const expression = item.expression || '';
        const label = item.label || expression;
        return label && label !== expression ? `${label} = ${expression}` : expression;
    }).join('\n');
}

function sampleFunction(expression, variable, minimum, maximum, count, secondArguments = []) {
    const fn = compileMathExpression(expression, [variable, ...secondArguments.map((item) => item.name)]);
    if (!fn) return null;
    const points = [];
    for (let index = 0; index <= count; index += 1) {
        const input = minimum + (maximum - minimum) * index / count;
        const extra = secondArguments.map((item) => item.value);
        points.push([input, fn(input, ...extra)]);
    }
    return points;
}

function renderFunctionSeries(spec, context) {
    const legend = [];
    const content = [];
    spec.series.forEach((series, index) => {
        if (series.visible === false) return;
        const points = sampleFunction(series.expression, 'x', context.xMin, context.xMax, spec.samples || 800);
        const color = safeColor(series.color, context.colors[index % context.colors.length]);
        if (!points) {
            content.push(context.message(`Expression বোঝা যায়নি: ${series.expression}`, '#dc2626', index));
            return;
        }
        const path = svgPathFromPoints(points, context, { breakDistance: context.plotHeight * 1.4 });
        if (series.fill) {
            const baseline = context.sy(clamp(spec.fillTo, context.yMin, context.yMax, 0));
            const drawable = points.filter((point) => Number.isFinite(point[1]) && context.inExtendedBounds(point[0], point[1]));
            if (drawable.length > 1) {
                const first = drawable[0];
                const last = drawable[drawable.length - 1];
                content.push(`<path d="M${context.sx(first[0])},${baseline} ${path} L${context.sx(last[0])},${baseline} Z" fill="${color}" opacity=".12" clip-path="url(#${context.clipId})"/>`);
            }
        }
        content.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="${spec.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${context.clipId})"/>`);
        legend.push({ label: series.label || series.expression, color, kind: 'line' });
    });
    return { content: content.join(''), legend };
}

function coordinateNormalize(spec) {
    return {
        ...spec,
        x: finiteArray(spec.x),
        y: finiteArray(spec.y),
        labels: stringArray(spec.labels),
        showPoints: spec.showPoints !== false,
        connect: spec.connect === true,
        regression: spec.regression === true,
        pointRadius: clamp(spec.pointRadius, 1, 12, 4.5),
        strokeWidth: clamp(spec.strokeWidth, 0.5, 10, 2.5),
    };
}

function coordinateRender(spec, context, connectByDefault = false) {
    const count = Math.min(spec.x.length, spec.y.length);
    const points = [];
    for (let index = 0; index < count; index += 1) points.push([spec.x[index], spec.y[index]]);
    const color = safeColor(spec.color, context.colors[0]);
    const content = [];
    if ((spec.connect || connectByDefault) && points.length) {
        content.push(`<path d="${svgPathFromPoints(points, context)}" fill="none" stroke="${color}" stroke-width="${spec.strokeWidth}" clip-path="url(#${context.clipId})"/>`);
    }
    if (spec.showPoints) {
        points.forEach((point, index) => {
            if (!context.inExtendedBounds(point[0], point[1])) return;
            const label = spec.labels[index] ? `<title>${context.escapeXml(spec.labels[index])}</title>` : '';
            content.push(`<circle cx="${context.sx(point[0])}" cy="${context.sy(point[1])}" r="${spec.pointRadius}" fill="${color}" clip-path="url(#${context.clipId})">${label}</circle>`);
        });
    }
    if (spec.regression) {
        const regression = linearRegression(spec.x, spec.y);
        if (regression) {
            const y1 = regression.slope * context.xMin + regression.intercept;
            const y2 = regression.slope * context.xMax + regression.intercept;
            content.push(`<line x1="${context.sx(context.xMin)}" y1="${context.sy(y1)}" x2="${context.sx(context.xMax)}" y2="${context.sy(y2)}" stroke="#0f172a" stroke-width="1.8" stroke-dasharray="7 5" clip-path="url(#${context.clipId})"/>`);
        }
    }
    return { content: content.join(''), legend: [{ label: spec.seriesLabel || spec.title || 'Data', color, kind: 'point' }] };
}

function dataValidation(spec) {
    return Math.min(spec.x?.length || 0, spec.y?.length || 0) > 0 ? [] : ['কমপক্ষে একটি data point লিখুন।'];
}

function parseParametricInput(text) {
    return splitLines(text).slice(0, 20).map((line, index) => {
        const pieces = line.split(/\s*\|\s*|\s*;\s*/).filter(Boolean);
        if (pieces.length >= 3) return { label: pieces[0], xExpression: pieces[1], yExpression: pieces[2] };
        if (pieces.length === 2) return { label: `Curve ${index + 1}`, xExpression: pieces[0], yExpression: pieces[1] };
        const comma = line.split(/\s*,\s*/);
        return { label: `Curve ${index + 1}`, xExpression: comma[0] || 'cos(t)', yExpression: comma[1] || 'sin(t)' };
    });
}

function conicPoints(type, spec, context) {
    const p = spec.params || {};
    const h = Number(p.h) || 0;
    const k = Number(p.k) || 0;
    const a = Math.max(0.0001, Math.abs(Number(p.a) || 4));
    const b = Math.max(0.0001, Math.abs(Number(p.b) || 3));
    const radius = Math.max(0.0001, Math.abs(Number(p.radius) || 4));
    const focal = Math.abs(Number(p.p) || 2) < 1e-9 ? 2 : Number(p.p);
    const orientation = p.orientation === 'vertical' ? 'vertical' : 'horizontal';
    const points = [];

    if (type === 'circle' || type === 'ellipse') {
        for (let index = 0; index <= 720; index += 1) {
            const angle = Math.PI * 2 * index / 720;
            const rx = type === 'circle' ? radius : a;
            const ry = type === 'circle' ? radius : b;
            points.push([h + rx * Math.cos(angle), k + ry * Math.sin(angle)]);
        }
        return [points];
    }

    if (type === 'parabola') {
        const branch = [];
        const min = orientation === 'vertical' ? context.xMin - h : context.yMin - k;
        const max = orientation === 'vertical' ? context.xMax - h : context.yMax - k;
        for (let index = 0; index <= 800; index += 1) {
            const t = min + (max - min) * index / 800;
            if (orientation === 'vertical') branch.push([h + t, k + (t * t) / (4 * focal)]);
            else branch.push([h + (t * t) / (4 * focal), k + t]);
        }
        return [branch];
    }

    const positive = [];
    const negative = [];
    for (let index = 0; index <= 700; index += 1) {
        const t = -3.6 + 7.2 * index / 700;
        if (orientation === 'horizontal') {
            positive.push([h + a * Math.cosh(t), k + b * Math.sinh(t)]);
            negative.push([h - a * Math.cosh(t), k + b * Math.sinh(t)]);
        } else {
            positive.push([h + b * Math.sinh(t), k + a * Math.cosh(t)]);
            negative.push([h + b * Math.sinh(t), k - a * Math.cosh(t)]);
        }
    }
    return [positive, negative];
}

function conicPlugin(id, label, fields, defaults = {}) {
    return {
        id,
        label,
        group: 'Conic Sections',
        description: `${label} graph`,
        defaults: { params: defaults, aspectLock: true },
        editor: { mode: 'none', fields },
        normalize(spec) {
            return {
                ...spec,
                params: { ...defaults, ...(spec.params || {}) },
                strokeWidth: clamp(spec.strokeWidth, 0.5, 10, 2.6),
            };
        },
        validate(spec) {
            const p = spec.params || {};
            if (id === 'circle' && !(Math.abs(Number(p.radius)) > 0)) return ['Radius শূন্যের চেয়ে বড় হতে হবে।'];
            if (id === 'ellipse' || id === 'hyperbola') {
                if (!(Math.abs(Number(p.a)) > 0) || !(Math.abs(Number(p.b)) > 0)) return ['a এবং b শূন্যের চেয়ে বড় হতে হবে।'];
            }
            if (id === 'parabola' && Math.abs(Number(p.p)) < 1e-9) return ['p শূন্য হতে পারবে না।'];
            return [];
        },
        render(spec, context) {
            const color = safeColor(spec.color, context.colors[0]);
            const paths = conicPoints(id, spec, context).map((points) => (
                `<path d="${svgPathFromPoints(points, context, { breakDistance: context.plotHeight * 1.5 })}" fill="none" stroke="${color}" stroke-width="${spec.strokeWidth}" clip-path="url(#${context.clipId})"/>`
            ));
            return { content: paths.join(''), legend: [{ label: spec.title || label, color, kind: 'line' }] };
        },
    };
}

function histogramBins(values, requestedBins) {
    if (!values.length) return [];
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    if (maximum === minimum) return [{ start: minimum - 0.5, end: maximum + 0.5, count: values.length }];
    const binCount = Math.max(2, Math.min(60, Math.round(requestedBins || Math.ceil(Math.sqrt(values.length)))));
    const width = (maximum - minimum) / binCount;
    const bins = Array.from({ length: binCount }, (_, index) => ({
        start: minimum + width * index,
        end: index === binCount - 1 ? maximum : minimum + width * (index + 1),
        count: 0,
    }));
    values.forEach((value) => {
        const index = Math.min(binCount - 1, Math.floor((value - minimum) / width));
        bins[index].count += 1;
    });
    return bins;
}

function renderBars(spec, context, histogram = false) {
    const groupedBins = Array.isArray(spec.groupedBins)
        ? spec.groupedBins.filter((bin) => (
            Number.isFinite(Number(bin?.start))
            && Number.isFinite(Number(bin?.end))
            && Number.isFinite(Number(bin?.count))
            && Number(bin.end) > Number(bin.start)
        ))
        : [];
    const data = histogram
        ? (
            groupedBins.length
                ? groupedBins.map((bin) => ({
                    label: String(bin.label || `${formatTick(Number(bin.start))}–${formatTick(Number(bin.end))}`),
                    value: Math.max(0, Number(bin.count)),
                }))
                : histogramBins(spec.values, spec.binCount).map((bin) => ({
                    label: `${formatTick(bin.start)}–${formatTick(bin.end)}`,
                    value: bin.count,
                }))
        )
        : spec.values.map((value, index) => ({ label: spec.labels[index] || String(index + 1), value }));
    const left = context.margin.left;
    const top = context.margin.top;
    const width = context.plotWidth;
    const height = context.plotHeight;
    const yMinimum = Number(context.yMin);
    const yMaximum = Number(context.yMax);
    const zeroValue = Math.max(yMinimum, Math.min(yMaximum, 0));
    const baseline = context.sy(zeroValue);
    const barWidth = width / Math.max(1, data.length);
    const color = safeColor(spec.color, context.colors[0]);
    const content = [];
    for (let tick = 0; tick <= 5; tick += 1) {
        const value = yMinimum + (yMaximum - yMinimum) * tick / 5;
        const y = context.sy(value);
        content.push(`<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="#e2e8f0"/>`);
        content.push(`<text x="${left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#475569">${formatTick(value)}</text>`);
    }
    data.forEach((item, index) => {
        const value = Number(item.value);
        const valueY = context.sy(Math.max(yMinimum, Math.min(yMaximum, value)));
        const gap = histogram ? 0 : Math.min(8, barWidth * 0.16);
        const x = left + index * barWidth + gap / 2;
        const y = Math.min(baseline, valueY);
        const barHeight = Math.abs(valueY - baseline);
        content.push(`<rect x="${x}" y="${y}" width="${Math.max(1, barWidth - gap)}" height="${barHeight}" fill="${color}" opacity=".86"><title>${context.escapeXml(item.label)}: ${formatTick(item.value)}</title></rect>`);
        if (data.length <= 24) {
            const label = context.escapeXml(String(item.label).slice(0, 18));
            content.push(`<text x="${left + (index + .5) * barWidth}" y="${baseline + 15}" text-anchor="middle" font-size="10" fill="#475569" transform="rotate(${data.length > 10 ? -35 : 0} ${left + (index + .5) * barWidth} ${baseline + 15})">${label}</text>`);
        }
    });
    content.push(`<line x1="${left}" y1="${baseline}" x2="${left + width}" y2="${baseline}" stroke="#0f172a" stroke-width="1.3"/>`);
    content.push(`<line x1="${left}" y1="${top}" x2="${left}" y2="${top + height}" stroke="#0f172a" stroke-width="1.3"/>`);
    return { content: content.join(''), legend: [{ label: spec.seriesLabel || (histogram ? 'Frequency' : 'Value'), color, kind: 'box' }] };
}

function renderPie(spec, context) {
    const values = spec.values.map((value) => Math.max(0, value));
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!total) return { content: context.message('Pie chart-এর জন্য positive value লিখুন।', '#dc2626'), legend: [] };
    const radius = Math.min(context.plotWidth, context.plotHeight) * 0.38;
    const cx = context.margin.left + context.plotWidth * 0.43;
    const cy = context.margin.top + context.plotHeight / 2;
    let angle = -Math.PI / 2;
    const content = [];
    const legend = [];
    values.forEach((value, index) => {
        if (value <= 0) return;
        const next = angle + Math.PI * 2 * value / total;
        const x1 = cx + radius * Math.cos(angle);
        const y1 = cy + radius * Math.sin(angle);
        const x2 = cx + radius * Math.cos(next);
        const y2 = cy + radius * Math.sin(next);
        const color = context.colors[index % context.colors.length];
        const large = next - angle > Math.PI ? 1 : 0;
        const label = spec.labels[index] || String(index + 1);
        content.push(`<path d="M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${large},1 ${x2},${y2} Z" fill="${color}" stroke="#fff" stroke-width="1.5"><title>${context.escapeXml(label)}: ${formatTick(value)} (${formatTick(value / total * 100)}%)</title></path>`);
        if (spec.showValues !== false && value / total >= 0.04) {
            const mid = (angle + next) / 2;
            content.push(`<text x="${cx + radius * .63 * Math.cos(mid)}" y="${cy + radius * .63 * Math.sin(mid) + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${formatTick(value / total * 100)}%</text>`);
        }
        legend.push({ label, color, kind: 'box' });
        angle = next;
    });
    return { content: content.join(''), legend };
}

function boxStats(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    return {
        min: sorted[0],
        q1: quantile(sorted, .25),
        median: quantile(sorted, .5),
        q3: quantile(sorted, .75),
        max: sorted[sorted.length - 1],
    };
}

function renderBoxPlot(spec, context) {
    const stats = boxStats(spec.values);
    if (!stats) return { content: context.message('Box plot data নেই।', '#dc2626'), legend: [] };
    const minimum = Number.isFinite(spec.dataMin) ? spec.dataMin : stats.min;
    const maximum = Number.isFinite(spec.dataMax) ? spec.dataMax : stats.max;
    const span = maximum > minimum ? maximum - minimum : 1;
    const sx = (value) => context.margin.left + (value - minimum) / span * context.plotWidth;
    const cy = context.margin.top + context.plotHeight / 2;
    const boxHeight = Math.min(100, context.plotHeight * .32);
    const color = safeColor(spec.color, context.colors[0]);
    const content = [
        `<line x1="${sx(stats.min)}" y1="${cy}" x2="${sx(stats.max)}" y2="${cy}" stroke="#0f172a" stroke-width="2"/>`,
        `<line x1="${sx(stats.min)}" y1="${cy - boxHeight * .3}" x2="${sx(stats.min)}" y2="${cy + boxHeight * .3}" stroke="#0f172a" stroke-width="2"/>`,
        `<line x1="${sx(stats.max)}" y1="${cy - boxHeight * .3}" x2="${sx(stats.max)}" y2="${cy + boxHeight * .3}" stroke="#0f172a" stroke-width="2"/>`,
        `<rect x="${sx(stats.q1)}" y="${cy - boxHeight / 2}" width="${Math.max(1, sx(stats.q3) - sx(stats.q1))}" height="${boxHeight}" fill="${color}" opacity=".24" stroke="${color}" stroke-width="2.5"/>`,
        `<line x1="${sx(stats.median)}" y1="${cy - boxHeight / 2}" x2="${sx(stats.median)}" y2="${cy + boxHeight / 2}" stroke="${color}" stroke-width="3"/>`,
    ];
    [stats.min, stats.q1, stats.median, stats.q3, stats.max].forEach((value) => {
        content.push(`<text x="${sx(value)}" y="${cy + boxHeight / 2 + 24}" text-anchor="middle" font-size="11" fill="#475569">${formatTick(value)}</text>`);
    });
    return { content: content.join(''), legend: [{ label: 'Five-number summary', color, kind: 'box' }] };
}

function marchingSquares(spec, context) {
    const fn = compileMathExpression(spec.expression, ['x', 'y']);
    if (!fn) return null;
    const nx = Math.max(12, Math.min(80, Math.round(spec.resolution || 36)));
    const ny = nx;
    const levels = finiteArray(spec.levels, 12).length ? finiteArray(spec.levels, 12) : [-2, -1, 0, 1, 2];
    const grid = [];
    for (let j = 0; j <= ny; j += 1) {
        const row = [];
        const y = context.yMin + (context.yMax - context.yMin) * j / ny;
        for (let i = 0; i <= nx; i += 1) {
            const x = context.xMin + (context.xMax - context.xMin) * i / nx;
            row.push(fn(x, y));
        }
        grid.push(row);
    }
    const segments = levels.map(() => []);
    const interpolate = (a, b, va, vb, level) => {
        const ratio = Math.abs(vb - va) < 1e-12 ? .5 : (level - va) / (vb - va);
        return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
    };
    levels.forEach((level, levelIndex) => {
        for (let j = 0; j < ny; j += 1) {
            for (let i = 0; i < nx; i += 1) {
                const x0 = context.xMin + (context.xMax - context.xMin) * i / nx;
                const x1 = context.xMin + (context.xMax - context.xMin) * (i + 1) / nx;
                const y0 = context.yMin + (context.yMax - context.yMin) * j / ny;
                const y1 = context.yMin + (context.yMax - context.yMin) * (j + 1) / ny;
                const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
                const values = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
                const hits = [];
                for (let edge = 0; edge < 4; edge += 1) {
                    const next = (edge + 1) % 4;
                    const va = values[edge];
                    const vb = values[next];
                    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
                    if ((va <= level && vb > level) || (va > level && vb <= level)) {
                        hits.push(interpolate(corners[edge], corners[next], va, vb, level));
                    }
                }
                if (hits.length === 2) segments[levelIndex].push([hits[0], hits[1]]);
                if (hits.length === 4) {
                    segments[levelIndex].push([hits[0], hits[1]], [hits[2], hits[3]]);
                }
            }
        }
    });
    return { levels, segments };
}

export function registerBuiltinGraphs(registry) {
    if (registry.has('function')) return;

    registry.register({
        id: 'function',
        label: 'Function / Multiple Functions',
        group: 'Mathematics',
        description: 'y = f(x), multiple curves and optional area fill',
        defaults: { expression: 'x^2', samples: 900, strokeWidth: 2.6, fillTo: 0 },
        editor: {
            mode: 'expression-series',
            inputLabel: 'Functions (one per line)',
            placeholder: 'Quadratic = x^2 - 4\nSine = sin(x)',
            fields: [
                { key: 'samples', label: 'Samples', type: 'number', min: 100, max: 3000, step: 100 },
                { key: 'strokeWidth', label: 'Line width', type: 'number', min: .5, max: 10, step: .5 },
                { key: 'fillTo', label: 'Fill baseline', type: 'number', step: .5 },
            ],
        },
        parseInput(text) { return { expression: text, series: splitSeriesExpressions(text) }; },
        formatInput(spec) { return formatSeries(spec.series); },
        normalize(spec) {
            const series = normalizeSeries(spec);
            return {
                ...spec,
                expression: series[0]?.expression || String(spec.expression || 'x^2'),
                series,
                samples: clamp(spec.samples, 100, 3000, 900),
                strokeWidth: clamp(spec.strokeWidth, .5, 10, 2.6),
                fillTo: clamp(spec.fillTo, -1e6, 1e6, 0),
            };
        },
        validate(spec) {
            const errors = errorsForExpressionSeries(spec);
            if (errors.length) return errors;
            const invalid = spec.series.find((item) => !compileMathExpression(item.expression, ['x']));
            return invalid ? [`Expression বোঝা যায়নি: ${invalid.expression}`] : [];
        },
        detect(source) {
            const cleaned = toEnglishDigits(source).replace(/<[^>]*>/g, ' ').trim();
            const match = cleaned.match(/(?:y|f\s*\(\s*x\s*\))\s*=\s*([^;।\n]+)/i);
            if (match) return { score: 90, spec: { expression: match[1].trim() } };
            if (/\bx\b/i.test(cleaned) && /^[\w\s+\-*/^().,=]+$/.test(cleaned)) {
                return { score: 50, spec: { expression: cleaned.replace(/^[^=]*=/, '').trim() } };
            }
            return null;
        },
        render: renderFunctionSeries,
    });

    registry.register({
        id: 'polar',
        label: 'Polar',
        group: 'Mathematics',
        description: 'r = f(theta)',
        defaults: { expression: '4*cos(3*theta)', thetaMin: 0, thetaMax: Math.PI * 2, samples: 1200, aspectLock: true, strokeWidth: 2.6 },
        editor: {
            mode: 'expression-series', inputLabel: 'r(theta), one per line', placeholder: 'Rose = 4*cos(3*theta)',
            fields: [
                { key: 'thetaMin', label: 'θ minimum', type: 'number', step: .1 },
                { key: 'thetaMax', label: 'θ maximum', type: 'number', step: .1 },
                { key: 'samples', label: 'Samples', type: 'number', min: 100, max: 4000, step: 100 },
            ],
        },
        parseInput(text) { return { expression: text, series: splitSeriesExpressions(text) }; },
        formatInput(spec) { return formatSeries(spec.series); },
        normalize(spec) {
            return {
                ...spec,
                series: normalizeSeries(spec, '4*cos(3*theta)'),
                thetaMin: clamp(spec.thetaMin, -100 * Math.PI, 100 * Math.PI, 0),
                thetaMax: clamp(spec.thetaMax, -100 * Math.PI, 100 * Math.PI, Math.PI * 2),
                samples: clamp(spec.samples, 100, 4000, 1200),
                strokeWidth: clamp(spec.strokeWidth, .5, 10, 2.6),
                aspectLock: spec.aspectLock !== false,
            };
        },
        validate(spec) {
            const errors = errorsForExpressionSeries(spec);
            if (errors.length) return errors;
            const invalid = spec.series.find((item) => !compileMathExpression(item.expression, ['theta']));
            return invalid ? [`Polar expression বোঝা যায়নি: ${invalid.expression}`] : [];
        },
        detect(source) {
            const match = toEnglishDigits(source).replace(/θ/gi, 'theta').match(/r\s*=\s*([^;।\n]+)/i);
            return match ? { score: 95, spec: { expression: match[1] } } : null;
        },
        render(spec, context) {
            const content = [];
            const legend = [];
            spec.series.forEach((series, index) => {
                const fn = compileMathExpression(series.expression, ['theta']);
                const color = safeColor(series.color, context.colors[index % context.colors.length]);
                if (!fn) {
                    content.push(context.message(`Expression বোঝা যায়নি: ${series.expression}`, '#dc2626', index));
                    return;
                }
                const points = [];
                for (let step = 0; step <= spec.samples; step += 1) {
                    const theta = spec.thetaMin + (spec.thetaMax - spec.thetaMin) * step / spec.samples;
                    const radius = fn(theta);
                    points.push([radius * Math.cos(theta), radius * Math.sin(theta)]);
                }
                content.push(`<path d="${svgPathFromPoints(points, context, { breakDistance: context.plotHeight })}" fill="none" stroke="${color}" stroke-width="${spec.strokeWidth}" clip-path="url(#${context.clipId})"/>`);
                legend.push({ label: series.label || series.expression, color, kind: 'line' });
            });
            return { content: content.join(''), legend };
        },
    });

    registry.register({
        id: 'parametric',
        label: 'Parametric',
        group: 'Mathematics',
        description: 'x(t), y(t)',
        defaults: { tMin: 0, tMax: Math.PI * 2, samples: 1200, strokeWidth: 2.6, aspectLock: true },
        editor: {
            mode: 'parametric-series', inputLabel: 'Curves: label | x(t) | y(t)', placeholder: 'Circle | 4*cos(t) | 4*sin(t)',
            fields: [
                { key: 'tMin', label: 't minimum', type: 'number', step: .1 },
                { key: 'tMax', label: 't maximum', type: 'number', step: .1 },
                { key: 'samples', label: 'Samples', type: 'number', min: 100, max: 4000, step: 100 },
            ],
        },
        parseInput(text) { return { series: parseParametricInput(text) }; },
        formatInput(spec) { return (spec.series || []).map((item) => `${item.label || 'Curve'} | ${item.xExpression} | ${item.yExpression}`).join('\n'); },
        normalize(spec) {
            const source = Array.isArray(spec.series) && spec.series.length ? spec.series : [{ label: 'Circle', xExpression: '4*cos(t)', yExpression: '4*sin(t)' }];
            return {
                ...spec,
                series: source.slice(0, 20).map((item, index) => ({
                    label: String(item.label || `Curve ${index + 1}`).slice(0, 80),
                    xExpression: String(item.xExpression || 'cos(t)').slice(0, 1000),
                    yExpression: String(item.yExpression || 'sin(t)').slice(0, 1000),
                    color: safeColor(item.color, spec.colors?.[index] || GRAPH_COLORS[index % GRAPH_COLORS.length]),
                })),
                tMin: clamp(spec.tMin, -1e4, 1e4, 0),
                tMax: clamp(spec.tMax, -1e4, 1e4, Math.PI * 2),
                samples: clamp(spec.samples, 100, 4000, 1200),
                strokeWidth: clamp(spec.strokeWidth, .5, 10, 2.6),
            };
        },
        validate(spec) {
            if (!spec.series?.length) return ['কমপক্ষে একটি parametric curve লিখুন।'];
            const invalid = spec.series.find((item) => (
                !compileMathExpression(item.xExpression, ['t']) || !compileMathExpression(item.yExpression, ['t'])
            ));
            return invalid ? [`Parametric expression বোঝা যায়নি: ${invalid.label}`] : [];
        },
        detect(source) {
            const cleaned = toEnglishDigits(source).replace(/θ/gi, 'theta');
            const xMatch = cleaned.match(/x\s*\(\s*t\s*\)\s*=\s*([^;\n]+)/i);
            const yMatch = cleaned.match(/y\s*\(\s*t\s*\)\s*=\s*([^;\n]+)/i);
            return xMatch && yMatch ? { score: 98, spec: { series: [{ label: 'Curve', xExpression: xMatch[1], yExpression: yMatch[1] }] } } : null;
        },
        render(spec, context) {
            const content = [];
            const legend = [];
            spec.series.forEach((series, index) => {
                const fx = compileMathExpression(series.xExpression, ['t']);
                const fy = compileMathExpression(series.yExpression, ['t']);
                const color = safeColor(series.color, context.colors[index % context.colors.length]);
                if (!fx || !fy) {
                    content.push(context.message(`Parametric expression বোঝা যায়নি: ${series.label}`, '#dc2626', index));
                    return;
                }
                const points = [];
                for (let step = 0; step <= spec.samples; step += 1) {
                    const t = spec.tMin + (spec.tMax - spec.tMin) * step / spec.samples;
                    points.push([fx(t), fy(t)]);
                }
                content.push(`<path d="${svgPathFromPoints(points, context, { breakDistance: context.plotHeight })}" fill="none" stroke="${color}" stroke-width="${spec.strokeWidth}" clip-path="url(#${context.clipId})"/>`);
                legend.push({ label: series.label, color, kind: 'line' });
            });
            return { content: content.join(''), legend };
        },
    });

    registry.register(conicPlugin('circle', 'Circle', [
        { key: 'params.h', label: 'Center h', type: 'number', step: .5 },
        { key: 'params.k', label: 'Center k', type: 'number', step: .5 },
        { key: 'params.radius', label: 'Radius', type: 'number', min: .001, step: .5 },
    ], { h: 0, k: 0, radius: 4 }));

    registry.register(conicPlugin('ellipse', 'Ellipse', [
        { key: 'params.h', label: 'Center h', type: 'number', step: .5 },
        { key: 'params.k', label: 'Center k', type: 'number', step: .5 },
        { key: 'params.a', label: 'Horizontal radius a', type: 'number', min: .001, step: .5 },
        { key: 'params.b', label: 'Vertical radius b', type: 'number', min: .001, step: .5 },
    ], { h: 0, k: 0, a: 5, b: 3 }));

    registry.register(conicPlugin('parabola', 'Parabola', [
        { key: 'params.h', label: 'Vertex h', type: 'number', step: .5 },
        { key: 'params.k', label: 'Vertex k', type: 'number', step: .5 },
        { key: 'params.p', label: 'Focal parameter p', type: 'number', step: .5 },
        { key: 'params.orientation', label: 'Orientation', type: 'select', options: [['vertical', 'Vertical'], ['horizontal', 'Horizontal']] },
    ], { h: 0, k: 0, p: 2, orientation: 'vertical' }));

    registry.register(conicPlugin('hyperbola', 'Hyperbola', [
        { key: 'params.h', label: 'Center h', type: 'number', step: .5 },
        { key: 'params.k', label: 'Center k', type: 'number', step: .5 },
        { key: 'params.a', label: 'a', type: 'number', min: .001, step: .5 },
        { key: 'params.b', label: 'b', type: 'number', min: .001, step: .5 },
        { key: 'params.orientation', label: 'Orientation', type: 'select', options: [['horizontal', 'Horizontal'], ['vertical', 'Vertical']] },
    ], { h: 0, k: 0, a: 3, b: 2, orientation: 'horizontal' }));

    ['scatter', 'line'].forEach((id) => registry.register({
        id,
        label: id === 'scatter' ? 'Scatter' : 'Line',
        group: 'Data Charts',
        description: id === 'scatter' ? 'Coordinate scatter plot' : 'Connected coordinate plot',
        defaults: { showPoints: true, connect: id === 'line', pointRadius: 4.5, strokeWidth: 2.4 },
        editor: {
            mode: 'coordinates', inputLabel: 'Coordinates (x,y)', placeholder: '1,2\n2,5\n3,4',
            fields: [
                { key: 'showPoints', label: 'Show points', type: 'checkbox' },
                { key: 'connect', label: 'Connect points', type: 'checkbox' },
                { key: 'regression', label: 'Regression line', type: 'checkbox' },
                { key: 'pointRadius', label: 'Point size', type: 'number', min: 1, max: 12, step: .5 },
            ],
        },
        parseInput(text) { return parseCoordinateData(text); },
        formatInput(spec) { return (spec.x || []).map((x, index) => `${x},${spec.y?.[index] ?? ''}${spec.labels?.[index] ? `,${spec.labels[index]}` : ''}`).join('\n'); },
        normalize: coordinateNormalize,
        validate: dataValidation,
        detect(source) {
            const coordinates = [...toEnglishDigits(source).matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)];
            return coordinates.length >= 2 ? {
                score: id === 'scatter' ? 85 : 20,
                spec: { x: coordinates.map((match) => Number(match[1])), y: coordinates.map((match) => Number(match[2])) },
            } : null;
        },
        render(spec, context) { return coordinateRender(spec, context, id === 'line'); },
    }));

    registry.register({
        id: 'frequency-polygon',
        label: 'Frequency Polygon',
        group: 'Statistics',
        description: 'Frequency polygon from midpoint-frequency pairs',
        defaults: { showPoints: true, connect: true, pointRadius: 4, strokeWidth: 2.4 },
        editor: { mode: 'coordinates', inputLabel: 'Class midpoint, frequency', placeholder: '5,2\n15,8\n25,12\n35,5', fields: [] },
        parseInput(text) { return parseCoordinateData(text); },
        formatInput(spec) { return (spec.x || []).map((x, index) => `${x},${spec.y?.[index] ?? ''}`).join('\n'); },
        normalize: coordinateNormalize,
        validate: dataValidation,
        render(spec, context) { return coordinateRender({ ...spec, connect: true }, context, true); },
    });

    registry.register({
        id: 'ogive',
        label: 'Ogive',
        group: 'Statistics',
        description: 'Cumulative frequency curve',
        defaults: { cumulativeInput: false, showPoints: true, connect: true, pointRadius: 4, strokeWidth: 2.4 },
        editor: {
            mode: 'coordinates', inputLabel: 'Upper boundary, frequency', placeholder: '10,3\n20,7\n30,9\n40,4',
            fields: [{ key: 'cumulativeInput', label: 'Values already cumulative', type: 'checkbox' }],
        },
        parseInput(text) { return parseCoordinateData(text); },
        formatInput(spec) { return (spec.x || []).map((x, index) => `${x},${spec.y?.[index] ?? ''}`).join('\n'); },
        normalize: coordinateNormalize,
        validate: dataValidation,
        render(spec, context) {
            let cumulative = 0;
            const y = spec.cumulativeInput ? spec.y : spec.y.map((value) => (cumulative += Math.max(0, value)));
            return coordinateRender({ ...spec, y, connect: true }, context, true);
        },
    });

    ['bar', 'histogram', 'pie'].forEach((id) => registry.register({
        id,
        label: id === 'bar' ? 'Bar' : id === 'histogram' ? 'Histogram' : 'Pie',
        group: id === 'histogram' ? 'Statistics' : 'Data Charts',
        description: `${id} chart`,
        axes: id === 'pie' ? 'none' : 'custom',
        defaults: { binCount: 8, showValues: true },
        editor: {
            mode: id === 'histogram' ? 'numbers' : 'categories',
            inputLabel: id === 'histogram' ? 'Raw observations' : 'Category, value',
            placeholder: id === 'histogram' ? '12, 14, 15, 15, 17, 20, 22' : 'A,10\nB,20\nC,15',
            fields: id === 'histogram'
                ? [{ key: 'binCount', label: 'Number of bins', type: 'number', min: 2, max: 60, step: 1 }]
                : id === 'pie' ? [{ key: 'showValues', label: 'Show percentages', type: 'checkbox' }] : [],
        },
        parseInput(text) { return id === 'histogram' ? { values: parseNumberList(text) } : parseCategoryData(text); },
        formatInput(spec) {
            if (id === 'histogram') {
                if (spec.groupedBins?.length) {
                    return spec.groupedBins.map((bin) => (
                        `${bin.label || `${formatTick(bin.start)}–${formatTick(bin.end)}`},${bin.count}`
                    )).join('\n');
                }
                return (spec.values || []).join(', ');
            }
            return (spec.labels || []).map((label, index) => `${label},${spec.values?.[index] ?? ''}`).join('\n');
        },
        normalize(spec) {
            const legacyValues = finiteArray(spec.values?.length ? spec.values : spec.y);
            const groupedBins = Array.isArray(spec.groupedBins)
                ? spec.groupedBins.slice(0, 5000).map((bin) => ({
                    start: Number(bin?.start),
                    end: Number(bin?.end),
                    count: Math.max(0, Number(bin?.count)),
                    label: String(bin?.label || '').slice(0, 120),
                })).filter((bin) => (
                    Number.isFinite(bin.start)
                    && Number.isFinite(bin.end)
                    && Number.isFinite(bin.count)
                    && bin.end > bin.start
                ))
                : [];
            return {
                ...spec,
                labels: stringArray(spec.labels),
                values: legacyValues,
                groupedBins,
                binCount: clamp(spec.binCount, 2, 60, 8),
                showValues: spec.showValues !== false,
            };
        },
        validate(spec) {
            return spec.values?.length || spec.groupedBins?.length
                ? []
                : ['Graph data লিখুন।'];
        },
        detect(source) {
            if (id !== 'bar') return null;
            const pairs = [...toEnglishDigits(source).matchAll(/([^,;:\n]+?)\s*[:=,]\s*(-?\d+(?:\.\d+)?)(?=\s*[,;\n]|$)/g)];
            return pairs.length >= 2 ? { score: 75, spec: { labels: pairs.map((match) => match[1].trim()), values: pairs.map((match) => Number(match[2])) } } : null;
        },
        render(spec, context) {
            if (id === 'pie') return renderPie(spec, context);
            return renderBars(spec, context, id === 'histogram');
        },
    }));

    registry.register({
        id: 'box',
        label: 'Box Plot',
        group: 'Statistics',
        description: 'Five-number summary box-and-whisker plot',
        axes: 'custom',
        defaults: {},
        editor: { mode: 'numbers', inputLabel: 'Observations', placeholder: '4, 7, 8, 9, 10, 12, 15, 18', fields: [] },
        parseInput(text) { return { values: parseNumberList(text) }; },
        formatInput(spec) { return (spec.values || []).join(', '); },
        normalize(spec) { return { ...spec, values: finiteArray(spec.values?.length ? spec.values : spec.y, 10000) }; },
        validate(spec) { return spec.values?.length >= 2 ? [] : ['Box plot-এর জন্য কমপক্ষে দুইটি মান লিখুন।']; },
        render: renderBoxPlot,
    });

    registry.register({
        id: 'dot',
        label: 'Dot Plot',
        group: 'Statistics',
        description: 'Stacked dot plot for observations',
        defaults: { pointRadius: 5 },
        editor: { mode: 'numbers', inputLabel: 'Observations', placeholder: '1, 1, 2, 2, 2, 3, 4, 4', fields: [{ key: 'pointRadius', label: 'Dot size', type: 'number', min: 2, max: 10, step: .5 }] },
        parseInput(text) { return { values: parseNumberList(text) }; },
        formatInput(spec) { return (spec.values || []).join(', '); },
        normalize(spec) { return { ...spec, values: finiteArray(spec.values, 10000), pointRadius: clamp(spec.pointRadius, 2, 10, 5) }; },
        validate(spec) { return spec.values?.length ? [] : ['Dot plot data লিখুন।']; },
        render(spec, context) {
            const counts = new Map();
            const color = safeColor(spec.color, context.colors[0]);
            const content = [];
            spec.values.slice().sort((a, b) => a - b).forEach((value) => {
                const count = (counts.get(value) || 0) + 1;
                counts.set(value, count);
                const y = Math.min(context.yMax, Math.max(context.yMin, count));
                content.push(`<circle cx="${context.sx(value)}" cy="${context.sy(y)}" r="${spec.pointRadius}" fill="${color}" clip-path="url(#${context.clipId})"><title>${formatTick(value)} (stack ${count})</title></circle>`);
            });
            return { content: content.join(''), legend: [{ label: 'Observations', color, kind: 'point' }] };
        },
    });

    registry.register({
        id: 'vector-field',
        label: 'Vector Field',
        group: 'Engineering Mathematics',
        description: '2D vector field P(x,y), Q(x,y)',
        defaults: { pExpression: '-y', qExpression: 'x', density: 15, normalizeVectors: true, scale: .72 },
        editor: {
            mode: 'vector-expression', inputLabel: 'P(x,y) ; Q(x,y)', placeholder: '-y ; x',
            fields: [
                { key: 'density', label: 'Grid density', type: 'number', min: 5, max: 35, step: 1 },
                { key: 'normalizeVectors', label: 'Normalize arrows', type: 'checkbox' },
                { key: 'scale', label: 'Arrow scale', type: 'number', min: .1, max: 2, step: .1 },
            ],
        },
        parseInput(text) {
            const pieces = String(text || '').split(/\s*;\s*|\r?\n/).filter(Boolean);
            return { pExpression: pieces[0] || '-y', qExpression: pieces[1] || 'x' };
        },
        formatInput(spec) { return `${spec.pExpression || '-y'} ; ${spec.qExpression || 'x'}`; },
        normalize(spec) {
            return {
                ...spec,
                pExpression: String(spec.pExpression || '-y').slice(0, 1000),
                qExpression: String(spec.qExpression || 'x').slice(0, 1000),
                density: clamp(spec.density, 5, 35, 15),
                normalizeVectors: spec.normalizeVectors !== false,
                scale: clamp(spec.scale, .1, 2, .72),
            };
        },
        validate(spec) {
            if (!spec.pExpression || !spec.qExpression) return ['P এবং Q expression লিখুন।'];
            return compileMathExpression(spec.pExpression, ['x', 'y']) && compileMathExpression(spec.qExpression, ['x', 'y'])
                ? [] : ['Vector expression বোঝা যায়নি।'];
        },
        render(spec, context) {
            const fp = compileMathExpression(spec.pExpression, ['x', 'y']);
            const fq = compileMathExpression(spec.qExpression, ['x', 'y']);
            if (!fp || !fq) return { content: context.message('Vector expression বোঝা যায়নি।', '#dc2626'), legend: [] };
            const color = safeColor(spec.color, context.colors[0]);
            const markerId = `${context.clipId}_arrow`;
            const content = [`<defs><marker id="${markerId}" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="${color}"/></marker></defs>`];
            const density = Math.round(spec.density);
            const cellX = context.plotWidth / density;
            const cellY = context.plotHeight / density;
            for (let row = 0; row <= density; row += 1) {
                const y = context.yMin + (context.yMax - context.yMin) * row / density;
                for (let column = 0; column <= density; column += 1) {
                    const x = context.xMin + (context.xMax - context.xMin) * column / density;
                    let p = fp(x, y);
                    let q = fq(x, y);
                    if (!Number.isFinite(p) || !Number.isFinite(q)) continue;
                    const magnitude = Math.hypot(p, q);
                    if (magnitude < 1e-12) continue;
                    if (spec.normalizeVectors) { p /= magnitude; q /= magnitude; }
                    const pixelDx = p * cellX * spec.scale * .45;
                    const pixelDy = -q * cellY * spec.scale * .45;
                    const cx = context.sx(x);
                    const cy = context.sy(y);
                    content.push(`<line x1="${cx - pixelDx}" y1="${cy - pixelDy}" x2="${cx + pixelDx}" y2="${cy + pixelDy}" stroke="${color}" stroke-width="1.25" marker-end="url(#${markerId})" clip-path="url(#${context.clipId})"><title>(${formatTick(x)}, ${formatTick(y)}): (${formatTick(fp(x, y))}, ${formatTick(fq(x, y))})</title></line>`);
                }
            }
            return { content: content.join(''), legend: [{ label: `(${spec.pExpression}, ${spec.qExpression})`, color, kind: 'line' }] };
        },
    });

    registry.register({
        id: 'contour',
        label: 'Contour Plot',
        group: 'Engineering Mathematics',
        description: 'Implicit level curves f(x,y)=c',
        defaults: { expression: 'x^2 + y^2', levels: [-8, -4, 0, 4, 8, 16, 25], resolution: 40 },
        editor: {
            mode: 'contour-expression', inputLabel: 'f(x,y)', placeholder: 'x^2 + y^2',
            fields: [
                { key: 'levelsText', label: 'Levels (comma separated)', type: 'text', placeholder: '1, 4, 9, 16, 25' },
                { key: 'resolution', label: 'Resolution', type: 'number', min: 12, max: 80, step: 2 },
            ],
        },
        parseInput(text) { return { expression: String(text || '').trim() }; },
        formatInput(spec) { return spec.expression || ''; },
        normalize(spec) {
            const levels = spec.levelsText ? parseNumberList(spec.levelsText) : finiteArray(spec.levels, 12);
            return {
                ...spec,
                expression: String(spec.expression || 'x^2 + y^2').slice(0, 1000),
                levels: levels.length ? levels.slice(0, 12) : [1, 4, 9, 16, 25],
                levelsText: (levels.length ? levels : [1, 4, 9, 16, 25]).join(', '),
                resolution: clamp(spec.resolution, 12, 80, 40),
            };
        },
        validate(spec) {
            if (!spec.expression) return ['Contour expression লিখুন।'];
            return compileMathExpression(spec.expression, ['x', 'y']) ? [] : ['Contour expression বোঝা যায়নি।'];
        },
        render(spec, context) {
            const result = marchingSquares(spec, context);
            if (!result) return { content: context.message('Contour expression বোঝা যায়নি।', '#dc2626'), legend: [] };
            const content = [];
            const legend = [];
            result.levels.forEach((level, index) => {
                const color = context.colors[index % context.colors.length];
                result.segments[index].forEach((segment) => {
                    content.push(`<line x1="${context.sx(segment[0][0])}" y1="${context.sy(segment[0][1])}" x2="${context.sx(segment[1][0])}" y2="${context.sy(segment[1][1])}" stroke="${color}" stroke-width="1.6" clip-path="url(#${context.clipId})"/>`);
                });
                legend.push({ label: `c = ${formatTick(level)}`, color, kind: 'line' });
            });
            return { content: content.join(''), legend };
        },
    });
}
