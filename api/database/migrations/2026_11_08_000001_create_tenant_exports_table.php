<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D193 EXP.1 (D38): an institution's export / backup file and its state (schema.sql `tenant_exports`; platform-ops.md section 5)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_exports', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('kind', 10)->default('export');
            $table->enum('status', ['queued', 'running', 'ready', 'failed', 'expired'])->default('queued');
            $table->integer('format_version')->default(1);
            $table->boolean('include_secrets')->default(false);
            $table->integer('tables_count')->default(0);
            $table->bigInteger('rows_count')->default(0);
            $table->string('file_path', 255)->nullable();
            $table->bigInteger('size_bytes')->nullable();
            $table->char('checksum', 64)->nullable();
            $table->unsignedBigInteger('requested_by')->nullable();
            $table->string('error', 255)->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->timestamp('finished_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_exports');
    }
};
