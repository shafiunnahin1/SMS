<?php

namespace Tests\Feature\Syllabus;

use App\Models\{Batch, BatchTeacher, Program, QbChapter, QbClassLevel, QbSubject, QbTopic, Student, Subject, SyllabusUnit, Teacher, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Artisan, Queue, Storage};
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

// D224 SYL.2: the head teacher's matrix, the parent / student view (off by default; completed chapters only), clone (tree and
// order kept, parent ids remapped), the question-bank build (adds only), the Excel import kind `syllabus` and the Saturday digest.
class SyllabusToolsTest extends TestCase
{
    use RefreshDatabase;

    private function school(string $slug, bool $fakeQueue = true): array
    {
        if ($fakeQueue) Queue::fake();   // the import runs its job for real
        $this->travelTo('2026-11-10 10:00:00');
        $i = $this->makeInstitution($slug, 'school');
        $admin = $this->makeUser($i, 'admin');
        $teacherUser = $this->makeUser($i, 'teacher');
        $d = Tenancy::as($i, function () use ($teacherUser) {
            $p = Program::create(['name' => 'Class 6']);
            $math = Subject::create(['program_id' => $p->id, 'name' => 'Math']);
            $a = Batch::create(['program_id' => $p->id, 'name' => 'A']);
            $t = Teacher::where('user_id', $teacherUser->id)->first() ?? Teacher::create(['user_id' => $teacherUser->id, 'employee_id' => 'T-1', 'status' => 'active']);
            BatchTeacher::create(['batch_id' => $a->id, 'teacher_id' => $t->id, 'subject_id' => $math->id]);
            $ch = SyllabusUnit::create(['program_id' => $p->id, 'subject_id' => $math->id, 'title' => 'ভগ্নাংশ', 'term' => '১ম', 'sort_order' => 1]);
            $l1 = SyllabusUnit::create(['program_id' => $p->id, 'subject_id' => $math->id, 'parent_id' => $ch->id, 'title' => 'যোগ', 'sort_order' => 1]);
            $l2 = SyllabusUnit::create(['program_id' => $p->id, 'subject_id' => $math->id, 'parent_id' => $ch->id, 'title' => 'বিয়োগ', 'sort_order' => 2]);
            $ch2 = SyllabusUnit::create(['program_id' => $p->id, 'subject_id' => $math->id, 'title' => 'দশমিক', 'term' => '২য়', 'sort_order' => 2]);
            return compact('p', 'math', 'a', 't', 'ch', 'l1', 'l2', 'ch2');
        });
        return [$i, $admin, $teacherUser, $d, $this->hostOf($i)];
    }

    public function test_the_matrix_and_the_parent_and_student_view(): void
    {
        [$i, $admin, $teacher, $d, $host] = $this->school('syltool');
        foreach ([$d['l1'], $d['l2']] as $u) $this->api('POST', $host, 'syllabus/coverage', $teacher, ['batch_id' => $d['a']->id, 'unit_id' => $u->id])->assertCreated();
        $m = $this->api('GET', $host, 'syllabus/overview', $admin, ['program_id' => $d['p']->id])->assertOk()->json('data');
        $this->assertSame([['Math', 'A', ['teacher'], '66.67']], array_map(fn ($r) => [$r['subject']['name'], $r['batch']['name'], $r['teachers'], $r['percent']], $m), '2 of 3 leaves');
        $this->assertSame('100.00', $this->api('GET', $host, 'syllabus/overview', $admin, ['program_id' => $d['p']->id, 'term' => '১ম'])->json('data.0.percent'), 'one term only');
        $this->api('GET', $host, 'syllabus/overview', $teacher, ['program_id' => $d['p']->id])->assertForbidden();

        $student = Tenancy::as($i, fn () => app(StudentService::class)->create(['name' => 'Rafi', 'guardian_phone' => '01711111111'], $d['a']));
        $parent = Tenancy::as($i, fn () => $student->parents()->first());
        $parent->forceFill(['must_change_password' => false])->save();
        $this->api('GET', $host, "parent/children/{$student->id}/syllabus", $parent)->assertStatus(403)->assertJsonPath('error', 'syllabus_hidden');   // off by default
        $this->api('PUT', $host, 'syllabus/settings', $admin, ['show_parents' => true])->assertOk()->assertJsonPath('data.show_parents', true);
        $view = $this->api('GET', $host, "parent/children/{$student->id}/syllabus", $parent)->assertOk()->json('data');
        $this->assertSame([['subject' => 'Math', 'chapters' => ['ভগ্নাংশ'], 'total_chapters' => 2]], $view, 'completed chapters only');
        $this->assertStringNotContainsString('percent', json_encode($view));
        $this->assertStringNotContainsString('teacher', json_encode($view));
        $other = Tenancy::as($i, fn () => app(StudentService::class)->create(['name' => 'Other', 'guardian_phone' => '01711111112'], $d['a']));
        $this->api('GET', $host, "parent/children/{$other->id}/syllabus", $parent)->assertNotFound();
        $su = User::find(Tenancy::as($i, fn () => Student::find($student->id)->user_id));
        $su->forceFill(['must_change_password' => false])->save();                                    // the student's own view
        $this->api('GET', $host, 'student/syllabus', $su)->assertOk()->assertJsonPath('data.0.chapters', ['ভগ্নাংশ']);
    }

