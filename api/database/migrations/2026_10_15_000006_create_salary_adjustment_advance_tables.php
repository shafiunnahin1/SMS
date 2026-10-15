<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('salary_adjustments', function(Blueprint $t){
            $t->id();$t->unsignedBigInteger('institution_id');$t->string('payee_type',10);$t->unsignedBigInteger('payee_id');
            $t->string('kind',12);$t->enum('direction',['earning','deduction']);$t->decimal('amount',10,2);$t->string('month',7);
            $t->boolean('taxable')->default(true);$t->unsignedBigInteger('scheme_id')->nullable();$t->unsignedBigInteger('revision_id')->nullable();
            $t->string('description',255)->nullable();$t->string('attachment',255)->nullable();
            $t->enum('status',['pending','approved','applied','cancelled'])->default('pending');$t->unsignedBigInteger('payroll_item_id')->nullable();
            $t->unsignedBigInteger('created_by')->nullable();$t->unsignedBigInteger('approved_by')->nullable();$t->timestamp('created_at')->useCurrent();
            $t->unique(['scheme_id','payee_type','payee_id'],'unique_scheme_payee');$t->index(['institution_id','month','status'],'idx_adjustments_month');
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('salary_advances', function(Blueprint $t){
            $t->id();$t->unsignedBigInteger('institution_id');$t->string('payee_type',10);$t->unsignedBigInteger('payee_id');
            $t->decimal('amount',10,2);$t->string('reason',255)->nullable();$t->integer('installments')->default(1);$t->decimal('installment_amount',10,2);
            $t->string('recover_from_month',7);$t->json('terms_snapshot');$t->unsignedBigInteger('expense_id')->nullable();$t->json('skipped_months')->nullable();
            $t->decimal('recovered',10,2)->default(0);$t->string('payment_method',12)->nullable();
            $t->enum('status',['requested','approved','active','closed','rejected','written_off'])->default('requested');
            $t->unsignedBigInteger('requested_by')->nullable();$t->unsignedBigInteger('approved_by')->nullable();$t->timestamp('disbursed_at')->nullable();$t->timestamp('created_at')->useCurrent();
            $t->unique(['institution_id','expense_id'],'unique_advance_expense');$t->foreign('expense_id')->references('id')->on('expenses');
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
    }
    public function down(): void { Schema::dropIfExists('salary_advances');Schema::dropIfExists('salary_adjustments'); }
};
