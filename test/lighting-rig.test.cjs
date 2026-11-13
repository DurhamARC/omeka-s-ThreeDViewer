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
        { color: 'red', strength: 'x' },
        { color: '#0000ff', strength: 1, azimuth: 0, elevation: -120 }
    ].concat(Array(3).fill({ color: '#00ff00', strength: 1, azimuth: 10, elevation: 20 }));
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
    assert.equal(rig.lights[2].elevation, -90, 'From below, down to underneath');
});

test('brightness: 1 by default, clamped otherwise', () => {
    assert.equal(lighting.brightness(element({})), 1);
    assert.equal(lighting.brightness(element({ lightBrightness: '0' })), 0);
    assert.equal(lighting.brightness(element({ lightBrightness: '1.5' })), 1.5);
    assert.equal(lighting.brightness(element({ lightBrightness: '7' })), 3);
    assert.equal(lighting.brightness(element({ lightBrightness: 'bright' })), 1);
});

// The ranges as src/Settings/Lighting.php writes them, so that a change there fails here until
// lighting-rig.js follows it
function phpRanges() {
    const php = readFileSync(join(__dirname, '../src/Settings/Lighting.php'), 'utf8');
    const maxLights = Number(/const MAX_LIGHTS = (\d+);/.exec(php)[1]);
    const block = /const RANGES = \[([\s\S]*?)\];/.exec(php)[1];
    const number = (text) => (text.trim() === 'self::MAX_LIGHTS' ? maxLights : Number(text));
    const ranges = {};
    for (const [, name, min, max] of block.matchAll(/'(\w+)' => \[([^,\]]+), ([^\]]+)\]/g)) {
        ranges[name] = [number(min), number(max)];
    }
    return { maxLights, ranges };
}

test('ranges: parse() and brightness() clamp to Lighting::RANGES and MAX_LIGHTS in PHP', () => {
    const { maxLights, ranges } = phpRanges();
    for (const name of ['brightness', 'strength', 'count', 'azimuth', 'elevation']) {
        assert.ok(Array.isArray(ranges[name]) && ranges[name].every(Number.isFinite), `${name} read from PHP`);
    }
    assert.equal(ranges.count[1], maxLights);

    const [bMin, bMax] = ranges.brightness;
    assert.equal(lighting.brightness(element({ lightBrightness: String(bMin - 100) })), bMin, 'brightness min');
    assert.equal(lighting.brightness(element({ lightBrightness: String(bMax + 100) })), bMax, 'brightness max');

    const rigAt = (pick) => lighting.parse(element({ lights: JSON.stringify({
        ambient: { color: '#ffffff', strength: pick('strength') },
        lights: Array(maxLights + 2).fill({
            color: '#ffffff', strength: pick('strength'), azimuth: pick('azimuth'), elevation: pick('elevation')
        })
    }) }));
    const low = rigAt((name) => ranges[name][0] - 100);
    const high = rigAt((name) => ranges[name][1] + 100);
    assert.equal(low.ambient.strength, ranges.strength[0], 'ambient strength min');
    assert.equal(high.ambient.strength, ranges.strength[1], 'ambient strength max');
    assert.equal(high.lights.length, ranges.count[1], 'at most MAX_LIGHTS lights');
    for (const name of ['strength', 'azimuth', 'elevation']) {
        assert.equal(low.lights[0][name], ranges[name][0], `${name} min`);
        assert.equal(high.lights[0][name], ranges[name][1], `${name} max`);
    }
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
    assert.equal(lighting.angles({ x: 0, y: -1, z: 1 }, { x: 0, z: 1 }, false).elevation, -45, 'from below: below level');
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
        turned: () => JSON.parse(JSON.stringify(events
            .filter((event) => event.type === 'threedviewer:lighting-turned').map((e) => e.detail.lights))),
        change: (detail) => listeners['threedviewer:lighting']({ detail }),
        panel: (open) => listeners['threedviewer:lighting-panel']({ detail: { open } }),
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
            invert: (turn) => -turn,
            // Ry: a turn of 90 takes +z (the camera's side in the default view) to +x
            apply: (turn, v) => {
                const a = turn * Math.PI / 180;
                return { x: v.x * Math.cos(a) + v.z * Math.sin(a), y: v.y, z: -v.x * Math.sin(a) + v.z * Math.cos(a) };
            },
            camera: () => viewer.camera,
            since: (start) => viewer.camera - start
        },
        follow: (update) => { viewer.follow = update; },
        set: (light) => viewer.set.push(JSON.parse(JSON.stringify(light))),
        place: (lights, frame) => { viewer.placed = { lights: JSON.parse(JSON.stringify(lights)), frame }; }
    });
    // The panel open, unless the test says otherwise
    if (options.controls && options.open !== false) {
        viewer.panel(true);
    }
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
    viewer.camera = 100;
    viewer.follow();
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
    const reports = viewer.turned().length;
    viewer.change({ reset: true, mode: 'viewer', lights: initial });
    viewer.follow();
    assert.equal(viewer.frame(), 70, 'Where the untouched lights would be: turned with the camera since the start');
    assert.deepEqual(viewer.placed.lights[1].direction, { x: 1, y: 2, z: -1 });
    assert.equal(viewer.placed.lights[1].color, '#ffffff');
    assert.equal(viewer.set.slice(-2)[1].color, '#ffffff', 'Each light set again');
    const after = viewer.turned().slice(reports).flat().filter((light) => light.id === 'key').pop();
    assert.ok(!after || (after.azimuth === initial[1].azimuth && after.elevation === initial[1].elevation),
        'The sliders show the starting directions');
    viewer.camera = 100;
    viewer.follow();
    assert.equal(viewer.frame(), 100, 'And keeps following the camera');
});

