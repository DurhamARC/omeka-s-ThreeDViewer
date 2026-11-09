// Run with: node --test test/settings-form.test.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../asset/js/settings-form.js'), 'utf8');

/**
 * A form of fields as Omeka renders them: each element alone in a .field. Only what
 * settings-form.js uses: querySelector(All) by name and by data-show-if, closest('.field'),
 * and the form's change listener.
 */
const conditional = (e) => (e.dataset.showIf && e.dataset.showIf.startsWith('threedviewer_'))
    || (e.dataset.showIfLibrary && e.name.startsWith('threedviewer_'));

function makeForm(elements) {
    const listeners = {};
    const list = elements.map(function (spec) {
        const field = { style: { display: '' } };
        return Object.assign({
            tag: spec.tag || 'select',
            type: spec.type || '',
            dataset: spec.dataset || {},
            closest: (selector) => (selector === '.field' ? field : null),
            field
        }, spec);
    });
    const form = {
        dataset: {},
        elements: list,
        addEventListener: (type, listener) => { listeners[type] = listener; },
        change: () => listeners.change(),
        querySelector(selector) {
            if (selector.startsWith('[data-show-if')) {
                return list.find(conditional) || null;
            }
            const name = /name="([^"]+)"/.exec(selector)[1];
            return list.find((e) => e.name === name && e.type !== 'hidden') || null;
        },
        querySelectorAll(selector) {
            return list.filter(conditional);
        }
    };
    return form;
}

function install(form) {
    const window = {};
    runInNewContext(source, { window });
    window.ThreeDViewerSettingsForm.install({ querySelectorAll: () => [form] });
}

const shown = (form, name) => form.elements.find((e) => e.name === name).field.style.display !== 'none';

function rigForm(lights, count, environment) {
    return makeForm([
        { name: 'threedviewer_lights', value: lights },
        { name: 'threedviewer_light_count', value: count,
            dataset: { showIf: 'threedviewer_lights', showIfValue: '["custom"]' } },
        { name: 'threedviewer_light_1_color', type: 'color', value: '#ffffff',
            dataset: { showIf: 'threedviewer_light_count', showIfMin: '1' } },
        { name: 'threedviewer_light_3_color', type: 'color', value: '#ffffff',
            dataset: { showIf: 'threedviewer_light_count', showIfMin: '3' } },
        { name: 'threedviewer_model_viewer_environment', value: environment,
            dataset: { showIf: 'threedviewer_lights', showIfValue: '["","default"]' } },
        { name: 'threedviewer_model_viewer_environment_url', type: 'text', value: '',
            dataset: { showIf: 'threedviewer_model_viewer_environment', showIfValue: '["custom"]' } }
    ]);
}

test('Viewer default: the rig is hidden, its lights with it', () => {
    const form = rigForm('default', '4', 'custom');
    install(form);
    assert.equal(shown(form, 'threedviewer_light_count'), false);
    assert.equal(shown(form, 'threedviewer_light_1_color'), false, 'chained: hidden with the count');
    assert.equal(shown(form, 'threedviewer_model_viewer_environment'), true);
    assert.equal(shown(form, 'threedviewer_model_viewer_environment_url'), true);
});

test('Custom: lights up to the count, and the environment settings hidden', () => {
    const form = rigForm('custom', '2', 'custom');
    install(form);
    assert.equal(shown(form, 'threedviewer_light_count'), true);
    assert.equal(shown(form, 'threedviewer_light_1_color'), true);
    assert.equal(shown(form, 'threedviewer_light_3_color'), false);
    assert.equal(shown(form, 'threedviewer_model_viewer_environment'), false);
    assert.equal(shown(form, 'threedviewer_model_viewer_environment_url'), false, 'chained');
});

