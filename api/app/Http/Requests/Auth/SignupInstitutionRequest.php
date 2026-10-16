<?php
namespace App\Http\Requests\Auth;

class SignupInstitutionRequest extends \App\Http\Requests\SuperAdmin\StoreInstitutionRequest
{
    protected function principalKey(): string { return 'principal'; }
    protected function isPublic(): bool { return true; }
}
