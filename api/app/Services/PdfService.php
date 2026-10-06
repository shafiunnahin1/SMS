<?php

namespace App\Services;

use App\Support\Tenancy;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

// docs/modules/pdf-reports.md. The engine choice for Bengali/Arabic shaping is decided in Spike step S5c - this class is the one
// place to swap it. The concrete documents (receipt, marksheet, ID card) come with Steps 4.4/4.5/4.8.
class PdfService
{
    /** Render a Blade view to PDF bytes; every view gets the theme, the locale and its direction */
    public function render(string $view, array $data = [], string $paper = 'a4', string $orientation = 'portrait'): string
    {
        $institution = Tenancy::current();
        $locale = app()->getLocale();
        $shared = [
            'institution' => $institution,
            'theme' => $institution ? app(ThemeService::class)->getTheme($institution) : app(ThemeService::class)->defaultTheme(),
            'locale' => $locale,
            'dir' => $locale === 'ar' ? 'rtl' : 'ltr',
        ];
        return Pdf::loadView($view, $data + $shared)->setPaper($paper, $orientation)->output();
    }

    /** Store a generated PDF as a temporary file of the current institution (docs/architecture/file-storage.md: tmp, private disk) */
    public function storeTemporary(string $bytes): string
    {
        $path = 'institutions/' . Tenancy::current()->id . '/tmp/' . Str::uuid() . '.pdf';
        Storage::disk('private')->put($path, $bytes);
        return $path;
    }
}
