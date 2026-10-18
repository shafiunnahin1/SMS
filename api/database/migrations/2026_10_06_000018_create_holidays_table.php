<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('title', 150);
            $table->date('date');
            $table->enum('type', ['public', 'institution', 'optional'])->nullable()->default('public');
            $table->string('description', 255)->nullable();

            $table->index(['institution_id', 'date'], 'idx_holidays_date');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('holidays');
    }
};
