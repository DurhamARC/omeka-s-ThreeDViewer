<?php

declare(strict_types=1);

namespace Viewer3DTest\Settings;

use PHPUnit\Framework\TestCase;
use ThreeDViewer\Settings\Lighting;

class LightingTest extends TestCase
{
    public function testDefaultsComeFromModuleConfig(): void
    {
        $config = include dirname(__DIR__, 3) . '/config/module.config.php';
        $this->assertSame($config['threedviewer']['settings'], Lighting::defaults());
        foreach (Lighting::keys() as $key) {
            $this->assertArrayHasKey($key, Lighting::defaults(), $key);
        }
    }

    public function testDefaultsLeaveEveryViewerWithItsOwnLights(): void
    {
        $clean = Lighting::normalise([]);
        $this->assertSame('model', $clean['threedviewer_lighting_mode']);
        $this->assertSame(1.0, $clean['threedviewer_light_brightness']);
        $this->assertSame('default', $clean['threedviewer_lights']);
        $this->assertSame('default', $clean['threedviewer_model_viewer_environment']);
        $this->assertSame(0.0, $clean['threedviewer_model_viewer_shadow_intensity']);
        $this->assertSame(1.0, $clean['threedviewer_model_viewer_shadow_softness']);
        $this->assertSame('hemispheric', $clean['threedviewer_babylon_lighting']);
        $this->assertSame('none', $clean['threedviewer_babylon_environment']);
        $this->assertNull(Lighting::rig($clean));
    }

    public function testNumbersAreClampedAndRounded(): void
    {
        $clean = Lighting::normalise([
            'threedviewer_light_brightness' => '7',
            'threedviewer_light_ambient_strength' => '-1',
            'threedviewer_light_count' => '9',
            'threedviewer_light_1_strength' => '1.234',
            'threedviewer_light_1_azimuth' => '-200',
            'threedviewer_light_1_elevation' => '44.6',
            'threedviewer_light_2_azimuth' => 'east',
            'threedviewer_model_viewer_shadow_intensity' => '2',
        ]);
        $this->assertSame(3.0, $clean['threedviewer_light_brightness']);
        $this->assertSame(0.0, $clean['threedviewer_light_ambient_strength']);
        $this->assertSame(Lighting::MAX_LIGHTS, $clean['threedviewer_light_count']);
        $this->assertSame(1.23, $clean['threedviewer_light_1_strength']);
        $this->assertSame(-180, $clean['threedviewer_light_1_azimuth']);
        $this->assertSame(45, $clean['threedviewer_light_1_elevation']);
        $this->assertSame(60, $clean['threedviewer_light_2_azimuth'], 'Not a number: the default');
        $this->assertSame(1.0, $clean['threedviewer_model_viewer_shadow_intensity']);
    }

    /**
     * @dataProvider selectValues
     */
    public function testSelectsTakeOnlyKnownValues(string $key, $submitted, $expected): void
    {
        $this->assertSame($expected, Lighting::normalise([$key => $submitted])[$key]);
    }

    public function selectValues(): array
    {
        return [
            'viewer mode' => ['threedviewer_lighting_mode', 'viewer', 'viewer'],
            'unknown mode' => ['threedviewer_lighting_mode', '<script>', 'model'],
            'custom lights' => ['threedviewer_lights', 'custom', 'custom'],
            'unknown lights' => ['threedviewer_lights', 'all', 'default'],
            'neutral environment' => ['threedviewer_model_viewer_environment', 'neutral', 'neutral'],
            'unknown environment' => ['threedviewer_model_viewer_environment', 'studio', 'default'],
            'babylon point' => ['threedviewer_babylon_lighting', 'point', 'point'],
            'unknown babylon lighting' => ['threedviewer_babylon_lighting', 'spot', 'hemispheric'],
            'babylon studio' => ['threedviewer_babylon_environment', 'studio', 'studio'],
            'unknown babylon environment' => ['threedviewer_babylon_environment', 'sky', 'none'],
        ];
    }

    public function testColoursMustBeHexAndAreLowercased(): void
    {
        $clean = Lighting::normalise([
            'threedviewer_light_ambient_color' => '#ABCDEF',
            'threedviewer_light_1_color' => 'red',
            'threedviewer_light_2_color' => '#12345',
        ]);
        $this->assertSame('#abcdef', $clean['threedviewer_light_ambient_color']);
        $this->assertSame('#ffffff', $clean['threedviewer_light_1_color']);
        $this->assertSame('#ffffff', $clean['threedviewer_light_2_color']);
    }

    /**
     * @dataProvider environmentUrls
     */
    public function testCustomEnvironmentNeedsASafeUrl(string $url, string $environment, string $kept): void
    {
        $clean = Lighting::normalise([
            'threedviewer_model_viewer_environment' => 'custom',
            'threedviewer_model_viewer_environment_url' => $url,
        ]);
        $this->assertSame($environment, $clean['threedviewer_model_viewer_environment']);
        $this->assertSame($kept, $clean['threedviewer_model_viewer_environment_url']);
    }

    public function environmentUrls(): array
    {
        return [
            'https' => ['https://example.org/studio.hdr', 'custom', 'https://example.org/studio.hdr'],
            'root-relative, trimmed' => [' /files/studio.hdr ', 'custom', '/files/studio.hdr'],
            'protocol-relative' => ['//example.org/studio.hdr', 'default', ''],
            'javascript' => ['javascript:alert(1)', 'default', ''],
            'breaks out of the attribute' => ['/a.hdr" onload="alert(1)', 'default', ''],
            'empty' => ['', 'default', ''],
        ];
    }

    public function testRigHasTheAmbientLightAndLightsUpToTheCount(): void
    {
        $rig = Lighting::rig(Lighting::normalise([
            'threedviewer_lights' => 'custom',
            'threedviewer_light_count' => '2',
            'threedviewer_light_2_color' => '#FF0000',
        ]));
        $this->assertSame(['color' => '#ffffff', 'strength' => 0.6], $rig['ambient']);
        $this->assertSame([
            ['color' => '#ffffff', 'strength' => 0.8, 'azimuth' => 0, 'elevation' => 45],
            ['color' => '#ff0000', 'strength' => 0.4, 'azimuth' => 60, 'elevation' => 20],
        ], $rig['lights']);
    }
}
