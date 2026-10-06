<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('program_id');
            $table->unsignedBigInteger('batch_id');
            $table->date('date');
            $table->enum('status', ['present', 'absent', 'late', 'leave']);
            $table->string('note', 255)->nullable();
            $table->unsignedBigInteger('taken_by')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();

            $table->unique(['institution_id', 'student_id', 'batch_id', 'date'], 'unique_attendance');
            $table->index(['institution_id', 'date'], 'idx_attendance_date');
            $table->index(['institution_id', 'batch_id', 'date'], 'idx_attendance_batch_date');
            $table->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendances');
    }
};
