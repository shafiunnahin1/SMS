<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D212 HW.2: homework submissions (schema.sql `homework_submissions`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('homework_submissions', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('homework_id');
            $t->unsignedBigInteger('student_id');
            $t->string('file_path', 500)->nullable();
            $t->text('text_answer')->nullable();
            $t->timestamp('submitted_at')->nullable()->useCurrent();
            $t->string('grade', 10)->nullable();
            $t->text('teacher_feedback')->nullable();
            $t->timestamp('feedback_at')->nullable();
            $t->enum('status', ['submitted', 'late', 'graded'])->nullable()->default('submitted');
            $t->foreign('homework_id')->references('id')->on('homeworks');
            $t->foreign('student_id')->references('id')->on('students');
            $t->unique(['homework_id', 'student_id'], 'unique_submission');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('homework_submissions');
    }
};
