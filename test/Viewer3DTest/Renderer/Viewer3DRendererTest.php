<?php

declare(strict_types=1);

namespace Viewer3DTest\Renderer;

use PHPUnit\Framework\TestCase;
use Viewer3DTest\Doubles\DummyPhpRenderer;
use ThreeDViewer\Media\FileRenderer\Viewer3DRenderer;
use Omeka\Api\Representation\MediaRepresentation;

class Viewer3DRendererTest extends TestCase
{
    private DummyPhpRenderer $view;
    private Viewer3DRenderer $renderer;

    protected function setUp(): void
    {
        $this->view = new DummyPhpRenderer();
        $this->renderer = new Viewer3DRenderer();
    }

    public function testRendersGlbWithModelViewer(): void
    {
        $media = new MediaRepresentation(
            'https://example.org/files/original/model.glb',
            'GLB Sample',
            'model.glb'
        );

        $html = $this->renderer->render($this->view, $media, []);

        $this->assertIsString($html);
        $this->assertStringContainsString('<model-viewer', $html, 'Should use model-viewer for GLB');
        $this->assertStringNotContainsString('model-info', $html, 'The old banner should not be rendered');
        $this->assertStringNotContainsString('grid-overlay', $html, 'The grid is off by default');
        $this->assertStringContainsString('View 3D model fullscreen', $html);
        $this->assertStringContainsString('Exit fullscreen 3D model', $html);
        $this->assertStringContainsString('aria-label="3D viewer controls"', $html);
        $this->assertContains('/modules/ThreeDViewer/js/viewer-controls.js', $this->view->headScript()->files);
        $this->assertContains(
            '/modules/ThreeDViewer/css/model-viewer-controls.css',
            $this->view->headLink()->files
        );
    }

    public function testGlbGridIsOptionalAndStylesheetIsLoadedOnce(): void
    {
        $this->view->setSettings(['threedviewer_show_grid' => true]);
        $media = new MediaRepresentation('https://example.org/files/original/model.glb', 'GLB', 'model.glb');

        $first = $this->renderer->render($this->view, $media, []);
        $second = $this->renderer->render($this->view, $media, []);

        $this->assertStringContainsString('<div class="grid-overlay"></div>', $first);
        $this->assertStringContainsString('<div class="grid-overlay"></div>', $second);
        $this->assertCount(1, $this->view->headLink()->files);
    }

    public function testRendersStlWithCustomViewer(): void
    {
        $media = new MediaRepresentation(
            'https://example.org/files/original/mesh.stl',
            'STL Sample',
            'mesh.stl'
        );

        $html = $this->renderer->render($this->view, $media, []);

        $this->assertIsString($html);
        $this->assertStringContainsString('data-stl-url="//example.org/files/original/mesh.stl"', $html);
        $this->assertStringContainsString('STL Viewer', $html, 'STL info panel present');
        $this->assertStringStartsWith('<div class="threedviewer-stl-container">', $html);
    }

    public function testStlStylesLeaveOtherMediaAlone(): void
    {
        $media = new MediaRepresentation('https://example.org/files/original/mesh.stl', 'STL', 'mesh.stl');

        $this->renderer->render($this->view, $media, []);

        $styles = implode("\n", $this->view->headStyle()->styles);
        $this->assertStringContainsString('.threedviewer-stl-container {', $styles);
        $this->assertStringNotContainsString('.media-render', $styles, 'Every media on the page has a .media-render');
    }

    public function testRendersWithBabylonWhenConfigured(): void
    {
        $this->view->setSettings([
            'threedviewer_default_library' => 'babylon',
        ]);

        $media = new MediaRepresentation(
            'https://example.org/files/original/model.gltf',
            'GLTF Sample',
            'model.gltf'
        );

        $html = $this->renderer->render($this->view, $media, []);

        $this->assertIsString($html);
        $this->assertStringContainsString('class="threedviewer-babylon-canvas"', $html);
        $this->assertStringContainsString('Babylon.js Viewer', $html, 'Babylon info panel present');
    }

    /**
     * @dataProvider lightingModeCases
     */
    public function testEveryViewerReceivesTheLightingMode(?string $setting, string $expected): void
    {
        $viewers = ['model.glb' => 'model-viewer', 'mesh.stl' => 'model-viewer', 'model.gltf' => 'babylon'];
        foreach ($viewers as $file => $library) {
            $view = new DummyPhpRenderer();
            $view->setSettings(array_filter([
                'threedviewer_default_library' => $library,
                'threedviewer_lighting_mode' => $setting,
            ]));
            $media = new MediaRepresentation('https://example.org/files/original/' . $file, 'Sample', $file);

            $html = $this->renderer->render($view, $media, []);

            $this->assertStringContainsString('data-lighting-mode="' . $expected . '"', $html, $file);
        }
    }

    public function lightingModeCases(): array
    {
        return [
            'default keeps lights fixed to the model' => [null, 'model'],
            'viewer' => ['viewer', 'viewer'],
            'unknown value falls back to model' => ['bogus', 'model'],
        ];
    }

    /**
     * @dataProvider stlUpAxisCases
     */
    public function testStlUpAxisReachesOnlyStlViewers(?string $setting, ?string $expected): void
    {
        $viewers = [
            ['mesh.stl', 'model-viewer', true],
            ['mesh.stl', 'babylon', true],
            ['model.glb', 'model-viewer', false],
            ['model.glb', 'babylon', false],
            ['model.gltf', 'babylon', false],
        ];
        foreach ($viewers as [$file, $library, $isStl]) {
            $view = new DummyPhpRenderer();
            $view->setSettings(array_filter([
                'threedviewer_default_library' => $library,
                'threedviewer_stl_up_axis' => $setting,
            ]));
            $media = new MediaRepresentation('https://example.org/files/original/' . $file, 'Sample', $file);

            $html = $this->renderer->render($view, $media, []);

            if ($expected !== null && $isStl) {
                $this->assertStringContainsString('data-stl-up-axis="' . $expected . '"', $html, "$file, $library");
            } else {
                $this->assertStringNotContainsString('data-stl-up-axis', $html, "$file, $library");
            }
        }
    }

    public function stlUpAxisCases(): array
    {
        return [
            'not set: each viewer keeps its own' => [null, null],
            'current behaviour' => ['current', null],
            'unknown keeps current behaviour' => ['x', null],
            'Y up' => ['y', 'y'],
            'Z up' => ['z', 'z'],
        ];
    }

    public function testStlUpAxisIsEscapedForItsAttribute(): void
    {
        $renderer = new class extends \ThreeDViewer\Media\FileRenderer\StlRenderer {
            public function attribute($view, array $config): string
            {
                return $this->renderStlUpAxis($view, $config);
            }
        };

        $html = $renderer->attribute(new DummyPhpRenderer(), ['stlUpAxis' => '"><script>']);

        $this->assertSame(' data-stl-up-axis="&quot;&gt;&lt;script&gt;"', $html);
    }

    public function testModelViewerLightingScriptLoadsOnlyForViewerMode(): void
    {
        $media = new MediaRepresentation('https://example.org/files/original/model.glb', 'GLB', 'model.glb');
        $script = '/modules/ThreeDViewer/js/model-viewer-lighting.js';

        $this->renderer->render($this->view, $media, []);
        $this->assertNotContains($script, $this->view->headScript()->files);

        $view = new DummyPhpRenderer();
        $view->setSettings(['threedviewer_lighting_mode' => 'viewer']);
        $this->renderer->render($view, $media, []);
        $this->assertContains($script, $view->headScript()->files);
    }
}
