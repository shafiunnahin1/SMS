# -*- coding: utf-8 -*-
"""Owner's guide - part two: the WHOLE product (chapters 16-23). Tables are copied from the specs by sources.py; only the introductions are written here."""
import os, re, json, collections
import sources as S
from content_a import bn, sec

REL_ORDER = ['R0', 'R1', 'R1.1', 'R2', 'R2+', 'R3', 'R4', 'R5', 'R6', 'R7']
def relkey(s):
    m = re.search(r'R\d(?:\.\d)?', s or ''); return m.group(0) if m else ''

def part(title, sub, mark, pb=True):
    return f'<div class="part{" pb" if pb else ""}"><div class="part-t">{title}</div><div class="part-d">{sub}</div><span class="mk">§§{mark}§§</span></div>'

def facts():
    h, mi = S.module_index(); mods = [r for r in mi if re.fullmatch(r'`\w+`', r[0]) and len(r) >= 6]
    it = S.institution_types(); scope = json.loads(S.rd('docs/release/r1-scope.json'))
    rel, led, prop = S.roadmap()
    return mods, it, scope, rel, led, prop

_ORD = ['R0', 'R1', 'R1.1', 'R2', 'R2+', 'R3', 'R4', 'R5', 'R6', 'R7']
def _routes_by_module():
    import sys, os
    _sv = os.path.join(S.ROOT, 'infra', 'spec-verify')
    if _sv not in sys.path: sys.path.insert(0, _sv)
    _argv = sys.argv; sys.argv = [_argv[0], S.ROOT]          # gen_agent_plan reads the repository root from argv
    try: import gen_agent_plan as G
    finally: sys.argv = _argv
    d = collections.defaultdict(set)
    for v, p, c, a, r, m in G.ALL_ROUTES:
        if m: d[m].add(c)
    return d
_RBM = None
# docs/ROADMAP.md, release table, row R4: "লাইব্রেরি, পরিবহন, হোস্টেল, অনলাইন ক্লাস/কুইজ ইত্যাদি + উপস্থিতি-device" - named there in prose, so no controller carries the label
_R4_BY_ROADMAP_TEXT = {'library', 'transport', 'hostel', 'online_class', 'online_quiz', 'attendance_devices'}
def module_release(row, scope, ledrel=None):
    """A module's release = the earliest release label (r1-scope.json -> controllers) of the controllers that serve its routes.
    NOT derived from the 'Phase 7 - #N' numbers of the module index: those count the build table, not the roadmap ledger (an earlier version of this chapter confused the two)."""
    global _RBM
    if _RBM is None: _RBM = _routes_by_module()
    key = row[0].strip('`'); ph = row[3]
    if key in scope['modules']: return 'R1'
    if key in _R4_BY_ROADMAP_TEXT: return 'R4'
    rels = [scope['controllers'][c]['release'] for c in _RBM.get(key, ()) if c in scope['controllers']]
    rels = [x for x in rels if x in _ORD and x != 'R1']      # an R1 controller that also carries a later module's extra routes (ExamController: seat plan; StudentController: promotion) says nothing about that module
    if rels: return min(rels, key=_ORD.index)
    m = re.search(r'Phase (\d+)\D+(\d+\.\d+[a-z]?)', ph)
    if m:
        s = m.group(2)
        if s in scope['steps_later']: return relkey(scope['steps_later'][s])
        if s in scope['steps_in_release']: return 'R1.1+'
    if 'Phase 10' in ph: return 'R7'
    return ''

def s16(F):
    mods, it, scope, rel, led, prop = facts()
    n = {k: len(v['modules']) for k, v in it.items()}
    rows = [
        ('স্কুল', 'school', 'সাধারণ স্কুল: শ্রেণি, শাখা, বার্ষিক ও সাময়িক পরীক্ষা, GPA। <b>Release 1 শুধু এর জন্য।</b>'),
        ('কলেজ', 'college', 'কলেজ: স্কুলের প্রায় সবই, কিছু স্কুল-নির্দিষ্ট মডিউল বাদ।'),
        ('কোচিং সেন্টার', 'coaching', 'কোর্স ও ব্যাচ-ভিত্তিক, মাসিক ফি, ভর্তি-লিড ও SMS-নির্ভর; সরল কাঠামো।'),
        ('প্রাইভেট ব্যাচ (একক শিক্ষক)', 'private_batch', 'একজন শিক্ষকের নিজের ব্যাচ — সবচেয়ে সরল, মাত্র মূল কাজ।'),
    ]
    mx = max(n.values())
    trs = ''.join(f'<tr><td><b>{a}</b></td><td>{c}</td><td class="bar"><div class="barf" style="width:{round(100*n[k]/mx)}%"></div><span>{bn(n[k])}টি মডিউল</span></td></tr>' for a, k, c in rows)
    return f'''
{sec(16,'পুরো পণ্যটি এক নজরে: চার ধরনের প্রতিষ্ঠান, একটি সিস্টেম','S16')}
<p>এখন পর্যন্ত বিস্তারিত ছিল শুধু Release 1 (স্কুল)। কিন্তু পণ্যটি পুরোপুরি বানানো হচ্ছে <b>স্কুল, কলেজ, কোচিং সেন্টার ও প্রাইভেট ব্যাচ</b> — সবার জন্য <b>একই ইঞ্জিন</b>। কোন প্রতিষ্ঠানে কোন মডিউল চালু থাকবে তা ঠিক হয় প্রতিষ্ঠানের <b>ধরন</b>, তার <b>plan</b> এবং (কিছু ক্ষেত্রে) অ্যাডমিনের নিজের <b>চালু-করা সুইচ</b> দিয়ে। শব্দও বদলায়: স্কুলে "শ্রেণি/শাখা", কোচিংয়ে "কোর্স/ব্যাচ"।</p>
<table class="t">
<tr><th style="width:23%">ধরন</th><th>কার জন্য</th><th style="width:30%">মডিউল-সংখ্যা</th></tr>
{trs}
</table>
<div class="note"><b>মাদ্রাসা</b> আলাদা ধরন নয়, স্কুল/কলেজের উপর একটি <b>প্রিসেট</b>: হিফজ-ট্র্যাকিং, হিজরি ক্যালেন্ডার, আরবি ভাষা, দান-ব্যবস্থা (সব ঐচ্ছিক, চালু করলে তবে)। লক্ষ্য-গ্রাহক আগে বেসরকারি প্রতিষ্ঠান (D43); <b>সরকারি/এমপিও প্রতিষ্ঠান ঐচ্ছিক হিসেবে পরিকল্পনায় থাকে, বাদ নয়</b> (D44) — ডিফল্টে লুকানো, চাইলে চালু হয়।</div>
<h3>মডিউল চালু হয় তিনটি দরজা পেরিয়ে</h3>
<div class="chips">
  <div class="chip c-a">১. প্রতিষ্ঠানের ধরন<br><small>স্কুলে আছে কি?</small></div><div class="arr">→</div><div class="chip c-b">২. plan<br><small>Pro+ মডিউল?</small></div><div class="arr">→</div><div class="chip c-c">৩. অ্যাডমিনের সুইচ<br><small>ঐচ্ছিক মডিউল</small></div><div class="arr">→</div><div class="chip c-d">৪. Release<br><small>এই build-এ আছে?</small></div>
</div>
<p>চতুর্থ দরজা (Release) নতুন: যে মডিউলের কোড এখনো লেখা হয়নি, তা কারো জন্যই চালু হয় না — Super Admin চাইলেও নয়। তাই Release 1-এ শুধু ৮টি মডিউল চালু, বাকিগুলো সংস্করণ এলে খোলে।</p>'''

