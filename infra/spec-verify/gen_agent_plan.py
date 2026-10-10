#!/usr/bin/env python3
"""
infra/spec-verify/gen_agent_plan.py - builds the ONE document a coding agent follows for Release 1, from the specs themselves:
  docs/AGENT-PLAN-R1.md          human/agent-readable, one task after another
  docs/release/r1-plan.json      the same, machine-readable (task id, depends_on, spec_refs, tables, routes, tests, verify)
  docs/release/r1-tables.txt     the 31 table names (used by infra/scripts/schema-diff.sh)
Sources: docs/release/r1-scope.json, docs/BUILD-SEQUENCE.md, docs/database/schema.sql, docs/templates/laravel-core-files.md (routes).
Nothing in the generated files is hand-written; verify.py regenerates in memory and fails if they are stale.   Usage: gen_agent_plan.py [root] [--check]   (importing it computes ALL_ROUTES / tasks in memory and writes nothing)
"""
import re, os, sys, json
ROOT = os.path.abspath(next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(os.path.dirname(__file__), '..', '..')))
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
scope = json.loads(rd('docs/release/r1-scope.json'))
bsq = rd('docs/BUILD-SEQUENCE.md'); schema = rd('docs/database/schema.sql')

# ---------- build steps ----------
blocks = {}
for m in re.finditer(r'^### Step (\d+\.\d+[a-z]?) [^\n]*?(?:—|~|-|–)? ?([^\n]*)\n(.*?)(?=^### Step |^---\s*$|^## PHASE|\Z)', bsq, re.S | re.M):
    pass
for blk in re.split(r'(?=^### Step )', bsq, flags=re.M)[1:]:
    head = blk.split('\n', 1)[0]; mm = re.match(r'### Step (\d+\.\d+[a-z]?)\s*(.*)', head)
    body = blk.split('\n', 1)[1]
    body = re.split(r'\n---\s*\n|\n## PHASE', body)[0]
    body = re.sub(r'^> \*\*Release:[^\n]*\n?', '', body, flags=re.M).strip('\n')
    blocks[mm.group(1)] = (re.sub(r'^[—~\-–]\s*', '', mm.group(2)).strip() or head, body)
def spec_refs(text):
    out = []
    for line in text.split('\n'):
        if '**Spec Reference:**' in line:
            for tok in re.findall(r'`([^`]+)`', line.split('**Spec Reference:**', 1)[1]):
                t = tok.split(' ')[0]
                if '/' in t or re.search(r'\.(md|sql|json|mjs|js|py|yml|conf)$', t): out.append(re.sub(r'[,;)]+$', '', t))
    return list(dict.fromkeys(out))
def tests_of(text):
    out = []
    for line in text.split('\n'):
        if line.startswith('**Tests:**') or '**Tests:**' in line: out += re.findall(r'`([A-Z]\w+Test)`', line.split('**Tests:**', 1)[1])
    return out
def done_of(text):
    m = re.search(r'\*\*Done When[^:]*:\*\*(.*?)(?=\n\*\*[A-Z]|\n\n|\Z)', text, re.S); return m.group(1).strip() if m else ''

# ---------- schema: effective definition of a table ----------
body_nc = schema
def ddl_of(tb):
    m = re.search(r'CREATE TABLE %s \(.*?\n\);' % tb, schema, re.S); parts = [m.group(0)]
    for a in re.finditer(r'^(ALTER TABLE %s ADD COLUMN [^\n]*;|CREATE (?:UNIQUE )?INDEX \w+ ON %s\([^\n]*;)' % (tb, tb), schema, re.M): parts.append(a.group(0))
    return '\n'.join(parts)

