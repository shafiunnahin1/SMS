<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// R3.11 (docs/modules/donations.md, D39): donors, funds, campaigns and donations exactly as docs/database/schema.sql
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('donors', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('name', 120);
            $table->string('phone', 20)->nullable();
            $table->string('address', 255)->nullable();
            $table->string('type', 12)->default('individual');
            $table->string('note', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->timestamp('deleted_at')->nullable();
            $table->unique(['institution_id', 'phone'], 'unique_donor_phone');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('donation_funds', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('name', 100);
            $table->string('kind', 12)->default('general');
            $table->boolean('restricted')->default(false);
            $table->string('description', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unique(['institution_id', 'name'], 'unique_fund_name');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('donation_campaigns', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('fund_id');
            $table->string('title', 150);
            $table->decimal('goal_amount', 12, 2)->nullable();
            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();
            $table->enum('status', ['draft', 'active', 'closed'])->default('draft');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('fund_id')->references('id')->on('donation_funds');
        });
        Schema::create('donations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('donor_id')->nullable();
            $table->unsignedBigInteger('fund_id');
            $table->unsignedBigInteger('campaign_id')->nullable();
            $table->decimal('amount', 12, 2);
            $table->string('method', 16)->default('cash');
            $table->date('received_on');
            $table->string('receipt_no', 30);
            $table->string('purpose_note', 255)->nullable();
            $table->enum('status', ['received', 'reversed'])->default('received');
            $table->unsignedBigInteger('reverses_id')->nullable();
            $table->unsignedBigInteger('received_by')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->unique(['institution_id', 'receipt_no'], 'unique_donation_receipt');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('fund_id')->references('id')->on('donation_funds');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('donations');
        Schema::dropIfExists('donation_campaigns');
        Schema::dropIfExists('donation_funds');
        Schema::dropIfExists('donors');
    }
};
