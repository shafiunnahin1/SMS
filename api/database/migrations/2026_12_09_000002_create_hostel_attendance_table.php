<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D233 HST.4: one row per resident per night (schema.sql `hostel_attendance`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hostel_attendance', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('hostel_id');
            $t->unsignedBigInteger('student_id');
            $t->date('date');
            $t->enum('status', ['present', 'absent', 'leave'])->default('present');
            $t->unsignedBigInteger('marked_by')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->timestamp('updated_at')->nullable();
            $t->unique(['institution_id', 'student_id', 'date'], 'unique_hostel_attendance');
            $t->index(['institution_id', 'hostel_id', 'date'], 'idx_hostel_attendance_day');
            $t->foreign('hostel_id')->references('id')->on('hostels');
            $t->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hostel_attendance');
    }
};
