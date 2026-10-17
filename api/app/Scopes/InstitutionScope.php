<?php

namespace App\Scopes;

class InstitutionScope implements \Illuminate\Database\Eloquent\Scope
{
    public function apply(\Illuminate\Database\Eloquent\Builder $builder, \Illuminate\Database\Eloquent\Model $model): void
    {
        if (\App\Support\Tenancy::isBypassed()) return;
        $tenant = \App\Support\Tenancy::current() ?? throw new \App\Exceptions\TenantNotBoundException($model::class);   // FAIL CLOSED
        $builder->where($model->getTable() . '.institution_id', $tenant->id);
    }
}
