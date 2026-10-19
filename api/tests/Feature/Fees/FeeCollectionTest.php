<?php

namespace Tests\Feature\Fees;

use App\Models\{Batch, FeeCategory, FeePayment, Program, Student};
use App\Services\EnrollmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Queue, Storage};
use Tests\TestCase;

// Step 4.4 Done When over HTTP: a student in two batches pays both dues on ONE receipt with two lines; the enrollment's
// fee_override is what is charged; the receipt PDF carries the institution's logo, colour and a QR of primaryUrl().
class FeeCollectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_two_batches_one_receipt_two_lines_with_the_override_and_a_branded_pdf(): void
    {
        Queue::fake();
        Storage::fake('public');
        Storage::disk('public')->put('logos/l.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));
        $this->travelTo('2026-10-20 10:00:00');
        $i = $this->makeInstitution('feecoach', 'coaching');
        $i->forceFill(['logo_path' => 'logos/l.png'])->save();
        $student = Tenancy::as($i, function () {
            FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 1000, 'frequency' => 'monthly']);
            $p = Program::create(['name' => 'HSC']);
            $phy = Batch::create(['program_id' => $p->id, 'name' => 'Physics', 'monthly_fee' => 1000]);
            $math = Batch::create(['program_id' => $p->id, 'name' => 'Math', 'monthly_fee' => 1200]);
            $s = Student::create(['student_id' => 'C-1', 'guardian_phone' => '01711111111']);
            app(EnrollmentService::class)->enroll($s, $phy, ['enrolled_at' => '2026-10-01']);
            app(EnrollmentService::class)->enroll($s, $math, ['enrolled_at' => '2026-10-01', 'fee_override' => 900]);
            return $s;
        });
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);

        $dues = $this->api('GET', $host, "fees/dues?student_id={$student->id}", $admin)->assertOk()->json('data');
        $this->assertEqualsCanonicalizing(['1000.00', '900.00'], array_column($dues['lines'], 'amount'), 'the override (900) beats the batch fee (1200)');
        $this->assertSame('1900.00', $dues['total']);

        $res = $this->api('POST', $host, 'fees/collect', $admin, ['student_id' => $student->id, 'payment_method' => 'cash',
            'lines' => array_map(fn ($l) => ['key' => $l['key']], $dues['lines'])])->assertCreated();
        $receipt = $res->json('data');
        $this->assertSame([1, 2], array_column($receipt['lines'], 'line_no'));
        $this->assertSame('1900.00', $receipt['total']);
        $this->assertSame(1, Tenancy::as($i, fn () => FeePayment::distinct()->count('receipt_no')));
        $this->assertSame(2, Tenancy::as($i, fn () => FeePayment::where('receipt_no', $receipt['receipt_no'])->count()));
        $this->assertSame([], $this->api('GET', $host, "fees/dues?student_id={$student->id}", $admin)->json('data.lines'), 'both dues settled');

        $pdf = $this->api('GET', $host, "fees/receipt/{$receipt['id']}", $admin)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $bytes = $pdf->getContent();
        $this->assertStringStartsWith('%PDF', $bytes);
        $this->assertStringContainsString('Skia/PDF', $bytes, 'printed by Chromium (D50)');
        $this->assertGreaterThanOrEqual(1, substr_count($bytes, '/Subtype /Image'), 'the logo is embedded');

        // the view the PDF is printed from: logo, colour, QR of primaryUrl()
        $html = $this->receiptHtml($i, $receipt['id']);
        $this->assertStringContainsString('src="data:image/png;base64,', $html, 'logo');
        $this->assertStringContainsString('src="data:image/svg+xml;base64,', $html, 'QR');
        $this->assertStringContainsString('https://feecoach.' . config('tenancy.base_domain') . '/parent/fees?receipt=' . $receipt['receipt_no'], $html);
        $this->assertStringContainsString((string) Tenancy::as($i, fn () => app(\App\Services\ThemeService::class)->getTheme($i)['primary_color']), $html, 'colour');
    }

    public function test_categories_are_admin_only_and_payments_and_report_add_up(): void
    {
        Queue::fake();
        $this->travelTo('2026-10-20 10:00:00');
        $i = $this->makeInstitution('feeschool');
        $admin = $this->makeUser($i, 'admin');
        $accountant = $this->makeUser($i, 'accountant');
        $host = $this->hostOf($i);

        $this->api('POST', $host, 'fees/categories', $accountant, ['name' => 'X', 'amount' => 1, 'frequency' => 'once'])->assertForbidden();
        $this->api('POST', $host, 'fees/categories', $admin, ['name' => 'ভর্তি ফি', 'amount' => 'abc', 'frequency' => 'once'])->assertStatus(422);
        $tuition = $this->api('POST', $host, 'fees/categories', $admin, ['name' => 'মাসিক ফি', 'amount' => '500.50', 'frequency' => 'monthly'])
            ->assertCreated()->assertJsonPath('data.amount', '500.50')->json('data.id');
        $admission = $this->api('POST', $host, 'fees/categories', $admin, ['name' => 'ভর্তি ফি', 'amount' => 2000, 'frequency' => 'once'])->json('data.id');
        $this->api('POST', $host, 'fees/categories', $admin, ['name' => 'মাসিক ফি', 'amount' => 1, 'frequency' => 'once'])->assertStatus(422);

        $student = Tenancy::as($i, function () {
            $b = Batch::create(['program_id' => Program::create(['name' => 'Class 6'])->id, 'name' => 'A']);
            $s = Student::create(['student_id' => 'S-1', 'guardian_phone' => '01722222222']);
            app(EnrollmentService::class)->enroll($s, $b, ['enrolled_at' => '2026-10-01']);
            return $s;
        });
        $keys = array_column($this->api('GET', $host, "fees/dues?student_id={$student->id}", $accountant)->json('data.lines'), 'key');
        $this->assertCount(2, $keys);
        $this->api('POST', $host, 'fees/collect', $accountant, ['student_id' => $student->id, 'payment_method' => 'cash', 'lines' => [['key' => $keys[0]]]])->assertCreated();
        $this->api('POST', $host, 'fees/collect', $accountant, ['student_id' => $student->id, 'payment_method' => 'bkash', 'lines' => [['key' => $keys[1], 'paid_amount' => '100.25']]])->assertCreated();

        // once collected, a category's frequency is fixed; its amount may change; there is no delete route
        $this->api('PUT', $host, "fees/categories/{$tuition}", $admin, ['name' => 'মাসিক ফি', 'amount' => 500.5, 'frequency' => 'yearly'])
            ->assertStatus(422)->assertJsonPath('error', 'in_use');
        $this->api('PUT', $host, "fees/categories/{$tuition}", $admin, ['name' => 'মাসিক বেতন', 'amount' => 600, 'frequency' => 'monthly'])
            ->assertOk()->assertJsonPath('data.amount', '600.00')->assertJsonPath('data.in_use', true);
        $this->api('DELETE', $host, "fees/categories/{$tuition}", $admin)->assertStatus(405);
        $this->api('GET', $host, 'fees/categories', $admin)->assertOk()->assertJsonCount(2, 'data');

        $list = $this->api('GET', $host, 'fees/payments?from=2026-10-01&to=2026-10-31', $accountant)->assertOk();
        $this->assertSame(2, $list->json('meta.total'));
        $this->assertEqualsCanonicalizing(['500.50', '100.25'], array_column($list->json('data'), 'total'));
        $this->assertSame(1, $this->api('GET', $host, 'fees/payments?payment_method=bkash', $accountant)->json('meta.total'));
        $this->assertSame(0, $this->api('GET', $host, 'fees/payments?to=2026-09-30', $accountant)->json('meta.total'));

        $this->api('GET', $host, 'fees/report?month=2026-10', $accountant)->assertForbidden();
        $report = $this->api('GET', $host, 'fees/report?month=2026-10', $admin)->assertOk()->json('data');
        $this->assertSame(['600.75', 2], [$report['total'], $report['receipts']]);
        $this->assertEqualsCanonicalizing([['method' => 'cash', 'total' => '500.50'], ['method' => 'bkash', 'total' => '100.25']], $report['by_method']);
        $this->assertSame([['date' => '2026-10-20', 'total' => '600.75']], $report['by_day']);
        $this->assertSame('100.25', $this->api('GET', $host, "fees/report?month=2026-10&fee_category_id={$admission}", $admin)->json('data.total'));
        $this->assertSame('0.00', $this->api('GET', $host, 'fees/report?month=2026-09', $admin)->json('data.total'));
    }

    private function receiptHtml($i, int $id): string
    {
        $this->bindTenant($i);
        $controller = app(\App\Http\Controllers\Fees\FeeController::class);
        $fake = new class extends \App\Services\PdfService {         // captures the HTML the real PdfService would print
            public ?string $html = null;
            public function render(string $view, array $data = [], string $paper = 'a4', string $orientation = 'portrait', bool $qbankFigures = false): string
            {
                $theme = app(\App\Services\ThemeService::class)->getTheme(Tenancy::current());
                $this->html = view($view, $data + ['institution' => Tenancy::current(), 'theme' => $theme, 'locale' => 'bn', 'dir' => 'ltr',
                    'logo' => 'data:image/png;base64,' . base64_encode(Storage::disk('public')->get(Tenancy::current()->logo_path))])->render();
                return '%PDF';
            }
        };
        $controller->receipt(request(), $id, $fake);
        return $fake->html;
    }
}
