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

test('angles: the inverse of direction, in whole degrees', () => {
    const backs = [{ x: 0, z: 1 }, { x: Math.SQRT1_2, z: Math.SQRT1_2 }, { x: -0.6, z: 0.8 }];
    for (const back of backs) {
        for (const leftHanded of [false, true]) {
            for (const [azimuth, elevation] of [[0, 0], [90, 10], [-135, 45], [180, 30], [37, 89]]) {
                const d = lighting.direction(azimuth, elevation, back, leftHanded);
                const a = lighting.angles({ x: d.x * 3, y: d.y * 3, z: d.z * 3 }, back, leftHanded);
                assert.equal(Math.abs(a.azimuth), Math.abs(azimuth), `azimuth ${azimuth}`);
                if (Math.abs(azimuth) !== 180) {
                    assert.equal(a.azimuth, azimuth, `azimuth ${azimuth}`);
                }
                assert.equal(a.elevation, elevation, `elevation ${elevation}`);
            }
        }
    }
    assert.deepEqual(
        JSON.parse(JSON.stringify(lighting.angles({ x: 0, y: 5, z: 0 }, { x: 0, z: 1 }, false))),
        { azimuth: 0, elevation: 90 }
    );
    assert.equal(lighting.angles({ x: 0, y: -1, z: 1 }, { x: 0, z: 1 }, false).elevation, 0, 'from below: level');
});