def s17(F):
    mods, it, scope, rel, led, prop = facts()
    ledrel = {r[0].strip(): relkey(r[4]) for r in led}
    kinds = {'core': 'মূল', 'plan': 'plan-নির্ভর', 'opt-in': 'ঐচ্ছিক'}
    trs = ''; cnt = collections.Counter()
    def sortkey(r):
        x = module_release(r, scope, ledrel); return (REL_ORDER.index(x) if x in REL_ORDER else (REL_ORDER.index("R1.1") + 0.5 if x == "R1.1+" else 99), r[0])
    for r in sorted(mods, key=sortkey):
        key = r[0].strip('`'); mr = module_release(r, scope, ledrel) or '—'; cnt[mr] += 1
        dots = ''.join(f'<td class="dot">{"●" if key in it[t]["modules"] else "–"}</td>' for t in ('school', 'college', 'coaching', 'private_batch'))
        cls = ' class="r1row"' if mr == 'R1' else ''
        trs += f'<tr{cls}><td class="mono k">{key}</td><td>{S.clean(r[1])}</td>{dots}<td class="c1">{mr}</td><td class="cnt">{kinds.get(r[4].strip(), S.clean(r[4]))}</td></tr>'
    assert cnt['R1'] == len(scope['modules']), f"module map shows {cnt['R1']} Release 1 modules but the scope file has {len(scope['modules'])}"
    summ = ' · '.join(f'{k}: {bn(v)}' for k, v in sorted(cnt.items(), key=lambda x: REL_ORDER.index(x[0]) if x[0] in REL_ORDER else 99))
    return f'''
{sec(17,'মডিউল-মানচিত্র: কোন মডিউল কোন ধরনে, কোন সংস্করণে','S17')}
<p>পণ্যের সবকিছু <b>{bn(len(mods))}টি মডিউলে</b> ভাগ করা। নিচের সারণিতে প্রতিটি মডিউল কী করে, চারটি ধরনের কোনটিতে পাওয়া যায় (● = পাওয়া যায়), কোন সংস্করণে আসে, আর সেটি মূল না plan-নির্ভর না ঐচ্ছিক। <b>নীল-রেখা সারি = Release 1।</b></p>
<table class="t small mods">
<tr><th style="width:15%">মডিউল</th><th>কী করে</th><th>স্কুল</th><th>কলেজ</th><th>কোচিং</th><th>ব্যাচ</th><th>সংস্করণ</th><th>ধরন</th></tr>
{trs}
</table>
<p class="cap">সংস্করণ-হিসাব: প্রতিটি মডিউলের route যে controller-গুলো সামলায়, তাদের রিলিজ-চিহ্ন থেকে নেওয়া (<span class="mono">docs/release/r1-scope.json</span>) — {summ}। "R2+" = R2 বা তার পরে। "R1.1+" = নির্মাণ-ধাপ Release 1-এ, কিন্তু মডিউলটি Release 1-এর স্কোপের বাইরে। "—" মানে রোডম্যাপে এখনো নির্দিষ্ট সংস্করণে বসানো হয়নি। "প্ল্যান-নির্ভর" = উচ্চতর plan লাগে।</p>'''

def s18(F):
    mods, it, scope, rel, led, prop = facts()
    rows = ''.join(f'<tr><td style="color:var(--p)">{S.clean(r[0])}</td><td>{S.clean(r[1])}</td><td class="cnt">{S.clean(r[2])}</td></tr>' for r in rel)
    ledsorted = sorted(led, key=lambda r: (REL_ORDER.index(relkey(r[4])) if relkey(r[4]) in REL_ORDER else 99, int(re.sub(r'\D', '', r[0]) or 0)))
    lrows = ''.join(f'<tr><td class="c1">{S.clean(r[0])}</td><td><b>{S.clean(r[1])}</b></td><td class="c1">{S.clean(r[4])}</td><td class="cnt">{S.clean(r[5])}</td></tr>' for r in ledsorted)
    return f'''
{sec(18,'সংস্করণ-মানচিত্র: R0 থেকে R7, প্রতিটিতে কী আসে','S18')}
<p>পুরো পণ্য আটটি ধাপে (সংস্করণে) আসে। প্রতিটির পিছনে একটিই নিয়ম: <b>আগে যা না থাকলে গ্রাহক নেবে না, পরে যা থাকলে ভালো।</b> সময়-অনুমান নেই; সংস্করণ-ক্রম বাস্তব গ্রাহকের প্রতিক্রিয়ায় বদলাতে পারে।</p>
<table class="t">
<tr><th style="width:24%">সংস্করণ</th><th>বিষয়</th><th style="width:22%">মূল Phase/Step</th></tr>
{rows}
</table>
<div class="honest"><b>সৎ কথা:</b> শুধু ধাপ-ধরে এজেন্ট-পরিকল্পনা (ধাপ, টেবিল, route, পরীক্ষা, শেষ-শর্ত) বানানো হয়েছে <b>Release 1 ({bn(F['tasks'])} ধাপ)</b> ও <b>Release 3 (১৬ ধাপ, §২৪)</b>-এর জন্য। বাকি সংস্করণগুলোর (R1.1, R2, R4 থেকে) <b>স্পেক লেখা আছে</b>, কিন্তু ধাপ-তালিকা নেই — সংস্করণ শুরুর আগে একই পদ্ধতিতে বানাতে হবে। সব সংস্করণের ধাপ-তালিকা আগেই বানালে তা অনুমানের উপর দাঁড়াত।</div>
<h3>প্রতিটি ফিচার — কোন সংস্করণে, কীসের উপর নির্ভর করে</h3>
<table class="t small">
<tr><th style="width:5%">#</th><th>ফিচার</th><th style="width:15%">সংস্করণ</th><th style="width:34%">নির্ভরতা / আকার</th></tr>
{lrows}
</table>
<p class="cap">উৎস: <span class="mono">docs/ROADMAP.md</span> (ফিচার-খতিয়ান)। Release 1 এবং R1.1-এর অনেক ফিচার (ছাত্র, হাজিরা, ফি…) খতিয়ানের বাইরে, কারণ সেগুলো মূল মডিউল।</p>'''

