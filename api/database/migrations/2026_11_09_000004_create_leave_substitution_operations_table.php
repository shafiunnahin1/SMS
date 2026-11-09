<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D200 SUBL.1: the immutable receipt of one successful substitution request (schema.sql `leave_substitution_operations`; D99)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_substitution_operations', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('leave_application_id')->nullable();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('user_id');
            $t->unsignedBigInteger('department_id')->nullable();
            $t->string('action', 64);
            $t->char('idempotency_key_sha256', 64);
            $t->char('payload_sha256', 64);
            $t->string('result_code', 40);
            $t->unsignedSmallInteger('result_http_status');
            $t->unsignedInteger('result_slot_count');
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->unique(['institution_id', 'user_id', 'idempotency_key_sha256'], 'unique_leave_substitution_operation_request');
            $t->unique(['id', 'institution_id'], 'unique_leave_substitution_operation_tenant_identity');
            $t->unique(['id', 'institution_id', 'user_id'], 'unique_leave_substitution_operation_actor_identity');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign(['leave_application_id', 'institution_id'], 'lso_leave_fk')->references(['id', 'institution_id'])->on('leave_applications');
            $t->foreign(['user_id', 'institution_id'], 'lso_user_fk')->references(['id', 'institution_id'])->on('users');
            $t->foreign(['department_id', 'institution_id'], 'lso_department_fk')->references(['id', 'institution_id'])->on('institution_departments');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_substitution_operations');
    }
};
