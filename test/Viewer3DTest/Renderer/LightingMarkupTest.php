<?php

declare(strict_types=1);

namespace Viewer3DTest\Renderer;

use PHPUnit\Framework\TestCase;
use Viewer3DTest\Doubles\DummyPhpRenderer;
use ThreeDViewer\Media\FileRenderer\Viewer3DRenderer;
use ThreeDViewer\Settings\Lighting;
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
    private function render(string $file, array $settings, ?array $siteSettings = null): array
    {
        $view = new DummyPhpRenderer();
        $view->setSettings($settings);
        $view->setSiteSettings($siteSettings);
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

    /**
     * @dataProvider viewers
     */
    public function testViewerFixedLightingLoadsTheSharedScript(string $file, string $library): void
    {
        [, $view] = $this->render($file, [
            'threedviewer_default_library' => $library,
            'threedviewer_lighting_mode' => 'viewer',
        ]);
        $this->assertContains('/modules/ThreeDViewer/js/lighting-rig.js', $view->headScript()->files);
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

    public function testSiteSettingsOverrideTheModuleOnTheSite(): void
    {
        $site = ['threedviewer_light_brightness' => '0.5', 'threedviewer_lighting_mode' => 'viewer'];

        [$html] = $this->render('mesh.stl', ['threedviewer_light_brightness' => 2], $site);
        $this->assertStringContainsString('data-light-brightness="0.5"', $html);
        $this->assertStringContainsString('data-lighting-mode="viewer"', $html);

        $empty = ['threedviewer_light_brightness' => ''];
        [$html] = $this->render('mesh.stl', ['threedviewer_light_brightness' => 2], $empty);
        $this->assertStringContainsString('data-light-brightness="2"', $html, 'Empty: the module setting');
    }

    public function testASiteCanReplaceOrDropTheModulesRig(): void
    {
        [$html] = $this->render('model.glb', self::RIG, ['threedviewer_lights' => 'default']);
        $this->assertStringNotContainsString('data-lights', $html);

        $own = ['threedviewer_lights' => 'custom', 'threedviewer_light_count' => 4];
        [$html] = $this->render('model.glb', self::RIG, $own);
        $this->assertSame(1, preg_match('/data-lights="([^"]*)"/', $html, $match));
        $rig = json_decode(html_entity_decode($match[1], ENT_QUOTES), true);
        $this->assertCount(4, $rig['lights']);
        $this->assertSame('#ffffff', $rig['ambient']['color'], 'The site rig does not take the module ambient colour');
    }

    /**
     * @dataProvider viewers
     */
    public function testControlsAreOffByDefault(string $file, string $library): void
    {
        [$html, $view] = $this->render($file, ['threedviewer_default_library' => $library]);
        $this->assertStringNotContainsString('threedviewer-lighting', $html);
        $this->assertStringNotContainsString('data-lighting-controls', $html);
        $this->assertNotContains('/modules/ThreeDViewer/js/lighting-controls.js', $view->headScript()->files);
        $this->assertNotContains('/modules/ThreeDViewer/css/lighting-controls.css', $view->headLink()->files);
    }

    /**
     * @dataProvider viewers
     */
    public function testControlsDriveTheirOwnViewer(string $file, string $library): void
    {
        [$html, $view] = $this->render($file, [
            'threedviewer_default_library' => $library,
            'threedviewer_lighting_controls' => true,
        ]);

        $this->assertSame(1, preg_match('/data-threedviewer-target="([^"]+)"/', $html, $match));
        $this->assertStringContainsString('id="' . $match[1] . '"', $html, 'The target exists');
        $this->assertSame(
            1,
            preg_match('/<[^>]*id="' . preg_quote($match[1], '/') . '"[^>]*data-lighting-controls="true"/', $html),
            'The viewer element knows it has controls'
        );
        $panel = 'threedviewer-lighting-' . $match[1];
        $this->assertStringContainsString('<div class="threedviewer-lighting" id="' . $panel . '" hidden', $html);
        $this->assertSame(
            1,
            preg_match('/<button type="button" class="threedviewer-lighting-toggle" hidden aria-expanded="false"'
                . ' aria-controls="' . preg_quote($panel, '/') . '" aria-label="Lighting"/', $html),
            'A button opens the panel, hidden until the viewer reports its lights'
        );
        $this->assertStringContainsString('data-name-light="Light %d"', $html);
        $this->assertStringContainsString('<template><div class="threedviewer-lighting-light" role="group">', $html);
        foreach (['color', 'groundColor', 'strength', 'azimuth', 'elevation'] as $property) {
            $this->assertStringContainsString('data-property="' . $property . '"', $html, $property);
        }
        $this->assertStringContainsString('value="viewer"><span>Fixed to the viewer</span>', $html);
        $this->assertStringContainsString('class="threedviewer-lighting-reset" aria-label="Reset"', $html);
        $this->assertStringContainsString('class="threedviewer-lighting-close" aria-label="Close"', $html);
        $this->assertStringContainsString('aria-label="Direction and height"', $html);
        $this->assertStringContainsString(
            'min="-90" max="90" step="1" data-property="elevation"',
            $html,
            'Height as seen from the camera, which can be below level'
        );
        $this->assertStringNotContainsString('<details class="threedviewer-lighting"', $html);

        $files = $view->headScript()->files;
        $this->assertContains('/modules/ThreeDViewer/js/lighting-controls.js', $files);
        $this->assertContains('/modules/ThreeDViewer/js/lighting-rig.js', $files);
        $this->assertContains('/modules/ThreeDViewer/css/lighting-controls.css', $view->headLink()->files);
    }

    /**
     * @dataProvider viewers
     */
    public function testControlsSlidersTakeTheirRangesFromLighting(string $file, string $library): void
    {
        [$html] = $this->render($file, [
            'threedviewer_default_library' => $library,
            'threedviewer_lighting_controls' => true,
        ]);
        foreach (['strength', 'azimuth', 'elevation'] as $property) {
            [$min, $max] = Lighting::range($property);
            $this->assertSame(
                1,
                preg_match('/<input type="range" min="([^"]*)" max="([^"]*)" step="([^"]*)" data-property="'
                    . $property . '"/', $html, $slider),
                $property
            );
            $this->assertSame(
                [(string) $min, (string) $max, (string) Lighting::step($property)],
                array_slice($slider, 1),
                $property
            );
        }
    }

    public function viewersWithIds(): array
    {
        return [
            'model-viewer' => ['model.glb', 'model-viewer'],
            'STL' => ['mesh.stl', 'model-viewer'],
            'Babylon.js' => ['model.gltf', 'babylon'],
        ];
    }

    /**
     * @dataProvider viewersWithIds
     */
    public function testTheSameMediaTwiceOnAPageGetsTwoIds(string $file, string $library): void
    {
        $view = new DummyPhpRenderer();
        $view->setSettings(['threedviewer_default_library' => $library, 'threedviewer_lighting_controls' => true]);
        $media = new MediaRepresentation('https://example.org/files/original/' . $file, 'Sample', $file);
        $html = (new Viewer3DRenderer())->render($view, $media, [])
            . (new Viewer3DRenderer())->render($view, $media, []);

        preg_match_all('/\sid="([^"]+)"/', $html, $ids);
        $this->assertSame(array_unique($ids[1]), $ids[1], 'No id is used twice');
        preg_match_all('/data-threedviewer-target="([^"]+)"/', $html, $targets);
        $this->assertCount(2, array_unique($targets[1]), 'Each panel drives its own viewer');
        foreach ($targets[1] as $target) {
            $this->assertContains($target, $ids[1]);
        }
        preg_match_all('/<input type="radio" name="([^"]+)" value="model"/', $html, $modes);
        $this->assertCount(2, array_unique($modes[1]), 'Each panel has its own mode switch');

        $other = new DummyPhpRenderer();
        $other->setSettings(['threedviewer_default_library' => $library, 'threedviewer_lighting_controls' => true]);
        $this->assertStringContainsString(
            'id="' . $targets[1][0] . '"',
            (new Viewer3DRenderer())->render($other, $media, []),
            'Another page starts again'
        );
    }

    public function testASiteShowsOrHidesTheControls(): void
    {
        [$html] = $this->render('model.glb', ['threedviewer_lighting_controls' => true], [
            'threedviewer_lighting_controls' => '0',
        ]);
        $this->assertStringNotContainsString('threedviewer-lighting', $html);

        [$html, $view] = $this->render('model.glb', [], ['threedviewer_lighting_controls' => '1']);
        $this->assertStringContainsString('id="threedviewer-model-1"', $html);
        $this->assertContains('/modules/ThreeDViewer/js/model-viewer-lighting.js', $view->headScript()->files);
    }

    public function testTheLightingButtonJoinsTheToolbarItsViewerHas(): void
    {
        [$html] = $this->render('model.glb', ['threedviewer_lighting_controls' => true]);
        $this->assertSame(
            1,
            preg_match('/<div class="threedviewer-control threedviewer-fullscreen">.*?<\/button>'
                . '<button type="button" class="threedviewer-lighting-toggle"[^>]*>.*?<\/button><\/div>/s', $html),
            'Beside the fullscreen button'
        );
        $this->assertStringNotContainsString('threedviewer-lighting-toolbar', $html);

        foreach ([['mesh.stl', 'model-viewer'], ['model.gltf', 'babylon']] as [$file, $library]) {
            [$html] = $this->render($file, [
                'threedviewer_default_library' => $library,
                'threedviewer_lighting_controls' => true,
            ]);
            $this->assertStringContainsString(
                '<div class="threedviewer-lighting-toolbar"><button type="button" class="threedviewer-lighting-toggle"',
                $html,
                $file
            );
        }
    }
}
