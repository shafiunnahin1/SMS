<?php

namespace App\Support\Pdf;

use MirazMac\BanglaString\Translator\BijoyAnsi;
use Throwable;

// D125: Bijoy (legacy ANSI Bangla) text -> Unicode, LINE BY LINE, so a PDF that mixes Bijoy and Unicode keeps every Unicode,
// English, number or LaTeX line exactly as it is. A line converts only when it shows qbank's Bijoy signals and the result has
// more Bangla letters than before (qbank's own test in PdfTextExtractionService); the converter is qbank's mirazmac/bangla-string.
class BijoyConverter
{
    private static ?object $translator = null;

    /** @return array{0:string, 1:int} the text and how many lines were converted */
    public static function convert(string $text, bool $fontNamed): array
    {
        $converted = 0;
        $lines = preg_split('/\n/u', $text) ?: [];
        foreach ($lines as $i => $line) {
            $out = self::line($line, $fontNamed);
            if ($out !== $line) { $lines[$i] = $out; $converted++; }
        }
        return [implode("\n", $lines), $converted];
    }

    private static function line(string $line, bool $fontNamed): string
    {
        if (trim($line) === '') return $line;
        $signal = self::signal($line);
        $bangla = self::bangla($line);
        if ($signal < ($fontNamed ? 2 : 6) || ($bangla > 0 && $signal < 10)) return $line;   // Unicode or English text: never touched
        if (!self::distinctive($line)) {                             // only ASCII letters: most words must look like Bijoy, or it is English
            $words = preg_match_all('/[A-Za-z]{2,}/', $line) ?: 1;
            $pairs = preg_match_all('/[A-Za-z]*(?:Av|ev|cv|mv|nv|we|e¨|cÖ|DË|ÿv)[A-Za-z]*/u', $line) ?: 0;
            if ($pairs * 2 < $words || $pairs < 2) return $line;
        }
        try {                                                        // LaTeX inside the line is kept as it is
            $parts = preg_split('/(\\\\\(.*?\\\\\)|\\\\\[.*?\\\\\]|\$[^$]+\$)/u', $line, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$line];
            $out = '';
            foreach ($parts as $k => $part) $out .= $k % 2 ? $part : (string) self::translator()->translate($part);
        } catch (Throwable) {
            return $line;
        }
        $out = str_replace(["অা", "\u{09C7}\u{09BE}", "\u{09C7}\u{09D7}"], ["আ", "\u{09CB}", "\u{09CC}"], $out);   // the package writes আ, ো, ৌ in parts
        $out = class_exists(\Normalizer::class) ? (\Normalizer::normalize($out, \Normalizer::FORM_C) ?: $out) : $out;
        return self::bangla($out) >= 3 && self::bangla($out) > $bangla ? $out : $line;
    }

    /** qbank's legacySignalScore: Bijoy-only characters and common Bijoy letter pairs */
    public static function signal(string $text): int
    {
        return (preg_match_all('/[†‡‰Š‹ŒŽ‘’“”•–—˜™š›œžŸØÿ¯]/u', $text) ?: 0)
            + 2 * (preg_match_all('/(?:Av|ev|cv|mv|nv|we|‡K|†K|K‡|M‡|e¨|cÖ|DË|¯\^|ÿv)/u', $text) ?: 0);
    }

    private static function distinctive(string $text): bool
    {
        return preg_match('/[†‡‰Š‹ŒŽ‘’“”•–—˜™š›œžŸØÿ¯Ö¨Ë]/u', $text) === 1;
    }

    private static function bangla(string $text): int
    {
        return preg_match_all('/[\x{0980}-\x{09FF}]/u', $text) ?: 0;
    }

    private static function translator(): object
    {
        if (self::$translator === null) {
            // the package declares a private __wakeup(), which PHP 8 warns about once when the class loads - harmless, so only that
            // one warning is swallowed while it loads; anything else still reaches the normal handler
            set_error_handler(fn ($no, $msg) => str_contains($msg, '__wakeup()') ? true : false);
            try { class_exists(BijoyAnsi::class); } finally { restore_error_handler(); }
            self::$translator = BijoyAnsi::getInstance();
        }
        return self::$translator;
    }
}