def s19(F):
    mods, it, scope, rel, led, prop = facts()
    def tier(r):
        t = re.sub(r'<[^>]+>', '', S.clean(r[2])); return 'G' if 'D44' in t else ('X' if 'বাতিল' in t else (re.search(r'[ABC]', t).group(0) if re.search(r'[ABC]', t) else ''))
    cnt = collections.Counter(tier(r) for r in prop)
    trs = ''
    for r in prop:
        t = tier(r); cls = {'A': 'tA', 'B': 'tB', 'C': 'tC', 'X': 'tX', 'G': 'tG'}.get(t, '')
        trs += f'<tr class="{cls}"><td class="c1">{S.clean(r[0])}</td><td>{S.clean(r[1])}</td><td>{S.clean(r[2])}</td><td class="cnt">{S.clean(r[3])}</td><td class="cnt">{S.clean(r[4])}</td></tr>'
    return f'''
{sec(19,'প্রস্তাবিত নতুন ফিচার ('+bn(len(prop))+'টি) — কোনটি কতটা তৈরি','S19')}
<p>মূল মডিউলের বাইরে আরও <b>{bn(len(prop))}টি ফিচার</b> প্রস্তাব করা হয়েছে (হিসাব-খাত, দান, ভর্তি-চক্র, সিলেবাস, ঝুঁকি-সতর্কতা, ডেটা-আমদানি, শিক্ষক-কর্মীর সুবিধা-নিয়ম ইত্যাদি)। রোডম্যাপের নিজস্ব সংজ্ঞা অনুযায়ী:</p>
<ul class="b">
<li><b>Tier A</b> = সবচেয়ে অগ্রাধিকার, প্রথম দফা ({bn(cnt['A'])}টি); <b>Tier B/C</b> = এখনো প্রস্তাব, বাদ নয় ({bn(cnt['B'])} ও {bn(cnt['C'])}টি)। <b>ঐচ্ছিক (সরকারি/এমপিও)</b> = {bn(cnt['G'])}টি — পরিকল্পনায় থাকে, বাদ নয়; ডিফল্টে লুকানো, নিচু অগ্রাধিকার (সিদ্ধান্ত D44)।</li>
<li><b>[স্পেক লেখা]</b> = পূর্ণ স্পেক ডকুমেন্ট তৈরি আছে। <b>[আসল ফরম্যাট/নিয়ম লাগবে]</b> = আপনার কাছ থেকে বাস্তব ফরম্যাট বা নিয়ম না পেলে এগোনো যায় না।</li>
</ul>
<table class="t small prop">
<tr><th style="width:6%">ID</th><th>ফিচার</th><th style="width:25%">Tier</th><th style="width:8%">নতুন টেবিল</th><th style="width:19%">নির্ভরতা</th></tr>
{trs}
</table>
<p class="cap">উৎস: <span class="mono">docs/ROADMAP.md</span> §৫ ও <span class="mono">docs/reports/FEATURE-IDEAS.md</span>। "নতুন টেবিল" আনুমানিক।</p>'''

def s20(F):
    h, rows = S.db_groups()
    tot = sum(int(re.sub(r'\D', '', r[1]) or 0) for r in rows)
    trs = ''.join(f'<tr><td><b>{S.clean(r[0])}</b></td><td class="c1">{bn(re.sub(chr(92)+"D","",r[1]))}</td><td class="cnt">{S.clean(r[2])}</td></tr>' for r in rows)
    return f'''<div class="keep">
{sec(20,'পুরো ডেটা-নকশা: '+bn(tot)+'টি টেবিল, ১৪টি ভাগ','S20')}
<p>পণ্যের সব তথ্য <b>{bn(tot)}টি টেবিলে</b> রাখা হয় (Release 1 ব্যবহার করে {bn(F['r1_tables'])}টি)। নিচে ভাগ ধরে তালিকা; প্রতিটি টেবিলের কলাম-পর্যন্ত নকশা <span class="mono">docs/database/schema.sql</span>-এ। এই নকশা একটি বিকল্প ডেটাবেস-ইঞ্জিনে চালিয়ে যাচাই করা, কিন্তু <b>আসল MySQL-এ এখনো চালানো হয়নি</b> (Spike-এর প্রথম কাজ)।</p>
<table class="t small">
<tr><th style="width:22%">ভাগ</th><th style="width:7%">সংখ্যা</th><th>টেবিল</th></tr>
{trs}
</table></div>'''

def s21(F):
    ds = S.decisions(); half = (len(ds) + 1) // 2
    def t(lst): return '<table class="t small">' + ''.join(f'<tr><td class="c1">{a}</td><td>{S.clean(b)}</td></tr>' for a, b in lst) + '</table>'
    return f'''<div class="keep">
{sec(21,'লিখিত সিদ্ধান্ত: '+bn(len(ds))+'টি, যা আর আলোচনায় ফেরে না','S21')}
<p>পরিকল্পনার ভিত্তি {bn(len(ds))}টি <b>লিখিত সিদ্ধান্ত</b> (D1–D{len(ds)}): প্রযুক্তি, নিরাপত্তা, গোপনীয়তা, টাকার নিয়ম, ভর্তি, ভাষা ইত্যাদি। কোনো সিদ্ধান্ত বদলাতে হলে নতুন সিদ্ধান্ত হিসেবে লিখিত হয়, নীরবে নয়। পূর্ণ বিবরণ: <span class="mono">docs/LOCKED-DECISIONS.md</span>।</p>
<div class="two2"><div>{t(ds[:half])}</div><div>{t(ds[half:])}</div></div></div>'''

def _od_tables(heading):
    txt = S.section('PRODUCT.md', re.escape(heading))
    try: h, rows = S.table_after(txt, r'^\|\s*ID\s*\|'); return rows
    except LookupError: return []

