<?php

namespace Tests\Unit\Pdf;

use App\Support\Pdf\BijoyConverter;
use PHPUnit\Framework\TestCase;

// D125: Bijoy lines become Unicode one by one; Unicode Bangla, English, numbers and LaTeX are never touched
class BijoyConverterTest extends TestCase
{
    public function test_only_bijoy_lines_change(): void
    {
        $in = "Avgvi †mvbvi evsjv\nআমার সোনার বাংলা\nWe have ever seen a cave.\nAnswer: A\n\\(x^2\\) evsjv †`k\n১২৩ 456";
        [$out, $n] = BijoyConverter::convert($in, true);
        $this->assertSame("আমার সোনার বাংলা\nআমার সোনার বাংলা\nWe have ever seen a cave.\nAnswer: A\n\\(x^2\\) বাংলা দেশ\n১২৩ 456", $out);
        $this->assertSame(2, $n);
    }

    public function test_unicode_and_english_text_is_unchanged_byte_for_byte(): void
    {
        $text = "১. বাংলাদেশের রাজধানী কোনটি?\nক. ঢাকা খ. চট্টগ্রাম\nউত্তর: ক\n2. What is \\(\\frac{a}{b}\\)? We have ever avoided it.\nAnswer: B";
        $this->assertSame([$text, 0], BijoyConverter::convert($text, true));
        $this->assertSame([$text, 0], BijoyConverter::convert($text, false));
    }

    public function test_without_the_font_name_a_line_needs_a_strong_signal(): void
    {
        $this->assertSame('আমি বাংলায় গান গাই, বাংলা আমার ভাষা', BijoyConverter::convert('Avwg evsjvq Mvb MvB, evsjv Avgvi fvlv', false)[0]);
        $this->assertSame('Avwg evsjvq Mvb MvB', BijoyConverter::convert('Avwg evsjvq Mvb MvB', false)[0], 'without the font name, a short line needs more signal (qbank)');
        $this->assertSame('Avg', BijoyConverter::convert('Avg', false)[0], 'one weak pair is not enough');
    }
}
