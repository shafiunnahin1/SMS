<?php

namespace App\Exceptions;

// A catalogue write (or a read of platform-private rows) attempted from an institution's host - a programming error, not a
// user error: it fails loudly like TenantNotBoundException (D25 fail-closed).
class CatalogueAccessException extends \LogicException
{
    public static function write(string $model): self
    {
        return new self(class_basename($model) . ' is platform content: it cannot be written from an institution\'s host (Catalogue::asPlatform() is the named exit)');
    }

    public static function hidden(string $model): self
    {
        return new self(class_basename($model) . ' is platform-private: it cannot be read from an institution\'s host');
    }
}
