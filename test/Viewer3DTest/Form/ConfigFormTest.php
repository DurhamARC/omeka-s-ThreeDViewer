<?php declare(strict_types=1);

namespace Viewer3DTest\Form;

use PHPUnit\Framework\TestCase;
use ThreeDViewer\Form\ConfigForm;
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
            ['threedviewer_light_brightness', 'threedviewer_lights', 'threedviewer_light_ambient_color'],
            array_slice($names, $mode + 1, 3)
        );
        foreach (['color', 'strength', 'azimuth', 'elevation'] as $property) {
            $this->assertTrue($this->form->has("threedviewer_light_4_{$property}"), $property);
        }
        $this->assertSame('Light 4 colour', $this->form->get('threedviewer_light_4_color')->getLabel());
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

    public function testControlsAreACheckboxAfterTheLightingSettings(): void
    {
        $this->form->init();
        $element = $this->form->get('threedviewer_lighting_controls');
        $this->assertInstanceOf(Element\Checkbox::class, $element);
        $names = array_keys($this->form->getElements());
        $this->assertSame(
            array_search('threedviewer_model_viewer_shadow_softness', $names, true) + 1,
            array_search('threedviewer_lighting_controls', $names, true)
        );
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
}
