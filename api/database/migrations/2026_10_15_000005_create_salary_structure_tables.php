<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('salary_components', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('institution_id'); $t->string('code',30); $t->json('name');
            $t->enum('type',['earning','deduction']); $t->string('calc',20)->default('fixed');
            $t->boolean('taxable')->default(true); $t->boolean('is_pf')->default(false);
            $t->boolean('is_system')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->nullable()->default(0);
            $t->unique(['institution_id','code'],'unique_component_code');
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('salary_revisions', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('institution_id'); $t->string('payee_type',10); $t->unsignedBigInteger('payee_id');
            $t->string('kind',12); $t->string('batch_id',40)->nullable(); $t->string('batch_label',100)->nullable();
            $t->string('change_mode',8)->default('set'); $t->decimal('change_value',10,2)->nullable();
            $t->string('target',40)->default('basic'); $t->decimal('old_basic',10,2)->nullable(); $t->decimal('new_basic',10,2);
            $t->decimal('old_gross',10,2)->nullable(); $t->decimal('new_gross',10,2); $t->json('calculation_snapshot');
            $t->date('effective_from'); $t->string('reason',255)->nullable(); $t->string('arrears_policy',8)->default('auto');
            $t->enum('status',['proposed','approved','rejected','applied','cancelled'])->default('proposed');
            $t->unsignedBigInteger('proposed_by')->nullable(); $t->unsignedBigInteger('approved_by')->nullable();
            $t->timestamp('approved_at')->nullable(); $t->string('acknowledged_path',255)->nullable();
            $t->string('letter_no',30)->nullable(); $t->timestamp('created_at')->useCurrent();
            $t->unique(['institution_id','letter_no'],'unique_revision_letter');
            $t->index(['institution_id','payee_type','payee_id','effective_from'],'idx_revisions_payee');
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('salary_structures', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('institution_id'); $t->string('payee_type',10); $t->unsignedBigInteger('payee_id');
            $t->decimal('basic',10,2); $t->decimal('gross',10,2); $t->date('effective_from'); $t->date('effective_to')->nullable();
            $t->string('designation',80)->nullable(); $t->string('grade',30)->nullable();
            $t->unsignedBigInteger('revision_id')->nullable(); $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamp('created_at')->useCurrent(); $t->unique(['institution_id','payee_type','payee_id','effective_from'],'unique_structure_start');
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('salary_structure_lines', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('institution_id'); $t->unsignedBigInteger('structure_id'); $t->unsignedBigInteger('component_id');
            $t->string('mode',20)->default('fixed'); $t->decimal('value',10,2);
            $t->unique(['structure_id','component_id'],'unique_structure_component');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('structure_id')->references('id')->on('salary_structures');
            $t->foreign('component_id')->references('id')->on('salary_components');
        });
        Schema::create('bonus_schemes', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('institution_id'); $t->string('name',100); $t->string('kind',12)->default('festival');
            $t->string('pay_month',7); $t->string('basis',8)->default('basic'); $t->decimal('value',10,2);
            $t->integer('min_service_months')->default(0); $t->integer('prorate_below_months')->default(0); $t->json('applies_to')->nullable();
            $t->decimal('max_amount',10,2)->nullable(); $t->boolean('taxable')->default(true);
            $t->enum('status',['draft','applied','cancelled'])->default('draft'); $t->timestamp('applied_at')->nullable();
            $t->unsignedBigInteger('created_by')->nullable(); $t->timestamp('created_at')->useCurrent();
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('salary_pay_accounts', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('institution_id'); $t->string('payee_type',10); $t->unsignedBigInteger('payee_id');
            $t->string('method',12); $t->string('account_name',120)->nullable(); $t->text('account_number')->nullable();
            $t->string('bank_name',100)->nullable(); $t->string('branch_name',100)->nullable(); $t->string('routing_number',20)->nullable();
            $t->boolean('is_default')->default(false); $t->unique(['institution_id','payee_type','payee_id','method'],'unique_pay_account');
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
    }
    public function down(): void
    {
        foreach(['salary_pay_accounts','bonus_schemes','salary_structure_lines','salary_structures','salary_revisions','salary_components'] as $table) Schema::dropIfExists($table);
    }
};
