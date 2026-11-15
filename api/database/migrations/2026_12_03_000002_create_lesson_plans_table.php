<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D224 SYL.1: a teacher's lesson plan; marking it taught covers its unit once (syllabus.md section 2; schema.sql `lesson_plans`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lesson_plans', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('batch_id')->nullable();
            $t->unsignedBigInteger('subject_id');
            $t->unsignedBigInteger('teacher_id');
            $t->unsignedBigInteger('unit_id')->nullable();
            $t->date('planned_date');
            $t->text('objective')->nullable();
            $t->text('activities')->nullable();
            $t->text('resources')->nullable();
            $t->enum('status', ['planned', 'taught', 'skipped'])->default('planned');
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('subject_id')->references('id')->on('subjects');
            $t->foreign('teacher_id')->references('id')->on('teachers');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lesson_plans');
    }
};
