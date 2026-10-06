<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('enrollments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('program_id');
            $table->unsignedBigInteger('batch_id');
            $table->unsignedBigInteger('academic_year_id')->nullable();
            $table->integer('roll_no')->nullable();
            $table->unsignedBigInteger('optional_subject_id')->nullable();
            $table->decimal('fee_override', 10, 2)->nullable();
            $table->boolean('is_primary')->nullable()->default(0);
            $table->date('enrolled_at');
            $table->date('left_at')->nullable();
            $table->enum('status', ['active', 'completed', 'dropped', 'transferred', 'promoted'])->nullable()->default('active');
            $table->string('note', 255)->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->timestamp('updated_at')->nullable();

            $table->index(['institution_id', 'batch_id', 'status'], 'idx_enrollments_batch');
            $table->index(['student_id', 'status'], 'idx_enrollments_student');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('student_id')->references('id')->on('students');
            $table->foreign('program_id')->references('id')->on('programs');
            $table->foreign('batch_id')->references('id')->on('batches');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('enrollments');
    }
};
