<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('batches', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('program_id');
            $table->string('name', 60);
            $table->unsignedBigInteger('teacher_id')->nullable();
            $table->unsignedBigInteger('academic_year_id')->nullable();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->json('schedule')->nullable();
            $table->decimal('monthly_fee', 10, 2)->nullable();
            $table->string('room', 30)->nullable();
            $table->integer('max_capacity')->nullable()->default(40);
            $table->enum('status', ['upcoming', 'running', 'completed', 'archived'])->nullable()->default('running');
            $table->string('name_alt', 150)->nullable();
            $table->string('shift', 10)->nullable();

            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('program_id')->references('id')->on('programs');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('batches');
    }
};
