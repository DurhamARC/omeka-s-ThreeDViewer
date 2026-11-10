<?php

declare(strict_types=1);

namespace Viewer3DTest;

use ThreeDViewer\Module;
use Laminas\ServiceManager\ServiceManager;
use Laminas\View\Renderer\PhpRenderer;
use Laminas\Mvc\Controller\AbstractController;
use PHPUnit\Framework\TestCase;
use Laminas\EventManager\Event;
use Laminas\EventManager\SharedEventManagerInterface;
use Laminas\Form\Form;
use Laminas\InputFilter\InputFilter;
use Omeka\Mvc\Controller\Plugin\Messenger;
use ThreeDViewer\Settings\Lighting;

class ModuleTest extends TestCase
{
    private $settings;
    private $services;
    private $module;

    protected function setUp(): void
    {
        Messenger::$warnings = [];
        $this->settings = new class {
            public $values = [];

            public function get($key, $default = null)
            {
                return $this->values[$key] ?? $default;
            }

            public function set($key, $value): void
            {
                $this->values[$key] = $value;
            }
        };
        $this->services = new ServiceManager(['services' => [
            'Omeka\Settings' => $this->settings,
            'Config' => [],
        ]]);
        $this->module = new Module();
        $this->module->setServiceLocator($this->services);
    }

    public function testConfigurationAndLifecycle(): void
    {
        $this->assertSame(include dirname(__DIR__, 2) . '/config/module.config.php', $this->module->getConfig());
        $this->module->install($this->services);
        $this->module->uninstall($this->services);
        $this->assertContains('model/gltf-binary', $this->settings->values['media_type_whitelist']);
        $this->assertContains('glb', $this->settings->values['extension_whitelist']);
        $this->module->install($this->services);
        $this->assertCount(3, $this->settings->values['extension_whitelist']);
    }

    public function testFormUsesSavedValuesAndDefaults(): void
    {
        $renderer = new class extends PhpRenderer {
            public $form;

            public function formCollection($form, $wrap)
            {
                $this->form = $form;
                return 'rendered form';
            }
        };
        $this->assertSame('rendered form', $this->module->getConfigForm($renderer));
        $this->assertSame('model-viewer', $renderer->form->get('threedviewer_default_library')->getValue());
        $this->settings->values['threedviewer_default_library'] = 'babylon';
        $this->module->getConfigForm($renderer);
        $this->assertSame('babylon', $renderer->form->get('threedviewer_default_library')->getValue());
    }

    public function testFormIsRenderedInItsGroupsWhereOmekaCan(): void
    {
        $renderer = new class extends PhpRenderer {
            public $form;

            public function getHelperPluginManager()
            {
                return new class {
                    public function has($name)
                    {
                        return $name === 'formCollectionElementGroups';
                    }
                };
            }

            public function formCollectionElementGroups($form, $wrap)
            {
                $this->form = $form;
                return 'grouped form';
            }
        };
        $this->assertSame('grouped form', $this->module->getConfigForm($renderer));
        $this->assertSame(
            'threedviewer_light_2',
            $renderer->form->get('threedviewer_light_2_color')->getOption('element_group')
        );
    }

    public function testFormShowsLightingModeDefaultingToModel(): void
    {
        $renderer = new class extends PhpRenderer {
            public $form;

            public function formCollection($form, $wrap)
            {
                $this->form = $form;
                return '';
            }
        };
        $this->module->getConfigForm($renderer);
        $element = $renderer->form->get('threedviewer_lighting_mode');
        $this->assertSame('model', $element->getValue());
        $this->assertSame(['model', 'viewer'], array_keys($element->getValueOptions()));
        $this->settings->values['threedviewer_lighting_mode'] = 'viewer';
        $this->module->getConfigForm($renderer);
        $this->assertSame('viewer', $renderer->form->get('threedviewer_lighting_mode')->getValue());
    }

