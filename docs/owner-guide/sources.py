# -*- coding: utf-8 -*-
"""Readers for the repository documents that the whole-product chapters of the owner's guide copy from. Nothing is typed in by hand."""
import os, re, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()

def table_after(text, header_regex, maxrows=400):
    """Rows (list of cell lists) of the first markdown table whose header line matches header_regex."""
    L = text.split('\n')
    for i, l in enumerate(L):
        if l.startswith('|') and re.search(header_regex, l) and i + 1 < len(L) and re.match(r'\|[\s:|-]+\|?\s*$', L[i + 1]):
            hdr = [c.strip() for c in l.strip().strip('|').split('|')]; rows = []
            for r in L[i + 2:]:
                if not r.startswith('|'): break
                rows.append([c.strip() for c in r.strip().strip('|').split('|')])
                if len(rows) >= maxrows: break
            return hdr, rows
    raise LookupError(header_regex)

EMOJI = {'✅': '', '🔌': ' [বাইরের তথ্য লাগবে]', '🧑‍⚖️': ' [আইনি যাচাই লাগবে]', '⬜': '', '⚠️': '', '❌': '', '⭐': '', '🟢': '', '🟡': '', '🔴': ''}
def clean(s):
    """Remove emoji and markdown the PDF font cannot draw; keep the text."""
    for k, v in EMOJI.items(): s = s.replace(k, v)
    s = re.sub(r'[\U0001F000-\U0001FFFF\u2600-\u27BF\uFE0F\u200D]', '', s)          # any other emoji / dingbat / variation selector
    s = re.sub(r'\[`?([^\]`]+)`?\]\([^)]*\)', r'\1', s)                              # [text](link) -> text
    s = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', s); s = re.sub(r'`([^`]+)`', r'<span class="mono">\1</span>', s)
    return s.strip()

def roadmap():
    t = rd('docs/ROADMAP.md')
    rel_h, rel = table_after(t, r'^\|\s*Release\s*\|')
    led_h, led = table_after(t, r'^\|\s*#\s*\|.*Release')
    prop_h, prop = table_after(t, r'^\|\s*ID\s*\|.*Tier')
    return rel, led, prop

def module_index():
    t = rd('docs/modules/README.md'); h, rows = table_after(t, r'^\|\s*[^|]*\|\s*[^|]*\|\s*[^|]*\|\s*Phase')
    return h, rows

def institution_types():
    cfg = rd('docs/modules/institution-types.md'); out = {}
    for ty in ('school', 'college', 'coaching', 'private_batch'):
        m = re.search(r"'%s' => \[(.*?)\n    \],\n" % ty, cfg, re.S) or re.search(r"'%s' => \[(.*?)\n    \]" % ty, cfg, re.S)
        blk = re.search(r"'%s' => \[.*?'modules' => \[(.*?)\]" % ty, cfg, re.S).group(1)
        out[ty] = dict(modules=re.findall(r"'(\w+)'", blk), block=m.group(1) if m else '')
    return out

def db_groups():
    h, rows = table_after(rd('docs/DATABASE.md'), r'^\|\s*[^|]*\|\s*[^|]*\|\s*[^|]*\|\s*[^|]*\|?\s*$') if False else table_after(rd('docs/DATABASE.md'), r'^\|\s*[^|]+\|\s*[^|]+\|\s*[^|]+\|\s*[^|]+\|$')
    return h, rows

def decisions():
    h, rows = table_after(rd('docs/LOCKED-DECISIONS.md'), r'^\|\s*#\s*\|\s*Decision')
    return [(r[0], r[1]) for r in rows if re.match(r'D\d+$', r[0])]

def section(path, heading_regex):
    t = rd(path); m = re.search(r'^(##+) ' + heading_regex + r'[^\n]*\n(.*?)(?=^##+ |\Z)', t, re.S | re.M)
    return m.group(2).strip() if m else ''
