<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('import_rows', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('job_id');
            $table->integer('row_no');
            $table->enum('status', ['ok', 'error', 'skipped']);
            $table->string('error', 255)->nullable();
            $table->json('data')->nullable();
            $table->string('created_table', 40)->nullable();
            $table->unsignedBigInteger('created_id')->nullable();

            $table->unique(['job_id', 'row_no'], 'unique_import_row');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('job_id')->references('id')->on('import_jobs');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('import_rows');
    }
};
