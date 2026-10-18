<?php

namespace App\Traits;

use App\Scopes\InstitutionScope;
use App\Support\Tenancy;
use Illuminate\Database\Eloquent\Builder;

// For AuditLog (docs/templates/laravel-core-files.md): reads are fail-closed like BelongsToInstitution;
// writes take the bound tenant's id, or NULL for a platform action when no tenant is bound.
trait BelongsToOptionalInstitution
{
    protected static function bootBelongsToOptionalInstitution(): void
    {
        static::addGlobalScope('institution', new InstitutionScope);

        static::creating(function ($model) {
            if (Tenancy::isBypassed()) return;
            $tenant = Tenancy::current();
            if (!$tenant) return;
            if (empty($model->institution_id)) { $model->institution_id = $tenant->id; return; }
            if ((int) $model->institution_id !== (int) $tenant->id) {
                throw new \LogicException('Cross-tenant write blocked on ' . class_basename($model));
            }
        });

        static::updating(function ($model) {
            if ($model->isDirty('institution_id')) throw new \LogicException('institution_id is immutable on ' . class_basename($model));
        });
    }

    public function institution() { return $this->belongsTo(\App\Models\Institution::class); }

    public function scopeAnyInstitution(Builder $q): Builder { return $q->withoutGlobalScope('institution'); }   // guard:allow(tenant-scope) the named exit from the tenant filter
}
