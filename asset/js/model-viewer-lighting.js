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
   * The lighting fixed to the model or to the viewer, and changed by the lighting controls where
   * the page shows them: see ThreeDViewerLighting.controller() in lighting-rig.js.
   *
   * Either way the environment is turned by the controller's frame. With a rig, each change to a
   * light repaints the environment. With model-viewer's own environment, its direction and height
   * turn the environment so that its overhead light comes from there.
   *
   * @param {Object|null} rig - The rig as painted, its strengths already multiplied by brightness
   * @param {{x: number, z: number}} side - The side of the model the default view looks from
   */
  function setUpLighting(viewer, rig, side) {
    const lighting = window.ThreeDViewerLighting;
    const scene = getScene(viewer);
    // model-viewer's three.js classes, which its bundle does not export, from the scene's own objects.
    // Scene.environmentRotation was added in three.js r162.
    const turnable = scene && scene.environmentRotation && scene.quaternion;
    if (!turnable && viewer.dataset.lightingMode === 'viewer') {
      console.warn('ThreeDViewer: viewer-fixed lighting is not supported by this model-viewer version.');
    }
    const Quaternion = turnable ? scene.quaternion.constructor : null;
    const Euler = turnable ? scene.environmentRotation.constructor : null;
    const degrees = Math.PI / 180;

    let lights;
    if (rig) {
      lights = [{ id: 'ambient', kind: 'ambient', color: rig.ambient.color, strength: rig.ambient.strength }]
        .concat(rig.lights.map(function (light, i) {
          return {
            id: 'light' + (i + 1),
            kind: 'light',
            color: light.color,
            strength: light.strength,
            direction: lighting.direction(light.azimuth, light.elevation, side, false)
          };
        }));
      // Each repaint loads a new environment; without this, the loading bar flashes as a slider moves
      viewer.style.setProperty('--progress-bar-height', '0px');
    } else {
      const environment = { id: 'environment', kind: 'environment', strength: viewer.exposure };
      if (turnable) {
        // Its overhead light, untouched
        environment.direction = { x: 0, y: 1, z: 0 };
      }
      lights = [environment];
    }

    let repaint = 0;
    let changed = false;

    /** Turn the environment by the frame, and model-viewer's own by its direction too */
    function orient(all, frame) {
      if (!frame) {
        return;
      }
      const turn = frame.clone();
      const environment = all[0];
      if (!rig && environment.direction) {
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

    let listener = null;
    lighting.controller(viewer, {
      lights: lights,
      back: side,
      leftHanded: false,
      mode: viewer.dataset.lightingMode,
      turns: turnable ? {
        identity: function () {
          return new Quaternion();
        },
        clone: function (turn) {
          return turn.clone();
        },
        then: function (first, second) {
          return second.clone().multiply(first);
        },
        camera: function () {
          return viewer.getCameraOrbit();
        },
        since: function (orbit) {
          const now = viewer.getCameraOrbit();
          // The camera's turn, as the environment must follow it: Ry(theta) Rx(phi)
          return new Quaternion().setFromEuler(new Euler(now.phi - orbit.phi, now.theta - orbit.theta, 0, 'YXZ'));
        }
      } : null,
      follow: function (update) {
        if (listener) {
          viewer.removeEventListener('camera-change', listener);
        }
        listener = update;
        if (listener) {
          viewer.addEventListener('camera-change', listener);
        }
      },
      set: function (light) {
        if (rig) {
          changed = true;
        } else {
          viewer.exposure = light.strength;
        }
      },
      place: function (all, frame) {
        // Painting takes a few tens of milliseconds: at most once a frame while a slider moves
        if (changed && !repaint) {
          repaint = requestAnimationFrame(function () {
            repaint = 0;
            applyRig(viewer, { ambient: all[0], lights: all.slice(1) }, side);
          });
        }
        changed = false;
        orient(all, frame);
      }
    });
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

    if (lighting && (controls || viewer.dataset.lightingMode === 'viewer')) {
      if (viewer.loaded) {
        setUpLighting(viewer, rig, side);
      } else {
        viewer.addEventListener('load', function () {
          setUpLighting(viewer, rig, side);
        }, { once: true });
      }
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
