<?php
declare(strict_types=1);

namespace ThreeDViewer;

return [
    'view_manager' => [
        'template_path_stack' => [
            dirname(__DIR__) . '/view',
        ],
    ],
    'form_elements' => [
        'invokables' => [
            Form\ConfigForm::class => Form\ConfigForm::class,
            Form\SiteSettingsFieldset::class => Form\SiteSettingsFieldset::class,
        ],
    ],

    'assets' => [
        'use_externals' => false,
        'externals' => [
            'ThreeDViewer' => [
                'vendor/model-viewer/model-viewer.min.js' =>
                    'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js',
                'vendor/three/three.min.js' =>
                    'https://cdn.jsdelivr.net/npm/three@0.120.1/build/three.min.js',
                'vendor/three/STLLoader.js' =>
                    'https://cdn.jsdelivr.net/npm/three@0.120.1/examples/js/loaders/STLLoader.js',
                'vendor/three/OrbitControls.js' =>
                    'https://cdn.jsdelivr.net/npm/three@0.120.1/examples/js/controls/OrbitControls.js',
            ],
        ],
    ],

    'file_renderers' => [
        'invokables' => [
            'stl_renderer' => Media\FileRenderer\StlRenderer::class,
            'glb_renderer' => Media\FileRenderer\GlbRenderer::class,
            'viewer3d_renderer' => Media\FileRenderer\Viewer3DRenderer::class,
            'babylon_renderer' => Media\FileRenderer\BabylonRenderer::class,
        ],
        'aliases' => [
            'model/stl' => 'viewer3d_renderer',
            'model/gltf-binary' => 'viewer3d_renderer',
            'model/gltf+json' => 'viewer3d_renderer',
            'application/octet-stream' => 'viewer3d_renderer',
            'binary/octet-stream' => 'viewer3d_renderer',
            'application/x-binary' => 'viewer3d_renderer',
            // These aliases map MIME types and common identifiers to the appropriate renderer.
            // The alias for 'text/plain' allows rendering of 3D files that are correctly named
            // (e.g. .stl or .glb) but incorrectly labeled with a generic MIME type.
            // The renderer will rely on the file extension in these cases.
            'text/plain' => 'viewer3d_renderer',
            'stl' => 'viewer3d_renderer',
            'glb' => 'viewer3d_renderer',
            'gltf' => 'viewer3d_renderer',
        ],
    ],
    'translator' => [
        'translation_file_patterns' => [
            [
                'type' => 'gettext',
                'base_dir' => dirname(__DIR__) . '/language',
                'pattern' => '%s.mo',
                'text_domain' => null,
            ],
        ],
    ],
    'threedviewer' => [
        'settings' => [
            'threedviewer_default_library' => 'model-viewer',
            'threedviewer_viewer_height' => 500,
            'threedviewer_auto_rotate' => true,
            'threedviewer_foreground_color' => '#0000FF',
            'threedviewer_background_color' => '#b5b5b5',
            'threedviewer_show_grid' => false,
            'threedviewer_lighting_mode' => 'model',
            'threedviewer_stl_up_axis' => 'current',
            'threedviewer_light_brightness' => 1,
            // 'default' keeps each viewer's own lights; 'custom' builds the rig below in every viewer
            'threedviewer_lights' => 'default',
            'threedviewer_light_ambient_color' => '#ffffff',
            'threedviewer_light_ambient_strength' => 0.6,
            'threedviewer_light_count' => 1,
            // Light 1 with the ambient light is the STL viewer's lighting; 2-4 are fill, back and side lights
            'threedviewer_light_1_color' => '#ffffff',
            'threedviewer_light_1_strength' => 0.8,
            'threedviewer_light_1_azimuth' => 0,
            'threedviewer_light_1_elevation' => 45,
            'threedviewer_light_2_color' => '#ffffff',
            'threedviewer_light_2_strength' => 0.4,
            'threedviewer_light_2_azimuth' => 60,
            'threedviewer_light_2_elevation' => 20,
            'threedviewer_light_3_color' => '#ffffff',
            'threedviewer_light_3_strength' => 0.3,
            'threedviewer_light_3_azimuth' => 180,
            'threedviewer_light_3_elevation' => 30,
            'threedviewer_light_4_color' => '#ffffff',
            'threedviewer_light_4_strength' => 0.3,
            'threedviewer_light_4_azimuth' => -90,
            'threedviewer_light_4_elevation' => 10,
            'threedviewer_model_viewer_environment' => 'default',
            'threedviewer_model_viewer_environment_url' => '',
            'threedviewer_model_viewer_shadow_intensity' => 0,
            'threedviewer_model_viewer_shadow_softness' => 1,
            'threedviewer_babylon_camera' => 'arcRotate',
            'threedviewer_babylon_lighting' => 'hemispheric',
            'threedviewer_babylon_environment' => 'none',
            'threedviewer_babylon_enable_xr' => false,
            'threedviewer_babylon_show_toolbar' => false,
        ]
    ],
];
