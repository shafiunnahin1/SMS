<?php

namespace App\Traits;

use App\Scopes\InstitutionScope;
use App\Support\Tenancy;
use Illuminate\Database\Eloquent\Builder;

trait BelongsToInstitution
{
    protected static function bootBelongsToInstitution(): void
    {
        static::addGlobalScope('institution', new InstitutionScope);

        static::creating(function ($model) {
            $tenant = Tenancy::current();
            if (Tenancy::isBypassed()) {
                // Under an explicit bypass the caller must say which institution the row belongs to
                if (empty($model->institution_id)) throw new \LogicException(class_basename($model) . ': set institution_id explicitly inside withoutTenancy()');
                return;
            }
            if (!$tenant) throw new \App\Exceptions\TenantNotBoundException($model::class);
            if (empty($model->institution_id)) { $model->institution_id = $tenant->id; return; }
            if ((int) $model->institution_id !== (int) $tenant->id) {
                throw new \LogicException('Cross-tenant write blocked on ' . class_basename($model));
            }
        });

        // A row can never be moved to another institution
        static::updating(function ($model) {
            if ($model->isDirty('institution_id')) throw new \LogicException('institution_id is immutable on ' . class_basename($model));
        });
    }

    public function institution() { return $this->belongsTo(\App\Models\Institution::class); }

    /** The ONLY ways to leave the tenant filter - both greppable, both audited by TenancyArchitectureTest */
    public function scopeAnyInstitution(Builder $q): Builder { return $q->withoutGlobalScope('institution'); }   // guard:allow(tenant-scope) the named exit from the tenant filter
    public function scopeForInstitution(Builder $q, int $id): Builder { return $q->withoutGlobalScope('institution')->where($this->getTable() . '.institution_id', $id); }   // guard:allow(tenant-scope) the named exit from the tenant filter
}
