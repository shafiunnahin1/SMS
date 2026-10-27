<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Process;

/**
 * D166 (5) AI-Q5: reads a photo with the server's own Tesseract (Bangla + English, no outside service). The text is tidied
 * (Unicode NFC, Bangla full stop read as "|", O / l inside numbers), lines that look like a formula are offered separately for
 * MathLive, and a photo whose words Tesseract is not sure of (handwriting, blur) is reported unsupported instead of guessed.
 */
class OcrService
{
    /** @return array{status: string, text: string, formulas: array, confidence: ?float} */
    public function read(string $file): array
    {
        $run = Process::timeout(config('services.ocr.timeout'))->run([config('services.ocr.binary'), $file, 'stdout', '-l', 'ben+eng', 'tsv']);
        if (!$run->successful()) return ['status' => 'failed', 'text' => '', 'formulas' => [], 'confidence' => null];
        return $this->fromTsv($run->output());
    }

    /** Tesseract's TSV: words (level 5) grouped back into lines; the mean word confidence decides whether the reading is trusted */
    public function fromTsv(string $tsv): array
    {
        $lines = [];
        $conf = [];
        foreach (array_slice(explode("\n", trim($tsv)), 1) as $row) {
            $c = explode("\t", $row);
            if (count($c) < 12 || (int) $c[0] !== 5 || trim($c[11]) === '' || (float) $c[10] < 0) continue;
            $lines["{$c[2]}-{$c[3]}-{$c[4]}"][] = trim($c[11]);
            $conf[] = (float) $c[10];
        }
        $confidence = $conf === [] ? null : round(array_sum($conf) / count($conf), 2);
        if ($confidence === null || $confidence < (float) config('services.ocr.min_confidence')) {
            return ['status' => 'unsupported', 'text' => '', 'formulas' => [], 'confidence' => $confidence];
        }
        $text = array_map(fn ($words) => self::tidy(implode(' ', $words)), array_values($lines));
        $formulas = [];
        foreach ($text as $i => $line) if (self::isFormula($line)) $formulas[] = ['line' => $i, 'text' => $line, 'latex' => self::latex($line)];
        return ['status' => 'done', 'text' => implode("\n", $text), 'formulas' => $formulas, 'confidence' => $confidence];
    }

    /** common OCR slips: NFC, "|" for the Bangla full stop, O / l / I read inside a number, stray spaces */
    public static function tidy(string $line): string
    {
        if (class_exists(\Normalizer::class)) $line = \Normalizer::normalize($line, \Normalizer::FORM_C) ?: $line;
        if (preg_match('/\p{Bengali}/u', $line)) $line = preg_replace('/\s*\|\s*$/u', '।', $line);
        $line = preg_replace_callback('/(?<=[0-9০-৯])[OoIl]|[OoIl](?=[0-9০-৯])/u', fn ($m) => in_array($m[0], ['O', 'o'], true) ? '0' : '1', $line);
        return trim(preg_replace('/\s+/u', ' ', $line));
    }

    /** a line with an operator and a number or a single-letter variable, and mostly not Bangla words */
    public static function isFormula(string $line): bool
    {
        if (!preg_match('/[=+×÷^√≤≥<>]|(?<=\S)\s?[-−\/]\s?(?=\S)/u', $line) || !preg_match('/[0-9০-৯]|\b[a-zA-Z]\b/u', $line)) return false;
        $bangla = preg_match_all('/\p{Bengali}/u', $line);
        return $bangla <= mb_strlen($line) / 3;
    }

    /** a first LaTeX for MathLive (the user corrects it there); Bangla digits become 0-9 */
    public static function latex(string $line): string
    {
        $line = strtr($line, ['০' => '0', '১' => '1', '২' => '2', '৩' => '3', '৪' => '4', '৫' => '5', '৬' => '6', '৭' => '7', '৮' => '8', '৯' => '9',
            '×' => '\\times ', '÷' => '\\div ', '−' => '-', '≤' => '\\le ', '≥' => '\\ge ']);
        $line = preg_replace('/(?<=[0-9a-zA-Z)])\s+[xX]\s+(?=[0-9a-zA-Z(])/u', ' \\times ', $line);   // a spaced "x" between terms is the × sign OCR misread
        return preg_replace('/√\s*\(?([^\s)]+)\)?/u', '\\sqrt{$1}', $line);
    }
}