test('controller: Reset fixed to the model puts the lights back in the scene, wherever the camera is', () => {
    const viewer = fakeViewer({ controls: true, lights: PRESET, mode: 'model' });
    const initial = lightsOf(viewer);
    viewer.camera = 50;
    viewer.change({ mode: 'viewer', lights: initial });
    viewer.camera = 80;
    viewer.follow();
    assert.equal(viewer.frame(), 30);
    viewer.change({ reset: true, mode: 'model', lights: initial });
    assert.equal(viewer.frame(), 0, 'Back where they started in the scene');
    viewer.camera = 120;
    viewer.follow && viewer.follow();
    assert.equal(viewer.frame(), 0, 'And staying there');
    const shown = viewer.turned().flat().filter((light) => light.id === 'key').pop();
    assert.equal(shown.azimuth, ((initial[1].azimuth - 120 + 540) % 360) - 180, 'Seen from the camera, turned by its 120 degrees');
});

test('controller: fixed to the model, the directions are reported only while the panel is open', () => {
    const viewer = fakeViewer({ controls: true, lights: PRESET, open: false });
    assert.equal(viewer.follow, null, 'Not following the camera with the panel closed');
    viewer.camera = 30;
    assert.deepEqual(viewer.turned(), []);

    viewer.panel(true);
    assert.deepEqual(viewer.turned(), [[{ id: 'key', azimuth: 105, elevation: 55 }]], 'Caught up as it opens: 135, turned by -30');
    assert.equal(typeof viewer.follow, 'function', 'Following while open');
    viewer.camera = 40;
    viewer.follow();
    assert.equal(viewer.turned().length, 2);

    viewer.panel(false);
    assert.equal(viewer.follow, null, 'Not once it closes');

    const fixed = fakeViewer({ controls: true, lights: PRESET, mode: 'viewer', open: false });
    assert.equal(typeof fixed.follow, 'function', 'Fixed to the viewer, following the camera to turn the lights, open or not');
    fixed.panel(true);
    fixed.panel(false);
    assert.equal(typeof fixed.follow, 'function');
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
 * model-viewer-lighting.js run with lighting-rig.js and the vendored three.js's Quaternion and
 * Euler (r120, which names invert() inverse()), with model-viewer's own environment, its camera
 * starting at `start`. turn() is the environment's turn now, as a quaternion.
 */
function modelViewerHarness(start, autoRotate = true) {
    const three = { window: {}, self: {}, console };
    three.self = three.window;
    runInNewContext(readFileSync(join(__dirname, '../asset/vendor/three/three.min.js'), 'utf8'), three);
    const THREE = three.window.THREE || three.THREE;
    THREE.Quaternion.prototype.invert = THREE.Quaternion.prototype.inverse;
    const scene = { environmentRotation: new THREE.Euler(), quaternion: new THREE.Quaternion(),
        position: new THREE.Vector3(), queueRender() {} };
    const listeners = {};
    const frames = [];
    const events = [];
    let camera = start;
    const viewer = {
        turntableRotation: 0,
        autoRotate,
        dataset: { lightingMode: 'model', lightingControls: 'true' },
        style: { setProperty() {} },
        exposure: 1,
        loaded: true,
        getCameraOrbit: () => ({ theta: camera.theta * Math.PI / 180, phi: camera.phi * Math.PI / 180 }),
        registerEffectComposer: (composer) => composer.setMainScene(scene),
        unregisterEffectComposer() {},
        addEventListener: (type, listener) => { listeners[type] = listener; },
        removeEventListener() {},
        dispatchEvent: (event) => { events.push(event); }
    };
    class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } }
    const window = { customElements: { whenDefined: () => ({ then: (go) => go() }) } };
    const context = { window, console, CustomEvent, customElements: window.customElements,
        requestAnimationFrame: (f) => frames.push(f),
        document: { readyState: 'complete', querySelectorAll: () => [viewer] } };
    runInNewContext(source, context);
    runInNewContext(readFileSync(join(__dirname, '../asset/js/model-viewer-lighting.js'), 'utf8'), context);

    // The environment's turn, from the angles it is sampled through: R_XYZ(-e) is the turn's inverse
    const turn = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(
        -scene.environmentRotation.x, -scene.environmentRotation.y, -scene.environmentRotation.z, 'XYZ')).inverse();
    // Auto-rotate: turn the model on its turntable, then run a frame
    const spin = (degrees) => {
        viewer.turntableRotation = degrees * Math.PI / 180;
        frames.splice(0).forEach((f) => f());
    };
    return { THREE, listeners, turn, events, spin, frames, move: (to) => { camera = to; } };
}

