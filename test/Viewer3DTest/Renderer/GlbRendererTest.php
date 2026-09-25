<?php

declare(strict_types=1);

namespace Viewer3DTest\Renderer;

use PHPUnit\Framework\TestCase;
use Viewer3DTest\Doubles\DummyPhpRenderer;
use ThreeDViewer\Media\FileRenderer\GlbRenderer;
use Omeka\Api\Representation\MediaRepresentation;

class GlbRendererTest extends TestCase
{
    private const LIGHTING_SCRIPT = '/modules/ThreeDViewer/js/model-viewer-lighting.js';

    private DummyPhpRenderer $view;
    private GlbRenderer $renderer;
    private MediaRepresentation $media;

    protected function setUp(): void
    {
        $this->view = new DummyPhpRenderer();
        $this->renderer = new GlbRenderer();
        $this->media = new MediaRepresentation(
            'https://example.org/files/original/model.glb',
            'GLB Sample',
            'model.glb'
        );
    }

    public function testLightingIsFixedToTheModelByDefault(): void
    {
        $html = $this->renderer->render($this->view, $this->media, []);

        $this->assertStringContainsString('data-lighting-mode="model"', $html);
        $this->assertNotContains(
            self::LIGHTING_SCRIPT,
            $this->view->headScript()->files,
            'model-viewer lighting script only loaded when needed'
        );
    }

    public function testViewerFixedLightingLoadsTheLightingScript(): void
    {
        $this->view->setSettings(['threedviewer_lighting_mode' => 'viewer']);

        $html = $this->renderer->render($this->view, $this->media, []);

        $this->assertStringContainsString('data-lighting-mode="viewer"', $html);
        $this->assertContains(self::LIGHTING_SCRIPT, $this->view->headScript()->files);
    }
}
