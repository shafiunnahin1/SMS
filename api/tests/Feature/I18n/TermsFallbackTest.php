<?php

namespace Tests\Feature\I18n;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/I18N.md section 14 "TermsFallbackTest": a missing word follows the chain (ar -> bn -> en, bn -> en, en -> bn) and only then
// the key; every config term has bn and en.
class TermsFallbackTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_missing_word_follows_the_language_chain_before_the_key(): void
    {
        $i = $this->makeInstitution('terms', 'coaching');
        config(['institution_types.coaching.terms.batch' => ['bn' => 'ব্যাচ']]);              // no en, no ar
        config(['institution_types.coaching.terms.program' => ['en' => 'Course']]);           // no bn
        $this->asTenant($i, function () {
            $this->assertSame('ব্যাচ', term('batch', 'en'), 'en -> bn');
            $this->assertSame('ব্যাচ', term('batch', 'ar'), 'ar -> bn');
            $this->assertSame('Course', term('program', 'bn'), 'bn -> en');
            $this->assertSame('Course', term('program', 'ar'), 'ar -> bn -> en');
            $this->assertSame('no_such_term', term('no_such_term', 'bn'), 'the key is the very last resort');
        });
    }

    public function test_the_institution_override_wins_in_its_language_and_an_empty_override_does_not_hide_the_default(): void
    {
        $i = $this->makeInstitution('terms', 'school');
        $i->forceFill(['terminology' => ['batch' => ['bn' => 'গ্রুপ', 'en' => '']]])->save();
        $this->asTenant($i->fresh(), function () {
            $this->assertSame('গ্রুপ', term('batch', 'bn'));
            $this->assertSame('Section', term('batch', 'en'), 'an empty override falls through to the type default');
        });
    }

    public function test_every_config_term_has_bengali_and_english(): void
    {
        foreach (array_intersect_key(config('institution_types'), array_flip(['school', 'college', 'coaching', 'private_batch'])) as $type => $def) {
            foreach ($def['terms'] as $key => $words) {
                $this->assertNotEmpty($words['bn'] ?? null, "{$type}.{$key} bn");
                $this->assertNotEmpty($words['en'] ?? null, "{$type}.{$key} en");
            }
        }
    }
}
