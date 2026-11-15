<?php

namespace Tests\Feature\Fees;

use App\Models\{Batch, FeeCategory, Program, Student};
use App\Services\EnrollmentService;
use App\Support\{Hijri, Tenancy};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Queue, Storage};
use Tests\TestCase;

// D214 MAD.2 (madrasa.md section 2): a fee receipt shows the Hijri date beside its date when the institution turned the Hijri
// calendar on (the offset shifts the display only); with it off the receipt is unchanged
class ReceiptHijriTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_calendar_and_its_offset(): void
    {
        $this->assertSame('1 Shawwal 1447', Hijri::format('2026-03-20 23:30:00', 0, 'en'));
        $this->assertSame('30 Ramadan 1447', Hijri::format('2026-03-20', -1, 'en'));
        $this->assertMatchesRegularExpression('/^1 .+ 1447$/u', Hijri::format('2026-03-20', 0, 'bn'));
    }

    public function test_a_receipt_carries_the_hijri_date_only_when_turned_on(): void
    {
        Queue::fake();
        Storage::fake('public');
        Storage::disk('public')->put('logos/l.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));
        $this->travelTo('2026-03-20 10:00:00');
        $i = $this->makeInstitution('hijrirec', 'coaching');
        $i->forceFill(['logo_path' => 'logos/l.png'])->save();
        $student = Tenancy::as($i, function () {
            FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 500, 'frequency' => 'monthly']);
            $b = Batch::create(['program_id' => Program::create(['name' => 'হিফজ'])->id, 'name' => 'ক', 'monthly_fee' => 500]);
            $s = Student::create(['student_id' => 'M-1', 'guardian_phone' => '01711111111']);
            app(EnrollmentService::class)->enroll($s, $b, ['enrolled_at' => '2026-03-01']);
            return $s;
        });
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);
        $dues = $this->api('GET', $host, "fees/dues?student_id={$student->id}", $admin)->assertOk()->json('data');
        $receipt = $this->api('POST', $host, 'fees/collect', $admin, ['student_id' => $student->id, 'payment_method' => 'cash',
            'lines' => array_map(fn ($l) => ['key' => $l['key']], $dues['lines'])])->assertCreated()->json('data');

        $this->assertStringNotContainsString('1447', $this->receiptHtml($i, $receipt['id']), 'off: unchanged');
        $i->forceFill(['settings' => array_replace($i->settings ?? [], ['calendar' => ['secondary' => 'hijri', 'hijri_offset' => 0]])])->save();
        $this->assertMatchesRegularExpression('/20\/03\/2026 \(1 .+ 1447\)/u', $this->receiptHtml($i->refresh(), $receipt['id']));
        $i->forceFill(['settings' => array_replace($i->settings, ['calendar' => ['secondary' => 'hijri', 'hijri_offset' => -1]])])->save();
        $this->assertMatchesRegularExpression('/20\/03\/2026 \(30 .+ 1447\)/u', $this->receiptHtml($i->refresh(), $receipt['id']), 'the offset moves the display only');
    }

    private function receiptHtml($i, int $id): string
    {
        $this->bindTenant($i);
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
        app(\App\Http\Controllers\Fees\FeeController::class)->receipt(request(), $id, $fake);
        return $fake->html;
    }
}
