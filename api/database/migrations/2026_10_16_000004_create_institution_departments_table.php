<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D90: canonical docs/database/schema.sql; append-only foundation.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('institution_departments', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('code', 40)->nullable();
            $t->string('name', 120);
            $t->string('description', 500)->nullable();
            $t->enum('status', ['active','archived'])->default('active');
            $t->unsignedBigInteger('created_by');
            $t->unsignedBigInteger('updated_by')->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->timestamp('updated_at')->nullable();
            $t->timestamp('archived_at')->nullable();
            $t->unique(['institution_id','name'], 'unique_department_name');
            $t->unique(['institution_id','code'], 'unique_department_code');
            $t->unique(['id','institution_id'], 'unique_department_tenant_identity');
            $t->index(['institution_id','status','id'], 'idx_departments_institution_status');
            $t->foreign(['institution_id'])->references(['id'])->on('institutions');
            $t->foreign(['created_by','institution_id'])->references(['id','institution_id'])->on('users');
            $t->foreign(['updated_by','institution_id'])->references(['id','institution_id'])->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('institution_departments');
    }
};
