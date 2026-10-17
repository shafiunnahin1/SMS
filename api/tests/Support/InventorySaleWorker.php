<?php

// Disposable-DB concurrency worker for StockConcurrencyTest: sells one unit on its own connection.
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
$institution = App\Models\Institution::findOrFail($input['institution_id']);
Illuminate\Support\Facades\Auth::setUser(App\Models\User::findOrFail($input['user_id']));
try {
    $movement = App\Support\Tenancy::as($institution, fn () => app(App\Services\InventoryService::class)
        ->move('sale', ['item_id' => $input['item_id'], 'qty' => '1', 'payment_method' => 'bank'], App\Models\User::findOrFail($input['user_id'])));
    echo json_encode(['receipt_no' => $movement->receipt_no], JSON_THROW_ON_ERROR);
} catch (App\Exceptions\BusinessException $e) {
    echo json_encode(['error' => $e->errorCode], JSON_THROW_ON_ERROR);
} catch (Throwable) {
    fwrite(STDERR, 'Sale worker failed');
    exit(4);
}
