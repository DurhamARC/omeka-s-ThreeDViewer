<?php
declare(strict_types=1);

namespace ThreeDViewer\Media\FileRenderer;

use Omeka\Api\Representation\MediaRepresentation;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Media\FileRenderer\RendererInterface;

abstract class Abstract3DRenderer implements RendererInterface
{
    /**
     * Get configuration from global and site settings.
     */
    protected function getViewerConfig(PhpRenderer $view): array
    {
        $default = [
            'height' => 500,
            'autoRotate' => true,
            'foregroundColor' => '#0000FF',
            'backgroundColor' => '#b5b5b5',
            'showGrid' => false,
            'lightingMode' => 'model',
            'defaultLibrary' => 'model-viewer',
            'babylonCamera' => 'arcRotate',
            'babylonLighting' => 'hemispheric',
            'babylonEnvironment' => 'none',
            'babylonEnableXR' => false,
            'babylonShowToolbar' => false,
        ];

        try {
            $setting = $view->plugin('setting');
            $default['height'] = $setting('threedviewer_viewer_height', $default['height']);
            $default['autoRotate'] = $setting('threedviewer_auto_rotate', $default['autoRotate']);
            $default['foregroundColor'] = $setting('threedviewer_foreground_color', $default['foregroundColor']);
            $default['backgroundColor'] = $setting('threedviewer_background_color', $default['backgroundColor']);
            $default['showGrid'] = $setting('threedviewer_show_grid', $default['showGrid']);
            $lightingMode = $setting('threedviewer_lighting_mode', $default['lightingMode']);
            if (in_array($lightingMode, ['model', 'viewer'], true)) {
                $default['lightingMode'] = $lightingMode;
            }
            $default['defaultLibrary'] = $setting('threedviewer_default_library', $default['defaultLibrary']);
            $default['babylonCamera'] = $setting('threedviewer_babylon_camera', $default['babylonCamera']);
            $default['babylonLighting'] = $setting('threedviewer_babylon_lighting', $default['babylonLighting']);
            $default['babylonEnvironment'] = $setting(
                'threedviewer_babylon_environment',
                $default['babylonEnvironment']
            );
            $default['babylonEnableXR'] = (bool) $setting(
                'threedviewer_babylon_enable_xr',
                $default['babylonEnableXR']
            );
            $default['babylonShowToolbar'] = (bool) $setting(
                'threedviewer_babylon_show_toolbar',
                $default['babylonShowToolbar']
            );
        } catch (\Throwable $e) {
            error_log('Error getting settings: ' . $e->getMessage());
        }

        return $default;
    }

    /**
     * Render shared info panel and optional grid style.
     */
    protected function renderInfoPanel(PhpRenderer $view, string $title, bool $showGrid): string
    {
        $view->headStyle()->appendStyle('
            .model-info, #info {
                position: absolute;
                top: 10px;
                width: 100%;
                text-align: center;
                color: white;
                z-index: 100;
                pointer-events: none;
            }
            .grid-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-image: 
                    linear-gradient(to right, rgba(0, 255, 0, 0.2) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(0, 255, 0, 0.2) 1px, transparent 1px);
                background-size: 20px 20px;
                pointer-events: none;
                z-index: 1;
            }
        ');

        $infoText = '<div class="model-info">' . $view->translate($title)
                  . ' - ' . $view->translate('Use mouse to rotate, zoom and pan') . '</div>';

        if ($showGrid) {
            $infoText .= '<div class="grid-overlay"></div>';
        }

        return $infoText;
    }
}
