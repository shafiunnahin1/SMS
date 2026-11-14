<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D216 RISK.1: rule-based "needs support" flags (schema.sql `risk_flags`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('risk_flags', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_id');
            $t->unsignedBigInteger('batch_id')->nullable();
            $t->string('kind', 12);
            $t->enum('level', ['watch', 'high']);
            $t->decimal('score', 5, 2)->default(0);
            $t->json('details');
            $t->enum('status', ['open', 'acknowledged', 'resolved'])->default('open');
            $t->date('computed_on');
            $t->unsignedBigInteger('acknowledged_by')->nullable();
            $t->string('note', 255)->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->unique(['student_id', 'kind', 'computed_on'], 'unique_risk_flag');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('risk_flags');
    }
};
