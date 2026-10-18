<?php

namespace App\Models;

use App\Traits\BelongsToOptionalInstitution;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use BelongsToOptionalInstitution;

    const UPDATED_AT = null;

    protected $fillable = [
        'institution_id',
        'user_id',
        'action',
        'model',
        'model_id',
        'old_data',
        'new_data',
        'ip_address',
    ];

    protected $casts = [
        'old_data' => 'array',
        'new_data' => 'array',
    ];

    public function user() { return $this->belongsTo(User::class); }

    /** Actor = the logged-in user, or the subject itself for system actions (lockout); the row belongs to the subject's institution */
    public static function record(string $action, Model $subject, array $data = []): self
    {
        $institutionId = $subject instanceof Institution ? $subject->id : ($subject->institution_id ?? null);
        return static::create([
            'institution_id' => $institutionId,
            'user_id'        => auth()->id() ?? ($subject instanceof User ? $subject->id : null),
            'action'         => $action,
            'model'          => class_basename($subject),
            'model_id'       => $subject->getKey(),
            'new_data'       => $data ?: null,
            'ip_address'     => request()?->ip(),
        ]);
    }
}
