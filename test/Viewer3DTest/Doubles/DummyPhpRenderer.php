<?php

declare(strict_types=1);

namespace Viewer3DTest\Doubles;

use Laminas\View\Renderer\PhpRenderer;

/**
 * Lightweight view renderer for testing renderers without Omeka helpers.
 */
class DummyPhpRenderer extends PhpRenderer
{
    /** @var array<string,mixed> */
    private array $settings = [];

    /** @var array<string,mixed>|null Settings of the current site, or null for no site (admin) */
    private ?array $siteSettings = null;

    /**
     * Allow tests to inject configuration values returned by the 'setting' plugin.
     *
     * @param array<string,mixed> $settings
     */
    public function setSettings(array $settings): void
    {
        $this->settings = $settings;
    }

    /**
     * Put the page on a site with these site settings, as the 'currentSite' and 'siteSetting'
     * plugins report them; null takes the page off any site, as on admin pages.
     *
     * @param array<string,mixed>|null $siteSettings
     */
    public function setSiteSettings(?array $siteSettings): void
    {
        $this->siteSettings = $siteSettings;
    }

    public function assetUrl(string $path, ?string $module = null): string
    {
        // Simulate Omeka's assetUrl for module assets
        $prefix = $module ? "/modules/{$module}/" : "/assets/";
        return $prefix . ltrim($path, '/');
    }

    public function plugin($name)
    {
        // Provide a callable settings plugin that returns the default
        if ($name === 'setting') {
            $settings = $this->settings;
            return function (string $key, $default = null) use ($settings) {
                return array_key_exists($key, $settings) ? $settings[$key] : $default;
            };
        }
        if ($name === 'currentSite') {
            $site = $this->siteSettings === null ? null : new \stdClass();
            return function () use ($site) {
                return $site;
            };
        }
        if ($name === 'siteSetting') {
            $siteSettings = $this->siteSettings;
            if ($siteSettings === null) {
                // As Omeka's helper does without a site
                return function () {
                    throw new \RuntimeException('Cannot manage settings when no target ID is set.');
                };
            }
            return function (string $key, $default = null) use ($siteSettings) {
                return array_key_exists($key, $siteSettings) ? $siteSettings[$key] : $default;
            };
        }
        return parent::plugin($name);
    }

    public function translate(string $message): string
    {
        return $message; // no-op translation
    }
}