def s22(F):
    resolved = _od_tables('Decisions Resolved by the Owner'); opened = _od_tables('Open Decisions')
    actions = [S.clean(re.sub(r'^\d+\.\s*', '', l)) for l in S.section('PRODUCT.md', re.escape('Owner Actions Before Production')).split('\n') if re.match(r'\d+\.', l.strip())]
    def tb(rows, heads): return '<table class="t small"><tr>' + ''.join(f'<th>{h}</th>' for h in heads) + '</tr>' + ''.join('<tr>' + ''.join(f'<td>{S.clean(c)}</td>' for c in r[:len(heads)]) + '</tr>' for r in rows) + '</table>'
    acts = ''.join(f'<li>{a}</li>' for a in actions)
    return f'''
{sec(22,'আপনার সিদ্ধান্ত ও কাজ: যা শুধু আপনি বা বাইরের কেউ দিতে পারেন','S22')}
<h3>যে সিদ্ধান্ত আপনি আগেই দিয়েছেন (OD)</h3>
{tb(resolved, ['ID', 'প্রশ্ন', 'উত্তর (লিখিত সিদ্ধান্ত)'])}
<h3>এখনো খোলা — উত্তর না আসা পর্যন্ত এর উপর কিছু বানানো হবে না</h3>
{tb(opened, ['ID', 'প্রশ্ন', 'যতক্ষণ উত্তর নেই'])}
<h3>চালুর আগে আপনার কাজ (এজেন্টের নয়)</h3>
<ol class="rules">{acts}</ol>
<div class="note">এর সাথে §{bn(11)} (প্রকাশ্য বিক্রির আগের কাজ) ও §{bn(15)} (খোলা সিদ্ধান্ত) মিলিয়ে পড়ুন; ওখানে Release 1-এর জন্য আলাদা করে সাজানো।</div>'''

def s23(F):
    defaults = S.section('PRODUCT.md', re.escape('"সব সমাধান করো"')) or S.section('PRODUCT.md', '"?সব সমাধান করো"?')
    m = re.search(r'^## "?সব সমাধান করো"?[^\n]*\n(.*?)(?=^## )', S.rd('PRODUCT.md'), re.S | re.M); txt = m.group(1) if m else defaults
    h, rows = S.table_after(txt, r'^\|[^|]+\|[^|]+\|[^|]+\|\s*$')
    trs = ''.join(f'<tr><td><b>{S.clean(r[0])}</b></td><td>{S.clean(r[1])}</td><td class="cnt">{S.clean(r[2])}</td></tr>' for r in rows)
    return f'''
{sec(23,'আমি যা ধরে নিয়েছি (ডিফল্ট) — আপনি যেকোনোটি বদলাতে পারবেন','S23')}
<p>আপনার স্পষ্ট নির্দেশ না পাওয়া জায়গায় আমি <b>সবচেয়ে সংরক্ষণশীল</b> ধারণা বসিয়েছি। নিচের {bn(len(rows))}টির প্রতিটি বদলানো যায়; কোথায় বদলাতে হবে তাও দেওয়া আছে। কোনোটি ভুল মনে হলে সেটিই আগে ঠিক করুন।</p>
<table class="t small">
<tr><th style="width:24%">বিষয়</th><th>আমি যা ধরেছি</th><th style="width:26%">কোথায় বদলাবেন</th></tr>
{trs}
</table>'''

def s24(F):
    r3 = json.loads(S.rd('docs/release/r3-scope.json')); plan = json.loads(S.rd('docs/release/r3-plan.json'))
    rel3 = S.rd('docs/RELEASE-3.md')
    h, feat = S.table_after(rel3, r'^\|\s*বিষয়\s*\|\s*কী\s*\|')
    ftr = ''.join(f'<tr><td><b>{S.clean(a)}</b></td><td>{S.clean(b)}</td></tr>' for a, b in [(r[0], r[1]) for r in feat])
    trs = ''.join(f'<tr><td class="c1">{t["id"]}</td><td><b>{t["title"]}</b></td><td class="cnt">' + ' · '.join(x for x in [f'{bn(len(t["tables"]))} টেবিল' if t['tables'] else '', f'{bn(len(t["routes"]))} পথ' if t['routes'] else '', f'{bn(len(t["tests"]))} পরীক্ষা' if t['tests'] else ''] if x) + '</td></tr>' for t in plan['tasks'])
    nt = len(r3['tables']); nroute = sum(len(t['routes']) for t in plan['tasks']) - sum(len(t['routes']) for t in plan['tasks'] if t['id'] == 'R3.1')
    ntest = len({x for t in plan['tasks'] for x in t['tests']})
    acc = ''.join(f'<li><span class="box"></span>{S.clean(a)}</li>' for a in r3['acceptance'])
    ext = ''.join(f'<li>{S.clean(e)}</li>' for e in r3['external'])
    return f'''
{sec(24,'Release 3 — টাকা ও মানুষ: সম্পূর্ণ পরিকল্পনা','S24')}
<p>আপনার নির্দেশ: "R3 সম্পূর্ণ করে কোডিং শুরু করব।" তাই R3-কেও Release 1-এর মতো পূর্ণ করা হয়েছে: স্কোপ, নির্ভরতা, <b>১৬-ধাপের এজেন্ট-পরিকল্পনা</b>, গ্রহণ-শর্ত। R3-এ আছে <b>{bn(nt)}টি নতুন টেবিল, ৬টি মডিউল, {bn(nroute)}টি অনুরোধ-পথ, {bn(ntest)}টি আলাদা পরীক্ষা</b>।</p>
<div class="note"><b>R1 → R3 সরাসরি যাওয়া যায়, R1.1 বা R2 ছাড়া।</b> R3-এর টেবিলগুলোর কোনো বাধ্যতামূলক রেফারেন্স Release 1-এর বাইরে যায় না (গুনে দেখা)। একমাত্র ব্যবহারিক পূর্বশর্ত <b>খরচ (<span class="mono">expenses</span>) মডিউল</b>, কারণ ক্যাশবুক দিনের খরচ ধরে — সেটি ধাপ R3.1-এ আছে। নোটিশ, অনলাইন ফি-পেমেন্ট, ছাত্র-লগইন তখনো থাকবে না — এগুলো R3-এর শর্ত নয়, শুধু আপনার অগ্রাধিকার।</div>
<h3>R3-এ কী আছে</h3>
<table class="t"><tr><th style="width:20%">বিষয়</th><th>কী</th></tr>{ftr}</table>
<h3>১৬টি ধাপ</h3>
<table class="t small"><tr><th style="width:8%">ধাপ</th><th>কী বানানো হয়</th><th style="width:30%">আকার</th></tr>{trs}</table>
<div class="warn"><b>ঐচ্ছিক কাটছাঁট (R3a / R3b):</b> {S.clean(r3['optional_cut']['why'])}</div>
<h3>গ্রহণ-শর্ত — সব সত্য হলে তবেই R3 চালু</h3>
<ol class="check">{acc}</ol>
<h3>যা বাইরের তথ্য ছাড়া এগোয় না (আপনার বা বিশেষজ্ঞের কাজ)</h3>
<ul class="b">{ext}</ul>
<div class="honest"><b>সৎ কথা:</b> payroll, ক্যাশবুক, হিসাব-খাত, দান ও স্টকের সংখ্যা স্বাধীন রেফারেন্স-গণনায় মেলানো, কিন্তু <b>কোনো কোডে বা আসল ডেটাবেসে এখনো কিছু চলেনি</b>। এই পর্বে ধরা পড়েছিল: ছুটির route টেমপ্লেটে ছিল না (যোগ হয়েছে); কোচিং-পারিশ্রমিক ভুলে R3-এ ধরা ছিল (R2-তে ফেরানো)। PF, কর ও গ্র্যাচুইটির আইনি হার স্পেকে অনুমান করা নেই — <b>প্রকাশ্য বিক্রির আগে হিসাবরক্ষক ও আইনজীবীর যাচাই বাধ্যতামূলক</b>। সময় ও খরচের অনুমান নেই। পূর্ণ বিবরণ: <span class="mono">docs/RELEASE-3.md</span>, <span class="mono">docs/AGENT-PLAN-R3.md</span>।</div>'''

