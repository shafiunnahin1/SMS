<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, ModulePrice};
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D187 SUB.1: the Super Admin sets each paid module's one price (D47), monthly and yearly. Prices start at 0 until the owner sets
// them; a change is a new row (history kept), never an edit.
class ModulePriceController extends Controller
{
    public static function paidModules(): array
    {
        $keys = [];
        foreach (config('institution_types', []) as $type => $def) {
            if (!is_array($def) || !isset($def['modules']) || in_array($type, config('subscriptions.exempt_types', []), true)) continue;
            $keys = array_merge($keys, $def['modules']);
        }
        return array_values(array_unique(array_diff($keys, config('subscriptions.free_modules', []))));
    }

    public function index()
    {
        $current = ModulePrice::current();
        $rows = array_map(fn ($k) => ['module_key' => $k, 'monthly_price' => isset($current[$k]) ? $current[$k]->monthly_price : '0.00',
            'yearly_price' => isset($current[$k]) ? $current[$k]->yearly_price : '0.00',
            'effective_from' => isset($current[$k]) ? $current[$k]->effective_from?->toIso8601String() : null], self::paidModules());
        return response()->json(['success' => true, 'data' => $rows]);
    }

    public function store(Request $request)
    {
        $f = $request->validate([
            'module_key' => ['required', 'string', Rule::in(self::paidModules())],
            'monthly_price' => 'required|decimal:0,2|min:0|max:99999999',
            'yearly_price' => 'required|decimal:0,2|min:0|max:99999999',
        ]);
        $row = ModulePrice::create($f + ['effective_from' => now(), 'created_by' => $request->user()->id]);
        AuditLog::record('module_price.set', $request->user(), ['module_key' => $f['module_key']]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => [
            'module_key' => $row->module_key, 'monthly_price' => $row->monthly_price, 'yearly_price' => $row->yearly_price,
            'effective_from' => $row->effective_from->toIso8601String()]], 201);
    }
}