    public function testFormShowsStlUpAxisKeepingCurrentBehaviourByDefault(): void
    {
        $renderer = new class extends PhpRenderer {
            public $form;

            public function formCollection($form, $wrap)
            {
                $this->form = $form;
                return '';
            }
        };
        $this->module->getConfigForm($renderer);
        $element = $renderer->form->get('threedviewer_stl_up_axis');
        $this->assertSame('current', $element->getValue());
        $this->assertSame(['current', 'y', 'z'], array_keys($element->getValueOptions()));
        $this->settings->values['threedviewer_stl_up_axis'] = 'z';
        $this->module->getConfigForm($renderer);
        $this->assertSame('z', $renderer->form->get('threedviewer_stl_up_axis')->getValue());
        // A value from elsewhere (an import, an old build) shows as what it does: current behaviour
        $this->settings->values['threedviewer_stl_up_axis'] = 'Z';
        $this->module->getConfigForm($renderer);
        $this->assertSame('current', $renderer->form->get('threedviewer_stl_up_axis')->getValue());
    }

    public function testSubmissionPersistsSettings(): void
    {
        $post = ['threedviewer_viewer_height' => 640, 'threedviewer_foreground_color' => '#000000',
            'threedviewer_background_color' => '#ffffff', 'threedviewer_auto_rotate' => '1'];
        $controller = $this->getMockBuilder(AbstractController::class)
            ->disableOriginalConstructor()->onlyMethods(['params'])->getMock();
        $params = new class ($post) {
            private $post;

            public function __construct(array $post)
            {
                $this->post = $post;
            }

            public function fromPost()
            {
                return $this->post;
            }
        };
        $controller->method('params')->willReturn($params);
        $this->module->handleConfigForm($controller);
        $this->assertSame(640, $this->settings->values['threedviewer_viewer_height']);
        $this->assertTrue($this->settings->values['threedviewer_auto_rotate']);
        $this->assertFalse($this->settings->values['threedviewer_show_grid']);
        $this->assertSame('arcRotate', $this->settings->values['threedviewer_babylon_camera']);
        $this->assertSame('model', $this->settings->values['threedviewer_lighting_mode']);
        $this->assertSame('current', $this->settings->values['threedviewer_stl_up_axis']);
    }

    /**
     * @dataProvider lightingModeSubmissions
     */
    public function testSubmissionPersistsOnlyKnownLightingModes(string $submitted, string $expected): void
    {
        $this->submit(['threedviewer_viewer_height' => 500, 'threedviewer_foreground_color' => '#000000',
            'threedviewer_background_color' => '#ffffff', 'threedviewer_lighting_mode' => $submitted]);
        $this->assertSame($expected, $this->settings->values['threedviewer_lighting_mode']);
    }

    /**
     * @dataProvider unusableEnvironmentUrls
     */
    public function testUnusableCustomEnvironmentUrlSavesTheRestAndWarns(string $url): void
    {
        $this->submit(['threedviewer_viewer_height' => 640, 'threedviewer_foreground_color' => '#000000',
            'threedviewer_background_color' => '#ffffff',
            'threedviewer_model_viewer_environment' => 'custom',
            'threedviewer_model_viewer_environment_url' => $url]);
        $this->assertSame(640, $this->settings->values['threedviewer_viewer_height'], 'The other edits are kept');
        $this->assertSame('default', $this->settings->values['threedviewer_model_viewer_environment']);
        $this->assertSame('', $this->settings->values['threedviewer_model_viewer_environment_url']);
        $this->assertCount(1, Messenger::$warnings);
    }

    public function unusableEnvironmentUrls(): array
    {
        return [
            'empty' => [''],
            'no scheme' => ['example.com/studio.hdr'],
            'space' => ['https://x/a b.hdr'],
            'javascript' => ['javascript:alert(1)'],
        ];
    }

    /**
     * @dataProvider hiddenEnvironmentSubmissions
     */
    public function testNoWarningForAnEnvironmentFieldTheAdminCannotSee(array $post): void
    {
        $this->submit($post + ['threedviewer_viewer_height' => 500, 'threedviewer_foreground_color' => '#000000',
            'threedviewer_background_color' => '#ffffff',
            'threedviewer_model_viewer_environment' => 'custom',
            'threedviewer_model_viewer_environment_url' => '']);
        $this->assertSame([], Messenger::$warnings);
    }

