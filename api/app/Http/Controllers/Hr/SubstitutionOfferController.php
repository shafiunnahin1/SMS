<?php

namespace App\Http\Controllers\Hr;

use App\Http\Controllers\Controller;
use App\Models\Teacher;
use App\Services\Substitution\SlotReadService;
use Illuminate\Http\Request;

// D200 SUBL.5 (docs/API.md D199): GET /teacher/substitution-offers - the teacher's own offered and confirmed covers that have
// not started; a teacher never sees another teacher's offers.
class SubstitutionOfferController extends Controller
{
    public function index(Request $request, SlotReadService $reads)
    {
        $me = Teacher::where('user_id', $request->user()->id)->first();
        return response()->json(['success' => true, 'data' => $me ? $reads->offers($me) : []]);
    }
}
