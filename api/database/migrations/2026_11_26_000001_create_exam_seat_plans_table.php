<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D213 CAL.3: exam seating (schema.sql `exam_seat_plans`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exam_seat_plans', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('exam_id');
            $t->unsignedBigInteger('student_id');
            $t->string('room_name', 50)->nullable();
            $t->string('seat_number', 20)->nullable();
            $t->integer('seat_row')->nullable();
            $t->integer('column_number')->nullable();
            $t->unique(['exam_id', 'room_name', 'seat_number'], 'unique_seat');
            $t->foreign('exam_id')->references('id')->on('exams');
            $t->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_seat_plans');
    }
};
