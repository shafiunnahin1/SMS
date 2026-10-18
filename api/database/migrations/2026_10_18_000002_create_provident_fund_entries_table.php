<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// R3.8 (staff-payroll.md §10): the PF ledger, append-only, exactly as docs/database/schema.sql
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('provident_fund_entries', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('payee_type', 10);
            $table->unsignedBigInteger('payee_id');
            $table->string('month', 7);
            $table->string('kind', 12);
            $table->decimal('amount', 10, 2);
            $table->unsignedBigInteger('payroll_item_id')->nullable();
            $table->string('note', 255)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->index(['institution_id', 'payee_type', 'payee_id', 'month'], 'idx_pf_payee');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('provident_fund_entries');
    }
};
