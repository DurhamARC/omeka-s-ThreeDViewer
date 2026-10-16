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

  /**
   * Each viewer's rig environments: the Blob URL model-viewer shows, the one it is loading, and the
   * rig to paint once that has loaded
   */
  const environments = new WeakMap();

  /** How long to wait for an environment model-viewer is loading before giving up on it */
  const ENVIRONMENT_TIMEOUT = 10000;

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
   * model-viewer's cache of environment images by URL (TextureUtils.skyboxCache), which it never
   * empties while the page is open, or null where this version of model-viewer keeps none there.
   * Like the scene, it is not exported: it is reached through the element's Symbol(renderer).
   */
  function environmentCache(viewer) {
    try {
      for (let o = viewer; o; o = Object.getPrototypeOf(o)) {
        const symbol = Object.getOwnPropertySymbols(o).find(function (s) {
          return s.description === 'renderer';
        });
        if (symbol) {
          const renderer = viewer[symbol];
          const cache = renderer && renderer.textureUtils && renderer.textureUtils.skyboxCache;
          return cache instanceof Map ? cache : null;
        }
      }
    } catch (e) {
      // Not this model-viewer's insides
    }
    return null;
  }

  /**
   * Free an environment that model-viewer no longer shows: its image, which model-viewer would
   * otherwise keep, then its Blob URL.
   */
  function release(viewer, url) {
    const cache = environmentCache(viewer);
    const key = url + '#.hdr';
    const loading = cache ? cache.get(key) : undefined;
    if (!loading) {
      URL.revokeObjectURL(url);
      return;
    }
    cache.delete(key);
    Promise.resolve(loading).then(function (texture) {
      if (texture) {
        texture.dispose();
      }
    }, function () {}).then(function () {
      URL.revokeObjectURL(url);
    });
  }

  /**
   * Light the model with an environment painted from the rig, its directions taken from the side
   * the default view looks from.
   *
   * One environment loads at a time: a rig painted meanwhile waits for it, and replaces any rig
   * already waiting. Each environment is released once the next is shown.
   */
  function applyRig(viewer, rig, back) {
    let state = environments.get(viewer);
    if (!state) {
      state = { shown: null, loading: null, timer: 0, waiting: null };
      environments.set(viewer, state);
      viewer.addEventListener('environment-change', function () {
        loaded(viewer, state, true);
      });
    }
    if (state.loading) {
      state.waiting = { rig: rig, back: back };
      return;
    }

    const lighting = window.ThreeDViewerLighting;
    const hdr = lighting.rgbe(lighting.environment(rig, back));
    state.loading = URL.createObjectURL(new Blob([hdr], { type: 'image/vnd.radiance' }));
    // model-viewer throws, with no event, when an environment fails to load
    state.timer = setTimeout(function () {
      loaded(viewer, state, false);
    }, ENVIRONMENT_TIMEOUT);
    // model-viewer chooses its HDR loader by the URL's ending; fetch ignores the fragment
    viewer.environmentImage = state.loading + '#.hdr';
  }

  /**
   * The environment model-viewer was loading is shown (or has failed): release the one it
   * replaces (or itself), then paint the rig waiting, if any.
   */
  function loaded(viewer, state, shown) {
    if (!state.loading) {
      return;
    }
    clearTimeout(state.timer);
    const old = shown ? state.shown : state.loading;
    if (shown) {
      state.shown = state.loading;
    }
    state.loading = null;
    if (old) {
      release(viewer, old);
    }
    const waiting = state.waiting;
    state.waiting = null;
    if (waiting) {
      applyRig(viewer, waiting.rig, waiting.back);
    }
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
    // Where model-viewer's cache cannot be reached, each environment painted stays in memory, so
    // paint only once the controls pause rather than as often as a slider moves
    const pause = rig && !environmentCache(viewer) ? 250 : 0;
    let latest = null;
    function paint() {
      repaint = 0;
      applyRig(viewer, { ambient: latest[0], lights: latest.slice(1) }, side);
    }

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
        latest = all;
        if (changed && pause) {
          clearTimeout(repaint);
          repaint = setTimeout(paint, pause);
        } else if (changed && !repaint) {
          // Painting takes a few tens of milliseconds: at most once a frame while a slider moves
          repaint = requestAnimationFrame(paint);
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
