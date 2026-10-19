<?php

namespace Tests\Feature\QuestionBank;

use App\Exceptions\TenantNotBoundException;
use App\Models\QbOmrForm;
use App\Models\QbPaper;
use App\Support\Tenancy;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QbOmrFormTest extends TestCase
{
    use RefreshDatabase;

    public function test_form_settings_are_tenant_scoped_and_versioned(): void
    {
        $institution = $this->makeInstitution('omr-form');
        $paperId = Tenancy::as($institution, fn () => QbPaper::create([
            'created_by' => 1,
            'title' => 'Final assessment',
            'status' => 'final',
            'total_marks' => '10.00',
        ])->id);

        $form = Tenancy::as($institution, fn () => QbOmrForm::create([
            'institution_id' => $institution->id,
            'qb_paper_id' => $paperId,
            'code' => 'OMR1234567',
            'settings_json' => ['roll_digits' => 6, 'options' => 4],
        ]));
        Tenancy::as($institution, fn () => $form->refresh());

        $this->assertSame(['roll_digits' => 6, 'options' => 4], $form->settings_json);
        $this->assertSame(1, $form->layout_version);
        $this->assertNull($form->locked_at);

        $otherInstitution = $this->makeInstitution('omr-form-other');
        $this->assertSame(0, Tenancy::as($otherInstitution, fn () => QbOmrForm::count()));
    }

    public function test_a_paper_has_only_one_form_per_institution(): void
    {
        $institution = $this->makeInstitution('omr-form-unique');
        $paperId = Tenancy::as($institution, fn () => QbPaper::create([
            'created_by' => 1,
            'title' => 'Final assessment',
            'status' => 'final',
            'total_marks' => '10.00',
        ])->id);

        Tenancy::as($institution, fn () => QbOmrForm::create([
            'institution_id' => $institution->id,
            'qb_paper_id' => $paperId,
            'code' => 'OMR1234567',
            'settings_json' => [],
        ]));

        try {
            Tenancy::as($institution, fn () => QbOmrForm::create([
                'institution_id' => $institution->id,
                'qb_paper_id' => $paperId,
                'code' => 'OMR7654321',
                'settings_json' => [],
            ]));
            $this->fail('a paper may only have one OMR form');
        } catch (QueryException) {
            $this->assertSame(1, Tenancy::as($institution, fn () => QbOmrForm::count()));
        }
    }

    public function test_form_queries_fail_without_an_institution(): void
    {
        $this->expectException(TenantNotBoundException::class);
        QbOmrForm::count();
    }
}