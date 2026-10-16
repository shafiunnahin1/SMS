<?php
// Disposable-DB race worker: challenge/password enter through stdin, never command arguments or barrier files.
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!app()->environment('testing') || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'edu_saas_test') exit(2);
$input = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
file_put_contents($input['barrier'].'/'.$input['slot'].'.ready', 'ready');
$deadline = microtime(true) + 15;
while (!is_file($input['barrier'].'/go')) { if (microtime(true) > $deadline) exit(3); usleep(10000); }
try {
    $result = App\Support\Tenancy::as(App\Models\Institution::findOrFail($input['institution_id']), function () use ($input) {
        $service = app(App\Services\Auth\StaffAccountService::class);
        if ($input['mode'] === 'deactivate') {
            $actor = App\Models\User::inTenant()->findOrFail($input['actor_id']);
            $result = $service->update($actor, $input['user_id'], ['is_active' => false]);
            return ['status' => $result['user']->is_active ? 'active' : 'inactive'];
        }
        $state = $service->activate($input['public_id'], $input['code'], ['password' => $input['password'], 'password_confirmation' => $input['password']]);
        return ['status' => $state['status']];
    });
    echo json_encode($result, JSON_THROW_ON_ERROR);
} catch (App\Exceptions\BusinessException $e) {
    echo json_encode(['error' => $e->errorCode], JSON_THROW_ON_ERROR);
} catch (Throwable) {
    fwrite(STDERR, 'Staff activation worker failed'); exit(4);
}
