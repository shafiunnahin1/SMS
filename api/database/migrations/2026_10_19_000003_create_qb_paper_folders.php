<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D126 (R2.1.5): qbank's question-set folders for an institution's papers (docs/database/schema.sql)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_paper_folders', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('parent_id')->nullable();
            $t->string('name', 150);
            $t->unsignedBigInteger('created_by');
            $t->timestamps();
            $t->index(['institution_id', 'created_by', 'parent_id'], 'idx_qb_paper_folders_owner');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('parent_id')->references('id')->on('qb_paper_folders');
        });
        Schema::table('qb_papers', function (Blueprint $t) {
            $t->unsignedBigInteger('qb_paper_folder_id')->nullable()->after('sets_count');
        });
    }

    public function down(): void
    {
        Schema::table('qb_papers', fn (Blueprint $t) => $t->dropColumn('qb_paper_folder_id'));
        Schema::dropIfExists('qb_paper_folders');
    }
};
