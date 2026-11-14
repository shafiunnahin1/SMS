<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D217 OPAY.1: online fee payments and the institution's gateway rows (schema.sql `institution_payment_gateways`, `online_payments`
// with its later columns refunded_amount, purpose, lead_id)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('institution_payment_gateways', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('gateway', 30);
            $t->text('credentials');
            $t->string('credentials_hint', 40)->nullable();
            $t->boolean('is_sandbox')->nullable()->default(0);
            $t->enum('status', ['pending', 'active', 'failed', 'disabled'])->nullable()->default('pending');
            $t->timestamp('last_checked_at')->nullable();
            $t->string('last_error', 255)->nullable();
            $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->timestamp('updated_at')->nullable();
            $t->unique(['institution_id', 'gateway'], 'unique_inst_gateway');
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('online_payments', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id')->nullable();
            $t->unsignedBigInteger('parent_user_id')->nullable();
            $t->string('gateway', 30);
            $t->string('channel', 30)->nullable();
            $t->string('flow', 10)->default('redirect');
            $t->enum('collected_by', ['institution', 'platform']);
            $t->decimal('amount', 10, 2);
            $t->decimal('gateway_fee', 10, 2)->default(0);
            $t->decimal('platform_fee', 10, 2)->default(0);
            $t->decimal('net_amount', 10, 2)->default(0);
            $t->enum('status', ['initiated', 'success', 'failed', 'cancelled', 'refunded', 'review'])->default('initiated');
            $t->string('gateway_ref', 40);
            $t->string('gateway_payment_id', 100)->nullable();
            $t->text('qr_payload')->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->string('trx_id', 100)->nullable();
            $t->json('items');
            $t->string('receipt_no', 50)->nullable();
            $t->unsignedBigInteger('settlement_id')->nullable();
            $t->string('failure_reason', 255)->nullable();
            $t->json('raw_response')->nullable();
            $t->timestamp('initiated_at')->nullable()->useCurrent();
            $t->timestamp('paid_at')->nullable();
            $t->decimal('refunded_amount', 10, 2)->default(0);
            $t->string('purpose', 20)->default('fee');
            $t->unsignedBigInteger('lead_id')->nullable();
            $t->unique('gateway_ref', 'unique_gateway_ref');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('student_id')->references('id')->on('students');
            $t->index(['institution_id', 'status', 'paid_at'], 'idx_online_pay_inst');
            $t->index('settlement_id', 'idx_online_pay_settle');
            $t->index(['status', 'initiated_at'], 'idx_online_pay_pending');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('online_payments');
        Schema::dropIfExists('institution_payment_gateways');
    }
};
