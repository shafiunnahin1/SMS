<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D197 AAD.4: attendance per routine period (schema.sql `period_attendances`; docs/modules/academics-advanced.md section 3)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('period_attendances', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('routine_id');
            $table->date('date');
            $table->enum('status', ['present', 'absent', 'late', 'leave']);
            $table->unsignedBigInteger('taken_by')->nullable();
            $table->string('note', 255)->nullable();
            $table->unique(['student_id', 'routine_id', 'date'], 'unique_period_attendance');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('student_id')->references('id')->on('students');
            $table->foreign('routine_id')->references('id')->on('routines');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('period_attendances');
    }
};
