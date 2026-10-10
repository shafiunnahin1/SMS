<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\Institution;
use App\Services\Privacy\TenantPurgeService;
use Illuminate\Http\Request;

// privacy-and-consent.md 5.3 (D27): list who may be purged, show what a purge removes, then remove it - only after the Super
// Admin types the address (slug) and confirms in writing that the institution was given its data.
class TenantPurgeController extends Controller
{
    public function __construct(private TenantPurgeService $purge) {}

    /** GET /super/tenant-purge/candidates */
    public function candidates()
    {
        return response()->json(['success' => true, 'data' => $this->purge->candidates()->map(fn ($i) => ['id' => $i->id, 'name' => $i->name, 'slug' => $i->slug,
            'status' => $i->status, 'inactive_since' => $this->purge->inactiveSince($i)?->toIso8601String()])->values()]);
    }

    /** POST /super/tenant-purge/{institutionId}/dry-run */
    public function dryRun(int $institutionId)
    {
        return response()->json(['success' => true, 'data' => $this->purge->dryRun(Institution::findOrFail($institutionId))]);
    }

    /** POST /super/tenant-purge/{institutionId}/execute {confirm_slug, confirm_export_sent: true} */
    public function execute(Request $request, int $institutionId)
    {
        $i = Institution::findOrFail($institutionId);
        $request->validate(['confirm_slug' => 'required|string|max:100', 'confirm_export_sent' => 'accepted']);
        if ($request->input('confirm_slug') !== $i->slug) throw new BusinessException('the typed address does not match', 'confirm_name_mismatch', 422);
        return response()->json(['success' => true, 'data' => $this->purge->execute($i, $request->user()->id), 'message' => __('messages.deleted')]);
    }
}
