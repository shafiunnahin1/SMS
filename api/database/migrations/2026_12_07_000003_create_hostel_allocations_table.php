<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D233 HST.1: a student in a room from check-in to check-out; ended, never deleted (schema.sql `hostel_allocations`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hostel_allocations', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id');
            $t->unsignedBigInteger('room_id');
            $t->date('check_in_date');
            $t->date('check_out_date')->nullable();
            $t->enum('status', ['active', 'checked_out'])->nullable()->default('active');
            $t->foreign('student_id')->references('id')->on('students');
            $t->foreign('room_id')->references('id')->on('hostel_rooms');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hostel_allocations');
    }
};
