<?php

declare(strict_types=1);

namespace Viewer3DTest\Renderer;

use PHPUnit\Framework\TestCase;
use Viewer3DTest\Doubles\DummyPhpRenderer;
use ThreeDViewer\Media\FileRenderer\Viewer3DRenderer;
use Omeka\Api\Representation\MediaRepresentation;

class LightingMarkupTest extends TestCase
{
    private const RIG = [
        'threedviewer_lights' => 'custom',
        'threedviewer_light_count' => 2,
        'threedviewer_light_ambient_color' => '#102030',
        'threedviewer_light_2_color' => '#ff0000',
    ];

    /**
     * Render one media file with the given settings.
     *
     * @return array{0: string, 1: DummyPhpRenderer}
     */
    private function render(string $file, array $settings): array
    {
        $view = new DummyPhpRenderer();
        $view->setSettings($settings);
        $media = new MediaRepresentation('https://example.org/files/original/' . $file, 'Sample', $file);
        return [(new Viewer3DRenderer())->render($view, $media, []), $view];
    }

    public function viewers(): array
    {
        return [
            'model-viewer' => ['model.glb', 'model-viewer'],
            'STL' => ['mesh.stl', 'model-viewer'],
            'Babylon.js' => ['model.gltf', 'babylon'],
        ];
    }

    /**
     * @dataProvider viewers
     */
    public function testDefaultsAddNothing(string $file, string $library): void
    {
        [$html, $view] = $this->render($file, ['threedviewer_default_library' => $library]);

        foreach (['data-lights', 'data-light-brightness', 'exposure=', 'environment-image', 'shadow-'] as $attribute) {
            $this->assertStringNotContainsString($attribute, $html, $attribute);
        }
        $this->assertNotContains('/modules/ThreeDViewer/js/lighting-rig.js', $view->headScript()->files);
        $this->assertNotContains('/modules/ThreeDViewer/js/model-viewer-lighting.js', $view->headScript()->files);
    }

    /**
     * @dataProvider viewers
     */
    public function testRigReachesEveryViewer(string $file, string $library): void
    {
        [$html, $view] = $this->render($file, self::RIG + ['threedviewer_default_library' => $library]);

        $this->assertSame(1, preg_match('/data-lights="([^"]*)"/', $html, $match));
        $rig = json_decode(html_entity_decode($match[1], ENT_QUOTES), true);
        $this->assertSame(['color' => '#102030', 'strength' => 0.6], $rig['ambient']);
        $this->assertCount(2, $rig['lights']);
        $this->assertSame('#ff0000', $rig['lights'][1]['color']);

        $files = $view->headScript()->files;
        $rigScript = array_search('/modules/ThreeDViewer/js/lighting-rig.js', $files, true);
        $this->assertIsInt($rigScript, 'The shared lighting script is loaded');
        foreach (['js/model-viewer-lighting.js', 'js/stl-viewer.js', 'js/babylon-viewer.js'] as $viewerScript) {
            $position = array_search('/modules/ThreeDViewer/' . $viewerScript, $files, true);
            if ($position !== false) {
                $this->assertGreaterThan($rigScript, $position, $viewerScript . ' loads after it');
            }
        }
    }

    public function testModelViewerGetsItsEnvironmentWithoutARig(): void
    {
        [$html, $view] = $this->render('model.glb', [
            'threedviewer_light_brightness' => '1.5',
            'threedviewer_model_viewer_environment' => 'neutral',
            'threedviewer_model_viewer_shadow_intensity' => '0.4',
            'threedviewer_model_viewer_shadow_softness' => '0.25',
        ]);

        $this->assertStringContainsString('exposure="1.5"', $html);
        $this->assertStringContainsString('environment-image="neutral"', $html);
        $this->assertStringContainsString('shadow-intensity="0.4"', $html);
        $this->assertStringContainsString('shadow-softness="0.25"', $html);
        $this->assertStringNotContainsString('data-light-brightness', $html, 'model-viewer uses exposure');
        $this->assertNotContains('/modules/ThreeDViewer/js/model-viewer-lighting.js', $view->headScript()->files);
        $this->assertNotContains(
            '/modules/ThreeDViewer/js/lighting-rig.js',
            $view->headScript()->files,
            'Nothing reads brightness from it'
        );
    }

    public function testModelViewerCustomEnvironmentIsEscapedAndGivesWayToARig(): void
    {
        $custom = [
            'threedviewer_model_viewer_environment' => 'custom',
            'threedviewer_model_viewer_environment_url' => 'https://example.org/a.hdr?x=1&y=2',
        ];
        [$html] = $this->render('model.glb', $custom);
        $this->assertStringContainsString('environment-image="https://example.org/a.hdr?x=1&amp;y=2"', $html);

        [$html, $view] = $this->render('model.glb', $custom + self::RIG);
        $this->assertStringNotContainsString('environment-image', $html, 'The rig is the environment');
        $this->assertContains('/modules/ThreeDViewer/js/model-viewer-lighting.js', $view->headScript()->files);
    }

    public function testStlAndBabylonGetBrightness(): void
    {
        foreach ($this->viewers() as $name => [$file, $library]) {
            if ($file === 'model.glb') {
                continue;
            }
            [$html, $view] = $this->render($file, [
                'threedviewer_default_library' => $library,
                'threedviewer_light_brightness' => 2,
            ]);
            $this->assertStringContainsString('data-light-brightness="2"', $html, $name);
            $this->assertContains('/modules/ThreeDViewer/js/lighting-rig.js', $view->headScript()->files, $name);
        }
    }
}
