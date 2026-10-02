/**
 * Shared lighting helpers for the ThreeDViewer viewers: brightness and the light rig from an
 * element's data attributes, light directions, and the environment image that stands in for
 * lights in model-viewer, which has none.
 *
 * Directions are given relative to the default view: azimuth turns about the world's up axis from
 * the camera's side of the model (positive to the viewer's right), and elevation rises from level
 * (0) to overhead (90), in degrees.
 */
(function (root) {
    'use strict';

    const MAX_LIGHTS = 4;

    /**
     * model-viewer environment: a light is a Gaussian spot this many radians wide, painted into an
     * image this many pixels wide.
     */
    const SPOT_WIDTH = 0.15;
    const ENVIRONMENT_WIDTH = 256;

    /**
     * A spot whose irradiance is pi x strength gives a matte surface albedo x strength, as a
     * three.js (legacy) or Babylon.js light of that intensity does. model-viewer's diffuse lighting
     * from an environment measures about 1.4 times brighter than that, hence 0.7.
     */
    const SPOT_SCALE = 0.7;

    function number(value, min, max, fallback) {
        const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
        return isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    }

    function colour(value, fallback) {
        return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
    }

    /**
     * The light rig in an element's data-lights, checked and clamped, or null when the element has
     * none, so the viewer keeps its own lights.
     */
    function parse(element) {
        const raw = element && element.dataset ? element.dataset.lights : undefined;
        if (!raw) {
            return null;
        }
        let rig;
        try {
            rig = JSON.parse(raw);
        } catch (e) {
            console.warn('ThreeDViewer: ignoring data-lights that is not JSON.', e);
            return null;
        }
        if (!rig || typeof rig !== 'object') {
            return null;
        }
        const ambient = rig.ambient || {};
        const lights = Array.isArray(rig.lights) ? rig.lights.slice(0, MAX_LIGHTS) : [];
        return {
            ambient: {
                color: colour(ambient.color, '#ffffff'),
                strength: number(ambient.strength, 0, 3, 0)
            },
            lights: lights.map(function (light) {
                light = light || {};
                return {
                    color: colour(light.color, '#ffffff'),
                    strength: number(light.strength, 0, 3, 0),
                    azimuth: number(light.azimuth, -180, 180, 0),
                    elevation: number(light.elevation, 0, 90, 45)
                };
            })
        };
    }

    /**
     * The element's brightness, a multiplier for every light: 1 unless data-light-brightness says
     * otherwise.
     */
    function brightness(element) {
        const value = element && element.dataset ? element.dataset.lightBrightness : undefined;
        return number(value, 0, 3, 1);
    }

    /**
     * The horizontal unit vector from the target towards the camera: the side of the model the
     * default view looks from. A camera straight above the target counts as in front (+z).
     */
    function backFrom(camera, target) {
        const dx = camera.x - target.x;
        const dz = camera.z - target.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        return length < 1e-9 ? { x: 0, z: 1 } : { x: dx / length, z: dz / length };
    }

    /**
     * The unit vector pointing from the model towards a light, in world space, with y up.
     *
     * @param {number} azimuth Degrees from the camera's side, positive to the viewer's right
     * @param {number} elevation Degrees above level
     * @param {{x: number, z: number}} back From backFrom()
     * @param {boolean} leftHanded True for Babylon.js, where +x is to the left of a camera on +z
     */
    function direction(azimuth, elevation, back, leftHanded) {
        const a = azimuth * Math.PI / 180;
        const e = elevation * Math.PI / 180;
        const right = leftHanded ? { x: -back.z, z: back.x } : { x: back.z, z: -back.x };
        const level = Math.cos(e);
        return {
            x: level * (Math.cos(a) * back.x + Math.sin(a) * right.x),
            y: Math.sin(e),
            z: level * (Math.cos(a) * back.z + Math.sin(a) * right.z)
        };
    }

    function linear(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) {
            c /= 255;
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
    }

    /**
     * Paint a rig into an equirectangular image of linear radiance, laid out as three.js reads
     * one: the top row looks straight up, and u runs round from -x through -z, +x and +z.
     *
     * @return {{width: number, height: number, data: Float32Array}} RGB, row by row from the top
     */
    function environment(rig, back) {
        const width = ENVIRONMENT_WIDTH;
        const height = width / 2;
        const data = new Float32Array(width * height * 3);
        const ambient = linear(rig.ambient.color).map(function (c) {
            return c * rig.ambient.strength;
        });
        const sigma2 = SPOT_WIDTH * SPOT_WIDTH;
        const spots = rig.lights.map(function (light) {
            const peak = SPOT_SCALE * light.strength / sigma2;
            return {
                d: direction(light.azimuth, light.elevation, back, false),
                c: linear(light.color).map(function (c) {
                    return c * peak;
                })
            };
        });

        for (let row = 0; row < height; row++) {
            const e = (0.5 - (row + 0.5) / height) * Math.PI;
            const y = Math.sin(e);
            const level = Math.cos(e);
            for (let column = 0; column < width; column++) {
                const p = ((column + 0.5) / width - 0.5) * 2 * Math.PI;
                const x = Math.cos(p) * level;
                const z = Math.sin(p) * level;
                const o = (row * width + column) * 3;
                data[o] = ambient[0];
                data[o + 1] = ambient[1];
                data[o + 2] = ambient[2];
                spots.forEach(function (spot) {
                    const cos = Math.min(1, x * spot.d.x + y * spot.d.y + z * spot.d.z);
                    const angle = Math.acos(cos);
                    const weight = Math.exp(-angle * angle / sigma2);
                    if (weight > 1e-4) {
                        data[o] += spot.c[0] * weight;
                        data[o + 1] += spot.c[1] * weight;
                        data[o + 2] += spot.c[2] * weight;
                    }
                });
            }
        }
        return { width: width, height: height, data: data };
    }

    /**
     * Encode an image of linear radiance as a Radiance RGBE (.hdr) file, flat (not run-length
     * encoded), which three.js's RGBELoader reads as it is.
     */
    function rgbe(image) {
        const header = '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ' + image.height + ' +X ' + image.width + '\n';
        const bytes = new Uint8Array(header.length + image.width * image.height * 4);
        for (let i = 0; i < header.length; i++) {
            bytes[i] = header.charCodeAt(i);
        }
        let o = header.length;
        for (let i = 0; i < image.width * image.height; i++) {
            const r = image.data[i * 3];
            const g = image.data[i * 3 + 1];
            const b = image.data[i * 3 + 2];
            const max = Math.max(r, g, b);
            if (max < 1e-32) {
                o += 4;
                continue;
            }
            // As C's frexp: max = mantissa x 2^exponent, with the mantissa in [0.5, 1)
            const exponent = Math.floor(Math.log2(max)) + 1;
            const scale = 256 / Math.pow(2, exponent);
            bytes[o++] = Math.min(255, Math.floor(r * scale));
            bytes[o++] = Math.min(255, Math.floor(g * scale));
            bytes[o++] = Math.min(255, Math.floor(b * scale));
            bytes[o++] = exponent + 128;
        }
        return bytes;
    }

    root.ThreeDViewerLighting = {
        MAX_LIGHTS: MAX_LIGHTS,
        parse: parse,
        brightness: brightness,
        backFrom: backFrom,
        direction: direction,
        environment: environment,
        rgbe: rgbe
    };
}(typeof window !== 'undefined' ? window : globalThis));
