<?php

namespace App\Support;

// D72 (QB.12): question-bank text may carry qbank's small formatting vocabulary - strong / em / u / s / sup / sub / mark, coloured
// spans, lists, aligned blocks, qbank's layout divs and qmx tables. clean() keeps exactly that and nothing else: any other tag is
// unwrapped (its text stays), script-like tags go with their content, and every attribute outside the list is dropped. Text is
// re-escaped on the way out, so the result is safe to print. Plain text (no '<' or '&') passes through unchanged.
final class QbRichText
{
    private const DROP = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'head', 'title', 'link', 'meta', 'textarea', 'select', 'button', 'input', 'form'];
    private const RENAME = ['b' => 'strong', 'i' => 'em', 'strike' => 's', 'del' => 's', 'p' => 'div'];
    private const VOID = ['br'];
    private const TAGS = ['strong', 'em', 'u', 's', 'sup', 'sub', 'mark', 'br', 'span', 'div', 'ol', 'ul', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];
    private const COLOR = '/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i';
    private const DIV = [
        'dir' => '/^(?:auto|ltr|rtl)$/',
        'class' => '/^qmx-align-(?:left|center|right|justify)$/',
        'data-qae-layout' => '/^(?:matching|rubric|qa|steps|substitution|writing)$/',
        'data-qae-slot' => '/^(?:instruction|task|audience|limit|given|required|solution|result|answer|criteria|grid|sourcePassage|revisedPassage|passageExplanation)$/',
        'data-qae-display-mode' => '/^(?:line|paragraph)$/',
    ];
    private const LIST_CLASS = '/^qmx-list-(?:disc|circle|square|check|checkbox|star|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman|bengali-number|bengali-letter)$/';
    private const TABLE_CLASS = '/^qmx-table(?:-(?:grid|horizontal|none|striped|compact|normal|comfortable|width-(?:auto|50|75|100)|align-(?:left|center|right)))?$/';

    public static function clean(?string $html): ?string
    {
        if ($html === null) return null;
        if (!str_contains($html, '<') && !str_contains($html, '&')) return $html;
        $doc = new \DOMDocument();
        $prev = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"><div id="qbrt-root">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
        libxml_clear_errors();
        libxml_use_internal_errors($prev);
        $root = $doc->getElementById('qbrt-root');
        return $root ? self::children($root) : htmlspecialchars(strip_tags($html), ENT_NOQUOTES, 'UTF-8');
    }

    /** For server-printed pages (the paper PDF): clean(), and the colour attributes become inline colours (values already checked) */
    public static function html(?string $text): string
    {
        $v = (string) self::clean($text);
        $v = preg_replace('/ data-qmx-color="(#[0-9a-f]{3,6})"/', ' style="color:$1"', $v);
        return preg_replace('/ data-qmx-bg="(#[0-9a-f]{3,6})"/', ' style="background:$1"', $v);
    }

    /** Text without the vocabulary - lists, search snippets, places that cannot show formatting */
    public static function plain(?string $html): ?string
    {
        if ($html === null) return null;
        $v = preg_replace('~<\s*br\s*/?>|</\s*(?:div|li|dt|dd|tr)\s*>|<(?:ol|ul|dl|table|div)\b[^>]*>~i', "\n", self::clean($html));
        $v = preg_replace("~[ \t]*\n[ \t\n]*~", "\n", $v);
        $v = html_entity_decode(strip_tags($v), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        return trim(preg_replace("~\n{3,}~", "\n\n", $v));
    }

    private static function children(\DOMNode $node): string
    {
        $out = '';
        foreach ($node->childNodes as $child) $out .= self::node($child);
        return $out;
    }

    private static function node(\DOMNode $n): string
    {
        if ($n instanceof \DOMText) return htmlspecialchars($n->data, ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8');
        if (!$n instanceof \DOMElement) return '';                       // comments, processing instructions
        $tag = strtolower($n->tagName);
        if (in_array($tag, self::DROP, true)) return '';
        $tag = self::RENAME[$tag] ?? $tag;
        if (!in_array($tag, self::TAGS, true)) return self::children($n);   // unknown tag: keep its text
        $attrs = self::attrs($tag, $n);
        if ($tag === 'span' && $attrs === '') return self::children($n);  // a span says nothing without its colour
        if (in_array($tag, self::VOID, true)) return "<{$tag}>";
        return "<{$tag}{$attrs}>" . self::children($n) . "</{$tag}>";
    }

    private static function attrs(string $tag, \DOMElement $n): string
    {
        $ok = [];
        $get = fn (string $a) => $n->hasAttribute($a) ? trim($n->getAttribute($a)) : null;
        switch ($tag) {
            case 'span':
                foreach (['data-qmx-color', 'data-qmx-bg'] as $a) if (($v = $get($a)) !== null && preg_match(self::COLOR, $v)) $ok[$a] = strtolower($v);
                break;
            case 'div':
                foreach (self::DIV as $a => $p) if (($v = $get($a)) !== null && preg_match($p, $v)) $ok[$a] = $v;
                break;
            case 'ol':
            case 'ul':
                if (($v = $get('class')) !== null && preg_match(self::LIST_CLASS, $v)) $ok['class'] = $v;
                if (($v = $get('data-qae-sentence-list')) !== null && preg_match('/^(?:prompt|answer)$/', $v)) $ok['data-qae-sentence-list'] = $v;
                break;
            case 'li':
                if (($v = $get('data-qae-sentence-index')) !== null && preg_match('/^[1-9]\d{0,2}$/', $v)) $ok['data-qae-sentence-index'] = $v;
                if (($v = $get('data-qae-marks')) !== null && preg_match('/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/', $v)) $ok['data-qae-marks'] = $v;
                break;
            case 'table':
                $classes = array_values(array_filter(preg_split('/\s+/', (string) $get('class')), fn ($c) => preg_match(self::TABLE_CLASS, $c)));
                if ($classes) $ok['class'] = implode(' ', $classes);
                break;
            case 'th':
            case 'td':
                if (($v = $get('dir')) !== null && preg_match('/^(?:auto|ltr|rtl)$/', $v)) $ok['dir'] = $v;
                foreach (['colspan', 'rowspan'] as $a) if (($v = $get($a)) !== null && preg_match('/^(?:[2-9]|1\d|20)$/', $v)) $ok[$a] = $v;
                break;
        }
        $s = '';
        foreach ($ok as $a => $v) $s .= ' ' . $a . '="' . htmlspecialchars($v, ENT_QUOTES, 'UTF-8') . '"';
        return $s;
    }
}