# ---------- routes ----------
rt_src = rd('docs/templates/laravel-core-files.md'); rt = rt_src[rt_src.index('## routes/api.php'):rt_src.index('## app/Http/Controllers/Public/HealthController.php')]
CT = r"\\?(?:[\w\\]*\\)?(\w+Controller)::class"
def routes():
    out = []; stack = []
    for ln in rt.split('\n'):
        ind = len(ln) - len(ln.lstrip())
        while stack and ind <= stack[-1][0] and re.match(r'\s*\}\);', ln): stack.pop()
        if '->group(' in ln:
            pm = re.search(r"->prefix\('([\w\-/]+)'\)", ln); rl = re.search(r"'role:([\w,]+)'", ln); md = re.search(r"'module:(\w+)'", ln)
            stack.append((ind, '/' + pm.group(1) if pm else '', rl.group(1) if rl else None, md.group(1) if md else None))
        pre = ''.join(s[1] for s in stack); role = next((s[2] for s in reversed(stack) if s[2]), None); mod = next((s[3] for s in reversed(stack) if s[3]), None)
        r2 = re.search(r"role:([\w,]+)'\)", ln.split('Route::', 1)[-1]) if 'Route::' in ln else None
        if r2: role = r2.group(1)
        m2 = re.search(r"->middleware\('module:(\w+)'\)|\[[^\]]*'module:(\w+)'", ln)
        if m2 and 'Route::' in ln: mod = m2.group(1) or m2.group(2)
        mm = re.search(r"Route::(get|post|put|patch|delete)\('([^']+)',\s*(?:\[\s*" + CT + r"(?:,\s*'(\w+)')?\s*\]|" + CT + r")", ln)
        if mm:
            path = mm.group(2); path = path if path.startswith('/') else '/' + path
            out.append((mm.group(1).upper(), pre + path, mm.group(3) or mm.group(5), mm.group(4) or '__invoke', role, mod)); continue
        mm = re.search(r"Route::match\(\[([^\]]*)\],\s*'([^']+)',\s*\[\s*" + CT + r"(?:,\s*'(\w+)')?", ln)
        if mm:
            for verb in re.findall(r"'(\w+)'", mm.group(1)): out.append((verb.upper(), pre + mm.group(2), mm.group(3), mm.group(4) or '__invoke', role, mod))
            continue
        mm = re.search(r"Route::apiResource\('([\w\-]+)',\s*" + CT + r"\)(.*)", ln)
        if mm:
            base = pre + '/' + mm.group(1); rest = mm.group(3)
            acts = [('GET', '', 'index'), ('POST', '', 'store'), ('GET', '/{id}', 'show'), ('PUT', '/{id}', 'update'), ('DELETE', '/{id}', 'destroy')]
            on = re.search(r"->only\(\[([^\]]*)\]\)", rest); ex = re.search(r"->except\(\[([^\]]*)\]\)", rest)
            if on: acts = [a for a in acts if a[2] in re.findall(r"'(\w+)'", on.group(1))]
            if ex: acts = [a for a in acts if a[2] not in re.findall(r"'(\w+)'", ex.group(1))]
            for verb, suf, act in acts: out.append((verb, base + suf, mm.group(2), act, role, mod))
    return out
ALL_ROUTES = routes()
def excluded(ctrl, path):
    return next((e['why'] for e in scope['route_exclude'] if e['controller'] == ctrl and re.search(e['path_regex'], path)), None)

# ---------- task list ----------
order = ['0.1', '0.2', '0.3', '1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8', '5.3', '5.1', '5.2']   # D60: 5.3 before the deferred 5.1/5.2 (D55)
assert [s for s in order] == [s for s in scope['steps_in_release'] if s not in ('8.5',)], 'scope file and the plan order disagree'
extra = {e['id']: e for e in scope['extra_tasks']}
seq = []
for s in order:
    seq.append(s)
    for e in scope['extra_tasks']:
        if e['after'] == s: seq.append(e['id'])
# the extra tasks chained by "after" (8.1 after 5.3, 8.2 after 8.1 ...)
changed = True
while changed:
    changed = False
    for e in scope['extra_tasks']:
        if e['id'] not in seq:
            if e['after'] in seq: seq.insert(seq.index(e['after']) + 1, e['id']); changed = True
tasks = []
for i, tid in enumerate(seq):
    prev = seq[i - 1] if i else None
    if tid in blocks:
        title, body = blocks[tid]
        t = dict(id=tid, kind='step', title=title, original=body, spec=spec_refs(body), tests=tests_of(body), done=scope.get('step_done', {}).get(tid) or done_of(body), note=scope['step_scope_notes'].get(tid))
    else:
        e = extra[tid]; t = dict(id=tid, kind='task', title=e['title'], original='', spec=e['spec'], tests=[], done=e['done'], note=e['scope'], goal=e['goal'], verify=e['verify'])
    t['tests'] = list(dict.fromkeys(t['tests'] + scope['step_extra_tests'].get(tid, [])))
    if tid in scope.get('d47_amend', {}): t['done'] = (t['done'] + ' ' + scope['d47_amend'][tid]).strip()
    t['blocked'] = scope.get('d47_blocked', {}).get(tid)
    t['tables'] = scope['step_tables'].get(tid, [])
    rs = []; ex = []
    for verb, path, ctrl, act, role, mod in ALL_ROUTES:
        c = scope['controllers'].get(ctrl)
        if c and c['release'] == 'R1' and c.get('step') == tid:
            why = excluded(ctrl, path)
            (ex if why else rs).append((verb, path, ctrl, act, role, why))
    t['routes'] = [f"{v} {p} -> {c}@{a}" + (f" [role:{r}]" if r else '') for v, p, c, a, r, _ in rs]
    t['routes_excluded'] = [f"{v} {p} -> {c}@{a}  ({w})" for v, p, c, a, r, w in ex]
    t['depends_on'] = prev
    if 'verify' not in t:
        v = []
        if tid in ('1.1', '1.2', '1.3'): v += ['php artisan migrate:fresh --seed', 'bash infra/scripts/mysql-smoke.sh', 'bash infra/scripts/schema-diff.sh lms lms_smoke   # with SCHEMA_DIFF_ONLY=docs/release/r1-tables.txt'] if tid == '1.1' else ['php artisan migrate:fresh --seed']
        if t['tests']: v.append('php artisan test --filter=' + '|'.join(t['tests'][:8]))
        if re.match(r'(3\.|4\.[1-8]|5\.[123])$', tid): v.append('npm test && npm run lint:theme')
        v.append('php artisan test   # whole suite stays green')
        t['verify'] = v
    tasks.append(t)

