<?php

namespace App\Traits;

use App\Support\QbRichText;

// D72 (QB.12): the using model lists its formatted text columns in RICH_TEXT; whatever writes them (the editor, the qbank import,
// a seeder) is cleaned to qbank's vocabulary before it is stored.
trait CleansRichText
{
    protected static function bootCleansRichText(): void
    {
        static::saving(function ($model) {
            foreach (static::RICH_TEXT as $field) {
                if ($model->isDirty($field) && $model->{$field} !== null) $model->{$field} = QbRichText::clean($model->{$field});
            }
        });
    }
}