test('A site keeping the module lights sees the environment settings; changes apply as made', () => {
    const form = rigForm('', '1', 'neutral');
    install(form);
    assert.equal(shown(form, 'threedviewer_model_viewer_environment'), true);
    assert.equal(shown(form, 'threedviewer_model_viewer_environment_url'), false);
    assert.equal(shown(form, 'threedviewer_light_1_color'), false);

    form.elements[0].value = 'custom';
    form.elements[1].value = '3';
    form.change();
    assert.equal(shown(form, 'threedviewer_light_3_color'), true);
    assert.equal(shown(form, 'threedviewer_model_viewer_environment'), false);
});

function libraryForm(library, lights) {
    return makeForm([
        { name: 'threedviewer_default_library', value: library },
        { name: 'threedviewer_lights', value: lights },
        { name: 'threedviewer_model_viewer_shadow_intensity', type: 'number', value: '0',
            dataset: { showIfLibrary: '["model-viewer"]' } },
        { name: 'threedviewer_model_viewer_environment', value: 'custom',
            dataset: { showIf: 'threedviewer_lights', showIfValue: '["","default"]', showIfLibrary: '["model-viewer"]' } },
        { name: 'threedviewer_model_viewer_environment_url', type: 'text', value: '',
            dataset: { showIf: 'threedviewer_model_viewer_environment', showIfValue: '["custom"]',
                showIfLibrary: '["model-viewer"]' } },
        { name: 'threedviewer_babylon_camera', value: 'arcRotate', dataset: { showIfLibrary: '["babylon"]' } },
        { name: 'threedviewer_babylon_lighting', value: 'hemispheric',
            dataset: { showIf: 'threedviewer_lights', showIfValue: '["","default"]', showIfLibrary: '["babylon"]' } }
    ]);
}

test('Babylon.js: the model-viewer settings are hidden, the Babylon.js ones shown', () => {
    const form = libraryForm('babylon', 'default');
    install(form);
    assert.equal(shown(form, 'threedviewer_model_viewer_shadow_intensity'), false);
    assert.equal(shown(form, 'threedviewer_model_viewer_environment'), false);
    assert.equal(shown(form, 'threedviewer_model_viewer_environment_url'), false);
    assert.equal(shown(form, 'threedviewer_babylon_camera'), true);
    assert.equal(shown(form, 'threedviewer_babylon_lighting'), true);
});

test('model-viewer: the other way round; both conditions apply', () => {
    const form = libraryForm('model-viewer', 'custom');
    install(form);
    assert.equal(shown(form, 'threedviewer_model_viewer_shadow_intensity'), true);
    assert.equal(shown(form, 'threedviewer_model_viewer_environment'), false, 'Custom lights');
    assert.equal(shown(form, 'threedviewer_babylon_camera'), false);
    assert.equal(shown(form, 'threedviewer_babylon_lighting'), false);

    form.elements[1].value = 'default';
    form.elements[0].value = 'babylon';
    form.change();
    assert.equal(shown(form, 'threedviewer_babylon_lighting'), true, 'changes apply as made');
    assert.equal(shown(form, 'threedviewer_model_viewer_shadow_intensity'), false);
});

test('A site, with no library select, follows the module library given on each element', () => {
    const form = makeForm([
        { name: 'threedviewer_model_viewer_shadow_intensity', type: 'number', value: '',
            dataset: { showIfLibrary: '["model-viewer"]', library: 'babylon' } },
        { name: 'threedviewer_babylon_environment', value: '',
            dataset: { showIfLibrary: '["babylon"]', library: 'babylon' } },
        { name: 'threedviewer_babylon_lighting', value: '',
            dataset: { showIfLibrary: '["babylon"]' } }
    ]);
    install(form);
    assert.equal(shown(form, 'threedviewer_model_viewer_shadow_intensity'), false);
    assert.equal(shown(form, 'threedviewer_babylon_environment'), true);
    assert.equal(shown(form, 'threedviewer_babylon_lighting'), true, 'no library known: shown');
});
