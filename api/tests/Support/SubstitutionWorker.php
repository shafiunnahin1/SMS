<?php
// D200 SUBL.6: a second real MySQL connection for the substitution races. Disposable test database only; input through stdin.
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\DB;
if (!app()->environment('testing') || DB::connection()->getDatabaseName() !== 'edu_saas_test') exit(2);
$in = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
file_put_contents($in['barrier'].'/'.$in['slot_no'].'.ready', 'ready');
$deadline = microtime(true) + 15;
while (!is_file($in['barrier'].'/go')) { if (microtime(true) > $deadline) exit(3); usleep(10000); }
try {
    if (!empty($in['lock_wait'])) DB::statement('SET SESSION innodb_lock_wait_timeout = '.(int) $in['lock_wait']);
    $result = App\Support\Tenancy::as(App\Models\Institution::findOrFail($in['institution_id']), function () use ($in) {
        $actor = App\Models\User::inTenant()->findOrFail($in['actor_id']);
        auth()->setUser($actor);
        return match ($in['mode']) {
            'slot' => app(App\Services\Substitution\SlotActionService::class)->act($in['action'], $in['leave'], $in['slot'], $in['body'], $actor, $in['key']),
            'approve' => ['leave' => app(App\Services\Hr\LeaveService::class)->transition($in['leave'], 'approve', [], $actor)->status],
            'routine' => ['routine' => app(App\Services\Routines\RoutineService::class)->save($in['data'], App\Models\Routine::findOrFail($in['routine']))->id],
        };
    });
    echo json_encode(['ok' => $result], JSON_THROW_ON_ERROR);
} catch (App\Exceptions\BusinessException $e) {
    echo json_encode(['error' => $e->errorCode], JSON_THROW_ON_ERROR);
} catch (Illuminate\Auth\Access\AuthorizationException) {
    echo json_encode(['error' => 'forbidden'], JSON_THROW_ON_ERROR);        // e.g. the offer was withdrawn first: the actor is no longer the target
} catch (Throwable $e) {
    fwrite(STDERR, 'Substitution worker failed: '.get_class($e).' '.substr($e->getMessage(), 0, 300)); exit(4);
}
