<?php

namespace App\Support\Pdf;

use RuntimeException;
use Smalot\PdfParser\Parser;
use Throwable;

// D124 (R2.1.4): qbank's PdfTextExtractionService - the text of each page of a PDF, read locally with smalot/pdfparser (no outside
// service). A page with fewer than 25 meaningful characters is unreadable; no readable page = "scanned", some = "hybrid". A PDF
// made with a legacy Bijoy font (SutonnyMJ etc.) is detected and reported; converting it needs its own decision (BLOCKED.md).
class PdfTextExtractor
{
    public const MIN_PAGE_CHARACTERS = 25;

    /** @return array{total_pages:int, page_from:int, page_to:int, document_kind:string, unreadable_pages:list<int>, legacy_bijoy:bool, pages:list<array{page_number:int, text:string, readable:bool}>} */
    public function extract(string $bytes, ?int $pageFrom = null, ?int $pageTo = null): array
    {
        try {
            $pages = array_values((new Parser)->parseContent($bytes)->getPages());
        } catch (Throwable $e) {
            throw new RuntimeException('the PDF could not be read (password-protected, damaged or unsupported)', previous: $e);
        }
        $total = count($pages);
        if ($total === 0) throw new RuntimeException('the PDF has no pages');
        $from = max(1, $pageFrom ?? 1);
        $to = min($total, $pageTo ?? $total);
        if ($from > $total) throw new RuntimeException("the first page is after the last page of the PDF ({$total})");
        if ($to < $from) throw new RuntimeException('the last page must not be before the first page');

        $out = [];
        $unreadable = [];
        for ($n = $from; $n <= $to; $n++) {
            try { $raw = (string) $pages[$n - 1]->getText(); } catch (Throwable) { $raw = ''; }
            $text = self::normalise($raw);
            $readable = self::meaningful($text) >= self::MIN_PAGE_CHARACTERS;
            if (!$readable) $unreadable[] = $n;
            $out[] = ['page_number' => $n, 'text' => $text, 'readable' => $readable];
        }
        $readableCount = count($out) - count($unreadable);
        return ['total_pages' => $total, 'page_from' => $from, 'page_to' => $to,
            'document_kind' => $readableCount === 0 ? 'scanned' : ($unreadable ? 'hybrid' : 'text'),
            'unreadable_pages' => $unreadable,
            'legacy_bijoy' => (bool) preg_match('/(?:Sutonny(?:MJ)?|Bijoy|Boishakhi|Bangsee|Proshika|TonnyBangla|Sulekha|Mitra)/i', $bytes),
            'pages' => $out];
    }

    public static function normalise(string $text): string
    {
        $text = str_replace(["\0", "\r\n", "\r"], ['', "\n", "\n"], $text);
        $text = preg_replace('/[\x{00A0}\t]+/u', ' ', $text) ?? $text;
        $text = preg_replace('/[ ]{2,}/u', ' ', $text) ?? $text;
        $text = preg_replace('/\n[ ]+/u', "\n", $text) ?? $text;
        $text = preg_replace('/\n{3,}/u', "\n\n", $text) ?? $text;
        return trim($text);
    }

    public static function meaningful(string $text): int
    {
        return mb_strlen(preg_replace('/[\s\p{P}\p{S}]+/u', '', $text) ?? '');
    }
}
