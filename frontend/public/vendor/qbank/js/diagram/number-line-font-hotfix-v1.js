(function () {
    'use strict';

    var VERSION = '1.1.0';
    var STYLE_ID = 'qmx-number-line-font-hotfix-style';
    var FONT_STACK = '"Segoe UI", Arial, "Noto Sans Bengali", sans-serif';

    function injectStyle() {
        var current = document.getElementById(STYLE_ID);
        if (current) current.remove();

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.qmx-number-line-editor,',
            '.qmx-number-line-editor *,',
            '.qmx-number-line-editor input,',
            '.qmx-number-line-editor textarea,',
            '.qmx-number-line-editor select,',
            '.qmx-number-line-editor button,',
            '.qmx-number-line-editor option,',
            '.qmx-number-line-editor [contenteditable="true"],',
            '.qmx-number-line-editor svg text,',
            '.qmx-number-line-editor svg tspan {',
            '  font-family: ' + FONT_STACK + ' !important;',
            '  font-variant-ligatures: normal !important;',
            '  font-feature-settings: normal !important;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function applyRoot(root) {
        if (!root || root.nodeType !== 1) return false;

        root.style.setProperty('font-family', FONT_STACK, 'important');
        root.style.setProperty('font-variant-ligatures', 'normal', 'important');
        root.style.setProperty('font-feature-settings', 'normal', 'important');

        var elements = root.querySelectorAll('input, textarea, select, button, option, label, strong, small, div, span, p, svg text, svg tspan');
        for (var i = 0; i < elements.length; i += 1) {
            elements[i].style.setProperty('font-family', FONT_STACK, 'important');
            elements[i].style.setProperty('font-variant-ligatures', 'normal', 'important');
            elements[i].style.setProperty('font-feature-settings', 'normal', 'important');
        }

        var svgText = root.querySelectorAll('svg text, svg tspan');
        for (var j = 0; j < svgText.length; j += 1) {
            svgText[j].setAttribute('font-family', 'Segoe UI, Arial, Noto Sans Bengali, sans-serif');
        }
        return true;
    }

    function apply() {
        injectStyle();
        var roots = document.querySelectorAll('.qmx-number-line-editor');
        var applied = 0;
        for (var i = 0; i < roots.length; i += 1) {
            if (applyRoot(roots[i])) applied += 1;
        }
        return applied;
    }

    function initialize() {
        apply();

        var observer = new MutationObserver(function (mutations) {
            var shouldApply = false;
            for (var i = 0; i < mutations.length && !shouldApply; i += 1) {
                var nodes = mutations[i].addedNodes;
                for (var j = 0; j < nodes.length; j += 1) {
                    var node = nodes[j];
                    if (node.nodeType !== 1) continue;
                    if ((node.matches && node.matches('.qmx-number-line-editor')) ||
                        (node.querySelector && node.querySelector('.qmx-number-line-editor'))) {
                        shouldApply = true;
                        break;
                    }
                    if (node.closest && node.closest('.qmx-number-line-editor')) {
                        shouldApply = true;
                        break;
                    }
                }
            }
            if (shouldApply) window.requestAnimationFrame(apply);
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        document.addEventListener('click', function (event) {
            var target = event.target && event.target.closest ? event.target.closest('.qmx-number-line-editor, [data-tool-id], [data-diagram-tool], button') : null;
            if (!target) return;
            var signature = [
                target.getAttribute && target.getAttribute('data-tool-id'),
                target.getAttribute && target.getAttribute('data-diagram-tool'),
                target.getAttribute && target.getAttribute('data-mode'),
                target.textContent
            ].join(' ').toLowerCase();
            if (target.closest('.qmx-number-line-editor') || signature.indexOf('number-line') !== -1 || signature.indexOf('number line') !== -1 || signature.indexOf('interval') !== -1) {
                window.setTimeout(apply, 0);
                window.setTimeout(apply, 80);
                window.setTimeout(apply, 250);
            }
        }, true);
    }

    window.QmxNumberLineFontHotfix = Object.freeze({
        version: VERSION,
        apply: apply
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
}());
