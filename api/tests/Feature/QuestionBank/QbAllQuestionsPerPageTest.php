<?php

namespace Tests\Feature\QuestionBank;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D176 (2) QBS.1: All Questions may ask for up to 100 questions a page (validation only); more is refused.
class QbAllQuestionsPerPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_per_page_up_to_one_hundred(): void
    {
        $institution = $this->makeInstitution('qb-per-page');
        $admin = $this->makeUser($institution, 'admin');
        $host = $this->hostOf($institution);
        foreach ([25, 100] as $n) $this->api('GET', $host, "question-bank/questions?per_page={$n}", $admin)->assertOk()->assertJsonPath('meta.per_page', $n);
        $this->api('GET', $host, 'question-bank/questions?per_page=101', $admin)->assertStatus(422);
    }
}
