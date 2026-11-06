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
 * Runs the viewer on a page holding the given media blocks, the last of them the STL viewer's,
 * and returns the renderer it created
 */
function initialise(blocks) {
    const viewerBlock = blocks[blocks.length - 1];
    const loading = new Element('', 0, 0);
    loading.dataset.stlUrl = '/mesh.stl';
    viewerBlock.appendChild(loading);

    let renderer;
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
                renderer = this;
                this.domElement = new Element('', 0, 0);
            }
            setSize(width, height) {
                this.size = [width, height];
            }
            setClearColor() {}
            render() {}
        },
        OrbitControls: class { update() {} },
        STLLoader: class { load() {} }
    };
    const context = {
        THREE,
        console: { log() {}, error() {} },
        window: { addEventListener() {} },
        requestAnimationFrame() {},
        document: {
            addEventListener: (type, listener) => { ready = listener; },
            getElementById: (id) => (id === 'loading' ? loading : null),
            querySelector: (selector) => (selector === '.media-render' ? blocks[0] : null)
        }
    };
    runInNewContext(source, context);
    ready();
    return { renderer, context };
}

test('draws in its own media block when other media come before it', () => {
    const thumbnail = new Element('media-render file', 300, 200);
    const viewerBlock = new Element('media-render file', 800, 500);

    const { renderer } = initialise([thumbnail, viewerBlock]);

    assert.equal(renderer.domElement.parentElement, viewerBlock);
    assert.deepEqual(thumbnail.children, []);
    assert.deepEqual(renderer.size, [800, 500]);
});

test('keeps to its own media block when resized', () => {
    const thumbnail = new Element('media-render file', 300, 200);
    const viewerBlock = new Element('media-render file', 800, 500);
    const { renderer, context } = initialise([thumbnail, viewerBlock]);

    viewerBlock.clientWidth = 600;
    runInNewContext('onWindowResize()', context);

    assert.deepEqual(renderer.size, [600, 500]);
});
