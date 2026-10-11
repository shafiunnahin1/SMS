<?php

namespace App\Scopes;

use App\Exceptions\CatalogueAccessException;
use App\Support\Catalogue;
use Illuminate\Database\Eloquent\{Builder, Model, Scope};

// What an institution's host may see of a catalogue model (PlatformCatalogue::TENANT_READ): 'all' rows, only 'published'
// ones, or 'none' (a query throws). The central host sees everything.
class CatalogueScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if (!Catalogue::restricted()) return;
        match ($model::TENANT_READ) {
            'all' => null,
            'published' => $builder->where($model->getTable() . '.status', 'published'),
            default => throw CatalogueAccessException::hidden($model::class),
        };
    }
}
