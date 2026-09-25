/**
 * Viewer-fixed lighting for <model-viewer>
 *
 * model-viewer lights a model with an environment map that is fixed in the scene, and its camera
 * controls move the camera around the model. The lighting therefore stays with the model: the side
 * that is dark in the first view stays dark however the model is turned. For elements with
 * data-lighting-mode="viewer", this rotates the environment with the camera orbit, so the lights
 * stay where they are relative to the viewer and the model turns under them.
 */
(function () {
  'use strict';

  /**
   * Get the three.js scene of a <model-viewer> element.
   *
   * model-viewer has no public accessor for its scene, but it hands it to an effect composer on
   * registration. Unregister straight away so that model-viewer goes on rendering as normal.
   *
   * @param {HTMLElement} viewer - The <model-viewer> element
   * @returns {Object|null} The scene, or null if it could not be obtained
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
   * Keep the lighting of one <model-viewer> element fixed relative to the viewer.
   *
   * @param {HTMLElement} viewer - The <model-viewer> element
   */
  function attach(viewer) {
    if (viewer.dataset.lightingAttached) {
      return;
    }

    const scene = getScene(viewer);
    // Scene.environmentRotation was added in three.js r162.
    if (!scene || !scene.environmentRotation) {
      console.warn('ThreeDViewer: viewer-fixed lighting is not supported by this model-viewer version.');
      return;
    }
    viewer.dataset.lightingAttached = 'true';

    // The environment is left as it is for the initial camera orbit, so the first view is lit as
    // before; orbiting away from it rotates the environment by the same amount.
    let initial = null;

    function update() {
      if (!initial) {
        return;
      }
      const orbit = viewer.getCameraOrbit();
      // The camera sits at polar angle phi from +Y and azimuth theta about +Y. Tilting it from the
      // initial phi is a rotation about X, then turning it by theta is a rotation about Y, so the
      // environment must turn by Ry(theta) Rx(phi - phi0) to go round with it. three.js samples the
      // environment through the Euler rotation with each angle negated, Rx(-x) Ry(-y) in XYZ order,
      // which is the inverse of Ry(y) Rx(x): the environment turns by Ry(y) Rx(x).
      scene.environmentRotation.set(orbit.phi - initial.phi, orbit.theta - initial.theta, 0, 'XYZ');
      // model-viewer renders only when it knows the scene has changed.
      if (typeof scene.queueRender === 'function') {
        scene.queueRender();
      }
    }

    // The camera orbit is not set until the model has loaded.
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

  function attachAll() {
    document.querySelectorAll('model-viewer[data-lighting-mode="viewer"]').forEach(attach);
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
