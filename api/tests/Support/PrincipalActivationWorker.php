<?php

// Disposable-DB concurrency worker. Challenge material enters through stdin, never command arguments or files.
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!app()->environment('testing') || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'edu_saas_test') {
    fwrite(STDERR, 'Test database required');
    exit(2);
}
$input = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
file_put_contents($input['barrier'].'/'.$input['slot'].'.ready', 'ready');
$deadline = microtime(true) + 15;
while (!is_file($input['barrier'].'/go')) {
    if (microtime(true) > $deadline) exit(3);
    usleep(10000);
}
try {
    $state = app(App\Services\Auth\PrincipalProvisioningService::class)->verify($input['institution_id'], $input['public_id'], $input['code']);
    echo json_encode(['status' => $state['status']], JSON_THROW_ON_ERROR);
} catch (App\Exceptions\BusinessException $e) {
    echo json_encode(['error' => $e->errorCode], JSON_THROW_ON_ERROR);
} catch (Throwable) {
    // Exception messages and traces can contain secrets; the parent needs only a failure signal.
    fwrite(STDERR, 'Activation worker failed');
    exit(4);
}
