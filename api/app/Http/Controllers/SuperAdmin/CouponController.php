<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Coupon, CouponRedemption};
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D187 (6): the Super Admin's coupons - percent off, last day to redeem, discount months, covered modules (all or chosen),
// institution types, total and per-institution limits. Pausing stops new redemptions; given discounts stay.
class CouponController extends Controller
{
    public function index()
    {
        $used = CouponRedemption::anyInstitution()->whereNotNull('invoice_id')->selectRaw('coupon_id, SUM(discount_amount) AS total')->groupBy('coupon_id')->pluck('total', 'coupon_id');
        return response()->json(['success' => true, 'data' => Coupon::orderByDesc('id')->limit(500)->get()->map(fn ($c) => self::row($c) + ['discount_given' => (string) ($used[$c->id] ?? '0.00')])->values()]);
    }

    public function store(Request $request)
    {
        $types = array_keys(array_filter(config('institution_types'), fn ($d) => is_array($d) && isset($d['modules'])));
        $f = $request->validate([
            'code' => ['required', 'string', 'max:30', 'regex:/^[A-Za-z0-9-]{3,30}$/', Rule::unique('coupons', 'code')],
            'value' => 'required|decimal:0,2|min:1|max:100',
            'valid_until' => 'required|date|after_or_equal:today',
            'discount_months' => 'required|integer|min:1|max:120',
            'applies_to_modules' => 'nullable|array', 'applies_to_modules.*' => ['string', Rule::in(ModulePriceController::paidModules())],
            'applies_to_types' => 'nullable|array', 'applies_to_types.*' => ['string', Rule::in($types)],
            'max_redemptions' => 'nullable|integer|min:1|max:1000000',
            'per_institution_limit' => 'nullable|integer|min:1|max:100',
            'note' => 'nullable|string|max:255',
        ]);
        $f['code'] = strtoupper($f['code']);
        if (Coupon::where('code', $f['code'])->exists()) return response()->json(['success' => false, 'error' => 'validation_failed', 'message' => __('errors.validation_failed'), 'errors' => ['code' => [__('validation.unique', ['attribute' => 'code'])]]], 422);
        $c = Coupon::create($f + ['type' => 'percent', 'valid_from' => today(), 'per_institution_limit' => $f['per_institution_limit'] ?? 1,
            'status' => 'active', 'created_by' => $request->user()->id, 'applies_to_modules' => ($f['applies_to_modules'] ?? null) ?: null, 'applies_to_types' => ($f['applies_to_types'] ?? null) ?: null]);
        AuditLog::record('coupon.created', $request->user(), ['coupon_id' => $c->id]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($c->fresh())], 201);
    }

    /** PATCH /super/coupons/{id}/status {status: active|paused} */
    public function status(Request $request, int $id)
    {
        $f = $request->validate(['status' => 'required|in:active,paused']);
        $c = Coupon::findOrFail($id);
        $c->update(['status' => $f['status']]);
        AuditLog::record('coupon.' . $f['status'], $request->user(), ['coupon_id' => $c->id]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => self::row($c)]);
    }

    private static function row(Coupon $c): array
    {
        return ['id' => $c->id, 'code' => $c->code, 'percent' => $c->value, 'valid_until' => $c->valid_until?->toDateString(), 'discount_months' => $c->discount_months,
            'applies_to_modules' => $c->applies_to_modules, 'applies_to_types' => $c->applies_to_types, 'max_redemptions' => $c->max_redemptions,
            'per_institution_limit' => $c->per_institution_limit, 'redeemed_count' => (int) $c->redeemed_count, 'status' => $c->status, 'note' => $c->note];
    }
}
