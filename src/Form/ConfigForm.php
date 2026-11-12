<?php
declare(strict_types=1);

namespace ThreeDViewer\Form;

use Laminas\Form\Element;
use Laminas\Form\Form;
use ThreeDViewer\Settings\Lighting;

class ConfigForm extends Form
{
    /**
     * Groups of settings, each shown in its own fieldset (Omeka's element groups, which keep the
     * elements' names). The general settings come first, in no group, as they always have.
     */
    public const ELEMENT_GROUPS = [
        'threedviewer_lighting' => 'Lighting for every viewer', // @translate
        'threedviewer_custom_lights' => 'Custom lights', // @translate
        'threedviewer_light_1' => 'Custom light 1', // @translate
        'threedviewer_light_2' => 'Custom light 2', // @translate
        'threedviewer_light_3' => 'Custom light 3', // @translate
        'threedviewer_light_4' => 'Custom light 4', // @translate
        'threedviewer_model_viewer' => 'model-viewer (GLB and glTF)', // @translate
        'threedviewer_babylon' => 'Babylon.js', // @translate
    ];

    /**
     * Initialize the form elements.
     */
    public function init(): void
    {

        $this->add([
            'name' => 'threedviewer_default_library',
            'type' => Element\Select::class,
            'options' => [
                'label' => '3D viewer library', // @translate
                'info' => 'Select which renderer to use for STL/GLB media.', // @translate
                'value_options' => [
                    'model-viewer' => 'Three.js & model-viewer (original)', // @translate
                    'babylon' => 'Babylon.js (experimental)', // @translate
                ],
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_viewer_height',
            'type' => Element\Number::class,
            'options' => [
                'label' => 'Viewer Height (px)', // @translate
                'info' => 'Default height for the 3D viewer in pixels.', // @translate
            ],
            'attributes' => [
                'required' => false,
                'min' => 100,
                'max' => 1200,
                'value' => 500,
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_auto_rotate',
            'type' => Element\Checkbox::class,
            'options' => [
                'label' => 'Auto-rotate models', // @translate
                'info' => 'Enable auto-rotation for 3D models.', // @translate
                'use_hidden_element' => true,
                'checked_value' => '1',
                'unchecked_value' => '0',
            ],
            'attributes' => [
                'value' => '0',
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_foreground_color',
            'type' => Element\Color::class,
            'options' => [
                'label' => 'Foreground Color', // @translate
                'info' => 'Choose the foreground color for 3D viewers.', // @translate
            ],
            'attributes' => [
                'required' => false,
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_background_color',
            'type' => Element\Color::class,
            'options' => [
                'label' => 'Background Color', // @translate
                'info' => 'Choose the background color for 3D viewers.', // @translate
            ],
            'attributes' => [
                'required' => false,
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_show_grid',
            'type' => Element\Checkbox::class,
            'options' => [
                'label' => 'Show Grid', // @translate
                'info' => 'Display a green grid to help with size perception.', // @translate
                'use_hidden_element' => true,
                'checked_value' => '1',
                'unchecked_value' => '0',
            ],
            'attributes' => [
                'value' => '0',
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_stl_up_axis',
            'type' => Element\Select::class,
            'options' => [
                'label' => 'STL up axis', // @translate
                'info' => 'Show STL models the same way up in both libraries. GLB is not affected.', // @translate
                'value_options' => [
                    'current' => 'Keep current behaviour (Three.js: Y up, Babylon.js: Z up)', // @translate
                    'y' => 'Y up', // @translate
                    'z' => 'Z up (3D printing convention)', // @translate
                ],
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_lighting_mode',
            'type' => Element\Select::class,
            'options' => [
                'label' => 'Lighting', // @translate
                'info' => 'Fixed to the viewer keeps the lights in place as you turn the model.', // @translate
                'value_options' => [
                    'model' => 'Fixed to the model', // @translate
                    'viewer' => 'Fixed to the viewer', // @translate
                ],
            ],
        ]);

        $this->addLightingElements();

        $this->add([
            'name' => 'threedviewer_babylon_camera',
            'type' => Element\Select::class,
            'options' => [
                'label' => 'Babylon.js camera type', // @translate
                'info' => 'Select the default camera when using the Babylon.js renderer.', // @translate
                'value_options' => [
                    'arcRotate' => 'Arc rotate (orbit)', // @translate
                    'universal' => 'Universal (free look)', // @translate
                    'firstPerson' => 'First-person', // @translate
                ],
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_babylon_lighting',
            'type' => Element\Select::class,
            'options' => [
                'label' => 'Babylon.js lighting preset', // @translate
                'info' => 'Choose the Babylon.js lighting used when Lights is Viewer default.', // @translate
                'value_options' => [
                    'hemispheric' => 'Hemispheric', // @translate
                    'directional' => 'Directional', // @translate
                    'point' => 'Point light', // @translate
                    'environment' => 'Environment light', // @translate
                ],
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_babylon_environment',
            'type' => Element\Select::class,
            'options' => [
                'label' => 'Babylon.js environment', // @translate
                'info' => 'Add an optional environment/ground when using Babylon.js.', // @translate
                'value_options' => [
                    'none' => 'None', // @translate
                    'default' => 'Default environment', // @translate
                    'studio' => 'Studio with ground shadow', // @translate
                ],
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_babylon_enable_xr',
            'type' => Element\Checkbox::class,
            'options' => [
                'label' => 'Enable WebXR (VR/AR) when available', // @translate
                'info' => 'Attempt to initialise Babylon.js WebXR experience where supported.', // @translate
                'use_hidden_element' => true,
                'checked_value' => '1',
                'unchecked_value' => '0',
            ],
            'attributes' => [
                'value' => '0',
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_babylon_show_toolbar',
            'type' => Element\Checkbox::class,
            'options' => [
                'label' => 'Show Babylon.js toolbar', // @translate
                'info' => 'Show the Babylon.js inspector toolbar with extra camera and scene controls.', // @translate
                'use_hidden_element' => true,
                'checked_value' => '1',
                'unchecked_value' => '0',
            ],
            'attributes' => [
                'value' => '0',
            ],
        ]);

        $this->addConditions();
        $this->addGroups();
    }

    /**
     * Put each setting but the general ones in its group.
     */
    private function addGroups(): void
    {
        $groups = [
            'threedviewer_lighting' => [
                'threedviewer_lighting_mode',
                'threedviewer_light_brightness',
                'threedviewer_lighting_controls',
                'threedviewer_lights',
            ],
            'threedviewer_custom_lights' => [
                'threedviewer_light_ambient_color',
                'threedviewer_light_ambient_strength',
                'threedviewer_light_count',
            ],
            'threedviewer_model_viewer' => [
                'threedviewer_model_viewer_environment',
                'threedviewer_model_viewer_environment_url',
                'threedviewer_model_viewer_shadow_intensity',
                'threedviewer_model_viewer_shadow_softness',
            ],
            'threedviewer_babylon' => [
                'threedviewer_babylon_camera',
                'threedviewer_babylon_lighting',
                'threedviewer_babylon_environment',
                'threedviewer_babylon_enable_xr',
                'threedviewer_babylon_show_toolbar',
            ],
        ];
        for ($n = 1; $n <= Lighting::MAX_LIGHTS; $n++) {
            foreach (['color', 'strength', 'azimuth', 'elevation'] as $property) {
                $groups["threedviewer_light_{$n}"][] = "threedviewer_light_{$n}_{$property}";
            }
        }
        foreach ($groups as $group => $names) {
            foreach ($names as $name) {
                $this->get($name)->setOption('element_group', $group);
            }
        }
        $this->setOption('element_groups', self::ELEMENT_GROUPS);
    }

    /**
     * Brightness, the visitor's controls, the light rig and model-viewer's own lighting, after the
     * Lighting select: the settings for every viewer first, then the rig, then one library's.
     */
    private function addLightingElements(): void
    {
        $this->add([
            'name' => 'threedviewer_light_brightness',
            'type' => Element\Number::class,
            'options' => [
                'label' => 'Brightness', // @translate
                'info' => 'Multiplies the strength of every light. 1 leaves the lighting as it is.', // @translate
            ],
            'attributes' => ['min' => 0, 'max' => 3, 'step' => 0.05],
        ]);

        $this->add([
            'name' => 'threedviewer_lighting_controls',
            'type' => Element\Checkbox::class,
            'options' => [
                'label' => 'Show lighting controls on viewers', // @translate
                'info' => 'Lets visitors change each light, until they reload the page.', // @translate
                'use_hidden_element' => true,
                'checked_value' => '1',
                'unchecked_value' => '0',
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_lights',
            'type' => Element\Select::class,
            'options' => [
                'label' => 'Lights', // @translate
                'info' => 'Custom builds the lights below in every viewer, in place of their own.', // @translate
                'value_options' => [
                    'default' => 'Viewer default', // @translate
                    'custom' => 'Custom', // @translate
                ],
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_light_ambient_color',
            'type' => Element\Color::class,
            'options' => [
                'label' => 'Ambient light colour', // @translate
                'info' => 'Light from every side. Used only when Lights is Custom.', // @translate
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_light_ambient_strength',
            'type' => Element\Number::class,
            'options' => [
                'label' => 'Ambient light strength', // @translate
            ],
            'attributes' => ['min' => 0, 'max' => 3, 'step' => 0.05],
        ]);

        $this->add([
            'name' => 'threedviewer_light_count',
            'type' => Element\Select::class,
            'options' => [
                'label' => 'Number of lights', // @translate
                'info' => 'Lights above this number keep their settings but are not used.', // @translate
                'value_options' => array_combine(
                    range(1, Lighting::MAX_LIGHTS),
                    array_map('strval', range(1, Lighting::MAX_LIGHTS))
                ),
            ],
        ]);

        for ($n = 1; $n <= Lighting::MAX_LIGHTS; $n++) {
            $this->addLightElements($n);
        }

        $this->add([
            'name' => 'threedviewer_model_viewer_environment',
            'type' => Element\Select::class,
            'options' => [
                'label' => 'model-viewer environment', // @translate
                'info' => 'The image that lights GLB/glTF models when Lights is Viewer default.', // @translate
                'value_options' => [
                    'default' => 'model-viewer default', // @translate
                    'neutral' => 'Neutral', // @translate
                    'legacy' => 'Legacy', // @translate
                    'custom' => 'Custom image', // @translate
                ],
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_model_viewer_environment_url',
            'type' => Element\Text::class,
            'options' => [
                'label' => 'Custom environment image', // @translate
                'info' => 'URL of an HDR, JPEG or PNG image, from http(s):// or the site root (/).', // @translate
            ],
        ]);

        $this->add([
            'name' => 'threedviewer_model_viewer_shadow_intensity',
            'type' => Element\Number::class,
            'options' => [
                'label' => 'model-viewer shadow strength', // @translate
                'info' => 'The shadow under GLB/glTF models. 0 shows none.', // @translate
            ],
            'attributes' => ['min' => 0, 'max' => 1, 'step' => 0.05],
        ]);

        $this->add([
            'name' => 'threedviewer_model_viewer_shadow_softness',
            'type' => Element\Number::class,
            'options' => [
                'label' => 'model-viewer shadow softness', // @translate
            ],
            'attributes' => ['min' => 0, 'max' => 1, 'step' => 0.05],
        ]);
    }

    /**
     * Colour, strength and direction of one light of the rig. Its group's legend names the light.
     */
    private function addLightElements(int $n): void
    {
        $colour = 'Colour'; // @translate
        $strength = 'Strength'; // @translate
        $azimuth = 'Direction (degrees round)'; // @translate
        $elevation = 'Height (degrees)'; // @translate

        $this->add([
            'name' => "threedviewer_light_{$n}_color",
            'type' => Element\Color::class,
            'options' => ['label' => $colour],
        ]);

        $this->add([
            'name' => "threedviewer_light_{$n}_strength",
            'type' => Element\Number::class,
            'options' => ['label' => $strength],
            'attributes' => ['min' => 0, 'max' => 3, 'step' => 0.05],
        ]);

        $this->add([
            'name' => "threedviewer_light_{$n}_azimuth",
            'type' => Element\Number::class,
            'options' => [
                'label' => $azimuth,
                'info' => '0 is from the viewer’s side of the model, 90 from the right, 180 from behind.', // @translate
            ],
            'attributes' => ['min' => -180, 'max' => 180, 'step' => 1],
        ]);

        $this->add([
            'name' => "threedviewer_light_{$n}_elevation",
            'type' => Element\Number::class,
            'options' => [
                'label' => $elevation,
                'info' => '0 is level with the model, 90 is overhead, -90 is from below.', // @translate
            ],
            'attributes' => ['min' => -90, 'max' => 90, 'step' => 1],
        ]);
    }

    /**
     * Show each lighting setting only where it applies, following AdvancedSearch's data-show-if
     * (SearchConfigConfigureForm, advanced-search-collection.js): a field whose element names
     * another element in data-show-if is shown only while that element's value is one of
     * data-show-if-value (a JSON list) or at least data-show-if-min, and that element's own field is
     * shown. A field whose element has data-show-if-library (a JSON list) is shown only while the
     * 3D viewer library is one of them: the library select's value here, and on a site, which has no
     * library of its own, the module's library in the element's data-library. Both conditions may
     * apply. asset/js/settings-form.js applies them; without JavaScript every field shows. Hidden
     * fields are still submitted, so their values are kept.
     */
    private function addConditions(): void
    {
        $rig = ['data-show-if' => 'threedviewer_lights', 'data-show-if-value' => '["custom"]'];
        // A site's blank Lights keeps the module's lights, which may be either
        $ownLights = ['data-show-if' => 'threedviewer_lights', 'data-show-if-value' => '["","default"]'];

        $conditions = [
            'threedviewer_light_ambient_color' => $rig,
            'threedviewer_light_ambient_strength' => $rig,
            'threedviewer_light_count' => $rig,
            'threedviewer_model_viewer_environment' => $ownLights,
            'threedviewer_model_viewer_environment_url' => [
                'data-show-if' => 'threedviewer_model_viewer_environment',
                'data-show-if-value' => '["custom"]',
            ],
            'threedviewer_babylon_lighting' => $ownLights,
        ];
        for ($n = 1; $n <= Lighting::MAX_LIGHTS; $n++) {
            foreach (['color', 'strength', 'azimuth', 'elevation'] as $property) {
                $conditions["threedviewer_light_{$n}_{$property}"] = [
                    'data-show-if' => 'threedviewer_light_count',
                    'data-show-if-min' => (string) $n,
                ];
            }
        }
        foreach ($conditions as $name => $attributes) {
            $this->get($name)->setAttributes($attributes);
        }

        // Settings of one library only, shown while it is the 3D viewer library
        $libraries = [
            'model-viewer' => [
                'threedviewer_model_viewer_environment',
                'threedviewer_model_viewer_environment_url',
                'threedviewer_model_viewer_shadow_intensity',
                'threedviewer_model_viewer_shadow_softness',
            ],
            'babylon' => [
                'threedviewer_babylon_camera',
                'threedviewer_babylon_lighting',
                'threedviewer_babylon_environment',
                'threedviewer_babylon_enable_xr',
                'threedviewer_babylon_show_toolbar',
            ],
        ];
        foreach ($libraries as $library => $names) {
            foreach ($names as $name) {
                $this->get($name)->setAttribute('data-show-if-library', json_encode([$library]));
            }
        }
    }
}