    public function test_clone_keeps_the_tree_and_the_question_bank_build_only_adds(): void
    {
        [$i, $admin, , $d, $host] = $this->school('sylclone');
        [$p7, $math7] = Tenancy::as($i, function () {
            $p = Program::create(['name' => 'Class 7']);
            return [$p, Subject::create(['program_id' => $p->id, 'name' => 'math'])];
        });
        $this->api('POST', $host, 'syllabus/units/clone', $admin, ['from_program_id' => $d['p']->id, 'to_program_id' => $p7->id])->assertOk()->assertJsonPath('data.made', 4);
        $tree = Tenancy::as($i, fn () => SyllabusUnit::where('program_id', $p7->id)->orderBy('id')->get());
        $byTitle = $tree->keyBy('title');
        $this->assertSame($byTitle['ভগ্নাংশ']->id, (int) $byTitle['বিয়োগ']->parent_id, 'parent ids remapped to the new units');
        $this->assertSame([$math7->id], $tree->pluck('subject_id')->unique()->values()->all());
        $this->api('POST', $host, 'syllabus/units/clone', $admin, ['from_program_id' => $d['p']->id, 'to_program_id' => $p7->id])->assertOk()->assertJsonPath('data.made', 0);

        $level = QbClassLevel::create(['name_bn' => 'ষষ্ঠ', 'name_en' => 'Six']);
        $qs = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Math']);
        $qs->classLevels()->attach($level->id);
        $c1 = QbChapter::create(['qb_subject_id' => $qs->id, 'name_bn' => 'ভগ্নাংশ', 'name_en' => 'Fractions', 'sort_order' => 1]);
        $c2 = QbChapter::create(['qb_subject_id' => $qs->id, 'name_bn' => 'জ্যামিতি', 'name_en' => 'Geometry', 'sort_order' => 2]);
        QbTopic::create(['qb_chapter_id' => $c1->id, 'name_bn' => 'যোগ', 'name_en' => 'Add']);
        QbTopic::create(['qb_chapter_id' => $c1->id, 'name_bn' => 'গুণ', 'name_en' => 'Multiply']);
        QbTopic::create(['qb_chapter_id' => $c2->id, 'name_bn' => 'কোণ', 'name_en' => 'Angles']);
        $this->assertSame([], $this->api('GET', $host, 'syllabus/qb-subjects', $admin, ['program_id' => $d['p']->id])->json('data'), 'class not linked: not offered');
        $this->api('POST', $host, 'syllabus/units/from-question-bank', $admin, ['program_id' => $d['p']->id, 'subject_id' => $d['math']->id, 'qb_subject_id' => $qs->id])->assertStatus(422);
        Tenancy::as($i, fn () => $d['p']->forceFill(['qb_class_level_id' => $level->id])->save());
        $this->assertSame([$qs->id], array_column($this->api('GET', $host, 'syllabus/qb-subjects', $admin, ['program_id' => $d['p']->id])->json('data'), 'id'));
        $this->api('POST', $host, 'syllabus/units/from-question-bank', $admin, ['program_id' => $d['p']->id, 'subject_id' => $d['math']->id, 'qb_subject_id' => $qs->id])
            ->assertOk()->assertJsonPath('data.made', 3);   // গুণ under the existing ভগ্নাংশ (যোগ is there already), then জ্যামিতি with কোণ
        $titles = Tenancy::as($i, fn () => SyllabusUnit::where('program_id', $d['p']->id)->pluck('title')->all());
        $this->assertEqualsCanonicalizing(['ভগ্নাংশ', 'যোগ', 'বিয়োগ', 'দশমিক', 'গুণ', 'জ্যামিতি', 'কোণ'], $titles, 'nothing changed or removed, missing ones added');
    }