def s25(F):
    g = S.rd('docs/ops/agent-guardrails.md')
    rules = re.findall(r'^### (G\d+) — (.+)$', g, re.M)
    def enf(gid):
        blk = re.search(r'^### %s .*?(?=^### G|^## |\Z)' % gid, g, re.S | re.M).group(0)
        m = re.search(r'বাধ্য করে:\*\*(.*?)(?:\*\*বদলে|\n\n|\Z)', blk, re.S)
        return sorted(set(re.findall(r'\b(C\d+|tests|review|permissions|branch-protection|CODEOWNERS)\b', m.group(1))), key=lambda x: (0, int(x[1:])) if re.fullmatch(r'C\d+', x) else (1, x)) if m else []
    NAME = {'tests': 'স্বয়ংক্রিয় পরীক্ষা', 'review': 'মানব-রিভিউ', 'permissions': 'টুল-অনুমতি', 'branch-protection': 'শাখা-সুরক্ষা', 'CODEOWNERS': 'অনুমোদন-মালিক'}
    rows = ''.join(f'<tr><td class="c1">{a}</td><td>{S.clean(b)}</td><td class="cnt">' + ' · '.join(('গার্ড ' + x) if re.fullmatch(r'C\d+', x) else NAME.get(x, x) for x in enf(a)) + '</td></tr>' for a, b in rules)
    sec7 = re.search(r'^## [^\n]*সেটআপ-চেকলিস্ট[^\n]*\n(.*?)(?=^## )', g, re.S | re.M).group(1)
    todo = ''.join(f'<li><span class="box"></span>{S.clean(l[5:].strip())}</li>' for l in sec7.split('\n') if l.startswith('- [ ]'))
    sec8 = re.search(r'^## [^\n]*যা গার্ড ধরতে পারে না[^\n]*\n(.*)', g, re.S | re.M).group(1)
    lim = ''.join(f'<li>{S.clean(l[2:])}</li>' for l in sec8.split('\n') if l.startswith('- '))
    import subprocess
    return f'''
{sec(25,'এজেন্টের নিয়ম ও যন্ত্র-পাহারা — মাঝপথে যাতে উল্টাপাল্টা না হয়','S25')}
<p>কোডিং এজেন্ট মাঝপথে যে-ধরনের ক্ষতি করে — <b>পরীক্ষা দুর্বল করে সবুজ বানানো, স্কিমা নীরবে বদলানো, স্কোপের বাইরের ফিচার আগাম বানানো, পুরনো ফাইল মুছে ফেলা, সিদ্ধান্ত উল্টে দেওয়া</b> — তা ঠেকাতে {bn(len(rules))}টি নিয়ম লেখা আছে (<span class="mono">docs/ops/agent-guardrails.md</span>, <span class="mono">AGENTS.md</span>)। কিন্তু শুধু অনুরোধে ভরসা নয়: <b>একটি "গার্ড" প্রোগ্রাম</b> (<span class="mono">infra/guard/agent_guard.py</span>) প্রতিটি commit-এ চলে এবং লঙ্ঘনে সেটি আটকে দেয়। CI-তে চলে, যেখানে এজেন্ট এড়াতে পারে না।</p>
<div class="note"><b>গার্ড কীভাবে পরীক্ষা হয়েছে:</b> একটি অস্থায়ী git-রিপোজিটরিতে প্রতিটি নিয়মের <b>আসল লঙ্ঘন</b> commit করে (যেমন পরীক্ষা মোছা, পুরনো migration বদল, পরের রিলিজের টেবিল, ক্রম ভাঙা) দেখা হয়েছে গার্ড ঠিক সেই জায়গায় ব্যর্থ হয় কি না, আর নির্দোষ commit পাস হয় কি না: <b>৫১টি পরিস্থিতির ৫১টিতেই</b> ঠিক। পরীক্ষাটি একটি আসল ত্রুটিও ধরেছিল (এক-নির্ভরতার ধাপ-ক্রম পড়তে গার্ড ভুল করত), যা ঠিক হয়েছে।</div>
<h3>নিয়মগুলো এবং কে বাধ্য করে</h3>
<table class="t small"><tr><th style="width:7%">নিয়ম</th><th>কী</th><th style="width:30%">বাধ্য করে</th></tr>{rows}</table>
<h3>প্রতিটি টাস্ক-commit-এ গার্ড কী দেখে</h3>
<ul class="b">
<li><b>স্কোপ-তালা:</b> বর্তমান রিলিজের বাইরের টেবিল বা route আগাম বানালে ব্যর্থ।</li>
<li><b>ক্রম:</b> আগের ধাপ <span class="mono">[x]</span> না হলে পরের ধাপ নয়; প্রতি commit-এ একটি টাস্ক; <span class="mono">docs/PROGRESS.md</span> সেই commit-এই হালনাগাদ।</li>
<li><b>সুরক্ষিত ফাইল:</b> স্পেক, সিদ্ধান্ত, নিয়ম-ফাইল, গার্ড নিজে, CI, golden-সংখ্যা — এজেন্ট বদলাতে পারে না। বদলাতে হলে <b>আপনি আগে একটি লিখিত সিদ্ধান্ত</b> যোগ করবেন (Change-Request), তারপর পরিবর্তন।</li>
<li><b>পরীক্ষা অক্ষত:</b> মোছা, skip, assert-কমানো — আটকায়।</li>
<li><b>migration শুধু-যোগ, নির্ভরতা অপরিবর্তিত, নিষিদ্ধ কোড, secret, বড় diff</b> — সবই আটকায়।</li>
</ul>
<h3>এজেন্ট আটকে গেলে</h3>
<p>অনুমান করে এগোয় না: <span class="mono">docs/BLOCKED.md</span>-এ লেখে (৩ বার চেষ্টা ব্যর্থ, স্পেক-বিরোধ, দরকারি তথ্য অনুপস্থিত, সুরক্ষিত ফাইল বদলাতে হবে…) ও থামে। ভালো আইডিয়া <span class="mono">docs/IDEAS.md</span>-এ — গ্রহণ আপনার।</p>
<h3>এটি পুরোপুরি কাজ করতে আপনাকে যা সেট করতে হবে</h3>
<ol class="check">{todo}</ol>
<div class="warn"><b>সৎ সীমা — গার্ড যা ধরতে পারে না:</b><ul class="b">{lim}</ul>গার্ড এখনো কোনো আসল Laravel/React কোডে চালানো হয়নি। তাই <b>মানব-রিভিউয়ার ও স্বয়ংক্রিয় পরীক্ষা বাদ যায় না</b> — গার্ড তাদের পরিপূরক।</div>'''

