#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
infra/spec-verify/gen_full_release.py - the COMPLETE-release plan (decision D45): everything is generated from files that already exist.
    docs/release/full-scope.json     the eight build milestones, every module's milestone ("derived" from the specs or "proposed" by the assistant), module build dependencies
    docs/modules/README.md           the 56 module keys, their spec files, gating
    docs/templates/laravel-core-files.md   routes            docs/pricing/features.csv   every feature with its evidence
    docs/release/r1-scope.json, r3-scope.json   which modules already have a full task plan
Writes   docs/RELEASE-FULL.md   docs/AGENT-PLAN-FULL-DRAFT.md   docs/release/full-audit.json        Usage: gen_full_release.py [root] [--check]
"""
import os, re, sys, json, collections
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT0 = os.path.abspath(os.path.join(HERE, '..', '..'))
_argv = sys.argv; _root = next((a for a in _argv[1:] if not a.startswith('--')), ROOT0); ROOT = os.path.abspath(_root)
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, 'docs', 'owner-guide')); sys.path.insert(0, os.path.join(ROOT, 'docs', 'pricing'))
sys.argv = [_argv[0], ROOT]
import gen_agent_plan as G
import content_c as C
import build_client_pdf as B
sys.argv = _argv
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
BN = str.maketrans('0123456789', '০১২৩৪৫৬৭৮৯'); bn = lambda x: str(x).translate(BN)

FS = json.loads(rd('docs/release/full-scope.json')); R1S = json.loads(rd('docs/release/r1-scope.json')); R3S = json.loads(rd('docs/release/r3-scope.json'))
cm, IT, SCOPE, REL, LED, PROP = C.facts(); MODS = {r[0].strip('`'): r for r in cm}
FEATS = B.load_features(); fphase = {id(f): B.resolve(f['evidence'], f['phase'])[0] for f in FEATS}
schema = rd('docs/database/schema.sql'); NTABLES = len(re.findall(r'CREATE TABLE', schema))
ROUTES = collections.defaultdict(list)
for v, p, c, a, r, m in G.ALL_ROUTES:
    if m: ROUTES[m].append(f"{v} {re.sub(r'/+$', '', p) or '/'} -> {c}@{a}" + (f' [role:{r}]' if r else ''))
PLAN_MODS = set(R1S['modules']) | set(R3S['modules']) | set(R3S['prerequisites']['modules'])
TASK_PLAN_TABLES = len(R1S['tables']) + len(R3S['tables']) + len(R3S['prerequisites']['tables'])

_NONE = dict(milestone='M?', basis='missing')
def plc(k): return FS['modules'].get(k, _NONE)      # a module the scope file forgot must be REPORTED by verify.py, not crash the generator
def feats_of(k): return [f for f in FEATS if f['module'] == k]
def route_backed(k): return sum(1 for f in feats_of(k) if re.search(r'(route|ctrl):', f['evidence']))
def types_of(k): return [n for t, n in B.TYPE_NAMES if k in IT[t]['modules']]
def order(ms):
    """modules of one milestone in a build order that respects FS['depends'] (stable, alphabetical inside a level)"""
    ks = sorted(k for k, v in FS['modules'].items() if v['milestone'] == ms and k in MODS); done = set(); out = []
    while ks:
        ready = [k for k in ks if all(d in done or FS['modules'].get(d, {}).get('milestone', 'M0') != ms for d in FS['depends'].get(k, []))]
        if not ready: raise SystemExit('dependency cycle inside ' + ms + ': ' + str(ks))
        for k in ready: out.append(k); done.add(k); ks.remove(k)
    return out

def ods():
    seen = collections.OrderedDict()
    for f in sorted(os.listdir(os.path.join(ROOT, 'docs/modules'))) + ['../ROADMAP.md', '../../PRODUCT.md']:
        p = os.path.join(ROOT, 'docs/modules', f)
        if not os.path.exists(p) or not p.endswith('.md'): continue
        for m in re.findall(r'\bOD-[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9]', open(p, encoding='utf-8').read()): seen.setdefault(m, os.path.basename(f))
    return seen
OD = ods()

def audit():
    per = {}
    for k in MODS:
        ms = plc(k); fe = feats_of(k)
        per[k] = dict(milestone=ms['milestone'], basis=ms['basis'], task_plan=k in PLAN_MODS, features=len(fe), route_backed_features=route_backed(k), gated_routes=len(ROUTES.get(k, [])), types=types_of(k),
                      spec_files=sorted(set(re.findall(r'([\w\-]+\.md)', MODS[k][2]))))
    gaps = {'no_task_plan': sorted(k for k, v in per.items() if not v['task_plan']), 'api_in_prose_only': sorted(k for k, v in per.items() if not v['task_plan'] and v['route_backed_features'] == 0),
            'proposed_placement': sorted(k for k, v in per.items() if v['basis'] == 'proposed')}
    ms_rows = []
    for m in FS['milestones']:
        ks = [k for k, v in per.items() if v['milestone'] == m['id']]
        ms_rows.append(dict(id=m['id'], release=m['release'], name=m['name'], plan_status=m['plan_status'], modules=len(ks), with_task_plan=sum(per[k]['task_plan'] for k in ks), features=sum(per[k]['features'] for k in ks)))
    return dict(modules_total=len(per), modules_with_task_plan=sum(v['task_plan'] for v in per.values()), features_total=len(FEATS), tables_total=NTABLES, tables_in_task_plans=TASK_PLAN_TABLES,
                tables_without_task=NTABLES - TASK_PLAN_TABLES, external_decisions=len(OD), milestones=ms_rows, gaps=gaps, per_module=per)
AU = audit()

def md_full():
    L = []; w = L.append
    nm, nt = AU['modules_total'], AU['modules_with_task_plan']
    w('# সম্পূর্ণ প্রকাশ (Complete Release) — সিদ্ধান্ত D45\n')
    w('> **এই ফাইল হাতে সম্পাদনা করবেন না।** স্বয়ংক্রিয় তৈরি: `python3 infra/spec-verify/gen_full_release.py .` (উৎস: `docs/release/full-scope.json`, মডিউল-সূচি, route-টেমপ্লেট, `docs/pricing/features.csv`, `r1-scope.json`, `r3-scope.json`)। পুরনো হলে `verify.py` ব্যর্থ হয়।')
    w('> **আপনার সিদ্ধান্ত (D45):** আগের সিদ্ধান্ত ছিল "প্রথম সংস্করণ (R1) = ১০+ অচেনা স্কুল + চারটি অপরিহার্য ফিচার"। এখন **প্রকাশ্য প্রকাশ হবে সম্পূর্ণ পরিকল্পনা নিয়ে।** চারটি অপরিহার্য ফিচার (হাজিরা+SMS, ফি+রসিদ, পরীক্ষা+মার্কশিট, অভিভাবক-পোর্টাল) বহাল ও সম্পূর্ণ প্রকাশের অংশ; কিন্তু তা আর প্রকাশের সীমা নয়, **প্রথম মাইলস্টোন**।\n')
    w('## ১. কী বদলাল, কী বদলাল না')
    w('| বদলাল | বদলাল না |\n|---|---|\n| **প্রকাশ্য প্রকাশের দরজা:** সব ধাপ (M1–M8) গৃহীত না হলে প্রকাশ্য বিক্রি নয় | **নির্মাণ-ক্রম:** নির্ভরতা মেনে M1 → M2 → … ক্রমে (R1 না হলে R3 বানানো যায় না) |\n| `config/release.php`-এ শেষে সব ৫৬ মডিউল | মডিউল-গেট, রিলিজ-গেট যন্ত্র, গার্ড (G1–G17) |\n| R1-এর "চারটি ফিচার" সীমা আর প্রকাশের সীমা নয় | R1 ও R3-এর ধাপ-ধরে এজেন্ট-পরিকল্পনা |\n| প্রতিটি ধাপে `SIGNUP_MODE=invite` আমন্ত্রিত **বন্ধ-বিটা** সম্ভব, কিন্তু সেটি প্রকাশ্য প্রকাশ নয় | সরকারি/এমপিও ঐচ্ছিক, বেসরকারি অগ্রাধিকার (D43, D44) |\n')
    w('## ২. সম্পূর্ণ প্রকাশের আকার')
    w(f"| | |\n|---|---|\n| মডিউল | **{bn(nm)}** |\n| ফিচার (প্রমাণসহ, `docs/pricing/features.csv`) | **{bn(AU['features_total'])}** |\n| ডেটাবেস টেবিল | **{bn(AU['tables_total'])}** |\n| প্রতিষ্ঠানের ধরন | স্কুল, কলেজ, কোচিং, প্রাইভেট ব্যাচ (+ মাদ্রাসা-প্রিসেট) |\n| নির্মাণ-ধাপ (মাইলস্টোন) | **{bn(len(FS['milestones']))}** (M1–M{len(FS['milestones'])}) |\n")
    w('## ৩. নির্মাণ-ধাপ (মাইলস্টোন) ও প্রতিটির পরিকল্পনা-অবস্থা')
    st = {'task-plan': '**পূর্ণ কাজ-পরিকল্পনা আছে**', 'draft': 'শুধু **খসড়া** কাজ-তালিকা', 'blocked-external': '**বাইরের নথি ছাড়া শুরু করা যায় না**'}
    w('| ধাপ | রিলিজ | কী | মডিউল | কাজ-পরিকল্পনা আছে এমন মডিউল | ফিচার | অবস্থা |\n|---|---|---|---|---|---|---|')
    for r in AU['milestones']: w(f"| **{r['id']}** | {r['release']} | {r['name']} | {bn(r['modules'])} | {bn(r['with_task_plan'])} | {bn(r['features'])} | {st[r['plan_status']]} |")
    w('\nসময়-অনুমান নেই। ধাপ-ক্রম নির্ভরতা-ভিত্তিক; দিন-তারিখ নয়।\n')
    w('## ४. প্রস্তুতি-নিরীক্ষা — সম্পূর্ণ প্রকাশের জন্য পরিকল্পনা কতটা তৈরি (সৎ হিসাব)')
    g = AU['gaps']
    w(f"| নিরীক্ষা | ফল |\n|---|---|\n| ধাপ-ধরে এজেন্ট-কাজের **পূর্ণ** পরিকল্পনা আছে | **{bn(nt)} / {bn(nm)}** মডিউলের (M1 = R1 এবং M4 = R3) |\n| শুধু **খসড়া** কাজ আছে (এই নথির সাথের `AGENT-PLAN-FULL-DRAFT.md`) | **{bn(nm - nt)}** মডিউল |\n| এর মধ্যে স্পেক শুধু **গদ্যে**, route-টেমপ্লেটে কোনো ফিচার-প্রমাণ নেই | **{bn(len(g['api_in_prose_only']))}** মডিউল: {', '.join('`'+k+'`' for k in g['api_in_prose_only'])} |\n| ধাপ **আমি প্রস্তাব করেছি** (রোডম্যাপে ছিল না) — আপনার সিদ্ধান্ত লাগবে | **{bn(len(g['proposed_placement']))}** মডিউল: {', '.join('`'+k+'`' for k in g['proposed_placement'])} |\n| কোনো কাজ-পরিকল্পনায় ধরা টেবিল | {bn(AU['tables_in_task_plans'])} / {bn(AU['tables_total'])} (বাকি {bn(AU['tables_without_task'])}টি টেবিলের migration-কাজ খসড়া-পর্যায়ে) |\n| বাইরের তথ্য/সিদ্ধান্তের উপর নির্ভর (`OD-…`, স্পেকে ফাঁকা স্লট) | **{bn(AU['external_decisions'])}**টি |\n")
    w('**এর মানে:** "সম্পূর্ণ প্রকাশ" পরিকল্পনা-অনুযায়ী ঘোষণা করা যায়, কিন্তু **এখনই বানানো শুরু করার মতো পূর্ণ কাজ-পরিকল্পনা আছে শুধু M1 ও M4-এর।** বাকি ধাপের কাজ-তালিকা খসড়া; প্রতিটির "শেষ-শর্ত" সাধারণ, R3-এর মতো নির্দিষ্ট সংখ্যা-মেলানো নয়। সেগুলো বানানোর আগে ধাপ শুরুর সময় পরিশীলিত করতে হবে (নিচে §৭)। গার্ড খসড়া-টাস্কের commit আটকায় (`Task:` আইডি অজানা), তাই পরিশীলন না করে ভুলে বানানো শুরু হবে না।\n')
    w('### মডিউল-ধরে নিরীক্ষা')
    w('| ধাপ | মডিউল | ভিত্তি | কাজ-পরিকল্পনা | ফিচার | route-প্রমাণসহ ফিচার |\n|---|---|---|---|---|---|')
    for m in FS['milestones']:
        for k in order(m['id']) if any(v['milestone'] == m['id'] for v in FS['modules'].values()) else []:
            v = AU['per_module'][k]; w(f"| {m['id']} | `{k}` | {'স্পেক থেকে' if v['basis']=='derived' else '**প্রস্তাবিত**'} | {'পূর্ণ' if v['task_plan'] else 'খসড়া'} | {bn(v['features'])} | {bn(v['route_backed_features'])} |")
    w('\n## ५. বাইরের তথ্য ও সিদ্ধান্ত — এগুলো ছাড়া সংশ্লিষ্ট অংশ বানানো যায় না')
    w('স্পেকে ফাঁকা-স্লট হিসেবে রাখা (`TODO(OD-…)`), অনুমান করে বানানো **নিষিদ্ধ** (G12, G15)। সম্পূর্ণ প্রকাশের আগে প্রতিটির হয় আসল তথ্য আসবে, নয়তো নতুন সিদ্ধান্তে ফিচারটি বাদ যাবে (OD-full-3)।\n')
    w('| আইডি | কোথায় আছে |\n|---|---|')
    for k, f in OD.items(): w(f'| `{k}` | `{f}` |')
    w('\n## ६. সম্পূর্ণ প্রকাশের গ্রহণ-শর্ত (প্রকাশ্য বিক্রি শুরুর আগে সব সত্য)')
    for i, a in enumerate(['M1–M8-এর প্রতিটির নিজস্ব গ্রহণ-শর্ত সত্য (`docs/RELEASE-1.md` §৭, `docs/RELEASE-3.md` §৯, বাকিগুলো ধাপ-শুরুতে লেখা)', 'সব ৫৬ মডিউলের কাজ-পরিকল্পনা পূর্ণ (খসড়া → R3-এর মতো পরিশীলিত) এবং সম্পন্ন', 'প্রতিটি ফিচারের (`features.csv`) জন্য পরীক্ষা সবুজ; যে ফিচার কেটে বাদ দেওয়া হয়েছে তা নতুন সিদ্ধান্তে লিখিত ও ক্লায়েন্ট-তালিকা থেকে সরানো', 'আসল MySQL-এ `mysql-smoke.sh` ও `perf-check.py` সবুজ; `peak-hour.k6.mjs` লোড-পরীক্ষা পাস', 'আইনজীবী (শর্ত, গোপনীয়তা, শিশুর তথ্য), হিসাবরক্ষক (রসিদ, চালান, বেতন, কর) ও (প্রযোজ্য হলে) ব্যাংক/গেটওয়ের যাচাই সম্পন্ন', 'মালিকের লিখিত অনুমোদন; ক্লায়েন্ট-মূল্য-তালিকা `"approved": true`', '`config/release.php` = সব ৫৬ মডিউল (নিচে §৮), `SIGNUP_MODE=open`'], 1): w(f'{i}. {a}')
    w('\n## ७. সম্পূর্ণ প্রকাশ এভাবে বানাতে হবে (খসড়া → পূর্ণ)')
    w('প্রতিটি ধাপ (M2, M3, M5, M6, M8) শুরুর আগে: (১) ওই ধাপের মডিউলগুলোর খসড়া-টাস্ক একটি নতুন scope-ফাইলে (R3-এর `docs/release/r3-scope.json`-এর ধাঁচে) রূপান্তর (টেবিল, route, পরীক্ষার নাম, **নির্দিষ্ট** শেষ-শর্ত, গ্রহণ-শর্ত); (২) যেসব মডিউলের API শুধু গদ্যে, তাদের route আগে `docs/templates/laravel-core-files.md` ও `docs/API.md`-এ যোগ; (৩) `gen_release_plan.py`-কে ওই রিলিজের জন্য চালানো; (৪) `verify.py` সবুজ; তারপর কোডিং। M1 ও M4-এর এটি আগেই করা।\n')
    w('## ८. ঝুঁকি (সৎভাবে)')
    w('| ঝুঁকি | কেন | কমানোর উপায় |\n|---|---|---|\n| **দীর্ঘ সময় কোনো গ্রাহকের প্রতিক্রিয়া নেই** | সব ধাপ শেষ না হলে প্রকাশ্য বিক্রি নয় | M1 ও M4 শেষে আমন্ত্রিত বন্ধ-বিটা (`SIGNUP_MODE=invite`) — OD-full-2 |\n| **অনুমান-ভিত্তিক স্পেকের বড় অংশ অপরীক্ষিত** | ৫৬ মডিউলের ৪১টির কাজ-পরিকল্পনা খসড়া; কোনো কোড চলেনি | ধাপ-শুরুতে পরিশীলন (§৭); Spike আগে |\n| **বাইরের নথির অপেক্ষায় আটকে যাওয়া** | ব্যাংক, গেটওয়ে, আইনি হার | সময় থাকতেই সংগ্রহ; না এলে ফিচার বাদ (OD-full-3) |\n| **ক্লায়েন্টকে অতি-প্রতিশ্রুতি** | সম্পূর্ণ তালিকা বিক্রি, অথচ কিছু ফিচার অনির্ধারিত (`features.csv`-এ "পরবর্তী ধাপে") | ক্লায়েন্ট-PDF এখন `launch_mode` অনুযায়ী লেখে; অনুমোদনের আগে খসড়া-জলছাপ |\n| **সময় ও খরচের কোনো অনুমান নেই** | পরিকল্পনায় নেই | Spike-এর পর, M1 বানানোর অভিজ্ঞতা থেকে |\n')
    w('## ९. সম্পূর্ণ প্রকাশে `config/release.php`')
    w("```php\n'id' => 'FULL',\n'modules' => [" + ', '.join(f"'{k}'" for k in MODS) + '],\n```\n')
    w('## १०. আপনার সিদ্ধান্ত বাকি')
    for q in FS['open_decisions']: w(f'- {q}')
    return '\n'.join(L) + '\n'

PHASE_BN = {'M1': 'R1', 'M2': 'R1.1', 'M3': 'R2', 'M4': 'R3', 'M5': 'R4', 'M6': 'R5', 'M7': 'R6', 'M8': 'R7'}
def md_draft():
    L = []; w = L.append
    w('# AGENT PLAN — সম্পূর্ণ প্রকাশ: খসড়া কাজ-তালিকা (শুধু যেসব মডিউলের পূর্ণ পরিকল্পনা নেই)\n')
    w('> **এটি খসড়া — এখনই বানানোর নির্দেশ নয়।** স্বয়ংক্রিয় তৈরি: `python3 infra/spec-verify/gen_full_release.py .`। `docs/RELEASE-FULL.md` পড়ুন। পূর্ণ পরিকল্পনা আছে শুধু `docs/AGENT-PLAN-R1.md` (M1) ও `docs/AGENT-PLAN-R3.md` (M4)-এর।')
    w('> **কেন খসড়া:** প্রতিটির "শেষ-শর্ত" সাধারণ; টেবিল-তালিকা ও পরীক্ষার নাম মডিউল-ধরে নির্দিষ্ট করা হয়নি (একাধিক মডিউল একই স্পেক-নথি ভাগ করে)। **এজেন্ট এগুলো বানাবে না**: গার্ড (`C9`) এই `F.*` আইডি চেনে না, তাই commit আটকায়। ধাপ শুরুর আগে মালিকের সাথে পরিশীলন করে R3-এর ধাঁচে `rN-scope.json`-এ রূপান্তর করতে হবে (`RELEASE-FULL.md` §৭)।\n')
    n = 0
    for m in FS['milestones']:
        ks = [k for k in order(m['id']) if not (k in PLAN_MODS)] if any(v['milestone'] == m['id'] for v in FS['modules'].values()) else []
        w(f"\n## {m['id']} — {m['name']} (রিলিজ {m['release']}; পরিকল্পনা: {m['plan_status']})\n")
        if m['plan_status'] == 'task-plan': w(f"পূর্ণ পরিকল্পনা আছে: `{m.get('plan') or '(ফাইল নির্দিষ্ট নয়)'}`। এখানে নতুন কিছু নেই।\n"); continue
        if m['plan_status'] == 'blocked-external':
            w('কোনো মডিউল-কী নেই; এগুলো বাহ্যিক সংযোগ। **আসল নথি/অনুমোদন ছাড়া শুরু করা যায় না** (অনুমান নিষিদ্ধ)। রোডম্যাপের সংশ্লিষ্ট সারি:\n')
            for r in LED:
                if C.relkey(r[4]) == 'R6': w(f"- {r[1].replace('**', '')} — নির্ভরতা: {r[5]}")
            continue
        for i, k in enumerate(ks, 1):
            n += 1; v = AU['per_module'][k]; row = MODS[k]; nm = B_name(k)
            w(f"### DRAFT `F.{m['id']}.{i}` — {nm} (মডিউল `{k}`)\n")
            w(f"- **ভিত্তি:** {'স্পেক থেকে বের-করা ধাপ' if v['basis']=='derived' else '**আমার প্রস্তাবিত ধাপ — আপনার সিদ্ধান্ত লাগবে (OD-full-1)**'}")
            deps = FS['depends'].get(k, [])
            w('- **নির্ভর করে (মডিউল):** ' + (', '.join(f"`{d}`" + (' (পূর্ণ পরিকল্পনায়)' if d in PLAN_MODS else '') for d in deps) if deps else '— (শুধু আগের ধাপ সম্পূর্ণ)'))
            w(f"- **কোন ধরনে:** {', '.join(v['types']) or '—'} · **গেট:** `{row[4].strip()}`")
            w('- **পড়ুন:** ' + ', '.join(f"`docs/modules/{f}`" for f in v['spec_files']))
            rts = ROUTES.get(k, [])
            if rts: w(f"- **route (মডিউল-গেটেড, {bn(len(rts))}):**\n\n```\n" + '\n'.join(rts) + '\n```')
            else: w('- **route:** মডিউল-গেটেড route নেই। ' + ('ফিচার-প্রমাণে কিছু route/controller আছে (নিচে)।' if v['route_backed_features'] else '**স্পেকে API শুধু গদ্যে — প্রথম কাজ: route ও `docs/API.md` যোগ (মালিক-অনুমোদিত স্পেক-পরিবর্তন)।**'))
            fl = feats_of(k)
            w(f"- **ফিচার-তালিকা = শেষ-শর্তের চেকলিস্ট ({bn(len(fl))}):**")
            for f in fl: w(f"  - [ ] {f['feature_bn']}  <sub>প্রমাণ: `{f['evidence'].split(';')[0]}`</sub>")
            w('- **শেষ-শর্ত (খসড়া, সাধারণ):** (১) স্পেক-নথির প্রতিটি টেবিলের migration ও model (`BelongsToInstitution`), `schema-diff` শূন্য; (২) ওপরের route প্রতিটি ভূমিকায় ঠিক, মডিউল বন্ধ থাকলে 403; (৩) চেকলিস্টের প্রতিটি ফিচারের অন্তত একটি পরীক্ষা, সবুজ; (৪) tenancy-পরীক্ষা: অন্য প্রতিষ্ঠানের তথ্য অদৃশ্য; (৫) মেনু-আইটেম মডিউল চালু থাকলেই দেখা যায়; (৬) টাকা/শিশুর তথ্য হলে G9 মানা; (৭) স্পেকে `TODO(OD-…)` থাকলে ফাঁকা স্লট রাখা, অনুমান নয়; (৮) `docs/PROGRESS.md` ও গার্ড সবুজ।')
            gaps = []
            if not rts and not v['route_backed_features']: gaps.append('API শুধু গদ্যে')
            if v['basis'] == 'proposed': gaps.append('ধাপ প্রস্তাবিত')
            if any(f['phase'] == 'L' or fphase[id(f)] == 'L' for f in fl): gaps.append('কিছু ফিচারের ধাপ অনির্ধারিত')
            w('- **ফাঁক:** ' + ('; '.join(gaps) if gaps else '— (স্পেক-অনুযায়ী পরিশীলনযোগ্য)') + '\n')
    w(f'\n---\nমোট খসড়া কাজ: **{bn(n)}**।')
    return '\n'.join(L) + '\n'

def B_name(k):
    import csv
    for r in csv.DictReader(open(os.path.join(ROOT, 'docs/pricing/modules.csv'), encoding='utf-8-sig')):
        if r['key'] == k: return r['name_bn']
    return k

DEV = str.maketrans('०१२३४५६७८९', '০১২৩৪৫৬৭৮৯')      # Devanagari digits must never reach a Bengali document
FULL_MD = md_full().translate(DEV); DRAFT_MD = md_draft().translate(DEV); AUDIT_JSON = json.dumps(AU, ensure_ascii=False, indent=1) + '\n'
OUTS = [('docs/RELEASE-FULL.md', FULL_MD), ('docs/AGENT-PLAN-FULL-DRAFT.md', DRAFT_MD), ('docs/release/full-audit.json', AUDIT_JSON)]

def main():
    if '--check' in _argv:
        cur = [open(os.path.join(ROOT, p), encoding='utf-8').read() if os.path.exists(os.path.join(ROOT, p)) else None for p, _ in OUTS]
        fresh = cur == [t for _, t in OUTS]; print('full-release documents are', 'up to date' if fresh else 'STALE (run: python3 infra/spec-verify/gen_full_release.py .)'); sys.exit(0 if fresh else 1)
    for p, t in OUTS: open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(t)
    print(f"wrote docs/RELEASE-FULL.md, AGENT-PLAN-FULL-DRAFT.md, release/full-audit.json: {AU['modules_total']} modules, {AU['modules_with_task_plan']} with a full task plan, {AU['modules_total']-AU['modules_with_task_plan']} draft, {len(AU['gaps']['proposed_placement'])} placements proposed")

if __name__ == '__main__': main()
