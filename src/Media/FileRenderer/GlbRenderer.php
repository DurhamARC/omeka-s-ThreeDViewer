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

        $view->headScript()->appendFile(
            $view->assetUrl('vendor/model-viewer/model-viewer.min.js', 'ThreeDViewer'),
            'module'
        );
        if ($config['lightingMode'] === 'viewer') {
            $view->headScript()->appendFile($view->assetUrl('js/model-viewer-lighting.js', 'ThreeDViewer'));
        }

        $infoPanel = $this->renderInfoPanel($view, 'GLB Viewer', $config['showGrid']);

        $rawUrl = $media->originalUrl();
        $protocolRelativeUrl = preg_replace('/^https?:/', '', $rawUrl);
        $background = $view->escapeHtmlAttr($config['backgroundColor']);
        $autoRotate = $config['autoRotate'] ? 'auto-rotate ' : '';
        $modelViewerSrc = $view->escapeHtmlAttr($protocolRelativeUrl);
        $altText = $view->escapeHtmlAttr($media->displayTitle());

        return '<div style="position: relative; width: 100%; height: ' . (int) $config['height'] . 'px;">'
             . $infoPanel
             . '<model-viewer src="' . $modelViewerSrc . '" '
             . 'alt="' . $altText . '" camera-controls '
             . 'data-lighting-mode="' . $view->escapeHtmlAttr($config['lightingMode']) . '" '
             . $autoRotate
             . 'style="width: 100%; height: 100%; background-color: ' . $background . ';">'
             . '</model-viewer>'
             . '</div>';
    }
}
