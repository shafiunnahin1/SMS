<?php

namespace App\Support\Toon;

// D123 (R2.1.3): writes TOON that ToonDecoder reads back unchanged - used for SMS's downloadable TOON example and the
// JSON/TOON equivalence fixtures. Lists of objects with the same primitive fields become tables; other lists use "- " items.
class ToonEncoder
{
    public static function encode(mixed $value): string
    {
        $lines = [];
        if (is_array($value) && array_is_list($value)) self::arrayLines('', $value, 0, $lines);
        elseif (is_array($value)) self::objectLines($value, 0, $lines);
        else $lines[] = self::scalar($value);
        return implode("\n", $lines) . "\n";
    }

    private static function objectLines(array $object, int $depth, array &$lines): void
    {
        foreach ($object as $key => $v) {
            $k = self::key((string) $key);
            if (is_array($v) && array_is_list($v) && $v !== []) self::arrayLines($k, $v, $depth, $lines);
            elseif (is_array($v) && $v === []) $lines[] = self::pad($depth) . $k . (array_key_exists(0, $v) ? '[0]:' : ':');
            elseif (is_array($v)) { $lines[] = self::pad($depth) . $k . ':'; self::objectLines($v, $depth + 1, $lines); }
            else $lines[] = self::pad($depth) . $k . ': ' . self::scalar($v);
        }
    }

    private static function arrayLines(string $k, array $list, int $depth, array &$lines, string $prefix = ''): void
    {
        $n = count($list);
        $head = ($prefix !== '' ? $prefix : self::pad($depth)) . $k;
        if ($list !== [] && !array_filter($list, fn ($x) => is_array($x))) {
            $lines[] = $head . "[{$n}]: " . implode(',', array_map([self::class, 'scalar'], $list));
            return;
        }
        $fields = self::tableFields($list);
        if ($fields !== null) {
            $lines[] = $head . "[{$n}]{" . implode(',', array_map([self::class, 'key'], $fields)) . '}:';
            foreach ($list as $row) $lines[] = self::pad($depth + 1) . implode(',', array_map(fn ($f) => self::scalar($row[$f]), $fields));
            return;
        }
        $lines[] = $head . "[{$n}]:";
        foreach ($list as $item) {
            $dash = self::pad($depth + 1) . '- ';
            if (!is_array($item)) { $lines[] = $dash . self::scalar($item); continue; }
            if (array_is_list($item)) { self::arrayLines('', $item, $depth + 1, $lines, $dash); continue; }
            if ($item === []) { $lines[] = rtrim($dash); continue; }
            $first = array_key_first($item);
            $firstLines = [];
            self::objectLines([$first => $item[$first]], $depth + 2, $firstLines);
            $lines[] = $dash . ltrim($firstLines[0], ' ');
            foreach (array_slice($firstLines, 1) as $l) $lines[] = $l;
            self::objectLines(array_slice($item, 1, null, true), $depth + 2, $lines);
        }
    }

    /** the shared field list when every item is a non-empty object of primitives with the same keys in the same order */
    private static function tableFields(array $list): ?array
    {
        $fields = null;
        foreach ($list as $item) {
            if (!is_array($item) || $item === [] || array_is_list($item)) return null;
            foreach ($item as $v) if (is_array($v)) return null;
            $keys = array_map('strval', array_keys($item));
            if ($fields === null) $fields = $keys;
            elseif ($keys !== $fields) return null;
        }
        return $fields;
    }

    private static function key(string $key): string
    {
        return preg_match('/^[A-Za-z_][A-Za-z0-9_.]*$/', $key) ? $key : self::quote($key);
    }

    public static function scalar(mixed $v): string
    {
        if ($v === null) return 'null';
        if ($v === true) return 'true';
        if ($v === false) return 'false';
        if (is_int($v)) return (string) $v;
        if (is_float($v)) return rtrim(rtrim(sprintf('%.15F', $v), '0'), '.') ?: '0';
        $s = (string) $v;
        $plain = $s !== '' && $s === trim($s) && !preg_match('/^(true|false|null)$|^-?\d|[",:\[\]{}\\\\\t\n\r|]|^- |^-$|^#/u', $s);
        return $plain ? $s : self::quote($s);
    }

    private static function quote(string $s): string
    {
        return '"' . strtr($s, ['\\' => '\\\\', '"' => '\\"', "\n" => '\\n', "\r" => '\\r', "\t" => '\\t']) . '"';
    }

    private static function pad(int $depth): string
    {
        return str_repeat('  ', $depth);
    }
}
