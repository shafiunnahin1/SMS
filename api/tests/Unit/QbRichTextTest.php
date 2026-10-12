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

    public function test_plain_drops_the_tags(): void
    {
        $this->assertSame("বল কাকে\nএক\nদুই", QbRichText::plain('<strong>বল</strong> কাকে<ol><li>এক</li><li>দুই</li></ol>'));
    }
}
