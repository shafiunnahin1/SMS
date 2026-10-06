<?php

namespace App\Traits;

// Every queued job that touches a tenant model uses this; the constructor MUST set $this->institutionId
// (an unset typed property makes the dispatch fail instead of running without a tenant).
trait TenantAwareJob
{
    public int $institutionId;

    public function middleware(): array { return [new \App\Jobs\Middleware\BindTenant($this->institutionId)]; }
}
