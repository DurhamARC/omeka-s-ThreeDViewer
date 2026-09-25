<?php
declare(strict_types=1);

namespace ThreeDViewer\Media\FileRenderer;

use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\MediaRepresentation;
use Omeka\Media\FileRenderer\RendererInterface;

class BabylonRenderer extends Abstract3DRenderer implements RendererInterface
{
    public function render(PhpRenderer $view, MediaRepresentation $media, array $options = []): string
    {
        $config = $this->getViewerConfig($view);

        $view->headScript()->appendFile('https://cdn.babylonjs.com/babylon.js');
        $view->headScript()->appendFile('https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js');
        if ($config['babylonShowToolbar']) {
            $view->headScript()->appendFile('https://cdn.babylonjs.com/inspector/babylon.inspector.bundle.js');
        }

        $view->headScript()->appendFile($view->assetUrl('js/babylon-viewer.js', 'ThreeDViewer'));

        $view->headStyle()->appendStyle('
            .threedviewer-babylon-container {
                position: relative;
                width: 100%;
                height: ' . (int) $config['height'] . 'px;
                background-color: ' . $view->escapeHtmlAttr($config['backgroundColor']) . ';
                overflow: hidden;
            }
            .threedviewer-babylon-canvas {
                width: 100%;
                height: 100%;
                touch-action: none;
                display: block;
            }
            .babylon-loading {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.75);
                color: #ffffff;
                padding: 12px 18px;
                border-radius: 4px;
                z-index: 2;
            }
            .hidden {
                display: none !important;
            }
        ');

        $infoPanel = $this->renderInfoPanel($view, 'Babylon.js Viewer', $config['showGrid']);

        $rawUrl = $media->originalUrl();
        $protocolRelativeUrl = preg_replace('/^https?:/', '', $rawUrl);

        $canvasId = 'babylon-canvas-' . $media->id();
        $loadingId = 'babylon-loading-' . $media->id();

        return '<div class="threedviewer-babylon-container">'
            . $infoPanel
            . '<div id="' . $loadingId . '" class="babylon-loading">'
            . $view->escapeHtml($view->translate('Loading 3D model...'))
            . '</div>'
            . '<canvas id="' . $canvasId . '" class="threedviewer-babylon-canvas" '
            . 'data-model-url="' . $view->escapeHtmlAttr($protocolRelativeUrl) . '" '
            . 'data-background-color="' . $view->escapeHtmlAttr($config['backgroundColor']) . '" '
            . 'data-auto-rotate="' . ($config['autoRotate'] ? 'true' : 'false') . '" '
            . 'data-camera="' . $view->escapeHtmlAttr($config['babylonCamera']) . '" '
            . 'data-lighting="' . $view->escapeHtmlAttr($config['babylonLighting']) . '" '
            . 'data-lighting-mode="' . $view->escapeHtmlAttr($config['lightingMode']) . '" '
            . 'data-environment="' . $view->escapeHtmlAttr($config['babylonEnvironment']) . '" '
            . 'data-enable-xr="' . ($config['babylonEnableXR'] ? 'true' : 'false') . '" '
            . 'data-show-grid="' . ($config['showGrid'] ? 'true' : 'false') . '" '
            . 'data-show-inspector="' . ($config['babylonShowToolbar'] ? 'true' : 'false') . '" '
            . 'data-loading-id="' . $view->escapeHtmlAttr($loadingId) . '"></canvas>'
            . '</div>';
    }
}
