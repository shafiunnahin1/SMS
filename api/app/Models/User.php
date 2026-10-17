<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

// NO global scope: a Super Admin row has institution_id NULL. Reads must say which users they want (inTenant / platform),
// and inTenant() fails closed without a bound tenant. Never User::where('email', …) alone (docs/templates/laravel-core-files.md).
class User extends Authenticatable
{
    use HasApiTokens, Notifiable, SoftDeletes;

    const UPDATED_AT = null;

    /** Accounts with institution_id NULL that work on the central host only: the Super Admin and (D65, QB.2) the question-bank writers */
    public const PLATFORM_ROLES = ['super_admin', 'content_writer', 'content_moderator'];

    protected $fillable = [
        'institution_id',
        'name',
        'email',
        'phone',
        'username',
        'password',
        'role',
        'avatar',
        'is_active',
        'locale',
        'fcm_token',
        'must_change_password',
        'notification_preferences',
        'two_factor_enabled',
        'whatsapp_number',
        'whatsapp_enabled',
        'name_alt',
        'ui_preferences',
    ];   // NOT failed_login_attempts / locked_until / last_login_at - written only by the login flow

    protected $hidden = [
        'password',
        'fcm_token',
    ];

    protected $casts = [
        'password' => 'hashed',
        'is_active' => 'boolean',
        'last_login_at' => 'datetime',
        'locked_until' => 'datetime',
        'must_change_password' => 'boolean',
        'notification_preferences' => 'array',
        'two_factor_enabled' => 'boolean',
        'whatsapp_enabled' => 'boolean',
        'ui_preferences' => 'array',
    ];

    public function institution() { return $this->belongsTo(Institution::class); }

    /** Bangladeshi mobile numbers are always stored as 01XXXXXXXXX (+880…/880…/01… all match the same user) */
    protected function phone(): \Illuminate\Database\Eloquent\Casts\Attribute
    {
        return \Illuminate\Database\Eloquent\Casts\Attribute::make(set: fn (?string $v) => self::normalisePhone($v));
    }

    public static function normalisePhone(?string $v): ?string
    {
        if ($v === null || trim($v) === '') return null;
        $digits = preg_replace('/\D/', '', $v);
        return preg_match('/^(88)?01[3-9]\d{8}$/', $digits) ? substr($digits, -11) : trim($v);
    }

    /** Staff/students/parents of the CURRENT institution */
    public function scopeInTenant(Builder $q): Builder
    {
        $t = \App\Support\Tenancy::current() ?? throw new \App\Exceptions\TenantNotBoundException(self::class);
        return $q->where('users.institution_id', $t->id);
    }

    /** Platform accounts: the Super Admin and the question-bank writers / moderators (D65) */
    public function scopePlatform(Builder $q): Builder
    {
        return $q->whereNull('users.institution_id')->whereIn('users.role', self::PLATFORM_ROLES);
    }
}
