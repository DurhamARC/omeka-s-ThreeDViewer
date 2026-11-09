# ThreeDViewer (3D) Module for Omeka S

[![codecov](https://codecov.io/gh/ateeducacion/omeka-s-ThreeDViewer/branch/main/graph/badge.svg)](https://codecov.io/gh/ateeducacion/omeka-s-ThreeDViewer)


<a href="https://ateeducacion.github.io/omeka-s-playground/?blueprint=https%3A%2F%2Fraw.githubusercontent.com%2Fateeducacion%2Fomeka-s-ThreeDViewer%2Frefs%2Fheads%2Fmain%2Fblueprint.json">
  <img src="https://raw.githubusercontent.com/ateeducacion/omeka-s-ThreeDViewer/refs/heads/main/.github/assets/playground-preview-button.svg" alt="Try ThreeDViewer in your browser" width="224">
</a><br>
<small><a href="https://ateeducacion.github.io/omeka-s-playground/?blueprint=https%3A%2F%2Fraw.githubusercontent.com%2Fateeducacion%2Fomeka-s-ThreeDViewer%2Frefs%2Fheads%2Fmain%2Fblueprint.json">Try in your browser</a></small>

![Screenshot of the 3D Viewer](https://raw.githubusercontent.com/ateeducacion/omeka-s-ThreeDViewer/refs/heads/main/.github/assets/screenshot.png)

This module allows users to view and interact with 3D models (STL and GLB files) directly within Omeka S.

## Features

- View 3D models (STL and GLB formats) directly in the browser
- Interactive controls for rotating, zooming, and panning 3D models
- Fullscreen and compact interaction-help controls for GLB/glTF models in the model-viewer renderer
- Customizable display options including background color
- Optional auto-rotation for better visualization
- Grid display option for better spatial reference
- Lighting fixed to the model (default) or to the viewer, so turning a model brings its shadowed side into the light
- A choice of up axis for STL files (Y or Z), so STL models show the same way up with either library
- Toggle between the original Three.js/model-viewer pipeline and an experimental Babylon.js renderer
- Babylon.js renderer with configurable cameras, lighting, and WebXR support

## Installation

### Manual Installation

1. Download the latest release from the GitHub repository
2. Extract the zip file to your Omeka S `modules` directory
3. Log in to the Omeka S admin panel and navigate to Modules
5. Click "Install" next to Three3DViewer

## Installation

See general end user documentation for [Installing a module](http://omeka.org/s/docs/user-manual/modules/#installing-modules)

## Usage

1. Upload STL or GLB files to your Omeka S items as you would any other media file
2. When viewing an item with a 3D model, the model will automatically be displayed in an interactive viewer
3. Use your mouse to:
   - Left-click and drag to rotate the model
   - Right-click and drag to pan
   - Scroll to zoom in and out
4. The module settings allow administrators to choose the default viewing library. Select the legacy Three.js/model-viewer
   stack for the original experience or opt into Babylon.js for advanced camera behaviour, lighting presets, optional
   environment ground/skybox, WebXR (VR/AR) support, and an inspector toolbar for fine-tuning scenes on demand.
5. **STL up axis**: STL files don't record which way is up, and by default the two libraries assume different axes
   (Three.js: Y, Babylon.js: Z), so an STL model upright in one lies on its back in the other. *Keep current
   behaviour* (the default) leaves both as they are. *Y up* or *Z up* shows STL models that way up with either
   library; Z up is the usual convention for 3D printing and CAD. The model is turned, never mirrored. GLB and glTF
   files are not affected: glTF defines Y as up.

## Local Development with Docker

This repository includes a **Makefile** and a `docker-compose.yml` for quick local development using [erseco/alpine-omeka-s](https://github.com/erseco/alpine-omeka-s).

### Quick start

```bash
make up
```

Then open [http://localhost:8080](http://localhost:8080).

### Sample data import

On first boot, the container automatically installs CSVImport and, if `data/sample_3d_data.csv` is present, imports it so you immediately have items to test the viewer. To trigger a manual import inside the container, run:

```
make shell
cd /var/www/html && OMEKA_CSV_IMPORT_FILE=/data/sample_3d_data.csv php import_cli.php "$OMEKA_CSV_IMPORT_FILE"
```

### Preconfigured users

The environment automatically creates several users with different roles:

| Email                                                   | Role         | Password        |
| ------------------------------------------------------- | ------------ | --------------- |
| [admin@example.com](mailto:admin@example.com)           | global_admin | password        |
| [editor@example.com](mailto:editor@example.com)         | editor       | 1234            |

The **ThreeDViewer module** is automatically enabled, so you can start testing right away.

### Useful Make commands

* `make up` – Start Docker containers in interactive mode
* `make upd` – Start in detached mode (background)
* `make down` – Stop and remove containers
* `make shell` – Open a shell inside the Omeka S container
* `make lint` – Run PHP_CodeSniffer
* `make fix` – Auto-fix coding style issues
* `make package VERSION=1.2.3` – Build a `.zip` release of the module
* `make test` – Run PHPUnit tests

Run `make help` for a full list.

## Coverage

Run `make test-coverage` with PCOV or Xdebug enabled. CI measures `Module.php` and all PHP files in `src/`, requires at least 90% line coverage, and uploads the Clover report to Codecov using GitHub OIDC. Codecov requires 90% for both project and patch coverage.
