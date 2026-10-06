#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
docs/pricing/build_client_pdf.py - the CLIENT-facing feature and price list (Bengali PDF).
Inputs (edit these, never the PDF):   docs/pricing/modules.csv   one row per module: category, client name, size class A/B/C, optional own price, description
                                      docs/pricing/settings.json size tiers, class prices, one-time fees, usage items, terms, example bundles, "approved"
Facts it reads (never typed here):    which institution types get which module, and in which step of the roadmap a module arrives (docs/owner-guide/content_c.py <- docs/release/*.json)
    python3 docs/pricing/build_client_pdf.py            build  docs/pricing/Client-Features-and-Pricing-bn.pdf
    python3 docs/pricing/build_client_pdf.py --check    no browser: validates the inputs and the arithmetic (verify.py runs this)
While settings.json has  "approved": false  every page carries a DRAFT watermark and the sample-price warning.
"""
import os, re, sys, json, html as _h
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, 'docs', 'owner-guide'))
import pricing_calc as P
import content_c as C
CHROME = '/opt/google/chrome/chrome'
OUT = os.path.join(HERE, 'Client-Features-and-Pricing-bn.pdf')
BN = str.maketrans('0123456789', '০১২৩৪৫৬৭৮৯')
def bn(x): return str(x).translate(BN)
def grp(n):
    s = str(int(n))
    if len(s) <= 3: return s
    head, tail = s[:-3], s[-3:]; parts = []
    while len(head) > 2: parts.insert(0, head[-2:]); head = head[:-2]
    if head: parts.insert(0, head)
    return ','.join(parts + [tail])
def tk(n, S): return f"{S['currency']}{bn(grp(n))}"
esc = _h.escape
PHASE = {'R1': 'প্রথম সংস্করণে', 'R1.1': 'প্রথম সংস্করণের পর', 'R1.1+': 'প্রথম সংস্করণের পর', 'R2': 'দ্বিতীয় ধাপে', 'R2+': 'দ্বিতীয় ধাপে', 'R3': 'তৃতীয় ধাপে', 'R4': 'চতুর্থ ধাপে'}
TYPE_NAMES = [('school', 'স্কুল'), ('college', 'কলেজ'), ('coaching', 'কোচিং'), ('private_batch', 'ব্যাচ')]
BUILD_CSS = re.search(r"CSS = r'''(.*?)'''", open(os.path.join(ROOT, 'docs/owner-guide/build_pdf.py'), encoding='utf-8').read(), re.S).group(1)
EXTRA_CSS = r'''
.feat{columns:2;column-gap:20px;margin:2px 0 2px 14px;padding:0;font-size:11.6px;line-height:1.5}.feat li{break-inside:avoid;margin:1px 0}.ft{color:var(--w);font-size:.88em;white-space:nowrap}
tr.frow td{background:#F8FBFE!important;padding:3px 10px 9px!important;border-top:none!important}tbody.mod{break-inside:avoid}
.big{font-size:15px;color:var(--p);font-weight:700}
.wm{position:fixed;top:36%;left:-8%;width:116%;text-align:center;font-family:'BNS','FreeSerif',serif;font-size:84px;font-weight:700;color:rgba(200,30,30,.11);transform:rotate(-28deg);z-index:9999;pointer-events:none;line-height:1.1}
.draftbox{border:2px solid #B91C1C;background:#FEF2F2;color:#7F1D1D;border-radius:8px;padding:9px 13px;margin:12px 0;font-size:12.5px;break-inside:avoid}
.price{text-align:right;white-space:nowrap;font-weight:700;color:var(--p)}.dim{color:var(--mu);font-size:.9em}
table.f td.dot{text-align:center;color:var(--p);font-weight:700;width:5.5%;padding:5px 2px}table.f th{text-align:center}
.tot td{background:#E8F1FB!important;font-weight:700}.tot2 td{background:#E7F5F3!important;font-weight:700}
.coverband{background:var(--p);color:#fff;padding:30px 88px 34px;margin:0 -16mm 18px}.cv1{opacity:.85;font-size:13px}.cv2{font-family:'BNS','FreeSerif',serif;font-size:37px;font-weight:700;line-height:1.25;margin:10px 0 4px}.cv3{font-size:19px;opacity:.95}
.pill{display:inline-block;background:#E8F1FB;color:var(--p);border-radius:20px;padding:1px 9px;font-size:.85em;margin-right:4px}
'''

PH_ORDER = ['R1', 'R1.1', 'R2', 'R3', 'R4', 'L']
PHASE['L'] = 'পরবর্তী ধাপে (সময় নির্ধারিত নয়)'
def _norm_phase(x):
    x = {'R1.1+': 'R1.1', 'R2+': 'R2'}.get(x, x)
    return x if x in PH_ORDER else 'L'

_RT = None
def routes_ctx():
    """(route key -> controller, controllers set, planned-in-Release-1 route keys, controller -> release label). Read from the routes template and the generated R1 plan; nothing typed here."""
    global _RT
    if _RT: return _RT
    sv = os.path.join(ROOT, 'infra', 'spec-verify')
    if sv not in sys.path: sys.path.insert(0, sv)
    _argv = sys.argv; sys.argv = [_argv[0], ROOT]
    try: import gen_agent_plan as G
    finally: sys.argv = _argv
    norm = lambda v, p: f"{v} {re.sub(r'/+$', '', p) or '/'}"
    r2c = {}; ctrls = {}
    for v, p, c, a, r, m in G.ALL_ROUTES: r2c[norm(v, p)] = c; ctrls.setdefault(c, set()).add(norm(v, p))
    r1 = set()
    for t_ in json.load(open(os.path.join(ROOT, 'docs/release/r1-plan.json'), encoding='utf-8'))['tasks']:
        for r in t_['routes']:
            m = re.match(r'(\w+) (\S+) ->', r)
            if m: r1.add(norm(m.group(1), m.group(2)))
    labels = {c: x['release'] for c, x in json.load(open(os.path.join(ROOT, 'docs/release/r1-scope.json'), encoding='utf-8'))['controllers'].items()}
    _RT = (r2c, ctrls, r1, labels); return _RT

def resolve(ev, explicit):
    """-> (phase, [problems]). route/ctrl evidence DERIVES the phase (Release 1 only if the route is planned for Release 1); doc/menu evidence needs an explicit phase and can never claim Release 1."""
    r2c, ctrls, r1, labels = routes_ctx(); probs = []; ph = []; docs = 0
    for tok in [x.strip() for x in ev.split(';') if x.strip()]:
        kind, _, val = tok.partition(':')
        if kind == 'route':
            if val not in r2c: probs.append(f'route not in the routes template: {val}'); continue
            c = r2c[val]; ph.append('R1' if val in r1 else ('L' if labels.get(c, 'L') == 'R1' else _norm_phase(labels.get(c, 'L'))))
        elif kind == 'ctrl':
            if val not in ctrls: probs.append(f'controller not in the routes template: {val}'); continue
            ph.append('R1' if ctrls[val] & r1 else ('L' if labels.get(val, 'L') == 'R1' else _norm_phase(labels.get(val, 'L'))))
        elif kind == 'doc':
            docs += 1
            if not (os.path.exists(os.path.join(ROOT, 'docs', 'modules', val)) or os.path.exists(os.path.join(ROOT, 'docs', val))): probs.append(f'spec file not found: {val}')
        else: probs.append(f'unknown evidence kind: {tok}')
    if ph: return min(ph, key=PH_ORDER.index), probs
    if docs:
        if explicit not in PH_ORDER: probs.append(f'doc-only evidence needs a phase ({PH_ORDER}), got "{explicit}"')
        elif explicit == 'R1': probs.append('doc-only evidence can not claim Release 1 (needs a planned Release 1 route)')
        return (explicit if explicit in PH_ORDER else 'L'), probs
    return 'L', probs + ['no evidence']

def load_features():
    import csv
    rows = list(csv.DictReader(open(os.path.join(HERE, 'features.csv'), encoding='utf-8-sig')))
    return rows

def facts():
    S, mods = P.load(); cm, it, scope, rel, led, prop = C.facts()
    index = {r[0].strip('`'): r for r in cm}
    return S, mods, it, scope, index

def phase_of(index, scope, key):
    r = C.module_release(index[key], scope, None) or ''
    return r, PHASE.get(r, PHASE['L'])

def build_html(S=None, mods=None, it=None, scope=None, index=None):
    if S is None: S, mods, it, scope, index = facts()
    approved = bool(S.get('approved')); T = S['tiers']; cur = S['currency']; name = esc(S['product_name'])
    complete = S.get('launch_mode', 'complete') == 'complete'; LAUNCH = 'সম্পূর্ণ প্রকাশে'
    feats = load_features(); fbm = {}
    for f in feats: fbm.setdefault(f['module'], []).append(f)
    fph = {id(f): resolve(f['evidence'], f['phase'])[0] for f in feats}
    nF = len(feats); nM = len({f['module'] for f in feats if f['module'] != 'platform'}); nR1 = sum(1 for f in feats if fph[id(f)] == 'R1')
    def req_html(r):
        rq = P.requires_of(r)
        return '' if not rq else '<br><span class="ft">এর সাথে লাগে: ' + ', '.join(esc(mods[x]['name_bn']) for x in rq) + '</span>'
    def feat_html(mkey, mlabel=None):
        lis = []
        for f in fbm.get(mkey, []):
            lab = PHASE[fph[id(f)]]; short = 'পরবর্তী ধাপে' if fph[id(f)] == 'L' else lab; tag = '' if (mlabel is None or lab == mlabel) else f' <span class="ft">({esc(short)})</span>'
            lis.append(f'<li>{esc(f["feature_bn"])}{tag}</li>')
        return '<ul class="feat">' + ''.join(lis) + '</ul>'
    ph = lambda k: phase_of(index, scope, k)
    def avail(k, ty): return '●' if k in it[ty]['modules'] else '–'
    cats = S['categories']; bycat = {c[0]: [r for r in mods.values() if r['category'] == c[0]] for c in cats}
    t1 = T[0]; out = []; w = out.append
    wm = '' if approved else '<div class="wm">খসড়া — নমুনা মূল্য</div>'
    # ---------------- cover
    ct = S['contact']
    w(f'''<div class="coverband"><div class="cv1">প্রতিষ্ঠানের জন্য প্রস্তাবনা</div><div class="cv2">{name}</div><div class="cv3">ফিচার ও মূল্য-তালিকা</div></div>
<p style="font-size:15px"><b>হাজিরা ও অনুপস্থিতির SMS</b> · <b>ফি আদায় ও রসিদ</b> · <b>পরীক্ষা ও মার্কশিট</b> · <b>অভিভাবক-পোর্টাল</b> — স্কুল, কলেজ, কোচিং সেন্টার ও প্রাইভেট ব্যাচের জন্য একটি সিস্টেম। <b>আপনি শুধু যে ফিচারগুলো দরকার, সেগুলোর দাম দেন।</b></p>''')
    w(f'<p class="big">{bn(nF)}টি ফিচার · {bn(nM)}টি মডিউল' + (' — সবই একসাথে সম্পূর্ণ প্রকাশে' if complete else f' — এর মধ্যে প্রথম সংস্করণেই {bn(nR1)}টি') + '</p>')
    w('<div class="note"><b>যেকোনো একটি মডিউল আলাদাভাবে নিতে পারেন।</b> মূল্য সবার জন্য একই। ছাত্র, ব্যবহারকারী বা স্টোরেজের কোনো সীমা নেই।</div>')
    if not approved: w('<div class="draftbox"><b>খসড়া — মূল্য অনুমোদিত নয়।</b> এই তালিকার সব টাকার অঙ্ক <b>নমুনা</b>: বাজার-গবেষণা বা প্রতিযোগী-তুলনার ভিত্তিতে নয়, শুধু কাঠামো ও হিসাব দেখানোর জন্য। প্রকৃত মূল্য নির্ধারণের পর এই সতর্কতা ও জলছাপ থাকবে না।</div>')
    w(f'<div class="note">{esc(S["complete_launch_note"] if complete else S["availability_note"])}</div>')
    if S.get('valid_until'): w(f'<p class="dim">এই মূল্য-তালিকা {esc(S["valid_until"])} পর্যন্ত বৈধ।</p>')
    # ---------------- 1 overview
    w('<h1 class="sec"><span class="num">১</span>আপনি কী পাবেন</h1>')
    w('<p>প্রতিদিনের চারটি জরুরি কাজ দিয়ে শুরু; বাকি ফিচার দরকার মতো যোগ করবেন।</p>')
    w('<table class="t"><tr><th style="width:26%">কাজ</th><th>কীভাবে সাহায্য করে</th></tr>'
      '<tr><td><b>হাজিরা ও SMS</b></td><td>শিক্ষক শ্রেণি ধরে হাজিরা নেন; অনুপস্থিত ছাত্রের অভিভাবকের কাছে SMS যায়।</td></tr>'
      '<tr><td><b>ফি ও রসিদ</b></td><td>ফি-খাত ঠিক করা, বকেয়া হিসাব, একসাথে একাধিক খাতের রসিদ, মওকুফ ও বিলম্ব-জরিমানা।</td></tr>'
      '<tr><td><b>পরীক্ষা ও মার্কশিট</b></td><td>নম্বর-গ্রহণ, গ্রেড/GPA হিসাব, মেধা-তালিকা ও মার্কশিট ছাপা।</td></tr>'
      '<tr><td><b>অভিভাবক-পোর্টাল</b></td><td>অভিভাবক নিজের সন্তানের হাজিরা, ফি ও ফল দেখেন।</td></tr></table>')
    w('<h3>কে কী করতে পারেন</h3><table class="t small"><tr><th style="width:22%">ভূমিকা</th><th>কী পারেন</th></tr>'
      '<tr><td><b>প্রশাসক</b></td><td>প্রতিষ্ঠানের সব ব্যবস্থাপনা, শিক্ষক/কর্মী যোগ, ফি-খাত ও নীতি ঠিক করা, প্রতিবেদন।</td></tr>'
      '<tr><td><b>হিসাবরক্ষক</b></td><td>ফি আদায়, রসিদ, বকেয়া ও আদায়ের প্রতিবেদন।</td></tr>'
      '<tr><td><b>শিক্ষক</b></td><td>নিজের শ্রেণির হাজিরা ও নম্বর-গ্রহণ।</td></tr>'
      '<tr><td><b>অভিভাবক</b></td><td>শুধু নিজের সন্তানের তথ্য দেখা।</td></tr></table>')
    # ---------------- 2 how price works  (D47: one price per module, no sizes, no limits)
    ex = P.quote(S, mods, ['attendance', 'fees']); exm = {l[0]: l[2] for l in ex['lines']}
    w('<h1 class="sec"><span class="num">২</span>মূল্য কীভাবে হিসাব হয়</h1>')
    w('<ol class="rules"><li><b>প্রতিটি মডিউলের একটি মূল্য,</b> সবার জন্য একই — ছোট বা বড় প্রতিষ্ঠান বলে কোনো ভেদ নেই।</li>'
      '<li><b>যেকোনো একটি মডিউল</b> নিতে পারেন, বা যতগুলো দরকার; পরে আরও যোগ করা যায়। কিছু মডিউল অন্য মডিউল ছাড়া চলে না — সেগুলোর পাশে "এর সাথে লাগে" লেখা (§৪)।</li>'
      '<li><b>ভিত্তি যেকোনো মডিউলের সাথে বিনামূল্যে:</b> ছাত্র-তালিকা, শ্রেণি-শাখা, মৌলিক প্রতিবেদন, লগইন-নিরাপত্তা, সহায়তা (§৩)।</li>'
      '<li><b>কোনো সীমা নেই:</b> ছাত্র, শিক্ষক, ব্যবহারকারী, ব্যাচ বা স্টোরেজের কোনো সংখ্যার সীমা নেই।</li>'
      '<li><b>ব্যবহার-ভিত্তিক খরচ আলাদা:</b> SMS-ক্রেডিট, অনলাইন-পেমেন্টের গেটওয়ে-ফি ও AI-ব্যবহার (§৭)।</li>'
      '<li><b>একবারের সেবা:</b> সেটআপ, প্রশিক্ষণ, পুরনো তথ্য আনা (§৬)।</li></ol>')
    w(f'<div class="note"><b>উদাহরণ:</b> হাজিরা ও ফি নিলে মাসে = হাজিরা {tk(exm["attendance"], S)} + ফি {tk(exm["fees"], S)} = <b>{tk(ex["monthly"], S)}</b> (SMS-ক্রেডিট আলাদা)। বার্ষিক অগ্রিম দিলে {bn(S["annual_discount_percent"])}% ছাড়ে বছরে <b>{tk(ex["annual"], S)}</b>।{"" if approved else " <span class=dim>(নমুনা-সংখ্যা)</span>"}</div>')
    w('<p>নিজের সার্ভারে নিতে চাইলে একই মডিউলের কোড নেওয়ার আলাদা লাইসেন্স-তালিকা আছে।</p>')
    # ---------------- 3 foundation + no limits
    w('<h1 class="sec"><span class="num">৩</span>ভিত্তি ও সীমাহীন ব্যবহার</h1>')
    w(f'<div class="note"><b>কোনো সীমা নেই।</b> {esc(S["unlimited_note"])}</div>')
    w('<h3>ভিত্তিতে যা আছে (যেকোনো মডিউলের সাথে বিনামূল্যে)</h3>')
    for r in bycat.get('base', []):
        rel, lab = ph(r['key']); w(f'<p style="margin:8px 0 2px"><b>{esc(r["name_bn"])}</b> <span class="dim">— {esc(r["desc_bn"])}</span></p>' + feat_html(r['key'], None if complete else lab))
    w('<p style="margin:8px 0 2px"><b>প্ল্যাটফর্ম ও নিরাপত্তা</b> <span class="dim">— লগইন, নিরাপত্তা, সেটিং, ভাষা, থিম, অডিট</span></p>' + feat_html('platform', None if complete else PHASE['R1']))
    # ---------------- 4 each feature
    w('<h1 class="sec"><span class="num">৪</span>প্রতিটি ফিচার ও তার মূল্য</h1>')
    w('<p>● = সেই ধরনের প্রতিষ্ঠানে পাওয়া যায়। <b>মূল্য মডিউল-পিছু, মাসিক — সবার জন্য একই;</b> মডিউলের নিচে লেখা <b>সব ফিচারই মূল্যের মধ্যে</b>।' + ('' if complete else ' কোনো ফিচারের পাশে আলাদা ধাপের নাম থাকলে সেটি মডিউলের বাকিগুলোর পরে আসবে।') + '</p>')
    n = 0
    for cid, ctitle, cnote in cats:
        rs = bycat.get(cid, [])
        if not rs or cid == 'base': continue
        n += 1
        head = ''.join(f'<th style="width:6%">{d}</th>' for _, d in TYPE_NAMES)
        body = ''
        for r in rs:
            k = r['key']; rel, phase = ph(k); p1 = P.module_price(S, r)
            if complete: phase = LAUNCH
            body += (f'<tbody class="mod"><tr><td><b>{esc(r["name_bn"])}</b><br><span class="dim">{esc(r["desc_bn"])}</span>{req_html(r)}</td>' + ''.join(f'<td class="dot">{avail(k, ty)}</td>' for ty, _ in TYPE_NAMES) +
                     f'<td class="dim">{esc(phase)}</td><td class="price">{tk(p1, S)}</td></tr>'
                     f'<tr class="frow"><td colspan="7">{feat_html(k, None if complete else phase)}</td></tr></tbody>')
        w(f'<h3>{bn(n)}. {esc(ctitle)}</h3><table class="t small f"><tr><th>ফিচার</th>{head}<th style="width:15%">কখন পাবেন</th><th style="width:16%">মূল্য / মাস</th></tr>{body}</table>')
    # ---------------- 5 bundles
    w('<h1 class="sec"><span class="num">৫</span>নমুনা-প্যাকেজ</h1><p>উদাহরণ মাত্র — আপনার প্রয়োজনের মডিউলগুলো মিলিয়ে নিন। প্রতিষ্ঠান যত বড়ই হোক, মূল্য একই।</p>')
    for b in S['bundles']:
        q = P.quote(S, mods, b['modules']); body = ''; now = 0
        for k, nm, pr, inc, added in q['lines']:
            rel, phase = ph(k); now += pr if rel == 'R1' else 0
            if complete: phase = LAUNCH
            tag = ' <span class="ft">(সঙ্গী মডিউল — এটি ছাড়া চলে না)</span>' if added else ''
            body += f'<tr><td>{esc(nm)}{tag}</td><td class="dim">{esc(phase)}</td><td class="price">{tk(pr, S)}</td></tr>'
        d = int(S['annual_discount_percent'])
        w(f'<h3>{esc(b["name"])}</h3><table class="t small"><tr><th>মডিউল</th><th style="width:22%">কখন পাবেন</th><th style="width:20%">মাসিক</th></tr>{body}'
          f'<tr class="tot"><td colspan="2">সব মডিউল চালু হলে মাসিক মোট</td><td class="price">{tk(q["monthly"], S)}</td></tr>'
          + ('' if complete else f'<tr class="tot2"><td colspan="2">প্রথম সংস্করণে (শুধু যা এখন প্রকাশযোগ্য) মাসিক</td><td class="price">{tk(now, S)}</td></tr>') +
          f'<tr><td colspan="2">বার্ষিক অগ্রিম ({bn(d)}% ছাড়ের পর)</td><td class="price">{tk(q["annual"], S)}</td></tr></table>')
    w('<p class="dim">যে মডিউল এখনো প্রকাশিত নয়, তার বিল হয় না — প্রকাশের পর আপনি চাইলে চালু করবেন।</p>')
    # ---------------- 6 one-time
    w('<h1 class="sec"><span class="num">৬</span>একবারের সেবা</h1>')
    w('<table class="t"><tr><th>সেবা</th><th style="width:20%">কখন</th><th style="width:20%">মূল্য</th></tr>' + ''.join(f'<tr><td>{esc(o["name"])}</td><td class="dim">{esc(o["when"])}</td><td class="price">{tk(o["price"], S)}</td></tr>' for o in S['one_time']) + '</table>')
    # ---------------- 7 usage
    w('<h1 class="sec"><span class="num">৭</span>ব্যবহার-ভিত্তিক খরচ</h1>')
    rows = ''
    for k, u in S['usage'].items():
        pr = tk(u['price_per_unit'], S) if u['price_per_unit'] is not None else 'চুক্তির পর নির্ধারিত'
        rows += f'<tr><td><b>{esc(u["label"])}</b><br><span class="dim">{esc(u["note"])}</span></td><td class="price">{pr}</td></tr>'
    w(f'<table class="t"><tr><th>খরচ</th><th style="width:26%">মূল্য</th></tr>{rows}</table>')
    # ---------------- 8 terms
    w('<h1 class="sec"><span class="num">৮</span>বিল ও শর্ত' + ('' if approved else ' (খসড়া)') + '</h1><ul class="b">' + ''.join(f'<li>{esc(t)}</li>' for t in S['terms']) + '</ul>')
    # ---------------- 9 security
    w('<h1 class="sec"><span class="num">৯</span>তথ্যের নিরাপত্তা ও গোপনীয়তা</h1><ul class="b">'
      '<li><b>প্রতিষ্ঠান-ভিত্তিক আলাদা তথ্য:</b> প্রতিটি প্রতিষ্ঠানের তথ্য আলাদা; এক প্রতিষ্ঠান অন্যের তথ্য দেখতে পায় না — এটি সিস্টেমের নকশায় বাধ্যতামূলক।</li>'
      '<li><b>ভূমিকা-ভিত্তিক প্রবেশাধিকার:</b> অভিভাবক শুধু নিজের সন্তানের তথ্য দেখেন; শিক্ষক শুধু নিজের ক্লাস ও নিজের বেতন।</li>'
      '<li><b>বেতন-তথ্য সংবেদনশীল:</b> প্ল্যাটফর্মের সহায়তা-কর্মীরাও আপনার প্রতিষ্ঠানের বেতন-তথ্য দেখতে পান না।</li>'
      '<li><b>শিশুদের তথ্য:</b> প্রয়োজনের বেশি সংগ্রহ নয়; অভিভাবকের সম্মতি-নথি; প্রয়োজনে তথ্য মুছে ফেলার ব্যবস্থা।</li>'
      '<li><b>লগইন:</b> শক্ত পাসওয়ার্ড-নীতি, এককালীন কোড (OTP), সেশনের মেয়াদ।</li></ul>'
      '<p class="dim">এগুলো সিস্টেমের নকশা-লক্ষ্য; প্রথম সংস্করণ প্রকাশের আগে স্বতন্ত্র পরীক্ষা ও আইনজীবীর যাচাইয়ের পর শর্ত ও গোপনীয়তা-নীতি প্রকাশিত হবে।</p>')
    # ---------------- 10 roadmap
    w('<h1 class="sec"><span class="num">১০</span>কখন কী পাবেন</h1>')
    if complete: w('<p><b>সব মডিউল একসাথে বাণিজ্যিক প্রকাশে।</b> তার আগে আমন্ত্রিত বিটা-প্রতিষ্ঠানগুলো নিচের ধাপ-ক্রমে আগে পাবে; ধাপগুলো ক্রম মাত্র, কোনো তারিখের প্রতিশ্রুতি নয়।</p>')
    groups = [('প্রথম সংস্করণে', ['R1']), ('প্রথম সংস্করণের পর', ['R1.1', 'R1.1+']), ('দ্বিতীয় ধাপে', ['R2', 'R2+']), ('তৃতীয় ধাপে — টাকা ও মানুষ', ['R3']), ('চতুর্থ ধাপে', ['R4']), ('পরিকল্পনাধীন', ['', 'R5', 'R6', 'R7', None])]
    rows = ''
    for gname, rels in groups:
        ks = [r['name_bn'] for k, r in mods.items() if r['category'] != 'base' and (C.module_release(index[k], scope, None) or '') in [x or '' for x in rels]]
        if gname == 'প্রথম সংস্করণে': ks = ['ভিত্তি (ছাত্র, শ্রেণি-শাখা, প্রতিবেদন, অভিভাবক-পোর্টাল)'] + ks
        if ks: rows += f'<tr><td><b>{esc(gname)}</b></td><td>{esc(" · ".join(ks))}</td></tr>'
    cnts = {k: sum(1 for f in feats if fph[id(f)] == k) for k in PH_ORDER}
    crow = ''.join(f'<tr><td>{esc(PHASE[k])}</td><td class="price">{bn(cnts[k])}টি ফিচার</td></tr>' for k in PH_ORDER if cnts[k])
    w(f'<table class="t small"><tr><th style="width:24%">ধাপ</th><th>মডিউল</th></tr>{rows}</table><h3>{'বিটার ধাপ অনুযায়ী ফিচার-সংখ্যা' if complete else 'ফিচার-সংখ্যা ধাপ অনুযায়ী'} (মোট {bn(nF)}টি)</h3><table class="t small"><tr><th>ধাপ</th><th style="width:30%">ফিচার</th></tr>{crow}</table><p class="dim">ধাপগুলো ক্রম মাত্র; কোনো নির্দিষ্ট তারিখের প্রতিশ্রুতি নয়। ফিচারের ধাপ নির্ধারিত হয় স্পেকের পরিকল্পিত ধাপ থেকে।</p>')
    # ---------------- 11 FAQ
    w('<h1 class="sec"><span class="num">১১</span>সাধারণ প্রশ্ন</h1><table class="t small">'
      '<tr><td style="width:30%"><b>মোবাইলে চলে?</b></td><td>হ্যাঁ, মোবাইলের ব্রাউজারেই চলে। আলাদা মোবাইল-অ্যাপ পরিকল্পনাধীন।</td></tr>'
      '<tr><td><b>ইন্টারনেট লাগে?</b></td><td>হ্যাঁ, এটি ইন্টারনেট-ভিত্তিক সিস্টেম।</td></tr>'
      '<tr><td><b>পুরনো ছাত্র-তালিকা আনা যায়?</b></td><td>Excel থেকে আনা যায়; আনার আগে যাচাই (কোথায় ভুল তা দেখা) এবং ভুল হলে ফেরত নেওয়ার ব্যবস্থা আছে।</td></tr>'
      '<tr><td><b>SMS কীভাবে কাজ করে?</b></td><td>প্রি-পেইড SMS-ক্রেডিট কিনে রাখেন; অনুপস্থিতি ইত্যাদিতে স্বয়ংক্রিয় SMS যায়। বাংলা বার্তায় অক্ষর কম ধরে বলে একটি বড় বার্তা একাধিক SMS গণ্য হতে পারে।</td></tr>'
      '<tr><td><b>ছাত্র, ব্যবহারকারী বা স্টোরেজের সীমা আছে?</b></td><td>না — যে মডিউল নেবেন তার জন্য কোনো সংখ্যার সীমা নেই। শুধু SMS-ক্রেডিট, গেটওয়ে-ফি ও AI-ব্যবহার আলাদা, ব্যবহার-ভিত্তিক।</td></tr>'
      '<tr><td><b>শুধু একটি মডিউল নেওয়া যায়?</b></td><td>হ্যাঁ। কোনো মডিউলের সাথে আরেকটি লাগলে মূল্য-তালিকায় "এর সাথে লাগে" লেখা আছে।</td></tr>'
      '<tr><td><b>নিজের সার্ভারে নেওয়া যায়?</b></td><td>হ্যাঁ — মডিউলের কোড নিজের সার্ভারে নেওয়ার আলাদা লাইসেন্স-তালিকা আছে।</td></tr>'
      '<tr><td><b>মেয়াদ-শেষে ফি না দিলে?</b></td><td>নির্দিষ্ট অতিরিক্ত সময় (grace) দেওয়া হয়; তারপর সেবা বন্ধ হলেও আপনার তথ্য মুছে ফেলা হয় না।</td></tr>'
      '<tr><td><b>অভিভাবক কী দেখেন?</b></td><td>নিজের সন্তানের হাজিরা, ফি-রসিদ ও ফল (এবং নোটিশ, যখন ওই ফিচার আসবে)।</td></tr></table>')
    # ---------------- 12 contact
    c = lambda v, ph: esc(v) if v else f'<span class="dim">[{ph}]</span>'
    w(f'<h1 class="sec"><span class="num">১২</span>যোগাযোগ</h1><p>ফোন: {c(ct.get("phone"), "ফোন নম্বর")}<br>ইমেইল: {c(ct.get("email"), "ইমেইল")}<br>ওয়েবসাইট: {c(ct.get("web"), "ওয়েবসাইট")}<br>ঠিকানা: {c(ct.get("address"), "ঠিকানা")}</p>')
    foot = f'{name} — ফিচার ও মূল্য-তালিকা' + ('' if approved else ' — খসড়া, মূল্য অনুমোদিত নয়')
    return f'<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>{name} — ফিচার ও মূল্য-তালিকা{"" if approved else " (খসড়া)"}</title><style>{BUILD_CSS}{EXTRA_CSS}</style></head><body>{wm}{"".join(out)}</body></html>', foot

def render(html, foot, path):
    from playwright.sync_api import sync_playwright
    FOOT = ('<div style="width:100%;font-size:9px;font-family:FreeSans;color:#64748B;padding:0 16mm;display:flex;justify-content:space-between;border-top:1px solid #CBD5E1;padding-top:3px">'
            f'<span>{esc(foot)}</span><span>পৃষ্ঠা <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>')
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox']); pg = b.new_page(); pg.set_content(html, wait_until='load')
        pg.pdf(path=path, format='A4', print_background=True, margin=dict(top='15mm', bottom='17mm', left='16mm', right='16mm'), display_header_footer=True, header_template='<div></div>', footer_template=FOOT); b.close()

def check():
    """no browser: inputs consistent, arithmetic proven twice, watermark behaviour. Returns a list of problems."""
    S, mods, it, scope, index = facts(); bad = []
    keys = set(mods); real = set(index)
    if keys != real: bad.append(f'modules.csv vs module index: missing {sorted(real - keys)[:4]} unknown {sorted(keys - real)[:4]}')
    cats = {c[0] for c in S['categories']}
    for k, r in mods.items():
        if r['class'] not in S['class_prices']: bad.append(f'{k}: unknown class {r["class"]}')
        if r['category'] not in cats: bad.append(f'{k}: unknown category {r["category"]}')
        if not r['desc_bn'].strip() or not r['name_bn'].strip(): bad.append(f'{k}: empty name or description')
        if r['base_included'] not in ('yes', 'no'): bad.append(f'{k}: base_included must be yes/no')
        if (r['base_included'] == 'yes') != (r['category'] == 'base'): bad.append(f'{k}: base_included and category "base" disagree')
        ov = (r['price_override_monthly'] or '').strip()
        if ov and (not ov.replace('.', '', 1).isdigit()): bad.append(f'{k}: price override "{ov}" is not a number')
    for c in 'ABC':
        if c not in S['class_prices'] or float(S['class_prices'][c]) < 0: bad.append(f'class {c} has no valid price')
    bad += P.structure_problems(S, mods, it)
    if S.get('launch_mode', 'complete') not in ('complete', 'staged'): bad.append('launch_mode must be "complete" or "staged"')
    if not 0 <= float(S['annual_discount_percent']) < 100: bad.append('annual discount must be in [0, 100)')
    for b in S['bundles']:
        for k in b['modules']:
            if k not in mods: bad.append(f'bundle {b["name"]}: unknown module {k}')
            elif k not in it[b['type']]['modules']: bad.append(f'bundle {b["name"]}: module {k} does not exist for institution type {b["type"]}')
    feats = load_features(); fk = set(mods) | {'platform'}; seen = set(); per = {}
    for f in feats:
        if f['module'] not in fk: bad.append(f'features.csv: unknown module {f["module"]}'); continue
        key = (f['module'], f['feature_bn'])
        if key in seen: bad.append(f'features.csv: duplicate feature in {f["module"]}: {f["feature_bn"][:30]}')
        seen.add(key); per[f['module']] = per.get(f['module'], 0) + 1
        if not f['feature_bn'].strip(): bad.append(f'features.csv: empty feature text in {f["module"]}'); continue
        ph, pr = resolve(f['evidence'], f['phase']); bad += [f'features.csv [{f["module"]}] {f["feature_bn"][:28]}: {x}' for x in pr]
        if f['module'] in index:
            mph = _norm_phase(C.module_release(index[f['module']], scope, None) or 'L')
            if f['module'] in mods and mods[f['module']]['base_included'] == 'yes': mph = 'R1'
            if not pr and PH_ORDER.index(ph) < PH_ORDER.index(mph): bad.append(f'features.csv [{f["module"]}] "{f["feature_bn"][:28]}" arrives ({ph}) before its module ({mph})')
    for k in mods:
        if per.get(k, 0) < 3: bad.append(f'module {k} has {per.get(k, 0)} features (at least 3 needed - the list must show what the price buys)')
    if per.get('platform', 0) < 10: bad.append('the platform / security feature list is too short')
    if bad: return bad            # structural problems first: the arithmetic below would crash on them (an unknown class, a text price) instead of explaining them
    try: bad += P.selftest()
    except Exception as e: return bad + [f'price arithmetic failed: {type(e).__name__}: {e}']
    try: h, foot = build_html(S, mods, it, scope, index)
    except Exception as e: return bad + [f'could not build the document: {type(e).__name__}: {e}']
    drafts = ('খসড়া — নমুনা মূল্য' in h)
    if drafts == bool(S.get('approved')): bad.append('the DRAFT watermark must be present exactly when "approved" is false')
    visible = re.sub(r'<style.*?</style>', ' ', h, flags=re.S); visible = _h.unescape(re.sub(r'<[^>]+>', ' ', visible))
    leak = sorted(set(re.findall(r'\bR\d(?:\.\d)?\b|Release|Spike|agent|এজেন্ট|guard|গার্ড|docs/|LOCKED|verify|\bD\d{1,2}\b|\bOD-|PM-\d|আকার-স্তর|ছাত্র-সংখ্যা অনুযায়ী|ছোট স্কুল|বড় স্কুল|ভিত্তি-ফি|ভিত্তি-লাইসেন্স', visible)))
    if leak: bad.append(f'internal wording leaked into the CLIENT document: {leak[:6]}')
    for must in ('কোনো সংখ্যার সীমা নেই', 'আলাদা, ব্যবহার-ভিত্তিক', 'যেকোনো একটি মডিউল', 'এর সাথে লাগে'):
        if must not in visible: bad.append(f'D47 statement missing from the client document: "{must}"')
    if S.get('approved'):
        miss = [x for x in ('phone', 'email') if not S['contact'].get(x)]
        if miss: bad.append(f'approved prices but contact {miss} still empty')
        if not S.get('valid_until'): bad.append('approved prices need "valid_until"')
    return bad

def main():
    if '--check' in sys.argv:
        bad = check(); print('client price list:', 'OK' if not bad else '\n  ' + '\n  '.join(bad)); return 1 if bad else 0
    bad = check()
    if bad: print('REFUSING to build - fix first:\n  ' + '\n  '.join(bad)); return 1
    S, mods, it, scope, index = facts(); h, foot = build_html(S, mods, it, scope, index); render(h, foot, OUT)
    from pypdf import PdfReader
    print(f'wrote {os.path.relpath(OUT, ROOT)}: {len(PdfReader(OUT).pages)} pages; approved={S.get("approved")}')
    return 0

if __name__ == '__main__': sys.exit(main())