    public function hiddenEnvironmentSubmissions(): array
    {
        return [
            'custom lights' => [['threedviewer_lights' => 'custom']],
            'Babylon.js library' => [['threedviewer_default_library' => 'babylon']],
        ];
    }

    public function testUsableCustomEnvironmentUrlIsSavedWithoutWarning(): void
    {
        $this->submit(['threedviewer_viewer_height' => 500, 'threedviewer_foreground_color' => '#000000',
            'threedviewer_background_color' => '#ffffff',
            'threedviewer_model_viewer_environment' => 'custom',
            'threedviewer_model_viewer_environment_url' => ' /files/studio.hdr ']);
        $this->assertSame('custom', $this->settings->values['threedviewer_model_viewer_environment']);
        $this->assertSame('/files/studio.hdr', $this->settings->values['threedviewer_model_viewer_environment_url']);
        $this->assertSame([], Messenger::$warnings);
    }

    /**
     * @dataProvider siteEnvironmentUrls
     */
    public function testSiteSettingsRejectAnUnusableEnvironmentUrl(string $url, bool $valid): void
    {
        $inputFilter = new InputFilter();
        $this->module->addSiteSettingsInputFilters(
            new Event('form.add_input_filters', null, ['inputFilter' => $inputFilter])
        );
        $input = $inputFilter->get('threedviewer_model_viewer_environment_url');
        $input->setValue($url);
        $this->assertSame($valid, $input->isValid());
    }

    public function siteEnvironmentUrls(): array
    {
        return [
            'empty inherits the module setting' => ['', true],
            'absolute' => ['https://example.com/studio.hdr', true],
            'root-relative' => ['/files/studio.hdr', true],
            'no scheme' => ['example.com/studio.hdr', false],
            'space' => ['https://x/a b.hdr', false],
            'protocol-relative' => ['//evil.example/x.hdr', false],
            'javascript' => ['javascript:alert(1)', false],
            'surrounding spaces are trimmed, as in the module form' => [' /files/studio.hdr ', true],
        ];
    }

    public function lightingModeSubmissions(): array
    {
        return [
            'viewer' => ['viewer', 'viewer'],
            'model' => ['model', 'model'],
            'unknown falls back to model' => ['<script>', 'model'],
        ];
    }

    /**
     * @dataProvider stlUpAxisSubmissions
     */
    public function testSubmissionPersistsOnlyKnownStlUpAxes(string $submitted, string $expected): void
    {
        $this->submit(['threedviewer_viewer_height' => 500, 'threedviewer_foreground_color' => '#000000',
            'threedviewer_background_color' => '#ffffff', 'threedviewer_stl_up_axis' => $submitted]);
        $this->assertSame($expected, $this->settings->values['threedviewer_stl_up_axis']);
    }

    public function stlUpAxisSubmissions(): array
    {
        return [
            'Y up' => ['y', 'y'],
            'Z up' => ['z', 'z'],
            'current behaviour' => ['current', 'current'],
            'unknown keeps current behaviour' => ['x', 'current'],
        ];
    }

    public function testFormShowsLightingDefaultsAndStoredValues(): void
    {
        $renderer = new class extends PhpRenderer {
            public $form;

            public function formCollection($form, $wrap)
            {
                $this->form = $form;
                return '';
            }
        };
        $this->module->getConfigForm($renderer);
        $form = $renderer->form;
        $this->assertEquals(1, $form->get('threedviewer_light_brightness')->getValue());
        $this->assertSame('default', $form->get('threedviewer_lights')->getValue());
        $this->assertSame('#ffffff', $form->get('threedviewer_light_ambient_color')->getValue());
        $this->assertEquals(1, $form->get('threedviewer_light_count')->getValue());
        $this->assertEquals(45, $form->get('threedviewer_light_1_elevation')->getValue());
        $this->assertSame('1', $form->get('threedviewer_auto_rotate')->getValue(), 'Auto-rotate follows the config');

        $this->settings->values['threedviewer_lights'] = 'custom';
        $this->settings->values['threedviewer_light_3_color'] = '#123456';
        $this->module->getConfigForm($renderer);
        $this->assertSame('custom', $renderer->form->get('threedviewer_lights')->getValue());
        $this->assertSame('#123456', $renderer->form->get('threedviewer_light_3_color')->getValue());
    }

