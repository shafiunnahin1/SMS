<?php
namespace App\Http\Controllers\Accounting;
use App\Http\Controllers\Controller;
use App\Models\Budget;
use App\Services\Accounting\BudgetService;
use Illuminate\Http\Request;

// R3.10 / D106 (accounting.md §4, §6): budgets are edited while draft; approval is the admin's
class BudgetController extends Controller
{
    public function index(Request $request)
    {
        $f = $request->validate(['fiscal_year' => 'sometimes|string|max:9']);
        return response()->json(['success' => true, 'data' => Budget::query()->when($f['fiscal_year'] ?? null, fn ($q, $y) => $q->where('fiscal_year', $y))->orderByDesc('id')->get()]);
    }

    public function store(Request $request, BudgetService $budgets)
    {
        return response()->json(['success' => true, 'data' => $budgets->create($request->user(), $request->all())], 201);
    }

    public function show(int $id)
    {
        return response()->json(['success' => true, 'data' => Budget::with('lines')->findOrFail($id)]);
    }

    public function update(Request $request, int $id, BudgetService $budgets)
    {
        Budget::findOrFail($id);   // another institution's budget is 404 before any validation
        return response()->json(['success' => true, 'data' => $budgets->update($request->user(), $id, $request->all())]);
    }

    public function lines(Request $request, int $id, BudgetService $budgets)
    {
        Budget::findOrFail($id);
        return response()->json(['success' => true, 'data' => $budgets->lines($request->user(), $id, $request->all())]);
    }

    public function approve(Request $request, int $id, BudgetService $budgets)
    {
        Budget::findOrFail($id);
        return response()->json(['success' => true, 'data' => $budgets->approve($request->user(), $id)]);
    }
}
