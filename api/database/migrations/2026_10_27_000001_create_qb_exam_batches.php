<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D165 (3) ST.2: SSC / HSC exam batches (the Super Admin's), the batch a self-registered student chose, and a validity on single-item
// student unlocks - an expired item can be bought again, so (student, item) is no longer unique
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_exam_batches', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->enum('kind', ['ssc', 'hsc']);
            $table->json('class_level_ids');
            $table->date('exam_ends_on');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::table('learner_profiles', function (Blueprint $table) {
            $table->unsignedBigInteger('qb_exam_batch_id')->nullable()->after('qb_class_level_id');
            $table->foreign('qb_exam_batch_id')->references('id')->on('qb_exam_batches');
        });
        Schema::table('qb_student_unlocks', function (Blueprint $table) {
            $table->timestamp('expires_at')->nullable()->after('reason');
            $table->unsignedBigInteger('qb_exam_batch_id')->nullable()->after('expires_at');
            $table->foreign('qb_exam_batch_id')->references('id')->on('qb_exam_batches');
            $table->index(['student_user_id', 'item_type', 'item_id', 'expires_at'], 'idx_qb_student_unlock_item');
        });
        Schema::table('qb_student_unlocks', function (Blueprint $table) {
            $table->dropUnique('unique_qb_student_unlock');
        });
    }

    public function down(): void
    {
        Schema::table('qb_student_unlocks', function (Blueprint $table) {
            $table->dropForeign(['qb_exam_batch_id']);
            $table->dropColumn(['expires_at', 'qb_exam_batch_id']);
            $table->unique(['student_user_id', 'item_type', 'item_id'], 'unique_qb_student_unlock');
            $table->dropIndex('idx_qb_student_unlock_item');
        });
        Schema::table('learner_profiles', function (Blueprint $table) {
            $table->dropForeign(['qb_exam_batch_id']);
            $table->dropColumn('qb_exam_batch_id');
        });
        Schema::dropIfExists('qb_exam_batches');
    }
};
