<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D210 PTC.1: transfer certificates (schema.sql `tc_certificates` with its later columns memo_no, verify_code, revoked_at and indexes)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tc_certificates', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id');
            $t->string('tc_number', 30);
            $t->text('reason')->nullable();
            $t->string('last_class', 50)->nullable();
            $t->date('last_attendance_date')->nullable();
            $t->string('conduct', 50)->nullable()->default('Good');
            $t->date('issued_date');
            $t->unsignedBigInteger('issued_by');
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->string('memo_no', 40)->nullable();
            $t->string('verify_code', 16)->nullable();
            $t->timestamp('revoked_at')->nullable();
            $t->unique(['institution_id', 'tc_number'], 'unique_tc_number');
            $t->unique(['institution_id', 'verify_code'], 'uq_tc_verify');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tc_certificates');
    }
};
