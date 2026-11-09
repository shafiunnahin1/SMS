<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D197 AAD.5: fixed routine blocks - break, assembly, prayer (schema.sql `routine_blocks`; academics-advanced.md section 4.2)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('routine_blocks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('program_id')->nullable();
            $table->enum('day_of_week', ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'])->nullable();
            $table->time('start_time');
            $table->time('end_time');
            $table->string('kind', 12)->default('break');
            $table->string('label', 80)->nullable();
            $table->integer('sort_order')->nullable()->default(0);
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('routine_blocks');
    }
};
