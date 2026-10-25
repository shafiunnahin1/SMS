<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D165 (2) ST.3: a student's purchase of a whole class, one subject of a class, or one chapter (newly added content included while
// valid), and the three student price kinds the Super Admin sets for them
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_student_scope_access', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('student_user_id');
            $table->enum('scope', ['class', 'subject', 'chapter']);
            $table->unsignedBigInteger('qb_class_level_id')->nullable();
            $table->unsignedBigInteger('qb_subject_id')->nullable();
            $table->unsignedBigInteger('qb_chapter_id')->nullable();
            $table->decimal('price', 10, 2);
            $table->timestamp('starts_at');
            $table->timestamp('expires_at');
            $table->unsignedBigInteger('qb_exam_batch_id')->nullable();
            $table->unsignedBigInteger('qb_student_order_id')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['institution_id', 'student_user_id', 'expires_at'], 'idx_qb_scope_access_student');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('qb_class_level_id')->references('id')->on('qb_class_levels');
            $table->foreign('qb_subject_id')->references('id')->on('qb_subjects');
            $table->foreign('qb_chapter_id')->references('id')->on('qb_chapters');
            $table->foreign('qb_exam_batch_id')->references('id')->on('qb_exam_batches');
            $table->foreign('qb_student_order_id')->references('id')->on('qb_student_orders');
        });
        Schema::table('qb_prices', function (Blueprint $table) {
            $table->enum('item_kind', ['question_answer', 'concept', 'resource_slide', 'resource_book', 'resource_pdf', 'quiz_package', 'class_pack', 'subject_pack', 'chapter_pack'])->change();
        });
    }

    public function down(): void
    {
        Schema::table('qb_prices', function (Blueprint $table) {
            $table->enum('item_kind', ['question_answer', 'concept', 'resource_slide', 'resource_book', 'resource_pdf', 'quiz_package'])->change();
        });
        Schema::dropIfExists('qb_student_scope_access');
    }
};
