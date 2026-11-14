<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Support\Tenancy;
use Illuminate\Http\Request;

// D214 MAD.2 (docs/modules/madrasa.md section 2): the secondary (Hijri) calendar is display only - settings.calendar.secondary
// (none | hijri) and settings.calendar.hijri_offset (-2..+2 days, the local moon sighting); stored dates never change. Every
// signed-in role reads it (to show the Hijri date); only the admin changes it.
class MadrasaSettingsController extends Controller
{
    public function show()
    {
        return response()->json(['success' => true, 'data' => $this->row()]);
    }

    public function update(Request $request)
    {
        $d = $request->validate(['secondary' => 'required|in:none,hijri', 'hijri_offset' => 'required|integer|between:-2,2']);
        $i = Tenancy::current();
        $settings = $i->settings ?? [];
        $settings['calendar'] = array_replace($settings['calendar'] ?? [], ['secondary' => $d['secondary'], 'hijri_offset' => (int) $d['hijri_offset']]);
        $i->forceFill(['settings' => $settings])->save();
        AuditLog::record('calendar.settings', $i, ['secondary' => $d['secondary']]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row()]);
    }

    private function row(): array
    {
        $c = data_get(Tenancy::current()->refresh()->settings ?? [], 'calendar', []);
        return ['secondary' => ($c['secondary'] ?? 'none') === 'hijri' ? 'hijri' : 'none', 'hijri_offset' => max(-2, min(2, (int) ($c['hijri_offset'] ?? 0)))];
    }
}