def s26(F):
    import html as _html
    esc_ = _html.escape
    au = json.loads(S.rd('docs/release/full-audit.json')); fs = json.loads(S.rd('docs/release/full-scope.json'))
    import csv
    names = {r['key']: r['name_bn'] for r in csv.DictReader(open(os.path.join(S.ROOT, 'docs/pricing/modules.csv'), encoding='utf-8-sig'))}
    st = {'task-plan': '<b>পূর্ণ কাজ-পরিকল্পনা আছে</b>', 'draft': 'শুধু খসড়া', 'blocked-external': '<b>বাইরের নথি ছাড়া শুরু করা যায় না</b>'}
    rows = ''.join(f'<tr><td class="c1">{m["id"]}</td><td>{esc_(m["name"])}</td><td class="c1">{m["release"]}</td><td class="cnt">{bn(m["modules"])} ({bn(m["with_task_plan"])} পূর্ণ)</td><td class="cnt">{bn(m["features"])}</td><td>{st[m["plan_status"]]}</td></tr>' for m in au['milestones'])
    prop = au['gaps']['proposed_placement']
    def _tbl(ks): return '<table class="t small"><tr><th>মডিউল</th><th style="width:22%">ধাপ</th></tr>' + ''.join(f'<tr><td>{esc_(names.get(k, k))}</td><td class="c1">{fs["modules"][k]["milestone"]}</td></tr>' for k in ks) + '</table>'
    half = (len(prop) + 1) // 2; pl = f'<div class="two2"><div>{_tbl(prop[:half])}</div><div>{_tbl(prop[half:])}</div></div>'
    nm, nt = au['modules_total'], au['modules_with_task_plan']
    prose = ', '.join(esc_(names.get(k, k)) for k in au['gaps']['api_in_prose_only'])
    return f'''
{sec(26,'সম্পূর্ণ প্রকাশ (সিদ্ধান্ত D45): প্রকাশ্য প্রকাশ হবে সম্পূর্ণ পরিকল্পনা নিয়ে','S26')}
<p>আগের সিদ্ধান্ত ছিল "প্রথম সংস্করণ = ১০+ অচেনা স্কুল + চারটি অপরিহার্য ফিচার"। আপনি জানিয়েছেন <b>প্রকাশ হবে সম্পূর্ণ পরিকল্পনা নিয়ে</b>। এখন সেটাই সিদ্ধান্ত (D45): <b>Release 1 হলো প্রথম মাইলস্টোন, প্রকাশের সীমা নয়</b>; চারটি অপরিহার্য ফিচার বহাল ও সম্পূর্ণ প্রকাশের অংশ। <b>প্রকাশ্য বিক্রি শুরু হবে শুধু সব {bn(len(au['milestones']))}টি ধাপ গৃহীত হলে।</b></p>
<table class="t small"><tr><th style="width:42%">বদলাল</th><th>বদলাল না</th></tr>
<tr><td>প্রকাশ্য বিক্রির দরজা — সব ধাপ শেষ না হলে নয়</td><td><b>নির্মাণ-ক্রম:</b> নির্ভরতা মেনে M1 → M2 → … (R1 ছাড়া R3 বানানো যায় না)</td></tr>
<tr><td>R1-এর "চারটি ফিচার" আর প্রকাশের সীমা নয়</td><td>মডিউল-গেট, রিলিজ-গেট, এজেন্টের গার্ড; সরকারি/এমপিও ঐচ্ছিক</td></tr>
<tr><td>চূড়ান্ত দরজা গার্ডে বাধ্য: <span class="mono">Release: FULL</span> শুধু তখনই চলে যখন সব ধাপের গ্রহণ <span class="mono">PROGRESS.md</span>-এ <span class="mono">[x]</span></td><td>আমন্ত্রিত বন্ধ-বিটা যেকোনো ধাপে সম্ভব — তা প্রকাশ্য প্রকাশ নয়</td></tr></table>
<h3>আটটি নির্মাণ-ধাপ</h3>
<table class="t small"><tr><th style="width:6%">ধাপ</th><th>কী</th><th style="width:8%">রিলিজ</th><th style="width:13%">মডিউল</th><th style="width:9%">ফিচার</th><th style="width:20%">কাজ-পরিকল্পনা</th></tr>{rows}</table>
<h3>প্রস্তুতি-নিরীক্ষা: পরিকল্পনা কতটা তৈরি</h3>
<div class="warn"><b>এখনই বানানোর মতো পূর্ণ কাজ-পরিকল্পনা আছে {bn(nt)} / {bn(nm)} মডিউলের</b> (M1 = R1 এবং M4 = R3)। বাকি <b>{bn(nm - nt)}টির কাজ-তালিকা খসড়া</b> — প্রতিটির শেষ-শর্ত সাধারণ, R3-এর মতো নির্দিষ্ট নয়। এগুলো ধাপ শুরুর আগে মালিকের সাথে পরিশীলন করে পূর্ণ করতে হবে; গার্ড খসড়া-কাজের commit আটকায়, তাই না-পরিশীলিত কিছু ভুলে বানানো শুরু হবে না। {bn(len(au['gaps']['api_in_prose_only']))}টি মডিউলের API শুধু গদ্যে লেখা ({prose}) — route আগে যোগ করতে হবে। ডেটাবেসের {bn(au['tables_total'])}টি টেবিলের {bn(au['tables_in_task_plans'])}টি কাজ-পরিকল্পনায় ধরা; বাকি {bn(au['tables_without_task'])}টির migration-কাজ খসড়া-পর্যায়ে। বাইরের তথ্য-নির্ভর (<span class="mono">OD-…</span>) অংশ {bn(au['external_decisions'])}টি।</div>
<h3>আপনার সিদ্ধান্ত লাগে: {bn(len(prop))}টি মডিউলের ধাপ আমি প্রস্তাব করেছি</h3>
<p>রোডম্যাপে এই মডিউলগুলোর কোনো ধাপ ছিল না। আমার প্রস্তাবিত ধাপ নিচে — আপনি অনুমোদন বা বদল করবেন (OD-full-1)।</p>
{pl}
<h3>ঝুঁকি (সৎভাবে)</h3>
<ul class="b"><li><b>দীর্ঘ সময় কোনো গ্রাহকের প্রতিক্রিয়া নেই</b> — সব ধাপ শেষ না হলে প্রকাশ্য বিক্রি নয়। প্রতিকার: M1 ও M4 শেষে আমন্ত্রিত বন্ধ-বিটা (সুপারিশ, OD-full-2)।</li>
<li><b>বাইরের নথির অপেক্ষা</b> — ব্যাংক, গেটওয়ে, আইনি হার। না এলে ফিচারটি নতুন সিদ্ধান্তে বাদ, অনুমান করে বানানো নয় (OD-full-3)।</li>
<li><b>অতি-প্রতিশ্রুতি</b> — ক্লায়েন্ট-তালিকায় {bn(au['features_total'])}টি ফিচার; এর মধ্যে বেশ কিছুর ধাপ এখনো অনির্ধারিত। ক্লায়েন্ট-PDF-এর <span class="mono">launch_mode</span> সুইচ ও অনুমোদনের আগে খসড়া-জলছাপ এটি সামলায়।</li>
<li><b>সময় ও খরচের কোনো অনুমান নেই।</b> সম্পূর্ণ প্রকাশ M1 বানানোর অভিজ্ঞতার আগে অনুমান করা যাবে না।</li></ul>
<p class="dim">পূর্ণ বিবরণ: <span class="mono">docs/RELEASE-FULL.md</span> (স্বয়ংক্রিয় তৈরি), <span class="mono">docs/AGENT-PLAN-FULL-DRAFT.md</span> (বাকি ৪১ মডিউলের খসড়া কাজ), <span class="mono">docs/release/full-scope.json</span>।</p>'''

