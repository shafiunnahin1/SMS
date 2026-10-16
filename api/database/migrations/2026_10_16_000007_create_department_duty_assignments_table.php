<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D90: canonical docs/database/schema.sql; append-only foundation.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('department_duty_assignments', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('membership_id');
            $t->unsignedBigInteger('duty_id');
            $t->enum('status', ['active','revoked'])->default('active');
            $t->unsignedBigInteger('assigned_by');
            $t->unsignedBigInteger('revoked_by')->nullable();
            $t->timestamp('assigned_at')->useCurrent();
            $t->timestamp('revoked_at')->nullable();
            $t->unique(['institution_id','membership_id','duty_id'], 'unique_membership_duty');
            $t->index(['institution_id','membership_id','status'], 'idx_duty_assignments_membership_status');
            $t->foreign(['institution_id'])->references(['id'])->on('institutions');
            $t->foreign(['membership_id','institution_id'])->references(['id','institution_id'])->on('department_memberships');
            $t->foreign(['duty_id','institution_id'])->references(['id','institution_id'])->on('department_duties');
            $t->foreign(['assigned_by','institution_id'])->references(['id','institution_id'])->on('users');
            $t->foreign(['revoked_by','institution_id'])->references(['id','institution_id'])->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('department_duty_assignments');
    }
};
