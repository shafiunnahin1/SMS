<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D127, R2.1.6: accepted scans retain their form layout version for review and grading.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_omr_scans', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('qb_omr_form_id');
            $table->unsignedInteger('layout_version');
            $table->string('set_code', 10)->nullable();
            $table->string('roll', 12)->nullable();
            $table->unsignedBigInteger('matched_student_id')->nullable();
            $table->json('answers_json')->nullable();
            $table->unsignedSmallInteger('answered_count')->nullable();
            $table->unsignedSmallInteger('correct_count')->nullable();
            $table->decimal('obtained_marks', 8, 2)->nullable();
            $table->string('status', 30);
            $table->json('comparison_json')->nullable();
            $table->string('image_path', 255)->nullable();
            $table->string('source', 10);
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamps();

            $table->index(['institution_id', 'qb_omr_form_id', 'status', 'id'], 'idx_qb_omr_scans_review');
            $table->index(['institution_id', 'qb_omr_form_id', 'roll'], 'idx_qb_omr_scans_form_roll');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('qb_omr_form_id')->references('id')->on('qb_omr_forms');
            $table->foreign('matched_student_id')->references('id')->on('students');
            $table->foreign('reviewed_by')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qb_omr_scans');
    }
};