<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D233 HST.3: a closed mess month of a hostel, its totals and rate frozen (schema.sql `hostel_mess_months`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hostel_mess_months', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('hostel_id');
            $t->char('month', 7);
            $t->enum('mode', ['fixed_monthly', 'per_meal', 'meal_rate']);
            $t->decimal('total_meals', 10, 2)->default(0);
            $t->decimal('total_bazar', 12, 2)->default(0);
            $t->decimal('meal_rate', 10, 4)->nullable();
            $t->unsignedBigInteger('closed_by')->nullable();
            $t->timestamp('closed_at');
            $t->unique(['institution_id', 'hostel_id', 'month'], 'unique_hostel_mess_month');
            $t->foreign('hostel_id')->references('id')->on('hostels');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hostel_mess_months');
    }
};
