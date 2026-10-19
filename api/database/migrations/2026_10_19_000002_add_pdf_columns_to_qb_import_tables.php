<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D124 (R2.1.4): a PDF import's page range, kind and unreadable pages, and each staged question's source page (docs/database/schema.sql)
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('qb_import_batches', function (Blueprint $t) {
            $t->unsignedSmallInteger('page_from')->nullable()->after('error');
            $t->unsignedSmallInteger('page_to')->nullable()->after('page_from');
            $t->string('document_kind', 10)->nullable()->after('page_to');
            $t->json('unreadable_pages')->nullable()->after('document_kind');
        });
        Schema::table('qb_import_records', function (Blueprint $t) {
            $t->unsignedSmallInteger('page_number')->nullable()->after('record_index');
        });
    }

    public function down(): void
    {
        Schema::table('qb_import_records', fn (Blueprint $t) => $t->dropColumn('page_number'));
        Schema::table('qb_import_batches', fn (Blueprint $t) => $t->dropColumn(['page_from', 'page_to', 'document_kind', 'unreadable_pages']));
    }
};
