<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subjects', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('program_id');
            $table->unsignedBigInteger('teacher_id')->nullable();
            $table->string('name', 100);
            $table->string('code', 20)->nullable();
            $table->integer('full_marks')->nullable()->default(100);
            $table->integer('pass_marks')->nullable()->default(33);
            $table->boolean('is_optional')->nullable()->default(0);
            $table->string('name_alt', 150)->nullable();

            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('program_id')->references('id')->on('programs');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subjects');
    }
};
