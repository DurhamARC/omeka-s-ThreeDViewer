<?php
declare(strict_types=1);

namespace ThreeDViewer\Form;

use Laminas\Form\Element;
use Laminas\Form\Form;

class ConfigForm extends Form
{
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
                'info' => 'Whether the lights stay fixed to the model, so the lit side turns with it as the '
                    . 'model is rotated, or to the viewer, so the model turns under fixed lights and every '
                    . 'side can be lit in turn.', // @translate
                'value_options' => [
                    'model' => 'Fixed to the model', // @translate
                    'viewer' => 'Fixed to the viewer', // @translate
                ],
            ],
        ]);

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
                'info' => 'Choose the default lighting rig for Babylon.js scenes.', // @translate
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
                'info' => 'Display the Babylon.js inspector toolbar for additional camera '
                    . 'and scene controls.', // @translate
                'use_hidden_element' => true,
                'checked_value' => '1',
                'unchecked_value' => '0',
            ],
            'attributes' => [
                'value' => '0',
            ],
        ]);
    }
}
