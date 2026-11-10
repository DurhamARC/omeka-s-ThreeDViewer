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

  /**
   * How long to wait for an environment where model-viewer's cache cannot be reached, so that there
   * is no telling whether it has started loading or failed, before painting the next
   */
  const ENVIRONMENT_TIMEOUT = 10000;

  /** How often to look for model-viewer starting to load an environment */
  const ENVIRONMENT_POLL = 250;

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
   * How far model-viewer's auto-rotate has turned the model, in radians about the up axis. Unlike the
   * other viewers' auto-rotate, which moves the camera, model-viewer's turns the model on a turntable
   * (its pivot), with no camera-change event.
   */
  function turntable(viewer) {
    const yaw = viewer.turntableRotation;
    return typeof yaw === 'number' && isFinite(yaw) ? yaw : 0;
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
    // model-viewer chooses its HDR loader by the URL's ending; fetch ignores the fragment
    viewer.environmentImage = state.loading + '#.hdr';
    watch(viewer, state, state.loading);
  }

  /**
   * Watch for the environment being loaded failing: model-viewer throws, with no event. It loads
   * an environment only once the element is on screen, which may be long after it is given one,
   * so wait for it to start, however long that takes, rather than give up on it and free an image
   * it has yet to load.
   */
  function watch(viewer, state, url) {
    if (state.loading !== url) {
      return;
    }
    const cache = environmentCache(viewer);
    if (!cache) {
      // Stop waiting for it, but keep its URL, which model-viewer may yet load
      state.timer = setTimeout(function () {
        if (state.loading === url) {
          state.loading = null;
          next(viewer, state);
        }
      }, ENVIRONMENT_TIMEOUT);
      return;
    }
    const loading = cache.get(url + '#.hdr');
    if (!loading) {
      state.timer = setTimeout(function () {
        watch(viewer, state, url);
      }, ENVIRONMENT_POLL);
      return;
    }
    // Loading: it is either shown (environment-change) or fails
    Promise.resolve(loading).then(null, function () {
      if (state.loading === url) {
        loaded(viewer, state, false);
      }
    });
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
    next(viewer, state);
  }

  /** Paint the rig waiting, if any */
  function next(viewer, state) {
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
   * The controller works in the model's frame. Auto-rotate turns the model, not the camera, so the
   * camera's orientation is taken relative to the model (the model's turn counts as the camera
   * turning the other way), and the environment turns with the model on top of the frame: fixed to
   * the model, the lights turn with it; fixed to the viewer, the frame turns back as the model turns,
   * and the lights stay put. The turntable is watched each frame, as nothing announces its turns.
   *
   * @param {Object|null} rig - The rig as painted, its strengths already multiplied by brightness
   * @param {{x: number, z: number}} side - The side of the model the default view looks from
   */
  function setUpLighting(viewer, rig, side) {
    const lighting = window.ThreeDViewerLighting;
    const scene = getScene(viewer);
    // model-viewer's three.js classes, which its bundle does not export, from the scene's own objects.
    // Scene.environmentRotation was added in three.js r162.
    const turnable = scene && scene.environmentRotation && scene.quaternion && scene.position;
    if (!turnable && viewer.dataset.lightingMode === 'viewer') {
      console.warn('ThreeDViewer: viewer-fixed lighting is not supported by this model-viewer version.');
    }
    const Quaternion = turnable ? scene.quaternion.constructor : null;
    const Vector3 = turnable ? scene.position.constructor : null;
    const Euler = turnable ? scene.environmentRotation.constructor : null;
    const degrees = Math.PI / 180;
    // The model's turn since the lighting was set up, which its default view is taken from
    const startYaw = turntable(viewer);
    function turned() {
      return turntable(viewer) - startYaw;
    }

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
    let placed = null;   // The lights and frame as last placed, to turn again with the model
    let following = null;   // The controller's update for a camera move, if it wants one
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
        // Its azimuth is from the default view's side, which is theta round from +z
        turn.multiply(new Quaternion().setFromEuler(new Euler(
          (90 - environment.elevation) * degrees,
          environment.azimuth * degrees + Math.atan2(side.x, side.z),
          0,
          'YXZ'
        )));
      }
      // Then with the model, from the model's frame to the scene's
      const world = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), turned()).multiply(turn);
      // three.js samples the environment through the negated Euler angles: R_XYZ(-e) = turn^-1
      const inverse = new Euler().setFromQuaternion(world.invert(), 'XYZ');
      scene.environmentRotation.set(-inverse.x, -inverse.y, -inverse.z, 'XYZ');
      if (typeof scene.queueRender === 'function') {
        scene.queueRender();
      }
    }

    /**
     * The camera's orientation relative to the model, from its orbit less the model's turn,
     * Ry(theta - turned) Rx(phi): it turns +y to the camera's side
     */
    function orientation() {
      const orbit = viewer.getCameraOrbit();
      return new Quaternion().setFromEuler(new Euler(orbit.phi, orbit.theta - turned(), 0, 'YXZ'));
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
        invert: function (turn) {
          return turn.clone().invert();
        },
        apply: function (turn, v) {
          const p = new Vector3(v.x, v.y, v.z).applyQuaternion(turn);
          return { x: p.x, y: p.y, z: p.z };
        },
        camera: orientation,
        since: function (start) {
          // The camera's turn since then, from wherever round the model it was
          return orientation().multiply(start.clone().invert());
        }
      } : null,
      follow: function (update) {
        if (listener) {
          viewer.removeEventListener('camera-change', listener);
        }
        listener = update;
        following = update;
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
        placed = { all: all, frame: frame };
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

    // Only auto-rotate turns the turntable, and the module sets it once, in the markup
    if (turnable && viewer.autoRotate) {
      let last = turntable(viewer);
      const watchTurntable = function () {
        const now = turntable(viewer);
        if (now !== last) {
          last = now;
          // Fixed to the viewer, the frame turns back; with the panel open, the directions shown turn
          if (following) {
            following();
          }
          if (placed) {
            orient(placed.all, placed.frame);
          }
        }
        requestAnimationFrame(watchTurntable);
      };
      requestAnimationFrame(watchTurntable);
    }
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

    // A rig also needs turning with the model, as auto-rotate turns it
    if (lighting && (controls || rig || viewer.dataset.lightingMode === 'viewer')) {
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
