<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D90: canonical docs/database/schema.sql; append-only foundation.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('department_memberships', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('department_id');
            $t->unsignedBigInteger('user_id');
            $t->enum('status', ['active','inactive','ended'])->default('active');
            $t->date('starts_at')->nullable();
            $t->date('ends_at')->nullable();
            $t->unsignedBigInteger('created_by');
            $t->timestamp('created_at')->useCurrent();
            $t->timestamp('updated_at')->nullable();
            $t->unique(['institution_id','department_id','user_id'], 'unique_department_membership');
            $t->unique(['id','institution_id'], 'unique_membership_tenant_identity');
            $t->index(['institution_id','user_id','status'], 'idx_department_memberships_user_status');
            $t->foreign(['institution_id'])->references(['id'])->on('institutions');
            $t->foreign(['department_id','institution_id'])->references(['id','institution_id'])->on('institution_departments');
            $t->foreign(['user_id','institution_id'])->references(['id','institution_id'])->on('users');
            $t->foreign(['created_by','institution_id'])->references(['id','institution_id'])->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('department_memberships');
    }
};
