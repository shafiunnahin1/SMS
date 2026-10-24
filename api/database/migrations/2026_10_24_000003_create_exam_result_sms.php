<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D161 (4): one row per result / correction SMS of an exam - what was queued, and whether it went (sms_logs stays the billing record)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exam_result_sms', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('exam_id');
            $table->unsignedBigInteger('student_id');
            $table->string('kind', 12);                                   // result | correction
            $table->string('phone', 20)->nullable();
            $table->text('message');
            $table->string('status', 10)->default('pending');             // pending | sent | failed | skipped
            $table->unsignedBigInteger('sms_log_id')->nullable();
            $table->string('error', 60)->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->index(['institution_id', 'exam_id', 'kind', 'status'], 'idx_exam_result_sms_run');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('exam_id')->references('id')->on('exams');
            $table->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_result_sms');
    }
};
