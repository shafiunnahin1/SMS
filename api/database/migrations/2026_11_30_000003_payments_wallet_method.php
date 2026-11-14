<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D220 (1): a subscription bill paid from the central wallet is recorded with payments.method = 'wallet' (schema.sql)
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', fn (Blueprint $t) => $t->enum('method', ['bkash', 'nagad', 'card', 'cash', 'ssl', 'coupon', 'wallet'])->change());
    }

    public function down(): void
    {
        Schema::table('payments', fn (Blueprint $t) => $t->enum('method', ['bkash', 'nagad', 'card', 'cash', 'ssl', 'coupon'])->change());
    }
};
