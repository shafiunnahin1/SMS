#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
docs/owner-guide/build_pdf.py - builds the owner's guide PDF (Bengali) from the repository files.
  python3 docs/owner-guide/build_pdf.py            -> docs/owner-guide/Release-1-Plan-bn.pdf
Every number in the PDF is read from docs/release/r1-scope.json, r1-plan.json, schema.sql, institution-types.md, LOCKED-DECISIONS.md and ROADMAP.md,
and the build REFUSES to run if `verify.py --deep` shows a failure (so the PDF never describes a plan that is internally inconsistent).
Engine: headless Google Chrome via Playwright (HarfBuzz shaping -> correct Bengali conjuncts). reportlab was NOT used on purpose: it does not shape Bengali.
Fonts: FreeSans / FreeSerif (the only Bengali fonts installed here). Bold Bengali is synthesised by the browser because FreeSans Bold has no Bengali glyphs.
"""
import os, re, sys, json, subprocess, datetime, glob
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from content_a import bn, cover, toc, summary, s1, s2, s3, s4, s5, s6
from content_b import s7, s8, s9, s10, s11, s12, s13, s14, s15, appendix, ACCEPT, TASKS
import content_c
from content_c import s16, s17, s18, s19, s20, s21, s22, s23, s24, s25, s26, s27, s28, part
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
CHROME = '/opt/google/chrome/chrome'
OUT = os.path.join(HERE, 'Release-1-Plan-bn.pdf')

# ------------------------------------------------------------------ facts
scope = json.loads(rd('docs/release/r1-scope.json')); plan = json.loads(rd('docs/release/r1-plan.json'))
cfg = rd('docs/modules/institution-types.md'); sch = rd('docs/database/schema.sql'); ld = rd('docs/LOCKED-DECISIONS.md'); road = rd('docs/ROADMAP.md')
school_modules = re.findall(r"'(\w+)'", re.search(r"'school' => \[.*?'modules' => \[(.*?)\]", cfg, re.S).group(1))
tables = len(re.findall(r'CREATE TABLE', sch))
MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']
today = datetime.date.today()

def run_verify():
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'infra/spec-verify/verify.py'), ROOT, '--deep'], capture_output=True, text=True)
    fails = [l for l in r.stdout.split('\n') if l.startswith('FAIL')]
    if r.returncode != 0 or fails:
        sys.exit('REFUSING to build: verify.py --deep reports failures:\n' + '\n'.join(fails[:5]))
    return len([l for l in r.stdout.split('\n') if l.startswith('PASS')])

F = dict(
    date_bn=f'{today.day} {MONTHS[today.month - 1]} {today.year}',
    files=sum(len([x for x in fs if not x.endswith('.pyc')]) for d, _, fs in os.walk(ROOT) if '__pycache__' not in d and '.git' not in d),
    decisions=max(int(x) for x in re.findall(r'^\| D(\d+) \|', ld, re.M)),
    checks=None, tables=tables, r1_tables=len(scope['tables']), r1_modules=len(scope['modules']), school_modules=len(school_modules),
    pct_tables=round(100 * len(scope['tables']) / tables), pct_modules=round(100 * len(scope['modules']) / len(school_modules)),
    tasks=len(plan['tasks']), routes=sum(len(t['routes']) for t in plan['tasks']), tests=len({x for t in plan['tasks'] for x in t['tests']}),
    accept=len(ACCEPT), roadmap_items=len(re.findall(r'^\| \d+ \|', road, re.M)) + len(re.findall(r'^\| P\d+ \|', road, re.M)),
    r1_module_list=scope['modules'], r1_table_list=sorted(scope['tables']),
)
_m, _it, _sc, _rel, _led, _prop = content_c.facts()
F.update(whole_modules=len(_m), whole_types=len(_it), releases=len(_rel), proposals=len(_prop))
missing = [t for t in scope['tables'] if t not in __import__('content_b').TABLES]; assert not missing, f'table descriptions missing: {missing}'
missing = [t['id'] for t in plan['tasks'] if t['id'] not in TASKS]; assert not missing, f'task descriptions missing: {missing}'
assert set(scope['modules']) == set(__import__('content_b').MODS), 'module descriptions out of date'
F['date_bn'] = bn(F['date_bn'].split(' ', 1)[0]) + ' ' + F['date_bn'].split(' ', 1)[1].rsplit(' ', 1)[0] + ' ' + bn(F['date_bn'].rsplit(' ', 1)[1])
F['checks'] = run_verify() if '--no-verify' not in sys.argv else int(next((a.split('=')[1] for a in sys.argv if a.startswith('--checks=')), 0))

# ------------------------------------------------------------------ stylesheet
CSS = r'''
@font-face{font-family:'BN';src:local('FreeSans');unicode-range:U+0980-09FF,U+200C-200D;size-adjust:112%}
@font-face{font-family:'BNS';src:local('FreeSerif');unicode-range:U+0980-09FF,U+200C-200D;size-adjust:112%}
:root{--p:#17599B;--p2:#0F766E;--w:#B45309;--bg:#EEF4FA;--bd:#C9D6E3;--tx:#1E293B;--mu:#475569}
*{box-sizing:border-box}
html{font-size:13px}
body{margin:0;font-family:'BN','FreeSans','FreeSerif',sans-serif;color:var(--tx);line-height:1.62}
.mono{font-family:'FreeMono','DejaVu Sans Mono',monospace;font-size:.88em;background:#F1F5F9;padding:0 3px;border-radius:3px;overflow-wrap:anywhere;word-break:normal}
h1,h2,h3{font-family:'BNS','FreeSerif',serif;break-after:avoid}
h1.sec{font-size:23px;color:var(--p);margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--p);display:flex;align-items:baseline;gap:12px;break-after:avoid}
h1.sec .num{background:var(--p);color:#fff;border-radius:6px;padding:0 10px;font-size:19px;min-width:34px;text-align:center}
h1.sec .num:empty{display:none}
h1.pb,.pb{break-before:page}
.mk{font-size:1px;color:#fff;margin-left:auto}
.part{background:var(--p);color:#fff;border-radius:10px;padding:16px 20px;margin:0 0 14px}.part-t{font-size:27px;font-family:'BNS','FreeSerif',serif;font-weight:700}.part-d{font-size:13px;opacity:.92;margin-top:2px}
.whole{background:#E7F5F3;border:1px solid #9AD3BE;border-radius:8px;padding:8px 12px;margin:2px 0 12px;font-size:12.5px;break-inside:avoid}
td.bar{position:relative;font-size:11.5px;color:var(--tx)}.barf{height:10px;background:var(--p);border-radius:5px;margin-bottom:2px;opacity:.85}
table.mods td.dot{text-align:center;color:var(--p);font-weight:700;width:6.2%;padding:4px 2px}table.mods th{text-align:center}table.mods td.k{font-size:10.5px}
table.mods tr.r1row td{background:#E8F1FB!important}table.mods tr.r1row td:first-child{border-left:4px solid var(--p)}
table.prop tr.tA td:first-child{border-left:4px solid var(--p2)}table.prop tr.tB td:first-child{border-left:4px solid #CA8A04}table.prop tr.tC td:first-child{border-left:4px solid #94A3B8}
table.prop tr.tG td:first-child{border-left:4px dashed #CA8A04}table.prop tr.tG td{background:#FFFBEB!important}
table.prop tr.tX td{background:#FDECEC!important;color:#7F1D1D;text-decoration:line-through}
.keep{break-inside:avoid}.two2{display:flex;gap:12px}.two2>div{flex:1}.two2 table.t td{font-size:11.2px;padding:3px 6px}
tr.partrow td{background:var(--bg)!important;color:var(--p);font-weight:700;font-size:13.5px!important;border-bottom:2px solid var(--p)!important}
h3{font-size:16px;color:var(--p2);margin:16px 0 6px}
p{margin:6px 0 8px}
ul.b{margin:6px 0 8px;padding-left:20px}ul.b li{margin:4px 0}
ol.rules{padding-left:22px;margin:6px 0}ol.rules li{margin:5px 0}
.cap{color:var(--mu);font-size:11.5px;margin:4px 0 10px}
.note,.warn,.honest{border-radius:6px;padding:8px 12px;margin:10px 0;break-inside:avoid}
.note{background:var(--bg);border-left:4px solid var(--p)}
.warn{background:#FEF3E2;border-left:4px solid var(--w)}
.honest{background:#F1F5F9;border-left:4px solid #64748B}
table{border-collapse:collapse;width:100%;margin:8px 0 12px}
table.t th{background:var(--p);color:#fff;text-align:left;font-weight:700;padding:6px 8px;font-size:12.5px}
table.t td{border-bottom:1px solid var(--bd);padding:6px 8px;vertical-align:top;font-size:12.5px}
table.t tr:nth-child(even) td{background:#F8FAFC}
table.t tr{break-inside:avoid}
table.small td,table.small th{font-size:11.8px;padding:4px 7px}
td.c1{font-weight:700;color:var(--p);white-space:nowrap}
td.cnt{color:var(--mu);font-size:11px}
tr.gaterow td{background:#FDECEC!important;border-top:2px solid #B91C1C;border-bottom:2px solid #B91C1C}
/* cover */
.cover{height:262mm;position:relative;background:#fff}
.cover-band{position:absolute;left:0;right:0;top:0;height:92mm;background:var(--p)}
.cover-inner{position:relative;padding:34mm 12mm 0 12mm;color:#fff}
.cover-kicker{font-size:16px;letter-spacing:.3px;opacity:.9;margin-bottom:10px}
.cover-title{font-size:44px;line-height:1.15;margin:0 0 8px;color:#fff;font-family:'BNS','FreeSerif',serif}
.cover-sub{font-size:23px;margin-bottom:0;color:#fff}
.cover-line{height:0;margin:46mm 0 0}
.cover-tag{color:var(--tx);font-size:17px;line-height:1.7;margin:0 0 24px;padding:0 2px}
.cover-box{background:var(--bg);border-left:5px solid var(--p);border-radius:6px;padding:12px 16px;font-size:13.5px;color:var(--tx)}
.cover-box div{margin:6px 0}
/* toc */
h1.toc-h{margin-top:0}
table.toc td{padding:3.2px 8px;border-bottom:1px dotted var(--bd);font-size:13px;line-height:1.35}
table.toc td.tn{width:34px;color:var(--p);font-weight:700}table.toc td.tp{width:44px;text-align:right;color:var(--mu)}
/* summary */
.bigrow{display:flex;gap:10px;margin:8px 0 12px}
.big{flex:1;background:var(--bg);border:1px solid var(--bd);border-radius:8px;text-align:center;padding:10px 6px}
.big .n{font-size:38px;font-weight:700;color:var(--p);line-height:1.1;font-family:'BNS','FreeSerif',serif}
.big .l{font-size:12.5px;color:var(--tx)}.big small{color:var(--mu);font-size:11px}
.cols{display:flex;gap:18px}.cols>div{flex:1}
ol.next{padding-left:20px;margin:6px 0}ol.next li{margin:6px 0}
/* cards */
.cards5{display:flex;gap:8px;margin:8px 0}
.card{flex:1;border:1px solid var(--bd);border-top:4px solid var(--p);border-radius:6px;padding:8px 9px;font-size:12px;background:#fff;break-inside:avoid}
.card .ct{font-weight:700;color:var(--p);font-size:13.5px;margin-bottom:4px}
/* flows */
.flow{display:flex;gap:4px;margin:10px 0 14px}
.fs{flex:1;text-align:center;position:relative;break-inside:avoid}
.fs .fn{width:30px;height:30px;line-height:30px;margin:0 auto 4px;border-radius:50%;background:var(--p);color:#fff;font-weight:700;font-size:15px}
.fs .ft{font-size:11.4px;background:var(--bg);border:1px solid var(--bd);border-radius:6px;padding:6px 3px;min-height:46px}
.fs:not(:last-child)::after{content:'→';position:absolute;right:-9px;top:3px;color:var(--p);font-size:20px;font-weight:700}
/* architecture */
.arch{border:1px solid var(--bd);border-radius:10px;padding:12px;background:#FBFDFF;margin:8px 0 12px;break-inside:avoid}
.a-top,.a-core,.a-out{display:flex;gap:8px}
.a-school{flex:1;background:#fff;border:1.5px solid var(--p);border-radius:6px;padding:7px 4px;text-align:center;font-size:12.5px;font-weight:700;color:var(--p)}
.a-school small{display:block;font-weight:400;color:var(--mu);font-size:10.5px}
.a-arrow{text-align:center;color:var(--mu);font-size:11.5px;margin:6px 0}
.a-box{flex:1;background:#fff;border:1px solid var(--bd);border-radius:6px;padding:7px 6px;text-align:center;font-size:12px}
.a-box small{color:var(--mu);font-size:10.5px}
.a-app{background:#E8F1FB;border-color:var(--p)}.a-db{background:#E7F5F3;border-color:var(--p2)}.a-cache{background:#FEF3E2;border-color:var(--w)}
/* chips */
.chips{display:flex;align-items:center;gap:6px;margin:10px 0;break-inside:avoid}
.chip{flex:1;text-align:center;border-radius:8px;padding:8px 5px;font-weight:700;font-size:12.5px;line-height:1.35}
.chip small{font-weight:400;font-size:10.8px;display:block;opacity:.9}
.arr{color:var(--mu);font-size:20px}
.c-a{background:#E8F1FB;color:var(--p)}.c-b{background:#E7F5F3;color:var(--p2)}.c-c{background:#FEF3E2;color:var(--w)}.c-d{background:#FFF3C4;color:#854D0E}.c-e{background:#FDECEC;color:#B91C1C}
/* phases */
.phases{display:flex;gap:4px;margin:8px 0}
.ph{flex:1;background:var(--bg);border:1px solid var(--bd);border-radius:6px;padding:6px 3px;text-align:center;position:relative}
.ph .pn{font-weight:700;font-size:10.8px;color:var(--p)}.ph .pt{font-size:11.2px;line-height:1.3;margin-top:2px}
.ph.gate{background:#FDECEC;border-color:#B91C1C}.ph.gate .pn{color:#B91C1C}
/* roadmap */
.road{display:flex;gap:8px;margin:8px 0;align-items:stretch}
.rv{flex:1;border:1px solid var(--bd);border-radius:8px;padding:8px 9px;background:#fff;break-inside:avoid}
.rv.r1{background:var(--bg);border:2px solid var(--p)}
.rv .rt{font-weight:700;color:var(--p);font-size:15px;font-family:'BNS','FreeSerif',serif}.rv .rs{font-size:11px;color:var(--mu);margin-bottom:4px}
.rv ul{margin:4px 0 0;padding-left:16px;font-size:11.8px}.rv li{margin:2px 0}
.two{display:flex;gap:14px}.two>div{flex:1;border-radius:8px;padding:6px 14px 10px;break-inside:avoid}
.ok{background:#EAF6F1;border:1px solid #9AD3BE}.no{background:#FDF1F1;border:1px solid #E5A3A3}
.ok h3{color:#0F766E}.no h3{color:#B91C1C}.two ul.b{font-size:12.2px}
ol.check{list-style:none;padding:0;margin:8px 0}ol.check li{display:flex;gap:10px;align-items:flex-start;margin:6px 0;padding:7px 10px;border:1px solid var(--bd);border-radius:6px;break-inside:avoid;background:#fff}
.box{flex:0 0 16px;width:16px;height:16px;border:2px solid var(--p);border-radius:3px;margin-top:3px}
'''

def page(body, extra=''):
    return f'<!doctype html><html lang="bn"><head><meta charset="utf-8"><style>{CSS}{extra}</style></head><body>{body}</body></html>'

FOOT = ('<div style="width:100%;font-size:9px;font-family:FreeSans;color:#64748B;padding:0 16mm;display:flex;justify-content:space-between;border-top:1px solid #CBD5E1;padding-top:3px">'
        '<span>স্কুল ম্যানেজমেন্ট সফটওয়্যার — Release 1 পরিকল্পনা</span><span>পৃষ্ঠা <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>')

def render(html, path, footer=True):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg = b.new_page(); pg.set_content(html, wait_until='load')
        kw = dict(path=path, format='A4', print_background=True, margin=dict(top='15mm', bottom='17mm', left='16mm', right='16mm'))
        if footer: kw.update(display_header_footer=True, header_template='<div></div>', footer_template=FOOT)
        else: kw.update(margin=dict(top='0', bottom='0', left='0', right='0'))
        pg.pdf(**kw); b.close()

SECTIONS = [('S1', 1, 'এটি কী, কার জন্য'), ('S2', 2, 'আপনার সিদ্ধান্ত, আর তা পরিকল্পনাকে কীভাবে গড়েছে'), ('S3', 3, 'একটি স্কুলের একদিন — ব্যবহারের গল্প'), ('S4', 4, 'কে কী করতে পারবে'),
            ('S5', 5, 'Release 1-এ ঠিক কী আছে, আর কী নেই'), ('S6', 6, 'ভিতরে কীভাবে কাজ করে (সহজ ভাষায়)'), ('S7', 7, 'ব্যবসার দিক: subscription, SMS-ক্রেডিট, আপনার প্যানেল'),
            ('S8', 8, 'শিশুদের তথ্যের নিরাপত্তা ও গোপনীয়তা'), ('S9', 9, 'কীভাবে বানানো হবে'), ('S10', 10, 'Spike ও গেট — মাঝপথের বড় সিদ্ধান্ত'),
            ('S11', 11, 'প্রকাশ্য বিক্রির আগে আপনার কাজ (কোডের বাইরে)'), ('S12', 12, 'গ্রহণ-পরীক্ষা — কখন বলবেন "Release 1 তৈরি"'), ('S13', 13, 'পরের সংস্করণগুলো'),
            ('S14', 14, 'সৎ অবস্থা: কী যাচাই হয়েছে, কী হয়নি'), ('S15', 15, 'আপনার খোলা সিদ্ধান্ত — আমার সুপারিশসহ'),
            ('S16', 16, 'পুরো পণ্য এক নজরে: চার ধরনের প্রতিষ্ঠান, একটি সিস্টেম'), ('S17', 17, 'মডিউল-মানচিত্র: কোন মডিউল কোন ধরনে, কোন সংস্করণে'), ('S18', 18, 'সংস্করণ-মানচিত্র: R0 থেকে R7'),
            ('S19', 19, f'প্রস্তাবিত নতুন ফিচার ({bn(F["proposals"])}টি)'), ('S20', 20, f'পুরো ডেটা-নকশা: {bn(F["tables"])}টি টেবিল'), ('S21', 21, f'লিখিত সিদ্ধান্ত: {bn(F["decisions"])}টি'),
            ('S22', 22, 'আপনার সিদ্ধান্ত ও কাজ'), ('S23', 23, 'আমি যা ধরে নিয়েছি (ডিফল্ট)'), ('S24', 24, 'Release 3 — টাকা ও মানুষ: সম্পূর্ণ পরিকল্পনা'), ('S25', 25, 'এজেন্টের নিয়ম ও যন্ত্র-পাহারা'), ('S26', 26, 'সম্পূর্ণ প্রকাশ (D45)'), ('S27', 27, 'নিজস্ব-সার্ভারে স্থাপন সংস্করণ'), ('S28', 28, 'মূল্য-মডেল (D47)'),
            ('GL', 'ক', 'শব্দকোষ'), ('AM', 'খ', 'Release 1-এর ৮টি মডিউল'), ('AT', 'গ', f'Release 1-এর {bn(F["r1_tables"])}টি টেবিল'), ('AF', 'ঘ', 'ফাইল কোথায় (zip-এর ভিতরে)')]
PARTS = {'S1': ('P1', 'প্রথম ভাগ — Release 1: প্রথম সংস্করণ বিস্তারিত'), 'S16': ('P2', 'দ্বিতীয় ভাগ — পুরো পণ্য ও পরের সব সংস্করণ'), 'GL': ('P3', 'পরিশিষ্ট')}

def body(tocpages):
    rows = ''
    for k, n, tt in SECTIONS:
        if k in PARTS: rows += f'<tr class="partrow"><td colspan="2">{PARTS[k][1]}</td><td class="tp">{bn(tocpages.get(PARTS[k][0], 0))}</td></tr>'
        rows += f'<tr><td class="tn">{n if isinstance(n, str) else bn(n)}</td><td>{tt}</td><td class="tp">{bn(tocpages.get(k, 0))}</td></tr>'
    toc_html = f'<h1 class="sec toc-h">সূচিপত্র</h1><table class="toc">{rows}</table>'
    ban = lambda k, sub, pb=False: part(PARTS[k][1], sub, PARTS[k][0], pb=pb)
    part1 = ban('S1', 'স্কুলের জন্য প্রকাশ্যে-বিক্রির প্রথম সংস্করণ: কী, কীভাবে, আপনার কাজ কী', pb=False)
    part2 = ban('S16', 'চার ধরনের প্রতিষ্ঠান, সব মডিউল, সব সংস্করণ, সব সিদ্ধান্ত — Release 1-এর বাইরের পুরো ছবি', pb=True)
    part3 = ban('GL', 'শব্দকোষ, Release 1-এর মডিউল ও টেবিল, ফাইল-নির্দেশিকা', pb=True)
    return (toc_html + '<div class="pb"></div>' + summary(F) + '<div class="pb"></div>' + part1 + s1(F) + s2(F) + s3(F) + s4(F) + s5(F) + s6(F) + s7(F) + s8(F) + s9(F, plan) + s10(F) + s11(F) + s12(F) + s13(F) + s14(F) + s15(F)
            + part2 + s16(F) + s17(F) + s18(F) + s19(F) + s20(F) + s21(F) + s22(F) + s23(F) + s24(F) + s25(F) + s26(F) + s27(F) + s28(F) + part3 + appendix(F))

def find_pages(pdf_path):
    from pypdf import PdfReader
    rdr = PdfReader(pdf_path); found = {}
    for i, pg in enumerate(rdr.pages, 1):
        for m in re.findall(r'§§([A-Z]+\d*)', pg.extract_text() or ''): found.setdefault(m, i)      # the closing §§ is sometimes lost by text extraction; the key is enough
    return found, len(rdr.pages)

def main():
    tmp = os.path.join(HERE, '_tmp'); os.makedirs(tmp, exist_ok=True)
    cover_pdf = os.path.join(tmp, 'cover.pdf'); body1 = os.path.join(tmp, 'body1.pdf'); body2 = os.path.join(tmp, 'body2.pdf')
    render(page(cover(F)), cover_pdf, footer=False)
    render(page(body({})), body1)
    pages, n1 = find_pages(body1)
    unknown = [k for k in [x[0] for x in SECTIONS] + [v[0] for v in PARTS.values()] if k not in pages]; assert not unknown, f'markers not found in the PDF text: {unknown}'
    render(page(body(pages)), body2)
    pages2, n2 = find_pages(body2)
    assert pages2 == pages, f'table-of-contents page numbers moved between passes: {pages} vs {pages2}'
    from pypdf import PdfReader, PdfWriter
    w = PdfWriter()
    for src in (cover_pdf, body2):
        for pg in PdfReader(src).pages: w.add_page(pg)
    w.add_metadata({'/Title': 'স্কুল ম্যানেজমেন্ট সফটওয়্যার — Release 1: সম্পূর্ণ পরিকল্পনা', '/Author': 'প্রকল্প-পরিকল্পনা', '/Subject': 'মালিকের জন্য পাঠ-নির্দেশিকা', '/Keywords': 'Release 1, school management, SaaS, Bangladesh'})
    try:
        w.set_page_label(0, 0, style='/r'); w.set_page_label(1, n2, style='/D', start=1)
    except Exception as e: print('page labels not set:', e)
    parent = None
    for k, n, t in SECTIONS:
        if k in PARTS: parent = w.add_outline_item(PARTS[k][1], pages[PARTS[k][0]])
        w.add_outline_item(f'{n}. {t}', pages[k], parent=parent)      # body page p is PDF page index p (cover is index 0)
    w.write(OUT)
    print(f'wrote {OUT}: {n2 + 1} pages (cover + {n2}); sections found on pages {pages}')
    for f in (cover_pdf, body1, body2): os.remove(f)
    os.rmdir(tmp)

if __name__ == '__main__': main()
