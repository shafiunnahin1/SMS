<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbPaper, QbPaperFolder, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D126 (1), R2.1.5: qbank's folders for papers - nest, rename, move (never into itself or below), delete only when empty,
// put a paper into a folder; a person's folders are their own, another institution's are invisible.
class QbPaperFolderTest extends TestCase
{
    use RefreshDatabase;

    public function test_folders_nest_move_without_cycles_and_delete_only_when_empty(): void
    {
        $i = $this->makeInstitution('folders');
        $host = $this->hostOf($i);
        $teacher = $this->makeUser($i, 'teacher');
        $mk = fn ($name, $parent = null) => $this->api('POST', $host, 'question-bank/paper-folders', $teacher, ['name' => $name, 'parent_id' => $parent])->assertCreated()->json('data.id');
        $exams = $mk('পরীক্ষা ২০২৬');
        $half = $mk('অর্ধবার্ষিক', $exams);
        $math = $mk('গণিত', $half);

        $this->api('PUT', $host, "question-bank/paper-folders/{$exams}", $teacher, ['parent_id' => $math])->assertStatus(422)->assertJsonPath('error', 'qb_folder_cycle');
        $this->api('PUT', $host, "question-bank/paper-folders/{$exams}", $teacher, ['parent_id' => $exams])->assertStatus(422)->assertJsonPath('error', 'qb_folder_cycle');
        $this->api('PUT', $host, "question-bank/paper-folders/{$math}", $teacher, ['parent_id' => null, 'name' => 'গণিত (সব)'])->assertOk()
            ->assertJsonPath('data.parent_id', null)->assertJsonPath('data.name', 'গণিত (সব)');

        $this->bindTenant($i);
        $paper = QbPaper::create(['created_by' => $teacher->id, 'title' => 'অর্ধবার্ষিক গণিত', 'total_marks' => '0', 'status' => 'draft']);
        $this->api('PUT', $host, "question-bank/papers/{$paper->id}/folder", $teacher, ['folder_id' => $half])->assertOk()->assertJsonPath('data.folder_id', $half);
        $tree = collect($this->api('GET', $host, 'question-bank/paper-folders', $teacher)->assertOk()->json('data'))->keyBy('id');
        $this->assertSame([3, 1, $exams], [$tree->count(), $tree[$half]['papers'], $tree[$half]['parent_id']]);

        $this->api('DELETE', $host, "question-bank/paper-folders/{$half}", $teacher)->assertStatus(422)->assertJsonPath('error', 'qb_folder_not_empty');
        $this->api('DELETE', $host, "question-bank/paper-folders/{$exams}", $teacher)->assertStatus(422);   // holds a folder
        $this->api('PUT', $host, "question-bank/papers/{$paper->id}/folder", $teacher, ['folder_id' => null])->assertOk();
        $this->api('DELETE', $host, "question-bank/paper-folders/{$half}", $teacher)->assertOk();
        $this->api('DELETE', $host, "question-bank/paper-folders/{$exams}", $teacher)->assertOk();
    }

    public function test_folders_are_their_owners_and_stay_in_their_institution(): void
    {
        $i = $this->makeInstitution('folders2');
        $host = $this->hostOf($i);
        $a = $this->makeUser($i, 'teacher');
        $b = \App\Models\User::create(['institution_id' => $i->id, 'name' => 'b', 'email' => 'teacher-b@example.test', 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
        $admin = $this->makeUser($i, 'admin');
        $folder = $this->api('POST', $host, 'question-bank/paper-folders', $a, ['name' => 'আমার'])->json('data.id');
        $this->bindTenant($i);
        $bPaper = QbPaper::create(['created_by' => $b->id, 'title' => 'b', 'total_marks' => '0', 'status' => 'draft']);
        $this->api('GET', $host, 'question-bank/paper-folders', $b)->assertOk()->assertJsonCount(0, 'data');
        $this->api('PUT', $host, "question-bank/paper-folders/{$folder}", $b, ['name' => 'x'])->assertNotFound();
        $this->api('PUT', $host, "question-bank/papers/{$bPaper->id}/folder", $a, ['folder_id' => $folder])->assertNotFound();   // not their paper
        $adminFolder = $this->api('POST', $host, 'question-bank/paper-folders', $admin, ['name' => 'প্রধান শিক্ষক'])->json('data.id');
        $this->api('PUT', $host, "question-bank/papers/{$bPaper->id}/folder", $admin, ['folder_id' => $adminFolder])->assertOk();   // the head teacher files any paper
        $this->api('POST', $host, 'question-bank/paper-folders', $a, ['name' => 'x', 'parent_id' => $adminFolder])->assertNotFound();

        $other = $this->makeInstitution('folders3');
        $stranger = $this->makeUser($other, 'admin');
        $this->api('PUT', $this->hostOf($other), "question-bank/paper-folders/{$folder}", $stranger, ['name' => 'x'])->assertNotFound();
        $this->assertSame(2, \App\Support\Tenancy::withoutTenancy(fn () => QbPaperFolder::count()));
    }
}
