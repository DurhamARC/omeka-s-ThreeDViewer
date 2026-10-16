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
     * How often each media has been rendered on each page (view)
     *
     * @var \SplObjectStorage<PhpRenderer, array<string,int>>|null
     */
    private static $rendered;

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
        ];
        $lighting = [];

        try {
            $setting = $view->plugin('setting');
            $default['height'] = $setting('threedviewer_viewer_height', $default['height']);
            $default['autoRotate'] = $setting('threedviewer_auto_rotate', $default['autoRotate']);
            $default['foregroundColor'] = $setting('threedviewer_foreground_color', $default['foregroundColor']);
            $default['backgroundColor'] = $setting('threedviewer_background_color', $default['backgroundColor']);
            $default['showGrid'] = $setting('threedviewer_show_grid', $default['showGrid']);
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
            $lighting = Lighting::resolve($setting, $this->siteSettingReader($view));
        } catch (\Throwable $e) {
            error_log('Error getting settings: ' . $e->getMessage());
        }

        $lighting = $lighting ?: Lighting::normalise([]);
        $default['lighting'] = $lighting;
        $default['lightingMode'] = $lighting['threedviewer_lighting_mode'];
        $default['babylonLighting'] = $lighting['threedviewer_babylon_lighting'];
        $default['babylonEnvironment'] = $lighting['threedviewer_babylon_environment'];
        $default['rig'] = Lighting::rig($lighting);
        $default['lightingControls'] = $lighting['threedviewer_lighting_controls'];

        return $default;
    }

    /**
     * Reads the current site's settings, or null where there is no current site (admin pages),
     * where Omeka's siteSetting helper cannot be used.
     */
    protected function siteSettingReader(PhpRenderer $view): ?callable
    {
        try {
            $currentSite = $view->plugin('currentSite');
            if (!is_callable($currentSite) || !$currentSite()) {
                return null;
            }
            $siteSetting = $view->plugin('siteSetting');
            return is_callable($siteSetting) ? $siteSetting : null;
        } catch (\Throwable $e) {
            return null;
        }
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
        if ($config['lightingControls']) {
            $html .= ' data-lighting-controls="true"';
        }
        return $html;
    }

    /**
     * The shared lighting script, which reads the light rig, and brightness where the viewer takes
     * it from data-light-brightness; and the lighting controls where the page shows them.
     *
     * @param bool $brightnessInScript False where the viewer is given brightness some other way
     */
    protected function appendLightingScripts(PhpRenderer $view, array $config, bool $brightnessInScript = true): void
    {
        $brightness = $brightnessInScript && $config['lighting']['threedviewer_light_brightness'] != 1;
        if ($config['rig'] !== null || $brightness || $config['lightingControls']) {
            $view->headScript()->appendFile($view->assetUrl('js/lighting-rig.js', 'ThreeDViewer'));
        }
        if ($config['lightingControls']) {
            $view->headScript()->appendFile($view->assetUrl('js/lighting-controls.js', 'ThreeDViewer'));
            $view->headLink()->appendStylesheet($view->assetUrl('css/lighting-controls.css', 'ThreeDViewer'));
        }
    }

    /**
     * The lighting controls for one viewer, or nothing where the page does not show them. The
     * panel stays hidden until the viewer reports its lights, which fill it from the template.
     *
     * @param string $target The id of the viewer element the controls drive
     */
    protected function renderLightingControls(PhpRenderer $view, array $config, string $target): string
    {
        if (!$config['lightingControls']) {
            return '';
        }
        // Translated where they are written out, so that each one is extracted for translation
        $names = [
            'ambient' => 'Ambient light', // @translate
            'light' => 'Light %d', // @translate
            'key' => 'Key light', // @translate
            'sky' => 'Sky light', // @translate
            'point' => 'Point light', // @translate
            'environment' => 'Environment', // @translate
        ];
        $labels = [
            'color' => 'Colour', // @translate
            'groundColor' => 'Ground colour', // @translate
            'strength' => 'Strength', // @translate
            'azimuth' => 'Direction', // @translate
            'elevation' => 'Height', // @translate
        ];
        $ranges = ['strength' => [0, 3, 0.05], 'azimuth' => [-180, 180, 1], 'elevation' => [0, 90, 1]];
        $lighting = $view->escapeHtml($view->translate('Lighting'));
        $mode = $view->escapeHtmlAttr('threedviewer-lighting-mode-' . $target);

        $html = '<details class="threedviewer-lighting" hidden'
            . ' data-threedviewer-target="' . $view->escapeHtmlAttr($target) . '"';
        foreach ($names as $kind => $name) {
            $html .= ' data-name-' . $kind . '="' . $view->escapeHtmlAttr($view->translate($name)) . '"';
        }
        $html .= '><summary aria-label="' . $lighting . '" title="' . $lighting . '">☀</summary>'
            . '<div class="threedviewer-lighting-panel">'
            . '<div class="threedviewer-lighting-lights"></div>'
            . '<fieldset class="threedviewer-lighting-mode"><legend>' . $lighting . '</legend>'
            . '<label><input type="radio" name="' . $mode . '" value="model"> '
            . $view->escapeHtml($view->translate('Fixed to the model')) . '</label>'
            . '<label><input type="radio" name="' . $mode . '" value="viewer"> '
            . $view->escapeHtml($view->translate('Fixed to the viewer')) . '</label>'
            . '</fieldset>'
            . '<button type="button" class="threedviewer-lighting-reset">'
            . $view->escapeHtml($view->translate('Reset')) . '</button>'
            . '<template><fieldset class="threedviewer-lighting-light"><legend></legend>';
        foreach ($labels as $property => $label) {
            $html .= '<label class="threedviewer-lighting-control"><span>'
                . $view->escapeHtml($view->translate($label)) . '</span>';
            if (isset($ranges[$property])) {
                [$min, $max, $step] = $ranges[$property];
                $html .= '<input type="range" min="' . $min . '" max="' . $max . '" step="' . $step . '"'
                    . ' data-property="' . $property . '"><output></output>';
            } else {
                $html .= '<input type="color" data-property="' . $property . '">';
            }
            $html .= '</label>';
        }
        return $html . '</fieldset></template></div></details>';
    }

    /**
     * A suffix that keeps a viewer's element ids unique on the page: nothing the first time a
     * media is rendered, then -2, -3 and so on, for a page that shows the same media twice.
     */
    protected function idSuffix(PhpRenderer $view, MediaRepresentation $media): string
    {
        if (self::$rendered === null) {
            self::$rendered = new \SplObjectStorage();
        }
        $counts = self::$rendered->contains($view) ? self::$rendered[$view] : [];
        $key = (string) $media->id();
        $counts[$key] = ($counts[$key] ?? 0) + 1;
        self::$rendered[$view] = $counts;
        return $counts[$key] > 1 ? '-' . $counts[$key] : '';
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
