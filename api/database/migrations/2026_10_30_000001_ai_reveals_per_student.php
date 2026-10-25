<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D165 (4) ST.6: a student's free answers are counted per student (a teacher's stay per institution), so one reveal row per
// institution, user, question and day
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_answer_reveals', function (Blueprint $table) {
            $table->unique(['institution_id', 'user_id', 'qb_question_id', 'revealed_on'], 'uq_ai_answer_reveals_user_day');
            $table->index(['institution_id', 'user_id', 'revealed_on'], 'idx_ai_answer_reveals_user_day');
        });
        Schema::table('ai_answer_reveals', function (Blueprint $table) {
            $table->dropUnique('uq_ai_answer_reveals_day');
        });
    }

    public function down(): void
    {
        Schema::table('ai_answer_reveals', function (Blueprint $table) {
            $table->unique(['institution_id', 'qb_question_id', 'revealed_on'], 'uq_ai_answer_reveals_day');
        });
        Schema::table('ai_answer_reveals', function (Blueprint $table) {
            $table->dropIndex('idx_ai_answer_reveals_user_day');
            $table->dropUnique('uq_ai_answer_reveals_user_day');
        });
    }
};
