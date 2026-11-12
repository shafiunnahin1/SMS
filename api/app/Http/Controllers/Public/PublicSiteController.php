<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Services\PublicSite\PublicSiteService;
use Illuminate\Http\Request;

// D202 PUB.2 (docs/modules/public-website.md "API"): the institution's public site on its own host, no login. Module off -> 403
// (route middleware); module on but the site switched off -> 404. Only what the institution chose to publish - never a student,
// user, fee or result.
class PublicSiteController extends Controller
{
    public function __construct(private PublicSiteService $site) {}

    public function show()
    {
        $i = app('currentInstitution');
        abort_unless($this->site->settings($i)['enabled'], 404);
        return response()->json(['success' => true, 'data' => $this->site->payload($i)]);
    }

    /** GET /public/notices?page= - ten a page, public notices already published */
    public function notices(Request $request)
    {
        $i = app('currentInstitution');
        abort_unless($this->site->settings($i)['enabled'], 404);
        $request->validate(['page' => 'nullable|integer|min:1|max:1000']);
        $page = $this->site->notices()->paginate(10);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($n) => $this->site->notice($n))->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
    }
}
