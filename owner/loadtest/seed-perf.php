<?php
// 8.5 helper (agent, 2026-10-11): a peak-hour tenant (30 batches x 40 students, a teacher each, 300 parents, a monthly fee) inside the DEMO
// school of a DISPOSABLE database - never production. Writes inputs.json next to this file for infra/loadtest/peak-hour.k6.mjs.
// Run from the project root after `php artisan migrate:fresh --seed`:  php owner/loadtest/seed-perf.php   (about 12 minutes)
require __DIR__ . '/../../api/vendor/autoload.php';
$app = require __DIR__ . '/../../api/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\{Batch, FeeCategory, FeeStructure, Institution, ParentStudent, Program, Student, User};
use App\Services\{StudentService, TeacherService};
use App\Support\Tenancy;
$i = Institution::where('slug', 'dhanmondi-school')->firstOrFail();
$out = Tenancy::as($i, function () use ($i) {
    $pw = 'Perf@12345';
    $cat = FeeCategory::create(['name' => 'Perf monthly', 'amount' => '500.00', 'frequency' => 'monthly', 'applicable_to' => 'all']);
    $teachers = []; $parents = []; $acct = [];
    for ($p = 1; $p <= 3; $p++) {
        $program = Program::create(['name' => "Perf class $p"]);
        FeeStructure::create(['program_id' => $program->id, 'fee_category_id' => $cat->id, 'amount' => '500.00']);
        for ($b = 1; $b <= 10; $b++) {
            $n = ($p - 1) * 10 + $b;
            $t = app(TeacherService::class)->create(['name' => "Perf teacher $n", 'phone' => sprintf('0181%07d', $n)]);
            $t->user->forceFill(['password' => $pw, 'must_change_password' => false])->save();
            $batch = Batch::create(['program_id' => $program->id, 'name' => "P$n"]);
            $batch->forceFill(['teacher_id' => $t->id])->save();
            $ids = [];
            for ($s = 1; $s <= 40; $s++) {
                $st = app(StudentService::class)->create(['name' => "Perf student $n-$s", 'guardian_phone' => sprintf('0191%03d%04d', $n, $s), 'father_name' => "Perf guardian $n-$s"], $batch, ['roll_no' => $s]);
                $ids[] = $st->id;
                if ($s <= 10) {
                    $link = ParentStudent::where('student_id', $st->id)->first();
                    if ($link) { User::whereKey($link->parent_user_id)->first()->forceFill(['password' => $pw, 'must_change_password' => false])->save();
                        $parents[] = ['identifier' => sprintf('0191%03d%04d', $n, $s), 'password' => $pw, 'student_id' => $st->id]; }
                }
            }
            $teachers[] = ['identifier' => sprintf('0181%07d', $n), 'password' => $pw, 'batch_id' => $batch->id, 'student_ids' => $ids];
            $acct = array_merge($acct, array_slice($ids, 0, 5));
        }
    }
    foreach (['accountant@dhanmondischool.edu.bd', 'principal@dhanmondischool.edu.bd'] as $e) User::where('email', $e)->first()->forceFill(['password' => $pw, 'must_change_password' => false])->save();
    return ['teachers' => $teachers, 'parents' => $parents,
        'accountant' => ['identifier' => 'accountant@dhanmondischool.edu.bd', 'password' => $pw, 'student_ids' => $acct],
        'admin' => ['identifier' => 'principal@dhanmondischool.edu.bd', 'password' => $pw]];
});
file_put_contents(__DIR__ . '/inputs.json', json_encode($out, JSON_PRETTY_PRINT));
echo count($out['teachers']), ' teachers, ', count($out['parents']), " parents\n";
