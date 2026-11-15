<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D224 SYL.1: the syllabus unit tree per program and subject (syllabus.md section 1; schema.sql `syllabus_units`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('syllabus_units', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('program_id');
            $t->unsignedBigInteger('subject_id');
            $t->unsignedBigInteger('parent_id')->nullable();
            $t->string('title', 200);
            $t->string('term', 20)->nullable();
            $t->integer('planned_periods')->nullable();
            $t->integer('sort_order')->default(0);
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('program_id')->references('id')->on('programs');
            $t->foreign('subject_id')->references('id')->on('subjects');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('syllabus_units');
    }
};
