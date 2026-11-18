<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D231 OCL.1: a scheduled online class with its meeting link (online-class.md; schema.sql `online_classes`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('online_classes', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('teacher_id');
            $t->unsignedBigInteger('program_id');
            $t->unsignedBigInteger('batch_id')->nullable();
            $t->unsignedBigInteger('subject_id')->nullable();
            $t->string('title', 150);
            $t->text('description')->nullable();
            $t->enum('platform', ['zoom', 'google_meet', 'jitsi', 'custom'])->nullable()->default('google_meet');
            $t->string('meeting_link', 500);
            $t->string('meeting_id', 100)->nullable();
            $t->string('passcode', 50)->nullable();
            $t->timestamp('scheduled_at');
            $t->integer('duration_minutes')->nullable()->default(60);
            $t->enum('status', ['scheduled', 'live', 'completed', 'cancelled'])->nullable()->default('scheduled');
            $t->string('recording_url', 500)->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->index(['institution_id', 'scheduled_at'], 'idx_online_classes_scheduled');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('online_classes');
    }
};
