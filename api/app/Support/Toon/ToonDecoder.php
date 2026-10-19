<?php

namespace App\Support\Toon;

// D123 (R2.1.3): SMS's own decoder for TOON (Token-Oriented Object Notation, spec v2.x) - no package (G7).
// Covers what a question file needs: nested objects by indentation (2 spaces), `key: value`, inline primitive arrays
// `key[N]: a,b`, tabular arrays `key[N]{f,g}:` + rows, list arrays `key[N]:` + `- item` (an item may be an object whose first
// field sits on the hyphen line), a root array `[N]: ...`, quoted keys/strings with \\ \" \n \r \t escapes, and the `,` / tab /
// `|` delimiters declared in the brackets. Strict: a declared length that does not match, bad indentation or a broken quote
// throws ToonException with the line number. Strings decode exactly (a LaTeX backslash inside quotes is written \\).
class ToonDecoder
{
    private const INDENT = 2;

    /** @var array<int, array{depth:int, text:string, no:int}> */
    private array $lines = [];
    private int $pos = 0;

    public static function decode(string $source): mixed
    {
        return (new self)->run($source);
    }

    private function run(string $source): mixed
    {
        $source = preg_replace('/^\xEF\xBB\xBF/', '', $source);
        foreach (preg_split('/\r\n|\n|\r/', $source) as $i => $raw) {
            if (trim($raw) === '') continue;
            $spaces = strlen($raw) - strlen(ltrim($raw, ' '));
            if (str_starts_with(ltrim($raw, ' '), "\t")) throw new ToonException('a tab cannot indent a line', $i + 1);
            if ($spaces % self::INDENT !== 0) throw new ToonException('indentation must be a multiple of 2 spaces', $i + 1);
            $this->lines[] = ['depth' => intdiv($spaces, self::INDENT), 'text' => rtrim(substr($raw, $spaces), ' '), 'no' => $i + 1];
        }
        if ($this->lines === []) return [];
        $first = $this->lines[0];
        if ($first['depth'] !== 0) throw new ToonException('the first line cannot be indented', $first['no']);
        if (preg_match('/^\[/', $first['text'])) {                          // a root array
            $this->pos = 1;
            $value = $this->arrayFromHeader($first['text'], $first['no'], 0);
        } elseif (count($this->lines) === 1 && $this->splitKey($first['text'], $first['no'], false) === null) {
            return $this->primitive($first['text'], $first['no']);         // a single primitive
        } else {
            $value = $this->object(0);
        }
        if ($this->pos < count($this->lines)) throw new ToonException('unexpected line', $this->lines[$this->pos]['no']);
        return $value;
    }

    /** the fields at one depth, until a line of a smaller depth */
    private function object(int $depth): array
    {
        $out = [];
        while ($this->pos < count($this->lines)) {
            $line = $this->lines[$this->pos];
            if ($line['depth'] < $depth) break;
            if ($line['depth'] > $depth) throw new ToonException('unexpected indentation', $line['no']);
            $this->pos++;
            [$key, $rest] = $this->field($line['text'], $line['no'], $depth);
            if (array_key_exists($key, $out)) throw new ToonException("duplicate key \"{$key}\"", $line['no']);
            $out[$key] = $rest;
        }
        return $out;
    }

    /** one `key...` line (already consumed) -> [key, value], reading its nested lines when it has them */
    private function field(string $text, int $no, int $depth): array
    {
        $split = $this->splitKey($text, $no, true);
        [$key, $header, $after] = $split;
        if ($header !== null) return [$key, $this->arrayFromHeader($header . ':' . $after, $no, $depth)];
        if ($after === '') {                                                // a nested object (or an empty one)
            $nested = $this->pos < count($this->lines) && $this->lines[$this->pos]['depth'] > $depth;
            return [$key, $nested ? $this->object($depth + 1) : []];
        }
        return [$key, $this->primitive($after, $no)];
    }

