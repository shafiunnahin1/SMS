<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D165 (1) ST.1: a self-registered student's own class (the exam batch joins in ST.2)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('learner_profiles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('qb_class_level_id')->nullable();
            $table->timestamps();
            $table->unique('user_id', 'uq_learner_profiles_user');
            $table->index('institution_id', 'idx_learner_profiles_institution');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('user_id')->references('id')->on('users');
            $table->foreign('qb_class_level_id')->references('id')->on('qb_class_levels');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('learner_profiles');
    }
};
