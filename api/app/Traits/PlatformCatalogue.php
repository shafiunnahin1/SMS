<?php

namespace App\Traits;

use App\Exceptions\CatalogueAccessException;
use App\Scopes\CatalogueScope;
use App\Support\Catalogue;

// D65 (docs/modules/question-bank.md §2): a platform question-bank model - no institution_id, outside BelongsToInstitution
// (named in the D25 exception list by ModelInventoryTest). The using class declares
//   public const TENANT_READ = 'all' | 'published' | 'none';
// From an institution's host: reads are limited by that, and every create / update / delete throws.
trait PlatformCatalogue
{
    protected static function bootPlatformCatalogue(): void
    {
        static::addGlobalScope('catalogue', new CatalogueScope);
        $guard = function ($model) {
            if (Catalogue::restricted()) throw CatalogueAccessException::write($model::class);
        };
        static::saving($guard);
        static::deleting($guard);
        if (method_exists(static::class, 'restoring')) static::restoring($guard);   // SoftDeletes models
    }
}