    /**
     * `key: value`, `key[N]...: value` or `"quoted key": value` -> [key, arrayHeader|null, textAfterColon];
     * null when the text has no key (a bare primitive) and $require is false
     */
    private function splitKey(string $text, int $no, bool $require): ?array
    {
        $i = 0;
        if (($text[0] ?? '') === '"') {
            [$key, $i] = $this->quoted($text, 0, $no);
        } else {
            while ($i < strlen($text) && $text[$i] !== ':' && $text[$i] !== '[') $i++;
            $key = substr($text, 0, $i);
            if ($i >= strlen($text)) {
                if ($require) throw new ToonException('expected "key: value"', $no);
                return null;
            }
        }
        $header = null;
        if (($text[$i] ?? '') === '[') {
            $close = $this->headerEnd($text, $i, $no);
            $header = substr($text, $i, $close - $i);
            $i = $close;
        }
        if (($text[$i] ?? '') !== ':') {
            if ($require) throw new ToonException('expected ":" after the key', $no);
            return null;
        }
        if ($key === '' && $header === null) throw new ToonException('empty key', $no);
        return [$key, $header, ltrim(substr($text, $i + 1), ' ')];
    }

    /** index just past `[N...]` and an optional `{fields}` */
    private function headerEnd(string $text, int $open, int $no): int
    {
        $close = strpos($text, ']', $open);
        if ($close === false) throw new ToonException('unclosed "["', $no);
        $i = $close + 1;
        if (($text[$i] ?? '') === '{') {
            $end = $this->fieldsEnd($text, $i, $no);
            $i = $end + 1;
        }
        return $i;
    }

    private function fieldsEnd(string $text, int $open, int $no): int
    {
        $inQuote = false;
        for ($i = $open + 1; $i < strlen($text); $i++) {
            $c = $text[$i];
            if ($inQuote && $c === '\\') { $i++; continue; }
            if ($c === '"') $inQuote = !$inQuote;
            elseif ($c === '}' && !$inQuote) return $i;
        }
        throw new ToonException('unclosed "{"', $no);
    }

    /** `[N<delim>]{fields}: inline` (consumed line) + its nested lines -> a PHP list */
    private function arrayFromHeader(string $text, int $no, int $depth): array
    {
        if (!preg_match('/^\[(\d+)([,\t|]?)\]/', $text, $m)) throw new ToonException('bad array header', $no);
        $count = (int) $m[1];
        $delim = $m[2] === '' ? ',' : $m[2];
        $i = strlen($m[0]);
        $fields = null;
        if (($text[$i] ?? '') === '{') {
            $end = $this->fieldsEnd($text, $i, $no);
            $fields = array_map(fn ($f) => $this->key($f, $no), $this->splitValues(substr($text, $i + 1, $end - $i - 1), $delim, $no));
            $i = $end + 1;
        }
        if (($text[$i] ?? '') !== ':') throw new ToonException('expected ":" after the array header', $no);
        $inline = ltrim(substr($text, $i + 1), ' ');

        if ($fields !== null) {                                             // tabular rows
            if ($inline !== '') throw new ToonException('a table header ends the line', $no);
            $rows = [];
            while (count($rows) < $count && $this->pos < count($this->lines) && $this->lines[$this->pos]['depth'] === $depth + 1) {
                $row = $this->lines[$this->pos++];
                $cells = $this->splitValues($row['text'], $delim, $row['no']);
                if (count($cells) !== count($fields)) throw new ToonException('a row has ' . count($cells) . ' values for ' . count($fields) . ' fields', $row['no']);
                $rows[] = array_combine($fields, array_map(fn ($c) => $this->primitive($c, $row['no']), $cells));
            }
            if (count($rows) !== $count) throw new ToonException("the table declares {$count} rows but has " . count($rows), $no);
            return $rows;
        }
        if ($inline !== '') {                                               // inline primitives
            $values = array_map(fn ($c) => $this->primitive($c, $no), $this->splitValues($inline, $delim, $no));
            if (count($values) !== $count) throw new ToonException("the array declares {$count} values but has " . count($values), $no);
            return $values;
        }
        $items = [];                                                        // list items
        while ($this->pos < count($this->lines) && $this->lines[$this->pos]['depth'] === $depth + 1) {
            $line = $this->lines[$this->pos];
            if ($line['text'] !== '-' && !str_starts_with($line['text'], '- ')) break;
            $this->pos++;
            $items[] = $this->listItem(ltrim(substr($line['text'], 1), ' '), $line['no'], $depth + 1, $delim);
        }
        if (count($items) !== $count) throw new ToonException("the list declares {$count} items but has " . count($items), $no);
        return $items;
    }

