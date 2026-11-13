<?php

namespace App\Http\Controllers\Memo;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Memo\MemoService;
use App\Support\BanglaFormat;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// D210 MEMO.1: GET|PUT /admin/settings/memo - the institution's own memo codes (exact digit counts) and one subject code per
// document kind; the answer shows an example number in Latin and in Bangla digits.
class MemoSettingsController extends Controller
{
    public function __construct(private MemoService $memos) {}

    public function show()
    {
        return response()->json(['success' => true, 'data' => $this->state()]);
    }

    public function update(Request $request)
    {
        $rules = ['subjects' => 'required|array'];
        foreach (MemoService::CODES as $k => $len) $rules[$k] = ['required', 'string', 'regex:/^\d{' . $len . '}$/'];
        foreach (MemoService::KINDS as $k) $rules["subjects.$k"] = ['required', 'string', 'regex:/^\d{2}$/'];
        $d = $request->validate($rules);
        $i = app('currentInstitution');
        $settings = $i->settings ?? [];
        $settings['memo'] = array_intersect_key($d, MemoService::CODES) + ['subjects' => array_intersect_key($d['subjects'], MemoService::DEFAULT_SUBJECTS)];
        DB::transaction(function () use ($i, $settings) {
            $i->forceFill(['settings' => $settings])->save();
            AuditLog::record('memo_settings.updated', $i, $settings['memo']);
        });
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->state()]);
    }

    private function state(): array
    {
        $s = $this->memos->settings(app('currentInstitution')->fresh());
        $example = implode('.', [$s['ministry'], $s['office'], $s['geo'], $s['sub_institution'], $s['branch'], $s['subjects']['tc'], '0001', now()->format('y')]) . '.1';
        return $s + ['example' => $example, 'example_bn' => BanglaFormat::digits($example), 'date_line' => BanglaFormat::dateLine(now()), 'kinds' => MemoService::KINDS];
    }
}
