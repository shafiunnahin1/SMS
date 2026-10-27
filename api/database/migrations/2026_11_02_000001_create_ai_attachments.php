<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D166 (5) AI-Q5: a photo a user sends to the AI chat - read on our own server by Tesseract (no outside service), kept in private
// storage for one day, then deleted (at once when the student's data is erased)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_attachments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('user_id');
            $table->string('path', 255);
            $table->string('mime', 50);
            $table->unsignedInteger('size_bytes');
            $table->enum('ocr_status', ['done', 'unsupported', 'failed'])->default('failed');
            $table->decimal('ocr_confidence', 5, 2)->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();
            $table->index(['institution_id', 'user_id'], 'idx_ai_attachments_user');
            $table->index('expires_at', 'idx_ai_attachments_expiry');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('user_id')->references('id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_attachments');
    }
};