    /** the text after "- " -> a primitive, an inline array or an object whose first field is on this line */
    private function listItem(string $text, int $no, int $depth, string $delim): mixed
    {
        if ($text === '') return [];
        if ($text[0] === '[') return $this->arrayFromHeader($text, $no, $depth);
        $split = $this->splitKey($text, $no, false);
        if ($split === null) return $this->primitive($text, $no);
        [$key, $value] = $this->field($text, $no, $depth + 1);
        $rest = ($this->pos < count($this->lines) && $this->lines[$this->pos]['depth'] === $depth + 1) ? $this->object($depth + 1) : [];
        if (array_key_exists($key, $rest)) throw new ToonException("duplicate key \"{$key}\"", $no);
        return [$key => $value] + $rest;
    }

    /** split on the delimiter outside quotes; each piece trimmed */
    private function splitValues(string $text, string $delim, int $no): array
    {
        $out = [];
        $cur = '';
        $inQuote = false;
        for ($i = 0; $i < strlen($text); $i++) {
            $c = $text[$i];
            if ($inQuote && $c === '\\') { $cur .= $c . ($text[$i + 1] ?? ''); $i++; continue; }
            if ($c === '"') $inQuote = !$inQuote;
            if ($c === $delim && !$inQuote) { $out[] = trim($cur, ' '); $cur = ''; continue; }
            $cur .= $c;
        }
        if ($inQuote) throw new ToonException('unclosed quote', $no);
        $out[] = trim($cur, ' ');
        return $out;
    }

    private function key(string $text, int $no): string
    {
        if (($text[0] ?? '') === '"') {
            [$key, $end] = $this->quoted($text, 0, $no);
            if ($end !== strlen($text)) throw new ToonException('text after a quoted key', $no);
            return $key;
        }
        if ($text === '') throw new ToonException('empty field name', $no);
        return $text;
    }

    private function primitive(string $text, int $no): mixed
    {
        if ($text === '') return '';
        if ($text[0] === '"') {
            [$value, $end] = $this->quoted($text, 0, $no);
            if ($end !== strlen($text)) throw new ToonException('text after a closing quote', $no);
            return $value;
        }
        if ($text === 'true') return true;
        if ($text === 'false') return false;
        if ($text === 'null') return null;
        if (preg_match('/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/', $text)) {
            return (str_contains($text, '.') || stripos($text, 'e') !== false) ? (float) $text : (int) $text;
        }
        return $text;
    }

    /** a "..." string starting at $start -> [decoded, index after the closing quote] */
    private function quoted(string $text, int $start, int $no): array
    {
        $out = '';
        for ($i = $start + 1; $i < strlen($text); $i++) {
            $c = $text[$i];
            if ($c === '"') return [$out, $i + 1];
            if ($c !== '\\') { $out .= $c; continue; }
            $n = $text[++$i] ?? '';
            $out .= match ($n) {
                '\\' => '\\', '"' => '"', 'n' => "\n", 'r' => "\r", 't' => "\t",
                default => throw new ToonException("invalid escape \"\\{$n}\"", $no),
            };
        }
        throw new ToonException('unclosed quote', $no);
    }
}
