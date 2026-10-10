<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, PlatformSetting, SmsLog};
use App\Services\SmsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;

// D56/D57 (owner, 2026-10-10): the universal BulkSMSBD API every institution's wallet pays for - its key (stored encrypted,
// write-only; only the last 4 characters come back), its sender ID and the price of one SMS part. Empty values fall back to
// the server config (BULKSMSBD_*, SMS_RATE). The BulkSMSBD account balance itself is not read: no balance API was given (D57).
class UniversalSmsController extends Controller
{
    public function __construct(private SmsService $sms) {}

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
        ]);
        $by = $request->user()->id;
        $changed = [];
        if (array_key_exists('rate', $f)) { PlatformSetting::write('sms_rate', \App\Support\Money::format(\App\Support\Money::toPaisa((string) $f['rate'])), $by); $changed[] = 'rate'; }
        if (array_key_exists('sender_id', $f)) { PlatformSetting::write('sms_universal_sender_id', $f['sender_id'] ?: null, $by); $changed[] = 'sender_id'; }
        if (filled($f['api_key'] ?? null)) { PlatformSetting::write('sms_universal_api_key', Crypt::encryptString(trim($f['api_key'])), $by); $changed[] = 'api_key'; }
        elseif ($f['clear_api_key'] ?? false) { PlatformSetting::write('sms_universal_api_key', null, $by); $changed[] = 'api_key'; }
        if ($changed) AuditLog::record('platform.sms_settings', PlatformSetting::where('setting_key', 'sms_rate')->first() ?? PlatformSetting::first(), ['changed' => $changed]);
        return response()->json(['success' => true, 'data' => $this->state(), 'message' => __('messages.saved')]);
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
        ];
    }
}
