<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D236 SCH.1: scholarships and their applications (advanced-features.md section 8; schema.sql `scholarships`, `scholarship_applications`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scholarships', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('name', 150);
            $t->text('description')->nullable();
            $t->decimal('amount', 10, 2)->nullable();
            $t->decimal('percentage', 5, 2)->nullable();
            $t->text('criteria')->nullable();
            $t->string('funded_by', 150)->nullable();
            $t->unsignedBigInteger('academic_year_id')->nullable();
            $t->integer('total_slots')->nullable();
            $t->integer('available_slots')->nullable();
            $t->date('application_deadline')->nullable();
            $t->enum('status', ['open', 'closed', 'awarded'])->nullable()->default('open');
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->index(['institution_id', 'status'], 'idx_scholarships_status');
        });
        Schema::create('scholarship_applications', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('scholarship_id');
            $t->unsignedBigInteger('student_id');
            $t->text('reason')->nullable();
            $t->json('documents')->nullable();
            $t->decimal('gpa', 3, 2)->nullable();
            $t->string('household_income', 100)->nullable();
            $t->enum('status', ['pending', 'approved', 'rejected'])->nullable()->default('pending');
            $t->decimal('awarded_amount', 10, 2)->nullable();
            $t->unsignedBigInteger('approved_by')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->unique(['scholarship_id', 'student_id'], 'unique_app');
            $t->foreign('student_id')->references('id')->on('students');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scholarship_applications');
        Schema::dropIfExists('scholarships');
    }
};
