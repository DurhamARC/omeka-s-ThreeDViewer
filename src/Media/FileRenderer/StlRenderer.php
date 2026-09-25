<?php
declare(strict_types=1);

namespace ThreeDViewer\Media\FileRenderer;

use Omeka\Media\FileRenderer\RendererInterface;

use Laminas\View\Renderer\PhpRenderer;
use Omeka\Api\Representation\MediaRepresentation;

class StlRenderer extends Abstract3DRenderer implements RendererInterface
{
    public function render(PhpRenderer $view, MediaRepresentation $media, array $options = []): string
    {
        $config = $this->getViewerConfig($view);

        $view->headScript()->appendFile($view->assetUrl('vendor/three/three.min.js', 'ThreeDViewer'));
        $view->headScript()->appendFile($view->assetUrl('vendor/three/STLLoader.js', 'ThreeDViewer'));
        $view->headScript()->appendFile($view->assetUrl('vendor/three/OrbitControls.js', 'ThreeDViewer'));
        $view->headScript()->appendFile($view->assetUrl('js/stl-viewer.js', 'ThreeDViewer'));

        $view->headStyle()->appendStyle('
            .media-render {
                position: relative;
                height: ' . (int) $config['height'] . 'px;
                width: 100%;
                overflow: hidden;
            }
            #loading {
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                color: white; background: rgba(0,0,0,0.7);
                padding: 15px; border-radius: 5px; z-index: 100;
            }
            .hidden { display: none !important; }
        ');

        $infoPanel = $this->renderInfoPanel($view, 'STL Viewer', $config['showGrid']);

        $rawUrl = $media->originalUrl();
        $protocolRelativeUrl = preg_replace('/^https?:/', '', $rawUrl);
        $modelUrl = $view->escapeHtmlAttr($protocolRelativeUrl);

        return $infoPanel
             . '<div id="loading" data-stl-url="' . $modelUrl
             . '" data-foreground-color="' . $view->escapeHtmlAttr($config['foregroundColor'])
             . '" data-background-color="' . $view->escapeHtmlAttr($config['backgroundColor'])
             . '" data-auto-rotate="' . ($config['autoRotate'] ? 'true' : 'false')
             . '" data-show-grid="' . ($config['showGrid'] ? 'true' : 'false')
             . '" data-lighting-mode="' . $view->escapeHtmlAttr($config['lightingMode']) . '">'
             . 'Loading STL model...</div>';
    }
}
