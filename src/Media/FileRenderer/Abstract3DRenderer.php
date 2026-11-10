<?php
declare(strict_types=1);

namespace ThreeDViewer\Media\FileRenderer;

use Omeka\Api\Representation\MediaRepresentation;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Media\FileRenderer\RendererInterface;
use ThreeDViewer\Settings\Lighting;

abstract class Abstract3DRenderer implements RendererInterface
{
    /**
     * The chosen STL up axis as an attribute, or nothing where each viewer keeps its own (the
     * default) or the media is not an STL file, whichever renderer shows it.
     */
    protected function renderStlUpAxis(PhpRenderer $view, array $config, MediaRepresentation $media): string
    {
        if ($config['stlUpAxis'] === 'current') {
            return '';
        }
        if (strtolower(pathinfo($media->filename(), PATHINFO_EXTENSION)) !== 'stl') {
            return '';
        }
        return ' data-stl-up-axis="' . $view->escapeHtmlAttr($config['stlUpAxis']) . '"';
    }

    /**
     * Get configuration from global and site settings.
     */
    protected function getViewerConfig(PhpRenderer $view): array
    {
        $defaults = Lighting::defaults();
        $default = [
            'height' => $defaults['threedviewer_viewer_height'],
            'autoRotate' => $defaults['threedviewer_auto_rotate'],
            'foregroundColor' => $defaults['threedviewer_foreground_color'],
            'backgroundColor' => $defaults['threedviewer_background_color'],
            'showGrid' => $defaults['threedviewer_show_grid'],
            'defaultLibrary' => $defaults['threedviewer_default_library'],
            'babylonCamera' => $defaults['threedviewer_babylon_camera'],
            'babylonEnableXR' => $defaults['threedviewer_babylon_enable_xr'],
            'babylonShowToolbar' => $defaults['threedviewer_babylon_show_toolbar'],
            'stlUpAxis' => $defaults['threedviewer_stl_up_axis'],
        ];
        $lighting = [];

        try {
            $setting = $view->plugin('setting');
            $default['height'] = $setting('threedviewer_viewer_height', $default['height']);
            $default['autoRotate'] = $setting('threedviewer_auto_rotate', $default['autoRotate']);
            $default['foregroundColor'] = $setting('threedviewer_foreground_color', $default['foregroundColor']);
            $default['backgroundColor'] = $setting('threedviewer_background_color', $default['backgroundColor']);
            $default['showGrid'] = $setting('threedviewer_show_grid', $default['showGrid']);
            $stlUpAxis = $setting('threedviewer_stl_up_axis');
            if (in_array($stlUpAxis, ['y', 'z'], true)) {
                $default['stlUpAxis'] = $stlUpAxis;
            }
            $default['defaultLibrary'] = $setting('threedviewer_default_library', $default['defaultLibrary']);
            $default['babylonCamera'] = $setting('threedviewer_babylon_camera', $default['babylonCamera']);
            $default['babylonEnableXR'] = (bool) $setting(
                'threedviewer_babylon_enable_xr',
                $default['babylonEnableXR']
            );
            $default['babylonShowToolbar'] = (bool) $setting(
                'threedviewer_babylon_show_toolbar',
                $default['babylonShowToolbar']
            );
            $lighting = Lighting::resolve($setting);
        } catch (\Throwable $e) {
            error_log('Error getting settings: ' . $e->getMessage());
        }

        $lighting = $lighting ?: Lighting::normalise([]);
        $default['lighting'] = $lighting;
        $default['lightingMode'] = $lighting['threedviewer_lighting_mode'];
        $default['babylonLighting'] = $lighting['threedviewer_babylon_lighting'];
        $default['babylonEnvironment'] = $lighting['threedviewer_babylon_environment'];
        $default['rig'] = Lighting::rig($lighting);

        return $default;
    }

    /**
     * Data attributes carrying brightness and the light rig, each only when it differs from the
     * default, so a viewer with untouched settings gets exactly the markup it always had.
     */
    protected function renderLightingAttributes(PhpRenderer $view, array $config, bool $withBrightness = true): string
    {
        $html = '';
        $brightness = $config['lighting']['threedviewer_light_brightness'];
        if ($withBrightness && $brightness != 1) {
            $html .= ' data-light-brightness="' . $this->formatNumber($brightness) . '"';
        }
        if ($config['rig'] !== null) {
            $html .= ' data-lights="' . $view->escapeHtmlAttr((string) json_encode($config['rig'])) . '"';
        }
        return $html;
    }

    /**
     * The shared lighting script, which reads the light rig, and brightness where the viewer takes
     * it from data-light-brightness.
     *
     * @param bool $brightnessInScript False where the viewer is given brightness some other way
     * @return bool Whether the page has the lighting script, for a viewer's own script that uses it
     */
    protected function appendLightingScripts(PhpRenderer $view, array $config, bool $brightnessInScript = true): bool
    {
        $brightness = $brightnessInScript && $config['lighting']['threedviewer_light_brightness'] != 1;
        $lighting = $config['rig'] !== null || $brightness;
        if ($lighting) {
            $view->headScript()->appendFile($view->assetUrl('js/lighting-rig.js', 'ThreeDViewer'));
        }
        return $lighting;
    }

    /**
     * A number for an attribute: at most two decimals, no trailing zeros.
     *
     * @param int|float $number
     */
    protected function formatNumber($number): string
    {
        return rtrim(rtrim(number_format((float) $number, 2, '.', ''), '0'), '.');
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
