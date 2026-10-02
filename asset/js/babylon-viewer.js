(function () {
    const viewerEngines = [];

    function hexToColor4(hex) {
        try {
            const color3 = BABYLON.Color3.FromHexString(hex);
            return new BABYLON.Color4(color3.r, color3.g, color3.b, 1);
        } catch (e) {
            console.warn('Invalid color provided to Babylon viewer, using default.', hex, e);
            return new BABYLON.Color4(0.71, 0.71, 0.71, 1);
        }
    }

    function splitUrl(fullUrl) {
        const sanitized = fullUrl.startsWith('//') ? window.location.protocol + fullUrl : fullUrl;
        const lastSlash = sanitized.lastIndexOf('/') + 1;
        return {
            rootUrl: sanitized.substring(0, lastSlash),
            fileName: sanitized.substring(lastSlash)
        };
    }

    function configureArcCamera(camera, boundingInfo) {
        if (!(camera instanceof BABYLON.ArcRotateCamera)) {
            return;
        }

        const sphere = boundingInfo ? boundingInfo.boundingSphere : null;
        const radiusSource = sphere && isFinite(sphere.radius) ? sphere.radius : 1;
        const radius = Math.max(radiusSource, 0.05);
        const viewRadius = Math.max(radius * 2.2, radius + 0.25);

        camera.radius = viewRadius;
        camera.lowerRadiusLimit = 0;
        camera.upperRadiusLimit = Math.max(viewRadius * 6, radius * 24);
        camera.minZ = Math.max(radius * 0.02, 0.001);
        camera.maxZ = Math.max(radius * 200, viewRadius * 50);
        camera.wheelDeltaPercentage = 0.01;
        camera.pinchDeltaPercentage = 0.01;

        camera.useFramingBehavior = true;
        const framingBehavior = camera.getBehaviorByName('Framing');
        if (framingBehavior) {
            framingBehavior.framingTime = 0;
            framingBehavior.elevationReturnTime = -1;
            framingBehavior.zoomStopsAnimation = true;
            framingBehavior.radiusScale = 1.2;

            if (boundingInfo) {
                framingBehavior.zoomOnBoundingInfo(boundingInfo.minimum, boundingInfo.maximum);
            }
        }
    }

    function createCamera(scene, canvas, type) {
        switch (type) {
            case 'universal':
                return new BABYLON.UniversalCamera('universalCamera', new BABYLON.Vector3(0, 1.5, -5), scene);
            case 'firstPerson':
                const fpCamera = new BABYLON.UniversalCamera('firstPersonCamera', new BABYLON.Vector3(0, 1.5, -5), scene);
                fpCamera.speed = 0.35;
                fpCamera.inertia = 0.5;
                fpCamera.angularSensibility = 3000;
                return fpCamera;
            case 'arcRotate':
            default:
                return new BABYLON.ArcRotateCamera('arcCamera', Math.PI / 2, Math.PI / 2.5, 6, BABYLON.Vector3.Zero(), scene);
        }
    }

    function createLighting(scene, type) {
        switch (type) {
            case 'directional':
                const directional = new BABYLON.DirectionalLight('dirLight', new BABYLON.Vector3(-1, -2, 1), scene);
                directional.position = new BABYLON.Vector3(5, 10, -5);
                return directional;
            case 'point':
                return new BABYLON.PointLight('pointLight', new BABYLON.Vector3(0, 5, -5), scene);
            case 'environment':
                return scene.createDefaultLight(true, true, 1);
            case 'hemispheric':
            default:
                return new BABYLON.HemisphericLight('hemiLight', new BABYLON.Vector3(0, 1, 0), scene);
        }
    }

    /**
     * Babylon.js's PBR materials (glTF) divide a directional light's intensity by pi (Lambert's
     * 1/pi), but not a hemispheric light's. Measured on a matte sphere: a rig light of a given
     * strength lights as brightly as in the other viewers only when multiplied by pi.
     */
    const RIG_LIGHT_SCALE = Math.PI;

    /**
     * The light rig: a hemispheric light with the same sky and ground colour, which lights evenly
     * from every side, for the ambient light, and a directional light per rig light, aimed by
     * aimRig() once the camera is framed.
     */
    function createRig(scene, rig, brightness) {
        const ambientColour = BABYLON.Color3.FromHexString(rig.ambient.color);
        const ambient = new BABYLON.HemisphericLight('rigAmbient', new BABYLON.Vector3(0, 1, 0), scene);
        ambient.diffuse = ambientColour;
        ambient.groundColor = ambientColour.clone();
        ambient.specular = BABYLON.Color3.Black();
        ambient.intensity = rig.ambient.strength * brightness;

        return rig.lights.map(function (settings, i) {
            const light = new BABYLON.DirectionalLight('rigLight' + (i + 1), new BABYLON.Vector3(0, 0, -1), scene);
            light.diffuse = BABYLON.Color3.FromHexString(settings.color);
            light.specular = light.diffuse.clone();
            light.intensity = settings.strength * brightness * RIG_LIGHT_SCALE;
            return { light: light, azimuth: settings.azimuth, elevation: settings.elevation };
        });
    }

    /**
     * The side of the model the camera looks from, as lighting-rig.js's backFrom() gives it.
     */
    function viewSide(camera) {
        return camera instanceof BABYLON.ArcRotateCamera
            ? { x: Math.cos(camera.alpha), z: Math.sin(camera.alpha) }
            : window.ThreeDViewerLighting.backFrom(camera.position, camera.getTarget());
    }

    /**
     * Point each rig light from its direction relative to the camera's default view.
     */
    function aimRig(scene, camera, rigLights) {
        const back = viewSide(camera);
        const leftHanded = !scene.useRightHandedSystem;
        rigLights.forEach(function (entry) {
            const d = window.ThreeDViewerLighting.direction(entry.azimuth, entry.elevation, back, leftHanded);
            // A directional light's direction is the way its light travels: towards the model
            entry.light.direction = new BABYLON.Vector3(-d.x, -d.y, -d.z);
        });
    }

    /**
     * Keep lights fixed relative to the camera, so the model turns under them. Each light's
     * direction and position are recorded in the camera's frame, then carried round with the
     * camera before every frame. The environment's image-based lighting, if any, turns with the
     * camera in the same way; its skybox and ground stay in the scene.
     */
    function attachLightsToCamera(scene, camera, lights) {
        const worldToCamera = camera.getViewMatrix(true);
        const local = lights.map(function (light) {
            return {
                light: light,
                direction: light.direction ? BABYLON.Vector3.TransformNormal(light.direction, worldToCamera) : null,
                position: light.position ? BABYLON.Vector3.TransformCoordinates(light.position, worldToCamera) : null
            };
        });

        const cameraToWorld0 = camera.getWorldMatrix().getRotationMatrix();

        scene.onBeforeRenderObservable.add(function () {
            const cameraToWorld = camera.getWorldMatrix();
            // The environment is sampled through its reflection matrix, so turning it with the camera
            // means sampling through the inverse turn: from the current camera frame back to the
            // initial one (Babylon.js matrices apply left to right).
            const environment = scene.environmentTexture;
            if (environment && environment.setReflectionTextureMatrix) {
                environment.setReflectionTextureMatrix(
                    camera.getViewMatrix().getRotationMatrix().multiply(cameraToWorld0)
                );
            }
            local.forEach(function (entry) {
                if (entry.direction) {
                    entry.light.direction = BABYLON.Vector3.TransformNormal(entry.direction, cameraToWorld);
                }
                if (entry.position) {
                    entry.light.position = BABYLON.Vector3.TransformCoordinates(entry.position, cameraToWorld);
                }
            });
        });
    }

    /**
     * Turn an STL mesh so that the file's Y axis is up. The STL loader swaps Y and Z, which shows a
     * Z-up file upright in this left-handed scene without mirroring it; turning (x, y, z) to
     * (x, z, -y) then brings the file's Y up instead. A rotation, so the winding stays as it is.
     * Not DO_NOT_ALTER_FILE_COORDINATES: unswapped right-handed coordinates would be mirrored here.
     */
    function turnStlFileYUp(mesh) {
        [BABYLON.VertexBuffer.PositionKind, BABYLON.VertexBuffer.NormalKind].forEach(function (kind) {
            const data = mesh.getVerticesData(kind);
            if (!data) {
                return;
            }
            for (let i = 0; i < data.length; i += 3) {
                const y = data[i + 1];
                data[i + 1] = data[i + 2];
                data[i + 2] = -y;
            }
            mesh.setVerticesData(kind, data);
        });
        mesh.refreshBoundingInfo();
    }

    /**
     * Lighting controls (lighting-controls.js): report the lights, then apply each change to them.
     *
     * A light's direction is kept as angles from the default view, turned by a frame. The frame
     * stays put while the lighting is fixed to the model; fixed to the viewer, it turns with the
     * camera from where it was at the switch, as the environment's reflection does. Switching back
     * keeps the frame where it has got to, so the lights never jump.
     */
    function setUpLightingControls(canvas, scene, camera, presetLights, rig) {
        const lighting = window.ThreeDViewerLighting;
        const back = viewSide(camera);
        const leftHanded = !scene.useRightHandedSystem;
        const target = camera.getTarget ? camera.getTarget().clone() : BABYLON.Vector3.Zero();
        const toward = function (v) {
            return lighting.angles({ x: v.x, y: v.y, z: v.z }, back, leftHanded);
        };

        const entries = [];
        let rigNumber = 0;
        presetLights.forEach(function (light) {
            const entry = { light: light, scale: 1 };
            if (rig && light.name === 'rigAmbient') {
                Object.assign(entry, { id: 'ambient', kind: 'ambient' });
            } else if (rig) {
                rigNumber++;
                Object.assign(entry, { id: 'light' + rigNumber, kind: 'light', scale: RIG_LIGHT_SCALE });
            } else if (light instanceof BABYLON.HemisphericLight) {
                Object.assign(entry, { id: 'sky' + entries.length, kind: 'sky', ground: true });
            } else if (light instanceof BABYLON.DirectionalLight) {
                Object.assign(entry, { id: 'key' + entries.length, kind: 'key' });
            } else if (light instanceof BABYLON.PointLight) {
                Object.assign(entry, {
                    id: 'point' + entries.length,
                    kind: 'point',
                    distance: BABYLON.Vector3.Distance(light.position, target)
                });
            } else {
                return;
            }
            if (entry.kind !== 'ambient') {
                const from = entry.kind === 'sky' ? light.direction
                    : entry.kind === 'point' ? light.position.subtract(target)
                    : light.direction.negate();
                Object.assign(entry, toward(from));
            }
            entries.push(entry);
        });

        let mode = 'model';
        let frame = BABYLON.Matrix.Identity();
        let attached = null;   // While fixed to the viewer: the camera and the frame at the switch
        let observer = null;

        function currentFrame() {
            if (!attached) {
                return frame;
            }
            // Babylon.js matrices apply left to right: the frame, then the camera's turn since the switch
            return attached.frame.multiply(attached.worldToCamera).multiply(camera.getWorldMatrix().getRotationMatrix());
        }

        function place() {
            const turn = currentFrame();
            entries.forEach(function (entry) {
                if (entry.azimuth === undefined) {
                    return;
                }
                const d = lighting.direction(entry.azimuth, entry.elevation, back, leftHanded);
                const from = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(d.x, d.y, d.z), turn);
                if (entry.kind === 'sky') {
                    entry.light.direction = from;
                } else if (entry.kind === 'point') {
                    entry.light.position = target.add(from.scale(entry.distance));
                } else {
                    entry.light.direction = from.negate();
                }
            });
            const environment = scene.environmentTexture;
            if (environment && environment.setReflectionTextureMatrix) {
                // The environment is sampled through its reflection matrix: turning it by the frame
                // means sampling through the frame's inverse
                environment.setReflectionTextureMatrix(BABYLON.Matrix.Invert(turn));
            }
        }

        function setMode(next) {
            if (next === mode) {
                return;
            }
            if (next === 'viewer') {
                attached = { frame: frame.clone(), worldToCamera: camera.getViewMatrix().getRotationMatrix() };
                observer = scene.onBeforeRenderObservable.add(place);
            } else {
                frame = currentFrame().clone();
                attached = null;
                scene.onBeforeRenderObservable.remove(observer);
                observer = null;
            }
            mode = next;
        }

        setMode(canvas.dataset.lightingMode === 'viewer' ? 'viewer' : 'model');
        place();

        lighting.onChange(canvas, function (detail) {
            if (detail.reset) {
                setMode('model');
                frame = BABYLON.Matrix.Identity();
            }
            setMode(detail.mode === 'viewer' ? 'viewer' : 'model');
            detail.lights.forEach(function (change) {
                if (change.id === 'environment') {
                    scene.environmentIntensity = change.strength;
                    return;
                }
                const entry = entries.find(function (e) {
                    return e.id === change.id;
                });
                if (!entry) {
                    return;
                }
                if (change.color !== undefined) {
                    entry.light.diffuse = BABYLON.Color3.FromHexString(change.color);
                    if (entry.kind === 'ambient') {
                        entry.light.groundColor = entry.light.diffuse.clone();
                    } else if (entry.kind === 'light') {
                        entry.light.specular = entry.light.diffuse.clone();
                    }
                }
                if (change.groundColor !== undefined && entry.ground) {
                    entry.light.groundColor = BABYLON.Color3.FromHexString(change.groundColor);
                }
                if (change.strength !== undefined) {
                    entry.light.intensity = change.strength * entry.scale;
                }
                if (entry.azimuth !== undefined) {
                    entry.azimuth = change.azimuth;
                    entry.elevation = change.elevation;
                }
            });
            place();
        });

        const lights = entries.map(function (entry) {
            const report = {
                id: entry.id,
                kind: entry.kind,
                color: entry.light.diffuse.toHexString().toLowerCase(),
                strength: Math.round(entry.light.intensity / entry.scale * 100) / 100
            };
            if (entry.ground) {
                report.groundColor = entry.light.groundColor.toHexString().toLowerCase();
            }
            if (entry.azimuth !== undefined) {
                report.azimuth = entry.azimuth;
                report.elevation = entry.elevation;
            }
            return report;
        });
        if (scene.environmentTexture) {
            lights.push({ id: 'environment', kind: 'environment', strength: scene.environmentIntensity });
        }
        lighting.ready(canvas, { mode: mode, lights: lights });
    }

    function createEnvironment(scene, option) {
        if (option === 'studio') {
            return scene.createDefaultEnvironment({ enableGroundShadow: true, createSkybox: true });
        }

        if (option === 'default') {
            return scene.createDefaultEnvironment();
        }

        return null;
    }

    function initialiseCanvas(canvas, attempt) {
        const currentAttempt = attempt || 0;

        if (!window.BABYLON) {
            if (currentAttempt < 10) {
                setTimeout(function () {
                    initialiseCanvas(canvas, currentAttempt + 1);
                }, 100);
            } else {
                console.error('Babylon.js is not available.');
            }
            return;
        }

        const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        canvas.dataset.initialised = 'true';
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = hexToColor4(canvas.dataset.backgroundColor || '#b5b5b5');

        const camera = createCamera(scene, canvas, canvas.dataset.camera);
        camera.setTarget(BABYLON.Vector3.Zero());
        // Let the camera prevent the default of the events it uses, as the model-viewer and STL
        // viewers do: otherwise a wheel over the canvas zooms the model and scrolls the page at once
        camera.attachControl(canvas, false);

        // Only where the camera has no wheel input yet: the Arc Rotate camera comes with one
        if (camera.inputs && camera.inputs.addMouseWheel && !camera.inputs.attached.mousewheel) {
            camera.inputs.addMouseWheel();
        }

        if (canvas.dataset.autoRotate === 'true' && camera instanceof BABYLON.ArcRotateCamera) {
            camera.useAutoRotationBehavior = true;
            const behavior = camera.autoRotationBehavior;
            if (behavior) {
                behavior.idleRotationSpeed = 0.25;
                behavior.idleRotationWaitTime = 1000;
                behavior.idleRotationSpinupTime = 2000;
            }
        }

        const lighting = window.ThreeDViewerLighting;
        const brightness = lighting ? lighting.brightness(canvas) : 1;
        const rig = lighting ? lighting.parse(canvas) : null;
        let rigLights = null;
        if (rig) {
            rigLights = createRig(scene, rig, brightness);
        } else {
            createLighting(scene, canvas.dataset.lighting);
            scene.lights.forEach(function (light) {
                light.intensity *= brightness;
            });
        }
        // Only the preset's or the rig's lights, not any the model brings with it
        const presetLights = scene.lights.slice();

        const loadingElement = canvas.dataset.loadingId ? document.getElementById(canvas.dataset.loadingId) : null;

        if (!canvas.dataset.modelUrl) {
            console.error('Babylon viewer requires a model URL.');
            return;
        }

        const { rootUrl, fileName } = splitUrl(canvas.dataset.modelUrl);
        // Set only for STL files whose up axis is chosen
        const stlUpAxis = canvas.dataset.stlUpAxis;

        // Keep the STL loader swapping Y and Z, as the turn in onLoaded relies on. The flag is a
        // double negative: false, its default, swaps; true keeps the file's coordinates, which this
        // left-handed scene would show mirrored. It is page-wide, so it holds for any STL loaded here.
        if (stlUpAxis && BABYLON.STLFileLoader) {
            BABYLON.STLFileLoader.DO_NOT_ALTER_FILE_COORDINATES = false;
        }

        // loadedMeshes: the model's own meshes, where the loader reports them
        const onLoaded = function (loadedMeshes) {
            if (loadingElement) {
                loadingElement.classList.add('hidden');
            }

            // Before anything measures the model: framing, the environment's ground and skybox
            if (stlUpAxis === 'y') {
                loadedMeshes.forEach(turnStlFileYUp);
            }

            const meshes = scene.meshes.filter(function (mesh) {
                return mesh && mesh.name !== '__root__';
            });

            if (meshes.length) {
                const minMax = BABYLON.Mesh.MinMax(meshes);
                const center = BABYLON.Vector3.Center(minMax.min, minMax.max);
                const extents = minMax.max.subtract(minMax.min);
                const boundingInfo = new BABYLON.BoundingInfo(minMax.min, minMax.max);
                const maxExtent = Math.max(extents.x, extents.y, extents.z, 1);

                if (camera && camera.setTarget) {
                    camera.setTarget(center);
                }

                if (camera instanceof BABYLON.ArcRotateCamera) {
                    configureArcCamera(camera, boundingInfo);
                } else if (camera instanceof BABYLON.UniversalCamera) {
                    const fallbackExtent = Math.max(maxExtent, 1);
                    const offset = Math.max(boundingInfo.boundingSphere.radius * 2.5, fallbackExtent * 1.5);
                    camera.position = center.add(new BABYLON.Vector3(offset, offset, -offset));
                    const radius = Math.max(boundingInfo.boundingSphere.radius, 0.05);
                    camera.minZ = Math.max(radius * 0.02, 0.001);
                    camera.maxZ = Math.max(radius * 200, offset * 20);
                }
            }

            // Only now: the environment helper sizes its skybox and ground from the scene once, when it
            // is created. Created before the model loaded, it fell back to a 20-unit skybox and a
            // 15-unit ground at the origin, inside models measured in millimetres.
            createEnvironment(scene, canvas.dataset.environment);
            scene.environmentIntensity = brightness;

            if (rigLights) {
                aimRig(scene, camera, rigLights);
            }

            // After framing, so the first view is lit exactly as in the default mode
            if (lighting && lighting.hasControls(canvas)) {
                setUpLightingControls(canvas, scene, camera, presetLights, rig);
            } else if (canvas.dataset.lightingMode === 'viewer') {
                attachLightsToCamera(scene, camera, presetLights);
            }

            if (canvas.dataset.showInspector === 'true' && scene.debugLayer) {
                scene.debugLayer.show({
                    embedMode: true,
                    inspectorURL: 'https://cdn.babylonjs.com/inspector/babylon.inspector.bundle.js'
                }).catch(function (error) {
                    console.warn('Unable to show Babylon.js inspector.', error);
                });
            }
        };
        const onError = function (_, message, exception) {
            if (loadingElement) {
                loadingElement.textContent = 'Unable to load 3D model';
                loadingElement.classList.remove('hidden');
            }
            console.error('Babylon.js loader error:', message, exception);
        };

        if (stlUpAxis) {
            // An STL file holds only meshes, so importing them is the same as appending the file,
            // and the import lists exactly the model's meshes: the turn leaves alone any others
            // already in the scene, such as WebXR's helpers
            BABYLON.SceneLoader.ImportMesh('', rootUrl, fileName, scene, onLoaded, null, onError);
        } else {
            BABYLON.SceneLoader.Append(rootUrl, fileName, scene, function () {
                onLoaded([]);
            }, null, onError);
        }

        if (canvas.dataset.enableXr === 'true' && navigator.xr) {
            scene.createDefaultXRExperienceAsync({ disableTeleportation: false }).catch(function (error) {
                console.warn('WebXR initialisation failed:', error);
            });
        }

        engine.runRenderLoop(function () {
            scene.render();
        });

        viewerEngines.push(engine);
    }

    function initialiseAll() {
        const canvases = document.querySelectorAll('.threedviewer-babylon-canvas');
        canvases.forEach(function (canvas) {
            if (!canvas.dataset.initialised) {
                initialiseCanvas(canvas, 0);
            }
        });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initialiseAll();
    } else {
        document.addEventListener('DOMContentLoaded', initialiseAll);
    }

    window.addEventListener('resize', function () {
        viewerEngines.forEach(function (engine) {
            if (engine && !engine.isDisposed) {
                engine.resize();
            }
        });
    });
})();

