<?php

declare(strict_types=1);

namespace Viewer3DTest;

use ThreeDViewer\Module;
use Laminas\ServiceManager\ServiceManager;
use Laminas\View\Renderer\PhpRenderer;
use Laminas\Mvc\Controller\AbstractController;
use PHPUnit\Framework\TestCase;

class ModuleTest extends TestCase
{
    private $settings;
    private $services;
    private $module;

    protected function setUp(): void
    {
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
}
