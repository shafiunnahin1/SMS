<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D158 (3): an exam subject's linked question paper (one paper per exam subject; a paper may serve many exams)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exam_papers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('exam_subject_id');
            $table->unsignedBigInteger('qb_paper_id');
            $table->unsignedBigInteger('linked_by')->nullable();
            $table->timestamps();
            $table->unique('exam_subject_id', 'unique_exam_papers_subject');
            $table->index(['institution_id', 'qb_paper_id'], 'idx_exam_papers_paper');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('exam_subject_id')->references('id')->on('exam_subjects');
            $table->foreign('qb_paper_id')->references('id')->on('qb_papers');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_papers');
    }
};
