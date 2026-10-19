(function (window, document) {
    'use strict';

    if (window.QmxDiagram && window.QmxDiagram.version) return;

    const TOKEN_PATTERN = /\[\[qmx-diagram:([A-Za-z0-9_-]{10,200000})\]\]/g;
    const MAX_OBJECTS = 300;
    const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|transparent|none|white|black|rgb\([0-9 ,.%]+\)|rgba\([0-9 ,.%]+\))$/i;

    function clamp(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[char]);
    }

    function safeColor(value, fallback) {
        const color = String(value || '').trim();
        return COLOR_PATTERN.test(color) ? color : fallback;
    }

    function utf8ToBase64Url(value) {
        const bytes = new TextEncoder().encode(value);
        let binary = '';
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function base64UrlToUtf8(value) {
        const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    function normalizePoint(point, fallbackX = 0, fallbackY = 0) {
        return {
            x: clamp(point?.x, -4000, 4000, fallbackX),
            y: clamp(point?.y, -4000, 4000, fallbackY)
        };
    }

    function normalizeGeneralObject(object, index) {
        const type = String(object?.type || 'rect');
        const supported = new Set([
            'rect', 'ellipse', 'triangle', 'diamond', 'terminator', 'parallelogram',
            'document', 'line', 'arrow', 'text'
        ]);
        return {
            id: String(object?.id || `object-${index + 1}`).slice(0, 100),
            type: supported.has(type) ? type : 'rect',
            x: clamp(object?.x, -4000, 4000, 80),
            y: clamp(object?.y, -4000, 4000, 80),
            w: clamp(object?.w, -4000, 4000, 140),
            h: clamp(object?.h, -4000, 4000, 70),
            text: String(object?.text || '').slice(0, 2000),
            fill: safeColor(object?.fill, '#ffffff'),
            stroke: safeColor(object?.stroke, '#0f172a'),
            strokeWidth: clamp(object?.strokeWidth, 0, 20, 2),
            fontSize: clamp(object?.fontSize, 8, 96, 20),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal',
            textColor: safeColor(object?.textColor, '#0f172a'),
            dash: Boolean(object?.dash),
            opacity: clamp(object?.opacity, 0, 1, 1),
            rotation: clamp(object?.rotation, -3600, 3600, 0)
        };
    }

    function normalizeGeometryObject(object, index) {
        const supported = new Set(['point', 'segment', 'ray', 'infinite-line', 'circle', 'angle', 'polygon', 'text']);
        const type = supported.has(String(object?.type || '')) ? String(object.type) : 'point';
        const common = {
            id: String(object?.id || `geometry-${index + 1}`).slice(0, 100),
            type,
            text: String(object?.text || '').slice(0, 500),
            fill: safeColor(object?.fill, type === 'polygon' ? 'transparent' : '#ffffff'),
            stroke: safeColor(object?.stroke, '#0f172a'),
            strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 2),
            fontSize: clamp(object?.fontSize, 8, 96, 18),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal',
            textColor: safeColor(object?.textColor, '#0f172a'),
            dash: Boolean(object?.dash),
            opacity: clamp(object?.opacity, 0, 1, 1),
            showMeasure: Boolean(object?.showMeasure)
        };

        if (type === 'point') {
            return { ...common, x: clamp(object?.x, -4000, 4000, 100), y: clamp(object?.y, -4000, 4000, 100), radius: clamp(object?.radius, 2, 24, 5) };
        }
        if (['segment', 'ray', 'infinite-line'].includes(type)) {
            return {
                ...common,
                x1: clamp(object?.x1, -4000, 4000, 100),
                y1: clamp(object?.y1, -4000, 4000, 100),
                x2: clamp(object?.x2, -4000, 4000, 260),
                y2: clamp(object?.y2, -4000, 4000, 180)
            };
        }
        if (type === 'circle') {
            return {
                ...common,
                cx: clamp(object?.cx, -4000, 4000, 220),
                cy: clamp(object?.cy, -4000, 4000, 180),
                r: clamp(object?.r, 5, 3000, 80)
            };
        }
        if (type === 'angle') {
            return {
                ...common,
                ax: clamp(object?.ax, -4000, 4000, 120),
                ay: clamp(object?.ay, -4000, 4000, 180),
                vx: clamp(object?.vx, -4000, 4000, 220),
                vy: clamp(object?.vy, -4000, 4000, 220),
                bx: clamp(object?.bx, -4000, 4000, 310),
                by: clamp(object?.by, -4000, 4000, 130)
            };
        }
        if (type === 'polygon') {
            const points = Array.isArray(object?.points)
                ? object.points.slice(0, 40).map((point, pointIndex) => normalizePoint(point, 100 + pointIndex * 40, 100))
                : [normalizePoint(null, 100, 100), normalizePoint(null, 220, 100), normalizePoint(null, 180, 220)];
            return { ...common, points, closed: object?.closed !== false };
        }
        return {
            ...normalizeGeneralObject({ ...object, type: 'text' }, index),
            type: 'text'
        };
    }

    function normalizeVectorObject(object, index) {
        const type = ['body', 'vector', 'text'].includes(String(object?.type || ''))
            ? String(object.type)
            : 'vector';

        if (type === 'vector') {
            const supportedKinds = new Set([
                'force', 'weight', 'normal', 'friction', 'tension',
                'applied', 'resultant', 'component'
            ]);
            const kind = supportedKinds.has(String(object?.kind || ''))
                ? String(object.kind)
                : 'force';
            return {
                id: String(object?.id || `vector-${index + 1}`).slice(0, 100),
                type: 'vector',
                x1: clamp(object?.x1, -4000, 4000, 180),
                y1: clamp(object?.y1, -4000, 4000, 260),
                x2: clamp(object?.x2, -4000, 4000, 360),
                y2: clamp(object?.y2, -4000, 4000, 180),
                label: String(object?.label || 'F').slice(0, 120),
                kind,
                stroke: safeColor(object?.stroke, '#2563eb'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 3),
                dash: Boolean(object?.dash),
                opacity: clamp(object?.opacity, 0, 1, 1),
                showMagnitude: Boolean(object?.showMagnitude),
                showAngle: Boolean(object?.showAngle),
                showComponents: Boolean(object?.showComponents),
                componentLabels: object?.componentLabels !== false
            };
        }

        if (type === 'body') {
            return {
                id: String(object?.id || `body-${index + 1}`).slice(0, 100),
                type: 'body',
                x: clamp(object?.x, -4000, 4000, 370),
                y: clamp(object?.y, -4000, 4000, 215),
                w: clamp(object?.w, 20, 4000, 140),
                h: clamp(object?.h, 20, 4000, 90),
                shape: object?.shape === 'circle' ? 'circle' : 'rect',
                text: String(object?.text || 'm').slice(0, 500),
                fill: safeColor(object?.fill, '#f8fafc'),
                stroke: safeColor(object?.stroke, '#0f172a'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 2),
                textColor: safeColor(object?.textColor, '#0f172a'),
                fontSize: clamp(object?.fontSize, 8, 96, 22),
                fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal',
                rotation: clamp(object?.rotation, -3600, 3600, 0),
                opacity: clamp(object?.opacity, 0, 1, 1)
            };
        }

        return {
            ...normalizeGeneralObject({ ...object, type: 'text' }, index),
            type: 'text'
        };
    }

    function normalizeCircuitAnchor(anchor) {
        if (!anchor || typeof anchor !== 'object') return null;
        const componentId = String(anchor.componentId || '').slice(0, 100);
        const terminalId = String(anchor.terminalId || '').slice(0, 20);
        return componentId && terminalId ? { componentId, terminalId } : null;
    }

    function normalizeCircuitObject(object, index) {
        if (String(object?.type || '') === 'wire') {
            return {
                id: String(object?.id || `wire-${index + 1}`).slice(0, 100),
                type: 'wire',
                startAnchor: normalizeCircuitAnchor(object?.startAnchor),
                endAnchor: normalizeCircuitAnchor(object?.endAnchor),
                startPoint: normalizePoint(object?.startPoint, 100, 100),
                endPoint: normalizePoint(object?.endPoint, 300, 100),
                route: object?.route === 'direct' ? 'direct' : 'orthogonal',
                horizontalFirst: object?.horizontalFirst !== false,
                stroke: safeColor(object?.stroke, '#0f172a'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 2.5),
                dash: Boolean(object?.dash),
                opacity: clamp(object?.opacity, 0, 1, 1)
            };
        }

        const supportedSymbols = new Set([
            'junction', 'resistor', 'capacitor', 'inductor', 'cell', 'battery',
            'dc-source', 'ac-source', 'switch', 'lamp', 'fuse', 'diode', 'led',
            'ammeter', 'voltmeter', 'ground'
        ]);
        const symbol = supportedSymbols.has(String(object?.symbol || ''))
            ? String(object.symbol)
            : 'resistor';

        return {
            id: String(object?.id || `component-${index + 1}`).slice(0, 100),
            type: 'component',
            symbol,
            x: clamp(object?.x, -4000, 4000, 200),
            y: clamp(object?.y, -4000, 4000, 200),
            w: clamp(object?.w, 20, 800, symbol === 'junction' ? 22 : 110),
            h: clamp(object?.h, 20, 800, symbol === 'junction' ? 22 : 70),
            rotation: clamp(object?.rotation, -3600, 3600, 0),
            flipX: Boolean(object?.flipX),
            label: String(object?.label || '').slice(0, 200),
            value: String(object?.value || '').slice(0, 200),
            stroke: safeColor(object?.stroke, '#0f172a'),
            fill: safeColor(object?.fill, '#ffffff'),
            strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 2.4),
            opacity: clamp(object?.opacity, 0, 1, 1)
        };
    }

    function normalizeRayOpticsObject(object, index) {
        const type = String(object?.type || '');

        if (type === 'optical-element') {
            const allowed = new Set([
                'convex-lens', 'concave-lens', 'concave-mirror',
                'convex-mirror', 'plane-mirror'
            ]);
            const opticalType = allowed.has(String(object?.opticalType || ''))
                ? String(object.opticalType)
                : 'convex-lens';

            return {
                id: String(object?.id || `optical-element-${index + 1}`).slice(0, 100),
                type: 'optical-element',
                opticalType,
                x: clamp(object?.x, -4000, 4000, 560),
                height: clamp(object?.height, 60, 1600, 250),
                focalLength: clamp(object?.focalLength, 20, 800, 120),
                label: String(object?.label || '').slice(0, 200),
                stroke: safeColor(object?.stroke, '#0f172a'),
                fill: safeColor(object?.fill, '#dbeafe'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 3),
                opacity: clamp(object?.opacity, 0, 1, 1)
            };
        }

        if (type === 'object-arrow') {
            return {
                id: String(object?.id || `object-arrow-${index + 1}`).slice(0, 100),
                type: 'object-arrow',
                x: clamp(object?.x, -4000, 4000, 220),
                height: clamp(object?.height, -1200, 1200, 130),
                label: String(object?.label || 'Object').slice(0, 200),
                stroke: safeColor(object?.stroke, '#16a34a'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 4),
                opacity: clamp(object?.opacity, 0, 1, 1)
            };
        }

        if (type === 'manual-ray') {
            return {
                id: String(object?.id || `manual-ray-${index + 1}`).slice(0, 100),
                type: 'manual-ray',
                x1: clamp(object?.x1, -4000, 4000, 100),
                y1: clamp(object?.y1, -4000, 4000, 100),
                x2: clamp(object?.x2, -4000, 4000, 300),
                y2: clamp(object?.y2, -4000, 4000, 200),
                label: String(object?.label || '').slice(0, 200),
                stroke: safeColor(object?.stroke, '#f97316'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 2.5),
                dash: Boolean(object?.dash),
                arrow: object?.arrow !== false,
                opacity: clamp(object?.opacity, 0, 1, 1)
            };
        }

        return {
            id: String(object?.id || `text-${index + 1}`).slice(0, 100),
            type: 'text',
            x: clamp(object?.x, -4000, 4000, 300),
            y: clamp(object?.y, -4000, 4000, 150),
            text: String(object?.text || 'Label').slice(0, 2000),
            textColor: safeColor(object?.textColor, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 96, 18),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal',
            rotation: clamp(object?.rotation, -3600, 3600, 0),
            opacity: clamp(object?.opacity, 0, 1, 1)
        };
    }

    function normalizeWaveformObject(object, index) {
        const type = String(object?.type || '');

        if (type === 'waveform') {
            const allowed = new Set([
                'sine', 'cosine', 'square', 'triangle', 'sawtooth', 'pulse'
            ]);
            const waveType = allowed.has(String(object?.waveType || ''))
                ? String(object.waveType)
                : 'sine';

            return {
                id: String(object?.id || `waveform-${index + 1}`).slice(0, 100),
                type: 'waveform',
                waveType,
                label: String(object?.label || `Signal ${index + 1}`).slice(0, 200),
                amplitude: clamp(object?.amplitude, 0, 1000000, 1),
                frequency: clamp(object?.frequency, 0.001, 1000000, 1),
                phase: clamp(object?.phase, -1000000, 1000000, 0),
                offset: clamp(object?.offset, -1000000, 1000000, 0),
                dutyCycle: clamp(object?.dutyCycle, 1, 99, 50),
                damping: clamp(object?.damping, 0, 1000, 0),
                bipolar: object?.bipolar !== false,
                stroke: safeColor(object?.stroke, '#2563eb'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 3),
                dash: Boolean(object?.dash),
                opacity: clamp(object?.opacity, 0, 1, 1),
                visible: object?.visible !== false
            };
        }

        if (type === 'marker') {
            return {
                id: String(object?.id || `marker-${index + 1}`).slice(0, 100),
                type: 'marker',
                time: clamp(object?.time, -1000000, 1000000, 0),
                value: clamp(object?.value, -1000000, 1000000, 0),
                label: String(object?.label || 'Marker').slice(0, 200),
                stroke: safeColor(object?.stroke, '#be123c'),
                showVertical: object?.showVertical !== false,
                showHorizontal: object?.showHorizontal !== false,
                opacity: clamp(object?.opacity, 0, 1, 1)
            };
        }

        return {
            id: String(object?.id || `text-${index + 1}`).slice(0, 100),
            type: 'text',
            time: clamp(object?.time, -1000000, 1000000, 0),
            value: clamp(object?.value, -1000000, 1000000, 0),
            text: String(object?.text || 'Label').slice(0, 2000),
            textColor: safeColor(object?.textColor, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 96, 18),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal',
            rotation: clamp(object?.rotation, -3600, 3600, 0),
            opacity: clamp(object?.opacity, 0, 1, 1)
        };
    }

    function normalizeVennObject(object, index) {
        const type = String(object?.type || '');

        if (type === 'set') {
            const shape = object?.shape === 'ellipse' ? 'ellipse' : 'circle';
            const rx = clamp(object?.rx, 20, 1200, shape === 'circle' ? 150 : 180);
            const ry = shape === 'circle'
                ? rx
                : clamp(object?.ry, 20, 1200, 120);

            return {
                id: String(object?.id || `set-${index + 1}`).slice(0, 100),
                type: 'set',
                shape,
                label: String(object?.label || `S${index + 1}`).slice(0, 200),
                x: clamp(object?.x, -4000, 4000, 300),
                y: clamp(object?.y, -4000, 4000, 300),
                rx,
                ry,
                rotation: clamp(object?.rotation, -3600, 3600, 0),
                stroke: safeColor(object?.stroke, '#2563eb'),
                fill: safeColor(object?.fill, '#2563eb'),
                fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.06),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 3),
                dash: Boolean(object?.dash),
                opacity: clamp(object?.opacity, 0, 1, 1),
                labelPosition: object?.labelPosition === 'bottom' ? 'bottom' : 'top'
            };
        }

        return {
            id: String(object?.id || `text-${index + 1}`).slice(0, 100),
            type: 'text',
            x: clamp(object?.x, -4000, 4000, 500),
            y: clamp(object?.y, -4000, 4000, 300),
            text: String(object?.text || 'Region').slice(0, 2000),
            textColor: safeColor(object?.textColor, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 96, 20),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal',
            rotation: clamp(object?.rotation, -3600, 3600, 0),
            opacity: clamp(object?.opacity, 0, 1, 1)
        };
    }

    function normalizeTimelineObject(object, index) {
        const type = String(object?.type || '');

        if (type === 'period') {
            let startPosition = clamp(object?.startPosition, 0, 1, 0.25);
            let endPosition = clamp(object?.endPosition, 0, 1, 0.55);

            if (endPosition < startPosition) {
                const swap = startPosition;
                startPosition = endPosition;
                endPosition = swap;
            }

            return {
                id: String(object?.id || `period-${index + 1}`).slice(0, 100),
                type: 'period',
                startPosition,
                endPosition,
                lane: Math.round(clamp(object?.lane, -3, 3, 1)),
                title: String(object?.title || `Period ${index + 1}`).slice(0, 300),
                description: String(object?.description || '').slice(0, 600),
                startLabel: String(object?.startLabel || '').slice(0, 100),
                endLabel: String(object?.endLabel || '').slice(0, 100),
                color: safeColor(object?.color, '#2563eb'),
                fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.24),
                thickness: clamp(object?.thickness, 12, 100, 30),
                opacity: clamp(object?.opacity, 0, 1, 1),
                showDates: object?.showDates !== false
            };
        }

        if (type === 'event' || type === 'milestone') {
            return {
                id: String(object?.id || `${type}-${index + 1}`).slice(0, 100),
                type,
                position: clamp(object?.position, 0, 1, 0.5),
                lane: Math.round(clamp(object?.lane, -3, 3, type === 'milestone' ? 1 : -1)),
                title: String(object?.title || (type === 'milestone' ? 'Milestone' : 'Event')).slice(0, 300),
                description: String(object?.description || '').slice(0, 600),
                dateLabel: String(object?.dateLabel || '').slice(0, 100),
                color: safeColor(object?.color, '#2563eb'),
                markerSize: clamp(object?.markerSize, 4, 40, type === 'milestone' ? 12 : 9),
                cardWidth: clamp(object?.cardWidth, 100, 500, 180),
                cardHeight: clamp(object?.cardHeight, 40, 220, 64),
                opacity: clamp(object?.opacity, 0, 1, 1),
                showDate: object?.showDate !== false
            };
        }

        return {
            id: String(object?.id || `text-${index + 1}`).slice(0, 100),
            type: 'text',
            x: clamp(object?.x, -4000, 4000, 500),
            y: clamp(object?.y, -4000, 4000, 100),
            text: String(object?.text || 'Annotation').slice(0, 2000),
            textColor: safeColor(object?.textColor, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 96, 18),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal',
            rotation: clamp(object?.rotation, -3600, 3600, 0),
            opacity: clamp(object?.opacity, 0, 1, 1)
        };
    }

    function normalizeDataFlowObject(object, index) {
        const type = String(object?.type || '');

        if (['process', 'external-entity', 'data-store'].includes(type)) {
            return {
                id: String(object?.id || `${type}-${index + 1}`).slice(0, 100),
                type,
                x: clamp(object?.x, -4000, 4000, 300),
                y: clamp(object?.y, -4000, 4000, 250),
                width: clamp(object?.width, 60, 1200, type === 'data-store' ? 210 : 170),
                height: clamp(object?.height, 40, 800, type === 'data-store' ? 72 : 90),
                number: type === 'process'
                    ? String(object?.number || `${index + 1}`).slice(0, 50)
                    : '',
                storeCode: type === 'data-store'
                    ? String(object?.storeCode || `D${index + 1}`).slice(0, 50)
                    : '',
                label: String(object?.label || (
                    type === 'process'
                        ? 'Process'
                        : (type === 'external-entity' ? 'External Entity' : 'Data Store')
                )).slice(0, 300),
                description: String(object?.description || '').slice(0, 600),
                stroke: safeColor(object?.stroke, '#2563eb'),
                fill: safeColor(object?.fill, '#ffffff'),
                fillOpacity: clamp(object?.fillOpacity, 0, 1, 1),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 3),
                dash: Boolean(object?.dash),
                opacity: clamp(object?.opacity, 0, 1, 1)
            };
        }

        if (type === 'data-flow') {
            return {
                id: String(object?.id || `data-flow-${index + 1}`).slice(0, 100),
                type: 'data-flow',
                fromId: String(object?.fromId || '').slice(0, 100),
                toId: String(object?.toId || '').slice(0, 100),
                label: String(object?.label || `Data flow ${index + 1}`).slice(0, 300),
                route: ['orthogonal', 'straight', 'curved'].includes(String(object?.route || ''))
                    ? String(object.route)
                    : 'orthogonal',
                horizontalFirst: object?.horizontalFirst !== false,
                stroke: safeColor(object?.stroke, '#0f172a'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 2.5),
                dash: Boolean(object?.dash),
                opacity: clamp(object?.opacity, 0, 1, 1),
                labelOffsetX: clamp(object?.labelOffsetX, -1000, 1000, 0),
                labelOffsetY: clamp(object?.labelOffsetY, -1000, 1000, -10)
            };
        }

        return {
            id: String(object?.id || `text-${index + 1}`).slice(0, 100),
            type: 'text',
            x: clamp(object?.x, -4000, 4000, 500),
            y: clamp(object?.y, -4000, 4000, 100),
            text: String(object?.text || 'Annotation').slice(0, 2000),
            textColor: safeColor(object?.textColor, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 96, 18),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal',
            rotation: clamp(object?.rotation, -3600, 3600, 0),
            opacity: clamp(object?.opacity, 0, 1, 1)
        };
    }

    function normalizeCrossSectionPoint(point, fallbackX, fallbackY) {
        return {
            x: clamp(point?.x, -4000, 4000, fallbackX),
            y: clamp(point?.y, -4000, 4000, fallbackY)
        };
    }

    function normalizeCrossSectionObject(object, index) {
        const type = String(object?.type || '');
        const hatch = ['solid', 'diagonal', 'cross', 'dots'].includes(String(object?.hatch || ''))
            ? String(object.hatch)
            : 'solid';

        if (['terrain', 'layer'].includes(type)) {
            const defaultPoints = type === 'terrain'
                ? [
                    { x: 100, y: 320 }, { x: 250, y: 250 },
                    { x: 430, y: 300 }, { x: 620, y: 220 },
                    { x: 820, y: 310 }
                ]
                : [
                    { x: 100, y: 320 }, { x: 400, y: 350 },
                    { x: 850, y: 320 }, { x: 850, y: 430 },
                    { x: 400, y: 460 }, { x: 100, y: 430 }
                ];
            const sourcePoints = Array.isArray(object?.points) && object.points.length >= 2
                ? object.points.slice(0, 80)
                : defaultPoints;

            return {
                id: String(object?.id || `${type}-${index + 1}`).slice(0, 100),
                type,
                points: sourcePoints.map((point, pointIndex) =>
                    normalizeCrossSectionPoint(
                        point,
                        defaultPoints[pointIndex % defaultPoints.length]?.x || 100,
                        defaultPoints[pointIndex % defaultPoints.length]?.y || 300
                    )
                ),
                baselineY: type === 'terrain'
                    ? clamp(object?.baselineY, -4000, 4000, 520)
                    : 520,
                label: String(object?.label || (type === 'terrain' ? 'Terrain profile' : `Layer ${index + 1}`)).slice(0, 300),
                stroke: safeColor(object?.stroke, type === 'terrain' ? '#334155' : '#c2410c'),
                fill: safeColor(object?.fill, type === 'terrain' ? '#d6d3d1' : '#d97706'),
                fillOpacity: clamp(object?.fillOpacity, 0, 1, type === 'terrain' ? 0.28 : 0.34),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, type === 'terrain' ? 4 : 2.5),
                hatch,
                smooth: type === 'terrain' ? Boolean(object?.smooth) : false,
                opacity: clamp(object?.opacity, 0, 1, 1)
            };
        }

        if (type === 'river') {
            const depth = clamp(object?.depth, 10, 800, 70);
            return {
                id: String(object?.id || `river-${index + 1}`).slice(0, 100),
                type: 'river',
                x: clamp(object?.x, -4000, 4000, 500),
                y: clamp(object?.y, -4000, 4000, 330),
                width: clamp(object?.width, 20, 1600, 150),
                depth,
                waterDepth: clamp(object?.waterDepth, 2, depth, Math.min(depth, 35)),
                label: String(object?.label || 'River').slice(0, 300),
                stroke: safeColor(object?.stroke, '#0369a1'),
                fill: safeColor(object?.fill, '#38bdf8'),
                fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.72),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 3),
                opacity: clamp(object?.opacity, 0, 1, 1)
            };
        }

        if (type === 'water') {
            return {
                id: String(object?.id || `water-${index + 1}`).slice(0, 100),
                type: 'water',
                x: clamp(object?.x, -4000, 4000, 700),
                y: clamp(object?.y, -4000, 4000, 420),
                width: clamp(object?.width, 20, 1600, 260),
                height: clamp(object?.height, 10, 1200, 135),
                label: String(object?.label || 'Sea').slice(0, 300),
                stroke: safeColor(object?.stroke, '#0284c7'),
                fill: safeColor(object?.fill, '#7dd3fc'),
                fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.55),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 2.5),
                hatch,
                opacity: clamp(object?.opacity, 0, 1, 1)
            };
        }

        if (['fault', 'dimension'].includes(type)) {
            return {
                id: String(object?.id || `${type}-${index + 1}`).slice(0, 100),
                type,
                x1: clamp(object?.x1, -4000, 4000, 350),
                y1: clamp(object?.y1, -4000, 4000, 180),
                x2: clamp(object?.x2, -4000, 4000, 650),
                y2: clamp(object?.y2, -4000, 4000, 460),
                label: String(object?.label || (type === 'fault' ? 'Fault' : 'Dimension')).slice(0, 300),
                offset: type === 'dimension'
                    ? clamp(object?.offset, -1000, 1000, -22)
                    : 0,
                stroke: safeColor(object?.stroke, type === 'fault' ? '#dc2626' : '#0f172a'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, type === 'fault' ? 4 : 2),
                dash: type === 'fault' ? object?.dash !== false : false,
                showArrows: type === 'fault' ? object?.showArrows !== false : false,
                opacity: clamp(object?.opacity, 0, 1, 1)
            };
        }

        return {
            id: String(object?.id || `text-${index + 1}`).slice(0, 100),
            type: 'text',
            x: clamp(object?.x, -4000, 4000, 500),
            y: clamp(object?.y, -4000, 4000, 100),
            text: String(object?.text || 'Annotation').slice(0, 2000),
            textColor: safeColor(object?.textColor, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 96, 18),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal',
            rotation: clamp(object?.rotation, -3600, 3600, 0),
            opacity: clamp(object?.opacity, 0, 1, 1)
        };
    }

    function normalizeVectorArtPoint(point, fallbackX, fallbackY) {
        return {
            x: clamp(point?.x, -4000, 4000, fallbackX),
            y: clamp(point?.y, -4000, 4000, fallbackY)
        };
    }

    function normalizeVectorArtStyle(object, fillDefault = 'none') {
        return {
            stroke: safeColor(object?.stroke, '#0f172a'),
            fill: object?.fill === 'none' ? 'none' : safeColor(object?.fill, fillDefault === 'none' ? '#ffffff' : fillDefault),
            fillOpacity: clamp(object?.fillOpacity, 0, 1, fillDefault === 'none' ? 0 : 0.75),
            strokeWidth: clamp(object?.strokeWidth, 0.5, 80, 4),
            opacity: clamp(object?.opacity, 0, 1, 1),
            dash: Boolean(object?.dash),
            lineCap: ['butt', 'round', 'square'].includes(String(object?.lineCap || ''))
                ? String(object.lineCap)
                : 'round',
            lineJoin: ['miter', 'round', 'bevel'].includes(String(object?.lineJoin || ''))
                ? String(object.lineJoin)
                : 'round',
            rotation: clamp(object?.rotation, -3600, 3600, 0)
        };
    }

    function normalizeVectorArtObject(object, index) {
        const type = String(object?.type || '');

        if (type === 'path') {
            const points = Array.isArray(object?.points) && object.points.length >= 2
                ? object.points.slice(0, 1000).map((point, pointIndex) =>
                    normalizeVectorArtPoint(point, 100 + pointIndex * 20, 100)
                )
                : [
                    { x: 120, y: 300 },
                    { x: 300, y: 180 },
                    { x: 500, y: 340 }
                ];

            return Object.assign({
                id: String(object?.id || `path-${index + 1}`).slice(0, 100),
                type: 'path',
                points,
                closed: Boolean(object?.closed),
                smooth: object?.smooth !== false,
                arrowStart: Boolean(object?.arrowStart),
                arrowEnd: Boolean(object?.arrowEnd)
            }, normalizeVectorArtStyle(object, object?.closed ? '#dbeafe' : 'none'));
        }

        if (['line', 'arrow'].includes(type)) {
            return Object.assign({
                id: String(object?.id || `${type}-${index + 1}`).slice(0, 100),
                type,
                x1: clamp(object?.x1, -4000, 4000, 200),
                y1: clamp(object?.y1, -4000, 4000, 300),
                x2: clamp(object?.x2, -4000, 4000, 800),
                y2: clamp(object?.y2, -4000, 4000, 300),
                arrowStart: Boolean(object?.arrowStart),
                arrowEnd: type === 'arrow' ? object?.arrowEnd !== false : Boolean(object?.arrowEnd)
            }, normalizeVectorArtStyle(object, 'none'));
        }

        if (['rectangle', 'ellipse', 'star'].includes(type)) {
            return Object.assign({
                id: String(object?.id || `${type}-${index + 1}`).slice(0, 100),
                type,
                x: clamp(object?.x, -4000, 4000, 500),
                y: clamp(object?.y, -4000, 4000, 300),
                width: clamp(object?.width, 5, 3000, 210),
                height: clamp(object?.height, 5, 3000, 130),
                radius: type === 'rectangle' ? clamp(object?.radius, 0, 1000, 0) : 0,
                points: type === 'star' ? Math.round(clamp(object?.points, 3, 24, 5)) : 0,
                innerRatio: type === 'star' ? clamp(object?.innerRatio, 0.1, 0.9, 0.45) : 0
            }, normalizeVectorArtStyle(object, '#dbeafe'));
        }

        return {
            id: String(object?.id || `text-${index + 1}`).slice(0, 100),
            type: 'text',
            x: clamp(object?.x, -4000, 4000, 500),
            y: clamp(object?.y, -4000, 4000, 300),
            text: String(object?.text || 'Vector text').slice(0, 4000),
            textColor: safeColor(object?.textColor, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 160, 32),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal',
            fontStyle: object?.fontStyle === 'italic' ? 'italic' : 'normal',
            textAnchor: ['start', 'middle', 'end'].includes(String(object?.textAnchor || ''))
                ? String(object.textAnchor)
                : 'middle',
            rotation: clamp(object?.rotation, -3600, 3600, 0),
            opacity: clamp(object?.opacity, 0, 1, 1)
        };
    }

    function normalizeSportsObject(object, index) {
        const type = String(object?.type || '');

        if (type === 'player') {
            return {
                id: String(object?.id || `player-${index + 1}`).slice(0, 100),
                type: 'player',
                x: clamp(object?.x, -4000, 4000, 500),
                y: clamp(object?.y, -4000, 4000, 300),
                team: ['A', 'B', 'neutral'].includes(String(object?.team || ''))
                    ? String(object.team)
                    : 'A',
                number: String(object?.number || '').slice(0, 12),
                label: String(object?.label || '').slice(0, 100),
                color: safeColor(object?.color, object?.team === 'B' ? '#dc2626' : '#2563eb'),
                textColor: safeColor(object?.textColor, '#ffffff'),
                radius: clamp(object?.radius, 8, 70, 20)
            };
        }

        if (type === 'ball') {
            return {
                id: String(object?.id || `ball-${index + 1}`).slice(0, 100),
                type: 'ball',
                x: clamp(object?.x, -4000, 4000, 500),
                y: clamp(object?.y, -4000, 4000, 300),
                sport: ['soccer', 'basketball', 'cricket', 'generic'].includes(String(object?.sport || ''))
                    ? String(object.sport)
                    : 'soccer',
                size: clamp(object?.size, 5, 80, 14),
                color: safeColor(object?.color, object?.sport === 'cricket' ? '#b91c1c' : '#ffffff')
            };
        }

        if (type === 'arrow') {
            return {
                id: String(object?.id || `arrow-${index + 1}`).slice(0, 100),
                type: 'arrow',
                x1: clamp(object?.x1, -4000, 4000, 300),
                y1: clamp(object?.y1, -4000, 4000, 300),
                x2: clamp(object?.x2, -4000, 4000, 700),
                y2: clamp(object?.y2, -4000, 4000, 300),
                label: String(object?.label || '').slice(0, 100),
                color: safeColor(object?.color, '#2563eb'),
                width: clamp(object?.width, 0.5, 30, 5),
                dash: Boolean(object?.dash),
                curve: clamp(object?.curve, -500, 500, 0),
                arrowEnd: object?.arrowEnd !== false
            };
        }

        if (type === 'zone') {
            return {
                id: String(object?.id || `zone-${index + 1}`).slice(0, 100),
                type: 'zone',
                x: clamp(object?.x, -4000, 4000, 500),
                y: clamp(object?.y, -4000, 4000, 300),
                width: clamp(object?.width, 10, 3000, 220),
                height: clamp(object?.height, 10, 3000, 130),
                shape: object?.shape === 'ellipse' ? 'ellipse' : 'rectangle',
                label: String(object?.label || '').slice(0, 200),
                fill: safeColor(object?.fill, '#facc15'),
                fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.22),
                stroke: safeColor(object?.stroke, '#ca8a04'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 3),
                textColor: safeColor(object?.textColor, '#713f12')
            };
        }

        if (type === 'cone') {
            return {
                id: String(object?.id || `cone-${index + 1}`).slice(0, 100),
                type: 'cone',
                x: clamp(object?.x, -4000, 4000, 500),
                y: clamp(object?.y, -4000, 4000, 300),
                size: clamp(object?.size, 5, 100, 22),
                color: safeColor(object?.color, '#f97316'),
                label: String(object?.label || '').slice(0, 100)
            };
        }

        return {
            id: String(object?.id || `text-${index + 1}`).slice(0, 100),
            type: 'text',
            x: clamp(object?.x, -4000, 4000, 500),
            y: clamp(object?.y, -4000, 4000, 300),
            text: String(object?.text || 'Tactics note').slice(0, 4000),
            color: safeColor(object?.color, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 120, 28),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal'
        };
    }

    function normalizeStageObject(object, index) {
        const type = String(object?.type || '');

        if (type === 'actor') {
            return {
                id: String(object?.id || `actor-${index + 1}`).slice(0, 100),
                type: 'actor',
                x: clamp(object?.x, -4000, 4000, 500),
                y: clamp(object?.y, -4000, 4000, 300),
                group: ['A', 'B', 'neutral'].includes(String(object?.group || ''))
                    ? String(object.group)
                    : 'A',
                number: String(object?.number || '').slice(0, 12),
                label: String(object?.label || '').slice(0, 120),
                color: safeColor(object?.color, object?.group === 'B' ? '#dc2626' : '#2563eb'),
                textColor: safeColor(object?.textColor, '#ffffff'),
                radius: clamp(object?.radius, 8, 70, 22),
                facing: clamp(object?.facing, -3600, 3600, 0)
            };
        }

        if (type === 'prop') {
            return {
                id: String(object?.id || `prop-${index + 1}`).slice(0, 100),
                type: 'prop',
                x: clamp(object?.x, -4000, 4000, 500),
                y: clamp(object?.y, -4000, 4000, 300),
                width: clamp(object?.width, 10, 3000, 120),
                height: clamp(object?.height, 10, 3000, 70),
                propType: ['table', 'chair', 'door', 'sofa', 'platform'].includes(String(object?.propType || ''))
                    ? String(object.propType)
                    : 'table',
                label: String(object?.label || 'Prop').slice(0, 160),
                fill: safeColor(object?.fill, '#d6b98c'),
                stroke: safeColor(object?.stroke, '#6b4f2b'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 3),
                rotation: clamp(object?.rotation, -3600, 3600, 0)
            };
        }

        if (type === 'entrance') {
            return {
                id: String(object?.id || `entrance-${index + 1}`).slice(0, 100),
                type: 'entrance',
                x: clamp(object?.x, -4000, 4000, 100),
                y: clamp(object?.y, -4000, 4000, 300),
                width: clamp(object?.width, 20, 500, 72),
                height: clamp(object?.height, 8, 100, 26),
                side: object?.side === 'right' ? 'right' : 'left',
                label: String(object?.label || `E${index + 1}`).slice(0, 120),
                color: safeColor(object?.color, '#0f766e')
            };
        }

        if (type === 'movement') {
            return {
                id: String(object?.id || `movement-${index + 1}`).slice(0, 100),
                type: 'movement',
                x1: clamp(object?.x1, -4000, 4000, 300),
                y1: clamp(object?.y1, -4000, 4000, 350),
                x2: clamp(object?.x2, -4000, 4000, 700),
                y2: clamp(object?.y2, -4000, 4000, 250),
                curve: clamp(object?.curve, -500, 500, 0),
                label: String(object?.label || 'Cross').slice(0, 120),
                color: safeColor(object?.color, '#7c3aed'),
                width: clamp(object?.width, 0.5, 30, 5),
                dash: Boolean(object?.dash)
            };
        }

        if (type === 'zone') {
            return {
                id: String(object?.id || `zone-${index + 1}`).slice(0, 100),
                type: 'zone',
                x: clamp(object?.x, -4000, 4000, 500),
                y: clamp(object?.y, -4000, 4000, 300),
                width: clamp(object?.width, 10, 3000, 220),
                height: clamp(object?.height, 10, 3000, 130),
                shape: object?.shape === 'ellipse' ? 'ellipse' : 'rectangle',
                label: String(object?.label || 'Playing area').slice(0, 200),
                fill: safeColor(object?.fill, '#facc15'),
                fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.18),
                stroke: safeColor(object?.stroke, '#ca8a04'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 3),
                textColor: safeColor(object?.textColor, '#713f12')
            };
        }

        if (type === 'light') {
            return {
                id: String(object?.id || `light-${index + 1}`).slice(0, 100),
                type: 'light',
                x: clamp(object?.x, -4000, 4000, 500),
                y: clamp(object?.y, -4000, 4000, 300),
                radius: clamp(object?.radius, 10, 500, 90),
                label: String(object?.label || 'Light').slice(0, 160),
                color: safeColor(object?.color, '#f59e0b'),
                opacity: clamp(object?.opacity, 0, 1, 0.28)
            };
        }

        return {
            id: String(object?.id || `text-${index + 1}`).slice(0, 100),
            type: 'text',
            x: clamp(object?.x, -4000, 4000, 500),
            y: clamp(object?.y, -4000, 4000, 300),
            text: String(object?.text || 'Blocking note').slice(0, 4000),
            color: safeColor(object?.color, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 120, 28),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal'
        };
    }




    function normalizeTreeObject(object, index) {
        const type = String(object?.type || 'tree-node');
        if (type === 'tree-edge') {
            return {
                id: String(object?.id || `tree-edge-${index + 1}`).slice(0, 100),
                type: 'tree-edge',
                from: String(object?.from || '').slice(0, 100),
                to: String(object?.to || '').slice(0, 100),
                label: String(object?.label || '').slice(0, 300),
                probability: String(object?.probability || '').slice(0, 120),
                color: safeColor(object?.color, '#475569'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 2.5),
                dash: Boolean(object?.dash),
                arrow: Boolean(object?.arrow)
            };
        }
        if (type === 'text') {
            return {
                id: String(object?.id || `tree-text-${index + 1}`).slice(0, 100),
                type: 'text',
                x: clamp(object?.x, -4000, 4000, 500),
                y: clamp(object?.y, -4000, 4000, 300),
                text: String(object?.text || 'Tree note').slice(0, 4000),
                color: safeColor(object?.color, '#0f172a'),
                fontSize: clamp(object?.fontSize, 8, 120, 22),
                fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal'
            };
        }
        const shape = ['rounded', 'rectangle', 'circle', 'diamond'].includes(object?.shape)
            ? object.shape
            : 'rounded';
        return {
            id: String(object?.id || `tree-node-${index + 1}`).slice(0, 100),
            type: 'tree-node',
            kind: ['root', 'branch', 'leaf', 'decision'].includes(object?.kind) ? object.kind : 'branch',
            x: clamp(object?.x, -4000, 4000, 500),
            y: clamp(object?.y, -4000, 4000, 300),
            width: clamp(object?.width, 36, 1600, 150),
            height: clamp(object?.height, 30, 1200, 72),
            shape,
            label: String(object?.label || 'Node').slice(0, 1000),
            subtitle: String(object?.subtitle || '').slice(0, 1000),
            fill: safeColor(object?.fill, '#f8fafc'),
            stroke: safeColor(object?.stroke, '#475569'),
            textColor: safeColor(object?.textColor, '#0f172a'),
            strokeWidth: clamp(object?.strokeWidth, 0.5, 20, 2.5),
            fontSize: clamp(object?.fontSize, 8, 100, 19)
        };
    }

    function normalizeNumberLineObject(object, index) {
        const type = String(object?.type || 'interval');
        if (type === 'marker') {
            return {
                id: String(object?.id || `number-marker-${index + 1}`).slice(0, 100),
                type: 'marker', x: clamp(object?.x, -100000, 100000, 0),
                lane: clamp(object?.lane, -4, 4, 0), closed: object?.closed !== false,
                label: String(object?.label || '').slice(0, 160),
                color: safeColor(object?.color, '#dc2626'), size: clamp(object?.size, 3, 30, 8)
            };
        }
        if (type === 'text') {
            return {
                id: String(object?.id || `number-text-${index + 1}`).slice(0, 100),
                type: 'text', x: clamp(object?.x, -100000, 100000, 0),
                lane: clamp(object?.lane, -4, 4, 1), text: String(object?.text || 'Inequality note').slice(0, 4000),
                color: safeColor(object?.color, '#0f172a'), fontSize: clamp(object?.fontSize, 8, 120, 22),
                fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal'
            };
        }
        let start = clamp(object?.start, -100000, 100000, -2);
        let end = clamp(object?.end, -100000, 100000, 2);
        if (start > end) [start, end] = [end, start];
        return {
            id: String(object?.id || `number-interval-${index + 1}`).slice(0, 100),
            type: 'interval', start, end,
            leftInfinite: Boolean(object?.leftInfinite), rightInfinite: Boolean(object?.rightInfinite),
            startClosed: object?.startClosed !== false, endClosed: object?.endClosed !== false,
            lane: clamp(object?.lane, -4, 4, 0), label: String(object?.label || '').slice(0, 300),
            notation: String(object?.notation || '').slice(0, 300), color: safeColor(object?.color, '#2563eb'),
            strokeWidth: clamp(object?.strokeWidth, 1, 18, 6), fill: safeColor(object?.fill, '#93c5fd'),
            fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.2), showShading: object?.showShading !== false
        };
    }

    function normalizeCoordinateObject(object, index) {
        const type = String(object?.type || 'point');
        const supported = new Set([
            'point', 'segment', 'line', 'circle', 'ellipse', 'parabola',
            'hyperbola', 'midpoint', 'distance', 'slope',
            'parallel', 'perpendicular', 'text'
        ]);
        const normalizedType = supported.has(type) ? type : 'point';

        if (normalizedType === 'point') {
            return {
                id: String(object?.id || `coordinate-point-${index + 1}`).slice(0, 100),
                type: 'point',
                x: clamp(object?.x, -100000, 100000, 0),
                y: clamp(object?.y, -100000, 100000, 0),
                label: String(object?.label || `P${index + 1}`).slice(0, 120),
                color: safeColor(object?.color, '#dc2626'),
                labelColor: safeColor(object?.labelColor, '#0f172a'),
                size: clamp(object?.size, 2, 30, 6)
            };
        }

        if (['segment', 'line', 'distance', 'slope', 'midpoint'].includes(normalizedType)) {
            const base = {
                id: String(object?.id || `coordinate-${normalizedType}-${index + 1}`).slice(0, 100),
                type: normalizedType,
                x1: clamp(object?.x1, -100000, 100000, -2),
                y1: clamp(object?.y1, -100000, 100000, -1),
                x2: clamp(object?.x2, -100000, 100000, 2),
                y2: clamp(object?.y2, -100000, 100000, 1),
                label: String(object?.label || '').slice(0, 200)
            };

            if (normalizedType === 'midpoint') {
                return {
                    ...base,
                    label: String(object?.label || 'M').slice(0, 120),
                    color: safeColor(object?.color, '#16a34a'),
                    size: clamp(object?.size, 2, 30, 6)
                };
            }

            return {
                ...base,
                stroke: safeColor(
                    object?.stroke,
                    normalizedType === 'distance'
                        ? '#0891b2'
                        : (normalizedType === 'slope' ? '#9333ea' : '#2563eb')
                ),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 30, 2.5),
                dash: Boolean(object?.dash),
                showEquation: Boolean(object?.showEquation)
            };
        }

        if (['parallel', 'perpendicular'].includes(normalizedType)) {
            return {
                id: String(object?.id || `coordinate-${normalizedType}-${index + 1}`).slice(0, 100),
                type: normalizedType,
                x1: clamp(object?.x1, -100000, 100000, -2),
                y1: clamp(object?.y1, -100000, 100000, -1),
                x2: clamp(object?.x2, -100000, 100000, 2),
                y2: clamp(object?.y2, -100000, 100000, 1),
                px: clamp(object?.px, -100000, 100000, 0),
                py: clamp(object?.py, -100000, 100000, 2),
                label: String(object?.label || (normalizedType === 'parallel' ? 'Parallel' : 'Perpendicular')).slice(0, 200),
                stroke: safeColor(object?.stroke, normalizedType === 'parallel' ? '#16a34a' : '#dc2626'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 30, 2.5),
                dash: Boolean(object?.dash),
                showEquation: false
            };
        }

        if (normalizedType === 'circle') {
            return {
                id: String(object?.id || `coordinate-circle-${index + 1}`).slice(0, 100),
                type: 'circle',
                cx: clamp(object?.cx, -100000, 100000, 0),
                cy: clamp(object?.cy, -100000, 100000, 0),
                r: clamp(object?.r, 0.001, 100000, 3),
                label: String(object?.label || 'Circle').slice(0, 200),
                stroke: safeColor(object?.stroke, '#2563eb'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 30, 2.5),
                fill: safeColor(object?.fill, '#dbeafe'),
                fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.15),
                dash: Boolean(object?.dash)
            };
        }

        if (normalizedType === 'ellipse') {
            return {
                id: String(object?.id || `coordinate-ellipse-${index + 1}`).slice(0, 100),
                type: 'ellipse',
                cx: clamp(object?.cx, -100000, 100000, 0),
                cy: clamp(object?.cy, -100000, 100000, 0),
                rx: clamp(object?.rx, 0.001, 100000, 4),
                ry: clamp(object?.ry, 0.001, 100000, 2),
                label: String(object?.label || 'Ellipse').slice(0, 200),
                stroke: safeColor(object?.stroke, '#7c3aed'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 30, 2.5),
                fill: safeColor(object?.fill, '#ede9fe'),
                fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.16),
                dash: Boolean(object?.dash)
            };
        }

        if (normalizedType === 'parabola') {
            return {
                id: String(object?.id || `coordinate-parabola-${index + 1}`).slice(0, 100),
                type: 'parabola',
                vx: clamp(object?.vx, -100000, 100000, 0),
                vy: clamp(object?.vy, -100000, 100000, 0),
                a: clamp(object?.a, -10000, 10000, 0.25),
                orientation: object?.orientation === 'horizontal' ? 'horizontal' : 'vertical',
                label: String(object?.label || 'Parabola').slice(0, 200),
                stroke: safeColor(object?.stroke, '#dc2626'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 30, 2.5),
                dash: Boolean(object?.dash)
            };
        }

        if (normalizedType === 'hyperbola') {
            return {
                id: String(object?.id || `coordinate-hyperbola-${index + 1}`).slice(0, 100),
                type: 'hyperbola',
                cx: clamp(object?.cx, -100000, 100000, 0),
                cy: clamp(object?.cy, -100000, 100000, 0),
                a: clamp(object?.a, 0.001, 100000, 2),
                b: clamp(object?.b, 0.001, 100000, 1),
                orientation: object?.orientation === 'vertical' ? 'vertical' : 'horizontal',
                label: String(object?.label || 'Hyperbola').slice(0, 200),
                stroke: safeColor(object?.stroke, '#ea580c'),
                strokeWidth: clamp(object?.strokeWidth, 0.5, 30, 2.5),
                dash: Boolean(object?.dash)
            };
        }

        return {
            id: String(object?.id || `coordinate-text-${index + 1}`).slice(0, 100),
            type: 'text',
            x: clamp(object?.x, -100000, 100000, 0),
            y: clamp(object?.y, -100000, 100000, 0),
            text: String(object?.text || 'Label').slice(0, 4000),
            color: safeColor(object?.color, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 120, 18),
            fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal'
        };
    }


    function normalizeTechnicalObject(object, index) {
        const type = String(object?.type || 'tech-line');
        const supported = new Set(['tech-line','tech-rect','tech-circle','tech-arc','tech-polyline','tech-dimension','tech-leader','tech-hatch','tech-centre-mark','tech-title-block','text']);
        const normalizedType = supported.has(type) ? type : 'tech-line';
        const common = {
            id: String(object?.id || `technical-${index + 1}`).slice(0, 100),
            type: normalizedType,
            stroke: safeColor(object?.stroke, '#0f172a'),
            strokeWidth: clamp(object?.strokeWidth, 0.5, 30, 2.5),
            dash: String(object?.dash || '').slice(0, 80),
            fill: safeColor(object?.fill, 'transparent'),
            fillOpacity: clamp(object?.fillOpacity, 0, 1, 0),
            opacity: clamp(object?.opacity, 0, 1, 1)
        };
        if (normalizedType === 'tech-line') return { ...common, x1:clamp(object?.x1,-4000,4000,100), y1:clamp(object?.y1,-4000,4000,100), x2:clamp(object?.x2,-4000,4000,300), y2:clamp(object?.y2,-4000,4000,100), lineStyle:['visible','hidden','centre','construction','extension'].includes(object?.lineStyle)?object.lineStyle:'visible' };
        if (['tech-rect','tech-hatch','tech-title-block'].includes(normalizedType)) {
            const base = { ...common, x:clamp(object?.x,-4000,4000,100), y:clamp(object?.y,-4000,4000,100), w:clamp(object?.w,1,4000,220), h:clamp(object?.h,1,4000,140) };
            if (normalizedType === 'tech-hatch') return { ...base, angle:clamp(object?.angle,-360,360,45), spacing:clamp(object?.spacing,4,100,14), label:String(object?.label||'').slice(0,200) };
            if (normalizedType === 'tech-title-block') return { ...base, title:String(object?.title||'Technical Drawing').slice(0,300), drawingNo:String(object?.drawingNo||'DRG-001').slice(0,100), scale:String(object?.scale||'1:1').slice(0,50), sheet:String(object?.sheet||'1 / 1').slice(0,50), drawnBy:String(object?.drawnBy||'').slice(0,100), date:String(object?.date||'').slice(0,50) };
            return base;
        }
        if (normalizedType === 'tech-circle') return { ...common, cx:clamp(object?.cx,-4000,4000,250), cy:clamp(object?.cy,-4000,4000,200), r:clamp(object?.r,1,4000,60) };
        if (normalizedType === 'tech-arc') return { ...common, cx:clamp(object?.cx,-4000,4000,250), cy:clamp(object?.cy,-4000,4000,200), r:clamp(object?.r,1,4000,60), startAngle:clamp(object?.startAngle,-3600,3600,0), endAngle:clamp(object?.endAngle,-3600,3600,180) };
        if (normalizedType === 'tech-polyline') return { ...common, points:Array.isArray(object?.points)?object.points.slice(0,200).map((p)=>normalizePoint(p)):[], closed:Boolean(object?.closed) };
        if (normalizedType === 'tech-dimension') return { ...common, x1:clamp(object?.x1,-4000,4000,100), y1:clamp(object?.y1,-4000,4000,100), x2:clamp(object?.x2,-4000,4000,300), y2:clamp(object?.y2,-4000,4000,100), offset:clamp(object?.offset,-500,500,42), label:String(object?.label||'').slice(0,200), units:String(object?.units||'mm').slice(0,20), precision:Math.round(clamp(object?.precision,0,6,0)), textColor:safeColor(object?.textColor,'#0f172a'), fontSize:clamp(object?.fontSize,8,96,17), outside:Boolean(object?.outside) };
        if (normalizedType === 'tech-leader') return { ...common, x1:clamp(object?.x1,-4000,4000,100), y1:clamp(object?.y1,-4000,4000,100), x2:clamp(object?.x2,-4000,4000,300), y2:clamp(object?.y2,-4000,4000,100), text:String(object?.text||'Note').slice(0,1000), textColor:safeColor(object?.textColor,'#0f172a'), fontSize:clamp(object?.fontSize,8,96,18) };
        if (normalizedType === 'tech-centre-mark') return { ...common, cx:clamp(object?.cx,-4000,4000,250), cy:clamp(object?.cy,-4000,4000,200), size:clamp(object?.size,3,300,26) };
        return { ...common, x:clamp(object?.x,-4000,4000,100), y:clamp(object?.y,-4000,4000,100), text:String(object?.text||'Technical note').slice(0,4000), color:safeColor(object?.color,'#0f172a'), fontSize:clamp(object?.fontSize,8,120,20), fontWeight:object?.fontWeight==='bold'?'bold':'normal', rotation:clamp(object?.rotation,-3600,3600,0) };
    }


    function normalizeStatisticalObject(object, index) {
        const type = String(object?.type || 'stat-bar');
        const supported = new Set([
            'stat-bar', 'stat-histogram', 'stat-frequency-polygon', 'stat-ogive',
            'stat-pie', 'stat-box-plot', 'stat-scatter'
        ]);
        const normalizedType = supported.has(type) ? type : 'stat-bar';
        const labels = Array.isArray(object?.labels)
            ? object.labels.slice(0, 50).map((label) => String(label ?? '').slice(0, 120))
            : ['A', 'B', 'C', 'D', 'E'];
        const values = Array.isArray(object?.values)
            ? object.values.slice(0, 50).map((value) => clamp(value, -1000000000, 1000000000, 0))
            : [12, 20, 16, 28, 24];
        const colors = Array.isArray(object?.colors)
            ? object.colors.slice(0, 50).map((color, colorIndex) => safeColor(color, ['#2563eb','#dc2626','#16a34a','#f59e0b','#7c3aed','#0891b2','#db2777','#475569'][colorIndex % 8]))
            : ['#2563eb','#dc2626','#16a34a','#f59e0b','#7c3aed','#0891b2','#db2777','#475569'];
        const points = Array.isArray(object?.points)
            ? object.points.slice(0, 100).map((point) => ({
                x: clamp(point?.x, -1000000000, 1000000000, 0),
                y: clamp(point?.y, -1000000000, 1000000000, 0)
            }))
            : [];
        const fiveNumber = Array.isArray(object?.fiveNumber)
            ? object.fiveNumber.slice(0, 5).map((value) => clamp(value, -1000000000, 1000000000, 0))
            : [5, 12, 18, 26, 36];

        return {
            id: String(object?.id || `statistical-${index + 1}`).slice(0, 100),
            type: normalizedType,
            x: clamp(object?.x, -4000, 4000, 100),
            y: clamp(object?.y, -4000, 4000, 80),
            w: clamp(object?.w, 180, 4000, 800),
            h: clamp(object?.h, 140, 4000, 430),
            title: String(object?.title || 'Statistical Chart').slice(0, 300),
            labels,
            values,
            colors,
            points,
            fiveNumber,
            stroke: safeColor(object?.stroke, '#2563eb'),
            fill: safeColor(object?.fill, '#93c5fd'),
            fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.65),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 3),
            showGrid: object?.showGrid !== false,
            showLegend: object?.showLegend !== false,
            showValues: object?.showValues !== false,
            showAxes: object?.showAxes !== false,
            showTrendline: object?.showTrendline !== false,
            xLabel: String(object?.xLabel || 'Category').slice(0, 120),
            yLabel: String(object?.yLabel || 'Value').slice(0, 120),
            opacity: clamp(object?.opacity, 0, 1, 1)
        };
    }


    function normalizeFunctionObject(object, index) {
        const type = String(object?.type || 'function-curve');
        const supported = new Set(['function-curve', 'function-point', 'function-asymptote', 'function-line', 'function-domain', 'text']);
        const normalizedType = supported.has(type) ? type : 'function-curve';
        const common = { id: String(object?.id || `function-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'function-curve') {
            const pieces = Array.isArray(object?.pieces) ? object.pieces.slice(0, 20).map((piece) => ({
                expression: String(piece?.expression || 'x').slice(0, 300),
                xMin: clamp(piece?.xMin, -100000, 100000, -10),
                xMax: clamp(piece?.xMax, -100000, 100000, 10),
                closedStart: piece?.closedStart !== false,
                closedEnd: piece?.closedEnd !== false
            })).filter((piece) => piece.xMax >= piece.xMin) : [];
            return { ...common,
                expression: String(object?.expression || 'x^2').slice(0, 300),
                label: String(object?.label || 'f(x)').slice(0, 300),
                xMin: clamp(object?.xMin, -100000, 100000, -10),
                xMax: clamp(object?.xMax, -100000, 100000, 10),
                stroke: safeColor(object?.stroke, '#2563eb'), lineWidth: clamp(object?.lineWidth, 0.5, 30, 3),
                dashed: Boolean(object?.dashed), opacity: clamp(object?.opacity, 0, 1, 1), samples: Math.round(clamp(object?.samples, 80, 1600, 420)), pieces
            };
        }
        if (normalizedType === 'function-point') return { ...common,
            x: clamp(object?.x, -100000, 100000, 0), y: clamp(object?.y, -100000, 100000, 0),
            label: String(object?.label || '').slice(0, 300), color: safeColor(object?.color, '#dc2626'),
            radius: clamp(object?.radius, 2, 30, 6), filled: object?.filled !== false, showGuide: Boolean(object?.showGuide)
        };
        if (normalizedType === 'function-asymptote') return { ...common,
            orientation: object?.orientation === 'horizontal' ? 'horizontal' : 'vertical', value: clamp(object?.value, -100000, 100000, 0),
            label: String(object?.label || '').slice(0, 300), stroke: safeColor(object?.stroke, '#dc2626'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 2.5), dashed: object?.dashed !== false
        };
        if (normalizedType === 'function-line') return { ...common,
            slope: clamp(object?.slope, -100000, 100000, 1), intercept: clamp(object?.intercept, -100000, 100000, 0),
            label: String(object?.label || 'y = mx + c').slice(0, 300), stroke: safeColor(object?.stroke, '#16a34a'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 2.5), dashed: Boolean(object?.dashed)
        };
        if (normalizedType === 'function-domain') return { ...common,
            xStart: clamp(object?.xStart, -100000, 100000, -2), xEnd: clamp(object?.xEnd, -100000, 100000, 2),
            label: String(object?.label || 'Domain').slice(0, 300), fill: safeColor(object?.fill, '#93c5fd'),
            fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.2), stroke: safeColor(object?.stroke, '#2563eb'), dashed: object?.dashed !== false
        };
        return { ...common, x: clamp(object?.x, -100000, 100000, 0), y: clamp(object?.y, -100000, 100000, 0),
            text: String(object?.text || 'Annotation').slice(0, 4000), color: safeColor(object?.color, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 120, 18), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal'
        };
    }


    function normalizeComplexObject(object, index) {
        const type = String(object?.type || 'complex-point');
        const supported = new Set(['complex-point', 'complex-vector', 'complex-circle', 'complex-arc', 'complex-line', 'complex-region', 'text']);
        const normalizedType = supported.has(type) ? type : 'complex-point';
        const common = { id: String(object?.id || `complex-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'complex-point') return { ...common,
            re: clamp(object?.re, -100000, 100000, 0), im: clamp(object?.im, -100000, 100000, 0),
            label: String(object?.label || 'z').slice(0, 300), color: safeColor(object?.color, '#dc2626'),
            radius: clamp(object?.radius, 2, 30, 6), filled: object?.filled !== false,
            showProjection: Boolean(object?.showProjection), showValue: object?.showValue !== false
        };
        if (normalizedType === 'complex-vector') return { ...common,
            re: clamp(object?.re, -100000, 100000, 3), im: clamp(object?.im, -100000, 100000, 2),
            label: String(object?.label || 'z').slice(0, 300), color: safeColor(object?.color, '#2563eb'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 3), dashed: Boolean(object?.dashed), showComponents: Boolean(object?.showComponents)
        };
        if (normalizedType === 'complex-circle') return { ...common,
            centerRe: clamp(object?.centerRe, -100000, 100000, 0), centerIm: clamp(object?.centerIm, -100000, 100000, 0),
            radius: clamp(object?.radius, 0.01, 100000, 3), label: String(object?.label || '|z| = r').slice(0, 300),
            stroke: safeColor(object?.stroke, '#7c3aed'), fill: safeColor(object?.fill, '#c4b5fd'),
            fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.08), lineWidth: clamp(object?.lineWidth, 0.5, 30, 2.5), dashed: Boolean(object?.dashed)
        };
        if (normalizedType === 'complex-arc') return { ...common,
            radius: clamp(object?.radius, 0.01, 100000, 1.5), startAngle: clamp(object?.startAngle, -3600, 3600, 0),
            endAngle: clamp(object?.endAngle, -3600, 3600, 45), label: String(object?.label || 'arg z').slice(0, 300),
            stroke: safeColor(object?.stroke, '#ea580c'), lineWidth: clamp(object?.lineWidth, 0.5, 30, 3),
            dashed: Boolean(object?.dashed), arrow: object?.arrow !== false
        };
        if (normalizedType === 'complex-line') return { ...common,
            x1: clamp(object?.x1, -100000, 100000, -5), y1: clamp(object?.y1, -100000, 100000, 0),
            x2: clamp(object?.x2, -100000, 100000, 5), y2: clamp(object?.y2, -100000, 100000, 0),
            label: String(object?.label || 'Locus').slice(0, 300), stroke: safeColor(object?.stroke, '#16a34a'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 2.5), dashed: Boolean(object?.dashed)
        };
        if (normalizedType === 'complex-region') return { ...common,
            innerRadius: clamp(object?.innerRadius, 0, 100000, 1), outerRadius: clamp(object?.outerRadius, 0.01, 100000, 4),
            startAngle: clamp(object?.startAngle, -3600, 3600, 0), endAngle: clamp(object?.endAngle, -3600, 3600, 90),
            label: String(object?.label || 'Polar region').slice(0, 300), fill: safeColor(object?.fill, '#93c5fd'),
            fillOpacity: clamp(object?.fillOpacity, 0, 1, 0.28), stroke: safeColor(object?.stroke, '#2563eb'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 2), dashed: Boolean(object?.dashed)
        };
        return { ...common,
            re: clamp(object?.re, -100000, 100000, 0), im: clamp(object?.im, -100000, 100000, 0),
            text: String(object?.text || 'Annotation').slice(0, 4000), color: safeColor(object?.color, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 120, 18), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal'
        };
    }


    function normalizeLogicPortRef(ref) {
        if (!ref || typeof ref !== 'object') return null;
        const objectId = String(ref.objectId || '').slice(0, 100);
        const portKey = String(ref.portKey || '').slice(0, 100);
        return objectId && portKey ? { objectId, portKey } : null;
    }

    function normalizeDigitalLogicObject(object, index) {
        const type = String(object?.type || 'logic-gate');
        const supported = new Set(['logic-gate', 'logic-input', 'logic-output', 'logic-wire', 'logic-block', 'logic-truth-table', 'text']);
        const normalizedType = supported.has(type) ? type : 'logic-gate';
        const common = { id: String(object?.id || `digital-logic-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'logic-gate') {
            const gateTypes = new Set(['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor', 'buffer']);
            const gateType = gateTypes.has(String(object?.gateType || '')) ? String(object.gateType) : 'and';
            const inputLabels = Array.isArray(object?.inputLabels)
                ? object.inputLabels.slice(0, 8).map((value) => String(value ?? '').slice(0, 80))
                : (gateType === 'not' || gateType === 'buffer' ? ['A'] : ['A', 'B']);
            return { ...common,
                gateType,
                x: clamp(object?.x, -100000, 100000, 320), y: clamp(object?.y, -100000, 100000, 220),
                width: clamp(object?.width, 60, 600, gateType === 'not' || gateType === 'buffer' ? 92 : 120),
                height: clamp(object?.height, 40, 400, 80),
                label: String(object?.label || gateType.toUpperCase()).slice(0, 200), inputLabels,
                outputLabel: String(object?.outputLabel || 'Y').slice(0, 80),
                fill: safeColor(object?.fill, '#ffffff'), stroke: safeColor(object?.stroke, '#0f172a'),
                lineWidth: clamp(object?.lineWidth, 0.5, 30, 3), showLabel: object?.showLabel !== false
            };
        }
        if (normalizedType === 'logic-input' || normalizedType === 'logic-output') return { ...common,
            x: clamp(object?.x, -100000, 100000, normalizedType === 'logic-input' ? 100 : 900),
            y: clamp(object?.y, -100000, 100000, 250), label: String(object?.label || (normalizedType === 'logic-input' ? 'A' : 'Y')).slice(0, 120),
            value: String(object?.value ?? '0').slice(0, 40), color: safeColor(object?.color, normalizedType === 'logic-input' ? '#2563eb' : '#dc2626'),
            radius: clamp(object?.radius, 3, 30, 8), showValue: object?.showValue !== false
        };
        if (normalizedType === 'logic-wire') {
            const points = Array.isArray(object?.points)
                ? object.points.slice(0, 64).map((point) => ({ x: clamp(point?.x, -100000, 100000, 0), y: clamp(point?.y, -100000, 100000, 0) }))
                : [{ x: 100, y: 100 }, { x: 240, y: 100 }];
            if (points.length < 2) points.push({ x: points[0]?.x + 100 || 100, y: points[0]?.y || 100 });
            return { ...common, points, label: String(object?.label || '').slice(0, 200),
                stroke: safeColor(object?.stroke, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 30, 3),
                dashed: Boolean(object?.dashed), junctions: object?.junctions !== false,
                autoRoute: Boolean(object?.autoRoute), sourcePort: normalizeLogicPortRef(object?.sourcePort), targetPort: normalizeLogicPortRef(object?.targetPort)
            };
        }
        if (normalizedType === 'logic-block') return { ...common,
            x: clamp(object?.x, -100000, 100000, 360), y: clamp(object?.y, -100000, 100000, 180),
            width: clamp(object?.width, 100, 900, 260), height: clamp(object?.height, 80, 700, 220),
            label: String(object?.label || 'LOGIC BLOCK').slice(0, 300), subLabel: String(object?.subLabel || '').slice(0, 300),
            pinsLeft: Array.isArray(object?.pinsLeft) ? object.pinsLeft.slice(0, 16).map((value) => String(value ?? '').slice(0, 80)) : ['A', 'B'],
            pinsRight: Array.isArray(object?.pinsRight) ? object.pinsRight.slice(0, 16).map((value) => String(value ?? '').slice(0, 80)) : ['Y'],
            fill: safeColor(object?.fill, '#f8fafc'), stroke: safeColor(object?.stroke, '#0f172a'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 3), clockPin: Boolean(object?.clockPin)
        };
        if (normalizedType === 'logic-truth-table') {
            const headers = Array.isArray(object?.headers) ? object.headers.slice(0, 12).map((value) => String(value ?? '').slice(0, 100)) : ['A', 'B', 'Y'];
            const rows = Array.isArray(object?.rows)
                ? object.rows.slice(0, 32).map((row) => Array.isArray(row) ? row.slice(0, 12).map((value) => String(value ?? '').slice(0, 100)) : [])
                : [['0', '0', '0'], ['1', '1', '1']];
            return { ...common,
                x: clamp(object?.x, -100000, 100000, 620), y: clamp(object?.y, -100000, 100000, 100),
                width: clamp(object?.width, 180, 1200, 350), rowHeight: clamp(object?.rowHeight, 22, 100, 34),
                title: String(object?.title || 'Truth Table').slice(0, 300), headers, rows,
                headerFill: safeColor(object?.headerFill, '#dbeafe'), stroke: safeColor(object?.stroke, '#334155'),
                textColor: safeColor(object?.textColor, '#0f172a')
            };
        }
        return { ...common,
            x: clamp(object?.x, -100000, 100000, 60), y: clamp(object?.y, -100000, 100000, 60),
            text: String(object?.text || 'Annotation').slice(0, 4000), color: safeColor(object?.color, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 120, 20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal'
        };
    }


    function normalizeFsmPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n', 'e', 's', 'w'].includes(key) ? key : fallback;
    }

    function normalizeFiniteStateMachineObject(object, index) {
        const type = String(object?.type || 'fsm-state');
        const supported = new Set(['fsm-state', 'fsm-transition', 'fsm-table', 'text']);
        const normalizedType = supported.has(type) ? type : 'fsm-state';
        const common = { id: String(object?.id || `finite-state-machine-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'fsm-state') return { ...common,
            x: clamp(object?.x, -100000, 100000, 320), y: clamp(object?.y, -100000, 100000, 260),
            radius: clamp(object?.radius, 24, 160, 48), label: String(object?.label || `q${index}`).slice(0, 160),
            output: String(object?.output || '').slice(0, 160), accepting: Boolean(object?.accepting), initial: Boolean(object?.initial),
            fill: safeColor(object?.fill, '#ffffff'), stroke: safeColor(object?.stroke, '#0f172a'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 3)
        };
        if (normalizedType === 'fsm-transition') return { ...common,
            sourceId: String(object?.sourceId || '').slice(0, 100), targetId: String(object?.targetId || '').slice(0, 100),
            sourcePort: normalizeFsmPort(object?.sourcePort, 'e'), targetPort: normalizeFsmPort(object?.targetPort, 'w'),
            label: String(object?.label || '').slice(0, 300), curve: clamp(object?.curve, -400, 400, 0),
            loopAngle: clamp(object?.loopAngle, -3600, 3600, -90), stroke: safeColor(object?.stroke, '#0f172a'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 3), dashed: Boolean(object?.dashed), arrow: object?.arrow !== false
        };
        if (normalizedType === 'fsm-table') {
            const headers = Array.isArray(object?.headers) ? object.headers.slice(0, 12).map((value) => String(value ?? '').slice(0, 100)) : ['State', '0', '1'];
            const rows = Array.isArray(object?.rows)
                ? object.rows.slice(0, 40).map((row) => Array.isArray(row) ? row.slice(0, 12).map((value) => String(value ?? '').slice(0, 100)) : [])
                : [['→q0', 'q0', 'q1'], ['*q1', 'q0', 'q1']];
            return { ...common,
                x: clamp(object?.x, -100000, 100000, 620), y: clamp(object?.y, -100000, 100000, 100),
                width: clamp(object?.width, 180, 1500, 380), rowHeight: clamp(object?.rowHeight, 22, 100, 36),
                title: String(object?.title || 'State Transition Table').slice(0, 300), headers, rows,
                headerFill: safeColor(object?.headerFill, '#dbeafe'), stroke: safeColor(object?.stroke, '#334155'),
                textColor: safeColor(object?.textColor, '#0f172a')
            };
        }
        return { ...common,
            x: clamp(object?.x, -100000, 100000, 60), y: clamp(object?.y, -100000, 100000, 60),
            text: String(object?.text || 'Annotation').slice(0, 4000), color: safeColor(object?.color, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 120, 20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal'
        };
    }


    function normalizeErPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n', 'e', 's', 'w'].includes(key) ? key : fallback;
    }

    function normalizeDatabaseErObject(object, index) {
        const type = String(object?.type || 'er-entity');
        const supported = new Set(['er-entity', 'er-relationship', 'er-attribute', 'er-connector', 'er-table', 'text']);
        const normalizedType = supported.has(type) ? type : 'er-entity';
        const common = { id: String(object?.id || `database-er-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'er-entity') return { ...common,
            x: clamp(object?.x, -100000, 100000, 300), y: clamp(object?.y, -100000, 100000, 260),
            width: clamp(object?.width, 120, 1000, 220), height: clamp(object?.height, 60, 800, 110),
            label: String(object?.label || 'ENTITY').slice(0, 180),
            fields: Array.isArray(object?.fields) ? object.fields.slice(0, 30).map((value) => String(value ?? '').slice(0, 180)) : [],
            weak: Boolean(object?.weak), fill: safeColor(object?.fill, '#eff6ff'), stroke: safeColor(object?.stroke, '#1d4ed8'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 3)
        };
        if (normalizedType === 'er-relationship') return { ...common,
            x: clamp(object?.x, -100000, 100000, 580), y: clamp(object?.y, -100000, 100000, 300),
            width: clamp(object?.width, 100, 800, 190), height: clamp(object?.height, 60, 600, 110),
            label: String(object?.label || 'RELATIONSHIP').slice(0, 180), identifying: Boolean(object?.identifying),
            fill: safeColor(object?.fill, '#fff7ed'), stroke: safeColor(object?.stroke, '#c2410c'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 3)
        };
        if (normalizedType === 'er-attribute') return { ...common,
            x: clamp(object?.x, -100000, 100000, 300), y: clamp(object?.y, -100000, 100000, 110),
            width: clamp(object?.width, 80, 700, 180), height: clamp(object?.height, 40, 400, 74),
            label: String(object?.label || 'attribute').slice(0, 180), key: Boolean(object?.key),
            multivalued: Boolean(object?.multivalued), derived: Boolean(object?.derived),
            fill: safeColor(object?.fill, '#f8fafc'), stroke: safeColor(object?.stroke, '#334155'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 2.5)
        };
        if (normalizedType === 'er-connector') return { ...common,
            sourceId: String(object?.sourceId || '').slice(0, 100), targetId: String(object?.targetId || '').slice(0, 100),
            sourcePort: normalizeErPort(object?.sourcePort, 'e'), targetPort: normalizeErPort(object?.targetPort, 'w'),
            label: String(object?.label || '').slice(0, 240),
            sourceCardinality: String(object?.sourceCardinality || '1').slice(0, 20),
            targetCardinality: String(object?.targetCardinality || 'N').slice(0, 20),
            sourceParticipation: object?.sourceParticipation === 'total' ? 'total' : 'partial',
            targetParticipation: object?.targetParticipation === 'total' ? 'total' : 'partial',
            stroke: safeColor(object?.stroke, '#334155'), lineWidth: clamp(object?.lineWidth, 0.5, 30, 3),
            dashed: Boolean(object?.dashed), autoRoute: object?.autoRoute !== false
        };
        if (normalizedType === 'er-table') return { ...common,
            x: clamp(object?.x, -100000, 100000, 620), y: clamp(object?.y, -100000, 100000, 220),
            width: clamp(object?.width, 180, 1600, 340), rowHeight: clamp(object?.rowHeight, 22, 100, 34),
            label: String(object?.label || 'RELATION').slice(0, 180),
            columns: Array.isArray(object?.columns) ? object.columns.slice(0, 50).map((value) => String(value ?? '').slice(0, 240)) : [],
            headerFill: safeColor(object?.headerFill, '#dcfce7'), fill: safeColor(object?.fill, '#ffffff'),
            stroke: safeColor(object?.stroke, '#166534'), textColor: safeColor(object?.textColor, '#0f172a')
        };
        return { ...common,
            x: clamp(object?.x, -100000, 100000, 60), y: clamp(object?.y, -100000, 100000, 60),
            text: String(object?.text || 'Annotation').slice(0, 4000), color: safeColor(object?.color, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 120, 20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal'
        };
    }


    function normalizeNetworkPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n', 'e', 's', 'w'].includes(key) ? key : fallback;
    }

    function normalizeNetworkTopologyObject(object, index) {
        const type = String(object?.type || 'network-device');
        const supported = new Set(['network-device', 'network-link', 'network-zone', 'network-table', 'text']);
        const normalizedType = supported.has(type) ? type : 'network-device';
        const common = { id: String(object?.id || `network-topology-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'network-device') {
            const deviceTypes = new Set(['router', 'switch', 'server', 'client', 'laptop', 'cloud', 'firewall', 'access-point', 'database', 'printer', 'mobile', 'generic']);
            const deviceType = deviceTypes.has(String(object?.deviceType || 'generic')) ? String(object.deviceType) : 'generic';
            return { ...common,
                x: clamp(object?.x, -100000, 100000, 320), y: clamp(object?.y, -100000, 100000, 260),
                width: clamp(object?.width, 70, 700, 130), height: clamp(object?.height, 50, 500, 90),
                deviceType, label: String(object?.label || 'Device').slice(0, 180),
                subtitle: String(object?.subtitle || '').slice(0, 180), ip: String(object?.ip || '').slice(0, 180),
                fill: safeColor(object?.fill, '#f8fafc'), stroke: safeColor(object?.stroke, '#334155'),
                iconColor: safeColor(object?.iconColor, '#334155'), lineWidth: clamp(object?.lineWidth, 0.5, 30, 3)
            };
        }
        if (normalizedType === 'network-link') {
            const linkTypes = new Set(['ethernet', 'fiber', 'wan', 'wireless', 'vpn']);
            const directions = new Set(['none', 'forward', 'both']);
            return { ...common,
                sourceId: String(object?.sourceId || '').slice(0, 100), targetId: String(object?.targetId || '').slice(0, 100),
                sourcePort: normalizeNetworkPort(object?.sourcePort, 'e'), targetPort: normalizeNetworkPort(object?.targetPort, 'w'),
                label: String(object?.label || '').slice(0, 240), bandwidth: String(object?.bandwidth || '').slice(0, 120),
                linkType: linkTypes.has(String(object?.linkType || 'ethernet')) ? String(object.linkType) : 'ethernet',
                direction: directions.has(String(object?.direction || 'none')) ? String(object.direction) : 'none',
                stroke: safeColor(object?.stroke, '#334155'), lineWidth: clamp(object?.lineWidth, 0.5, 30, 3),
                dashed: Boolean(object?.dashed), autoRoute: object?.autoRoute !== false
            };
        }
        if (normalizedType === 'network-zone') return { ...common,
            x: clamp(object?.x, -100000, 100000, 400), y: clamp(object?.y, -100000, 100000, 350),
            width: clamp(object?.width, 160, 2200, 520), height: clamp(object?.height, 120, 1600, 360),
            label: String(object?.label || 'LAN / Subnet').slice(0, 240),
            fill: safeColor(object?.fill, '#eff6ff'), stroke: safeColor(object?.stroke, '#60a5fa'),
            lineWidth: clamp(object?.lineWidth, 0.5, 30, 2), dashed: object?.dashed !== false
        };
        if (normalizedType === 'network-table') {
            const headers = Array.isArray(object?.headers) ? object.headers.slice(0, 12).map((value) => String(value ?? '').slice(0, 160)) : ['Device', 'Interface', 'IP / Prefix'];
            const rows = Array.isArray(object?.rows) ? object.rows.slice(0, 40).map((row) => Array.isArray(row) ? row.slice(0, 12).map((value) => String(value ?? '').slice(0, 180)) : []) : [];
            return { ...common,
                x: clamp(object?.x, -100000, 100000, 620), y: clamp(object?.y, -100000, 100000, 100),
                width: clamp(object?.width, 220, 1700, 460), rowHeight: clamp(object?.rowHeight, 22, 100, 34),
                title: String(object?.title || 'IP Addressing Table').slice(0, 240), headers, rows,
                headerFill: safeColor(object?.headerFill, '#dbeafe'), stroke: safeColor(object?.stroke, '#1d4ed8'),
                textColor: safeColor(object?.textColor, '#0f172a')
            };
        }
        return { ...common,
            x: clamp(object?.x, -100000, 100000, 60), y: clamp(object?.y, -100000, 100000, 60),
            text: String(object?.text || 'Annotation').slice(0, 4000), color: safeColor(object?.color, '#0f172a'),
            fontSize: clamp(object?.fontSize, 8, 120, 20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal'
        };
    }


    function normalizeUmlPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n', 'e', 's', 'w'].includes(key) ? key : fallback;
    }

    function normalizeUmlSoftwareObject(object, index) {
        const type = String(object?.type || 'uml-class');
        const supported = new Set(['uml-class', 'uml-component', 'uml-actor', 'uml-usecase', 'uml-package', 'uml-note', 'uml-relation', 'text']);
        const normalizedType = supported.has(type) ? type : 'uml-class';
        const common = { id: String(object?.id || `uml-software-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'uml-class') {
            const kinds = new Set(['class', 'interface', 'abstract', 'enum']);
            return { ...common,
                classKind: kinds.has(String(object?.classKind || 'class')) ? String(object.classKind) : 'class',
                x: clamp(object?.x, -100000, 100000, 340), y: clamp(object?.y, -100000, 100000, 250),
                width: clamp(object?.width, 140, 1400, 250), height: clamp(object?.height, 90, 1200, 190),
                name: String(object?.name || 'ClassName').slice(0, 180), stereotype: String(object?.stereotype || '').slice(0, 120),
                attributes: Array.isArray(object?.attributes) ? object.attributes.slice(0, 60).map((value) => String(value ?? '').slice(0, 260)) : [],
                methods: Array.isArray(object?.methods) ? object.methods.slice(0, 60).map((value) => String(value ?? '').slice(0, 260)) : [],
                fill: safeColor(object?.fill, '#eff6ff'), stroke: safeColor(object?.stroke, '#1d4ed8'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2.5)
            };
        }
        if (normalizedType === 'uml-component') return { ...common,
            x: clamp(object?.x, -100000, 100000, 360), y: clamp(object?.y, -100000, 100000, 260), width: clamp(object?.width, 100, 1400, 230), height: clamp(object?.height, 70, 1000, 120),
            name: String(object?.name || 'Component').slice(0, 180), stereotype: String(object?.stereotype || 'component').slice(0, 120), description: String(object?.description || '').slice(0, 1600),
            fill: safeColor(object?.fill, '#f3e8ff'), stroke: safeColor(object?.stroke, '#7e22ce'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2.5)
        };
        if (normalizedType === 'uml-actor') return { ...common,
            x: clamp(object?.x, -100000, 100000, 220), y: clamp(object?.y, -100000, 100000, 280), width: clamp(object?.width, 60, 500, 100), height: clamp(object?.height, 100, 700, 150),
            label: String(object?.label || 'Actor').slice(0, 180), stroke: safeColor(object?.stroke, '#334155'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 3)
        };
        if (normalizedType === 'uml-usecase') return { ...common,
            x: clamp(object?.x, -100000, 100000, 500), y: clamp(object?.y, -100000, 100000, 280), width: clamp(object?.width, 100, 1400, 240), height: clamp(object?.height, 60, 900, 110),
            label: String(object?.label || 'Use case').slice(0, 320), fill: safeColor(object?.fill, '#f8fafc'), stroke: safeColor(object?.stroke, '#475569'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2.5)
        };
        if (normalizedType === 'uml-package') return { ...common,
            x: clamp(object?.x, -100000, 100000, 560), y: clamp(object?.y, -100000, 100000, 370), width: clamp(object?.width, 160, 2200, 620), height: clamp(object?.height, 120, 1600, 430),
            label: String(object?.label || 'Package').slice(0, 240), fill: safeColor(object?.fill, '#f8fafc'), stroke: safeColor(object?.stroke, '#64748b'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2), dashed: Boolean(object?.dashed)
        };
        if (normalizedType === 'uml-note') return { ...common,
            x: clamp(object?.x, -100000, 100000, 780), y: clamp(object?.y, -100000, 100000, 180), width: clamp(object?.width, 100, 1400, 260), height: clamp(object?.height, 70, 1000, 130),
            text: String(object?.text || 'Design note').slice(0, 4000), fill: safeColor(object?.fill, '#fef9c3'), stroke: safeColor(object?.stroke, '#ca8a04'), textColor: safeColor(object?.textColor, '#713f12'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2)
        };
        if (normalizedType === 'uml-relation') {
            const kinds = new Set(['association', 'dependency', 'generalization', 'realization', 'aggregation', 'composition']);
            return { ...common,
                sourceId: String(object?.sourceId || '').slice(0, 100), targetId: String(object?.targetId || '').slice(0, 100), sourcePort: normalizeUmlPort(object?.sourcePort, 'e'), targetPort: normalizeUmlPort(object?.targetPort, 'w'),
                relationType: kinds.has(String(object?.relationType || 'association')) ? String(object.relationType) : 'association', label: String(object?.label || '').slice(0, 240), sourceMultiplicity: String(object?.sourceMultiplicity || '').slice(0, 80), targetMultiplicity: String(object?.targetMultiplicity || '').slice(0, 80),
                stroke: safeColor(object?.stroke, '#334155'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2.5), autoRoute: object?.autoRoute !== false
            };
        }
        return { ...common, x: clamp(object?.x, -100000, 100000, 60), y: clamp(object?.y, -100000, 100000, 60), text: String(object?.text || 'Annotation').slice(0, 4000), color: safeColor(object?.color, '#0f172a'), fontSize: clamp(object?.fontSize, 8, 120, 20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }


    function normalizeSequenceObject(object, index) {
        const type = String(object?.type || 'seq-lifeline');
        const supported = new Set(['seq-lifeline', 'seq-message', 'seq-activation', 'seq-fragment', 'seq-note', 'text']);
        const normalizedType = supported.has(type) ? type : 'seq-lifeline';
        const common = { id: String(object?.id || `uml-sequence-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'seq-lifeline') {
            const roles = new Set(['actor', 'object', 'boundary', 'control', 'entity', 'database']);
            return { ...common,
                roleType: roles.has(String(object?.roleType || 'object')) ? String(object.roleType) : 'object',
                x: clamp(object?.x, -100000, 100000, 260), y: clamp(object?.y, -100000, 100000, 80), width: clamp(object?.width, 80, 500, 150), height: clamp(object?.height, 44, 260, 64), bottom: clamp(object?.bottom, 120, 5000, 700),
                name: String(object?.name || 'Object').slice(0, 180), className: String(object?.className || 'Class').slice(0, 180),
                fill: safeColor(object?.fill, '#eff6ff'), stroke: safeColor(object?.stroke, '#1d4ed8'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2.2)
            };
        }
        if (normalizedType === 'seq-message') {
            const kinds = new Set(['sync', 'async', 'return', 'create', 'destroy', 'self']);
            return { ...common,
                sourceId: String(object?.sourceId || '').slice(0, 100), targetId: String(object?.targetId || '').slice(0, 100), y: clamp(object?.y, -100000, 100000, 190),
                messageType: kinds.has(String(object?.messageType || 'sync')) ? String(object.messageType) : 'sync', label: String(object?.label || 'message()').slice(0, 300), number: String(object?.number || '').slice(0, 40),
                stroke: safeColor(object?.stroke, '#0f172a'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2.2)
            };
        }
        if (normalizedType === 'seq-activation') return { ...common,
            lifelineId: String(object?.lifelineId || '').slice(0, 100), y: clamp(object?.y, -100000, 100000, 210), height: clamp(object?.height, 20, 2000, 130), width: clamp(object?.width, 8, 80, 16),
            fill: safeColor(object?.fill, '#dbeafe'), stroke: safeColor(object?.stroke, '#2563eb'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 1.8)
        };
        if (normalizedType === 'seq-fragment') {
            const operators = new Set(['alt', 'opt', 'loop', 'par', 'critical', 'ref']);
            return { ...common,
                x: clamp(object?.x, -100000, 100000, 130), y: clamp(object?.y, -100000, 100000, 180), width: clamp(object?.width, 160, 2200, 900), height: clamp(object?.height, 100, 1800, 330),
                operator: operators.has(String(object?.operator || 'alt')) ? String(object.operator) : 'alt', guard: String(object?.guard || '').slice(0, 300), clauses: Array.isArray(object?.clauses) ? object.clauses.slice(0, 20).map((value) => String(value ?? '').slice(0, 300)) : [],
                fill: safeColor(object?.fill, '#ffffff'), stroke: safeColor(object?.stroke, '#475569'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2)
            };
        }
        if (normalizedType === 'seq-note') return { ...common,
            x: clamp(object?.x, -100000, 100000, 800), y: clamp(object?.y, -100000, 100000, 150), width: clamp(object?.width, 100, 1400, 230), height: clamp(object?.height, 70, 1000, 105), text: String(object?.text || 'Interaction note').slice(0, 4000),
            fill: safeColor(object?.fill, '#fef9c3'), stroke: safeColor(object?.stroke, '#ca8a04'), textColor: safeColor(object?.textColor, '#713f12'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2)
        };
        return { ...common, x: clamp(object?.x, -100000, 100000, 60), y: clamp(object?.y, -100000, 100000, 60), text: String(object?.text || 'Annotation').slice(0, 4000), color: safeColor(object?.color, '#0f172a'), fontSize: clamp(object?.fontSize, 8, 120, 20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }



    function normalizeActivityPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n', 'e', 's', 'w'].includes(key) ? key : fallback;
    }

    function normalizeActivityObject(object, index) {
        const type = String(object?.type || 'activity-node');
        const supported = new Set(['activity-node', 'activity-flow', 'activity-swimlane', 'activity-note', 'text']);
        const normalizedType = supported.has(type) ? type : 'activity-node';
        const common = { id: String(object?.id || `uml-activity-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'activity-node') {
            const kinds = new Set(['action','initial','final','decision','merge','fork','join','object','signal-send','signal-receive','bpmn-task','bpmn-start','bpmn-end','bpmn-gateway']);
            return { ...common,
                nodeKind: kinds.has(String(object?.nodeKind || 'action')) ? String(object.nodeKind) : 'action',
                x: clamp(object?.x, -100000, 100000, 180), y: clamp(object?.y, -100000, 100000, 120),
                width: clamp(object?.width, 18, 1600, 170), height: clamp(object?.height, 18, 1200, 70),
                label: String(object?.label || '').slice(0, 300), secondary: String(object?.secondary || '').slice(0, 300),
                fill: safeColor(object?.fill, '#eff6ff'), stroke: safeColor(object?.stroke, '#2563eb'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2.4)
            };
        }
        if (normalizedType === 'activity-flow') {
            const kinds = new Set(['control','object','message','association']);
            return { ...common,
                sourceId: String(object?.sourceId || '').slice(0, 100), targetId: String(object?.targetId || '').slice(0, 100),
                sourcePort: normalizeActivityPort(object?.sourcePort, 'e'), targetPort: normalizeActivityPort(object?.targetPort, 'w'),
                flowType: kinds.has(String(object?.flowType || 'control')) ? String(object.flowType) : 'control',
                label: String(object?.label || '').slice(0, 240), guard: String(object?.guard || '').slice(0, 240),
                stroke: safeColor(object?.stroke, '#334155'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2.4), autoRoute: object?.autoRoute !== false
            };
        }
        if (normalizedType === 'activity-swimlane') return { ...common,
            x: clamp(object?.x, -100000, 100000, 70), y: clamp(object?.y, -100000, 100000, 70), width: clamp(object?.width, 260, 2200, 1040), height: clamp(object?.height, 180, 1600, 570),
            title: String(object?.title || 'Process').slice(0, 240), orientation: String(object?.orientation || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
            laneLabels: Array.isArray(object?.laneLabels) ? object.laneLabels.slice(0, 12).map((v)=>String(v??'').slice(0,160)) : ['Lane 1','Lane 2'],
            headerSize: clamp(object?.headerSize, 24, 160, 48), fill: safeColor(object?.fill, '#ffffff'), stroke: safeColor(object?.stroke, '#64748b'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2)
        };
        if (normalizedType === 'activity-note') return { ...common,
            x: clamp(object?.x, -100000, 100000, 830), y: clamp(object?.y, -100000, 100000, 110), width: clamp(object?.width, 100, 1400, 240), height: clamp(object?.height, 70, 1000, 120),
            text: String(object?.text || 'Workflow note').slice(0, 4000), fill: safeColor(object?.fill, '#fef9c3'), stroke: safeColor(object?.stroke, '#ca8a04'), textColor: safeColor(object?.textColor, '#713f12'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2)
        };
        return { ...common, x: clamp(object?.x, -100000, 100000, 60), y: clamp(object?.y, -100000, 100000, 60), text: String(object?.text || 'Annotation').slice(0, 4000), color: safeColor(object?.color, '#0f172a'), fontSize: clamp(object?.fontSize, 8, 120, 20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }


    function normalizeDeploymentPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n', 'e', 's', 'w'].includes(key) ? key : fallback;
    }

    function normalizeDeploymentObject(object, index) {
        const type = String(object?.type || 'deployment-node');
        const supported = new Set(['deployment-node', 'deployment-link', 'deployment-zone', 'deployment-note', 'text']);
        const normalizedType = supported.has(type) ? type : 'deployment-node';
        const common = { id: String(object?.id || `cloud-deployment-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'deployment-node') {
            const kinds = new Set(['user','device','server','execution','container','service','artifact','database','cloud','load-balancer','queue','storage','firewall','cluster']);
            return { ...common,
                nodeKind: kinds.has(String(object?.nodeKind || 'server')) ? String(object.nodeKind) : 'server',
                x: clamp(object?.x, -100000, 100000, 180), y: clamp(object?.y, -100000, 100000, 120),
                width: clamp(object?.width, 40, 1600, 180), height: clamp(object?.height, 36, 1200, 96),
                label: String(object?.label || '').slice(0, 300), secondary: String(object?.secondary || '').slice(0, 300),
                fill: safeColor(object?.fill, '#eff6ff'), stroke: safeColor(object?.stroke, '#2563eb'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2.4)
            };
        }
        if (normalizedType === 'deployment-link') {
            const kinds = new Set(['network','dependency','deployment','data','sync','async']);
            return { ...common,
                sourceId: String(object?.sourceId || '').slice(0, 100), targetId: String(object?.targetId || '').slice(0, 100),
                sourcePort: normalizeDeploymentPort(object?.sourcePort, 'e'), targetPort: normalizeDeploymentPort(object?.targetPort, 'w'),
                linkType: kinds.has(String(object?.linkType || 'network')) ? String(object.linkType) : 'network',
                label: String(object?.label || '').slice(0, 240), guard: String(object?.guard || '').slice(0, 240),
                stroke: safeColor(object?.stroke, '#334155'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2.4), autoRoute: object?.autoRoute !== false
            };
        }
        if (normalizedType === 'deployment-zone') return { ...common,
            x: clamp(object?.x, -100000, 100000, 60), y: clamp(object?.y, -100000, 100000, 60), width: clamp(object?.width, 260, 2200, 1060), height: clamp(object?.height, 180, 1600, 585),
            title: String(object?.title || 'Deployment zone').slice(0, 240), orientation: String(object?.orientation || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
            zoneLabels: Array.isArray(object?.zoneLabels) ? object.zoneLabels.slice(0, 12).map((v)=>String(v??'').slice(0,160)) : ['Public subnet','Application subnet','Data subnet'],
            headerSize: clamp(object?.headerSize, 24, 160, 48), fill: safeColor(object?.fill, '#ffffff'), stroke: safeColor(object?.stroke, '#64748b'), textColor: safeColor(object?.textColor, '#0f172a'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2)
        };
        if (normalizedType === 'deployment-note') return { ...common,
            x: clamp(object?.x, -100000, 100000, 830), y: clamp(object?.y, -100000, 100000, 110), width: clamp(object?.width, 100, 1400, 240), height: clamp(object?.height, 70, 1000, 120),
            text: String(object?.text || 'Infrastructure note').slice(0, 4000), fill: safeColor(object?.fill, '#fef9c3'), stroke: safeColor(object?.stroke, '#ca8a04'), textColor: safeColor(object?.textColor, '#713f12'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2)
        };
        return { ...common, x: clamp(object?.x, -100000, 100000, 60), y: clamp(object?.y, -100000, 100000, 60), text: String(object?.text || 'Annotation').slice(0, 4000), color: safeColor(object?.color, '#0f172a'), fontSize: clamp(object?.fontSize, 8, 120, 20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }


    function normalizeChemicalPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizeChemicalObject(object, index) {
        const type = String(object?.type || 'chemical-atom');
        const supported = new Set(['chemical-atom','chemical-bond','chemical-ring','chemical-reaction-arrow','chemical-curved-arrow','chemical-bracket','text']);
        const normalizedType = supported.has(type) ? type : 'chemical-atom';
        const common = { id: String(object?.id || `chemical-structure-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'chemical-atom') return { ...common,
            x: clamp(object?.x, -100000, 100000, 180), y: clamp(object?.y, -100000, 100000, 140), radius: clamp(object?.radius, 8, 140, 22),
            symbol: String(object?.symbol || 'C').slice(0, 24), label: String(object?.label || '').slice(0, 120), charge: String(object?.charge || '').slice(0, 12), isotope: String(object?.isotope || '').slice(0, 12), hydrogenCount: clamp(object?.hydrogenCount, 0, 20, 0),
            atomStyle: String(object?.atomStyle || 'label') === 'ball' ? 'ball' : 'label', fill: safeColor(object?.fill, '#ffffff'), stroke: safeColor(object?.stroke, '#111827'), textColor: safeColor(object?.textColor, '#111827'), lineWidth: clamp(object?.lineWidth, 0.5, 20, 2.2)
        };
        if (normalizedType === 'chemical-bond') {
            const order = [1,1.5,2,3].includes(Number(object?.bondOrder)) ? Number(object.bondOrder) : 1;
            const style = ['solid','wedge','dash'].includes(String(object?.bondStyle || 'solid')) ? String(object.bondStyle) : 'solid';
            return { ...common, sourceId: String(object?.sourceId || '').slice(0,100), targetId: String(object?.targetId || '').slice(0,100), sourcePort: normalizeChemicalPort(object?.sourcePort,'e'), targetPort: normalizeChemicalPort(object?.targetPort,'w'), bondOrder: order, bondStyle: style, label: String(object?.label || '').slice(0,120), stroke: safeColor(object?.stroke,'#111827'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.6) };
        }
        if (normalizedType === 'chemical-ring') return { ...common, x: clamp(object?.x,-100000,100000,250), y: clamp(object?.y,-100000,100000,210), radius: clamp(object?.radius,20,500,72), sides: Math.round(clamp(object?.sides,3,8,6)), rotation: clamp(object?.rotation,-3600,3600,-90), aromatic: Boolean(object?.aromatic), fill: safeColor(object?.fill,'transparent'), stroke: safeColor(object?.stroke,'#111827'), lineWidth: clamp(object?.lineWidth,0.5,20,2.8) };
        if (normalizedType === 'chemical-reaction-arrow') {
            const arrowType = ['forward','equilibrium','retro'].includes(String(object?.arrowType || 'forward')) ? String(object.arrowType) : 'forward';
            return { ...common, x1: clamp(object?.x1,-100000,100000,380), y1: clamp(object?.y1,-100000,100000,350), x2: clamp(object?.x2,-100000,100000,620), y2: clamp(object?.y2,-100000,100000,350), arrowType, above: String(object?.above || '').slice(0,240), below: String(object?.below || '').slice(0,240), stroke: safeColor(object?.stroke,'#111827'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.8) };
        }
        if (normalizedType === 'chemical-curved-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,330), y1: clamp(object?.y1,-100000,100000,420), cx: clamp(object?.cx,-100000,100000,450), cy: clamp(object?.cy,-100000,100000,310), x2: clamp(object?.x2,-100000,100000,560), y2: clamp(object?.y2,-100000,100000,420), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#7c3aed'), textColor: safeColor(object?.textColor,'#581c87'), lineWidth: clamp(object?.lineWidth,0.5,20,2.6) };
        if (normalizedType === 'chemical-bracket') return { ...common, x: clamp(object?.x,-100000,100000,250), y: clamp(object?.y,-100000,100000,220), width: clamp(object?.width,40,1800,360), height: clamp(object?.height,40,1200,210), label: String(object?.label || '').slice(0,240), subscript: String(object?.subscript || 'n').slice(0,30), stroke: safeColor(object?.stroke,'#111827'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.6) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Chemical formula').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }


    function normalizeBiologyPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizeBiologicalObject(object, index) {
        const type = String(object?.type || 'biological-organelle');
        const supported = new Set(['biological-cell-boundary','biological-organelle','biological-label','biological-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'biological-organelle';
        const common = { id: String(object?.id || `biological-cell-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'biological-cell-boundary') {
            const kind = ['animal','plant','bacterium'].includes(String(object?.kind || 'animal')) ? String(object.kind) : 'animal';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,150), y: clamp(object?.y,-100000,100000,100), width: clamp(object?.width,120,2200,760), height: clamp(object?.height,80,1600,500), label: String(object?.label || 'Cell').slice(0,240), fill: safeColor(object?.fill,'#e0f2fe'), stroke: safeColor(object?.stroke,'#0369a1'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,3) };
        }
        if (normalizedType === 'biological-organelle') {
            const kinds = new Set(['nucleus','mitochondrion','chloroplast','vacuole','golgi','rough-er','smooth-er','ribosome','lysosome','centriole','plasmid','flagellum']);
            const kind = kinds.has(String(object?.kind || 'nucleus')) ? String(object.kind) : 'nucleus';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,360), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,12,1600,140), height: clamp(object?.height,12,1200,90), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#f8fafc'), stroke: safeColor(object?.stroke,'#475569'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), detailCount: Math.round(clamp(object?.detailCount,1,20,4)) };
        }
        if (normalizedType === 'biological-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeBiologyPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,880), y: clamp(object?.y,-100000,100000,200), width: clamp(object?.width,80,1000,190), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Cell part').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'biological-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,300), y1: clamp(object?.y1,-100000,100000,560), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,560), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#2563eb'), textColor: safeColor(object?.textColor,'#1e3a8a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.8), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Biology annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }



    function normalizeAnatomyPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizeHumanAnatomyObject(object, index) {
        const type = String(object?.type || 'anatomy-organ');
        const supported = new Set(['anatomy-body','anatomy-organ','anatomy-label','anatomy-vessel','anatomy-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'anatomy-organ';
        const common = { id: String(object?.id || `human-anatomy-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'anatomy-body') {
            const kind = ['front','back'].includes(String(object?.kind || 'front')) ? String(object.kind) : 'front';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,300), y: clamp(object?.y,-100000,100000,45), width: clamp(object?.width,120,1600,380), height: clamp(object?.height,220,1700,630), label: String(object?.label || 'Human body').slice(0,240), fill: safeColor(object?.fill,'#fff7ed'), stroke: safeColor(object?.stroke,'#475569'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5) };
        }
        if (normalizedType === 'anatomy-organ') {
            const kinds = new Set(['brain','heart','lung','liver','stomach','kidney','intestine','pancreas','bladder','trachea','esophagus','spinal-cord','thyroid','skeleton','bone','joint','diaphragm','gland']);
            const kind = kinds.has(String(object?.kind || 'heart')) ? String(object.kind) : 'heart';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,440), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,12,1600,100), height: clamp(object?.height,12,1400,90), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#f8fafc'), stroke: safeColor(object?.stroke,'#475569'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), detailCount: Math.round(clamp(object?.detailCount,1,20,5)) };
        }
        if (normalizedType === 'anatomy-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeAnatomyPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,830), y: clamp(object?.y,-100000,100000,150), width: clamp(object?.width,80,1000,220), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Body part').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'anatomy-vessel') {
            const kind = ['artery','vein','nerve','duct'].includes(String(object?.kind || 'artery')) ? String(object.kind) : 'artery';
            return { ...common, kind, x1: clamp(object?.x1,-100000,100000,360), y1: clamp(object?.y1,-100000,100000,280), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,280), label: String(object?.label || kind).slice(0,240), stroke: safeColor(object?.stroke,kind==='artery'?'#dc2626':kind==='vein'?'#2563eb':kind==='nerve'?'#eab308':'#16a34a'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,3.5), dashed: Boolean(object?.dashed) };
        }
        if (normalizedType === 'anatomy-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,340), y1: clamp(object?.y1,-100000,100000,610), x2: clamp(object?.x2,-100000,100000,670), y2: clamp(object?.y2,-100000,100000,610), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0f766e'), textColor: safeColor(object?.textColor,'#115e59'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Anatomy annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }



    function normalizeBotanyPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizePlantAnatomyObject(object, index) {
        const type = String(object?.type || 'botany-organ');
        const supported = new Set(['botany-body','botany-organ','botany-label','botany-vessel','botany-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'botany-organ';
        const common = { id: String(object?.id || `plant-anatomy-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'botany-body') {
            const kind = ['whole','root-system'].includes(String(object?.kind || 'whole')) ? String(object.kind) : 'whole';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,280), y: clamp(object?.y,-100000,100000,50), width: clamp(object?.width,150,1600,430), height: clamp(object?.height,220,1700,610), label: String(object?.label || 'Flowering plant').slice(0,240), fill: safeColor(object?.fill,'#f0fdf4'), stroke: safeColor(object?.stroke,'#15803d'), textColor: safeColor(object?.textColor,'#14532d'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5) };
        }
        if (normalizedType === 'botany-organ') {
            const kinds = new Set(['leaf','flower','fruit','seed','root-tip','root-hair','stem-section','leaf-section','flower-section','xylem','phloem','cambium','vascular-bundle','pith','meristem','stomata','guard-cell','anther','filament','stigma','style','ovary','ovule','petal','sepal','radicle','plumule','cotyledon']);
            const kind = kinds.has(String(object?.kind || 'leaf')) ? String(object.kind) : 'leaf';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,440), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,12,1600,120), height: clamp(object?.height,12,1400,90), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#dcfce7'), stroke: safeColor(object?.stroke,'#15803d'), textColor: safeColor(object?.textColor,'#14532d'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), detailCount: Math.round(clamp(object?.detailCount,1,20,6)) };
        }
        if (normalizedType === 'botany-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeBotanyPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,830), y: clamp(object?.y,-100000,100000,150), width: clamp(object?.width,80,1000,220), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Plant structure').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'botany-vessel') {
            const kind = ['xylem-line','phloem-line','transport-line'].includes(String(object?.kind || 'xylem-line')) ? String(object.kind) : 'xylem-line';
            return { ...common, kind, x1: clamp(object?.x1,-100000,100000,360), y1: clamp(object?.y1,-100000,100000,280), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,280), label: String(object?.label || kind.replace('-line','')).slice(0,240), stroke: safeColor(object?.stroke,kind==='xylem-line'?'#0284c7':kind==='phloem-line'?'#ca8a04':'#16a34a'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,3.5), dashed: Boolean(object?.dashed) };
        }
        if (normalizedType === 'botany-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,340), y1: clamp(object?.y1,-100000,100000,610), x2: clamp(object?.x2,-100000,100000,670), y2: clamp(object?.y2,-100000,100000,610), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0f766e'), textColor: safeColor(object?.textColor,'#115e59'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Botanical annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }





    function normalizeEcologyPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizeEcologyObject(object, index) {
        const type = String(object?.type || 'ecology-node');
        const supported = new Set(['ecology-node','ecology-zone','ecology-pyramid','ecology-link','ecology-label','ecology-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'ecology-node';
        const common = { id: String(object?.id || `ecology-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'ecology-node') {
            const kinds = new Set(['sun','producer','primary-consumer','secondary-consumer','tertiary-consumer','decomposer','grass','tree','algae','insect','rabbit','deer','frog','fish','snake','bird','hawk','bacteria','fungi','water','soil','cloud']);
            const kind = kinds.has(String(object?.kind || 'producer')) ? String(object.kind) : 'producer';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,440), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,20,1600,160), height: clamp(object?.height,20,1400,95), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#dcfce7'), stroke: safeColor(object?.stroke,'#166534'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), trophicLevel: Math.round(clamp(object?.trophicLevel,0,20,0)), energy: clamp(object?.energy,-1000000000,1000000000,0), population: clamp(object?.population,-1000000000,1000000000,0) };
        }
        if (normalizedType === 'ecology-zone') return { ...common, x: clamp(object?.x,-100000,100000,180), y: clamp(object?.y,-100000,100000,100), width: clamp(object?.width,100,2200,760), height: clamp(object?.height,100,1700,500), label: String(object?.label || 'Ecosystem').slice(0,240), fill: safeColor(object?.fill,'#f0fdf4'), stroke: safeColor(object?.stroke,'#15803d'), textColor: safeColor(object?.textColor,'#14532d'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), dashed: Boolean(object?.dashed) };
        if (normalizedType === 'ecology-pyramid') {
            const kind = ['energy-pyramid','biomass-pyramid','number-pyramid'].includes(String(object?.kind || 'energy-pyramid')) ? String(object.kind) : 'energy-pyramid';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,320), y: clamp(object?.y,-100000,100000,90), width: clamp(object?.width,180,1800,540), height: clamp(object?.height,180,1600,560), title: String(object?.title || 'Ecological pyramid').slice(0,240), levels: String(object?.levels || 'Tertiary consumers|10\nSecondary consumers|100\nPrimary consumers|1000\nProducers|10000').slice(0,5000), unit: String(object?.unit || '').slice(0,100), fill: safeColor(object?.fill,'#dcfce7'), stroke: safeColor(object?.stroke,'#166534'), textColor: safeColor(object?.textColor,'#14532d'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5) };
        }
        if (normalizedType === 'ecology-link') return { ...common, sourceId: String(object?.sourceId || '').slice(0,100), sourcePort: normalizeEcologyPort(object?.sourcePort,'e'), targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeEcologyPort(object?.targetPort,'w'), x1: clamp(object?.x1,-100000,100000,300), y1: clamp(object?.y1,-100000,100000,300), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,300), kind: ['feeding','material-cycle','interaction'].includes(String(object?.kind || 'feeding')) ? String(object.kind) : 'feeding', label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0f766e'), textColor: safeColor(object?.textColor,'#115e59'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed), showArrow: object?.showArrow !== false, energy: clamp(object?.energy,-1000000000,1000000000,0) };
        if (normalizedType === 'ecology-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeEcologyPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,850), y: clamp(object?.y,-100000,100000,150), width: clamp(object?.width,80,1000,230), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Ecological component').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'ecology-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,340), y1: clamp(object?.y1,-100000,100000,610), x2: clamp(object?.x2,-100000,100000,670), y2: clamp(object?.y2,-100000,100000,610), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0f766e'), textColor: safeColor(object?.textColor,'#115e59'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Ecology annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }


    function normalizeWeatherPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }
    function normalizeWeatherObject(object, index) {
        const type = String(object?.type || 'weather-node');
        const supported = new Set(['weather-node','weather-zone','weather-chart','weather-link','weather-label','weather-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'weather-node';
        const common = { id: String(object?.id || `weather-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'weather-node') {
            const kinds = new Set(['sun','cloud','rain-cloud','thunderstorm','snow-cloud','wind','high-pressure','low-pressure','warm-front','cold-front','occluded-front','stationary-front','isobar','cyclone','anticyclone','thermometer','hygrometer','anemometer','rain-gauge','weather-station','mountain','sea','land','atmospheric-layer']);
            const kind = kinds.has(String(object?.kind || 'cloud')) ? String(object.kind) : 'cloud';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,440), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,20,1600,170), height: clamp(object?.height,20,1400,100), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#dbeafe'), stroke: safeColor(object?.stroke,'#2563eb'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), level: Math.round(clamp(object?.level,0,20,0)), value: clamp(object?.value,-1000000000,1000000000,0), secondaryValue: clamp(object?.secondaryValue,-1000000000,1000000000,0) };
        }
        if (normalizedType === 'weather-zone') return { ...common, x: clamp(object?.x,-100000,100000,180), y: clamp(object?.y,-100000,100000,100), width: clamp(object?.width,100,2200,760), height: clamp(object?.height,100,1700,500), label: String(object?.label || 'Weather region').slice(0,240), fill: safeColor(object?.fill,'#eff6ff'), stroke: safeColor(object?.stroke,'#2563eb'), textColor: safeColor(object?.textColor,'#1e3a8a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), dashed: Boolean(object?.dashed) };
        if (normalizedType === 'weather-chart') {
            const kind = ['climate-graph','station-model','atmospheric-profile'].includes(String(object?.kind || 'climate-graph')) ? String(object.kind) : 'climate-graph';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,320), y: clamp(object?.y,-100000,100000,90), width: clamp(object?.width,180,1800,540), height: clamp(object?.height,180,1600,560), title: String(object?.title || 'Weather chart').slice(0,240), levels: String(object?.levels || '').slice(0,5000), unit: String(object?.unit || '').slice(0,100), fill: safeColor(object?.fill,'#dbeafe'), stroke: safeColor(object?.stroke,'#2563eb'), textColor: safeColor(object?.textColor,'#1e3a8a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5) };
        }
        if (normalizedType === 'weather-link') return { ...common, sourceId: String(object?.sourceId || '').slice(0,100), sourcePort: normalizeWeatherPort(object?.sourcePort,'e'), targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeWeatherPort(object?.targetPort,'w'), x1: clamp(object?.x1,-100000,100000,300), y1: clamp(object?.y1,-100000,100000,300), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,300), kind: ['airflow','moisture','radiation','front'].includes(String(object?.kind || 'airflow')) ? String(object.kind) : 'airflow', label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0284c7'), textColor: safeColor(object?.textColor,'#075985'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed), showArrow: object?.showArrow !== false, value: clamp(object?.value,-1000000000,1000000000,0) };
        if (normalizedType === 'weather-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeWeatherPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,850), y: clamp(object?.y,-100000,100000,150), width: clamp(object?.width,80,1000,230), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Weather feature').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'weather-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,340), y1: clamp(object?.y1,-100000,100000,610), x2: clamp(object?.x2,-100000,100000,670), y2: clamp(object?.y2,-100000,100000,610), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0284c7'), textColor: safeColor(object?.textColor,'#075985'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Weather annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }

    function normalizeHydrologyPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizeHydrologyObject(object, index) {
        const type = String(object?.type || 'hydrology-node');
        const supported = new Set(['hydrology-node','hydrology-zone','hydrology-pyramid','hydrology-link','hydrology-label','hydrology-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'hydrology-node';
        const common = { id: String(object?.id || `hydrology-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'hydrology-node') {
            const kinds = new Set(['rainfall','river','tributary','lake','reservoir','dam','watershed','catchment','spring','groundwater','aquifer','water-table','well','infiltration','runoff','evaporation','transpiration','wetland','floodplain','meander','delta','levee','irrigation-canal','urban-drain','soil-layer','impermeable-layer']);
            const kind = kinds.has(String(object?.kind || 'river')) ? String(object.kind) : 'river';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,440), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,20,1600,160), height: clamp(object?.height,20,1400,95), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#dcfce7'), stroke: safeColor(object?.stroke,'#166534'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), trophicLevel: Math.round(clamp(object?.trophicLevel,0,20,0)), energy: clamp(object?.energy,-1000000000,1000000000,0), population: clamp(object?.population,-1000000000,1000000000,0) };
        }
        if (normalizedType === 'hydrology-zone') return { ...common, x: clamp(object?.x,-100000,100000,180), y: clamp(object?.y,-100000,100000,100), width: clamp(object?.width,100,2200,760), height: clamp(object?.height,100,1700,500), label: String(object?.label || 'River basin / hydrological zone').slice(0,240), fill: safeColor(object?.fill,'#f8fafc'), stroke: safeColor(object?.stroke,'#475569'), textColor: safeColor(object?.textColor,'#1e293b'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), dashed: Boolean(object?.dashed) };
        if (normalizedType === 'hydrology-pyramid') {
            const kind = ['hydrograph','water-balance-chart','river-profile'].includes(String(object?.kind || 'hydrograph')) ? String(object.kind) : 'hydrograph';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,320), y: clamp(object?.y,-100000,100000,90), width: clamp(object?.width,180,1800,540), height: clamp(object?.height,180,1600,560), title: String(object?.title || 'Hydrology chart').slice(0,240), levels: String(object?.levels || '0 h|20\n2 h|35\n4 h|80\n6 h|120\n8 h|90\n10 h|55').slice(0,5000), unit: String(object?.unit || '').slice(0,100), fill: safeColor(object?.fill,'#dcfce7'), stroke: safeColor(object?.stroke,'#166534'), textColor: safeColor(object?.textColor,'#1e293b'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5) };
        }
        if (normalizedType === 'hydrology-link') return { ...common, sourceId: String(object?.sourceId || '').slice(0,100), sourcePort: normalizeHydrologyPort(object?.sourcePort,'e'), targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeHydrologyPort(object?.targetPort,'w'), x1: clamp(object?.x1,-100000,100000,300), y1: clamp(object?.y1,-100000,100000,300), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,300), kind: ['surface-flow','groundwater-flow','water-transfer'].includes(String(object?.kind || 'surface-flow')) ? String(object.kind) : 'surface-flow', label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0f766e'), textColor: safeColor(object?.textColor,'#115e59'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed), showArrow: object?.showArrow !== false, energy: clamp(object?.energy,-1000000000,1000000000,0) };
        if (normalizedType === 'hydrology-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeHydrologyPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,850), y: clamp(object?.y,-100000,100000,150), width: clamp(object?.width,80,1000,230), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Hydrological feature').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'hydrology-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,340), y1: clamp(object?.y1,-100000,100000,610), x2: clamp(object?.x2,-100000,100000,670), y2: clamp(object?.y2,-100000,100000,610), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0f766e'), textColor: safeColor(object?.textColor,'#115e59'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Hydrology annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }


    function normalizeOceanographyPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizeOceanographyObject(object, index) {
        const type = String(object?.type || 'oceanography-node');
        const supported = new Set(['oceanography-node','oceanography-zone','oceanography-pyramid','oceanography-link','oceanography-label','oceanography-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'oceanography-node';
        const common = { id: String(object?.id || `oceanography-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'oceanography-node') {
            const kinds = new Set(['ocean','coastline','beach','sea-cliff','wave','tide','surface-current','deep-current','gyre','upwelling','downwelling','coral-reef','mangrove','estuary','lagoon','continental-shelf','continental-slope','abyssal-plain','mid-ocean-ridge','ocean-trench','seamount','submarine-canyon','mixed-layer','thermocline','halocline','research-vessel','buoy']);
            const kind = kinds.has(String(object?.kind || 'ocean')) ? String(object.kind) : 'ocean';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,440), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,20,1600,180), height: clamp(object?.height,20,1400,110), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#dbeafe'), stroke: safeColor(object?.stroke,'#0369a1'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), trophicLevel: Math.round(clamp(object?.trophicLevel,0,20,0)), energy: clamp(object?.energy,-1000000000,1000000000,0), population: clamp(object?.population,-1000000000,1000000000,0) };
        }
        if (normalizedType === 'oceanography-zone') return { ...common, x: clamp(object?.x,-100000,100000,180), y: clamp(object?.y,-100000,100000,100), width: clamp(object?.width,100,2200,760), height: clamp(object?.height,100,1700,500), label: String(object?.label || 'Ocean basin / marine zone').slice(0,240), fill: safeColor(object?.fill,'#eff6ff'), stroke: safeColor(object?.stroke,'#0369a1'), textColor: safeColor(object?.textColor,'#075985'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), dashed: Boolean(object?.dashed) };
        if (normalizedType === 'oceanography-pyramid') {
            const kind = ['wave-profile','tide-graph','depth-profile'].includes(String(object?.kind || 'wave-profile')) ? String(object.kind) : 'wave-profile';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,320), y: clamp(object?.y,-100000,100000,90), width: clamp(object?.width,180,1800,540), height: clamp(object?.height,180,1600,560), title: String(object?.title || 'Oceanography chart').slice(0,240), levels: String(object?.levels || '0|0\n20|2.5\n40|5\n60|2.5\n80|0').slice(0,5000), unit: String(object?.unit || '').slice(0,100), fill: safeColor(object?.fill,'#dbeafe'), stroke: safeColor(object?.stroke,'#0369a1'), textColor: safeColor(object?.textColor,'#0c4a6e'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5) };
        }
        if (normalizedType === 'oceanography-link') return { ...common, sourceId: String(object?.sourceId || '').slice(0,100), sourcePort: normalizeOceanographyPort(object?.sourcePort,'e'), targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeOceanographyPort(object?.targetPort,'w'), x1: clamp(object?.x1,-100000,100000,300), y1: clamp(object?.y1,-100000,100000,300), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,300), kind: ['surface-current','deep-current','thermohaline','wave-energy','upwelling'].includes(String(object?.kind || 'surface-current')) ? String(object.kind) : 'surface-current', label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0284c7'), textColor: safeColor(object?.textColor,'#075985'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed), showArrow: object?.showArrow !== false, energy: clamp(object?.energy,-1000000000,1000000000,0) };
        if (normalizedType === 'oceanography-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeOceanographyPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,850), y: clamp(object?.y,-100000,100000,150), width: clamp(object?.width,80,1000,230), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Marine feature').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'oceanography-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,340), y1: clamp(object?.y1,-100000,100000,610), x2: clamp(object?.x2,-100000,100000,670), y2: clamp(object?.y2,-100000,100000,610), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0284c7'), textColor: safeColor(object?.textColor,'#075985'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Oceanography annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }


    function normalizeEnvironmentalPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizeEnvironmentalObject(object, index) {
        const type = String(object?.type || 'environmental-node');
        const supported = new Set(['environmental-node','environmental-zone','environmental-pyramid','environmental-link','environmental-label','environmental-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'environmental-node';
        const common = { id: String(object?.id || `environmental-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'environmental-node') {
            const kinds = new Set(['factory','vehicle','power-plant','chimney','sewage-outfall','landfill','incinerator','recycling-bin','compost','wastewater-plant','scrubber','catalytic-converter','solar-panel','wind-turbine','tree','wetland','river','city','farm','monitoring-station','air-pollution','water-pollution','soil-pollution','noise-pollution','greenhouse-gas','acid-rain','plastic-waste']);
            const kind = kinds.has(String(object?.kind || 'factory')) ? String(object.kind) : 'factory';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,440), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,20,1600,180), height: clamp(object?.height,20,1400,110), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#f8fafc'), stroke: safeColor(object?.stroke,'#475569'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), trophicLevel: Math.round(clamp(object?.trophicLevel,0,20,0)), energy: clamp(object?.energy,-1000000000,1000000000,0), population: clamp(object?.population,-1000000000,1000000000,0) };
        }
        if (normalizedType === 'environmental-zone') return { ...common, x: clamp(object?.x,-100000,100000,180), y: clamp(object?.y,-100000,100000,100), width: clamp(object?.width,100,2200,760), height: clamp(object?.height,100,1700,500), label: String(object?.label || 'Environmental impact zone').slice(0,240), fill: safeColor(object?.fill,'#f8fafc'), stroke: safeColor(object?.stroke,'#475569'), textColor: safeColor(object?.textColor,'#1e293b'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), dashed: Boolean(object?.dashed) };
        if (normalizedType === 'environmental-pyramid') {
            const kind = ['waste-hierarchy','emission-chart','impact-matrix'].includes(String(object?.kind || 'waste-hierarchy')) ? String(object.kind) : 'waste-hierarchy';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,320), y: clamp(object?.y,-100000,100000,90), width: clamp(object?.width,180,1800,540), height: clamp(object?.height,180,1600,560), title: String(object?.title || 'Environmental chart').slice(0,240), levels: String(object?.levels || '').slice(0,5000), unit: String(object?.unit || '').slice(0,100), fill: safeColor(object?.fill,'#dcfce7'), stroke: safeColor(object?.stroke,'#15803d'), textColor: safeColor(object?.textColor,'#14532d'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5) };
        }
        if (normalizedType === 'environmental-link') return { ...common, sourceId: String(object?.sourceId || '').slice(0,100), sourcePort: normalizeEnvironmentalPort(object?.sourcePort,'e'), targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeEnvironmentalPort(object?.targetPort,'w'), x1: clamp(object?.x1,-100000,100000,300), y1: clamp(object?.y1,-100000,100000,300), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,300), kind: ['pollutant-pathway','treated-flow','resource-recovery','mitigation','radiative-forcing','clean-energy'].includes(String(object?.kind || 'pollutant-pathway')) ? String(object.kind) : 'pollutant-pathway', label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#dc2626'), textColor: safeColor(object?.textColor,'#991b1b'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed), showArrow: object?.showArrow !== false, energy: clamp(object?.energy,-1000000000,1000000000,0) };
        if (normalizedType === 'environmental-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeEnvironmentalPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,850), y: clamp(object?.y,-100000,100000,150), width: clamp(object?.width,80,1000,230), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Environmental feature').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'environmental-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,340), y1: clamp(object?.y1,-100000,100000,610), x2: clamp(object?.x2,-100000,100000,670), y2: clamp(object?.y2,-100000,100000,610), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#15803d'), textColor: safeColor(object?.textColor,'#14532d'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Environmental science annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }

    function normalizeGeologyPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizeGeologyObject(object, index) {
        const type = String(object?.type || 'geology-node');
        const supported = new Set(['geology-node','geology-zone','geology-pyramid','geology-link','geology-label','geology-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'geology-node';
        const common = { id: String(object?.id || `geology-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'geology-node') {
            const kinds = new Set(['earth','crust','mantle','outer-core','inner-core','tectonic-plate','divergent-boundary','convergent-boundary','transform-boundary','volcano','magma-chamber','lava','mountain','river','groundwater','sediment','igneous-rock','sedimentary-rock','metamorphic-rock','mineral','fossil','fault','fold','earthquake-focus','epicenter','rock-layer','unconformity']);
            const kind = kinds.has(String(object?.kind || 'igneous-rock')) ? String(object.kind) : 'igneous-rock';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,440), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,20,1600,160), height: clamp(object?.height,20,1400,95), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#dcfce7'), stroke: safeColor(object?.stroke,'#166534'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), trophicLevel: Math.round(clamp(object?.trophicLevel,0,20,0)), energy: clamp(object?.energy,-1000000000,1000000000,0), population: clamp(object?.population,-1000000000,1000000000,0) };
        }
        if (normalizedType === 'geology-zone') return { ...common, x: clamp(object?.x,-100000,100000,180), y: clamp(object?.y,-100000,100000,100), width: clamp(object?.width,100,2200,760), height: clamp(object?.height,100,1700,500), label: String(object?.label || 'Geological cross-section').slice(0,240), fill: safeColor(object?.fill,'#f8fafc'), stroke: safeColor(object?.stroke,'#475569'), textColor: safeColor(object?.textColor,'#1e293b'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), dashed: Boolean(object?.dashed) };
        if (normalizedType === 'geology-pyramid') {
            const kind = ['stratigraphic-column','geologic-time-column','rock-cycle-column'].includes(String(object?.kind || 'stratigraphic-column')) ? String(object.kind) : 'stratigraphic-column';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,320), y: clamp(object?.y,-100000,100000,90), width: clamp(object?.width,180,1800,540), height: clamp(object?.height,180,1600,560), title: String(object?.title || 'Geological column').slice(0,240), levels: String(object?.levels || 'Topsoil|0-2 m\nSandstone|2-12 m\nShale|12-24 m\nLimestone|24-40 m\nBasement rock|40 m+').slice(0,5000), unit: String(object?.unit || '').slice(0,100), fill: safeColor(object?.fill,'#dcfce7'), stroke: safeColor(object?.stroke,'#166534'), textColor: safeColor(object?.textColor,'#1e293b'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5) };
        }
        if (normalizedType === 'geology-link') return { ...common, sourceId: String(object?.sourceId || '').slice(0,100), sourcePort: normalizeGeologyPort(object?.sourcePort,'e'), targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeGeologyPort(object?.targetPort,'w'), x1: clamp(object?.x1,-100000,100000,300), y1: clamp(object?.y1,-100000,100000,300), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,300), kind: ['process','material-cycle','structural'].includes(String(object?.kind || 'process')) ? String(object.kind) : 'process', label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0f766e'), textColor: safeColor(object?.textColor,'#115e59'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed), showArrow: object?.showArrow !== false, energy: clamp(object?.energy,-1000000000,1000000000,0) };
        if (normalizedType === 'geology-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeGeologyPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,850), y: clamp(object?.y,-100000,100000,150), width: clamp(object?.width,80,1000,230), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Geological feature').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'geology-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,340), y1: clamp(object?.y1,-100000,100000,610), x2: clamp(object?.x2,-100000,100000,670), y2: clamp(object?.y2,-100000,100000,610), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0f766e'), textColor: safeColor(object?.textColor,'#115e59'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Geology annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }

    function normalizeGeneticsPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizeGeneticsObject(object, index) {
        const type = String(object?.type || 'genetics-component');
        const supported = new Set(['genetics-structure','genetics-component','genetics-label','genetics-line','genetics-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'genetics-component';
        const common = { id: String(object?.id || `genetics-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'genetics-structure') {
            const kind = ['dna-helix','chromosome'].includes(String(object?.kind || 'dna-helix')) ? String(object.kind) : 'dna-helix';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,360), y: clamp(object?.y,-100000,100000,70), width: clamp(object?.width,100,1600,360), height: clamp(object?.height,140,1700,520), label: String(object?.label || (kind === 'chromosome' ? 'Chromosome' : 'DNA double helix')).slice(0,240), fill: safeColor(object?.fill,kind==='chromosome'?'#ede9fe':'#dbeafe'), stroke: safeColor(object?.stroke,kind==='chromosome'?'#7c3aed':'#2563eb'), textColor: safeColor(object?.textColor,'#1e1b4b'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), detailCount: Math.round(clamp(object?.detailCount,3,30,kind==='chromosome'?8:12)) };
        }
        if (normalizedType === 'genetics-component') {
            const kinds = new Set(['homologous-pair','chromatid','centromere','gene-segment','nucleotide','base-pair','replication-fork','mrna','ribosome','protein-chain','punnett-square','cell-nucleus','spindle','crossing-over','allele']);
            const kind = kinds.has(String(object?.kind || 'gene-segment')) ? String(object.kind) : 'gene-segment';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,440), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,12,1800,180), height: clamp(object?.height,12,1600,100), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#f8fafc'), stroke: safeColor(object?.stroke,'#475569'), textColor: safeColor(object?.textColor,'#1e293b'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), detailCount: Math.round(clamp(object?.detailCount,1,20,6)), sequence: String(object?.sequence || '').slice(0,2000), parentA: String(object?.parentA || 'A,a').slice(0,200), parentB: String(object?.parentB || 'A,a').slice(0,200) };
        }
        if (normalizedType === 'genetics-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeGeneticsPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,830), y: clamp(object?.y,-100000,100000,150), width: clamp(object?.width,80,1000,220), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Genetic element').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'genetics-line') {
            const kind = ['gene-bracket','strand-line','chromosome-link'].includes(String(object?.kind || 'gene-bracket')) ? String(object.kind) : 'gene-bracket';
            return { ...common, kind, x1: clamp(object?.x1,-100000,100000,360), y1: clamp(object?.y1,-100000,100000,280), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,280), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), stroke: safeColor(object?.stroke,kind==='gene-bracket'?'#16a34a':kind==='strand-line'?'#2563eb':'#7c3aed'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        }
        if (normalizedType === 'genetics-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,340), y1: clamp(object?.y1,-100000,100000,610), x2: clamp(object?.x2,-100000,100000,670), y2: clamp(object?.y2,-100000,100000,610), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#0f766e'), textColor: safeColor(object?.textColor,'#115e59'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Genetics annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }


    function normalizeAstronomyPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizeAstronomyObject(object, index) {
        const type = String(object?.type || 'astronomy-body');
        const supported = new Set(['astronomy-body','astronomy-region','astronomy-chart','astronomy-link','astronomy-label','astronomy-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'astronomy-body';
        const common = { id: String(object?.id || `astronomy-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'astronomy-body') {
            const kinds = new Set(['sun','mercury','venus','earth','moon','mars','jupiter','saturn','uranus','neptune','dwarf-planet','star','binary-star','comet','asteroid','asteroid-belt','galaxy','nebula','black-hole','satellite','rocket','telescope','orbit','constellation']);
            const kind = kinds.has(String(object?.kind || 'earth')) ? String(object.kind) : 'earth';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,440), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,20,1800,150), height: clamp(object?.height,20,1600,100), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#eef2ff'), stroke: safeColor(object?.stroke,'#4f46e5'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), level: Math.round(clamp(object?.level,-1000,1000,0)), value: clamp(object?.value,-1000000000,1000000000,0), secondaryValue: clamp(object?.secondaryValue,-1000000000,1000000000,0) };
        }
        if (normalizedType === 'astronomy-region') return { ...common, x: clamp(object?.x,-100000,100000,180), y: clamp(object?.y,-100000,100000,100), width: clamp(object?.width,100,2200,760), height: clamp(object?.height,100,1700,500), label: String(object?.label || 'Space region').slice(0,240), fill: safeColor(object?.fill,'#eff6ff'), stroke: safeColor(object?.stroke,'#4f46e5'), textColor: safeColor(object?.textColor,'#312e81'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), dashed: Boolean(object?.dashed) };
        if (normalizedType === 'astronomy-chart') {
            const kind = ['solar-system-layout','moon-phases','eclipse-geometry','hr-diagram'].includes(String(object?.kind || 'solar-system-layout')) ? String(object.kind) : 'solar-system-layout';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,300), y: clamp(object?.y,-100000,100000,80), width: clamp(object?.width,180,2200,580), height: clamp(object?.height,160,1700,570), title: String(object?.title || 'Astronomy diagram').slice(0,240), levels: String(object?.levels || '').slice(0,10000), unit: String(object?.unit || '').slice(0,40), fill: safeColor(object?.fill,'#eef2ff'), stroke: safeColor(object?.stroke,'#4f46e5'), textColor: safeColor(object?.textColor,'#312e81'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5) };
        }
        if (normalizedType === 'astronomy-link') {
            const kind = ['orbit','distance','radiation','eclipse','evolution','trajectory'].includes(String(object?.kind || 'orbit')) ? String(object.kind) : 'orbit';
            return { ...common, sourceId: String(object?.sourceId || '').slice(0,100), sourcePort: normalizeAstronomyPort(object?.sourcePort,'e'), targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeAstronomyPort(object?.targetPort,'w'), x1: clamp(object?.x1,-100000,100000,300), y1: clamp(object?.y1,-100000,100000,300), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,300), kind, label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#4f46e5'), textColor: safeColor(object?.textColor,'#312e81'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed), showArrow: object?.showArrow !== false, value: clamp(object?.value,-1000000000,1000000000,0) };
        }
        if (normalizedType === 'astronomy-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeAstronomyPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,850), y: clamp(object?.y,-100000,100000,150), width: clamp(object?.width,80,1000,230), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Celestial object').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'astronomy-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,340), y1: clamp(object?.y1,-100000,100000,610), x2: clamp(object?.x2,-100000,100000,670), y2: clamp(object?.y2,-100000,100000,610), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#475569'), textColor: safeColor(object?.textColor,'#1e293b'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Astronomy annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }


    function normalizeDisasterPort(value, fallback = 'e') {
        const key = String(value || fallback).toLowerCase();
        return ['n','ne','e','se','s','sw','w','nw'].includes(key) ? key : fallback;
    }

    function normalizeDisasterObject(object, index) {
        const type = String(object?.type || 'disaster-node');
        const supported = new Set(['disaster-node','disaster-zone','disaster-pyramid','disaster-link','disaster-label','disaster-arrow','text']);
        const normalizedType = supported.has(type) ? type : 'disaster-node';
        const common = { id: String(object?.id || `disaster-${index + 1}`).slice(0, 100), type: normalizedType };
        if (normalizedType === 'disaster-node') {
            const kinds = new Set(['earthquake','epicenter','fault-line','cyclone','storm-surge','tsunami','flood','landslide','volcano','wildfire','drought','lightning','vulnerable-house','school','bridge','river','coast','mountain','embankment','shelter','hospital','fire-station','emergency-center','warning-siren','rescue-team','ambulance','relief-camp','safe-zone']);
            const kind = kinds.has(String(object?.kind || 'earthquake')) ? String(object.kind) : 'earthquake';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,440), y: clamp(object?.y,-100000,100000,260), width: clamp(object?.width,20,1800,190), height: clamp(object?.height,20,1600,120), label: String(object?.label || kind.replace(/-/g,' ')).slice(0,240), fill: safeColor(object?.fill,'#fff7ed'), stroke: safeColor(object?.stroke,'#ea580c'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), rotation: clamp(object?.rotation,-3600,3600,0), trophicLevel: Math.round(clamp(object?.trophicLevel,0,20,0)), energy: clamp(object?.energy,-1000000000,1000000000,0), population: clamp(object?.population,-1000000000,1000000000,0) };
        }
        if (normalizedType === 'disaster-zone') return { ...common, x: clamp(object?.x,-100000,100000,180), y: clamp(object?.y,-100000,100000,100), width: clamp(object?.width,100,2200,760), height: clamp(object?.height,100,1700,500), label: String(object?.label || 'Hazard and risk zone').slice(0,240), fill: safeColor(object?.fill,'#fff7ed'), stroke: safeColor(object?.stroke,'#ea580c'), textColor: safeColor(object?.textColor,'#7c2d12'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5), dashed: Boolean(object?.dashed) };
        if (normalizedType === 'disaster-pyramid') {
            const kind = ['risk-matrix','disaster-cycle','vulnerability-chart'].includes(String(object?.kind || 'risk-matrix')) ? String(object.kind) : 'risk-matrix';
            return { ...common, kind, x: clamp(object?.x,-100000,100000,320), y: clamp(object?.y,-100000,100000,90), width: clamp(object?.width,180,1800,540), height: clamp(object?.height,180,1600,560), title: String(object?.title || 'Disaster risk chart').slice(0,240), levels: String(object?.levels || '').slice(0,5000), unit: String(object?.unit || '').slice(0,100), fill: safeColor(object?.fill,'#ffedd5'), stroke: safeColor(object?.stroke,'#ea580c'), textColor: safeColor(object?.textColor,'#7c2d12'), lineWidth: clamp(object?.lineWidth,0.5,20,2.5) };
        }
        if (normalizedType === 'disaster-link') return { ...common, sourceId: String(object?.sourceId || '').slice(0,100), sourcePort: normalizeDisasterPort(object?.sourcePort,'e'), targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeDisasterPort(object?.targetPort,'w'), x1: clamp(object?.x1,-100000,100000,300), y1: clamp(object?.y1,-100000,100000,300), x2: clamp(object?.x2,-100000,100000,650), y2: clamp(object?.y2,-100000,100000,300), kind: ['hazard-path','warning','evacuation','response','coordination','recovery'].includes(String(object?.kind || 'hazard-path')) ? String(object.kind) : 'hazard-path', label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#dc2626'), textColor: safeColor(object?.textColor,'#991b1b'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed), showArrow: object?.showArrow !== false, energy: clamp(object?.energy,-1000000000,1000000000,0) };
        if (normalizedType === 'disaster-label') return { ...common, targetId: String(object?.targetId || '').slice(0,100), targetPort: normalizeDisasterPort(object?.targetPort,'e'), x: clamp(object?.x,-100000,100000,850), y: clamp(object?.y,-100000,100000,150), width: clamp(object?.width,80,1000,230), height: clamp(object?.height,30,500,50), text: String(object?.text || 'Disaster-management feature').slice(0,500), fill: safeColor(object?.fill,'#ffffff'), stroke: safeColor(object?.stroke,'#334155'), textColor: safeColor(object?.textColor,'#0f172a'), lineWidth: clamp(object?.lineWidth,0.5,20,2) };
        if (normalizedType === 'disaster-arrow') return { ...common, x1: clamp(object?.x1,-100000,100000,340), y1: clamp(object?.y1,-100000,100000,610), x2: clamp(object?.x2,-100000,100000,670), y2: clamp(object?.y2,-100000,100000,610), label: String(object?.label || '').slice(0,240), stroke: safeColor(object?.stroke,'#15803d'), textColor: safeColor(object?.textColor,'#14532d'), lineWidth: clamp(object?.lineWidth,0.5,20,3), dashed: Boolean(object?.dashed) };
        return { ...common, x: clamp(object?.x,-100000,100000,60), y: clamp(object?.y,-100000,100000,60), text: String(object?.text || 'Disaster risk annotation').slice(0,4000), color: safeColor(object?.color,'#0f172a'), fontSize: clamp(object?.fontSize,8,120,20), fontWeight: object?.fontWeight === 'bold' ? 'bold' : 'normal' };
    }

    function normalizeSpec(spec) {
        if (!spec || typeof spec !== 'object') throw new Error('Invalid diagram document.');
        const width = clamp(spec.width, 240, 2400, 900);
        const height = clamp(spec.height, 180, 1800, 520);
        const supportedModes = new Set([
            'general-drawing', 'flowchart', 'geometry', 'coordinate-geometry', 'number-line', 'tree-diagram', 'technical-drawing', 'statistical-diagram', 'function-transformation', 'complex-plane', 'digital-logic', 'finite-state-machine', 'database-er', 'network-topology', 'uml-software-design', 'uml-sequence', 'uml-activity', 'cloud-deployment', 'chemical-structure', 'biological-cell', 'human-anatomy', 'plant-anatomy', 'genetics-diagram', 'ecology-diagram', 'geology-diagram', 'weather-climate-diagram', 'astronomy-diagram', 'hydrology-diagram', 'oceanography-diagram', 'environmental-science-diagram', 'disaster-management-diagram',
            'vector-fbd', 'circuit', 'ray-optics', 'waveform', 'venn-set',
            'timeline', 'data-flow', 'cross-section', 'vector-art',
            'sports-field', 'stage-blocking'
        ]);
        const requestedMode = String(spec.mode || '');
        const mode = supportedModes.has(requestedMode) ? requestedMode : 'general-drawing';
        const normalizers = {
            geometry: normalizeGeometryObject,
            'coordinate-geometry': normalizeCoordinateObject,
            'number-line': normalizeNumberLineObject,
            'tree-diagram': normalizeTreeObject,
            'technical-drawing': normalizeTechnicalObject,
            'statistical-diagram': normalizeStatisticalObject,
            'function-transformation': normalizeFunctionObject,
            'complex-plane': normalizeComplexObject,
            'digital-logic': normalizeDigitalLogicObject,
            'finite-state-machine': normalizeFiniteStateMachineObject,
            'database-er': normalizeDatabaseErObject,
            'network-topology': normalizeNetworkTopologyObject,
            'uml-software-design': normalizeUmlSoftwareObject,
            'uml-sequence': normalizeSequenceObject,
            'uml-activity': normalizeActivityObject,
            'cloud-deployment': normalizeDeploymentObject,
            'chemical-structure': normalizeChemicalObject,
            'biological-cell': normalizeBiologicalObject,
            'human-anatomy': normalizeHumanAnatomyObject,
            'plant-anatomy': normalizePlantAnatomyObject,
            'genetics-diagram': normalizeGeneticsObject,
            'ecology-diagram': normalizeEcologyObject,
            'geology-diagram': normalizeGeologyObject,
            'weather-climate-diagram': normalizeWeatherObject,
            'astronomy-diagram': normalizeAstronomyObject,
            'hydrology-diagram': normalizeHydrologyObject,
            'oceanography-diagram': normalizeOceanographyObject,
            'environmental-science-diagram': normalizeEnvironmentalObject,
            'disaster-management-diagram': normalizeDisasterObject,
            'vector-fbd': normalizeVectorObject,
            circuit: normalizeCircuitObject,
            'ray-optics': normalizeRayOpticsObject,
            waveform: normalizeWaveformObject,
            'venn-set': normalizeVennObject,
            timeline: normalizeTimelineObject,
            'data-flow': normalizeDataFlowObject,
            'cross-section': normalizeCrossSectionObject,
            'vector-art': normalizeVectorArtObject,
            'sports-field': normalizeSportsObject,
            'stage-blocking': normalizeStageObject
        };
        const objectNormalizer = normalizers[mode] || normalizeGeneralObject;
        const objects = Array.isArray(spec.objects)
            ? spec.objects.slice(0, MAX_OBJECTS).map((object, index) => objectNormalizer(object, index))
            : [];

        const coordXMin = mode === 'coordinate-geometry'
            ? clamp(spec.coordXMin, -100000, 99999, -10)
            : -10;
        const coordXMax = mode === 'coordinate-geometry'
            ? Math.max(clamp(spec.coordXMax, -99999, 100000, 10), coordXMin + 0.001)
            : 10;
        const coordYMin = mode === 'coordinate-geometry'
            ? clamp(spec.coordYMin, -100000, 99999, -5)
            : -5;
        const coordYMax = mode === 'coordinate-geometry'
            ? Math.max(clamp(spec.coordYMax, -99999, 100000, 5), coordYMin + 0.001)
            : 5;
        return {
            version: ({
                geometry: 2,
                'vector-fbd': 3,
                circuit: 4,
                'ray-optics': 5,
                waveform: 6,
                'venn-set': 7,
                timeline: 8,
                'data-flow': 9,
                'cross-section': 10,
                'vector-art': 11,
                'sports-field': 12,
                'stage-blocking': 13,
                'coordinate-geometry': 14,
                'number-line': 15,
                'tree-diagram': 16,
                'technical-drawing': 17,
                'statistical-diagram': 18,
                'function-transformation': 19,
                'complex-plane': 20,
                'digital-logic': 22,
                'finite-state-machine': 23,
                'database-er': 24,
                'network-topology': 25,
                'uml-software-design': 26,
                'uml-sequence': 27,
                'uml-activity': 28,
                'cloud-deployment': 29,
                'chemical-structure': 30,
                'biological-cell': 31,
                'human-anatomy': 32,
                'plant-anatomy': 33,
                'genetics-diagram': 34,
                'ecology-diagram': 35,
                'geology-diagram': 36,
                'weather-climate-diagram': 37,
                'astronomy-diagram': 38,
                'hydrology-diagram': 39,
                'oceanography-diagram': 40,
                'environmental-science-diagram': 41,
                'disaster-management-diagram': 42
            })[mode] || 1,
            id: String(spec.id || `diagram-${Date.now()}`).slice(0, 120),
            mode,
            title: String(spec.title || '').slice(0, 300),
            width,
            height,
            background: safeColor(spec.background, '#ffffff'),
            gridSize: clamp(spec.gridSize, 5, 100, 20),
            coordXMin,
            coordXMax,
            coordYMin,
            coordYMax,
            coordGridStep: mode === 'coordinate-geometry'
                ? clamp(spec.coordGridStep, 0.01, 100000, 1)
                : 1,
            coordShowTickLabels: mode === 'coordinate-geometry'
                ? spec.coordShowTickLabels !== false
                : false,
            numberXMin: mode === 'number-line' ? clamp(spec.numberXMin, -100000, 99999, -10) : -10,
            numberXMax: mode === 'number-line' ? Math.max(clamp(spec.numberXMax, -99999, 100000, 10), clamp(spec.numberXMin, -100000, 99999, -10) + 0.001) : 10,
            numberStep: mode === 'number-line' ? clamp(spec.numberStep, 0.01, 100000, 1) : 1,
            numberShowTicks: mode === 'number-line' ? spec.numberShowTicks !== false : false,
            numberShowTickLabels: mode === 'number-line' ? spec.numberShowTickLabels !== false : false,
            numberShowNotation: mode === 'number-line' ? spec.numberShowNotation !== false : false,
            treeOrientation: mode === 'tree-diagram' && spec.treeOrientation === 'horizontal' ? 'horizontal' : 'vertical',
            treeShowGrid: mode === 'tree-diagram' ? Boolean(spec.treeShowGrid) : false,
            treeShowEdgeLabels: mode === 'tree-diagram' ? spec.treeShowEdgeLabels !== false : false,
            treeShowProbabilities: mode === 'tree-diagram' ? spec.treeShowProbabilities !== false : false,
            treeLevelGap: mode === 'tree-diagram' ? clamp(spec.treeLevelGap, 70, 300, 135) : 135,
            treeSiblingGap: mode === 'tree-diagram' ? clamp(spec.treeSiblingGap, 10, 200, 36) : 36,
            techShowGrid: mode === 'technical-drawing' ? spec.techShowGrid !== false : false,
            techShowBorder: mode === 'technical-drawing' ? spec.techShowBorder !== false : false,
            techShowTitleBlock: mode === 'technical-drawing' ? Boolean(spec.techShowTitleBlock) : false,
            techScale: mode === 'technical-drawing' ? String(spec.techScale || '1:1').slice(0, 50) : '1:1',
            techUnits: mode === 'technical-drawing' ? String(spec.techUnits || 'mm').slice(0, 20) : 'mm',
            techLineWidth: mode === 'technical-drawing' ? clamp(spec.techLineWidth, 0.5, 20, 2.5) : 2.5,
            statShowGrid: mode === 'statistical-diagram' ? spec.statShowGrid !== false : false,
            statShowLegend: mode === 'statistical-diagram' ? spec.statShowLegend !== false : false,
            statShowValues: mode === 'statistical-diagram' ? spec.statShowValues !== false : false,
            statShowAxes: mode === 'statistical-diagram' ? spec.statShowAxes !== false : false,
            statXLabel: mode === 'statistical-diagram' ? String(spec.statXLabel || 'Category').slice(0, 120) : '',
            statYLabel: mode === 'statistical-diagram' ? String(spec.statYLabel || 'Value').slice(0, 120) : '',
            functionXMin: mode === 'function-transformation' ? clamp(spec.functionXMin, -100000, 99999, -10) : -10,
            functionXMax: mode === 'function-transformation' ? Math.max(clamp(spec.functionXMax, -99999, 100000, 10), clamp(spec.functionXMin, -100000, 99999, -10) + 0.001) : 10,
            functionYMin: mode === 'function-transformation' ? clamp(spec.functionYMin, -100000, 99999, -6) : -6,
            functionYMax: mode === 'function-transformation' ? Math.max(clamp(spec.functionYMax, -99999, 100000, 6), clamp(spec.functionYMin, -100000, 99999, -6) + 0.001) : 6,
            functionGridStep: mode === 'function-transformation' ? clamp(spec.functionGridStep, 0.01, 100000, 1) : 1,
            functionShowGrid: mode === 'function-transformation' ? spec.functionShowGrid !== false : false,
            functionShowAxes: mode === 'function-transformation' ? spec.functionShowAxes !== false : false,
            functionShowTicks: mode === 'function-transformation' ? spec.functionShowTicks !== false : false,
            functionShowLegend: mode === 'function-transformation' ? spec.functionShowLegend !== false : false,
            complexXMin: mode === 'complex-plane' ? clamp(spec.complexXMin, -100000, 99999, -6) : -6,
            complexXMax: mode === 'complex-plane' ? Math.max(clamp(spec.complexXMax, -99999, 100000, 6), clamp(spec.complexXMin, -100000, 99999, -6) + 0.001) : 6,
            complexYMin: mode === 'complex-plane' ? clamp(spec.complexYMin, -100000, 99999, -5) : -5,
            complexYMax: mode === 'complex-plane' ? Math.max(clamp(spec.complexYMax, -99999, 100000, 5), clamp(spec.complexYMin, -100000, 99999, -5) + 0.001) : 5,
            complexGridStep: mode === 'complex-plane' ? clamp(spec.complexGridStep, 0.01, 100000, 1) : 1,
            complexShowGrid: mode === 'complex-plane' ? spec.complexShowGrid !== false : false,
            complexShowAxes: mode === 'complex-plane' ? spec.complexShowAxes !== false : false,
            complexShowTicks: mode === 'complex-plane' ? spec.complexShowTicks !== false : false,
            complexShowPolarGrid: mode === 'complex-plane' ? Boolean(spec.complexShowPolarGrid) : false,
            complexShowLabels: mode === 'complex-plane' ? spec.complexShowLabels !== false : false,
            logicShowGrid: mode === 'digital-logic' ? spec.logicShowGrid !== false : false,
            logicShowPinLabels: mode === 'digital-logic' ? spec.logicShowPinLabels !== false : false,
            logicShowValues: mode === 'digital-logic' ? spec.logicShowValues !== false : false,
            automataShowGrid: mode === 'finite-state-machine' ? spec.automataShowGrid !== false : false,
            automataShowStateLabels: mode === 'finite-state-machine' ? spec.automataShowStateLabels !== false : false,
            automataShowTransitionLabels: mode === 'finite-state-machine' ? spec.automataShowTransitionLabels !== false : false,
            erShowGrid: mode === 'database-er' ? spec.erShowGrid !== false : false,
            erShowCardinality: mode === 'database-er' ? spec.erShowCardinality !== false : false,
            erShowAttributes: mode === 'database-er' ? spec.erShowAttributes !== false : false,
            networkShowGrid: mode === 'network-topology' ? spec.networkShowGrid !== false : false,
            networkShowLabels: mode === 'network-topology' ? spec.networkShowLabels !== false : false,
            networkShowIp: mode === 'network-topology' ? spec.networkShowIp !== false : false,
            networkShowLinkLabels: mode === 'network-topology' ? spec.networkShowLinkLabels !== false : false,
            networkShowZones: mode === 'network-topology' ? spec.networkShowZones !== false : false,
            umlShowGrid: mode === 'uml-software-design' ? spec.umlShowGrid !== false : false,
            umlShowCompartments: mode === 'uml-software-design' ? spec.umlShowCompartments !== false : false,
            umlShowMultiplicity: mode === 'uml-software-design' ? spec.umlShowMultiplicity !== false : false,
            umlShowStereotypes: mode === 'uml-software-design' ? spec.umlShowStereotypes !== false : false,
            sequenceShowGrid: mode === 'uml-sequence' ? spec.sequenceShowGrid !== false : false,
            sequenceShowNumbers: mode === 'uml-sequence' ? spec.sequenceShowNumbers !== false : false,
            sequenceShowActivations: mode === 'uml-sequence' ? spec.sequenceShowActivations !== false : false,
            sequenceShowFootbox: mode === 'uml-sequence' ? spec.sequenceShowFootbox === true : false,
            activityShowGrid: mode === 'uml-activity' ? spec.activityShowGrid !== false : false,
            activityShowGuards: mode === 'uml-activity' ? spec.activityShowGuards !== false : false,
            activityShowLaneTitles: mode === 'uml-activity' ? spec.activityShowLaneTitles !== false : false,
            activityShowLabels: mode === 'uml-activity' ? spec.activityShowLabels !== false : false,
            deploymentShowGrid: mode === 'cloud-deployment' ? spec.deploymentShowGrid !== false : false,
            deploymentShowLinkTypes: mode === 'cloud-deployment' ? spec.deploymentShowLinkTypes !== false : false,
            deploymentShowZoneTitles: mode === 'cloud-deployment' ? spec.deploymentShowZoneTitles !== false : false,
            deploymentShowLabels: mode === 'cloud-deployment' ? spec.deploymentShowLabels !== false : false,
            chemicalShowGrid: mode === 'chemical-structure' ? spec.chemicalShowGrid !== false : false,
            chemicalShowCharges: mode === 'chemical-structure' ? spec.chemicalShowCharges !== false : false,
            chemicalShowHydrogens: mode === 'chemical-structure' ? spec.chemicalShowHydrogens !== false : false,
            chemicalShowCarbonLabels: mode === 'chemical-structure' ? spec.chemicalShowCarbonLabels !== false : false,
            chemicalShowConditions: mode === 'chemical-structure' ? spec.chemicalShowConditions !== false : false,
            biologyShowGrid: mode === 'biological-cell' ? Boolean(spec.biologyShowGrid) : false,
            biologyShowLabels: mode === 'biological-cell' ? spec.biologyShowLabels !== false : false,
            biologyShowMembranes: mode === 'biological-cell' ? spec.biologyShowMembranes !== false : false,
            biologyShowDetails: mode === 'biological-cell' ? spec.biologyShowDetails !== false : false,
            anatomyShowGrid: mode === 'human-anatomy' ? Boolean(spec.anatomyShowGrid) : false,
            anatomyShowLabels: mode === 'human-anatomy' ? spec.anatomyShowLabels !== false : false,
            anatomyShowBody: mode === 'human-anatomy' ? spec.anatomyShowBody !== false : false,
            anatomyShowDetails: mode === 'human-anatomy' ? spec.anatomyShowDetails !== false : false,
            botanyShowGrid: mode === 'plant-anatomy' ? Boolean(spec.botanyShowGrid) : false,
            botanyShowLabels: mode === 'plant-anatomy' ? spec.botanyShowLabels !== false : false,
            botanyShowBody: mode === 'plant-anatomy' ? spec.botanyShowBody !== false : false,
            botanyShowDetails: mode === 'plant-anatomy' ? spec.botanyShowDetails !== false : false,
            geneticsShowGrid: mode === 'genetics-diagram' ? Boolean(spec.geneticsShowGrid) : false,
            geneticsShowLabels: mode === 'genetics-diagram' ? spec.geneticsShowLabels !== false : false,
            geneticsShowStructures: mode === 'genetics-diagram' ? spec.geneticsShowStructures !== false : false,
            geneticsShowDetails: mode === 'genetics-diagram' ? spec.geneticsShowDetails !== false : false,
            geneticsShowSequences: mode === 'genetics-diagram' ? spec.geneticsShowSequences !== false : false,
            ecologyShowGrid: mode === 'ecology-diagram' ? Boolean(spec.ecologyShowGrid) : false,
            ecologyShowLabels: mode === 'ecology-diagram' ? spec.ecologyShowLabels !== false : false,
            ecologyShowEnergy: mode === 'ecology-diagram' ? spec.ecologyShowEnergy !== false : false,
            ecologyShowZones: mode === 'ecology-diagram' ? spec.ecologyShowZones !== false : false,
            ecologyShowTrophicLevels: mode === 'ecology-diagram' ? spec.ecologyShowTrophicLevels !== false : false,
            geologyShowGrid: mode === 'geology-diagram' ? Boolean(spec.geologyShowGrid) : false,
            geologyShowLabels: mode === 'geology-diagram' ? spec.geologyShowLabels !== false : false,
            geologyShowEnergy: mode === 'geology-diagram' ? spec.geologyShowEnergy !== false : false,
            geologyShowZones: mode === 'geology-diagram' ? spec.geologyShowZones !== false : false,
            geologyShowTrophicLevels: mode === 'geology-diagram' ? spec.geologyShowTrophicLevels !== false : false,
            weatherShowGrid: mode === 'weather-climate-diagram' ? Boolean(spec.weatherShowGrid) : false,
            weatherShowLabels: mode === 'weather-climate-diagram' ? spec.weatherShowLabels !== false : false,
            weatherShowValues: mode === 'weather-climate-diagram' ? spec.weatherShowValues !== false : false,
            weatherShowZones: mode === 'weather-climate-diagram' ? spec.weatherShowZones !== false : false,
            weatherShowLevels: mode === 'weather-climate-diagram' ? spec.weatherShowLevels !== false : false,
            astronomyShowGrid: mode === 'astronomy-diagram' ? Boolean(spec.astronomyShowGrid) : false,
            astronomyShowLabels: mode === 'astronomy-diagram' ? spec.astronomyShowLabels !== false : false,
            astronomyShowValues: mode === 'astronomy-diagram' ? spec.astronomyShowValues !== false : false,
            astronomyShowZones: mode === 'astronomy-diagram' ? spec.astronomyShowZones !== false : false,
            astronomyShowOrbits: mode === 'astronomy-diagram' ? spec.astronomyShowOrbits !== false : false,
            hydrologyShowGrid: mode === 'hydrology-diagram' ? Boolean(spec.hydrologyShowGrid) : false,
            hydrologyShowLabels: mode === 'hydrology-diagram' ? spec.hydrologyShowLabels !== false : false,
            hydrologyShowEnergy: mode === 'hydrology-diagram' ? spec.hydrologyShowEnergy !== false : false,
            hydrologyShowZones: mode === 'hydrology-diagram' ? spec.hydrologyShowZones !== false : false,
            hydrologyShowTrophicLevels: mode === 'hydrology-diagram' ? spec.hydrologyShowTrophicLevels !== false : false,
            oceanographyShowGrid: mode === 'oceanography-diagram' ? Boolean(spec.oceanographyShowGrid) : false,
            oceanographyShowLabels: mode === 'oceanography-diagram' ? spec.oceanographyShowLabels !== false : false,
            oceanographyShowEnergy: mode === 'oceanography-diagram' ? spec.oceanographyShowEnergy !== false : false,
            oceanographyShowZones: mode === 'oceanography-diagram' ? spec.oceanographyShowZones !== false : false,
            oceanographyShowTrophicLevels: mode === 'oceanography-diagram' ? spec.oceanographyShowTrophicLevels !== false : false,
            environmentalShowGrid: mode === 'environmental-science-diagram' ? Boolean(spec.environmentalShowGrid) : false,
            environmentalShowLabels: mode === 'environmental-science-diagram' ? spec.environmentalShowLabels !== false : false,
            environmentalShowEnergy: mode === 'environmental-science-diagram' ? spec.environmentalShowEnergy !== false : false,
            environmentalShowZones: mode === 'environmental-science-diagram' ? spec.environmentalShowZones !== false : false,
            environmentalShowTrophicLevels: mode === 'environmental-science-diagram' ? spec.environmentalShowTrophicLevels !== false : false,
            disasterShowGrid: mode === 'disaster-management-diagram' ? Boolean(spec.disasterShowGrid) : false,
            disasterShowLabels: mode === 'disaster-management-diagram' ? spec.disasterShowLabels !== false : false,
            disasterShowEnergy: mode === 'disaster-management-diagram' ? spec.disasterShowEnergy !== false : false,
            disasterShowZones: mode === 'disaster-management-diagram' ? spec.disasterShowZones !== false : false,
            disasterShowTrophicLevels: mode === 'disaster-management-diagram' ? spec.disasterShowTrophicLevels !== false : false,
            showGrid: ['geometry', 'coordinate-geometry', 'number-line', 'technical-drawing', 'function-transformation', 'complex-plane', 'digital-logic', 'finite-state-machine', 'database-er', 'network-topology', 'uml-software-design', 'uml-sequence', 'uml-activity', 'cloud-deployment', 'chemical-structure', 'biological-cell', 'human-anatomy', 'plant-anatomy', 'genetics-diagram', 'ecology-diagram', 'geology-diagram', 'weather-climate-diagram', 'astronomy-diagram', 'hydrology-diagram', 'oceanography-diagram', 'environmental-science-diagram', 'disaster-management-diagram', 'vector-fbd', 'circuit', 'ray-optics', 'waveform', 'data-flow', 'cross-section', 'vector-art'].includes(mode)
                ? spec.showGrid !== false
                : Boolean(spec.showGrid),
            showAxes: mode === 'complex-plane' ? spec.complexShowAxes !== false : (mode === 'function-transformation' ? spec.functionShowAxes !== false : (mode === 'coordinate-geometry'
                ? spec.showAxes !== false
                : (['waveform', 'cross-section'].includes(mode)
                    ? spec.showAxes !== false
                    : (['geometry', 'vector-fbd'].includes(mode) ? Boolean(spec.showAxes) : false)))),
            snap: ['geometry', 'coordinate-geometry', 'number-line', 'technical-drawing', 'function-transformation', 'complex-plane', 'digital-logic', 'finite-state-machine', 'database-er', 'network-topology', 'uml-software-design', 'uml-sequence', 'uml-activity', 'cloud-deployment', 'chemical-structure', 'biological-cell', 'human-anatomy', 'plant-anatomy', 'genetics-diagram', 'ecology-diagram', 'geology-diagram', 'weather-climate-diagram', 'astronomy-diagram', 'hydrology-diagram', 'oceanography-diagram', 'environmental-science-diagram', 'disaster-management-diagram', 'vector-fbd', 'circuit', 'ray-optics'].includes(mode)
                ? spec.snap !== false
                : Boolean(spec.snap),
            pixelsPerUnit: mode === 'vector-fbd'
                ? clamp(spec.pixelsPerUnit, 1, 500, 20)
                : 20,
            unit: mode === 'vector-fbd'
                ? String(spec.unit || 'N').slice(0, 12)
                : '',
            axisY: mode === 'ray-optics' ? clamp(spec.axisY, 20, height - 20, height / 2) : height / 2,
            showAxis: mode === 'ray-optics' ? spec.showAxis !== false : false,
            showFocalPoints: mode === 'ray-optics' ? spec.showFocalPoints !== false : false,
            showTwoF: mode === 'ray-optics' ? spec.showTwoF !== false : false,
            showPrincipalRays: mode === 'ray-optics' ? spec.showPrincipalRays !== false : false,
            showImage: mode === 'ray-optics' ? spec.showImage !== false : false,
            showMeasurements: mode === 'ray-optics' ? spec.showMeasurements !== false : false,
            rayColor: mode === 'ray-optics' ? safeColor(spec.rayColor, '#2563eb') : '#2563eb',
            virtualRayColor: mode === 'ray-optics' ? safeColor(spec.virtualRayColor, '#7c3aed') : '#7c3aed',
            duration: mode === 'waveform' ? clamp(spec.duration, 0.01, 1000, 2) : 2,
            yMin: mode === 'waveform' ? clamp(spec.yMin, -1000000, 999999, -2) : -2,
            yMax: mode === 'waveform'
                ? Math.max(
                    clamp(spec.yMax, -999999, 1000000, 2),
                    clamp(spec.yMin, -1000000, 999999, -2) + 0.000001
                )
                : 2,
            xDivisions: mode === 'waveform' ? Math.round(clamp(spec.xDivisions, 2, 40, 10)) : 10,
            yDivisions: mode === 'waveform' ? Math.round(clamp(spec.yDivisions, 2, 40, 8)) : 8,
            xLabel: mode === 'waveform' ? String(spec.xLabel || 'Time (s)').slice(0, 100) : '',
            yLabel: mode === 'waveform' ? String(spec.yLabel || 'Amplitude').slice(0, 100) : '',
            showLegend: mode === 'waveform' ? spec.showLegend !== false : false,
            showValues: mode === 'waveform' ? spec.showValues !== false : false,
            showUniversalSet: mode === 'venn-set' ? spec.showUniversalSet !== false : false,
            universalLabel: mode === 'venn-set' ? String(spec.universalLabel || 'U').slice(0, 100) : '',
            universalPadding: mode === 'venn-set' ? clamp(spec.universalPadding, 10, Math.min(width, height) / 2 - 5, 55) : 55,
            shadeMode: mode === 'venn-set' && [
                'none', 'a', 'b', 'union', 'intersection', 'a-only', 'b-only',
                'symmetric-difference', 'complement-a', 'complement-b', 'complement-union'
            ].includes(String(spec.shadeMode || ''))
                ? String(spec.shadeMode)
                : 'none',
            shadeColor: mode === 'venn-set' ? safeColor(spec.shadeColor, '#f59e0b') : '#f59e0b',
            shadeOpacity: mode === 'venn-set' ? clamp(spec.shadeOpacity, 0, 1, 0.35) : 0.35,
            shadeSetA: mode === 'venn-set' ? String(spec.shadeSetA || '').slice(0, 100) : '',
            shadeSetB: mode === 'venn-set' ? String(spec.shadeSetB || '').slice(0, 100) : '',
            orientation: mode === 'timeline' && spec.orientation === 'vertical' ? 'vertical' : 'horizontal',
            scaleMode: mode === 'timeline' && ['date', 'year', 'number'].includes(String(spec.scaleMode || ''))
                ? String(spec.scaleMode)
                : 'date',
            axisStart: mode === 'timeline' ? String(spec.axisStart || '2020-01-01').slice(0, 100) : '',
            axisEnd: mode === 'timeline' ? String(spec.axisEnd || '2025-01-01').slice(0, 100) : '',
            tickCount: mode === 'timeline' ? Math.round(clamp(spec.tickCount, 2, 30, 10)) : 10,
            showTickLabels: mode === 'timeline' ? spec.showTickLabels !== false : false,
            showConnectors: mode === 'timeline' ? spec.showConnectors !== false : false,
            axisColor: mode === 'timeline' ? safeColor(spec.axisColor, '#334155') : '#334155',
            axisWidth: mode === 'timeline' ? clamp(spec.axisWidth, 0.5, 20, 3) : 3,
            laneSpacing: mode === 'timeline' ? clamp(spec.laneSpacing, 45, 180, 86) : 86,
            snapToGrid: mode === 'data-flow' ? spec.snapToGrid !== false : false,
            showFlowLabels: mode === 'data-flow' ? spec.showFlowLabels !== false : false,
            notation: mode === 'data-flow' && spec.notation === 'gane-sarson'
                ? 'gane-sarson'
                : 'yourdon',
            connectorRoute: mode === 'data-flow' && ['orthogonal', 'straight', 'curved'].includes(String(spec.connectorRoute || ''))
                ? String(spec.connectorRoute)
                : 'orthogonal',
            horizontalFirst: mode === 'data-flow' ? spec.horizontalFirst !== false : true,
            snapToGrid: mode === 'cross-section'
                ? spec.snapToGrid !== false
                : (mode === 'data-flow'
                    ? spec.snapToGrid !== false
                    : (mode === 'sports-field'
                        ? Boolean(spec.snapToGrid)
                        : (mode === 'stage-blocking' ? Boolean(spec.snapToGrid) : false))),
            showSeaLevel: mode === 'cross-section' ? Boolean(spec.showSeaLevel) : false,
            seaLevelY: mode === 'cross-section' ? clamp(spec.seaLevelY, -4000, 4000, 350) : 350,
            horizontalLabel: mode === 'cross-section'
                ? String(spec.horizontalLabel || 'Distance').slice(0, 200)
                : '',
            verticalLabel: mode === 'cross-section'
                ? String(spec.verticalLabel || 'Elevation').slice(0, 200)
                : '',
            verticalExaggeration: mode === 'cross-section'
                ? clamp(spec.verticalExaggeration, 0.1, 100, 1)
                : 1,
            showCenterGuides: mode === 'vector-art' ? spec.showCenterGuides !== false : false,
            showSafeArea: mode === 'vector-art' ? Boolean(spec.showSafeArea) : false,
            safeArea: mode === 'vector-art'
                ? clamp(spec.safeArea, 0, Math.min(width, height) / 2, 45)
                : 45,
            defaultStroke: mode === 'vector-art' ? safeColor(spec.defaultStroke, '#0f172a') : '#0f172a',
            defaultFill: mode === 'vector-art' ? safeColor(spec.defaultFill, '#dbeafe') : '#dbeafe',
            defaultStrokeWidth: mode === 'vector-art' ? clamp(spec.defaultStrokeWidth, 0.5, 80, 4) : 4,
            fieldType: mode === 'sports-field' && ['soccer', 'basketball', 'cricket', 'generic'].includes(String(spec.fieldType || ''))
                ? String(spec.fieldType)
                : 'soccer',
            fieldColor: mode === 'sports-field' ? safeColor(spec.fieldColor, '#15803d') : '#15803d',
            fieldLineColor: mode === 'sports-field' ? safeColor(spec.fieldLineColor, '#ffffff') : '#ffffff',
            fieldLineWidth: mode === 'sports-field' ? clamp(spec.fieldLineWidth, 0.5, 20, 3) : 3,
            showFieldLabels: mode === 'sports-field' ? spec.showFieldLabels !== false : false,
            stageType: mode === 'stage-blocking' && ['proscenium', 'thrust', 'arena', 'black-box'].includes(String(spec.stageType || ''))
                ? String(spec.stageType)
                : 'proscenium',
            stageColor: mode === 'stage-blocking' ? safeColor(spec.stageColor, '#f5f0e6') : '#f5f0e6',
            stageLineColor: mode === 'stage-blocking' ? safeColor(spec.stageLineColor, '#334155') : '#334155',
            stageLineWidth: mode === 'stage-blocking' ? clamp(spec.stageLineWidth, 0.5, 20, 3) : 3,
            showStageLabels: mode === 'stage-blocking' ? spec.showStageLabels !== false : false,
            showAudience: mode === 'stage-blocking' ? spec.showAudience !== false : false,
            showWings: mode === 'stage-blocking' ? spec.showWings !== false : false,
            objects
        };
    }

    function encodeSpec(spec) {
        return utf8ToBase64Url(JSON.stringify(normalizeSpec(spec)));
    }

    function decodePayload(payload) {
        return normalizeSpec(JSON.parse(base64UrlToUtf8(payload)));
    }

    function decodeToken(token) {
        const match = /^\[\[qmx-diagram:([A-Za-z0-9_-]{10,200000})\]\]$/.exec(String(token || '').trim());
        return match ? decodePayload(match[1]) : null;
    }

    function textMarkup(object, centerX, centerY) {
        if (!object.text) return '';
        const lines = String(object.text).split(/\r?\n/).slice(0, 10);
        const lineHeight = object.fontSize * 1.22;
        const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
        return `<text x="${centerX}" y="${startY}" fill="${escapeHtml(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Noto Sans Bengali, sans-serif">${lines.map((line, i) => `<tspan x="${centerX}" dy="${i === 0 ? 0 : lineHeight}">${escapeHtml(line)}</tspan>`).join('')}</text>`;
    }

    function lineMeasure(object) {
        return Math.hypot(object.x2 - object.x1, object.y2 - object.y1);
    }

    function angleMeasure(object) {
        const a1 = Math.atan2(object.ay - object.vy, object.ax - object.vx);
        const a2 = Math.atan2(object.by - object.vy, object.bx - object.vx);
        let delta = Math.abs((a2 - a1) * 180 / Math.PI) % 360;
        if (delta > 180) delta = 360 - delta;
        return delta;
    }

    const GEOMETRY_TEXT_RENDERER_VERSION = 'qmx-geometry-text-renderer-v1.0.18.3.2';

    function geometryLabelPoint(spec, x, y, padding = 18) {
        return {
            x: clamp(x, padding, spec.width - padding, x),
            y: clamp(y, padding, spec.height - padding, y)
        };
    }

    function geometryTextMarkup(object, spec) {
        if (!object.text) return '';

        const point = geometryLabelPoint(
            spec,
            object.x + object.w / 2,
            object.y + object.h / 2
        );
        const lines = String(object.text).split(/\r?\n/).slice(0, 10);
        const lineHeight = object.fontSize * 1.22;
        const startY = point.y - ((lines.length - 1) * lineHeight) / 2;

        return `<text data-qmx-object-id="${escapeHtml(object.id)}" x="${point.x}" y="${startY}" fill="${escapeHtml(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#ffffff" stroke-width="4" font-family="Arial, Noto Sans Bengali, sans-serif">${lines.map((line, index) => `<tspan x="${point.x}" dy="${index === 0 ? 0 : lineHeight}">${escapeHtml(line)}</tspan>`).join('')}</text>`;
    }

    function geometryObjectMarkup(object, spec) {
        if (object.type === 'text') return geometryTextMarkup(object, spec);

        const stroke = escapeHtml(object.stroke);
        const fill = escapeHtml(object.fill);
        const dash = object.dash ? ' stroke-dasharray="8 5"' : '';
        const commonLine = `fill="none" stroke="${stroke}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"`;
        const commonFill = `fill="${fill}" stroke="${stroke}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"`;
        const labelStyle = `fill="${escapeHtml(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" font-family="Arial, Noto Sans Bengali, sans-serif"`;

        if (object.type === 'point') {
            const label = object.text ? `<text x="${object.x + 10}" y="${object.y - 10}" ${labelStyle}>${escapeHtml(object.text)}</text>` : '';
            return `<circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="${stroke}" opacity="${object.opacity}"/>${label}`;
        }
        if (['segment', 'ray', 'infinite-line'].includes(object.type)) {
            let x1 = object.x1, y1 = object.y1, x2 = object.x2, y2 = object.y2;
            if (object.type === 'infinite-line') {
                let dx = x2 - x1, dy = y2 - y1;
                const length = Math.hypot(dx, dy) || 1;
                dx /= length; dy /= length;
                x1 -= dx * 5000; y1 -= dy * 5000;
                x2 += dx * 5000; y2 += dy * 5000;
            }
            const marker = object.type === 'ray' ? ' marker-end="url(#qmx-diagram-arrow)"' : '';
            const mx = (object.x1 + object.x2) / 2;
            const my = (object.y1 + object.y2) / 2;
            const labelParts = [];
            if (object.text) labelParts.push(object.text);
            if (object.showMeasure && object.type === 'segment') labelParts.push(lineMeasure(object).toFixed(1));
            const label = labelParts.length ? `<text x="${mx}" y="${my - 9}" text-anchor="middle" ${labelStyle}>${escapeHtml(labelParts.join(' · '))}</text>` : '';
            return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${commonLine}${marker}/>${label}`;
        }
        if (object.type === 'circle') {
            const label = object.text ? `<text x="${object.cx + object.r + 8}" y="${object.cy - 8}" ${labelStyle}>${escapeHtml(object.text)}</text>` : '';
            const measure = object.showMeasure ? `<text x="${object.cx}" y="${object.cy + object.r + object.fontSize + 5}" text-anchor="middle" ${labelStyle}>r = ${object.r.toFixed(1)}</text>` : '';
            return `<circle cx="${object.cx}" cy="${object.cy}" r="${object.r}" ${commonFill}/>${label}${measure}`;
        }
        if (object.type === 'angle') {
            const a1 = Math.atan2(object.ay - object.vy, object.ax - object.vx);
            const a2 = Math.atan2(object.by - object.vy, object.bx - object.vx);
            let delta = a2 - a1;
            while (delta <= -Math.PI) delta += Math.PI * 2;
            while (delta > Math.PI) delta -= Math.PI * 2;
            const radius = 30;
            const startX = object.vx + Math.cos(a1) * radius;
            const startY = object.vy + Math.sin(a1) * radius;
            const endX = object.vx + Math.cos(a1 + delta) * radius;
            const endY = object.vy + Math.sin(a1 + delta) * radius;
            const sweep = delta >= 0 ? 1 : 0;
            const mid = a1 + delta / 2;
            const labelText = [object.text, object.showMeasure ? `${angleMeasure(object).toFixed(1)}°` : ''].filter(Boolean).join(' · ');
            const label = labelText ? `<text x="${object.vx + Math.cos(mid) * 48}" y="${object.vy + Math.sin(mid) * 48}" text-anchor="middle" dominant-baseline="middle" ${labelStyle}>${escapeHtml(labelText)}</text>` : '';
            return `<line x1="${object.vx}" y1="${object.vy}" x2="${object.ax}" y2="${object.ay}" ${commonLine}/><line x1="${object.vx}" y1="${object.vy}" x2="${object.bx}" y2="${object.by}" ${commonLine}/><path d="M ${startX} ${startY} A ${radius} ${radius} 0 0 ${sweep} ${endX} ${endY}" ${commonLine}/>${label}`;
        }
        if (object.type === 'polygon') {
            const points = object.points.map((point) => `${point.x},${point.y}`).join(' ');
            const xs = object.points.map((point) => point.x);
            const ys = object.points.map((point) => point.y);
            const cx = xs.reduce((sum, value) => sum + value, 0) / Math.max(1, xs.length);
            const cy = ys.reduce((sum, value) => sum + value, 0) / Math.max(1, ys.length);
            const tag = object.closed ? 'polygon' : 'polyline';
            const label = object.text ? `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" ${labelStyle}>${escapeHtml(object.text)}</text>` : '';
            return `<${tag} points="${points}" ${commonFill}/>${label}`;
        }
        return '';
    }

    function generalObjectMarkup(object) {
        const x = object.x;
        const y = object.y;
        const w = object.w;
        const h = object.h;
        const x2 = x + w;
        const y2 = y + h;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const common = `fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${object.dash ? ' stroke-dasharray="8 5"' : ''} opacity="${object.opacity}" vector-effect="non-scaling-stroke"`;
        let content = '';
        switch (object.type) {
            case 'ellipse': content = `<ellipse cx="${cx}" cy="${cy}" rx="${Math.abs(w / 2)}" ry="${Math.abs(h / 2)}" ${common}/>`; break;
            case 'triangle': content = `<polygon points="${cx},${y} ${x2},${y2} ${x},${y2}" ${common}/>`; break;
            case 'diamond': content = `<polygon points="${cx},${y} ${x2},${cy} ${cx},${y2} ${x},${cy}" ${common}/>`; break;
            case 'terminator': content = `<rect x="${Math.min(x, x2)}" y="${Math.min(y, y2)}" width="${Math.abs(w)}" height="${Math.abs(h)}" rx="${Math.min(Math.abs(h) / 2, 36)}" ${common}/>`; break;
            case 'parallelogram': {
                const slant = Math.min(28, Math.abs(w) / 4);
                content = `<polygon points="${x + slant},${y} ${x2},${y} ${x2 - slant},${y2} ${x},${y2}" ${common}/>`;
                break;
            }
            case 'document': {
                const wave = Math.min(14, Math.abs(h) / 5);
                content = `<path d="M ${x} ${y} H ${x2} V ${y2 - wave} C ${x2 - w * .25} ${y2 + wave}, ${x + w * .25} ${y2 - wave * 2}, ${x} ${y2} Z" ${common}/>`;
                break;
            }
            case 'line':
            case 'arrow': content = `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${object.dash ? ' stroke-dasharray="8 5"' : ''}${object.type === 'arrow' ? ' marker-end="url(#qmx-diagram-arrow)"' : ''} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>`; break;
            case 'text': content = textMarkup(object, cx, cy); break;
            default: content = `<rect x="${Math.min(x, x2)}" y="${Math.min(y, y2)}" width="${Math.abs(w)}" height="${Math.abs(h)}" rx="4" ${common}/>`;
        }
        if (!['line', 'arrow', 'text'].includes(object.type)) content += textMarkup(object, cx, cy);
        const rotation = Number(object.rotation) || 0;
        return rotation ? `<g transform="rotate(${rotation} ${cx} ${cy})">${content}</g>` : content;
    }

    function vectorMagnitudeMarkup(object, spec) {
        const dx = object.x2 - object.x1;
        const dy = object.y2 - object.y1;
        const length = Math.hypot(dx, dy) || 1;
        const nx = -dy / length;
        const ny = dx / length;
        const x = (object.x1 + object.x2) / 2 + nx * 17;
        const y = (object.y1 + object.y2) / 2 + ny * 17;
        const parts = [];
        if (object.label) parts.push(object.label);
        if (object.showMagnitude) {
            const magnitude = length / Math.max(1, spec.pixelsPerUnit || 20);
            parts.push(`${magnitude.toFixed(2)} ${spec.unit || 'N'}`);
        }
        if (object.showAngle) {
            let angle = Math.atan2(-dy, dx) * 180 / Math.PI;
            if (angle < 0) angle += 360;
            parts.push(`${angle.toFixed(1)}°`);
        }
        if (!parts.length) return '';
        return `<text x="${x}" y="${y}" fill="${escapeHtml(object.stroke)}" font-size="17" font-weight="bold" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Noto Sans Bengali, sans-serif">${escapeHtml(parts.join(' · '))}</text>`;
    }

    function vectorComponentsMarkup(object) {
        if (!object.showComponents) return '';
        const cornerX = object.x2;
        const cornerY = object.y1;
        const labels = object.componentLabels
            ? `<text x="${(object.x1 + cornerX) / 2}" y="${object.y1 - 9}" fill="${escapeHtml(object.stroke)}" font-size="14" text-anchor="middle">Fₓ</text><text x="${cornerX + 12}" y="${(cornerY + object.y2) / 2}" fill="${escapeHtml(object.stroke)}" font-size="14">Fᵧ</text>`
            : '';
        return `<line x1="${object.x1}" y1="${object.y1}" x2="${cornerX}" y2="${cornerY}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="1.7" stroke-dasharray="7 5" opacity=".78" marker-end="url(#qmx-vector-arrow)"/><line x1="${cornerX}" y1="${cornerY}" x2="${object.x2}" y2="${object.y2}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="1.7" stroke-dasharray="7 5" opacity=".78" marker-end="url(#qmx-vector-arrow)"/>${labels}`;
    }

    function vectorObjectMarkup(object, spec) {
        if (object.type === 'vector') {
            const dash = object.dash ? ' stroke-dasharray="8 5"' : '';
            return `${vectorComponentsMarkup(object)}<line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke" marker-end="url(#qmx-vector-arrow)"/>${vectorMagnitudeMarkup(object, spec)}`;
        }

        if (object.type === 'body') {
            const cx = object.x + object.w / 2;
            const cy = object.y + object.h / 2;
            const common = `fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}" vector-effect="non-scaling-stroke"`;
            const shape = object.shape === 'circle'
                ? `<ellipse cx="${cx}" cy="${cy}" rx="${Math.abs(object.w) / 2}" ry="${Math.abs(object.h) / 2}" ${common}/>`
                : `<rect x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" rx="7" ${common}/>`;
            const text = `<text x="${cx}" y="${cy}" fill="${escapeHtml(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Noto Sans Bengali, sans-serif">${escapeHtml(object.text || 'm')}</text>`;
            const content = `${shape}${text}`;
            return object.rotation
                ? `<g transform="rotate(${object.rotation} ${cx} ${cy})">${content}</g>`
                : content;
        }

        return generalObjectMarkup(object);
    }

    function vectorBackgroundMarkup(spec) {
        let markup = '';
        if (spec.showGrid) {
            markup += `<rect width="100%" height="100%" fill="url(#qmx-geometry-grid)"/>`;
        }
        if (spec.showAxes) {
            const cx = spec.width / 2;
            const cy = spec.height / 2;
            markup += `<line x1="0" y1="${cy}" x2="${spec.width}" y2="${cy}" stroke="#64748b" stroke-width="1.5" marker-end="url(#qmx-vector-arrow)"/><line x1="${cx}" y1="${spec.height}" x2="${cx}" y2="0" stroke="#64748b" stroke-width="1.5" marker-end="url(#qmx-vector-arrow)"/><text x="${spec.width - 20}" y="${cy - 9}" fill="#475569" font-size="14">x</text><text x="${cx + 10}" y="20" fill="#475569" font-size="14">y</text>`;
        }
        return markup;
    }

    function circuitBaseTerminals(symbol) {
        if (symbol === 'ground') return [{ id: 't', x: 0, y: -30 }];
        if (symbol === 'junction') return [{ id: 't', x: 0, y: 0 }];
        return [{ id: 'a', x: -50, y: 0 }, { id: 'b', x: 50, y: 0 }];
    }

    function circuitTerminalWorld(component, terminalId) {
        const terminal = circuitBaseTerminals(component.symbol)
            .find((item) => item.id === terminalId) || circuitBaseTerminals(component.symbol)[0];
        let x = terminal.x * (component.w / 100);
        let y = terminal.y * (component.h / 60);
        if (component.flipX) x = -x;
        const radians = component.rotation * Math.PI / 180;
        return {
            x: component.x + x * Math.cos(radians) - y * Math.sin(radians),
            y: component.y + x * Math.sin(radians) + y * Math.cos(radians)
        };
    }

    function circuitResolveAnchor(spec, anchor, fallback) {
        if (!anchor?.componentId) return fallback;
        const component = spec.objects.find((object) =>
            object.type === 'component' && object.id === anchor.componentId
        );
        return component
            ? circuitTerminalWorld(component, anchor.terminalId)
            : fallback;
    }

    function circuitWirePoints(wire, spec) {
        const start = circuitResolveAnchor(spec, wire.startAnchor, wire.startPoint);
        const end = circuitResolveAnchor(spec, wire.endAnchor, wire.endPoint);
        if (wire.route === 'direct') return [start, end];
        if (wire.horizontalFirst !== false) {
            const middleX = (start.x + end.x) / 2;
            return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end];
        }
        const middleY = (start.y + end.y) / 2;
        return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end];
    }

    function circuitSymbolMarkup(component) {
        const stroke = escapeHtml(component.stroke);
        const fill = escapeHtml(component.fill);
        const width = component.strokeWidth;
        const common = `fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`;
        const lead = `<line x1="-50" y1="0" x2="-28" y2="0" ${common}/><line x1="28" y1="0" x2="50" y2="0" ${common}/>`;
        switch (component.symbol) {
            case 'junction':
                return `<circle cx="0" cy="0" r="7" fill="${stroke}"/>`;
            case 'resistor':
                return `${lead}<polyline points="-28,0 -20,-15 -10,15 0,-15 10,15 20,-15 28,0" ${common}/>`;
            case 'capacitor':
                return `<line x1="-50" y1="0" x2="-9" y2="0" ${common}/><line x1="9" y1="0" x2="50" y2="0" ${common}/><line x1="-9" y1="-24" x2="-9" y2="24" ${common}/><line x1="9" y1="-24" x2="9" y2="24" ${common}/>`;
            case 'inductor':
                return `<line x1="-50" y1="0" x2="-32" y2="0" ${common}/><path d="M -32 0 C -32 -21 -16 -21 -16 0 C -16 -21 0 -21 0 0 C 0 -21 16 -21 16 0 C 16 -21 32 -21 32 0" ${common}/><line x1="32" y1="0" x2="50" y2="0" ${common}/>`;
            case 'cell':
                return `<line x1="-50" y1="0" x2="-8" y2="0" ${common}/><line x1="8" y1="0" x2="50" y2="0" ${common}/><line x1="-8" y1="-17" x2="-8" y2="17" ${common}/><line x1="8" y1="-28" x2="8" y2="28" ${common}/>`;
            case 'battery':
                return `<line x1="-50" y1="0" x2="-24" y2="0" ${common}/><line x1="24" y1="0" x2="50" y2="0" ${common}/><line x1="-24" y1="-16" x2="-24" y2="16" ${common}/><line x1="-13" y1="-27" x2="-13" y2="27" ${common}/><line x1="0" y1="-16" x2="0" y2="16" ${common}/><line x1="13" y1="-27" x2="13" y2="27" ${common}/><line x1="24" y1="-16" x2="24" y2="16" ${common}/>`;
            case 'dc-source':
                return `${lead}<circle cx="0" cy="0" r="27" fill="${fill}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><line x1="-9" y1="-8" x2="9" y2="-8" ${common}/><line x1="0" y1="-17" x2="0" y2="1" ${common}/><line x1="-9" y1="10" x2="9" y2="10" ${common}/>`;
            case 'ac-source':
                return `${lead}<circle cx="0" cy="0" r="27" fill="${fill}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><path d="M -16 2 C -10 -14 -4 -14 2 2 C 8 18 14 18 19 2" ${common}/>`;
            case 'switch':
                return `<line x1="-50" y1="0" x2="-24" y2="0" ${common}/><line x1="24" y1="0" x2="50" y2="0" ${common}/><circle cx="-24" cy="0" r="4" fill="${stroke}"/><circle cx="24" cy="0" r="4" fill="${stroke}"/><line x1="-20" y1="-3" x2="16" y2="-22" ${common}/>`;
            case 'lamp':
                return `${lead}<circle cx="0" cy="0" r="27" fill="${fill}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><line x1="-18" y1="-18" x2="18" y2="18" ${common}/><line x1="-18" y1="18" x2="18" y2="-18" ${common}/>`;
            case 'fuse':
                return `${lead}<rect x="-28" y="-13" width="56" height="26" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><path d="M -21 0 C -12 -10 -3 10 6 0 C 15 -10 20 3 22 0" ${common}/>`;
            case 'diode':
                return `<line x1="-50" y1="0" x2="-23" y2="0" ${common}/><line x1="18" y1="0" x2="50" y2="0" ${common}/><polygon points="-23,-22 -23,22 13,0" fill="${fill}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><line x1="16" y1="-24" x2="16" y2="24" ${common}/>`;
            case 'led':
                return `<line x1="-50" y1="0" x2="-23" y2="0" ${common}/><line x1="18" y1="0" x2="50" y2="0" ${common}/><polygon points="-23,-22 -23,22 13,0" fill="${fill}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><line x1="16" y1="-24" x2="16" y2="24" ${common}/><path d="M 14 -25 L 29 -39 M 22 -21 L 37 -35" ${common}/>`;
            case 'ammeter':
            case 'voltmeter': {
                const meter = component.symbol === 'ammeter' ? 'A' : 'V';
                return `${lead}<circle cx="0" cy="0" r="27" fill="${fill}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/><text x="0" y="1" fill="${stroke}" font-size="27" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${meter}</text>`;
            }
            case 'ground':
                return `<line x1="0" y1="-30" x2="0" y2="3" ${common}/><line x1="-25" y1="3" x2="25" y2="3" ${common}/><line x1="-17" y1="12" x2="17" y2="12" ${common}/><line x1="-9" y1="21" x2="9" y2="21" ${common}/>`;
            default:
                return `${lead}<rect x="-28" y="-18" width="56" height="36" fill="${fill}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
        }
    }

    function circuitComponentMarkup(component) {
        const sx = component.w / 100;
        const sy = component.h / 60;
        const flip = component.flipX ? -1 : 1;
        const caption = [component.label, component.value].filter(Boolean).join(' · ');
        const label = caption
            ? `<text x="${component.x}" y="${component.y + Math.abs(component.h) / 2 + 20}" fill="${escapeHtml(component.stroke)}" font-size="15" font-weight="600" text-anchor="middle" font-family="Arial, Noto Sans Bengali, sans-serif">${escapeHtml(caption)}</text>`
            : '';
        return `<g transform="translate(${component.x} ${component.y}) rotate(${component.rotation}) scale(${flip} 1) scale(${sx} ${sy})" opacity="${component.opacity}">${circuitSymbolMarkup(component)}</g>${label}`;
    }

    function circuitWireMarkup(wire, spec) {
        const points = circuitWirePoints(wire, spec)
            .map((point) => `${point.x},${point.y}`)
            .join(' ');
        const dash = wire.dash ? ' stroke-dasharray="8 5"' : '';
        return `<polyline points="${points}" fill="none" stroke="${escapeHtml(wire.stroke)}" stroke-width="${wire.strokeWidth}"${dash} opacity="${wire.opacity}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    }

    function circuitBackgroundMarkup(spec) {
        return spec.showGrid
            ? `<rect width="100%" height="100%" fill="url(#qmx-geometry-grid)"/>`
            : '';
    }

    function circuitMarkup(spec) {
        const wireMarkup = spec.objects
            .filter((object) => object.type === 'wire')
            .map((object) => circuitWireMarkup(object, spec))
            .join('');
        const componentMarkup = spec.objects
            .filter((object) => object.type === 'component')
            .map(circuitComponentMarkup)
            .join('');
        return circuitBackgroundMarkup(spec) + wireMarkup + componentMarkup;
    }

    function opticsElement(spec) {
        return spec.objects.find((object) => object.type === 'optical-element') || null;
    }

    function opticsObjectArrow(spec) {
        return spec.objects.find((object) => object.type === 'object-arrow') || null;
    }

    function opticsFocalSign(element) {
        if (!element) return 0;
        if (element.opticalType === 'convex-lens' || element.opticalType === 'concave-mirror') {
            return Math.abs(element.focalLength);
        }
        if (element.opticalType === 'concave-lens' || element.opticalType === 'convex-mirror') {
            return -Math.abs(element.focalLength);
        }
        return 0;
    }

    function opticsImage(spec) {
        const element = opticsElement(spec);
        const object = opticsObjectArrow(spec);
        if (!element || !object) return null;

        const u = element.x - object.x;
        if (u <= 2) return null;

        if (element.opticalType === 'plane-mirror') {
            return {
                x: element.x + u,
                height: object.height,
                u,
                v: u,
                magnification: 1,
                virtual: true,
                atInfinity: false
            };
        }

        const f = opticsFocalSign(element);
        const denominator = u - f;
        if (Math.abs(denominator) < 0.001) {
            return {
                x: null,
                height: null,
                u,
                v: Infinity,
                magnification: Infinity,
                virtual: false,
                atInfinity: true
            };
        }

        const v = (f * u) / denominator;
        const isMirror = element.opticalType.includes('mirror');

        return {
            x: isMirror ? element.x - v : element.x + v,
            height: object.height * (-v / u),
            u,
            v,
            magnification: -v / u,
            virtual: v < 0,
            atInfinity: false
        };
    }

    function opticsPointAtX(start, through, targetX) {
        const dx = through.x - start.x;
        if (Math.abs(dx) < 0.001) return { x: targetX, y: through.y };
        const t = (targetX - start.x) / dx;
        return {
            x: targetX,
            y: start.y + (through.y - start.y) * t
        };
    }

    function opticsArrowMarkup(object, spec, image) {
        const topY = spec.axisY - object.height;
        const dash = image ? ' stroke-dasharray="8 5"' : '';
        const labelY = object.height >= 0 ? topY - 12 : topY + 24;
        return `<line x1="${object.x}" y1="${spec.axisY}" x2="${object.x}" y2="${topY}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke" marker-end="url(#qmx-optics-arrow)"/><text x="${object.x}" y="${labelY}" fill="${escapeHtml(object.stroke)}" font-size="15" font-weight="700" text-anchor="middle">${escapeHtml(object.label || (image ? 'Image' : 'Object'))}</text>`;
    }

    function opticsElementMarkup(object, spec) {
        const top = spec.axisY - object.height / 2;
        const bottom = spec.axisY + object.height / 2;
        const stroke = escapeHtml(object.stroke);
        const fill = escapeHtml(object.fill);
        const width = object.strokeWidth;
        let symbol = '';

        if (object.opticalType === 'convex-lens') {
            symbol = `<path d="M ${object.x} ${top} C ${object.x - 35} ${top + object.height * .2}, ${object.x - 35} ${bottom - object.height * .2}, ${object.x} ${bottom} C ${object.x + 35} ${bottom - object.height * .2}, ${object.x + 35} ${top + object.height * .2}, ${object.x} ${top} Z" fill="${fill}" fill-opacity=".6" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
        } else if (object.opticalType === 'concave-lens') {
            symbol = `<path d="M ${object.x - 20} ${top} C ${object.x + 12} ${top + object.height * .2}, ${object.x + 12} ${bottom - object.height * .2}, ${object.x - 20} ${bottom} L ${object.x + 20} ${bottom} C ${object.x - 12} ${bottom - object.height * .2}, ${object.x - 12} ${top + object.height * .2}, ${object.x + 20} ${top} Z" fill="${fill}" fill-opacity=".55" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
        } else if (object.opticalType === 'plane-mirror') {
            symbol = `<line x1="${object.x}" y1="${top}" x2="${object.x}" y2="${bottom}" stroke="${stroke}" stroke-width="${width + 1}" vector-effect="non-scaling-stroke"/>`;
        } else {
            const bow = object.opticalType === 'concave-mirror' ? -32 : 32;
            symbol = `<path d="M ${object.x} ${top} Q ${object.x + bow} ${spec.axisY} ${object.x} ${bottom}" fill="none" stroke="${stroke}" stroke-width="${width + 1}" vector-effect="non-scaling-stroke"/>`;
        }

        const label = object.label
            ? `<text x="${object.x}" y="${bottom + 24}" fill="${stroke}" font-size="15" font-weight="600" text-anchor="middle">${escapeHtml(object.label)}</text>`
            : '';
        return symbol + label;
    }

    function opticsFocalMarkup(spec) {
        const element = opticsElement(spec);
        if (!element || !spec.showFocalPoints || element.opticalType === 'plane-mirror') return '';

        const f = Math.abs(element.focalLength);
        const isLens = element.opticalType.includes('lens');
        const points = [];

        if (isLens) {
            points.push({ x: element.x - f, label: 'F' }, { x: element.x + f, label: 'F′' });
            if (spec.showTwoF) {
                points.push({ x: element.x - 2 * f, label: '2F' }, { x: element.x + 2 * f, label: '2F′' });
            }
        } else {
            const direction = element.opticalType === 'concave-mirror' ? -1 : 1;
            points.push({ x: element.x + direction * f, label: 'F' });
            if (spec.showTwoF) points.push({ x: element.x + direction * 2 * f, label: 'C' });
        }

        return points.map((point) => `<circle cx="${point.x}" cy="${spec.axisY}" r="4.5" fill="#dc2626"/><text x="${point.x}" y="${spec.axisY + 21}" fill="#b91c1c" font-size="14" font-weight="700" text-anchor="middle">${point.label}</text>`).join('');
    }

    function opticsPrincipalMarkup(spec) {
        if (!spec.showPrincipalRays) return '';

        const element = opticsElement(spec);
        const object = opticsObjectArrow(spec);
        const image = opticsImage(spec);

        if (!element || !object || !image || image.atInfinity) return '';

        const objectTop = { x: object.x, y: spec.axisY - object.height };
        const imageTop = { x: image.x, y: spec.axisY - image.height };
        const isMirror = element.opticalType.includes('mirror');
        const virtual = image.virtual || element.opticalType === 'plane-mirror';
        const boundaryX = isMirror ? 0 : spec.width;
        const hits = [
            { x: element.x, y: objectTop.y },
            { x: element.x, y: spec.axisY }
        ];

        return hits.map((hit) => {
            const actualEnd = virtual ? opticsPointAtX(imageTop, hit, boundaryX) : imageTop;
            const extension = virtual
                ? `<polyline points="${hit.x},${hit.y} ${imageTop.x},${imageTop.y}" fill="none" stroke="${escapeHtml(spec.virtualRayColor)}" stroke-width="2" stroke-dasharray="8 6" vector-effect="non-scaling-stroke"/>`
                : '';
            return `<polyline points="${objectTop.x},${objectTop.y} ${hit.x},${hit.y}" fill="none" stroke="${escapeHtml(spec.rayColor)}" stroke-width="2.4" marker-end="url(#qmx-optics-arrow)" vector-effect="non-scaling-stroke"/><polyline points="${hit.x},${hit.y} ${actualEnd.x},${actualEnd.y}" fill="none" stroke="${escapeHtml(spec.rayColor)}" stroke-width="2.4" marker-end="url(#qmx-optics-arrow)" vector-effect="non-scaling-stroke"/>${extension}`;
        }).join('');
    }

    function opticsObjectMarkup(object, spec) {
        if (object.type === 'optical-element') return opticsElementMarkup(object, spec);
        if (object.type === 'object-arrow') return opticsArrowMarkup(object, spec, false);

        if (object.type === 'manual-ray') {
            const dash = object.dash ? ' stroke-dasharray="8 5"' : '';
            const marker = object.arrow ? ' marker-end="url(#qmx-optics-arrow)"' : '';
            const label = object.label
                ? `<text x="${(object.x1 + object.x2) / 2}" y="${(object.y1 + object.y2) / 2 - 10}" fill="${escapeHtml(object.stroke)}" font-size="14" font-weight="600" text-anchor="middle">${escapeHtml(object.label)}</text>`
                : '';
            return `<line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash}${marker} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>${label}`;
        }

        return `<text x="${object.x}" y="${object.y}" fill="${escapeHtml(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})">${escapeHtml(object.text)}</text>`;
    }

    function rayOpticsMarkup(spec) {
        let markup = spec.showGrid
            ? `<rect width="100%" height="100%" fill="url(#qmx-geometry-grid)"/>`
            : '';

        if (spec.showAxis) {
            markup += `<line x1="20" y1="${spec.axisY}" x2="${spec.width - 20}" y2="${spec.axisY}" stroke="#64748b" stroke-width="1.8" marker-end="url(#qmx-optics-arrow)" vector-effect="non-scaling-stroke"/><text x="${spec.width - 35}" y="${spec.axisY - 10}" fill="#475569" font-size="14">Principal axis</text>`;
        }

        markup += opticsFocalMarkup(spec);
        markup += opticsPrincipalMarkup(spec);
        markup += spec.objects.map((object) => opticsObjectMarkup(object, spec)).join('');

        const image = opticsImage(spec);
        if (spec.showImage && image && !image.atInfinity) {
            markup += opticsArrowMarkup({
                x: image.x,
                height: image.height,
                label: image.virtual ? 'Virtual image' : 'Image',
                stroke: image.virtual ? spec.virtualRayColor : '#dc2626',
                strokeWidth: 4,
                opacity: 1
            }, spec, image.virtual);
        }

        if (spec.showMeasurements && image) {
            const text = image.atInfinity
                ? 'Image at infinity'
                : `u = ${image.u.toFixed(1)} · v = ${image.v.toFixed(1)} · m = ${image.magnification.toFixed(2)}`;
            markup += `<text x="24" y="30" fill="#334155" font-size="15" font-weight="600">${escapeHtml(text)}</text>`;
        }

        return markup;
    }

    function waveformPlotArea(spec) {
        return {
            left: 76,
            top: 45,
            right: spec.width - 35,
            bottom: spec.height - 68
        };
    }

    function waveformTimeToX(time, spec) {
        const area = waveformPlotArea(spec);
        return area.left + (time / spec.duration) * (area.right - area.left);
    }

    function waveformValueToY(value, spec) {
        const area = waveformPlotArea(spec);
        return area.bottom -
            ((value - spec.yMin) / (spec.yMax - spec.yMin)) *
                (area.bottom - area.top);
    }

    function waveformValueAt(object, time) {
        const cycles = object.frequency * time + (object.phase / 360);
        const fraction = ((cycles % 1) + 1) % 1;
        let base = 0;

        switch (object.waveType) {
            case 'cosine':
                base = Math.cos(2 * Math.PI * cycles);
                break;
            case 'square':
            case 'pulse':
                base = fraction < object.dutyCycle / 100
                    ? 1
                    : (object.bipolar ? -1 : 0);
                break;
            case 'triangle':
                base = 1 - 4 * Math.abs(fraction - 0.5);
                if (!object.bipolar) base = (base + 1) / 2;
                break;
            case 'sawtooth':
                base = 2 * fraction - 1;
                if (!object.bipolar) base = fraction;
                break;
            case 'sine':
            default:
                base = Math.sin(2 * Math.PI * cycles);
                break;
        }

        const envelope = object.damping > 0
            ? Math.exp(-object.damping * time)
            : 1;

        return object.offset + object.amplitude * base * envelope;
    }

    function waveformPath(object, spec) {
        const samples = Math.min(
            1400,
            Math.max(320, Math.ceil(spec.duration * object.frequency * 90))
        );
        const commands = [];
        let previousValue = null;

        for (let index = 0; index <= samples; index += 1) {
            const time = (index / samples) * spec.duration;
            const value = waveformValueAt(object, time);
            const x = waveformTimeToX(time, spec);
            const y = waveformValueToY(value, spec);

            if (
                previousValue !== null &&
                ['square', 'pulse'].includes(object.waveType) &&
                Math.abs(value - previousValue) > Math.max(0.001, object.amplitude * 0.5)
            ) {
                commands.push(`L ${x.toFixed(2)} ${waveformValueToY(previousValue, spec).toFixed(2)}`);
            }

            commands.push(`${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
            previousValue = value;
        }

        return commands.join(' ');
    }

    function waveformGridMarkup(spec) {
        const area = waveformPlotArea(spec);
        const width = area.right - area.left;
        const height = area.bottom - area.top;
        const parts = [
            `<rect x="${area.left}" y="${area.top}" width="${width}" height="${height}" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4"/>`
        ];

        for (let index = 0; index <= spec.xDivisions; index += 1) {
            const time = (index / spec.xDivisions) * spec.duration;
            const x = waveformTimeToX(time, spec);

            if (spec.showGrid) {
                parts.push(`<line x1="${x}" y1="${area.top}" x2="${x}" y2="${area.bottom}" stroke="#dbe4ef" stroke-width="1"/>`);
            }
            if (spec.showValues) {
                parts.push(`<text x="${x}" y="${area.bottom + 22}" fill="#475569" font-size="12" text-anchor="middle">${Number(time.toFixed(4))}</text>`);
            }
        }

        for (let index = 0; index <= spec.yDivisions; index += 1) {
            const value = spec.yMin +
                (index / spec.yDivisions) * (spec.yMax - spec.yMin);
            const y = waveformValueToY(value, spec);

            if (spec.showGrid) {
                parts.push(`<line x1="${area.left}" y1="${y}" x2="${area.right}" y2="${y}" stroke="#dbe4ef" stroke-width="1"/>`);
            }
            if (spec.showValues) {
                parts.push(`<text x="${area.left - 10}" y="${y}" fill="#475569" font-size="12" text-anchor="end" dominant-baseline="middle">${Number(value.toFixed(4))}</text>`);
            }
        }

        if (spec.showAxes) {
            const zeroY = spec.yMin <= 0 && spec.yMax >= 0
                ? waveformValueToY(0, spec)
                : area.bottom;
            parts.push(`<line x1="${area.left}" y1="${zeroY}" x2="${area.right}" y2="${zeroY}" stroke="#334155" stroke-width="1.8"/>`);
            parts.push(`<line x1="${area.left}" y1="${area.top}" x2="${area.left}" y2="${area.bottom}" stroke="#334155" stroke-width="1.8"/>`);
        }

        parts.push(`<text x="${(area.left + area.right) / 2}" y="${spec.height - 20}" fill="#0f172a" font-size="15" font-weight="600" text-anchor="middle">${escapeHtml(spec.xLabel)}</text>`);
        parts.push(`<text x="23" y="${(area.top + area.bottom) / 2}" fill="#0f172a" font-size="15" font-weight="600" text-anchor="middle" transform="rotate(-90 23 ${(area.top + area.bottom) / 2})">${escapeHtml(spec.yLabel)}</text>`);

        if (spec.showLegend) {
            let y = area.top + 18;
            spec.objects.filter((object) => object.type === 'waveform' && object.visible).forEach((object) => {
                const dash = object.dash ? ' stroke-dasharray="8 5"' : '';
                parts.push(`<line x1="${area.right - 145}" y1="${y}" x2="${area.right - 110}" y2="${y}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash}/>`);
                parts.push(`<text x="${area.right - 102}" y="${y}" fill="#334155" font-size="12" dominant-baseline="middle">${escapeHtml(object.label)}</text>`);
                y += 20;
            });
        }

        return parts.join('');
    }

    function waveformObjectMarkup(object, spec) {
        if (object.type === 'waveform') {
            if (!object.visible) return '';
            const dash = object.dash ? ' stroke-dasharray="8 5"' : '';
            return `<path d="${waveformPath(object, spec)}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
        }

        const area = waveformPlotArea(spec);
        const x = waveformTimeToX(clamp(object.time, 0, spec.duration, 0), spec);
        const y = waveformValueToY(clamp(object.value, spec.yMin, spec.yMax, 0), spec);

        if (object.type === 'marker') {
            const vertical = object.showVertical
                ? `<line x1="${x}" y1="${area.top}" x2="${x}" y2="${area.bottom}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.6" stroke-dasharray="6 5" opacity=".75"/>`
                : '';
            const horizontal = object.showHorizontal
                ? `<line x1="${area.left}" y1="${y}" x2="${area.right}" y2="${y}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.6" stroke-dasharray="6 5" opacity=".75"/>`
                : '';
            return `${vertical}${horizontal}<circle cx="${x}" cy="${y}" r="6" fill="${escapeHtml(object.stroke)}" opacity="${object.opacity}"/><text x="${x + 10}" y="${y - 10}" fill="${escapeHtml(object.stroke)}" font-size="13" font-weight="700">${escapeHtml(object.label)}</text>`;
        }

        return `<text x="${x}" y="${y}" fill="${escapeHtml(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${x} ${y})">${escapeHtml(object.text)}</text>`;
    }

    function waveformMarkup(spec) {
        const area = waveformPlotArea(spec);
        const clipId = `qmx-waveform-clip-${String(spec.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
        const series = spec.objects
            .filter((object) => object.type === 'waveform')
            .map((object) => waveformObjectMarkup(object, spec))
            .join('');
        const annotations = spec.objects
            .filter((object) => object.type !== 'waveform')
            .map((object) => waveformObjectMarkup(object, spec))
            .join('');

        return `${waveformGridMarkup(spec)}<defs><clipPath id="${clipId}"><rect x="${area.left}" y="${area.top}" width="${area.right - area.left}" height="${area.bottom - area.top}"/></clipPath></defs><g clip-path="url(#${clipId})">${series}</g>${annotations}`;
    }

    function vennSets(spec) {
        return spec.objects.filter((object) => object.type === 'set');
    }

    function vennSetById(spec, id) {
        return vennSets(spec).find((object) => object.id === id) || null;
    }

    function vennResolvedShadeSets(spec) {
        const sets = vennSets(spec);
        const a = vennSetById(spec, spec.shadeSetA) || sets[0] || null;
        const b = vennSetById(spec, spec.shadeSetB) ||
            sets.find((object) => object.id !== a?.id) || null;
        return { a, b };
    }

    function vennUniversalBounds(spec) {
        const padding = spec.universalPadding;
        return {
            x: padding,
            y: padding,
            width: spec.width - padding * 2,
            height: spec.height - padding * 2
        };
    }

    function vennEllipseTag(object, attributes) {
        const transform = object.rotation
            ? ` transform="rotate(${object.rotation} ${object.x} ${object.y})"`
            : '';
        return `<ellipse cx="${object.x}" cy="${object.y}" rx="${object.rx}" ry="${object.ry}"${transform}${attributes || ''}/>`;
    }

    function vennShadeMarkup(spec) {
        if (spec.shadeMode === 'none') return '';

        const { a, b } = vennResolvedShadeSets(spec);
        if (!a) return '';

        const bounds = vennUniversalBounds(spec);
        const baseId = `qmx-venn-${String(spec.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
        const fillAttrs = ` fill="${escapeHtml(spec.shadeColor)}" fill-opacity="${spec.shadeOpacity}"`;
        const universeRect = `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="4"${fillAttrs}/>`;
        const aFill = vennEllipseTag(a, fillAttrs);
        const bFill = b ? vennEllipseTag(b, fillAttrs) : '';

        if (spec.shadeMode === 'a') return aFill;
        if (spec.shadeMode === 'b') return bFill;
        if (spec.shadeMode === 'union') return aFill + bFill;

        if (spec.shadeMode === 'intersection' && b) {
            return `<defs><clipPath id="${baseId}-clip-a">${vennEllipseTag(a, ' fill="#fff"')}</clipPath></defs><g clip-path="url(#${baseId}-clip-a)">${vennEllipseTag(b, fillAttrs)}</g>`;
        }

        if (spec.shadeMode === 'a-only' && b) {
            return `<defs><mask id="${baseId}-mask-b"><rect width="100%" height="100%" fill="#fff"/>${vennEllipseTag(b, ' fill="#000"')}</mask></defs><g mask="url(#${baseId}-mask-b)">${aFill}</g>`;
        }

        if (spec.shadeMode === 'b-only' && b) {
            return `<defs><mask id="${baseId}-mask-a"><rect width="100%" height="100%" fill="#fff"/>${vennEllipseTag(a, ' fill="#000"')}</mask></defs><g mask="url(#${baseId}-mask-a)">${bFill}</g>`;
        }

        if (spec.shadeMode === 'symmetric-difference' && b) {
            return `<defs><mask id="${baseId}-mask-a"><rect width="100%" height="100%" fill="#fff"/>${vennEllipseTag(a, ' fill="#000"')}</mask><mask id="${baseId}-mask-b"><rect width="100%" height="100%" fill="#fff"/>${vennEllipseTag(b, ' fill="#000"')}</mask></defs><g mask="url(#${baseId}-mask-b)">${aFill}</g><g mask="url(#${baseId}-mask-a)">${bFill}</g>`;
        }

        if (spec.shadeMode === 'complement-a') {
            return `<defs><mask id="${baseId}-mask-a"><rect width="100%" height="100%" fill="#fff"/>${vennEllipseTag(a, ' fill="#000"')}</mask></defs><g mask="url(#${baseId}-mask-a)">${universeRect}</g>`;
        }

        if (spec.shadeMode === 'complement-b' && b) {
            return `<defs><mask id="${baseId}-mask-b"><rect width="100%" height="100%" fill="#fff"/>${vennEllipseTag(b, ' fill="#000"')}</mask></defs><g mask="url(#${baseId}-mask-b)">${universeRect}</g>`;
        }

        if (spec.shadeMode === 'complement-union' && b) {
            return `<defs><mask id="${baseId}-mask-union"><rect width="100%" height="100%" fill="#fff"/>${vennEllipseTag(a, ' fill="#000"')}${vennEllipseTag(b, ' fill="#000"')}</mask></defs><g mask="url(#${baseId}-mask-union)">${universeRect}</g>`;
        }

        return '';
    }

    function vennSetMarkup(object) {
        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const transform = object.rotation
            ? ` transform="rotate(${object.rotation} ${object.x} ${object.y})"`
            : '';
        const labelY = object.labelPosition === 'bottom'
            ? object.y + object.ry + 25
            : object.y - object.ry - 14;

        return `<ellipse cx="${object.x}" cy="${object.y}" rx="${object.rx}" ry="${object.ry}"${transform} fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/><text x="${object.x}" y="${labelY}" fill="${escapeHtml(object.stroke)}" font-size="20" font-weight="700" text-anchor="middle">${escapeHtml(object.label)}</text>`;
    }

    function vennTextMarkup(object) {
        return `<text x="${object.x}" y="${object.y}" fill="${escapeHtml(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})">${escapeHtml(object.text)}</text>`;
    }

    function vennMarkup(spec) {
        const bounds = vennUniversalBounds(spec);
        const universal = spec.showUniversalSet
            ? `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="5" fill="none" stroke="#334155" stroke-width="2.5" vector-effect="non-scaling-stroke"/><text x="${bounds.x + 15}" y="${bounds.y + 27}" fill="#0f172a" font-size="20" font-weight="700">${escapeHtml(spec.universalLabel)}</text>`
            : '';
        const sets = spec.objects
            .filter((object) => object.type === 'set')
            .map(vennSetMarkup)
            .join('');
        const texts = spec.objects
            .filter((object) => object.type === 'text')
            .map(vennTextMarkup)
            .join('');

        return universal + vennShadeMarkup(spec) + sets + texts;
    }

    function timelineAxisArea(spec) {
        return spec.orientation === 'vertical'
            ? {
                start: 70,
                end: spec.height - 70,
                fixed: spec.width / 2
            }
            : {
                start: 75,
                end: spec.width - 75,
                fixed: spec.height / 2
            };
    }

    function timelineAxisEndpoints(spec) {
        let start;
        let end;

        if (spec.scaleMode === 'date') {
            start = Date.parse(spec.axisStart);
            end = Date.parse(spec.axisEnd);
        } else {
            start = Number(spec.axisStart);
            end = Number(spec.axisEnd);
        }

        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            if (spec.scaleMode === 'date') {
                start = Date.UTC(2020, 0, 1);
                end = Date.UTC(2025, 0, 1);
            } else {
                start = 0;
                end = 100;
            }
        }

        return { start, end };
    }

    function timelinePositionToValue(position, spec) {
        const { start, end } = timelineAxisEndpoints(spec);
        const value = start + clamp(position, 0, 1, 0) * (end - start);

        if (spec.scaleMode === 'date') {
            return new Date(value).toISOString().slice(0, 10);
        }

        if (spec.scaleMode === 'year') {
            return String(Math.round(value));
        }

        return String(Number(value.toFixed(4)));
    }

    function timelineFormatPosition(position, spec) {
        const value = timelinePositionToValue(position, spec);

        if (spec.scaleMode === 'date') {
            const date = new Date(`${value}T00:00:00Z`);
            return spec.tickCount <= 8
                ? date.toLocaleDateString('en', {
                    year: 'numeric',
                    month: 'short',
                    timeZone: 'UTC'
                })
                : String(date.getUTCFullYear());
        }

        return value;
    }

    function timelinePoint(position, lane, spec) {
        const area = timelineAxisArea(spec);
        const length = area.end - area.start;
        const p = clamp(position, 0, 1, 0.5);
        const laneOffset = lane * spec.laneSpacing;

        return spec.orientation === 'vertical'
            ? {
                x: area.fixed + laneOffset,
                y: area.start + p * length,
                axisX: area.fixed,
                axisY: area.start + p * length
            }
            : {
                x: area.start + p * length,
                y: area.fixed + laneOffset,
                axisX: area.start + p * length,
                axisY: area.fixed
            };
    }

    function timelineGridMarkup(spec) {
        if (!spec.showGrid) return '';

        const parts = [];

        for (let index = 0; index <= spec.tickCount; index += 1) {
            const p = index / spec.tickCount;
            const point = timelinePoint(p, 0, spec);

            if (spec.orientation === 'vertical') {
                parts.push(`<line x1="35" y1="${point.axisY}" x2="${spec.width - 35}" y2="${point.axisY}" stroke="#e2e8f0" stroke-width="1"/>`);
            } else {
                parts.push(`<line x1="${point.axisX}" y1="35" x2="${point.axisX}" y2="${spec.height - 35}" stroke="#e2e8f0" stroke-width="1"/>`);
            }
        }

        return parts.join('');
    }

    function timelineAxisMarkup(spec) {
        const area = timelineAxisArea(spec);
        const parts = [];

        if (spec.orientation === 'vertical') {
            parts.push(`<line x1="${area.fixed}" y1="${area.start}" x2="${area.fixed}" y2="${area.end}" stroke="${escapeHtml(spec.axisColor)}" stroke-width="${spec.axisWidth}" vector-effect="non-scaling-stroke"/>`);
        } else {
            parts.push(`<line x1="${area.start}" y1="${area.fixed}" x2="${area.end}" y2="${area.fixed}" stroke="${escapeHtml(spec.axisColor)}" stroke-width="${spec.axisWidth}" vector-effect="non-scaling-stroke"/>`);
        }

        for (let index = 0; index <= spec.tickCount; index += 1) {
            const p = index / spec.tickCount;
            const point = timelinePoint(p, 0, spec);

            if (spec.orientation === 'vertical') {
                parts.push(`<line x1="${point.axisX - 8}" y1="${point.axisY}" x2="${point.axisX + 8}" y2="${point.axisY}" stroke="${escapeHtml(spec.axisColor)}" stroke-width="1.6"/>`);
                if (spec.showTickLabels) {
                    parts.push(`<text x="${point.axisX + 16}" y="${point.axisY}" fill="#475569" font-size="12" dominant-baseline="middle">${escapeHtml(timelineFormatPosition(p, spec))}</text>`);
                }
            } else {
                parts.push(`<line x1="${point.axisX}" y1="${point.axisY - 8}" x2="${point.axisX}" y2="${point.axisY + 8}" stroke="${escapeHtml(spec.axisColor)}" stroke-width="1.6"/>`);
                if (spec.showTickLabels) {
                    parts.push(`<text x="${point.axisX}" y="${point.axisY + 24}" fill="#475569" font-size="12" text-anchor="middle">${escapeHtml(timelineFormatPosition(p, spec))}</text>`);
                }
            }
        }

        return parts.join('');
    }

    function timelineEventCard(object, spec) {
        const point = timelinePoint(object.position, object.lane, spec);

        if (spec.orientation === 'horizontal') {
            return {
                x: point.x - object.cardWidth / 2,
                y: object.lane < 0 ? point.y - object.cardHeight : point.y,
                point
            };
        }

        return {
            x: object.lane < 0 ? point.x - object.cardWidth : point.x,
            y: point.y - object.cardHeight / 2,
            point
        };
    }

    function timelineEventMarkup(object, spec) {
        const card = timelineEventCard(object, spec);
        const point = card.point;
        const dateText = object.dateLabel || timelineFormatPosition(object.position, spec);
        const marker = object.type === 'milestone'
            ? `<rect x="${point.axisX - object.markerSize}" y="${point.axisY - object.markerSize}" width="${object.markerSize * 2}" height="${object.markerSize * 2}" fill="${escapeHtml(object.color)}" transform="rotate(45 ${point.axisX} ${point.axisY})"/>`
            : `<circle cx="${point.axisX}" cy="${point.axisY}" r="${object.markerSize}" fill="${escapeHtml(object.color)}"/>`;
        const connector = spec.showConnectors && object.lane !== 0
            ? `<line x1="${point.axisX}" y1="${point.axisY}" x2="${point.x}" y2="${point.y}" stroke="${escapeHtml(object.color)}" stroke-width="2" vector-effect="non-scaling-stroke"/>`
            : '';

        return `${connector}${marker}<rect x="${card.x}" y="${card.y}" width="${object.cardWidth}" height="${object.cardHeight}" rx="10" fill="#ffffff" stroke="${escapeHtml(object.color)}" stroke-width="2" vector-effect="non-scaling-stroke"/><rect x="${card.x}" y="${card.y}" width="7" height="${object.cardHeight}" rx="4" fill="${escapeHtml(object.color)}"/><text x="${card.x + 16}" y="${card.y + 22}" fill="#0f172a" font-size="15" font-weight="700">${escapeHtml(object.title)}</text>${object.showDate ? `<text x="${card.x + 16}" y="${card.y + 42}" fill="${escapeHtml(object.color)}" font-size="12" font-weight="600">${escapeHtml(dateText)}</text>` : ''}${object.description ? `<text x="${card.x + 16}" y="${card.y + 57}" fill="#64748b" font-size="11">${escapeHtml(object.description)}</text>` : ''}`;
    }

    function timelinePeriodMarkup(object, spec) {
        const start = timelinePoint(object.startPosition, object.lane, spec);
        const end = timelinePoint(object.endPosition, object.lane, spec);
        const horizontal = spec.orientation === 'horizontal';
        const x = horizontal ? Math.min(start.x, end.x) : start.x - object.thickness / 2;
        const y = horizontal ? start.y - object.thickness / 2 : Math.min(start.y, end.y);
        const width = horizontal ? Math.abs(end.x - start.x) : object.thickness;
        const height = horizontal ? object.thickness : Math.abs(end.y - start.y);
        const startText = object.startLabel || timelineFormatPosition(object.startPosition, spec);
        const endText = object.endLabel || timelineFormatPosition(object.endPosition, spec);

        return `<rect x="${x}" y="${y}" width="${Math.max(3, width)}" height="${Math.max(3, height)}" rx="8" fill="${escapeHtml(object.color)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.color)}" stroke-width="2" opacity="${object.opacity}" vector-effect="non-scaling-stroke"/><text x="${x + width / 2}" y="${y + height / 2}" fill="${escapeHtml(object.color)}" font-size="14" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeHtml(object.title)}</text>${object.showDates && horizontal ? `<text x="${x}" y="${y - 8}" fill="#475569" font-size="11" text-anchor="start">${escapeHtml(startText)}</text><text x="${x + width}" y="${y - 8}" fill="#475569" font-size="11" text-anchor="end">${escapeHtml(endText)}</text>` : ''}`;
    }

    function timelineTextMarkup(object) {
        return `<text x="${object.x}" y="${object.y}" fill="${escapeHtml(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})">${escapeHtml(object.text)}</text>`;
    }

    function timelineMarkup(spec) {
        const objects = spec.objects.map((object) => {
            if (object.type === 'period') return timelinePeriodMarkup(object, spec);
            if (object.type === 'event' || object.type === 'milestone') {
                return timelineEventMarkup(object, spec);
            }
            return timelineTextMarkup(object);
        }).join('');

        return timelineGridMarkup(spec) + timelineAxisMarkup(spec) + objects;
    }

    function dataFlowNodes(spec) {
        return spec.objects.filter((object) =>
            ['process', 'external-entity', 'data-store'].includes(object.type)
        );
    }

    function dataFlowObjectById(spec, id) {
        return spec.objects.find((object) => object.id === id) || null;
    }

    function dataFlowAnchor(object, targetX, targetY, spec) {
        const dx = targetX - object.x;
        const dy = targetY - object.y;

        if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) {
            return { x: object.x, y: object.y };
        }

        if (object.type === 'process' && spec.notation === 'yourdon') {
            const rx = object.width / 2;
            const ry = object.height / 2;
            const scale = 1 / Math.sqrt(
                (dx * dx) / (rx * rx) +
                (dy * dy) / (ry * ry)
            );
            return {
                x: object.x + dx * scale,
                y: object.y + dy * scale
            };
        }

        const halfW = object.width / 2;
        const halfH = object.height / 2;
        const scaleX = Math.abs(dx) > 0 ? halfW / Math.abs(dx) : Infinity;
        const scaleY = Math.abs(dy) > 0 ? halfH / Math.abs(dy) : Infinity;
        const scale = Math.min(scaleX, scaleY);

        return {
            x: object.x + dx * scale,
            y: object.y + dy * scale
        };
    }

    function dataFlowGeometry(object, spec) {
        const from = dataFlowObjectById(spec, object.fromId);
        const to = dataFlowObjectById(spec, object.toId);

        if (!from || !to) return null;

        const start = dataFlowAnchor(from, to.x, to.y, spec);
        const end = dataFlowAnchor(to, from.x, from.y, spec);
        const route = object.route || spec.connectorRoute;
        let path;
        let labelX;
        let labelY;

        if (route === 'straight') {
            path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
            labelX = (start.x + end.x) / 2;
            labelY = (start.y + end.y) / 2;
        } else if (route === 'curved') {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const controlX = (start.x + end.x) / 2 - dy * 0.18;
            const controlY = (start.y + end.y) / 2 + dx * 0.18;
            path = `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;
            labelX = 0.25 * start.x + 0.5 * controlX + 0.25 * end.x;
            labelY = 0.25 * start.y + 0.5 * controlY + 0.25 * end.y;
        } else if (object.horizontalFirst) {
            const midX = (start.x + end.x) / 2;
            path = `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
            labelX = midX;
            labelY = (start.y + end.y) / 2;
        } else {
            const midY = (start.y + end.y) / 2;
            path = `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`;
            labelX = (start.x + end.x) / 2;
            labelY = midY;
        }

        return {
            path,
            labelX: labelX + object.labelOffsetX,
            labelY: labelY + object.labelOffsetY
        };
    }

    function dataFlowGridMarkup(spec) {
        if (!spec.showGrid) return '';

        const size = spec.gridSize;
        const patternId = `qmx-dfd-grid-${String(spec.id).replace(/[^A-Za-z0-9_-]/g, '')}`;

        return `<defs><pattern id="${patternId}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#${patternId})" pointer-events="none"/>`;
    }

    function dataFlowProcessMarkup(object, spec) {
        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const left = object.x - object.width / 2;
        const top = object.y - object.height / 2;

        if (spec.notation === 'gane-sarson') {
            const numberWidth = Math.min(48, object.width * 0.28);
            return `<rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="14" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/><line x1="${left + numberWidth}" y1="${top}" x2="${left + numberWidth}" y2="${top + object.height}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" vector-effect="non-scaling-stroke"/><text x="${left + numberWidth / 2}" y="${object.y}" fill="${escapeHtml(object.stroke)}" font-size="18" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeHtml(object.number)}</text><text x="${left + numberWidth + (object.width - numberWidth) / 2}" y="${object.y - 5}" fill="#0f172a" font-size="17" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeHtml(object.label)}</text>${object.description ? `<text x="${left + numberWidth + (object.width - numberWidth) / 2}" y="${object.y + 20}" fill="#64748b" font-size="11" text-anchor="middle">${escapeHtml(object.description)}</text>` : ''}`;
        }

        return `<ellipse cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/><text x="${object.x}" y="${object.y - 13}" fill="${escapeHtml(object.stroke)}" font-size="15" font-weight="700" text-anchor="middle">${escapeHtml(object.number)}</text><text x="${object.x}" y="${object.y + 10}" fill="#0f172a" font-size="17" font-weight="700" text-anchor="middle">${escapeHtml(object.label)}</text>${object.description ? `<text x="${object.x}" y="${object.y + 31}" fill="#64748b" font-size="11" text-anchor="middle">${escapeHtml(object.description)}</text>` : ''}`;
    }

    function dataFlowExternalMarkup(object) {
        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const left = object.x - object.width / 2;
        const top = object.y - object.height / 2;

        return `<rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="4" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/><text x="${object.x}" y="${object.y - 3}" fill="#0f172a" font-size="17" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeHtml(object.label)}</text>${object.description ? `<text x="${object.x}" y="${object.y + 23}" fill="#64748b" font-size="11" text-anchor="middle">${escapeHtml(object.description)}</text>` : ''}`;
    }

    function dataFlowStoreMarkup(object) {
        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const left = object.x - object.width / 2;
        const top = object.y - object.height / 2;
        const codeWidth = Math.min(48, object.width * 0.25);

        return `<rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="none" opacity="${object.opacity}"/><line x1="${left}" y1="${top}" x2="${left + object.width}" y2="${top}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} vector-effect="non-scaling-stroke"/><line x1="${left}" y1="${top + object.height}" x2="${left + object.width}" y2="${top + object.height}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} vector-effect="non-scaling-stroke"/><line x1="${left + codeWidth}" y1="${top}" x2="${left + codeWidth}" y2="${top + object.height}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" vector-effect="non-scaling-stroke"/><text x="${left + codeWidth / 2}" y="${object.y}" fill="${escapeHtml(object.stroke)}" font-size="16" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeHtml(object.storeCode)}</text><text x="${left + codeWidth + (object.width - codeWidth) / 2}" y="${object.y - 3}" fill="#0f172a" font-size="17" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeHtml(object.label)}</text>${object.description ? `<text x="${left + codeWidth + (object.width - codeWidth) / 2}" y="${object.y + 23}" fill="#64748b" font-size="11" text-anchor="middle">${escapeHtml(object.description)}</text>` : ''}`;
    }

    function dataFlowNodeMarkup(object, spec) {
        if (object.type === 'process') return dataFlowProcessMarkup(object, spec);
        if (object.type === 'external-entity') return dataFlowExternalMarkup(object);
        return dataFlowStoreMarkup(object);
    }

    function dataFlowPathMarkup(object, spec) {
        const geometry = dataFlowGeometry(object, spec);
        if (!geometry) return '';

        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const label = spec.showFlowLabels && object.label
            ? `<g><rect x="${geometry.labelX - Math.max(28, object.label.length * 3.6)}" y="${geometry.labelY - 14}" width="${Math.max(56, object.label.length * 7.2)}" height="22" rx="5" fill="#ffffff" fill-opacity=".92"/><text x="${geometry.labelX}" y="${geometry.labelY + 2}" fill="${escapeHtml(object.stroke)}" font-size="12" font-weight="700" text-anchor="middle">${escapeHtml(object.label)}</text></g>`
            : '';

        return `<path d="${geometry.path}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" marker-end="url(#qmx-vector-arrow)" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>${label}`;
    }

    function dataFlowTextMarkup(object) {
        return `<text x="${object.x}" y="${object.y}" fill="${escapeHtml(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})">${escapeHtml(object.text)}</text>`;
    }

    function dataFlowMarkup(spec) {
        const flowMarkup = spec.objects
            .filter((object) => object.type === 'data-flow')
            .map((object) => dataFlowPathMarkup(object, spec))
            .join('');
        const nodeMarkup = dataFlowNodes(spec)
            .map((object) => dataFlowNodeMarkup(object, spec))
            .join('');
        const textMarkup = spec.objects
            .filter((object) => object.type === 'text')
            .map(dataFlowTextMarkup)
            .join('');

        return dataFlowGridMarkup(spec) + flowMarkup + nodeMarkup + textMarkup;
    }

    function sportsArrowPath(object) {
        if (!object.curve) return `M ${object.x1} ${object.y1} L ${object.x2} ${object.y2}`;
        const midX = (object.x1 + object.x2) / 2;
        const midY = (object.y1 + object.y2) / 2;
        const dx = object.x2 - object.x1;
        const dy = object.y2 - object.y1;
        const length = Math.max(1, Math.hypot(dx, dy));
        const controlX = midX - (dy / length) * object.curve;
        const controlY = midY + (dx / length) * object.curve;
        return `M ${object.x1} ${object.y1} Q ${controlX} ${controlY} ${object.x2} ${object.y2}`;
    }

    function sportsGridMarkup(spec) {
        if (!spec.showGrid) return '';
        const id = `qmx-sports-grid-${String(spec.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
        return `<defs><pattern id="${id}" width="${spec.gridSize}" height="${spec.gridSize}" patternUnits="userSpaceOnUse"><path d="M ${spec.gridSize} 0 L 0 0 0 ${spec.gridSize}" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#${id})"/>`;
    }

    function sportsFieldMarkup(spec) {
        const width = spec.width;
        const height = spec.height;
        const margin = Math.max(28, Math.min(width, height) * 0.07);
        const x = margin;
        const y = margin;
        const w = width - margin * 2;
        const h = height - margin * 2;
        const line = escapeHtml(spec.fieldLineColor);
        const fill = escapeHtml(spec.fieldColor);
        const sw = spec.fieldLineWidth;
        const labels = spec.showFieldLabels;
        const pieces = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${line}" stroke-width="${sw}" rx="${spec.fieldType === 'cricket' ? h / 2 : 0}"/>`];

        if (spec.fieldType === 'soccer') {
            const boxW = w * 0.17;
            const boxH = h * 0.52;
            const goalW = w * 0.065;
            const goalH = h * 0.26;
            pieces.push(
                `<line x1="${width / 2}" y1="${y}" x2="${width / 2}" y2="${y + h}" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(w, h) * 0.12}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${width / 2}" cy="${height / 2}" r="${sw * 1.5}" fill="${line}"/>`,
                `<rect x="${x}" y="${height / 2 - boxH / 2}" width="${boxW}" height="${boxH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x + w - boxW}" y="${height / 2 - boxH / 2}" width="${boxW}" height="${boxH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x}" y="${height / 2 - goalH / 2}" width="${goalW}" height="${goalH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x + w - goalW}" y="${height / 2 - goalH / 2}" width="${goalW}" height="${goalH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x - 12}" y="${height / 2 - h * .12}" width="12" height="${h * .24}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x + w}" y="${height / 2 - h * .12}" width="12" height="${h * .24}" fill="none" stroke="${line}" stroke-width="${sw}"/>`
            );
            if (labels) {
                pieces.push(`<text x="${x + 18}" y="${y + 24}" fill="${line}" font-size="15" font-weight="700">HOME</text><text x="${x + w - 18}" y="${y + 24}" fill="${line}" font-size="15" font-weight="700" text-anchor="end">AWAY</text>`);
            }
        } else if (spec.fieldType === 'basketball') {
            const keyW = w * 0.17;
            const keyH = h * 0.34;
            pieces.push(
                `<line x1="${width / 2}" y1="${y}" x2="${width / 2}" y2="${y + h}" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(w, h) * .11}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x}" y="${height / 2 - keyH / 2}" width="${keyW}" height="${keyH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<rect x="${x + w - keyW}" y="${height / 2 - keyH / 2}" width="${keyW}" height="${keyH}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${x + keyW}" cy="${height / 2}" r="${keyH * .32}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${x + w - keyW}" cy="${height / 2}" r="${keyH * .32}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<line x1="${x + 28}" y1="${height / 2 - 45}" x2="${x + 28}" y2="${height / 2 + 45}" stroke="${line}" stroke-width="${sw + 1}"/>`,
                `<line x1="${x + w - 28}" y1="${height / 2 - 45}" x2="${x + w - 28}" y2="${height / 2 + 45}" stroke="${line}" stroke-width="${sw + 1}"/>`,
                `<circle cx="${x + 42}" cy="${height / 2}" r="8" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${x + w - 42}" cy="${height / 2}" r="8" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<path d="M ${x + 90} ${y} Q ${x + w * .22} ${height / 2} ${x + 90} ${y + h}" fill="none" stroke="${line}" stroke-width="${sw}"/>`,
                `<path d="M ${x + w - 90} ${y} Q ${x + w * .78} ${height / 2} ${x + w - 90} ${y + h}" fill="none" stroke="${line}" stroke-width="${sw}"/>`
            );
            if (labels) pieces.push(`<text x="${width / 2}" y="${y + 22}" fill="${line}" font-size="14" font-weight="700" text-anchor="middle">BASKETBALL COURT</text>`);
        } else if (spec.fieldType === 'cricket') {
            const pitchW = w * .30;
            const pitchH = h * .16;
            pieces.push(
                `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${w * .36}" ry="${h * .34}" fill="none" stroke="${line}" stroke-width="${sw}" stroke-dasharray="10 8"/>`,
                `<rect x="${width / 2 - pitchW / 2}" y="${height / 2 - pitchH / 2}" width="${pitchW}" height="${pitchH}" fill="#c9a66b" stroke="${line}" stroke-width="${sw}"/>`,
                `<line x1="${width / 2 - pitchW / 2 + 24}" y1="${height / 2 - pitchH / 2}" x2="${width / 2 - pitchW / 2 + 24}" y2="${height / 2 + pitchH / 2}" stroke="${line}" stroke-width="${sw}"/>`,
                `<line x1="${width / 2 + pitchW / 2 - 24}" y1="${height / 2 - pitchH / 2}" x2="${width / 2 + pitchW / 2 - 24}" y2="${height / 2 + pitchH / 2}" stroke="${line}" stroke-width="${sw}"/>`,
                `<g stroke="${line}" stroke-width="${Math.max(2, sw)}"><line x1="${width / 2 - pitchW / 2 + 10}" y1="${height / 2 - 12}" x2="${width / 2 - pitchW / 2 + 10}" y2="${height / 2 + 12}"/><line x1="${width / 2 - pitchW / 2 + 16}" y1="${height / 2 - 12}" x2="${width / 2 - pitchW / 2 + 16}" y2="${height / 2 + 12}"/><line x1="${width / 2 + pitchW / 2 - 10}" y1="${height / 2 - 12}" x2="${width / 2 + pitchW / 2 - 10}" y2="${height / 2 + 12}"/><line x1="${width / 2 + pitchW / 2 - 16}" y1="${height / 2 - 12}" x2="${width / 2 + pitchW / 2 - 16}" y2="${height / 2 + 12}"/></g>`
            );
            if (labels) pieces.push(`<text x="${width / 2}" y="${y + 24}" fill="${line}" font-size="15" font-weight="700" text-anchor="middle">CRICKET FIELD</text>`);
        } else {
            pieces.push(
                `<line x1="${width / 2}" y1="${y}" x2="${width / 2}" y2="${y + h}" stroke="${line}" stroke-width="${sw}"/>`,
                `<line x1="${x}" y1="${height / 2}" x2="${x + w}" y2="${height / 2}" stroke="${line}" stroke-width="${sw}"/>`,
                `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(w, h) * .10}" fill="none" stroke="${line}" stroke-width="${sw}"/>`
            );
            if (labels) pieces.push(`<text x="${width / 2}" y="${y + 24}" fill="${line}" font-size="15" font-weight="700" text-anchor="middle">TACTICS COURT</text>`);
        }

        pieces.push(sportsGridMarkup(spec));
        return pieces.join('');
    }

    function sportsBallMarkup(object) {
        const parts = [`<circle cx="${object.x}" cy="${object.y}" r="${object.size}" fill="${escapeHtml(object.color)}" stroke="#0f172a" stroke-width="2" vector-effect="non-scaling-stroke"/>`];

        if (object.sport === 'soccer') {
            parts.push(`<polygon points="${object.x},${object.y - object.size * .45} ${object.x + object.size * .43},${object.y - object.size * .13} ${object.x + object.size * .27},${object.y + object.size * .38} ${object.x - object.size * .27},${object.y + object.size * .38} ${object.x - object.size * .43},${object.y - object.size * .13}" fill="#0f172a"/>`);
        } else if (object.sport === 'basketball') {
            parts.push(`<path d="M ${object.x - object.size} ${object.y} H ${object.x + object.size} M ${object.x} ${object.y - object.size} V ${object.y + object.size} M ${object.x - object.size * .75} ${object.y - object.size * .66} Q ${object.x} ${object.y} ${object.x + object.size * .75} ${object.y + object.size * .66} M ${object.x - object.size * .75} ${object.y + object.size * .66} Q ${object.x} ${object.y} ${object.x + object.size * .75} ${object.y - object.size * .66}" fill="none" stroke="#0f172a" stroke-width="1.5"/>`);
        } else if (object.sport === 'cricket') {
            parts.push(`<path d="M ${object.x - object.size * .75} ${object.y - object.size * .25} Q ${object.x} ${object.y} ${object.x + object.size * .75} ${object.y + object.size * .25}" fill="none" stroke="#ffffff" stroke-width="2"/>`);
        }

        return parts.join('');
    }

    function sportsObjectMarkup(object) {
        if (object.type === 'player') {
            const number = object.number || (object.team === 'A' ? 'A' : (object.team === 'B' ? 'B' : 'N'));
            return `<g><circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="${escapeHtml(object.color)}" stroke="#ffffff" stroke-width="3"/><circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="none" stroke="#0f172a" stroke-width="1.5" opacity=".55"/><text x="${object.x}" y="${object.y}" fill="${escapeHtml(object.textColor)}" font-size="${Math.max(10, object.radius * .75)}" font-weight="800" text-anchor="middle" dominant-baseline="middle">${escapeHtml(number)}</text>${object.label ? `<text x="${object.x}" y="${object.y + object.radius + 17}" fill="#0f172a" font-size="13" font-weight="700" text-anchor="middle" paint-order="stroke" stroke="#ffffff" stroke-width="4">${escapeHtml(object.label)}</text>` : ''}</g>`;
        }

        if (object.type === 'ball') return sportsBallMarkup(object);

        if (object.type === 'arrow') {
            const labelX = (object.x1 + object.x2) / 2;
            const labelY = (object.y1 + object.y2) / 2 - 9;
            return `<g><path d="${sportsArrowPath(object)}" fill="none" stroke="${escapeHtml(object.color)}" stroke-width="${object.width}"${object.dash ? ' stroke-dasharray="12 8"' : ''} stroke-linecap="round" marker-end="url(#qmx-vector-arrow)" vector-effect="non-scaling-stroke"/>${object.label ? `<text x="${labelX}" y="${labelY}" fill="${escapeHtml(object.color)}" font-size="14" font-weight="800" text-anchor="middle" paint-order="stroke" stroke="#ffffff" stroke-width="4">${escapeHtml(object.label)}</text>` : ''}</g>`;
        }

        if (object.type === 'zone') {
            const shape = object.shape === 'ellipse'
                ? `<ellipse cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" stroke-dasharray="9 6"/>`
                : `<rect x="${object.x - object.width / 2}" y="${object.y - object.height / 2}" width="${object.width}" height="${object.height}" rx="18" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" stroke-dasharray="9 6"/>`;
            return `<g>${shape}${object.label ? `<text x="${object.x}" y="${object.y}" fill="${escapeHtml(object.textColor)}" font-size="18" font-weight="800" text-anchor="middle" dominant-baseline="middle">${escapeHtml(object.label)}</text>` : ''}</g>`;
        }

        if (object.type === 'cone') {
            const points = `${object.x},${object.y - object.size} ${object.x - object.size * .72},${object.y + object.size} ${object.x + object.size * .72},${object.y + object.size}`;
            return `<g><polygon points="${points}" fill="${escapeHtml(object.color)}" stroke="#ffffff" stroke-width="2"/><line x1="${object.x - object.size * .75}" y1="${object.y + object.size * .22}" x2="${object.x + object.size * .75}" y2="${object.y + object.size * .22}" stroke="#ffffff" stroke-width="3"/>${object.label ? `<text x="${object.x}" y="${object.y + object.size + 16}" fill="#0f172a" font-size="12" font-weight="700" text-anchor="middle">${escapeHtml(object.label)}</text>` : ''}</g>`;
        }

        return `<text x="${object.x}" y="${object.y}" fill="${escapeHtml(object.color)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#ffffff" stroke-width="5" font-family="Arial, Noto Sans Bengali, sans-serif">${escapeHtml(object.text)}</text>`;
    }

    function sportsMarkup(spec) {
        return sportsFieldMarkup(spec) + spec.objects.map(sportsObjectMarkup).join('');
    }

    function vectorArtSmoothPath(points) {
        if (!points.length) return '';
        if (points.length < 3) {
            return `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')}`;
        }

        let path = `M ${points[0].x} ${points[0].y}`;
        for (let index = 0; index < points.length - 1; index += 1) {
            const current = points[index];
            const next = points[index + 1];
            const midX = (current.x + next.x) / 2;
            const midY = (current.y + next.y) / 2;
            path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
        }

        const last = points[points.length - 1];
        path += ` T ${last.x} ${last.y}`;
        return path;
    }

    function vectorArtPathD(object) {
        const base = object.smooth
            ? vectorArtSmoothPath(object.points)
            : `M ${object.points.map((point) => `${point.x} ${point.y}`).join(' L ')}`;
        return object.closed ? `${base} Z` : base;
    }

    function vectorArtStyle(object) {
        const fill = object.fill === 'none' ? 'none' : escapeHtml(object.fill);
        return `stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" fill="${fill}" fill-opacity="${object.fillOpacity}" opacity="${object.opacity}" stroke-linecap="${object.lineCap}" stroke-linejoin="${object.lineJoin}"${object.dash ? ' stroke-dasharray="10 7"' : ''} vector-effect="non-scaling-stroke"`;
    }

    function vectorArtMarkers(object) {
        return `${object.arrowStart ? ' marker-start="url(#qmx-vector-arrow)"' : ''}${object.arrowEnd ? ' marker-end="url(#qmx-vector-arrow)"' : ''}`;
    }

    function vectorArtStarPoints(object) {
        const output = [];
        const count = Math.max(3, Math.round(object.points || 5));
        const outer = Math.min(object.width, object.height) / 2;
        const inner = outer * object.innerRatio;

        for (let index = 0; index < count * 2; index += 1) {
            const radius = index % 2 === 0 ? outer : inner;
            const angle = -Math.PI / 2 + index * Math.PI / count;
            output.push(`${object.x + Math.cos(angle) * radius},${object.y + Math.sin(angle) * radius}`);
        }

        return output.join(' ');
    }

    function vectorArtObjectMarkup(object) {
        if (object.type === 'path') {
            return `<path d="${vectorArtPathD(object)}" ${vectorArtStyle(object)}${vectorArtMarkers(object)}/>`;
        }

        if (['line', 'arrow'].includes(object.type)) {
            return `<line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" ${vectorArtStyle(object)}${vectorArtMarkers(object)}/>`;
        }

        if (object.type === 'rectangle') {
            return `<rect x="${object.x - object.width / 2}" y="${object.y - object.height / 2}" width="${object.width}" height="${object.height}" rx="${object.radius}" ${vectorArtStyle(object)} transform="rotate(${object.rotation} ${object.x} ${object.y})"/>`;
        }

        if (object.type === 'ellipse') {
            return `<ellipse cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}" ${vectorArtStyle(object)} transform="rotate(${object.rotation} ${object.x} ${object.y})"/>`;
        }

        if (object.type === 'star') {
            return `<polygon points="${vectorArtStarPoints(object)}" ${vectorArtStyle(object)} transform="rotate(${object.rotation} ${object.x} ${object.y})"/>`;
        }

        return `<text x="${object.x}" y="${object.y}" fill="${escapeHtml(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" font-style="${object.fontStyle}" opacity="${object.opacity}" text-anchor="${object.textAnchor}" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})" font-family="Arial, Noto Sans Bengali, sans-serif">${escapeHtml(object.text)}</text>`;
    }

    function vectorArtGuideMarkup(spec) {
        const pieces = [];

        if (spec.showGrid) {
            const id = `qmx-vector-art-grid-${String(spec.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
            pieces.push(`<defs><pattern id="${id}" width="${spec.gridSize}" height="${spec.gridSize}" patternUnits="userSpaceOnUse"><path d="M ${spec.gridSize} 0 L 0 0 0 ${spec.gridSize}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#${id})"/>`);
        }

        if (spec.showCenterGuides) {
            pieces.push(`<line x1="${spec.width / 2}" y1="0" x2="${spec.width / 2}" y2="${spec.height}" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="7 6" opacity=".8" vector-effect="non-scaling-stroke"/><line x1="0" y1="${spec.height / 2}" x2="${spec.width}" y2="${spec.height / 2}" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="7 6" opacity=".8" vector-effect="non-scaling-stroke"/>`);
        }

        if (spec.showSafeArea) {
            pieces.push(`<rect x="${spec.safeArea}" y="${spec.safeArea}" width="${Math.max(0, spec.width - spec.safeArea * 2)}" height="${Math.max(0, spec.height - spec.safeArea * 2)}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="9 6" vector-effect="non-scaling-stroke"/>`);
        }

        return pieces.join('');
    }

    function vectorArtMarkup(spec) {
        return vectorArtGuideMarkup(spec) + spec.objects.map(vectorArtObjectMarkup).join('');
    }

    function crossSectionPatternId(spec, object) {
        return `qmx-xsec-${String(spec.id).replace(/[^A-Za-z0-9_-]/g, '')}-${String(object.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
    }

    function crossSectionPatternDef(spec, object) {
        if (!object.hatch || object.hatch === 'solid') return '';

        const id = crossSectionPatternId(spec, object);
        const fill = escapeHtml(object.fill);
        const opacity = object.fillOpacity;

        if (object.hatch === 'dots') {
            return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${fill}" fill-opacity="${opacity * 0.45}"/><circle cx="4" cy="4" r="2" fill="${fill}" fill-opacity="${Math.min(1, opacity + 0.3)}"/></pattern>`;
        }

        if (object.hatch === 'cross') {
            return `<pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${fill}" fill-opacity="${opacity * 0.4}"/><path d="M0 0 L16 16 M16 0 L0 16" stroke="${fill}" stroke-opacity="${Math.min(1, opacity + 0.25)}" stroke-width="2"/></pattern>`;
        }

        return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><rect width="14" height="14" fill="${fill}" fill-opacity="${opacity * 0.4}"/><line x1="0" y1="0" x2="0" y2="14" stroke="${fill}" stroke-opacity="${Math.min(1, opacity + 0.3)}" stroke-width="3"/></pattern>`;
    }

    function crossSectionFillValue(spec, object) {
        return object.hatch && object.hatch !== 'solid'
            ? `url(#${crossSectionPatternId(spec, object)})`
            : escapeHtml(object.fill);
    }

    function crossSectionPoints(points) {
        return points.map((point) => `${point.x},${point.y}`).join(' ');
    }

    function crossSectionSmoothPath(points) {
        if (!points.length) return '';
        if (points.length < 3) {
            return `M ${points[0].x} ${points[0].y} ` +
                points.slice(1).map((point) => `L ${point.x} ${point.y}`).join(' ');
        }

        let path = `M ${points[0].x} ${points[0].y}`;
        for (let index = 0; index < points.length - 1; index += 1) {
            const current = points[index];
            const next = points[index + 1];
            const midX = (current.x + next.x) / 2;
            const midY = (current.y + next.y) / 2;
            path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
        }
        const last = points[points.length - 1];
        path += ` T ${last.x} ${last.y}`;
        return path;
    }

    function crossSectionGridMarkup(spec) {
        const pieces = [];

        if (spec.showGrid) {
            const size = spec.gridSize;
            const id = `qmx-xsec-grid-${String(spec.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
            pieces.push(`<defs><pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#${id})"/>`);
        }

        if (spec.showSeaLevel) {
            pieces.push(`<line x1="40" y1="${spec.seaLevelY}" x2="${spec.width - 40}" y2="${spec.seaLevelY}" stroke="#0284c7" stroke-width="2" stroke-dasharray="9 6" vector-effect="non-scaling-stroke"/><text x="${spec.width - 50}" y="${spec.seaLevelY - 8}" fill="#0369a1" font-size="12" text-anchor="end">Sea level</text>`);
        }

        if (spec.showAxes) {
            const bottom = spec.height - 35;
            pieces.push(`<line x1="45" y1="${bottom}" x2="${spec.width - 35}" y2="${bottom}" stroke="#64748b" stroke-width="1.5" marker-end="url(#qmx-vector-arrow)" vector-effect="non-scaling-stroke"/><line x1="45" y1="${bottom}" x2="45" y2="35" stroke="#64748b" stroke-width="1.5" marker-end="url(#qmx-vector-arrow)" vector-effect="non-scaling-stroke"/><text x="${spec.width / 2}" y="${spec.height - 8}" fill="#475569" font-size="13" font-weight="700" text-anchor="middle">${escapeHtml(spec.horizontalLabel)}</text><text x="16" y="${spec.height / 2}" fill="#475569" font-size="13" font-weight="700" text-anchor="middle" transform="rotate(-90 16 ${spec.height / 2})">${escapeHtml(spec.verticalLabel)}</text><text x="${spec.width - 45}" y="30" fill="#64748b" font-size="11" text-anchor="end">VE ×${spec.verticalExaggeration}</text>`);
        }

        return pieces.join('');
    }

    function crossSectionLayerMarkup(object, spec) {
        const centerX = object.points.reduce((sum, point) => sum + point.x, 0) / object.points.length;
        const centerY = object.points.reduce((sum, point) => sum + point.y, 0) / object.points.length;
        return `<defs>${crossSectionPatternDef(spec, object)}</defs><polygon points="${crossSectionPoints(object.points)}" fill="${crossSectionFillValue(spec, object)}" fill-opacity="${object.hatch === 'solid' ? object.fillOpacity : 1}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><text x="${centerX}" y="${centerY}" fill="${escapeHtml(object.stroke)}" font-size="15" font-weight="700" text-anchor="middle">${escapeHtml(object.label)}</text>`;
    }

    function crossSectionTerrainMarkup(object, spec) {
        const first = object.points[0];
        const last = object.points[object.points.length - 1];
        const linePath = object.smooth
            ? crossSectionSmoothPath(object.points)
            : `M ${object.points.map((point) => `${point.x} ${point.y}`).join(' L ')}`;
        const fillPath = `${linePath} L ${last.x} ${object.baselineY} L ${first.x} ${object.baselineY} Z`;
        const labelPoint = object.points[Math.floor(object.points.length / 2)];

        return `<defs>${crossSectionPatternDef(spec, object)}</defs><path d="${fillPath}" fill="${crossSectionFillValue(spec, object)}" fill-opacity="${object.hatch === 'solid' ? object.fillOpacity : 1}" stroke="none" opacity="${object.opacity}"/><path d="${linePath}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><text x="${labelPoint.x}" y="${labelPoint.y - 16}" fill="${escapeHtml(object.stroke)}" font-size="14" font-weight="700" text-anchor="middle">${escapeHtml(object.label)}</text>`;
    }

    function crossSectionRiverMarkup(object) {
        const left = object.x - object.width / 2;
        const right = object.x + object.width / 2;
        const bottom = object.y + object.depth;
        const waterY = object.y + Math.max(8, object.depth - object.waterDepth);
        const waterLeft = object.x - object.width * 0.28;
        const waterRight = object.x + object.width * 0.28;
        const channel = `M ${left} ${object.y} Q ${object.x - object.width * 0.18} ${bottom} ${object.x} ${bottom} Q ${object.x + object.width * 0.18} ${bottom} ${right} ${object.y}`;
        const water = `M ${waterLeft} ${waterY} Q ${object.x} ${bottom + 4} ${waterRight} ${waterY} Z`;

        return `<path d="${channel}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}" vector-effect="non-scaling-stroke"/><path d="${water}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${Math.max(1, object.strokeWidth - 1)}" opacity="${object.opacity}" vector-effect="non-scaling-stroke"/><text x="${object.x}" y="${object.y - 12}" fill="${escapeHtml(object.stroke)}" font-size="14" font-weight="700" text-anchor="middle">${escapeHtml(object.label)}</text>`;
    }

    function crossSectionWaterMarkup(object, spec) {
        const left = object.x - object.width / 2;
        const top = object.y - object.height / 2;
        return `<defs>${crossSectionPatternDef(spec, object)}</defs><rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" fill="${crossSectionFillValue(spec, object)}" fill-opacity="${object.hatch === 'solid' ? object.fillOpacity : 1}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}" vector-effect="non-scaling-stroke"/><path d="M ${left} ${top + 12} q 20 -12 40 0 t 40 0 t 40 0 t 40 0 t 40 0" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="2" opacity="${object.opacity}" vector-effect="non-scaling-stroke"/><text x="${object.x}" y="${object.y}" fill="${escapeHtml(object.stroke)}" font-size="15" font-weight="700" text-anchor="middle">${escapeHtml(object.label)}</text>`;
    }

    function crossSectionFaultMarkup(object) {
        const midX = (object.x1 + object.x2) / 2;
        const midY = (object.y1 + object.y2) / 2;
        const dash = object.dash ? ' stroke-dasharray="9 6"' : '';
        const arrows = object.showArrows
            ? `<path d="M ${midX - 18} ${midY - 18} l 12 -12 M ${midX + 18} ${midY + 18} l -12 12" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="2" marker-end="url(#qmx-vector-arrow)" vector-effect="non-scaling-stroke"/>`
            : '';
        return `<line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash} opacity="${object.opacity}" vector-effect="non-scaling-stroke"/>${arrows}<text x="${midX + 16}" y="${midY - 8}" fill="${escapeHtml(object.stroke)}" font-size="14" font-weight="700">${escapeHtml(object.label)}</text>`;
    }

    function crossSectionDimensionMarkup(object) {
        const midX = (object.x1 + object.x2) / 2;
        const midY = (object.y1 + object.y2) / 2;
        const dx = object.x2 - object.x1;
        const dy = object.y2 - object.y1;
        const length = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / length;
        const ny = dx / length;
        const labelX = midX + nx * object.offset;
        const labelY = midY + ny * object.offset;

        return `<line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" marker-start="url(#qmx-vector-arrow)" marker-end="url(#qmx-vector-arrow)" opacity="${object.opacity}" vector-effect="non-scaling-stroke"/><rect x="${labelX - Math.max(28, object.label.length * 3.5)}" y="${labelY - 14}" width="${Math.max(56, object.label.length * 7)}" height="22" rx="5" fill="#ffffff" fill-opacity=".9"/><text x="${labelX}" y="${labelY + 2}" fill="${escapeHtml(object.stroke)}" font-size="13" font-weight="700" text-anchor="middle">${escapeHtml(object.label)}</text>`;
    }

    function crossSectionTextMarkup(object) {
        return `<text x="${object.x}" y="${object.y}" fill="${escapeHtml(object.textColor)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}" opacity="${object.opacity}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${object.rotation} ${object.x} ${object.y})">${escapeHtml(object.text)}</text>`;
    }

    function crossSectionMarkup(spec) {
        const layers = spec.objects
            .filter((object) => object.type === 'layer')
            .map((object) => crossSectionLayerMarkup(object, spec))
            .join('');
        const terrains = spec.objects
            .filter((object) => object.type === 'terrain')
            .map((object) => crossSectionTerrainMarkup(object, spec))
            .join('');
        const features = spec.objects
            .filter((object) => ['river', 'water', 'fault', 'dimension'].includes(object.type))
            .map((object) => {
                if (object.type === 'river') return crossSectionRiverMarkup(object);
                if (object.type === 'water') return crossSectionWaterMarkup(object, spec);
                if (object.type === 'fault') return crossSectionFaultMarkup(object);
                return crossSectionDimensionMarkup(object);
            })
            .join('');
        const texts = spec.objects
            .filter((object) => object.type === 'text')
            .map(crossSectionTextMarkup)
            .join('');

        return crossSectionGridMarkup(spec) + layers + terrains + features + texts;
    }

    function stageMovementPath(object) {
        if (!object.curve) return `M ${object.x1} ${object.y1} L ${object.x2} ${object.y2}`;

        const midpointX = (object.x1 + object.x2) / 2;
        const midpointY = (object.y1 + object.y2) / 2;
        const dx = object.x2 - object.x1;
        const dy = object.y2 - object.y1;
        const length = Math.max(1, Math.hypot(dx, dy));
        const controlX = midpointX - (dy / length) * object.curve;
        const controlY = midpointY + (dx / length) * object.curve;

        return `M ${object.x1} ${object.y1} Q ${controlX} ${controlY} ${object.x2} ${object.y2}`;
    }

    function stageGridMarkup(spec) {
        if (!spec.showGrid) return '';

        const id = `qmx-stage-grid-${String(spec.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
        return `<defs><pattern id="${id}" width="${spec.gridSize}" height="${spec.gridSize}" patternUnits="userSpaceOnUse"><path d="M ${spec.gridSize} 0 L 0 0 0 ${spec.gridSize}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#${id})"/>`;
    }

    function stageAudienceMarkup(spec) {
        if (!spec.showAudience) return '';

        const rows = [];
        const rowY = spec.height - 70;

        for (let index = 0; index < 12; index += 1) {
            const x = 80 + index * ((spec.width - 160) / 11);
            rows.push(`<circle cx="${x}" cy="${rowY}" r="7" fill="#94a3b8"/><circle cx="${x}" cy="${rowY + 25}" r="7" fill="#cbd5e1"/>`);
        }

        if (spec.stageType === 'arena') {
            for (let index = 0; index < 9; index += 1) {
                const y = 95 + index * ((spec.height - 190) / 8);
                rows.push(`<circle cx="45" cy="${y}" r="7" fill="#94a3b8"/><circle cx="${spec.width - 45}" cy="${y}" r="7" fill="#94a3b8"/>`);
            }
        }

        return rows.join('');
    }

    function stageBaseMarkup(spec) {
        const width = spec.width;
        const height = spec.height;
        const stroke = escapeHtml(spec.stageLineColor);
        const fill = escapeHtml(spec.stageColor);
        const lineWidth = spec.stageLineWidth;
        const labels = [];
        let stage = '';

        if (spec.stageType === 'thrust') {
            stage = `<path d="M 150 55 H ${width - 150} V ${height - 240} L ${width - 245} ${height - 115} H 245 L 150 ${height - 240} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lineWidth}"/>`;

            if (spec.showStageLabels) {
                labels.push(`<text x="${width / 2}" y="85" text-anchor="middle" font-size="18" font-weight="800" fill="${stroke}">UPSTAGE</text>`);
                labels.push(`<text x="${width / 2}" y="${height - 135}" text-anchor="middle" font-size="18" font-weight="800" fill="${stroke}">THRUST / DOWNSTAGE</text>`);
            }
        } else if (spec.stageType === 'arena') {
            stage = `<rect x="175" y="105" width="${width - 350}" height="${height - 240}" rx="75" fill="${fill}" stroke="${stroke}" stroke-width="${lineWidth}"/><line x1="${width / 2}" y1="105" x2="${width / 2}" y2="${height - 135}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="8 6" opacity=".45"/>`;

            if (spec.showStageLabels) {
                labels.push(`<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="20" font-weight="800" fill="${stroke}">ARENA PLAYING AREA</text>`);
            }
        } else if (spec.stageType === 'black-box') {
            stage = `<rect x="65" y="50" width="${width - 130}" height="${height - 140}" fill="${fill}" stroke="${stroke}" stroke-width="${lineWidth}"/><rect x="105" y="90" width="${width - 210}" height="${height - 220}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="8 6" opacity=".55"/>`;

            if (spec.showStageLabels) {
                labels.push(`<text x="${width / 2}" y="82" text-anchor="middle" font-size="18" font-weight="800" fill="${stroke}">BLACK-BOX PERFORMANCE SPACE</text>`);
            }
        } else {
            stage = `<rect x="95" y="55" width="${width - 190}" height="${height - 180}" fill="${fill}" stroke="${stroke}" stroke-width="${lineWidth}"/><line x1="95" y1="${height - 125}" x2="${width - 95}" y2="${height - 125}" stroke="${stroke}" stroke-width="${lineWidth}"/><line x1="${width / 2}" y1="55" x2="${width / 2}" y2="${height - 125}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="8 6" opacity=".45"/>`;

            if (spec.showWings) {
                stage += `<rect x="28" y="95" width="67" height="${height - 265}" fill="#e2e8f0" stroke="${stroke}" stroke-width="2"/><rect x="${width - 95}" y="95" width="67" height="${height - 265}" fill="#e2e8f0" stroke="${stroke}" stroke-width="2"/>`;
            }

            if (spec.showStageLabels) {
                labels.push(`<text x="${width / 2}" y="84" text-anchor="middle" font-size="18" font-weight="800" fill="${stroke}">UPSTAGE</text>`);
                labels.push(`<text x="${width / 2}" y="${height - 142}" text-anchor="middle" font-size="18" font-weight="800" fill="${stroke}">DOWNSTAGE / APRON</text>`);
                labels.push(`<text x="125" y="${height / 2}" text-anchor="middle" font-size="14" font-weight="700" fill="${stroke}">STAGE LEFT</text>`);
                labels.push(`<text x="${width - 125}" y="${height / 2}" text-anchor="middle" font-size="14" font-weight="700" fill="${stroke}">STAGE RIGHT</text>`);
            }
        }

        return stage + stageAudienceMarkup(spec) + labels.join('') + stageGridMarkup(spec);
    }

    function stagePropMarkup(object) {
        const left = object.x - object.width / 2;
        const top = object.y - object.height / 2;
        const common = `fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"`;
        let shape = '';

        if (object.propType === 'chair') {
            shape = `<rect x="${left + object.width * .18}" y="${top + object.height * .28}" width="${object.width * .64}" height="${object.height * .45}" rx="5" ${common}/><line x1="${left + object.width * .22}" y1="${top + object.height * .72}" x2="${left + object.width * .18}" y2="${top + object.height}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/><line x1="${left + object.width * .78}" y1="${top + object.height * .72}" x2="${left + object.width * .82}" y2="${top + object.height}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/><line x1="${left + object.width * .22}" y1="${top + object.height * .28}" x2="${left + object.width * .22}" y2="${top}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/><line x1="${left + object.width * .78}" y1="${top + object.height * .28}" x2="${left + object.width * .78}" y2="${top}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/>`;
        } else if (object.propType === 'door') {
            shape = `<rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/><path d="M ${left} ${top + object.height} A ${object.width} ${object.height} 0 0 1 ${left + object.width} ${top}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" stroke-dasharray="6 5"/>`;
        } else if (object.propType === 'sofa') {
            shape = `<rect x="${left}" y="${top + object.height * .25}" width="${object.width}" height="${object.height * .65}" rx="18" ${common}/><rect x="${left + 10}" y="${top}" width="${object.width - 20}" height="${object.height * .45}" rx="14" ${common}/>`;
        } else if (object.propType === 'platform') {
            shape = `<rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="5" ${common}/><line x1="${left}" y1="${top + object.height * .72}" x2="${left + object.width}" y2="${top + object.height * .72}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/>`;
        } else {
            shape = `<rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="7" ${common}/><line x1="${left + 12}" y1="${top + object.height}" x2="${left + 12}" y2="${top + object.height + 14}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/><line x1="${left + object.width - 12}" y1="${top + object.height}" x2="${left + object.width - 12}" y2="${top + object.height + 14}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/>`;
        }

        return `<g transform="rotate(${object.rotation} ${object.x} ${object.y})">${shape}<text x="${object.x}" y="${object.y + object.height / 2 + 22}" text-anchor="middle" font-size="13" font-weight="700" fill="#334155" paint-order="stroke" stroke="#ffffff" stroke-width="4">${escapeHtml(object.label)}</text></g>`;
    }

    function stageObjectMarkup(object) {
        if (object.type === 'actor') {
            const angle = object.facing * Math.PI / 180;
            const fx = object.x + Math.cos(angle) * (object.radius + 17);
            const fy = object.y + Math.sin(angle) * (object.radius + 17);

            return `<g><circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="${escapeHtml(object.color)}" stroke="#ffffff" stroke-width="3"/><circle cx="${object.x}" cy="${object.y}" r="${object.radius + 2}" fill="none" stroke="#64748b" stroke-width="1.5"/><text x="${object.x}" y="${object.y + 5}" text-anchor="middle" font-size="${Math.max(10, object.radius * .75)}" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.number)}</text><line x1="${object.x}" y1="${object.y}" x2="${fx}" y2="${fy}" stroke="${escapeHtml(object.color)}" stroke-width="4" marker-end="url(#qmx-vector-arrow)"/><text x="${object.x}" y="${object.y + object.radius + 20}" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a" paint-order="stroke" stroke="#ffffff" stroke-width="4">${escapeHtml(object.label)}</text></g>`;
        }

        if (object.type === 'prop') return stagePropMarkup(object);

        if (object.type === 'entrance') {
            const direction = object.side === 'left' ? 1 : -1;
            const x2 = object.x + direction * object.width;

            return `<g><line x1="${object.x}" y1="${object.y}" x2="${x2}" y2="${object.y}" stroke="${escapeHtml(object.color)}" stroke-width="6" marker-end="url(#qmx-vector-arrow)"/><line x1="${object.x}" y1="${object.y - object.height}" x2="${object.x}" y2="${object.y + object.height}" stroke="${escapeHtml(object.color)}" stroke-width="5"/><text x="${object.x + direction * (object.width / 2)}" y="${object.y - 13}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.color)}">${escapeHtml(object.label)}</text></g>`;
        }

        if (object.type === 'movement') {
            const labelX = (object.x1 + object.x2) / 2;
            const labelY = (object.y1 + object.y2) / 2 - 12;

            return `<g><path d="${stageMovementPath(object)}" fill="none" stroke="${escapeHtml(object.color)}" stroke-width="${object.width}"${object.dash ? ' stroke-dasharray="12 8"' : ''} stroke-linecap="round" marker-end="url(#qmx-vector-arrow)" vector-effect="non-scaling-stroke"/><text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.color)}" paint-order="stroke" stroke="#ffffff" stroke-width="4">${escapeHtml(object.label)}</text></g>`;
        }

        if (object.type === 'zone') {
            const shape = object.shape === 'ellipse'
                ? `<ellipse cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" stroke-dasharray="9 6"/>`
                : `<rect x="${object.x - object.width / 2}" y="${object.y - object.height / 2}" width="${object.width}" height="${object.height}" rx="18" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" stroke-dasharray="9 6"/>`;

            return `<g>${shape}<text x="${object.x}" y="${object.y + 5}" text-anchor="middle" font-size="16" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.label)}</text></g>`;
        }

        if (object.type === 'light') {
            return `<g><circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="${escapeHtml(object.color)}" fill-opacity="${object.opacity}" stroke="${escapeHtml(object.color)}" stroke-width="3" stroke-dasharray="8 6"/><circle cx="${object.x}" cy="${object.y}" r="9" fill="${escapeHtml(object.color)}"/><text x="${object.x}" y="${object.y + 5}" text-anchor="middle" font-size="12" font-weight="900" fill="#ffffff">L</text><text x="${object.x}" y="${object.y + object.radius + 20}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.color)}">${escapeHtml(object.label)}</text></g>`;
        }

        return `<text x="${object.x}" y="${object.y}" text-anchor="middle" dominant-baseline="middle" font-size="${object.fontSize}" font-weight="${object.fontWeight}" fill="${escapeHtml(object.color)}" paint-order="stroke" stroke="#ffffff" stroke-width="5">${escapeHtml(object.text)}</text>`;
    }

    function stageMarkup(spec) {
        return stageBaseMarkup(spec) + spec.objects.map(stageObjectMarkup).join('');
    }


    function coordinateNumber(value, digits = 3) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '0';
        const rounded = Number(number.toFixed(digits));
        return Object.is(rounded, -0) ? '0' : String(rounded);
    }

    function coordinateMetrics(spec) {
        const padding = 58;
        const xRange = Math.max(0.001, spec.coordXMax - spec.coordXMin);
        const yRange = Math.max(0.001, spec.coordYMax - spec.coordYMin);
        const scale = Math.min(
            Math.max(1, spec.width - padding * 2) / xRange,
            Math.max(1, spec.height - padding * 2) / yRange
        );
        const plotWidth = xRange * scale;
        const plotHeight = yRange * scale;
        const left = (spec.width - plotWidth) / 2;
        const top = (spec.height - plotHeight) / 2;

        return {
            xMin: spec.coordXMin,
            xMax: spec.coordXMax,
            yMin: spec.coordYMin,
            yMax: spec.coordYMax,
            xRange,
            yRange,
            scale,
            left,
            top,
            right: left + plotWidth,
            bottom: top + plotHeight,
            plotWidth,
            plotHeight
        };
    }

    function coordinateScreenPoint(spec, x, y, map = coordinateMetrics(spec)) {
        return {
            x: map.left + (x - map.xMin) * map.scale,
            y: map.bottom - (y - map.yMin) * map.scale
        };
    }

    function coordinateGridValues(min, max, step, limit = 180) {
        const values = [];
        const safeStep = Math.max(0.000001, Math.abs(step));
        let value = Math.ceil(min / safeStep) * safeStep;
        let count = 0;

        while (value <= max + safeStep * 0.0001 && count < limit) {
            values.push(Number(value.toFixed(10)));
            value += safeStep;
            count += 1;
        }

        return values;
    }

    function coordinateClipLine(spec, x1, y1, x2, y2, map = coordinateMetrics(spec)) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const candidates = [];

        function add(x, y) {
            if (
                x >= map.xMin - 1e-8 &&
                x <= map.xMax + 1e-8 &&
                y >= map.yMin - 1e-8 &&
                y <= map.yMax + 1e-8 &&
                !candidates.some((point) => Math.hypot(point.x - x, point.y - y) < 1e-7)
            ) {
                candidates.push({ x, y });
            }
        }

        if (Math.abs(dx) > 1e-10) {
            let t = (map.xMin - x1) / dx;
            add(map.xMin, y1 + t * dy);
            t = (map.xMax - x1) / dx;
            add(map.xMax, y1 + t * dy);
        }

        if (Math.abs(dy) > 1e-10) {
            let t = (map.yMin - y1) / dy;
            add(x1 + t * dx, map.yMin);
            t = (map.yMax - y1) / dy;
            add(x1 + t * dx, map.yMax);
        }

        if (candidates.length < 2) {
            return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
        }

        let best = [candidates[0], candidates[1]];
        let bestDistance = -1;

        for (let i = 0; i < candidates.length; i += 1) {
            for (let j = i + 1; j < candidates.length; j += 1) {
                const distance = Math.hypot(
                    candidates[j].x - candidates[i].x,
                    candidates[j].y - candidates[i].y
                );
                if (distance > bestDistance) {
                    bestDistance = distance;
                    best = [candidates[i], candidates[j]];
                }
            }
        }

        return best;
    }

    function coordinatePathFromPoints(points) {
        let path = '';
        let open = false;

        points.forEach((point) => {
            if (!point) {
                open = false;
                return;
            }
            path += `${open ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)} `;
            open = true;
        });

        return path.trim();
    }

    function coordinateParabolaPath(object, spec, map = coordinateMetrics(spec)) {
        const points = [];
        const samples = 180;

        if (object.orientation === 'horizontal') {
            for (let i = 0; i <= samples; i += 1) {
                const y = map.yMin + (map.yRange * i) / samples;
                const x = object.vx + object.a * ((y - object.vy) ** 2);
                points.push(
                    x >= map.xMin && x <= map.xMax
                        ? coordinateScreenPoint(spec, x, y, map)
                        : null
                );
            }
        } else {
            for (let i = 0; i <= samples; i += 1) {
                const x = map.xMin + (map.xRange * i) / samples;
                const y = object.vy + object.a * ((x - object.vx) ** 2);
                points.push(
                    y >= map.yMin && y <= map.yMax
                        ? coordinateScreenPoint(spec, x, y, map)
                        : null
                );
            }
        }

        return coordinatePathFromPoints(points);
    }

    function coordinateHyperbolaPath(object, spec, map = coordinateMetrics(spec)) {
        const paths = [];
        const samples = 110;
        const maxT = 3.2;

        [-1, 1].forEach((branch) => {
            const points = [];
            for (let i = 0; i <= samples; i += 1) {
                const t = -maxT + (2 * maxT * i) / samples;
                let x;
                let y;

                if (object.orientation === 'vertical') {
                    x = object.cx + object.b * Math.sinh(t);
                    y = object.cy + branch * object.a * Math.cosh(t);
                } else {
                    x = object.cx + branch * object.a * Math.cosh(t);
                    y = object.cy + object.b * Math.sinh(t);
                }

                points.push(
                    x >= map.xMin &&
                    x <= map.xMax &&
                    y >= map.yMin &&
                    y <= map.yMax
                        ? coordinateScreenPoint(spec, x, y, map)
                        : null
                );
            }

            const path = coordinatePathFromPoints(points);
            if (path) paths.push(path);
        });

        return paths.join(' ');
    }

    function coordinateLineEquation(object) {
        const dx = object.x2 - object.x1;
        const dy = object.y2 - object.y1;

        if (Math.abs(dx) < 1e-9) return `x = ${coordinateNumber(object.x1)}`;

        const slope = dy / dx;
        const intercept = object.y1 - slope * object.x1;
        const sign = intercept < 0 ? '−' : '+';
        return `y = ${coordinateNumber(slope)}x ${sign} ${coordinateNumber(Math.abs(intercept))}`;
    }

    function coordinateLineEndpoints(object, spec, map = coordinateMetrics(spec)) {
        if (['segment', 'distance', 'slope', 'midpoint'].includes(object.type)) {
            return [
                coordinateScreenPoint(spec, object.x1, object.y1, map),
                coordinateScreenPoint(spec, object.x2, object.y2, map)
            ];
        }

        if (object.type === 'line') {
            return coordinateClipLine(spec, object.x1, object.y1, object.x2, object.y2, map)
                .map((point) => coordinateScreenPoint(spec, point.x, point.y, map));
        }

        if (object.type === 'parallel' || object.type === 'perpendicular') {
            let dx = object.x2 - object.x1;
            let dy = object.y2 - object.y1;

            if (object.type === 'perpendicular') [dx, dy] = [-dy, dx];
            if (Math.hypot(dx, dy) < 1e-9) dx = 1;

            return coordinateClipLine(spec, object.px, object.py, object.px + dx, object.py + dy, map)
                .map((point) => coordinateScreenPoint(spec, point.x, point.y, map));
        }

        return [];
    }

    function coordinateBackgroundMarkup(spec) {
        const map = coordinateMetrics(spec);
        const step = spec.coordGridStep;
        const xValues = coordinateGridValues(map.xMin, map.xMax, step);
        const yValues = coordinateGridValues(map.yMin, map.yMax, step);
        let markup = `<rect x="${map.left}" y="${map.top}" width="${map.plotWidth}" height="${map.plotHeight}" fill="none" stroke="#cbd5e1" stroke-width="1"/>`;

        if (spec.showGrid) {
            xValues.forEach((value) => {
                const point = coordinateScreenPoint(spec, value, 0, map);
                const major = Math.abs(value / step) % 5 < 0.00001;
                markup += `<line x1="${point.x}" y1="${map.top}" x2="${point.x}" y2="${map.bottom}" stroke="${major ? '#cbd5e1' : '#e2e8f0'}" stroke-width="${major ? 1.15 : 0.8}"/>`;
            });

            yValues.forEach((value) => {
                const point = coordinateScreenPoint(spec, 0, value, map);
                const major = Math.abs(value / step) % 5 < 0.00001;
                markup += `<line x1="${map.left}" y1="${point.y}" x2="${map.right}" y2="${point.y}" stroke="${major ? '#cbd5e1' : '#e2e8f0'}" stroke-width="${major ? 1.15 : 0.8}"/>`;
            });
        }

        if (spec.showAxes) {
            if (map.yMin <= 0 && map.yMax >= 0) {
                const y = coordinateScreenPoint(spec, 0, 0, map).y;
                markup += `<line x1="${map.left}" y1="${y}" x2="${map.right}" y2="${y}" stroke="#334155" stroke-width="2" marker-end="url(#qmx-coordinate-arrow)"/>`;
                markup += `<text x="${map.right - 5}" y="${y - 10}" text-anchor="end" font-size="15" font-weight="800" fill="#334155">x</text>`;
            }

            if (map.xMin <= 0 && map.xMax >= 0) {
                const x = coordinateScreenPoint(spec, 0, 0, map).x;
                markup += `<line x1="${x}" y1="${map.bottom}" x2="${x}" y2="${map.top}" stroke="#334155" stroke-width="2" marker-end="url(#qmx-coordinate-arrow)"/>`;
                markup += `<text x="${x + 10}" y="${map.top + 15}" font-size="15" font-weight="800" fill="#334155">y</text>`;
            }
        }

        if (spec.coordShowTickLabels) {
            const axisY = map.yMin <= 0 && map.yMax >= 0
                ? coordinateScreenPoint(spec, 0, 0, map).y
                : map.bottom;
            const axisX = map.xMin <= 0 && map.xMax >= 0
                ? coordinateScreenPoint(spec, 0, 0, map).x
                : map.left;

            xValues.forEach((value) => {
                if (Math.abs(value) < step * 0.0001) return;
                const point = coordinateScreenPoint(spec, value, 0, map);
                markup += `<text x="${point.x}" y="${axisY + 18}" text-anchor="middle" font-size="10" fill="#64748b">${escapeHtml(coordinateNumber(value))}</text>`;
            });

            yValues.forEach((value) => {
                if (Math.abs(value) < step * 0.0001) return;
                const point = coordinateScreenPoint(spec, 0, value, map);
                markup += `<text x="${axisX - 8}" y="${point.y + 3}" text-anchor="end" font-size="10" fill="#64748b">${escapeHtml(coordinateNumber(value))}</text>`;
            });
        }

        return markup;
    }

    function coordinateObjectMarkup(object, spec) {
        const map = coordinateMetrics(spec);
        const dash = object.dash ? ' stroke-dasharray="8 6"' : '';

        if (object.type === 'point') {
            const point = coordinateScreenPoint(spec, object.x, object.y, map);
            return `<circle cx="${point.x}" cy="${point.y}" r="${object.size}" fill="${escapeHtml(object.color)}" stroke="#ffffff" stroke-width="1.5"/><text x="${point.x + object.size + 5}" y="${point.y - object.size - 4}" font-size="14" font-weight="800" fill="${escapeHtml(object.labelColor)}">${escapeHtml(object.label)}</text>`;
        }

        if (['segment', 'line', 'parallel', 'perpendicular'].includes(object.type)) {
            const [a, b] = coordinateLineEndpoints(object, spec, map);
            if (!a || !b) return '';

            let base = '';
            if (object.type === 'parallel' || object.type === 'perpendicular') {
                const baseEnds = coordinateClipLine(spec, object.x1, object.y1, object.x2, object.y2, map)
                    .map((point) => coordinateScreenPoint(spec, point.x, point.y, map));
                base = `<line x1="${baseEnds[0].x}" y1="${baseEnds[0].y}" x2="${baseEnds[1].x}" y2="${baseEnds[1].y}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="7 5"/>`;
            }

            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const relationLabel = object.label || (
                object.type === 'parallel'
                    ? '∥'
                    : (object.type === 'perpendicular' ? '⊥' : '')
            );
            const equation = object.showEquation && ['segment', 'line'].includes(object.type)
                ? coordinateLineEquation(object)
                : '';

            return `${base}<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash}/>${relationLabel ? `<text x="${midX}" y="${midY - 10}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.stroke)}">${escapeHtml(relationLabel)}</text>` : ''}${equation ? `<text x="${midX}" y="${midY + 18}" text-anchor="middle" font-size="12" fill="#475569">${escapeHtml(equation)}</text>` : ''}`;
        }

        if (object.type === 'circle') {
            const center = coordinateScreenPoint(spec, object.cx, object.cy, map);
            const radius = object.r * map.scale;
            return `<circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash}/>${object.label ? `<text x="${center.x}" y="${center.y - radius - 8}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text>` : ''}`;
        }

        if (object.type === 'ellipse') {
            const center = coordinateScreenPoint(spec, object.cx, object.cy, map);
            const rx = object.rx * map.scale;
            const ry = object.ry * map.scale;
            return `<ellipse cx="${center.x}" cy="${center.y}" rx="${rx}" ry="${ry}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash}/>${object.label ? `<text x="${center.x}" y="${center.y - ry - 8}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text>` : ''}`;
        }

        if (object.type === 'parabola') {
            const path = coordinateParabolaPath(object, spec, map);
            const vertex = coordinateScreenPoint(spec, object.vx, object.vy, map);
            return `<path d="${path}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash}/><circle cx="${vertex.x}" cy="${vertex.y}" r="4" fill="${escapeHtml(object.stroke)}"/>${object.label ? `<text x="${vertex.x + 8}" y="${vertex.y - 9}" font-size="14" font-weight="800" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text>` : ''}`;
        }

        if (object.type === 'hyperbola') {
            const path = coordinateHyperbolaPath(object, spec, map);
            const center = coordinateScreenPoint(spec, object.cx, object.cy, map);
            return `<path d="${path}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash}/><circle cx="${center.x}" cy="${center.y}" r="3.5" fill="${escapeHtml(object.stroke)}"/>${object.label ? `<text x="${center.x + 8}" y="${center.y - 8}" font-size="14" font-weight="800" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text>` : ''}`;
        }

        if (object.type === 'midpoint') {
            const a = coordinateScreenPoint(spec, object.x1, object.y1, map);
            const b = coordinateScreenPoint(spec, object.x2, object.y2, map);
            const midXWorld = (object.x1 + object.x2) / 2;
            const midYWorld = (object.y1 + object.y2) / 2;
            const midpoint = coordinateScreenPoint(spec, midXWorld, midYWorld, map);

            return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6 5"/><circle cx="${midpoint.x}" cy="${midpoint.y}" r="${object.size}" fill="${escapeHtml(object.color)}" stroke="#ffffff" stroke-width="1.5"/><text x="${midpoint.x + 9}" y="${midpoint.y - 8}" font-size="13" font-weight="800" fill="${escapeHtml(object.color)}">${escapeHtml(object.label || 'M')} (${escapeHtml(coordinateNumber(midXWorld))}, ${escapeHtml(coordinateNumber(midYWorld))})</text>`;
        }

        if (object.type === 'distance' || object.type === 'slope') {
            const a = coordinateScreenPoint(spec, object.x1, object.y1, map);
            const b = coordinateScreenPoint(spec, object.x2, object.y2, map);
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const dx = object.x2 - object.x1;
            const dy = object.y2 - object.y1;
            const distance = Math.hypot(dx, dy);
            const slope = Math.abs(dx) < 1e-9 ? 'undefined' : coordinateNumber(dy / dx);
            const value = object.type === 'distance'
                ? `${object.label || 'd'} = ${coordinateNumber(distance)}`
                : `${object.label || 'm'} = ${slope}`;
            const triangle = object.type === 'slope'
                ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${a.y}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.4" stroke-dasharray="6 4"/><line x1="${b.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.4" stroke-dasharray="6 4"/>`
                : '';

            return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"${dash}/>${triangle}<circle cx="${a.x}" cy="${a.y}" r="4" fill="${escapeHtml(object.stroke)}"/><circle cx="${b.x}" cy="${b.y}" r="4" fill="${escapeHtml(object.stroke)}"/><text x="${midX}" y="${midY - 12}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(object.stroke)}">${escapeHtml(value)}</text>`;
        }

        const point = coordinateScreenPoint(spec, object.x, object.y, map);
        return `<text x="${point.x}" y="${point.y}" text-anchor="middle" dominant-baseline="middle" font-size="${object.fontSize}" font-weight="${object.fontWeight}" fill="${escapeHtml(object.color)}" paint-order="stroke" stroke="#ffffff" stroke-width="5">${escapeHtml(object.text)}</text>`;
    }


    function numberLineMetrics(spec) {
        const left = 70, right = spec.width - 70, axisY = spec.height / 2;
        return { left, right, axisY, scale: (right - left) / Math.max(0.001, spec.numberXMax - spec.numberXMin) };
    }
    function numberLineX(spec, value, map = numberLineMetrics(spec)) {
        return map.left + (value - spec.numberXMin) * map.scale;
    }
    function numberLineLaneY(map, lane) { return map.axisY - clamp(lane, -4, 4, 0) * 58; }
    function numberLineNumber(value) {
        const rounded = Number(Number(value).toFixed(3));
        return escapeHtml(Object.is(rounded, -0) ? '0' : String(rounded));
    }
    function numberLineNotation(object) {
        if (object.notation) return object.notation;
        if (object.leftInfinite && object.rightInfinite) return '(-∞, ∞)';
        const left = object.leftInfinite ? '(' : (object.startClosed ? '[' : '(');
        const right = object.rightInfinite ? ')' : (object.endClosed ? ']' : ')');
        const a = object.leftInfinite ? '-∞' : String(Number(Number(object.start).toFixed(3)));
        const b = object.rightInfinite ? '∞' : String(Number(Number(object.end).toFixed(3)));
        return `${left}${a}, ${b}${right}`;
    }
    function numberLineBackgroundMarkup(spec) {
        const map = numberLineMetrics(spec);
        let markup = `<line x1="${map.left}" y1="${map.axisY}" x2="${map.right}" y2="${map.axisY}" stroke="#334155" stroke-width="3" marker-start="url(#qmx-number-line-arrow)" marker-end="url(#qmx-number-line-arrow)"/>`;
        if (spec.numberShowTicks) {
            const step = Math.max(.01, Number(spec.numberStep) || 1);
            const start = Math.ceil(spec.numberXMin / step) * step;
            let count = 0;
            for (let value = start; value <= spec.numberXMax + step * .001 && count < 401; value += step, count += 1) {
                const x = numberLineX(spec, value, map);
                markup += `<line x1="${x}" y1="${map.axisY - 8}" x2="${x}" y2="${map.axisY + 8}" stroke="#64748b" stroke-width="1.4"/>`;
                if (spec.numberShowTickLabels) markup += `<text x="${x}" y="${map.axisY + 27}" text-anchor="middle" font-size="12" fill="#475569">${numberLineNumber(value)}</text>`;
            }
        }
        return markup;
    }
    function numberLineObjectMarkup(object, spec) {
        const map = numberLineMetrics(spec);
        const y = numberLineLaneY(map, object.lane);
        if (object.type === 'marker') {
            const x = numberLineX(spec, object.x, map);
            const fill = object.closed ? object.color : '#ffffff';
            return `<g data-qmx-object-id="${escapeHtml(object.id)}"><circle cx="${x}" cy="${y}" r="${object.size}" fill="${escapeHtml(fill)}" stroke="${escapeHtml(object.color)}" stroke-width="3"/><text x="${x}" y="${y - 17}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.color)}">${escapeHtml(object.label || String(object.x))}</text></g>`;
        }
        if (object.type === 'text') {
            const x = numberLineX(spec, object.x, map);
            return `<text data-qmx-object-id="${escapeHtml(object.id)}" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${object.fontSize}" font-weight="${object.fontWeight}" fill="${escapeHtml(object.color)}" paint-order="stroke" stroke="#ffffff" stroke-width="5">${escapeHtml(object.text)}</text>`;
        }
        const x1 = numberLineX(spec, object.leftInfinite ? spec.numberXMin : object.start, map);
        const x2 = numberLineX(spec, object.rightInfinite ? spec.numberXMax : object.end, map);
        const startMarker = object.leftInfinite ? ' marker-start="url(#qmx-number-line-arrow)"' : '';
        const endMarker = object.rightInfinite ? ' marker-end="url(#qmx-number-line-arrow)"' : '';
        const shade = object.showShading ? `<rect x="${Math.min(x1,x2)}" y="${y - 13}" width="${Math.max(1,Math.abs(x2-x1))}" height="26" rx="13" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}"/>` : '';
        const leftPoint = object.leftInfinite ? '' : `<circle cx="${x1}" cy="${y}" r="9" fill="${object.startClosed ? escapeHtml(object.color) : '#ffffff'}" stroke="${escapeHtml(object.color)}" stroke-width="3"/>`;
        const rightPoint = object.rightInfinite ? '' : `<circle cx="${x2}" cy="${y}" r="9" fill="${object.endClosed ? escapeHtml(object.color) : '#ffffff'}" stroke="${escapeHtml(object.color)}" stroke-width="3"/>`;
        const label = object.label ? `<text x="${(x1+x2)/2}" y="${y - 22}" text-anchor="middle" font-size="15" font-weight="800" fill="${escapeHtml(object.color)}">${escapeHtml(object.label)}</text>` : '';
        const notation = spec.numberShowNotation ? `<text x="${(x1+x2)/2}" y="${y + 33}" text-anchor="middle" font-size="14" font-weight="700" fill="#334155">${escapeHtml(numberLineNotation(object))}</text>` : '';
        return `<g data-qmx-object-id="${escapeHtml(object.id)}">${shade}<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${escapeHtml(object.color)}" stroke-width="${object.strokeWidth}" stroke-linecap="round"${startMarker}${endMarker}/>${leftPoint}${rightPoint}${label}${notation}</g>`;
    }
    function numberLineMarkup(spec) {
        return numberLineBackgroundMarkup(spec) + spec.objects.map((object) => numberLineObjectMarkup(object, spec)).join('');
    }


    function treeNodeMap(spec) {
        const map = new Map();
        spec.objects.forEach((object) => {
            if (object.type === 'tree-node') map.set(object.id, object);
        });
        return map;
    }
    function treeBoundaryPoint(node, targetX, targetY) {
        const dx = targetX - node.x;
        const dy = targetY - node.y;
        if (!dx && !dy) return { x: node.x, y: node.y };
        if (node.shape === 'circle') {
            const rx = node.width / 2;
            const ry = node.height / 2;
            const scale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
            return { x: node.x + dx * scale, y: node.y + dy * scale };
        }
        const halfW = node.width / 2;
        const halfH = node.height / 2;
        const scale = Math.min(halfW / Math.max(Math.abs(dx), .0001), halfH / Math.max(Math.abs(dy), .0001));
        return { x: node.x + dx * scale, y: node.y + dy * scale };
    }
    function treeEdgeMarkup(object, spec, nodes) {
        const from = nodes.get(object.from);
        const to = nodes.get(object.to);
        if (!from || !to) return '';
        const start = treeBoundaryPoint(from, to.x, to.y);
        const end = treeBoundaryPoint(to, from.x, from.y);
        const vertical = spec.treeOrientation !== 'horizontal';
        let path;
        if (vertical) {
            const midY = (start.y + end.y) / 2;
            path = `M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}`;
        } else {
            const midX = (start.x + end.x) / 2;
            path = `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
        }
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const dash = object.dash ? ' stroke-dasharray="8 6"' : '';
        const arrow = object.arrow ? ' marker-end="url(#qmx-diagram-arrow)"' : '';
        const showLabel = spec.treeShowEdgeLabels && object.label;
        const showProbability = spec.treeShowProbabilities && object.probability;
        const longest = Math.max(showLabel ? String(object.label).length : 0, showProbability ? String(object.probability).length : 0);
        const labelWidth = Math.max(34, longest * 8 + 16);
        const labelHeight = showLabel && showProbability ? 42 : 25;
        const labelBox = (showLabel || showProbability)
            ? `<rect x="${midX - labelWidth / 2}" y="${midY - labelHeight / 2}" width="${labelWidth}" height="${labelHeight}" rx="7" fill="#ffffff" fill-opacity=".92" stroke="#e2e8f0" stroke-width="1"/>`
            : '';
        const label = showLabel
            ? `<text x="${midX}" y="${midY + (showProbability ? -5 : 5)}" text-anchor="middle" font-size="14" font-weight="700" fill="${escapeHtml(object.color)}">${escapeHtml(object.label)}</text>`
            : '';
        const probability = showProbability
            ? `<text x="${midX}" y="${midY + (showLabel ? 13 : 5)}" text-anchor="middle" font-size="13" font-weight="700" fill="#7c3aed">${escapeHtml(object.probability)}</text>`
            : '';
        return `<g data-qmx-object-id="${escapeHtml(object.id)}"><path d="${path}" fill="none" stroke="${escapeHtml(object.color)}" stroke-width="${object.strokeWidth}"${dash}${arrow}/>${labelBox}${label}${probability}</g>`;
    }
    function treeNodeMarkup(object) {
        const x = object.x - object.width / 2;
        const y = object.y - object.height / 2;
        let shape = '';
        if (object.shape === 'circle') {
            shape = `<ellipse cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${object.height / 2}" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/>`;
        } else if (object.shape === 'diamond') {
            const points = `${object.x},${y} ${x + object.width},${object.y} ${object.x},${y + object.height} ${x},${object.y}`;
            shape = `<polygon points="${points}" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/>`;
        } else {
            const radius = object.shape === 'rounded' ? Math.min(16, object.height / 3) : 2;
            shape = `<rect x="${x}" y="${y}" width="${object.width}" height="${object.height}" rx="${radius}" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/>`;
        }
        const labelY = object.subtitle ? object.y - 7 : object.y + object.fontSize * .33;
        const subtitle = object.subtitle
            ? `<text x="${object.x}" y="${object.y + object.fontSize * .95}" text-anchor="middle" font-size="${Math.max(10, object.fontSize * .68)}" fill="${escapeHtml(object.textColor)}" opacity=".72">${escapeHtml(object.subtitle)}</text>`
            : '';
        return `<g data-qmx-object-id="${escapeHtml(object.id)}">${shape}<text x="${object.x}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-size="${object.fontSize}" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.label)}</text>${subtitle}</g>`;
    }
    function treeTextMarkup(object) {
        return `<text data-qmx-object-id="${escapeHtml(object.id)}" x="${object.x}" y="${object.y}" text-anchor="middle" dominant-baseline="middle" font-size="${object.fontSize}" font-weight="${object.fontWeight}" fill="${escapeHtml(object.color)}" paint-order="stroke" stroke="#ffffff" stroke-width="5">${escapeHtml(object.text)}</text>`;
    }

    function technicalLineDash(object) {
        if (object.dash) return object.dash;
        return ({ hidden:'10 7', centre:'18 6 3 6', construction:'5 5', extension:'' })[object.lineStyle] || '';
    }
    function technicalTextMarkup(x, y, text, options = {}) {
        return `<text x="${x}" y="${y}" fill="${escapeHtml(options.color || '#0f172a')}" font-size="${options.fontSize || 18}" font-weight="${options.fontWeight || 'normal'}" text-anchor="${options.anchor || 'start'}" dominant-baseline="middle"${options.rotation ? ` transform="rotate(${options.rotation} ${x} ${y})"` : ''}>${escapeHtml(text)}</text>`;
    }
    function technicalObjectMarkup(object, spec) {
        const common = `stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" opacity="${object.opacity}"`;
        const id = ` data-object-id="${escapeHtml(object.id)}"`;
        if (object.type === 'tech-line') return `<line${id} x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" ${common} fill="none"${technicalLineDash(object)?` stroke-dasharray="${escapeHtml(technicalLineDash(object))}"`:''}/>`;
        if (object.type === 'tech-rect') return `<rect${id} x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" ${common} fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}"/>`;
        if (object.type === 'tech-circle') return `<circle${id} cx="${object.cx}" cy="${object.cy}" r="${object.r}" ${common} fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}"/>`;
        if (object.type === 'tech-arc') {
            const a1=object.startAngle*Math.PI/180,a2=object.endAngle*Math.PI/180,x1=object.cx+object.r*Math.cos(a1),y1=object.cy+object.r*Math.sin(a1),x2=object.cx+object.r*Math.cos(a2),y2=object.cy+object.r*Math.sin(a2),large=Math.abs(object.endAngle-object.startAngle)%360>180?1:0,sweep=object.endAngle>=object.startAngle?1:0;
            return `<path${id} d="M ${x1} ${y1} A ${object.r} ${object.r} 0 ${large} ${sweep} ${x2} ${y2}" ${common} fill="none"/>`;
        }
        if (object.type === 'tech-polyline') return `<${object.closed?'polygon':'polyline'}${id} points="${object.points.map((p)=>`${p.x},${p.y}`).join(' ')}" ${common} fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}"/>`;
        if (object.type === 'tech-centre-mark') return `<g${id} ${common}><line x1="${object.cx-object.size}" y1="${object.cy}" x2="${object.cx+object.size}" y2="${object.cy}" stroke-dasharray="14 5 3 5"/><line x1="${object.cx}" y1="${object.cy-object.size}" x2="${object.cx}" y2="${object.cy+object.size}" stroke-dasharray="14 5 3 5"/><circle cx="${object.cx}" cy="${object.cy}" r="3" fill="${escapeHtml(object.stroke)}" stroke="none"/></g>`;
        if (object.type === 'tech-dimension') {
            const dx=object.x2-object.x1,dy=object.y2-object.y1,len=Math.max(0.001,Math.hypot(dx,dy)),nx=-dy/len,ny=dx/len,ax=object.x1+nx*object.offset,ay=object.y1+ny*object.offset,bx=object.x2+nx*object.offset,by=object.y2+ny*object.offset,ext=10;
            const measurement=object.label || `${len.toFixed(object.precision)} ${object.units}`;
            const mx=(ax+bx)/2,my=(ay+by)/2-8;
            return `<g${id} stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" fill="none"><line x1="${object.x1}" y1="${object.y1}" x2="${ax+nx*ext}" y2="${ay+ny*ext}"/><line x1="${object.x2}" y1="${object.y2}" x2="${bx+nx*ext}" y2="${by+ny*ext}"/><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" marker-start="url(#qmx-tech-dim-arrow)" marker-end="url(#qmx-tech-dim-arrow)"/></g>${technicalTextMarkup(mx,my,measurement,{color:object.textColor,fontSize:object.fontSize,anchor:'middle'})}`;
        }
        if (object.type === 'tech-leader') return `<g${id}><line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" ${common} marker-start="url(#qmx-tech-leader-arrow)"/><line x1="${object.x2}" y1="${object.y2}" x2="${object.x2+80}" y2="${object.y2}" ${common}/>${technicalTextMarkup(object.x2+86,object.y2,object.text,{color:object.textColor,fontSize:object.fontSize})}</g>`;
        if (object.type === 'tech-hatch') {
            let lines=''; const spacing=Math.max(4,object.spacing), span=object.w+object.h;
            for(let d=-object.h;d<object.w;d+=spacing){const x1=object.x+Math.max(0,d),y1=object.y+Math.max(0,-d),x2=object.x+Math.min(object.w,d+object.h),y2=object.y+Math.min(object.h,object.h+d);lines+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;}
            return `<g${id}><rect x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}"/><g stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}">${lines}</g>${object.label?technicalTextMarkup(object.x+object.w/2,object.y+object.h/2,object.label,{color:object.stroke,fontSize:15,anchor:'middle'}):''}</g>`;
        }
        if (object.type === 'tech-title-block') {
            const col=object.x+object.w*.62,row=object.y+object.h*.5;
            return `<g${id} stroke="${escapeHtml(object.stroke)}" stroke-width="${object.strokeWidth}" fill="${escapeHtml(object.fill)}"><rect x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}"/><line x1="${col}" y1="${object.y}" x2="${col}" y2="${object.y+object.h}"/><line x1="${col}" y1="${row}" x2="${object.x+object.w}" y2="${row}"/><line x1="${object.x}" y1="${object.y+object.h*.68}" x2="${col}" y2="${object.y+object.h*.68}"/></g>${technicalTextMarkup(object.x+12,object.y+object.h*.32,object.title,{fontSize:18,fontWeight:'bold'})}${technicalTextMarkup(object.x+12,object.y+object.h*.82,`DRAWN: ${object.drawnBy}   DATE: ${object.date}`,{fontSize:12})}${technicalTextMarkup(col+8,object.y+object.h*.25,`NO: ${object.drawingNo}`,{fontSize:13})}${technicalTextMarkup(col+8,object.y+object.h*.72,`SCALE ${object.scale}   SHEET ${object.sheet}`,{fontSize:12})}`;
        }
        return `<text${id} x="${object.x}" y="${object.y}" fill="${escapeHtml(object.color)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}"${object.rotation?` transform="rotate(${object.rotation} ${object.x} ${object.y})"`:''}>${escapeHtml(object.text)}</text>`;
    }
    function technicalMarkup(spec) {
        let markup='';
        if (spec.techShowGrid) markup += `<rect width="100%" height="100%" fill="url(#qmx-geometry-grid)"/>`;
        if (spec.techShowBorder) markup += `<rect x="28" y="28" width="${spec.width-56}" height="${spec.height-56}" fill="none" stroke="#475569" stroke-width="2"/>`;
        markup += spec.objects.map((object)=>technicalObjectMarkup(object,spec)).join('');
        return markup;
    }

    function treeMarkup(spec) {
        const nodes = treeNodeMap(spec);
        const grid = spec.treeShowGrid ? `<rect width="100%" height="100%" fill="url(#qmx-geometry-grid)"/>` : '';
        const edges = spec.objects.filter((object) => object.type === 'tree-edge').map((object) => treeEdgeMarkup(object, spec, nodes)).join('');
        const nodeMarkup = spec.objects.filter((object) => object.type === 'tree-node').map(treeNodeMarkup).join('');
        const textMarkup = spec.objects.filter((object) => object.type === 'text').map(treeTextMarkup).join('');
        return grid + edges + nodeMarkup + textMarkup;
    }

    function coordinateMarkup(spec) {
        return coordinateBackgroundMarkup(spec) +
            spec.objects.map((object) => coordinateObjectMarkup(object, spec)).join('');
    }

    function geometryBackgroundMarkup(spec) {
        let markup = '';
        if (spec.showGrid) {
            markup += `<rect width="100%" height="100%" fill="url(#qmx-geometry-grid)"/>`;
        }
        if (spec.showAxes) {
            const cx = spec.width / 2;
            const cy = spec.height / 2;
            markup += `<line x1="0" y1="${cy}" x2="${spec.width}" y2="${cy}" stroke="#94a3b8" stroke-width="1"/><line x1="${cx}" y1="0" x2="${cx}" y2="${spec.height}" stroke="#94a3b8" stroke-width="1"/><text x="${spec.width - 18}" y="${cy - 7}" fill="#64748b" font-size="14">x</text><text x="${cx + 8}" y="18" fill="#64748b" font-size="14">y</text>`;
        }
        return markup;
    }


    function statisticalNumber(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '0';
        if (Math.abs(number) >= 1000000) return number.toExponential(2);
        return Number(number.toFixed(2)).toString();
    }

    function statisticalChartMetrics(object) {
        const titleSpace = object.title ? 34 : 12;
        return {
            left: object.x + 58,
            top: object.y + titleSpace + 12,
            right: object.x + object.w - 24,
            bottom: object.y + object.h - 48,
            width: Math.max(30, object.w - 82),
            height: Math.max(30, object.h - titleSpace - 60),
            titleY: object.y + 22
        };
    }

    function statisticalGridAxes(object, metrics, minValue, maxValue) {
        let markup = '';
        const range = Math.max(0.000001, maxValue - minValue);
        if (object.showGrid) {
            for (let index = 0; index <= 5; index += 1) {
                const y = metrics.top + (metrics.height * index / 5);
                const value = maxValue - range * index / 5;
                markup += `<line x1="${metrics.left}" y1="${y}" x2="${metrics.right}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
                markup += `<text x="${metrics.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#64748b">${escapeHtml(statisticalNumber(value))}</text>`;
            }
        }
        if (object.showAxes) {
            markup += `<line x1="${metrics.left}" y1="${metrics.top}" x2="${metrics.left}" y2="${metrics.bottom}" stroke="#334155" stroke-width="1.8"/>`;
            markup += `<line x1="${metrics.left}" y1="${metrics.bottom}" x2="${metrics.right}" y2="${metrics.bottom}" stroke="#334155" stroke-width="1.8"/>`;
        }
        if (object.xLabel) markup += `<text x="${(metrics.left + metrics.right) / 2}" y="${object.y + object.h - 10}" text-anchor="middle" font-size="12" fill="#475569">${escapeHtml(object.xLabel)}</text>`;
        if (object.yLabel) markup += `<text x="${object.x + 14}" y="${(metrics.top + metrics.bottom) / 2}" text-anchor="middle" font-size="12" fill="#475569" transform="rotate(-90 ${object.x + 14} ${(metrics.top + metrics.bottom) / 2})">${escapeHtml(object.yLabel)}</text>`;
        return markup;
    }

    function statisticalTitle(object, metrics) {
        return object.title
            ? `<text x="${object.x + object.w / 2}" y="${metrics.titleY}" text-anchor="middle" font-size="18" font-weight="800" fill="#0f172a">${escapeHtml(object.title)}</text>`
            : '';
    }

    function statisticalBarLikeMarkup(object, histogram = false) {
        const metrics = statisticalChartMetrics(object);
        const values = object.values.length ? object.values : [0];
        const labels = object.labels.length ? object.labels : values.map((_value, index) => String(index + 1));
        const minValue = Math.min(0, ...values);
        const maxValue = Math.max(1, ...values);
        const range = Math.max(0.000001, maxValue - minValue);
        const zeroY = metrics.bottom - ((0 - minValue) / range) * metrics.height;
        const slot = metrics.width / Math.max(1, values.length);
        const gap = histogram ? 0 : Math.min(18, slot * 0.22);
        let markup = statisticalTitle(object, metrics);
        markup += statisticalGridAxes(object, metrics, minValue, maxValue);
        values.forEach((value, index) => {
            const barX = metrics.left + index * slot + gap / 2;
            const valueY = metrics.bottom - ((value - minValue) / range) * metrics.height;
            const y = Math.min(valueY, zeroY);
            const height = Math.max(1, Math.abs(zeroY - valueY));
            const color = object.colors[index % object.colors.length] || object.fill;
            markup += `<rect x="${barX}" y="${y}" width="${Math.max(1, slot - gap)}" height="${height}" fill="${escapeHtml(color)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
            markup += `<text x="${barX + (slot - gap) / 2}" y="${metrics.bottom + 16}" text-anchor="middle" font-size="10" fill="#475569">${escapeHtml(labels[index] ?? '')}</text>`;
            if (object.showValues) markup += `<text x="${barX + (slot - gap) / 2}" y="${value >= 0 ? y - 6 : y + height + 14}" text-anchor="middle" font-size="11" font-weight="700" fill="#0f172a">${escapeHtml(statisticalNumber(value))}</text>`;
        });
        return markup;
    }

    function statisticalLineChartMarkup(object) {
        const metrics = statisticalChartMetrics(object);
        const values = object.values.length ? object.values : [0];
        const labels = object.labels.length ? object.labels : values.map((_value, index) => String(index + 1));
        const minValue = Math.min(0, ...values);
        const maxValue = Math.max(1, ...values);
        const range = Math.max(0.000001, maxValue - minValue);
        const points = values.map((value, index) => {
            const x = metrics.left + (values.length === 1 ? metrics.width / 2 : metrics.width * index / (values.length - 1));
            const y = metrics.bottom - ((value - minValue) / range) * metrics.height;
            return { x, y, value, label: labels[index] ?? '' };
        });
        let markup = statisticalTitle(object, metrics);
        markup += statisticalGridAxes(object, metrics, minValue, maxValue);
        markup += `<polyline points="${points.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
        points.forEach((point) => {
            markup += `<circle cx="${point.x}" cy="${point.y}" r="5" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="2"/>`;
            markup += `<text x="${point.x}" y="${metrics.bottom + 16}" text-anchor="middle" font-size="10" fill="#475569">${escapeHtml(point.label)}</text>`;
            if (object.showValues) markup += `<text x="${point.x}" y="${point.y - 9}" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">${escapeHtml(statisticalNumber(point.value))}</text>`;
        });
        return markup;
    }

    function statisticalPieMarkup(object) {
        const values = object.values.map((value) => Math.max(0, value));
        const total = values.reduce((sum, value) => sum + value, 0) || 1;
        const cx = object.x + object.w * (object.showLegend ? 0.38 : 0.5);
        const cy = object.y + object.h * 0.55;
        const radius = Math.max(30, Math.min(object.w * (object.showLegend ? 0.29 : 0.38), object.h * 0.34));
        let angle = -Math.PI / 2;
        let markup = object.title ? `<text x="${object.x + object.w / 2}" y="${object.y + 26}" text-anchor="middle" font-size="18" font-weight="800" fill="#0f172a">${escapeHtml(object.title)}</text>` : '';
        values.forEach((value, index) => {
            const next = angle + value / total * Math.PI * 2;
            const x1 = cx + Math.cos(angle) * radius;
            const y1 = cy + Math.sin(angle) * radius;
            const x2 = cx + Math.cos(next) * radius;
            const y2 = cy + Math.sin(next) * radius;
            const large = next - angle > Math.PI ? 1 : 0;
            const color = object.colors[index % object.colors.length] || object.fill;
            markup += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z" fill="${escapeHtml(color)}" fill-opacity="${object.fillOpacity}" stroke="#ffffff" stroke-width="2"/>`;
            if (object.showValues) {
                const mid = (angle + next) / 2;
                const tx = cx + Math.cos(mid) * radius * 0.62;
                const ty = cy + Math.sin(mid) * radius * 0.62;
                markup += `<text x="${tx}" y="${ty + 4}" text-anchor="middle" font-size="11" font-weight="800" fill="#0f172a">${escapeHtml(statisticalNumber(value / total * 100))}%</text>`;
            }
            angle = next;
        });
        if (object.showLegend) {
            const legendX = object.x + object.w * 0.7;
            const legendY = object.y + 70;
            object.labels.slice(0, values.length).forEach((label, index) => {
                const y = legendY + index * 25;
                const color = object.colors[index % object.colors.length] || object.fill;
                markup += `<rect x="${legendX}" y="${y - 11}" width="14" height="14" rx="2" fill="${escapeHtml(color)}"/><text x="${legendX + 21}" y="${y}" font-size="12" fill="#334155">${escapeHtml(label)} (${escapeHtml(statisticalNumber(values[index]))})</text>`;
            });
        }
        return markup;
    }

    function statisticalBoxPlotMarkup(object) {
        const values = object.fiveNumber.slice(0, 5).map(Number);
        while (values.length < 5) values.push(values.at(-1) || 0);
        const sorted = values.slice().sort((a, b) => a - b);
        const [min, q1, median, q3, max] = sorted;
        const metrics = statisticalChartMetrics(object);
        const range = Math.max(0.000001, max - min);
        const mapX = (value) => metrics.left + (value - min) / range * metrics.width;
        const y = metrics.top + metrics.height * 0.52;
        const boxHeight = Math.min(100, metrics.height * 0.34);
        let markup = statisticalTitle(object, metrics);
        if (object.showGrid) {
            for (let index = 0; index <= 5; index += 1) {
                const x = metrics.left + metrics.width * index / 5;
                const value = min + range * index / 5;
                markup += `<line x1="${x}" y1="${metrics.top}" x2="${x}" y2="${metrics.bottom}" stroke="#e2e8f0" stroke-width="1"/><text x="${x}" y="${metrics.bottom + 17}" text-anchor="middle" font-size="10" fill="#64748b">${escapeHtml(statisticalNumber(value))}</text>`;
            }
        }
        markup += `<line x1="${mapX(min)}" y1="${y}" x2="${mapX(max)}" y2="${y}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
        markup += `<line x1="${mapX(min)}" y1="${y - boxHeight / 3}" x2="${mapX(min)}" y2="${y + boxHeight / 3}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
        markup += `<line x1="${mapX(max)}" y1="${y - boxHeight / 3}" x2="${mapX(max)}" y2="${y + boxHeight / 3}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
        markup += `<rect x="${mapX(q1)}" y="${y - boxHeight / 2}" width="${Math.max(1, mapX(q3) - mapX(q1))}" height="${boxHeight}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
        markup += `<line x1="${mapX(median)}" y1="${y - boxHeight / 2}" x2="${mapX(median)}" y2="${y + boxHeight / 2}" stroke="#dc2626" stroke-width="${object.lineWidth + 1}"/>`;
        if (object.showValues) {
            [min, q1, median, q3, max].forEach((value, index) => {
                markup += `<text x="${mapX(value)}" y="${y + boxHeight / 2 + 20 + (index % 2) * 14}" text-anchor="middle" font-size="11" font-weight="700" fill="#334155">${escapeHtml(statisticalNumber(value))}</text>`;
            });
        }
        if (object.xLabel) markup += `<text x="${(metrics.left + metrics.right) / 2}" y="${object.y + object.h - 10}" text-anchor="middle" font-size="12" fill="#475569">${escapeHtml(object.xLabel)}</text>`;
        return markup;
    }

    function statisticalScatterMarkup(object) {
        const points = object.points.length ? object.points : [{x:0,y:0}];
        let minX = Math.min(...points.map((point) => point.x));
        let maxX = Math.max(...points.map((point) => point.x));
        let minY = Math.min(...points.map((point) => point.y));
        let maxY = Math.max(...points.map((point) => point.y));
        if (minX === maxX) { minX -= 1; maxX += 1; }
        if (minY === maxY) { minY -= 1; maxY += 1; }
        const padX = (maxX - minX) * 0.08;
        const padY = (maxY - minY) * 0.08;
        minX -= padX; maxX += padX; minY -= padY; maxY += padY;
        const metrics = statisticalChartMetrics(object);
        const mapX = (value) => metrics.left + (value - minX) / (maxX - minX) * metrics.width;
        const mapY = (value) => metrics.bottom - (value - minY) / (maxY - minY) * metrics.height;
        let markup = statisticalTitle(object, metrics);
        markup += statisticalGridAxes(object, metrics, minY, maxY);
        points.forEach((point, index) => {
            markup += `<circle cx="${mapX(point.x)}" cy="${mapY(point.y)}" r="5.5" fill="${escapeHtml(object.colors[index % object.colors.length] || object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.5"/>`;
            if (object.showValues) markup += `<text x="${mapX(point.x) + 7}" y="${mapY(point.y) - 7}" font-size="9" fill="#475569">(${escapeHtml(statisticalNumber(point.x))}, ${escapeHtml(statisticalNumber(point.y))})</text>`;
        });
        if (object.showTrendline && points.length >= 2) {
            const count = points.length;
            const sumX = points.reduce((sum, point) => sum + point.x, 0);
            const sumY = points.reduce((sum, point) => sum + point.y, 0);
            const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
            const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
            const denominator = count * sumXX - sumX * sumX;
            if (Math.abs(denominator) > 1e-9) {
                const slope = (count * sumXY - sumX * sumY) / denominator;
                const intercept = (sumY - slope * sumX) / count;
                const y1 = slope * minX + intercept;
                const y2 = slope * maxX + intercept;
                markup += `<line x1="${mapX(minX)}" y1="${mapY(y1)}" x2="${mapX(maxX)}" y2="${mapY(y2)}" stroke="#dc2626" stroke-width="2" stroke-dasharray="8 5"/>`;
            }
        }
        return markup;
    }

    function statisticalObjectMarkup(object) {
        const id = ` data-object-id="${escapeHtml(object.id)}"`;
        let body = '';
        if (object.type === 'stat-bar') body = statisticalBarLikeMarkup(object, false);
        else if (object.type === 'stat-histogram') body = statisticalBarLikeMarkup(object, true);
        else if (object.type === 'stat-frequency-polygon' || object.type === 'stat-ogive') body = statisticalLineChartMarkup(object);
        else if (object.type === 'stat-pie') body = statisticalPieMarkup(object);
        else if (object.type === 'stat-box-plot') body = statisticalBoxPlotMarkup(object);
        else if (object.type === 'stat-scatter') body = statisticalScatterMarkup(object);
        return `<g${id} opacity="${object.opacity}"><rect x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>${body}</g>`;
    }

    function statisticalMarkup(spec) {
        return spec.objects.map(statisticalObjectMarkup).join('');
    }


    function functionPlotMetrics(spec) {
        return { left: 78, right: spec.width - 34, top: 34, bottom: spec.height - 58 };
    }
    function functionMapX(spec, metrics, x) { return metrics.left + ((x - spec.functionXMin) / (spec.functionXMax - spec.functionXMin)) * (metrics.right - metrics.left); }
    function functionMapY(spec, metrics, y) { return metrics.bottom - ((y - spec.functionYMin) / (spec.functionYMax - spec.functionYMin)) * (metrics.bottom - metrics.top); }
    function functionFormatNumber(value) {
        if (!Number.isFinite(value)) return '';
        if (Math.abs(value) < 1e-10) return '0';
        const rounded = Math.round(value * 1000) / 1000;
        return String(rounded).replace('-', '−');
    }

    function complexPlotMetrics(spec) { return { left: 76, right: spec.width - 36, top: 34, bottom: spec.height - 58 }; }
    function complexMapX(spec, metrics, value) { return metrics.left + ((value - spec.complexXMin) / (spec.complexXMax - spec.complexXMin)) * (metrics.right - metrics.left); }
    function complexMapY(spec, metrics, value) { return metrics.bottom - ((value - spec.complexYMin) / (spec.complexYMax - spec.complexYMin)) * (metrics.bottom - metrics.top); }
    function complexPointAt(spec, metrics, radius, angleDegrees) {
        const angle = angleDegrees * Math.PI / 180;
        return { x: complexMapX(spec, metrics, radius * Math.cos(angle)), y: complexMapY(spec, metrics, radius * Math.sin(angle)) };
    }
    function complexBackgroundMarkup(spec) {
        const m = complexPlotMetrics(spec), step = spec.complexGridStep;
        let markup = `<rect x="${m.left}" y="${m.top}" width="${m.right-m.left}" height="${m.bottom-m.top}" fill="#ffffff" fill-opacity="0.01"/>`;
        if (spec.complexShowGrid) {
            for (let x = Math.ceil(spec.complexXMin / step) * step, guard = 0; x <= spec.complexXMax + step * 0.001 && guard < 600; x += step, guard++) {
                const px = complexMapX(spec,m,x); markup += `<line x1="${px}" y1="${m.top}" x2="${px}" y2="${m.bottom}" stroke="#e2e8f0" stroke-width="${Math.abs(x)<step*0.001?1.4:1}"/>`;
            }
            for (let y = Math.ceil(spec.complexYMin / step) * step, guard = 0; y <= spec.complexYMax + step * 0.001 && guard < 600; y += step, guard++) {
                const py = complexMapY(spec,m,y); markup += `<line x1="${m.left}" y1="${py}" x2="${m.right}" y2="${py}" stroke="#e2e8f0" stroke-width="${Math.abs(y)<step*0.001?1.4:1}"/>`;
            }
        }
        const origin = { x:complexMapX(spec,m,0), y:complexMapY(spec,m,0) };
        const unitX = Math.abs(complexMapX(spec,m,1)-complexMapX(spec,m,0)), unitY = Math.abs(complexMapY(spec,m,1)-complexMapY(spec,m,0));
        if (spec.complexShowPolarGrid) {
            const maxRadius = Math.min(Math.max(Math.abs(spec.complexXMin),Math.abs(spec.complexXMax)), Math.max(Math.abs(spec.complexYMin),Math.abs(spec.complexYMax)));
            for (let radius=step,guard=0;radius<=maxRadius+step*0.001&&guard<100;radius+=step,guard++) markup += `<ellipse cx="${origin.x}" cy="${origin.y}" rx="${radius*unitX}" ry="${radius*unitY}" fill="none" stroke="#cbd5e1" stroke-dasharray="4 4"/>`;
            for (let angle=0;angle<360;angle+=30) { const p=complexPointAt(spec,m,maxRadius,angle); markup += `<line x1="${origin.x}" y1="${origin.y}" x2="${p.x}" y2="${p.y}" stroke="#dbe4ef" stroke-dasharray="4 5"/>`; }
        }
        if (spec.complexShowAxes) {
            const y0=complexMapY(spec,m,0), x0=complexMapX(spec,m,0);
            markup += `<line x1="${m.left}" y1="${y0}" x2="${m.right}" y2="${y0}" stroke="#334155" stroke-width="2" marker-end="url(#qmx-coordinate-arrow)"/><line x1="${x0}" y1="${m.bottom}" x2="${x0}" y2="${m.top}" stroke="#334155" stroke-width="2" marker-end="url(#qmx-coordinate-arrow)"/>`;
            if (spec.complexShowLabels) markup += `<text x="${m.right-4}" y="${y0-10}" text-anchor="end" font-size="15" font-weight="700" fill="#0f172a">Re(z)</text><text x="${x0+10}" y="${m.top+16}" font-size="15" font-weight="700" fill="#0f172a">Im(z)</text>`;
        }
        if (spec.complexShowTicks) {
            const y0=complexMapY(spec,m,0), x0=complexMapX(spec,m,0);
            for (let x=Math.ceil(spec.complexXMin/step)*step,guard=0;x<=spec.complexXMax+step*0.001&&guard<200;x+=step,guard++) { if(Math.abs(x)<step*0.001)continue; const px=complexMapX(spec,m,x); markup+=`<line x1="${px}" y1="${y0-4}" x2="${px}" y2="${y0+4}" stroke="#334155"/><text x="${px}" y="${y0+18}" text-anchor="middle" font-size="10" fill="#64748b">${escapeHtml(Number(x.toFixed(4)))}</text>`; }
            for (let y=Math.ceil(spec.complexYMin/step)*step,guard=0;y<=spec.complexYMax+step*0.001&&guard<200;y+=step,guard++) { if(Math.abs(y)<step*0.001)continue; const py=complexMapY(spec,m,y); markup+=`<line x1="${x0-4}" y1="${py}" x2="${x0+4}" y2="${py}" stroke="#334155"/><text x="${x0-8}" y="${py+4}" text-anchor="end" font-size="10" fill="#64748b">${escapeHtml(Number(y.toFixed(4)))}i</text>`; }
        }
        return markup;
    }
    function complexArcPath(spec,m,radius,startAngle,endAngle) {
        let sweep=endAngle-startAngle; while(sweep>360)sweep-=360; while(sweep<-360)sweep+=360;
        const start=complexPointAt(spec,m,radius,startAngle), end=complexPointAt(spec,m,radius,endAngle), large=Math.abs(sweep)>180?1:0, flag=sweep>=0?0:1;
        const rx=Math.abs(complexMapX(spec,m,radius)-complexMapX(spec,m,0)), ry=Math.abs(complexMapY(spec,m,radius)-complexMapY(spec,m,0));
        return { d:`M ${start.x} ${start.y} A ${rx} ${ry} 0 ${large} ${flag} ${end.x} ${end.y}`, start, end, sweep, rx, ry };
    }
    function complexRegionPath(spec,m,object) {
        const inner=Math.min(object.innerRadius,object.outerRadius), outer=Math.max(object.innerRadius,object.outerRadius), a=object.startAngle, b=object.endAngle;
        const outerArc=complexArcPath(spec,m,outer,a,b), innerArc=complexArcPath(spec,m,Math.max(inner,0.0001),b,a);
        if (inner <= 0.0001) { const origin={x:complexMapX(spec,m,0),y:complexMapY(spec,m,0)}; return `M ${origin.x} ${origin.y} L ${outerArc.start.x} ${outerArc.start.y} ${outerArc.d.slice(outerArc.d.indexOf('A'))} Z`; }
        return `${outerArc.d} L ${innerArc.start.x} ${innerArc.start.y} ${innerArc.d.slice(innerArc.d.indexOf('A'))} Z`;
    }
    function complexObjectMarkup(spec,object) {
        const m=complexPlotMetrics(spec), id=` data-object-id="${escapeHtml(object.id)}"`, origin={x:complexMapX(spec,m,0),y:complexMapY(spec,m,0)};
        if(object.type==='complex-point') { const p={x:complexMapX(spec,m,object.re),y:complexMapY(spec,m,object.im)}; const guides=object.showProjection?`<line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${origin.y}" stroke="${escapeHtml(object.color)}" stroke-dasharray="4 4" opacity=".45"/><line x1="${p.x}" y1="${p.y}" x2="${origin.x}" y2="${p.y}" stroke="${escapeHtml(object.color)}" stroke-dasharray="4 4" opacity=".45"/>`:''; return `<g${id}>${guides}<circle cx="${p.x}" cy="${p.y}" r="${object.radius}" fill="${object.filled?escapeHtml(object.color):'#ffffff'}" stroke="${escapeHtml(object.color)}" stroke-width="2"/><text x="${p.x+9}" y="${p.y-9}" font-size="13" font-weight="700" fill="${escapeHtml(object.color)}">${escapeHtml(object.label)}</text></g>`; }
        if(object.type==='complex-vector') { const p={x:complexMapX(spec,m,object.re),y:complexMapY(spec,m,object.im)}; const components=object.showComponents?`<line x1="${origin.x}" y1="${origin.y}" x2="${p.x}" y2="${origin.y}" stroke="${escapeHtml(object.color)}" stroke-dasharray="5 5" opacity=".45"/><line x1="${p.x}" y1="${origin.y}" x2="${p.x}" y2="${p.y}" stroke="${escapeHtml(object.color)}" stroke-dasharray="5 5" opacity=".45"/>`:''; return `<g${id}>${components}<line x1="${origin.x}" y1="${origin.y}" x2="${p.x}" y2="${p.y}" stroke="${escapeHtml(object.color)}" stroke-width="${object.lineWidth}" stroke-dasharray="${object.dashed?'8 6':''}" marker-end="url(#qmx-coordinate-arrow)"/><text x="${(origin.x+p.x)/2+7}" y="${(origin.y+p.y)/2-8}" font-size="13" font-weight="700" fill="${escapeHtml(object.color)}">${escapeHtml(object.label)}</text></g>`; }
        if(object.type==='complex-circle') { const c={x:complexMapX(spec,m,object.centerRe),y:complexMapY(spec,m,object.centerIm)}, rx=Math.abs(complexMapX(spec,m,object.centerRe+object.radius)-c.x), ry=Math.abs(complexMapY(spec,m,object.centerIm+object.radius)-c.y); return `<g${id}><ellipse cx="${c.x}" cy="${c.y}" rx="${rx}" ry="${ry}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="${object.dashed?'8 6':''}"/><circle cx="${c.x}" cy="${c.y}" r="3" fill="${escapeHtml(object.stroke)}"/><text x="${c.x+rx+8}" y="${c.y-7}" font-size="13" font-weight="700" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text></g>`; }
        if(object.type==='complex-arc') { const arc=complexArcPath(spec,m,object.radius,object.startAngle,object.endAngle), mid=complexPointAt(spec,m,object.radius+0.3,(object.startAngle+object.endAngle)/2); return `<g${id}><path d="${arc.d}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="${object.dashed?'7 5':''}" ${object.arrow?'marker-end="url(#qmx-coordinate-arrow)"':''}/><text x="${mid.x}" y="${mid.y}" text-anchor="middle" font-size="13" font-weight="700" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text></g>`; }
        if(object.type==='complex-line') { const a={x:complexMapX(spec,m,object.x1),y:complexMapY(spec,m,object.y1)}, b={x:complexMapX(spec,m,object.x2),y:complexMapY(spec,m,object.y2)}; return `<g${id}><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="${object.dashed?'8 6':''}"/><text x="${(a.x+b.x)/2+7}" y="${(a.y+b.y)/2-8}" font-size="13" font-weight="700" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text></g>`; }
        if(object.type==='complex-region') { const path=complexRegionPath(spec,m,object), labelPoint=complexPointAt(spec,m,(object.innerRadius+object.outerRadius)/2,(object.startAngle+object.endAngle)/2); return `<g${id}><path d="${path}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="${object.dashed?'7 5':''}"/><text x="${labelPoint.x}" y="${labelPoint.y}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text></g>`; }
        const p={x:complexMapX(spec,m,object.re),y:complexMapY(spec,m,object.im)}; return `<text${id} x="${p.x}" y="${p.y}" fill="${escapeHtml(object.color)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}">${escapeHtml(object.text)}</text>`;
    }
    function complexMarkup(spec) { const regions=spec.objects.filter((object)=>object.type==='complex-region'||object.type==='complex-circle'); const rest=spec.objects.filter((object)=>!regions.includes(object)); return complexBackgroundMarkup(spec)+regions.map((object)=>complexObjectMarkup(spec,object)).join('')+rest.map((object)=>complexObjectMarkup(spec,object)).join(''); }

    function compileFunctionExpression(expression) {
        let source = String(expression || '').trim().toLowerCase().replace(/π/g, 'pi').replace(/[−–—]/g, '-');
        if (!source || source.length > 300 || !/^[0-9a-z_+\-*/^().,\s]+$/.test(source)) return null;
        const identifiers = source.match(/[a-z_]+/g) || [];
        const allowed = new Set(['x','sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','abs','sqrt','exp','log','ln','log10','floor','ceil','round','sign','min','max','pow','pi','e']);
        if (identifiers.some((name) => !allowed.has(name))) return null;
        source = source.replace(/\bln\b/g, 'log');
        source = source.replace(/(\d|x|pi|e|\))\s*(?=(x|pi|e|sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|abs|sqrt|exp|log|log10|floor|ceil|round|sign|\())/g, '$1*');
        source = source.replace(/\^/g, '**');
        source = source.replace(/\bpi\b/g, 'Math.PI').replace(/\be\b/g, 'Math.E');
        ['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','abs','sqrt','exp','log','log10','floor','ceil','round','sign','min','max','pow'].forEach((name) => {
            source = source.replace(new RegExp(`\\b${name}\\b`, 'g'), `Math.${name}`);
        });
        try { return new Function('x', `"use strict"; return (${source});`); }
        catch (error) { return null; }
    }
    function functionBackgroundMarkup(spec) {
        const m = functionPlotMetrics(spec), step = Math.max(0.0001, spec.functionGridStep);
        let markup = `<rect x="${m.left}" y="${m.top}" width="${m.right - m.left}" height="${m.bottom - m.top}" fill="#ffffff" stroke="#cbd5e1"/>`;
        if (spec.functionShowGrid) {
            const startX = Math.ceil(spec.functionXMin / step) * step;
            const startY = Math.ceil(spec.functionYMin / step) * step;
            for (let x = startX, count = 0; x <= spec.functionXMax + step * 0.001 && count < 400; x += step, count++) {
                const px = functionMapX(spec, m, x); markup += `<line x1="${px}" y1="${m.top}" x2="${px}" y2="${m.bottom}" stroke="#e2e8f0" stroke-width="1"/>`;
            }
            for (let y = startY, count = 0; y <= spec.functionYMax + step * 0.001 && count < 400; y += step, count++) {
                const py = functionMapY(spec, m, y); markup += `<line x1="${m.left}" y1="${py}" x2="${m.right}" y2="${py}" stroke="#e2e8f0" stroke-width="1"/>`;
            }
        }
        if (spec.functionShowAxes) {
            if (spec.functionYMin <= 0 && spec.functionYMax >= 0) {
                const y0 = functionMapY(spec, m, 0); markup += `<line x1="${m.left}" y1="${y0}" x2="${m.right}" y2="${y0}" stroke="#334155" stroke-width="2" marker-end="url(#qmx-coordinate-arrow)"/>`;
                if (spec.functionShowTicks) {
                    const startX = Math.ceil(spec.functionXMin / step) * step;
                    for (let x = startX, count = 0; x <= spec.functionXMax + step * 0.001 && count < 200; x += step, count++) {
                        const px = functionMapX(spec, m, x); markup += `<line x1="${px}" y1="${y0 - 4}" x2="${px}" y2="${y0 + 4}" stroke="#475569"/><text x="${px}" y="${y0 + 17}" text-anchor="middle" font-size="10" fill="#64748b">${escapeHtml(functionFormatNumber(x))}</text>`;
                    }
                }
                markup += `<text x="${m.right - 5}" y="${y0 - 8}" text-anchor="end" font-size="15" font-weight="700" fill="#0f172a">x</text>`;
            }
            if (spec.functionXMin <= 0 && spec.functionXMax >= 0) {
                const x0 = functionMapX(spec, m, 0); markup += `<line x1="${x0}" y1="${m.bottom}" x2="${x0}" y2="${m.top}" stroke="#334155" stroke-width="2" marker-end="url(#qmx-coordinate-arrow)"/>`;
                if (spec.functionShowTicks) {
                    const startY = Math.ceil(spec.functionYMin / step) * step;
                    for (let y = startY, count = 0; y <= spec.functionYMax + step * 0.001 && count < 200; y += step, count++) {
                        if (Math.abs(y) < step * 0.001) continue;
                        const py = functionMapY(spec, m, y); markup += `<line x1="${x0 - 4}" y1="${py}" x2="${x0 + 4}" y2="${py}" stroke="#475569"/><text x="${x0 - 8}" y="${py + 4}" text-anchor="end" font-size="10" fill="#64748b">${escapeHtml(functionFormatNumber(y))}</text>`;
                    }
                }
                markup += `<text x="${x0 + 8}" y="${m.top + 16}" font-size="15" font-weight="700" fill="#0f172a">y</text>`;
            }
        }
        return markup;
    }
    function functionCurvePath(spec, object, expression, xMin, xMax) {
        const fn = compileFunctionExpression(expression); if (!fn) return '';
        const m = functionPlotMetrics(spec), start = Math.max(spec.functionXMin, xMin), end = Math.min(spec.functionXMax, xMax);
        if (!(end > start)) return '';
        const samples = Math.max(80, object.samples || 420), step = (end - start) / samples;
        let path = '', drawing = false, previousY = null;
        for (let index = 0; index <= samples; index++) {
            const x = start + index * step; let y;
            try { y = Number(fn(x)); } catch (error) { y = NaN; }
            const px = functionMapX(spec, m, x), py = functionMapY(spec, m, y);
            const invalid = !Number.isFinite(y) || py < m.top - (m.bottom - m.top) * 4 || py > m.bottom + (m.bottom - m.top) * 4 || (previousY !== null && Math.abs(py - previousY) > (m.bottom - m.top) * 1.5);
            if (invalid) { drawing = false; previousY = Number.isFinite(py) ? py : null; continue; }
            path += `${drawing ? ' L' : ' M'} ${px.toFixed(2)} ${py.toFixed(2)}`; drawing = true; previousY = py;
        }
        return path;
    }
    function functionCurveMarkup(spec, object) {
        const dash = object.dashed ? ' stroke-dasharray="9 6"' : '';
        let markup = '';
        const pieces = object.pieces?.length ? object.pieces : [{ expression: object.expression, xMin: object.xMin, xMax: object.xMax, closedStart: false, closedEnd: false }];
        pieces.forEach((piece) => {
            const path = functionCurvePath(spec, object, piece.expression, piece.xMin, piece.xMax);
            if (path) markup += `<path d="${path}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"${dash} stroke-linecap="round" stroke-linejoin="round"/>`;
            if (object.pieces?.length) {
                const fn = compileFunctionExpression(piece.expression);
                if (fn) {
                    [[piece.xMin, piece.closedStart], [piece.xMax, piece.closedEnd]].forEach(([x, closed]) => {
                        if (x < spec.functionXMin || x > spec.functionXMax) return;
                        const y = Number(fn(x)); if (!Number.isFinite(y)) return;
                        const m = functionPlotMetrics(spec), px = functionMapX(spec,m,x), py = functionMapY(spec,m,y);
                        markup += `<circle cx="${px}" cy="${py}" r="5" fill="${closed ? escapeHtml(object.stroke) : '#ffffff'}" stroke="${escapeHtml(object.stroke)}" stroke-width="2"/>`;
                    });
                }
            }
        });
        return markup;
    }
    function functionObjectMarkup(spec, object) {
        const m = functionPlotMetrics(spec), id = ` data-object-id="${escapeHtml(object.id)}"`;
        if (object.type === 'function-domain') {
            const x1 = functionMapX(spec,m,Math.min(object.xStart,object.xEnd)), x2 = functionMapX(spec,m,Math.max(object.xStart,object.xEnd));
            return `<g${id}><rect x="${x1}" y="${m.top}" width="${Math.max(1,x2-x1)}" height="${m.bottom-m.top}" fill="${escapeHtml(object.fill)}" fill-opacity="${object.fillOpacity}" stroke="${escapeHtml(object.stroke)}" stroke-dasharray="${object.dashed ? '7 5' : ''}"/><text x="${(x1+x2)/2}" y="${m.top+18}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text></g>`;
        }
        if (object.type === 'function-curve') return `<g${id} opacity="${object.opacity}">${functionCurveMarkup(spec,object)}</g>`;
        if (object.type === 'function-asymptote') {
            const dash = object.dashed ? '9 6' : '';
            if (object.orientation === 'horizontal') { const y = functionMapY(spec,m,object.value); return `<g${id}><line x1="${m.left}" y1="${y}" x2="${m.right}" y2="${y}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="${dash}"/><text x="${m.right-8}" y="${y-7}" text-anchor="end" font-size="12" font-weight="700" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text></g>`; }
            const x = functionMapX(spec,m,object.value); return `<g${id}><line x1="${x}" y1="${m.top}" x2="${x}" y2="${m.bottom}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="${dash}"/><text x="${x+7}" y="${m.top+18}" font-size="12" font-weight="700" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text></g>`;
        }
        if (object.type === 'function-line') {
            const y1 = object.slope * spec.functionXMin + object.intercept, y2 = object.slope * spec.functionXMax + object.intercept;
            return `<g${id}><line x1="${m.left}" y1="${functionMapY(spec,m,y1)}" x2="${m.right}" y2="${functionMapY(spec,m,y2)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="${object.dashed?'9 6':''}"/><text x="${m.left+12}" y="${functionMapY(spec,m,y1)-8}" font-size="12" font-weight="700" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text></g>`;
        }
        if (object.type === 'function-point') {
            const p = { x:functionMapX(spec,m,object.x), y:functionMapY(spec,m,object.y) };
            let guides = ''; if (object.showGuide) guides = `<line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${functionMapY(spec,m,0)}" stroke="${escapeHtml(object.color)}" stroke-dasharray="4 4" opacity=".55"/><line x1="${p.x}" y1="${p.y}" x2="${functionMapX(spec,m,0)}" y2="${p.y}" stroke="${escapeHtml(object.color)}" stroke-dasharray="4 4" opacity=".55"/>`;
            return `<g${id}>${guides}<circle cx="${p.x}" cy="${p.y}" r="${object.radius}" fill="${object.filled?escapeHtml(object.color):'#ffffff'}" stroke="${escapeHtml(object.color)}" stroke-width="2"/><text x="${p.x+9}" y="${p.y-9}" font-size="12" font-weight="700" fill="${escapeHtml(object.color)}">${escapeHtml(object.label)}</text></g>`;
        }
        const p = { x:functionMapX(spec,m,object.x), y:functionMapY(spec,m,object.y) };
        return `<text${id} x="${p.x}" y="${p.y}" fill="${escapeHtml(object.color)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}">${escapeHtml(object.text)}</text>`;
    }
    function functionMarkup(spec) {
        const domains = spec.objects.filter((object) => object.type === 'function-domain');
        const rest = spec.objects.filter((object) => object.type !== 'function-domain');
        let markup = functionBackgroundMarkup(spec) + domains.map((object) => functionObjectMarkup(spec,object)).join('') + rest.map((object) => functionObjectMarkup(spec,object)).join('');
        if (spec.functionShowLegend) {
            const curves = spec.objects.filter((object) => object.type === 'function-curve' && object.label).slice(0, 8), m = functionPlotMetrics(spec);
            curves.forEach((curve,index) => { const y=m.top+18+index*20; markup += `<line x1="${m.right-205}" y1="${y-4}" x2="${m.right-175}" y2="${y-4}" stroke="${escapeHtml(curve.stroke)}" stroke-width="${curve.lineWidth}" stroke-dasharray="${curve.dashed?'7 5':''}"/><text x="${m.right-168}" y="${y}" font-size="12" fill="#334155">${escapeHtml(curve.label)}</text>`; });
        }
        return markup;
    }


    function logicGridMarkup(spec) {
        if (!spec.logicShowGrid) return '';
        const step = Math.max(5, Number(spec.gridSize || 20));
        let markup = '';
        for (let x = step; x < spec.width; x += step) markup += `<line x1="${x}" y1="0" x2="${x}" y2="${spec.height}" stroke="#e2e8f0" stroke-width="1"/>`;
        for (let y = step; y < spec.height; y += step) markup += `<line x1="0" y1="${y}" x2="${spec.width}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
        return `<g opacity=".75">${markup}</g>`;
    }

    function logicGateBody(gateType, width, height, fill, stroke, lineWidth) {
        const left = 16, right = width - 18, mid = height / 2;
        const inverted = ['nand', 'nor', 'xnor', 'not'].includes(gateType);
        const baseType = ({ nand: 'and', nor: 'or', xnor: 'xor' })[gateType] || gateType;
        let body = '';
        if (baseType === 'and') {
            const curve = Math.max(22, (right - left) * .48);
            body = `<path d="M ${left} 0 H ${right - curve} C ${right + curve * .12} 0 ${right + curve * .12} ${height} ${right - curve} ${height} H ${left} Z" fill="${escapeHtml(fill)}" stroke="${escapeHtml(stroke)}" stroke-width="${lineWidth}"/>`;
        } else if (baseType === 'or' || baseType === 'xor') {
            const d = `M ${left + 3} 0 C ${left + 34} ${height * .12} ${left + 34} ${height * .88} ${left + 3} ${height} C ${right * .56} ${height * .98} ${right * .82} ${height * .75} ${right} ${mid} C ${right * .82} ${height * .25} ${right * .56} ${height * .02} ${left + 3} 0 Z`;
            body = `<path d="${d}" fill="${escapeHtml(fill)}" stroke="${escapeHtml(stroke)}" stroke-width="${lineWidth}"/>`;
            if (baseType === 'xor') body += `<path d="M ${left - 5} 0 C ${left + 25} ${height * .18} ${left + 25} ${height * .82} ${left - 5} ${height}" fill="none" stroke="${escapeHtml(stroke)}" stroke-width="${lineWidth}"/>`;
        } else {
            body = `<path d="M ${left} 0 L ${right - (inverted ? 12 : 0)} ${mid} L ${left} ${height} Z" fill="${escapeHtml(fill)}" stroke="${escapeHtml(stroke)}" stroke-width="${lineWidth}"/>`;
        }
        const outputBodyX = baseType === 'and' || baseType === 'or' || baseType === 'xor' ? right : right - (inverted ? 12 : 0);
        if (inverted) body += `<circle cx="${outputBodyX + 7}" cy="${mid}" r="7" fill="#ffffff" stroke="${escapeHtml(stroke)}" stroke-width="${lineWidth}"/>`;
        return { body, left, outputX: inverted ? outputBodyX + 14 : outputBodyX, mid };
    }

    function logicGateMarkup(spec, object) {
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const inputs = object.inputLabels.length ? object.inputLabels : (object.gateType === 'not' || object.gateType === 'buffer' ? ['A'] : ['A', 'B']);
        const shape = logicGateBody(object.gateType, object.width, object.height, object.fill, object.stroke, object.lineWidth);
        let pins = '';
        inputs.forEach((label, index) => {
            const y = object.height * (index + 1) / (inputs.length + 1);
            pins += `<line x1="0" y1="${y}" x2="${shape.left}" y2="${y}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
            if (spec.logicShowPinLabels && label) pins += `<text x="${shape.left + 7}" y="${y - 5}" font-size="11" fill="#475569">${escapeHtml(label)}</text>`;
        });
        pins += `<line x1="${shape.outputX}" y1="${shape.mid}" x2="${object.width}" y2="${shape.mid}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
        if (spec.logicShowPinLabels && object.outputLabel) pins += `<text x="${object.width - 7}" y="${shape.mid - 7}" text-anchor="end" font-size="11" fill="#475569">${escapeHtml(object.outputLabel)}</text>`;
        const label = object.showLabel ? `<text x="${object.width * .53}" y="${shape.mid + 5}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text>` : '';
        return `<g${id} transform="translate(${object.x} ${object.y})">${shape.body}${pins}${label}</g>`;
    }

    function logicIoMarkup(spec, object) {
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const isInput = object.type === 'logic-input';
        const lineX = isInput ? object.x + 38 : object.x - 38;
        const textAnchor = isInput ? 'end' : 'start';
        const labelX = isInput ? object.x - 14 : object.x + 14;
        const value = spec.logicShowValues && object.showValue ? `<text x="${object.x}" y="${object.y + 4}" text-anchor="middle" font-size="10" font-weight="800" fill="#ffffff">${escapeHtml(object.value)}</text>` : '';
        return `<g${id}><line x1="${object.x}" y1="${object.y}" x2="${lineX}" y2="${object.y}" stroke="${escapeHtml(object.color)}" stroke-width="3"/><circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="${escapeHtml(object.color)}" stroke="#ffffff" stroke-width="2"/>${value}<text x="${labelX}" y="${object.y - 10}" text-anchor="${textAnchor}" font-size="13" font-weight="800" fill="${escapeHtml(object.color)}">${escapeHtml(object.label)}</text></g>`;
    }

    function digitalLogicPorts(object) {
        if (!object) return [];
        if (object.type === 'logic-input') return [{ key: 'out', side: 'right', x: object.x + 38, y: object.y }];
        if (object.type === 'logic-output') return [{ key: 'in', side: 'left', x: object.x - 38, y: object.y }];
        if (object.type === 'logic-gate') {
            const labels = object.inputLabels.length ? object.inputLabels : (object.gateType === 'not' || object.gateType === 'buffer' ? ['A'] : ['A', 'B']);
            return [
                ...labels.map((label, index) => ({ key: `in:${index}`, side: 'left', x: object.x, y: object.y + object.height * (index + 1) / (labels.length + 1) })),
                { key: 'out', side: 'right', x: object.x + object.width, y: object.y + object.height / 2 }
            ];
        }
        if (object.type === 'logic-block') {
            const left = object.pinsLeft.length ? object.pinsLeft : ['A'];
            const right = object.pinsRight.length ? object.pinsRight : ['Y'];
            return [
                ...left.map((label, index) => ({ key: `left:${index}`, side: 'left', x: object.x - 24, y: object.y + object.height * (index + 1) / (left.length + 1) })),
                ...right.map((label, index) => ({ key: `right:${index}`, side: 'right', x: object.x + object.width + 24, y: object.y + object.height * (index + 1) / (right.length + 1) }))
            ];
        }
        return [];
    }

    function digitalResolvePort(spec, ref) {
        if (!ref?.objectId || !ref?.portKey) return null;
        const object = spec.objects.find((item) => item.id === ref.objectId);
        return digitalLogicPorts(object).find((port) => port.key === ref.portKey) || null;
    }

    function digitalCompactRoute(points, gridSize) {
        const clean = [];
        points.forEach((point) => {
            const next = { x: Number(point.x), y: Number(point.y) };
            const previous = clean[clean.length - 1];
            if (!previous || Math.abs(previous.x - next.x) > .01 || Math.abs(previous.y - next.y) > .01) clean.push(next);
        });
        for (let index = clean.length - 2; index > 0; index--) {
            const a = clean[index - 1], b = clean[index], c = clean[index + 1];
            if ((Math.abs(a.x - b.x) < .01 && Math.abs(b.x - c.x) < .01) || (Math.abs(a.y - b.y) < .01 && Math.abs(b.y - c.y) < .01)) clean.splice(index, 1);
        }
        return clean;
    }

    function digitalSmartRoute(spec, start, end) {
        const gridSize = Math.max(5, Number(spec.gridSize || 20));
        const stub = Math.max(20, gridSize);
        const startDirection = start.side === 'left' ? -1 : 1;
        const endDirection = end.side === 'left' ? -1 : 1;
        const s1 = { x: start.x + startDirection * stub, y: start.y };
        const e1 = { x: end.x + endDirection * stub, y: end.y };
        const points = [{ x: start.x, y: start.y }, s1];
        if (Math.abs(start.y - end.y) < .01 && ((startDirection > 0 && end.x >= start.x) || (startDirection < 0 && end.x <= start.x))) {
            points.push({ x: end.x, y: end.y });
            return digitalCompactRoute(points, gridSize);
        }
        if (startDirection > 0 && endDirection < 0 && s1.x <= e1.x) {
            const middleX = Math.round(((s1.x + e1.x) / 2) / gridSize) * gridSize;
            points.push({ x: middleX, y: s1.y }, { x: middleX, y: e1.y }, e1);
        } else if (startDirection < 0 && endDirection > 0 && s1.x >= e1.x) {
            const middleX = Math.round(((s1.x + e1.x) / 2) / gridSize) * gridSize;
            points.push({ x: middleX, y: s1.y }, { x: middleX, y: e1.y }, e1);
        } else {
            const detour = startDirection > 0
                ? Math.max(s1.x, e1.x, start.x, end.x) + stub * 2
                : Math.min(s1.x, e1.x, start.x, end.x) - stub * 2;
            const detourX = Math.round(detour / gridSize) * gridSize;
            points.push({ x: detourX, y: s1.y }, { x: detourX, y: e1.y }, e1);
        }
        points.push({ x: end.x, y: end.y });
        return digitalCompactRoute(points, gridSize);
    }

    function resolvedLogicWire(spec, object) {
        if (!object.autoRoute) return object;
        const source = digitalResolvePort(spec, object.sourcePort);
        const target = digitalResolvePort(spec, object.targetPort);
        return source && target ? { ...object, points: digitalSmartRoute(spec, source, target) } : object;
    }

    function logicWireMarkup(object) {
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const points = object.points.map((point) => `${point.x},${point.y}`).join(' ');
        const midpoint = object.points[Math.floor(object.points.length / 2)] || object.points[0];
        const dots = object.junctions && object.points.length > 2 ? object.points.slice(1, -1).map((point) => `<circle cx="${point.x}" cy="${point.y}" r="${Math.max(3, object.lineWidth * 1.4)}" fill="${escapeHtml(object.stroke)}"/>`).join('') : '';
        const label = object.label && midpoint ? `<text x="${midpoint.x + 6}" y="${midpoint.y - 8}" font-size="11" font-weight="700" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text>` : '';
        return `<g${id}><polyline points="${points}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${object.dashed ? '8 6' : ''}"/>${dots}${label}</g>`;
    }

    function logicBlockMarkup(spec, object) {
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const leftPins = object.pinsLeft.length ? object.pinsLeft : ['A'];
        const rightPins = object.pinsRight.length ? object.pinsRight : ['Y'];
        let pins = '';
        leftPins.forEach((label, index) => {
            const y = object.height * (index + 1) / (leftPins.length + 1);
            pins += `<line x1="-24" y1="${y}" x2="0" y2="${y}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
            if (spec.logicShowPinLabels) pins += `<text x="8" y="${y + 4}" font-size="12" fill="#334155">${escapeHtml(label)}</text>`;
            if (object.clockPin && /clk|clock/i.test(label)) pins += `<path d="M 0 ${y - 10} L 14 ${y} L 0 ${y + 10}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="2"/>`;
        });
        rightPins.forEach((label, index) => {
            const y = object.height * (index + 1) / (rightPins.length + 1);
            pins += `<line x1="${object.width}" y1="${y}" x2="${object.width + 24}" y2="${y}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
            if (spec.logicShowPinLabels) pins += `<text x="${object.width - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="#334155">${escapeHtml(label)}</text>`;
        });
        return `<g${id} transform="translate(${object.x} ${object.y})"><rect x="0" y="0" width="${object.width}" height="${object.height}" rx="10" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>${pins}<text x="${object.width / 2}" y="${object.height / 2 - 7}" text-anchor="middle" font-size="18" font-weight="800" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text>${object.subLabel ? `<text x="${object.width / 2}" y="${object.height / 2 + 17}" text-anchor="middle" font-size="12" fill="#64748b">${escapeHtml(object.subLabel)}</text>` : ''}</g>`;
    }

    function logicTruthTableMarkup(object) {
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const columns = Math.max(1, object.headers.length, ...object.rows.map((row) => row.length));
        const colWidth = object.width / columns;
        const totalRows = object.rows.length + 2;
        const height = object.rowHeight * totalRows;
        let markup = `<rect x="${object.x}" y="${object.y}" width="${object.width}" height="${height}" rx="7" fill="#ffffff" stroke="${escapeHtml(object.stroke)}" stroke-width="2"/><rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.rowHeight * 2}" rx="7" fill="${escapeHtml(object.headerFill)}"/>`;
        markup += `<text x="${object.x + object.width / 2}" y="${object.y + object.rowHeight * .68}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.title)}</text>`;
        for (let row = 1; row < totalRows; row++) {
            const y = object.y + row * object.rowHeight;
            markup += `<line x1="${object.x}" y1="${y}" x2="${object.x + object.width}" y2="${y}" stroke="${escapeHtml(object.stroke)}" stroke-width="1"/>`;
        }
        for (let col = 1; col < columns; col++) {
            const x = object.x + col * colWidth;
            markup += `<line x1="${x}" y1="${object.y + object.rowHeight}" x2="${x}" y2="${object.y + height}" stroke="${escapeHtml(object.stroke)}" stroke-width="1"/>`;
        }
        for (let col = 0; col < columns; col++) {
            const value = object.headers[col] ?? '';
            markup += `<text x="${object.x + colWidth * (col + .5)}" y="${object.y + object.rowHeight * 1.68}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(value)}</text>`;
        }
        object.rows.forEach((row, rowIndex) => row.slice(0, columns).forEach((value, colIndex) => {
            markup += `<text x="${object.x + colWidth * (colIndex + .5)}" y="${object.y + object.rowHeight * (rowIndex + 2.68)}" text-anchor="middle" font-size="13" fill="${escapeHtml(object.textColor)}">${escapeHtml(value)}</text>`;
        }));
        return `<g${id}>${markup}</g>`;
    }

    function digitalLogicObjectMarkup(spec, object) {
        if (object.type === 'logic-gate') return logicGateMarkup(spec, object);
        if (object.type === 'logic-input' || object.type === 'logic-output') return logicIoMarkup(spec, object);
        if (object.type === 'logic-wire') return logicWireMarkup(object);
        if (object.type === 'logic-block') return logicBlockMarkup(spec, object);
        if (object.type === 'logic-truth-table') return logicTruthTableMarkup(object);
        return `<text data-qmx-object="${escapeHtml(object.id)}" x="${object.x}" y="${object.y}" fill="${escapeHtml(object.color)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}">${escapeHtml(object.text)}</text>`;
    }

    function digitalLogicMarkup(spec) {
        const wires = spec.objects.filter((object) => object.type === 'logic-wire').map((object) => resolvedLogicWire(spec, object));
        const rest = spec.objects.filter((object) => object.type !== 'logic-wire');
        return logicGridMarkup(spec) + wires.map((object) => digitalLogicObjectMarkup(spec, object)).join('') + rest.map((object) => digitalLogicObjectMarkup(spec, object)).join('');
    }


    function automataGridMarkup(spec) {
        if (!spec.automataShowGrid) return '';
        const step = Math.max(5, Number(spec.gridSize || 20));
        let markup = '';
        for (let x = step; x < spec.width; x += step) markup += `<line x1="${x}" y1="0" x2="${x}" y2="${spec.height}" stroke="#e2e8f0" stroke-width="1"/>`;
        for (let y = step; y < spec.height; y += step) markup += `<line x1="0" y1="${y}" x2="${spec.width}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
        return `<g opacity=".75">${markup}</g>`;
    }

    function automataPortPosition(object, key) {
        const radius = Number(object.radius || 48);
        if (key === 'n') return { x: object.x, y: object.y - radius };
        if (key === 's') return { x: object.x, y: object.y + radius };
        if (key === 'w') return { x: object.x - radius, y: object.y };
        return { x: object.x + radius, y: object.y };
    }

    function automataStateById(spec, id) {
        return spec.objects.find((object) => object.type === 'fsm-state' && object.id === id) || null;
    }

    function automataTransitionGeometry(spec, object) {
        const source = automataStateById(spec, object.sourceId);
        const target = automataStateById(spec, object.targetId);
        if (!source || !target) return null;
        const start = automataPortPosition(source, object.sourcePort);
        const end = automataPortPosition(target, object.targetPort);
        if (source.id === target.id) {
            const radius = Number(source.radius || 48);
            const port = object.sourcePort || 'n';
            const signX = port === 'w' ? -1 : (port === 'e' ? 1 : 0);
            const signY = port === 'n' ? -1 : (port === 's' ? 1 : 0);
            const tangentX = signY ? 1 : 0;
            const tangentY = signX ? 1 : 0;
            const spread = radius * .72;
            const lift = Math.max(radius * 1.8, Math.abs(Number(object.curve || 0)) + radius);
            const p1 = { x: start.x - tangentX * spread, y: start.y - tangentY * spread };
            const p2 = { x: start.x + tangentX * spread, y: start.y + tangentY * spread };
            const control = { x: source.x + signX * lift, y: source.y + signY * lift };
            const d = `M ${p1.x} ${p1.y} Q ${control.x} ${control.y} ${p2.x} ${p2.y}`;
            return { d, labelX: (p1.x + p2.x + control.x * 2) / 4, labelY: (p1.y + p2.y + control.y * 2) / 4 - 8 };
        }
        const dx = end.x - start.x, dy = end.y - start.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / length, ny = dx / length;
        const curve = Number(object.curve || 0);
        const control = { x: (start.x + end.x) / 2 + nx * curve, y: (start.y + end.y) / 2 + ny * curve };
        const d = Math.abs(curve) < .01 ? `M ${start.x} ${start.y} L ${end.x} ${end.y}` : `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
        return { d, labelX: (start.x + end.x + control.x * 2) / 4, labelY: (start.y + end.y + control.y * 2) / 4 - 10 };
    }

    function automataStateMarkup(spec, object) {
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        let markup = '';
        if (object.initial) {
            const startX = object.x - object.radius - 62;
            const endX = object.x - object.radius - 4;
            markup += `<line x1="${startX}" y1="${object.y}" x2="${endX}" y2="${object.y}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" marker-end="url(#qmx-diagram-arrow)"/>`;
        }
        markup += `<circle cx="${object.x}" cy="${object.y}" r="${object.radius}" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
        if (object.accepting) markup += `<circle cx="${object.x}" cy="${object.y}" r="${Math.max(8, object.radius - 9)}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${Math.max(1.5, object.lineWidth * .72)}"/>`;
        if (spec.automataShowStateLabels) {
            const labelY = object.output ? object.y - 3 : object.y + 6;
            markup += `<text x="${object.x}" y="${labelY}" text-anchor="middle" font-size="17" font-weight="800" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text>`;
            if (object.output) markup += `<text x="${object.x}" y="${object.y + 20}" text-anchor="middle" font-size="12" fill="#475569">${escapeHtml(object.output)}</text>`;
        }
        return `<g${id}>${markup}</g>`;
    }

    function automataTransitionMarkup(spec, object) {
        const geometry = automataTransitionGeometry(spec, object);
        if (!geometry) return '';
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const marker = object.arrow ? ' marker-end="url(#qmx-diagram-arrow)"' : '';
        const label = spec.automataShowTransitionLabels && object.label
            ? `<text x="${geometry.labelX}" y="${geometry.labelY}" text-anchor="middle" font-size="14" font-weight="700" fill="${escapeHtml(object.stroke)}" paint-order="stroke" stroke="#ffffff" stroke-width="5" stroke-linejoin="round">${escapeHtml(object.label)}</text>`
            : '';
        return `<g${id}><path d="${geometry.d}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="${object.dashed ? '8 6' : ''}" stroke-linecap="round" stroke-linejoin="round"${marker}/>${label}</g>`;
    }

    function automataTableMarkup(object) {
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const columns = Math.max(1, object.headers.length, ...object.rows.map((row) => row.length));
        const colWidth = object.width / columns;
        const totalRows = object.rows.length + 2;
        const height = object.rowHeight * totalRows;
        let markup = `<rect x="${object.x}" y="${object.y}" width="${object.width}" height="${height}" rx="7" fill="#ffffff" stroke="${escapeHtml(object.stroke)}" stroke-width="2"/><rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.rowHeight * 2}" rx="7" fill="${escapeHtml(object.headerFill)}"/>`;
        markup += `<text x="${object.x + object.width / 2}" y="${object.y + object.rowHeight * .68}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.title)}</text>`;
        for (let row = 1; row < totalRows; row++) { const y = object.y + row * object.rowHeight; markup += `<line x1="${object.x}" y1="${y}" x2="${object.x + object.width}" y2="${y}" stroke="${escapeHtml(object.stroke)}" stroke-width="1"/>`; }
        for (let col = 1; col < columns; col++) { const x = object.x + col * colWidth; markup += `<line x1="${x}" y1="${object.y + object.rowHeight}" x2="${x}" y2="${object.y + height}" stroke="${escapeHtml(object.stroke)}" stroke-width="1"/>`; }
        for (let col = 0; col < columns; col++) markup += `<text x="${object.x + colWidth * (col + .5)}" y="${object.y + object.rowHeight * 1.68}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.headers[col] ?? '')}</text>`;
        object.rows.forEach((row, rowIndex) => row.slice(0, columns).forEach((value, colIndex) => { markup += `<text x="${object.x + colWidth * (colIndex + .5)}" y="${object.y + object.rowHeight * (rowIndex + 2.68)}" text-anchor="middle" font-size="13" fill="${escapeHtml(object.textColor)}">${escapeHtml(value)}</text>`; }));
        return `<g${id}>${markup}</g>`;
    }

    function finiteStateMachineObjectMarkup(spec, object) {
        if (object.type === 'fsm-state') return automataStateMarkup(spec, object);
        if (object.type === 'fsm-transition') return automataTransitionMarkup(spec, object);
        if (object.type === 'fsm-table') return automataTableMarkup(object);
        return `<text data-qmx-object="${escapeHtml(object.id)}" x="${object.x}" y="${object.y}" fill="${escapeHtml(object.color)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}">${escapeHtml(object.text)}</text>`;
    }

    function finiteStateMachineMarkup(spec) {
        const transitions = spec.objects.filter((object) => object.type === 'fsm-transition');
        const rest = spec.objects.filter((object) => object.type !== 'fsm-transition');
        return automataGridMarkup(spec) + transitions.map((object) => finiteStateMachineObjectMarkup(spec, object)).join('') + rest.map((object) => finiteStateMachineObjectMarkup(spec, object)).join('');
    }


    function erFindObject(spec, id) {
        return spec.objects.find((object) => object.id === id && ['er-entity', 'er-relationship', 'er-attribute', 'er-table'].includes(object.type)) || null;
    }

    function erObjectSize(object) {
        if (object.type === 'er-table') return { width: object.width, height: object.rowHeight * (object.columns.length + 1) };
        return { width: object.width || 180, height: object.height || 80 };
    }

    function erPortPosition(object, key) {
        const size = erObjectSize(object);
        if (key === 'n') return { x: object.x, y: object.y - size.height / 2 };
        if (key === 's') return { x: object.x, y: object.y + size.height / 2 };
        if (key === 'w') return { x: object.x - size.width / 2, y: object.y };
        return { x: object.x + size.width / 2, y: object.y };
    }

    function erConnectorGeometry(spec, object) {
        const source = erFindObject(spec, object.sourceId);
        const target = erFindObject(spec, object.targetId);
        if (!source || !target) return null;
        const a = erPortPosition(source, object.sourcePort);
        const b = erPortPosition(target, object.targetPort);
        if (source.id === target.id) {
            const size = erObjectSize(source);
            const lift = Math.max(70, size.height * .9);
            return { d: `M ${a.x} ${a.y} C ${a.x + lift} ${a.y - lift}, ${b.x - lift} ${b.y - lift}, ${b.x} ${b.y}`, source: a, target: b, labelX: source.x, labelY: source.y - size.height / 2 - lift * .62 };
        }
        let points;
        if (['e', 'w'].includes(object.sourcePort) || ['e', 'w'].includes(object.targetPort)) {
            const midX = (a.x + b.x) / 2;
            points = [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
        } else {
            const midY = (a.y + b.y) / 2;
            points = [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
        }
        const compact = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
        return { d: compact.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '), source: a, target: b, labelX: (a.x + b.x) / 2, labelY: (a.y + b.y) / 2 - 10 };
    }

    function erGridMarkup(spec) {
        if (!spec.erShowGrid) return '';
        return `<rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-geometry-grid)" opacity=".68"/>`;
    }

    function erEntityMarkup(spec, object) {
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const left = object.x - object.width / 2, top = object.y - object.height / 2;
        const inset = object.weak ? 7 : 0;
        let markup = `<rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="8" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
        if (object.weak) markup += `<rect x="${left + inset}" y="${top + inset}" width="${object.width - inset * 2}" height="${object.height - inset * 2}" rx="5" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="1.8"/>`;
        markup += `<text x="${object.x}" y="${top + 27}" text-anchor="middle" font-size="16" font-weight="800" fill="#0f172a">${escapeHtml(object.label)}</text>`;
        if (spec.erShowAttributes && object.fields.length) {
            const separatorY = top + 37;
            markup += `<line x1="${left}" y1="${separatorY}" x2="${left + object.width}" y2="${separatorY}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.2"/>`;
            const maxRows = Math.max(0, Math.floor((object.height - 45) / 18));
            object.fields.slice(0, maxRows).forEach((field, index) => {
                const key = /\bPK\b|primary[_ ]?key|\(PK\)/i.test(field);
                const y = separatorY + 18 + index * 18;
                markup += `<text x="${left + 12}" y="${y}" font-size="12.5" fill="#334155"${key ? ' text-decoration="underline" font-weight="700"' : ''}>${escapeHtml(field)}</text>`;
            });
        }
        return `<g${id}>${markup}</g>`;
    }

    function erRelationshipMarkup(object) {
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const hw = object.width / 2, hh = object.height / 2;
        const points = `${object.x},${object.y - hh} ${object.x + hw},${object.y} ${object.x},${object.y + hh} ${object.x - hw},${object.y}`;
        let markup = `<polygon points="${points}" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
        if (object.identifying) {
            const iw = Math.max(20, hw - 9), ih = Math.max(16, hh - 7);
            markup += `<polygon points="${object.x},${object.y - ih} ${object.x + iw},${object.y} ${object.x},${object.y + ih} ${object.x - iw},${object.y}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="1.8"/>`;
        }
        markup += `<text x="${object.x}" y="${object.y + 5}" text-anchor="middle" font-size="14" font-weight="800" fill="#0f172a">${escapeHtml(object.label)}</text>`;
        return `<g${id}>${markup}</g>`;
    }

    function erAttributeMarkup(object) {
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const rx = object.width / 2, ry = object.height / 2;
        const dash = object.derived ? ' stroke-dasharray="8 6"' : '';
        let markup = `<ellipse cx="${object.x}" cy="${object.y}" rx="${rx}" ry="${ry}" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"${dash}/>`;
        if (object.multivalued) markup += `<ellipse cx="${object.x}" cy="${object.y}" rx="${Math.max(8, rx - 7)}" ry="${Math.max(8, ry - 6)}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="1.5"${dash}/>`;
        markup += `<text x="${object.x}" y="${object.y + 5}" text-anchor="middle" font-size="13.5"${object.key ? ' font-weight="700" text-decoration="underline"' : ''} fill="#0f172a">${escapeHtml(object.label)}</text>`;
        return `<g${id}>${markup}</g>`;
    }

    function erTableMarkup(object) {
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const height = object.rowHeight * (object.columns.length + 1);
        const left = object.x - object.width / 2, top = object.y - height / 2;
        let markup = `<rect x="${left}" y="${top}" width="${object.width}" height="${height}" rx="7" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="2.5"/><rect x="${left}" y="${top}" width="${object.width}" height="${object.rowHeight}" rx="7" fill="${escapeHtml(object.headerFill)}"/>`;
        markup += `<text x="${object.x}" y="${top + object.rowHeight * .68}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.label)}</text>`;
        for (let row = 1; row <= object.columns.length; row++) {
            const y = top + row * object.rowHeight;
            markup += `<line x1="${left}" y1="${y}" x2="${left + object.width}" y2="${y}" stroke="${escapeHtml(object.stroke)}" stroke-width="1"/>`;
        }
        object.columns.forEach((column, index) => {
            const key = /\bPK\b|primary[_ ]?key/i.test(column);
            const fk = /\bFK\b|foreign[_ ]?key/i.test(column);
            markup += `<text x="${left + 12}" y="${top + object.rowHeight * (index + 1.68)}" font-size="12.5" fill="${escapeHtml(object.textColor)}"${key ? ' font-weight="800" text-decoration="underline"' : (fk ? ' font-weight="700"' : '')}>${escapeHtml(column)}</text>`;
        });
        return `<g${id}>${markup}</g>`;
    }

    function erParticipationMarkup(object, geometry) {
        const pieces = [];
        const segment = (a, b, total) => {
            if (!total) return;
            const dx = b.x - a.x, dy = b.y - a.y, length = Math.max(1, Math.hypot(dx, dy));
            const ux = dx / length, uy = dy / length, px = -uy * 4, py = ux * 4;
            const start = { x: a.x + ux * 7, y: a.y + uy * 7 };
            const end = { x: a.x + ux * Math.min(38, length * .22), y: a.y + uy * Math.min(38, length * .22) };
            pieces.push(`<line x1="${start.x + px}" y1="${start.y + py}" x2="${end.x + px}" y2="${end.y + py}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.8"/>`);
        };
        segment(geometry.source, geometry.target, object.sourceParticipation === 'total');
        segment(geometry.target, geometry.source, object.targetParticipation === 'total');
        return pieces.join('');
    }

    function erConnectorMarkup(spec, object) {
        const geometry = erConnectorGeometry(spec, object);
        if (!geometry) return '';
        const id = ` data-qmx-object="${escapeHtml(object.id)}"`;
        const sourceLabelX = geometry.source.x + (geometry.target.x - geometry.source.x) * .12;
        const sourceLabelY = geometry.source.y + (geometry.target.y - geometry.source.y) * .12 - 9;
        const targetLabelX = geometry.target.x + (geometry.source.x - geometry.target.x) * .12;
        const targetLabelY = geometry.target.y + (geometry.source.y - geometry.target.y) * .12 - 9;
        let markup = `<path d="${geometry.d}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="${object.dashed ? '8 6' : ''}" stroke-linecap="round" stroke-linejoin="round"/>`;
        markup += erParticipationMarkup(object, geometry);
        if (spec.erShowCardinality) {
            markup += `<text x="${sourceLabelX}" y="${sourceLabelY}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(object.stroke)}" paint-order="stroke" stroke="#ffffff" stroke-width="4">${escapeHtml(object.sourceCardinality)}</text>`;
            markup += `<text x="${targetLabelX}" y="${targetLabelY}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(object.stroke)}" paint-order="stroke" stroke="#ffffff" stroke-width="4">${escapeHtml(object.targetCardinality)}</text>`;
        }
        if (object.label) markup += `<text x="${geometry.labelX}" y="${geometry.labelY}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${escapeHtml(object.stroke)}" paint-order="stroke" stroke="#ffffff" stroke-width="5">${escapeHtml(object.label)}</text>`;
        return `<g${id}>${markup}</g>`;
    }

    function databaseErObjectMarkup(spec, object) {
        if (object.type === 'er-entity') return erEntityMarkup(spec, object);
        if (object.type === 'er-relationship') return erRelationshipMarkup(object);
        if (object.type === 'er-attribute') return erAttributeMarkup(object);
        if (object.type === 'er-connector') return erConnectorMarkup(spec, object);
        if (object.type === 'er-table') return erTableMarkup(object);
        return `<text data-qmx-object="${escapeHtml(object.id)}" x="${object.x}" y="${object.y}" fill="${escapeHtml(object.color)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}">${escapeHtml(object.text)}</text>`;
    }

    function databaseErMarkup(spec) {
        const connectors = spec.objects.filter((object) => object.type === 'er-connector');
        const rest = spec.objects.filter((object) => object.type !== 'er-connector');
        return erGridMarkup(spec) + connectors.map((object) => databaseErObjectMarkup(spec, object)).join('') + rest.map((object) => databaseErObjectMarkup(spec, object)).join('');
    }


    function networkFindDevice(spec, id) {
        return spec.objects.find((object) => object.id === id && object.type === 'network-device') || null;
    }
    function networkPortPosition(object, key) {
        const width = object.width || 130, height = object.height || 90;
        if (key === 'n') return { x: object.x, y: object.y - height / 2 };
        if (key === 's') return { x: object.x, y: object.y + height / 2 };
        if (key === 'w') return { x: object.x - width / 2, y: object.y };
        return { x: object.x + width / 2, y: object.y };
    }
    function networkLinkGeometry(spec, object) {
        const source = networkFindDevice(spec, object.sourceId), target = networkFindDevice(spec, object.targetId);
        if (!source || !target) return null;
        const a = networkPortPosition(source, object.sourcePort), b = networkPortPosition(target, object.targetPort);
        if (source.id === target.id) {
            const lift = Math.max(70, source.height * .9);
            return { d: `M ${a.x} ${a.y} C ${a.x + lift} ${a.y - lift}, ${b.x - lift} ${b.y - lift}, ${b.x} ${b.y}`, labelX: source.x, labelY: source.y - source.height / 2 - lift * .62 };
        }
        let points;
        if (['e', 'w'].includes(object.sourcePort) || ['e', 'w'].includes(object.targetPort)) {
            const midX = (a.x + b.x) / 2; points = [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
        } else {
            const midY = (a.y + b.y) / 2; points = [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
        }
        const compact = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
        return { d: compact.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '), labelX: (a.x + b.x) / 2, labelY: (a.y + b.y) / 2 - 11 };
    }
    function networkGridMarkup(spec) { return spec.networkShowGrid ? `<rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-geometry-grid)" opacity=".68"/>` : ''; }
    function networkZoneMarkup(spec, object) {
        if (!spec.networkShowZones) return '';
        const left = object.x - object.width / 2, top = object.y - object.height / 2;
        return `<g data-qmx-object="${escapeHtml(object.id)}"><rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="18" fill="${escapeHtml(object.fill)}" fill-opacity=".52" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="${object.dashed ? '10 7' : ''}"/><text x="${left + 18}" y="${top + 28}" font-size="15" font-weight="800" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.label)}</text></g>`;
    }
    function networkDeviceIconMarkup(object) {
        const left = object.x - object.width / 2, top = object.y - object.height / 2, cx = object.x, cy = object.y - 8;
        const c = escapeHtml(object.iconColor), s = escapeHtml(object.stroke), f = escapeHtml(object.fill), w = object.width, h = object.height;
        if (object.deviceType === 'router') return `<ellipse cx="${cx}" cy="${cy}" rx="${w*.32}" ry="${h*.25}" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/><path d="M ${cx-w*.19} ${cy} H ${cx+w*.19} M ${cx+w*.11} ${cy-7} L ${cx+w*.2} ${cy} L ${cx+w*.11} ${cy+7} M ${cx+w*.19} ${cy-11} H ${cx-w*.19} M ${cx-w*.11} ${cy-18} L ${cx-w*.2} ${cy-11} L ${cx-w*.11} ${cy-4}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
        if (object.deviceType === 'switch') { let ports=''; for(let i=0;i<6;i++) ports += `<rect x="${left+w*.18+i*w*.105}" y="${cy+h*.05}" width="${w*.07}" height="${h*.09}" rx="1" fill="${c}"/>`; return `<rect x="${left+w*.12}" y="${top+h*.22}" width="${w*.76}" height="${h*.48}" rx="9" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/>${ports}<path d="M ${left+w*.25} ${cy-h*.08} H ${left+w*.75}" stroke="${c}" stroke-width="3"/>`; }
        if (object.deviceType === 'server') return `<rect x="${left+w*.2}" y="${top+h*.08}" width="${w*.6}" height="${h*.7}" rx="7" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/><path d="M ${left+w*.27} ${top+h*.28} H ${left+w*.72} M ${left+w*.27} ${top+h*.45} H ${left+w*.72} M ${left+w*.27} ${top+h*.62} H ${left+w*.72}" stroke="${c}" stroke-width="2.5"/><circle cx="${left+w*.68}" cy="${top+h*.2}" r="4" fill="${c}"/>`;
        if (object.deviceType === 'client') return `<rect x="${left+w*.18}" y="${top+h*.14}" width="${w*.64}" height="${h*.48}" rx="5" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/><path d="M ${cx} ${top+h*.62} V ${top+h*.73} M ${left+w*.35} ${top+h*.74} H ${left+w*.65}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
        if (object.deviceType === 'laptop') return `<rect x="${left+w*.2}" y="${top+h*.13}" width="${w*.6}" height="${h*.45}" rx="5" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/><path d="M ${left+w*.1} ${top+h*.68} H ${left+w*.9} L ${left+w*.82} ${top+h*.77} H ${left+w*.18} Z" fill="${f}" stroke="${s}" stroke-width="2"/>`;
        if (object.deviceType === 'cloud') return `<path d="M ${left+w*.18} ${cy+h*.12} C ${left+w*.04} ${cy+h*.1}, ${left+w*.05} ${cy-h*.1}, ${left+w*.22} ${cy-h*.12} C ${left+w*.25} ${cy-h*.34}, ${left+w*.52} ${cy-h*.37}, ${left+w*.62} ${cy-h*.18} C ${left+w*.84} ${cy-h*.22}, ${left+w*.94} ${cy-h*.02}, ${left+w*.83} ${cy+h*.11} Z" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/>`;
        if (object.deviceType === 'firewall') { let bricks=''; for(let r=0;r<3;r++){ for(let col=0;col<4;col++){ const offset=r%2?-.09:0; bricks += `<rect x="${left+w*(.15+col*.18+offset)}" y="${top+h*(.17+r*.17)}" width="${w*.17}" height="${h*.14}" fill="none" stroke="${c}" stroke-width="1.4"/>`; }} return `<rect x="${left+w*.1}" y="${top+h*.1}" width="${w*.8}" height="${h*.62}" rx="6" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/>${bricks}`; }
        if (object.deviceType === 'access-point') return `<circle cx="${cx}" cy="${cy+h*.08}" r="6" fill="${c}"/><path d="M ${cx} ${cy+h*.08} V ${top+h*.65} M ${cx-18} ${cy+h*.02} A 22 22 0 0 1 ${cx+18} ${cy+h*.02} M ${cx-30} ${cy-h*.08} A 36 36 0 0 1 ${cx+30} ${cy-h*.08}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
        if (object.deviceType === 'database') return `<ellipse cx="${cx}" cy="${top+h*.22}" rx="${w*.27}" ry="${h*.12}" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/><path d="M ${cx-w*.27} ${top+h*.22} V ${top+h*.62} C ${cx-w*.27} ${top+h*.78}, ${cx+w*.27} ${top+h*.78}, ${cx+w*.27} ${top+h*.62} V ${top+h*.22}" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/><ellipse cx="${cx}" cy="${top+h*.62}" rx="${w*.27}" ry="${h*.12}" fill="none" stroke="${s}" stroke-width="2"/>`;
        if (object.deviceType === 'printer') return `<rect x="${left+w*.2}" y="${top+h*.3}" width="${w*.6}" height="${h*.36}" rx="5" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/><rect x="${left+w*.3}" y="${top+h*.08}" width="${w*.4}" height="${h*.28}" fill="#fff" stroke="${s}" stroke-width="2"/><rect x="${left+w*.3}" y="${top+h*.58}" width="${w*.4}" height="${h*.2}" fill="#fff" stroke="${s}" stroke-width="2"/><circle cx="${left+w*.7}" cy="${top+h*.43}" r="3" fill="${c}"/>`;
        if (object.deviceType === 'mobile') return `<rect x="${left+w*.35}" y="${top+h*.08}" width="${w*.3}" height="${h*.68}" rx="9" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/><circle cx="${cx}" cy="${top+h*.68}" r="3" fill="${c}"/>`;
        return `<rect x="${left+w*.14}" y="${top+h*.14}" width="${w*.72}" height="${h*.55}" rx="10" fill="${f}" stroke="${s}" stroke-width="${object.lineWidth}"/><circle cx="${cx}" cy="${cy}" r="10" fill="${c}"/>`;
    }
    function networkDeviceMarkup(spec, object) {
        const left = object.x - object.width / 2, top = object.y - object.height / 2;
        let markup = networkDeviceIconMarkup(object);
        if (spec.networkShowLabels) markup += `<text x="${object.x}" y="${top + object.height - 3}" text-anchor="middle" font-size="13.5" font-weight="800" fill="#0f172a">${escapeHtml(object.label)}</text>`;
        if (object.subtitle) markup += `<text x="${object.x}" y="${top + object.height + 15}" text-anchor="middle" font-size="11.5" fill="#475569">${escapeHtml(object.subtitle)}</text>`;
        if (spec.networkShowIp && object.ip) markup += `<text x="${object.x}" y="${top + object.height + (object.subtitle ? 31 : 17)}" text-anchor="middle" font-size="11.5" font-family="ui-monospace,Consolas,monospace" fill="${escapeHtml(object.stroke)}">${escapeHtml(object.ip)}</text>`;
        return `<g data-qmx-object="${escapeHtml(object.id)}">${markup}</g>`;
    }
    function networkLinkMarkup(spec, object) {
        const geometry = networkLinkGeometry(spec, object); if (!geometry) return '';
        const markerEnd = ['forward', 'both'].includes(object.direction) ? ' marker-end="url(#qmx-vector-arrow)"' : '';
        const markerStart = object.direction === 'both' ? ' marker-start="url(#qmx-vector-arrow)"' : '';
        const dash = object.dashed || ['wireless', 'vpn'].includes(object.linkType) ? '9 7' : '';
        const labelText = [object.label, object.bandwidth].filter(Boolean).join(' · ');
        const label = spec.networkShowLinkLabels && labelText ? `<text x="${geometry.labelX}" y="${geometry.labelY}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${escapeHtml(object.stroke)}" paint-order="stroke" stroke="#ffffff" stroke-width="5" stroke-linejoin="round">${escapeHtml(labelText)}</text>` : '';
        return `<g data-qmx-object="${escapeHtml(object.id)}"><path d="${geometry.d}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round"${markerStart}${markerEnd}/>${label}</g>`;
    }
    function networkTableMarkup(object) {
        const columns = Math.max(1, object.headers.length, ...object.rows.map((row) => row.length)); const colWidth = object.width / columns; const totalRows = object.rows.length + 2; const height = object.rowHeight * totalRows;
        let markup = `<rect x="${object.x}" y="${object.y}" width="${object.width}" height="${height}" rx="7" fill="#ffffff" stroke="${escapeHtml(object.stroke)}" stroke-width="2"/><rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.rowHeight * 2}" rx="7" fill="${escapeHtml(object.headerFill)}"/><text x="${object.x + object.width/2}" y="${object.y + object.rowHeight*.68}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.title)}</text>`;
        for (let row=1; row<totalRows; row++) { const y=object.y+row*object.rowHeight; markup += `<line x1="${object.x}" y1="${y}" x2="${object.x+object.width}" y2="${y}" stroke="${escapeHtml(object.stroke)}" stroke-width="1"/>`; }
        for (let col=1; col<columns; col++) { const x=object.x+col*colWidth; markup += `<line x1="${x}" y1="${object.y+object.rowHeight}" x2="${x}" y2="${object.y+height}" stroke="${escapeHtml(object.stroke)}" stroke-width="1"/>`; }
        for (let col=0; col<columns; col++) markup += `<text x="${object.x+colWidth*(col+.5)}" y="${object.y+object.rowHeight*1.68}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.headers[col] ?? '')}</text>`;
        object.rows.forEach((row,rowIndex)=>row.slice(0,columns).forEach((value,colIndex)=>{ markup += `<text x="${object.x+colWidth*(colIndex+.5)}" y="${object.y+object.rowHeight*(rowIndex+2.68)}" text-anchor="middle" font-size="12.5" fill="${escapeHtml(object.textColor)}">${escapeHtml(value)}</text>`; }));
        return `<g data-qmx-object="${escapeHtml(object.id)}">${markup}</g>`;
    }
    function networkObjectMarkup(spec, object) {
        if (object.type === 'network-device') return networkDeviceMarkup(spec, object);
        if (object.type === 'network-link') return networkLinkMarkup(spec, object);
        if (object.type === 'network-zone') return networkZoneMarkup(spec, object);
        if (object.type === 'network-table') return networkTableMarkup(object);
        return `<text data-qmx-object="${escapeHtml(object.id)}" x="${object.x}" y="${object.y}" fill="${escapeHtml(object.color)}" font-size="${object.fontSize}" font-weight="${object.fontWeight}">${escapeHtml(object.text)}</text>`;
    }
    function networkTopologyMarkup(spec) {
        const zones = spec.objects.filter((object) => object.type === 'network-zone'); const links = spec.objects.filter((object) => object.type === 'network-link'); const rest = spec.objects.filter((object) => !['network-zone','network-link'].includes(object.type));
        return networkGridMarkup(spec) + zones.map((object)=>networkObjectMarkup(spec,object)).join('') + links.map((object)=>networkObjectMarkup(spec,object)).join('') + rest.map((object)=>networkObjectMarkup(spec,object)).join('');
    }


    function umlBounds(object) {
        const width = Number(object.width || 200), height = Number(object.height || 120);
        return { left: Number(object.x || 0) - width / 2, top: Number(object.y || 0) - height / 2, width, height };
    }
    function umlPortPosition(object, key) {
        const b = umlBounds(object);
        if (key === 'n') return { x: Number(object.x), y: b.top };
        if (key === 's') return { x: Number(object.x), y: b.top + b.height };
        if (key === 'w') return { x: b.left, y: Number(object.y) };
        return { x: b.left + b.width, y: Number(object.y) };
    }
    function umlRelationGeometry(object, map) {
        const source = map.get(object.sourceId), target = map.get(object.targetId);
        if (!source || !target) return null;
        const start = umlPortPosition(source, object.sourcePort), end = umlPortPosition(target, object.targetPort);
        let points;
        if (!object.autoRoute) points = [start, end];
        else if (object.sourcePort === 'e' || object.sourcePort === 'w' || object.targetPort === 'e' || object.targetPort === 'w') { const midX = (start.x + end.x) / 2; points = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]; }
        else { const midY = (start.y + end.y) / 2; points = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]; }
        const compact = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
        return { start, end, points: compact, d: compact.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '), beforeEnd: compact[Math.max(0, compact.length - 2)], afterStart: compact[Math.min(1, compact.length - 1)] };
    }
    function umlGridMarkup(spec) {
        if (!spec.umlShowGrid) return '';
        const step = Math.max(5, Number(spec.gridSize || 20)); let lines = '';
        for (let x = step; x < spec.width; x += step) lines += `<line x1="${x}" y1="0" x2="${x}" y2="${spec.height}" stroke="#e2e8f0" stroke-width="1"/>`;
        for (let y = step; y < spec.height; y += step) lines += `<line x1="0" y1="${y}" x2="${spec.width}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
        return `<g opacity="0.75">${lines}</g>`;
    }
    function umlTextLines(lines, x, startY, options = {}) {
        const size = Number(options.size || 14), lineHeight = Number(options.lineHeight || size + 5), anchor = options.anchor || 'start';
        return (lines || []).map((line, index) => `<text x="${x}" y="${startY + index * lineHeight}" text-anchor="${anchor}" font-size="${size}" fill="${escapeHtml(options.color || '#0f172a')}" font-family="Arial, sans-serif">${escapeHtml(line)}</text>`).join('');
    }
    function umlClassMarkup(object, spec) {
        const b = umlBounds(object), headerHeight = spec.umlShowStereotypes && object.stereotype ? 52 : 34, attrY = b.top + headerHeight, methodY = attrY + Math.max(34, (object.attributes.length + 1) * 19);
        const stereotype = spec.umlShowStereotypes && object.stereotype ? `<text x="${object.x}" y="${b.top + 17}" text-anchor="middle" font-size="12" fill="${escapeHtml(object.textColor)}" font-style="italic">«${escapeHtml(object.stereotype)}»</text>` : '';
        const nameY = b.top + (stereotype ? 38 : 23); const nameStyle = object.classKind === 'abstract' ? 'font-style="italic"' : '';
        let compartments = '';
        if (spec.umlShowCompartments) {
            compartments += `<line x1="${b.left}" y1="${attrY}" x2="${b.left + b.width}" y2="${attrY}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
            compartments += umlTextLines(object.attributes, b.left + 10, attrY + 18, { size: 13, color: object.textColor });
            if (object.classKind !== 'enum') { compartments += `<line x1="${b.left}" y1="${methodY}" x2="${b.left + b.width}" y2="${methodY}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`; compartments += umlTextLines(object.methods, b.left + 10, methodY + 18, { size: 13, color: object.textColor }); }
        }
        return `<g data-qmx-object="${escapeHtml(object.id)}"><rect x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}" rx="3" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>${stereotype}<text x="${object.x}" y="${nameY}" text-anchor="middle" font-size="16" font-weight="700" fill="${escapeHtml(object.textColor)}" ${nameStyle}>${escapeHtml(object.name)}</text>${compartments}</g>`;
    }
    function umlComponentMarkup(object, spec) {
        const b = umlBounds(object), stereo = spec.umlShowStereotypes && object.stereotype ? `<text x="${object.x}" y="${b.top + 24}" text-anchor="middle" font-size="12" font-style="italic" fill="${escapeHtml(object.textColor)}">«${escapeHtml(object.stereotype)}»</text>` : '';
        return `<g data-qmx-object="${escapeHtml(object.id)}"><rect x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}" rx="4" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><rect x="${b.left - 8}" y="${b.top + 22}" width="24" height="18" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><rect x="${b.left - 8}" y="${b.top + 52}" width="24" height="18" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>${stereo}<text x="${object.x}" y="${b.top + (stereo ? 52 : 38)}" text-anchor="middle" font-size="17" font-weight="700" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.name)}</text><text x="${object.x}" y="${b.top + (stereo ? 78 : 66)}" text-anchor="middle" font-size="12" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.description)}</text></g>`;
    }
    function umlActorMarkup(object) {
        const b = umlBounds(object), cx = object.x, headY = b.top + 24, bodyTop = b.top + 48, bodyBottom = b.top + b.height - 36;
        return `<g data-qmx-object="${escapeHtml(object.id)}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-linecap="round"><circle cx="${cx}" cy="${headY}" r="16" fill="#fff"/><line x1="${cx}" y1="${bodyTop}" x2="${cx}" y2="${bodyBottom}"/><line x1="${cx - 30}" y1="${bodyTop + 28}" x2="${cx + 30}" y2="${bodyTop + 28}"/><line x1="${cx}" y1="${bodyBottom}" x2="${cx - 27}" y2="${b.top + b.height - 6}"/><line x1="${cx}" y1="${bodyBottom}" x2="${cx + 27}" y2="${b.top + b.height - 6}"/><text x="${cx}" y="${b.top + b.height + 20}" text-anchor="middle" font-size="15" font-weight="700" fill="${escapeHtml(object.textColor)}" stroke="none">${escapeHtml(object.label)}</text></g>`;
    }
    function umlUsecaseMarkup(object) { const b = umlBounds(object); return `<g data-qmx-object="${escapeHtml(object.id)}"><ellipse cx="${object.x}" cy="${object.y}" rx="${b.width / 2}" ry="${b.height / 2}" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><text x="${object.x}" y="${object.y + 5}" text-anchor="middle" font-size="16" font-weight="600" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.label)}</text></g>`; }
    function umlPackageMarkup(object) { const b = umlBounds(object), tabWidth = Math.min(180, Math.max(90, object.label.length * 9 + 24)); return `<g data-qmx-object="${escapeHtml(object.id)}"><path d="M ${b.left} ${b.top + 28} L ${b.left} ${b.top} L ${b.left + tabWidth} ${b.top} L ${b.left + tabWidth + 18} ${b.top + 28} L ${b.left + b.width} ${b.top + 28} L ${b.left + b.width} ${b.top + b.height} L ${b.left} ${b.top + b.height} Z" fill="${escapeHtml(object.fill)}" fill-opacity="0.45" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" ${object.dashed ? 'stroke-dasharray="8 5"' : ''}/><text x="${b.left + 12}" y="${b.top + 20}" font-size="15" font-weight="700" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.label)}</text></g>`; }
    function umlNoteMarkup(object) { const b = umlBounds(object), fold = 24, lines = String(object.text || '').split(/\r?\n/).slice(0, 12); return `<g data-qmx-object="${escapeHtml(object.id)}"><path d="M ${b.left} ${b.top} H ${b.left + b.width - fold} L ${b.left + b.width} ${b.top + fold} V ${b.top + b.height} H ${b.left} Z" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><path d="M ${b.left + b.width - fold} ${b.top} V ${b.top + fold} H ${b.left + b.width}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>${umlTextLines(lines, b.left + 12, b.top + 28, { size: 14, color: object.textColor })}</g>`; }
    function umlEndpointShape(kind, point, toward, stroke, lineWidth) {
        const dx = toward.x - point.x, dy = toward.y - point.y, length = Math.max(1, Math.hypot(dx, dy)), ux = dx / length, uy = dy / length, px = -uy, py = ux;
        if (kind === 'triangle') { const depth = 18, half = 10, tip = point, base = { x: point.x + ux * depth, y: point.y + uy * depth }; return `<polygon points="${tip.x},${tip.y} ${base.x + px * half},${base.y + py * half} ${base.x - px * half},${base.y - py * half}" fill="#fff" stroke="${escapeHtml(stroke)}" stroke-width="${lineWidth}"/>`; }
        if (kind === 'diamond' || kind === 'filled-diamond') { const depth = 22, half = 9, a = point, b = { x: point.x + ux * depth / 2 + px * half, y: point.y + uy * depth / 2 + py * half }, c = { x: point.x + ux * depth, y: point.y + uy * depth }, d = { x: point.x + ux * depth / 2 - px * half, y: point.y + uy * depth / 2 - py * half }; return `<polygon points="${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}" fill="${kind === 'filled-diamond' ? escapeHtml(stroke) : '#fff'}" stroke="${escapeHtml(stroke)}" stroke-width="${lineWidth}"/>`; }
        return '';
    }
    function umlRelationMarkup(object, map, spec) {
        const g = umlRelationGeometry(object, map); if (!g) return '';
        const dashed = object.relationType === 'dependency' || object.relationType === 'realization';
        const marker = object.relationType === 'dependency' ? ' marker-end="url(#qmx-diagram-arrow)"' : '';
        let shapes = '';
        if (object.relationType === 'generalization' || object.relationType === 'realization') shapes += umlEndpointShape('triangle', g.end, g.beforeEnd, object.stroke, object.lineWidth);
        if (object.relationType === 'aggregation') shapes += umlEndpointShape('diamond', g.start, g.afterStart, object.stroke, object.lineWidth);
        if (object.relationType === 'composition') shapes += umlEndpointShape('filled-diamond', g.start, g.afterStart, object.stroke, object.lineWidth);
        const center = g.points[Math.floor(g.points.length / 2)], label = object.label ? `<text x="${center.x}" y="${center.y - 9}" text-anchor="middle" font-size="13" font-weight="700" fill="${escapeHtml(object.stroke)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(object.label)}</text>` : '';
        const multiplicity = spec.umlShowMultiplicity ? `${object.sourceMultiplicity ? `<text x="${g.start.x + 10}" y="${g.start.y - 8}" font-size="13" fill="${escapeHtml(object.stroke)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(object.sourceMultiplicity)}</text>` : ''}${object.targetMultiplicity ? `<text x="${g.end.x + 10}" y="${g.end.y - 8}" font-size="13" fill="${escapeHtml(object.stroke)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(object.targetMultiplicity)}</text>` : ''}` : '';
        return `<g data-qmx-object="${escapeHtml(object.id)}"><path d="${g.d}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" ${dashed ? 'stroke-dasharray="8 6"' : ''}${marker}/>${shapes}${label}${multiplicity}</g>`;
    }
    function umlSoftwareDesignMarkup(spec) {
        const map = new Map(spec.objects.filter((object) => object.type !== 'uml-relation' && object.type !== 'text').map((object) => [object.id, object]));
        const packages = spec.objects.filter((object) => object.type === 'uml-package').map(umlPackageMarkup).join('');
        const relations = spec.objects.filter((object) => object.type === 'uml-relation').map((object) => umlRelationMarkup(object, map, spec)).join('');
        const elements = spec.objects.filter((object) => object.type !== 'uml-relation' && object.type !== 'uml-package').map((object) => {
            if (object.type === 'uml-class') return umlClassMarkup(object, spec);
            if (object.type === 'uml-component') return umlComponentMarkup(object, spec);
            if (object.type === 'uml-actor') return umlActorMarkup(object);
            if (object.type === 'uml-usecase') return umlUsecaseMarkup(object);
            if (object.type === 'uml-note') return umlNoteMarkup(object);
            return generalObjectMarkup(object);
        }).join('');
        return umlGridMarkup(spec) + packages + relations + elements;
    }


    function sequenceGridMarkup(spec) {
        if (!spec.sequenceShowGrid) return '';
        const step = Math.max(5, Number(spec.gridSize || 20)); let lines = '';
        for (let x = step; x < spec.width; x += step) lines += `<line x1="${x}" y1="0" x2="${x}" y2="${spec.height}" stroke="#e2e8f0" stroke-width="1"/>`;
        for (let y = step; y < spec.height; y += step) lines += `<line x1="0" y1="${y}" x2="${spec.width}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
        return `<g opacity="0.55">${lines}</g>`;
    }
    function sequenceLifelineMap(spec) { return new Map(spec.objects.filter((object) => object.type === 'seq-lifeline').map((object) => [object.id, object])); }
    function sequenceActorIcon(object) {
        const cx = object.x, top = object.y - object.height / 2 + 5;
        return `<circle cx="${cx}" cy="${top + 10}" r="9" fill="#fff" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><line x1="${cx}" y1="${top + 19}" x2="${cx}" y2="${top + 40}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><line x1="${cx - 14}" y1="${top + 27}" x2="${cx + 14}" y2="${top + 27}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><line x1="${cx}" y1="${top + 40}" x2="${cx - 12}" y2="${top + 54}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><line x1="${cx}" y1="${top + 40}" x2="${cx + 12}" y2="${top + 54}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
    }
    function sequenceDatabaseHead(object) {
        const left = object.x - object.width / 2, top = object.y - object.height / 2, rx = object.width / 2;
        return `<ellipse cx="${object.x}" cy="${top + 10}" rx="${rx}" ry="10" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><path d="M ${left} ${top + 10} V ${top + object.height - 10} C ${left} ${top + object.height + 2}, ${left + object.width} ${top + object.height + 2}, ${left + object.width} ${top + object.height - 10} V ${top + 10}" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><ellipse cx="${object.x}" cy="${top + object.height - 10}" rx="${rx}" ry="10" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>`;
    }
    function sequenceLifelineMarkup(spec, object) {
        const left = object.x - object.width / 2, top = object.y - object.height / 2, lineTop = top + object.height, bottom = Math.min(spec.height - 30, object.bottom);
        let head = '';
        if (object.roleType === 'actor') head = sequenceActorIcon(object);
        else if (object.roleType === 'database') head = sequenceDatabaseHead(object);
        else {
            const stereotype = ['boundary','control','entity'].includes(object.roleType) ? `<text x="${object.x}" y="${top + 17}" text-anchor="middle" font-size="11.5" font-style="italic" fill="${escapeHtml(object.textColor)}">«${escapeHtml(object.roleType)}»</text>` : '';
            head = `<rect x="${left}" y="${top}" width="${object.width}" height="${object.height}" rx="5" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>${stereotype}`;
        }
        const labelY = object.roleType === 'actor' ? top + object.height + 18 : top + (['boundary','control','entity'].includes(object.roleType) ? 40 : 27);
        const classY = labelY + 17;
        const foot = spec.sequenceShowFootbox ? `<rect x="${left}" y="${bottom - object.height / 2}" width="${object.width}" height="${object.height}" rx="5" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>` : '';
        return `<g data-qmx-object="${escapeHtml(object.id)}">${head}<text x="${object.x}" y="${labelY}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.name)}</text><text x="${object.x}" y="${classY}" text-anchor="middle" font-size="11.5" fill="${escapeHtml(object.textColor)}">:${escapeHtml(object.className)}</text><line x1="${object.x}" y1="${lineTop}" x2="${object.x}" y2="${bottom}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.6" stroke-dasharray="8 6"/>${foot}</g>`;
    }
    function sequenceOpenArrow(x, y, direction, stroke, lineWidth) {
        const s = direction >= 0 ? 1 : -1;
        return `<path d="M ${x - s * 12} ${y - 7} L ${x} ${y} L ${x - s * 12} ${y + 7}" fill="none" stroke="${escapeHtml(stroke)}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    function sequenceMessageMarkup(spec, object, map) {
        const source = map.get(object.sourceId), target = map.get(object.targetId); if (!source || !target) return '';
        const x1 = source.x, x2 = target.x, y = object.y, self = object.messageType === 'self' || object.sourceId === object.targetId, dashed = object.messageType === 'return';
        let path = '', arrow = '', cross = '';
        if (self) { const loop = 70; path = `M ${x1} ${y} H ${x1 + loop} V ${y + 42} H ${x1}`; arrow = sequenceOpenArrow(x1, y + 42, -1, object.stroke, object.lineWidth); }
        else { path = `M ${x1} ${y} H ${x2}`; const direction = x2 >= x1 ? 1 : -1; if (object.messageType === 'sync' || object.messageType === 'create' || object.messageType === 'destroy') arrow = `<path d="M ${x2 - direction * 13} ${y - 7} L ${x2} ${y} L ${x2 - direction * 13} ${y + 7} Z" fill="${escapeHtml(object.stroke)}" stroke="${escapeHtml(object.stroke)}" stroke-width="1"/>`; else arrow = sequenceOpenArrow(x2, y, direction, object.stroke, object.lineWidth); if (object.messageType === 'destroy') cross = `<path d="M ${x2 - 10} ${y - 10} L ${x2 + 10} ${y + 10} M ${x2 + 10} ${y - 10} L ${x2 - 10} ${y + 10}" stroke="${escapeHtml(object.stroke)}" stroke-width="3"/>`; }
        const explicit = object.number || ''; const auto = spec.sequenceShowNumbers ? String(spec.objects.filter((item) => item.type === 'seq-message' && item.y <= object.y).length) : ''; const number = explicit || auto; const label = [number, object.label].filter(Boolean).join('  ');
        const labelX = self ? x1 + 36 : (x1 + x2) / 2, labelY = y - 9;
        return `<g data-qmx-object="${escapeHtml(object.id)}"><path d="${path}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" ${dashed ? 'stroke-dasharray="8 6"' : ''} stroke-linecap="round" stroke-linejoin="round"/>${arrow}${cross}<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="13" font-weight="700" fill="${escapeHtml(object.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(label)}</text></g>`;
    }
    function sequenceActivationMarkup(spec, object, map) {
        if (!spec.sequenceShowActivations) return '';
        const line = map.get(object.lifelineId); if (!line) return '';
        return `<g data-qmx-object="${escapeHtml(object.id)}"><rect x="${line.x - object.width / 2}" y="${object.y}" width="${object.width}" height="${object.height}" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/></g>`;
    }
    function sequenceFragmentMarkup(object) {
        const tabWidth = Math.max(55, object.operator.length * 12 + 22), clauseCount = Math.max(1, object.clauses.length), clauseHeight = object.height / clauseCount;
        let separators = '', labels = '';
        object.clauses.forEach((clause, index) => { if (index > 0) separators += `<line x1="${object.x}" y1="${object.y + index * clauseHeight}" x2="${object.x + object.width}" y2="${object.y + index * clauseHeight}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.5" stroke-dasharray="7 5"/>`; labels += `<text x="${object.x + 12}" y="${object.y + index * clauseHeight + 48}" font-size="12.5" font-weight="700" fill="${escapeHtml(object.textColor)}">${escapeHtml(clause)}</text>`; });
        return `<g data-qmx-object="${escapeHtml(object.id)}"><rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" fill="${escapeHtml(object.fill)}" fill-opacity="0.28" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><path d="M ${object.x} ${object.y} H ${object.x + tabWidth} L ${object.x + tabWidth + 14} ${object.y + 28} H ${object.x} Z" fill="#f1f5f9" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><text x="${object.x + 12}" y="${object.y + 19}" font-size="14" font-weight="900" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.operator)}</text><text x="${object.x + tabWidth + 28}" y="${object.y + 19}" font-size="12.5" font-weight="700" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.guard)}</text>${separators}${labels}</g>`;
    }
    function sequenceNoteMarkup(object) {
        const fold = 22, lines = String(object.text || '').split(/\r?\n/).slice(0, 10);
        const text = lines.map((line, index) => `<text x="${object.x + 12}" y="${object.y + 28 + index * 18}" font-size="13" fill="${escapeHtml(object.textColor)}">${escapeHtml(line)}</text>`).join('');
        return `<g data-qmx-object="${escapeHtml(object.id)}"><path d="M ${object.x} ${object.y} H ${object.x + object.width - fold} L ${object.x + object.width} ${object.y + fold} V ${object.y + object.height} H ${object.x} Z" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><path d="M ${object.x + object.width - fold} ${object.y} V ${object.y + fold} H ${object.x + object.width}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>${text}</g>`;
    }
    function umlSequenceMarkup(spec) {
        const map = sequenceLifelineMap(spec);
        const fragments = spec.objects.filter((object) => object.type === 'seq-fragment').map(sequenceFragmentMarkup).join('');
        const lifelineMarkup = spec.objects.filter((object) => object.type === 'seq-lifeline').map((object) => sequenceLifelineMarkup(spec, object)).join('');
        const activations = spec.objects.filter((object) => object.type === 'seq-activation').map((object) => sequenceActivationMarkup(spec, object, map)).join('');
        const messages = spec.objects.filter((object) => object.type === 'seq-message').sort((a,b)=>a.y-b.y).map((object) => sequenceMessageMarkup(spec, object, map)).join('');
        const notes = spec.objects.filter((object) => object.type === 'seq-note').map(sequenceNoteMarkup).join('');
        const texts = spec.objects.filter((object) => object.type === 'text').map(generalObjectMarkup).join('');
        return `<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${sequenceGridMarkup(spec)}${fragments}${lifelineMarkup}${activations}${messages}${notes}${texts}</g>`;
    }



    function activityNodeMap(spec) { return new Map(spec.objects.filter((object) => object.type === 'activity-node').map((object) => [object.id, object])); }
    function activityPortPoint(object, port) {
        if (port === 'n') return { x: object.x + object.width / 2, y: object.y };
        if (port === 's') return { x: object.x + object.width / 2, y: object.y + object.height };
        if (port === 'w') return { x: object.x, y: object.y + object.height / 2 };
        return { x: object.x + object.width, y: object.y + object.height / 2 };
    }
    function activityGridMarkup(spec) {
        if (!spec.activityShowGrid) return '';
        return `<rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-geometry-grid)" opacity="0.72"/>`;
    }
    function activityNodeMarkup(object) {
        const x=object.x,y=object.y,w=object.width,h=object.height,cx=x+w/2,cy=y+h/2,fill=escapeHtml(object.fill),stroke=escapeHtml(object.stroke),text=escapeHtml(object.textColor),lw=object.lineWidth;
        const label = object.label ? `<text x="${cx}" y="${cy + (object.secondary ? -3 : 5)}" text-anchor="middle" font-size="14" font-weight="700" fill="${text}">${escapeHtml(object.label)}</text>` : '';
        const secondary = object.secondary ? `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="11.5" fill="${text}">${escapeHtml(object.secondary)}</text>` : '';
        let shape='';
        if (object.nodeKind==='initial') shape=`<circle cx="${cx}" cy="${cy}" r="${Math.max(8,Math.min(w,h)/2-2)}" fill="${stroke}" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if (object.nodeKind==='final') {const r=Math.max(10,Math.min(w,h)/2-3);shape=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><circle cx="${cx}" cy="${cy}" r="${Math.max(5,r-7)}" fill="${stroke}"/>`;}
        else if (['decision','merge','bpmn-gateway'].includes(object.nodeKind)) shape=`<path d="M ${cx} ${y} L ${x+w} ${cy} L ${cx} ${y+h} L ${x} ${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if (['fork','join'].includes(object.nodeKind)) shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(5,h/3)}" fill="${stroke}" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if (object.nodeKind==='object') shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><line x1="${x+12}" y1="${y+h-12}" x2="${x+w-12}" y2="${y+h-12}" stroke="${stroke}" stroke-width="1.4"/>`;
        else if (object.nodeKind==='signal-send') shape=`<path d="M ${x} ${y} H ${x+w*0.72} L ${x+w} ${cy} L ${x+w*0.72} ${y+h} H ${x} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if (object.nodeKind==='signal-receive') shape=`<path d="M ${x+w*0.28} ${y} H ${x+w} V ${y+h} H ${x+w*0.28} L ${x} ${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if (object.nodeKind==='bpmn-start') shape=`<circle cx="${cx}" cy="${cy}" r="${Math.max(9,Math.min(w,h)/2-3)}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if (object.nodeKind==='bpmn-end') shape=`<circle cx="${cx}" cy="${cy}" r="${Math.max(9,Math.min(w,h)/2-3)}" fill="${fill}" stroke="${stroke}" stroke-width="${Math.max(3.5,lw+1.5)}"/>`;
        else if (object.nodeKind==='bpmn-task') shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><rect x="${x+9}" y="${y+9}" width="16" height="12" rx="2" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
        else shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(18,h/3)}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;
        return `<g data-qmx-object="${escapeHtml(object.id)}">${shape}${label}${secondary}</g>`;
    }
    function activityFlowPath(source, target, object) {
        const a=activityPortPoint(source,object.sourcePort),b=activityPortPoint(target,object.targetPort);
        if (!object.autoRoute) return {d:`M ${a.x} ${a.y} L ${b.x} ${b.y}`,a,b,label:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
        const horizontal=['e','w'].includes(object.sourcePort)&&['e','w'].includes(object.targetPort);
        const vertical=['n','s'].includes(object.sourcePort)&&['n','s'].includes(object.targetPort);
        if(horizontal){const mid=(a.x+b.x)/2;return{d:`M ${a.x} ${a.y} H ${mid} V ${b.y} H ${b.x}`,a,b,label:{x:mid+6,y:(a.y+b.y)/2-6}};}
        if(vertical){const mid=(a.y+b.y)/2;return{d:`M ${a.x} ${a.y} V ${mid} H ${b.x} V ${b.y}`,a,b,label:{x:(a.x+b.x)/2+6,y:mid-6}};}
        const midX=a.x+(b.x-a.x)*0.55;return{d:`M ${a.x} ${a.y} H ${midX} V ${b.y} H ${b.x}`,a,b,label:{x:midX+6,y:(a.y+b.y)/2-6}};
    }
    function activityFlowMarkup(spec, object, map) {
        const source=map.get(object.sourceId),target=map.get(object.targetId);if(!source||!target)return'';const route=activityFlowPath(source,target,object);
        const dash=object.flowType==='message'?'8 6':object.flowType==='association'?'3 5':object.flowType==='object'?'10 4':'';
        const marker=object.flowType==='association'?'':' marker-end="url(#qmx-diagram-arrow)"';
        const labelParts=[];if(spec.activityShowGuards&&object.guard)labelParts.push(object.guard);if(spec.activityShowLabels&&object.label)labelParts.push(object.label);const label=labelParts.join(' ');
        const textMarkup=label?`<text x="${route.label.x}" y="${route.label.y}" font-size="12.5" font-weight="700" fill="${escapeHtml(object.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(label)}</text>`:'';
        return `<g data-qmx-object="${escapeHtml(object.id)}"><path d="${route.d}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"${dash?` stroke-dasharray="${dash}"`:''}${marker}/>${textMarkup}</g>`;
    }
    function activitySwimlaneMarkup(spec, object) {
        const labels=object.laneLabels.length?object.laneLabels:['Lane 1'];let separators='',titles='';
        if(object.orientation==='vertical') {const usable=object.width,step=usable/labels.length;labels.forEach((label,index)=>{if(index>0)separators+=`<line x1="${object.x+index*step}" y1="${object.y}" x2="${object.x+index*step}" y2="${object.y+object.height}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.4"/>`;if(spec.activityShowLaneTitles)titles+=`<text x="${object.x+index*step+step/2}" y="${object.y+22}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(label)}</text>`;});separators+=`<line x1="${object.x}" y1="${object.y+object.headerSize}" x2="${object.x+object.width}" y2="${object.y+object.headerSize}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.4"/>`;}
        else {const usable=object.height,step=usable/labels.length;labels.forEach((label,index)=>{if(index>0)separators+=`<line x1="${object.x}" y1="${object.y+index*step}" x2="${object.x+object.width}" y2="${object.y+index*step}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.4"/>`;if(spec.activityShowLaneTitles)titles+=`<text x="${object.x+12}" y="${object.y+index*step+step/2+5}" font-size="13" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(label)}</text>`;});separators+=`<line x1="${object.x+object.headerSize}" y1="${object.y}" x2="${object.x+object.headerSize}" y2="${object.y+object.height}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.4"/>`;}
        return `<g data-qmx-object="${escapeHtml(object.id)}"><rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" fill="${escapeHtml(object.fill)}" fill-opacity="0.55" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>${separators}${titles}<text x="${object.x+10}" y="${object.y-10}" font-size="14" font-weight="900" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.title)}</text></g>`;
    }
    function activityNoteMarkup(object) {const fold=22,lines=String(object.text||'').split(/\r?\n/).slice(0,10),text=lines.map((line,index)=>`<text x="${object.x+12}" y="${object.y+28+index*18}" font-size="13" fill="${escapeHtml(object.textColor)}">${escapeHtml(line)}</text>`).join('');return`<g data-qmx-object="${escapeHtml(object.id)}"><path d="M ${object.x} ${object.y} H ${object.x+object.width-fold} L ${object.x+object.width} ${object.y+fold} V ${object.y+object.height} H ${object.x} Z" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><path d="M ${object.x+object.width-fold} ${object.y} V ${object.y+fold} H ${object.x+object.width}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>${text}</g>`;}
    function umlActivityMarkup(spec) {
        const map=activityNodeMap(spec),lanes=spec.objects.filter((o)=>o.type==='activity-swimlane').map((o)=>activitySwimlaneMarkup(spec,o)).join(''),flows=spec.objects.filter((o)=>o.type==='activity-flow').map((o)=>activityFlowMarkup(spec,o,map)).join(''),nodes=spec.objects.filter((o)=>o.type==='activity-node').map(activityNodeMarkup).join(''),notes=spec.objects.filter((o)=>o.type==='activity-note').map(activityNoteMarkup).join(''),texts=spec.objects.filter((o)=>o.type==='text').map(generalObjectMarkup).join('');
        return `<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${activityGridMarkup(spec)}${lanes}${flows}${nodes}${notes}${texts}</g>`;
    }


    function deploymentNodeMap(spec) { return new Map(spec.objects.filter((object) => object.type === 'deployment-node').map((object) => [object.id, object])); }
    function deploymentPortPoint(object, port) {
        if (port === 'n') return { x: object.x + object.width / 2, y: object.y };
        if (port === 's') return { x: object.x + object.width / 2, y: object.y + object.height };
        if (port === 'w') return { x: object.x, y: object.y + object.height / 2 };
        return { x: object.x + object.width, y: object.y + object.height / 2 };
    }
    function deploymentGridMarkup(spec) { return spec.deploymentShowGrid ? `<rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-geometry-grid)" opacity="0.72"/>` : ''; }
    function deploymentNodeMarkup(object) {
        const x=object.x,y=object.y,w=object.width,h=object.height,cx=x+w/2,cy=y+h/2,fill=escapeHtml(object.fill),stroke=escapeHtml(object.stroke),text=escapeHtml(object.textColor),lw=object.lineWidth;
        const labelY=cy+(object.secondary?-4:5),label=object.label?`<text x="${cx}" y="${labelY}" text-anchor="middle" font-size="14" font-weight="800" fill="${text}">${escapeHtml(object.label)}</text>`:'',secondary=object.secondary?`<text x="${cx}" y="${cy+18}" text-anchor="middle" font-size="11.5" fill="${text}">${escapeHtml(object.secondary)}</text>`:'';
        let shape='';
        if(object.nodeKind==='user') shape=`<circle cx="${cx}" cy="${y+18}" r="12" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${cx} ${y+30} V ${y+55} M ${cx-18} ${y+40} H ${cx+18} M ${cx} ${y+55} L ${cx-16} ${y+h-7} M ${cx} ${y+55} L ${cx+16} ${y+h-7}" fill="none" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if(object.nodeKind==='database') shape=`<ellipse cx="${cx}" cy="${y+14}" rx="${w/2}" ry="14" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x} ${y+14} V ${y+h-14} C ${x} ${y+h+5},${x+w} ${y+h+5},${x+w} ${y+h-14} V ${y+14}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><ellipse cx="${cx}" cy="${y+h-14}" rx="${w/2}" ry="14" fill="none" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if(object.nodeKind==='cloud') shape=`<path d="M ${x+w*.18} ${y+h*.72} C ${x-w*.02} ${y+h*.65},${x+w*.05} ${y+h*.34},${x+w*.28} ${y+h*.36} C ${x+w*.35} ${y+h*.08},${x+w*.72} ${y+h*.08},${x+w*.78} ${y+h*.38} C ${x+w*1.02} ${y+h*.38},${x+w*1.04} ${y+h*.72},${x+w*.82} ${y+h*.76} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if(object.nodeKind==='load-balancer') shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x+26} ${cy} H ${x+w-26} M ${x+w-48} ${cy-13} L ${x+w-26} ${cy} L ${x+w-48} ${cy+13}" fill="none" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if(object.nodeKind==='queue') shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${[0,1,2].map(i=>`<circle cx="${x+25+i*24}" cy="${y+18}" r="7" fill="none" stroke="${stroke}" stroke-width="1.5"/>`).join('')}<path d="M ${x+18} ${y+h-18} H ${x+w-18}" stroke="${stroke}" stroke-width="1.5"/>`;
        else if(object.nodeKind==='storage') shape=`<path d="M ${x+12} ${y} H ${x+w-12} L ${x+w} ${y+18} V ${y+h} H ${x} V ${y+18} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x} ${y+18} H ${x+w}" stroke="${stroke}" stroke-width="1.5"/>`;
        else if(object.nodeKind==='firewall') shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${[1,2,3].map(r=>`<line x1="${x}" y1="${y+r*h/4}" x2="${x+w}" y2="${y+r*h/4}" stroke="${stroke}" stroke-width="1"/>`).join('')}<path d="M ${x+w/2} ${y} V ${y+h/4} M ${x+w/4} ${y+h/4} V ${y+h/2} M ${x+3*w/4} ${y+h/4} V ${y+h/2} M ${x+w/2} ${y+h/2} V ${y+3*h/4}" stroke="${stroke}" stroke-width="1"/>`;
        else if(object.nodeKind==='artifact') shape=`<path d="M ${x} ${y} H ${x+w-24} L ${x+w} ${y+24} V ${y+h} H ${x} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x+w-24} ${y} V ${y+24} H ${x+w}" fill="none" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if(object.nodeKind==='device') shape=`<path d="M ${x} ${y+16} L ${x+16} ${y} H ${x+w} V ${y+h-16} L ${x+w-16} ${y+h} H ${x} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x+16} ${y} V ${y+16} H ${x}" stroke="${stroke}" stroke-width="1.4"/>`;
        else if(object.nodeKind==='cluster') shape=`<rect x="${x+12}" y="${y+12}" width="${w-12}" height="${h-12}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${lw}" stroke-dasharray="7 4"/><rect x="${x}" y="${y}" width="${w-12}" height="${h-12}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;
        else if(object.nodeKind==='container') shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><rect x="${x+9}" y="${y+9}" width="${w-18}" height="${h-18}" rx="6" fill="none" stroke="${stroke}" stroke-width="1.3" stroke-dasharray="5 3"/>`;
        else if(object.nodeKind==='service') shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><circle cx="${x+20}" cy="${cy}" r="7" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
        else if(object.nodeKind==='execution') shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x} ${y+24} H ${x+w}" stroke="${stroke}" stroke-width="1.4"/><circle cx="${x+14}" cy="${y+12}" r="3" fill="${stroke}"/>`;
        else shape=`<path d="M ${x} ${y+14} L ${x+14} ${y} H ${x+w} V ${y+h-14} L ${x+w-14} ${y+h} H ${x} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x+14} ${y} V ${y+14} H ${x}" stroke="${stroke}" stroke-width="1.4"/>`;
        return `<g data-qmx-object="${escapeHtml(object.id)}">${shape}${label}${secondary}</g>`;
    }
    function deploymentLinkPath(source,target,object){const a=deploymentPortPoint(source,object.sourcePort),b=deploymentPortPoint(target,object.targetPort);if(!object.autoRoute)return{d:`M ${a.x} ${a.y} L ${b.x} ${b.y}`,label:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};const horizontal=['e','w'].includes(object.sourcePort)&&['e','w'].includes(object.targetPort),vertical=['n','s'].includes(object.sourcePort)&&['n','s'].includes(object.targetPort);if(horizontal){const mid=(a.x+b.x)/2;return{d:`M ${a.x} ${a.y} H ${mid} V ${b.y} H ${b.x}`,label:{x:mid+6,y:(a.y+b.y)/2-6}};}if(vertical){const mid=(a.y+b.y)/2;return{d:`M ${a.x} ${a.y} V ${mid} H ${b.x} V ${b.y}`,label:{x:(a.x+b.x)/2+6,y:mid-6}};}const mid=a.x+(b.x-a.x)*.55;return{d:`M ${a.x} ${a.y} H ${mid} V ${b.y} H ${b.x}`,label:{x:mid+6,y:(a.y+b.y)/2-6}};}
    function deploymentLinkMarkup(spec,object,map){const source=map.get(object.sourceId),target=map.get(object.targetId);if(!source||!target)return'';const route=deploymentLinkPath(source,target,object),dash=object.linkType==='dependency'?'7 5':object.linkType==='deployment'?'12 5':object.linkType==='async'?'3 5':object.linkType==='data'?'10 3':'',marker=object.linkType==='dependency'?' marker-end="url(#qmx-diagram-arrow)"':' marker-end="url(#qmx-diagram-arrow)"',parts=[];if(spec.deploymentShowLinkTypes&&object.guard)parts.push(object.guard);if(spec.deploymentShowLabels&&object.label)parts.push(object.label);const label=parts.join(' · '),text=label?`<text x="${route.label.x}" y="${route.label.y}" font-size="12.5" font-weight="700" fill="${escapeHtml(object.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(object.id)}"><path d="${route.d}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"${dash?` stroke-dasharray="${dash}"`:''}${marker}/>${text}</g>`;}
    function deploymentZoneMarkup(spec,object){const labels=object.zoneLabels.length?object.zoneLabels:['Zone 1'];let separators='',titles='';if(object.orientation==='vertical'){const step=object.width/labels.length;labels.forEach((label,index)=>{if(index>0)separators+=`<line x1="${object.x+index*step}" y1="${object.y}" x2="${object.x+index*step}" y2="${object.y+object.height}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.4" stroke-dasharray="6 4"/>`;if(spec.deploymentShowZoneTitles)titles+=`<text x="${object.x+index*step+step/2}" y="${object.y+22}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(label)}</text>`;});separators+=`<line x1="${object.x}" y1="${object.y+object.headerSize}" x2="${object.x+object.width}" y2="${object.y+object.headerSize}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.4"/>`;}else{const step=object.height/labels.length;labels.forEach((label,index)=>{if(index>0)separators+=`<line x1="${object.x}" y1="${object.y+index*step}" x2="${object.x+object.width}" y2="${object.y+index*step}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.4" stroke-dasharray="6 4"/>`;if(spec.deploymentShowZoneTitles)titles+=`<text x="${object.x+12}" y="${object.y+index*step+step/2+5}" font-size="13" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(label)}</text>`;});separators+=`<line x1="${object.x+object.headerSize}" y1="${object.y}" x2="${object.x+object.headerSize}" y2="${object.y+object.height}" stroke="${escapeHtml(object.stroke)}" stroke-width="1.4"/>`;}return`<g data-qmx-object="${escapeHtml(object.id)}"><rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" rx="12" fill="${escapeHtml(object.fill)}" fill-opacity="0.48" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" stroke-dasharray="8 5"/>${separators}${titles}<text x="${object.x+10}" y="${object.y-10}" font-size="14" font-weight="900" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.title)}</text></g>`;}
    function deploymentNoteMarkup(object){const fold=22,lines=String(object.text||'').split(/\r?\n/).slice(0,10),text=lines.map((line,index)=>`<text x="${object.x+12}" y="${object.y+28+index*18}" font-size="13" fill="${escapeHtml(object.textColor)}">${escapeHtml(line)}</text>`).join('');return`<g data-qmx-object="${escapeHtml(object.id)}"><path d="M ${object.x} ${object.y} H ${object.x+object.width-fold} L ${object.x+object.width} ${object.y+fold} V ${object.y+object.height} H ${object.x} Z" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><path d="M ${object.x+object.width-fold} ${object.y} V ${object.y+fold} H ${object.x+object.width}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>${text}</g>`;}
    function cloudDeploymentMarkup(spec){const map=deploymentNodeMap(spec),zones=spec.objects.filter((o)=>o.type==='deployment-zone').map((o)=>deploymentZoneMarkup(spec,o)).join(''),links=spec.objects.filter((o)=>o.type==='deployment-link').map((o)=>deploymentLinkMarkup(spec,o,map)).join(''),nodes=spec.objects.filter((o)=>o.type==='deployment-node').map(deploymentNodeMarkup).join(''),notes=spec.objects.filter((o)=>o.type==='deployment-note').map(deploymentNoteMarkup).join(''),texts=spec.objects.filter((o)=>o.type==='text').map(generalObjectMarkup).join('');return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${deploymentGridMarkup(spec)}${zones}${links}${nodes}${notes}${texts}</g>`;}

    function chemicalAtomMap(spec){return new Map(spec.objects.filter((object)=>object.type==='chemical-atom').map((object)=>[object.id,object]));}
    function chemicalPortPoint(atom,port){const r=atom.radius+2,map={n:[0,-1],ne:[.707,-.707],e:[1,0],se:[.707,.707],s:[0,1],sw:[-.707,.707],w:[-1,0],nw:[-.707,-.707]},v=map[port]||map.e;return{x:atom.x+v[0]*r,y:atom.y+v[1]*r};}
    function chemicalGridMarkup(spec){return spec.chemicalShowGrid?`<rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-geometry-grid)" opacity="0.58"/>`:'';}
    function chemicalAtomMarkup(spec,atom){const showSymbol=spec.chemicalShowCarbonLabels||String(atom.symbol).toUpperCase()!=='C'||atom.atomStyle==='ball',r=atom.radius,ball=atom.atomStyle==='ball'?`<circle cx="${atom.x}" cy="${atom.y}" r="${r}" fill="${escapeHtml(atom.fill)}" stroke="${escapeHtml(atom.stroke)}" stroke-width="${atom.lineWidth}"/>`:'',symbol=showSymbol?`<text x="${atom.x}" y="${atom.y+7}" text-anchor="middle" font-size="${Math.max(18,r*1.18)}" font-weight="800" fill="${escapeHtml(atom.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="3">${escapeHtml(atom.symbol)}</text>`:'',h=spec.chemicalShowHydrogens&&atom.hydrogenCount>0?`<text x="${atom.x+r*.65}" y="${atom.y+r*.6}" font-size="15" font-weight="700" fill="${escapeHtml(atom.textColor)}">H${atom.hydrogenCount>1?`<tspan baseline-shift="sub" font-size="10">${atom.hydrogenCount}</tspan>`:''}</text>`:'',charge=spec.chemicalShowCharges&&atom.charge?`<text x="${atom.x+r*.7}" y="${atom.y-r*.6}" font-size="14" font-weight="900" fill="${escapeHtml(atom.textColor)}">${escapeHtml(atom.charge)}</text>`:'',isotope=spec.chemicalShowCharges&&atom.isotope?`<text x="${atom.x-r*.9}" y="${atom.y-r*.55}" font-size="12" font-weight="800" fill="${escapeHtml(atom.textColor)}">${escapeHtml(atom.isotope)}</text>`:'',label=atom.label?`<text x="${atom.x}" y="${atom.y+r+22}" text-anchor="middle" font-size="12" fill="${escapeHtml(atom.textColor)}">${escapeHtml(atom.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(atom.id)}">${ball}${symbol}${h}${charge}${isotope}${label}</g>`;}
    function chemicalBondMarkup(object,map){const a=map.get(object.sourceId),b=map.get(object.targetId);if(!a||!b)return'';const p1=chemicalPortPoint(a,object.sourcePort),p2=chemicalPortPoint(b,object.targetPort),dx=p2.x-p1.x,dy=p2.y-p1.y,len=Math.max(1,Math.hypot(dx,dy)),nx=-dy/len,ny=dx/len,offset=5,stroke=escapeHtml(object.stroke),w=object.lineWidth;let body='';if(object.bondStyle==='wedge'){body=`<path d="M ${p1.x} ${p1.y} L ${p2.x+nx*8} ${p2.y+ny*8} L ${p2.x-nx*8} ${p2.y-ny*8} Z" fill="${stroke}"/>`;}else if(object.bondStyle==='dash'){body=`<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${stroke}" stroke-width="${w}" stroke-dasharray="7 5"/>`;}else if(object.bondOrder===2){body=`<line x1="${p1.x+nx*offset}" y1="${p1.y+ny*offset}" x2="${p2.x+nx*offset}" y2="${p2.y+ny*offset}" stroke="${stroke}" stroke-width="${w}"/><line x1="${p1.x-nx*offset}" y1="${p1.y-ny*offset}" x2="${p2.x-nx*offset}" y2="${p2.y-ny*offset}" stroke="${stroke}" stroke-width="${w}"/>`;}else if(object.bondOrder===3){body=`<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${stroke}" stroke-width="${w}"/><line x1="${p1.x+nx*8}" y1="${p1.y+ny*8}" x2="${p2.x+nx*8}" y2="${p2.y+ny*8}" stroke="${stroke}" stroke-width="${w}"/><line x1="${p1.x-nx*8}" y1="${p1.y-ny*8}" x2="${p2.x-nx*8}" y2="${p2.y-ny*8}" stroke="${stroke}" stroke-width="${w}"/>`;}else{body=`<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${stroke}" stroke-width="${w}"${object.bondOrder===1.5?' stroke-dasharray="10 4"':''}/>`;}const label=object.label?`<text x="${(p1.x+p2.x)/2+nx*14}" y="${(p1.y+p2.y)/2+ny*14}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(object.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(object.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(object.id)}">${body}${label}</g>`;}
    function chemicalRingMarkup(object){const points=Array.from({length:object.sides},(_,i)=>{const a=(object.rotation+i*360/object.sides)*Math.PI/180;return[object.x+Math.cos(a)*object.radius,object.y+Math.sin(a)*object.radius];}),path=points.map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ')+' Z',inner=object.aromatic?`<circle cx="${object.x}" cy="${object.y}" r="${object.radius*.55}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${Math.max(1.5,object.lineWidth*.75)}"/>`:'';return`<g data-qmx-object="${escapeHtml(object.id)}"><path d="${path}" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>${inner}</g>`;}
    function chemicalReactionArrowMarkup(spec,object){const dx=object.x2-object.x1,dy=object.y2-object.y1,len=Math.max(1,Math.hypot(dx,dy)),nx=-dy/len,ny=dx/len,s=6,stroke=escapeHtml(object.stroke);let body='';if(object.arrowType==='equilibrium'){body=`<line x1="${object.x1+nx*s}" y1="${object.y1+ny*s}" x2="${object.x2+nx*s}" y2="${object.y2+ny*s}" stroke="${stroke}" stroke-width="${object.lineWidth}" marker-end="url(#qmx-diagram-arrow)"/><line x1="${object.x2-nx*s}" y1="${object.y2-ny*s}" x2="${object.x1-nx*s}" y2="${object.y1-ny*s}" stroke="${stroke}" stroke-width="${object.lineWidth}" marker-end="url(#qmx-diagram-arrow)"/>`;}else if(object.arrowType==='retro'){body=`<line x1="${object.x1}" y1="${object.y1-5}" x2="${object.x2}" y2="${object.y2-5}" stroke="${stroke}" stroke-width="${object.lineWidth}" marker-end="url(#qmx-diagram-arrow)"/><line x1="${object.x1}" y1="${object.y1+5}" x2="${object.x2}" y2="${object.y2+5}" stroke="${stroke}" stroke-width="${Math.max(1,object.lineWidth*.7)}"/>`;}else body=`<line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" stroke="${stroke}" stroke-width="${object.lineWidth}" marker-end="url(#qmx-diagram-arrow)"/>`;const mx=(object.x1+object.x2)/2,my=(object.y1+object.y2)/2,above=spec.chemicalShowConditions&&object.above?`<text x="${mx}" y="${my-18}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(object.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(object.above)}</text>`:'',below=spec.chemicalShowConditions&&object.below?`<text x="${mx}" y="${my+27}" text-anchor="middle" font-size="12" fill="${escapeHtml(object.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(object.below)}</text>`:'';return`<g data-qmx-object="${escapeHtml(object.id)}">${body}${above}${below}</g>`;}
    function chemicalCurvedArrowMarkup(object){const d=`M ${object.x1} ${object.y1} Q ${object.cx} ${object.cy} ${object.x2} ${object.y2}`,label=object.label?`<text x="${object.cx}" y="${object.cy-10}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(object.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(object.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(object.id)}"><path d="${d}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}" marker-end="url(#qmx-diagram-arrow)"/>${label}</g>`;}
    function chemicalBracketMarkup(object){const x=object.x,y=object.y,w=object.width,h=object.height,t=18,d=`M ${x+t} ${y} H ${x} V ${y+h} H ${x+t} M ${x+w-t} ${y} H ${x+w} V ${y+h} H ${x+w-t}`,label=object.label?`<text x="${x+w/2}" y="${y-12}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.label)}</text>`:'',sub=object.subscript?`<text x="${x+w+10}" y="${y+h+12}" font-size="20" font-weight="900" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.subscript)}</text>`:'';return`<g data-qmx-object="${escapeHtml(object.id)}"><path d="${d}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/>${label}${sub}</g>`;}
    function chemicalStructureMarkup(spec){const atomMap=chemicalAtomMap(spec),grid=chemicalGridMarkup(spec),bonds=spec.objects.filter((o)=>o.type==='chemical-bond').map((o)=>chemicalBondMarkup(o,atomMap)).join(''),rings=spec.objects.filter((o)=>o.type==='chemical-ring').map(chemicalRingMarkup).join(''),arrows=spec.objects.filter((o)=>o.type==='chemical-reaction-arrow').map((o)=>chemicalReactionArrowMarkup(spec,o)).join(''),curved=spec.objects.filter((o)=>o.type==='chemical-curved-arrow').map(chemicalCurvedArrowMarkup).join(''),brackets=spec.objects.filter((o)=>o.type==='chemical-bracket').map(chemicalBracketMarkup).join(''),atoms=spec.objects.filter((o)=>o.type==='chemical-atom').map((o)=>chemicalAtomMarkup(spec,o)).join(''),texts=spec.objects.filter((o)=>o.type==='text').map(generalObjectMarkup).join('');return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${rings}${bonds}${arrows}${curved}${brackets}${atoms}${texts}</g>`;}

    function biologyGridMarkup(spec){if(!spec.biologyShowGrid)return'';const step=spec.gridSize;return`<g opacity=".55"><defs><pattern id="qmx-biology-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#dbeafe" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-biology-grid)"/></g>`;}
    function biologyObjectBox(object){if(['biological-cell-boundary','biological-organelle','biological-label'].includes(object.type))return{x:object.x,y:object.y,w:object.width,h:object.height};return null;}
    function biologyPortPoint(object,port){const b=biologyObjectBox(object)||{x:0,y:0,w:0,h:0},map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},p=map[port]||map.e;return{x:b.x+b.w*p[0],y:b.y+b.h*p[1]};}
    function biologyBoundaryMarkup(spec,object){const x=object.x,y=object.y,w=object.width,h=object.height,fill=escapeHtml(object.fill),stroke=escapeHtml(object.stroke),lw=object.lineWidth,label=object.label?`<text x="${x+w/2}" y="${y+24}" text-anchor="middle" font-size="15" font-weight="800" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.label)}</text>`:'';if(object.kind==='plant'){const inner=spec.biologyShowMembranes?`<rect x="${x+10}" y="${y+10}" width="${w-20}" height="${h-20}" rx="28" fill="none" stroke="#65a30d" stroke-width="2"/>`:'';return`<g data-qmx-object="${escapeHtml(object.id)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${inner}${label}</g>`;}if(object.kind==='bacterium'){const inner=spec.biologyShowMembranes?`<rect x="${x+9}" y="${y+9}" width="${w-18}" height="${h-18}" rx="${(h-18)/2}" fill="none" stroke="#f59e0b" stroke-width="2"/>`:'';return`<g data-qmx-object="${escapeHtml(object.id)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h/2}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${inner}${label}</g>`;}const d=`M ${x+w*.08} ${y+h*.45} C ${x+w*.02} ${y+h*.16}, ${x+w*.28} ${y-h*.02}, ${x+w*.52} ${y+h*.05} C ${x+w*.82} ${y-h*.02}, ${x+w*1.02} ${y+h*.22}, ${x+w*.95} ${y+h*.52} C ${x+w*1.02} ${y+h*.83}, ${x+w*.72} ${y+h*1.03}, ${x+w*.48} ${y+h*.95} C ${x+w*.18} ${y+h*1.03}, ${x-w*.02} ${y+h*.76}, ${x+w*.08} ${y+h*.45} Z`;return`<g data-qmx-object="${escapeHtml(object.id)}"><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${label}</g>`;}
    function biologyOrganelleMarkup(spec,object){const x=object.x,y=object.y,w=object.width,h=object.height,cx=x+w/2,cy=y+h/2,fill=escapeHtml(object.fill),stroke=escapeHtml(object.stroke),lw=object.lineWidth,label=object.label?`<text x="${cx}" y="${y+h+18}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.label)}</text>`:'';let body='';if(object.kind==='nucleus'){body=`<ellipse cx="${cx}" cy="${cy}" rx="${w/2}" ry="${h/2}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${spec.biologyShowDetails?`<circle cx="${cx+w*.08}" cy="${cy-h*.06}" r="${Math.max(7,Math.min(w,h)*.16)}" fill="#c4b5fd" stroke="${stroke}" stroke-width="1.5"/><path d="M ${x+w*.18} ${cy} Q ${cx} ${y+h*.12} ${x+w*.82} ${cy}" fill="none" stroke="#8b5cf6" stroke-width="1.5" opacity=".8"/>`:''}`;}else if(object.kind==='mitochondrion'){let cr='';for(let i=1;i<=object.detailCount;i++){const xx=x+w*i/(object.detailCount+1);cr+=`<path d="M ${xx} ${y+h*.18} C ${xx-w*.05} ${cy-h*.08}, ${xx+w*.05} ${cy+h*.08}, ${xx} ${y+h*.82}" fill="none" stroke="#ef4444" stroke-width="2"/>`;}body=`<ellipse cx="${cx}" cy="${cy}" rx="${w/2}" ry="${h/2}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${spec.biologyShowDetails?cr:''}`;}else if(object.kind==='chloroplast'){let stacks='';for(let i=0;i<object.detailCount;i++){const xx=x+w*(.18+i*.64/Math.max(1,object.detailCount-1));stacks+=`<g stroke="#15803d" stroke-width="2"><line x1="${xx-12}" y1="${cy-16}" x2="${xx+12}" y2="${cy-16}"/><line x1="${xx-14}" y1="${cy-8}" x2="${xx+14}" y2="${cy-8}"/><line x1="${xx-14}" y1="${cy}" x2="${xx+14}" y2="${cy}"/><line x1="${xx-12}" y1="${cy+8}" x2="${xx+12}" y2="${cy+8}"/></g>`;}body=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h/2}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${spec.biologyShowMembranes?`<rect x="${x+6}" y="${y+6}" width="${w-12}" height="${h-12}" rx="${Math.max(6,h/2-6)}" fill="none" stroke="#22c55e" stroke-width="1.5"/>`:''}${spec.biologyShowDetails?stacks:''}`;}else if(object.kind==='vacuole'){body=`<ellipse cx="${cx}" cy="${cy}" rx="${w/2}" ry="${h/2}" fill="${fill}" fill-opacity=".78" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(object.kind==='golgi'){let arcs='';for(let i=0;i<5;i++){const yy=y+15+i*(h-30)/4;arcs+=`<path d="M ${x+w*.12} ${yy} Q ${cx} ${yy+18} ${x+w*.88} ${yy}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1.5,lw)}"/>`;}body=arcs+`<circle cx="${x+w*.9}" cy="${y+h*.25}" r="7" fill="${fill}" stroke="${stroke}"/><circle cx="${x+w*.12}" cy="${y+h*.78}" r="6" fill="${fill}" stroke="${stroke}"/>`;}else if(object.kind==='rough-er'||object.kind==='smooth-er'){let paths='';for(let i=0;i<4;i++){const yy=y+15+i*(h-30)/3;paths+=`<path d="M ${x} ${yy} C ${x+w*.25} ${yy-18}, ${x+w*.45} ${yy+18}, ${x+w*.7} ${yy} S ${x+w*.95} ${yy-8}, ${x+w} ${yy}" fill="none" stroke="${stroke}" stroke-width="2.2"/>`;if(object.kind==='rough-er'&&spec.biologyShowDetails)for(let j=1;j<6;j++)paths+=`<circle cx="${x+w*j/6}" cy="${yy-4}" r="2.5" fill="#334155"/>`;}body=paths;}else if(object.kind==='ribosome'){body=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)/2}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><circle cx="${cx+Math.min(w,h)*.12}" cy="${cy-Math.min(w,h)*.12}" r="${Math.min(w,h)*.14}" fill="#64748b"/>`;}else if(object.kind==='lysosome'){body=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)/2}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${spec.biologyShowDetails?`<path d="M ${cx-10} ${cy} l8 -8 l8 8 l-8 8 z" fill="#fb923c"/>`:''}`;}else if(object.kind==='centriole'){body=`<g transform="rotate(-22 ${cx} ${cy})"><rect x="${x+5}" y="${cy-10}" width="${w*.55}" height="20" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><rect x="${cx-10}" y="${y+5}" width="20" height="${h*.7}" rx="7" fill="#fde68a" stroke="${stroke}" stroke-width="${lw}"/></g>`;}else if(object.kind==='plasmid'){body=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.38}" fill="none" stroke="${stroke}" stroke-width="${lw+1}"/><path d="M ${cx-8} ${cy-18} q18 18 0 36" fill="none" stroke="#84cc16" stroke-width="2"/>`;}else if(object.kind==='flagellum'){body=`<path d="M ${x} ${cy} C ${x+w*.25} ${y-h*.2}, ${x+w*.45} ${y+h*1.2}, ${x+w*.65} ${cy} S ${x+w*.9} ${y-h*.1}, ${x+w} ${cy}" fill="none" stroke="${stroke}" stroke-width="${lw+1}"/>`;}return`<g data-qmx-object="${escapeHtml(object.id)}" transform="rotate(${object.rotation} ${cx} ${cy})">${body}${label}</g>`;}
    function biologyLabelMarkup(spec,object,map){if(!spec.biologyShowLabels)return'';const target=map.get(object.targetId),p=target?biologyPortPoint(target,object.targetPort):{x:object.x,y:object.y+object.height/2},lx=object.x,ly=object.y,w=object.width,h=object.height,nearX=p.x<lx?lx:p.x>lx+w?lx+w:lx+w/2,nearY=p.y<ly?ly:p.y>ly+h?ly+h:ly+h/2;return`<g data-qmx-object="${escapeHtml(object.id)}"><path d="M ${p.x} ${p.y} L ${(p.x+nearX)/2} ${p.y} L ${nearX} ${nearY}" fill="none" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${escapeHtml(object.stroke)}"/><rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="8" fill="${escapeHtml(object.fill)}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"/><text x="${lx+10}" y="${ly+h/2+5}" font-size="13" font-weight="700" fill="${escapeHtml(object.textColor)}">${escapeHtml(object.text)}</text></g>`;}
    function biologyArrowMarkup(object){const dash=object.dashed?' stroke-dasharray="8 6"':'';const label=object.label?`<text x="${(object.x1+object.x2)/2}" y="${(object.y1+object.y2)/2-10}" text-anchor="middle" font-size="13" font-weight="700" fill="${escapeHtml(object.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(object.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(object.id)}"><line x1="${object.x1}" y1="${object.y1}" x2="${object.x2}" y2="${object.y2}" stroke="${escapeHtml(object.stroke)}" stroke-width="${object.lineWidth}"${dash} marker-end="url(#qmx-diagram-arrow)"/>${label}</g>`;}
    function biologicalCellMarkup(spec){const map=new Map(spec.objects.filter((o)=>['biological-cell-boundary','biological-organelle'].includes(o.type)).map((o)=>[o.id,o])),grid=biologyGridMarkup(spec),boundaries=spec.objects.filter((o)=>o.type==='biological-cell-boundary').map((o)=>biologyBoundaryMarkup(spec,o)).join(''),organelles=spec.objects.filter((o)=>o.type==='biological-organelle').map((o)=>biologyOrganelleMarkup(spec,o)).join(''),arrows=spec.objects.filter((o)=>o.type==='biological-arrow').map(biologyArrowMarkup).join(''),labels=spec.objects.filter((o)=>o.type==='biological-label').map((o)=>biologyLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter((o)=>o.type==='text').map(generalObjectMarkup).join('');return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${boundaries}${organelles}${arrows}${labels}${texts}</g>`;}


    function anatomyPortPoint(object,port){const map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},pair=map[port]||map.e;return{x:object.x+object.width*pair[0],y:object.y+object.height*pair[1]};}
    function anatomyGridMarkup(spec){if(!spec.anatomyShowGrid)return'';const step=Math.max(5,Number(spec.gridSize||20));return`<defs><pattern id="qmx-anatomy-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-anatomy-grid)"/>`;}
    function anatomyBodyMarkup(spec,o){if(!spec.anatomyShowBody)return'';const{x,y,width:w,height:h}=o,cx=x+w/2,headR=Math.min(w*.13,h*.08),headY=y+headR+8,neckY=y+h*.19,shoulderY=y+h*.25,hipY=y+h*.62,footY=y+h*.98,fill=escapeHtml(o.fill),stroke=escapeHtml(o.stroke),lw=o.lineWidth;const torso=`M ${cx-w*.18} ${shoulderY} Q ${cx-w*.12} ${neckY} ${cx-w*.08} ${neckY} L ${cx+w*.08} ${neckY} Q ${cx+w*.12} ${neckY} ${cx+w*.18} ${shoulderY} Q ${cx+w*.22} ${y+h*.42} ${cx+w*.15} ${hipY} L ${cx-w*.15} ${hipY} Q ${cx-w*.22} ${y+h*.42} ${cx-w*.18} ${shoulderY} Z`;const arms=`<path d="M ${cx-w*.17} ${shoulderY+8} L ${x+w*.08} ${y+h*.55} L ${x+w*.02} ${y+h*.76} M ${cx+w*.17} ${shoulderY+8} L ${x+w*.92} ${y+h*.55} L ${x+w*.98} ${y+h*.76}" fill="none" stroke="${stroke}" stroke-width="${lw*1.3}" stroke-linecap="round"/>`;const legs=`<path d="M ${cx-w*.1} ${hipY} L ${cx-w*.15} ${y+h*.8} L ${cx-w*.18} ${footY} M ${cx+w*.1} ${hipY} L ${cx+w*.15} ${y+h*.8} L ${cx+w*.18} ${footY}" fill="none" stroke="${stroke}" stroke-width="${lw*1.4}" stroke-linecap="round"/>`;const back=o.kind==='back'?`<path d="M ${cx} ${neckY} L ${cx} ${hipY}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6 5"/>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><circle cx="${cx}" cy="${headY}" r="${headR}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="${torso}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${arms}${legs}${back}<text x="${cx}" y="${y+18}" text-anchor="middle" font-size="14" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function anatomyOrganMarkup(spec,o){const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,fill=escapeHtml(o.fill),stroke=escapeHtml(o.stroke),lw=o.lineWidth,label=o.label?`<text x="${cx}" y="${y+h+16}" text-anchor="middle" font-size="11" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`:'';let body='';if(o.kind==='brain'){body=`<path d="M ${x+w*.16} ${cy} C ${x+w*.05} ${y+h*.18},${x+w*.22} ${y+h*.02},${cx} ${y+h*.12} C ${x+w*.76} ${y},${x+w*.96} ${y+h*.25},${x+w*.83} ${cy} C ${x+w*.98} ${y+h*.72},${x+w*.68} ${y+h*.98},${cx} ${y+h*.82} C ${x+w*.28} ${y+h*.98},${x+w*.02} ${y+h*.72},${x+w*.16} ${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${spec.anatomyShowDetails?`<path d="M ${cx} ${y+h*.12} Q ${cx-w*.08} ${cy} ${cx} ${y+h*.82} M ${x+w*.28} ${y+h*.25} Q ${x+w*.42} ${cy} ${x+w*.3} ${y+h*.72} M ${x+w*.72} ${y+h*.25} Q ${x+w*.58} ${cy} ${x+w*.7} ${y+h*.72}" fill="none" stroke="${stroke}" stroke-width="1.2"/>`:''}`;}else if(o.kind==='heart'){body=`<path d="M ${cx} ${y+h*.94} C ${x-w*.02} ${y+h*.5},${x+w*.05} ${y+h*.12},${x+w*.32} ${y+h*.14} C ${x+w*.48} ${y+h*.15},${cx} ${y+h*.3},${cx} ${y+h*.3} C ${cx} ${y+h*.3},${x+w*.55} ${y+h*.12},${x+w*.72} ${y+h*.14} C ${x+w*.98} ${y+h*.17},${x+w*1.02} ${y+h*.52},${cx} ${y+h*.94} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='lung'){body=`<path d="M ${cx} ${y+h*.05} C ${x+w*.15} ${y+h*.18},${x+w*.05} ${y+h*.55},${x+w*.18} ${y+h*.88} C ${x+w*.35} ${y+h*1.02},${x+w*.58} ${y+h*.9},${x+w*.58} ${y+h*.62} L ${x+w*.55} ${y+h*.18} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${spec.anatomyShowDetails?`<path d="M ${cx} ${y+h*.15} L ${x+w*.34} ${y+h*.44} M ${x+w*.34} ${y+h*.44} L ${x+w*.22} ${y+h*.64} M ${x+w*.34} ${y+h*.44} L ${x+w*.45} ${y+h*.68}" stroke="${stroke}" stroke-width="1.5" fill="none"/>`:''}`;}else if(o.kind==='liver'){body=`<path d="M ${x+w*.04} ${y+h*.5} Q ${x+w*.15} ${y+h*.08} ${x+w*.62} ${y+h*.1} Q ${x+w*.97} ${y+h*.15} ${x+w*.96} ${y+h*.48} Q ${x+w*.9} ${y+h*.85} ${x+w*.42} ${y+h*.92} Q ${x+w*.1} ${y+h*.88} ${x+w*.04} ${y+h*.5} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='stomach'){body=`<path d="M ${x+w*.55} ${y} C ${x+w*.48} ${y+h*.22},${x+w*.75} ${y+h*.22},${x+w*.72} ${y+h*.5} C ${x+w*.68} ${y+h*.88},${x+w*.22} ${y+h},${x+w*.1} ${y+h*.68} C ${x-w*.02} ${y+h*.38},${x+w*.22} ${y+h*.22},${x+w*.42} ${y+h*.35} L ${x+w*.45} ${y} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='kidney'){body=`<path d="M ${cx} ${y+h*.05} C ${x+w*.05} ${y+h*.02},${x-w*.05} ${y+h*.45},${x+w*.12} ${y+h*.76} C ${x+w*.3} ${y+h*1.04},${x+w*.68} ${y+h*.94},${x+w*.68} ${y+h*.64} C ${x+w*.67} ${y+h*.45},${x+w*.48} ${y+h*.5},${x+w*.48} ${y+h*.34} C ${x+w*.48} ${y+h*.2},${x+w*.75} ${y+h*.12},${cx} ${y+h*.05} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='intestine'){let coil='';for(let i=0;i<4;i++){const yy=y+h*(.25+i*.16);coil+=`<path d="M ${x+w*.18} ${yy} C ${x+w*.38} ${yy-h*.08},${x+w*.62} ${yy+h*.08},${x+w*.82} ${yy}" fill="none" stroke="${stroke}" stroke-width="2"/>`;}body=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w,h)*.18}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${spec.anatomyShowDetails?coil:''}`;}else if(o.kind==='pancreas'){body=`<path d="M ${x+w*.05} ${cy} C ${x+w*.2} ${y+h*.05},${x+w*.78} ${y+h*.08},${x+w*.95} ${cy} C ${x+w*.78} ${y+h*.92},${x+w*.2} ${y+h*.95},${x+w*.05} ${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='bladder'){body=`<path d="M ${cx} ${y} C ${x+w*.85} ${y+h*.18},${x+w*.94} ${y+h*.66},${cx} ${y+h*.92} C ${x+w*.06} ${y+h*.66},${x+w*.15} ${y+h*.18},${cx} ${y} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><line x1="${cx}" y1="${y+h*.9}" x2="${cx}" y2="${y+h}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='trachea'){let rings='';for(let i=1;i<8;i++){const yy=y+h*i/9;rings+=`<line x1="${x+w*.18}" y1="${yy}" x2="${x+w*.82}" y2="${yy}" stroke="${stroke}" stroke-width="1.4"/>`;}body=`<rect x="${x+w*.18}" y="${y}" width="${w*.64}" height="${h}" rx="${w*.22}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${rings}`;}else if(o.kind==='esophagus'){body=`<path d="M ${cx} ${y} C ${x+w*.2} ${y+h*.28},${x+w*.8} ${y+h*.58},${cx} ${y+h}" fill="none" stroke="${stroke}" stroke-width="${Math.max(5,w*.35)}" stroke-linecap="round"/><path d="M ${cx} ${y} C ${x+w*.2} ${y+h*.28},${x+w*.8} ${y+h*.58},${cx} ${y+h}" fill="none" stroke="${fill}" stroke-width="${Math.max(2,w*.18)}" stroke-linecap="round"/>`;}else if(o.kind==='spinal-cord'){let nodes='';for(let i=0;i<12;i++){const yy=y+h*(i+.5)/12;nodes+=`<circle cx="${cx}" cy="${yy}" r="${Math.max(2,w*.12)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;}body=`<path d="M ${cx} ${y} L ${cx} ${y+h}" stroke="${stroke}" stroke-width="${Math.max(4,w*.22)}" stroke-linecap="round"/>${nodes}`;}else if(o.kind==='thyroid'){body=`<path d="M ${cx} ${cy} C ${x+w*.2} ${y-h*.05},${x} ${y+h*.15},${x+w*.18} ${y+h*.72} C ${x+w*.32} ${y+h},${cx} ${y+h*.78},${cx} ${cy} C ${x+w*.68} ${y+h},${x+w*.88} ${y+h},${x+w*.82} ${y+h*.72} C ${x+w} ${y+h*.15},${x+w*.8} ${y-h*.05},${cx} ${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='skeleton'){const r=Math.min(w*.14,h*.075);body=`<circle cx="${cx}" cy="${y+r+5}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${cx} ${y+2*r+10} L ${cx} ${y+h*.6} M ${cx-w*.25} ${y+h*.28} L ${cx+w*.25} ${y+h*.28} M ${cx-w*.25} ${y+h*.28} L ${x+w*.05} ${y+h*.56} M ${cx+w*.25} ${y+h*.28} L ${x+w*.95} ${y+h*.56} M ${cx} ${y+h*.6} L ${cx-w*.2} ${y+h*.96} M ${cx} ${y+h*.6} L ${cx+w*.2} ${y+h*.96}" fill="none" stroke="${stroke}" stroke-width="${lw*1.5}" stroke-linecap="round"/><ellipse cx="${cx}" cy="${y+h*.42}" rx="${w*.18}" ry="${h*.13}" fill="none" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='bone'){body=`<path d="M ${x+w*.15} ${cy} C ${x-w*.02} ${y+h*.1},${x-w*.02} ${y+h*.9},${x+w*.15} ${cy} L ${x+w*.85} ${cy} C ${x+w*1.02} ${y+h*.9},${x+w*1.02} ${y+h*.1},${x+w*.85} ${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='joint'){body=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.42}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x+w*.08} ${cy} L ${x+w*.92} ${cy} M ${cx} ${y+h*.08} L ${cx} ${y+h*.92}" stroke="${stroke}" stroke-width="1.5"/>`;}else if(o.kind==='diaphragm'){body=`<path d="M ${x} ${y+h*.8} Q ${cx} ${y-h*.25} ${x+w} ${y+h*.8}" fill="${fill}" fill-opacity=".45" stroke="${stroke}" stroke-width="${lw}"/>`;}else{body=`<ellipse cx="${cx}" cy="${cy}" rx="${w/2}" ry="${h/2}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}
        return`<g data-qmx-object="${escapeHtml(o.id)}" transform="rotate(${o.rotation} ${cx} ${cy})">${body}${label}</g>`;}
    function anatomyLabelMarkup(spec,o,map){if(!spec.anatomyShowLabels)return'';const target=map.get(o.targetId),p=target?anatomyPortPoint(target,o.targetPort):{x:o.x,y:o.y+o.height/2},lx=o.x,ly=o.y,w=o.width,h=o.height,nearX=p.x<lx?lx:p.x>lx+w?lx+w:lx+w/2,nearY=p.y<ly?ly:p.y>ly+h?ly+h:ly+h/2;return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="M ${p.x} ${p.y} L ${(p.x+nearX)/2} ${p.y} L ${nearX} ${nearY}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${escapeHtml(o.stroke)}"/><rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="8" fill="${escapeHtml(o.fill)}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${lx+10}" y="${ly+h/2+5}" font-size="13" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.text)}</text></g>`;}
    function anatomyLineMarkup(o,arrow=false){const dash=o.dashed?' stroke-dasharray="8 6"':'',marker=arrow?' marker-end="url(#qmx-diagram-arrow)"':'',label=o.label?`<text x="${(o.x1+o.x2)/2}" y="${(o.y1+o.y2)/2-10}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}${marker} stroke-linecap="round"/>${label}</g>`;}
    function humanAnatomyMarkup(spec){const map=new Map(spec.objects.filter((o)=>['anatomy-body','anatomy-organ'].includes(o.type)).map((o)=>[o.id,o])),grid=anatomyGridMarkup(spec),bodies=spec.objects.filter((o)=>o.type==='anatomy-body').map((o)=>anatomyBodyMarkup(spec,o)).join(''),organs=spec.objects.filter((o)=>o.type==='anatomy-organ').map((o)=>anatomyOrganMarkup(spec,o)).join(''),vessels=spec.objects.filter((o)=>o.type==='anatomy-vessel').map((o)=>anatomyLineMarkup(o,false)).join(''),arrows=spec.objects.filter((o)=>o.type==='anatomy-arrow').map((o)=>anatomyLineMarkup(o,true)).join(''),labels=spec.objects.filter((o)=>o.type==='anatomy-label').map((o)=>anatomyLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter((o)=>o.type==='text').map(generalObjectMarkup).join('');return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${bodies}${vessels}${organs}${arrows}${labels}${texts}</g>`;}





    function botanyPortPoint(object,port){const map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},pair=map[port]||map.e;return{x:object.x+object.width*pair[0],y:object.y+object.height*pair[1]};}
    function botanyGridMarkup(spec){if(!spec.botanyShowGrid)return'';const step=Math.max(5,Number(spec.gridSize||20));return`<defs><pattern id="qmx-botany-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-botany-grid)"/>`;}
    function botanyBodyMarkup(spec,o){if(!spec.botanyShowBody)return'';const{x,y,width:w,height:h}=o,cx=x+w/2,fill=escapeHtml(o.fill),stroke=escapeHtml(o.stroke),lw=o.lineWidth;let body='';if(o.kind==='root-system'){let roots=`<path d="M ${cx} ${y+30} C ${cx-10} ${y+h*.35},${cx+20} ${y+h*.6},${cx} ${y+h*.96}" fill="none" stroke="${stroke}" stroke-width="${lw*3}" stroke-linecap="round"/>`;for(let i=0;i<8;i++){const yy=y+h*(.18+i*.09),side=i%2?-1:1,dx=w*(.18+.03*i);roots+=`<path d="M ${cx} ${yy} Q ${cx+side*dx*.55} ${yy+h*.06} ${cx+side*dx} ${yy+h*.16}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1.5,lw*1.3)}" stroke-linecap="round"/>`;}body=`<g>${roots}<ellipse cx="${cx}" cy="${y+28}" rx="${w*.13}" ry="${h*.04}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/></g>`;}else{const ground=y+h*.68,stemTop=y+h*.12;let leaves='';[[cx-w*.2,y+h*.28,-25],[cx+w*.18,y+h*.35,25],[cx-w*.22,y+h*.46,-20],[cx+w*.2,y+h*.54,20]].forEach(([lx,ly,rot])=>{leaves+=`<path d="M ${lx} ${ly} C ${lx-45} ${ly-30},${lx-70} ${ly+20},${lx} ${ly+38} C ${lx+35} ${ly+20},${lx+35} ${ly-15},${lx} ${ly} Z" fill="#bbf7d0" stroke="${stroke}" stroke-width="${lw}" transform="rotate(${rot} ${lx} ${ly})"/>`;});let flower='';for(let i=0;i<6;i++){const a=i*Math.PI/3,px=cx+Math.cos(a)*34,py=stemTop+Math.sin(a)*34;flower+=`<ellipse cx="${px}" cy="${py}" rx="18" ry="30" fill="#f9a8d4" stroke="#be185d" stroke-width="1.6" transform="rotate(${i*60+90} ${px} ${py})"/>`;}flower+=`<circle cx="${cx}" cy="${stemTop}" r="17" fill="#fde047" stroke="#a16207" stroke-width="2"/>`;let roots='';for(let i=-3;i<=3;i++){const ex=cx+i*w*.07;roots+=`<path d="M ${cx} ${ground} Q ${ex} ${ground+h*.12} ${ex+i*14} ${y+h*.96}" fill="none" stroke="#92400e" stroke-width="${Math.max(1.5,lw)}"/>`;}body=`<path d="M ${cx} ${ground} L ${cx} ${stemTop+28}" stroke="${stroke}" stroke-width="${lw*3}" stroke-linecap="round"/>${leaves}${flower}<line x1="${x+w*.05}" y1="${ground}" x2="${x+w*.95}" y2="${ground}" stroke="#78716c" stroke-width="2"/>${roots}`;}return`<g data-qmx-object="${escapeHtml(o.id)}">${body}<text x="${cx}" y="${y+18}" text-anchor="middle" font-size="14" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function botanyOrganMarkup(spec,o){const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,fill=escapeHtml(o.fill),stroke=escapeHtml(o.stroke),lw=o.lineWidth,label=o.label?`<text x="${cx}" y="${y+h+16}" text-anchor="middle" font-size="11" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`:'';let b='';if(o.kind==='leaf'){b=`<path d="M ${x} ${cy} C ${x+w*.25} ${y-h*.1},${x+w*.82} ${y},${x+w} ${cy} C ${x+w*.72} ${y+h*1.05},${x+w*.22} ${y+h},${x} ${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x+w*.08} ${cy} L ${x+w*.92} ${cy}" stroke="${stroke}" stroke-width="1.5"/>`;}else if(o.kind==='flower'){let p='';for(let i=0;i<6;i++){const a=i*Math.PI/3,px=cx+Math.cos(a)*w*.28,py=cy+Math.sin(a)*h*.28;p+=`<ellipse cx="${px}" cy="${py}" rx="${w*.18}" ry="${h*.32}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}" transform="rotate(${i*60+90} ${px} ${py})"/>`;}b=p+`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.16}" fill="#fde047" stroke="#a16207" stroke-width="2"/>`;}else if(o.kind==='fruit'){b=`<ellipse cx="${cx}" cy="${cy+h*.05}" rx="${w*.42}" ry="${h*.43}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${cx} ${y+h*.08} Q ${cx+w*.18} ${y-h*.06} ${cx+w*.28} ${y+h*.08}" fill="none" stroke="#15803d" stroke-width="3"/>`;}else if(o.kind==='seed'){b=`<path d="M ${x+w*.08} ${cy} C ${x+w*.02} ${y+h*.1},${x+w*.55} ${y-h*.05},${x+w*.9} ${y+h*.28} C ${x+w*1.02} ${y+h*.75},${x+w*.55} ${y+h*1.05},${x+w*.15} ${y+h*.82} C ${x-w*.02} ${y+h*.68},${x-w*.02} ${y+h*.38},${x+w*.08} ${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='root-tip'){b=`<path d="M ${cx} ${y} C ${x+w*.15} ${y+h*.38},${x+w*.18} ${y+h*.72},${cx} ${y+h} C ${x+w*.82} ${y+h*.72},${x+w*.85} ${y+h*.38},${cx} ${y} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${spec.botanyShowDetails?`<path d="M ${x+w*.2} ${y+h*.35} L ${x+w*.8} ${y+h*.35} M ${x+w*.25} ${y+h*.58} L ${x+w*.75} ${y+h*.58} M ${x+w*.32} ${y+h*.78} L ${x+w*.68} ${y+h*.78}" stroke="${stroke}" stroke-width="1.2"/>`:''}`;}else if(o.kind==='root-hair'){let hairs='';for(let i=1;i<12;i++){const yy=y+h*i/13;hairs+=`<path d="M ${cx} ${yy} Q ${x+w*.15} ${yy-8} ${x+w*.02} ${yy+((i%2)?12:-12)} M ${cx} ${yy} Q ${x+w*.85} ${yy+8} ${x+w*.98} ${yy+((i%2)?-12:12)}" fill="none" stroke="${stroke}" stroke-width="1.2"/>`;}b=`<rect x="${cx-w*.06}" y="${y}" width="${w*.12}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${hairs}`;}else if(o.kind==='stem-section'){let bundles='';const n=Math.max(5,o.detailCount);for(let i=0;i<n;i++){const a=i*2*Math.PI/n,bx=cx+Math.cos(a)*w*.34,by=cy+Math.sin(a)*h*.34;bundles+=`<ellipse cx="${bx}" cy="${by}" rx="${w*.055}" ry="${h*.075}" fill="#bae6fd" stroke="#0369a1" stroke-width="1.5"/>`;}b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.47}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.31}" fill="#fef9c3" stroke="#84cc16" stroke-width="1.5"/>${bundles}`;}else if(o.kind==='leaf-section'){const layer=h/7;b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#f0fdf4" stroke="${stroke}" stroke-width="${lw}"/><rect x="${x+8}" y="${y+8}" width="${w-16}" height="${layer}" fill="#86efac"/><rect x="${x+8}" y="${y+8+layer}" width="${w-16}" height="${layer*2}" fill="#bbf7d0"/><rect x="${x+8}" y="${y+8+layer*3}" width="${w-16}" height="${layer*2.4}" fill="#dcfce7"/><rect x="${x+8}" y="${y+h-layer-8}" width="${w-16}" height="${layer}" fill="#86efac"/><ellipse cx="${cx}" cy="${cy}" rx="${w*.12}" ry="${h*.13}" fill="#bae6fd" stroke="#0369a1" stroke-width="2"/>`;}else if(o.kind==='flower-section'){b=`<path d="M ${cx} ${y+h*.1} L ${cx} ${y+h*.72}" stroke="#be185d" stroke-width="5"/><ellipse cx="${cx}" cy="${y+h*.75}" rx="${w*.16}" ry="${h*.13}" fill="#bbf7d0" stroke="#15803d" stroke-width="2"/><ellipse cx="${x+w*.25}" cy="${y+h*.38}" rx="${w*.18}" ry="${h*.3}" fill="#f9a8d4" stroke="#be185d" stroke-width="2" transform="rotate(-28 ${x+w*.25} ${y+h*.38})"/><ellipse cx="${x+w*.75}" cy="${y+h*.38}" rx="${w*.18}" ry="${h*.3}" fill="#f9a8d4" stroke="#be185d" stroke-width="2" transform="rotate(28 ${x+w*.75} ${y+h*.38})"/><circle cx="${cx}" cy="${y+h*.08}" r="${w*.055}" fill="#fef08a" stroke="#a16207" stroke-width="2"/>`;}else if(o.kind==='xylem'||o.kind==='phloem'){let cells='';const n=Math.max(3,o.detailCount);for(let i=0;i<n;i++){const xx=x+w*(i+.5)/n;cells+=`<rect x="${xx-w*.035}" y="${y+8}" width="${w*.07}" height="${h-16}" rx="${o.kind==='xylem'?8:3}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;}b=cells;}else if(o.kind==='cambium'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.42}" fill="none" stroke="${stroke}" stroke-width="${Math.max(5,lw*2)}" stroke-dasharray="8 4"/>`;}else if(o.kind==='vascular-bundle'){b=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.45}" ry="${h*.42}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x+w*.15} ${cy} Q ${cx} ${y+h*.1} ${x+w*.85} ${cy}" fill="#bae6fd" stroke="#0284c7" stroke-width="1.5"/><path d="M ${x+w*.18} ${cy} Q ${cx} ${y+h*.9} ${x+w*.82} ${cy}" fill="#fef08a" stroke="#ca8a04" stroke-width="1.5"/>`;}else if(o.kind==='pith'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.43}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${spec.botanyShowDetails?`<path d="M ${x+w*.2} ${cy} H ${x+w*.8} M ${cx} ${y+h*.2} V ${y+h*.8}" stroke="${stroke}" opacity=".5"/>`:''}`;}else if(o.kind==='meristem'){let cells='';for(let r=0;r<4;r++)for(let c=0;c<5;c++)cells+=`<circle cx="${x+15+c*(w-30)/4}" cy="${y+15+r*(h-30)/3}" r="8" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;b=cells;}else if(o.kind==='stomata'||o.kind==='guard-cell'){b=`<path d="M ${cx-10} ${cy} C ${x} ${y+h*.05},${x} ${y+h*.95},${cx-10} ${cy} C ${x+w*.35} ${y+h*.7},${x+w*.35} ${y+h*.3},${cx-10} ${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${cx+10} ${cy} C ${x+w} ${y+h*.05},${x+w} ${y+h*.95},${cx+10} ${cy} C ${x+w*.65} ${y+h*.7},${x+w*.65} ${y+h*.3},${cx+10} ${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><ellipse cx="${cx}" cy="${cy}" rx="8" ry="${h*.28}" fill="#fff" stroke="#047857" stroke-width="1.5"/>`;}else if(o.kind==='anther'){b=`<ellipse cx="${cx-w*.18}" cy="${cy}" rx="${w*.22}" ry="${h*.38}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><ellipse cx="${cx+w*.18}" cy="${cy}" rx="${w*.22}" ry="${h*.38}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='filament'||o.kind==='style'||o.kind==='radicle'||o.kind==='plumule'){b=`<path d="M ${cx} ${y} C ${x+w*.15} ${cy},${x+w*.85} ${cy},${cx} ${y+h}" fill="none" stroke="${stroke}" stroke-width="${Math.max(4,lw*2)}" stroke-linecap="round"/>`;}else if(o.kind==='stigma'){b=`<path d="M ${x+w*.1} ${cy} Q ${cx} ${y-h*.15} ${x+w*.9} ${cy} Q ${cx} ${y+h*1.15} ${x+w*.1} ${cy} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='ovary'){b=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.43}" ry="${h*.44}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>${spec.botanyShowDetails?`<circle cx="${cx-w*.14}" cy="${cy}" r="8" fill="#fde68a"/><circle cx="${cx+w*.14}" cy="${cy}" r="8" fill="#fde68a"/>`:''}`;}else if(o.kind==='ovule'){b=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.4}" ry="${h*.38}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else if(o.kind==='petal'||o.kind==='sepal'||o.kind==='cotyledon'){b=`<path d="M ${cx} ${y} C ${x-w*.05} ${y+h*.25},${x+w*.05} ${y+h*.75},${cx} ${y+h} C ${x+w*.95} ${y+h*.75},${x+w*1.05} ${y+h*.25},${cx} ${y} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}else{b=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.44}" ry="${h*.42}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}return`<g data-qmx-object="${escapeHtml(o.id)}" transform="rotate(${o.rotation} ${cx} ${cy})">${b}${label}</g>`;}
    function botanyLabelMarkup(spec,o,map){if(!spec.botanyShowLabels)return'';const target=map.get(o.targetId),p=target?botanyPortPoint(target,o.targetPort):{x:o.x,y:o.y+o.height/2},lx=o.x,ly=o.y,w=o.width,h=o.height,nearX=p.x<lx?lx:p.x>lx+w?lx+w:lx+w/2,nearY=p.y<ly?ly:p.y>ly+h?ly+h:ly+h/2;return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="M ${p.x} ${p.y} L ${(p.x+nearX)/2} ${p.y} L ${nearX} ${nearY}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${escapeHtml(o.stroke)}"/><rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="8" fill="${escapeHtml(o.fill)}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${lx+10}" y="${ly+h/2+5}" font-size="13" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.text)}</text></g>`;}
    function botanyLineMarkup(o,arrow=false){const dash=o.dashed?' stroke-dasharray="8 6"':'',marker=arrow?' marker-end="url(#qmx-diagram-arrow)"':'',label=o.label?`<text x="${(o.x1+o.x2)/2}" y="${(o.y1+o.y2)/2-10}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}${marker} stroke-linecap="round"/>${label}</g>`;}
    function plantAnatomyMarkup(spec){const map=new Map(spec.objects.filter((o)=>['botany-body','botany-organ'].includes(o.type)).map((o)=>[o.id,o])),grid=botanyGridMarkup(spec),bodies=spec.objects.filter((o)=>o.type==='botany-body').map((o)=>botanyBodyMarkup(spec,o)).join(''),organs=spec.objects.filter((o)=>o.type==='botany-organ').map((o)=>botanyOrganMarkup(spec,o)).join(''),vessels=spec.objects.filter((o)=>o.type==='botany-vessel').map((o)=>botanyLineMarkup(o,false)).join(''),arrows=spec.objects.filter((o)=>o.type==='botany-arrow').map((o)=>botanyLineMarkup(o,true)).join(''),labels=spec.objects.filter((o)=>o.type==='botany-label').map((o)=>botanyLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter((o)=>o.type==='text').map(generalObjectMarkup).join('');return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${bodies}${vessels}${organs}${arrows}${labels}${texts}</g>`;}






    function ecologyPortPoint(object,port){const map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},pair=map[port]||map.e;return{x:object.x+object.width*pair[0],y:object.y+object.height*pair[1]};}
    function ecologyGridMarkup(spec){if(!spec.ecologyShowGrid)return'';const step=Math.max(5,Number(spec.gridSize||20));return`<defs><pattern id="qmx-ecology-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-ecology-grid)"/>`;}
    function ecologyNodeIcon(o){const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,s=escapeHtml(o.stroke),f=escapeHtml(o.fill),lw=o.lineWidth;const label=`<text x="${cx}" y="${y+h+16}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;let b='';if(o.kind==='sun'){let rays='';for(let i=0;i<12;i++){const a=i*Math.PI/6;rays+=`<line x1="${cx+Math.cos(a)*w*.34}" y1="${cy+Math.sin(a)*h*.34}" x2="${cx+Math.cos(a)*w*.48}" y2="${cy+Math.sin(a)*h*.48}" stroke="${s}" stroke-width="3"/>`;}b=`${rays}<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.27}" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}else if(o.kind==='tree'){b=`<rect x="${cx-w*.08}" y="${y+h*.48}" width="${w*.16}" height="${h*.46}" rx="4" fill="#92400e"/><circle cx="${cx}" cy="${y+h*.3}" r="${Math.min(w,h)*.26}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${x+w*.35}" cy="${y+h*.38}" r="${Math.min(w,h)*.18}" fill="${f}" stroke="${s}"/><circle cx="${x+w*.65}" cy="${y+h*.38}" r="${Math.min(w,h)*.18}" fill="${f}" stroke="${s}"/>`;}else if(o.kind==='grass'||o.kind==='producer'){let blades='';for(let i=0;i<8;i++){const xx=x+w*(.12+i*.11);blades+=`<path d="M ${xx} ${y+h*.82} Q ${xx+(i%2?12:-12)} ${y+h*.35} ${xx+(i%2?18:-18)} ${y+h*.15}" fill="none" stroke="${s}" stroke-width="4" stroke-linecap="round"/>`;}b=blades;}else if(o.kind==='water'){b=`<path d="M ${x+8} ${cy} Q ${x+w*.25} ${cy-h*.18} ${x+w*.5} ${cy} T ${x+w-8} ${cy}" fill="none" stroke="${s}" stroke-width="5"/><path d="M ${x+8} ${cy+h*.18} Q ${x+w*.25} ${cy} ${x+w*.5} ${cy+h*.18} T ${x+w-8} ${cy+h*.18}" fill="none" stroke="${s}" stroke-width="4"/>`;}else if(o.kind==='cloud'){b=`<path d="M ${x+w*.18} ${y+h*.7} C ${x+w*.03} ${y+h*.7},${x+w*.03} ${y+h*.48},${x+w*.2} ${y+h*.46} C ${x+w*.2} ${y+h*.2},${x+w*.48} ${y+h*.15},${x+w*.58} ${y+h*.35} C ${x+w*.78} ${y+h*.28},${x+w*.94} ${y+h*.42},${x+w*.86} ${y+h*.64} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}else if(o.kind==='soil'){b=`<rect x="${x}" y="${y+h*.38}" width="${w}" height="${h*.52}" rx="10" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;for(let i=0;i<10;i++)b+=`<circle cx="${x+w*(.08+(i%5)*.2)}" cy="${y+h*(.5+Math.floor(i/5)*.22)}" r="4" fill="#78350f" opacity=".55"/>`;}else if(o.kind==='fish'){b=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.3}" ry="${h*.25}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><polygon points="${x+w*.15},${cy} ${x},${y+h*.2} ${x},${y+h*.8}" fill="${f}" stroke="${s}"/><circle cx="${x+w*.62}" cy="${y+h*.44}" r="3" fill="#0f172a"/>`;}else if(o.kind==='bird'||o.kind==='hawk'){b=`<path d="M ${x+w*.08} ${cy} Q ${x+w*.28} ${y+h*.2} ${cx} ${cy} Q ${x+w*.72} ${y+h*.2} ${x+w*.92} ${cy} Q ${x+w*.72} ${y+h*.42} ${cx} ${cy} Q ${x+w*.28} ${y+h*.42} ${x+w*.08} ${cy}" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}else if(o.kind==='snake'){b=`<path d="M ${x+w*.08} ${y+h*.72} C ${x+w*.25} ${y+h*.15},${x+w*.48} ${y+h*.85},${x+w*.68} ${y+h*.3} S ${x+w*.93} ${y+h*.55} ${x+w*.9} ${y+h*.52}" fill="none" stroke="${s}" stroke-width="${Math.max(8,h*.15)}" stroke-linecap="round"/><circle cx="${x+w*.9}" cy="${y+h*.52}" r="${h*.12}" fill="${f}" stroke="${s}"/>`;}else if(o.kind==='bacteria'){b=`<rect x="${x+w*.15}" y="${y+h*.25}" width="${w*.7}" height="${h*.5}" rx="${h*.25}" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;for(let i=0;i<5;i++)b+=`<line x1="${x+w*(.25+i*.12)}" y1="${y+h*.25}" x2="${x+w*(.2+i*.13)}" y2="${y+h*.05}" stroke="${s}"/>`;}else if(o.kind==='fungi'||o.kind==='decomposer'){b=`<path d="M ${cx-w*.06} ${y+h*.48} H ${cx+w*.06} L ${cx+w*.1} ${y+h*.88} H ${cx-w*.1} Z" fill="#fef3c7" stroke="${s}"/><path d="M ${x+w*.2} ${y+h*.48} Q ${cx} ${y+h*.05} ${x+w*.8} ${y+h*.48} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}else if(o.kind==='algae'){for(let i=0;i<6;i++)b+=`<circle cx="${x+w*(.18+(i%3)*.3)}" cy="${y+h*(.28+Math.floor(i/3)*.36)}" r="${Math.min(w,h)*.12}" fill="${f}" stroke="${s}"/>`;}else{b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(18,h*.22)}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><text x="${cx}" y="${cy+6}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;return`<g data-qmx-object="${escapeHtml(o.id)}">${b}${specTrophic(o)}</g>`;}return`<g data-qmx-object="${escapeHtml(o.id)}">${b}${label}${specTrophic(o)}</g>`;}
    function specTrophic(o){return'';}
    function ecologyZoneMarkup(spec,o){if(!spec.ecologyShowZones)return'';const dash=o.dashed?' stroke-dasharray="10 7"':'';return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="18" fill="${escapeHtml(o.fill)}" fill-opacity=".55" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}/><text x="${o.x+14}" y="${o.y+24}" font-size="15" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function ecologyPyramidMarkup(spec,o){const rows=String(o.levels||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{const p=line.split('|');return{label:(p[0]||'Level').trim(),value:(p.slice(1).join('|')||'').trim()};});const levels=rows.length?rows:[{label:'Producers',value:'10000'}],n=levels.length,base=o.width*.92,top=o.width*.28,lh=o.height*.78/n,cx=o.x+o.width/2,startY=o.y+o.height*.15;let b=`<text x="${cx}" y="${o.y+24}" text-anchor="middle" font-size="18" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text>`;for(let i=0;i<n;i++){const rev=n-1-i,w1=top+(base-top)*(rev/n),w2=top+(base-top)*((rev+1)/n),y1=startY+i*lh,y2=y1+lh,colors=['#fee2e2','#fef3c7','#dcfce7','#dbeafe','#ede9fe'];b+=`<polygon points="${cx-w1/2},${y1} ${cx+w1/2},${y1} ${cx+w2/2},${y2} ${cx-w2/2},${y2}" fill="${colors[i%colors.length]}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${cx}" y="${(y1+y2)/2-2}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(levels[i].label)}</text><text x="${cx}" y="${(y1+y2)/2+16}" text-anchor="middle" font-size="12" fill="${escapeHtml(o.textColor)}">${escapeHtml(levels[i].value)}${o.unit?' '+escapeHtml(o.unit):''}</text>`;}return`<g data-qmx-object="${escapeHtml(o.id)}">${b}</g>`;}
    function ecologyOrthogonalPath(a,b){const mx=(a.x+b.x)/2;return`M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;}
    function ecologyLinkMarkup(spec,o,map){const source=map.get(o.sourceId),target=map.get(o.targetId),a=source?ecologyPortPoint(source,o.sourcePort):{x:o.x1,y:o.y1},b=target?ecologyPortPoint(target,o.targetPort):{x:o.x2,y:o.y2},dash=o.dashed?' stroke-dasharray="8 6"':'',marker=o.showArrow?' marker-end="url(#qmx-diagram-arrow)"':'',path=ecologyOrthogonalPath(a,b),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};const suffix=spec.ecologyShowEnergy&&o.energy?` (${escapeHtml(o.energy)})`:'';const label=o.label?`<text x="${mid.x}" y="${mid.y-9}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}${suffix}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="${path}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}${marker} stroke-linejoin="round"/>${label}</g>`;}
    function ecologyLabelMarkup(spec,o,map){if(!spec.ecologyShowLabels)return'';const target=map.get(o.targetId),p=target?ecologyPortPoint(target,o.targetPort):{x:o.x,y:o.y+o.height/2},lx=o.x,ly=o.y,w=o.width,h=o.height,nearX=p.x<lx?lx:p.x>lx+w?lx+w:lx+w/2,nearY=p.y<ly?ly:p.y>ly+h?ly+h:ly+h/2;return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="M ${p.x} ${p.y} L ${(p.x+nearX)/2} ${p.y} L ${nearX} ${nearY}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${escapeHtml(o.stroke)}"/><rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="8" fill="${escapeHtml(o.fill)}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${lx+10}" y="${ly+h/2+5}" font-size="13" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.text)}</text></g>`;}
    function ecologyArrowMarkup(o){const dash=o.dashed?' stroke-dasharray="8 6"':'',label=o.label?`<text x="${(o.x1+o.x2)/2}" y="${(o.y1+o.y2)/2-10}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash} marker-end="url(#qmx-diagram-arrow)"/>${label}</g>`;}
    function ecologyMarkup(spec){const targets=spec.objects.filter(o=>['ecology-node','ecology-zone','ecology-pyramid'].includes(o.type)),map=new Map(targets.map(o=>[o.id,o])),grid=ecologyGridMarkup(spec),zones=spec.objects.filter(o=>o.type==='ecology-zone').map(o=>ecologyZoneMarkup(spec,o)).join(''),links=spec.objects.filter(o=>o.type==='ecology-link').map(o=>ecologyLinkMarkup(spec,o,map)).join(''),nodes=spec.objects.filter(o=>o.type==='ecology-node').map(o=>ecologyNodeIcon(o)).join(''),pyramids=spec.objects.filter(o=>o.type==='ecology-pyramid').map(o=>ecologyPyramidMarkup(spec,o)).join(''),arrows=spec.objects.filter(o=>o.type==='ecology-arrow').map(ecologyArrowMarkup).join(''),labels=spec.objects.filter(o=>o.type==='ecology-label').map(o=>ecologyLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter(o=>o.type==='text').map(generalObjectMarkup).join('');let trophic='';if(spec.ecologyShowTrophicLevels){targets.filter(o=>o.type==='ecology-node'&&o.trophicLevel>0).forEach(o=>{trophic+=`<text x="${o.x+8}" y="${o.y+16}" font-size="10" font-weight="800" fill="#475569">TL ${o.trophicLevel}</text>`;});}return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${zones}${links}${nodes}${pyramids}${arrows}${labels}${trophic}${texts}</g>`;}




    function astronomyPortPoint(object,port){const map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},pair=map[port]||map.e;return{x:object.x+object.width*pair[0],y:object.y+object.height*pair[1]};}
    function astronomyGridMarkup(spec){if(!spec.astronomyShowGrid)return'';const step=Math.max(5,Number(spec.gridSize||20));return`<defs><pattern id="qmx-astronomy-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#e0e7ff" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-astronomy-grid)"/>`;}
    function astronomyOrthogonalPath(a,b){const mid=(a.x+b.x)/2;return`M ${a.x} ${a.y} L ${mid} ${a.y} L ${mid} ${b.y} L ${b.x} ${b.y}`;}
    function astronomyBodyMarkup(o){const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,s=escapeHtml(o.stroke),f=escapeHtml(o.fill),lw=o.lineWidth,label=`<text x="${cx}" y="${y+h+16}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;let b='';
        const disk=(r=Math.min(w,h)*.38)=>`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;
        if(o.kind==='sun'||o.kind==='star'){b=disk(Math.min(w,h)*.32);for(let i=0;i<12;i++){const a=i*Math.PI/6,r1=Math.min(w,h)*.38,r2=Math.min(w,h)*.48;b+=`<line x1="${cx+Math.cos(a)*r1}" y1="${cy+Math.sin(a)*r1}" x2="${cx+Math.cos(a)*r2}" y2="${cy+Math.sin(a)*r2}" stroke="${s}" stroke-width="${lw}"/>`;}}
        else if(['mercury','venus','earth','moon','mars','jupiter','uranus','neptune','dwarf-planet'].includes(o.kind)){b=disk();if(o.kind==='earth')b+=`<path d="M ${x+w*.28} ${cy} Q ${cx} ${y+h*.18} ${x+w*.72} ${cy} Q ${cx} ${y+h*.8} ${x+w*.28} ${cy}" fill="#22c55e" opacity=".75"/>`;if(o.kind==='jupiter')for(let i=0;i<4;i++)b+=`<line x1="${x+w*.22}" y1="${y+h*(.3+i*.13)}" x2="${x+w*.78}" y2="${y+h*(.3+i*.13)}" stroke="#b45309" stroke-width="3" opacity=".65"/>`;}
        else if(o.kind==='saturn'){b=disk(Math.min(w,h)*.25)+`<ellipse cx="${cx}" cy="${cy}" rx="${w*.44}" ry="${h*.18}" fill="none" stroke="${s}" stroke-width="${lw+1}" transform="rotate(-12 ${cx} ${cy})"/>`;}
        else if(o.kind==='binary-star'){b=`<circle cx="${x+w*.34}" cy="${cy}" r="${h*.24}" fill="#fde68a" stroke="#ca8a04" stroke-width="${lw}"/><circle cx="${x+w*.68}" cy="${cy}" r="${h*.2}" fill="#bfdbfe" stroke="#2563eb" stroke-width="${lw}"/><ellipse cx="${cx}" cy="${cy}" rx="${w*.42}" ry="${h*.36}" fill="none" stroke="#94a3b8" stroke-dasharray="6 5"/>`;}
        else if(o.kind==='comet'){b=`<path d="M ${x+w*.12} ${cy} Q ${x+w*.5} ${y+h*.15} ${x+w*.78} ${cy}" fill="none" stroke="#7dd3fc" stroke-width="${Math.max(8,h*.18)}" stroke-linecap="round" opacity=".55"/><circle cx="${x+w*.78}" cy="${cy}" r="${h*.2}" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='asteroid'){b=`<polygon points="${x+w*.18},${y+h*.45} ${x+w*.32},${y+h*.16} ${x+w*.7},${y+h*.1} ${x+w*.88},${y+h*.43} ${x+w*.72},${y+h*.83} ${x+w*.3},${y+h*.9}" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='asteroid-belt'){b=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.44}" ry="${h*.34}" fill="none" stroke="${s}" stroke-width="${lw}" stroke-dasharray="3 8"/>`;for(let i=0;i<22;i++){const a=i*Math.PI*2/22,rrx=w*(.34+(i%3)*.04),rry=h*(.25+(i%2)*.05);b+=`<circle cx="${cx+Math.cos(a)*rrx}" cy="${cy+Math.sin(a)*rry}" r="${3+i%3}" fill="#78716c"/>`;}}
        else if(o.kind==='galaxy'){b=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.42}" ry="${h*.24}" fill="${f}" fill-opacity=".45" stroke="${s}" stroke-width="${lw}" transform="rotate(-18 ${cx} ${cy})"/><path d="M ${cx-w*.32} ${cy+h*.1} C ${cx-w*.1} ${cy-h*.28},${cx+w*.18} ${cy+h*.22},${cx+w*.35} ${cy-h*.08}" fill="none" stroke="${s}" stroke-width="5"/>`;}
        else if(o.kind==='nebula'){b=`<path d="M ${x+w*.1} ${cy} C ${x+w*.18} ${y+h*.05},${x+w*.5} ${y+h*.18},${x+w*.58} ${cy} C ${x+w*.75} ${y+h*.82},${x+w*.95} ${cy},${x+w*.78} ${y+h*.18} C ${x+w*.55} ${y+h*.02},${x+w*.2} ${y+h*.8},${x+w*.1} ${cy}" fill="${f}" fill-opacity=".65" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='black-hole'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.25}" fill="#000"/><ellipse cx="${cx}" cy="${cy}" rx="${w*.43}" ry="${h*.18}" fill="none" stroke="#f97316" stroke-width="10" opacity=".8" transform="rotate(-15 ${cx} ${cy})"/>`;}
        else if(o.kind==='satellite'){b=`<rect x="${x+w*.34}" y="${y+h*.28}" width="${w*.32}" height="${h*.44}" rx="5" fill="${f}" stroke="${s}" stroke-width="${lw}"/><rect x="${x+w*.03}" y="${y+h*.35}" width="${w*.28}" height="${h*.3}" fill="#60a5fa" stroke="#1d4ed8"/><rect x="${x+w*.69}" y="${y+h*.35}" width="${w*.28}" height="${h*.3}" fill="#60a5fa" stroke="#1d4ed8"/><line x1="${cx}" y1="${y+h*.28}" x2="${cx}" y2="${y+h*.05}" stroke="${s}"/><circle cx="${cx}" cy="${y+h*.05}" r="4" fill="${s}"/>`;}
        else if(o.kind==='rocket'){b=`<path d="M ${cx} ${y+h*.05} Q ${x+w*.78} ${y+h*.35} ${x+w*.68} ${y+h*.72} L ${x+w*.32} ${y+h*.72} Q ${x+w*.22} ${y+h*.35} ${cx} ${y+h*.05} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${cx}" cy="${y+h*.38}" r="${w*.12}" fill="#bfdbfe" stroke="#2563eb"/><path d="M ${x+w*.38} ${y+h*.72} L ${x+w*.22} ${y+h*.95} L ${cx} ${y+h*.78} L ${x+w*.78} ${y+h*.95} L ${x+w*.62} ${y+h*.72}" fill="#f97316"/>`;}
        else if(o.kind==='telescope'){b=`<path d="M ${x+w*.12} ${y+h*.3} L ${x+w*.72} ${y+h*.48}" stroke="${s}" stroke-width="18" stroke-linecap="round"/><circle cx="${x+w*.18}" cy="${y+h*.32}" r="${h*.15}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><line x1="${x+w*.58}" y1="${y+h*.48}" x2="${x+w*.38}" y2="${y+h*.92}" stroke="${s}" stroke-width="4"/><line x1="${x+w*.58}" y1="${y+h*.48}" x2="${x+w*.78}" y2="${y+h*.92}" stroke="${s}" stroke-width="4"/>`;}
        else if(o.kind==='orbit'){b=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.46}" ry="${h*.42}" fill="none" stroke="${s}" stroke-width="${lw}" stroke-dasharray="9 6"/>`;}
        else if(o.kind==='constellation'){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${f}" fill-opacity=".35" stroke="${s}" stroke-width="${lw}" stroke-dasharray="7 5"/>`;const pts=[[.18,.25],[.4,.15],[.65,.28],[.5,.5],[.22,.7],[.72,.72],[.85,.45]];for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];b+=`<circle cx="${x+w*p[0]}" cy="${y+h*p[1]}" r="4" fill="#facc15"/><line x1="${x+w*p[0]}" y1="${y+h*p[1]}" x2="${x+w*q[0]}" y2="${y+h*q[1]}" stroke="#94a3b8"/>`;}}
        else b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;
        return`<g data-qmx-object="${escapeHtml(o.id)}" transform="rotate(${o.rotation} ${cx} ${cy})">${b}${label}</g>`;}
    function astronomyRegionMarkup(spec,o){if(!spec.astronomyShowZones)return'';const dash=o.dashed?' stroke-dasharray="10 7"':'';return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="18" fill="${escapeHtml(o.fill)}" fill-opacity=".35" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}/><text x="${o.x+14}" y="${o.y+24}" font-size="15" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function astronomyChartMarkup(spec,o){const rows=String(o.levels||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{const p=line.split('|');return{label:(p[0]||'Item').trim(),value:(p.slice(1).join('|')||'').trim()};});const cx=o.x+o.width/2,cy=o.y+o.height/2;if(o.kind==='moon-phases'){let b=`<text x="${cx}" y="${o.y+28}" text-anchor="middle" font-size="18" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text>`;rows.slice(0,8).forEach((r,i)=>{const a=-Math.PI/2+i*Math.PI/4,px=cx+Math.cos(a)*o.width*.33,py=cy+Math.sin(a)*o.height*.33,phase=i/7;b+=`<circle cx="${px}" cy="${py}" r="28" fill="#111827" stroke="#64748b"/><path d="M ${px} ${py-28} A 28 28 0 0 1 ${px} ${py+28} A ${Math.max(2,28*Math.abs(Math.cos(a)))} 28 0 0 ${i<4?0:1} ${px} ${py-28}" fill="#f8fafc"/><text x="${px}" y="${py+48}" text-anchor="middle" font-size="10" fill="#334155">${escapeHtml(r.label)}</text>`;});return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="14" fill="#fff" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/>${b}</g>`;}
        if(o.kind==='eclipse-geometry'){let b=`<text x="${cx}" y="${o.y+28}" text-anchor="middle" font-size="18" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text><circle cx="${o.x+90}" cy="${cy}" r="48" fill="#facc15" stroke="#f59e0b"/><circle cx="${cx}" cy="${cy}" r="28" fill="#94a3b8"/><circle cx="${o.x+o.width-90}" cy="${cy}" r="40" fill="#60a5fa" stroke="#2563eb"/><path d="M ${cx+28} ${cy-18} L ${o.x+o.width-130} ${cy-42} L ${o.x+o.width-130} ${cy+42} L ${cx+28} ${cy+18} Z" fill="#111827" opacity=".28"/>`;return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="14" fill="#fff" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/>${b}</g>`;}
        if(o.kind==='hr-diagram'){const px=o.x+60,py=o.y+55,pw=o.width-95,ph=o.height-105;let b=`<text x="${cx}" y="${o.y+28}" text-anchor="middle" font-size="18" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text><line x1="${px}" y1="${py}" x2="${px}" y2="${py+ph}" stroke="#334155"/><line x1="${px}" y1="${py+ph}" x2="${px+pw}" y2="${py+ph}" stroke="#334155"/><text x="${px+pw/2}" y="${py+ph+28}" text-anchor="middle" font-size="12">Temperature (hot → cool)</text><text x="${px-35}" y="${py+ph/2}" transform="rotate(-90 ${px-35} ${py+ph/2})" text-anchor="middle" font-size="12">Luminosity</text>`;rows.forEach((r,i)=>{const parts=r.value.split(','),temp=Number(parts[0])||5000,lum=Math.max(.0001,Number(parts[1])||1),xx=px+pw*(1-Math.min(1,Math.max(0,(temp-2500)/30000))),yy=py+ph*(1-Math.min(1,Math.max(0,(Math.log10(lum)+4)/10)));b+=`<circle cx="${xx}" cy="${yy}" r="6" fill="${i<2?'#60a5fa':i>4?'#ef4444':'#facc15'}" stroke="#334155"/><text x="${xx+9}" y="${yy-6}" font-size="10">${escapeHtml(r.label)}</text>`;});return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="14" fill="#fff" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/>${b}</g>`;}
        const data=rows.map(r=>({label:r.label,value:Number(r.value)||0})),n=Math.max(1,data.length),px=o.x+55,py=o.y+50,pw=o.width-85,ph=o.height-105,max=Math.max(1,...data.map(d=>d.value));let b=`<text x="${cx}" y="${o.y+26}" text-anchor="middle" font-size="18" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text><line x1="${px}" y1="${py+ph/2}" x2="${px+pw}" y2="${py+ph/2}" stroke="#94a3b8"/>`;data.forEach((d,i)=>{const xx=px+pw*(d.value/max),r=8+(i%3)*2;b+=`<circle cx="${xx}" cy="${py+ph/2}" r="${r}" fill="${i===2?'#60a5fa':i===4?'#f87171':'#fbbf24'}" stroke="#475569"/><text x="${xx}" y="${py+ph/2+26+(i%2)*14}" text-anchor="middle" font-size="9">${escapeHtml(d.label)}</text>`;});return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="14" fill="#fff" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/>${b}</g>`;}
    function astronomyLinkMarkup(spec,o,map){const source=map.get(o.sourceId),target=map.get(o.targetId),a=source?astronomyPortPoint(source,o.sourcePort):{x:o.x1,y:o.y1},b=target?astronomyPortPoint(target,o.targetPort):{x:o.x2,y:o.y2},dash=o.dashed?' stroke-dasharray="8 6"':'',marker=o.showArrow?' marker-end="url(#qmx-diagram-arrow)"':'',path=astronomyOrthogonalPath(a,b),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},suffix=spec.astronomyShowValues&&o.value?` (${escapeHtml(o.value)})`:'';const label=o.label?`<text x="${mid.x}" y="${mid.y-9}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}${suffix}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="${path}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}${marker} stroke-linejoin="round"/>${label}</g>`;}
    function astronomyLabelMarkup(spec,o,map){if(!spec.astronomyShowLabels)return'';const target=map.get(o.targetId),p=target?astronomyPortPoint(target,o.targetPort):{x:o.x,y:o.y+o.height/2},lx=o.x,ly=o.y,w=o.width,h=o.height,nearX=p.x<lx?lx:p.x>lx+w?lx+w:lx+w/2,nearY=p.y<ly?ly:p.y>ly+h?ly+h:ly+h/2;return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="M ${p.x} ${p.y} L ${(p.x+nearX)/2} ${p.y} L ${nearX} ${nearY}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${escapeHtml(o.stroke)}"/><rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="8" fill="${escapeHtml(o.fill)}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${lx+10}" y="${ly+h/2+5}" font-size="13" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.text)}</text></g>`;}
    function astronomyArrowMarkup(o){const dash=o.dashed?' stroke-dasharray="8 6"':'',label=o.label?`<text x="${(o.x1+o.x2)/2}" y="${(o.y1+o.y2)/2-10}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash} marker-end="url(#qmx-diagram-arrow)"/>${label}</g>`;}
    function astronomyMarkup(spec){const targets=spec.objects.filter(o=>['astronomy-body','astronomy-region','astronomy-chart'].includes(o.type)),map=new Map(targets.map(o=>[o.id,o])),grid=astronomyGridMarkup(spec),regions=spec.objects.filter(o=>o.type==='astronomy-region').map(o=>astronomyRegionMarkup(spec,o)).join(''),links=spec.objects.filter(o=>o.type==='astronomy-link').map(o=>astronomyLinkMarkup(spec,o,map)).join(''),bodies=spec.objects.filter(o=>o.type==='astronomy-body'&&(spec.astronomyShowOrbits||o.kind!=='orbit')).map(astronomyBodyMarkup).join(''),charts=spec.objects.filter(o=>o.type==='astronomy-chart').map(o=>astronomyChartMarkup(spec,o)).join(''),arrows=spec.objects.filter(o=>o.type==='astronomy-arrow').map(astronomyArrowMarkup).join(''),labels=spec.objects.filter(o=>o.type==='astronomy-label').map(o=>astronomyLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter(o=>o.type==='text').map(generalObjectMarkup).join('');let values='';if(spec.astronomyShowValues){targets.filter(o=>o.type==='astronomy-body'&&o.value).forEach(o=>{values+=`<text x="${o.x+8}" y="${o.y+16}" font-size="10" font-weight="800" fill="#475569">${escapeHtml(o.value)} AU</text>`;});}return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${regions}${links}${bodies}${charts}${arrows}${labels}${values}${texts}</g>`;}

    function weatherPortPoint(object,port){const map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},pair=map[port]||map.e;return{x:object.x+object.width*pair[0],y:object.y+object.height*pair[1]};}
    function weatherGridMarkup(spec){if(!spec.weatherShowGrid)return'';const step=Math.max(5,Number(spec.gridSize||20));return`<defs><pattern id="qmx-weather-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#dbeafe" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-weather-grid)"/>`;}
    function weatherCloudShape(x,y,w,h,fill,stroke,lw){return`<path d="M ${x+w*.18} ${y+h*.72} C ${x+w*.04} ${y+h*.72},${x+w*.02} ${y+h*.48},${x+w*.2} ${y+h*.43} C ${x+w*.22} ${y+h*.18},${x+w*.48} ${y+h*.08},${x+w*.62} ${y+h*.3} C ${x+w*.82} ${y+h*.22},${x+w*.95} ${y+h*.42},${x+w*.87} ${y+h*.59} C ${x+w*.96} ${y+h*.75},${x+w*.75} ${y+h*.82},${x+w*.18} ${y+h*.72} Z" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}
    function weatherNodeMarkup(o){const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,s=escapeHtml(o.stroke),f=escapeHtml(o.fill),lw=o.lineWidth,label=`<text x="${cx}" y="${y+h+16}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;let b='';
        if(o.kind==='sun'){const r=Math.min(w,h)*.28;b=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fbbf24" stroke="${s}" stroke-width="${lw}"/>`;for(let i=0;i<12;i++){const a=i*Math.PI/6,x1=cx+Math.cos(a)*r*1.25,y1=cy+Math.sin(a)*r*1.25,x2=cx+Math.cos(a)*r*1.75,y2=cy+Math.sin(a)*r*1.75;b+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${s}" stroke-width="3"/>`;}}
        else if(['cloud','rain-cloud','thunderstorm','snow-cloud'].includes(o.kind)){b=weatherCloudShape(x,y,w,h*.72,f,s,lw);if(o.kind==='rain-cloud'||o.kind==='thunderstorm'){for(let i=0;i<4;i++)b+=`<line x1="${x+w*(.25+i*.16)}" y1="${y+h*.67}" x2="${x+w*(.19+i*.16)}" y2="${y+h*.92}" stroke="#2563eb" stroke-width="4"/>`;}if(o.kind==='thunderstorm')b+=`<polyline points="${cx},${y+h*.55} ${cx-w*.08},${y+h*.75} ${cx+w*.02},${y+h*.75} ${cx-w*.06},${y+h*.98}" fill="none" stroke="#f59e0b" stroke-width="6"/>`;if(o.kind==='snow-cloud'){for(let i=0;i<4;i++)b+=`<text x="${x+w*(.23+i*.17)}" y="${y+h*.92}" font-size="22" fill="#0891b2">*</text>`;}}
        else if(o.kind==='wind'){for(let i=0;i<3;i++){const yy=y+h*(.28+i*.22);b+=`<path d="M ${x+8} ${yy} C ${x+w*.35} ${yy-h*.16},${x+w*.62} ${yy+h*.12},${x+w-20} ${yy}" fill="none" stroke="${s}" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/>`;}}
        else if(o.kind==='high-pressure'||o.kind==='low-pressure'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.38}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><text x="${cx}" y="${cy+18}" text-anchor="middle" font-size="52" font-weight="900" fill="${s}">${o.kind==='high-pressure'?'H':'L'}</text>`;}
        else if(['warm-front','cold-front','occluded-front','stationary-front'].includes(o.kind)){const yy=cy;b=`<line x1="${x+8}" y1="${yy}" x2="${x+w-8}" y2="${yy}" stroke="${s}" stroke-width="5"/>`;for(let i=0;i<5;i++){const xx=x+30+i*(w-60)/4;if(o.kind==='warm-front'||o.kind==='occluded-front'||(o.kind==='stationary-front'&&i%2===0))b+=`<path d="M ${xx-10} ${yy} A 10 10 0 0 1 ${xx+10} ${yy}" fill="${o.kind==='stationary-front'?'#dc2626':s}"/>`;if(o.kind==='cold-front'||o.kind==='occluded-front'||(o.kind==='stationary-front'&&i%2===1))b+=`<polygon points="${xx-10},${yy} ${xx+10},${yy} ${xx},${yy-16}" fill="${o.kind==='stationary-front'?'#2563eb':s}"/>`;}}
        else if(o.kind==='isobar'){for(let i=0;i<3;i++)b+=`<ellipse cx="${cx}" cy="${cy}" rx="${w*(.46-i*.1)}" ry="${h*(.42-i*.1)}" fill="none" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='cyclone'||o.kind==='anticyclone'){for(let i=0;i<3;i++){const r=Math.min(w,h)*(.18+i*.13);b+=`<path d="M ${cx+r} ${cy} A ${r} ${r} 0 1 ${o.kind==='cyclone'?1:0} ${cx-r*.7} ${cy-r*.7}" fill="none" stroke="${s}" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/>`;}b+=`<text x="${cx}" y="${cy+10}" text-anchor="middle" font-size="32" font-weight="900" fill="${s}">${o.kind==='cyclone'?'L':'H'}</text>`;}
        else if(o.kind==='thermometer'){b=`<rect x="${cx-12}" y="${y+18}" width="24" height="${h*.65}" rx="12" fill="#fff" stroke="${s}" stroke-width="${lw}"/><circle cx="${cx}" cy="${y+h*.82}" r="${w*.2}" fill="#ef4444" stroke="${s}"/><line x1="${cx}" y1="${y+h*.25}" x2="${cx}" y2="${y+h*.76}" stroke="#ef4444" stroke-width="10"/>`;}
        else if(o.kind==='hygrometer'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.38}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${cx} ${cy-h*.22} C ${cx-w*.16} ${cy},${cx-w*.12} ${cy+h*.2},${cx} ${cy+h*.24} C ${cx+w*.12} ${cy+h*.2},${cx+w*.16} ${cy},${cx} ${cy-h*.22} Z" fill="#38bdf8"/>`;}
        else if(o.kind==='anemometer'){b=`<line x1="${cx}" y1="${y+h*.25}" x2="${cx}" y2="${y+h*.85}" stroke="${s}" stroke-width="5"/>`;for(let i=0;i<3;i++){const a=i*2*Math.PI/3,x2=cx+Math.cos(a)*w*.28,y2=y+h*.35+Math.sin(a)*h*.2;b+=`<line x1="${cx}" y1="${y+h*.35}" x2="${x2}" y2="${y2}" stroke="${s}" stroke-width="4"/><circle cx="${x2}" cy="${y2}" r="12" fill="${f}" stroke="${s}"/>`;}}
        else if(o.kind==='rain-gauge'){b=`<path d="M ${x+w*.28} ${y+15} L ${x+w*.72} ${y+15} L ${x+w*.62} ${y+h*.88} L ${x+w*.38} ${y+h*.88} Z" fill="#e0f2fe" stroke="${s}" stroke-width="${lw}"/>`;for(let i=1;i<5;i++)b+=`<line x1="${x+w*.42}" y1="${y+h*(.18+i*.13)}" x2="${x+w*.58}" y2="${y+h*(.18+i*.13)}" stroke="${s}"/>`;}
        else if(o.kind==='weather-station'){b=`<rect x="${x}" y="${y+h*.22}" width="${w}" height="${h*.58}" rx="12" fill="${f}" stroke="${s}" stroke-width="${lw}"/><polygon points="${x+w*.12},${y+h*.22} ${cx},${y} ${x+w*.88},${y+h*.22}" fill="#fff" stroke="${s}"/><circle cx="${x+w*.25}" cy="${y+h*.5}" r="13" fill="#fff" stroke="${s}"/><path d="M ${x+w*.55} ${y+h*.56} L ${x+w*.82} ${y+h*.56}" stroke="${s}" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/>`;}
        else if(o.kind==='mountain'){b=`<polygon points="${x+8},${y+h*.9} ${x+w*.38},${y+h*.22} ${cx},${y+h*.48} ${x+w*.68},${y+h*.12} ${x+w-8},${y+h*.9}" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='sea'){b=`<rect x="${x}" y="${y+h*.35}" width="${w}" height="${h*.55}" rx="10" fill="${f}" stroke="${s}"/>`;for(let i=0;i<3;i++)b+=`<path d="M ${x+8} ${y+h*(.45+i*.15)} Q ${x+w*.18} ${y+h*(.35+i*.15)} ${x+w*.34} ${y+h*(.45+i*.15)} T ${x+w*.66} ${y+h*(.45+i*.15)} T ${x+w-8} ${y+h*(.45+i*.15)}" fill="none" stroke="${s}"/>`;}
        else if(o.kind==='land'){b=`<path d="M ${x+5} ${y+h*.72} Q ${x+w*.22} ${y+h*.25} ${x+w*.42} ${y+h*.55} Q ${x+w*.66} ${y+h*.1} ${x+w-5} ${y+h*.72} L ${x+w-5} ${y+h*.92} L ${x+5} ${y+h*.92} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='atmospheric-layer'){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${f}" fill-opacity=".7" stroke="${s}" stroke-width="${lw}"/><text x="${cx}" y="${cy+6}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;return`<g data-qmx-object="${escapeHtml(o.id)}">${b}</g>`;}
        else{b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${f}" stroke="${s}" stroke-width="${lw}"/><text x="${cx}" y="${cy+6}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;return`<g data-qmx-object="${escapeHtml(o.id)}">${b}</g>`;}
        const value=o.value?`<text x="${cx}" y="${y+16}" text-anchor="middle" font-size="11" font-weight="800" fill="${s}">${escapeHtml(o.value)}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}">${b}${value}${label}</g>`;}
    function weatherZoneMarkup(spec,o){if(!spec.weatherShowZones)return'';const dash=o.dashed?' stroke-dasharray="10 7"':'';return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="18" fill="${escapeHtml(o.fill)}" fill-opacity=".42" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}/><text x="${o.x+14}" y="${o.y+24}" font-size="15" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function weatherChartMarkup(spec,o){const rows=String(o.levels||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{const p=line.split('|');return{label:(p[0]||'Item').trim(),value:(p.slice(1).join('|')||'').trim()};});const cx=o.x+o.width/2;if(o.kind==='climate-graph'){const data=rows.map(r=>{const p=r.value.split(',');return{label:r.label,temp:Number(p[0])||0,rain:Number(p[1])||0};}),n=Math.max(1,data.length),px=o.x+55,py=o.y+50,pw=o.width-85,ph=o.height-105,maxRain=Math.max(10,...data.map(d=>d.rain)),minT=Math.min(0,...data.map(d=>d.temp)),maxT=Math.max(10,...data.map(d=>d.temp));let b=`<text x="${cx}" y="${o.y+26}" text-anchor="middle" font-size="18" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text><line x1="${px}" y1="${py}" x2="${px}" y2="${py+ph}" stroke="#334155"/><line x1="${px}" y1="${py+ph}" x2="${px+pw}" y2="${py+ph}" stroke="#334155"/>`;let points=[];data.forEach((d,i)=>{const x=px+(i+.5)*pw/n,bh=d.rain/maxRain*ph*.85,y=py+ph-bh;b+=`<rect x="${x-pw/n*.32}" y="${y}" width="${pw/n*.64}" height="${bh}" fill="#60a5fa" fill-opacity=".7" stroke="#2563eb"/><text x="${x}" y="${py+ph+16}" text-anchor="middle" font-size="9" fill="#475569">${escapeHtml(d.label)}</text>`;const ty=py+ph-(d.temp-minT)/Math.max(1,maxT-minT)*ph*.85;points.push(`${x},${ty}`);});b+=`<polyline points="${points.join(' ')}" fill="none" stroke="#dc2626" stroke-width="3"/>`;return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="14" fill="#fff" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/>${b}</g>`;}
        const n=Math.max(1,rows.length),lh=(o.height-70)/n;let b=`<text x="${cx}" y="${o.y+26}" text-anchor="middle" font-size="18" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text>`;rows.forEach((r,i)=>{const yy=o.y+45+i*lh;b+=`<rect x="${o.x+18}" y="${yy}" width="${o.width-36}" height="${lh-4}" rx="7" fill="${i%2?'#eff6ff':'#f8fafc'}" stroke="#bfdbfe"/><text x="${o.x+30}" y="${yy+lh/2+4}" font-size="13" font-weight="800" fill="#334155">${escapeHtml(r.label)}</text><text x="${o.x+o.width-30}" y="${yy+lh/2+4}" text-anchor="end" font-size="13" fill="#075985">${escapeHtml(r.value)}</text>`;});return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="14" fill="#fff" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/>${b}</g>`;}
    function weatherOrthogonalPath(a,b){const mx=(a.x+b.x)/2;return`M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;}
    function weatherLinkMarkup(spec,o,map){const source=map.get(o.sourceId),target=map.get(o.targetId),a=source?weatherPortPoint(source,o.sourcePort):{x:o.x1,y:o.y1},b=target?weatherPortPoint(target,o.targetPort):{x:o.x2,y:o.y2},dash=o.dashed?' stroke-dasharray="8 6"':'',marker=o.showArrow?' marker-end="url(#qmx-diagram-arrow)"':'',path=weatherOrthogonalPath(a,b),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},suffix=spec.weatherShowValues&&o.value?` (${escapeHtml(o.value)})`:'';const label=o.label?`<text x="${mid.x}" y="${mid.y-9}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}${suffix}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="${path}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}${marker} stroke-linejoin="round"/>${label}</g>`;}
    function weatherLabelMarkup(spec,o,map){if(!spec.weatherShowLabels)return'';const target=map.get(o.targetId),p=target?weatherPortPoint(target,o.targetPort):{x:o.x,y:o.y+o.height/2},lx=o.x,ly=o.y,w=o.width,h=o.height,nearX=p.x<lx?lx:p.x>lx+w?lx+w:lx+w/2,nearY=p.y<ly?ly:p.y>ly+h?ly+h:ly+h/2;return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="M ${p.x} ${p.y} L ${(p.x+nearX)/2} ${p.y} L ${nearX} ${nearY}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${escapeHtml(o.stroke)}"/><rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="8" fill="${escapeHtml(o.fill)}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${lx+10}" y="${ly+h/2+5}" font-size="13" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.text)}</text></g>`;}
    function weatherArrowMarkup(o){const dash=o.dashed?' stroke-dasharray="8 6"':'',label=o.label?`<text x="${(o.x1+o.x2)/2}" y="${(o.y1+o.y2)/2-10}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash} marker-end="url(#qmx-diagram-arrow)"/>${label}</g>`;}
    function weatherMarkup(spec){const targets=spec.objects.filter(o=>['weather-node','weather-zone','weather-chart'].includes(o.type)),map=new Map(targets.map(o=>[o.id,o])),grid=weatherGridMarkup(spec),zones=spec.objects.filter(o=>o.type==='weather-zone').map(o=>weatherZoneMarkup(spec,o)).join(''),links=spec.objects.filter(o=>o.type==='weather-link').map(o=>weatherLinkMarkup(spec,o,map)).join(''),nodes=spec.objects.filter(o=>o.type==='weather-node').map(weatherNodeMarkup).join(''),charts=spec.objects.filter(o=>o.type==='weather-chart').map(o=>weatherChartMarkup(spec,o)).join(''),arrows=spec.objects.filter(o=>o.type==='weather-arrow').map(weatherArrowMarkup).join(''),labels=spec.objects.filter(o=>o.type==='weather-label').map(o=>weatherLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter(o=>o.type==='text').map(generalObjectMarkup).join('');let levels='';if(spec.weatherShowLevels){targets.filter(o=>o.type==='weather-node'&&o.level>0).forEach(o=>{levels+=`<text x="${o.x+8}" y="${o.y+16}" font-size="10" font-weight="800" fill="#475569">Level ${o.level}</text>`;});}return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${zones}${links}${nodes}${charts}${arrows}${labels}${levels}${texts}</g>`;}

    function geologyPortPoint(object,port){const map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},pair=map[port]||map.e;return{x:object.x+object.width*pair[0],y:object.y+object.height*pair[1]};}
    function geologyGridMarkup(spec){if(!spec.geologyShowGrid)return'';const step=Math.max(5,Number(spec.gridSize||20));return`<defs><pattern id="qmx-geology-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-geology-grid)"/>`;}
    function geologyNodeIcon(o){const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,s=escapeHtml(o.stroke),f=escapeHtml(o.fill),lw=o.lineWidth,label=`<text x="${cx}" y="${y+h+16}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;let b='';
        if(o.kind==='earth'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.44}" fill="#dbeafe" stroke="${s}" stroke-width="${lw}"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.34}" fill="#fed7aa" stroke="#c2410c"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.21}" fill="#fecaca" stroke="#dc2626"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.1}" fill="#fde68a" stroke="#d97706"/>`;}
        else if(['crust','mantle','outer-core','inner-core','rock-layer'].includes(o.kind)){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;for(let i=1;i<4;i++)b+=`<line x1="${x+8}" y1="${y+h*i/4}" x2="${x+w-8}" y2="${y+h*i/4}" stroke="${s}" stroke-opacity=".35"/>`;}
        else if(o.kind==='volcano'){b=`<polygon points="${x+w*.08},${y+h*.9} ${cx-w*.12},${y+h*.25} ${cx+w*.12},${y+h*.25} ${x+w*.92},${y+h*.9}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${cx} ${y+h*.26} C ${cx-w*.08} ${y+h*.48},${cx+w*.08} ${y+h*.62},${cx} ${y+h*.9}" fill="none" stroke="#dc2626" stroke-width="8"/><ellipse cx="${cx}" cy="${y+h*.24}" rx="${w*.13}" ry="${h*.06}" fill="#7f1d1d"/>`;}
        else if(o.kind==='mountain'){b=`<polygon points="${x+8},${y+h*.9} ${x+w*.38},${y+h*.22} ${cx},${y+h*.48} ${x+w*.68},${y+h*.12} ${x+w-8},${y+h*.9}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><polyline points="${x+w*.28},${y+h*.44} ${x+w*.38},${y+h*.22} ${x+w*.47},${y+h*.38}" fill="none" stroke="#fff" stroke-width="5"/>`;}
        else if(o.kind==='river'||o.kind==='groundwater'){b=`<path d="M ${x+8} ${cy-h*.18} C ${x+w*.25} ${cy-h*.45},${x+w*.35} ${cy+h*.25},${cx} ${cy} S ${x+w*.78} ${cy-h*.3} ${x+w-8} ${cy+h*.18}" fill="none" stroke="${s}" stroke-width="9" stroke-linecap="round"/>`;}
        else if(['igneous-rock','sedimentary-rock','metamorphic-rock','mineral','sediment','fossil','magma-chamber','lava'].includes(o.kind)){b=`<path d="M ${x+w*.12} ${y+h*.76} L ${x+w*.2} ${y+h*.25} L ${x+w*.56} ${y+h*.12} L ${x+w*.88} ${y+h*.42} L ${x+w*.75} ${y+h*.88} L ${x+w*.3} ${y+h*.92} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;if(o.kind==='fossil')b+=`<path d="M ${x+w*.33} ${cy} C ${x+w*.38} ${y+h*.25},${x+w*.68} ${y+h*.27},${x+w*.66} ${cy} C ${x+w*.64} ${y+h*.7},${x+w*.4} ${y+h*.7},${x+w*.38} ${cy} Z" fill="none" stroke="#92400e" stroke-width="3"/>`;}
        else if(['tectonic-plate','divergent-boundary','convergent-boundary','transform-boundary'].includes(o.kind)){b=`<rect x="${x}" y="${y+h*.34}" width="${w}" height="${h*.44}" rx="8" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;const yy=cy;if(o.kind==='divergent-boundary')b+=`<line x1="${cx-12}" y1="${y+8}" x2="${cx-12}" y2="${y+h-8}" stroke="#dc2626" stroke-width="4"/><line x1="${cx+12}" y1="${y+8}" x2="${cx+12}" y2="${y+h-8}" stroke="#dc2626" stroke-width="4"/><path d="M ${cx-18} ${yy} L ${x+w*.16} ${yy}" stroke="#0284c7" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/><path d="M ${cx+18} ${yy} L ${x+w*.84} ${yy}" stroke="#0284c7" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/>`;else if(o.kind==='convergent-boundary')b+=`<path d="M ${x+w*.12} ${yy} L ${cx-8} ${yy}" stroke="#b91c1c" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/><path d="M ${x+w*.88} ${yy} L ${cx+8} ${yy}" stroke="#b91c1c" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/>`;else if(o.kind==='transform-boundary')b+=`<path d="M ${x+w*.18} ${y+h*.22} L ${x+w*.72} ${y+h*.22}" stroke="#7c3aed" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/><path d="M ${x+w*.82} ${y+h*.88} L ${x+w*.28} ${y+h*.88}" stroke="#7c3aed" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/>`;}
        else if(o.kind==='fault'){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><line x1="${x+w*.7}" y1="${y}" x2="${x+w*.3}" y2="${y+h}" stroke="#b91c1c" stroke-width="5"/><line x1="${x+8}" y1="${y+h*.34}" x2="${x+w*.55}" y2="${y+h*.34}" stroke="${s}"/><line x1="${x+w*.48}" y1="${y+h*.68}" x2="${x+w-8}" y2="${y+h*.68}" stroke="${s}"/>`;}
        else if(o.kind==='fold'){let p='';for(let i=0;i<4;i++){const yy=y+h*(.25+i*.16);p+=`<path d="M ${x+5} ${yy} Q ${x+w*.25} ${yy-h*.25} ${cx} ${yy} T ${x+w-5} ${yy}" fill="none" stroke="${i%2?s:'#64748b'}" stroke-width="3"/>`;}b=p;}
        else if(o.kind==='earthquake-focus'||o.kind==='epicenter'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.18}" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;for(let i=0;i<4;i++){const r=Math.min(w,h)*(.28+i*.12);b+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s}" stroke-opacity="${.7-i*.12}"/>`;}}
        else if(o.kind==='unconformity'){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" stroke="${s}"/><path d="M ${x} ${cy} Q ${x+w*.18} ${cy-h*.28} ${x+w*.36} ${cy} T ${x+w*.72} ${cy} T ${x+w} ${cy}" fill="none" stroke="#a16207" stroke-width="5"/>`;}
        else{b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${f}" stroke="${s}" stroke-width="${lw}"/><text x="${cx}" y="${cy+6}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;return`<g data-qmx-object="${escapeHtml(o.id)}">${b}</g>`;}
        return`<g data-qmx-object="${escapeHtml(o.id)}">${b}${label}</g>`;}
    function geologyZoneMarkup(spec,o){if(!spec.geologyShowZones)return'';const dash=o.dashed?' stroke-dasharray="10 7"':'';return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="18" fill="${escapeHtml(o.fill)}" fill-opacity=".55" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}/><text x="${o.x+14}" y="${o.y+24}" font-size="15" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function geologyColumnMarkup(spec,o){const rows=String(o.levels||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{const p=line.split('|');return{label:(p[0]||'Level').trim(),value:(p.slice(1).join('|')||'').trim()};});const levels=rows.length?rows:[{label:'Layer',value:'value'}],n=levels.length,base=o.width*.92,top=o.width*.28,lh=o.height*.78/n,cx=o.x+o.width/2,startY=o.y+o.height*.15;let b=`<text x="${cx}" y="${o.y+24}" text-anchor="middle" font-size="18" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text>`;for(let i=0;i<n;i++){const w1=base,w2=base,y1=startY+i*lh,y2=y1+lh,colors=['#fde68a','#fed7aa','#cbd5e1','#fef3c7','#94a3b8'];b+=`<polygon points="${cx-w1/2},${y1} ${cx+w1/2},${y1} ${cx+w2/2},${y2} ${cx-w2/2},${y2}" fill="${colors[i%colors.length]}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${cx}" y="${(y1+y2)/2-2}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(levels[i].label)}</text><text x="${cx}" y="${(y1+y2)/2+16}" text-anchor="middle" font-size="12" fill="${escapeHtml(o.textColor)}">${escapeHtml(levels[i].value)}${o.unit?' '+escapeHtml(o.unit):''}</text>`;}return`<g data-qmx-object="${escapeHtml(o.id)}">${b}</g>`;}
    function geologyOrthogonalPath(a,b){const mx=(a.x+b.x)/2;return`M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;}
    function geologyLinkMarkup(spec,o,map){const source=map.get(o.sourceId),target=map.get(o.targetId),a=source?geologyPortPoint(source,o.sourcePort):{x:o.x1,y:o.y1},b=target?geologyPortPoint(target,o.targetPort):{x:o.x2,y:o.y2},dash=o.dashed?' stroke-dasharray="8 6"':'',marker=o.showArrow?' marker-end="url(#qmx-diagram-arrow)"':'',path=geologyOrthogonalPath(a,b),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};const suffix=spec.geologyShowEnergy&&o.energy?` (${escapeHtml(o.energy)})`:'';const label=o.label?`<text x="${mid.x}" y="${mid.y-9}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}${suffix}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="${path}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}${marker} stroke-linejoin="round"/>${label}</g>`;}
    function geologyLabelMarkup(spec,o,map){if(!spec.geologyShowLabels)return'';const target=map.get(o.targetId),p=target?geologyPortPoint(target,o.targetPort):{x:o.x,y:o.y+o.height/2},lx=o.x,ly=o.y,w=o.width,h=o.height,nearX=p.x<lx?lx:p.x>lx+w?lx+w:lx+w/2,nearY=p.y<ly?ly:p.y>ly+h?ly+h:ly+h/2;return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="M ${p.x} ${p.y} L ${(p.x+nearX)/2} ${p.y} L ${nearX} ${nearY}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${escapeHtml(o.stroke)}"/><rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="8" fill="${escapeHtml(o.fill)}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${lx+10}" y="${ly+h/2+5}" font-size="13" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.text)}</text></g>`;}
    function geologyArrowMarkup(o){const dash=o.dashed?' stroke-dasharray="8 6"':'',label=o.label?`<text x="${(o.x1+o.x2)/2}" y="${(o.y1+o.y2)/2-10}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash} marker-end="url(#qmx-diagram-arrow)"/>${label}</g>`;}
    function geologyMarkup(spec){const targets=spec.objects.filter(o=>['geology-node','geology-zone','geology-pyramid'].includes(o.type)),map=new Map(targets.map(o=>[o.id,o])),grid=geologyGridMarkup(spec),zones=spec.objects.filter(o=>o.type==='geology-zone').map(o=>geologyZoneMarkup(spec,o)).join(''),links=spec.objects.filter(o=>o.type==='geology-link').map(o=>geologyLinkMarkup(spec,o,map)).join(''),nodes=spec.objects.filter(o=>o.type==='geology-node').map(o=>geologyNodeIcon(o)).join(''),pyramids=spec.objects.filter(o=>o.type==='geology-pyramid').map(o=>geologyColumnMarkup(spec,o)).join(''),arrows=spec.objects.filter(o=>o.type==='geology-arrow').map(geologyArrowMarkup).join(''),labels=spec.objects.filter(o=>o.type==='geology-label').map(o=>geologyLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter(o=>o.type==='text').map(generalObjectMarkup).join('');let trophic='';if(spec.geologyShowTrophicLevels){targets.filter(o=>o.type==='geology-node'&&o.trophicLevel>0).forEach(o=>{trophic+=`<text x="${o.x+8}" y="${o.y+16}" font-size="10" font-weight="800" fill="#475569">Level ${o.trophicLevel}</text>`;});}return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${zones}${links}${nodes}${pyramids}${arrows}${labels}${trophic}${texts}</g>`;}

    function hydrologyPortPoint(object,port){const map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},pair=map[port]||map.e;return{x:object.x+object.width*pair[0],y:object.y+object.height*pair[1]};}
    function hydrologyGridMarkup(spec){if(!spec.hydrologyShowGrid)return'';const step=Math.max(5,Number(spec.gridSize||20));return`<defs><pattern id="qmx-hydrology-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-hydrology-grid)"/>`;}
    function hydrologyNodeIcon(o){const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,s=escapeHtml(o.stroke),f=escapeHtml(o.fill),lw=o.lineWidth,label=`<text x="${cx}" y="${y+h+16}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;let b='';
        if(o.kind==='earth'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.44}" fill="#dbeafe" stroke="${s}" stroke-width="${lw}"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.34}" fill="#fed7aa" stroke="#c2410c"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.21}" fill="#fecaca" stroke="#dc2626"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.1}" fill="#fde68a" stroke="#d97706"/>`;}
        else if(['crust','mantle','outer-core','inner-core','rock-layer'].includes(o.kind)){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;for(let i=1;i<4;i++)b+=`<line x1="${x+8}" y1="${y+h*i/4}" x2="${x+w-8}" y2="${y+h*i/4}" stroke="${s}" stroke-opacity=".35"/>`;}
        else if(o.kind==='volcano'){b=`<polygon points="${x+w*.08},${y+h*.9} ${cx-w*.12},${y+h*.25} ${cx+w*.12},${y+h*.25} ${x+w*.92},${y+h*.9}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${cx} ${y+h*.26} C ${cx-w*.08} ${y+h*.48},${cx+w*.08} ${y+h*.62},${cx} ${y+h*.9}" fill="none" stroke="#dc2626" stroke-width="8"/><ellipse cx="${cx}" cy="${y+h*.24}" rx="${w*.13}" ry="${h*.06}" fill="#7f1d1d"/>`;}
        else if(o.kind==='mountain'){b=`<polygon points="${x+8},${y+h*.9} ${x+w*.38},${y+h*.22} ${cx},${y+h*.48} ${x+w*.68},${y+h*.12} ${x+w-8},${y+h*.9}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><polyline points="${x+w*.28},${y+h*.44} ${x+w*.38},${y+h*.22} ${x+w*.47},${y+h*.38}" fill="none" stroke="#fff" stroke-width="5"/>`;}
        else if(['river','tributary','groundwater','irrigation-canal','urban-drain','water-table'].includes(o.kind)){b=`<path d="M ${x+8} ${cy-h*.18} C ${x+w*.25} ${cy-h*.45},${x+w*.35} ${cy+h*.25},${cx} ${cy} S ${x+w*.78} ${cy-h*.3} ${x+w-8} ${cy+h*.18}" fill="none" stroke="${s}" stroke-width="9" stroke-linecap="round"/>`;}
        else if(['lake','reservoir','wetland','floodplain','catchment','watershed'].includes(o.kind)){b=`<path d="M ${x+w*.08} ${cy} C ${x+w*.12} ${y+h*.12},${x+w*.36} ${y+h*.08},${cx} ${y+h*.18} C ${x+w*.72} ${y+h*.05},${x+w*.92} ${y+h*.22},${x+w*.9} ${cy} C ${x+w*.96} ${y+h*.78},${x+w*.72} ${y+h*.92},${cx} ${y+h*.82} C ${x+w*.28} ${y+h*.95},${x+w*.05} ${y+h*.72},${x+w*.08} ${cy} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='dam'||o.kind==='levee'){b=`<polygon points="${x+w*.18},${y+h*.9} ${x+w*.38},${y+h*.15} ${x+w*.62},${y+h*.15} ${x+w*.82},${y+h*.9}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><line x1="${x+w*.42}" y1="${y+h*.25}" x2="${x+w*.58}" y2="${y+h*.25}" stroke="#fff" stroke-width="5"/>`;}
        else if(o.kind==='well'){b=`<rect x="${cx-w*.16}" y="${y+h*.08}" width="${w*.32}" height="${h*.84}" fill="#fff" stroke="${s}" stroke-width="${lw}"/><line x1="${cx}" y1="${y+h*.2}" x2="${cx}" y2="${y+h*.85}" stroke="#0284c7" stroke-width="5"/>`;}
        else if(o.kind==='rainfall'){for(let i=0;i<5;i++)b+=`<line x1="${x+w*(.18+i*.16)}" y1="${y+h*.15}" x2="${x+w*(.1+i*.16)}" y2="${y+h*.78}" stroke="${s}" stroke-width="4"/>`;}
        else if(['infiltration','runoff','evaporation','transpiration'].includes(o.kind)){const up=['evaporation','transpiration'].includes(o.kind);for(let i=0;i<3;i++){const xx=x+w*(.25+i*.25);b+=`<line x1="${xx}" y1="${up?y+h*.82:y+h*.18}" x2="${xx}" y2="${up?y+h*.18:y+h*.82}" stroke="${s}" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/>`;}}
        else if(['aquifer','soil-layer','impermeable-layer'].includes(o.kind)){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;for(let i=1;i<4;i++)b+=`<line x1="${x+8}" y1="${y+h*i/4}" x2="${x+w-8}" y2="${y+h*i/4}" stroke="${s}" stroke-opacity=".35"/>`;}
        else if(o.kind==='delta'){b=`<path d="M ${x+w*.15} ${cy} C ${x+w*.35} ${cy},${x+w*.42} ${cy},${cx} ${cy} M ${cx} ${cy} L ${x+w*.85} ${y+h*.2} M ${cx} ${cy} L ${x+w*.9} ${cy} M ${cx} ${cy} L ${x+w*.85} ${y+h*.8}" fill="none" stroke="${s}" stroke-width="7" stroke-linecap="round"/>`;}
        else if(o.kind==='meander'){b=`<path d="M ${x+8} ${cy} C ${x+w*.18} ${y+h*.12},${x+w*.42} ${y+h*.12},${cx} ${cy} S ${x+w*.82} ${y+h*.88} ${x+w-8} ${cy}" fill="none" stroke="${s}" stroke-width="10" stroke-linecap="round"/>`;}
        else if(o.kind==='spring'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.18}" fill="#38bdf8" stroke="${s}"/><path d="M ${cx} ${cy} C ${cx+w*.18} ${cy-h*.25},${cx+w*.28} ${cy+h*.2},${x+w*.88} ${cy}" fill="none" stroke="${s}" stroke-width="6"/>`;}
        
        else if(['igneous-rock','sedimentary-rock','metamorphic-rock','mineral','sediment','fossil','magma-chamber','lava'].includes(o.kind)){b=`<path d="M ${x+w*.12} ${y+h*.76} L ${x+w*.2} ${y+h*.25} L ${x+w*.56} ${y+h*.12} L ${x+w*.88} ${y+h*.42} L ${x+w*.75} ${y+h*.88} L ${x+w*.3} ${y+h*.92} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;if(o.kind==='fossil')b+=`<path d="M ${x+w*.33} ${cy} C ${x+w*.38} ${y+h*.25},${x+w*.68} ${y+h*.27},${x+w*.66} ${cy} C ${x+w*.64} ${y+h*.7},${x+w*.4} ${y+h*.7},${x+w*.38} ${cy} Z" fill="none" stroke="#92400e" stroke-width="3"/>`;}
        else if(['tectonic-plate','divergent-boundary','convergent-boundary','transform-boundary'].includes(o.kind)){b=`<rect x="${x}" y="${y+h*.34}" width="${w}" height="${h*.44}" rx="8" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;const yy=cy;if(o.kind==='divergent-boundary')b+=`<line x1="${cx-12}" y1="${y+8}" x2="${cx-12}" y2="${y+h-8}" stroke="#dc2626" stroke-width="4"/><line x1="${cx+12}" y1="${y+8}" x2="${cx+12}" y2="${y+h-8}" stroke="#dc2626" stroke-width="4"/><path d="M ${cx-18} ${yy} L ${x+w*.16} ${yy}" stroke="#0284c7" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/><path d="M ${cx+18} ${yy} L ${x+w*.84} ${yy}" stroke="#0284c7" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/>`;else if(o.kind==='convergent-boundary')b+=`<path d="M ${x+w*.12} ${yy} L ${cx-8} ${yy}" stroke="#b91c1c" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/><path d="M ${x+w*.88} ${yy} L ${cx+8} ${yy}" stroke="#b91c1c" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/>`;else if(o.kind==='transform-boundary')b+=`<path d="M ${x+w*.18} ${y+h*.22} L ${x+w*.72} ${y+h*.22}" stroke="#7c3aed" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/><path d="M ${x+w*.82} ${y+h*.88} L ${x+w*.28} ${y+h*.88}" stroke="#7c3aed" stroke-width="4" marker-end="url(#qmx-diagram-arrow)"/>`;}
        else if(o.kind==='fault'){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><line x1="${x+w*.7}" y1="${y}" x2="${x+w*.3}" y2="${y+h}" stroke="#b91c1c" stroke-width="5"/><line x1="${x+8}" y1="${y+h*.34}" x2="${x+w*.55}" y2="${y+h*.34}" stroke="${s}"/><line x1="${x+w*.48}" y1="${y+h*.68}" x2="${x+w-8}" y2="${y+h*.68}" stroke="${s}"/>`;}
        else if(o.kind==='fold'){let p='';for(let i=0;i<4;i++){const yy=y+h*(.25+i*.16);p+=`<path d="M ${x+5} ${yy} Q ${x+w*.25} ${yy-h*.25} ${cx} ${yy} T ${x+w-5} ${yy}" fill="none" stroke="${i%2?s:'#64748b'}" stroke-width="3"/>`;}b=p;}
        else if(o.kind==='earthquake-focus'||o.kind==='epicenter'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.18}" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;for(let i=0;i<4;i++){const r=Math.min(w,h)*(.28+i*.12);b+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s}" stroke-opacity="${.7-i*.12}"/>`;}}
        else if(o.kind==='unconformity'){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" stroke="${s}"/><path d="M ${x} ${cy} Q ${x+w*.18} ${cy-h*.28} ${x+w*.36} ${cy} T ${x+w*.72} ${cy} T ${x+w} ${cy}" fill="none" stroke="#a16207" stroke-width="5"/>`;}
        else{b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${f}" stroke="${s}" stroke-width="${lw}"/><text x="${cx}" y="${cy+6}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;return`<g data-qmx-object="${escapeHtml(o.id)}">${b}</g>`;}
        return`<g data-qmx-object="${escapeHtml(o.id)}">${b}${label}</g>`;}
    function hydrologyZoneMarkup(spec,o){if(!spec.hydrologyShowZones)return'';const dash=o.dashed?' stroke-dasharray="10 7"':'';return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="18" fill="${escapeHtml(o.fill)}" fill-opacity=".55" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}/><text x="${o.x+14}" y="${o.y+24}" font-size="15" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function hydrologyColumnMarkup(spec,o){const rows=String(o.levels||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{const p=line.split('|');return{label:(p[0]||'Item').trim(),value:Number((p.slice(1).join('|')||'0').trim())||0};});const data=rows.length?rows:[{label:'0',value:0}],pad=50,x0=o.x+pad,y0=o.y+o.height-pad,w=o.width-pad*1.4,h=o.height-pad*1.7,max=Math.max(1,...data.map(r=>r.value)),title=`<text x="${o.x+o.width/2}" y="${o.y+28}" text-anchor="middle" font-size="18" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text>`;let b=`<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="14" fill="#fff" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/>${title}<line x1="${x0}" y1="${y0}" x2="${x0+w}" y2="${y0}" stroke="#475569"/><line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0-h}" stroke="#475569"/>`;if(o.kind==='water-balance-chart'){const bw=w/data.length*.62;data.forEach((r,i)=>{const bh=h*r.value/max,xx=x0+(i+.2)*w/data.length;b+=`<rect x="${xx}" y="${y0-bh}" width="${bw}" height="${bh}" fill="#60a5fa" stroke="#2563eb"/><text x="${xx+bw/2}" y="${y0+16}" text-anchor="middle" font-size="10">${escapeHtml(r.label)}</text><text x="${xx+bw/2}" y="${y0-bh-6}" text-anchor="middle" font-size="10">${r.value}${o.unit?' '+escapeHtml(o.unit):''}</text>`;});}else{const pts=data.map((r,i)=>`${x0+(data.length===1?0:i*w/(data.length-1))},${y0-h*r.value/max}`).join(' ');b+=`<polyline points="${pts}" fill="none" stroke="#2563eb" stroke-width="4"/>`;data.forEach((r,i)=>{const xx=x0+(data.length===1?0:i*w/(data.length-1)),yy=y0-h*r.value/max;b+=`<circle cx="${xx}" cy="${yy}" r="5" fill="#fff" stroke="#2563eb" stroke-width="3"/><text x="${xx}" y="${y0+16}" text-anchor="middle" font-size="10">${escapeHtml(r.label)}</text>`;});}return`<g data-qmx-object="${escapeHtml(o.id)}">${b}</g>`;}
    function hydrologyOrthogonalPath(a,b){const mx=(a.x+b.x)/2;return`M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;}
    function hydrologyLinkMarkup(spec,o,map){const source=map.get(o.sourceId),target=map.get(o.targetId),a=source?hydrologyPortPoint(source,o.sourcePort):{x:o.x1,y:o.y1},b=target?hydrologyPortPoint(target,o.targetPort):{x:o.x2,y:o.y2},dash=o.dashed?' stroke-dasharray="8 6"':'',marker=o.showArrow?' marker-end="url(#qmx-diagram-arrow)"':'',path=hydrologyOrthogonalPath(a,b),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};const suffix=spec.hydrologyShowEnergy&&o.energy?` (${escapeHtml(o.energy)})`:'';const label=o.label?`<text x="${mid.x}" y="${mid.y-9}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}${suffix}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="${path}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}${marker} stroke-linejoin="round"/>${label}</g>`;}
    function hydrologyLabelMarkup(spec,o,map){if(!spec.hydrologyShowLabels)return'';const target=map.get(o.targetId),p=target?hydrologyPortPoint(target,o.targetPort):{x:o.x,y:o.y+o.height/2},lx=o.x,ly=o.y,w=o.width,h=o.height,nearX=p.x<lx?lx:p.x>lx+w?lx+w:lx+w/2,nearY=p.y<ly?ly:p.y>ly+h?ly+h:ly+h/2;return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="M ${p.x} ${p.y} L ${(p.x+nearX)/2} ${p.y} L ${nearX} ${nearY}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${escapeHtml(o.stroke)}"/><rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="8" fill="${escapeHtml(o.fill)}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${lx+10}" y="${ly+h/2+5}" font-size="13" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.text)}</text></g>`;}
    function hydrologyArrowMarkup(o){const dash=o.dashed?' stroke-dasharray="8 6"':'',label=o.label?`<text x="${(o.x1+o.x2)/2}" y="${(o.y1+o.y2)/2-10}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash} marker-end="url(#qmx-diagram-arrow)"/>${label}</g>`;}
    function hydrologyMarkup(spec){const targets=spec.objects.filter(o=>['hydrology-node','hydrology-zone','hydrology-pyramid'].includes(o.type)),map=new Map(targets.map(o=>[o.id,o])),grid=hydrologyGridMarkup(spec),zones=spec.objects.filter(o=>o.type==='hydrology-zone').map(o=>hydrologyZoneMarkup(spec,o)).join(''),links=spec.objects.filter(o=>o.type==='hydrology-link').map(o=>hydrologyLinkMarkup(spec,o,map)).join(''),nodes=spec.objects.filter(o=>o.type==='hydrology-node').map(o=>hydrologyNodeIcon(o)).join(''),pyramids=spec.objects.filter(o=>o.type==='hydrology-pyramid').map(o=>hydrologyColumnMarkup(spec,o)).join(''),arrows=spec.objects.filter(o=>o.type==='hydrology-arrow').map(hydrologyArrowMarkup).join(''),labels=spec.objects.filter(o=>o.type==='hydrology-label').map(o=>hydrologyLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter(o=>o.type==='text').map(generalObjectMarkup).join('');let trophic='';if(spec.hydrologyShowTrophicLevels){targets.filter(o=>o.type==='hydrology-node'&&o.trophicLevel>0).forEach(o=>{trophic+=`<text x="${o.x+8}" y="${o.y+16}" font-size="10" font-weight="800" fill="#475569">Level ${o.trophicLevel}</text>`;});}return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${zones}${links}${nodes}${pyramids}${arrows}${labels}${trophic}${texts}</g>`;}




    function environmentalPortPoint(object,port){const map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},pair=map[port]||map.e;return{x:object.x+object.width*pair[0],y:object.y+object.height*pair[1]};}
    function environmentalGridMarkup(spec){if(!spec.environmentalShowGrid)return'';const step=Math.max(5,Number(spec.gridSize||20));return`<defs><pattern id="qmx-environmental-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#dcfce7" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-environmental-grid)"/>`;}
    function environmentalNodeMarkup(o){const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,s=escapeHtml(o.stroke),f=escapeHtml(o.fill),lw=o.lineWidth,label=`<text x="${cx}" y="${y+h+16}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;let b='';
        if(['factory','power-plant','incinerator','wastewater-plant'].includes(o.kind)){b=`<rect x="${x+8}" y="${y+h*.35}" width="${w-16}" height="${h*.58}" rx="8" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.12} ${y+h*.35} L ${x+w*.28} ${y+h*.16} L ${x+w*.42} ${y+h*.35} L ${x+w*.58} ${y+h*.16} L ${x+w*.72} ${y+h*.35}" fill="none" stroke="${s}" stroke-width="${lw}"/><rect x="${x+w*.75}" y="${y+h*.05}" width="${w*.11}" height="${h*.45}" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='vehicle'){b=`<path d="M ${x+w*.12} ${y+h*.67} L ${x+w*.22} ${y+h*.35} L ${x+w*.68} ${y+h*.35} L ${x+w*.84} ${y+h*.67} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${x+w*.28}" cy="${y+h*.72}" r="${Math.min(w,h)*.11}" fill="#fff" stroke="${s}" stroke-width="${lw}"/><circle cx="${x+w*.7}" cy="${y+h*.72}" r="${Math.min(w,h)*.11}" fill="#fff" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='chimney'){b=`<path d="M ${x+w*.32} ${y+h*.92} L ${x+w*.42} ${y+h*.12} L ${x+w*.66} ${y+h*.12} L ${x+w*.76} ${y+h*.92} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${x+w*.7}" cy="${y+h*.1}" r="${w*.16}" fill="#cbd5e1" opacity=".75"/><circle cx="${x+w*.9}" cy="${y+h*.04}" r="${w*.12}" fill="#94a3b8" opacity=".65"/>`;}
        else if(o.kind==='sewage-outfall'){b=`<rect x="${x+w*.08}" y="${y+h*.25}" width="${w*.55}" height="${h*.3}" rx="8" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.63} ${y+h*.4} Q ${x+w*.8} ${y+h*.65} ${x+w*.95} ${y+h*.62}" fill="none" stroke="#0284c7" stroke-width="7"/><path d="M ${x+w*.08} ${y+h*.78} Q ${x+w*.25} ${y+h*.65} ${x+w*.42} ${y+h*.78} T ${x+w*.78} ${y+h*.78}" fill="none" stroke="#0ea5e9" stroke-width="4"/>`;}
        else if(o.kind==='landfill'){b=`<path d="M ${x+w*.05} ${y+h*.85} Q ${x+w*.25} ${y+h*.35} ${x+w*.5} ${y+h*.45} Q ${x+w*.72} ${y+h*.22} ${x+w*.95} ${y+h*.85} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.25} ${y+h*.5} l 18 -12 m 18 26 l 20 -14 m 22 18 l 18 -10" stroke="${s}" stroke-width="3"/>`;}
        else if(o.kind==='recycling-bin'){b=`<rect x="${x+w*.2}" y="${y+h*.18}" width="${w*.6}" height="${h*.7}" rx="10" fill="${f}" stroke="${s}" stroke-width="${lw}"/><text x="${cx}" y="${cy+h*.12}" text-anchor="middle" font-size="${Math.min(w,h)*.38}" font-weight="900" fill="${s}">♻</text>`;}
        else if(o.kind==='compost'){b=`<path d="M ${x+w*.08} ${y+h*.82} Q ${x+w*.3} ${y+h*.25} ${x+w*.52} ${y+h*.55} Q ${x+w*.72} ${y+h*.3} ${x+w*.94} ${y+h*.82} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${cx} ${y+h*.55} Q ${cx+w*.18} ${y+h*.25} ${cx+w*.27} ${y+h*.55} Q ${cx+w*.12} ${y+h*.75} ${cx} ${y+h*.55}" fill="#86efac" stroke="#166534"/>`;}
        else if(['scrubber','catalytic-converter'].includes(o.kind)){b=`<rect x="${x+w*.08}" y="${y+h*.18}" width="${w*.84}" height="${h*.64}" rx="14" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.18} ${cy} H ${x+w*.82}" stroke="${s}" stroke-width="4"/><path d="M ${x+w*.38} ${y+h*.27} V ${y+h*.73} M ${x+w*.58} ${y+h*.27} V ${y+h*.73}" stroke="${s}" stroke-width="3" stroke-dasharray="5 4"/>`;}
        else if(o.kind==='solar-panel'){b=`<path d="M ${x+w*.1} ${y+h*.72} L ${x+w*.22} ${y+h*.2} L ${x+w*.9} ${y+h*.2} L ${x+w*.78} ${y+h*.72} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.31} ${y+h*.2} L ${x+w*.22} ${y+h*.72} M ${x+w*.48} ${y+h*.2} L ${x+w*.42} ${y+h*.72} M ${x+w*.66} ${y+h*.2} L ${x+w*.62} ${y+h*.72} M ${x+w*.2} ${y+h*.45} H ${x+w*.84}" stroke="${s}" stroke-width="2"/>`;}
        else if(o.kind==='wind-turbine'){b=`<line x1="${cx}" y1="${y+h*.28}" x2="${cx}" y2="${y+h*.92}" stroke="${s}" stroke-width="6"/><circle cx="${cx}" cy="${y+h*.26}" r="8" fill="${f}" stroke="${s}" stroke-width="3"/><path d="M ${cx} ${y+h*.26} L ${cx-w*.32} ${y+h*.12} M ${cx} ${y+h*.26} L ${cx+w*.28} ${y+h*.04} M ${cx} ${y+h*.26} L ${cx+w*.08} ${y+h*.58}" stroke="${s}" stroke-width="5" stroke-linecap="round"/>`;}
        else if(o.kind==='tree'){b=`<rect x="${cx-w*.06}" y="${y+h*.46}" width="${w*.12}" height="${h*.45}" fill="#92400e"/><circle cx="${cx}" cy="${y+h*.32}" r="${Math.min(w,h)*.28}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${cx-w*.2}" cy="${y+h*.4}" r="${Math.min(w,h)*.2}" fill="${f}" stroke="${s}"/><circle cx="${cx+w*.2}" cy="${y+h*.4}" r="${Math.min(w,h)*.2}" fill="${f}" stroke="${s}"/>`;}
        else if(o.kind==='wetland'){b=`<path d="M ${x+w*.05} ${y+h*.72} Q ${x+w*.25} ${y+h*.58} ${x+w*.45} ${y+h*.72} T ${x+w*.85} ${y+h*.72}" fill="none" stroke="#0284c7" stroke-width="5"/><path d="M ${x+w*.2} ${y+h*.7} V ${y+h*.2} M ${x+w*.45} ${y+h*.72} V ${y+h*.28} M ${x+w*.7} ${y+h*.72} V ${y+h*.16}" stroke="${s}" stroke-width="4"/><path d="M ${x+w*.2} ${y+h*.32} l -12 -12 M ${x+w*.45} ${y+h*.42} l 14 -13 M ${x+w*.7} ${y+h*.28} l -12 -13" stroke="${s}" stroke-width="3"/>`;}
        else if(o.kind==='river'){b=`<path d="M ${x+w*.05} ${y+h*.2} C ${x+w*.28} ${y+h*.05},${x+w*.25} ${y+h*.75},${x+w*.5} ${y+h*.55} S ${x+w*.72} ${y+h*.08},${x+w*.95} ${y+h*.3}" fill="none" stroke="${s}" stroke-width="12" stroke-linecap="round"/>`;}
        else if(o.kind==='city'){b=`<rect x="${x+w*.08}" y="${y+h*.35}" width="${w*.22}" height="${h*.55}" fill="${f}" stroke="${s}"/><rect x="${x+w*.34}" y="${y+h*.16}" width="${w*.25}" height="${h*.74}" fill="${f}" stroke="${s}"/><rect x="${x+w*.64}" y="${y+h*.28}" width="${w*.28}" height="${h*.62}" fill="${f}" stroke="${s}"/><path d="M ${x+w*.14} ${y+h*.48} h 10 m 8 0 h 10 M ${x+w*.41} ${y+h*.3} h 12 m 10 0 h 12 M ${x+w*.72} ${y+h*.42} h 12 m 10 0 h 12" stroke="#fff" stroke-width="4"/>`;}
        else if(o.kind==='farm'){b=`<rect x="${x+w*.06}" y="${y+h*.18}" width="${w*.88}" height="${h*.68}" rx="8" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.1} ${y+h*.76} L ${x+w*.9} ${y+h*.32} M ${x+w*.1} ${y+h*.55} L ${x+w*.72} ${y+h*.2} M ${x+w*.28} ${y+h*.86} L ${x+w*.94} ${y+h*.48}" stroke="${s}" stroke-width="3"/>`;}
        else if(o.kind==='monitoring-station'){b=`<rect x="${x+w*.22}" y="${y+h*.42}" width="${w*.56}" height="${h*.42}" rx="8" fill="${f}" stroke="${s}" stroke-width="${lw}"/><line x1="${cx}" y1="${y+h*.42}" x2="${cx}" y2="${y+h*.08}" stroke="${s}" stroke-width="5"/><path d="M ${cx} ${y+h*.18} q ${w*.18} ${h*.08} 0 ${h*.16} M ${cx} ${y+h*.12} q ${w*.3} ${h*.14} 0 ${h*.28}" fill="none" stroke="${s}" stroke-width="3"/>`;}
        else if(o.kind==='noise-pollution'){b=`<path d="M ${x+w*.18} ${cy-h*.12} H ${x+w*.36} L ${x+w*.55} ${y+h*.18} V ${y+h*.82} L ${x+w*.36} ${cy+h*.12} H ${x+w*.18} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.62} ${y+h*.3} Q ${x+w*.82} ${cy} ${x+w*.62} ${y+h*.7} M ${x+w*.72} ${y+h*.18} Q ${x+w*.98} ${cy} ${x+w*.72} ${y+h*.82}" fill="none" stroke="${s}" stroke-width="4"/>`;}
        else if(o.kind==='acid-rain'){b=`<path d="M ${x+w*.18} ${y+h*.42} Q ${x+w*.2} ${y+h*.16} ${x+w*.45} ${y+h*.2} Q ${x+w*.56} ${y+h*.03} ${x+w*.72} ${y+h*.24} Q ${x+w*.9} ${y+h*.24} ${x+w*.9} ${y+h*.45} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.28} ${y+h*.55} l -10 24 M ${x+w*.5} ${y+h*.55} l -10 24 M ${x+w*.72} ${y+h*.55} l -10 24" stroke="#4338ca" stroke-width="5"/><text x="${cx}" y="${y+h*.95}" text-anchor="middle" font-size="14" font-weight="900" fill="${s}">pH ↓</text>`;}
        else if(['air-pollution','greenhouse-gas'].includes(o.kind)){b=`<path d="M ${x+w*.12} ${y+h*.64} Q ${x+w*.08} ${y+h*.36} ${x+w*.34} ${y+h*.34} Q ${x+w*.42} ${y+h*.08} ${x+w*.62} ${y+h*.3} Q ${x+w*.9} ${y+h*.22} ${x+w*.9} ${y+h*.56} Q ${x+w*.82} ${y+h*.78} ${x+w*.56} ${y+h*.68} Q ${x+w*.28} ${y+h*.84} ${x+w*.12} ${y+h*.64} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><text x="${cx}" y="${cy+6}" text-anchor="middle" font-size="18" font-weight="900" fill="${s}">${o.kind==='greenhouse-gas'?'CO₂':'PM'}</text>`;}
        else if(o.kind==='water-pollution'){b=`<path d="M ${cx} ${y+h*.08} C ${x+w*.72} ${y+h*.36},${x+w*.8} ${y+h*.58},${cx} ${y+h*.88} C ${x+w*.2} ${y+h*.58},${x+w*.28} ${y+h*.36},${cx} ${y+h*.08} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.34} ${y+h*.62} Q ${cx} ${y+h*.5} ${x+w*.66} ${y+h*.62}" fill="none" stroke="#1d4ed8" stroke-width="4"/>`;}
        else if(o.kind==='soil-pollution'){b=`<rect x="${x+w*.08}" y="${y+h*.26}" width="${w*.84}" height="${h*.62}" rx="10" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.08} ${y+h*.48} H ${x+w*.92} M ${x+w*.08} ${y+h*.68} H ${x+w*.92}" stroke="${s}" stroke-width="3"/><path d="M ${cx} ${y+h*.18} l 12 20 h -24 z" fill="#dc2626"/><text x="${cx}" y="${y+h*.17}" text-anchor="middle" font-size="14" font-weight="900" fill="#fff">!</text>`;}
        else if(o.kind==='plastic-waste'){b=`<path d="M ${x+w*.38} ${y+h*.1} H ${x+w*.62} V ${y+h*.25} Q ${x+w*.72} ${y+h*.34} ${x+w*.68} ${y+h*.86} H ${x+w*.32} Q ${x+w*.28} ${y+h*.34} ${x+w*.38} ${y+h*.25} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.34} ${y+h*.48} H ${x+w*.66}" stroke="${s}" stroke-width="3"/>`;}
        else {b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}
        return`<g transform="rotate(${o.rotation||0} ${cx} ${cy})">${b}</g>${label}`;
    }
    function environmentalZoneMarkup(spec,o){if(!spec.environmentalShowZones)return'';return`<g><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="18" fill="${escapeHtml(o.fill)}" fill-opacity=".34" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}" ${o.dashed?'stroke-dasharray="10 7"':''}/><text x="${o.x+14}" y="${o.y+24}" font-size="14" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function environmentalOrthogonalPath(a,b){const mx=(a.x+b.x)/2;return`M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;}
    function environmentalLinkMarkup(spec,o,map){const source=map.get(o.sourceId),target=map.get(o.targetId),a=source?environmentalPortPoint(source,o.sourcePort):{x:o.x1,y:o.y1},b=target?environmentalPortPoint(target,o.targetPort):{x:o.x2,y:o.y2},path=environmentalOrthogonalPath(a,b),dash=o.dashed?'stroke-dasharray="9 6"':'',marker=o.showArrow?'marker-end="url(#qmx-diagram-arrow)"':'',mx=(a.x+b.x)/2,my=(a.y+b.y)/2-7,value=spec.environmentalShowEnergy&&o.energy?` (${escapeHtml(o.energy)})`:'';return`<g><path d="${path}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}" ${dash} ${marker}/>${o.label?`<text x="${mx}" y="${my}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}${value}</text>`:''}</g>`;}
    function environmentalLabelMarkup(spec,o,map){if(!spec.environmentalShowLabels)return'';const target=map.get(o.targetId),a=target?environmentalPortPoint(target,o.targetPort):null,b={x:o.x,y:o.y+o.height/2};return`<g>${a?`<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}" fill="none"/>`:''}<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="9" fill="${escapeHtml(o.fill)}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${o.x+10}" y="${o.y+o.height/2+5}" font-size="13" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.text)}</text></g>`;}
    function environmentalArrowMarkup(o){const mx=(o.x1+o.x2)/2,my=(o.y1+o.y2)/2-8;return`<g><path d="M ${o.x1} ${o.y1} L ${o.x2} ${o.y2}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}" ${o.dashed?'stroke-dasharray="9 6"':''} marker-end="url(#qmx-diagram-arrow)"/>${o.label?`<text x="${mx}" y="${my}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`:''}</g>`;}
    function environmentalChartMarkup(spec,o){const rows=String(o.levels||'').split(/\r?\n/).map(line=>line.split('|')).filter(parts=>parts[0]);const x=o.x,y=o.y,w=o.width,h=o.height,pad=50,innerW=w-pad*2,innerH=h-95,max=Math.max(1,...rows.map(parts=>Math.abs(Number(parts[1]))||0));let body=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${escapeHtml(o.fill)}" fill-opacity=".28" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${x+w/2}" y="${y+30}" text-anchor="middle" font-size="16" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text>`;if(o.kind==='waste-hierarchy'){const n=Math.max(1,rows.length),step=innerH/n;rows.forEach((parts,i)=>{const ratio=(n-i)/n,bw=innerW*ratio,bx=x+pad+(innerW-bw)/2,by=y+50+i*step;body+=`<path d="M ${bx} ${by} L ${bx+bw} ${by} L ${bx+bw-step*.18} ${by+step-5} L ${bx+step*.18} ${by+step-5} Z" fill="${i%2?'#bbf7d0':'#86efac'}" stroke="${escapeHtml(o.stroke)}"/><text x="${x+w/2}" y="${by+step*.58}" text-anchor="middle" font-size="13" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(parts[0])}</text>`;});}else if(o.kind==='impact-matrix'){const n=Math.max(1,rows.length),rh=innerH/n;rows.forEach((parts,i)=>{const value=Math.abs(Number(parts[1]))||0,bw=innerW*(value/max),by=y+55+i*rh;body+=`<text x="${x+pad-8}" y="${by+rh*.62}" text-anchor="end" font-size="12" fill="${escapeHtml(o.textColor)}">${escapeHtml(parts[0])}</text><rect x="${x+pad}" y="${by+6}" width="${bw}" height="${Math.max(10,rh-12)}" rx="5" fill="#86efac" stroke="${escapeHtml(o.stroke)}"/><text x="${x+pad+bw+6}" y="${by+rh*.62}" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(parts[1]||'')}</text>`;});}else{const n=Math.max(1,rows.length),gap=8,bw=(innerW-gap*(n-1))/n,baseY=y+h-45;rows.forEach((parts,i)=>{const value=Math.abs(Number(parts[1]))||0,bh=innerH*(value/max),bx=x+pad+i*(bw+gap),by=baseY-bh;body+=`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="5" fill="#60a5fa" stroke="${escapeHtml(o.stroke)}"/><text x="${bx+bw/2}" y="${baseY+17}" text-anchor="middle" font-size="11" fill="${escapeHtml(o.textColor)}">${escapeHtml(parts[0])}</text><text x="${bx+bw/2}" y="${by-6}" text-anchor="middle" font-size="11" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(parts[1]||'')}</text>`;});}return`<g>${body}</g>`;}
    function environmentalMarkup(spec){const targets=spec.objects.filter(o=>['environmental-node','environmental-zone','environmental-pyramid'].includes(o.type)),map=new Map(targets.map(o=>[o.id,o])),grid=environmentalGridMarkup(spec),zones=spec.objects.filter(o=>o.type==='environmental-zone').map(o=>environmentalZoneMarkup(spec,o)).join(''),links=spec.objects.filter(o=>o.type==='environmental-link').map(o=>environmentalLinkMarkup(spec,o,map)).join(''),nodes=spec.objects.filter(o=>o.type==='environmental-node').map(environmentalNodeMarkup).join(''),charts=spec.objects.filter(o=>o.type==='environmental-pyramid').map(o=>environmentalChartMarkup(spec,o)).join(''),arrows=spec.objects.filter(o=>o.type==='environmental-arrow').map(environmentalArrowMarkup).join(''),labels=spec.objects.filter(o=>o.type==='environmental-label').map(o=>environmentalLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter(o=>o.type==='text').map(generalObjectMarkup).join('');let risk='';if(spec.environmentalShowTrophicLevels){targets.filter(o=>o.type==='environmental-node'&&o.trophicLevel>0).forEach(o=>{risk+=`<text x="${o.x+8}" y="${o.y+16}" font-size="10" font-weight="800" fill="#475569">Risk level ${o.trophicLevel}</text>`;});}return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${zones}${links}${nodes}${charts}${arrows}${labels}${risk}${texts}</g>`;}

    function oceanographyPortPoint(object,port){const map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},pair=map[port]||map.e;return{x:object.x+object.width*pair[0],y:object.y+object.height*pair[1]};}
    function oceanographyGridMarkup(spec){if(!spec.oceanographyShowGrid)return'';const step=Math.max(5,Number(spec.gridSize||20));return`<defs><pattern id="qmx-oceanography-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#dbeafe" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-oceanography-grid)"/>`;}
    function oceanographyNodeIcon(o){const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,s=escapeHtml(o.stroke),f=escapeHtml(o.fill),lw=o.lineWidth,label=`<text x="${cx}" y="${y+h+16}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;let b='';
        if(['ocean','lagoon','estuary'].includes(o.kind)){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+8} ${cy} Q ${x+w*.2} ${cy-15} ${x+w*.36} ${cy} T ${x+w*.68} ${cy} T ${x+w-8} ${cy}" fill="none" stroke="${s}" stroke-width="4"/>`;}
        else if(o.kind==='coastline'||o.kind==='beach'){b=`<path d="M ${x} ${y+h*.25} Q ${x+w*.25} ${y+h*.05} ${x+w*.48} ${y+h*.38} T ${x+w} ${y+h*.45} L ${x+w} ${y+h} L ${x} ${y+h} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x} ${y+h*.48} Q ${x+w*.22} ${y+h*.30} ${x+w*.46} ${y+h*.58} T ${x+w} ${y+h*.62}" fill="none" stroke="#0284c7" stroke-width="4"/>`;}
        else if(o.kind==='sea-cliff'){b=`<path d="M ${x+8} ${y+h} L ${x+w*.35} ${y+h*.2} L ${x+w*.68} ${y+h*.12} L ${x+w-8} ${y+h} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x} ${y+h*.78} Q ${x+w*.22} ${y+h*.62} ${x+w*.45} ${y+h*.78}" fill="none" stroke="#0284c7" stroke-width="4"/>`;}
        else if(o.kind==='wave'){b=`<path d="M ${x} ${cy} C ${x+w*.12} ${y+h*.08},${x+w*.28} ${y+h*.08},${x+w*.4} ${cy} S ${x+w*.68} ${y+h*.92},${x+w*.8} ${cy} S ${x+w*.95} ${y+h*.08},${x+w} ${cy}" fill="none" stroke="${s}" stroke-width="${Math.max(4,lw)}"/><line x1="${x}" y1="${y+h*.82}" x2="${x+w}" y2="${y+h*.82}" stroke="${s}" stroke-opacity=".45"/>`;}
        else if(o.kind==='tide'){b=`<rect x="${x+w*.12}" y="${y+h*.2}" width="${w*.76}" height="${h*.62}" rx="14" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${cx} ${y+h*.7} L ${cx} ${y+h*.24}" stroke="${s}" stroke-width="5" marker-end="url(#qmx-diagram-arrow)"/><path d="M ${cx-28} ${y+h*.28} L ${cx-28} ${y+h*.66}" stroke="${s}" stroke-width="5" marker-end="url(#qmx-diagram-arrow)"/>`;}
        else if(['surface-current','deep-current'].includes(o.kind)){const yy=o.kind==='deep-current'?y+h*.65:y+h*.35;b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.12} ${yy} C ${x+w*.34} ${yy-h*.22},${x+w*.62} ${yy+h*.22},${x+w*.88} ${yy}" fill="none" stroke="${s}" stroke-width="5" marker-end="url(#qmx-diagram-arrow)"/>`;}
        else if(o.kind==='gyre'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.38}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${cx+40} ${cy} A 42 42 0 1 1 ${cx-15} ${cy-39}" fill="none" stroke="${s}" stroke-width="5" marker-end="url(#qmx-diagram-arrow)"/>`;}
        else if(o.kind==='upwelling'||o.kind==='downwelling'){const up=o.kind==='upwelling',y1=up?y+h*.82:y+h*.18,y2=up?y+h*.18:y+h*.82;b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="15" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${cx} ${y1} L ${cx} ${y2}" stroke="${s}" stroke-width="6" marker-end="url(#qmx-diagram-arrow)"/><path d="M ${x+w*.18} ${cy} L ${x+w*.82} ${cy}" stroke="${s}" stroke-opacity=".55" stroke-width="3"/>`;}
        else if(o.kind==='coral-reef'){b=`<path d="M ${x+w*.08} ${y+h*.9} L ${x+w*.22} ${y+h*.48} L ${x+w*.32} ${y+h*.68} L ${x+w*.44} ${y+h*.22} L ${x+w*.54} ${y+h*.62} L ${x+w*.68} ${y+h*.34} L ${x+w*.82} ${y+h*.9} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${x+w*.25}" cy="${y+h*.35}" r="8" fill="#f472b6"/><circle cx="${x+w*.68}" cy="${y+h*.22}" r="7" fill="#fb7185"/>`;}
        else if(o.kind==='mangrove'){b=`<path d="M ${cx} ${y+h*.2} L ${cx} ${y+h*.62} M ${cx} ${y+h*.3} L ${x+w*.28} ${y+h*.1} M ${cx} ${y+h*.3} L ${x+w*.72} ${y+h*.08} M ${cx} ${y+h*.62} L ${x+w*.24} ${y+h*.92} M ${cx} ${y+h*.62} L ${x+w*.76} ${y+h*.92}" stroke="${s}" stroke-width="6" fill="none"/><circle cx="${cx}" cy="${y+h*.18}" r="${Math.min(w,h)*.18}" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(['continental-shelf','continental-slope','abyssal-plain','mid-ocean-ridge','ocean-trench','seamount','submarine-canyon'].includes(o.kind)){let path=`M ${x} ${y+h*.25} `;if(o.kind==='continental-shelf')path+=`L ${x+w*.75} ${y+h*.35} L ${x+w} ${y+h*.85}`;else if(o.kind==='continental-slope')path+=`L ${x+w*.25} ${y+h*.28} L ${x+w*.85} ${y+h*.9} L ${x+w} ${y+h*.9}`;else if(o.kind==='abyssal-plain')path+=`L ${x+w*.12} ${y+h*.78} L ${x+w*.9} ${y+h*.78} L ${x+w} ${y+h*.7}`;else if(o.kind==='mid-ocean-ridge')path+=`L ${x+w*.22} ${y+h*.82} L ${cx} ${y+h*.2} L ${x+w*.78} ${y+h*.82} L ${x+w} ${y+h*.7}`;else if(o.kind==='ocean-trench')path+=`L ${x+w*.35} ${y+h*.72} L ${cx} ${y+h*.95} L ${x+w*.65} ${y+h*.7} L ${x+w} ${y+h*.35}`;else if(o.kind==='seamount')path+=`L ${x+w*.2} ${y+h*.82} L ${cx} ${y+h*.22} L ${x+w*.8} ${y+h*.82} L ${x+w} ${y+h*.75}`;else path+=`L ${x+w*.2} ${y+h*.72} L ${x+w*.42} ${y+h*.45} L ${x+w*.58} ${y+h*.82} L ${x+w} ${y+h*.62}`;b=`<path d="${path} L ${x+w} ${y+h} L ${x} ${y+h} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(['mixed-layer','thermocline','halocline'].includes(o.kind)){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+10} ${cy} Q ${x+w*.22} ${cy-12} ${x+w*.4} ${cy} T ${x+w*.75} ${cy} T ${x+w-10} ${cy}" fill="none" stroke="${s}" stroke-width="3"/>`;}
        else if(o.kind==='research-vessel'){b=`<path d="M ${x+w*.08} ${y+h*.58} L ${x+w*.88} ${y+h*.58} L ${x+w*.72} ${y+h*.86} L ${x+w*.22} ${y+h*.86} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><rect x="${x+w*.35}" y="${y+h*.28}" width="${w*.35}" height="${h*.3}" fill="#fff" stroke="${s}"/><line x1="${x+w*.52}" y1="${y+h*.28}" x2="${x+w*.52}" y2="${y+h*.08}" stroke="${s}" stroke-width="3"/>`;}
        else if(o.kind==='buoy'){b=`<circle cx="${cx}" cy="${y+h*.68}" r="${Math.min(w,h)*.22}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><line x1="${cx}" y1="${y+h*.18}" x2="${cx}" y2="${y+h*.52}" stroke="${s}" stroke-width="5"/><path d="M ${cx-20} ${y+h*.24} L ${cx} ${y+h*.08} L ${cx+20} ${y+h*.24} Z" fill="#ef4444"/>`;}
        else{b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${f}" stroke="${s}" stroke-width="${lw}"/><text x="${cx}" y="${cy+6}" text-anchor="middle" font-size="14" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;return`<g data-qmx-object="${escapeHtml(o.id)}">${b}</g>`;}
        return`<g data-qmx-object="${escapeHtml(o.id)}">${b}${label}</g>`;}
    function oceanographyZoneMarkup(spec,o){if(!spec.oceanographyShowZones)return'';const dash=o.dashed?' stroke-dasharray="10 7"':'';return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="18" fill="${escapeHtml(o.fill)}" fill-opacity=".45" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}/><text x="${o.x+14}" y="${o.y+24}" font-size="15" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function oceanographyChartMarkup(spec,o){const rows=String(o.levels||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{const p=line.split('|');return{label:(p[0]||'Item').trim(),value:Number((p.slice(1).join('|')||'0').replace(/[^0-9+-.]/g,''))||0};});const data=rows.length?rows:[{label:'0',value:0}],pad=52,x0=o.x+pad,y0=o.y+o.height-pad,w=o.width-pad*1.4,h=o.height-pad*1.7,min=Math.min(0,...data.map(r=>r.value)),max=Math.max(1,...data.map(r=>r.value)),range=Math.max(1,max-min),title=`<text x="${o.x+o.width/2}" y="${o.y+28}" text-anchor="middle" font-size="18" font-weight="900" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text>`;let b=`<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="14" fill="#fff" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/>${title}<line x1="${x0}" y1="${y0}" x2="${x0+w}" y2="${y0}" stroke="#475569"/><line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0-h}" stroke="#475569"/>`;const pts=data.map((r,i)=>`${x0+(data.length===1?0:i*w/(data.length-1))},${y0-h*(r.value-min)/range}`).join(' ');b+=`<polyline points="${pts}" fill="none" stroke="#0284c7" stroke-width="4"/>`;data.forEach((r,i)=>{const xx=x0+(data.length===1?0:i*w/(data.length-1)),yy=y0-h*(r.value-min)/range;b+=`<circle cx="${xx}" cy="${yy}" r="5" fill="#fff" stroke="#0284c7" stroke-width="3"/><text x="${xx}" y="${y0+16}" text-anchor="middle" font-size="10">${escapeHtml(r.label)}</text>`;});return`<g data-qmx-object="${escapeHtml(o.id)}">${b}</g>`;}
    function oceanographyOrthogonalPath(a,b){const mx=(a.x+b.x)/2;return`M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;}
    function oceanographyLinkMarkup(spec,o,map){const source=map.get(o.sourceId),target=map.get(o.targetId),a=source?oceanographyPortPoint(source,o.sourcePort):{x:o.x1,y:o.y1},b=target?oceanographyPortPoint(target,o.targetPort):{x:o.x2,y:o.y2},dash=o.dashed?' stroke-dasharray="8 6"':'',marker=o.showArrow?' marker-end="url(#qmx-diagram-arrow)"':'',path=oceanographyOrthogonalPath(a,b),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};const suffix=spec.oceanographyShowEnergy&&o.energy?` (${escapeHtml(o.energy)})`:'';const label=o.label?`<text x="${mid.x}" y="${mid.y-9}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}${suffix}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="${path}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}${marker} stroke-linejoin="round"/>${label}</g>`;}
    function oceanographyLabelMarkup(spec,o,map){if(!spec.oceanographyShowLabels)return'';const target=map.get(o.targetId),p=target?oceanographyPortPoint(target,o.targetPort):{x:o.x,y:o.y+o.height/2},lx=o.x,ly=o.y,w=o.width,h=o.height,nearX=p.x<lx?lx:p.x>lx+w?lx+w:lx+w/2,nearY=p.y<ly?ly:p.y>ly+h?ly+h:ly+h/2;return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="M ${p.x} ${p.y} L ${(p.x+nearX)/2} ${p.y} L ${nearX} ${nearY}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${escapeHtml(o.stroke)}"/><rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="8" fill="${escapeHtml(o.fill)}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${lx+10}" y="${ly+h/2+5}" font-size="13" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.text)}</text></g>`;}
    function oceanographyArrowMarkup(o){const dash=o.dashed?' stroke-dasharray="8 6"':'',label=o.label?`<text x="${(o.x1+o.x2)/2}" y="${(o.y1+o.y2)/2-10}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash} marker-end="url(#qmx-diagram-arrow)"/>${label}</g>`;}
    function oceanographyMarkup(spec){const targets=spec.objects.filter(o=>['oceanography-node','oceanography-zone','oceanography-pyramid'].includes(o.type)),map=new Map(targets.map(o=>[o.id,o])),grid=oceanographyGridMarkup(spec),zones=spec.objects.filter(o=>o.type==='oceanography-zone').map(o=>oceanographyZoneMarkup(spec,o)).join(''),links=spec.objects.filter(o=>o.type==='oceanography-link').map(o=>oceanographyLinkMarkup(spec,o,map)).join(''),nodes=spec.objects.filter(o=>o.type==='oceanography-node').map(o=>oceanographyNodeIcon(o)).join(''),charts=spec.objects.filter(o=>o.type==='oceanography-pyramid').map(o=>oceanographyChartMarkup(spec,o)).join(''),arrows=spec.objects.filter(o=>o.type==='oceanography-arrow').map(oceanographyArrowMarkup).join(''),labels=spec.objects.filter(o=>o.type==='oceanography-label').map(o=>oceanographyLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter(o=>o.type==='text').map(generalObjectMarkup).join('');let levels='';if(spec.oceanographyShowTrophicLevels){targets.filter(o=>o.type==='oceanography-node'&&o.trophicLevel>0).forEach(o=>{levels+=`<text x="${o.x+8}" y="${o.y+16}" font-size="10" font-weight="800" fill="#475569">Depth level ${o.trophicLevel}</text>`;});}return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${zones}${links}${nodes}${charts}${arrows}${labels}${levels}${texts}</g>`;}

    function geneticsPortPoint(object,port){const map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},pair=map[port]||map.e;return{x:object.x+object.width*pair[0],y:object.y+object.height*pair[1]};}
    function geneticsGridMarkup(spec){if(!spec.geneticsShowGrid)return'';const step=Math.max(5,Number(spec.gridSize||20));return`<defs><pattern id="qmx-genetics-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-genetics-grid)"/>`;}
    function geneticsHelixPath(x,y,w,h,phase){const n=48,pts=[];for(let i=0;i<=n;i++){const t=i/n,yy=y+t*h,xx=x+w/2+Math.sin(t*Math.PI*6+phase)*w*.34;pts.push(`${i?'L':'M'} ${xx.toFixed(2)} ${yy.toFixed(2)}`);}return pts.join(' ');}
    function geneticsStructureMarkup(spec,o){if(!spec.geneticsShowStructures)return'';const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,stroke=escapeHtml(o.stroke),fill=escapeHtml(o.fill),lw=o.lineWidth;let b='';if(o.kind==='dna-helix'){const p1=geneticsHelixPath(x,y+20,w,h-40,0),p2=geneticsHelixPath(x,y+20,w,h-40,Math.PI);let rungs='';const n=Math.max(4,o.detailCount);for(let i=0;i<n;i++){const t=(i+.5)/n,yy=y+20+t*(h-40),x1=cx+Math.sin(t*Math.PI*6)*w*.34,x2=cx-Math.sin(t*Math.PI*6)*w*.34;const colors=i%2?['#ef4444','#f59e0b']:['#3b82f6','#22c55e'];rungs+=`<line x1="${x1}" y1="${yy}" x2="${x2}" y2="${yy}" stroke="#94a3b8" stroke-width="2"/><circle cx="${x1}" cy="${yy}" r="5" fill="${colors[0]}"/><circle cx="${x2}" cy="${yy}" r="5" fill="${colors[1]}"/>`;}b=`<path d="${p1}" fill="none" stroke="${stroke}" stroke-width="${Math.max(3,lw*1.8)}"/><path d="${p2}" fill="none" stroke="#7c3aed" stroke-width="${Math.max(3,lw*1.8)}"/>${spec.geneticsShowDetails?rungs:''}`;}else{const arm=w*.23;const top=y+h*.05,bottom=y+h*.95,mid=cy;let bands='';const n=Math.max(3,o.detailCount);for(let i=1;i<n;i++){const yy=y+h*i/n;bands+=`<line x1="${cx-arm*.65}" y1="${yy}" x2="${cx+arm*.65}" y2="${yy}" stroke="#ffffff" stroke-width="2" opacity=".8"/>`;}b=`<path d="M ${cx-arm} ${top} C ${cx-arm*1.2} ${y+h*.28},${cx-arm*.55} ${mid-h*.06},${cx} ${mid} C ${cx-arm*.55} ${mid+h*.06},${cx-arm*1.2} ${y+h*.72},${cx-arm} ${bottom}" fill="none" stroke="${stroke}" stroke-width="${Math.max(12,w*.12)}" stroke-linecap="round"/><path d="M ${cx+arm} ${top} C ${cx+arm*1.2} ${y+h*.28},${cx+arm*.55} ${mid-h*.06},${cx} ${mid} C ${cx+arm*.55} ${mid+h*.06},${cx+arm*1.2} ${y+h*.72},${cx+arm} ${bottom}" fill="none" stroke="#a78bfa" stroke-width="${Math.max(12,w*.12)}" stroke-linecap="round"/>${spec.geneticsShowDetails?bands:''}<ellipse cx="${cx}" cy="${mid}" rx="${w*.13}" ry="${h*.045}" fill="#f59e0b" stroke="#92400e" stroke-width="2"/>`;}
        return`<g data-qmx-object="${escapeHtml(o.id)}" transform="rotate(${o.rotation} ${cx} ${cy})">${b}<text x="${cx}" y="${y+h+18}" text-anchor="middle" font-size="13" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function geneticsComponentMarkup(spec,o){const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,fill=escapeHtml(o.fill),stroke=escapeHtml(o.stroke),lw=o.lineWidth,label=o.label?`<text x="${cx}" y="${y+h+16}" text-anchor="middle" font-size="11" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`:'';let b='';if(o.kind==='homologous-pair'){const makeChr=(cc,col)=>`<path d="M ${cc-w*.1} ${y+h*.08} Q ${cc-w*.16} ${cy} ${cc} ${cy} Q ${cc-w*.16} ${cy} ${cc-w*.1} ${y+h*.92} M ${cc+w*.1} ${y+h*.08} Q ${cc+w*.16} ${cy} ${cc} ${cy} Q ${cc+w*.16} ${cy} ${cc+w*.1} ${y+h*.92}" fill="none" stroke="${col}" stroke-width="${Math.max(8,w*.07)}" stroke-linecap="round"/>`;b=makeChr(x+w*.28,'#7c3aed')+makeChr(x+w*.72,'#2563eb');}else if(o.kind==='chromatid'){b=`<path d="M ${cx} ${y+h*.04} C ${x+w*.18} ${y+h*.28},${x+w*.82} ${y+h*.72},${cx} ${y+h*.96}" fill="none" stroke="${stroke}" stroke-width="${Math.max(10,w*.16)}" stroke-linecap="round"/>`;}else if(o.kind==='centromere'){b=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.42}" ry="${h*.34}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x+w*.18} ${cy} Q ${cx} ${y+h*.2} ${x+w*.82} ${cy} Q ${cx} ${y+h*.8} ${x+w*.18} ${cy}" fill="none" stroke="${stroke}" stroke-width="2"/>`;}else if(o.kind==='gene-segment'){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x+15} ${cy} H ${x+w-15}" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/>${spec.geneticsShowSequences&&o.sequence?`<text x="${cx}" y="${cy+5}" text-anchor="middle" font-size="12" font-family="monospace" fill="#14532d">${escapeHtml(o.sequence)}</text>`:''}`;}else if(o.kind==='nucleotide'){const sugar=`${x+w*.42},${y+h*.28} ${x+w*.62},${y+h*.38} ${x+w*.58},${y+h*.62} ${x+w*.35},${y+h*.66} ${x+w*.25},${y+h*.45}`;b=`<circle cx="${x+w*.15}" cy="${cy}" r="${Math.min(w,h)*.12}" fill="#fde68a" stroke="#a16207" stroke-width="2"/><polygon points="${sugar}" fill="#bae6fd" stroke="#0369a1" stroke-width="2"/><rect x="${x+w*.62}" y="${y+h*.33}" width="${w*.32}" height="${h*.34}" rx="6" fill="#fecaca" stroke="#dc2626" stroke-width="2"/><text x="${x+w*.78}" y="${cy+5}" text-anchor="middle" font-size="16" font-weight="700">A</text><line x1="${x+w*.27}" y1="${cy}" x2="${x+w*.36}" y2="${cy}" stroke="#475569"/><line x1="${x+w*.58}" y1="${cy}" x2="${x+w*.62}" y2="${cy}" stroke="#475569"/>`;}else if(o.kind==='base-pair'){b=`<rect x="${x+w*.06}" y="${y+h*.2}" width="${w*.35}" height="${h*.6}" rx="8" fill="#bfdbfe" stroke="#2563eb" stroke-width="2"/><rect x="${x+w*.59}" y="${y+h*.2}" width="${w*.35}" height="${h*.6}" rx="8" fill="#fecaca" stroke="#dc2626" stroke-width="2"/><line x1="${x+w*.41}" y1="${cy-5}" x2="${x+w*.59}" y2="${cy-5}" stroke="#64748b" stroke-dasharray="4 3"/><line x1="${x+w*.41}" y1="${cy+5}" x2="${x+w*.59}" y2="${cy+5}" stroke="#64748b" stroke-dasharray="4 3"/><text x="${x+w*.235}" y="${cy+6}" text-anchor="middle" font-size="18" font-weight="700">A</text><text x="${x+w*.765}" y="${cy+6}" text-anchor="middle" font-size="18" font-weight="700">T</text>`;}else if(o.kind==='replication-fork'){const left=x+w*.15,fork=x+w*.52,right=x+w*.9,top=y+h*.08,bottom=y+h*.92;b=`<path d="M ${left} ${top} C ${left+w*.08} ${cy-h*.1} ${fork} ${cy} C ${right-w*.05} ${cy+h*.08} ${right} ${bottom}" fill="none" stroke="#2563eb" stroke-width="4"/><path d="M ${left+w*.14} ${top} C ${left+w*.18} ${cy-h*.08} ${fork} ${cy} C ${right-w*.14} ${cy-h*.04} ${right-w*.15} ${y+h*.08}" fill="none" stroke="#7c3aed" stroke-width="4"/><path d="M ${fork} ${cy} C ${right-w*.12} ${cy+h*.12} ${right-w*.05} ${bottom}" fill="none" stroke="#7c3aed" stroke-width="4"/>`;if(spec.geneticsShowDetails){for(let i=0;i<7;i++){const yy=y+h*(.18+i*.09);b+=`<circle cx="${fork+w*.08+i*8}" cy="${yy}" r="5" fill="${i%2?'#22c55e':'#ef4444'}"/>`;}}}else if(o.kind==='mrna'){let path=`M ${x+10} ${cy}`;for(let i=1;i<=16;i++){const xx=x+10+i*(w-20)/16,yy=cy+Math.sin(i*Math.PI/2)*h*.16;path+=` L ${xx} ${yy}`;}b=`<path d="${path}" fill="none" stroke="${stroke}" stroke-width="4"/>`;if(spec.geneticsShowSequences&&o.sequence)b+=`<text x="${cx}" y="${y+h*.82}" text-anchor="middle" font-size="12" font-family="monospace" fill="#115e59">${escapeHtml(o.sequence)}</text>`;}else if(o.kind==='ribosome'){b=`<ellipse cx="${cx}" cy="${y+h*.6}" rx="${w*.43}" ry="${h*.3}" fill="#fbcfe8" stroke="${stroke}" stroke-width="${lw}"/><ellipse cx="${cx}" cy="${y+h*.34}" rx="${w*.31}" ry="${h*.22}" fill="#fce7f3" stroke="${stroke}" stroke-width="${lw}"/><path d="M ${x+w*.1} ${cy} H ${x+w*.9}" stroke="#0f766e" stroke-width="3"/>`;}else if(o.kind==='protein-chain'){let chain='';const n=Math.max(5,o.detailCount);for(let i=0;i<n;i++){const px=x+18+i*(w-36)/(n-1),py=cy+Math.sin(i*1.35)*h*.22;if(i)chain+=`<line x1="${x+18+(i-1)*(w-36)/(n-1)}" y1="${cy+Math.sin((i-1)*1.35)*h*.22}" x2="${px}" y2="${py}" stroke="#a16207" stroke-width="3"/>`;chain+=`<circle cx="${px}" cy="${py}" r="9" fill="${i%3===0?'#fde68a':i%3===1?'#bfdbfe':'#fecaca'}" stroke="#92400e"/>`;}b=chain;}else if(o.kind==='punnett-square'){const n=Math.max(2,Math.min(4,o.detailCount)),pa=String(o.parentA||'A,a').split(',').map(s=>s.trim()),pb=String(o.parentB||'A,a').split(',').map(s=>s.trim()),cells=String(o.sequence||'').split(',').map(s=>s.trim()),cw=w/(n+1),ch=h/(n+1);b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${stroke}" stroke-width="${lw}"/>`;for(let i=1;i<=n;i++){b+=`<line x1="${x+cw*i}" y1="${y}" x2="${x+cw*i}" y2="${y+h}" stroke="${stroke}"/><line x1="${x}" y1="${y+ch*i}" x2="${x+w}" y2="${y+ch*i}" stroke="${stroke}"/>`;b+=`<text x="${x+cw*(i+.5)}" y="${y+ch*.63}" text-anchor="middle" font-size="13" font-weight="700">${escapeHtml(pa[i-1]||'')}</text><text x="${x+cw*.5}" y="${y+ch*(i+.63)}" text-anchor="middle" font-size="13" font-weight="700">${escapeHtml(pb[i-1]||'')}</text>`;}b+=`<line x1="${x}" y1="${y}" x2="${x+cw}" y2="${y+ch}" stroke="${stroke}"/>`;if(spec.geneticsShowSequences){for(let r=0;r<n;r++)for(let c=0;c<n;c++){const val=cells[r*n+c]||`${pa[c]||''}${pb[r]||''}`;b+=`<text x="${x+cw*(c+1.5)}" y="${y+ch*(r+1.58)}" text-anchor="middle" font-size="12">${escapeHtml(val)}</text>`;}}}else if(o.kind==='cell-nucleus'){b=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.45}" ry="${h*.44}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><ellipse cx="${cx}" cy="${cy}" rx="${w*.34}" ry="${h*.33}" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5"/>`;}else if(o.kind==='spindle'){b=`<ellipse cx="${cx}" cy="${cy}" rx="${w*.46}" ry="${h*.42}" fill="none" stroke="${stroke}" stroke-width="${lw}"/>`;for(let i=0;i<7;i++){const yy=y+h*(.18+i*.1);b+=`<line x1="${x+w*.08}" y1="${cy}" x2="${cx}" y2="${yy}" stroke="#4f46e5" opacity=".7"/><line x1="${x+w*.92}" y1="${cy}" x2="${cx}" y2="${yy}" stroke="#4f46e5" opacity=".7"/>`;}}else if(o.kind==='crossing-over'){b=`<path d="M ${x+w*.25} ${y+h*.06} C ${x+w*.15} ${cy-h*.05},${x+w*.75} ${cy+h*.05},${x+w*.65} ${y+h*.94}" fill="none" stroke="#7c3aed" stroke-width="12" stroke-linecap="round"/><path d="M ${x+w*.65} ${y+h*.06} C ${x+w*.75} ${cy-h*.05},${x+w*.15} ${cy+h*.05},${x+w*.25} ${y+h*.94}" fill="none" stroke="#2563eb" stroke-width="12" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="16" fill="#f59e0b" stroke="#92400e" stroke-width="2"/>`;}else if(o.kind==='allele'){b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/><text x="${cx}" y="${cy+7}" text-anchor="middle" font-size="20" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;}else{b=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;}
        return`<g data-qmx-object="${escapeHtml(o.id)}" transform="rotate(${o.rotation} ${cx} ${cy})">${b}${label}</g>`;}
    function geneticsLabelMarkup(spec,o,map){if(!spec.geneticsShowLabels)return'';const target=map.get(o.targetId),p=target?geneticsPortPoint(target,o.targetPort):{x:o.x,y:o.y+o.height/2},lx=o.x,ly=o.y,w=o.width,h=o.height,nearX=p.x<lx?lx:p.x>lx+w?lx+w:lx+w/2,nearY=p.y<ly?ly:p.y>ly+h?ly+h:ly+h/2;return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="M ${p.x} ${p.y} L ${(p.x+nearX)/2} ${p.y} L ${nearX} ${nearY}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${escapeHtml(o.stroke)}"/><rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="8" fill="${escapeHtml(o.fill)}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${lx+10}" y="${ly+h/2+5}" font-size="13" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.text)}</text></g>`;}
    function geneticsLineMarkup(o,arrow=false){const dash=o.dashed?' stroke-dasharray="8 6"':'',marker=arrow?' marker-end="url(#qmx-diagram-arrow)"':'',label=o.label?`<text x="${(o.x1+o.x2)/2}" y="${(o.y1+o.y2)/2-10}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}" paint-order="stroke" stroke="#fff" stroke-width="4">${escapeHtml(o.label)}</text>`:'';let line;if(o.kind==='gene-bracket'&&!arrow){const mid=(o.y1+o.y2)/2;line=`<path d="M ${o.x1} ${o.y1} L ${o.x1} ${mid} L ${o.x2} ${mid} L ${o.x2} ${o.y2}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}/>`;}else line=`<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${dash}${marker} stroke-linecap="round"/>`;return`<g data-qmx-object="${escapeHtml(o.id)}">${line}${label}</g>`;}
    function geneticsMarkup(spec){const map=new Map(spec.objects.filter((o)=>['genetics-structure','genetics-component'].includes(o.type)).map((o)=>[o.id,o])),grid=geneticsGridMarkup(spec),structures=spec.objects.filter((o)=>o.type==='genetics-structure').map((o)=>geneticsStructureMarkup(spec,o)).join(''),components=spec.objects.filter((o)=>o.type==='genetics-component').map((o)=>geneticsComponentMarkup(spec,o)).join(''),lines=spec.objects.filter((o)=>o.type==='genetics-line').map((o)=>geneticsLineMarkup(o,false)).join(''),arrows=spec.objects.filter((o)=>o.type==='genetics-arrow').map((o)=>geneticsLineMarkup(o,true)).join(''),labels=spec.objects.filter((o)=>o.type==='genetics-label').map((o)=>geneticsLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter((o)=>o.type==='text').map(generalObjectMarkup).join('');return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${structures}${lines}${components}${arrows}${labels}${texts}</g>`;}



    function disasterPortPoint(object,port){const map={n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5],nw:[0,0]},pair=map[port]||map.e;return{x:object.x+object.width*pair[0],y:object.y+object.height*pair[1]};}
    function disasterGridMarkup(spec){if(!spec.disasterShowGrid)return'';const step=Math.max(5,Number(spec.gridSize||20));return`<defs><pattern id="qmx-disaster-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#ffedd5" stroke-width="1"/></pattern></defs><rect width="${spec.width}" height="${spec.height}" fill="url(#qmx-disaster-grid)"/>`;}
    function disasterNodeMarkup(o){const{x,y,width:w,height:h}=o,cx=x+w/2,cy=y+h/2,s=escapeHtml(o.stroke),f=escapeHtml(o.fill),lw=o.lineWidth,label=`<text x="${cx}" y="${y+h+16}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`;let b='';
        if(o.kind==='earthquake'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.34}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.2}" fill="none" stroke="${s}" stroke-width="${lw}"/><path d="M ${cx-w*.42} ${cy+h*.25} l ${w*.18} -${h*.22} l ${w*.14} ${h*.18} l ${w*.2} -${h*.28} l ${w*.22} ${h*.2}" fill="none" stroke="${s}" stroke-width="${lw+1}"/>`;}
        else if(o.kind==='epicenter'){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.4}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.25}" fill="none" stroke="${s}" stroke-width="${lw}"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.1}" fill="${s}"/>`;}
        else if(o.kind==='fault-line'){b=`<rect x="${x+4}" y="${y+8}" width="${w-8}" height="${h-16}" rx="10" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.08} ${y+h*.7} L ${x+w*.22} ${y+h*.36} L ${x+w*.36} ${y+h*.66} L ${x+w*.52} ${y+h*.27} L ${x+w*.68} ${y+h*.62} L ${x+w*.9} ${y+h*.32}" fill="none" stroke="${s}" stroke-width="${lw+2}"/>`;}
        else if(['cyclone'].includes(o.kind)){b=`<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.42}" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${cx-w*.34} ${cy} C ${cx-w*.22} ${cy-h*.3}, ${cx+w*.32} ${cy-h*.26}, ${cx+w*.25} ${cy} C ${cx+w*.18} ${cy+h*.22}, ${cx-w*.18} ${cy+h*.2}, ${cx-w*.12} ${cy} C ${cx-w*.08} ${cy-h*.1}, ${cx+w*.08} ${cy-h*.1}, ${cx+w*.05} ${cy}" fill="none" stroke="${s}" stroke-width="${lw+2}"/>`;}
        else if(['storm-surge','tsunami','flood','river','coast'].includes(o.kind)){b=`<rect x="${x+4}" y="${y+6}" width="${w-8}" height="${h-12}" rx="12" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.06} ${cy} Q ${x+w*.18} ${cy-h*.18} ${x+w*.3} ${cy} T ${x+w*.54} ${cy} T ${x+w*.78} ${cy} T ${x+w*.98} ${cy}" fill="none" stroke="${s}" stroke-width="${lw+2}"/><path d="M ${x+w*.08} ${cy+h*.2} Q ${x+w*.2} ${cy+h*.04} ${x+w*.32} ${cy+h*.2} T ${x+w*.56} ${cy+h*.2} T ${x+w*.82} ${cy+h*.2}" fill="none" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='landslide'){b=`<path d="M ${x+w*.06} ${y+h*.88} L ${x+w*.48} ${y+h*.12} L ${x+w*.94} ${y+h*.88} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${x+w*.6}" cy="${y+h*.38}" r="${Math.min(w,h)*.09}" fill="${s}"/><circle cx="${x+w*.72}" cy="${y+h*.56}" r="${Math.min(w,h)*.07}" fill="${s}"/><path d="M ${x+w*.5} ${y+h*.28} L ${x+w*.82} ${y+h*.8}" stroke="#dc2626" stroke-width="${lw+1}"/>`;}
        else if(o.kind==='volcano'){b=`<path d="M ${x+w*.08} ${y+h*.9} L ${x+w*.42} ${y+h*.25} L ${x+w*.58} ${y+h*.25} L ${x+w*.92} ${y+h*.9} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.43} ${y+h*.28} Q ${cx} ${y+h*.5} ${x+w*.57} ${y+h*.28}" fill="#ef4444"/><circle cx="${cx}" cy="${y+h*.15}" r="${w*.09}" fill="#cbd5e1" opacity=".8"/>`;}
        else if(o.kind==='wildfire'){b=`<path d="M ${cx} ${y+h*.08} C ${x+w*.82} ${y+h*.38}, ${x+w*.7} ${y+h*.82}, ${cx} ${y+h*.9} C ${x+w*.2} ${y+h*.75}, ${x+w*.18} ${y+h*.42}, ${cx} ${y+h*.08} Z" fill="#fb923c" stroke="${s}" stroke-width="${lw}"/><path d="M ${cx} ${y+h*.34} C ${x+w*.63} ${y+h*.52}, ${x+w*.58} ${y+h*.72}, ${cx} ${y+h*.78} C ${x+w*.38} ${y+h*.65}, ${x+w*.4} ${y+h*.5}, ${cx} ${y+h*.34} Z" fill="#fde047"/>`;}
        else if(o.kind==='drought'){b=`<rect x="${x+4}" y="${y+6}" width="${w-8}" height="${h-12}" rx="12" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${x+w*.78}" cy="${y+h*.28}" r="${Math.min(w,h)*.15}" fill="#facc15"/><path d="M ${x+w*.08} ${y+h*.72} L ${x+w*.28} ${y+h*.55} L ${x+w*.42} ${y+h*.74} L ${x+w*.58} ${y+h*.5} L ${x+w*.72} ${y+h*.7} L ${x+w*.92} ${y+h*.52}" fill="none" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='lightning'){b=`<rect x="${x+4}" y="${y+6}" width="${w-8}" height="${h-12}" rx="12" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.58} ${y+h*.08} L ${x+w*.3} ${y+h*.52} L ${x+w*.52} ${y+h*.52} L ${x+w*.36} ${y+h*.92} L ${x+w*.72} ${y+h*.42} L ${x+w*.5} ${y+h*.42} Z" fill="#eab308" stroke="#a16207"/>`;}
        else if(['mountain'].includes(o.kind)){b=`<path d="M ${x+w*.04} ${y+h*.9} L ${x+w*.42} ${y+h*.2} L ${x+w*.58} ${y+h*.47} L ${x+w*.72} ${y+h*.28} L ${x+w*.96} ${y+h*.9} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(['vulnerable-house','school','shelter','hospital','fire-station','emergency-center','relief-camp'].includes(o.kind)){const mark=({school:'S',shelter:'✓',hospital:'+', 'fire-station':'F','emergency-center':'E','relief-camp':'R','vulnerable-house':'!'})[o.kind]||'';b=`<path d="M ${x+w*.1} ${y+h*.45} L ${cx} ${y+h*.08} L ${x+w*.9} ${y+h*.45} V ${y+h*.9} H ${x+w*.1} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><text x="${cx}" y="${y+h*.68}" text-anchor="middle" font-size="${Math.min(w,h)*.3}" font-weight="900" fill="${s}">${mark}</text>`;}
        else if(o.kind==='ambulance'){b=`<rect x="${x+w*.08}" y="${y+h*.25}" width="${w*.78}" height="${h*.5}" rx="10" fill="${f}" stroke="${s}" stroke-width="${lw}"/><rect x="${x+w*.58}" y="${y+h*.12}" width="${w*.28}" height="${h*.3}" fill="${f}" stroke="${s}"/><text x="${x+w*.38}" y="${cy+h*.08}" text-anchor="middle" font-size="${h*.36}" font-weight="900" fill="#dc2626">+</text><circle cx="${x+w*.28}" cy="${y+h*.8}" r="${h*.1}"/><circle cx="${x+w*.72}" cy="${y+h*.8}" r="${h*.1}"/>`;}
        else if(o.kind==='warning-siren'){b=`<path d="M ${x+w*.25} ${y+h*.75} H ${x+w*.75} L ${x+w*.65} ${y+h*.32} Q ${cx} ${y+h*.12} ${x+w*.35} ${y+h*.32} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.16} ${y+h*.28} L ${x+w*.04} ${y+h*.18} M ${x+w*.84} ${y+h*.28} L ${x+w*.96} ${y+h*.18}" stroke="${s}" stroke-width="${lw+1}"/>`;}
        else if(o.kind==='rescue-team'){b=`<rect x="${x+4}" y="${y+6}" width="${w-8}" height="${h-12}" rx="14" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${x+w*.35}" cy="${y+h*.38}" r="${h*.12}" fill="${s}"/><circle cx="${x+w*.65}" cy="${y+h*.38}" r="${h*.12}" fill="${s}"/><path d="M ${x+w*.2} ${y+h*.78} Q ${x+w*.35} ${y+h*.52} ${x+w*.5} ${y+h*.78} Q ${x+w*.65} ${y+h*.52} ${x+w*.8} ${y+h*.78}" fill="none" stroke="${s}" stroke-width="${lw+1}"/>`;}
        else if(o.kind==='bridge'){b=`<rect x="${x+4}" y="${y+6}" width="${w-8}" height="${h-12}" rx="10" fill="${f}" stroke="${s}" stroke-width="${lw}"/><path d="M ${x+w*.08} ${y+h*.62} H ${x+w*.92} M ${x+w*.2} ${y+h*.62} Q ${cx} ${y+h*.05} ${x+w*.8} ${y+h*.62}" fill="none" stroke="${s}" stroke-width="${lw+1}"/>`;}
        else if(o.kind==='embankment'){b=`<path d="M ${x+w*.05} ${y+h*.82} L ${x+w*.28} ${y+h*.22} H ${x+w*.72} L ${x+w*.95} ${y+h*.82} Z" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;}
        else if(o.kind==='safe-zone'){b=`<rect x="${x+4}" y="${y+6}" width="${w-8}" height="${h-12}" rx="20" fill="${f}" stroke="${s}" stroke-width="${lw}"/><circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)*.25}" fill="#22c55e"/><path d="M ${cx-w*.1} ${cy} l ${w*.08} ${h*.1} l ${w*.17} -${h*.22}" fill="none" stroke="#fff" stroke-width="${lw+2}"/>`;}
        else b=`<rect x="${x+4}" y="${y+6}" width="${w-8}" height="${h-12}" rx="14" fill="${f}" stroke="${s}" stroke-width="${lw}"/>`;
        return`<g data-qmx-object="${escapeHtml(o.id)}">${b}${label}</g>`;
    }
    function disasterZoneMarkup(spec,o){if(!spec.disasterShowZones)return'';return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="18" fill="${escapeHtml(o.fill)}" fill-opacity=".22" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${o.dashed?' stroke-dasharray="10 7"':''}/><text x="${o.x+14}" y="${o.y+25}" font-size="14" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function disasterOrthogonalPath(a,b){const mid=(a.x+b.x)/2;return`M ${a.x} ${a.y} H ${mid} V ${b.y} H ${b.x}`;}
    function disasterLinkMarkup(spec,o,map){const source=map.get(o.sourceId),target=map.get(o.targetId),a=source?disasterPortPoint(source,o.sourcePort):{x:o.x1,y:o.y1},b=target?disasterPortPoint(target,o.targetPort):{x:o.x2,y:o.y2},path=disasterOrthogonalPath(a,b),color=escapeHtml(o.stroke),label=o.label?`<text x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2-8}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text>`:'';return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="${path}" fill="none" stroke="${color}" stroke-width="${o.lineWidth}"${o.dashed?' stroke-dasharray="9 7"':''}${o.showArrow?' marker-end="url(#qmx-diagram-arrow)"':''}/>${label}</g>`;}
    function disasterLabelMarkup(spec,o,map){if(!spec.disasterShowLabels)return'';const target=map.get(o.targetId),a=target?disasterPortPoint(target,o.targetPort):{x:o.x,y:o.y},bx=o.x,by=o.y;return`<g data-qmx-object="${escapeHtml(o.id)}"><path d="M ${a.x} ${a.y} L ${bx} ${by+o.height/2}" fill="none" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><rect x="${bx}" y="${by}" width="${o.width}" height="${o.height}" rx="8" fill="${escapeHtml(o.fill)}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/><text x="${bx+10}" y="${by+o.height/2+5}" font-size="13" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.text)}</text></g>`;}
    function disasterArrowMarkup(o){return`<g data-qmx-object="${escapeHtml(o.id)}"><line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"${o.dashed?' stroke-dasharray="9 7"':''} marker-end="url(#qmx-diagram-arrow)"/><text x="${(o.x1+o.x2)/2}" y="${(o.y1+o.y2)/2-8}" text-anchor="middle" font-size="12" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.label)}</text></g>`;}
    function disasterChartMarkup(spec,o){const lines=String(o.levels||'').split(/\r?\n/).map(line=>{const p=line.split('|');return{label:p[0]||'',value:Number(p[1])||0};}).filter(item=>item.label),x=o.x,y=o.y,w=o.width,h=o.height,pad=52,title=`<text x="${x+w/2}" y="${y+30}" text-anchor="middle" font-size="18" font-weight="800" fill="${escapeHtml(o.textColor)}">${escapeHtml(o.title)}</text>`;if(o.kind==='disaster-cycle'){const n=Math.max(1,lines.length),cx=x+w/2,cy=y+h/2+12,r=Math.min(w,h)*.3;let body='';lines.forEach((item,i)=>{const a=-Math.PI/2+i*2*Math.PI/n,nx=cx+Math.cos(a)*r,ny=cy+Math.sin(a)*r;body+=`<circle cx="${nx}" cy="${ny}" r="34" fill="#fff7ed" stroke="${escapeHtml(o.stroke)}" stroke-width="2"/><text x="${nx}" y="${ny+4}" text-anchor="middle" font-size="11" font-weight="700" fill="${escapeHtml(o.textColor)}">${escapeHtml(item.label)}</text>`;if(i<n-1||n>1){const b=-Math.PI/2+((i+1)%n)*2*Math.PI/n;body+=`<path d="M ${nx} ${ny} Q ${cx} ${cy} ${cx+Math.cos(b)*r} ${cy+Math.sin(b)*r}" fill="none" stroke="#ea580c" stroke-width="2" marker-end="url(#qmx-diagram-arrow)"/>`;}});return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${escapeHtml(o.fill)}" fill-opacity=".35" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/>${title}${body}</g>`;}const max=Math.max(1,...lines.map(item=>item.value)),barW=(w-pad*2)/Math.max(1,lines.length);let bars='';lines.forEach((item,i)=>{const bh=(h-pad*2-25)*item.value/max,bx=x+pad+i*barW+barW*.12,by=y+h-pad-bh;bars+=`<rect x="${bx}" y="${by}" width="${barW*.72}" height="${bh}" rx="6" fill="${i%2?'#fb923c':'#f97316'}"/><text x="${bx+barW*.36}" y="${y+h-pad+17}" text-anchor="middle" font-size="10" fill="${escapeHtml(o.textColor)}">${escapeHtml(item.label)}</text><text x="${bx+barW*.36}" y="${by-6}" text-anchor="middle" font-size="11" font-weight="700" fill="${escapeHtml(o.textColor)}">${item.value}</text>`;});return`<g data-qmx-object="${escapeHtml(o.id)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${escapeHtml(o.fill)}" fill-opacity=".35" stroke="${escapeHtml(o.stroke)}" stroke-width="${o.lineWidth}"/>${title}${bars}</g>`;}
    function disasterMarkup(spec){const targets=spec.objects.filter(o=>['disaster-node','disaster-zone','disaster-pyramid'].includes(o.type)),map=new Map(targets.map(o=>[o.id,o])),grid=disasterGridMarkup(spec),zones=spec.objects.filter(o=>o.type==='disaster-zone').map(o=>disasterZoneMarkup(spec,o)).join(''),links=spec.objects.filter(o=>o.type==='disaster-link').map(o=>disasterLinkMarkup(spec,o,map)).join(''),nodes=spec.objects.filter(o=>o.type==='disaster-node').map(disasterNodeMarkup).join(''),charts=spec.objects.filter(o=>o.type==='disaster-pyramid').map(o=>disasterChartMarkup(spec,o)).join(''),arrows=spec.objects.filter(o=>o.type==='disaster-arrow').map(disasterArrowMarkup).join(''),labels=spec.objects.filter(o=>o.type==='disaster-label').map(o=>disasterLabelMarkup(spec,o,map)).join(''),texts=spec.objects.filter(o=>o.type==='text').map(generalObjectMarkup).join('');let risk='';if(spec.disasterShowTrophicLevels){targets.filter(o=>o.type==='disaster-node'&&o.trophicLevel>0).forEach(o=>{risk+=`<text x="${o.x+8}" y="${o.y+16}" font-size="10" font-weight="800" fill="#991b1b">Risk ${o.trophicLevel}</text>`;});}return`<g font-family="Arial, Noto Sans Bengali, Segoe UI, sans-serif">${grid}${zones}${links}${nodes}${charts}${arrows}${labels}${risk}${texts}</g>`;}

    function svgMarkup(spec, options = {}) {
        const normalized = normalizeSpec(spec);
        const fallbackTitles = {
            flowchart: 'Flowchart',
            geometry: 'Geometry Drawing',
            'coordinate-geometry': 'Coordinate Geometry / Mathematical Construction',
            'number-line': 'Number Line / Interval / Inequality Diagram',
            'tree-diagram': 'Tree Diagram',
            'technical-drawing': 'Technical Drawing / Engineering Drawing',
            'statistical-diagram': 'Statistical Diagram / Data Chart',
            'function-transformation': 'Function Transformation / Curve Sketching',
            'complex-plane': 'Complex Plane / Argand & Polar Diagram',
            'digital-logic': 'Logic Gate / Digital Electronics Diagram',
            'finite-state-machine': 'Finite State Machine / Automata Diagram',
            'database-er': 'Database ER / Relational Schema Diagram',
            'network-topology': 'Computer Network / Topology Diagram',
            'uml-software-design': 'UML / Software Architecture Diagram',
            'uml-sequence': 'UML Sequence / Interaction Diagram',
            'uml-activity': 'UML Activity / BPMN Workflow Diagram',
            'cloud-deployment': 'Cloud Architecture / Deployment Diagram',
            'chemical-structure': 'Chemical Structure / Reaction Mechanism Diagram',
            'biological-cell': 'Biological Cell / Organelle Diagram',
            'human-anatomy': 'Human Anatomy / Organ System Diagram',
            'plant-anatomy': 'Plant Anatomy / Botanical Structure Diagram',
            'genetics-diagram': 'Genetics / DNA & Inheritance Diagram',
            'ecology-diagram': 'Ecology / Food Chain & Ecosystem Diagram',
            'geology-diagram': 'Geology / Earth Science & Rock Cycle Diagram',
                'weather-climate-diagram': 'Meteorology / Weather & Climate Diagram',
                'astronomy-diagram': 'Astronomy / Solar System & Space Science Diagram',
                'hydrology-diagram': 'Hydrology / River Basin & Water Resources Diagram',
                'oceanography-diagram': 'Oceanography / Marine Science & Coastal Processes Diagram',
            'environmental-science-diagram': 'Environmental Science / Pollution, Waste & Sustainability Diagram',
            'disaster-management-diagram': 'Disaster Management / Natural Hazards & Risk Assessment Diagram',
            'vector-fbd': 'Vector / Free-body Diagram',
            circuit: 'Circuit Diagram',
            'ray-optics': 'Ray Optics Diagram',
            waveform: 'Waveform Diagram',
            'venn-set': 'Venn & Set Diagram',
            timeline: 'Timeline Diagram',
            'data-flow': 'Data-flow Diagram',
            'cross-section': 'Cross-section / Profile Diagram',
            'vector-art': 'Freehand / Vector Art',
            'sports-field': 'Sports Field / Tactics',
            'stage-blocking': 'Stage / Blocking Plan'
        };
        const fallbackTitle = fallbackTitles[normalized.mode] || 'Diagram';
        const accessibleTitle = escapeHtml(normalized.title || fallbackTitle);
        const className = options.className ? ` class="${escapeHtml(options.className)}"` : '';
        const defs = `<defs><marker id="qmx-diagram-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0f172a"/></marker><marker id="qmx-vector-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke"/></marker><marker id="qmx-optics-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke"/></marker><marker id="qmx-number-line-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 10 0 L 0 5 L 10 10 z" fill="context-stroke" stroke="context-stroke"/></marker><marker id="qmx-tech-dim-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 10 0 L 0 5 L 10 10 z" fill="context-stroke" stroke="context-stroke"/></marker><marker id="qmx-tech-leader-arrow" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 10 0 L 0 5 L 10 10 z" fill="context-stroke" stroke="context-stroke"/></marker><marker id="qmx-coordinate-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" stroke="context-stroke"/></marker><pattern id="qmx-geometry-grid-small" width="${normalized.gridSize}" height="${normalized.gridSize}" patternUnits="userSpaceOnUse"><path d="M ${normalized.gridSize} 0 L 0 0 0 ${normalized.gridSize}" fill="none" stroke="#e2e8f0" stroke-width="1"/></pattern><pattern id="qmx-geometry-grid" width="${normalized.gridSize * 5}" height="${normalized.gridSize * 5}" patternUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="url(#qmx-geometry-grid-small)"/><path d="M ${normalized.gridSize * 5} 0 L 0 0 0 ${normalized.gridSize * 5}" fill="none" stroke="#cbd5e1" stroke-width="1"/></pattern></defs>`;
        const renderers = {
            geometry: (documentSpec) => geometryBackgroundMarkup(documentSpec) + documentSpec.objects.map((object) => geometryObjectMarkup(object, documentSpec)).join(''),
            'coordinate-geometry': coordinateMarkup,
            'number-line': numberLineMarkup,
            'tree-diagram': treeMarkup,
            'technical-drawing': technicalMarkup,
            'statistical-diagram': statisticalMarkup,
            'function-transformation': functionMarkup,
            'complex-plane': complexMarkup,
            'digital-logic': digitalLogicMarkup,
            'finite-state-machine': finiteStateMachineMarkup,
            'database-er': databaseErMarkup,
            'network-topology': networkTopologyMarkup,
            'uml-software-design': umlSoftwareDesignMarkup,
            'uml-sequence': umlSequenceMarkup,
            'uml-activity': umlActivityMarkup,
            'cloud-deployment': cloudDeploymentMarkup,
            'chemical-structure': chemicalStructureMarkup,
            'biological-cell': biologicalCellMarkup,
            'human-anatomy': humanAnatomyMarkup,
            'plant-anatomy': plantAnatomyMarkup,
            'genetics-diagram': geneticsMarkup,
            'ecology-diagram': ecologyMarkup,
            'geology-diagram': geologyMarkup,
            'weather-climate-diagram': weatherMarkup,
            'astronomy-diagram': astronomyMarkup,
            'hydrology-diagram': hydrologyMarkup,
            'oceanography-diagram': oceanographyMarkup,
            'environmental-science-diagram': environmentalMarkup,
            'disaster-management-diagram': disasterMarkup,
            'vector-fbd': (documentSpec) => vectorBackgroundMarkup(documentSpec) + documentSpec.objects.map((object) => vectorObjectMarkup(object, documentSpec)).join(''),
            circuit: circuitMarkup,
            'ray-optics': rayOpticsMarkup,
            waveform: waveformMarkup,
            'venn-set': vennMarkup,
            timeline: timelineMarkup,
            'data-flow': dataFlowMarkup,
            'cross-section': crossSectionMarkup,
            'vector-art': vectorArtMarkup,
            'sports-field': sportsMarkup,
            'stage-blocking': stageMarkup
        };
        const bodyRenderer = renderers[normalized.mode];
        const body = bodyRenderer
            ? bodyRenderer(normalized)
            : normalized.objects.map(generalObjectMarkup).join('');
        return `<svg${className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${normalized.width} ${normalized.height}" role="img" aria-label="${accessibleTitle}"><title>${accessibleTitle}</title>${defs}<rect width="100%" height="100%" fill="${escapeHtml(normalized.background)}"/>${body}</svg>`;
    }

    function tokenToHtml(payload) {
        try {
            const spec = decodePayload(payload);
            const fallbackTitles = {
                flowchart: 'Flowchart',
                geometry: 'Geometry Drawing',
                'coordinate-geometry': 'Coordinate Geometry / Mathematical Construction',
                'number-line': 'Number Line / Interval / Inequality Diagram',
                'tree-diagram': 'Tree Diagram',
                'technical-drawing': 'Technical Drawing / Engineering Drawing',
                'statistical-diagram': 'Statistical Diagram / Data Chart',
            'function-transformation': 'Function Transformation / Curve Sketching',
            'complex-plane': 'Complex Plane / Argand & Polar Diagram',
                'digital-logic': 'Logic Gate / Digital Electronics Diagram',
            'finite-state-machine': 'Finite State Machine / Automata Diagram',
            'database-er': 'Database ER / Relational Schema Diagram',
            'network-topology': 'Computer Network / Topology Diagram',
            'uml-software-design': 'UML / Software Architecture Diagram',
            'uml-sequence': 'UML Sequence / Interaction Diagram',
            'uml-activity': 'UML Activity / BPMN Workflow Diagram',
            'cloud-deployment': 'Cloud Architecture / Deployment Diagram',
            'chemical-structure': 'Chemical Structure / Reaction Mechanism Diagram',
            'biological-cell': 'Biological Cell / Organelle Diagram',
            'human-anatomy': 'Human Anatomy / Organ System Diagram',
            'plant-anatomy': 'Plant Anatomy / Botanical Structure Diagram',
            'genetics-diagram': 'Genetics / DNA & Inheritance Diagram',
            'ecology-diagram': 'Ecology / Food Chain & Ecosystem Diagram',
            'geology-diagram': 'Geology / Earth Science & Rock Cycle Diagram',
                'weather-climate-diagram': 'Meteorology / Weather & Climate Diagram',
                'astronomy-diagram': 'Astronomy / Solar System & Space Science Diagram',
                'hydrology-diagram': 'Hydrology / River Basin & Water Resources Diagram',
                'oceanography-diagram': 'Oceanography / Marine Science & Coastal Processes Diagram',
                'vector-fbd': 'Vector / Free-body Diagram',
                circuit: 'Circuit Diagram',
                'ray-optics': 'Ray Optics Diagram',
                waveform: 'Waveform Diagram',
                'venn-set': 'Venn & Set Diagram',
                timeline: 'Timeline Diagram',
                'data-flow': 'Data-flow Diagram',
                'cross-section': 'Cross-section / Profile Diagram',
                'vector-art': 'Freehand / Vector Art',
                'sports-field': 'Sports Field / Tactics',
                'stage-blocking': 'Stage / Blocking Plan'
            };
            // Caption only a title the author wrote; the tool's own name says nothing about the figure.
            const toolTitle = fallbackTitles[spec.mode] || 'Diagram';
            const authoredTitle = String(spec.title || '').trim();
            const title = authoredTitle && authoredTitle !== toolTitle ? escapeHtml(authoredTitle) : '';
            return `<figure class="qmx-diagram" data-qmx-diagram data-qmx-diagram-mode="${escapeHtml(spec.mode)}" data-qmx-diagram-payload="${escapeHtml(payload)}">${svgMarkup(spec)}${title ? `<figcaption>${title}</figcaption>` : ''}</figure>`;
        } catch (error) {
            console.warn('[QMX Diagram] Token decode failed.', error);
            return `<span class="qmx-diagram-error">[Invalid diagram]</span>`;
        }
    }

    function tokensToHtml(source) {
        return String(source ?? '').replace(TOKEN_PATTERN, (_match, payload) => tokenToHtml(payload));
    }

    function addStyles() {
        if (document.getElementById('qmx-diagram-renderer-styles')) return;
        const style = document.createElement('style');
        style.id = 'qmx-diagram-renderer-styles';
        style.textContent = `.qmx-diagram{max-width:100%;margin:12px auto;text-align:center}.qmx-diagram svg{display:block;width:100%;height:auto;max-height:640px;border-radius:8px;background:#fff}.qmx-diagram figcaption{padding-top:6px;color:#475569;font-size:12px}.qmx-diagram.is-selected{outline:3px solid #2563eb;outline-offset:3px;border-radius:8px}.qmx-diagram-error{color:#b91c1c;font-weight:700}`;
        document.head.appendChild(style);
    }

    function hydrate(root = document) {
        const selectors = ['[data-preview-source-key]', '.qmx-content-paragraph', '.question-content', '.qmx-question-content', '.qmx-answer-content', '.qmx-explanation-content'];
        const containers = Array.from(root.querySelectorAll?.(selectors.join(',')) || []);
        containers.forEach((container) => {
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    const parent = node.parentElement;
                    if (!node.nodeValue?.includes('[[qmx-diagram:')) return NodeFilter.FILTER_REJECT;
                    if (parent?.closest('textarea,script,style,code,pre,[data-qmx-diagram]')) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            nodes.forEach((node) => {
                const html = tokensToHtml(node.nodeValue);
                if (html === node.nodeValue) return;
                const template = document.createElement('template');
                template.innerHTML = html;
                node.replaceWith(template.content);
            });
        });
    }

    window.QmxDiagram = Object.freeze({
        version: '6.2.1', tokenPattern: TOKEN_PATTERN, normalizeSpec, encodeSpec, decodePayload,
        decodeToken, svgMarkup, tokensToHtml, hydrate
    });

    addStyles();
    const init = () => {
        hydrate(document);
        let scheduled = false;
        const observer = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            window.requestAnimationFrame(() => { scheduled = false; hydrate(document); });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})(window, document);
