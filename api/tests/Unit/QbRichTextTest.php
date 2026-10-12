<?php

namespace Tests\Unit;

use App\Support\QbRichText;
use PHPUnit\Framework\TestCase;

// D72 (QB.12): only qbank's formatting vocabulary survives; everything else is unwrapped or dropped, text stays escaped.
class QbRichTextTest extends TestCase
{
    public function test_the_vocabulary_survives_unchanged(): void
    {
        $html = '<strong>বল</strong> <em>x</em><u>u</u><s>s</s>H<sub>2</sub>O x<sup>2</sup> <mark>m</mark> <span data-qmx-color="#2563eb">blue</span><br>'
            . '<div class="qmx-align-center">c</div><ol class="qmx-list-bengali-number"><li>এক</li></ol><dl><dt>t</dt><dd>d</dd></dl>'
            . '<div data-qae-layout="qa"><div data-qae-slot="task"><div dir="auto">task</div></div></div>'
            . '<table class="qmx-table qmx-table-grid qmx-table-width-100"><tbody><tr><th dir="auto">h</th><td colspan="2">c</td></tr></tbody></table>';
        $this->assertSame($html, QbRichText::clean($html));
        $this->assertSame('plain text, with "quotes" and \'apostrophes\'', QbRichText::clean('plain text, with "quotes" and \'apostrophes\''));
    }

    public function test_anything_else_never_reaches_the_page(): void
    {
        $this->assertSame('ab', QbRichText::clean('a<script>alert(1)</script>b'));
        $this->assertSame('<strong>x</strong>', QbRichText::clean('<strong onclick="alert(1)" style="color:red">x</strong>'));
        $this->assertSame('click', QbRichText::clean('<a href="javascript:alert(1)">click</a>'));
        $this->assertSame('', QbRichText::clean('<img src=x onerror=alert(1)>'));
        $this->assertSame('x', QbRichText::clean('<span data-qmx-color="red;background:url(x)">x</span>'), 'a colour is only #rgb / #rrggbb');
        $this->assertSame('<div>x</div>', QbRichText::clean('<div class="evil" data-qae-layout="x" dir="sideways">x</div>'));
        $this->assertSame('&lt;b&gt; is text', QbRichText::clean('&lt;b&gt; is text'), 'escaped markup stays text');
        $this->assertSame('<strong>b</strong><em>i</em><s>s</s>', QbRichText::clean('<b>b</b><i>i</i><strike>s</strike>'));
        $this->assertSame('a<div>b</div>', QbRichText::clean('a<p>b</p><style>p{}</style><!-- c -->'));
    }

    public function test_html_for_printed_pages_turns_checked_colours_into_inline_colours(): void
    {
        $this->assertSame('<span style="color:#2563eb">a</span><span style="background:#fff59d">b</span>',
            QbRichText::html('<span data-qmx-color="#2563EB">a</span><span data-qmx-bg="#fff59d" style="x">b</span><script>c</script>'));
    }

    public function test_a_picture_only_by_media_id_and_a_table_caption_qb14(): void
    {
        $this->assertSame('<img data-qmx-media="12" data-qmx-width="50" data-qmx-align="center">', QbRichText::clean('<img data-qmx-media="12" data-qmx-width="50" data-qmx-align="center" src="http://evil/x.png" onerror="x()">'));
        $this->assertSame('', QbRichText::clean('<img src="http://evil/x.png">'), 'a picture without our media id goes');
        $this->assertSame('<img data-qmx-media="3">', QbRichText::clean('<img data-qmx-media="3" data-qmx-width="500" data-qmx-align="top">'), 'bad width / align dropped');
        $this->assertSame('<table class="qmx-table"><caption>শিরোনাম</caption><tbody><tr><td rowspan="2">a</td></tr></tbody></table>',
            QbRichText::clean('<table class="qmx-table"><caption onclick="x()">শিরোনাম</caption><tbody><tr><td rowspan="2">a</td></tr></tbody></table>'));
    }

    public function test_printed_pages_draw_only_known_pictures_qb14(): void
    {
        $png = 'data:image/png;base64,AAAA';
        $this->assertSame('<img src="data:image/png;base64,AAAA" style="display:block;width:50%;margin:0 auto" alt="">',
            QbRichText::html('<img data-qmx-media="7" data-qmx-width="50" data-qmx-align="center">', [7 => $png]));
        $this->assertSame('', QbRichText::html('<img data-qmx-media="8">', [7 => $png]), 'a picture not of this question is left out');
        $this->assertSame('', QbRichText::html('<img data-qmx-media="7">', [7 => 'javascript:x()']), 'only image data');
    }

    public function test_plain_drops_the_tags(): void
    {
        $this->assertSame("বল কাকে\nএক\nদুই", QbRichText::plain('<strong>বল</strong> কাকে<ol><li>এক</li><li>দুই</li></ol>'));
    }
}
