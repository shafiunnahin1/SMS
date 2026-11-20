<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D235 BHV.1: a positive / negative / neutral note about a student (extended-features.md section 5; schema.sql `behavior_logs`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('behavior_logs', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id');
            $t->unsignedBigInteger('reported_by');
            $t->enum('type', ['positive', 'negative', 'neutral'])->nullable()->default('neutral');
            $t->string('category', 100)->nullable();
            $t->string('title', 150);
            $t->text('description')->nullable();
            $t->text('action_taken')->nullable();
            $t->date('date');
            $t->boolean('parent_notified')->nullable()->default(false);
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->index(['student_id', 'date'], 'idx_behavior_student');
            $t->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('behavior_logs');
    }
};