# ---------- render ----------
def tbl_line(tb): return f"`{tb}`"
md = []
w = md.append
w("# AGENT PLAN — Release 1 (স্কুল, প্রকাশ্য বিক্রি)\n")
w("> **এটি স্বয়ংক্রিয়ভাবে তৈরি — হাতে সম্পাদনা করবেন না।** পুনঃতৈরি: `python3 infra/spec-verify/gen_agent_plan.py .` (উৎস: `docs/release/r1-scope.json`, `docs/BUILD-SEQUENCE.md`, `docs/database/schema.sql`, routes-টেমপ্লেট)। `verify.py` পুরনো হলে ব্যর্থ হয়। মেশিন-পাঠ্য: `docs/release/r1-plan.json`।")
w("> **কোডিং এজেন্ট:** `AGENTS.md` পড়ুন, তারপর **শুধু এই ফাইল** ধরে এক-এক task করে এগোন। প্রতিটি task-এ আছে: কী পড়বেন, কী বানাবেন (R1 পরিসর), কোন টেবিল/route/পরীক্ষা, কখন শেষ, কীভাবে যাচাই।\n")
w("## ০. কাজের নিয়ম (সব task-এর জন্য)\n")
w("""1. **ক্রম মানুন।** Task-এর `depends_on` শেষ না হলে পরেরটি শুরু নয়। **Task `S` (Spike) একটি Gate**: মালিকের স্বাক্ষর ছাড়া Phase 3 শুরু নয়।
2. **শুধু R1 বানান।** Appendix C-র কোনো জিনিস (মডিউল, controller, টেবিল, মেনু) আগাম বানাবেন না। `config/release.php` ও `ModuleGate` তা বাধ্য করে। "মূল step-এর লেখা" অনেক সময় R1-এর চেয়ে বড় — সেখানে **"R1 পরিসর" বাক্সই চূড়ান্ত**।
3. **প্রতিটি task এই ক্রমে:** (ক) "কী পড়বেন" ফাইলগুলো পড়ুন, পুরোটা নয়, উল্লিখিত অংশ; (খ) পরীক্ষা আগে বা কোডের সাথে লিখুন; (গ) কোড লিখুন; (ঘ) "যাচাই" কমান্ড চালান — সব সবুজ না হলে এগোবেন না; (ঙ) `docs/PROGRESS.md`-এ এক সারি (task, তারিখ, কী হল, কোন পরীক্ষা সবুজ, অমীমাংসিত); (চ) একটি commit (`docs/ops/git-workflow.md`)।
4. **স্পেক ভুল/অস্পষ্ট মনে হলে:** চুপচাপ নিজের মতো করবেন না। `docs/DECISIONS.md`-এ সমস্যা + আপনার প্রস্তাব লিখুন, `[OWNER]` চিহ্ন দিন, ওই task থামান। কোড ও স্পেক বিরোধ করলে স্পেক ঠিক করুন (এবং `python3 infra/spec-verify/verify.py .` চালান)।
5. **অজানা বাইরের জিনিস অনুমান করবেন না:** SMS-gateway-র Unicode/DLR, bKash/SSLCommerz-এর আসল আচরণ, ব্যাংক-ফরম্যাট — adapter + `FakeGateway` বানান, `TODO(OD-…)` রাখুন, মালিককে জানান।
6. **নিরাপত্তার অপরিবর্তনীয়:** tenant-scoped model (`BelongsToInstitution`), bulk লেখা শুধু `TenantBulk`, ফাইল শুধু `private`/`public` ডিস্কে `institutions/{id}/…` পাথে, টাকার রেকর্ড কখনো সম্পাদনা নয় (উল্টো লাইন), কোনো hard-coded রঙ/শব্দ/`ml-4` নয় (`npm run lint:theme`)।
7. **স্পেক বদলালে:** `python3 infra/spec-verify/verify.py . --deep` (সবুজ থাকতে হবে)।
8. **মালিকের সিদ্ধান্ত যা এজেন্ট নেয় না:** `SIGNUP_MODE=open`, মূল্য/প্ল্যান-সংখ্যা, আইনি লেখা (`/terms`, `/privacy`), Spike-Gate।
""")
w("### মালিকের কাছ থেকে যা লাগবে (না পেলে নির্দেশিত বিকল্প)\n")
w("| কী | কোন task | না পেলে |\n|---|---|---|\n| SMS gateway ডকুমেন্ট ও test অ্যাকাউন্ট | 4.6 | adapter + log-only gateway; `TODO(OD-sms-unicode)` |\n| SSLCommerz sandbox কী (subscription-পেমেন্ট) | 5.2 | `FakeSubscriptionGateway` (dev-only); আসল কী ছাড়া 5.2 \"সম্পন্ন\" নয় |\n| `/terms`, `/privacy` লেখা (আইনজীবীর) | 8.1 | স্থানধারক পাতা; **R1 গ্রহণ আটকে থাকে** |\n| আসল রসিদ ও মার্কশিটের নমুনা | 4.4, 4.5 | `docs/modules/pdf-reports.md`-এর ফরম্যাট; মালিকের অনুমোদন লাগবে |\n| একটি আসল ছাত্র-তালিকার Excel | 4.2 | নমুনা টেমপ্লেট; এনকোডিং UTF-8 ধরুন |\n| MySQL 8, Redis, Node 20, মানব-রিভিউয়ার | 0.1, S | **থামুন** — `docs/spike/SPIKE-READY.md` |\n")
w("## ১. মানচিত্র\n")
w("| # | Task | নির্ভর করে | টেবিল | route | পরীক্ষা |\n|---|---|---|---|---|---|")
for t in tasks: w(f"| `{t['id']}` | {t['title']} | {('`'+t['depends_on']+'`') if t['depends_on'] else '—'} | {len(t['tables']) or ''} | {len(t['routes']) or ''} | {len(t['tests']) or ''} |")
w("\n**সারসংক্ষেপ:** %d task · %d টেবিল · %d route · %d নামকৃত পরীক্ষা।\n" % (len(tasks), sum(len(t['tables']) for t in tasks), sum(len(t['routes']) for t in tasks), len({x for t in tasks for x in t['tests']})))
w("## ২. Task-এর তালিকা\n")
for t in tasks:
    w(f"---\n\n### TASK `{t['id']}` — {t['title']}\n")
    w(f"- **নির্ভর করে:** {('`'+t['depends_on']+'`') if t['depends_on'] else 'কিছু না'}  ·  **Release:** R1")
    if t.get('goal'): w(f"- **লক্ষ্য:** {t['goal']}")
    if t['spec']: w("- **কী পড়বেন:** " + ', '.join(f'`{s}`' for s in t['spec']))
    if t.get('note'): w(f"\n> **R1 পরিসর (এটিই চূড়ান্ত):** {t['note']}\n")
    if t['tables']:
        w(f"\n**এই task যে টেবিলের মালিক** (migration Step 1.1-এ; মডেল, service, endpoint ও পরীক্ষা এখানে): " + ', '.join(tbl_line(x) for x in t['tables']))
        w("\n<details><summary>টেবিলের সংজ্ঞা (schema.sql থেকে, ALTER/index সহ)</summary>\n\n```sql\n" + '\n\n'.join(ddl_of(x) for x in t['tables']) + "\n```\n</details>")
    if t['routes']: w("\n**R1-এ যে route বানাবেন:**\n```\n" + '\n'.join(t['routes']) + "\n```")
    if t['routes_excluded']: w("\n**এই controller-এর যে route R1-এ নয় (বানাবেন না):**\n```\n" + '\n'.join(t['routes_excluded']) + "\n```")
    if t['tests']: w("\n**পরীক্ষা:** " + ', '.join(f'`{x}`' for x in t['tests']))
    if t.get('blocked'): w("\n> **⛔ অবরুদ্ধ (BLOCKED) — এই task এখন বানাবেন না:** " + t['blocked'])
    if t['done']: w("\n**Done When:** " + t['done'])
    w("\n**যাচাই (সব সবুজ হলে তবেই পরের task):**\n```bash\n" + '\n'.join(t['verify']) + "\n```")
    if t['original']:
        w("\n<details><summary>মূল Step-এর লেখা (`docs/BUILD-SEQUENCE.md`) — R1-এর চেয়ে বড় হতে পারে; ওপরের \"R1 পরিসর\" জেতে</summary>\n\n" + '\n'.join('> ' + l if l.strip() else '>' for l in t['original'].split('\n')) + "\n</details>")
    w("")
