<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D164 (2): each time the assistant shows the answer of a question the institution has not unlocked - counted per institution per
// day against the free quota (a free reveal is not an unlock: it never allows use in a paper)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_answer_reveals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('qb_question_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('ai_message_id')->nullable();
            $table->date('revealed_on');
            $table->timestamps();
            $table->unique(['institution_id', 'qb_question_id', 'revealed_on'], 'uq_ai_answer_reveals_day');
            $table->index(['institution_id', 'revealed_on'], 'idx_ai_answer_reveals_day');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('qb_question_id')->references('id')->on('qb_questions');
            $table->foreign('user_id')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_answer_reveals');
    }
};
