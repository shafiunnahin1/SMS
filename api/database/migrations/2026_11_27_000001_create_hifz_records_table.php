<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D214 MAD.1: hifz sessions (schema.sql `hifz_records`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hifz_records', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id');
            $t->unsignedBigInteger('teacher_id')->nullable();
            $t->date('record_date');
            $t->string('kind', 8);
            $t->smallInteger('from_surah');
            $t->smallInteger('from_ayah');
            $t->smallInteger('to_surah');
            $t->smallInteger('to_ayah');
            $t->tinyInteger('para_no')->nullable();
            $t->decimal('pages', 4, 1)->nullable();
            $t->tinyInteger('quality')->nullable();
            $t->integer('mistakes')->nullable();
            $t->string('remarks', 255)->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('student_id')->references('id')->on('students');
            $t->index(['institution_id', 'student_id', 'record_date'], 'idx_hifz_student');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hifz_records');
    }
};