test('model-viewer: without auto-rotate, nothing watches the turntable every frame', () => {
    assert.equal(modelViewerHarness({ theta: 0, phi: 75 }, false).frames.length, 0);
    assert.equal(modelViewerHarness({ theta: 0, phi: 75 }, true).frames.length, 1);
});

/**
 * model-viewer's environment turn once the camera has orbited from `start` to `orbit` with the
 * lighting fixed to the viewer and then moved to `end`: the turn since the switch.
 */
function modelViewerTurn(start, orbit, end) {
    const { THREE, listeners, turn, move } = modelViewerHarness(start);
    move(orbit);
    listeners['threedviewer:lighting']({ detail: { mode: 'viewer', lights: [] } });
    const atSwitch = turn();
    move(end);
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

test('model-viewer: its own environment\'s light comes from the direction set, wherever the camera starts', () => {
    for (const theta of [0, 50, -120]) {
        const { THREE, listeners, turn } = modelViewerHarness({ theta, phi: 75 });
        // Straight at the camera's side and 30 degrees up, as seen from the default view
        listeners['threedviewer:lighting']({ detail: { mode: 'model', lights: [
            { id: 'environment', kind: 'environment', strength: 1, azimuth: 0, elevation: 30 }
        ] } });
        const overhead = new THREE.Vector3(0, 1, 0).applyQuaternion(turn());
        const t = theta * Math.PI / 180, e = Math.PI / 6;
        const expected = new THREE.Vector3(Math.sin(t) * Math.cos(e), Math.sin(e), Math.cos(t) * Math.cos(e));
        close(overhead.distanceTo(expected), 0, `camera starting at theta ${theta}`);
    }
});

test('controller: fixed to the model, turning the camera turns the lights round the view, and says so', () => {
    const viewer = fakeViewer({ controls: true, lights: PRESET });
    assert.equal(typeof viewer.follow, 'function', 'Following the camera, to report');
    viewer.follow();
    assert.deepEqual(viewer.turned(), [], 'Nothing to report until the camera turns');

    // The key light is 135 degrees round from the camera; the camera goes 90 degrees round after it
    viewer.camera = 90;
    viewer.follow();
    assert.deepEqual(viewer.turned(), [[{ id: 'key', azimuth: 45, elevation: 55 }]]);
    assert.equal(viewer.frame(), 0, 'The light stays on the model');
    viewer.follow();
    assert.equal(viewer.turned().length, 1, 'Reported once');

    // Set straight at the camera, as seen from it now: the camera's side is +x
    const shown = lightsOf(viewer);
    shown[1].azimuth = 0;
    shown[1].elevation = 0;
    viewer.change({ mode: 'model', lights: shown });
    const d = viewer.placed.lights[1].direction;
    close(d.x, 1, 'Towards the camera');
    close(d.z, 0, 'Towards the camera');
    close(viewer.placed.lights[1].azimuth, 90, 'Kept in the default view\'s terms, for model-viewer');
});

test('controller: fixed to the viewer, the lights stay put in the view, so nothing is reported', () => {
    const viewer = fakeViewer({ controls: true, lights: PRESET, mode: 'viewer' });
    viewer.camera = 120;
    viewer.follow();
    assert.deepEqual(viewer.turned(), []);

    // Switched to the model, the lights are where they were in the view; the camera then turns away
    viewer.change({ mode: 'model', lights: lightsOf(viewer) });
    assert.deepEqual(viewer.turned(), [], 'No jump at the switch');
    viewer.camera = 150;
    viewer.follow();
    assert.deepEqual(viewer.turned(), [[{ id: 'key', azimuth: 105, elevation: 55 }]]);
});

test('controller: Reset reports where the lights are seen from, wherever the camera is', () => {
    const viewer = fakeViewer({ controls: true, lights: PRESET });
    const initial = lightsOf(viewer);
    viewer.camera = -45;
    viewer.change({ reset: true, mode: 'model', lights: initial });
    assert.deepEqual(viewer.turned(), [[{ id: 'key', azimuth: 180, elevation: 55 }]]);
    assert.deepEqual(viewer.placed.lights[1].direction, { x: 1, y: 2, z: -1 }, 'Back where it started');
});

test('controller: seen from above, a low light is below the view\'s level, and can be set there', () => {
    // The fake's turns are about the up axis only, so tip the view by giving the light from below
    const viewer = fakeViewer({ controls: true, lights: [
        { id: 'low', kind: 'light', color: '#ffffff', strength: 1, direction: { x: 0, y: -1, z: 1 } }
    ] });
    assert.equal(lightsOf(viewer)[0].elevation, -45, 'Reported to start below level, where it is');
    viewer.camera = 90;
    viewer.follow();
    assert.deepEqual(viewer.turned(), [[{ id: 'low', azimuth: -90, elevation: -45 }]], 'Still below level');
    const shown = lightsOf(viewer);
    shown[0].azimuth = -90;
    shown[0].elevation = -30;
    viewer.change({ mode: 'model', lights: shown });
    close(viewer.placed.lights[0].direction.y, -0.5, 'Set below level');
});

test('controller: a light below the model keeps its height when only its direction changes', () => {
    // As the Babylon.js point preset under a model centred well above it
    const viewer = fakeViewer({ controls: true, mode: 'viewer', lights: [
        { id: 'point', kind: 'point', color: '#ffffff', strength: 1, direction: { x: 0, y: -1, z: 1 } }
    ] });
    const shown = lightsOf(viewer);
    assert.equal(shown[0].elevation, -45);
    shown[0].azimuth = 30;
    viewer.change({ mode: 'viewer', lights: shown });
    close(viewer.placed.lights[0].direction.y, -Math.SQRT1_2, 'Still 45 degrees below level');
});

test('controller: a direction shown either way round, or overhead, is not reported as turned', () => {
    const viewer = fakeViewer({ controls: true, lights: PRESET });
    const shown = lightsOf(viewer);
    shown[1].azimuth = 180;
    viewer.change({ mode: 'model', lights: shown });
    viewer.camera = 1e-9;   // A turn too small to show, which can come out at -180
    viewer.follow();
    assert.deepEqual(viewer.turned(), []);

    shown[1].azimuth = 30;
    shown[1].elevation = 90;
    viewer.change({ mode: 'model', lights: shown });
    viewer.camera = 60;
    viewer.follow();
    assert.deepEqual(viewer.turned(), [], 'Overhead, the direction round stays as set');
});

test('model-viewer: auto-rotate turns the model, and the lights fixed to it turn with it', () => {
    const { THREE, listeners, turn, spin } = modelViewerHarness({ theta: 0, phi: 75 });
    const yaw = (degrees) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), degrees * Math.PI / 180);
    spin(30);
    close(Math.abs(turn().dot(yaw(30))), 1, 'fixed to the model: the environment turns as the model');

    // Fixed to the viewer from here, the lights stay put as the model turns on
    listeners['threedviewer:lighting']({ detail: { mode: 'viewer', lights: [] } });
    const atSwitch = turn();
    spin(75);
    close(Math.abs(turn().dot(atSwitch)), 1, 'fixed to the viewer: the environment stays put');

    // And back to the model: from where they were, turning with it again
    listeners['threedviewer:lighting']({ detail: { mode: 'model', lights: [] } });
    close(Math.abs(turn().dot(atSwitch)), 1, 'no jump at the switch');
    spin(105);
    close(Math.abs(turn().dot(yaw(30).multiply(atSwitch))), 1, 'then turning with the model');
});

test('model-viewer: with the panel open, the directions shown follow the model round as it auto-rotates', () => {
    const { listeners, events, spin } = modelViewerHarness({ theta: 0, phi: 75 });
    listeners['threedviewer:lighting']({ detail: { mode: 'model', lights: [
        { id: 'environment', kind: 'environment', strength: 1, azimuth: 0, elevation: 30 }
    ] } });
    listeners['threedviewer:lighting-panel']({ detail: { open: true } });
    events.length = 0;
    spin(40);
    const turned = events.filter((e) => e.type === 'threedviewer:lighting-turned').pop();
    assert.ok(turned, 'reported');
    assert.equal(turned.detail.lights[0].azimuth, 40, 'the light has turned 40 degrees to the right with the model');
    assert.equal(turned.detail.lights[0].elevation, 30);
});
