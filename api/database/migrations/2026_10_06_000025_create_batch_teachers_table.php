<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('batch_teachers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('batch_id');
            $table->unsignedBigInteger('teacher_id');
            $table->unsignedBigInteger('subject_id')->default(0);
            $table->enum('pay_type', ['salary', 'fixed_monthly', 'per_class', 'percentage'])->nullable()->default('salary');
            $table->decimal('pay_rate', 10, 2)->nullable()->default(0);

            $table->unique(['batch_id', 'teacher_id', 'subject_id'], 'unique_batch_teacher');
            $table->foreign('batch_id')->references('id')->on('batches');
            $table->foreign('teacher_id')->references('id')->on('teachers');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('batch_teachers');
    }
};
