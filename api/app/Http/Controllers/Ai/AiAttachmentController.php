<?php

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Models\AiAttachment;
use App\Services\Ai\OcrService;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * D166 (5) AI-Q5: POST /ai/attachments - a photo of a question is read on our own server and the text comes back to the chat box,
 * where the user corrects it (formulas in MathLive) before searching; nothing is searched or stored as text here. The photo stays
 * one day in private storage (ai:attachments-purge), and goes at once when the student's data is erased.
 */
class AiAttachmentController extends Controller
{
    public function store(Request $request, OcrService $ocr)
    {
        $file = $request->validate(['image' => 'required|file|mimes:jpg,jpeg,png,webp|max:5120'])['image'];
        $i = Tenancy::current();
        $path = $file->storeAs("institutions/{$i->id}/ai-attachments/{$request->user()->id}", Str::uuid() . '.' . $file->extension(), 'private');
        $read = $ocr->read(Storage::disk('private')->path($path));
        $row = AiAttachment::create(['institution_id' => $i->id, 'user_id' => $request->user()->id, 'path' => $path, 'mime' => (string) $file->getMimeType(),
            'size_bytes' => (int) $file->getSize(), 'ocr_status' => $read['status'], 'ocr_confidence' => $read['confidence'], 'expires_at' => now()->addDay()]);
        $message = ['unsupported' => __('ai.ocr.unsupported'), 'failed' => __('ai.ocr.failed')][$read['status']] ?? null;
        return response()->json(['success' => true, 'message' => $message, 'data' => ['id' => $row->id, 'status' => $read['status'],
            'text' => $read['text'], 'formulas' => $read['formulas'], 'confidence' => $read['confidence']]], 201);
    }

    /** the files and rows of one user (D166 (5): at once on erasure) */
    public static function forget(int $userId): void
    {
        foreach (AiAttachment::where('user_id', $userId)->get() as $a) {
            Storage::disk('private')->delete($a->path);
            $a->delete();
        }
    }
}
