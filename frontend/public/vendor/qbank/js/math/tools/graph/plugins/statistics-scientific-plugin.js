import {
    GRAPH_COLORS,
    clamp,
    formatTick,
    linearRegression,
    safeColor,
    svgPathFromPoints,
} from '../graph-utils.js';

export const STATISTICS_SCIENTIFIC_PLUGIN_VERSION = '2.2.0';

const MAX_SERIES = 16;
const MAX_POINTS_PER_SERIES = 5000;

function finiteArray(values, limit = MAX_POINTS_PER_SERIES) {
    return (Array.isArray(values) ? values : [])
        .slice(0, limit)
        .map(Number)
        .filter(Number.isFinite);
}

function normalizePairedSeries(item, index, spec) {
    const rawX = Array.isArray(item?.x) ? item.x : [];
    const rawY = Array.isArray(item?.y) ? item.y : [];
    const rawErrorY = Array.isArray(item?.errorY) ? item.errorY : [];
    const rawErrorX = Array.isArray(item?.errorX) ? item.errorX : [];
    const count = Math.min(rawX.length, rawY.length, MAX_POINTS_PER_SERIES);
    const x = [];
    const y = [];
    const errorY = [];
    const errorX = [];

    for (let position = 0; position < count; position += 1) {
        const xValue = Number(rawX[position]);
        const yValue = Number(rawY[position]);
        if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) continue;
        x.push(xValue);
        y.push(yValue);
        const yError = Math.abs(Number(rawErrorY[position]));
        const xError = Math.abs(Number(rawErrorX[position]));
        errorY.push(Number.isFinite(yError) ? yError : 0);
        errorX.push(Number.isFinite(xError) ? xError : 0);
    }

    return {
        label: String(item?.label || `Series ${index + 1}`).slice(0, 100),
        color: safeColor(
            item?.color,
            spec.colors?.[index] || GRAPH_COLORS[index % GRAPH_COLORS.length],
        ),
        x,
        y,
        errorY,
        errorX,
        regressionSummary: item?.regressionSummary && typeof item.regressionSummary === 'object'
            ? {
                slope: Number(item.regressionSummary.slope),
                intercept: Number(item.regressionSummary.intercept),
                r: Number(item.regressionSummary.r),
                r2: Number(item.regressionSummary.r2),
                n: Number(item.regressionSummary.n),
            }
            : null,
        sourcePointCount: Number(item?.sourcePointCount) || x.length,
        renderedPointCount: Number(item?.renderedPointCount) || x.length,
        visible: item?.visible !== false,
        connect: item?.connect === true,
    };
}

function correlationSummary(xValues, yValues) {
    const pairs = [];
    const count = Math.min(xValues.length, yValues.length);
    for (let index = 0; index < count; index += 1) {
        const x = Number(xValues[index]);
        const y = Number(yValues[index]);
        if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
    }
    if (pairs.length < 2) return null;

    const x = pairs.map((item) => item[0]);
    const y = pairs.map((item) => item[1]);
    const regression = linearRegression(x, y);
    if (!regression) return null;

    const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
    const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
    let numerator = 0;
    let denominatorX = 0;
    let denominatorY = 0;
    let residual = 0;
    let total = 0;

    for (let index = 0; index < x.length; index += 1) {
        const dx = x[index] - meanX;
        const dy = y[index] - meanY;
        numerator += dx * dy;
        denominatorX += dx * dx;
        denominatorY += dy * dy;

        const predicted = regression.slope * x[index] + regression.intercept;
        residual += (y[index] - predicted) ** 2;
        total += (y[index] - meanY) ** 2;
    }

    const denominator = Math.sqrt(denominatorX * denominatorY);
    const r = denominator > 1e-15 ? numerator / denominator : 0;
    const r2 = total > 1e-15 ? 1 - residual / total : 1;

    return {
        ...regression,
        r,
        r2,
        n: x.length,
    };
}

function equationText(summary) {
    if (!summary) return '';
    const slope = formatTick(summary.slope);
    const intercept = Math.abs(summary.intercept) < 1e-12
        ? ''
        : `${summary.intercept >= 0 ? ' + ' : ' - '}${formatTick(Math.abs(summary.intercept))}`;
    return `y = ${slope}x${intercept}`;
}

