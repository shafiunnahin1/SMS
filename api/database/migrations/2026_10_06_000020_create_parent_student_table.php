<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('parent_student', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('parent_user_id');
            $table->unsignedBigInteger('student_id');
            $table->enum('relationship', ['father', 'mother', 'guardian'])->nullable()->default('guardian');
            $table->boolean('is_primary')->nullable()->default(0);

            $table->unique(['parent_user_id', 'student_id'], 'unique_parent_student');
            $table->index(['parent_user_id'], 'idx_parent_student');
            $table->foreign('parent_user_id')->references('id')->on('users');
            $table->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('parent_student');
    }
};
