<?php
declare(strict_types=1);

namespace ThreeDViewer\Media\FileRenderer;

use Omeka\Api\Representation\MediaRepresentation;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Media\FileRenderer\RendererInterface;
use ThreeDViewer\Settings\Lighting;

abstract class Abstract3DRenderer implements RendererInterface
{
    /** The viewer controls' icons, drawn in a 24-unit square with the current text colour */
    private const ICONS = [
        'fullscreen' => '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
        'fullscreen-exit' => '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
        'help' => '<circle cx="12" cy="12" r="9"/>'
            . '<path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 17.1v.1"/>',
        'reset' => '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v5h5"/>',
        'close' => '<path d="M6 6l12 12M18 6L6 18"/>',
        'chevron' => '<path d="M9 6l6 6-6 6"/>',
        'sun' => '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4'
            . 'M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    ];

    /**
     * How often each media has been rendered on each page (view)
     *
     * @var \SplObjectStorage<PhpRenderer, array<string,int>>|null
     */
    private static $rendered;

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
     * The shared lighting script, which reads the light rig, brightness where the viewer takes it
     * from data-light-brightness, and keeps the lighting fixed to the viewer; and the lighting
     * controls where the page shows them.
     *
     * @param bool $brightnessInScript False where the viewer is given brightness some other way
     * @return bool Whether the page has the lighting script, for a viewer's own script that uses it
     */
    protected function appendLightingScripts(PhpRenderer $view, array $config, bool $brightnessInScript = true): bool
    {
        $brightness = $brightnessInScript && $config['lighting']['threedviewer_light_brightness'] != 1;
        $lighting = $config['rig'] !== null || $brightness || $config['lightingMode'] === 'viewer'
            || $config['lightingControls'];
        if ($lighting) {
            $view->headScript()->appendFile($view->assetUrl('js/lighting-rig.js', 'ThreeDViewer'));
        }
        if ($config['lightingControls']) {
            $view->headScript()->appendFile($view->assetUrl('js/lighting-controls.js', 'ThreeDViewer'));
            $view->headLink()->appendStylesheet($view->assetUrl('css/lighting-controls.css', 'ThreeDViewer'));
        }
        return $lighting;
    }

    /**
     * The button that opens a viewer's lighting controls, for the viewer's toolbar, or nothing
     * where the page does not show them. It stays hidden until the viewer reports its lights.
     *
     * @param string $target The id of the viewer element the controls drive
     */
    protected function renderLightingButton(PhpRenderer $view, array $config, string $target): string
    {
        if (!$config['lightingControls']) {
            return '';
        }
        $lighting = $view->escapeHtmlAttr($view->translate('Lighting'));
        return '<button type="button" class="threedviewer-lighting-toggle" hidden aria-expanded="false"'
            . ' aria-controls="' . $view->escapeHtmlAttr($this->lightingPanelId($target)) . '"'
            . ' aria-label="' . $lighting . '" title="' . $lighting . '">' . $this->icon('sun') . '</button>';
    }

    /**
     * The lighting controls for one viewer, or nothing where the page does not show them: a
     * toolbar with the button that opens them (unless the viewer puts the button in a toolbar of
     * its own), and the panel. The panel has a row per light, filled from the template once the
     * viewer reports its lights, each row opening onto the light's direction and height.
     *
     * @param string $target The id of the viewer element the controls drive
     * @param bool $toolbar Whether to add the button in a toolbar of its own
     */
    protected function renderLightingControls(
        PhpRenderer $view,
        array $config,
        string $target,
        bool $toolbar = true
    ): string {
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
        $more = [
            'groundColor' => 'Ground colour', // @translate
            'azimuth' => 'Direction', // @translate
            'elevation' => 'Height', // @translate
        ];
        // Height as seen from the camera now, which can be below level once the camera is above the lights
        $ranges = [];
        foreach (['strength', 'azimuth', 'elevation'] as $property) {
            $ranges[$property] = array_merge(Lighting::range($property), [Lighting::step($property)]);
        }
        $lighting = $view->escapeHtml($view->translate('Lighting'));
        $reset = $view->escapeHtmlAttr($view->translate('Reset'));
        $close = $view->escapeHtmlAttr($view->translate('Close'));
        $colour = $view->escapeHtmlAttr($view->translate('Colour'));
        $strength = $view->escapeHtmlAttr($view->translate('Strength'));
        $directionAndHeight = $view->escapeHtmlAttr($view->translate('Direction and height'));
        $fixedToModel = $view->escapeHtml($view->translate('Fixed to the model'));
        $fixedToViewer = $view->escapeHtml($view->translate('Fixed to the viewer'));
        $range = function (string $property, string $label = '') use ($ranges): string {
            [$min, $max, $step] = $ranges[$property];
            return '<input type="range" min="' . $min . '" max="' . $max . '" step="' . $step . '"'
                . ' data-property="' . $property . '"' . $label . '><output></output>';
        };
        $panel = $view->escapeHtmlAttr($this->lightingPanelId($target));
        $mode = $view->escapeHtmlAttr('threedviewer-lighting-mode-' . $target);

        $html = $toolbar
            ? '<div class="threedviewer-lighting-toolbar">'
                . $this->renderLightingButton($view, $config, $target) . '</div>'
            : '';
        $html .= '<div class="threedviewer-lighting" id="' . $panel . '" hidden role="group"'
            . ' aria-labelledby="' . $panel . '-title"'
            . ' data-threedviewer-target="' . $view->escapeHtmlAttr($target) . '"';
        foreach ($names as $kind => $name) {
            $html .= ' data-name-' . $kind . '="' . $view->escapeHtmlAttr($view->translate($name)) . '"';
        }
        $html .= '><div class="threedviewer-lighting-head">'
            . '<span class="threedviewer-lighting-title" id="' . $panel . '-title">' . $lighting . '</span>'
            . '<button type="button" class="threedviewer-lighting-reset" aria-label="' . $reset . '"'
            . ' title="' . $reset . '">' . $this->icon('reset') . '</button>'
            . '<button type="button" class="threedviewer-lighting-close" aria-label="' . $close . '"'
            . ' title="' . $close . '">' . $this->icon('close') . '</button>'
            . '</div>'
            . '<fieldset class="threedviewer-lighting-mode"><legend>' . $lighting . '</legend>'
            . '<label><input type="radio" name="' . $mode . '" value="model"><span>'
            . $fixedToModel . '</span></label>'
            . '<label><input type="radio" name="' . $mode . '" value="viewer"><span>'
            . $fixedToViewer . '</span></label>'
            . '</fieldset>'
            . '<div class="threedviewer-lighting-lights"></div>'
            . '<template><div class="threedviewer-lighting-light" role="group">'
            . '<div class="threedviewer-lighting-row">'
            . '<input type="color" data-property="color" aria-label="' . $colour . '">'
            . '<span class="threedviewer-lighting-name"></span>'
            . $range('strength', ' aria-label="' . $strength . '"')
            . '<button type="button" class="threedviewer-lighting-more" aria-expanded="false"'
            . ' aria-label="' . $directionAndHeight . '"'
            . ' title="' . $directionAndHeight . '">' . $this->icon('chevron') . '</button>'
            . '</div><div class="threedviewer-lighting-details" hidden>';
        foreach ($more as $property => $label) {
            $html .= '<label class="threedviewer-lighting-control"><span>'
                . $view->escapeHtml($view->translate($label)) . '</span>'
                . ($property === 'groundColor' ? '<input type="color" data-property="groundColor">' : $range($property))
                . '</label>';
        }
        return $html . '</div></div></template></div>';
    }

    /**
     * The id of a viewer's lighting panel.
     */
    private function lightingPanelId(string $target): string
    {
        return 'threedviewer-lighting-' . $target;
    }

    /**
     * An icon for a viewer control. It is decoration: the control carries the label.
     */
    protected function icon(string $name, string $class = ''): string
    {
        return '<svg class="threedviewer-icon' . ($class === '' ? '' : ' ' . $class) . '" aria-hidden="true"'
            . ' focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
            . ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' . self::ICONS[$name] . '</svg>';
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
