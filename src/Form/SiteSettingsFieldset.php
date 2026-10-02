<?php
declare(strict_types=1);

namespace ThreeDViewer\Form;

use Laminas\Form\Element;
use Laminas\Form\Fieldset;
use ThreeDViewer\Settings\Lighting;

/**
 * The lighting settings a site can override: the module's own elements, each select given a
 * first option that keeps the module's setting.
 *
 * Omeka saves each top-level element of the site settings form as its own site setting, so
 * Module::addSiteSettings() adds these elements to that form one by one, not as a fieldset.
 */
class SiteSettingsFieldset extends Fieldset
{
    public function init(): void
    {
        $module = new ConfigForm();
        $module->init();

        foreach (Lighting::keys() as $name) {
            $element = clone $module->get($name);
            if ($element instanceof Element\Select) {
                $inherit = $name === 'threedviewer_lights'
                    ? 'Use the module’s lights' // @translate
                    : 'Use the module setting'; // @translate
                $element->setValueOptions(['' => $inherit] + $element->getValueOptions());
            }
            $this->add($element);
        }

        // A site shows or hides the controls whatever the module says, or keeps the module's choice
        $this->remove('threedviewer_lighting_controls');
        $this->add([
            'name' => 'threedviewer_lighting_controls',
            'type' => Element\Select::class,
            'options' => [
                'label' => 'Show lighting controls on viewers', // @translate
                'value_options' => [
                    '' => 'Use the module setting', // @translate
                    '1' => 'Show', // @translate
                    '0' => 'Hide', // @translate
                ],
            ],
        ]);

        $this->get('threedviewer_lights')->setOption(
            'info',
            'Custom lights below replace the module’s whole light rig on this site.' // @translate
        );
    }
}
