<?php

// Backend terminology (PDF, SMS, Excel, API messages): never write "Class/Section/Batch/Course" literally.
// Order: institution override -> institution type default -> the key itself (docs/modules/institution-types.md).
if (!function_exists('term')) {
    function term(string $key, ?string $locale = null): string
    {
        $institution = app('currentInstitution');
        $locale ??= app()->getLocale();
        return $institution->terminology[$key][$locale]
            ?? config("institution_types.{$institution->institution_type}.terms.{$key}.{$locale}")
            ?? $key;
    }
}
