<?php

namespace App\Console\Commands;

use App\Models\AiHelpArticle;
use App\Support\Tenancy;
use Illuminate\Console\Command;

/**
 * D166 AI-Q4: loads the agent-written platform help articles (resources/help/articles.json) as DRAFTS - one per language; an
 * article already there (same slug and language) is left alone. Nothing is shown until a Super Admin panel user approves it.
 */
class AiHelpSeed extends Command
{
    protected $signature = 'ai:help-seed';
    protected $description = 'Load the platform help articles as drafts for approval';

    public function handle(): int
    {
        $data = json_decode((string) file_get_contents(resource_path('help/articles.json')), true);
        $made = 0;
        Tenancy::withoutTenancy(function () use ($data, &$made) {
            foreach ($data['articles'] ?? [] as $a) {
                foreach (['bn', 'en'] as $locale) {
                    if (empty($a[$locale]) || AiHelpArticle::whereNull('institution_id')->where('slug', $a['slug'])->where('locale', $locale)->exists()) continue;
                    AiHelpArticle::create(['institution_id' => null, 'slug' => $a['slug'], 'locale' => $locale, 'title' => $a[$locale]['title'], 'keywords' => $a[$locale]['keywords'],
                        'roles' => $a['roles'], 'module' => $a['module'] ?? null, 'institution_types' => $a['institution_types'] ?? null, 'body' => $a[$locale]['body'],
                        'refs' => $a['refs'], 'status' => 'draft']);
                    $made++;
                }
            }
        });
        $this->line("drafts added {$made}");
        return self::SUCCESS;
    }
}
