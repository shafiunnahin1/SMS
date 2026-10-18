<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D115 (R2.1.2): qbank's graph datasets - a table of numbers a question's graph draws from (docs/database/schema.sql)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_graph_datasets', function (Blueprint $t) {
            $t->id();
            $t->char('uuid', 36);
            $t->unsignedBigInteger('qb_question_id')->nullable();
            $t->string('name', 160);
            $t->string('source_type', 40)->default('manual');
            $t->json('headers');
            $t->unsignedInteger('row_count')->default(0);
            $t->unsignedSmallInteger('column_count')->default(0);
            $t->string('checksum', 64);
            $t->unsignedInteger('version')->default(1);
            $t->longText('rows_json')->nullable();
            $t->json('metadata')->nullable();
            $t->unsignedBigInteger('created_by');
            $t->timestamps();
            $t->softDeletes();
            $t->unique('uuid', 'unique_qb_graph_datasets_uuid');
            $t->index(['qb_question_id', 'deleted_at'], 'idx_qb_graph_datasets_question');
            $t->index(['created_by', 'checksum'], 'idx_qb_graph_datasets_checksum');
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qb_graph_datasets');
    }
};
