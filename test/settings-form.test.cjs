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
                return list.find((e) => e.dataset.showIf && e.dataset.showIf.startsWith('threedviewer_')) || null;
            }
            const name = /name="([^"]+)"/.exec(selector)[1];
            return list.find((e) => e.name === name && e.type !== 'hidden') || null;
        },
        querySelectorAll(selector) {
            return list.filter((e) => e.dataset.showIf && e.dataset.showIf.startsWith('threedviewer_'));
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
