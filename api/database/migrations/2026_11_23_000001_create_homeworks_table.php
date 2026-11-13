<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D212 HW.1: homework (schema.sql `homeworks` and its two indexes)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('homeworks', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('teacher_id');
            $t->unsignedBigInteger('program_id');
            $t->unsignedBigInteger('batch_id')->nullable();
            $t->unsignedBigInteger('subject_id');
            $t->string('title', 150);
            $t->text('description')->nullable();
            $t->string('file_path', 255)->nullable();
            $t->date('due_date')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->timestamp('deleted_at')->nullable();
            $t->index(['institution_id', 'program_id', 'batch_id'], 'idx_homeworks_audience');
            $t->index(['teacher_id', 'created_at'], 'idx_homeworks_teacher');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('homeworks');
    }
};
