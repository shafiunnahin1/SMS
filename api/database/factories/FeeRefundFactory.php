<?php

namespace Database\Factories;

use App\Models\{FeeRefund, Student};
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class FeeRefundFactory extends Factory
{
    protected $model = FeeRefund::class;
    public function definition(): array
    {
        return ['student_id' => fn () => Student::first()?->id ?? Student::create([
            'student_id' => Str::random(12), 'guardian_phone' => '01900000000'])->id,
            'request_key' => (string) Str::uuid(), 'revision' => 1, 'original_receipt_no' => 'RCP-FIXTURE',
            'amount' => '10.00', 'refund_lines' => [], 'reason' => 'Fixture', 'method' => 'cash', 'status' => 'requested'];
    }
}
