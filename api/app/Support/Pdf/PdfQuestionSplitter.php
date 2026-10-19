<?php

namespace App\Support\Pdf;

use Illuminate\Support\Str;

// D124 (R2.1.4): qbank's PdfQuestionParsingService, unchanged in its rules - numbered questions (১. / 1. / প্রশ্ন ১ / Q1), options or
// creative parts labelled ক-জ / A-H (also several on one line), answer and explanation lines, section headings, trailing marks.
// Each question comes out in the import's own record shape (qbank JSON v5 keys) with its source page. When the shape does not
// say MCQ / creative / short, the type is left empty - the staging review asks the writer instead of guessing.
class PdfQuestionSplitter
{
    private const BN_DIGITS = ['০' => '0', '১' => '1', '২' => '2', '৩' => '3', '৪' => '4', '৫' => '5', '৬' => '6', '৭' => '7', '৮' => '8', '৯' => '9'];
    private const LEVELS = ['ক' => 'knowledge', 'খ' => 'understanding', 'গ' => 'application', 'ঘ' => 'higher_order'];
    private const LABEL = '[কখগঘঙচছজA-Ha-h]';

    /** @param list<array{page_number:int, text:string, readable:bool}> $pages */
    public function split(array $pages): array
    {
        $records = [];
        foreach ($pages as $page) {
            if (!$page['readable'] || trim($page['text']) === '') continue;
            foreach ($this->blocks($page['text']) as $block) {
                $r = $this->parse($block);
                if ($r === null) continue;
                $converted = array_filter($page['converted_lines'] ?? [], fn ($l) => $l !== '' && str_contains($block, $l));
                $records[] = $r + ['page_number' => $page['page_number']] + ($converted ? ['bijoy_converted' => count($converted)] : []);
            }
        }
        return $records;
    }

    private function blocks(string $text): array
    {
        $blocks = [];
        $current = [];
        $numbered = false;
        foreach (preg_split('/\R/u', $text) ?: [] as $line) {
            $line = trim($line);
            if ($this->isSectionHeading($line)) {
                if ($numbered && $current) { $blocks[] = trim(implode("\n", $current)); $current = []; }
                continue;
            }
            if ($this->isQuestionStart($line)) {
                if ($numbered && $current) $blocks[] = trim(implode("\n", $current));
                $numbered = true;
                $current = [$line];
                continue;
            }
            if (!$numbered) continue;
            $current[] = $line;
        }
        if ($numbered) {
            if ($current) $blocks[] = trim(implode("\n", $current));
            return array_values(array_filter($blocks, fn ($b) => trim($b) !== ''));
        }
        $paragraphs = array_values(array_filter(array_map('trim', preg_split('/\n\s*\n/u', $text) ?: []), fn ($p) => mb_strlen($p) >= 8));
        return count($paragraphs) > 1 ? $paragraphs : [trim($text)];
    }

    private function isSectionHeading(string $line): bool
    {
        return $line !== '' && preg_match('/^(?:বহুনির্বাচনী\s+প্রশ্ন|নৈর্ব্যক্তিক\s+প্রশ্ন|MCQ|Multiple\s+Choice(?:\s+Questions?)?|সৃজনশীল\s+প্রশ্ন|Creative\s+Questions?)(?:\s*[\(\[].*[\)\]])?\s*$/iu', $line) === 1;
    }

    private function isQuestionStart(string $line): bool
    {
        if ($line === '' || preg_match('/^(?:(প্রশ্ন|Question|Q)\s*[:\-–—]?\s*)?([০-৯0-9]{1,4})(\s*[\.\)\]:\-–—]\s*|\s+)(\S.*)$/iu', $line, $m) !== 1) return false;
        if (trim($m[1]) !== '' || preg_match('/[\.\)\]:\-–—]/u', $m[3]) === 1) return true;
        return !$this->bareHeading(trim($m[4]));
    }

    private function bareHeading(string $rest): bool
    {
        return $rest === ''
            || preg_match('/^(?:টি\s*)?(?:questions?|mcqs?|multiple\s+choice(?:\s+questions?)?|items?|problems?|exercises?|answers?|marks?|প্রশ্ন(?:\s*(?:ও|সহ)\s*উত্তর)?|এমসিকিউ|বহুনির্বাচনী|নৈর্ব্যক্তিক|উত্তর|নম্বর)(?:\s|$|[:\-–—])/iu', $rest) === 1
            || preg_match('/(?:question\s+bank|questions?\s+with\s+answers?|sample\s+source(?:\s+pdf)?|exam\s+paper\s+generator|প্রশ্ন\s*ব্যাংক|প্রশ্ন\s*(?:ও|সহ)\s*উত্তর)/iu', $rest) === 1;
    }

