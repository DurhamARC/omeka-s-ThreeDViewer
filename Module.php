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
use ThreeDViewer\Form\SiteSettingsFieldset;
use ThreeDViewer\Settings\Lighting;

/**
 * Main class for the 3DViewer module.
 */
class Module extends AbstractModule
{
    private const ENVIRONMENT_URL_ERROR =
        'The custom environment image URL must start with http://, https:// or /.'; // @translate

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
     * Add the lighting settings to each site's settings form.
     *
     * @param SharedEventManagerInterface $sharedEventManager
     */
    public function attachListeners(SharedEventManagerInterface $sharedEventManager)
    {
        $sharedEventManager->attach(
            'Omeka\Form\SiteSettingsForm',
            'form.add_elements',
            [$this, 'addSiteSettings']
        );
        $sharedEventManager->attach(
            'Omeka\Form\SiteSettingsForm',
            'form.add_input_filters',
            [$this, 'addSiteSettingsInputFilters']
        );
        // The site settings form is on the site's edit page
        $sharedEventManager->attach(
            'Omeka\Controller\SiteAdmin\Index',
            'view.edit.before',
            [$this, 'addSiteSettingsScript']
        );
    }

    /**
     * Show each lighting setting on a site's settings only where it applies.
     *
     * @param Event $event
     */
    public function addSiteSettingsScript(Event $event)
    {
        $this->appendSettingsFormScript($event->getTarget());
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
     * Add the lighting elements to a site's settings form, in the module form's groups. They are
     * added one by one, because Omeka saves each top-level element of this form as its own site
     * setting.
     *
     * A blank field keeps the module's setting, except in the light rig: a site whose Lights is
     * Custom has its own whole rig, so its rig fields show the defaults rather than a blank.
     * Settings of one library show only where it is the module's library.
     *
     * @param Event $event
     */
    public function addSiteSettings(Event $event)
    {
        $services = $this->getServiceLocator();
        $siteSettings = $services->get('Omeka\Settings\Site');
        $library = $services->get('Omeka\Settings')->get('threedviewer_default_library', 'model-viewer');
        $form = $event->getTarget();

        // The module form's groups, named for the site's settings among other modules'. The first
        // keeps the name it has always had.
        $siteGroups = [
            'threedviewer_lighting' => ['threedviewer', '3D viewer lighting'], // @translate
            'threedviewer_custom_lights' => ['threedviewer_custom_lights', '3D viewer custom lights'], // @translate
            'threedviewer_light_1' => ['threedviewer_light_1', '3D viewer custom light 1'], // @translate
            'threedviewer_light_2' => ['threedviewer_light_2', '3D viewer custom light 2'], // @translate
            'threedviewer_light_3' => ['threedviewer_light_3', '3D viewer custom light 3'], // @translate
            'threedviewer_light_4' => ['threedviewer_light_4', '3D viewer custom light 4'], // @translate
            'threedviewer_model_viewer' => [
                'threedviewer_model_viewer',
                '3D viewer model-viewer lighting', // @translate
            ],
            'threedviewer_babylon' => ['threedviewer_babylon', '3D viewer Babylon.js lighting'], // @translate
        ];
        $groups = $form->getOption('element_groups') ?: [];
        foreach ($siteGroups as [$id, $label]) {
            $groups[$id] = $label;
        }
        $form->setOption('element_groups', $groups);

        $defaults = Lighting::defaults();
        $rig = Lighting::rigKeys();
        $fieldset = new SiteSettingsFieldset();
        $fieldset->init();
        foreach ($fieldset->getElements() as $name => $element) {
            $value = $siteSettings->get($name);
            if (($value === null || $value === '') && in_array($name, $rig, true)) {
                $value = $defaults[$name];
            }
            $element->setOption('element_group', $siteGroups[$element->getOption('element_group')][0]);
            // A site has no library of its own: its library settings show for the module's
            if ($element->getAttribute('data-show-if-library')) {
                $element->setAttribute('data-library', (string) $library);
            }
            $element->setValue($value ?? '');
            $form->add($element);
        }
    }

    /**
     * Let every lighting field of a site's settings form be left empty.
     *
     * @param Event $event
     */
    public function addSiteSettingsInputFilters(Event $event)
    {
        $inputFilter = $event->getParam('inputFilter');
        foreach (Lighting::keys() as $name) {
            $inputFilter->add(['name' => $name, 'required' => false, 'allow_empty' => true]);
        }
        // Trimmed first, as Lighting::clean() does
        $url = $inputFilter->get('threedviewer_model_viewer_environment_url');
        $url->getFilterChain()->attach(new \Laminas\Filter\StringTrim());
        $url->getValidatorChain()->attach(new \Laminas\Validator\Regex([
            'pattern' => Lighting::URL_PATTERN,
            'messages' => [\Laminas\Validator\Regex::NOT_MATCH => self::ENVIRONMENT_URL_ERROR],
        ]));
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
        $lighting = Lighting::normalise($config);
        foreach ($lighting as $key => $value) {
            $settings->set($key, $value);
        }
        // normalise() drops a custom environment without a usable URL: say so, when the admin could see it
        if (($config['threedviewer_model_viewer_environment'] ?? '') === 'custom'
            && $lighting['threedviewer_model_viewer_environment'] !== 'custom'
            && $lighting['threedviewer_lights'] === 'default'
            && ($config['threedviewer_default_library'] ?? 'model-viewer') === 'model-viewer'
        ) {
            (new Messenger())->addWarning(new Message(self::ENVIRONMENT_URL_ERROR));
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
