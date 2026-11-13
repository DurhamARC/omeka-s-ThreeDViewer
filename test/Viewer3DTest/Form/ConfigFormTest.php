<?php declare(strict_types=1);

namespace Viewer3DTest\Form;

use PHPUnit\Framework\TestCase;
use ThreeDViewer\Form\ConfigForm;
use ThreeDViewer\Settings\Lighting;
use Laminas\Form\Element;
use Laminas\Form\Form;

class ConfigFormTest extends TestCase
{
    private $form;
    
    public function setUp(): void
    {
        $this->form = new ConfigForm();
    }
    
    public function testFormCanBeInstantiated(): void
    {
        $this->assertInstanceOf(ConfigForm::class, $this->form);
        $this->assertInstanceOf(Form::class, $this->form);
    }

    public function testLightingElementsFollowTheLightingSelect(): void
    {
        $this->form->init();
        $names = array_keys($this->form->getElements());
        $mode = array_search('threedviewer_lighting_mode', $names, true);
        $this->assertSame(
            [
                'threedviewer_light_brightness',
                'threedviewer_lighting_controls',
                'threedviewer_lights',
                'threedviewer_light_ambient_color',
            ],
            array_slice($names, $mode + 1, 4)
        );
        foreach (['color', 'strength', 'azimuth', 'elevation'] as $property) {
            $this->assertTrue($this->form->has("threedviewer_light_4_{$property}"), $property);
        }
        $this->assertSame('Colour', $this->form->get('threedviewer_light_4_color')->getLabel(), 'Its group names it');
        $elevation = $this->form->get('threedviewer_light_4_elevation');
        $range = [$elevation->getAttribute('min'), $elevation->getAttribute('max')];
        $this->assertSame([-90, 90], $range, 'Below level too');
        $this->assertSame(
            ['default', 'custom'],
            array_keys($this->form->get('threedviewer_lights')->getValueOptions())
        );
        $this->assertSame([1, 2, 3, 4], array_keys($this->form->get('threedviewer_light_count')->getValueOptions()));
        $this->assertSame(
            ['default', 'neutral', 'legacy', 'custom'],
            array_keys($this->form->get('threedviewer_model_viewer_environment')->getValueOptions())
        );
    }

    public function testEachLightingNumberFieldTakesItsRangeAndStepFromLighting(): void
    {
        $this->form->init();
        $checked = 0;
        foreach (Lighting::keys() as $key) {
            $element = $this->form->get($key);
            if (!$element instanceof Element\Number) {
                continue;
            }
            $this->assertSame(
                array_merge(Lighting::range($key), [Lighting::step($key)]),
                [$element->getAttribute('min'), $element->getAttribute('max'), $element->getAttribute('step')],
                $key
            );
            $checked++;
        }
        $this->assertSame(4 + 3 * Lighting::MAX_LIGHTS, $checked);
    }

    public function testControlsAreACheckboxBeforeTheLightRig(): void
    {
        $this->form->init();
        $element = $this->form->get('threedviewer_lighting_controls');
        $this->assertInstanceOf(Element\Checkbox::class, $element);
        $names = array_keys($this->form->getElements());
        $this->assertSame(
            array_search('threedviewer_lights', $names, true) - 1,
            array_search('threedviewer_lighting_controls', $names, true)
        );
    }

    public function testSettingsRunFromGeneralToLightingToEachLibrary(): void
    {
        $this->form->init();
        $names = array_keys($this->form->getElements());
        $order = [
            'threedviewer_default_library',
            'threedviewer_show_grid',
            'threedviewer_stl_up_axis',
            'threedviewer_lighting_mode',
            'threedviewer_light_4_elevation',
            'threedviewer_model_viewer_environment',
            'threedviewer_model_viewer_shadow_softness',
            'threedviewer_babylon_camera',
            'threedviewer_babylon_show_toolbar',
        ];
        $positions = array_map(function (string $name) use ($names) {
            return array_search($name, $names, true);
        }, $order);
        $sorted = $positions;
        sort($sorted);
        $this->assertSame($sorted, $positions);
        $this->assertSame(array_search('threedviewer_show_grid', $names, true) + 1, $positions[2]);
        $this->assertSame($positions[2] + 1, $positions[3], 'Lighting follows the general settings');
    }

