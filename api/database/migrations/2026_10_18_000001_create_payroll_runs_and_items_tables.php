<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// R3.7 / D104: payroll_runs + payroll_items exactly as docs/database/schema.sql (staff-payroll.md §7).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_runs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('month', 7);
            $table->string('kind', 12)->default('regular');
            $table->string('label', 80)->default('');
            $table->enum('status', ['draft', 'reviewed', 'approved', 'paid', 'cancelled'])->default('draft');
            $table->json('settings_snapshot')->nullable();
            $table->integer('payees_count')->default(0);
            $table->decimal('total_gross', 12, 2)->default(0);
            $table->decimal('total_deductions', 12, 2)->default(0);
            $table->decimal('total_net', 12, 2)->default(0);
            $table->unsignedBigInteger('prepared_by')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->boolean('self_approved')->default(false);
            $table->timestamp('paid_at')->nullable();
            $table->string('cancelled_reason', 255)->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->unique(['institution_id', 'month', 'kind', 'label'], 'unique_payroll_run');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });

        Schema::create('payroll_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('run_id');
            $table->string('payee_type', 10);
            $table->unsignedBigInteger('payee_id');
            $table->unsignedBigInteger('structure_id')->nullable();
            $table->unsignedTinyInteger('days_in_month');
            $table->decimal('paid_days', 5, 2)->default(0);
            $table->decimal('absent_days', 5, 2)->default(0);
            $table->decimal('lwp_days', 5, 2)->default(0);
            $table->integer('late_count')->default(0);
            $table->decimal('basic', 10, 2)->default(0);
            $table->decimal('gross', 10, 2)->default(0);
            $table->decimal('total_earnings', 10, 2)->default(0);
            $table->decimal('total_deductions', 10, 2)->default(0);
            $table->decimal('tax', 10, 2)->default(0);
            $table->decimal('net', 10, 2)->default(0);
            $table->json('breakdown');
            $table->enum('status', ['ready', 'held', 'paid', 'failed'])->default('ready');
            $table->string('hold_reason', 255)->nullable();
            $table->string('payment_method', 12)->nullable();
            $table->string('paid_reference', 100)->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->unsignedBigInteger('paid_by')->nullable();
            $table->string('slip_no', 30)->nullable();
            $table->unique(['run_id', 'payee_type', 'payee_id'], 'unique_item_per_run');
            $table->unique(['institution_id', 'slip_no'], 'unique_slip_no');
            $table->index(['institution_id', 'payee_type', 'payee_id'], 'idx_payroll_items_payee');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('run_id')->references('id')->on('payroll_runs');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_items');
        Schema::dropIfExists('payroll_runs');
    }
};