function pairedNormalize(spec, defaults = {}) {
    const source = Array.isArray(spec.series) && spec.series.length
        ? spec.series
        : [{
            label: spec.seriesLabel || spec.title || 'Data',
            x: spec.x || [],
            y: spec.y || [],
            errorY: spec.errorY || [],
            errorX: spec.errorX || [],
            color: spec.color,
        }];

    return {
        ...spec,
        series: source.slice(0, MAX_SERIES).map((item, index) => (
            normalizePairedSeries(item, index, spec)
        )).filter((item) => item.x.length && item.y.length),
        showPoints: spec.showPoints !== false,
        connect: spec.connect === true || defaults.connect === true,
        regression: spec.regression === true,
        showRegressionEquation: spec.showRegressionEquation !== false,
        showCorrelation: spec.showCorrelation !== false,
        errorBars: spec.errorBars === true || defaults.errorBars === true,
        pointRadius: clamp(spec.pointRadius, 1, 12, 4),
        strokeWidth: clamp(spec.strokeWidth, .5, 10, 2.2),
        errorCap: clamp(spec.errorCap, 2, 18, 6),
    };
}

function pairedValidate(spec) {
    if (!spec.series?.length) return ['কমপক্ষে একটি numeric series নির্বাচন করুন।'];
    const invalid = spec.series.find((series) => (
        !series.x?.length || series.x.length !== series.y?.length
    ));
    return invalid ? [`${invalid.label} series-এর X/Y data সঠিক নয়।`] : [];
}

function pairedAutoRange(spec) {
    const xValues = [];
    const yValues = [];

    (spec.series || []).forEach((series) => {
        if (series.visible === false) return;
        series.x.forEach((x, index) => {
            const error = spec.errorBars ? Number(series.errorX?.[index]) || 0 : 0;
            xValues.push(x - error, x + error);
        });
        series.y.forEach((y, index) => {
            const error = spec.errorBars ? Number(series.errorY?.[index]) || 0 : 0;
            yValues.push(y - error, y + error);
        });
    });

    const range = (values, includeZero = false) => {
        const finite = values.filter(Number.isFinite);
        if (!finite.length) return null;
        let minimum = Math.min(...finite);
        let maximum = Math.max(...finite);
        if (includeZero) {
            minimum = Math.min(minimum, 0);
            maximum = Math.max(maximum, 0);
        }
        if (!(maximum > minimum)) {
            minimum -= 1;
            maximum += 1;
        }
        const padding = Math.max((maximum - minimum) * .1, .5);
        return [minimum - padding, maximum + padding];
    };

    const x = range(xValues);
    const y = range(yValues);
    return x && y
        ? { xMin: x[0], xMax: x[1], yMin: y[0], yMax: y[1] }
        : null;
}

