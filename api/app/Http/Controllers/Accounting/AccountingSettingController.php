<?php
namespace App\Http\Controllers\Accounting;
use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog,Voucher};
use App\Services\Accounting\{AccountingPostingService,AccountingService};
use App\Support\Tenancy;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// R3.10 / D106 (accounting.md §1.4-§1.5, §5): start date, period lock, expense map, opening balances and repost
class AccountingSettingController extends Controller
{
    public function update(Request $request, AccountingService $accounting)
    {
        if (array_diff(array_keys($request->all()), ['start_date', 'locked_until', 'expense_map', 'reason'])) abort(422);
        $data = $request->validate(['start_date' => 'sometimes|date_format:Y-m-d', 'locked_until' => 'sometimes|nullable|date_format:Y-m-d',
            'expense_map' => 'sometimes|array|max:200', 'expense_map.*' => ['string', 'regex:/^5\d{3}(\.[A-Za-z0-9_-]{1,15})?$/'], 'reason' => 'sometimes|string|max:255']);
        $current = $accounting->settings();
        // §1.5: the lock moves only by an admin, with a reason (audited)
        if (array_key_exists('locked_until', $data) && $data['locked_until'] !== $current['locked_until']) {
            if ($request->user()->role !== 'admin') throw new AuthorizationException();
            if (trim($data['reason'] ?? '') === '') abort(422);
        }
        // §1.4: the start date is fixed once any voucher exists (history is not moved under posted books)
        if (isset($data['start_date']) && $data['start_date'] !== $current['start_date'] && Voucher::exists())
            throw new BusinessException(__('accounting.conflict'), 'accounting_started', 409);
        $settings = DB::transaction(function () use ($data, $request) {
            $institution = Tenancy::current();
            $institution->newQuery()->whereKey($institution->id)->lockForUpdate()->firstOrFail(); $institution->refresh();
            $all = $institution->settings ?? [];
            $all['accounting'] = array_replace(is_array($all['accounting'] ?? null) ? $all['accounting'] : [], array_intersect_key($data, array_flip(['start_date', 'locked_until', 'expense_map'])));
            $institution->forceFill(['settings' => $all])->save();
            AuditLog::create(['institution_id' => $institution->id, 'user_id' => $request->user()->id, 'action' => 'accounting.settings.updated', 'model' => 'Institution', 'model_id' => $institution->id,
                'new_data' => array_intersect_key($data, array_flip(['start_date', 'locked_until', 'reason']))]);
            return $all['accounting'];
        });
        return response()->json(['success' => true, 'data' => $settings]);
    }

    public function opening(Request $request, AccountingService $accounting)
    {
        $data = $request->validate(['balances' => 'required|array|min:1|max:200']);
        $voucher = $accounting->opening($request->user(), $data['balances']);
        return response()->json(['success' => true, 'data' => ['id' => $voucher->id, 'voucher_no' => $voucher->voucher_no, 'date' => $voucher->date->toDateString()]], 201);
    }

    public function repost(Request $request, AccountingPostingService $posting)
    {
        $data = $request->validate(['from' => 'required|date_format:Y-m-d', 'to' => 'required|date_format:Y-m-d|after_or_equal:from']);
        $result = $posting->repost($data['from'], $data['to']);
        AuditLog::create(['institution_id' => Tenancy::current()->id, 'user_id' => $request->user()->id, 'action' => 'accounting.repost', 'model' => 'Institution', 'model_id' => Tenancy::current()->id, 'new_data' => ['posted' => $result['posted']]]);
        return response()->json(['success' => true, 'data' => $result]);
    }
}
