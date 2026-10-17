<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fee_categories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('name', 100);
            $table->decimal('amount', 10, 2);
            $table->enum('frequency', ['monthly', 'yearly', 'once'])->nullable()->default('monthly');
            $table->enum('applicable_to', ['all', 'program_specific'])->nullable()->default('all');

            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fee_categories');
    }
};
