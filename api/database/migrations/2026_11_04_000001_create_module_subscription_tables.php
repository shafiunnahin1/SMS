<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// D187 SUB.1: module prices (platform, append-only: a change is a new row), each institution's module subscriptions and the
// per-module lines of a subscription invoice (filled by SUB.2). Every existing institution starts a 30-day trial of each paid
// module of its type from today (D187 (5)).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('module_prices', function (Blueprint $table) {
            $table->id();
            $table->string('module_key', 50);
            $table->decimal('monthly_price', 10, 2)->default(0);
            $table->decimal('yearly_price', 10, 2)->default(0);
            $table->timestamp('effective_from')->useCurrent();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['module_key', 'effective_from'], 'idx_module_prices_key_from');
            $table->foreign('created_by')->references('id')->on('users');
        });

        Schema::create('institution_module_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->string('module_key', 50);
            $table->enum('status', ['trial', 'active', 'grace', 'read_only', 'cancelled'])->default('trial');
            $table->enum('billing_cycle', ['monthly', 'yearly'])->nullable();
            $table->timestamp('trial_ends_at')->nullable();
            $table->timestamp('current_period_end')->nullable();
            $table->boolean('cancel_at_period_end')->default(false);
            $table->timestamps();
            $table->unique(['institution_id', 'module_key'], 'unique_institution_module_subscriptions');
            $table->foreign('institution_id')->references('id')->on('institutions');
        });

        Schema::create('subscription_invoice_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('institution_id');
            $table->unsignedBigInteger('subscription_invoice_id');
            $table->string('module_key', 50);
            $table->enum('billing_cycle', ['monthly', 'yearly']);
            $table->date('period_start');
            $table->date('period_end');
            $table->unsignedSmallInteger('days');
            $table->decimal('unit_price', 10, 2);
            $table->decimal('amount', 10, 2);
            $table->decimal('discount', 10, 2)->default(0);
            $table->timestamp('created_at')->nullable();
            $table->index(['institution_id', 'subscription_invoice_id'], 'idx_subscription_invoice_lines_invoice');
            $table->foreign('institution_id')->references('id')->on('institutions');
            $table->foreign('subscription_invoice_id')->references('id')->on('subscription_invoices');
        });

        $now = now();
        $ends = $now->copy()->addDays((int) config('subscriptions.trial_days', 30));
        foreach (DB::table('institutions')->orderBy('id')->get(['id', 'institution_type']) as $i) {
            if (in_array($i->institution_type, config('subscriptions.exempt_types', []), true)) continue;
            $keys = array_diff(config("institution_types.{$i->institution_type}.modules", []), config('subscriptions.free_modules', []));
            $rows = array_map(fn ($k) => ['institution_id' => $i->id, 'module_key' => $k, 'status' => 'trial', 'trial_ends_at' => $ends,
                'created_at' => $now, 'updated_at' => $now], array_values($keys));
            if ($rows) DB::table('institution_module_subscriptions')->insert($rows);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_invoice_lines');
        Schema::dropIfExists('institution_module_subscriptions');
        Schema::dropIfExists('module_prices');
    }
};
