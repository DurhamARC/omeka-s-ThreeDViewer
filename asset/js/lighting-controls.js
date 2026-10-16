/**
 * Lighting controls: a panel on each viewer whose page shows them, listing the viewer's lights
 * with their colour, strength and direction.
 *
 * The viewer reports its lights (threedviewer:lighting-ready, see lighting-rig.js); the panel
 * builds a section per light from its <template> and sends the whole state back with every change
 * (threedviewer:lighting). Nothing is stored: a reload restores the page's lighting.
 */
(function () {
    'use strict';

    function copy(detail) {
        return JSON.parse(JSON.stringify(detail));
    }

    /** Light names come from the page, translated, never from the scene */
    function lightName(panel, light, number) {
        const names = {
            ambient: panel.dataset.nameAmbient,
            light: panel.dataset.nameLight,
            key: panel.dataset.nameKey,
            sky: panel.dataset.nameSky,
            point: panel.dataset.namePoint,
            environment: panel.dataset.nameEnvironment
        };
        return (names[light.kind] || light.kind).replace('%d', String(number));
    }

    function showValue(input) {
        const output = input.parentNode.querySelector('output');
        if (output) {
            output.textContent = input.value + (input.dataset.property === 'strength' ? '' : '°');
        }
    }

    /**
     * The viewer element a panel drives: the one beside it, which is the one it was rendered with
     * even where the page has another of the same id, else any on the page.
     */
    function targetOf(panel) {
        const id = panel.dataset.threedviewerTarget;
        const beside = panel.parentNode && window.CSS && CSS.escape
            ? panel.parentNode.querySelector('#' + CSS.escape(id))
            : null;
        return beside || document.getElementById(id);
    }

    function install(panel) {
        if (panel.dataset.lightingControlsReady) {
            return;
        }
        panel.dataset.lightingControlsReady = 'true';
        const target = targetOf(panel);
        const list = panel.querySelector('.threedviewer-lighting-lights');
        const template = panel.querySelector('template');
        const modes = panel.querySelectorAll('.threedviewer-lighting-mode input');
        const reset = panel.querySelector('.threedviewer-lighting-reset');
        if (!target || !list || !template) {
            return;
        }

        let initial = null;
        let state = null;

        function send(extra) {
            const detail = Object.assign(copy(state), extra || {});
            target.dispatchEvent(new CustomEvent('threedviewer:lighting', { detail: detail }));
        }

        function build(detail) {
            initial = copy(detail);
            state = copy(detail);
            list.textContent = '';
            let rigNumber = 0;
            state.lights.forEach(function (light) {
                const section = template.content.firstElementChild.cloneNode(true);
                if (light.kind === 'light') {
                    rigNumber++;
                }
                section.querySelector('legend').textContent = lightName(panel, light, rigNumber);
                section.querySelectorAll('[data-property]').forEach(function (input) {
                    const property = input.dataset.property;
                    if (light[property] === undefined) {
                        input.closest('.threedviewer-lighting-control').remove();
                        return;
                    }
                    input.value = light[property];
                    showValue(input);
                    input.addEventListener('input', function () {
                        light[property] = input.type === 'color' ? input.value : Number(input.value);
                        showValue(input);
                        send();
                    });
                });
                list.appendChild(section);
            });
            modes.forEach(function (radio) {
                radio.checked = radio.value === state.mode;
            });
            panel.hidden = false;
        }

        modes.forEach(function (radio) {
            radio.addEventListener('change', function () {
                if (radio.checked && state) {
                    state.mode = radio.value;
                    send();
                }
            });
        });
        if (reset) {
            reset.addEventListener('click', function () {
                if (initial) {
                    build(initial);
                    send({ reset: true });
                }
            });
        }

        target.addEventListener('threedviewer:lighting-ready', function (event) {
            build(event.detail);
        });
        if (target.threedviewerLighting) {
            build(target.threedviewerLighting);
        }
    }

    function installAll() {
        document.querySelectorAll('.threedviewer-lighting').forEach(install);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installAll);
    } else {
        installAll();
    }
}());
