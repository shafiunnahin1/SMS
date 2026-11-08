<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D197 AAD.2: weighted final results (schema.sql `result_sheets`, `final_results`; docs/modules/academics-advanced.md section 1)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('result_sheets', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('program_id');
            $table->unsignedBigInteger('batch_id')->nullable();
            $table->unsignedBigInteger('academic_year_id')->nullable();
            $table->string('name', 100);
            $table->json('rule');
            $table->enum('status', ['draft', 'published'])->default('draft');
            $table->integer('version')->default(1);
            $table->timestamp('published_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('program_id')->references('id')->on('programs');
        });
        Schema::create('final_results', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('result_sheet_id');
            $table->unsignedBigInteger('student_id');
            $table->decimal('total_percentage', 5, 2)->nullable();
            $table->decimal('gpa', 3, 2)->nullable();
            $table->string('grade', 5)->nullable();
            $table->integer('position_program')->nullable();
            $table->integer('position_batch')->nullable();
            $table->boolean('is_pass')->default(false);
            $table->json('details');
            $table->unique(['result_sheet_id', 'student_id'], 'unique_final_result');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('result_sheet_id')->references('id')->on('result_sheets');
            $table->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('final_results');
        Schema::dropIfExists('result_sheets');
    }
};