    public function testSubmissionCleansLightingSettings(): void
    {
        $this->submit(['threedviewer_viewer_height' => 500, 'threedviewer_foreground_color' => '#000000',
            'threedviewer_background_color' => '#ffffff',
            'threedviewer_light_brightness' => '9',
            'threedviewer_lights' => 'custom',
            'threedviewer_light_count' => '3',
            'threedviewer_light_1_color' => '#ABCDEF',
            'threedviewer_light_1_azimuth' => '-90',
            'threedviewer_model_viewer_environment' => 'neutral',
            'threedviewer_model_viewer_environment_url' => 'javascript:alert(1)',
            'threedviewer_babylon_lighting' => 'directional',
        ]);
        $values = $this->settings->values;
        $this->assertSame(3.0, $values['threedviewer_light_brightness']);
        $this->assertSame('custom', $values['threedviewer_lights']);
        $this->assertSame(3, $values['threedviewer_light_count']);
        $this->assertSame('#abcdef', $values['threedviewer_light_1_color']);
        $this->assertSame(-90, $values['threedviewer_light_1_azimuth']);
        $this->assertSame(0.3, $values['threedviewer_light_4_strength'], 'Missing values are saved as defaults');
        $this->assertSame('neutral', $values['threedviewer_model_viewer_environment']);
        $this->assertSame('', $values['threedviewer_model_viewer_environment_url']);
        $this->assertSame('directional', $values['threedviewer_babylon_lighting']);
        $this->assertSame('none', $values['threedviewer_babylon_environment']);
    }

    public function testListensToTheSiteSettingsForm(): void
    {
        $shared = $this->createMock(SharedEventManagerInterface::class);
        $attached = [];
        $shared->method('attach')->willReturnCallback(function ($id, $event, $callback) use (&$attached) {
            $attached[] = [$id, $event, $callback[1]];
        });
        $this->module->attachListeners($shared);
        $this->assertSame([
            ['Omeka\\Form\\SiteSettingsForm', 'form.add_elements', 'addSiteSettings'],
            ['Omeka\\Form\\SiteSettingsForm', 'form.add_input_filters', 'addSiteSettingsInputFilters'],
            ['Omeka\\Controller\\SiteAdmin\\Index', 'view.edit.before', 'addSiteSettingsScript'],
        ], $attached);
    }

