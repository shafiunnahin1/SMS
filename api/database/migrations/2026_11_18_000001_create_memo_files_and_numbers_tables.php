<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D210 MEMO.1: memo (smarak) numbers - schema.sql `memo_files`, `memo_numbers`
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('memo_files', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('doc_kind', 20);
            $t->char('subject_code', 2);
            $t->unsignedSmallInteger('file_serial');
            $t->unsignedSmallInteger('year');
            $t->string('file_no', 30);
            $t->unsignedInteger('next_issue')->default(1);
            $t->timestamp('created_at')->nullable();
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->unique(['institution_id', 'doc_kind', 'year'], 'uq_memo_file_kind');
            $t->unique(['institution_id', 'subject_code', 'year', 'file_serial'], 'uq_memo_file_serial');
        });
        Schema::create('memo_numbers', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('memo_file_id');
            $t->unsignedInteger('issue_no');
            $t->string('memo_no', 40);
            $t->string('doc_kind', 20);
            $t->string('source_key', 40)->nullable();
            $t->string('recipient', 150)->nullable();
            $t->enum('status', ['issued', 'cancelled'])->default('issued');
            $t->unsignedBigInteger('issued_by')->nullable();
            $t->timestamp('issued_at')->nullable();
            $t->timestamp('cancelled_at')->nullable();
            $t->string('cancel_reason', 255)->nullable();
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('memo_file_id')->references('id')->on('memo_files');
            $t->unique(['institution_id', 'memo_no'], 'uq_memo_no');
            $t->unique(['memo_file_id', 'issue_no'], 'uq_memo_issue');
            $t->index(['institution_id', 'source_key'], 'idx_memo_source');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('memo_numbers');
        Schema::dropIfExists('memo_files');
    }
};
