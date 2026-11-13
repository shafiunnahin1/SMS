<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D210 CERT.1: certificates (schema.sql `certificates` with its later columns memo_no, verify_code, revoked_at and indexes)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('certificates', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id');
            $t->enum('type', ['participation', 'merit', 'appreciation', 'completion', 'attestation', 'testimonial']);
            $t->string('title', 150);
            $t->text('description')->nullable();
            $t->date('issued_date');
            $t->unsignedBigInteger('issued_by');
            $t->string('certificate_no', 30);
            $t->string('pdf_path', 500)->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->string('memo_no', 40)->nullable();
            $t->string('verify_code', 16)->nullable();
            $t->timestamp('revoked_at')->nullable();
            $t->unique(['institution_id', 'certificate_no'], 'unique_certificate_no');
            $t->unique(['institution_id', 'verify_code'], 'uq_cert_verify');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('certificates');
    }
};
