<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D209 ACY.1: the admission cycle (docs/modules/admission-cycle.md; schema.sql `admission_cycles`, `admission_draws` and the
// `admission_leads` cycle columns, application_no + its unique index)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admission_cycles', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('name', 120);
            $t->unsignedBigInteger('program_id');
            $t->unsignedBigInteger('academic_year_id')->nullable();
            $t->integer('seats');
            $t->date('apply_from');
            $t->date('apply_until');
            $t->date('test_date')->nullable();
            $t->decimal('application_fee', 10, 2)->default(0);
            $t->enum('status', ['draft', 'open', 'testing', 'listing', 'closed'])->default('draft');
            $t->json('rule');
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('program_id')->references('id')->on('programs');
        });
        Schema::create('admission_draws', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('cycle_id');
            $t->char('seed_commitment', 64);
            $t->string('seed_reveal', 64)->nullable();
            $t->integer('applicants_count')->nullable();
            $t->json('result')->nullable();
            $t->unsignedBigInteger('drawn_by')->nullable();
            $t->timestamp('drawn_at')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->unique('cycle_id', 'unique_cycle_draw');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('cycle_id')->references('id')->on('admission_cycles');
        });
        Schema::table('admission_leads', function (Blueprint $t) {
            $t->unsignedBigInteger('cycle_id')->nullable();
            $t->string('test_roll', 20)->nullable();
            $t->decimal('test_marks', 6, 2)->nullable();
            $t->integer('merit_rank')->nullable();
            $t->string('list_status', 12)->nullable();
            $t->string('application_no', 20)->nullable();
            $t->unique(['institution_id', 'application_no'], 'uq_lead_application_no');
            $t->index(['institution_id', 'created_at'], 'idx_leads_inst_created');   // in schema.sql since R12; PUB.1 missed it
        });
    }

    public function down(): void
    {
        Schema::table('admission_leads', function (Blueprint $t) {
            $t->dropUnique('uq_lead_application_no');
            $t->dropIndex('idx_leads_inst_created');
            $t->dropColumn(['cycle_id', 'test_roll', 'test_marks', 'merit_rank', 'list_status', 'application_no']);
        });
        Schema::dropIfExists('admission_draws');
        Schema::dropIfExists('admission_cycles');
    }
};
