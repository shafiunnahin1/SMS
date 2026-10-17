<?php

namespace App\Support;

// Bulk writes skip Eloquent events, so BelongsToInstitution::creating() (the cross-tenant guard) never runs for them.
// This is the ONLY allowed way to insert()/upsert() many rows of a tenant model (TenancyArchitectureTest).
final class TenantBulk
{
    public static function upsert(string $model, array $rows, array $uniqueBy, array $update): int
    {
        $tenant = Tenancy::current() ?? throw new \App\Exceptions\TenantNotBoundException($model);
        foreach ($rows as $r) {
            if ((int) ($r['institution_id'] ?? 0) !== (int) $tenant->id) throw new \LogicException('Cross-tenant bulk write blocked on ' . class_basename($model));
        }
        return $model::upsert($rows, $uniqueBy, $update);
    }

    public static function insert(string $model, array $rows): bool
    {
        $tenant = Tenancy::current() ?? throw new \App\Exceptions\TenantNotBoundException($model);
        foreach ($rows as $r) {
            if ((int) ($r['institution_id'] ?? 0) !== (int) $tenant->id) throw new \LogicException('Cross-tenant bulk write blocked on ' . class_basename($model));
        }
        return $model::insert($rows);
    }
}
