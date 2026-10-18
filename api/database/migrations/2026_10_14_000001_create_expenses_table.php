<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('category', 100);
            $table->string('title', 150);
            $table->decimal('amount', 10, 2);
            $table->date('expense_date');
            $table->text('note')->nullable();
            $table->string('receipt_path', 255)->nullable();
            $table->unsignedBigInteger('added_by')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->unsignedBigInteger('reversal_of_id')->nullable();
            $table->unsignedBigInteger('replaces_expense_id')->nullable();
            $table->string('payment_method', 30)->default('cash');
            $table->string('source', 20)->default('manual');
            $table->unsignedBigInteger('payroll_run_id')->nullable();
            $table->unsignedBigInteger('fund_id')->nullable();
            $table->unique(['institution_id', 'id'], 'unique_expenses_inst_id');
            $table->unique(['institution_id', 'reversal_of_id'], 'unique_expenses_reversal');
            $table->unique(['institution_id', 'replaces_expense_id'], 'unique_expenses_replacement');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign(['institution_id', 'reversal_of_id'], 'fk_expenses_reversal')->references(['institution_id', 'id'])->on('expenses');
            $table->foreign(['institution_id', 'replaces_expense_id'], 'fk_expenses_replacement')->references(['institution_id', 'id'])->on('expenses');
            $table->index(['institution_id', 'expense_date'], 'idx_expenses_inst_date');
        });
    }

    public function down(): void { Schema::dropIfExists('expenses'); }
};
