// Run with: node --test test/stl-up-axis.test.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { createContext, runInContext } = require('node:vm');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');

// A tetrahedron with legs of three lengths along x, y and z (corners O, X, Y, Z). No rotation maps
// it onto its mirror image, so a mirrored model shows as a negative signed volume.
const CORNERS = [[0, 0, 0], [3, 0, 0], [0, 2, 0], [0, 0, 1]];
const FACES = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]]; // wound outwards

function stl(binary) {
    const facets = FACES.map((face) => {
        const [a, b, c] = face.map((i) => CORNERS[i]);
        const u = b.map((v, i) => v - a[i]);
        const w = c.map((v, i) => v - a[i]);
        return [[u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], a, b, c];
    });
    if (!binary) {
        return 'solid t\n' + facets.map(([n, ...v]) => `facet normal ${n.join(' ')}\nouter loop\n`
            + v.map((p) => `vertex ${p.join(' ')}\n`).join('') + 'endloop\nendfacet\n').join('') + 'endsolid t\n';
    }
    const buffer = Buffer.alloc(84 + 50 * facets.length);
    buffer.writeUInt32LE(facets.length, 80);
    facets.flat(2).forEach((v, i) => buffer.writeFloatLE(v, 84 + 50 * Math.floor(i / 12) + 4 * (i % 12)));
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length);
}

// The real Three.js r120 and STLLoader the module ships
function three() {
    const context = createContext({ console: { log() {}, warn() {}, error() {} } });
    context.self = context.window = context;
    runInContext(read('asset/vendor/three/three.min.js'), context);
    runInContext(read('asset/vendor/three/STLLoader.js'), context);
    return context;
}

/** Each corner's position, from the viewer's (unindexed) vertex positions */
function corners(positions) {
    const found = [];
    FACES.forEach((face, f) => face.forEach((corner, v) => {
        found[corner] = Array.from(positions.slice((f * 3 + v) * 3, (f * 3 + v) * 3 + 3));
    }));
    return found;
}

// Positions rounded past float32's precision, and -0 as 0, which strict comparison tells apart
const tidy = (points) => points.map((point) => point.map((v) => Math.round(v * 1e6) / 1e6 + 0));

