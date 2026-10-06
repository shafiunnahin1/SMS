#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
infra/spec-verify/gen_release_plan.py - builds the Release 3 agent plan from the repository files (nothing typed twice):
    docs/release/r3-scope.json   tasks, tables, controllers, tests, Done When, acceptance
    docs/database/schema.sql     the DDL printed per task
    docs/templates/laravel-core-files.md   the routes (parsed by gen_agent_plan.routes)
    docs/AUTHORIZATION.md        the menu (pages per role)
Writes docs/AGENT-PLAN-R3.md and docs/release/r3-plan.json.   Usage: gen_release_plan.py [root] [--check]
Importing this module computes everything in memory and writes nothing (verify.py imports it).
"""
import os, re, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_argv = sys.argv; _first = next((a for a in _argv[1:] if not a.startswith('--')), None)
import gen_agent_plan as G                       # ALL_ROUTES, ddl_of (import is side-effect free)
ROOT = G.ROOT
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
SC = json.loads(rd('docs/release/r3-scope.json')); R1 = json.loads(rd('docs/release/r1-scope.json'))
CTRL_REL = R1['controllers']; ROUTES = G.ALL_ROUTES
TESTING = rd('docs/TESTING.md')
DOCS_WITH_TESTS = {}
for f in sorted(os.listdir(os.path.join(ROOT, 'docs/modules'))):
    if f.endswith('.md'):
        for n in set(re.findall(r'`([A-Z]\w+Test)`', rd('docs/modules/' + f))): DOCS_WITH_TESTS.setdefault(n, 'docs/modules/' + f)
for n in set(re.findall(r'`([A-Z]\w+Test)`', TESTING)): DOCS_WITH_TESTS.setdefault(n, 'docs/TESTING.md')

def routes_of(ctrls):
    out = []
    for v, p, c, a, r, m in ROUTES:
        if c in ctrls: out.append(f"{v} {re.sub(r'/+$', '', p) or '/'} -> {c}@{a}" + (f" [role:{r}]" if r else '') + (f" (module {m})" if m else ''))
    return out

def menu_pages(modules):
    """(role, key, path) of menu items that name one of `modules` (directly or through their group)."""
    a = rd('docs/AUTHORIZATION.md'); out = []
    for role in ['admin', 'teacher', 'accountant', 'parent', 'super_admin']:
        m = re.search(r"\n  %s: \[(.*?)\n  \]," % role, a, re.S)
        if not m: continue
        gate = None; ingroup = False
        for ln in m.group(0).split('\n'):
            g = re.match(r"\s*\{ key: '[\w\-]+'.*children: \[", ln)
            if g: ingroup = True; gm = re.search(r"module: '(\w+)'", ln); gate = gm.group(1) if gm else None; continue
            if ingroup and re.match(r"\s*\]\}", ln): ingroup = False; gate = None; continue
            im = re.match(r"\s*it\('([\w\-]+)',\s*'([^']+)'", ln)
            if not im: continue
            mm = re.search(r"module: '(\w+)'", ln); mod = mm.group(1) if mm else gate
            if mod in modules: out.append((role, im.group(1), im.group(2)))
    return out

PAGES = menu_pages(set(SC['modules']) | set(SC['prerequisites']['modules']))
tasks = []
for t in SC['tasks']:
    ctrls = list(t['controllers'])
    rts = routes_of(ctrls)
    row = dict(id=t['id'], title=t['title'], depends_on=t['after'], spec_refs=t['spec'], goal=t['goal'], modules=t['modules'], tables=t['tables'], controllers=ctrls,
               routes=rts, tests=t['tests'], done_when=t['done'], verify=t['verify'], scope_note=t.get('scope', ''))
    if t['id'] == 'R3.12': row['pages'] = [f'{r}: {k} ({p})' for r, k, p in PAGES]
    tasks.append(row)
plan_json = dict(release='R3', generated_from=['docs/release/r3-scope.json', 'docs/database/schema.sql', 'docs/templates/laravel-core-files.md', 'docs/AUTHORIZATION.md'], tasks=tasks)

def build_md():
    L = []; w = L.append
    w('# AGENT PLAN — Release 3 (Money & People: টাকা ও মানুষ)\n')
    w('> **এই ফাইল হাতে সম্পাদনা করবেন না।** স্বয়ংক্রিয় তৈরি: `python3 infra/spec-verify/gen_release_plan.py .` (উৎস: `docs/release/r3-scope.json`, `docs/database/schema.sql`, routes-টেমপ্লেট, `docs/AUTHORIZATION.md`)। `verify.py` পুরনো হলে ব্যর্থ হয়। স্কোপ ও গ্রহণ-শর্ত: `docs/RELEASE-3.md`।')
    w('> **শুরুর আগে:** `AGENTS.md` পড়ুন। **Release 1 সম্পূর্ণ ও গৃহীত না হলে R3 শুরু করবেন না** (Task `R3.0`)। R1.1/R2 লাগে না — একমাত্র পূর্বশর্ত `expenses` (Task `R3.1`)।\n')
    w('## ক. নিয়ম (R1-এর নিয়মের উপর অতিরিক্ত)\n')
    w('1. **টাকা Decimal-এ, দুই দশমিক, ROUND_HALF_UP।** `float` নিষিদ্ধ। সংখ্যা মেলাতে স্বাধীন গণনা ব্যবহার করুন: `infra/spec-verify/payroll_ref.py`, `refs_r11.py`, `refs_r12.py` — কোড এগুলোর সাথে **পয়সা-পর্যন্ত** না মিললে ধাপ শেষ নয়।')
    w('2. **টাকার রেকর্ড কখনো মোছা/বদলানো যায় না (D32):** রসিদ, রিফান্ড, ভাউচার, payroll-run, PF-সারি, স্টক-movement — ভুল সংশোধন = নতুন উল্টো সারি।')
    w('3. **বেতন-তথ্য সংবেদনশীল (D33):** Super Admin ও প্ল্যাটফর্ম-সহায়তা কেউ দেখে না; শিক্ষক শুধু নিজেরটা; লগ/Sentry-তে অঙ্ক নয়; ব্যাকআপ/export-এ বেতন-ভাগ বাদ (D38)।')
    w('4. **আইনি/বাহ্যিক জিনিস অনুমান করবেন না:** PF/কর/গ্র্যাচুইটির হার, ব্যাংক-ফাইল ফরম্যাট — স্পেকে ফাঁকা স্লট (`TODO(OD-…)`); কোডে হার ধরে নেবেন না।')
    w('5. **bulk লেখা শুধু `TenantBulk`-এর মাধ্যমে**; প্রতিটি নতুন মডেলে `BelongsToInstitution`; প্রতিটি পরীক্ষায় অন্য-প্রতিষ্ঠানের তথ্য অদৃশ্যতা।')
    w('6. **মডিউল-গেট:** R3-মডিউল (`cashbook`, `hr_payroll`, `teacher_attendance`, `inventory`, `accounting`, `donations`) `config/release.php`-এ না থাকা পর্যন্ত বন্ধ। ধাপ শেষ হলে `docs/PROGRESS.md`-এ লিখে সব পরীক্ষা সবুজ করে commit।\n')
    w('## খ. ধাপের ক্রম\n')
    w('| Task | কী | নির্ভর করে | টেবিল | route | পরীক্ষা |\n|---|---|---|---|---|---|')
    for t in tasks: w(f"| `{t['id']}` | {t['title']} | {', '.join(t['depends_on']) or '—'} | {len(t['tables'])} | {len(t['routes'])} | {len(t['tests'])} |")
    w(f"\nমোট: **{len(tasks)} task · {sum(len(t['tables']) for t in tasks)} টেবিল · {sum(len(t['routes']) for t in tasks)} route · {len({x for t in tasks for x in t['tests']})}টি আলাদা পরীক্ষা**। (ক্রম রৈখিক; `R3.9` শুধু `R3.2`-এর পর, তাই `R3.3`–`R3.8` ও `R3.9` সমান্তরালে চলতে পারে।)\n")
    w('## গ. `config/release.php` — R3-এর জন্য (R1-এর তালিকার উপর)\n')
    w('```php\n// R3: cumulative. Add any R1.1 / R2 modules you have ALREADY built; never list a module whose code does not exist.\n\'modules\' => [' + ', '.join(f"'{m}'" for m in SC['release_php']['modules']) + '],\n```\n')
    w('## ঘ. Task-সমূহ\n')
    for t in tasks:
        w(f"### TASK `{t['id']}` — {t['title']}\n")
        w(f"- **নির্ভর করে:** {', '.join('`'+x+'`' for x in t['depends_on']) or '— (শুরু)'}")
        w(f"- **লক্ষ্য:** {t['goal']}")
        if t['scope_note']: w(f"- **সীমা / নোট:** {t['scope_note']}")
        w('- **পড়ুন:** ' + ', '.join(f'`{s}`' for s in t['spec_refs']))
        if t['modules']: w('- **মডিউল-কী:** ' + ', '.join(f'`{m}`' for m in t['modules']))
        if t['tables']:
            w('- **টেবিল (migration, model, factory এই ধাপেই):**\n')
            for tb in t['tables']: w(f"```sql\n{G.ddl_of(tb)}\n```")
        if t['routes']:
            w(f"- **Route ({len(t['routes'])}):**\n\n```\n" + '\n'.join(t['routes']) + '\n```')
        if t.get('pages'): w('- **পাতা (মেনু থেকে):**\n\n```\n' + '\n'.join(t['pages']) + '\n```')
        if t['tests']: w('- **লিখবেন ও সবুজ করবেন:** ' + ', '.join(f"`{x}` ({DOCS_WITH_TESTS.get(x, '?')})" for x in t['tests']))
        w(f"- **শেষ-শর্ত (Done When):** {t['done_when']}")
        w('- **যাচাই:** ' + ' · '.join(f'`{c}`' for c in t['verify']) + '\n')
    w('## ঙ. গ্রহণ-শর্ত (R3 চালুর আগে সব সত্য)\n')
    for i, a in enumerate(SC['acceptance'], 1): w(f'{i}. {a}')
    w('\n## চ. বাইরের তথ্য ছাড়া যা এগোয় না (আপনার/বিশেষজ্ঞের কাজ)\n')
    for e in SC['external']: w(f'- {e}')
    w('\n## ছ. ঐচ্ছিক কাটছাঁট (R3a / R3b)\n\n' + SC['optional_cut']['why'] + '\n')
    return '\n'.join(L)

plan_md = build_md()
paths = ('docs/AGENT-PLAN-R3.md', 'docs/release/r3-plan.json')

def main():
    out_json = json.dumps(plan_json, ensure_ascii=False, indent=1) + '\n'
    if '--check' in _argv:
        cur = [open(os.path.join(ROOT, p), encoding='utf-8').read() if os.path.exists(os.path.join(ROOT, p)) else None for p in paths]
        fresh = cur == [plan_md, out_json]; print('R3 agent plan is', 'up to date' if fresh else 'STALE (run: python3 infra/spec-verify/gen_release_plan.py .)'); sys.exit(0 if fresh else 1)
    open(os.path.join(ROOT, paths[0]), 'w', encoding='utf-8').write(plan_md); open(os.path.join(ROOT, paths[1]), 'w', encoding='utf-8').write(out_json)
    print(f"wrote {paths[0]} ({len(plan_md.splitlines())} lines), r3-plan.json: {len(tasks)} tasks, {sum(len(t['routes']) for t in tasks)} routes, {sum(len(t['tables']) for t in tasks)} tables, {len(PAGES)} menu pages")

if __name__ == '__main__': main()