function renderRegressionPanel(rows, context) {
    if (!rows.length) return '';
    const width = Math.min(260, context.plotWidth * .5);
    const height = 22 + rows.length * 16;
    const x = context.margin.left + 8;
    const y = context.margin.top + 8;
    const output = [
        `<g class="qmx-regression-summary">`,
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="#fff" fill-opacity=".92" stroke="#cbd5e1"/>`,
    ];
    rows.forEach((row, index) => {
        output.push(
            `<text x="${x + 9}" y="${y + 17 + index * 16}" font-size="10" fill="${row.color}">${context.escapeXml(row.text)}</text>`
        );
    });
    output.push('</g>');
    return output.join('');
}

function renderPaired(spec, context, defaults = {}) {
    const content = [];
    const legend = [];
    const regressionRows = [];

    spec.series.forEach((series, seriesIndex) => {
        if (series.visible === false) return;
        const color = safeColor(
            series.color,
            context.colors[seriesIndex % context.colors.length],
        );
        const points = series.x.map((x, index) => [x, series.y[index]]);

        if ((spec.connect || series.connect || defaults.connect) && points.length > 1) {
            content.push(
                `<path d="${svgPathFromPoints(points, context)}" fill="none" stroke="${color}" stroke-width="${spec.strokeWidth}" clip-path="url(#${context.clipId})"/>`
            );
        }

        if (spec.errorBars || defaults.errorBars) {
            points.forEach(([x, y], index) => {
                if (!context.inExtendedBounds(x, y)) return;
                const errorY = Math.max(0, Number(series.errorY?.[index]) || 0);
                const errorX = Math.max(0, Number(series.errorX?.[index]) || 0);
                const cx = context.sx(x);
                const cy = context.sy(y);

                if (errorY > 0) {
                    const yTop = context.sy(y + errorY);
                    const yBottom = context.sy(y - errorY);
                    content.push(
                        `<line x1="${cx}" y1="${yTop}" x2="${cx}" y2="${yBottom}" stroke="${color}" stroke-width="1.3" clip-path="url(#${context.clipId})"/>`,
                        `<line x1="${cx - spec.errorCap}" y1="${yTop}" x2="${cx + spec.errorCap}" y2="${yTop}" stroke="${color}" stroke-width="1.3" clip-path="url(#${context.clipId})"/>`,
                        `<line x1="${cx - spec.errorCap}" y1="${yBottom}" x2="${cx + spec.errorCap}" y2="${yBottom}" stroke="${color}" stroke-width="1.3" clip-path="url(#${context.clipId})"/>`,
                    );
                }

                if (errorX > 0) {
                    const xLeft = context.sx(x - errorX);
                    const xRight = context.sx(x + errorX);
                    content.push(
                        `<line x1="${xLeft}" y1="${cy}" x2="${xRight}" y2="${cy}" stroke="${color}" stroke-width="1.3" clip-path="url(#${context.clipId})"/>`,
                        `<line x1="${xLeft}" y1="${cy - spec.errorCap}" x2="${xLeft}" y2="${cy + spec.errorCap}" stroke="${color}" stroke-width="1.3" clip-path="url(#${context.clipId})"/>`,
                        `<line x1="${xRight}" y1="${cy - spec.errorCap}" x2="${xRight}" y2="${cy + spec.errorCap}" stroke="${color}" stroke-width="1.3" clip-path="url(#${context.clipId})"/>`,
                    );
                }
            });
        }

        if (spec.showPoints) {
            points.forEach(([x, y], index) => {
                if (!context.inExtendedBounds(x, y)) return;
                content.push(
                    `<circle cx="${context.sx(x)}" cy="${context.sy(y)}" r="${spec.pointRadius}" fill="${color}" stroke="#fff" stroke-width=".8" clip-path="url(#${context.clipId})"><title>${context.escapeXml(series.label)}: (${formatTick(x)}, ${formatTick(y)})</title></circle>`
                );
            });
        }

        if (spec.regression && points.length >= 2) {
            const summary = series.regressionSummary || correlationSummary(series.x, series.y);
            if (summary) {
                const y1 = summary.slope * context.xMin + summary.intercept;
                const y2 = summary.slope * context.xMax + summary.intercept;
                content.push(
                    `<line x1="${context.sx(context.xMin)}" y1="${context.sy(y1)}" x2="${context.sx(context.xMax)}" y2="${context.sy(y2)}" stroke="${color}" stroke-width="1.8" stroke-dasharray="8 5" clip-path="url(#${context.clipId})"/>`
                );
                const details = [series.label];
                if (spec.showRegressionEquation) details.push(equationText(summary));
                if (spec.showCorrelation) {
                    details.push(`r=${formatTick(summary.r)}, R²=${formatTick(summary.r2)}, n=${summary.n}`);
                }
                regressionRows.push({ color, text: details.join(' • ') });
            }
        }

        legend.push({
            label: series.label,
            color,
            kind: spec.showPoints ? 'point' : 'line',
        });
    });

    if (regressionRows.length) {
        content.push(renderRegressionPanel(regressionRows, context));
    }

    return {
        content: content.join(''),
        legend,
    };
}

function normalizeBarSeries(spec) {
    const labels = (Array.isArray(spec.labels) ? spec.labels : [])
        .slice(0, 600)
        .map((value, index) => String(value ?? index + 1).slice(0, 100));
    const series = (Array.isArray(spec.series) ? spec.series : [])
        .slice(0, MAX_SERIES)
        .map((item, index) => ({
            label: String(item?.label || `Series ${index + 1}`).slice(0, 100),
            color: safeColor(
                item?.color,
                spec.colors?.[index] || GRAPH_COLORS[index % GRAPH_COLORS.length],
            ),
            values: (Array.isArray(item?.values) ? item.values : [])
                .slice(0, labels.length)
                .map((value) => Number.isFinite(Number(value)) ? Number(value) : 0),
            visible: item?.visible !== false,
        }));
    return {
        ...spec,
        labels,
        series,
        showValues: spec.showValues === true,
        barGap: clamp(spec.barGap, 0, .7, .18),
    };
}

function barValidate(spec) {
    if (!spec.labels?.length) return ['কমপক্ষে একটি category দিন।'];
    if (!spec.series?.length) return ['কমপক্ষে একটি value series নির্বাচন করুন।'];
    return [];
}

function barAutoRange(spec, stacked = false) {
    const visible = spec.series.filter((item) => item.visible !== false);
    if (!visible.length || !spec.labels.length) return null;
    const values = [];

    if (stacked) {
        for (let index = 0; index < spec.labels.length; index += 1) {
            let positive = 0;
            let negative = 0;
            visible.forEach((series) => {
                const value = Number(series.values[index]) || 0;
                if (value >= 0) positive += value;
                else negative += value;
            });
            values.push(positive, negative);
        }
    } else {
        visible.forEach((series) => {
            series.values.forEach((value) => values.push(Number(value) || 0));
        });
    }

    let minimum = Math.min(0, ...values);
    let maximum = Math.max(0, ...values);
    if (!(maximum > minimum)) maximum = minimum + 1;
    const padding = Math.max((maximum - minimum) * .12, .5);

    return {
        xMin: -.5,
        xMax: Math.max(1.5, spec.labels.length - .5),
        yMin: minimum < 0 ? minimum - padding : 0,
        yMax: maximum + padding,
    };
}

function renderCategoricalAxes(spec, context) {
    const parts = [];
    const ySteps = 5;
    for (let index = 0; index <= ySteps; index += 1) {
        const value = context.yMin + (context.yMax - context.yMin) * index / ySteps;
        const y = context.sy(value);
        parts.push(
            `<line x1="${context.margin.left}" y1="${y}" x2="${context.margin.left + context.plotWidth}" y2="${y}" stroke="#e2e8f0"/>`,
            `<text x="${context.margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#475569">${formatTick(value)}</text>`,
        );
    }
    const baseline = context.sy(Math.max(context.yMin, Math.min(context.yMax, 0)));
    parts.push(
        `<line x1="${context.margin.left}" y1="${baseline}" x2="${context.margin.left + context.plotWidth}" y2="${baseline}" stroke="#0f172a" stroke-width="1.2"/>`,
        `<line x1="${context.margin.left}" y1="${context.margin.top}" x2="${context.margin.left}" y2="${context.margin.top + context.plotHeight}" stroke="#0f172a" stroke-width="1.2"/>`,
    );
    return { content: parts.join(''), baseline };
}

function categoryLabelMarkup(spec, context) {
    const count = spec.labels.length;
    const groupWidth = context.plotWidth / Math.max(1, count);
    const rotate = count > 12 ? -45 : count > 7 ? -25 : 0;
    return spec.labels.map((label, index) => {
        const x = context.margin.left + (index + .5) * groupWidth;
        const y = context.margin.top + context.plotHeight + 17;
        const display = String(label).length > 18
            ? `${String(label).slice(0, 17)}…`
            : String(label);
        return `<text x="${x}" y="${y}" text-anchor="middle" font-size="9.5" fill="#475569" transform="rotate(${rotate} ${x} ${y})">${context.escapeXml(display)}</text>`;
    }).join('');
}

function renderGroupedBar(spec, context) {
    const axes = renderCategoricalAxes(spec, context);
    const visible = spec.series.filter((item) => item.visible !== false);
    const count = spec.labels.length;
    const groupWidth = context.plotWidth / Math.max(1, count);
    const innerWidth = groupWidth * (1 - spec.barGap);
    const barWidth = innerWidth / Math.max(1, visible.length);
    const content = [axes.content];

    visible.forEach((series, seriesIndex) => {
        series.values.forEach((rawValue, categoryIndex) => {
            const value = Number(rawValue) || 0;
            const valueY = context.sy(Math.max(context.yMin, Math.min(context.yMax, value)));
            const x = context.margin.left
                + categoryIndex * groupWidth
                + (groupWidth - innerWidth) / 2
                + seriesIndex * barWidth;
            const y = Math.min(axes.baseline, valueY);
            const height = Math.abs(valueY - axes.baseline);
            content.push(
                `<rect x="${x}" y="${y}" width="${Math.max(1, barWidth - 1)}" height="${height}" fill="${series.color}" opacity=".88" clip-path="url(#${context.clipId})"><title>${context.escapeXml(spec.labels[categoryIndex])} • ${context.escapeXml(series.label)}: ${formatTick(value)}</title></rect>`
            );
            if (spec.showValues && count * visible.length <= 60) {
                content.push(
                    `<text x="${x + barWidth / 2}" y="${value >= 0 ? y - 3 : y + height + 11}" text-anchor="middle" font-size="8.5" fill="#334155">${formatTick(value)}</text>`
                );
            }
        });
    });

    content.push(categoryLabelMarkup(spec, context));
    return {
        content: content.join(''),
        legend: visible.map((series) => ({
            label: series.label,
            color: series.color,
            kind: 'box',
        })),
    };
}

function renderStackedBar(spec, context) {
    const axes = renderCategoricalAxes(spec, context);
    const visible = spec.series.filter((item) => item.visible !== false);
    const count = spec.labels.length;
    const groupWidth = context.plotWidth / Math.max(1, count);
    const barWidth = groupWidth * (1 - spec.barGap);
    const content = [axes.content];

    for (let categoryIndex = 0; categoryIndex < count; categoryIndex += 1) {
        let positive = 0;
        let negative = 0;
        visible.forEach((series) => {
            const value = Number(series.values[categoryIndex]) || 0;
            const start = value >= 0 ? positive : negative;
            const end = start + value;
            if (value >= 0) positive = end;
            else negative = end;

            const startY = context.sy(start);
            const endY = context.sy(end);
            const x = context.margin.left
                + categoryIndex * groupWidth
                + (groupWidth - barWidth) / 2;
            const y = Math.min(startY, endY);
            const height = Math.abs(endY - startY);
            content.push(
                `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="${series.color}" opacity=".9" clip-path="url(#${context.clipId})"><title>${context.escapeXml(spec.labels[categoryIndex])} • ${context.escapeXml(series.label)}: ${formatTick(value)}</title></rect>`
            );
        });
    }

    content.push(categoryLabelMarkup(spec, context));
    return {
        content: content.join(''),
        legend: visible.map((series) => ({
            label: series.label,
            color: series.color,
            kind: 'box',
        })),
    };
}

function registerPaired(registry, id, label, defaults = {}) {
    registry.register({
        id,
        label,
        group: id === 'multi-line' ? 'Data Charts' : 'Scientific Plotting',
        description: id === 'multi-line'
            ? 'Multiple value columns on common axes'
            : id === 'error-bar'
                ? 'Experimental points with uncertainty'
                : 'Scatter series, regression and correlation',
        defaults: {
            showPoints: true,
            connect: defaults.connect === true,
            regression: false,
            showRegressionEquation: true,
            showCorrelation: true,
            errorBars: defaults.errorBars === true,
            pointRadius: 4,
            strokeWidth: 2.2,
            errorCap: 6,
        },
        editor: {
            mode: 'none',
            fields: [
                { key: 'showPoints', label: 'Show points', type: 'checkbox' },
                { key: 'connect', label: 'Connect points', type: 'checkbox' },
                { key: 'regression', label: 'Linear regression', type: 'checkbox' },
                { key: 'showRegressionEquation', label: 'Show equation', type: 'checkbox' },
                { key: 'showCorrelation', label: 'Show r and R²', type: 'checkbox' },
                { key: 'errorBars', label: 'Show error bars', type: 'checkbox' },
                { key: 'pointRadius', label: 'Point size', type: 'number', min: 1, max: 12, step: .5 },
                { key: 'errorCap', label: 'Error cap width', type: 'number', min: 2, max: 18, step: 1 },
            ],
        },
        normalize(spec) {
            return pairedNormalize(spec, defaults);
        },
        validate: pairedValidate,
        autoRange: pairedAutoRange,
        render(spec, context) {
            return renderPaired(spec, context, defaults);
        },
    });
}

export function registerStatisticsScientificGraphs(registry) {
    if (registry.has('grouped-bar')) return;

    registerPaired(registry, 'multi-line', 'Multi-series Line', { connect: true });
    registerPaired(registry, 'scientific-scatter', 'Scientific Scatter', { connect: false });
    registerPaired(registry, 'error-bar', 'Error-bar Plot', { connect: false, errorBars: true });

    registry.register({
        id: 'grouped-bar',
        label: 'Grouped Bar',
        group: 'Statistics',
        description: 'Multiple values side by side for every category',
        axes: 'custom',
        defaults: { showValues: false, barGap: .18 },
        editor: {
            mode: 'none',
            fields: [
                { key: 'showValues', label: 'Show values', type: 'checkbox' },
                { key: 'barGap', label: 'Group gap', type: 'number', min: 0, max: .7, step: .05 },
            ],
        },
        normalize: normalizeBarSeries,
        validate: barValidate,
        autoRange(spec) {
            return barAutoRange(spec, false);
        },
        render: renderGroupedBar,
    });

    registry.register({
        id: 'stacked-bar',
        label: 'Stacked Bar',
        group: 'Statistics',
        description: 'Multiple values stacked by category',
        axes: 'custom',
        defaults: { showValues: false, barGap: .3 },
        editor: {
            mode: 'none',
            fields: [
                { key: 'showValues', label: 'Show values', type: 'checkbox' },
                { key: 'barGap', label: 'Bar gap', type: 'number', min: 0, max: .7, step: .05 },
            ],
        },
        normalize: normalizeBarSeries,
        validate: barValidate,
        autoRange(spec) {
            return barAutoRange(spec, true);
        },
        render: renderStackedBar,
    });
}
