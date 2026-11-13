<?php
declare(strict_types=1);

namespace ThreeDViewer\Media\FileRenderer;

use Omeka\Media\FileRenderer\RendererInterface;

use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\MediaRepresentation;

class GlbRenderer extends Abstract3DRenderer implements RendererInterface
{
    public function render(PhpRenderer $view, MediaRepresentation $media, array $options = []): string
    {
        $config = $this->getViewerConfig($view);

        $view->headLink()->appendStylesheet($view->assetUrl('css/model-viewer-controls.css', 'ThreeDViewer'));
        $view->headScript()->appendFile(
            $view->assetUrl('vendor/model-viewer/model-viewer.min.js', 'ThreeDViewer'),
            'module'
        );
        $view->headScript()->appendFile($view->assetUrl('js/viewer-controls.js', 'ThreeDViewer'));
        // Brightness is model-viewer's exposure attribute, which needs no script
        if ($this->appendLightingScripts($view, $config, false)) {
            $view->headScript()->appendFile($view->assetUrl('js/model-viewer-lighting.js', 'ThreeDViewer'));
        }

        $rawUrl = $media->originalUrl();
        $protocolRelativeUrl = preg_replace('/^https?:/', '', $rawUrl);
        $background = $view->escapeHtmlAttr($config['backgroundColor']);
        $autoRotate = $config['autoRotate'] ? 'auto-rotate ' : '';
        $modelViewerSrc = $view->escapeHtmlAttr($protocolRelativeUrl);
        $altText = $view->escapeHtmlAttr($media->displayTitle());
        $enterFullscreen = $view->escapeHtmlAttr($view->translate('View 3D model fullscreen'));
        $exitFullscreen = $view->escapeHtmlAttr($view->translate('Exit fullscreen 3D model'));
        $helpLabel = $view->escapeHtmlAttr($view->translate('3D viewer controls'));
        $helpText = $view->escapeHtml($view->translate('Use mouse to rotate, zoom and pan'));
        $gridOverlay = $config['showGrid'] ? '<div class="grid-overlay"></div>' : '';
        // The lighting controls find the viewer by its id, which it otherwise does not need
        $viewerId = 'threedviewer-model-' . $media->id() . $this->idSuffix($view, $media);
        $idAttribute = $config['lightingControls'] ? 'id="' . $viewerId . '" ' : '';

        return '<div class="threedviewer-model-stage" style="position: relative; width: 100%; height: '
             . (int) $config['height'] . 'px;">'
             . $gridOverlay
             . '<model-viewer ' . $idAttribute . 'src="' . $modelViewerSrc . '" '
             . 'alt="' . $altText . '" camera-controls '
             . 'data-lighting-mode="' . $config['lightingMode'] . '" '
             . $this->renderModelViewerLighting($view, $config)
             . $autoRotate
             . 'style="width: 100%; height: 100%; background-color: ' . $background . ';">'
             . '</model-viewer>'
             . '<div class="threedviewer-control threedviewer-fullscreen">'
             . '<button type="button" aria-label="' . $enterFullscreen . '" '
             . 'title="' . $enterFullscreen . '" data-enter-label="' . $enterFullscreen . '" '
             . 'data-exit-label="' . $exitFullscreen . '">'
             . $this->icon('fullscreen', 'threedviewer-icon-enter')
             . $this->icon('fullscreen-exit', 'threedviewer-icon-exit') . '</button>'
             . $this->renderLightingButton($view, $config, $viewerId) . '</div>'
             . $this->renderLightingControls($view, $config, $viewerId, false)
             . '<details class="threedviewer-control threedviewer-help">'
             . '<summary aria-label="' . $helpLabel . '" title="' . $helpLabel . '">'
             . $this->icon('help') . '</summary>'
             . '<p>' . $helpText . '</p></details>'
             . '</div>';
    }

    /**
     * model-viewer's own lighting attributes, each only when it differs from model-viewer's default.
     * Brightness is model-viewer's exposure. With a light rig the environment is generated from the
     * rig in the browser, so the environment setting is not used.
     */
    private function renderModelViewerLighting(PhpRenderer $view, array $config): string
    {
        $lighting = $config['lighting'];
        $attributes = [];
        if ($lighting['threedviewer_light_brightness'] != 1) {
            $attributes[] = 'exposure="' . $this->formatNumber($lighting['threedviewer_light_brightness']) . '"';
        }
        $environment = $lighting['threedviewer_model_viewer_environment'];
        if ($config['rig'] === null && $environment !== 'default') {
            $image = $environment === 'custom' ? $lighting['threedviewer_model_viewer_environment_url'] : $environment;
            $attributes[] = 'environment-image="' . $view->escapeHtmlAttr($image) . '"';
        }
        if ($lighting['threedviewer_model_viewer_shadow_intensity'] != 0) {
            // model-viewer draws its shadow whatever the lights: with none above the model, the shadow is
            // left out, and model-viewer-lighting.js restores it from data-shadow-intensity if one rises
            $shadow = $config['rig'] === null || self::litFromAbove($config['rig'])
                ? 'shadow-intensity' : 'data-shadow-intensity';
            $attributes[] = $shadow . '="'
                . $this->formatNumber($lighting['threedviewer_model_viewer_shadow_intensity']) . '"';
        }
        if ($lighting['threedviewer_model_viewer_shadow_softness'] != 1) {
            $attributes[] = 'shadow-softness="'
                . $this->formatNumber($lighting['threedviewer_model_viewer_shadow_softness']) . '"';
        }
        $html = $attributes ? implode(' ', $attributes) . ' ' : '';
        $rig = $this->renderLightingAttributes($view, $config, false);
        return $html . ($rig !== '' ? ltrim($rig) . ' ' : '');
    }

    /**
     * Whether any light of a rig, with some strength, shines from above the model in the default view,
     * as litFromAbove() in lighting-rig.js decides once the lights turn. A light level with the model
     * does not count: model-viewer would still draw the shadow as if lit from overhead.
     *
     * @param array<string,mixed> $rig From Lighting::rig(): only the lights in use
     */
    private static function litFromAbove(array $rig): bool
    {
        foreach ($rig['lights'] as $light) {
            if ($light['strength'] > 0 && $light['elevation'] > 0) {
                return true;
            }
        }
        return false;
    }
}
