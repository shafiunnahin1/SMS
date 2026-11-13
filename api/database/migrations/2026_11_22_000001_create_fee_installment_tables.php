<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D211 INST.1: fee installments (schema.sql `fee_installment_plans` + due_key, `fee_installments` + the two reminder times)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fee_installment_plans', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id');
            $t->unsignedBigInteger('fee_category_id');
            $t->decimal('total_amount', 10, 2);
            $t->integer('installments')->default(3);
            $t->unsignedBigInteger('approved_by')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->string('due_key', 100);
            $t->foreign('student_id')->references('id')->on('students');
        });
        Schema::create('fee_installments', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('plan_id');
            $t->unsignedBigInteger('institution_id');
            $t->integer('installment_no');
            $t->decimal('amount', 10, 2);
            $t->date('due_date');
            $t->timestamp('paid_at')->nullable();
            $t->unsignedBigInteger('payment_id')->nullable();
            $t->enum('status', ['pending', 'paid', 'overdue'])->nullable()->default('pending');
            $t->timestamp('reminded_before_at')->nullable();
            $t->timestamp('reminded_overdue_at')->nullable();
            $t->foreign('plan_id')->references('id')->on('fee_installment_plans');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fee_installments');
        Schema::dropIfExists('fee_installment_plans');
    }
};
