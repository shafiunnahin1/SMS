<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D145: assign an existing language curriculum version to existing platform class levels.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_curriculum_version_class_level', function (Blueprint $table) {
            $table->unsignedBigInteger('qb_curriculum_version_id');
            $table->unsignedBigInteger('qb_class_level_id');
            $table->primary(['qb_curriculum_version_id', 'qb_class_level_id'], 'pk_qb_curriculum_version_class_level');
            $table->index(['qb_class_level_id', 'qb_curriculum_version_id'], 'idx_qb_curriculum_version_classes');
            $table->foreign('qb_curriculum_version_id', 'fk_qb_cvc_version')
                ->references('id')->on('qb_curriculum_versions');
            $table->foreign('qb_class_level_id', 'fk_qb_cvc_class_level')
                ->references('id')->on('qb_class_levels');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qb_curriculum_version_class_level');
    }
};
