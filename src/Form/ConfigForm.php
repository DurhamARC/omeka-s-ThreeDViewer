<?php
declare(strict_types=1);

namespace ThreeDViewer\Form;

use Laminas\Form\Element;
use Laminas\Form\Form;
use ThreeDViewer\Settings\Lighting;

class ConfigForm extends Form
{
    /** Labels of each light's elements, written out so that each one can be translated */
    private const LIGHT_LABELS = [
        1 => [
            'Light 1 colour', // @translate
            'Light 1 strength', // @translate
            'Light 1 direction (degrees round)', // @translate
            'Light 1 height (degrees up)', // @translate
        ],
        2 => [
            'Light 2 colour', // @translate
            'Light 2 strength', // @translate
            'Light 2 direction (degrees round)', // @translate
            'Light 2 height (degrees up)', // @translate
        ],
        3 => [
            'Light 3 colour', // @translate
            'Light 3 strength', // @translate
            'Light 3 direction (degrees round)', // @translate
            'Light 3 height (degrees up)', // @translate
        ],
        4 => [
            'Light 4 colour', // @translate
            'Light 4 strength', // @translate
            'Light 4 direction (degrees round)', // @translate
            'Light 4 height (degrees up)', // @translate
        ],
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
    }

    /**
     * Brightness, the light rig and model-viewer's own lighting, after the Lighting select.
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
     * Colour, strength and direction of one light of the rig.
     */
    private function addLightElements(int $n): void
    {
        [$colour, $strength, $azimuth, $elevation] = self::LIGHT_LABELS[$n];

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
                'info' => '0 is level with the model, 90 is overhead.', // @translate
            ],
            'attributes' => ['min' => 0, 'max' => 90, 'step' => 1],
        ]);
    }
}
