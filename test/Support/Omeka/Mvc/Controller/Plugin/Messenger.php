<?php
declare(strict_types=1);

namespace Omeka\Mvc\Controller\Plugin;

class Messenger
{
    /** @var array<int,mixed> Warnings added, for assertions; ModuleTest::setUp() empties it */
    public static $warnings = [];

    public function addSuccess($message): void
    {
    }

    public function addWarning($message): void
    {
        self::$warnings[] = $message;
    }

    public function addError($message): void
    {
    }
}
