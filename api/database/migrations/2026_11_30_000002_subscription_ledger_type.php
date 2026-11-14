<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D218 WAL.2: a subscription invoice paid from the central wallet is a ledger row of its own type `subscription` (schema.sql)
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sms_credit_transactions', fn (Blueprint $t) => $t->enum('type', ['purchase', 'usage', 'adjustment', 'refund', 'qb_purchase', 'subscription'])->change());
    }

    public function down(): void
    {
        Schema::table('sms_credit_transactions', fn (Blueprint $t) => $t->enum('type', ['purchase', 'usage', 'adjustment', 'refund', 'qb_purchase'])->change());
    }
};
