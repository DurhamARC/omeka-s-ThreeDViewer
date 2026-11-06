/**
 * STL Viewer using Three.js
 * Handles loading, displaying and interactive 3D viewing of STL files
 * With aspect ratio correction to prevent distortion
 */

// Global variables
let scene, camera, renderer, controls;
// Set while the lighting is fixed to the viewer: moves the lights each frame
let followCamera = null;
// The element the viewer draws in: the one holding its #loading element
let container;

/**
 * Initializes the 3D scene, camera and renderer
 * Sets up lighting and loads the STL model for display
 * 
 * @param {string} modelUrl - URL to the STL file
 * @param {Object} options - Configuration options for the viewer
 */
function init(modelUrl, options = {}) {
  // Set default options if not provided
  const config = {
    foregroundColor: options.foregroundColor || "#FFFFFF",
    backgroundColor: options.backgroundColor || "#000000",
    autoRotate: options.autoRotate === "true" || false,
    showGrid: options.showGrid === "true" || false,
    lightingMode: options.lightingMode === "viewer" ? "viewer" : "model",
    brightness: options.brightness === undefined ? 1 : options.brightness,
    rig: options.rig || null,
    element: options.element || null
  };
  
  // Convert hex color strings to Three.js color objects
  const fgColor = new THREE.Color(config.foregroundColor);
  const bgColor = new THREE.Color(config.backgroundColor);
  
  // Create the main scene
  scene = new THREE.Scene();
  
  // Add grid if enabled in configuration
  if (config.showGrid) {
    const gridSize = 100;
    const gridDivisions = 20;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x00ff00, 0x00ff00);
    // Position grid slightly below the model
    gridHelper.position.y = -20;
    scene.add(gridHelper);
  }

  // Get the container element where the 3D viewer will be rendered. Other media on the page
  // have their own .media-render blocks, so it is the one given, not the first on the page
  container = options.container || document.querySelector('.threedviewer-stl-container');
  
  // Configure camera with correct aspect ratio
  camera = new THREE.PerspectiveCamera(
    60, // Field of view in degrees
    container.clientWidth / container.clientHeight, // Aspect ratio
    0.1, // Near clipping plane
    1000 // Far clipping plane
  );
  camera.position.set(0, 0, 100); // Initial camera position

  // Create WebGL renderer with antialiasing
  renderer = new THREE.WebGLRenderer({ antialias: true });
  
  // Set renderer size to match container dimensions
  renderer.setSize(container.clientWidth, container.clientHeight);
  
  // Set background color from configuration
  renderer.setClearColor(bgColor);
  
  // Add the renderer's canvas to the container
  container.appendChild(renderer.domElement);  

  // Add orbit controls for interactive camera movement
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // Add smooth damping to controls
  controls.dampingFactor = 0.25;
  controls.screenSpacePanning = false;
  controls.maxDistance = 500;
  
  // Set auto-rotation based on configuration
  controls.autoRotate = config.autoRotate;
  controls.autoRotateSpeed = 1.0;
  
  // Log auto-rotate setting for debugging
  console.log('STL Viewer: Auto-rotate is ' + (config.autoRotate ? 'enabled' : 'disabled'));

  // Add lighting to the scene: the light rig if there is one, else an ambient light for overall
  // illumination and a directional light from the front and above
  const lights = config.rig ? addRig(config.rig, config.brightness) : addDefaultLights(config.brightness);

  // Load the STL file using Three.js STLLoader
  const loader = new THREE.STLLoader();
  loader.load(
    modelUrl, // URL to the STL file
    // Success callback - called when model is loaded
    function (geometry) {
      // Hide loading message
      const loadingElement = document.getElementById('loading');
      if (loadingElement) {
        loadingElement.style.display = 'none';
      }
        
      // Create a material with better appearance
      const material = new THREE.MeshPhongMaterial({ 
        color: fgColor,
        specular: 0x111111,
        shininess: 200
      });
      
      // Create mesh from geometry and material
      const mesh = new THREE.Mesh(geometry, material);

      // Center the model
      geometry.computeBoundingBox();
      const boundingBox = geometry.boundingBox;
      const center = new THREE.Vector3();
      boundingBox.getCenter(center);
      mesh.position.set(-center.x, -center.y, -center.z);
        
      // Store original bounding box for later reference
      mesh.userData.originalBoundingBox = boundingBox.clone();
      
      // Adjust scale to fit view
      const size = new THREE.Vector3();
      boundingBox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 50 / maxDim;
      mesh.scale.set(scale, scale, scale);

      // Add the model to the scene
      scene.add(mesh);
        
      // Adjust camera to see the complete model based on aspect ratio
      const fov = camera.fov * (Math.PI / 180);
      const aspectFactor = Math.min(1, camera.aspect);
      const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.5 * (1 / aspectFactor);
      
      camera.position.set(distance, distance, distance);
      camera.lookAt(0, 0, 0);
      controls.update();

      if (config.rig) {
        aimRig(lights.directional, config.rig);
      }
      if (window.ThreeDViewerLighting && config.element) {
        setUpLighting(config.element, lights, config);
      }
      
      // Trigger a resize to ensure proper rendering
      onWindowResize();
    },
    // Progress callback - called during loading
    function (xhr) {
      if (xhr.lengthComputable) {
        const percentComplete = Math.round(xhr.loaded / xhr.total * 100);
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
          loadingElement.textContent = `Loading STL model: ${percentComplete}%`;
          
          // Hide loading message when loading reaches 100%
          if (percentComplete === 100) {
            loadingElement.style.display = 'none';
          }
        }
      }
    },
    // Error callback - called if loading fails
    function (error) {
      const loadingElement = document.getElementById('loading');
      if (loadingElement) {
        loadingElement.textContent = 'Error loading STL model. Please verify the file exists.';
        loadingElement.style.backgroundColor = 'rgba(255,0,0,0.7)';
      }
      console.error('Error loading STL', error);
    }
  );

  // Set up responsive behavior using ResizeObserver if available
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      onWindowResize();
    });
    resizeObserver.observe(container);
  } else {
    // Fallback for browsers that don't support ResizeObserver
    window.addEventListener('resize', onWindowResize, false);
  }
}

