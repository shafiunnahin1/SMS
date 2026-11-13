<?php

namespace App\Http\Controllers\Sms;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Sms\SmsEventPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// D208 SMSC.3: the admin's per-event SMS switch - off, auto or manual - stored in institutions.settings.sms_events.
class SmsEventController extends Controller
{
    public function __construct(private SmsEventPolicy $policy) {}

    /** GET /admin/settings/sms-events */
    public function show()
    {
        return response()->json(['success' => true, 'data' => $this->state()]);
    }

    /** PUT /admin/settings/sms-events {events: {key: mode}} - only the keys sent change */
    public function update(Request $request)
    {
        $rules = ['events' => 'required|array|min:1'];
        foreach (SmsEventPolicy::keys() as $k) $rules["events.$k"] = ['sometimes', Rule::in(SmsEventPolicy::MODES)];
        $request->validate($rules);
        $events = (array) $request->input('events');
        $unknown = array_diff(array_keys($events), SmsEventPolicy::keys());
        if ($unknown) throw \Illuminate\Validation\ValidationException::withMessages(['events' => __('validation.in', ['attribute' => 'events'])]);

        $i = app('currentInstitution');
        $before = $this->policy->modes($i);
        $settings = $i->settings ?? [];
        $settings['sms_events'] = array_merge((array) ($settings['sms_events'] ?? []), $events);
        $changed = array_filter($events, fn ($m, $k) => $before[$k] !== $m, ARRAY_FILTER_USE_BOTH);
        DB::transaction(function () use ($i, $settings, $changed) {
            $i->forceFill(['settings' => $settings])->save();
            if ($changed) AuditLog::record('sms_events.updated', $i, ['events' => $changed]);
        });
        return response()->json(['success' => true, 'data' => $this->state(), 'message' => __('messages.saved')]);
    }

    private function state(): array
    {
        $i = app('currentInstitution')->fresh();
        return ['events' => $this->policy->modes($i), 'defaults' => SmsEventPolicy::EVENTS, 'transactional' => SmsEventPolicy::TRANSACTIONAL];
    }
}
