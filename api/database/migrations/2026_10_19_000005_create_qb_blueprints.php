<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D126 (3), R2.1.5: qbank's assessment blueprints, platform rows written by the Super Admin (docs/database/schema.sql)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_blueprints', function (Blueprint $t) {
            $t->id();
            $t->string('name_bn', 200);
            $t->string('name_en', 200)->nullable();
            $t->unsignedBigInteger('qb_class_level_id')->nullable();
            $t->unsignedBigInteger('qb_subject_id');
            $t->string('exam_type', 50)->nullable();
            $t->decimal('total_marks', 6, 2)->default(0);
            $t->unsignedSmallInteger('duration_minutes')->nullable();
            $t->boolean('is_active')->default(true);
            $t->unsignedBigInteger('created_by');
            $t->timestamps();
            $t->index(['qb_subject_id', 'is_active'], 'idx_qb_blueprints_subject');
            $t->foreign('qb_class_level_id')->references('id')->on('qb_class_levels');
            $t->foreign('qb_subject_id')->references('id')->on('qb_subjects');
        });
        Schema::create('qb_blueprint_items', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_blueprint_id');
            $t->string('section_title', 200);
            $t->integer('sort_order')->default(0);
            $t->unsignedBigInteger('qb_question_type_id');
            $t->unsignedSmallInteger('question_count');
            $t->decimal('marks_each', 5, 2);
            $t->unsignedBigInteger('qb_chapter_id')->nullable();
            $t->unsignedBigInteger('qb_topic_id')->nullable();
            $t->unsignedTinyInteger('difficulty')->nullable();
            $t->foreign('qb_blueprint_id')->references('id')->on('qb_blueprints')->cascadeOnDelete();
            $t->foreign('qb_question_type_id')->references('id')->on('qb_question_types');
            $t->foreign('qb_chapter_id')->references('id')->on('qb_chapters');
            $t->foreign('qb_topic_id')->references('id')->on('qb_topics');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qb_blueprint_items');
        Schema::dropIfExists('qb_blueprints');
    }
};
