<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_invoices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('payment_id');
            $table->string('invoice_number', 30)->unique();
            $table->string('plan_name', 50);
            $table->string('billing_period', 30)->nullable();
            $table->decimal('amount', 10, 2);
            $table->decimal('tax', 8, 2)->nullable()->default(0);
            $table->decimal('total', 10, 2);
            $table->timestamp('issued_at')->nullable()->useCurrent();
            $table->decimal('discount', 10, 2)->default(0);
            $table->unsignedBigInteger('coupon_id')->nullable();
            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->string('tax_label', 30)->nullable();
            $table->boolean('tax_inclusive')->default(0);
            $table->unsignedBigInteger('credit_for_id')->nullable();

            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('payment_id')->references('id')->on('payments');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_invoices');
    }
};
