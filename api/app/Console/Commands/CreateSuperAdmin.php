<?php

namespace App\Console\Commands;

use App\Models\{AuditLog, User};
use App\Rules\PolicyPassword;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

// D196 OPS.1: the platform's real Super Admin on a new server (the deploy checklist uses this, not SuperAdminSeeder's demo row).
// Name and phone come as options (the OTP goes to that phone); the password only from a hidden prompt, twice - never an option,
// never logged, the Super Admin password policy. An existing Super Admin with that phone is refused; --force only changes that
// same account's name / password. One audit row without the password or the phone digits.
class CreateSuperAdmin extends Command
{
    protected $signature = 'platform:create-super-admin {--name= : full name} {--phone= : Bangladesh mobile, the OTP goes here} {--force : update name / password of this phone\'s Super Admin}';
    protected $description = 'Create (or with --force update) the platform Super Admin';

    public function handle(): int
    {
        $name = trim((string) $this->option('name'));
        $phone = User::normalisePhone((string) $this->option('phone'));
        $v = Validator::make(['name' => $name, 'phone' => $phone], ['name' => 'required|string|max:100', 'phone' => ['required', 'regex:/^01[3-9]\d{8}$/']]);
        if ($v->fails()) { $this->error($v->errors()->first()); return self::FAILURE; }

        $existing = User::platform()->where('role', 'super_admin')->where('phone', $phone)->first();
        if ($existing && !$this->option('force')) { $this->error('A Super Admin with this phone already exists (use --force to change its name / password).'); return self::FAILURE; }
        if (!$existing && User::whereNull('institution_id')->where('phone', $phone)->exists()) { $this->error('Another platform account already uses this phone.'); return self::FAILURE; }

        $password = (string) $this->secret('Password (12+ characters, letters and numbers)');
        if ($password !== (string) $this->secret('Password again')) { $this->error('The two passwords are not the same.'); return self::FAILURE; }
        $probe = $existing ?? new User(['name' => $name, 'phone' => $phone, 'role' => 'super_admin']);
        $pv = Validator::make(['password' => $password], ['password' => [new PolicyPassword($probe)]]);
        if ($pv->fails()) { $this->error($pv->errors()->first()); return self::FAILURE; }

        if ($existing) {
            $existing->update(['name' => $name, 'password' => $password, 'is_active' => true]);
            $user = $existing;
        } else {
            $user = User::create(['institution_id' => null, 'name' => $name, 'phone' => $phone, 'password' => $password, 'role' => 'super_admin',
                'is_active' => true, 'must_change_password' => false]);
        }
        AuditLog::record($existing ? 'platform.super_admin_updated' : 'platform.super_admin_created', $user, ['phone_last2' => substr($phone, -2)]);
        $this->info(($existing ? 'Updated' : 'Created') . " Super Admin #{$user->id} ({$name}, phone ending " . substr($phone, -2) . '). Sign in on the central host with the phone; the OTP goes there.');
        return self::SUCCESS;
    }
}