    private function parse(string $block): ?array
    {
        $lines = array_values(array_filter(array_map('trim', preg_split('/\R/u', $block) ?: []), fn ($l) => $l !== ''));
        if (!$lines) return null;
        $first = trim((string) preg_replace('/^(?:(?:প্রশ্ন|Question|Q)\s*[:\-–—]?\s*)?[০-৯0-9]{1,4}\s*(?:[\.\)\]:\-–—]\s*|\s+)/iu', '', $lines[0]));
        $question = $first !== '' ? [$first] : [];
        $answer = [];
        $explanation = [];
        $items = [];
        $mode = 'question';
        $active = null;
        foreach (array_slice($lines, 1) as $source) {
            foreach ($this->inline($source) as $line) {
                if (preg_match('/^(?:সঠিক\s*উত্তর|উত্তর|Answer|Ans)\s*[:\-–—]\s*(.*)$/iu', $line, $m)) { $mode = 'answer'; $active = null; if (trim($m[1]) !== '') $answer[] = trim($m[1]); continue; }
                if (preg_match('/^(?:ব্যাখ্যা|সমাধান|Explanation|Solution)\s*[:\-–—]\s*(.*)$/iu', $line, $m)) { $mode = 'explanation'; $active = null; if (trim($m[1]) !== '') $explanation[] = trim($m[1]); continue; }
                if ($mode === 'question' && preg_match('/^(?:\()?(' . self::LABEL . ')(?:\))?\s*[\.\)\]:\-–—]\s*(.+)$/u', $line, $m)) {
                    $items[] = ['label' => ctype_alpha($m[1]) ? strtoupper($m[1]) : $m[1], 'text' => trim($m[2])];
                    $active = array_key_last($items);
                    continue;
                }
                if ($mode === 'answer') { $answer[] = $line; continue; }
                if ($mode === 'explanation') { $explanation[] = $line; continue; }
                if ($active !== null) { $items[$active]['text'] = trim($items[$active]['text'] . ' ' . $line); continue; }
                $question[] = $line;
            }
        }
        $text = $this->clean(implode("\n", $question));
        if (mb_strlen($text) < 3) return null;
        $answerText = trim(implode("\n", $answer));
        $record = ['question_text' => $text, 'raw_text' => $block];
        if ($answerText !== '') $record['answer_text'] = $answerText;
        if ($explanation) $record['explanation_text'] = trim(implode("\n", $explanation));

        if (count($items) >= 2 && $this->creative($text, $items)) {
            $record['question_type'] = 'creative';
            $record['stimulus_text'] = $text;
            unset($record['question_text']);
            $record['creative_parts'] = array_map(function ($it) {
                [$q, $marks] = $this->marks($this->clean($it['text']));
                return array_filter(['label' => $it['label'], 'cognitive_level' => self::LEVELS[$it['label']] ?? null, 'question_text' => $q, 'marks' => $marks], fn ($v) => $v !== null);
            }, $items);
        } elseif (count($items) >= 2) {
            $record['question_type'] = 'mcq';
            $needle = mb_strtolower($answerText);
            $record['options'] = array_map(fn ($it) => ['label' => $it['label'], 'text' => $it['text'],
                'is_correct' => $needle !== '' && (in_array($needle, [mb_strtolower($it['label']), '(' . mb_strtolower($it['label']) . ')', mb_strtolower($it['text'])], true)
                    || Str::contains($needle, mb_strtolower($it['label']) . '.'))], $items);
            unset($record['answer_text']);
        } elseif ($answerText !== '') {
            $record['question_type'] = 'short';
        }
        if (preg_match('/(চিত্র|ছবি|figure|diagram|graph)/iu', $text)) $record['figure_descriptions'] = [['description' => 'a picture is mentioned on this page - add it in the editor']];
        return $record;
    }

    /** several labelled options on one line -> one line each */
    private function inline(string $line): array
    {
        preg_match_all('/(?:^|\s)(' . self::LABEL . ')(?:\))?\s*[\.\)\]:\-–—]\s*(.*?)(?=(?:\s+' . self::LABEL . '(?:\))?\s*[\.\)\]:\-–—]\s*)|$)/u', $line, $m, PREG_SET_ORDER);
        return count($m) < 2 ? [$line] : array_map(fn ($x) => trim($x[1] . '. ' . trim($x[2])), $m);
    }

    private function creative(string $text, array $items): bool
    {
        if (Str::contains($text, ['উদ্দীপক', 'নিচের অনুচ্ছেদ', 'চিত্রটি দেখে'])) return true;
        $bangla = count(array_filter($items, fn ($i) => isset(self::LEVELS[$i['label']])));
        $questionLike = count(array_filter($items, function ($i) {
            [$t] = $this->marks(trim($i['text']));
            return mb_strlen($t) >= 25 || Str::endsWith($t, ['?', '।']);
        }));
        return $bangla >= 3 && $questionLike >= 2;
    }

    /** "… 3" or "… ৩" at the end -> [text, marks] */
    private function marks(string $text): array
    {
        if (preg_match('/^(.*?)\s+([০-৯0-9]+(?:[\.।][০-৯0-9]+)?)\s*$/u', $text, $m) !== 1) return [$text, null];
        $n = strtr($m[2], self::BN_DIGITS + ['।' => '.']);
        return is_numeric($n) ? [trim($m[1]), $n + 0] : [$text, null];
    }

    private function clean(string $text): string
    {
        $t = preg_replace('/[\x{E000}-\x{F8FF}]+/u', '', $text) ?? $text;
        return trim(preg_replace('/^[=\s]+/u', '', $t) ?? $t);
    }
}
