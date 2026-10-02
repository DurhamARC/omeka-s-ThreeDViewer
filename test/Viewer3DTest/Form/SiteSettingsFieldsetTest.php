<?php

declare(strict_types=1);

namespace Viewer3DTest\Form;

use Laminas\Form\Element;
use PHPUnit\Framework\TestCase;
use ThreeDViewer\Form\SiteSettingsFieldset;
use ThreeDViewer\Settings\Lighting;

class SiteSettingsFieldsetTest extends TestCase
{
    private SiteSettingsFieldset $fieldset;

    protected function setUp(): void
    {
        $this->fieldset = new SiteSettingsFieldset();
        $this->fieldset->init();
    }

    public function testHasEveryLightingSettingAndNothingElse(): void
    {
        $this->assertSame(Lighting::keys(), array_keys($this->fieldset->getElements()));
    }

    public function testEverySelectFirstOffersTheModulesSetting(): void
    {
        foreach ($this->fieldset->getElements() as $name => $element) {
            if (!$element instanceof Element\Select) {
                continue;
            }
            $options = $element->getValueOptions();
            $this->assertSame('', array_key_first($options), $name);
        }
        $this->assertSame(
            ['' => 'Use the module’s lights', 'default' => 'Viewer default', 'custom' => 'Custom'],
            $this->fieldset->get('threedviewer_lights')->getValueOptions()
        );
        $this->assertSame(
            ['', 'model', 'viewer'],
            array_keys($this->fieldset->get('threedviewer_lighting_mode')->getValueOptions())
        );
    }

    public function testSitesShowOrHideTheControlsOrKeepTheModulesChoice(): void
    {
        $element = $this->fieldset->get('threedviewer_lighting_controls');
        $this->assertInstanceOf(Element\Select::class, $element);
        $this->assertSame(['', '1', '0'], array_map('strval', array_keys($element->getValueOptions())));
    }
}
