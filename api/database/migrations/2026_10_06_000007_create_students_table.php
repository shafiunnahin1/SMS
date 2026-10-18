<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('students', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('student_id', 20);
            $table->unsignedBigInteger('program_id')->nullable();
            $table->unsignedBigInteger('batch_id')->nullable();
            $table->integer('roll_no')->nullable();
            $table->string('studying_at', 150)->nullable();
            $table->string('board_reg_no', 30)->nullable();
            $table->string('board_roll_no', 30)->nullable();
            $table->date('date_of_birth')->nullable();
            $table->enum('gender', ['male', 'female', 'other'])->nullable();
            $table->string('blood_group', 5)->nullable();
            $table->string('religion', 30)->nullable();
            $table->string('father_name', 100)->nullable();
            $table->string('mother_name', 100)->nullable();
            $table->string('guardian_phone', 20);
            $table->text('address')->nullable();
            $table->string('photo', 255)->nullable();
            $table->date('admission_date')->nullable();
            $table->enum('status', ['active', 'inactive', 'transferred'])->nullable()->default('active');
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->timestamp('deleted_at')->nullable();
            $table->timestamp('anonymized_at')->nullable();

            $table->unique(['institution_id', 'student_id'], 'unique_student_code');
            $table->index(['institution_id'], 'idx_students_institution');
            $table->index(['program_id'], 'idx_students_program');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('program_id')->references('id')->on('programs');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('students');
    }
};
