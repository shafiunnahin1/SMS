<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// R3.9 (docs/modules/inventory.md): exactly the two store tables of docs/database/schema.sql.
return new class extends Migration {
    public function up(): void
    {
        Schema::create('inventory_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('code', 30);
            $table->string('name', 120);
            $table->string('category', 60)->nullable();
            $table->string('unit', 20)->default('pcs');
            $table->decimal('sale_price', 10, 2)->default(0);
            $table->decimal('avg_cost', 10, 2)->default(0);
            $table->decimal('reorder_level', 12, 2)->default(0);
            $table->decimal('stock', 12, 2)->default(0);
            $table->boolean('is_sellable')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamp('deleted_at')->nullable();
            $table->unique(['institution_id', 'code'], 'unique_item_code');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });

        Schema::create('inventory_movements', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('item_id');
            $table->enum('type', ['receive', 'issue', 'sale', 'return', 'adjust', 'damage']);
            $table->decimal('qty', 12, 2);
            $table->tinyInteger('direction');
            $table->decimal('unit_amount', 10, 2)->default(0);
            $table->decimal('total_amount', 12, 2)->default(0);
            $table->decimal('balance_after', 12, 2);
            $table->unsignedBigInteger('student_id')->nullable();
            $table->string('issued_to_type', 10)->nullable();
            $table->unsignedBigInteger('issued_to_id')->nullable();
            $table->string('supplier', 100)->nullable();
            $table->string('receipt_no', 30)->nullable();
            $table->string('payment_method', 16)->nullable();
            $table->string('reference', 100)->nullable();
            $table->string('note', 255)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->unique(['institution_id', 'receipt_no'], 'unique_store_receipt');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('item_id')->references('id')->on('inventory_items');
            $table->index(['institution_id', 'item_id', 'created_at'], 'idx_inventory_item');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_movements');
        Schema::dropIfExists('inventory_items');
    }
};