# appendices
w("---\n\n## Appendix A — R1 টেবিল ও মালিক-task\n")
w("| টেবিল | মালিক task |\n|---|---|")
for tid, lst in scope['step_tables'].items():
    for x in lst: w(f"| `{x}` | `{tid}` |")
rel_count = {}
for v, p, c, a, r, m in ALL_ROUTES:
    rel = scope['controllers'].get(c, {}).get('release', '?')
    if rel == 'R1' and excluded(c, p): rel = 'R1(excluded)'
    rel_count[rel] = rel_count.get(rel, 0) + 1
w("\n## Appendix B — route-সংখ্যা release অনুযায়ী (routes-টেমপ্লেটের সব route)\n")
w("| Release | route |\n|---|---|")
for k in sorted(rel_count): w(f"| {k} | {rel_count[k]} |")
w("\n## Appendix C — R1-এ **নেই** (বানাবেন না)\n")
w("**মডিউল-কী (`config/release.php`-এ নেই):** school-এর ৫৪টির মধ্যে ৭টি ছাড়া বাকি সব।")
w("\n**Controller (release অনুযায়ী):**\n")
by = {}
for c, v in scope['controllers'].items():
    if v['release'] != 'R1': by.setdefault(v['release'], []).append(c)
for rel in ['R1.1', 'R2', 'R2+', 'R3', 'R4', 'R5']:
    if rel in by: w(f"- **{rel}:** " + ', '.join(f'`{c}`' for c in sorted(by[rel])))
