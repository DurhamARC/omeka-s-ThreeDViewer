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
            'threedviewer_light_2_strength' => '0.33',
            'threedviewer_light_3_strength' => '0.32',
            'threedviewer_model_viewer_shadow_softness' => '0.876',
            'threedviewer_light_1_azimuth' => '-200',
            'threedviewer_light_1_elevation' => '44.6',
            'threedviewer_light_2_elevation' => '-30',
            'threedviewer_light_3_elevation' => '-95',
            'threedviewer_light_2_azimuth' => 'east',
            'threedviewer_model_viewer_shadow_intensity' => '2',
        ]);
        $this->assertSame(3.0, $clean['threedviewer_light_brightness']);
        $this->assertSame(0.0, $clean['threedviewer_light_ambient_strength']);
        $this->assertSame(Lighting::MAX_LIGHTS, $clean['threedviewer_light_count']);
        // To the fields' step of 0.05, or a browser would refuse to submit the form
        $this->assertSame(1.25, $clean['threedviewer_light_1_strength']);
        $this->assertSame(0.35, $clean['threedviewer_light_2_strength']);
        $this->assertSame(0.3, $clean['threedviewer_light_3_strength']);
        $this->assertSame(0.9, $clean['threedviewer_model_viewer_shadow_softness']);
        $this->assertSame(-180, $clean['threedviewer_light_1_azimuth']);
        $this->assertSame(45, $clean['threedviewer_light_1_elevation']);
        $this->assertSame(-30, $clean['threedviewer_light_2_elevation'], 'A light from below');
        $this->assertSame(-90, $clean['threedviewer_light_3_elevation']);
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

    private static function reader(array $values): callable
    {
        return function (string $key) use ($values) {
            return $values[$key] ?? null;
        };
    }

    public function testWithoutASiteTheModuleSettingsApply(): void
    {
        $module = self::reader(['threedviewer_light_brightness' => 2, 'threedviewer_lights' => 'custom']);
        $resolved = Lighting::resolve($module);
        $this->assertSame(2.0, $resolved['threedviewer_light_brightness']);
        $this->assertSame('custom', $resolved['threedviewer_lights']);
    }

    public function testNonEmptySiteSettingsOverrideTheModuleOneByOne(): void
    {
        $module = self::reader([
            'threedviewer_light_brightness' => 2,
            'threedviewer_lighting_mode' => 'viewer',
            'threedviewer_babylon_lighting' => 'point',
        ]);
        $site = self::reader([
            'threedviewer_light_brightness' => '0.5',
            'threedviewer_lighting_mode' => '',
            'threedviewer_babylon_lighting' => null,
            'threedviewer_model_viewer_environment' => 'legacy',
        ]);
        $resolved = Lighting::resolve($module, $site);
        $this->assertSame(0.5, $resolved['threedviewer_light_brightness']);
        $this->assertSame('viewer', $resolved['threedviewer_lighting_mode'], 'Empty keeps the module setting');
        $this->assertSame('point', $resolved['threedviewer_babylon_lighting'], 'Unset keeps the module setting');
        $this->assertSame('legacy', $resolved['threedviewer_model_viewer_environment']);
    }

    public function testASiteUsesTheModulesRigUnlessItChoosesItsOwnLights(): void
    {
        $module = self::reader([
            'threedviewer_lights' => 'custom',
            'threedviewer_light_count' => 3,
            'threedviewer_light_1_color' => '#ff0000',
        ]);
        // Rig fields saved with the site's form are ignored while the site keeps the module's lights
        $site = self::reader(['threedviewer_lights' => '', 'threedviewer_light_count' => 1]);
        $inherit = Lighting::resolve($module, $site);
        $this->assertSame(3, $inherit['threedviewer_light_count']);
        $this->assertSame('#ff0000', $inherit['threedviewer_light_1_color']);

        $own = Lighting::resolve($module, self::reader(['threedviewer_lights' => 'default']));
        $this->assertNull(Lighting::rig($own), 'A site can return to each viewer\'s own lights');
    }

    public function testASitesOwnRigNeverMixesWithTheModules(): void
    {
        $module = self::reader([
            'threedviewer_lights' => 'custom',
            'threedviewer_light_count' => 3,
            'threedviewer_light_1_color' => '#ff0000',
            'threedviewer_light_2_strength' => 2,
        ]);
        $site = self::reader([
            'threedviewer_lights' => 'custom',
            'threedviewer_light_count' => '2',
            'threedviewer_light_1_color' => '#00ff00',
        ]);
        $rig = Lighting::rig(Lighting::resolve($module, $site));
        $this->assertCount(2, $rig['lights']);
        $this->assertSame('#00ff00', $rig['lights'][0]['color']);
        $this->assertSame(0.4, $rig['lights'][1]['strength'], 'A blank site field takes the default, not the module');
    }

    public function testRangeGivesEachNumbersMinAndMaxFromItsKeyOrTheNameOfItsRange(): void
    {
        $this->assertSame([0, 3], Lighting::range('threedviewer_light_brightness'));
        $this->assertSame([0, 3], Lighting::range('threedviewer_light_ambient_strength'));
        $this->assertSame([1, Lighting::MAX_LIGHTS], Lighting::range('threedviewer_light_count'));
        $this->assertSame([-180, 180], Lighting::range('threedviewer_light_2_azimuth'));
        $this->assertSame([-90, 90], Lighting::range('threedviewer_light_4_elevation'));
        $this->assertSame([0, 1], Lighting::range('threedviewer_model_viewer_shadow_intensity'));
        $this->assertSame([0, 1], Lighting::range('threedviewer_model_viewer_shadow_softness'));
        $this->assertSame([0, 3], Lighting::range('strength'), 'The name of a range');
        $this->assertSame([-90, 90], Lighting::range('elevation'), 'The name of a range');
    }

    public function testStepIsOneForWholeNumbersAndAFifthOfATenthOtherwise(): void
    {
        $this->assertSame(1, Lighting::step('threedviewer_light_count'));
        $this->assertSame(1, Lighting::step('threedviewer_light_3_azimuth'));
        $this->assertSame(1, Lighting::step('elevation'));
        $this->assertSame(0.05, Lighting::step('threedviewer_light_brightness'));
        $this->assertSame(0.05, Lighting::step('threedviewer_light_1_strength'));
        $this->assertSame(0.05, Lighting::step('threedviewer_model_viewer_shadow_softness'));
        $this->assertSame(0.05, Lighting::step('strength'));
    }

    public function testRangeIsTheOneNormaliseClampsTo(): void
    {
        $numbers = [
            'threedviewer_light_brightness',
            'threedviewer_light_ambient_strength',
            'threedviewer_light_count',
            'threedviewer_model_viewer_shadow_intensity',
            'threedviewer_model_viewer_shadow_softness',
        ];
        for ($n = 1; $n <= Lighting::MAX_LIGHTS; $n++) {
            foreach (['strength', 'azimuth', 'elevation'] as $property) {
                $numbers[] = "threedviewer_light_{$n}_{$property}";
            }
        }
        $ranged = array_values(array_filter(Lighting::keys(), function (string $key): bool {
            try {
                Lighting::range($key);
                return true;
            } catch (\InvalidArgumentException $e) {
                return false;
            }
        }));
        sort($numbers);
        sort($ranged);
        $this->assertSame($numbers, $ranged, 'Every lighting number has a range, and nothing else');

        foreach ($numbers as $key) {
            [$min, $max] = Lighting::range($key);
            // Whole numbers come back as integers, the others as floats
            $type = is_int(Lighting::step($key)) ? 'intval' : 'floatval';
            $this->assertSame($type($min), Lighting::normalise([$key => $min - 100])[$key], $key);
            $this->assertSame($type($max), Lighting::normalise([$key => $max + 100])[$key], $key);
        }
    }

    /**
     * @dataProvider notANumber
     */
    public function testRangeRejectsANameThatIsNotALightingNumber(string $name): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Lighting::range($name);
    }

    /**
     * @dataProvider notANumber
     */
    public function testStepRejectsANameThatIsNotALightingNumber(string $name): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Lighting::step($name);
    }

    public function notANumber(): array
    {
        return [
            'a colour' => ['threedviewer_light_1_color'],
            'a select' => ['threedviewer_lighting_mode'],
            'unknown' => ['height'],
            'empty' => [''],
            'ends like a range' => ['discount'],
            'ends like a range, not a lighting key' => ['threedviewer_babylon_shadow_intensity'],
            'a light beyond the last' => ['threedviewer_light_' . (Lighting::MAX_LIGHTS + 1) . '_elevation'],
            'part of a key' => ['light_1_elevation'],
        ];
    }

    public function testRigKeysAreTheAmbientLightTheCountAndEachLight(): void
    {
        $keys = Lighting::rigKeys();
        $this->assertCount(3 + 4 * Lighting::MAX_LIGHTS, $keys);
        $this->assertContains('threedviewer_light_count', $keys);
        $this->assertContains('threedviewer_light_4_elevation', $keys);
        $this->assertNotContains('threedviewer_light_brightness', $keys);
        $this->assertNotContains('threedviewer_lights', $keys);
    }

    public function testControlsAreOffUnlessTurnedOnAndASiteMayOverrideEitherWay(): void
    {
        $key = 'threedviewer_lighting_controls';
        $this->assertFalse(Lighting::normalise([])[$key]);
        $this->assertTrue(Lighting::normalise([$key => '1'])[$key]);
        $this->assertTrue(Lighting::normalise([$key => true])[$key]);
        $this->assertFalse(Lighting::normalise([$key => '0'])[$key]);
        $this->assertFalse(Lighting::normalise([$key => 'yes'])[$key]);

        $on = self::reader([$key => true]);
        $off = self::reader([$key => false]);
        $this->assertTrue(Lighting::resolve($on, self::reader([$key => '']))[$key], 'Blank: the module setting');
        $this->assertFalse(Lighting::resolve($on, self::reader([$key => '0']))[$key], 'A site can hide them');
        $this->assertTrue(Lighting::resolve($off, self::reader([$key => '1']))[$key], 'A site can show them');
    }
}