test('ready, onChange and hasControls: the events between a viewer and its controls', () => {
    const events = [];
    const listeners = {};
    const element = {
        dataset: { lightingControls: 'true' },
        dispatchEvent: (event) => events.push(event),
        addEventListener: (type, listener) => { listeners[type] = listener; }
    };
    class CustomEvent {
        constructor(type, init) {
            this.type = type;
            this.detail = init.detail;
        }
    }
    const window = {};
    runInNewContext(source, { window, console, CustomEvent });
    const helpers = window.ThreeDViewerLighting;
    const detail = { mode: 'model', lights: [] };
    helpers.ready(element, detail);
    assert.equal(element.threedviewerLighting, detail);
    assert.equal(events[0].type, 'threedviewer:lighting-ready');
    assert.equal(events[0].detail, detail);

    let applied = null;
    helpers.onChange(element, (d) => { applied = d; });
    listeners['threedviewer:lighting']({ detail: { mode: 'viewer' } });
    assert.deepEqual(applied, { mode: 'viewer' });

    assert.equal(helpers.hasControls(element), true);
    assert.equal(helpers.hasControls({ dataset: {} }), false);
    assert.equal(helpers.hasControls(null), false);
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
 * A viewer for controller(): its turns are angles about the up axis, its camera an angle that the
 * test sets, and it records what the controller asks of it.
 */
function fakeViewer(options) {
    const listeners = {};
    const events = [];
    const element = {
        dataset: options.controls ? { lightingControls: 'true' } : {},
        addEventListener: (type, listener) => { listeners[type] = listener; },
        dispatchEvent: (event) => events.push(event)
    };
    class CustomEvent {
        constructor(type, init) {
            this.type = type;
            this.detail = init.detail;
        }
    }
    const window = {};
    runInNewContext(source, { window, console, CustomEvent });
    const viewer = {
        element,
        camera: 0,
        follow: null,
        set: [],
        placed: null,
        ready: () => events.find((event) => event.type === 'threedviewer:lighting-ready'),
        change: (detail) => listeners['threedviewer:lighting']({ detail }),
        frame: () => viewer.placed.frame
    };
    window.ThreeDViewerLighting.controller(element, {
        lights: options.lights,
        back: { x: 0, z: 1 },
        leftHanded: false,
        mode: options.mode || 'model',
        turns: options.turns === null ? null : {
            identity: () => 0,
            clone: (turn) => turn,
            then: (first, second) => first + second,
            camera: () => viewer.camera,
            since: (start) => viewer.camera - start
        },
        follow: (update) => { viewer.follow = update; },
        set: (light) => viewer.set.push(JSON.parse(JSON.stringify(light))),
        place: (lights, frame) => { viewer.placed = { lights: JSON.parse(JSON.stringify(lights)), frame }; }
    });
    return viewer;
}

// A light 54.7 degrees up, as the Babylon.js directional preset: shown as 55
const PRESET = [
    { id: 'ambient', kind: 'ambient', color: '#ffffff', strength: 0.6 },
    { id: 'key', kind: 'key', color: '#ffffff', strength: 0.8333, direction: { x: 1, y: 2, z: -1 } }
];
const lightsOf = (viewer) => JSON.parse(JSON.stringify(viewer.ready().detail.lights));

test('controller: reports the lights as the controls show them, and places them as given', () => {
    const viewer = fakeViewer({ controls: true, lights: PRESET });
    assert.deepEqual(viewer.ready().detail.mode, 'model');
    assert.deepEqual(lightsOf(viewer), [
        { id: 'ambient', kind: 'ambient', color: '#ffffff', strength: 0.6 },
        { id: 'key', kind: 'key', color: '#ffffff', strength: 0.83, azimuth: 135, elevation: 55 }
    ]);
    assert.deepEqual(viewer.placed.lights[1].direction, { x: 1, y: 2, z: -1 }, 'Exactly as given');
    assert.equal(viewer.frame(), 0);
});

test('controller: a change applies only what it changes, so the rest stay exact', () => {
    const viewer = fakeViewer({ controls: true, lights: PRESET });
    const shown = lightsOf(viewer);

    shown[0].strength = 1.2;
    viewer.change({ mode: 'model', lights: shown });
    assert.equal(viewer.set.length, 1);
    assert.equal(viewer.set[0].strength, 1.2);
    assert.equal(viewer.placed.lights[1].strength, 0.8333, 'Not the rounded 0.83');
    assert.deepEqual(viewer.placed.lights[1].direction, { x: 1, y: 2, z: -1 }, 'Not the rounded angles');

    shown[1].elevation = 90;
    viewer.change({ mode: 'model', lights: shown });
    const direction = viewer.placed.lights[1].direction;
    close(direction.y, 1, 'Moved overhead');
    assert.equal(viewer.set.length, 2, 'A moved light is set too');
});

test('controller: fixed to the viewer, the frame turns with the camera from the switch, both ways', () => {
    const viewer = fakeViewer({ controls: true, lights: PRESET });
    const shown = lightsOf(viewer);

    viewer.camera = 10;
    viewer.change({ mode: 'viewer', lights: shown });
    assert.equal(typeof viewer.follow, 'function');
    viewer.camera = 40;
    viewer.follow();
    assert.equal(viewer.frame(), 30, 'Turned as far as the camera since the switch');

    viewer.change({ mode: 'model', lights: shown });
    assert.equal(viewer.follow, null);
    viewer.camera = 100;
    viewer.change({ mode: 'model', lights: shown });
    assert.equal(viewer.frame(), 30, 'Kept where it had got to');

    viewer.change({ mode: 'viewer', lights: shown });
    viewer.camera = 110;
    viewer.follow();
    assert.equal(viewer.frame(), 40, 'And on from there, without a jump');
});

test('controller: Reset restores the lights and frame, in the starting mode', () => {
    const viewer = fakeViewer({ controls: true, lights: PRESET, mode: 'viewer' });
    assert.equal(viewer.ready().detail.mode, 'viewer');
    assert.equal(typeof viewer.follow, 'function', 'Following from the start');
    const initial = lightsOf(viewer);
    const shown = lightsOf(viewer);

    viewer.camera = 50;
    shown[1].azimuth = 0;
    shown[1].color = '#ff0000';
    viewer.change({ mode: 'model', lights: shown });
    assert.equal(viewer.frame(), 50);

    viewer.camera = 70;
    viewer.change({ reset: true, mode: 'viewer', lights: initial });
    viewer.follow();
    assert.equal(viewer.frame(), 0, 'Back to the default view');
    assert.deepEqual(viewer.placed.lights[1].direction, { x: 1, y: 2, z: -1 });
    assert.equal(viewer.placed.lights[1].color, '#ffffff');
    assert.equal(viewer.set.slice(-2)[1].color, '#ffffff', 'Each light set again');
});

test('controller: without controls it only keeps the lighting fixed; without turns, to the model', () => {
    const viewer = fakeViewer({ controls: false, lights: PRESET, mode: 'viewer' });
    assert.equal(viewer.ready(), undefined, 'Nothing reported');
    viewer.camera = 25;
    viewer.follow();
    assert.equal(viewer.frame(), 25);

    const fixed = fakeViewer({ controls: true, lights: PRESET, mode: 'viewer', turns: null });
    assert.equal(fixed.follow, null);
    assert.equal(fixed.ready().detail.mode, 'model');
    assert.equal(fixed.frame(), null);
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

/**
 * model-viewer's environment turn, as a quaternion, once the camera has orbited from `start` to
 * `orbit` with the lighting fixed to the viewer and then moved to `end`: the turn since the switch.
 * Runs model-viewer-lighting.js with lighting-rig.js and the vendored three.js's Quaternion and
 * Euler (r120, which names invert() inverse()), with model-viewer's own environment, untouched.
 */
function modelViewerTurn(start, orbit, end) {
    const three = { window: {}, self: {}, console };
    three.self = three.window;
    runInNewContext(readFileSync(join(__dirname, '../asset/vendor/three/three.min.js'), 'utf8'), three);
    const THREE = three.window.THREE || three.THREE;
    THREE.Quaternion.prototype.invert = THREE.Quaternion.prototype.inverse;
    const scene = { environmentRotation: new THREE.Euler(), quaternion: new THREE.Quaternion(), queueRender() {} };
    const listeners = {};
    let camera = start;
    const viewer = {
        dataset: { lightingMode: 'model', lightingControls: 'true' },
        style: { setProperty() {} },
        exposure: 1,
        loaded: true,
        getCameraOrbit: () => ({ theta: camera.theta * Math.PI / 180, phi: camera.phi * Math.PI / 180 }),
        registerEffectComposer: (composer) => composer.setMainScene(scene),
        unregisterEffectComposer() {},
        addEventListener: (type, listener) => { listeners[type] = listener; },
        removeEventListener() {},
        dispatchEvent() {}
    };
    class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } }
    const window = { customElements: { whenDefined: () => ({ then: (go) => go() }) } };
    const context = { window, console, CustomEvent, customElements: window.customElements,
        document: { readyState: 'complete', querySelectorAll: () => [viewer] } };
    runInNewContext(source, context);
    runInNewContext(readFileSync(join(__dirname, '../asset/js/model-viewer-lighting.js'), 'utf8'), context);

    // The environment's turn, from the angles it is sampled through: R_XYZ(-e) is the turn's inverse
    const turn = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(
        -scene.environmentRotation.x, -scene.environmentRotation.y, -scene.environmentRotation.z, 'XYZ')).inverse();
    camera = orbit;
    listeners['threedviewer:lighting']({ detail: { mode: 'viewer', lights: [] } });
    const atSwitch = turn();
    camera = end;
    listeners['camera-change']();
    return { THREE, since: turn().multiply(atSwitch.inverse()) };
}

test('model-viewer: fixed to the viewer after orbiting, the lighting turns as the camera does', () => {
    // Orbited a quarter round, then fixed to the viewer and dragged upwards: the camera tilts about
    // the axis across its view, so the environment must too, not about the world's x axis
    for (const [orbit, end] of [
        [{ theta: 90, phi: 75 }, { theta: 90, phi: 55 }],
        [{ theta: -40, phi: 80 }, { theta: 30, phi: 100 }],
        [{ theta: 0, phi: 75 }, { theta: 60, phi: 60 }]
    ]) {
        const { THREE, since } = modelViewerTurn({ theta: 0, phi: 75 }, orbit, end);
        const side = (o) => new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(
            new THREE.Euler(o.phi * Math.PI / 180, o.theta * Math.PI / 180, 0, 'YXZ')));
        const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(end.phi * Math.PI / 180,
            end.theta * Math.PI / 180, 0, 'YXZ')).multiply(new THREE.Quaternion().setFromEuler(
            new THREE.Euler(orbit.phi * Math.PI / 180, orbit.theta * Math.PI / 180, 0, 'YXZ')).inverse());
        const name = `from ${JSON.stringify(orbit)} to ${JSON.stringify(end)}`;
        close(Math.abs(since.dot(expected)), 1, `${name}: the environment turns as the camera`);
        const moved = side(orbit).applyQuaternion(since);
        close(moved.distanceTo(side(end)), 0, `${name}: the camera's side at the switch turns to its side now`);
    }
});
