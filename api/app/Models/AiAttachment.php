<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D166 (5) AI-Q5: a chat photo read by OCR; the file lives one day in private storage (the text is never stored here)
class AiAttachment extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'user_id', 'path', 'mime', 'size_bytes', 'ocr_status', 'ocr_confidence', 'expires_at'];

    protected $casts = ['expires_at' => 'datetime', 'size_bytes' => 'integer'];
}
