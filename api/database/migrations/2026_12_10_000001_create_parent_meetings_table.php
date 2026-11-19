<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D235 MTG.1: a meeting between a teacher and a student's parents (extended-features.md section 14; schema.sql `parent_meetings`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('parent_meetings', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id');
            $t->unsignedBigInteger('teacher_id');
            $t->enum('requested_by', ['parent', 'teacher', 'admin'])->nullable()->default('teacher');
            $t->string('subject', 150);
            $t->date('proposed_date');
            $t->time('proposed_time');
            $t->string('location', 100)->nullable()->default('School Office');
            $t->enum('status', ['pending', 'confirmed', 'cancelled', 'completed'])->nullable()->default('pending');
            $t->text('notes')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->timestamp('parent_response_at')->nullable();   // schema.sql ALTER: the parent's last confirm / re-time
            $t->index(['teacher_id', 'proposed_date'], 'idx_meetings_teacher');
            $t->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('parent_meetings');
    }
};
