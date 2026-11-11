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
        $this->appendLightingScripts($view, $config);
        $view->headScript()->appendFile($view->assetUrl('js/stl-viewer.js', 'ThreeDViewer'));

        $view->headStyle()->appendStyle('
            .threedviewer-stl-container {
                position: relative;
                height: ' . (int) $config['height'] . 'px;
                width: 100%;
                overflow: hidden;
            }
            .threedviewer-stl-loading {
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                color: white; background: rgba(0,0,0,0.7);
                padding: 15px; border-radius: 5px; z-index: 100;
            }
            .hidden { display: none !important; }
        ');

        $infoPanel = $this->renderInfoPanel(
            $view,
            'STL Viewer', // @translate
            $config['showGrid']
        );

        $rawUrl = $media->originalUrl();
        $protocolRelativeUrl = preg_replace('/^https?:/', '', $rawUrl);
        $modelUrl = $view->escapeHtmlAttr($protocolRelativeUrl);
        // The element carrying the viewer's settings: stl-viewer.js starts a viewer for each one, and
        // the lighting controls find their viewer by its id, unique even for a media shown twice
        $viewerId = 'threedviewer-stl-' . $media->id() . $this->idSuffix($view, $media);

        return '<div class="threedviewer-stl-container">'
             . $infoPanel
             . '<div class="threedviewer-stl-loading" id="' . $view->escapeHtmlAttr($viewerId) . '"'
             . ' data-stl-url="' . $modelUrl
             . '" data-foreground-color="' . $view->escapeHtmlAttr($config['foregroundColor'])
             . '" data-background-color="' . $view->escapeHtmlAttr($config['backgroundColor'])
             . '" data-auto-rotate="' . ($config['autoRotate'] ? 'true' : 'false')
             . '" data-show-grid="' . ($config['showGrid'] ? 'true' : 'false')
             . '" data-lighting-mode="' . $config['lightingMode'] . '"'
             . $this->renderStlUpAxis($view, $config, $media)
             . $this->renderLightingAttributes($view, $config) . '>'
             . 'Loading STL model...</div>'
             . $this->renderLightingControls($view, $config, $viewerId)
             . '</div>';
    }
}
