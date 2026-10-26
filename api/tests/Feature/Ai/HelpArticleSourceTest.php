<?php

namespace Tests\Feature\Ai;

use App\Services\Ai\HelpService;
use Tests\TestCase;

// D166 AI-Q4 fail-closed check of the help articles the agent wrote (resources/help/articles.json): every menu path is still in the
// menu, every translation key still exists in Bangla and English and its CURRENT label is the one quoted in that language's text,
// every route still exists; a menu / route / label change breaks this test instead of leaving a stale instruction.
class HelpArticleSourceTest extends TestCase
{
    private static function i18n(string $locale): array
    {
        return json_decode((string) file_get_contents(base_path("../frontend/src/i18n/{$locale}.json")), true);
    }

    private static function label(array $i18n, string $key): ?string
    {
        $v = $i18n['app'] ?? [];
        foreach (explode('.', $key) as $p) { if (!is_array($v) || !array_key_exists($p, $v)) return null; $v = $v[$p]; }
        return is_string($v) ? $v : null;
    }

    public function test_every_article_matches_the_current_menu_translations_and_routes(): void
    {
        $data = json_decode((string) file_get_contents(resource_path('help/articles.json')), true);
        $menu = (string) file_get_contents(base_path('../frontend/src/nav/menu.js'));
        $bn = self::i18n('bn');
        $en = self::i18n('en');
        $this->assertNotEmpty($data['articles']);
        foreach ($data['articles'] as $a) {
            $slug = $a['slug'];
            $text = fn (string $l) => json_encode($a[$l], JSON_UNESCAPED_UNICODE);
            foreach ($a['refs']['menus'] as $path) {
                $this->assertMatchesRegularExpression("#'" . preg_quote($path, '#') . "'#", $menu, "{$slug}: menu path {$path} is gone");
                preg_match("#it\\('[^']+',\\s*'" . preg_quote($path, '#') . "',\\s*'([^']+)'#", $menu, $m);
                if ($m) {
                    $this->assertStringContainsString($m[1], $text('bn'), "{$slug}: the Bangla text does not name the menu \"{$m[1]}\"");
                    $enLabel = $en['nav'][$m[1]] ?? null;
                    if ($enLabel) $this->assertStringContainsString($enLabel, $text('en'), "{$slug}: the English text does not name the menu \"{$enLabel}\"");
                }
            }
            foreach ($a['refs']['keys'] as $key) {
                foreach (['bn' => $bn, 'en' => $en] as $l => $i18n) {
                    $label = self::label($i18n, $key);
                    $this->assertNotNull($label, "{$slug}: translation key {$key} is gone ({$l})");
                    $this->assertStringContainsString($label, $text($l), "{$slug}: the {$l} text does not use the current label \"{$label}\" of {$key}");
                }
            }
            $this->assertTrue(HelpService::routesExist($a['refs']['routes']), "{$slug}: a route in " . implode(', ', $a['refs']['routes']) . ' is gone');
            foreach (['bn', 'en'] as $l) {
                foreach (['purpose', 'where', 'steps', 'result', 'errors', 'limits'] as $part) $this->assertNotEmpty($a[$l]['body'][$part] ?? null, "{$slug}: {$l} {$part}");
            }
        }
        $this->assertFalse(HelpService::routesExist(['POST api/v1/no-such-route']), 'a missing route is caught');
    }
}