    public function test_the_excel_import_and_the_saturday_digest(): void
    {
        Storage::fake('private');
        [$i, $admin, $teacher, $d, $host] = $this->school('sylimp', false);
        $book = new Spreadsheet();
        $book->getActiveSheet()->fromArray([['শ্রেণি', 'বিষয়', 'অধ্যায়', 'পাঠ', 'সাময়িক', 'পিরিয়ড'],
            ['Class 6', 'Math', 'বীজগণিত', 'সূচক', '২য়', '3'], ['Class 6', 'Math', 'বীজগণিত', 'উৎপাদক', '২য়', '4'],
            ['Class 6', 'Math', 'ভগ্নাংশ', 'যোগ', '১ম', '2'], ['Class 6', 'English', 'Tense', '', '', '']], null, 'A1', true);
        $path = tempnam(sys_get_temp_dir(), 'syl') . '.xlsx';
        (new Xlsx($book))->save($path);
        $job = $this->api('POST', $host, 'imports', $admin, ['kind' => 'syllabus', 'file' => new UploadedFile($path, 'syllabus.xlsx', null, null, true)])->assertCreated()->json('data');
        $this->api('PUT', $host, "imports/{$job['id']}/mapping", $admin, ['mapping' => ['program' => 'শ্রেণি', 'subject' => 'বিষয়', 'chapter' => 'অধ্যায়', 'lesson' => 'পাঠ', 'term' => 'সাময়িক', 'periods' => 'পিরিয়ড']])->assertOk();
        $dry = $this->api('POST', $host, "imports/{$job['id']}/dry-run", $admin)->assertOk()->json('data.summary');
        $this->assertSame([2, 1, 1], [$dry['ok'], $dry['skipped'], $dry['error']], 'two new lessons; ভগ্নাংশ/যোগ exists; English is not a subject');
        $this->api('POST', $host, "imports/{$job['id']}/run", $admin)->assertOk();
        Tenancy::as($i, function () use ($d) {
            $ch = SyllabusUnit::where(['program_id' => $d['p']->id, 'title' => 'বীজগণিত', 'parent_id' => null])->sole();
            $this->assertSame([['সূচক', '২য়', 3], ['উৎপাদক', '২য়', 4]], SyllabusUnit::where('parent_id', $ch->id)->orderBy('sort_order')->get()->map(fn ($u) => [$u->title, $u->term, $u->planned_periods])->all());
        });

        $this->api('POST', $host, 'lesson-plans', $teacher, ['batch_id' => $d['a']->id, 'subject_id' => $d['math']->id, 'unit_id' => $d['l1']->id, 'planned_date' => '2026-11-05'])->assertCreated();
        Artisan::call('syllabus:digest');
        $n = $admin->fresh()->notifications()->sole();
        $this->assertSame('syllabus_digest', $n->data['type']);
        $this->assertSame(1, $n->data['data']['behind']);
        $this->assertSame(0, $teacher->fresh()->notifications()->count(), 'the admins only');
        $event = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())->first(fn ($e) => str_contains($e->command, 'syllabus:digest'));
        $this->assertSame(['0 8 * * 6', 'Asia/Dhaka'], [$event->expression, $event->timezone]);
    }
}
