<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('students', fn (Blueprint $t) => $t->unique(['institution_id', 'id'], 'unique_students_inst_id'));
        Schema::create('fee_refunds', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id');
            $t->char('request_key', 36);
            $t->unsignedInteger('revision');
            $t->string('original_receipt_no', 50);
            $t->decimal('amount', 10, 2);
            $t->json('refund_lines');
            $t->string('reason', 255);
            $t->string('method', 16)->default('cash');
            $t->unsignedBigInteger('online_payment_id')->nullable();
            $t->string('gateway_refund_ref', 100)->nullable();
            $t->enum('status', ['requested', 'approved', 'processed', 'rejected'])->default('requested');
            $t->string('reversal_receipt_no', 50)->nullable();
            $t->unsignedBigInteger('requested_by')->nullable();
            $t->unsignedBigInteger('approved_by')->nullable();
            $t->unsignedBigInteger('processed_by')->nullable();
            $t->timestamp('processed_at')->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->unique(['institution_id', 'request_key', 'revision'], 'unique_fee_refund_revision');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign(['institution_id', 'student_id'], 'fk_fee_refunds_student')->references(['institution_id', 'id'])->on('students');
            $t->index(['institution_id', 'status', 'created_at', 'id'], 'idx_fee_refunds_inst_status_created');
            $t->index(['institution_id', 'student_id', 'created_at', 'id'], 'idx_fee_refunds_inst_student_created');
        });
        Schema::table('fee_payments', fn (Blueprint $t) => $t->index(['institution_id', 'reverses_id'], 'idx_fee_payments_inst_reverses'));
    }

    public function down(): void
    {
        Schema::dropIfExists('fee_refunds');
        Schema::table('fee_payments', fn (Blueprint $t) => $t->dropIndex('idx_fee_payments_inst_reverses'));
        Schema::table('students', fn (Blueprint $t) => $t->dropUnique('unique_students_inst_id'));
    }
};
