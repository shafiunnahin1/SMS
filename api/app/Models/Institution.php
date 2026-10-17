<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// The tenant itself, so no BelongsToInstitution. Relation names are used across the spec: subscriptionPlan() and plan() (alias), admins().
class Institution extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'name','slug','institution_type','logo_path','favicon_path','address','phone','email','subscription_plan_id',
        'subscription_expires_at','status','enabled_modules','terminology','settings','sms_balance','sms_universal_enabled','sms_own_enabled',
        'onboarding_completed','onboarding_step','primary_color','secondary_color','accent_color',
        'logo_path','favicon_path','theme_mode','theme_preset_id','layout_key','theme_tokens',
        'theme_updated_by','theme_updated_at','parent_institution_id','branch_name','is_head_office',
        'staff_department_mode','switched_by','switched_at',
    ];

    protected $hidden = ['sms_api_key'];        // D59: the institution's own key never leaves the server

    protected $casts = [
        'enabled_modules' => 'array', 'terminology' => 'array', 'settings' => 'array', 'theme_tokens' => 'array',
        'subscription_expires_at' => 'datetime', 'theme_updated_at' => 'datetime',
        'onboarding_completed' => 'boolean', 'is_head_office' => 'boolean',
        'switched_by' => 'integer', 'switched_at' => 'datetime',
        'sms_balance' => 'decimal:2', 'sms_universal_enabled' => 'boolean', 'sms_own_enabled' => 'boolean', 'sms_api_key' => 'encrypted',
    ];

    public function subscriptionPlan() { return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id'); }
    public function plan()             { return $this->subscriptionPlan(); }   // alias used by ModuleGate / ThemeService
    public function admins()           { return $this->hasMany(User::class)->where('role', 'admin'); }
    public function themePreset()      { return $this->belongsTo(ThemePreset::class, 'theme_preset_id'); }
    public function parent()           { return $this->belongsTo(self::class, 'parent_institution_id'); }
}
