/**
 * Show each ThreeDViewer setting only where it applies, in the module's configuration form and in a
 * site's settings.
 *
 * Follows AdvancedSearch's data-show-if (SearchConfigConfigureForm, advanced-search-collection.js),
 * where a field is shown only while a checkbox is checked. Here the element named in data-show-if
 * may be a select or a number: the field is shown while that element's value is one of
 * data-show-if-value (a JSON list) or at least data-show-if-min, and while that element's own field
 * is shown, so conditions chain (a light's fields hide with the light count, which hides with the
 * rig). Elements are found by name, as these forms give them no id.
 *
 * Only the display changes: hidden fields are still submitted, so their values are kept.
 */
(function (root) {
    'use strict';

    function controller(form, name) {
        return form.querySelector('select[name="' + name + '"], input[name="' + name + '"]:not([type="hidden"])');
    }

    function applies(form, element) {
        const master = controller(form, element.dataset.showIf);
        if (!master) {
            return true;
        }
        if (master.dataset.showIf && !applies(form, master)) {
            return false;
        }
        if (element.dataset.showIfValue) {
            return JSON.parse(element.dataset.showIfValue).indexOf(master.value) !== -1;
        }
        if (element.dataset.showIfMin) {
            return Number(master.value) >= Number(element.dataset.showIfMin);
        }
        return true;
    }

    function applyShowIf(form) {
        form.querySelectorAll('[data-show-if^="threedviewer_"]').forEach(function (element) {
            const field = element.closest('.field');
            if (field) {
                field.style.display = applies(form, element) ? '' : 'none';
            }
        });
    }

    function install(document) {
        document.querySelectorAll('form').forEach(function (form) {
            if (form.dataset.threedviewerShowIf || !form.querySelector('[data-show-if^="threedviewer_"]')) {
                return;
            }
            form.dataset.threedviewerShowIf = 'true';
            form.addEventListener('change', function () {
                applyShowIf(form);
            });
            applyShowIf(form);
        });
    }

    if (root.document) {
        if (root.document.readyState === 'loading') {
            root.document.addEventListener('DOMContentLoaded', function () {
                install(root.document);
            });
        } else {
            install(root.document);
        }
    }
    root.ThreeDViewerSettingsForm = { install: install, applies: applies };
}(typeof window !== 'undefined' ? window : globalThis));
