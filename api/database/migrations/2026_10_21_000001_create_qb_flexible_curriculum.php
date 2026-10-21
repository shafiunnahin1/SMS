<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D138/D139: versioned, variable-depth curriculum links for language questions.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_curriculum_versions', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_subject_id');
            $t->string('version_key', 64);
            $t->string('name_bn', 200);
            $t->string('name_en', 200);
            $t->unsignedInteger('sort_order')->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['qb_subject_id', 'version_key'], 'unique_qb_curriculum_subject_version');
            $t->index(['qb_subject_id', 'is_active', 'sort_order'], 'idx_qb_curriculum_versions_subject');
            $t->foreign('qb_subject_id')->references('id')->on('qb_subjects');
        });

        Schema::create('qb_curriculum_nodes', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_curriculum_version_id');
            $t->unsignedBigInteger('parent_id')->nullable();
            $t->string('kind', 20);
            $t->string('name_bn', 200);
            $t->string('name_en', 200);
            $t->unsignedInteger('sort_order')->default(0);
            $t->unsignedBigInteger('legacy_qb_chapter_id')->nullable();
            $t->unsignedBigInteger('legacy_qb_topic_id')->nullable();
            $t->timestamps();
            $t->index(['qb_curriculum_version_id', 'parent_id', 'sort_order'], 'idx_qb_curriculum_nodes_parent_order');
            $t->unique('legacy_qb_chapter_id', 'unique_qb_curriculum_legacy_chapter');
            $t->unique('legacy_qb_topic_id', 'unique_qb_curriculum_legacy_topic');
            $t->foreign('qb_curriculum_version_id')->references('id')->on('qb_curriculum_versions');
            $t->foreign('parent_id')->references('id')->on('qb_curriculum_nodes');
            $t->foreign('legacy_qb_chapter_id')->references('id')->on('qb_chapters');
            $t->foreign('legacy_qb_topic_id')->references('id')->on('qb_topics');
        });

        Schema::create('qb_question_curriculum_nodes', function (Blueprint $t) {
            $t->unsignedBigInteger('qb_question_id');
            $t->unsignedBigInteger('qb_curriculum_node_id');
            $t->unsignedSmallInteger('sort_order')->default(0);
            $t->primary(['qb_question_id', 'qb_curriculum_node_id'], 'pk_qb_question_curriculum_nodes');
            $t->index(['qb_curriculum_node_id', 'qb_question_id'], 'idx_qb_curriculum_node_questions');
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
            $t->foreign('qb_curriculum_node_id')->references('id')->on('qb_curriculum_nodes');
        });

        Schema::table('qb_question_occurrences', function (Blueprint $t) {
            $t->string('question_number', 30)->nullable()->after('exam_type');
            $t->string('set_label', 30)->nullable()->after('question_number');
            $t->string('page_reference', 100)->nullable()->after('note');
        });
    }

    public function down(): void
    {
        Schema::table('qb_question_occurrences', function (Blueprint $t) {
            $t->dropColumn(['question_number', 'set_label', 'page_reference']);
        });
        Schema::dropIfExists('qb_question_curriculum_nodes');
        Schema::dropIfExists('qb_curriculum_nodes');
        Schema::dropIfExists('qb_curriculum_versions');
    }
};
