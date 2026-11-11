<?php

namespace App\Services\Substitution;

// D200 SUBL.2 (docs/API.md D99 "canonical request envelope"): one byte-exact JSON form to hash. Object keys sorted by Unicode
// code point (UTF-8 byte order), no whitespace, no ASCII escaping, strings kept as given; ids and versions are decimal STRINGS -
// a PHP int or float is refused so "1" and 1 can never hash differently by accident. Lists keep their order.
final class CanonicalJson
{
    public static function encode(mixed $value): string
    {
        if ($value === null) return 'null';
        if (is_bool($value)) return $value ? 'true' : 'false';
        if (is_string($value)) {
            if (!mb_check_encoding($value, 'UTF-8')) throw new \InvalidArgumentException('malformed unicode');
            return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        }
        if ($value instanceof \stdClass) $value = (array) $value ?: null;
        if ($value === null) return '{}';
        if (is_array($value)) {
            if (array_is_list($value)) return '[' . implode(',', array_map(self::encode(...), $value)) . ']';
            $keys = array_map('strval', array_keys($value));
            sort($keys, SORT_STRING);
            return '{' . implode(',', array_map(fn ($k) => self::encode($k) . ':' . self::encode($value[$k]), $keys)) . '}';
        }
        throw new \InvalidArgumentException('only strings, booleans, null, lists and objects are canonical (numbers are sent as strings)');
    }

    public static function sha256(mixed $value): string
    {
        return hash('sha256', self::encode($value));
    }
}
