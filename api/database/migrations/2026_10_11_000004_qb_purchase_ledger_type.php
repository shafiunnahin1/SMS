<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// QB.7 (D66 (1), docs/modules/question-bank.md §4.2): question-bank buys come out of the institution's SMS taka wallet, written in
// the same ledger with their own type `qb_purchase` (schema.sql).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sms_credit_transactions', fn (Blueprint $t) => $t->enum('type', ['purchase', 'usage', 'adjustment', 'refund', 'qb_purchase'])->change());
    }

    public function down(): void
    {
        Schema::table('sms_credit_transactions', fn (Blueprint $t) => $t->enum('type', ['purchase', 'usage', 'adjustment', 'refund'])->change());
    }
};
