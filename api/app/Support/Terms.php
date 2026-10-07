<?php

// Backend terminology (PDF, SMS, Excel, API messages): never write "Class/Section/Batch/Course" literally.
// For each language of the chain (the asked one, then config i18n.fallback - docs/I18N.md section 6):
// institution override -> institution type default; nothing anywhere -> the key itself (docs/modules/institution-types.md).
if (!function_exists('term')) {
    function term(string $key, ?string $locale = null): string
    {
        $institution = app('currentInstitution');
        $locale ??= app()->getLocale();
        foreach ([$locale, ...config("i18n.fallback.{$locale}", [])] as $l) {
            foreach ([$institution->terminology[$key][$l] ?? null, config("institution_types.{$institution->institution_type}.terms.{$key}.{$l}")] as $word) {
                if ($word !== null && $word !== '') return $word;           // an empty override never hides the type default
            }
        }
        return $key;
    }
}
