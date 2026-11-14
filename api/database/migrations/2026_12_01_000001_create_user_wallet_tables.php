<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D218 WAL.3: a student's own wallet and its append-only ledger (schema.sql `user_wallets`, `user_wallet_transactions`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_wallets', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('user_id');
            $t->decimal('balance', 10, 2)->default(0);
            $t->timestamp('updated_at')->nullable();
            $t->unique(['institution_id', 'user_id'], 'unique_user_wallet');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('user_id')->references('id')->on('users');
        });
        Schema::create('user_wallet_transactions', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('user_id');
            $t->enum('type', ['recharge', 'purchase', 'adjustment', 'refund']);
            $t->decimal('amount', 10, 2);
            $t->decimal('balance_after', 10, 2);
            $t->string('reference', 100)->nullable();
            $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->index(['user_id', 'created_at'], 'idx_user_wallet_txn');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_wallet_transactions');
        Schema::dropIfExists('user_wallets');
    }
};
