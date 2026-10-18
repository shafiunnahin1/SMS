<?php

namespace App\Exceptions;

// Renders as a generic 500 (never describes the model to the client); logged at CRITICAL
class TenantNotBoundException extends \LogicException
{
    public function __construct(string $model)
    {
        parent::__construct("Tenant-scoped model {$model} used with no tenant bound. Use Tenancy::as(), Tenancy::withoutTenancy() or ::anyInstitution().");
    }
}
