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
     * How much a rig light's strength is multiplied by for the model's materials. Babylon.js's PBR
     * materials (glTF) divide a directional light's intensity by pi (Lambert's 1/pi), but not a
     * hemispheric light's; measured on a matte sphere, a rig light lights as brightly as in the other
     * viewers only when multiplied by pi. Its standard material, which STL and OBJ models get, does
     * not divide, so there the strength is used as it is. Any material but the standard one counts
     * as PBR, as glTF's are.
     */
    function rigLightScale(scene, meshes) {
        const standard = meshes.length > 0 && meshes.every(function (mesh) {
            const material = mesh.material || scene.defaultMaterial;
            return !material || material instanceof BABYLON.StandardMaterial;
        });
        return standard ? 1 : Math.PI;
    }

    /**
     * The light rig: a hemispheric light with the same sky and ground colour, which lights evenly
     * from every side, for the ambient light, and a directional light per rig light, aimed and
     * scaled for the model's materials by aimRig() once the model has loaded.
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
            light.intensity = settings.strength * brightness;
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
     * Point each rig light from its direction relative to the camera's default view, and scale its
     * strength for the model's materials.
     */
    function aimRig(scene, camera, rigLights, scale) {
        const back = viewSide(camera);
        const leftHanded = !scene.useRightHandedSystem;
        rigLights.forEach(function (entry) {
            entry.light.intensity *= scale;
            const d = window.ThreeDViewerLighting.direction(entry.azimuth, entry.elevation, back, leftHanded);
            // A directional light's direction is the way its light travels: towards the model
            entry.light.direction = new BABYLON.Vector3(-d.x, -d.y, -d.z);
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
     * The lights fixed to the model or to the viewer, and changed by the lighting controls where the
     * page shows them: see ThreeDViewerLighting.controller() in lighting-rig.js. The environment's
     * image-based lighting, if any, turns with the lights; its skybox and ground stay in the scene.
     * With a rig the environment gives no light, so the controls do not show it.
     */
    function setUpLighting(canvas, scene, camera, presetLights, rig, rigScale) {
        const lighting = window.ThreeDViewerLighting;
        const target = camera.getTarget ? camera.getTarget().clone() : BABYLON.Vector3.Zero();

        const entries = {};
        const lights = [];
        let rigNumber = 0;
        presetLights.forEach(function (light) {
            const entry = { light: light, scale: 1 };
            let id;
            let kind;
            let from = null;
            if (rig && light.name === 'rigAmbient') {
                id = 'ambient';
                kind = 'ambient';
            } else if (rig) {
                rigNumber++;
                id = 'light' + rigNumber;
                kind = 'light';
                entry.scale = rigScale;
                from = light.direction.negate();
            } else if (light instanceof BABYLON.HemisphericLight) {
                id = 'sky' + lights.length;
                kind = 'sky';
                from = light.direction.clone();
            } else if (light instanceof BABYLON.DirectionalLight) {
                id = 'key' + lights.length;
                kind = 'key';
                from = light.direction.negate();
            } else if (light instanceof BABYLON.PointLight) {
                id = 'point' + lights.length;
                kind = 'point';
                from = light.position.subtract(target);
                entry.distance = from.length();
                from.normalize();
            } else {
                return;
            }
            entries[id] = Object.assign(entry, { kind: kind });
            const described = {
                id: id,
                kind: kind,
                color: light.diffuse.toHexString().toLowerCase(),
                strength: light.intensity / entry.scale
            };
            if (kind === 'sky') {
                described.groundColor = light.groundColor.toHexString().toLowerCase();
            }
            if (from) {
                described.direction = { x: from.x, y: from.y, z: from.z };
            }
            lights.push(described);
        });
        if (scene.environmentTexture && !rig) {
            lights.push({ id: 'environment', kind: 'environment', strength: scene.environmentIntensity });
        }

        let observer = null;
        lighting.controller(canvas, {
            lights: lights,
            back: viewSide(camera),
            leftHanded: !scene.useRightHandedSystem,
            mode: canvas.dataset.lightingMode,
            // Babylon.js matrices apply left to right: first.multiply(second) turns by first, then second
            turns: {
                identity: function () {
                    return BABYLON.Matrix.Identity();
                },
                clone: function (turn) {
                    return turn.clone();
                },
                then: function (first, second) {
                    return first.multiply(second);
                },
                camera: function () {
                    return camera.getViewMatrix().getRotationMatrix();
                },
                since: function (worldToCamera) {
                    return worldToCamera.multiply(camera.getWorldMatrix().getRotationMatrix());
                }
            },
            follow: function (update) {
                if (observer) {
                    scene.onBeforeRenderObservable.remove(observer);
                    observer = null;
                }
                if (update) {
                    observer = scene.onBeforeRenderObservable.add(update);
                }
            },
            set: function (light) {
                if (light.id === 'environment') {
                    scene.environmentIntensity = light.strength;
                    return;
                }
                const entry = entries[light.id];
                entry.light.diffuse = BABYLON.Color3.FromHexString(light.color);
                if (entry.kind === 'ambient') {
                    entry.light.groundColor = entry.light.diffuse.clone();
                } else if (entry.kind === 'light') {
                    entry.light.specular = entry.light.diffuse.clone();
                } else if (entry.kind === 'sky') {
                    entry.light.groundColor = BABYLON.Color3.FromHexString(light.groundColor);
                }
                entry.light.intensity = light.strength * entry.scale;
            },
            place: function (all, turn) {
                all.forEach(function (light) {
                    if (!light.direction) {
                        return;
                    }
                    const entry = entries[light.id];
                    const d = light.direction;
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
        });
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

            // Before the environment's skybox and ground: only the model's own materials count
            const rigScale = rigLightScale(scene, meshes);

            // Only now: the environment helper sizes its skybox and ground from the scene once, when it
            // is created. Created before the model loaded, it fell back to a 20-unit skybox and a
            // 15-unit ground at the origin, inside models measured in millimetres.
            createEnvironment(scene, canvas.dataset.environment);
            // A rig lights the model in place of the viewer's own lighting, the environment's too:
            // its skybox and ground stay, as a backdrop
            scene.environmentIntensity = rig ? 0 : brightness;

            if (rigLights) {
                aimRig(scene, camera, rigLights, rigScale);
            }

            // After framing, so the first view is lit exactly as in the default mode
            if (lighting) {
                setUpLighting(canvas, scene, camera, presetLights, rig, rigScale);
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

