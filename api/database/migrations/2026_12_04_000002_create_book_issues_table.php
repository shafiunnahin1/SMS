<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D227 LIB.1: a book lent to a student (library.md; schema.sql `book_issues`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_issues', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('book_id');
            $t->unsignedBigInteger('student_id');
            $t->unsignedBigInteger('issued_by');
            $t->date('issue_date');
            $t->date('due_date');
            $t->date('return_date')->nullable();
            $t->decimal('fine_amount', 8, 2)->nullable()->default(0);
            $t->boolean('fine_paid')->nullable()->default(false);
            $t->enum('status', ['issued', 'returned', 'overdue'])->nullable()->default('issued');
            $t->foreign('book_id')->references('id')->on('books');
            $t->foreign('student_id')->references('id')->on('students');
            $t->index(['status', 'due_date'], 'idx_book_issues_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_issues');
    }
};
