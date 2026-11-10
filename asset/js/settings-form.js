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
 * A field whose element has data-show-if-library (a JSON list) is shown only while the 3D viewer
 * library is one of them: the library select's value in the module's form, or, in a site's settings,
 * which have no library select, the module's library given in the element's data-library.
 *
 * A group of fields (Omeka's element groups, each a fieldset) is hidden while all its fields are.
 *
 * Only the display changes: hidden fields are still submitted, so their values are kept.
 */
(function (root) {
    'use strict';

    function controller(form, name) {
        return form.querySelector('select[name="' + name + '"], input[name="' + name + '"]:not([type="hidden"])');
    }

    const SELECTOR = '[data-show-if^="threedviewer_"], [name^="threedviewer_"][data-show-if-library]';

    function library(form, element) {
        const select = controller(form, 'threedviewer_default_library');
        return select ? select.value : element.dataset.library;
    }

    function applies(form, element) {
        if (element.dataset.showIfLibrary) {
            const current = library(form, element);
            if (current !== undefined && JSON.parse(element.dataset.showIfLibrary).indexOf(current) === -1) {
                return false;
            }
        }
        const master = element.dataset.showIf ? controller(form, element.dataset.showIf) : null;
        if (!master) {
            return true;
        }
        if (!applies(form, master)) {
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
        const groups = [];
        form.querySelectorAll(SELECTOR).forEach(function (element) {
            const field = element.closest('.field');
            if (field) {
                field.style.display = applies(form, element) ? '' : 'none';
                const group = field.parentNode;
                if (group && group.tagName === 'FIELDSET' && groups.indexOf(group) === -1) {
                    groups.push(group);
                }
            }
        });
        // A group's fieldset, once every field in it is hidden, so that no legend stands alone
        groups.forEach(function (group) {
            const shown = Array.prototype.some.call(group.children, function (child) {
                return child.classList && child.classList.contains('field') && child.style.display !== 'none';
            });
            group.style.display = shown ? '' : 'none';
        });
    }

    function install(document) {
        document.querySelectorAll('form').forEach(function (form) {
            if (form.dataset.threedviewerShowIf || !form.querySelector(SELECTOR)) {
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
