<?php
declare(strict_types=1);

namespace ThreeDViewer\Settings;

/**
 * The module's setting defaults, and the cleaning of its lighting settings.
 *
 * Every lighting value is cleaned when it is saved and again when it is read, so a value stored
 * by any other route (an older version, the API) still reaches the viewers valid.
 */
class Lighting
{
    public const MAX_LIGHTS = 4;

    /** Values a select may take; anything else falls back to the default */
    private const OPTIONS = [
        'threedviewer_lighting_mode' => ['model', 'viewer'],
        'threedviewer_lights' => ['default', 'custom'],
        'threedviewer_model_viewer_environment' => ['default', 'neutral', 'legacy', 'custom'],
        'threedviewer_babylon_lighting' => ['hemispheric', 'directional', 'point', 'environment'],
        'threedviewer_babylon_environment' => ['none', 'default', 'studio'],
    ];

    /** Ranges of the numbers, keyed by the end of the setting key */
    private const RANGES = [
        'brightness' => [0, 3],
        'strength' => [0, 3],
        'count' => [1, self::MAX_LIGHTS],
        'azimuth' => [-180, 180],
        'elevation' => [0, 90],
        'shadow_intensity' => [0, 1],
        'shadow_softness' => [0, 1],
    ];

    /** Numbers kept whole: the light count and the angles, in degrees */
    private const WHOLE = ['count', 'azimuth', 'elevation'];

    /**
     * The step of every other number: their fields' step, which a browser will not submit a value
     * off, so a value stored by other means must be on it too
     */
    private const STEP = 0.05;

    /** @var array<string,mixed>|null */
    private static $defaults;

    /**
     * The defaults of all the module's settings, lighting and the rest, from module.config.php.
     *
     * @return array<string,mixed>
     */
    public static function defaults(): array
    {
        if (self::$defaults === null) {
            $config = include dirname(__DIR__, 2) . '/config/module.config.php';
            self::$defaults = $config['threedviewer']['settings'];
        }
        return self::$defaults;
    }

    /**
     * The lighting settings' keys, in the order of the configuration form.
     *
     * @return string[]
     */
    public static function keys(): array
    {
        $keys = [
            'threedviewer_lighting_mode',
            'threedviewer_light_brightness',
            'threedviewer_lights',
            'threedviewer_light_ambient_color',
            'threedviewer_light_ambient_strength',
            'threedviewer_light_count',
        ];
        for ($n = 1; $n <= self::MAX_LIGHTS; $n++) {
            foreach (['color', 'strength', 'azimuth', 'elevation'] as $property) {
                $keys[] = "threedviewer_light_{$n}_{$property}";
            }
        }
        return array_merge($keys, [
            'threedviewer_model_viewer_environment',
            'threedviewer_model_viewer_environment_url',
            'threedviewer_model_viewer_shadow_intensity',
            'threedviewer_model_viewer_shadow_softness',
            'threedviewer_babylon_lighting',
            'threedviewer_babylon_environment',
        ]);
    }

    /**
     * Clean lighting values. Every lighting key is returned; a missing or invalid value becomes
     * its default.
     *
     * @param array<string,mixed> $values
     * @return array<string,mixed>
     */
    public static function normalise(array $values): array
    {
        $clean = [];
        foreach (self::keys() as $key) {
            $clean[$key] = self::clean($key, $values[$key] ?? null);
        }
        // A custom environment needs a usable URL; without one, model-viewer keeps its own
        if ($clean['threedviewer_model_viewer_environment'] === 'custom'
            && $clean['threedviewer_model_viewer_environment_url'] === ''
        ) {
            $clean['threedviewer_model_viewer_environment'] = 'default';
        }
        return $clean;
    }

    /**
     * Resolve the lighting for a page from the module's settings.
     *
     * @param callable $module Reads a module setting: fn(string $key): mixed
     * @return array<string,mixed> Cleaned values, as normalise() returns
     */
    public static function resolve(callable $module): array
    {
        $values = [];
        foreach (self::keys() as $key) {
            $values[$key] = $module($key);
        }
        return self::normalise($values);
    }

    /**
     * The light rig from cleaned values, as the viewers read it from data-lights, or null when
     * each viewer keeps its own lights.
     *
     * @param array<string,mixed> $clean Values from normalise()
     * @return array<string,mixed>|null
     */
    public static function rig(array $clean): ?array
    {
        if ($clean['threedviewer_lights'] !== 'custom') {
            return null;
        }
        $lights = [];
        for ($n = 1; $n <= $clean['threedviewer_light_count']; $n++) {
            $lights[] = [
                'color' => $clean["threedviewer_light_{$n}_color"],
                'strength' => $clean["threedviewer_light_{$n}_strength"],
                'azimuth' => $clean["threedviewer_light_{$n}_azimuth"],
                'elevation' => $clean["threedviewer_light_{$n}_elevation"],
            ];
        }
        return [
            'ambient' => [
                'color' => $clean['threedviewer_light_ambient_color'],
                'strength' => $clean['threedviewer_light_ambient_strength'],
            ],
            'lights' => $lights,
        ];
    }

    /**
     * @param mixed $value
     * @return mixed
     */
    private static function clean(string $key, $value)
    {
        $default = self::defaults()[$key];

        if (isset(self::OPTIONS[$key])) {
            return in_array($value, self::OPTIONS[$key], true) ? $value : $default;
        }

        if (substr($key, -6) === '_color') {
            return is_string($value) && preg_match('/^#[0-9a-f]{6}$/i', $value) ? strtolower($value) : $default;
        }

        if ($key === 'threedviewer_model_viewer_environment_url') {
            $value = is_string($value) ? trim($value) : '';
            // An absolute http(s) URL or a root-relative path, with nothing that could leave an attribute
            return preg_match('~^(https?://|/(?!/))[^\s"\'<>`]*$~i', $value) ? $value : '';
        }

        foreach (self::RANGES as $suffix => [$min, $max]) {
            if (substr($key, -strlen($suffix)) === $suffix) {
                if (!is_numeric($value)) {
                    $value = $default;
                }
                $number = max($min, min($max, (float) $value));
                if (in_array($suffix, self::WHOLE, true)) {
                    return (int) round($number);
                }
                return round(round($number / self::STEP) * self::STEP, 2);
            }
        }

        return $default;
    }
}