def s27(F):
    import html as _html
    esc_ = _html.escape
    sh = json.loads(S.rd('docs/pricing/selfhosted/settings.json')); doc = S.rd('docs/SELF-HOSTED.md')
    ans = ''.join(f'<tr><td class="c1">{a}</td><td>{S.clean(q)}</td><td><b>{S.clean(r)}</b></td><td>{S.clean(w_)}</td></tr>' for a, q, r, w_ in re.findall(r'^\| (OD-sh-[1-6]|\(অতিরিক্ত\)) \| (.*?) \| (.*?) \| (.*?) \|$', doc, re.M))
    gaps = ''.join(f'<tr><td class="c1">{a}</td><td>{S.clean(b)}</td></tr>' for a, b, c in re.findall(r'^\| (SH-\d+) \| (.*?) \| (.*?) \|$', doc, re.M))
    ods = ''.join(f'<li><b>{a}:</b> {S.clean(b)}</li>' for a, b in re.findall(r'^- \*\*(OD-sh-\d+)[^:]*:\*\* (.*)$', doc, re.M))
    inst = sum(i['price'] for i in sh['install'] if i['required'])
    sched = ' → '.join(f"{x['label']} {bn(x['percent'])}%" for x in sh['payment_schedule'])
    return f'''
{sec(27,'নিজস্ব-সার্ভারে স্থাপন সংস্করণ (সিদ্ধান্ত D46: বিক্রি হবে)','S27')}
<p>আপনি জানিয়েছেন কেউ নিজের সার্ভারে চালাতে চাইলে আলাদা মূল্য-তালিকা লাগবে, আর এই সংস্করণ <b>বিক্রি করা হবে</b>। আমি এটিকে <b>একটি প্রতিষ্ঠানের নিজের সার্ভারে একই সফটওয়্যার বসানো</b> ধরেছি: একবারের লাইসেন্স + স্থাপন + ঐচ্ছিক বার্ষিক রক্ষণাবেক্ষণ (AMC) + কাস্টমাইজেশন + ঐচ্ছিক সোর্স-কোড মালিকানা। ক্লায়েন্ট-PDF: <span class="mono">docs/pricing/Selfhosted-Pricing-bn.pdf</span> (<b>এখনো খসড়া, নমুনা-দাম</b>, জলছাপসহ)।</p>
<h3>আপনার উত্তর ও তার অর্থ</h3>
<table class="t small"><tr><th style="width:9%">#</th><th style="width:20%">প্রশ্ন</th><th style="width:25%">আপনার উত্তর</th><th>অর্থ</th></tr>{ans}</table>
<table class="t small"><tr><th style="width:30%">উপাদান</th><th>নমুনা-কাঠামো (আপনি বদলাবেন)</th></tr>
<tr><td><b>লাইসেন্স (একবার)</b></td><td>সাবস্ক্রিপশনের মাসিক মূল্য × {bn(sh['license_months'])} মাস, প্রতিটি মডিউল আলাদা, সবার জন্য একই (D47: আকার-স্তর নেই); যার যে মডিউল দরকার শুধু সেটুকু; কোনো সংখ্যার সীমা নেই</td></tr>
<tr><td><b>স্থাপন (একবার)</b></td><td>অপরিহার্য অংশ {bn(inst)} টাকা (নমুনা)</td></tr>
<tr><td><b>বার্ষিক AMC (ঐচ্ছিক)</b></td><td>লাইসেন্সের {bn(sh['amc']['percent'])}% (প্রায়োরিটি +{bn(sh['amc']['priority_extra_percent'])}%); প্রথম {bn(sh['amc']['warranty_days'])} দিন ওয়ারেন্টি</td></tr>
<tr><td><b>সোর্স-কোড মালিকানা (ঐচ্ছিক)</b></td><td>লাইসেন্সের {bn(sh['source_ownership_multiple'])} গুণ (নমুনা); শুধু সরাসরি ব্যবহারকারীর কাছে</td></tr>
<tr><td><b>কাস্টমাইজেশন</b></td><td>প্রতি কর্মদিবস {bn(sh['custom_dev']['day_rate'])} টাকা (নমুনা); কোডের মালিকানা আপনার (বিক্রেতার)</td></tr>
<tr><td><b>পরিশোধ</b></td><td>{sched}; প্রতিটি মডিউলের লাইসেন্স-ফি সেই মডিউল স্থাপিত ও গৃহীত হওয়ার পর</td></tr></table>
<div class="warn"><b>সিস্টেমে আজ এই সংস্করণের জন্য কিছুই তৈরি নেই:</b> স্পেকে একক-প্রতিষ্ঠান মোড, লাইসেন্স-তালিকা, আপগ্রেড-পদ্ধতি, ইনস্টলার, অপারেটর-নির্দেশিকা, ক্রেতা-যোগ্যতা-ঘোষণা নেই; স্থাপন-নথি সবই SaaS-অপারেটরের জন্য। বিক্রির সাথে সাথে নিচের দশটি কাজ বানাতে হবে। <b>সম্পূর্ণ প্রকাশের আগেই বিক্রি করলে চুক্তি অসম্পূর্ণ পণ্যের উপর হয়</b> — আপনি এই ঝুঁকি নিয়েছেন (D46)। সময় ও খরচের কোনো অনুমান নেই।</div>
<div class="keep"><table class="t small"><tr><th style="width:9%">কাজ</th><th>কী বানাতে হবে</th></tr>{gaps}</table></div>
<h3>D46-এর পরেও যা খোলা</h3><ul class="b">{ods}</ul>
<div class="honest"><b>একটি জটিলতা:</b> আপনি সোর্স-কোড <b>মালিকানা</b> বিক্রি করবেন, অথচ ডেভেলপারের কাছে বিক্রি করবেন না। আইনত মালিকানা মানে সাধারণত পুনর্বিক্রির অধিকারও। তাই "ডেভেলপার নয়" শুধু চুক্তির ক্রেতা-যোগ্যতা ও পুনর্বিক্রি-নিষেধ ধারায় দাঁড়াবে, আর আপনার প্রয়োগ কম কঠোর হওয়ায় বাস্তবে তা মূলত বিশ্বাসের উপর। আইনজীবীকে এটি আগে ঠিক করাতে বলুন (OD-sh-7)।</div>
<p class="dim">পূর্ণ বিবরণ ও ঝুঁকি: <span class="mono">docs/SELF-HOSTED.md</span> — ক্লায়েন্টকে দেবেন না।</p>'''

