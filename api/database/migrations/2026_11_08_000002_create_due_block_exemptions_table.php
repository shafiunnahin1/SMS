<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D197 AAD.1: a student exempted from the dues block on admit cards / results (schema.sql `due_block_exemptions`;
// docs/modules/academics-advanced.md section 2)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('due_block_exemptions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('student_id');
            $table->string('scope', 12)->default('all');
            $table->string('reason', 255);
            $table->unsignedBigInteger('granted_by')->nullable();
            $table->date('expires_at')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('due_block_exemptions');
    }
};
