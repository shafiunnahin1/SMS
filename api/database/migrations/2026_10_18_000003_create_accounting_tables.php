<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// R3.10 (docs/modules/accounting.md, D36): the double-entry ledger exactly as docs/database/schema.sql
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ledger_accounts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('code', 20);
            $table->string('name', 120);
            $table->enum('type', ['asset', 'liability', 'equity', 'income', 'expense']);
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->boolean('is_cash_or_bank')->default(false);
            $table->boolean('is_system')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unique(['institution_id', 'code'], 'unique_account_code');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('vouchers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('voucher_no', 30);
            $table->enum('type', ['receipt', 'payment', 'journal', 'contra']);
            $table->date('date');
            $table->string('narration', 255)->nullable();
            $table->string('source', 12)->default('manual');
            $table->unsignedBigInteger('source_id')->nullable();
            $table->enum('status', ['draft', 'posted', 'reversed'])->default('draft');
            $table->unsignedBigInteger('reverses_id')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('posted_by')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->unique(['institution_id', 'voucher_no'], 'unique_voucher_no');
            $table->index(['institution_id', 'source', 'source_id'], 'idx_voucher_source');
            $table->unique(['institution_id', 'source', 'source_id'], 'uq_voucher_source');
            $table->index(['institution_id', 'date'], 'idx_vouchers_inst_date');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('voucher_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('voucher_id');
            $table->unsignedBigInteger('account_id');
            $table->decimal('debit', 12, 2)->default(0);
            $table->decimal('credit', 12, 2)->default(0);
            $table->string('memo', 255)->nullable();
            $table->timestamp('reconciled_at')->nullable();
            $table->string('reconciled_ref', 50)->nullable();
            $table->index(['institution_id', 'account_id'], 'idx_voucher_lines_account');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('voucher_id')->references('id')->on('vouchers');
            $table->foreign('account_id')->references('id')->on('ledger_accounts');
        });
        Schema::create('budgets', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('name', 100);
            $table->string('fiscal_year', 9);
            $table->enum('status', ['draft', 'approved', 'closed'])->default('draft');
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->unique(['institution_id', 'name', 'fiscal_year'], 'unique_budget');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('budget_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('budget_id');
            $table->unsignedBigInteger('account_id');
            $table->decimal('amount', 12, 2);
            $table->unique(['budget_id', 'account_id'], 'unique_budget_line');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('budget_id')->references('id')->on('budgets');
            $table->foreign('account_id')->references('id')->on('ledger_accounts');
        });
    }

    public function down(): void
    {
        foreach (['budget_lines', 'budgets', 'voucher_lines', 'vouchers', 'ledger_accounts'] as $table) Schema::dropIfExists($table);
    }
};
