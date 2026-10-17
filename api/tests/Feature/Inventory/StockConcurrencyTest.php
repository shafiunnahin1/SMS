<?php

namespace Tests\Feature\Inventory;

use App\Models\{Institution, InventoryItem, InventoryMovement};
use App\Services\InventoryService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

// Two real connections race for the last unit: one sale wins, the other gets 422; stock never goes negative.
class StockConcurrencyTest extends TestCase
{
    use DatabaseMigrations;

    public function test_two_connections_selling_the_last_unit_one_wins_and_stock_never_goes_negative(): void
    {
        $this->assertSame('edu_saas_test', DB::connection()->getDatabaseName());
        $i = $this->makeInstitution('store-race');
        $admin = $this->makeUser($i, 'admin');
        $this->actingAs($admin);
        $itemId = Tenancy::as($i, function () use ($admin) {
            $item = InventoryItem::create(['code' => 'LAST', 'name' => 'Last unit', 'sale_price' => '10', 'is_sellable' => true]);
            app(InventoryService::class)->move('receive', ['item_id' => $item->id, 'qty' => '1', 'unit_amount' => '5'], $admin);
            return $item->id;
        });
        $directory = sys_get_temp_dir().'/school-store-race-'.bin2hex(random_bytes(8));
        mkdir($directory);
        $processes = [];
        try {
            DB::beginTransaction();
            Institution::whereKey($i->id)->lockForUpdate()->firstOrFail();   // hold both workers at the institution lock
            foreach (['a', 'b'] as $slot) {
                $process = new Process([PHP_BINARY, base_path('tests/Support/InventorySaleWorker.php')], base_path(),
                    ['APP_ENV' => 'testing', 'DB_DATABASE' => 'edu_saas_test', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'MAIL_MAILER' => 'array']);
                $process->setTimeout(25);
                $process->setInput(json_encode(['institution_id' => $i->id, 'item_id' => $itemId, 'user_id' => $admin->id, 'barrier' => $directory, 'slot' => $slot], JSON_THROW_ON_ERROR));
                $process->start();
                $processes[$slot] = $process;
            }
            $deadline = microtime(true) + 15;
            while (!is_file($directory.'/a.ready') || !is_file($directory.'/b.ready')) {
                if (microtime(true) > $deadline) $this->fail('Workers did not reach the barrier');
                foreach ($processes as $process) if (!$process->isRunning()) $this->fail('Worker stopped before the barrier: '.$process->getErrorOutput());
                usleep(10000);
            }
            file_put_contents($directory.'/go', 'go');
            usleep(150000);
            foreach ($processes as $process) $this->assertTrue($process->isRunning(), 'A sale completed while the institution was locked');
            DB::commit();
            $outcomes = [];
            foreach ($processes as $process) {
                $this->assertSame(0, $process->wait(), $process->getErrorOutput());
                $outcomes[] = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
            }
            $this->assertSame(1, count(array_filter($outcomes, fn ($r) => isset($r['receipt_no']))));
            $this->assertSame(1, count(array_filter($outcomes, fn ($r) => ($r['error'] ?? null) === 'insufficient_stock')));
            Tenancy::as($i, function () use ($itemId) {
                $this->assertSame('0.00', InventoryItem::findOrFail($itemId)->stock);
                $this->assertSame(1, InventoryMovement::where('type', 'sale')->count());
            });
        } finally {
            if (DB::transactionLevel()) DB::rollBack();
            foreach ($processes as $process) if ($process->isRunning()) $process->stop();
            foreach (['a.ready', 'b.ready', 'go'] as $file) if (is_file($directory.'/'.$file)) unlink($directory.'/'.$file);
            rmdir($directory);
        }
    }
}
