<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D159 (1)(2): an exam subject may link several papers, and a multi-subject paper by one of its subject blocks
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_papers', function (Blueprint $table) {
            $table->unsignedBigInteger('qb_subject_id')->nullable()->after('qb_paper_id');
            $table->index('exam_subject_id', 'idx_exam_papers_subject');               // keeps the foreign key's index once the unique key goes
            $table->dropUnique('unique_exam_papers_subject');
            $table->unique(['exam_subject_id', 'qb_paper_id', 'qb_subject_id'], 'unique_exam_papers_block');
            $table->foreign('qb_subject_id')->references('id')->on('qb_subjects');
        });
    }

    public function down(): void
    {
        Schema::table('exam_papers', function (Blueprint $table) {
            $table->dropForeign(['qb_subject_id']);
            $table->dropUnique('unique_exam_papers_block');
            $table->unique('exam_subject_id', 'unique_exam_papers_subject');
            $table->dropIndex('idx_exam_papers_subject');
            $table->dropColumn('qb_subject_id');
        });
    }
};
