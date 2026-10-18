<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fee_payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('enrollment_id')->nullable();
            $table->unsignedBigInteger('online_payment_id')->nullable();
            $table->unsignedBigInteger('batch_id')->nullable();
            $table->unsignedBigInteger('fee_category_id');
            $table->decimal('amount', 10, 2);
            $table->decimal('discount', 10, 2)->nullable()->default(0);
            $table->decimal('paid_amount', 10, 2);
            $table->string('month', 7)->nullable();
            $table->string('payment_method', 30)->nullable()->default('cash');
            $table->string('receipt_no', 50);
            $table->unsignedTinyInteger('line_no')->default(1);
            $table->timestamp('paid_at')->nullable()->useCurrent();
            $table->unsignedBigInteger('collected_by')->nullable();
            $table->enum('status', ['paid', 'partial', 'waived', 'reversed'])->nullable()->default('paid');
            $table->unsignedBigInteger('reverses_id')->nullable();

            $table->unique(['institution_id', 'receipt_no', 'line_no'], 'unique_receipt_line');
            $table->index(['student_id', 'month'], 'idx_fee_payments_student');
            $table->index(['enrollment_id', 'month'], 'idx_fee_payments_enrollment');
            $table->index(['institution_id', 'paid_at'], 'idx_fee_payments_inst_paid');
            $table->index(['student_id', 'paid_at'], 'idx_fee_payments_student_paid');
            $table->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fee_payments');
    }
};
