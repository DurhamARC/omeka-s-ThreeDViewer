/**
 * Lighting for <model-viewer>
 *
 * model-viewer lights a model with an environment map fixed in the scene while camera-controls
 * orbit the camera, so the lighting stays with the model. For data-lighting-mode="viewer" this
 * rotates the environment with the camera orbit, so the model turns under the lights instead.
 *
 * model-viewer has no lamps, so for a light rig (data-lights) this paints the rig into an
 * environment image (lighting-rig.js) and gives model-viewer that image instead of its own.
 */
(function () {
  'use strict';

  /** The Blob URL of each viewer's current rig environment, to release when it is replaced */
  const environments = new WeakMap();

  /**
   * model-viewer has no public accessor for its three.js scene, but hands it to an effect composer
   * on registration. Unregister straight away so model-viewer keeps rendering as normal.
   */
  function getScene(viewer) {
    if (typeof viewer.registerEffectComposer !== 'function') {
      return null;
    }
    let scene = null;
    viewer.registerEffectComposer({
      setRenderer: function () {},
      setMainCamera: function () {},
      setMainScene: function (mainScene) {
        scene = mainScene;
      }
    });
    viewer.unregisterEffectComposer();
    return scene;
  }

  /**
   * Light the model with an environment painted from the rig, as seen from the default view.
   */
  function applyRig(viewer, rig) {
    const lighting = window.ThreeDViewerLighting;
    const orbit = viewer.getCameraOrbit();
    const back = { x: Math.sin(orbit.theta), z: Math.cos(orbit.theta) };
    const hdr = lighting.rgbe(lighting.environment(rig, back));
    const url = URL.createObjectURL(new Blob([hdr], { type: 'image/vnd.radiance' }));

    const previous = environments.get(viewer);
    environments.set(viewer, url);
    if (previous) {
      viewer.addEventListener('environment-change', function () {
        URL.revokeObjectURL(previous);
      }, { once: true });
    }
    // model-viewer chooses its HDR loader by the URL's ending; fetch ignores the fragment
    viewer.environmentImage = url + '#.hdr';
  }

  /**
   * Turn the environment with the camera, so the model turns under the lights.
   */
  function followCamera(viewer) {
    const scene = getScene(viewer);
    // Scene.environmentRotation was added in three.js r162.
    if (!scene || !scene.environmentRotation) {
      console.warn('ThreeDViewer: viewer-fixed lighting is not supported by this model-viewer version.');
      return;
    }

    // The first view keeps its lighting; orbiting away rotates the environment by the same amount.
    let initial = null;

    function update() {
      if (!initial) {
        return;
      }
      const orbit = viewer.getCameraOrbit();
      // Camera turn is Ry(theta) Rx(phi - phi0); three.js applies Euler XYZ angles negated,
      // which is the inverse of Ry(y) Rx(x), so these angles turn the environment with the camera.
      scene.environmentRotation.set(orbit.phi - initial.phi, orbit.theta - initial.theta, 0, 'XYZ');
      if (typeof scene.queueRender === 'function') {
        scene.queueRender();
      }
    }

    function start() {
      initial = viewer.getCameraOrbit();
      update();
    }

    viewer.addEventListener('camera-change', update);
    if (viewer.loaded) {
      start();
    } else {
      viewer.addEventListener('load', start, { once: true });
    }
  }

  function attach(viewer) {
    if (viewer.dataset.lightingAttached) {
      return;
    }
    viewer.dataset.lightingAttached = 'true';

    // Set before the model loads, so the first frame already has the rig's lighting
    const rig = window.ThreeDViewerLighting ? window.ThreeDViewerLighting.parse(viewer) : null;
    if (rig) {
      applyRig(viewer, rig);
    }
    if (viewer.dataset.lightingMode === 'viewer') {
      followCamera(viewer);
    }
  }

  function attachAll() {
    document.querySelectorAll('model-viewer[data-lighting-mode="viewer"], model-viewer[data-lights]')
      .forEach(attach);
  }

  if (!window.customElements) {
    return;
  }
  customElements.whenDefined('model-viewer').then(function () {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachAll);
    } else {
      attachAll();
    }
  });
})();
