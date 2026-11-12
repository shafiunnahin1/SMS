<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D202 PUB.1: admission inquiries / applications (schema.sql `admission_leads`; coaching-private-batch.md "Leads", public-website.md "Data")
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admission_leads', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('name', 100);
            $t->string('phone', 20);
            $t->string('guardian_name', 100)->nullable();
            $t->string('email', 100)->nullable();
            $t->string('current_class', 100)->nullable();
            $t->string('message', 500)->nullable();
            $t->unsignedBigInteger('interested_program_id')->nullable();
            $t->unsignedBigInteger('interested_batch_id')->nullable();
            $t->string('source', 50)->nullable();
            $t->char('ip_hash', 64)->nullable();
            $t->enum('status', ['new', 'contacted', 'visited', 'enrolled', 'lost'])->nullable()->default('new');
            $t->date('follow_up_date')->nullable();
            $t->text('note')->nullable();
            $t->unsignedBigInteger('converted_student_id')->nullable();
            $t->timestamp('consented_at')->nullable();
            $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admission_leads');
    }
};
