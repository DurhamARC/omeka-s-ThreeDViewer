<?php

declare(strict_types=1);

namespace Viewer3DTest\Renderer;

use PHPUnit\Framework\TestCase;
use Viewer3DTest\Doubles\DummyPhpRenderer;
use ThreeDViewer\Media\FileRenderer\StlRenderer;
use Omeka\Api\Representation\MediaRepresentation;

class StlRendererTest extends TestCase
{
    private DummyPhpRenderer $view;
    private StlRenderer $renderer;
    private MediaRepresentation $media;

    protected function setUp(): void
    {
        $this->view = new DummyPhpRenderer();
        $this->renderer = new StlRenderer();
        $this->media = new MediaRepresentation(
            'https://example.org/files/original/mesh.stl',
            'STL Sample',
            'mesh.stl'
        );
    }

    public function testLightingIsFixedToTheModelByDefault(): void
    {
        $html = $this->renderer->render($this->view, $this->media, []);

        $this->assertStringContainsString('data-lighting-mode="model"', $html);
    }

    public function testPassesViewerFixedLighting(): void
    {
        $this->view->setSettings(['threedviewer_lighting_mode' => 'viewer']);

        $html = $this->renderer->render($this->view, $this->media, []);

        $this->assertStringContainsString('data-lighting-mode="viewer"', $html);
    }

    public function testUnknownLightingModeFallsBackToModel(): void
    {
        $this->view->setSettings(['threedviewer_lighting_mode' => '"><script>']);

        $html = $this->renderer->render($this->view, $this->media, []);

        $this->assertStringContainsString('data-lighting-mode="model"', $html);
    }
}
