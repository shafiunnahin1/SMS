<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D162 (1)(3)(7): an exam subject's marks - draft, submitted to the head, an update request after submit, and the head's answer
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exam_mark_submissions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('exam_subject_id');
            $table->string('status', 20)->default('draft');               // draft | submitted | unlock_requested | unlocked
            $table->unsignedBigInteger('submitted_by')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->string('request_reason', 500)->nullable();
            $table->unsignedBigInteger('requested_by')->nullable();
            $table->timestamp('requested_at')->nullable();
            $table->unsignedBigInteger('decided_by')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->string('decision_note', 500)->nullable();
            $table->timestamps();
            $table->unique('exam_subject_id', 'uq_exam_mark_submissions_subject');
            $table->index(['institution_id', 'status'], 'idx_exam_mark_submissions_status');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('exam_subject_id')->references('id')->on('exam_subjects');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_mark_submissions');
    }
};
