<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Models\QbMedia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

// QB.3 (D65, docs/modules/question-bank.md §3খ): a picture for a question - stored on the platform's PRIVATE disk under
// platform/qb/ (never public: answers can be pictures too) and shown through short-lived signed links. Raster images only
// (no SVG: it can carry script). The question links it on save (qb_media_links); an unlinked upload stays unused.
class QbMediaController extends Controller
{
    public const MAX_KB = 2048;

    /** POST /writer/media {file} */
    public function store(Request $request)
    {
        $f = $request->validate(['file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,gif', 'mimetypes:image/jpeg,image/png,image/webp,image/gif', 'max:' . self::MAX_KB]]);
        $path = Storage::disk('private')->putFile('platform/qb/' . now()->format('Y/m'), $f['file']);
        $media = QbMedia::create(['path' => $path, 'mime' => $f['file']->getMimeType(), 'size_bytes' => $f['file']->getSize(), 'uploaded_by' => $request->user()->id]);
        return response()->json(['success' => true, 'data' => self::view($media)], 201);
    }

    /** id + a 10-minute signed link (the private disk's temporaryUrl) */
    public static function view(QbMedia $m): array
    {
        return ['id' => $m->id, 'mime' => $m->mime, 'url' => Storage::disk('private')->temporaryUrl($m->path, now()->addMinutes(10))];
    }
}
