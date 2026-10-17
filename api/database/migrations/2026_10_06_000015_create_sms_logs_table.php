<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('to_phone', 20);
            $table->text('message');
            $table->enum('status', ['sent', 'failed'])->nullable()->default('sent');
            $table->unsignedTinyInteger('segments')->default(1);
            $table->string('encoding', 10)->default('gsm');
            $table->string('sender_id', 20)->nullable();
            $table->boolean('fallback_used')->nullable()->default(0);
            $table->string('error', 255)->nullable();
            $table->timestamp('sent_at')->nullable()->useCurrent();
            $table->unsignedBigInteger('sent_by')->nullable();
            $table->unsignedBigInteger('campaign_id')->nullable();
            $table->string('gateway_msg_id', 60)->nullable();
            $table->string('delivery_status', 12)->nullable();
            $table->timestamp('delivered_at')->nullable();

            $table->index(['institution_id', 'sent_at'], 'idx_sms_logs_inst_sent');
            $table->index(['campaign_id'], 'idx_sms_logs_campaign');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_logs');
    }
};