    public function testSiteSettingsFormGetsTheLightingGroupWithTheSitesValues(): void
    {
        $siteSettings = new class {
            public $values = ['threedviewer_light_brightness' => 1.5, 'threedviewer_light_2_color' => '#00ff00'];

            public function get($key, $default = null)
            {
                return $this->values[$key] ?? $default;
            }
        };
        $this->services->setAllowOverride(true);
        $this->services->setService('Omeka\\Settings\\Site', $siteSettings);
        $form = new Form();
        $form->setOption('element_groups', ['general' => 'General']);

        $this->module->addSiteSettings(new Event('form.add_elements', $form));

        $groups = $form->getOption('element_groups');
        $this->assertSame(
            [
                'general', 'threedviewer', 'threedviewer_custom_lights', 'threedviewer_light_1',
                'threedviewer_light_2', 'threedviewer_light_3', 'threedviewer_light_4',
                'threedviewer_model_viewer', 'threedviewer_babylon',
            ],
            array_keys($groups)
        );
        $this->assertSame('3D viewer lighting', $groups['threedviewer'], 'The first group keeps its name');
        $this->assertSame('3D viewer custom light 3', $groups['threedviewer_light_3']);
        foreach (Lighting::keys() as $name) {
            $this->assertArrayHasKey($form->get($name)->getOption('element_group'), $groups, $name);
        }
        $this->assertSame('threedviewer', $form->get('threedviewer_lighting_controls')->getOption('element_group'));
        $this->assertSame('threedviewer_light_2', $form->get('threedviewer_light_2_color')->getOption('element_group'));
        $this->assertSame(
            'threedviewer_babylon',
            $form->get('threedviewer_babylon_environment')->getOption('element_group')
        );
        $this->assertEquals(1.5, $form->get('threedviewer_light_brightness')->getValue());
        $this->assertSame('', $form->get('threedviewer_lighting_mode')->getValue(), 'Unset: the module setting');
        $this->assertSame('#00ff00', $form->get('threedviewer_light_2_color')->getValue());
        $this->assertSame('#ffffff', $form->get('threedviewer_light_1_color')->getValue(), 'Unset rig field: default');
        $this->assertEquals(45, $form->get('threedviewer_light_1_elevation')->getValue());
        $this->assertSame(
            'model-viewer',
            $form->get('threedviewer_model_viewer_environment')->getAttribute('data-library'),
            'Without a library setting: the default library'
        );
        $this->assertNull($form->get('threedviewer_light_brightness')->getAttribute('data-library'));
    }

    public function testSiteLibrarySettingsShowForTheModulesLibrary(): void
    {
        $this->settings->values['threedviewer_default_library'] = 'babylon';
        $this->services->setAllowOverride(true);
        $this->services->setService('Omeka\\Settings\\Site', new class {
            public function get($key, $default = null)
            {
                return $default;
            }
        });
        $form = new Form();

        $this->module->addSiteSettings(new Event('form.add_elements', $form));

        foreach (['threedviewer_model_viewer_shadow_intensity', 'threedviewer_babylon_environment'] as $name) {
            $this->assertSame('babylon', $form->get($name)->getAttribute('data-library'), $name);
        }
        $this->assertSame(
            '["model-viewer"]',
            $form->get('threedviewer_model_viewer_shadow_intensity')->getAttribute('data-show-if-library')
        );
    }

    public function testSiteLightingFieldsMayBeLeftEmpty(): void
    {
        $inputFilter = new InputFilter();
        $this->module->addSiteSettingsInputFilters(
            new Event('form.add_input_filters', null, ['inputFilter' => $inputFilter])
        );
        foreach (Lighting::keys() as $name) {
            $this->assertFalse($inputFilter->get($name)->isRequired(), $name);
            $this->assertTrue($inputFilter->get($name)->allowEmpty(), $name);
        }
    }

    private function submit(array $post): void
    {
        $controller = $this->getMockBuilder(AbstractController::class)
            ->disableOriginalConstructor()->onlyMethods(['params'])->getMock();
        $params = new class ($post) {
            private $post;

            public function __construct(array $post)
            {
                $this->post = $post;
            }

            public function fromPost()
            {
                return $this->post;
            }
        };
        $controller->method('params')->willReturn($params);
        $this->module->handleConfigForm($controller);
    }

    public function testBothSettingsFormsLoadTheShowIfScript(): void
    {
        $renderer = new class extends PhpRenderer {
            public function formCollection($form, $wrap)
            {
                return '';
            }
        };
        $this->module->getConfigForm($renderer);
        $this->assertContains('/modules/ThreeDViewer/js/settings-form.js', $renderer->headScript()->files);

        $view = new PhpRenderer();
        $this->module->addSiteSettingsScript(new Event('view.edit.before', $view));
        $this->assertContains('/modules/ThreeDViewer/js/settings-form.js', $view->headScript()->files);
        $this->assertContains('/modules/ThreeDViewer/css/settings-form.css', $view->headLink()->files);
        $this->assertContains('/modules/ThreeDViewer/css/settings-form.css', $renderer->headLink()->files);
    }
}
