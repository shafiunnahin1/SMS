<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D243 ALM.1: alumni (extended-features.md section 16; schema.sql `alumni` with its R10 `address` / `profile_photo` and `idx_alumni_inst_year`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('alumni', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id')->nullable();
            $t->string('name', 100);
            $t->year('graduation_year');
            $t->string('last_class', 50)->nullable();
            $t->string('current_institution', 150)->nullable();
            $t->string('current_profession', 150)->nullable();
            $t->string('email', 100)->nullable();
            $t->string('phone', 20)->nullable();
            $t->text('achievements')->nullable();
            $t->boolean('is_verified')->nullable()->default(false);
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->text('address')->nullable();
            $t->string('profile_photo', 255)->nullable();   // D243 (6): no upload in this step
            $t->index(['institution_id', 'graduation_year'], 'idx_alumni_inst_year');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alumni');
    }
};
