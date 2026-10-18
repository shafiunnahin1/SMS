<?php
namespace App\Http\Controllers\Donations;
use App\Http\Controllers\Controller;
use App\Models\{DonationCampaign,DonationFund};
use App\Services\Donations\DonationService;
use Illuminate\Http\Request;

// R3.11 / D107 (donations.md §1, §3): campaigns collect into one fund; progress = raised vs goal
class DonationCampaignController extends Controller
{
    public function index(Request $request)
    {
        $f = $request->validate(['fund_id' => 'sometimes|integer|min:1', 'status' => 'sometimes|in:draft,active,closed']);
        return response()->json(['success' => true, 'data' => DonationCampaign::query()->when($f['fund_id'] ?? null, fn ($q, $id) => $q->where('fund_id', $id))
            ->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))->orderByDesc('id')->get()]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request, true);
        DonationFund::findOrFail($data['fund_id']);
        return response()->json(['success' => true, 'data' => DonationCampaign::create($data)], 201);
    }

    public function show(int $id)
    {
        return response()->json(['success' => true, 'data' => DonationCampaign::findOrFail($id)]);
    }

    public function update(Request $request, int $id)
    {
        $campaign = DonationCampaign::findOrFail($id);
        $campaign->fill($this->validated($request, false))->save();
        return response()->json(['success' => true, 'data' => $campaign]);
    }

    public function progress(int $id, DonationService $donations)
    {
        return response()->json(['success' => true, 'data' => $donations->progress($id)]);
    }

    private function validated(Request $request, bool $create): array
    {
        if (array_diff(array_keys($request->all()), $create ? ['fund_id', 'title', 'goal_amount', 'starts_on', 'ends_on', 'status'] : ['title', 'goal_amount', 'starts_on', 'ends_on', 'status'])) abort(422);
        $req = $create ? 'required' : 'sometimes';
        return $request->validate(['fund_id' => $req.'|integer|min:1', 'title' => $req.'|string|max:150', 'goal_amount' => ['sometimes', 'nullable', 'regex:/^\d{1,10}(\.\d{1,2})?$/'],
            'starts_on' => 'sometimes|nullable|date_format:Y-m-d', 'ends_on' => 'sometimes|nullable|date_format:Y-m-d|after_or_equal:starts_on', 'status' => 'sometimes|in:draft,active,closed']);
    }
}