/**
 * The viewer's own lights: ambient, and a directional light from the front and 45 degrees up
 *
 * @param {number} brightness - Multiplier for both lights
 * @return {{ambient: THREE.AmbientLight, directional: THREE.DirectionalLight[]}} The lights
 */
function addDefaultLights(brightness) {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6 * brightness);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8 * brightness);
  directionalLight.position.set(0, 50, 50).normalize();
  scene.add(directionalLight);
  return { ambient: ambientLight, directional: [directionalLight] };
}

/**
 * The light rig's lights: ambient, and one directional light per rig light, aimed by aimRig()
 * once the camera has its default view
 *
 * @param {Object} rig - From ThreeDViewerLighting.parse()
 * @param {number} brightness - Multiplier for every light
 * @return {{ambient: THREE.AmbientLight, directional: THREE.DirectionalLight[]}} The lights, in the rig's order
 */
function addRig(rig, brightness) {
  const ambientLight = new THREE.AmbientLight(new THREE.Color(rig.ambient.color), rig.ambient.strength * brightness);
  scene.add(ambientLight);

  const directional = rig.lights.map(function (light) {
    const directionalLight = new THREE.DirectionalLight(new THREE.Color(light.color), light.strength * brightness);
    directionalLight.position.set(0, 0, 1);
    scene.add(directionalLight);
    return directionalLight;
  });
  return { ambient: ambientLight, directional: directional };
}

/**
 * Points each rig light from its direction relative to the camera's current (default) view
 *
 * @param {THREE.DirectionalLight[]} lights - From addRig()
 * @param {Object} rig - The rig they were made from
 */
function aimRig(lights, rig) {
  const back = ThreeDViewerLighting.backFrom(camera.position, new THREE.Vector3(0, 0, 0));
  lights.forEach(function (light, i) {
    const d = ThreeDViewerLighting.direction(rig.lights[i].azimuth, rig.lights[i].elevation, back, false);
    light.position.set(d.x, d.y, d.z);
  });
}

/**
 * The lights fixed to the model or to the viewer, and changed by the lighting controls where the
 * page shows them: see ThreeDViewerLighting.controller() in lighting-rig.js
 *
 * @param {HTMLElement} element - The element the controls send their changes to
 * @param {{ambient: THREE.AmbientLight, directional: THREE.DirectionalLight[]}} lights
 * @param {Object} config - The viewer's configuration
 */