w("\n**Build step:** " + ', '.join(f"`{s}` ({r})" for s, r in scope['steps_later'].items()))
w("\n**পরে কী আসবে:**\n")
for k, v in scope['later_features'].items(): w(f"- **{k}:** " + '; '.join(v))
plan_md = '\n'.join(md) + '\n'
plan_json = dict(release='R1', generated_from=['docs/release/r1-scope.json', 'docs/BUILD-SEQUENCE.md', 'docs/database/schema.sql', 'docs/templates/laravel-core-files.md'],
                 tasks=[dict(id=t['id'], title=t['title'], depends_on=t['depends_on'], spec_refs=t['spec'], tables=t['tables'], routes=t['routes'], routes_excluded=t['routes_excluded'], tests=t['tests'], done_when=t['done'], scope_note=t.get('note'), blocked=t.get('blocked'), verify=t['verify']) for t in tasks])
tables_txt = '\n'.join(sorted(scope['tables'])) + '\n'
def main():
    if '--check' in sys.argv:
        cur = [open(os.path.join(ROOT, p), encoding='utf-8').read() if os.path.exists(os.path.join(ROOT, p)) else None for p in ('docs/AGENT-PLAN-R1.md', 'docs/release/r1-plan.json', 'docs/release/r1-tables.txt')]
        fresh = cur == [plan_md, json.dumps(plan_json, ensure_ascii=False, indent=1) + '\n', tables_txt]
        print('agent plan is', 'up to date' if fresh else 'STALE (run: python3 infra/spec-verify/gen_agent_plan.py .)'); sys.exit(0 if fresh else 1)
    open(os.path.join(ROOT, 'docs/AGENT-PLAN-R1.md'), 'w', encoding='utf-8').write(plan_md)
    open(os.path.join(ROOT, 'docs/release/r1-plan.json'), 'w', encoding='utf-8').write(json.dumps(plan_json, ensure_ascii=False, indent=1) + '\n')
    open(os.path.join(ROOT, 'docs/release/r1-tables.txt'), 'w', encoding='utf-8').write(tables_txt)
    print(f"wrote docs/AGENT-PLAN-R1.md ({len(plan_md.splitlines())} lines), r1-plan.json, r1-tables.txt: {len(tasks)} tasks, {sum(len(t['routes']) for t in tasks)} R1 routes, {sum(len(t['tables']) for t in tasks)} tables")

if __name__ == '__main__': main()
