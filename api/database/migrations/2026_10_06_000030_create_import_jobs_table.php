<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('import_jobs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('kind', 16);
            $table->enum('status', ['uploaded', 'mapped', 'dry_run', 'running', 'done', 'failed', 'rolled_back'])->default('uploaded');
            $table->string('file_path', 255);
            $table->json('mapping')->nullable();
            $table->json('summary')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->timestamp('finished_at')->nullable();

            $table->index(['institution_id', 'created_at'], 'idx_import_jobs_inst_created');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('import_jobs');
    }
};
