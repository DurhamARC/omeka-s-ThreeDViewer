// Run with: node --test test/lighting-rig.test.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../asset/js/lighting-rig.js'), 'utf8');

function load() {
    const window = {};
    runInNewContext(source, { window, console });
    return window.ThreeDViewerLighting;
}

const lighting = load();
const element = (dataset) => ({ dataset });
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual}`);

test('parse: no rig without data-lights, or when it is not JSON', () => {
    assert.equal(lighting.parse(element({})), null);
    assert.equal(lighting.parse(element({ lights: '{' })), null);
    assert.equal(lighting.parse(null), null);
});

test('parse: values are checked, clamped and limited to four lights', () => {
    const lights = [
        { color: '#FF0000', strength: 9, azimuth: -400, elevation: 120 },
        { color: 'red', strength: 'x' }
    ].concat(Array(4).fill({ color: '#00ff00', strength: 1, azimuth: 10, elevation: 20 }));
    const rig = lighting.parse(element({
        lights: JSON.stringify({ ambient: { color: '#ABCDEF', strength: -1 }, lights })
    }));
    assert.deepEqual(JSON.parse(JSON.stringify(rig.ambient)), { color: '#abcdef', strength: 0 });
    assert.equal(rig.lights.length, 4);
    assert.deepEqual(
        JSON.parse(JSON.stringify(rig.lights[0])),
        { color: '#ff0000', strength: 3, azimuth: -180, elevation: 90 }
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(rig.lights[1])),
        { color: '#ffffff', strength: 0, azimuth: 0, elevation: 45 }
    );
});

test('brightness: 1 by default, clamped otherwise', () => {
    assert.equal(lighting.brightness(element({})), 1);
    assert.equal(lighting.brightness(element({ lightBrightness: '0' })), 0);
    assert.equal(lighting.brightness(element({ lightBrightness: '1.5' })), 1.5);
    assert.equal(lighting.brightness(element({ lightBrightness: '7' })), 3);
    assert.equal(lighting.brightness(element({ lightBrightness: 'bright' })), 1);
});

test('direction: relative to the side the camera looks from', () => {
    const front = { x: 0, z: 1 };
    const d = (az, el, back, lh) => lighting.direction(az, el, back, lh);
    const check = (v, x, y, z, message) => {
        close(v.x, x, `${message} x`);
        close(v.y, y, `${message} y`);
        close(v.z, z, `${message} z`);
    };
    check(d(0, 0, front, false), 0, 0, 1, 'from the camera');
    check(d(90, 0, front, false), 1, 0, 0, 'from the right, right-handed');
    check(d(90, 0, front, true), -1, 0, 0, 'from the right, left-handed');
    check(d(180, 0, front, false), 0, 0, -1, 'from behind');
    check(d(-30, 90, front, false), 0, 1, 0, 'overhead');
    // A camera at (1, 1, 1), as the STL viewer's: 0 degrees is from its side, level
    check(d(0, 0, lighting.backFrom({ x: 5, y: 5, z: 5 }, { x: 0, y: 0, z: 0 }), false),
        Math.SQRT1_2, 0, Math.SQRT1_2, 'from an oblique camera');
});

test('backFrom: a camera straight above counts as in front', () => {
    assert.deepEqual(
        JSON.parse(JSON.stringify(lighting.backFrom({ x: 0, y: 9, z: 0 }, { x: 0, y: 0, z: 0 }))),
        { x: 0, z: 1 }
    );
});

test('environment: ambient everywhere, and each light brightest from its direction', () => {
    const ambientOnly = lighting.environment({ ambient: { color: '#ffffff', strength: 0.6 }, lights: [] }, { x: 0, z: 1 });
    assert.equal(ambientOnly.width, 256);
    assert.equal(ambientOnly.height, 128);
    assert.ok(ambientOnly.data.every((v) => Math.abs(v - 0.6) < 1e-6));

    const rig = { ambient: { color: '#000000', strength: 0 }, lights: [
        { color: '#ff0000', strength: 1, azimuth: 90, elevation: 0 }
    ] };
    const image = lighting.environment(rig, { x: 0, z: 1 });
    let brightest = 0;
    for (let i = 1; i < image.width * image.height; i++) {
        if (image.data[i * 3] > image.data[brightest * 3]) {
            brightest = i;
        }
    }
    // +x is halfway round, on the middle rows
    const row = Math.floor(brightest / image.width);
    const column = brightest % image.width;
    assert.ok(Math.abs(column - image.width / 2) <= 1, `column ${column}`);
    assert.ok(Math.abs(row - image.height / 2) <= 1, `row ${row}`);
    assert.equal(image.data[brightest * 3 + 1], 0, 'red light has no green');
});

test('rgbe: a Radiance header, then four bytes per pixel that decode to the radiance', () => {
    const image = { width: 2, height: 1, data: Float32Array.from([0.5, 0.25, 0, 10, 0, 0]) };
    const bytes = lighting.rgbe(image);
    const header = '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 2\n';
    assert.equal(Buffer.from(bytes.slice(0, header.length)).toString(), header);
    const pixels = bytes.slice(header.length);
    assert.equal(pixels.length, 8);
    const decode = (o) => [0, 1, 2].map((k) => pixels[o + k] * Math.pow(2, pixels[o + 3] - 136));
    assert.deepEqual(decode(0), [0.5, 0.25, 0]);
    close(decode(4)[0], 10, 'bright red');
});

/**
 * A rig's light strengths in the Babylon.js viewer once a model has loaded, one mesh per material:
 * 'default' (none of its own, so the scene's default standard material, as STL meshes get),
 * 'standard' or 'pbr'. Run with lighting-rig.js against just enough of Babylon.js.
 */
function babylonRigStrengths(materials) {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
        static Zero() { return new Vector3(); }
        static Center() { return new Vector3(); }
        static TransformNormal(v) { return v.clone(); }
        clone() { return new Vector3(this.x, this.y, this.z); }
        negate() { return new Vector3(-this.x, -this.y, -this.z); }
        subtract() { return new Vector3(); }
    }
    const matrix = { multiply: () => matrix, clone: () => matrix, getRotationMatrix: () => matrix };
    const colour = { r: 1, g: 1, b: 1, clone: () => colour, toHexString: () => '#FFFFFF' };
    class Light {
        constructor(name, vector, scene) {
            this.name = name;
            this.direction = vector;
            this.diffuse = colour;
            scene.lights.push(this);
        }
    }
    class StandardMaterial {}
    class PBRMaterial {}
    class Camera {
        constructor() { this.alpha = Math.PI / 2; }
        setTarget() {}
        attachControl() {}
        getTarget() { return new Vector3(); }
        getBehaviorByName() { return null; }
        getViewMatrix() { return matrix; }
        getWorldMatrix() { return matrix; }
    }
    Camera.prototype.inputs = { attached: { mousewheel: {} } };
    const make = { default: () => undefined, standard: () => new StandardMaterial(), pbr: () => new PBRMaterial() };
    const meshes = materials.map((material, i) => ({ name: 'mesh' + i, material: make[material]() }));
    const BABYLON = {
        Engine: class { runRenderLoop() {} },
        Scene: class {
            constructor() {
                this.lights = [];
                this.meshes = [];
                this.defaultMaterial = new StandardMaterial();
                this.onBeforeRenderObservable = { add: () => ({}), remove() {} };
            }
        },
        Color3: { FromHexString: () => colour, Black: () => colour },
        Color4: class {},
        ArcRotateCamera: Camera,
        UniversalCamera: class {},
        HemisphericLight: class extends Light {},
        DirectionalLight: class extends Light {},
        PointLight: class extends Light {},
        StandardMaterial,
        PBRMaterial,
        Vector3,
        Matrix: { Identity: () => matrix, Invert: () => matrix },
        Mesh: { MinMax: () => ({ min: new Vector3(), max: new Vector3() }) },
        BoundingInfo: class { constructor() { this.boundingSphere = { radius: 1 }; } },
        SceneLoader: {
            Append(root, file, scene, onSuccess) { scene.meshes.push(...meshes); onSuccess(scene); }
        }
    };
    const rig = { ambient: { color: '#ffffff', strength: 0.6 },
        lights: [{ color: '#ffffff', strength: 0.8, azimuth: 0, elevation: 45 }] };
    let scene;
    const canvas = { dataset: { modelUrl: '/files/model', camera: 'arcRotate', environment: 'none',
        lights: JSON.stringify(rig), lightBrightness: '2' } };
    const window = { BABYLON, addEventListener() {} };
    const context = { BABYLON, window, console, CustomEvent: class {},
        document: { readyState: 'complete', querySelectorAll: () => [canvas], getElementById: () => null } };
    runInNewContext(source, context);
    const Scene = BABYLON.Scene;
    BABYLON.Scene = class extends Scene { constructor() { super(); scene = this; } };
    runInNewContext(readFileSync(join(__dirname, '../asset/js/babylon-viewer.js'), 'utf8'), context);
    return Object.fromEntries(scene.lights.map((light) => [light.name, light.intensity]));
}

test('Babylon.js rig: lights scaled by pi for PBR materials only, as standard materials do not divide', () => {
    // Brightness 2: the ambient light 0.6 and light 1 0.8 become 1.2 and 1.6 before any scaling
    for (const [name, materials, scale] of [
        ['an STL model, on the default material', ['default'], 1],
        ['standard materials', ['standard', 'default'], 1],
        ['a glTF model, with PBR materials', ['pbr'], Math.PI],
        ['standard and PBR materials together', ['standard', 'pbr'], Math.PI]
    ]) {
        const strengths = babylonRigStrengths(materials);
        close(strengths.rigAmbient, 1.2, `${name}: the ambient light is never scaled`);
        close(strengths.rigLight1, 1.6 * scale, `${name}: light 1`);
    }
});

