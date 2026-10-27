<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

class QbOmrForm extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'qb_paper_id', 'code', 'settings_json', 'layout_version', 'locked_at'];

    protected $casts = [
        'layout_version' => 'integer',
        'locked_at' => 'datetime',
    ];

    /** QbOmrFormService's settings order (D172: MySQL JSON does not keep key order; unknown keys follow) */
    private const SETTINGS_ORDER = ['title', 'roll_digits', 'option_count', 'option_labels', 'page_size', 'page_orientation', 'answer_columns', 'question_count',
        'subject_blocks', 'subtitle', 'title_size', 'subtitle_size', 'font', 'theme_color', 'entry_mode', 'info_boxes', 'marking'];

    protected function settingsJson(): Attribute
    {
        return Attribute::make(
            get: function ($value) {
                $settings = $value === null ? null : json_decode($value, true);
                return is_array($settings) ? array_merge(array_intersect_key(array_flip(self::SETTINGS_ORDER), $settings), $settings) : $settings;
            },
            set: fn ($value) => $value === null ? null : json_encode($value),
        );
    }
}