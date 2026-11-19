<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// D233 HST.3: the hostel's bazar book; a wrong entry is reversed by a negative row (schema.sql `hostel_mess_bazar`)
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hostel_mess_bazar', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('hostel_id');
            $t->date('date');
            $t->decimal('amount', 10, 2);
            $t->string('note', 255)->nullable();
            $t->unsignedBigInteger('reversal_of_id')->nullable();
            $t->unsignedBigInteger('expense_id')->nullable();
            $t->unsignedBigInteger('recorded_by')->nullable();
            $t->timestamp('created_at')->nullable()->useCurrent();
            $t->index(['institution_id', 'hostel_id', 'date'], 'idx_hostel_bazar_month');
            $t->foreign('hostel_id')->references('id')->on('hostels');
            $t->foreign('reversal_of_id')->references('id')->on('hostel_mess_bazar');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hostel_mess_bazar');
    }
};
