<?php

namespace Tests\Unit;

use App\Support\SmsSegments;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

// docs/I18N.md section 7 + 14 "SmsSegmentsTest": the 16 boundary cases (GSM 160/161/306/307, extension characters count 2;
// Unicode 70/71/134/135; an emoji is 2 units) plus mixed text.
class SmsSegmentsTest extends TestCase
{
    public static function cases(): array
    {
        $bn = 'ক';   // one UTF-16 unit
        return [
            'empty'                   => ['', 0, 'gsm', 0],
            'gsm 1'                   => ['a', 1, 'gsm', 1],
            'gsm 160'                 => [str_repeat('a', 160), 1, 'gsm', 160],
            'gsm 161'                 => [str_repeat('a', 161), 2, 'gsm', 161],
            'gsm 306'                 => [str_repeat('a', 306), 2, 'gsm', 306],
            'gsm 307'                 => [str_repeat('a', 307), 3, 'gsm', 307],
            'extension counts 2'      => ['€', 1, 'gsm', 2],
            'extension 80 = 160'      => [str_repeat('{', 80), 1, 'gsm', 160],
            'extension pushes to 161' => [str_repeat('a', 159) . '^', 2, 'gsm', 161],
            'unicode 70'              => [str_repeat($bn, 70), 1, 'unicode', 70],
            'unicode 71'              => [str_repeat($bn, 71), 2, 'unicode', 71],
            'unicode 134'             => [str_repeat($bn, 134), 2, 'unicode', 134],
            'unicode 135'             => [str_repeat($bn, 135), 3, 'unicode', 135],
            'emoji is 2 units'        => ['😀', 1, 'unicode', 2],
            'emoji 35 = 70'           => [str_repeat('😀', 35), 1, 'unicode', 70],
            'emoji 36 = 72'           => [str_repeat('😀', 36), 2, 'unicode', 72],
            'one Bengali letter makes an English text Unicode' => [str_repeat('a', 69) . $bn, 1, 'unicode', 70],
            'mixed 71'                => [str_repeat('a', 70) . $bn, 2, 'unicode', 71],
        ];
    }

    #[DataProvider('cases')]
    public function test_it_counts_parts_encoding_and_units(string $text, int $segments, string $encoding, int $units): void
    {
        $this->assertSame(['segments' => $segments, 'encoding' => $encoding, 'units' => $units], SmsSegments::count($text));
    }

    public function test_the_measured_attendance_sms_is_one_part_alone_and_two_with_the_platform_suffix(): void
    {
        // I18N.md section 7: the measured Bengali attendance line (66 units) costs 1 part; with a 20-unit suffix it costs 2
        $line = str_repeat('ক', 66);
        $this->assertSame(1, SmsSegments::count($line)['segments']);
        $this->assertSame(2, SmsSegments::count($line . ' -' . str_repeat('খ', 19))['segments']);
    }
}
