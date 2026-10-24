<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// D164 (4): the assistant searches the question bank and the curriculum with FULLTEXT (n-gram parser for Bangla)
return new class extends Migration
{
    private const INDEXES = [
        'qb_questions' => ['ft_qb_questions_text', 'question_text, explanation_text'],
        'qb_question_options' => ['ft_qb_question_options_text', 'content_text'],
        'qb_creative_parts' => ['ft_qb_creative_parts_text', 'question_text'],
        'qb_curriculum_nodes' => ['ft_qb_curriculum_nodes_name', 'name_bn, name_en'],
    ];

    public function up(): void
    {
        foreach (self::INDEXES as $table => [$name, $columns]) DB::statement("ALTER TABLE {$table} ADD FULLTEXT INDEX {$name} ({$columns}) WITH PARSER ngram");
    }

    public function down(): void
    {
        foreach (self::INDEXES as $table => [$name]) DB::statement("ALTER TABLE {$table} DROP INDEX {$name}");
    }
};
