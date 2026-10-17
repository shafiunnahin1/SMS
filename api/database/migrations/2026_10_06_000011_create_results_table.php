<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('results', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('exam_id');
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('subject_id');
            $table->decimal('marks_obtained', 6, 2)->nullable();
            $table->json('component_marks')->nullable();
            $table->decimal('percentage', 5, 2)->nullable();
            $table->string('grade', 5)->nullable();
            $table->decimal('grade_point', 3, 2)->nullable();
            $table->boolean('is_absent')->nullable()->default(0);
            $table->boolean('is_pass')->nullable();
            $table->string('teacher_remarks', 255)->nullable();

            $table->unique(['exam_id', 'student_id', 'subject_id'], 'unique_result');
            $table->index(['exam_id', 'student_id'], 'idx_results_exam');
            $table->foreign('exam_id')->references('id')->on('exams');
            $table->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('results');
    }
};
