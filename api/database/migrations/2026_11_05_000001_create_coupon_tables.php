<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D187 (6) SUB.2: the spec's coupons (platform) and coupon_redemptions (tenant), plus `applies_to_modules` and `discount_months`.
// Only the `percent` type is used now. A redemption row without an invoice starts the discount; each discounted invoice adds a row.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coupons', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30);
            $table->enum('type', ['percent', 'fixed', 'free_days']);
            $table->decimal('value', 10, 2);
            $table->decimal('max_discount', 10, 2)->nullable();
            $table->json('applies_to_plans')->nullable();
            $table->json('applies_to_types')->nullable();
            $table->decimal('min_amount', 10, 2)->nullable();
            $table->date('valid_from')->nullable();
            $table->date('valid_until')->nullable();
            $table->integer('max_redemptions')->nullable();
            $table->integer('per_institution_limit')->default(1);
            $table->integer('redeemed_count')->default(0);
            $table->enum('status', ['draft', 'active', 'paused', 'expired'])->default('draft');
            $table->string('note', 255)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->json('applies_to_modules')->nullable();
            $table->unsignedSmallInteger('discount_months')->nullable();
            $table->unique('code', 'unique_coupon_code');
        });

        Schema::create('coupon_redemptions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('coupon_id');
            $table->unsignedBigInteger('payment_id')->nullable();
            $table->unsignedBigInteger('invoice_id')->nullable();
            $table->decimal('discount_amount', 10, 2)->default(0);
            $table->integer('free_days')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('coupon_id')->references('id')->on('coupons');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coupon_redemptions');
        Schema::dropIfExists('coupons');
    }
};
