<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('academic_years', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('name', 20);
            $table->date('start_date');
            $table->date('end_date');
            $table->boolean('is_current')->nullable()->default(0);
            $table->timestamp('created_at')->nullable()->useCurrent();

            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('academic_years');
    }
};
