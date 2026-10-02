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
}
