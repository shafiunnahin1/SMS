<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D123 (R2.1.3): JSON/TOON question import staging - batches and their records (docs/database/schema.sql)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_import_batches', function (Blueprint $t) {
            $t->id();
            $t->char('uuid', 36);
            $t->string('format', 10);
            $t->string('schema_version', 80)->nullable();
            $t->json('files');
            $t->char('source_sha256', 64);
            $t->string('status', 20)->default('parsing');
            $t->unsignedInteger('total_records')->default(0);
            $t->unsignedInteger('parsed_records')->default(0);
            $t->unsignedInteger('valid_records')->default(0);
            $t->unsignedInteger('invalid_records')->default(0);
            $t->unsignedInteger('duplicate_records')->default(0);
            $t->unsignedInteger('imported_records')->default(0);
            $t->string('error', 500)->nullable();
            $t->unsignedBigInteger('created_by');
            $t->timestamps();
            $t->unique('uuid', 'unique_qb_import_batches_uuid');
            $t->index(['created_by', 'source_sha256'], 'idx_qb_import_batches_owner');
            $t->foreign('created_by')->references('id')->on('users');
        });
        Schema::create('qb_import_records', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_import_batch_id');
            $t->unsignedSmallInteger('file_index')->default(0);
            $t->unsignedInteger('record_index');
            $t->string('type_slug', 80)->nullable();
            $t->json('payload');
            $t->json('errors')->nullable();
            $t->json('warnings')->nullable();
            $t->boolean('has_math')->default(false);
            $t->string('duplicate_status', 20)->default('none');
            $t->unsignedBigInteger('duplicate_question_id')->nullable();
            $t->boolean('selected')->default(false);
            $t->unsignedBigInteger('qb_question_id')->nullable();
            $t->timestamps();
            $t->unique(['qb_import_batch_id', 'file_index', 'record_index'], 'unique_qb_import_records_position');
            $t->foreign('qb_import_batch_id')->references('id')->on('qb_import_batches')->cascadeOnDelete();
            $t->foreign('duplicate_question_id')->references('id')->on('qb_questions');
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qb_import_records');
        Schema::dropIfExists('qb_import_batches');
    }
};
