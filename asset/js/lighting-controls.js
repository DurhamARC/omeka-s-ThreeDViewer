/**
 * Lighting controls: a panel on each viewer whose page shows them, opened from a button in the
 * viewer's toolbar, listing the viewer's lights. Each light is a row with its colour and strength,
 * which opens onto its direction and height (and ground colour) where it has them, one light at a time.
 * Escape closes the panel, as does a click (not a drag) anywhere outside it.
 *
 * Directions are as seen from the camera now. Where the lights are fixed to the model, turning the
 * model turns them round the view, and the viewer reports where they have turned to
 * (threedviewer:lighting-turned), which the sliders follow. It does so only while the panel is
 * open (threedviewer:lighting-panel), and catches up as it opens.
 *
 * The viewer reports its lights (threedviewer:lighting-ready, see lighting-rig.js); the panel
 * builds a row per light from its <template> and sends the whole state back with every change
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
        const output = input.nextElementSibling;
        if (output && output.tagName === 'OUTPUT') {
            output.textContent = input.value + (input.dataset.property === 'strength' ? '' : '°');
        }
    }

    /** Take a control out of a row, keeping its place in the row's columns */
    function vacate(element) {
        element.replaceWith(document.createElement('span'));
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
        const toggle = panel.parentNode
            ? panel.parentNode.querySelector('[aria-controls="' + panel.id + '"]')
            : null;
        const list = panel.querySelector('.threedviewer-lighting-lights');
        const template = panel.querySelector('template');
        const modes = panel.querySelectorAll('.threedviewer-lighting-mode input');
        const reset = panel.querySelector('.threedviewer-lighting-reset');
        const close = panel.querySelector('.threedviewer-lighting-close');
        if (!target || !toggle || !list || !template) {
            return;
        }

        let initial = null;
        let state = null;
        let sections = [];

        function send(extra) {
            const detail = Object.assign(copy(state), extra || {});
            target.dispatchEvent(new CustomEvent('threedviewer:lighting', { detail: detail }));
        }

        function open(show) {
            panel.hidden = !show;
            toggle.setAttribute('aria-expanded', String(show));
            // The viewer reports turned lights only while the panel shows them
            target.dispatchEvent(new CustomEvent('threedviewer:lighting-panel', { detail: { open: show } }));
        }

        /** Open one light's direction and height, closing any other's */
        function expand(section, show) {
            list.querySelectorAll('.threedviewer-lighting-light').forEach(function (other) {
                const more = other.querySelector('.threedviewer-lighting-more');
                const details = other.querySelector('.threedviewer-lighting-details');
                if (more && details) {
                    const expanded = other === section && show;
                    more.setAttribute('aria-expanded', String(expanded));
                    details.hidden = !expanded;
                }
            });
        }

        function build(detail) {
            initial = copy(detail);
            state = copy(detail);
            list.textContent = '';
            sections = [];
            let rigNumber = 0;
            let first = null;
            state.lights.forEach(function (light) {
                const section = template.content.firstElementChild.cloneNode(true);
                if (light.kind === 'light') {
                    rigNumber++;
                }
                const name = lightName(panel, light, rigNumber);
                section.setAttribute('aria-label', name);
                const label = section.querySelector('.threedviewer-lighting-name');
                label.textContent = name;
                label.title = name; // for a narrow viewer, which cuts the name short
                section.querySelectorAll('[data-property]').forEach(function (input) {
                    const property = input.dataset.property;
                    if (light[property] === undefined) {
                        const control = input.closest('.threedviewer-lighting-control');
                        if (control) {
                            control.remove();
                        } else {
                            if (input.nextElementSibling && input.nextElementSibling.tagName === 'OUTPUT') {
                                vacate(input.nextElementSibling);
                            }
                            vacate(input);
                        }
                        return;
                    }
                    // Brightness can take a strength past the slider's end: lengthen it, rather
                    // than show less and lower the light at the first touch
                    if (input.type === 'range' && Number(light[property]) > Number(input.max)) {
                        input.max = String(Math.ceil(light[property]));
                    }
                    input.value = light[property];
                    showValue(input);
                    input.addEventListener('input', function () {
                        light[property] = input.type === 'color' ? input.value : Number(input.value);
                        showValue(input);
                        send();
                    });
                });
                const more = section.querySelector('.threedviewer-lighting-more');
                const details = section.querySelector('.threedviewer-lighting-details');
                if (details.querySelector('[data-property]')) {
                    more.addEventListener('click', function () {
                        expand(section, more.getAttribute('aria-expanded') !== 'true');
                    });
                    first = first || section;
                } else {
                    vacate(more);
                    details.remove();
                }
                list.appendChild(section);
                sections.push(section);
            });
            // The first light with a direction starts open, showing what a row holds
            if (first) {
                expand(first, true);
            }
            modes.forEach(function (radio) {
                radio.checked = radio.value === state.mode;
            });
            toggle.hidden = false;
        }

        toggle.addEventListener('click', function () {
            open(panel.hidden);
        });

        // Escape, from the panel or its button, closes the panel and returns to the button
        function escape(event) {
            if (event.key === 'Escape' && !panel.hidden) {
                event.preventDefault();
                open(false);
                toggle.focus();
            }
        }
        panel.addEventListener('keydown', escape);
        toggle.addEventListener('keydown', escape);

        // A click anywhere else, on the model or the page, closes it; a drag does not, so that the
        // model can be turned under the lights with the panel open
        let down = null;
        document.addEventListener('pointerdown', function (event) {
            const inside = panel.contains(event.target) || toggle.contains(event.target);
            down = panel.hidden || inside ? null : { x: event.clientX, y: event.clientY };
        }, true);
        document.addEventListener('pointerup', function (event) {
            if (down && Math.abs(event.clientX - down.x) + Math.abs(event.clientY - down.y) < 6) {
                open(false);
            }
            down = null;
        }, true);
        if (close) {
            close.addEventListener('click', function () {
                open(false);
                toggle.focus();
            });
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

        // The lights have turned round the view: follow them, except a slider being dragged
        target.addEventListener('threedviewer:lighting-turned', function (event) {
            if (!state) {
                return;
            }
            event.detail.lights.forEach(function (turned) {
                const i = state.lights.findIndex(function (light) {
                    return light.id === turned.id;
                });
                if (i < 0) {
                    return;
                }
                ['azimuth', 'elevation'].forEach(function (property) {
                    state.lights[i][property] = turned[property];
                    const input = sections[i].querySelector('[data-property="' + property + '"]');
                    if (input && !input.matches(':active')) {
                        input.value = turned[property];
                        showValue(input);
                    }
                });
            });
        });

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
