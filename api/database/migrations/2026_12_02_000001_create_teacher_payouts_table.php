<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D223 TPO.1: a coaching / private-batch teacher's monthly payout per batch (schema.sql `teacher_payouts`; coaching-private-batch.md)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('teacher_payouts', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('teacher_id');
            $t->unsignedBigInteger('batch_id')->default(0);
            $t->string('month', 7);
            $t->integer('classes_taken')->nullable()->default(0);
            $t->decimal('collection_base', 10, 2)->nullable()->default(0);
            $t->decimal('amount', 10, 2);
            $t->enum('status', ['draft', 'approved', 'paid'])->nullable()->default('draft');
            $t->timestamp('paid_at')->nullable();
            $t->string('note', 255)->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->unsignedBigInteger('payroll_item_id')->nullable();   // schema.sql R3 column (folded in, migrations.md); unused by D223
            $t->unique(['institution_id', 'teacher_id', 'batch_id', 'month'], 'unique_payout');
            $t->foreign('teacher_id')->references('id')->on('teachers');
            $t->index(['institution_id', 'month'], 'idx_payouts_inst_month');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('teacher_payouts');
    }
};
