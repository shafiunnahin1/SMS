<?php

namespace Tests\Feature\I18n;

use Tests\TestCase;

// docs/I18N.md section 13-14 "I18nParityTest": bn and en have exactly the same keys (server lang/*.php and the SPA's src/i18n/*.json);
// ar has no key the others lack (it may be incomplete - its coverage is reported); every placeholder (:name / {{name}}) is the
// same in each language.
class I18nParityTest extends TestCase
{
    private static function flat(array $a, string $prefix = ''): array
    {
        $out = [];
        foreach ($a as $k => $v) {
            if (is_array($v) && $v !== []) $out += self::flat($v, "{$prefix}{$k}.");
            else $out["{$prefix}{$k}"] = $v;
        }
        return $out;
    }

    private static function placeholders(mixed $text, string $re): array
    {
        preg_match_all($re, is_string($text) ? $text : '', $m);
        $p = array_unique($m[1]);
        sort($p);
        return $p;
    }

    private function assertParity(array $bn, array $en, string $re, string $where): void
    {
        $this->assertSame([], array_keys(array_diff_key($bn, $en)), "{$where}: keys only in bn");
        $this->assertSame([], array_keys(array_diff_key($en, $bn)), "{$where}: keys only in en");
        foreach ($en as $key => $text) {
            $this->assertSame(self::placeholders($text, $re), self::placeholders($bn[$key], $re), "{$where}: placeholders of {$key}");
            $this->assertNotSame('', $bn[$key], "{$where}: {$key} is empty in bn");
        }
    }

    public function test_server_language_files_match(): void
    {
        $files = array_map('basename', glob(lang_path('en/*.php')));
        $this->assertEqualsCanonicalizing(array_merge($files, ['validation.php']), array_unique(array_merge(array_map('basename', glob(lang_path('bn/*.php'))), ['validation.php'])), 'the same files in lang/bn and lang/en');
        foreach (array_diff($files, ['validation.php']) as $file) {      // validation: bn covers the rules the app uses, en is Laravel's own
            $this->assertParity(self::flat(require lang_path("bn/{$file}")), self::flat(require lang_path("en/{$file}")), '/:([a-z_]+)/', $file);
        }
    }

    public function test_spa_language_files_match_and_arabic_adds_nothing(): void
    {
        $json = fn (string $l) => json_decode(file_get_contents(base_path("../frontend/src/i18n/{$l}.json")), true, flags: JSON_THROW_ON_ERROR);
        // `nav` is keyed by the Bengali menu text itself (bn.nav is empty by design): en/ar translate those keys - MenuReleaseTest checks them
        $this->assertSame([], array_keys(array_diff_key($json('ar')['nav'] ?? [], $json('en')['nav'] ?? [])), 'ar.nav has keys en.nav lacks');
        $read = fn (string $l) => self::flat($json($l)['app']);
        [$bn, $en, $ar] = [$read('bn'), $read('en'), $read('ar')];
        $this->assertParity($bn, $en, '/\{\{\s*([a-z_]+)\s*\}\}/', 'src/i18n');

        $this->assertSame([], array_keys(array_diff_key($ar, $en)), 'ar.json has keys the others lack');
        $done = count(array_filter($ar, fn ($v) => $v !== '' && !str_contains((string) $v, 'TODO')));
        fwrite(STDERR, sprintf("\n[i18n] ar.json coverage: %d / %d keys (%.0f%%)\n", $done, count($en), 100 * $done / max(1, count($en))));
        foreach ($ar as $key => $text) {
            if ($text !== '') $this->assertSame(self::placeholders($en[$key], '/\{\{\s*([a-z_]+)\s*\}\}/'), self::placeholders($text, '/\{\{\s*([a-z_]+)\s*\}\}/'), "ar: placeholders of {$key}");
        }
    }
}
