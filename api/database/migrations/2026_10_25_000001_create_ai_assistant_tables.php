<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// D164 (2)(3)(4): the AI assistant's chats, the review of every answer, and the reviewed answer bank (searched first; a NULL
// institution_id = a reviewer's answer open to every institution, D164 owner answer 3)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_conversations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('user_id');
            $table->string('title', 200);
            $table->timestamps();
            $table->index(['institution_id', 'user_id', 'updated_at'], 'idx_ai_conversations_user');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('user_id')->references('id')->on('users');
        });
        Schema::create('ai_messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('ai_conversation_id');
            $table->string('role', 10);                                   // question | answer
            $table->text('body');
            $table->string('kind', 12)->nullable();                       // answer: direct | composed | not_found
            $table->json('sources')->nullable();                          // [{type, id, title}]
            $table->tinyInteger('rating')->nullable();                    // -1 | 1
            $table->string('model_version', 40)->nullable();              // D164 (6): the CPU model that phrased it, null = template
            $table->timestamps();
            $table->index(['institution_id', 'ai_conversation_id', 'id'], 'idx_ai_messages_conversation');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('ai_conversation_id')->references('id')->on('ai_conversations');
        });
        Schema::create('ai_reviews', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('ai_message_id');
            $table->string('status', 12)->default('unreviewed');          // unreviewed | approved | corrected | rewritten
            $table->text('reviewer_text')->nullable();
            $table->unsignedTinyInteger('weight')->default(0);            // approved 1, corrected 2, rewritten 3
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->unique('ai_message_id', 'uq_ai_reviews_message');
            $table->index(['status', 'id'], 'idx_ai_reviews_queue');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('ai_message_id')->references('id')->on('ai_messages');
        });
        Schema::create('ai_answer_bank', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id')->nullable();      // NULL = open to every institution
            $table->text('question_text');
            $table->text('answer_text');
            $table->unsignedTinyInteger('weight')->default(1);
            $table->unsignedBigInteger('ai_review_id')->nullable();
            $table->json('sources')->nullable();
            $table->timestamps();
            $table->index(['institution_id'], 'idx_ai_answer_bank_scope');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
        // Bangla words carry vowel signs the default parser splits on; the n-gram parser indexes any script
        DB::statement('ALTER TABLE ai_answer_bank ADD FULLTEXT INDEX ft_ai_answer_bank (question_text, answer_text) WITH PARSER ngram');
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_answer_bank');
        Schema::dropIfExists('ai_reviews');
        Schema::dropIfExists('ai_messages');
        Schema::dropIfExists('ai_conversations');
    }
};
