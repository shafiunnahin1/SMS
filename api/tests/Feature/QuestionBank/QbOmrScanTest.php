<?php

namespace Tests\Feature\QuestionBank;

use App\Exceptions\TenantNotBoundException;
use App\Models\QbOmrForm;
use App\Models\QbOmrScan;
use App\Models\QbPaper;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QbOmrScanTest extends TestCase
{
    use RefreshDatabase;

    public function test_scans_keep_their_layout_version_and_duplicate_rolls_remain_reviewable(): void
    {
        $institution = $this->makeInstitution('omr-scan');
        [$paperId, $form] = Tenancy::as($institution, function () use ($institution) {
            $paper = QbPaper::create([
                'created_by' => 1,
                'title' => 'Final assessment',
                'status' => 'final',
                'total_marks' => '10.00',
            ]);
            $form = QbOmrForm::create([
                'institution_id' => $institution->id,
                'qb_paper_id' => $paper->id,
                'code' => 'OMR1234567',
                'settings_json' => ['roll_digits' => 6],
            ]);

            return [$paper->id, $form];
        });

        $scan = Tenancy::as($institution, fn () => QbOmrScan::create([
            'institution_id' => $institution->id,
            'qb_omr_form_id' => $form->id,
            'layout_version' => 1,
            'set_code' => 'A',
            'roll' => '001234',
            'answers_json' => ['A', null, 'C'],
            'answered_count' => 2,
            'correct_count' => 1,
            'obtained_marks' => '0.50',
            'status' => 'verified',
            'comparison_json' => ['unresolved' => []],
            'image_path' => 'institutions/' . $institution->id . '/omr/scan-1.jpg',
            'source' => 'upload',
        ]));

        Tenancy::as($institution, function () use ($form, $scan): void {
            QbOmrForm::whereKey($form->id)->update(['layout_version' => 2]);
            $scan->refresh();

            $this->assertSame(1, $scan->layout_version);
            $this->assertSame(['A', null, 'C'], $scan->answers_json);
            $this->assertSame('0.50', $scan->obtained_marks);
            $this->assertSame(['unresolved' => []], $scan->comparison_json);

            QbOmrScan::create([
                'institution_id' => $form->institution_id,
                'qb_omr_form_id' => $form->id,
                'layout_version' => 1,
                'roll' => '001234',
                'answers_json' => ['B'],
                'status' => 'verified',
                'source' => 'camera',
            ]);
            $this->assertSame(2, QbOmrScan::where('roll', '001234')->count());
        });

        $otherInstitution = $this->makeInstitution('omr-scan-other');
        $this->assertSame(0, Tenancy::as($otherInstitution, fn () => QbOmrScan::where('qb_omr_form_id', $form->id)->count()));
        $this->assertSame($paperId, $form->qb_paper_id);
    }

    public function test_scan_queries_fail_without_an_institution(): void
    {
        $this->expectException(TenantNotBoundException::class);
        QbOmrScan::count();
    }
}