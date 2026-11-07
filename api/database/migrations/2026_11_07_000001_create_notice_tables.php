<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D193 NTC.1: the notice board (schema.sql `notices` + the communication-plus columns `require_ack`, `ack_deadline`) and who read /
// acknowledged each notice (`notice_receipts`).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('title', 150);
            $table->text('content');
            $table->enum('target', ['all', 'students', 'teachers', 'parents'])->nullable()->default('all');
            $table->unsignedBigInteger('program_id')->nullable();
            $table->unsignedBigInteger('batch_id')->nullable();
            $table->timestamp('published_at')->nullable()->useCurrent();
            $table->string('attachment', 255)->nullable();
            $table->boolean('is_public')->nullable()->default(false);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('deleted_at')->nullable();
            $table->boolean('require_ack')->default(false);
            $table->date('ack_deadline')->nullable();
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->index(['institution_id', 'published_at'], 'idx_notices_inst_pub');
        });

        Schema::create('notice_receipts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('notice_id');
            $table->unsignedBigInteger('user_id');
            $table->timestamp('read_at')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->unique(['notice_id', 'user_id'], 'unique_notice_receipt');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('notice_id')->references('id')->on('notices');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notice_receipts');
        Schema::dropIfExists('notices');
    }
};
