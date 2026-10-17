<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Task QB.0 (D65/D66, docs/database/schema.sql "Question bank and quizzes"): the platform curriculum (class -> subject -> chapter ->
// topic), the writers' roles, and the two institution-side columns (programs.qb_class_level_id, teachers.qb_monthly_cap).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->enum('role', ['super_admin', 'admin', 'teacher', 'student', 'parent', 'accountant', 'content_writer', 'content_moderator'])->change();
        });
        Schema::create('qb_class_levels', function (Blueprint $t) {
            $t->id();
            $t->string('name_bn', 100);
            $t->string('name_en', 100);
            $t->enum('education_level', ['primary', 'secondary', 'higher_secondary', 'madrasa', 'technical', 'admission', 'other'])->default('other');
            $t->integer('sort_order')->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
        Schema::create('qb_subjects', function (Blueprint $t) {
            $t->id();
            $t->string('name_bn', 150);
            $t->string('name_en', 150);
            $t->string('code', 30)->nullable();
            $t->integer('sort_order')->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
        Schema::create('qb_class_level_subject', function (Blueprint $t) {
            $t->unsignedBigInteger('qb_class_level_id');
            $t->unsignedBigInteger('qb_subject_id');
            $t->primary(['qb_class_level_id', 'qb_subject_id']);
            $t->foreign('qb_class_level_id')->references('id')->on('qb_class_levels');
            $t->foreign('qb_subject_id')->references('id')->on('qb_subjects');
        });
        Schema::create('qb_chapters', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_subject_id');
            $t->string('name_bn', 200);
            $t->string('name_en', 200);
            $t->unsignedSmallInteger('number')->nullable();
            $t->integer('sort_order')->default(0);
            $t->timestamps();
            $t->foreign('qb_subject_id')->references('id')->on('qb_subjects');
        });
        Schema::create('qb_chapter_class_level', function (Blueprint $t) {
            $t->unsignedBigInteger('qb_chapter_id');
            $t->unsignedBigInteger('qb_class_level_id');
            $t->primary(['qb_chapter_id', 'qb_class_level_id']);
            $t->foreign('qb_chapter_id')->references('id')->on('qb_chapters');
            $t->foreign('qb_class_level_id')->references('id')->on('qb_class_levels');
        });
        Schema::create('qb_topics', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_chapter_id');
            $t->string('name_bn', 200);
            $t->string('name_en', 200);
            $t->integer('sort_order')->default(0);
            $t->timestamps();
            $t->foreign('qb_chapter_id')->references('id')->on('qb_chapters');
        });
        Schema::table('programs', fn (Blueprint $t) => $t->unsignedBigInteger('qb_class_level_id')->nullable());
        Schema::table('teachers', fn (Blueprint $t) => $t->decimal('qb_monthly_cap', 10, 2)->nullable());
    }

    public function down(): void
    {
        Schema::table('teachers', fn (Blueprint $t) => $t->dropColumn('qb_monthly_cap'));
        Schema::table('programs', fn (Blueprint $t) => $t->dropColumn('qb_class_level_id'));
        foreach (['qb_topics', 'qb_chapter_class_level', 'qb_chapters', 'qb_class_level_subject', 'qb_subjects', 'qb_class_levels'] as $table) Schema::dropIfExists($table);
        Schema::table('users', function (Blueprint $t) {
            $t->enum('role', ['super_admin', 'admin', 'teacher', 'student', 'parent', 'accountant'])->change();
        });
    }
};
