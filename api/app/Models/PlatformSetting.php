<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Platform-wide settings the Super Admin edits (D56/D57: the SMS rate, the universal API). Not tenant data (AGENTS.md rule 8
// exception list). Values are JSON; a secret is stored encrypted by its caller, never in plain text.
class PlatformSetting extends Model
{
    public const CREATED_AT = null;
    protected $fillable = ['setting_key', 'value', 'updated_by'];
    protected $casts = ['value' => 'array'];

    public static function read(string $key, mixed $default = null): mixed
    {
        $row = static::where('setting_key', $key)->first();
        return $row ? ($row->value['v'] ?? $default) : $default;
    }

    public static function write(string $key, mixed $value, ?int $by = null): void
    {
        static::updateOrCreate(['setting_key' => $key], ['value' => ['v' => $value], 'updated_by' => $by]);
    }
}
