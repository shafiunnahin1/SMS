(function (window, document) {
    'use strict';

    if (window.QmxPreviewMediaControls?.version) return;

    const GRAPH_PATTERN = /\[\[qmx-graph:([A-Za-z0-9_-]{10,200000})\]\]/g;
    const DIAGRAM_PATTERN = /\[\[qmx-diagram:([A-Za-z0-9_-]{10,200000})\]\]/g;

    function escapeSelector(value) {
        if (window.CSS?.escape) return window.CSS.escape(String(value));
        return String(value).replace(/["\\]/g, '\\$&');
    }

    function addStyles() {
        if (document.getElementById('qmx-preview-media-controls-styles')) return;
        const style = document.createElement('style');
        style.id = 'qmx-preview-media-controls-styles';
        style.textContent = `
            [data-question-live-preview] .qmx-graph,
            [data-question-live-preview] .qmx-diagram {
                position: relative;
            }
            .qmx-media-selected {
                outline: 3px solid #2563eb !important;
                outline-offset: 3px;
                border-radius: 10px;
            }
            .qmx-preview-media-resize-handle {
                position: absolute;
                z-index: 13;
                width: 12px;
                height: 12px;
                border: 2px solid #fff;
                border-radius: 50%;
                background: #2563eb;
                box-shadow: 0 3px 10px rgba(37,99,235,.35);
                opacity: 0;
                visibility: hidden;
            }
            .qmx-media-selected > .qmx-preview-media-resize-handle {
                opacity: 1;
                visibility: visible;
            }
            .qmx-preview-media-resize-handle.is-se {
                right: 3px;
                bottom: 3px;
                cursor: nwse-resize;
            }
            .qmx-preview-media-resize-handle.is-sw {
                left: 3px;
                bottom: 3px;
                cursor: nesw-resize;
            }
            .qmx-preview-media-resize-handle.is-ne {
                right: 3px;
                top: 3px;
                cursor: nesw-resize;
            }
            .qmx-preview-media-resize-handle.is-nw {
                left: 3px;
                top: 3px;
                cursor: nwse-resize;
            }
            .qmx-media-moving,
            .qmx-media-resizing {
                user-select: none !important;
                touch-action: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    function actionsMarkup() {
        return `
            <span class="qmx-preview-media-resize-handle is-nw" data-qmx-media-resize="nw" title="Resize"></span>
            <span class="qmx-preview-media-resize-handle is-ne" data-qmx-media-resize="ne" title="Resize"></span>
            <span class="qmx-preview-media-resize-handle is-sw" data-qmx-media-resize="sw" title="Resize"></span>
            <span class="qmx-preview-media-resize-handle is-se" data-qmx-media-resize="se" title="Resize"></span>
        `;
    }

    function mediaFigures(root = document) {
        return Array.from(root.querySelectorAll?.(
            '[data-question-live-preview] .qmx-graph, ' +
            '[data-question-live-preview] .qmx-diagram'
        ) || []).filter((figure) => !isReadonlyFigure(figure));
    }

    function isReadonlyFigure(figure) {
        return Boolean(figure?.closest('[data-preview-readonly="true"]'));
    }

    function decorate(root = document) {
        mediaFigures(root).forEach((figure) => {
            if (figure.dataset.qmxMediaControls === 'true') return;
            figure.insertAdjacentHTML('afterbegin', actionsMarkup());
            figure.dataset.qmxMediaControls = 'true';
            figure.querySelectorAll('[data-qmx-media-resize]').forEach((handle) => {
                handle.addEventListener('pointerdown', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    selectFigure(figure);
                    figureResize(
                        event,
                        figure,
                        handle.dataset.qmxMediaResize || 'se'
                    );
                    try {
                        handle.setPointerCapture(event.pointerId);
                    } catch (_) {
                        // Pointer capture is unavailable in older browsers.
                    }
                });
            });
        });
    }

    function clearSelection(except = null) {
        document.querySelectorAll('[data-question-live-preview] .qmx-media-selected').forEach((figure) => {
            if (figure !== except) figure.classList.remove('qmx-media-selected');
        });
    }

    function selectFigure(figure) {
        if (!figure || isReadonlyFigure(figure)) return;
        clearSelection(figure);
        figure.classList.add('qmx-media-selected');
    }

    let interaction = null;

    function figureResize(event, figure, direction) {
        if (isReadonlyFigure(figure)) return;
        const rect = figure.getBoundingClientRect();
        const parent = figure.parentElement?.getBoundingClientRect();
        if (!parent || !rect.width) return;
        interaction = {
            type: 'resize',
            figure,
            direction,
            startX: event.clientX,
            startY: event.clientY,
            startWidth: rect.width,
            startHeight: rect.height,
            parentWidth: Math.max(parent.width, 1),
            ratio: rect.width / Math.max(rect.height, 1)
        };
        figure.classList.add('qmx-media-resizing');
    }

    function handlePointerMove(event) {
        if (!interaction) return;
        if (isReadonlyFigure(interaction.figure)) {
            clearInteraction();
            return;
        }
        const dx = event.clientX - interaction.startX;
        const dy = event.clientY - interaction.startY;
        if (interaction.type === 'move') {
            interaction.figure.style.transform = `translate(${interaction.startTranslateX + dx}px, ${interaction.startTranslateY + dy}px)`;
            return;
        }
        const horizontal = interaction.direction.includes('e') ? dx : -dx;
        const vertical = interaction.direction.includes('s') ? dy : -dy;
        const delta = Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical * interaction.ratio;
        const width = Math.max(120, Math.min(interaction.parentWidth, interaction.startWidth + delta));
        interaction.figure.style.width = `${Math.round((width / interaction.parentWidth) * 100)}%`;
    }

    function clearInteraction() {
        if (!interaction) return;
        interaction.figure.classList.remove('qmx-media-moving', 'qmx-media-resizing');
        interaction = null;
    }

    function handlePointerDown(event) {
        const figure = event.target.closest?.(
            '[data-question-live-preview] .qmx-graph, ' +
            '[data-question-live-preview] .qmx-diagram'
        );
        if (!figure || isReadonlyFigure(figure)) return;
        const resize = event.target.closest('[data-qmx-media-resize]')
            || Array.from(figure.querySelectorAll('[data-qmx-media-resize]')).find((handle) => {
                const rect = handle.getBoundingClientRect();
                return event.clientX >= rect.left - 8
                    && event.clientX <= rect.right + 8
                    && event.clientY >= rect.top - 8
                    && event.clientY <= rect.bottom + 8;
            });
        selectFigure(figure);
        event.preventDefault();
        if (resize) {
            figureResize(event, figure, resize.dataset.qmxMediaResize || 'se');
            return;
        }
        const transform = figure.style.transform.match(/translate\(([-0-9.]+)px,\s*([-0-9.]+)px\)/);
        interaction = {
            type: 'move',
            figure,
            startX: event.clientX,
            startY: event.clientY,
            startTranslateX: Number(transform?.[1]) || 0,
            startTranslateY: Number(transform?.[2]) || 0
        };
        figure.classList.add('qmx-media-moving');
    }

    function mediaInfo(figure) {
        const isGraph = figure.matches('.qmx-graph[data-qmx-graph]');
        const type = isGraph ? 'graph' : 'diagram';
        const payload = isGraph
            ? String(figure.dataset.qmxGraph || '')
            : String(figure.dataset.qmxDiagramPayload || '');
        const sourceBlock = figure.closest('[data-preview-source-key]');
        const selector = isGraph
            ? '.qmx-graph[data-qmx-graph]'
            : '.qmx-diagram[data-qmx-diagram]';
        const index = sourceBlock
            ? Array.from(sourceBlock.querySelectorAll(selector)).indexOf(figure)
            : 0;
        return {
            type,
            payload,
            token: payload ? `[[qmx-${type}:${payload}]]` : '',
            sourceKey: String(sourceBlock?.dataset.previewSourceKey || ''),
            index: Math.max(0, index)
        };
    }

    function findPatternButton(sourceKey) {
        if (!sourceKey) return null;
        const escaped = escapeSelector(sourceKey);
        return document.querySelector(
            `[data-pattern-key="${escaped}"], [data-pattern-field="${escaped}"]`
        );
    }

    function activateSource(info, callback) {
        const button = findPatternButton(info.sourceKey);
        if (button && !button.classList.contains('is-active')) button.click();
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(callback);
        });
    }

    function openGraphEditor(info) {
        activateSource(info, () => {
            const options = window.QmxPrepareGraphOpen?.() || {};
            if (options.cancelOpen) {
                window.alert(options.graphEditError || 'The selected graph could not be opened.');
                return;
            }
            if (!window.MathEditor?.openTool) {
                window.alert('Graph Builder is not ready.');
                return;
            }
            window.MathEditor.openTool('graph', options);
        });
    }

    function openDiagramEditor(figure, info) {
        activateSource(info, () => {
            let spec = null;
            try { spec = window.QmxDiagram?.decodePayload?.(info.payload) || null; }
            catch (error) { spec = null; }
            if (spec?.mode && window.QmxDiagramLazyLoader?.supports?.(spec.mode)) {
                window.QmxDiagramLazyLoader.openFromPreview(spec.mode, figure).catch((error) => {
                    console.error('[QMX Preview] Lazy diagram editor failed.', error);
                    window.alert(`Diagram editor load failed. ${error?.message || error}`);
                });
                return;
            }
            if (spec?.mode === 'geometry' && window.QmxGeometryEditor?.openFromPreview) {
                window.QmxGeometryEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'coordinate-geometry' && window.QmxCoordinateGeometryEditor?.openFromPreview) {
                window.QmxCoordinateGeometryEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'number-line' && window.QmxNumberLineEditor?.openFromPreview) {
                window.QmxNumberLineEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'tree-diagram' && window.QmxTreeDiagramEditor?.openFromPreview) {
                window.QmxTreeDiagramEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'technical-drawing' && window.QmxTechnicalDrawingEditor?.openFromPreview) {
                window.QmxTechnicalDrawingEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'statistical-diagram' && window.QmxStatisticalDiagramEditor?.openFromPreview) {
                window.QmxStatisticalDiagramEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'function-transformation' && window.QmxFunctionTransformationEditor?.openFromPreview) {
                window.QmxFunctionTransformationEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'complex-plane' && window.QmxComplexPlaneEditor?.openFromPreview) {
                window.QmxComplexPlaneEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'digital-logic' && window.QmxDigitalLogicEditor?.openFromPreview) {
                window.QmxDigitalLogicEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'finite-state-machine' && window.QmxFiniteStateMachineEditor?.openFromPreview) {
                window.QmxFiniteStateMachineEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'database-er' && window.QmxDatabaseErEditor?.openFromPreview) {
                window.QmxDatabaseErEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'network-topology' && window.QmxNetworkTopologyEditor?.openFromPreview) {
                window.QmxNetworkTopologyEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'uml-software-design' && window.QmxUmlSoftwareDesignEditor?.openFromPreview) {
                window.QmxUmlSoftwareDesignEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'uml-sequence' && window.QmxUmlSequenceEditor?.openFromPreview) {
                window.QmxUmlSequenceEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'uml-activity' && window.QmxUmlActivityEditor?.openFromPreview) {
                window.QmxUmlActivityEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'cloud-deployment' && window.QmxCloudDeploymentEditor?.openFromPreview) {
                window.QmxCloudDeploymentEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'chemical-structure' && window.QmxChemicalStructureEditor?.openFromPreview) {
                window.QmxChemicalStructureEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'biological-cell' && window.QmxBiologicalCellEditor?.openFromPreview) {
                window.QmxBiologicalCellEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'human-anatomy' && window.QmxHumanAnatomyEditor?.openFromPreview) {
                window.QmxHumanAnatomyEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'plant-anatomy' && window.QmxPlantAnatomyEditor?.openFromPreview) {
                window.QmxPlantAnatomyEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'genetics-diagram' && window.QmxGeneticsEditor?.openFromPreview) {
                window.QmxGeneticsEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'ecology-diagram' && window.QmxEcologyEditor?.openFromPreview) {
                window.QmxEcologyEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'geology-diagram' && window.QmxGeologyEditor?.openFromPreview) {
                window.QmxGeologyEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'weather-climate-diagram' && window.QmxWeatherClimateEditor?.openFromPreview) {
                window.QmxWeatherClimateEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'astronomy-diagram' && window.QmxAstronomyEditor?.openFromPreview) {
                window.QmxAstronomyEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'hydrology-diagram' && window.QmxHydrologyEditor?.openFromPreview) {
                window.QmxHydrologyEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'oceanography-diagram' && window.QmxOceanographyEditor?.openFromPreview) {
                window.QmxOceanographyEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'environmental-science-diagram' && window.QmxEnvironmentalScienceEditor?.openFromPreview) {
                window.QmxEnvironmentalScienceEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'vector-fbd' && window.QmxVectorFbdEditor?.openFromPreview) {
                window.QmxVectorFbdEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'circuit' && window.QmxCircuitEditor?.openFromPreview) {
                window.QmxCircuitEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'ray-optics' && window.QmxRayOpticsEditor?.openFromPreview) {
                window.QmxRayOpticsEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'waveform' && window.QmxWaveformEditor?.openFromPreview) {
                window.QmxWaveformEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'venn-set' && window.QmxVennSetEditor?.openFromPreview) {
                window.QmxVennSetEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'timeline' && window.QmxTimelineEditor?.openFromPreview) {
                window.QmxTimelineEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'data-flow' && window.QmxDataFlowEditor?.openFromPreview) {
                window.QmxDataFlowEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'cross-section' && window.QmxCrossSectionEditor?.openFromPreview) {
                window.QmxCrossSectionEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'vector-art' && window.QmxVectorArtEditor?.openFromPreview) {
                window.QmxVectorArtEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'sports-field' && window.QmxSportsFieldEditor?.openFromPreview) {
                window.QmxSportsFieldEditor.openFromPreview(figure);
                return;
            }
            if (spec?.mode === 'stage-blocking' && window.QmxStageBlockingEditor?.openFromPreview) {
                window.QmxStageBlockingEditor.openFromPreview(figure);
                return;
            }
            if (!window.QmxGeneralFlowchartEditor?.openFromPreview) {
                window.alert('Diagram editor is not ready.');
                return;
            }
            window.QmxGeneralFlowchartEditor.openFromPreview(figure);
        });
    }

    function tokenRanges(value, type) {
        const pattern = type === 'graph' ? GRAPH_PATTERN : DIAGRAM_PATTERN;
        const ranges = [];
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(value)) !== null) {
            ranges.push({
                token: match[0],
                payload: match[1],
                start: match.index,
                end: match.index + match[0].length
            });
        }
        return ranges;
    }

    function findTextarea(info) {
        const central = document.querySelector('[data-editor-textarea]');
        if (central?.value.includes(info.token)) return central;

        const button = findPatternButton(info.sourceKey);
        const field = String(button?.dataset.patternField || info.sourceKey || '');
        const direct = field ? document.getElementById(field) : null;
        if (direct?.tagName === 'TEXTAREA' && direct.value.includes(info.token)) return direct;

        return Array.from(document.querySelectorAll('textarea')).find(
            (textarea) => textarea.value.includes(info.token)
        ) || central || null;
    }

    function removeRange(textarea, range) {
        let start = range.start;
        let end = range.end;
        const value = textarea.value;

        if (start === 0 && value[end] === '\n') {
            end += 1;
        } else if (value[start - 1] === '\n' && value[end] === '\n') {
            end += 1;
        } else if (value[start - 1] === '\n' && end === value.length) {
            start -= 1;
        }

        textarea.setRangeText('', start, end, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        window.QmxTokenChips?.focusSource?.(textarea);
    }

    function removeMedia(info) {
        if (!info.token) return;
        const label = info.type === 'graph' ? 'graph' : 'diagram';
        if (!window.confirm(`Remove this ${label}?`)) return;

        activateSource(info, () => {
            const textarea = findTextarea(info);
            if (!textarea) {
                window.alert('The source text field could not be found.');
                return;
            }

            const ranges = tokenRanges(textarea.value, info.type);
            let range = ranges[info.index] || null;
            if (!range || range.token !== info.token) {
                range = ranges.find((item) => item.token === info.token) || null;
            }
            if (!range) {
                window.alert(`The selected ${label} token could not be found.`);
                return;
            }

            removeRange(textarea, range);
            const status = document.querySelector('[data-preview-status]');
            if (status) {
                status.dataset.qmxPreviousText = status.textContent;
                status.textContent = `${label[0].toUpperCase() + label.slice(1)} removed`;
                window.setTimeout(() => {
                    status.textContent = status.dataset.qmxPreviousText || 'Live';
                    delete status.dataset.qmxPreviousText;
                }, 1400);
            }
        });
    }

    function handleClick(event) {
        const edit = event.target.closest('[data-qmx-media-edit]');
        const remove = event.target.closest('[data-qmx-media-remove]');
        const figure = event.target.closest(
            '[data-question-live-preview] .qmx-graph, ' +
            '[data-question-live-preview] .qmx-diagram'
        );

        if (figure) {
            if (isReadonlyFigure(figure)) return;
            selectFigure(figure);
            return;
        }

        clearSelection();
    }

    function init() {
        addStyles();
        decorate(document);

        document.addEventListener('click', handleClick);
        document.addEventListener('pointerdown', handlePointerDown, true);
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', clearInteraction);
        document.addEventListener('pointercancel', clearInteraction);

        const preview = document.querySelector('[data-question-live-preview]');
        if (!preview) return;

        let scheduled = false;
        const observer = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            window.requestAnimationFrame(() => {
                scheduled = false;
                decorate(preview);
            });
        });
        observer.observe(preview, { childList: true, subtree: true });
    }

    window.QmxPreviewMediaControls = Object.freeze({
        version: '1.2.1',
        decorate,
        selectFigure,
        clearSelection
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})(window, document);
