<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exam_subjects', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('exam_id');
            $table->unsignedBigInteger('subject_id');
            $table->decimal('full_marks', 6, 2);
            $table->decimal('pass_marks', 6, 2);
            $table->date('exam_date')->nullable();
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->string('room', 50)->nullable();
            $table->json('components')->nullable();
            $table->integer('sort_order')->nullable()->default(0);
            $table->dateTime('entry_deadline')->nullable();
            $table->timestamp('locked_at')->nullable();
            $table->unsignedBigInteger('locked_by')->nullable();

            $table->unique(['exam_id', 'subject_id'], 'unique_exam_subject');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('exam_id')->references('id')->on('exams');
            $table->foreign('subject_id')->references('id')->on('subjects');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_subjects');
    }
};
