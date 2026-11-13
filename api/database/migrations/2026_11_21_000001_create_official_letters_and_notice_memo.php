<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D210 LTR.1: official letters (schema.sql `official_letters`) and `notices.memo_no` (after deleted_at, as in schema.sql)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('official_letters', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('memo_no', 40);
            $t->string('subject', 200);
            $t->string('recipient', 255);
            $t->text('body');
            $t->date('issued_date');
            $t->unsignedBigInteger('issued_by');
            $t->enum('status', ['issued', 'cancelled'])->default('issued');
            $t->timestamp('created_at')->nullable();
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->unique(['institution_id', 'memo_no'], 'uq_letter_memo');
        });
        Schema::table('notices', function (Blueprint $t) {
            $t->string('memo_no', 40)->nullable()->after('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::table('notices', fn (Blueprint $t) => $t->dropColumn('memo_no'));
        Schema::dropIfExists('official_letters');
    }
};
