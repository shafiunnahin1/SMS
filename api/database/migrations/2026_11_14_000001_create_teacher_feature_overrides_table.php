<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D205 PERM.1: per-teacher exceptions to the institution's teacher feature switches (schema.sql `teacher_feature_overrides`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('teacher_feature_overrides', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('user_id');
            $t->string('feature_key', 40);
            $t->enum('state', ['blocked', 'allowed']);
            $t->unsignedBigInteger('set_by')->nullable();
            $t->timestamps();
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('user_id')->references('id')->on('users');
            $t->foreign('set_by')->references('id')->on('users');
            $t->unique(['institution_id', 'user_id', 'feature_key'], 'uq_teacher_feature');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('teacher_feature_overrides');
    }
};
