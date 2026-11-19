<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D233 HST.3: each hostel's mess mode, fee, meal rates and weights; an allocation with or without mess (schema.sql ALTERs)
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hostels', function (Blueprint $t) {
            $t->enum('mess_mode', ['none', 'fixed_monthly', 'per_meal', 'meal_rate'])->default('none');
            $t->decimal('mess_monthly_fee', 8, 2)->nullable();
            $t->decimal('breakfast_rate', 8, 2)->nullable();
            $t->decimal('lunch_rate', 8, 2)->nullable();
            $t->decimal('dinner_rate', 8, 2)->nullable();
            $t->decimal('breakfast_weight', 4, 2)->default(1.00);
            $t->decimal('lunch_weight', 4, 2)->default(1.00);
            $t->decimal('dinner_weight', 4, 2)->default(1.00);
        });
        Schema::table('hostel_allocations', function (Blueprint $t) {
            $t->boolean('with_mess')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('hostel_allocations', fn (Blueprint $t) => $t->dropColumn('with_mess'));
        Schema::table('hostels', fn (Blueprint $t) => $t->dropColumn(['mess_mode', 'mess_monthly_fee', 'breakfast_rate', 'lunch_rate', 'dinner_rate', 'breakfast_weight', 'lunch_weight', 'dinner_weight']));
    }
};
