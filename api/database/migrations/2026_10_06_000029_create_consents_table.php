<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('student_id');
            $table->string('type', 30);
            $table->enum('status', ['granted', 'revoked']);
            $table->string('guardian_name', 100)->nullable();
            $table->string('guardian_phone', 20)->nullable();
            $table->enum('method', ['paper', 'portal', 'otp', 'public_form']);
            $table->unsignedBigInteger('recorded_by')->nullable();
            $table->timestamp('granted_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->string('note', 255)->nullable();

            $table->unique(['student_id', 'type'], 'unique_consent');
            $table->index(['institution_id', 'guardian_phone', 'type', 'status'], 'idx_consents_phone');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consents');
    }
};
