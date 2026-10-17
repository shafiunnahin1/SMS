<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D101: persist reviewed legacy mappings and the institution's explicit rollout state.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('institutions', function (Blueprint $table) {
            $table->enum('staff_department_mode', ['legacy', 'department'])->default('legacy');
            $table->unsignedBigInteger('switched_by')->nullable();
            $table->timestamp('switched_at')->nullable();
            $table->foreign('switched_by')->references('id')->on('users');
        });

        Schema::create('staff_mapping_reviews', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('teacher_id')->nullable();
            $table->unsignedBigInteger('staff_member_id')->nullable();
            $table->string('decision', 40);
            $table->unsignedBigInteger('reviewed_by');
            $table->timestamp('reviewed_at');
            $table->string('note', 255)->nullable();
            $table->index(['institution_id', 'user_id', 'reviewed_at', 'id'], 'idx_staff_mapping_reviews_user');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('user_id')->references('id')->on('users');
            $table->foreign('teacher_id')->references('id')->on('teachers');
            $table->foreign('staff_member_id')->references('id')->on('staff_members');
            $table->foreign('reviewed_by')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_mapping_reviews');
        Schema::table('institutions', function (Blueprint $table) {
            $table->dropForeign(['switched_by']);
            $table->dropColumn(['staff_department_mode', 'switched_by', 'switched_at']);
        });
    }
};