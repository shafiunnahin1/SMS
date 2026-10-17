<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Task QB.0 (D65/D66, docs/database/schema.sql): prices and the price-rule engine (platform), purchases (institution: one unlock
// for all its teachers; students: per student, bKash orders), writers' earnings / wallets / withdrawals (platform, money - never
// deleted, D32), question papers (institution) and quizzes (platform quizzes, institution-side access and attempts).
return new class extends Migration
{
    public function up(): void
    {
        $items = ['question', 'concept', 'resource'];
        $reasons = ['paid', 'free', 'partial_free'];
        Schema::create('qb_prices', function (Blueprint $t) {
            $t->id();
            $t->enum('audience', ['institution', 'student']);
            $t->enum('item_kind', ['question_answer', 'concept', 'resource_slide', 'resource_book', 'resource_pdf', 'quiz_package']);
            $t->unsignedBigInteger('qb_question_type_id')->nullable();
            $t->decimal('amount', 10, 2);
            $t->timestamp('effective_from');
            $t->unsignedBigInteger('created_by');
            $t->timestamp('created_at')->nullable();
            $t->index(['audience', 'item_kind', 'qb_question_type_id', 'effective_from'], 'idx_qb_prices_lookup');
            $t->foreign('qb_question_type_id')->references('id')->on('qb_question_types');
        });
        Schema::create('qb_price_rules', function (Blueprint $t) {
            $t->id();
            $t->enum('target_type', ['item', 'question_type', 'topic', 'chapter', 'subject', 'class_level', 'resource_kind', 'quiz_package', 'all']);
            $t->string('target_ref', 100)->nullable();
            $t->enum('audience', ['institution', 'student', 'both'])->default('both');
            $t->enum('method', ['free', 'first_n_items_free', 'first_n_pages_free', 'percent_off', 'amount_off', 'fixed_price', 'free_for_class_level', 'free_first_n_per_buyer']);
            $t->decimal('value', 10, 2)->nullable();
            $t->integer('priority')->default(0);
            $t->timestamp('starts_at')->nullable();
            $t->timestamp('ends_at')->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('note', 250)->nullable();
            $t->unsignedBigInteger('created_by');
            $t->timestamps();
            $t->index(['is_active', 'target_type', 'target_ref'], 'idx_qb_rules_target');
        });
        Schema::create('qb_unlocks', function (Blueprint $t) use ($items, $reasons) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->enum('item_type', $items);
            $t->unsignedBigInteger('item_id');
            $t->unsignedBigInteger('unlocked_by');
            $t->decimal('price', 10, 2);
            $t->enum('reason', $reasons);
            $t->unsignedBigInteger('qb_price_rule_id')->nullable();
            $t->string('wallet_txn_ref', 100)->nullable();
            $t->timestamp('created_at')->nullable();
            $t->unique(['institution_id', 'item_type', 'item_id'], 'unique_qb_unlock');
            $t->index(['institution_id', 'unlocked_by', 'created_at'], 'idx_qb_unlocks_spending');
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('qb_student_orders', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_user_id');
            $t->string('ref', 20)->unique('unique_qb_student_order_ref');
            $t->json('items');
            $t->decimal('amount', 10, 2);
            $t->string('payment_id', 100)->nullable();
            $t->string('trx_id', 100)->nullable();
            $t->enum('status', ['pending', 'paid', 'failed'])->default('pending');
            $t->timestamps();
            $t->index(['institution_id', 'student_user_id', 'created_at'], 'idx_qb_orders_student');
            $t->foreign('institution_id')->references('id')->on('institutions');
        });
        Schema::create('qb_student_unlocks', function (Blueprint $t) use ($items, $reasons) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_user_id');
            $t->enum('item_type', $items);
            $t->unsignedBigInteger('item_id');
            $t->decimal('price', 10, 2);
            $t->enum('reason', $reasons);
            $t->unsignedBigInteger('qb_student_order_id')->nullable();
            $t->timestamp('created_at')->nullable();
            $t->unique(['student_user_id', 'item_type', 'item_id'], 'unique_qb_student_unlock');
            $t->index(['institution_id', 'student_user_id'], 'idx_qb_student_unlocks_inst');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('qb_student_order_id')->references('id')->on('qb_student_orders');
        });
        Schema::create('qb_writer_earnings', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('writer_user_id');
            $t->enum('source', ['institution_unlock', 'student_unlock', 'quiz_package']);
            $t->unsignedBigInteger('source_id');
            $t->enum('item_type', ['question', 'concept', 'resource', 'quiz_package']);
            $t->unsignedBigInteger('item_id');
            $t->decimal('sale_amount', 10, 2);
            $t->decimal('share_percent', 5, 2);
            $t->decimal('amount', 10, 2);
            $t->timestamp('created_at')->nullable();
            $t->index(['writer_user_id', 'created_at'], 'idx_qb_earnings_writer');
        });
        Schema::create('qb_writer_wallets', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('writer_user_id')->unique('unique_qb_writer_wallet');
            $t->decimal('balance', 12, 2)->default(0);
            $t->decimal('held', 12, 2)->default(0);
            $t->timestamp('updated_at')->nullable();
        });
        Schema::create('qb_writer_wallet_txns', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('writer_user_id');
            $t->enum('type', ['earning', 'withdrawal', 'adjustment']);
            $t->decimal('amount', 12, 2);
            $t->decimal('balance_after', 12, 2);
            $t->string('reference', 150)->nullable();
            $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamp('created_at')->nullable();
            $t->index(['writer_user_id', 'created_at'], 'idx_qb_writer_txns');
        });
        Schema::create('qb_withdrawal_requests', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('writer_user_id');
            $t->decimal('amount', 12, 2);
            $t->enum('payout_method', ['bank', 'bkash']);
            $t->text('payout_account');
            $t->enum('status', ['pending', 'paid', 'rejected'])->default('pending');
            $t->timestamp('requested_at')->nullable();
            $t->unsignedBigInteger('processed_by')->nullable();
            $t->timestamp('processed_at')->nullable();
            $t->string('bank_transaction_id', 100)->nullable();
            $t->string('note', 250)->nullable();
            $t->index(['status', 'requested_at'], 'idx_qb_withdrawals_status');
            $t->index(['writer_user_id', 'requested_at'], 'idx_qb_withdrawals_writer');
        });
        Schema::create('qb_papers', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('created_by');
            $t->string('title', 200);
            $t->unsignedBigInteger('program_id')->nullable();
            $t->unsignedBigInteger('qb_subject_id')->nullable();
            $t->string('exam_name', 200)->nullable();
            $t->unsignedSmallInteger('duration_minutes')->nullable();
            $t->decimal('total_marks', 6, 2)->default(0);
            $t->json('instructions_json')->nullable();
            $t->enum('status', ['draft', 'final'])->default('draft');
            $t->unsignedTinyInteger('sets_count')->default(1);
            $t->timestamps();
            $t->index(['institution_id', 'created_by'], 'idx_qb_papers_owner');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('qb_subject_id')->references('id')->on('qb_subjects');
        });
        Schema::create('qb_paper_sections', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('qb_paper_id');
            $t->string('title', 200);
            $t->string('instruction', 500)->nullable();
            $t->integer('sort_order')->default(0);
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('qb_paper_id')->references('id')->on('qb_papers');
        });
        Schema::create('qb_paper_items', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('qb_paper_section_id');
            $t->unsignedBigInteger('qb_question_id');
            $t->decimal('marks', 5, 2);
            $t->integer('sort_order')->default(0);
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('qb_paper_section_id')->references('id')->on('qb_paper_sections');
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
        });
        Schema::create('qb_quiz_packages', function (Blueprint $t) {
            $t->id();
            $t->string('title', 200);
            $t->unsignedBigInteger('qb_class_level_id')->nullable();
            $t->unsignedBigInteger('qb_subject_id')->nullable();
            $t->string('description', 1000)->nullable();
            $t->unsignedSmallInteger('validity_days')->default(30);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->foreign('qb_class_level_id')->references('id')->on('qb_class_levels');
            $t->foreign('qb_subject_id')->references('id')->on('qb_subjects');
        });
        Schema::create('qb_quizzes', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('qb_quiz_package_id')->nullable();
            $t->enum('access', ['package', 'free', 'public'])->default('package');
            $t->string('title', 200);
            $t->unsignedBigInteger('qb_subject_id')->nullable();
            $t->unsignedBigInteger('qb_chapter_id')->nullable();
            $t->unsignedBigInteger('qb_topic_id')->nullable();
            $t->unsignedSmallInteger('duration_minutes');
            $t->unsignedSmallInteger('question_count');
            $t->enum('rule', ['fixed', 'random_from_scope'])->default('fixed');
            $t->decimal('pass_mark', 5, 2)->nullable();
            $t->timestamp('opens_at')->nullable();
            $t->timestamp('closes_at')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->index(['is_active', 'access'], 'idx_qb_quizzes_access');
            $t->foreign('qb_quiz_package_id')->references('id')->on('qb_quiz_packages');
        });
        Schema::create('qb_quiz_questions', function (Blueprint $t) {
            $t->unsignedBigInteger('qb_quiz_id');
            $t->unsignedBigInteger('qb_question_id');
            $t->integer('sort_order')->default(0);
            $t->primary(['qb_quiz_id', 'qb_question_id']);
            $t->foreign('qb_quiz_id')->references('id')->on('qb_quizzes');
            $t->foreign('qb_question_id')->references('id')->on('qb_questions');
        });
        Schema::create('qb_student_package_access', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_user_id');
            $t->unsignedBigInteger('qb_quiz_package_id');
            $t->timestamp('starts_at');
            $t->timestamp('expires_at');
            $t->unsignedBigInteger('qb_student_order_id')->nullable();
            $t->timestamp('created_at')->nullable();
            $t->index(['student_user_id', 'qb_quiz_package_id', 'expires_at'], 'idx_qb_package_access');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('qb_quiz_package_id')->references('id')->on('qb_quiz_packages');
            $t->foreign('qb_student_order_id')->references('id')->on('qb_student_orders');
        });
        Schema::create('qb_quiz_attempts', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('institution_id');
            $t->unsignedBigInteger('student_user_id');
            $t->unsignedBigInteger('qb_quiz_id');
            $t->timestamp('started_at');
            $t->timestamp('submitted_at')->nullable();
            $t->decimal('score', 6, 2)->nullable();
            $t->decimal('total', 6, 2)->nullable();
            $t->json('answers')->nullable();
            $t->timestamp('created_at')->nullable();
            $t->index(['institution_id', 'student_user_id', 'qb_quiz_id'], 'idx_qb_attempts_student');
            $t->foreign('institution_id')->references('id')->on('institutions');
            $t->foreign('qb_quiz_id')->references('id')->on('qb_quizzes');
        });
    }

    public function down(): void
    {
        foreach (['qb_quiz_attempts', 'qb_student_package_access', 'qb_quiz_questions', 'qb_quizzes', 'qb_quiz_packages', 'qb_paper_items', 'qb_paper_sections',
            'qb_papers', 'qb_withdrawal_requests', 'qb_writer_wallet_txns', 'qb_writer_wallets', 'qb_writer_earnings', 'qb_student_unlocks', 'qb_student_orders',
            'qb_unlocks', 'qb_price_rules', 'qb_prices'] as $table) Schema::dropIfExists($table);
    }
};
