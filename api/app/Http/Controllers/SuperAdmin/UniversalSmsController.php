<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, PlatformSetting, SmsLog};
use App\Services\Billing\BkashService;
use App\Services\SmsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;

// D56/D57 (owner, 2026-10-10): the universal BulkSMSBD API every institution's wallet pays for - its key (stored encrypted,
// write-only; only the last 4 characters come back), its sender ID and the price of one SMS part. Empty values fall back to
// the server config (BULKSMSBD_*, SMS_RATE). The BulkSMSBD account balance itself is not read: no balance API was given (D57).
// The owner (2026-10-10) also sets the platform's bKash merchant for wallet recharge here (D58): address, sandbox switch and the
// four credentials - each secret stored encrypted, never returned (last 4 only); `bkash_test` asks bKash for a token.
class UniversalSmsController extends Controller
{
    public function __construct(private SmsService $sms, private BkashService $bkash) {}

    /** GET /super/sms-settings */
    public function show()
    {
        return response()->json(['success' => true, 'data' => $this->state()]);
    }

    /** PUT /super/sms-settings {rate?, sender_id?, api_key?, clear_api_key?} */
    public function update(Request $request)
    {
        $f = $request->validate([
            'rate'          => ['sometimes', 'numeric', 'regex:/^\d{1,2}(\.\d{1,2})?$/', 'min:0.01', 'max:10'],
            'sender_id'     => ['sometimes', 'nullable', 'string', 'max:20', 'regex:/^[A-Za-z0-9 ._-]+$/'],
            'api_key'       => ['sometimes', 'nullable', 'string', 'min:8', 'max:200'],
            'clear_api_key' => ['sometimes', 'boolean'],
            'bkash'                 => ['sometimes', 'array'],
            'bkash.base_url'        => ['sometimes', 'nullable', 'url:https', 'max:200'],
            'bkash.sandbox'         => ['sometimes', 'boolean'],
            'bkash.app_key'         => ['sometimes', 'nullable', 'string', 'max:200'],
            'bkash.app_secret'      => ['sometimes', 'nullable', 'string', 'max:200'],
            'bkash.username'        => ['sometimes', 'nullable', 'string', 'max:200'],
            'bkash.password'        => ['sometimes', 'nullable', 'string', 'max:200'],
            'bkash.clear'           => ['sometimes', 'boolean'],
            'bkash_test'            => ['sometimes', 'boolean'],
        ]);
        $by = $request->user()->id;
        $changed = [];
        if (array_key_exists('rate', $f)) { PlatformSetting::write('sms_rate', \App\Support\Money::format(\App\Support\Money::toPaisa((string) $f['rate'])), $by); $changed[] = 'rate'; }
        if (array_key_exists('sender_id', $f)) { PlatformSetting::write('sms_universal_sender_id', $f['sender_id'] ?: null, $by); $changed[] = 'sender_id'; }
        if (filled($f['api_key'] ?? null)) { PlatformSetting::write('sms_universal_api_key', Crypt::encryptString(trim($f['api_key'])), $by); $changed[] = 'api_key'; }
        elseif ($f['clear_api_key'] ?? false) { PlatformSetting::write('sms_universal_api_key', null, $by); $changed[] = 'api_key'; }
        $b = $f['bkash'] ?? [];
        // a sandbox switch with the live address (or the other way round) is refused before anything is saved
        $c = $this->bkash->credentials();
        $nextUrl = array_key_exists('base_url', $b) ? (string) $b['base_url'] : (string) (PlatformSetting::read('bkash_base_url') ?? '');
        $nextSandbox = array_key_exists('sandbox', $b) ? (bool) $b['sandbox'] : $c['sandbox'];
        if ($nextUrl !== '' && !BkashService::modeMatches($nextUrl, $nextSandbox)) {
            throw \Illuminate\Validation\ValidationException::withMessages(['bkash.base_url' => __('errors.bkash_mode_mismatch')]);
        }
        if ($b['clear'] ?? false) {
            foreach ([...BkashService::SECRET_FIELDS, 'base_url', 'sandbox'] as $k) PlatformSetting::write("bkash_{$k}", null, $by);
            $changed[] = 'bkash';
        }
        if (array_key_exists('base_url', $b)) { PlatformSetting::write('bkash_base_url', $b['base_url'] ?: null, $by); $changed[] = 'bkash.base_url'; }
        if (array_key_exists('sandbox', $b)) { PlatformSetting::write('bkash_sandbox', (bool) $b['sandbox'], $by); $changed[] = 'bkash.sandbox'; }
        foreach (BkashService::SECRET_FIELDS as $k) {
            if (filled($b[$k] ?? null)) { PlatformSetting::write("bkash_{$k}", Crypt::encryptString(trim($b[$k])), $by); $changed[] = "bkash.{$k}"; }
        }
        if ($changed) AuditLog::record('platform.sms_settings', PlatformSetting::where('setting_key', 'sms_rate')->first() ?? PlatformSetting::first(), ['changed' => $changed]);
        $data = $this->state();
        if ($f['bkash_test'] ?? false) {
            $data['bkash']['test_ok'] = $this->bkash->test();
            $data['bkash']['test_error'] = $data['bkash']['test_ok'] ? null : $this->bkash->lastError();   // e.g. "token: cURL error 60: SSL certificate problem ..."
        }
        return response()->json(['success' => true, 'data' => $data, 'message' => __('messages.saved')]);
    }

    private function state(): array
    {
        $stored = PlatformSetting::read('sms_universal_api_key');
        $key = $stored ? Crypt::decryptString($stored) : (string) config('services.bulksmsbd.api_key');
        $month = SmsLog::where('route', 'universal')->where('status', 'sent')->where('sent_at', '>=', now()->startOfMonth());
        return [
            'rate' => $this->sms->rate(),
            'sender_id' => PlatformSetting::read('sms_universal_sender_id'),
            'effective_sender' => $this->sms->universalRoute()['sid'] ?: null,
            'api_key_set' => $key !== '', 'api_key_source' => $stored ? 'panel' : ($key !== '' ? 'server' : null),
            'api_key_hint' => $key !== '' ? '••••' . substr($key, -4) : null,
            'driver' => config('services.sms.driver'),
            'sent_this_month' => (clone $month)->count(),
            'charged_this_month' => \App\Support\Money::format(\App\Support\Money::toPaisa((string) ((clone $month)->sum('cost') ?: '0'))),
            'bkash' => $this->bkashState(),
        ];
    }

    private function bkashState(): array
    {
        $c = $this->bkash->credentials();
        $hint = fn (string $v) => $v === '' ? null : '••••' . substr($v, -4);
        $out = ['base_url' => $c['base_url'] ?: null, 'sandbox' => $c['sandbox'], 'configured' => $this->bkash->configured()];
        foreach (BkashService::SECRET_FIELDS as $k) {
            $out[$k] = ['set' => $c[$k] !== '', 'hint' => $hint($c[$k]), 'source' => PlatformSetting::read("bkash_{$k}") ? 'panel' : ($c[$k] !== '' ? 'server' : null)];
        }
        return $out;
    }
}