    public function testEachLightingSettingShowsOnlyWhereItApplies(): void
    {
        $this->form->init();
        $condition = function (string $name): array {
            $element = $this->form->get($name);
            return array_values(array_filter([
                $element->getAttribute('data-show-if'),
                $element->getAttribute('data-show-if-value'),
                $element->getAttribute('data-show-if-min'),
            ]));
        };
        $this->assertSame([], $condition('threedviewer_light_brightness'), 'Brightness always applies');
        $this->assertSame([], $condition('threedviewer_lights'));
        $this->assertSame(['threedviewer_lights', '["custom"]'], $condition('threedviewer_light_ambient_color'));
        $this->assertSame(['threedviewer_lights', '["custom"]'], $condition('threedviewer_light_count'));
        $this->assertSame(['threedviewer_light_count', '3'], $condition('threedviewer_light_3_strength'));
        $this->assertSame(['threedviewer_light_count', '1'], $condition('threedviewer_light_1_color'));
        $this->assertSame(
            ['threedviewer_lights', '["","default"]'],
            $condition('threedviewer_model_viewer_environment')
        );
        $this->assertSame(['threedviewer_lights', '["","default"]'], $condition('threedviewer_babylon_lighting'));
        $this->assertSame(
            ['threedviewer_model_viewer_environment', '["custom"]'],
            $condition('threedviewer_model_viewer_environment_url')
        );
    }

    public function testEachLibrarysSettingsShowOnlyForThatLibrary(): void
    {
        $this->form->init();
        $library = function (string $name) {
            return $this->form->get($name)->getAttribute('data-show-if-library');
        };
        foreach (['environment', 'environment_url', 'shadow_intensity', 'shadow_softness'] as $setting) {
            $this->assertSame('["model-viewer"]', $library("threedviewer_model_viewer_{$setting}"), $setting);
        }
        foreach (['camera', 'lighting', 'environment', 'enable_xr', 'show_toolbar'] as $setting) {
            $this->assertSame('["babylon"]', $library("threedviewer_babylon_{$setting}"), $setting);
        }
        foreach (['threedviewer_default_library', 'threedviewer_light_brightness', 'threedviewer_lights',
            'threedviewer_light_1_color', 'threedviewer_lighting_controls', 'threedviewer_stl_up_axis'] as $name) {
            $this->assertNull($library($name), "{$name} applies to both libraries");
        }
        $this->assertSame(
            ['threedviewer_lights', '["","default"]'],
            [
                $this->form->get('threedviewer_babylon_lighting')->getAttribute('data-show-if'),
                $this->form->get('threedviewer_babylon_lighting')->getAttribute('data-show-if-value'),
            ],
            'Both conditions apply'
        );
    }

    public function testSettingsAfterTheGeneralOnesAreGroupedInOrder(): void
    {
        $this->form->init();
        $this->assertSame(ConfigForm::ELEMENT_GROUPS, $this->form->getOption('element_groups'));
        $groups = array_keys(ConfigForm::ELEMENT_GROUPS);
        $last = -1;
        $seen = [];
        foreach ($this->form->getElements() as $name => $element) {
            $group = $element->getOption('element_group');
            if ($group === null) {
                $this->assertSame([], $seen, "{$name}: the general settings come first, in no group");
                continue;
            }
            $position = array_search($group, $groups, true);
            $this->assertNotFalse($position, $name);
            $this->assertGreaterThanOrEqual($last, $position, "{$name}: the groups follow the form's order");
            $last = $position;
            $seen[$group] = true;
        }
        $this->assertCount(count($groups), $seen, 'Every group has settings');
        $this->assertNull($this->form->get('threedviewer_stl_up_axis')->getOption('element_group'));
        $this->assertSame(
            'threedviewer_lighting',
            $this->form->get('threedviewer_lighting_controls')->getOption('element_group')
        );
        $this->assertSame(
            'threedviewer_light_3',
            $this->form->get('threedviewer_light_3_elevation')->getOption('element_group')
        );
    }
}
