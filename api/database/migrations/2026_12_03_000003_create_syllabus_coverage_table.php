<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D224 SYL.1: a unit covered in a batch - once per batch and unit (syllabus.md section 1; schema.sql `syllabus_coverage`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('syllabus_coverage', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('batch_id');
            $t->unsignedBigInteger('unit_id');
            $t->unsignedBigInteger('teacher_id');
            $t->date('covered_on');
            $t->string('note', 255)->nullable();
            $t->unique(['institution_id', 'batch_id', 'unit_id'], 'unique_unit_coverage');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('unit_id')->references('id')->on('syllabus_units');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('syllabus_coverage');
    }
};
