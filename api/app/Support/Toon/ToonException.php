<?php

namespace App\Support\Toon;

// D123: a TOON text that cannot be read - the message names the line, so an import shows where the file is broken
class ToonException extends \RuntimeException
{
    public function __construct(string $message, public readonly int $lineNumber = 0)
    {
        parent::__construct($lineNumber > 0 ? "line {$lineNumber}: {$message}" : $message);
    }
}
