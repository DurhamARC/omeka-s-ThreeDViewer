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
        camera.attachControl(canvas, true);

        if (camera.inputs && camera.inputs.addMouseWheel) {
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

        createLighting(scene, canvas.dataset.lighting);
        // Only the preset's lights, not any the model brings with it
        const presetLights = scene.lights.slice();

        const loadingElement = canvas.dataset.loadingId ? document.getElementById(canvas.dataset.loadingId) : null;

        if (!canvas.dataset.modelUrl) {
            console.error('Babylon viewer requires a model URL.');
            return;
        }

        const { rootUrl, fileName } = splitUrl(canvas.dataset.modelUrl);

        BABYLON.SceneLoader.Append(rootUrl, fileName, scene, function () {
            if (loadingElement) {
                loadingElement.classList.add('hidden');
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

            // After framing, so the first view is lit exactly as in the default mode
            if (canvas.dataset.lightingMode === 'viewer') {
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
        }, null, function (_, message, exception) {
            if (loadingElement) {
                loadingElement.textContent = 'Unable to load 3D model';
                loadingElement.classList.remove('hidden');
            }
            console.error('Babylon.js loader error:', message, exception);
        });

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

