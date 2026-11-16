<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D227 LIB.1: the library's books (library.md; schema.sql `books`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('books', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->string('title', 200);
            $t->string('author', 150)->nullable();
            $t->string('isbn', 20)->nullable();
            $t->string('category', 100)->nullable();
            $t->integer('total_copies')->nullable()->default(1);
            $t->integer('available_copies')->nullable()->default(1);
            $t->string('shelf_location', 50)->nullable();
            $t->year('published_year')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->index('institution_id', 'idx_books_institution');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('books');
    }
};
