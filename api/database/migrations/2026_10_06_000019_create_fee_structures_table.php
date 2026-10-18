<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fee_structures', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('program_id');
            $table->unsignedBigInteger('batch_id')->default(0);
            $table->unsignedBigInteger('fee_category_id');
            $table->decimal('amount', 10, 2);
            $table->unsignedBigInteger('academic_year_id')->default(0);

            $table->unique(['program_id', 'batch_id', 'fee_category_id', 'academic_year_id'], 'unique_fee_structure');
            $table->index(['batch_id', 'fee_category_id', 'academic_year_id'], 'idx_fee_structures_batch');
            $table->foreign('program_id')->references('id')->on('programs');
            $table->foreign('fee_category_id')->references('id')->on('fee_categories');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fee_structures');
    }
};
