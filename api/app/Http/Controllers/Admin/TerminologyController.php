<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateTerminologyRequest;
use App\Http\Resources\TerminologyResource;
use Illuminate\Support\Facades\Cache;

// GET|PUT /admin/settings/terminology -> institutions.terminology (docs/API.md "Settings & Super Admin Additions")
class TerminologyController extends Controller
{
    public function show()
    {
        return response()->json(['success' => true, 'data' => new TerminologyResource(app('currentInstitution'))]);
    }

    public function update(UpdateTerminologyRequest $request)
    {
        $institution = app('currentInstitution');
        $institution->update(['terminology' => $request->overrides() ?: null]);
        Cache::forget("bootstrap:{$institution->id}");

        return response()->json(['success' => true, 'data' => new TerminologyResource($institution->fresh()), 'message' => __('messages.terminology_saved')]);
    }
}
