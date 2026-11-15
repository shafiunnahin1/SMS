<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Found in the 2026-11-15 browser check: each printed question carries ITS OWN marks. The lookup was built by flattening per-section
// maps keyed by question id, which renumbered the keys - with small ids a one-mark MCQ printed another question's marks.
class QbPaperMarksTest extends TestCase
{
    use RefreshDatabase;

    public function test_each_question_prints_its_own_marks_whatever_its_id(): void
    {
        $super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $mcq = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনি', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $short = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id;
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        $ids = [];
        foreach (range(1, 4) as $k) {
            $q = (new QbQuestion)->forceFill(['id' => $k])->fill(['qb_question_type_id' => $mcq, 'qb_subject_id' => $subject, 'question_text' => "প্রশ্ন {$k}", 'status' => 'published', 'created_by' => $super->id]);
            $q->save();
            foreach (['ক', 'খ'] as $o => $label) QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => $label, 'content_text' => "উত্তর {$o}", 'is_correct' => $o === 0, 'sort_order' => $o]);
            $ids[] = $q->id;
        }
        $w = (new QbQuestion)->forceFill(['id' => 5])->fill(['qb_question_type_id' => $short, 'qb_subject_id' => $subject, 'question_text' => 'লিখিত', 'status' => 'published', 'created_by' => $super->id]);
        $w->save();
        $written = $w->id;                                                      // ids 1-5, as on a fresh database: an id below the item count

        $i = $this->makeInstitution('marks');
        $admin = $this->makeUser($i, 'admin');
        Tenancy::as($i, fn () => array_map(fn ($id) => QbUnlock::create(['item_type' => 'question', 'item_id' => $id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']), [...$ids, $written]));
        $host = $this->hostOf($i);
        $id = $this->api('POST', $host, 'question-bank/papers', $admin, ['title' => 'পরীক্ষা', 'sections' => [
            ['title' => 'ক', 'items' => array_map(fn ($q) => ['qb_question_id' => $q, 'marks' => '1'], $ids)],
            ['title' => 'খ', 'items' => [['qb_question_id' => $written, 'marks' => '5']]]]])->assertCreated()->json('data.id');

        $data = $this->api('GET', $host, "question-bank/papers/{$id}/pdf?format=json", $admin)->assertOk()->json('data');
        $printed = collect($data['sections'])->flatMap(fn ($s) => $s['items'])->mapWithKeys(fn ($it) => [$it['question']['id'] => (string) $it['marks']])->all();
        $this->assertEquals(array_fill_keys($ids, '1.00') + [$written => '5.00'], $printed);
    }
}
