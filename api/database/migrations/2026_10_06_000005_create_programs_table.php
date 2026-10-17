<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('programs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('name', 100);
            $table->integer('numeric_name')->nullable();
            $table->string('code', 20)->nullable();
            $table->enum('group_name', ['science', 'humanities', 'business', 'general'])->nullable();
            $table->integer('duration_months')->nullable();
            $table->decimal('course_fee', 10, 2)->nullable();
            $table->boolean('is_default')->nullable()->default(0);
            $table->boolean('is_active')->nullable()->default(1);
            $table->boolean('is_public')->nullable()->default(1);
            $table->string('public_description', 500)->nullable();
            $table->integer('sort_order')->nullable()->default(0);
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->string('name_alt', 150)->nullable();

            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('programs');
    }
};
