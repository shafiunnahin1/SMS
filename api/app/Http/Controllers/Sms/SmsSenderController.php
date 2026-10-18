<?php

namespace App\Http\Controllers\Sms;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Sms\UpdateSmsSenderRequest;
use App\Models\AuditLog;
use App\Services\SmsService;
use Illuminate\Support\Facades\DB;

// D59 (owner, 2026-10-10): the institution's SMS route. Two switches - the universal API (charged from the wallet) and the
// institution's own BulkSMSBD API (its key + masking sender, never charged). The key is stored encrypted and never returned:
// the page only sees whether one is set and its last four characters. Replaces the R2 sender-ID approval flow.
class SmsSenderController extends Controller
{
    public function __construct(private SmsService $sms) {}

    /** GET /admin/settings/sms-sender */
    public function show()
    {
        return response()->json(['success' => true, 'data' => $this->state()]);
    }

    /** PUT /admin/settings/sms-sender */
    public function update(UpdateSmsSenderRequest $request)
    {
        $i = app('currentInstitution');
        $in = $request->validated();
        $changes = [];
        if (array_key_exists('universal_enabled', $in)) $changes['sms_universal_enabled'] = (bool) $in['universal_enabled'];
        if (array_key_exists('own_enabled', $in)) $changes['sms_own_enabled'] = (bool) $in['own_enabled'];
        if (array_key_exists('sender_id', $in)) $changes['sms_sender_id'] = $in['sender_id'] ?: null;
        if (filled($in['api_key'] ?? null)) $changes['sms_api_key'] = trim($in['api_key']);

        $i->forceFill($changes);
        if ($i->sms_own_enabled && (!$i->sms_api_key || !$i->sms_sender_id)) {
            throw new BusinessException('own SMS API needs a key and a sender', 'sms_own_incomplete', 422);
        }
        DB::transaction(function () use ($i, $changes) {
            $i->save();
            // who changed which switch; never the key itself (G9)
            AuditLog::record('sms_sender.updated', $i, collect($changes)->except('sms_api_key')->all() + (isset($changes['sms_api_key']) ? ['api_key' => 'changed'] : []));
        });
        return response()->json(['success' => true, 'data' => $this->state(), 'message' => __('messages.saved')]);
    }

    /** DELETE /admin/settings/sms-sender: forget the own key and sender; the own route goes off */
    public function destroy()
    {
        $i = app('currentInstitution');
        DB::transaction(function () use ($i) {
            $i->forceFill(['sms_api_key' => null, 'sms_sender_id' => null, 'sms_own_enabled' => false])->save();
            AuditLog::record('sms_sender.removed', $i);
        });
        return response()->json(['success' => true, 'data' => $this->state(), 'message' => __('messages.saved')]);
    }

    private function state(): array
    {
        $i = app('currentInstitution')->fresh();
        $key = (string) $i->sms_api_key;
        $own = $this->sms->ownRoute($i);
        return [
            'universal_enabled' => (bool) $i->sms_universal_enabled,
            'own_enabled' => (bool) $i->sms_own_enabled,
            'sender_id' => $i->sms_sender_id,
            'api_key_set' => $key !== '',
            'api_key_hint' => $key !== '' ? '••••' . substr($key, -4) : null,
            'universal_sender' => $this->sms->universalRoute()['sid'],
            'effective' => $own ? 'own' : ($i->sms_universal_enabled ? 'universal' : 'off'),
            'rate' => $this->sms->rate(),
        ];
    }
}
