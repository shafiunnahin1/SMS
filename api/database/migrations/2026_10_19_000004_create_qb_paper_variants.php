<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D126 (2), R2.1.5: a final paper's sets, frozen (docs/database/schema.sql)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_paper_variants', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('qb_paper_id');
            $t->unsignedTinyInteger('variant_number');
            $t->string('code', 10);
            $t->string('strategy', 10);
            $t->json('layout_json');
            $t->timestamps();
            $t->unique(['qb_paper_id', 'variant_number'], 'unique_qb_paper_variants_number');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('qb_paper_id')->references('id')->on('qb_papers');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qb_paper_variants');
    }
};
