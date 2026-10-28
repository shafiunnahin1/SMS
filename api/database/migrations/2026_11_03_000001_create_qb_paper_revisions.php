<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// D180 (5) QBO.2: a final paper's settings (title, exam name, duration, set count, instructions incl. subject grouping/order) are
// kept as immutable revisions; each revision owns its frozen sets and its OMR form. Every paper that already has sets or a form
// becomes revision 1 with its current settings; its variants, forms and scans are only linked, never changed.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qb_paper_revisions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('qb_paper_id');
            $table->unsignedSmallInteger('revision_number');
            $table->json('settings_json');
            $table->unsignedBigInteger('created_by');
            $table->timestamps();
            $table->unique(['institution_id', 'qb_paper_id', 'revision_number'], 'unique_qb_paper_revisions_number');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('qb_paper_id')->references('id')->on('qb_papers');
        });

        Schema::table('qb_paper_variants', function (Blueprint $table) {
            $table->unsignedBigInteger('qb_paper_revision_id')->nullable()->after('qb_paper_id');
            $table->index('qb_paper_id', 'idx_qb_paper_variants_paper');
        });
        Schema::table('qb_omr_forms', function (Blueprint $table) {
            $table->unsignedBigInteger('qb_paper_revision_id')->nullable()->after('qb_paper_id');
            $table->index('qb_paper_id', 'idx_qb_omr_forms_paper');
        });

        $papers = DB::table('qb_papers')->where('status', 'final')
            ->orWhereIn('id', DB::table('qb_paper_variants')->select('qb_paper_id'))
            ->orWhereIn('id', DB::table('qb_omr_forms')->select('qb_paper_id'))->orderBy('id')->get();
        foreach ($papers as $p) {
            $settings = ['title' => $p->title, 'exam_name' => $p->exam_name, 'duration_minutes' => $p->duration_minutes === null ? null : (int) $p->duration_minutes,
                'sets_count' => (int) $p->sets_count, 'instructions_json' => $p->instructions_json === null ? null : json_decode($p->instructions_json, true)];
            $revision = DB::table('qb_paper_revisions')->insertGetId(['institution_id' => $p->institution_id, 'qb_paper_id' => $p->id, 'revision_number' => 1,
                'settings_json' => json_encode($settings, JSON_UNESCAPED_UNICODE), 'created_by' => $p->created_by, 'created_at' => $p->updated_at ?? now(), 'updated_at' => $p->updated_at ?? now()]);
            DB::table('qb_paper_variants')->where('qb_paper_id', $p->id)->update(['qb_paper_revision_id' => $revision]);
            DB::table('qb_omr_forms')->where('qb_paper_id', $p->id)->update(['qb_paper_revision_id' => $revision]);
        }

        Schema::table('qb_paper_variants', function (Blueprint $table) {
            $table->unsignedBigInteger('qb_paper_revision_id')->nullable(false)->change();
            $table->dropUnique('unique_qb_paper_variants_number');
            $table->unique(['qb_paper_revision_id', 'variant_number'], 'unique_qb_paper_variants_revision_number');
            $table->foreign('qb_paper_revision_id')->references('id')->on('qb_paper_revisions');
        });
        Schema::table('qb_omr_forms', function (Blueprint $table) {
            $table->unsignedBigInteger('qb_paper_revision_id')->nullable(false)->change();
            $table->dropUnique('unique_qb_omr_forms_paper');
            $table->unique(['institution_id', 'qb_paper_revision_id'], 'unique_qb_omr_forms_revision');
            $table->foreign('qb_paper_revision_id')->references('id')->on('qb_paper_revisions');
        });
    }

    public function down(): void
    {
        Schema::table('qb_omr_forms', function (Blueprint $table) {
            $table->dropForeign(['qb_paper_revision_id']);
            $table->dropUnique('unique_qb_omr_forms_revision');
            $table->unique(['institution_id', 'qb_paper_id'], 'unique_qb_omr_forms_paper');
            $table->dropForeign(['qb_paper_id']);                 // the index served this key: re-add it after
            $table->dropIndex('idx_qb_omr_forms_paper');
            $table->foreign('qb_paper_id')->references('id')->on('qb_papers');
            $table->dropColumn('qb_paper_revision_id');
        });
        Schema::table('qb_paper_variants', function (Blueprint $table) {
            $table->dropForeign(['qb_paper_revision_id']);
            $table->dropUnique('unique_qb_paper_variants_revision_number');
            $table->unique(['qb_paper_id', 'variant_number'], 'unique_qb_paper_variants_number');
            $table->dropForeign(['qb_paper_id']);                 // the index served this key: re-add it after
            $table->dropIndex('idx_qb_paper_variants_paper');
            $table->foreign('qb_paper_id')->references('id')->on('qb_papers');
            $table->dropColumn('qb_paper_revision_id');
        });
        Schema::dropIfExists('qb_paper_revisions');
    }
};
