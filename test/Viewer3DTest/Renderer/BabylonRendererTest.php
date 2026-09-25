<?php

declare(strict_types=1);

namespace Viewer3DTest\Renderer;

use PHPUnit\Framework\TestCase;
use Viewer3DTest\Doubles\DummyPhpRenderer;
use ThreeDViewer\Media\FileRenderer\BabylonRenderer;
use Omeka\Api\Representation\MediaRepresentation;

class BabylonRendererTest extends TestCase
{
    private DummyPhpRenderer $view;
    private BabylonRenderer $renderer;

    protected function setUp(): void
    {
        $this->view = new DummyPhpRenderer();
        $this->renderer = new BabylonRenderer();
    }

    public function testRendersCanvasWithExpectedAttributes(): void
    {
        $media = new MediaRepresentation(
            'https://example.org/files/original/model.gltf',
            'GLTF Sample',
            'model.gltf',
            42
        );

        $html = $this->renderer->render($this->view, $media, []);

        $this->assertIsString($html);
        $this->assertStringContainsString('Babylon.js Viewer', $html, 'Info panel title present');
        $this->assertStringContainsString('class="threedviewer-babylon-canvas"', $html, 'Canvas has expected class');
        $this->assertStringContainsString(
            'data-model-url="//example.org/files/original/model.gltf"',
            $html,
            'Model URL is protocol-relative'
        );
        $this->assertStringContainsString('data-camera="arcRotate"', $html, 'Default camera is arcRotate');
        $this->assertStringContainsString('data-lighting="hemispheric"', $html, 'Default lighting is hemispheric');
        $this->assertStringContainsString('data-lighting-mode="model"', $html, 'Default lights fixed to the model');
        $this->assertStringContainsString('data-environment="none"', $html, 'Default environment is none');
        $this->assertStringContainsString('data-auto-rotate="true"', $html, 'Default auto-rotate enabled');
        $this->assertStringContainsString('data-enable-xr="false"', $html, 'Default XR disabled');
        $this->assertStringContainsString('data-show-grid="false"', $html, 'Default grid disabled');
        $this->assertStringContainsString('data-show-inspector="false"', $html, 'Default inspector disabled');

        // Ensure styles for Babylon container are appended to headStyle
        $styles = $this->view->headStyle()->styles;
        $this->assertNotEmpty($styles, 'Styles should be appended');
        $allStyles = implode("\n", $styles);
        $this->assertStringContainsString('.threedviewer-babylon-container', $allStyles);
    }

    public function testAppendsBabylonScriptsAndInspectorWhenEnabled(): void
    {
        $this->view->setSettings([
            'threedviewer_babylon_show_toolbar' => true,
        ]);

        $media = new MediaRepresentation(
            'https://example.com/3d/model.glb',
            'GLB Sample',
            'model.glb'
        );

        $this->renderer->render($this->view, $media, []);

        $files = $this->view->headScript()->files;
        $this->assertContains('https://cdn.babylonjs.com/babylon.js', $files, 'Babylon core script appended');
        $this->assertContains(
            'https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js',
            $files,
            'Babylon loaders appended'
        );
        $this->assertContains('/modules/ThreeDViewer/js/babylon-viewer.js', $files, 'Module viewer script appended');
        $this->assertContains(
            'https://cdn.babylonjs.com/inspector/babylon.inspector.bundle.js',
            $files,
            'Inspector appended when toolbar enabled'
        );
    }

    public function testRespectsConfiguredOptions(): void
    {
        $this->view->setSettings([
            'threedviewer_viewer_height' => 640,
            'threedviewer_background_color' => '#112233',
            'threedviewer_auto_rotate' => false,
            'threedviewer_babylon_camera' => 'universal',
            'threedviewer_babylon_lighting' => 'directional',
            'threedviewer_babylon_environment' => 'studio',
            'threedviewer_babylon_enable_xr' => true,
            'threedviewer_show_grid' => true,
            'threedviewer_babylon_show_toolbar' => true,
            'threedviewer_lighting_mode' => 'viewer',
        ]);

        $media = new MediaRepresentation(
            'http://example.org/path/to/scene.gltf',
            'Scene',
            'scene.gltf',
            7
        );

        $html = $this->renderer->render($this->view, $media, []);

        $this->assertStringContainsString('data-background-color="#112233"', $html);
        $this->assertStringContainsString('data-auto-rotate="false"', $html);
        $this->assertStringContainsString('data-camera="universal"', $html);
        $this->assertStringContainsString('data-lighting="directional"', $html);
        $this->assertStringContainsString('data-lighting-mode="viewer"', $html);
        $this->assertStringContainsString('data-environment="studio"', $html);
        $this->assertStringContainsString('data-enable-xr="true"', $html);
        $this->assertStringContainsString('data-show-grid="true"', $html);
        $this->assertStringContainsString('data-show-inspector="true"', $html);
    }
}
