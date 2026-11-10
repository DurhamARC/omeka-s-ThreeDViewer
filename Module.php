<?php
declare(strict_types=1);

namespace ThreeDViewer;

use Laminas\EventManager\Event;
use Laminas\EventManager\SharedEventManagerInterface;
use Laminas\ServiceManager\ServiceLocatorInterface;
use Laminas\Mvc\Controller\AbstractController;
use Laminas\View\Renderer\PhpRenderer;
use Omeka\Module\AbstractModule;
use Omeka\Mvc\Controller\Plugin\Messenger;
use Omeka\Stdlib\Message;
use ThreeDViewer\Form\ConfigForm;
use ThreeDViewer\Settings\Lighting;

/**
 * Main class for the 3DViewer module.
 */
class Module extends AbstractModule
{
    /**
     * Retrieve the configuration array.
     *
     * @return array
     */
    public function getConfig()
    {
        return include __DIR__ . '/config/module.config.php';
    }

    /**
     * The script that shows each lighting setting only where it applies (see ConfigForm's
     * data-show-if conditions), and the styles that set the light rig's groups in under Lights.
     */
    private function appendSettingsFormScript(PhpRenderer $view): void
    {
        $view->headScript()->appendFile($view->assetUrl('js/settings-form.js', 'ThreeDViewer'));
        $view->headLink()->appendStylesheet($view->assetUrl('css/settings-form.css', 'ThreeDViewer'));
    }

    /**
     * Execute logic when the module is installed.
     *
     * @param ServiceLocatorInterface $serviceLocator
     */
    public function install(ServiceLocatorInterface $serviceLocator)
    {
        $messenger = new Messenger();
        $message = new Message("ThreeDViewer module installed.");
        $messenger->addSuccess($message);

        // Register 3D file types
        $this->updateWhitelist($serviceLocator);
    }
    
    /**
     * Register 3D file types in Omeka settings
     *
     * @param ServiceLocatorInterface $serviceLocator
     */
    protected function updateWhitelist(ServiceLocatorInterface $serviceLocator): void
    {
        $settings = $serviceLocator->get('Omeka\Settings');

        $whitelist = $settings->get('media_type_whitelist', []);
        $whitelist = array_values(array_unique(array_merge(array_values($whitelist), [
            'application/octet-stream',
            'model/stl',
            'model/gltf+json',
            'model/gltf-binary',
        ])));
        $settings->set('media_type_whitelist', $whitelist);

        $whitelist = $settings->get('extension_whitelist', []);
        $whitelist = array_values(array_unique(array_merge(array_values($whitelist), [
            'stl',
            'glb',
            'gltf',
        ])));
        $settings->set('extension_whitelist', $whitelist);
    }

    /**
     * Execute logic when the module is uninstalled.
     *
     * @param ServiceLocatorInterface $serviceLocator
     */
    public function uninstall(ServiceLocatorInterface $serviceLocator)
    {
        $messenger = new Messenger();
        $message = new Message("ThreeDViewer module uninstalled.");
        $messenger->addWarning($message);
    }
   
    /**
     * Get the configuration form for this module.
     *
     * @param PhpRenderer $renderer
     * @return string
     */
    public function getConfigForm(PhpRenderer $renderer)
    {
        $services = $this->getServiceLocator();
        $settings = $services->get('Omeka\Settings');
        
        $form = new ConfigForm;
        $form->init();
        
        // Each stored value, or its default; checkboxes take '1'/'0'
        $data = [];
        foreach (Lighting::defaults() as $key => $default) {
            $value = $settings->get($key, $default);
            $data[$key] = is_bool($default) ? ($value ? '1' : '0') : $value;
        }
        // As saved and rendered: anything but Y or Z keeps current behaviour
        if (!in_array($data['threedviewer_stl_up_axis'], ['y', 'z'], true)) {
            $data['threedviewer_stl_up_axis'] = 'current';
        }
        $form->setData($data);
        $this->appendSettingsFormScript($renderer);

        // Each group in its fieldset, where Omeka can (formCollectionElementGroups, as the site
        // settings use); otherwise every element in one list, as before
        $helpers = method_exists($renderer, 'getHelperPluginManager') ? $renderer->getHelperPluginManager() : null;
        if ($helpers && $helpers->has('formCollectionElementGroups')) {
            return $renderer->formCollectionElementGroups($form, false);
        }
        return $renderer->formCollection($form, false);
    }
    
    /**
     * Handle the configuration form submission.
     *
     * @param AbstractController $controller
     */
    public function handleConfigForm(AbstractController $controller)
    {
        $services = $this->getServiceLocator();
        $settings = $services->get('Omeka\Settings');
        
        $config = $controller->params()->fromPost();
        
        $settings->set('threedviewer_default_library', $config['threedviewer_default_library'] ?? 'model-viewer');
        $settings->set('threedviewer_viewer_height', $config['threedviewer_viewer_height']);
        $settings->set(
            'threedviewer_auto_rotate',
            isset($config['threedviewer_auto_rotate'])
                && $config['threedviewer_auto_rotate'] === '1'
        );
        $settings->set('threedviewer_foreground_color', $config['threedviewer_foreground_color']);
        $settings->set('threedviewer_background_color', $config['threedviewer_background_color']);
        $settings->set(
            'threedviewer_show_grid',
            isset($config['threedviewer_show_grid'])
                && $config['threedviewer_show_grid'] === '1'
        );
        foreach (Lighting::normalise($config) as $key => $value) {
            $settings->set($key, $value);
        }
        $stlUpAxis = $config['threedviewer_stl_up_axis'] ?? '';
        $settings->set('threedviewer_stl_up_axis', in_array($stlUpAxis, ['y', 'z'], true) ? $stlUpAxis : 'current');
        $settings->set('threedviewer_babylon_camera', $config['threedviewer_babylon_camera'] ?? 'arcRotate');
        $settings->set(
            'threedviewer_babylon_enable_xr',
            isset($config['threedviewer_babylon_enable_xr']) && $config['threedviewer_babylon_enable_xr'] === '1'
        );
        $settings->set(
            'threedviewer_babylon_show_toolbar',
            isset($config['threedviewer_babylon_show_toolbar']) && $config['threedviewer_babylon_show_toolbar'] === '1'
        );
    }
}
