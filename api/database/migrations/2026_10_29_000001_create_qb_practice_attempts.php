<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D165 ST.4: a student's practice round over questions they may open (MCQ, marked on the server) and its result per subject / chapter
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_practice_attempts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('student_user_id');
            $table->unsignedBigInteger('qb_subject_id');
            $table->unsignedBigInteger('qb_chapter_id')->nullable();
            $table->json('question_ids');
            $table->json('answers')->nullable();
            $table->unsignedSmallInteger('total');
            $table->unsignedSmallInteger('correct')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
            $table->index(['institution_id', 'student_user_id', 'qb_subject_id'], 'idx_qb_practice_student');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('qb_subject_id')->references('id')->on('qb_subjects');
            $table->foreign('qb_chapter_id')->references('id')->on('qb_chapters');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qb_practice_attempts');
    }
};
