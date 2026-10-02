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
   * The side of the model the default view looks from: the camera's, before anyone orbits it.
   */
  function viewSide(viewer) {
    const orbit = viewer.getCameraOrbit();
    return { x: Math.sin(orbit.theta), z: Math.cos(orbit.theta) };
  }

  /**
   * Light the model with an environment painted from the rig, its directions taken from the side
   * the default view looks from.
   */
  function applyRig(viewer, rig, back) {
    const lighting = window.ThreeDViewerLighting;
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

  /**
   * Lighting controls (lighting-controls.js): report the lights, then apply each change to them.
   *
   * With a rig, each change repaints the environment. With model-viewer's own environment, its
   * direction and height turn the environment so that its overhead light comes from there. Either
   * way the environment is turned by a frame: fixed while the lighting is fixed to the model, and
   * turned with the camera from where it was at the switch while it is fixed to the viewer.
   * Switching back keeps the frame where it has got to, so the lighting never jumps.
   *
   * @param {Object|null} rig - The rig as painted, its strengths already multiplied by brightness
   * @param {{x: number, z: number}} side - The side of the model the default view looks from
   */
  function setUpLightingControls(viewer, rig, side) {
    const lighting = window.ThreeDViewerLighting;
    const scene = getScene(viewer);
    // model-viewer's three.js classes, which its bundle does not export, from the scene's own objects
    const turnable = scene && scene.environmentRotation && scene.quaternion;
    const Quaternion = turnable ? scene.quaternion.constructor : null;
    const Euler = turnable ? scene.environmentRotation.constructor : null;
    const degrees = Math.PI / 180;

    let lights;
    if (rig) {
      lights = [{ id: 'ambient', kind: 'ambient', color: rig.ambient.color, strength: rig.ambient.strength }]
        .concat(rig.lights.map(function (light, i) {
          return Object.assign({ id: 'light' + (i + 1), kind: 'light' }, light);
        }));
    } else {
      const environment = { id: 'environment', kind: 'environment', strength: viewer.exposure };
      if (turnable) {
        // Its overhead light, untouched
        Object.assign(environment, { azimuth: 0, elevation: 90 });
      }
      lights = [environment];
    }
    const state = JSON.parse(JSON.stringify(lights));
    const back = side;

    let mode = 'model';
    let frame = turnable ? new Quaternion() : null;
    let attached = null;   // While fixed to the viewer: the camera orbit and the frame at the switch

    function turnSince(orbit) {
      const now = viewer.getCameraOrbit();
      // The camera's turn, as the environment must follow it: Ry(theta) Rx(phi)
      return new Quaternion().setFromEuler(new Euler(now.phi - orbit.phi, now.theta - orbit.theta, 0, 'YXZ'));
    }

    function currentFrame() {
      return attached ? turnSince(attached.orbit).multiply(attached.frame) : frame;
    }

    /** Turn the environment by the frame, and model-viewer's own by its direction too */
    function orient() {
      if (!turnable) {
        return;
      }
      const turn = currentFrame().clone();
      const environment = state[0];
      if (!rig && environment.azimuth !== undefined) {
        turn.multiply(new Quaternion().setFromEuler(
          new Euler((90 - environment.elevation) * degrees, environment.azimuth * degrees, 0, 'YXZ')
        ));
      }
      // three.js samples the environment through the negated Euler angles: R_XYZ(-e) = turn^-1
      const inverse = new Euler().setFromQuaternion(turn.invert(), 'XYZ');
      scene.environmentRotation.set(-inverse.x, -inverse.y, -inverse.z, 'XYZ');
      if (typeof scene.queueRender === 'function') {
        scene.queueRender();
      }
    }

    if (rig) {
      // Each repaint loads a new environment; without this, the loading bar flashes as a slider moves
      viewer.style.setProperty('--progress-bar-height', '0px');
    }

    let repaint = 0;
    function paint() {
      repaint = 0;
      applyRig(viewer, {
        ambient: { color: state[0].color, strength: state[0].strength },
        lights: state.slice(1)
      }, back);
    }

    function setMode(next) {
      if (next === mode || !turnable) {
        return;
      }
      if (next === 'viewer') {
        attached = { orbit: viewer.getCameraOrbit(), frame: frame.clone() };
        viewer.addEventListener('camera-change', orient);
      } else {
        frame = currentFrame().clone();
        attached = null;
        viewer.removeEventListener('camera-change', orient);
      }
      mode = next;
    }

    setMode(viewer.dataset.lightingMode === 'viewer' ? 'viewer' : 'model');
    orient();

    lighting.onChange(viewer, function (detail) {
      if (detail.reset && turnable) {
        setMode('model');
        frame = new Quaternion();
      }
      setMode(detail.mode === 'viewer' ? 'viewer' : 'model');
      detail.lights.forEach(function (change) {
        const light = state.find(function (l) {
          return l.id === change.id;
        });
        if (light) {
          Object.keys(light).forEach(function (key) {
            if (key !== 'id' && key !== 'kind' && change[key] !== undefined) {
              light[key] = change[key];
            }
          });
        }
      });
      if (rig) {
        // Painting takes a few tens of milliseconds: at most once a frame while a slider moves
        if (!repaint) {
          repaint = requestAnimationFrame(paint);
        }
      } else {
        viewer.exposure = state[0].strength;
      }
      orient();
    });

    lighting.ready(viewer, { mode: turnable ? mode : 'model', lights: lights });
  }

  function attach(viewer) {
    if (viewer.dataset.lightingAttached) {
      return;
    }
    viewer.dataset.lightingAttached = 'true';
    const lighting = window.ThreeDViewerLighting;
    const controls = lighting && lighting.hasControls(viewer);

    // Set before the model loads, so the first frame already has the rig's lighting
    let rig = lighting ? lighting.parse(viewer) : null;
    if (rig && controls) {
      // The controls show each light's strength with brightness included, as in the other viewers
      const brightness = viewer.exposure;
      rig.ambient.strength *= brightness;
      rig.lights.forEach(function (light) {
        light.strength *= brightness;
      });
      viewer.exposure = 1;
    }
    const side = viewSide(viewer);
    if (rig) {
      applyRig(viewer, rig, side);
    }

    if (controls) {
      if (viewer.loaded) {
        setUpLightingControls(viewer, rig, side);
      } else {
        viewer.addEventListener('load', function () {
          setUpLightingControls(viewer, rig, side);
        }, { once: true });
      }
    } else if (viewer.dataset.lightingMode === 'viewer') {
      followCamera(viewer);
    }
  }

  function attachAll() {
    document.querySelectorAll(
      'model-viewer[data-lighting-mode="viewer"], model-viewer[data-lights], model-viewer[data-lighting-controls]'
    ).forEach(attach);
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
