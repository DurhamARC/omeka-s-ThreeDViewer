<?php

declare(strict_types=1);

namespace Laminas\EventManager;

/**
 * Minimal stub of Laminas' Event for tests: a target and parameters.
 */
class Event
{
    private $name;
    private $target;
    private array $params;

    public function __construct($name = null, $target = null, array $params = [])
    {
        $this->name = $name;
        $this->target = $target;
        $this->params = $params;
    }

    public function getName()
    {
        return $this->name;
    }

    public function getTarget()
    {
        return $this->target;
    }

    public function getParam($name, $default = null)
    {
        return $this->params[$name] ?? $default;
    }
}
