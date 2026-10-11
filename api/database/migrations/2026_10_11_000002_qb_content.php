<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Task QB.0 (D65, docs/database/schema.sql): the platform content - question types, questions with options / creative parts /
// structured items, board occurrences, revisions, media, concepts and resources (slides, books, PDFs). No institution_id: catalogue.
return new class extends Migration
{
    public function up(): void
    {
        $review = ['draft', 'review', 'published', 'rejected'];
        Schema::create('qb_question_types', function (Blueprint $t) {
            $t->id();
            $t->string('slug', 100)->unique('unique_qb_question_type_slug');
            $t->string('name_bn', 100);
            $t->string('name_en', 100);
            $t->enum('family', ['mcq', 'creative', 'short', 'fill_gap', 'matching', 'true_false', 'ordering', 'writing', 'other'])->default('other');
            $t->json('ui_config')->nullable();
            $t->boolean('is_active')->default(true);
            $t->integer('sort_order')->default(0);
            $t->timestamps();
        });
        Schema::create('qb_questions', function (Blueprint $t) use ($review) {
            $t->id();
            $t->unsignedBigInteger('qb_question_type_id');
            $t->unsignedBigInteger('qb_subject_id');
            $t->unsignedBigInteger('qb_chapter_id')->nullable();
            $t->unsignedBigInteger('qb_topic_id')->nullable();
            $t->unsignedTinyInteger('difficulty')->default(3);
            $t->decimal('marks', 5, 2)->default(1);
            $t->enum('language', ['bn', 'en'])->default('bn');
            $t->enum('content_mode', ['plain_text', 'rich_math', 'mixed'])->default('plain_text');
            $t->json('question_json')->nullable();
            $t->text('question_text');
            $t->json('answer_json')->nullable();
            $t->text('answer_text')->nullable();
            $t->json('explanation_json')->nullable();
            $t->text('explanation_text')->nullable();
            $t->enum('status', $review)->default('draft');
            $t->string('review_note', 500)->nullable();
            $t->unsignedBigInteger('created_by');
            $t->unsignedBigInteger('reviewed_by')->nullable();
            $t->timestamp('published_at')->nullable();
            $t->integer('sort_order')->default(0);
            $t->timestamps();
            $t->softDeletes();
            $t->index(['status', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id'], 'idx_qb_questions_browse');
            $t->index(['created_by', 'status'], 'idx_qb_questions_writer');
            $t->foreign('qb_question_type_id')->references('id')->on('qb_question_types');
            $t->foreign('qb_subject_id')->references('id')->on('qb_subjects');
            $t->foreign('qb_chapter_id')->references('id')->on('qb_chapters');
            $t->foreign('qb_topic_id')->references('id')->on('qb_topics');
        });
        Schema::create('qb_question_options', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_question_id');
            $t->string('label', 10);
            $t->json('content_json')->nullable();
            $t->text('content_text');
            $t->boolean('is_correct')->default(false);
            $t->integer('sort_order')->default(0);
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
        });
        Schema::create('qb_creative_parts', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_question_id');
            $t->string('part_label', 10);
            $t->enum('cognitive_level', ['knowledge', 'understanding', 'application', 'higher_order']);
            $t->decimal('marks', 5, 2);
            $t->json('question_json')->nullable();
            $t->text('question_text');
            $t->json('answer_json')->nullable();
            $t->text('answer_text')->nullable();
            $t->integer('sort_order')->default(0);
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
        });
        Schema::create('qb_question_stimuli', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_question_id');
            $t->string('label', 50)->nullable();
            $t->json('content_json')->nullable();
            $t->text('content_text')->nullable();
            $t->integer('sort_order')->default(0);
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
        });
        Schema::create('qb_question_items', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_question_id');
            $t->unsignedBigInteger('qb_question_stimulus_id')->nullable();
            $t->string('item_type', 50);
            $t->json('prompt_json')->nullable();
            $t->text('prompt_text')->nullable();
            $t->json('answer_json')->nullable();
            $t->decimal('marks', 5, 2)->default(0);
            $t->integer('sort_order')->default(0);
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
            $t->foreign('qb_question_stimulus_id')->references('id')->on('qb_question_stimuli');
        });
        Schema::create('qb_question_class_level', function (Blueprint $t) {
            $t->unsignedBigInteger('qb_question_id');
            $t->unsignedBigInteger('qb_class_level_id');
            $t->primary(['qb_question_id', 'qb_class_level_id']);
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
            $t->foreign('qb_class_level_id')->references('id')->on('qb_class_levels');
        });
        Schema::create('qb_question_occurrences', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_question_id');
            $t->string('board', 50)->nullable();
            $t->string('institution_name', 200)->nullable();
            $t->string('exam_type', 50)->nullable();
            $t->unsignedSmallInteger('year')->nullable();
            $t->string('note', 200)->nullable();
            $t->index(['board', 'year'], 'idx_qb_occurrence_board_year');
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
        });
        Schema::create('qb_question_revisions', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_question_id');
            $t->json('snapshot');
            $t->unsignedBigInteger('edited_by');
            $t->timestamp('created_at')->nullable();
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
        });
        Schema::create('qb_media', function (Blueprint $t) {
            $t->id();
            $t->string('path', 500);
            $t->string('mime', 100);
            $t->unsignedBigInteger('size_bytes');
            $t->unsignedBigInteger('uploaded_by');
            $t->timestamp('created_at')->nullable();
        });
        Schema::create('qb_media_links', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_media_id');
            $t->string('owner_type', 50);
            $t->unsignedBigInteger('owner_id');
            $t->index(['owner_type', 'owner_id'], 'idx_qb_media_owner');
            $t->foreign('qb_media_id')->references('id')->on('qb_media');
        });
        Schema::create('qb_concepts', function (Blueprint $t) use ($review) {
            $t->id();
            $t->unsignedBigInteger('qb_topic_id');
            $t->string('title_bn', 250);
            $t->string('title_en', 250)->nullable();
            $t->json('body_json')->nullable();
            $t->mediumText('body_text');
            $t->enum('status', $review)->default('draft');
            $t->string('review_note', 500)->nullable();
            $t->unsignedBigInteger('created_by');
            $t->unsignedBigInteger('reviewed_by')->nullable();
            $t->integer('sort_order')->default(0);
            $t->timestamps();
            $t->softDeletes();
            $t->index(['qb_topic_id', 'status'], 'idx_qb_concepts_topic');
            $t->foreign('qb_topic_id')->references('id')->on('qb_topics');
        });
        Schema::create('qb_resources', function (Blueprint $t) use ($review) {
            $t->id();
            $t->enum('kind', ['slide', 'book', 'pdf']);
            $t->string('title_bn', 250);
            $t->string('title_en', 250)->nullable();
            $t->unsignedBigInteger('qb_subject_id')->nullable();
            $t->unsignedBigInteger('qb_chapter_id')->nullable();
            $t->unsignedBigInteger('qb_topic_id')->nullable();
            $t->unsignedBigInteger('qb_media_id');
            $t->unsignedInteger('page_count')->nullable();
            $t->enum('status', $review)->default('draft');
            $t->string('review_note', 500)->nullable();
            $t->unsignedBigInteger('created_by');
            $t->unsignedBigInteger('reviewed_by')->nullable();
            $t->timestamps();
            $t->softDeletes();
            $t->index(['status', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id'], 'idx_qb_resources_scope');
            $t->foreign('qb_subject_id')->references('id')->on('qb_subjects');
            $t->foreign('qb_chapter_id')->references('id')->on('qb_chapters');
            $t->foreign('qb_topic_id')->references('id')->on('qb_topics');
            $t->foreign('qb_media_id')->references('id')->on('qb_media');
        });
    }

    public function down(): void
    {
        foreach (['qb_resources', 'qb_concepts', 'qb_media_links', 'qb_media', 'qb_question_revisions', 'qb_question_occurrences', 'qb_question_class_level',
            'qb_question_items', 'qb_question_stimuli', 'qb_creative_parts', 'qb_question_options', 'qb_questions', 'qb_question_types'] as $table) Schema::dropIfExists($table);
    }
};
