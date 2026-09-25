/**
 * STL Viewer using Three.js
 * Handles loading, displaying and interactive 3D viewing of STL files
 * With aspect ratio correction to prevent distortion
 */

// Global variables
let scene, camera, renderer, controls;

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
    lightingMode: options.lightingMode === "viewer" ? "viewer" : "model"
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

  // Get the container element where the 3D viewer will be rendered
  const container = document.querySelector('.media-render');
  
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

  // Add lighting to the scene
  // Ambient light provides overall illumination
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // Directional light simulates sunlight with shadows
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(0, 50, 50).normalize();
  scene.add(directionalLight);

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

      if (config.lightingMode === 'viewer') {
        attachLightToCamera(directionalLight);
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
 * Moves a directional light onto the camera, keeping the direction it shines in the current view,
 * so that it stays fixed relative to the viewer as the camera orbits and the model turns under it
 *
 * @param {THREE.DirectionalLight} light - A light added to the scene, with its target at the origin
 */
function attachLightToCamera(light) {
  camera.updateMatrixWorld();
  const direction = light.position.clone()
    .sub(light.target.position)
    .transformDirection(camera.matrixWorldInverse);

  // A directional light shines from its position towards its target, so with both on the camera
  // its direction is fixed in the view whatever the camera does
  light.position.copy(direction);
  light.target.position.set(0, 0, 0);
  camera.add(light);
  camera.add(light.target);
  scene.add(camera);
}

/**
 * Handles window/container resize events
 * Adjusts camera and renderer to maintain proper aspect ratio
 */
function onWindowResize() {
  const container = document.querySelector('.media-render');
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
  
  // Verify we have a valid URL
  if (!stlUrl) {
    console.error('STL model URL not found');
    loadingElement.textContent = 'Error: Could not load the model';
    return;
  }

  // Initialize the viewer with configuration
  init(stlUrl, {
    foregroundColor: foregroundColor,
    backgroundColor: backgroundColor,
    autoRotate: autoRotate,
    showGrid: showGrid,
    lightingMode: lightingMode
  });
  
  // Start the animation loop
  animate();
});