function setUpLighting(element, lights, config) {
  const byId = { ambient: lights.ambient };
  const described = [{ id: 'ambient', kind: 'ambient' }];
  lights.directional.forEach(function (light, i) {
    const id = config.rig ? 'light' + (i + 1) : 'key';
    byId[id] = light;
    // Its target is at the origin, so its position is the way to the light
    const p = light.position;
    described.push({ id: id, kind: config.rig ? 'light' : 'key', direction: { x: p.x, y: p.y, z: p.z } });
  });

  ThreeDViewerLighting.controller(element, {
    lights: described.map(function (light) {
      return Object.assign(light, {
        color: '#' + byId[light.id].color.getHexString(),
        strength: byId[light.id].intensity
      });
    }),
    back: ThreeDViewerLighting.backFrom(camera.position, new THREE.Vector3(0, 0, 0)),
    leftHanded: false,
    mode: config.lightingMode,
    turns: {
      identity: function () { return new THREE.Quaternion(); },
      clone: function (turn) { return turn.clone(); },
      then: function (first, second) { return second.clone().multiply(first); },
      camera: function () { return camera.quaternion.clone(); },
      since: function (start) { return camera.quaternion.clone().multiply(start.clone().inverse()); }
    },
    follow: function (update) {
      followCamera = update;
    },
    set: function (light) {
      byId[light.id].color.set(light.color);
      byId[light.id].intensity = light.strength;
    },
    place: function (all, turn) {
      all.forEach(function (light) {
        if (light.direction) {
          byId[light.id].position.set(light.direction.x, light.direction.y, light.direction.z).applyQuaternion(turn);
        }
      });
    }
  });
}

/**
 * Handles window/container resize events
 * Adjusts camera and renderer to maintain proper aspect ratio
 */
function onWindowResize() {
  if (!container) return;
  
  // Update camera aspect ratio
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  
  // Update renderer size
  renderer.setSize(container.clientWidth, container.clientHeight);
  
  // Adjust camera distance to maintain visibility of the model
  adjustCameraForAspectRatio();
}

/**
 * Adjusts camera position based on the current aspect ratio
 * Prevents model distortion when container dimensions change
 */
function adjustCameraForAspectRatio() {
  if (!scene) return;
  
  // Find the 3D model mesh in the scene
  const model = scene.children.find(child => child instanceof THREE.Mesh);
  
  if (model) {
    // Get the original bounding box data
    const boundingBox = model.userData.originalBoundingBox;
    if (!boundingBox) return;
    
    // Calculate model size
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    
    // Calculate appropriate camera distance based on model size and aspect ratio
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const aspectFactor = Math.min(1, camera.aspect);
    
    // Adjust distance considering FOV and current aspect ratio
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 1.5 * (1 / aspectFactor);
    
    // Move camera to keep object visible
    camera.position.set(distance, distance, distance);
    camera.lookAt(0, 0, 0);
    
    // Update controls
    controls.update();
  }
}

/**
 * Animation loop - renders the scene for each frame
 */
function animate() {
  requestAnimationFrame(animate);
  
  // Update controls (needed for smooth damping and auto-rotation)
  if (controls) {
    controls.update();
  }
  if (followCamera) {
    followCamera();
  }
  
  // Render the scene
  if (scene && camera && renderer) {
    renderer.render(scene, camera);
  }
}

/**
 * Initialize the viewer when the DOM is fully loaded
 */
document.addEventListener('DOMContentLoaded', () => {
  // Get STL URL and configuration from data attributes
  const loadingElement = document.getElementById('loading');
  if (!loadingElement) {
    console.error('Loading element not found');
    return;
  }
  
  const stlUrl = loadingElement.dataset.stlUrl;
  const foregroundColor = loadingElement.dataset.foregroundColor;
  const backgroundColor = loadingElement.dataset.backgroundColor;
  const autoRotate = loadingElement.dataset.autoRotate;
  const showGrid = loadingElement.dataset.showGrid;
  const lightingMode = loadingElement.dataset.lightingMode;
  const lighting = window.ThreeDViewerLighting;
  
  // Verify we have a valid URL
  if (!stlUrl) {
    console.error('STL model URL not found');
    loadingElement.textContent = 'Error: Could not load the model';
    return;
  }

  // Initialize the viewer with configuration
  init(stlUrl, {
    container: loadingElement.parentElement,
    foregroundColor: foregroundColor,
    backgroundColor: backgroundColor,
    autoRotate: autoRotate,
    showGrid: showGrid,
    lightingMode: lightingMode,
    brightness: lighting ? lighting.brightness(loadingElement) : 1,
    rig: lighting ? lighting.parse(loadingElement) : null,
    element: loadingElement
  });
  
  // Start the animation loop
  animate();
});