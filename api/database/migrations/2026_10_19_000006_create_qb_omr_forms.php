<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D127, R2.1.6: one configurable OMR layout per final paper.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_omr_forms', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('qb_paper_id');
            $table->string('code', 10);
            $table->json('settings_json');
            $table->unsignedInteger('layout_version')->default(1);
            $table->timestamp('locked_at')->nullable();
            $table->timestamps();
            $table->unique(['institution_id', 'qb_paper_id'], 'unique_qb_omr_forms_paper');
            $table->unique(['institution_id', 'code'], 'unique_qb_omr_forms_code');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('qb_paper_id')->references('id')->on('qb_papers');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qb_omr_forms');
    }
};