def s28(F):
    import html as _html
    esc_ = _html.escape
    doc = S.rd('docs/PRICING-MODEL.md')
    sec_conf = re.search(r'^## [^\n]*সংঘাত[^\n]*\n(.*?)(?=^## |^> )', doc, re.S | re.M).group(1)
    conf = ''.join(f'<tr><td>{S.clean(a)}</td><td>{S.clean(b)}</td><td>{S.clean(c_)}</td></tr>' for a, b, c_ in re.findall(r'^\| (.*?) \| (.*?) \| (.*?) \|$', sec_conf, re.M) if not a.startswith(('কোথায়', '---')))
    pm = ''.join(f'<tr><td class="c1">{a}</td><td>{S.clean(b)}</td></tr>' for a, b, c_ in re.findall(r'^\| (PM-\d) \| (.*?) \| (.*?) \|$', doc, re.M))
    ods = ''.join(f'<li><b>{a}:</b> {S.clean(b)}</li>' for a, b in re.findall(r'^- \*\*(OD-pm-\d):\*\* (.*)$', doc, re.M))
    return f'''
{sec(28,'মূল্য-মডেল (সিদ্ধান্ত D47): আকার-স্তর নেই, যেকোনো একটি মডিউল, সীমা নেই','S28')}
<p>আপনি জানিয়েছেন: <b>ছোট স্কুল/বড় স্কুল বলে কিছু থাকবে না;</b> ব্যবহারকারী যেকোনো একটি মডিউল নিতে পারবে — সাবস্ক্রিপশনে, অথবা ঐ মডিউলের কোড নিজের সার্ভারে ডেপ্লয় করিয়ে; আর <b>ঐ মডিউলের জন্য কোনো স্টোরেজ বা সংখ্যার সীমা নেই।</b> এখন এটাই সিদ্ধান্ত (D47)। দুই ক্লায়েন্ট-PDF ও গণনা এই মডেলে বদলেছে (প্রতিটি মডিউলের একটি মূল্য, সবার জন্য এক)।</p>
<div class="note"><b>আমার একটি স্পষ্টীকরণ — আপনি নিশ্চিত করবেন (OD-pm-1):</b> "সীমা নেই" আমাদের দিকের সীমা (ছাত্র, ব্যবহারকারী, ফাইল, স্টোরেজ)। <b>SMS-ক্রেডিট, অনলাইন-পেমেন্টের গেটওয়ে-ফি ও AI-ব্যবহার সীমাহীন করা যায় না</b> — সেগুলোর খরচ তৃতীয় পক্ষের; তাই আলাদা, ব্যবহার-ভিত্তিক। আর কিছু মডিউল অন্য মডিউল ছাড়া চলে না (যেমন অনলাইন-পেমেন্টের সাথে ফি-মডিউল) — মূল্য-তালিকায় "এর সাথে লাগে" লেখা; তালিকাটি আমার প্রস্তাব, প্রকৌশল-নিশ্চিতকরণ বাকি।</div>
<h3>স্পেকের সাথে সংঘাত — যা বাতিল বা পুনর্লিখন লাগবে</h3>
<table class="t small"><tr><th style="width:26%">কোথায়</th><th>সংঘাত</th><th style="width:26%">Release 1-এ এখন</th></tr>{conf}</table>
<div class="warn"><b>R1 এখন সম্পূর্ণ হতে পারবে না:</b> ধাপ ৫.১ (সাইন-আপ) ও ৫.২ (সাবস্ক্রিপশন-বিলিং) অবরুদ্ধ; গার্ড এগুলোর commit আটকায়। মডিউল-ভিত্তিক সাবস্ক্রিপশনের স্পেক (PM-1) লিখে আপনার অনুমোদনের পর অবরোধ উঠবে। এটি ইচ্ছাকৃত — বাতিল-হওয়া plan-মডেল ভুলে বানানো ঠেকাতে। ধাপ ২.২ ও ৪.২ থেকে শুধু সীমা-অংশ বাদ।</div>
<h3>বানাতে/লিখতে হবে (খসড়া)</h3>
<table class="t small"><tr><th style="width:9%">কাজ</th><th>কী</th></tr>{pm}</table>
<h3>আপনার সিদ্ধান্ত লাগে</h3><ul class="b">{ods}</ul>
<div class="honest"><b>ঝুঁকি (আপনি গ্রহণ করেছেন):</b> সীমাহীন স্টোরেজ ও সংখ্যা মানে <b>অনিয়ন্ত্রিত খরচ</b> — একটি বড় ক্লায়েন্ট ছোট মডিউলের দামে অনেক সম্পদ ব্যবহার করতে পারে। "যেকোনো একটি মডিউল" মানে মডিউল-স্বাধীনতা ও মডিউল-ধরে কোড-প্যাকেজ — আজকের মনোলিথ-নকশায় বড় প্রকৌশল-কাজ। সময় ও খরচের কোনো অনুমান নেই। পূর্ণ বিবরণ: <span class="mono">docs/PRICING-MODEL.md</span> (অভ্যন্তরীণ)।</div>'''
