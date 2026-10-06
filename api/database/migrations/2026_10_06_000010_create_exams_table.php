<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exams', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('name', 100);
            $table->unsignedBigInteger('program_id');
            $table->unsignedBigInteger('batch_id')->nullable();
            $table->enum('exam_type', ['term', 'class_test', 'weekly', 'model_test', 'admission'])->nullable()->default('term');
            $table->year('academic_year');
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->enum('status', ['upcoming', 'ongoing', 'completed', 'published'])->nullable()->default('upcoming');
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->boolean('admit_card_available')->nullable()->default(0);
            $table->date('admit_card_from')->nullable();
            $table->string('exam_center', 150)->nullable();
            $table->text('admit_card_instructions')->nullable();

            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exams');
    }
};