function signedVolume([o, x, y, z]) {
    const [a, b, c] = [x, y, z].map((p) => p.map((v, i) => v - o[i]));
    return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

/** The corners as the Three.js STL viewer shows them (right-handed, Y up) */
function threeCorners(binary, upAxis) {
    const context = three();
    const loading = { dataset: { stlUrl: '/t.stl', stlUpAxis: upAxis }, style: {} };
    loading.parentElement = { clientWidth: 800, clientHeight: 500, appendChild() {} };
    let ready;
    context.document = {
        addEventListener: (type, listener) => { ready = listener; },
        getElementById: (id) => (id === 'loading' ? loading : null)
    };
    context.requestAnimationFrame = context.addEventListener = () => {};
    runInContext(read('asset/js/stl-viewer.js'), context);
    const THREE = context.THREE;
    THREE.WebGLRenderer = class {
        constructor() { this.domElement = {}; }
        setSize() {}
        setClearColor() {}
        render() {}
    };
    THREE.OrbitControls = class { update() {} };
    THREE.STLLoader.prototype.load = function (url, onLoad) { onLoad(this.parse(stl(binary))); };
    ready();
    const mesh = runInContext('scene', context).children.find((child) => child.isMesh);
    return tidy(corners(mesh.geometry.attributes.position.array));
}

/**
 * The corners as the Babylon.js viewer shows them, turned into a right-handed frame (z negated) to
 * compare. The STL loader's default swap of Y and Z is applied here as Babylon.js does it
 * (packages/dev/loaders/src/STL/stlFileLoader.pure.ts); the viewer's own code runs unchanged.
 */
function babylonCorners(binary, upAxis) {
    const geometry = new (three().THREE.STLLoader)().parse(stl(binary));
    const swap = (a) => a.map((v, i) => [v, a[i - i % 3 + 2], a[i - i % 3 + 1]][i % 3]);
    const data = { position: swap(Array.from(geometry.attributes.position.array)),
        normal: swap(Array.from(geometry.attributes.normal.array)) };
    const mesh = { name: 'stlmesh', getVerticesData: (kind) => data[kind],
        setVerticesData: (kind, values) => { data[kind] = values; }, refreshBoundingInfo() {} };
    class Vector3 {
        static Zero() { return new Vector3(); }
        static Center() { return new Vector3(); }
        subtract() { return new Vector3(); }
    }
    class Camera { setTarget() {} attachControl() {} getBehaviorByName() { return null; } }
    Camera.prototype.inputs = { attached: { mousewheel: {} } };
    const STLFileLoader = { DO_NOT_ALTER_FILE_COORDINATES: true };
    const BABYLON = {
        Engine: class { runRenderLoop() {} },
        Scene: class { constructor() { this.lights = []; this.meshes = []; } },
        Color3: { FromHexString: () => ({ r: 0, g: 0, b: 0 }) },
        Color4: class {},
        ArcRotateCamera: Camera,
        UniversalCamera: class {},
        HemisphericLight: class {},
        Vector3,
        Mesh: { MinMax: () => ({ min: new Vector3(), max: new Vector3() }) },
        BoundingInfo: class { constructor() { this.boundingSphere = { radius: 1 }; } },
        VertexBuffer: { PositionKind: 'position', NormalKind: 'normal' },
        STLFileLoader,
        SceneLoader: { Append(root, file, scene, onSuccess) { scene.meshes.push(mesh); onSuccess(); } }
    };
    const canvas = { dataset: { modelUrl: '/files/t.stl', camera: 'arcRotate', environment: 'none',
        stlUpAxis: upAxis } };
    const context = createContext({ BABYLON, console, window: { BABYLON, addEventListener() {} },
        document: { readyState: 'complete', querySelectorAll: () => [canvas], getElementById: () => null } });
    runInContext(read('asset/js/babylon-viewer.js'), context);
    if (upAxis) {
        assert.equal(STLFileLoader.DO_NOT_ALTER_FILE_COORDINATES, false, 'the loader keeps its swap');
    }
    return tidy(corners(data.position).map(([x, y, z]) => [x, y, -z]));
}

const FILE = CORNERS;
const Z_UP = tidy(CORNERS.map(([x, y, z]) => [x, z, -y])); // the file's Z turned up, as a rotation
const EXPECTED = {
    current: { three: FILE, babylon: Z_UP }, // each viewer as it was
    y: { three: FILE, babylon: FILE },
    z: { three: Z_UP, babylon: Z_UP }
};

for (const binary of [false, true]) {
    for (const upAxis of ['current', 'y', 'z']) {
        const name = `${binary ? 'binary' : 'ASCII'} STL, ${upAxis}`;
        const attribute = upAxis === 'current' ? undefined : upAxis;

        test(`${name}: each viewer turns the model as set, without mirroring it`, () => {
            const shown = { three: threeCorners(binary, attribute), babylon: babylonCorners(binary, attribute) };
            for (const viewer of ['three', 'babylon']) {
                assert.deepEqual(shown[viewer], EXPECTED[upAxis][viewer], viewer);
                assert.equal(signedVolume(shown[viewer]), signedVolume(FILE), `${viewer} is not mirrored`);
            }
        });
    }

    test(`${binary ? 'binary' : 'ASCII'} STL: a chosen axis is up in both viewers`, () => {
        // Corner Y lies on the file's Y axis and corner Z on its Z axis: the chosen one points up
        assert.deepEqual(threeCorners(binary, 'y')[2], [0, 2, 0]);
        assert.deepEqual(babylonCorners(binary, 'y')[2], [0, 2, 0]);
        assert.deepEqual(threeCorners(binary, 'z')[3], [0, 1, 0]);
        assert.deepEqual(babylonCorners(binary, 'z')[3], [0, 1, 0]);
    });
}
