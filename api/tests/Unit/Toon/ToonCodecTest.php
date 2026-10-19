<?php

namespace Tests\Unit\Toon;

use App\Support\Toon\ToonDecoder;
use App\Support\Toon\ToonEncoder;
use App\Support\Toon\ToonException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

// D123 (R2.1.3): SMS's own TOON reader/writer - the spec's shapes, exact strings (LaTeX), strict errors with line numbers,
// and encode -> decode giving back the same data.
class ToonCodecTest extends TestCase
{
    public function test_objects_primitives_and_nesting(): void
    {
        $toon = "id: 123\nname: Ada\nactive: true\nscore: -1.5\nnothing: null\nzip: \"01234\"\nuser:\n  email: a@b.c\n  tags[2]: x,y\nempty:\n";
        $this->assertSame(['id' => 123, 'name' => 'Ada', 'active' => true, 'score' => -1.5, 'nothing' => null, 'zip' => '01234',
            'user' => ['email' => 'a@b.c', 'tags' => ['x', 'y']], 'empty' => []], ToonDecoder::decode($toon));
    }

    public function test_tables_lists_and_root_arrays(): void
    {
        $toon = "items[2]{sku,qty,price}:\n  A1,2,9.99\n  B2,1,14.5\nlist[3]:\n  - 1\n  - text: hi\n    n: 2\n  - [2]: a,b\n";
        $this->assertSame(['items' => [['sku' => 'A1', 'qty' => 2, 'price' => 9.99], ['sku' => 'B2', 'qty' => 1, 'price' => 14.5]],
            'list' => [1, ['text' => 'hi', 'n' => 2], ['a', 'b']]], ToonDecoder::decode($toon));
        $this->assertSame([['a' => 1], ['a' => 2]], ToonDecoder::decode("[2]{a}:\n  1\n  2\n"));
        $this->assertSame(['x|y', 'z'], ToonDecoder::decode("[2|]: \"x|y\"|z"));
        $this->assertSame(['t' => ['a b', 'c']], ToonDecoder::decode("t[2\t]: a b\tc"));
    }

    public function test_list_item_object_with_nested_first_field(): void
    {
        $toon = "questions[1]:\n  - options[2]{label,text}:\n      ক,\"\\\\(x^2\\\\)\"\n      খ,দুই\n    type: mcq\n";
        $this->assertSame(['questions' => [['options' => [['label' => 'ক', 'text' => '\(x^2\)'], ['label' => 'খ', 'text' => 'দুই']], 'type' => 'mcq']]],
            ToonDecoder::decode($toon));
    }

    public function test_quoted_strings_keep_latex_and_bangla_exactly(): void
    {
        $text = "\\(\\frac{a}{b} + \\sqrt{2}\\), \"উদ্ধৃতি\"\nনতুন লাইন\t";
        $this->assertSame(['q' => $text], ToonDecoder::decode("q: " . ToonEncoder::scalar($text)));
    }

    public static function broken(): array
    {
        return [
            'count mismatch' => ["a[3]: 1,2", 1],
            'table rows short' => ["a[2]{x}:\n  1", 1],
            'row width' => ["a[1]{x,y}:\n  1", 2],
            'odd indent' => ["a:\n   b: 1", 2],
            'unclosed quote' => ["a: \"oops", 1],
            'bad escape' => ["a: \"\\q\"", 1],
            'duplicate key' => ["a: 1\na: 2", 2],
            'no colon' => ["a: 1\nnot a field", 2],
            'list count' => ["a[2]:\n  - 1", 1],
        ];
    }

    #[DataProvider('broken')]
    public function test_broken_text_fails_with_its_line(string $toon, int $line): void
    {
        try {
            ToonDecoder::decode($toon);
            $this->fail('expected a ToonException');
        } catch (ToonException $e) {
            $this->assertSame($line, $e->lineNumber, $e->getMessage());
        }
    }

    public function test_encode_then_decode_is_identity(): void
    {
        $data = ['schema_version' => 'exam-management.universal-content-json.v5', 'document' => ['language' => 'bn', 'title' => 'Test: 1'],
            'questions' => [
                ['question_type' => 'mcq', 'question_text' => '\(x^2 = 4\) হলে x = ?', 'marks' => 1, 'difficulty' => 2.5,
                    'options' => [['label' => 'ক', 'text' => '2', 'is_correct' => true], ['label' => 'খ', 'text' => '-2, 2', 'is_correct' => false]]],
                ['question_type' => 'creative', 'stimulus_text' => "line1\nline2", 'creative_parts' => [
                    ['label' => 'a', 'question_text' => 'What?', 'marks' => 1, 'chapter' => ['name' => 'Ch 1']],
                    ['label' => 'b', 'question_text' => 'true', 'marks' => 2]], 'settings' => ['class_levels' => [['name' => 'Class 9'], ['name' => 'Class 10']], 'tags' => []]],
                ['question_type' => 'short', 'question_text' => '- starts with a dash', 'answer_text' => null, 'extra' => ['nested' => ['deep' => [1, 2, 3]]]],
            ]];
        $this->assertSame($data, ToonDecoder::decode(ToonEncoder::encode($data)));
        $this->assertSame($data['questions'], ToonDecoder::decode(ToonEncoder::encode($data['questions'])));
    }
}
