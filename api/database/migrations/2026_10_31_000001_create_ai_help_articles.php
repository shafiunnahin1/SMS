<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

// D166 (6) AI-Q4: the software help guide's articles - platform articles (institution_id NULL) and an institution's own wording of
// one (base_article_id); shown only once approved; every step bound to menu paths, translation keys and routes (refs) that a test
// checks and the server re-checks (a missing route hides the article - fail closed)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_help_articles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id')->nullable();
            $table->unsignedBigInteger('base_article_id')->nullable();
            $table->string('slug', 80);
            $table->string('locale', 5);
            $table->string('title', 200);
            $table->text('keywords');
            $table->json('roles');
            $table->string('module', 40)->nullable();
            $table->json('institution_types')->nullable();
            $table->json('body');
            $table->json('refs');
            $table->enum('status', ['draft', 'approved'])->default('draft');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
            $table->index(['institution_id', 'status', 'locale'], 'idx_ai_help_scope');
            $table->index('slug', 'idx_ai_help_slug');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('base_article_id')->references('id')->on('ai_help_articles');
        });
        DB::statement('ALTER TABLE ai_help_articles ADD FULLTEXT INDEX ft_ai_help_articles (title, keywords) WITH PARSER ngram');
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_help_articles');
    }
};
