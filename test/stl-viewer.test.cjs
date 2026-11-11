// Run with: node --test test/stl-viewer.test.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../asset/js/stl-viewer.js'), 'utf8');

class Element {
    constructor(className, width, height) {
        this.className = className;
        this.clientWidth = width;
        this.clientHeight = height;
        this.children = [];
        this.parentElement = null;
        this.dataset = {};
        this.style = {};
    }
    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
    }
}

/**
 * Runs the viewer script on a page holding the given media blocks, each of the STL viewers' with
 * an element carrying its settings, and returns the renderers it created and each viewer element
 */
function initialise(blocks, viewerBlocks, { failFirst = false } = {}) {
    const viewers = viewerBlocks.map((block, i) => {
        const element = new Element('threedviewer-stl-loading', 0, 0);
        element.dataset.stlUrl = '/mesh' + i + '.stl';
        block.appendChild(element);
        return element;
    });

    const renderers = [];
    let ready;
    class Stub {
        constructor() {
            this.position = { set() { return this; }, normalize() {} };
            this.children = [];
        }
        add() {}
        updateProjectionMatrix() {}
    }
    const THREE = {
        Color: Stub,
        Scene: Stub,
        AmbientLight: Stub,
        DirectionalLight: Stub,
        PerspectiveCamera: class extends Stub {
            constructor(fov, aspect) {
                super();
                this.aspect = aspect;
            }
        },
        WebGLRenderer: class {
            constructor() {
                if (failFirst && !failed) {
                    failed = true;
                    throw new Error('Error creating WebGL context.');
                }
                renderers.push(this);
                this.domElement = new Element('', 0, 0);
            }
            setSize(width, height) {
                this.size = [width, height];
            }
            setClearColor() {}
            render() {}
        },
        OrbitControls: class { update() {} },
        STLLoader: class {
            load(url, onLoad, onProgress, onError) {
                loaded.push(url);
                callbacks.push({ onLoad, onProgress, onError });
            }
        }
    };
    let failed = false;
    const loaded = [];
    const callbacks = [];
    const context = {
        THREE,
        console: { log() {}, error: (...args) => errors.push(args) },
        window: { addEventListener() {} },
        requestAnimationFrame() {},
        document: {
            addEventListener: (type, listener) => { ready = listener; },
            querySelectorAll: (selector) => (selector === '[data-stl-url]' ? viewers : []),
            querySelector: (selector) => (selector === '.media-render' ? blocks[0] : null)
        }
    };
    const errors = [];
    runInNewContext(source, context);
    ready();
    return { renderers, viewers, loaded, ready, callbacks, errors };
}

test('draws in its own media block when other media come before it', () => {
    const thumbnail = new Element('media-render file', 300, 200);
    const viewerBlock = new Element('media-render file', 800, 500);

    const { renderers: [renderer] } = initialise([thumbnail, viewerBlock], [viewerBlock]);

    assert.equal(renderer.domElement.parentElement, viewerBlock);
    assert.deepEqual(thumbnail.children, []);
    assert.deepEqual(renderer.size, [800, 500]);
});

test('keeps to its own media block when resized', () => {
    const thumbnail = new Element('media-render file', 300, 200);
    const viewerBlock = new Element('media-render file', 800, 500);
    const { renderers: [renderer], viewers: [viewer] } = initialise([thumbnail, viewerBlock], [viewerBlock]);

    viewerBlock.clientWidth = 600;
    viewer.threedviewerStl.resize();

    assert.deepEqual(renderer.size, [600, 500]);
});

test('every STL on the page gets a viewer of its own', () => {
    const first = new Element('media-render file', 800, 500);
    const second = new Element('media-render file', 400, 300);
    const { renderers, viewers, loaded, ready } = initialise([first, second], [first, second]);

    assert.equal(renderers.length, 2);
    assert.equal(renderers[0].domElement.parentElement, first);
    assert.equal(renderers[1].domElement.parentElement, second);
    assert.deepEqual(loaded, ['/mesh0.stl', '/mesh1.stl'], 'each loads its own model');
    assert.notEqual(viewers[0].threedviewerStl.scene, viewers[1].threedviewerStl.scene, 'each has its own scene');

    // Started again, as by the script loaded twice, it makes no more viewers
    ready();
    assert.equal(renderers.length, 2, 'no viewer is started twice');

    // Resizing one leaves the other as it is
    second.clientWidth = 200;
    viewers[1].threedviewerStl.resize();
    assert.deepEqual(renderers[0].size, [800, 500]);
    assert.deepEqual(renderers[1].size, [200, 300]);
});

test('a viewer that fails to start says so, and the others still start', () => {
    const first = new Element('media-render file', 800, 500);
    const second = new Element('media-render file', 400, 300);
    const { renderers, viewers, errors } = initialise([first, second], [first, second], { failFirst: true });

    assert.equal(viewers[0].textContent, 'Error: Could not show the model');
    assert.equal(errors.length, 1, 'the error is logged');
    assert.equal(renderers.length, 1);
    assert.equal(renderers[0].domElement.parentElement, second, 'the second viewer starts all the same');
    assert.ok(viewers[1].threedviewerStl);
});

test('a model that downloads but fails to load shows its error, though its message was hidden', () => {
    const block = new Element('media-render file', 800, 500);
    const { viewers: [viewer], callbacks: [loading] } = initialise([block], [block]);

    loading.onProgress({ lengthComputable: true, loaded: 10, total: 10 });
    assert.equal(viewer.style.display, 'none', 'hidden once downloaded');
    loading.onError(new Error('not an STL'));
    assert.equal(viewer.style.display, '', 'shown again');
    assert.equal(viewer.textContent, 'Error loading STL model. Please verify the file exists.');
});
