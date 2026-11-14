<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D218 WAL.1: manual wallet top-up requests (schema.sql `wallet_recharge_requests`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wallet_recharge_requests', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('user_id')->nullable();
            $t->decimal('amount', 10, 2);
            $t->string('method', 30);
            $t->string('trx_reference', 100);
            $t->string('receipt_path', 500)->nullable();
            $t->string('note', 255)->nullable();
            $t->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $t->unsignedBigInteger('requested_by');
            $t->unsignedBigInteger('decided_by')->nullable();
            $t->timestamp('decided_at')->nullable();
            $t->string('decision_note', 255)->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->index(['institution_id', 'status'], 'idx_wallet_recharge_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_recharge_requests');
    }
};
