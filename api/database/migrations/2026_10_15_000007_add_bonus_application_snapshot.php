<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void { Schema::table('bonus_schemes',fn(Blueprint $t)=>$t->json('application_snapshot')->nullable()); }
    public function down(): void { Schema::table('bonus_schemes',fn(Blueprint $t)=>$t->dropColumn('application_snapshot')); }
};
