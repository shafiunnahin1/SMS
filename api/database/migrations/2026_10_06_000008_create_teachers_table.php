<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('teachers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('employee_id', 20);
            $table->string('designation', 50)->nullable();
            $table->string('department', 50)->nullable();
            $table->date('joining_date')->nullable();
            $table->text('qualification')->nullable();
            $table->decimal('salary', 10, 2)->nullable();
            $table->decimal('house_rent', 8, 2)->nullable()->default(0);
            $table->decimal('medical_allowance', 8, 2)->nullable()->default(0);
            $table->decimal('transport_allowance', 8, 2)->nullable()->default(0);
            $table->enum('status', ['active', 'inactive', 'on_leave'])->nullable()->default('active');
            $table->timestamp('deleted_at')->nullable();
            $table->date('leaving_date')->nullable();
            $table->boolean('show_public')->default(0);
            $table->text('public_bio')->nullable();
            $table->string('mpo_index_no', 30)->nullable();

            $table->unique(['institution_id', 'employee_id'], 'unique_employee_code');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('teachers');
    }
};
