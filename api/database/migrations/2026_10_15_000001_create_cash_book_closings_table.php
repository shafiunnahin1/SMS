<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('cash_book_closings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->date('date');
            $table->unsignedInteger('revision');
            foreach (['opening_cash', 'cash_in', 'cash_out', 'expected_closing'] as $column) $table->decimal($column, 12, 2)->default(0);
            $table->decimal('counted_cash', 12, 2)->nullable();
            $table->decimal('difference', 12, 2)->nullable();
            $table->enum('status', ['closed', 'reopened'])->default('closed');
            $table->string('note')->nullable();
            $table->unsignedBigInteger('closed_by')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->unsignedBigInteger('reopened_by')->nullable();
            $table->timestamp('reopened_at')->nullable();
            $table->string('reopen_reason')->nullable();
            $table->unique(['institution_id', 'date', 'revision'], 'unique_cash_day_revision');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
    }

    public function down(): void { Schema::dropIfExists('cash_book_closings'); }
};
