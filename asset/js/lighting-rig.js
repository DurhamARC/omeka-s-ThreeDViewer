/**
 * Shared lighting helpers for the ThreeDViewer viewers: brightness and the light rig from an
 * element's data attributes, light directions, and the environment image that stands in for
 * lights in model-viewer, which has none.
 *
 * Directions are given relative to the default view: azimuth turns about the world's up axis from
 * the camera's side of the model (positive to the viewer's right), and elevation rises from underneath
 * (-90) to overhead (90), in degrees.
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
                    elevation: number(light.elevation, -90, 90, 45)
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

    /**
     * The azimuth and elevation, in degrees and not rounded, of a direction from the model towards
     * a light: the inverse of direction(). Below level, the elevation is negative.
     */
    function exactAngles(d, back, leftHanded) {
        const length = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z) || 1;
        const y = Math.max(-1, Math.min(1, d.y / length));
        const right = leftHanded ? { x: -back.z, z: back.x } : { x: back.z, z: -back.x };
        const along = (d.x * back.x + d.z * back.z) / length;
        const across = (d.x * right.x + d.z * right.z) / length;
        const level = Math.abs(along) < 1e-9 && Math.abs(across) < 1e-9;
        return {
            azimuth: level ? 0 : Math.atan2(across, along) * 180 / Math.PI,
            elevation: Math.asin(y) * 180 / Math.PI
        };
    }

    /**
     * The azimuth and elevation, in whole degrees, of a direction from the model towards a light:
     * the inverse of direction(). Below level, as a light under the model is, the elevation is
     * negative, as the lighting controls show it (|| 0: no -0 from a hair to the left).
     */
    function angles(d, back, leftHanded) {
        const exact = exactAngles(d, back, leftHanded);
        return { azimuth: Math.round(exact.azimuth) || 0, elevation: Math.round(exact.elevation) || 0 };
    }

    /**
     * Tell the lighting controls a viewer's lights, once it has made them:
     * { mode, lights: [{ id, kind, color?, groundColor?, strength, azimuth?, elevation? }] }.
     * Kept on the element too, for controls that start listening later.
     */
    function ready(element, detail) {
        element.threedviewerLighting = detail;
        element.dispatchEvent(new CustomEvent('threedviewer:lighting-ready', { detail: detail }));
    }

    /**
     * Call apply(detail) with each change from the lighting controls: the whole state, as ready()
     * gave it, with reset: true when it is the controls' Reset.
     */
    function onChange(element, apply) {
        element.addEventListener('threedviewer:lighting', function (event) {
            apply(event.detail);
        });
    }

    /**
     * Whether the page shows lighting controls for this viewer element.
     */
    function hasControls(element) {
        return !!(element && element.dataset && element.dataset.lightingControls === 'true');
    }

    /** The values of a light that the lighting controls show, besides its direction */
    const SHOWN = ['color', 'groundColor', 'strength'];

    function copyLight(light) {
        const copy = Object.assign({}, light);
        if (light.direction) {
            copy.direction = { x: light.direction.x, y: light.direction.y, z: light.direction.z };
        }
        return copy;
    }

    /** A light as the lighting controls show it: its values, with no more than two decimals */
    function shown(light) {
        const report = { id: light.id, kind: light.kind };
        SHOWN.forEach(function (key) {
            if (light[key] !== undefined) {
                report[key] = key === 'strength' ? Math.round(light[key] * 100) / 100 : light[key];
            }
        });
        if (light.direction) {
            report.azimuth = light.azimuth;
            report.elevation = light.elevation;
        }
        return report;
    }

    /**
     * The lighting of one viewer: fixed to the model or to the viewer, and changed by its lighting
     * controls where the page shows them.
     *
     * A light's direction is kept as it is in the default view, turned by a frame. The frame stays
     * put while the lighting is fixed to the model; fixed to the viewer, it turns with the camera
     * from where it was at the switch. Switching back keeps the frame where it has got to, so the
     * lights never jump. Each value is kept exactly as the viewer gave it until the controls change
     * it, so that showing them changes nothing until they are used, although they show directions
     * in whole degrees and strengths to two decimals.
     *
     * The controls show each direction as it is seen from where the camera is now: turned by the
     * frame, then back by the camera's turn since the default view. Fixed to the viewer, the two
     * turns cancel and the directions shown stay put; fixed to the model, turning the camera turns
     * the lights round the view, and the controls are told the directions they have turned to
     * (threedviewer:lighting-turned, { lights: [{ id, azimuth, elevation }] }), while they are open
     * (threedviewer:lighting-panel, { open }) and once as they open. A direction set from the
     * controls is taken the same way, as seen from the camera.
     *
     * @param {HTMLElement} element - The viewer element, which the controls send their changes to
     * @param {Object} options
     * @param {Object[]} options.lights - { id, kind, color?, groundColor?, strength, direction? },
     *     the direction pointing from the model towards the light in the default view, y up
     * @param {{x: number, z: number}} options.back - From backFrom()
     * @param {boolean} options.leftHanded - As for direction()
     * @param {string} options.mode - 'model' or 'viewer', to start with
     * @param {Object|null} options.turns - The viewer's rotations, or null where it cannot turn its
     *     lighting, which then stays fixed to the model: identity(), clone(turn), then(first, second)
     *     (the turn by first, then by second), invert(turn), apply(turn, {x, y, z}) (a turned copy of
     *     the vector), camera() (the camera's orientation, to measure from) and since(camera) (the
     *     camera's turn since then)
     * @param {function(?function())} options.follow - Call the given function whenever the camera
     *     moves, or stop with null
     * @param {function(Object)} options.set - A light has changed: apply its colour and strength
     *     (place() follows, to apply its direction)
     * @param {function(Object[], *)} options.place - Aim the lights by their directions (or angles,
     *     azimuth and elevation), turned by the frame (null without turns)
     */
    function controller(element, options) {
        const turns = options.turns;
        const initial = options.lights.map(function (light) {
            const copy = copyLight(light);
            if (light.direction) {
                Object.assign(copy, angles(light.direction, options.back, options.leftHanded));
            }
            return copy;
        });
        let lights = initial.map(copyLight);
        let showing = initial.map(shown);
        const controls = hasControls(element);
        let open = false;   // Whether the controls are open, and so want the directions reported

        let mode = 'model';
        let frame = turns ? turns.identity() : null;
        let attached = null;   // While fixed to the viewer: the camera and the frame at the switch
        const start = turns ? turns.camera() : null;   // The camera in the default view

        function currentFrame() {
            return attached ? turns.then(attached.frame, turns.since(attached.camera)) : frame;
        }

        function place() {
            options.place(lights, turns ? currentFrame() : null);
        }

        /** The turn from a direction as kept to the same direction as seen from the camera now */
        function toView() {
            return turns.then(currentFrame(), turns.invert(turns.since(start)));
        }

        /** Tell the controls each direction that the camera has turned, as seen from it now */
        function report() {
            const view = toView();
            const turned = [];
            lights.forEach(function (light, i) {
                if (!light.direction) {
                    return;
                }
                const seen = angles(turns.apply(view, light.direction), options.back, options.leftHanded);
                // The same direction either way round (180 and -180), or any way round overhead or
                // underneath: keep the one shown, rather than make the slider jump
                if ((seen.azimuth - showing[i].azimuth) % 360 === 0 || Math.abs(seen.elevation) === 90) {
                    seen.azimuth = showing[i].azimuth;
                }
                if (seen.azimuth !== showing[i].azimuth || seen.elevation !== showing[i].elevation) {
                    showing[i].azimuth = seen.azimuth;
                    showing[i].elevation = seen.elevation;
                    turned.push({ id: light.id, azimuth: seen.azimuth, elevation: seen.elevation });
                }
            });
            if (turned.length) {
                element.dispatchEvent(new CustomEvent('threedviewer:lighting-turned', {
                    detail: { lights: turned }
                }));
            }
        }

        /**
         * Follow the camera: fixed to the viewer, to turn the lights; to the model, to report them
         * while the controls are open
         */
        function follow() {
            if (mode === 'viewer') {
                options.follow(place);
            } else {
                options.follow(open ? report : null);
            }
        }

        function setMode(next) {
            if (next === mode || !turns) {
                return;
            }
            if (next === 'viewer') {
                attached = { camera: turns.camera(), frame: turns.clone(frame) };
            } else {
                frame = turns.clone(currentFrame());
                attached = null;
            }
            mode = next;
            follow();
        }

        /** Take each value the controls have changed from what they showed */
        function merge(change) {
            const i = lights.findIndex(function (light) {
                return light.id === change.id;
            });
            if (i < 0) {
                return;
            }
            const light = lights[i];
            const was = showing[i];
            let changed = false;
            SHOWN.forEach(function (key) {
                if (was[key] !== undefined && change[key] !== undefined && change[key] !== was[key]) {
                    light[key] = was[key] = change[key];
                    changed = true;
                }
            });
            if (light.direction && (change.azimuth !== was.azimuth || change.elevation !== was.elevation)
                && change.azimuth !== undefined && change.elevation !== undefined
            ) {
                // Set as seen from the camera now, so kept turned back from the view
                const seen = direction(change.azimuth, change.elevation, options.back, options.leftHanded);
                was.azimuth = change.azimuth;
                was.elevation = change.elevation;
                if (turns) {
                    light.direction = turns.apply(turns.invert(toView()), seen);
                    Object.assign(light, exactAngles(light.direction, options.back, options.leftHanded));
                } else {
                    light.direction = seen;
                    light.azimuth = change.azimuth;
                    light.elevation = change.elevation;
                }
                changed = true;
            }
            if (changed) {
                options.set(light);
            }
        }

        if (options.mode === 'viewer' && turns) {
            setMode('viewer');
        } else if (turns) {
            follow();
        }
        place();

        if (!controls) {
            return;
        }

        element.addEventListener('threedviewer:lighting-panel', function (event) {
            open = !!event.detail.open;
            if (turns) {
                if (open) {
                    // The camera may have turned the lights since the controls last saw them
                    report();
                }
                follow();
            }
        });

        onChange(element, function (detail) {
            if (detail.reset) {
                // As the page started, wherever the camera is now: fixed to the model, the lights
                // where they started in the scene; fixed to the viewer, where they started in the
                // view, so turned with the camera since then, as they would have been untouched
                frame = turns ? turns.identity() : null;
                attached = turns && detail.mode === 'viewer'
                    ? { camera: start, frame: turns.identity() }
                    : null;
                mode = attached ? 'viewer' : 'model';
                if (turns) {
                    follow();
                }
                lights = initial.map(copyLight);
                showing = initial.map(shown);
                lights.forEach(options.set);
            }
            setMode(detail.mode === 'viewer' ? 'viewer' : 'model');
            (detail.lights || []).forEach(merge);
            place();
            if (turns) {
                // After Reset fixed to the model, the camera may see the lights from elsewhere now
                report();
            }
        });

        ready(element, { mode: mode, lights: initial.map(shown) });
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
        angles: angles,
        ready: ready,
        onChange: onChange,
        hasControls: hasControls,
        controller: controller,
        environment: environment,
        rgbe: rgbe
    };
}(typeof window !== 'undefined' ? window : globalThis));
