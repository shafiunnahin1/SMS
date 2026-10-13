#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
infra/guard/agent_guard.py - turns the rules of docs/ops/agent-guardrails.md into a check that FAILS a commit range. Run it in CI (the agent cannot skip CI) and in a local hook.

    python3 infra/guard/agent_guard.py --base origin/develop --head HEAD      # every non-merge commit in base..head
    python3 infra/guard/agent_guard.py --staged --msg-file .git/COMMIT_EDITMSG # the index against HEAD (commit-msg hook: the trailers are in the message file)
    python3 infra/guard/agent_guard.py --list-checks

Checks (the ids are cited by docs/ops/agent-guardrails.md and verified by verify.py):
  C1  protected      a protected path (infra/guard/protected-paths.txt) changed without `Change-Request: D<n>` naming an existing decision; LOCKED-DECISIONS is append-only
  C2  migrations     an existing migration file was edited / deleted / renamed (migrations are append-only)
  C3  scope-tables   a NEW migration touches a table that does not belong to the current release (api/config/release.php -> docs/release/r*-scope.json)
  C4  scope-routes   a route file names a controller that belongs to a LATER release
  C5  tests          a test file was deleted, got a skip/only marker, or lost assertions
  C7  forbidden      forbidden code in added lines (tenant-scope bypass, raw bulk writes, money as float, env() outside config, debug output, hex colours in components, token in localStorage, ...)
  C8  secrets        a secret-looking string or a committed .env
  C9  task-order     a code commit lacks `Task: <id>`, names an unknown / later-release / BLOCKED task, or the task's dependencies are not [x] in docs/PROGRESS.md
  C10 progress       a code commit did not update PROGRESS, un-checked a line, or checked a task other than its own
  C11 size           too many files / lines in one commit (split the task)
  C12 release        api/config/release.php changed without `Release: R1|R3|FULL`, with the wrong module list, or before the previous release was accepted
  C14 dependencies   composer.json / package.json dependencies or lockfiles changed outside the scaffold tasks without a Change-Request
Exit 0 = clean (warnings allowed), 1 = at least one failure, 2 = the guard itself could not run.
A justified exception on one line: append `guard:allow(<rule>)` - it is reported as a WARNING for the human reviewer.
"""
import os, re, sys, json, subprocess, fnmatch, argparse

CHECKS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C14']
FRAMEWORK_TABLES = {'migrations', 'jobs', 'job_batches', 'failed_jobs', 'personal_access_tokens', 'password_reset_tokens', 'sessions', 'cache', 'cache_locks', 'notifications'}
SCAFFOLD_TASKS = {'0.1', '0.2', '0.3'}
CODE_DIRS = ('api/', 'frontend/')
WARN_FILES, WARN_LINES, FAIL_FILES, FAIL_LINES = 40, 1500, 80, 4000
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EMPTY_TREE = None   # resolved lazily with `git hash-object -t tree /dev/null`

def git(root, *args, check=True):
    r = subprocess.run(['git', '-C', root] + list(args), capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and r.returncode != 0: raise RuntimeError(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout

def empty_tree(root):
    global EMPTY_TREE
    if not EMPTY_TREE: EMPTY_TREE = git(root, 'hash-object', '-t', 'tree', '/dev/null').strip()
    return EMPTY_TREE

def show(root, rev, path):
    r = subprocess.run(['git', '-C', root, 'show', f'{rev}:{path}'], capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.stdout if r.returncode == 0 else None

def glob_to_re(g):
    out = ''; i = 0
    while i < len(g):
        if g[i:i + 2] == '**': out += '.*'; i += 2
        elif g[i] == '*': out += '[^/]*'; i += 1
        elif g[i] == '?': out += '[^/]'; i += 1
        else: out += re.escape(g[i]); i += 1
    return re.compile('^' + out + '$')

def load_protected(root):
    pats = []
    p = os.path.join(root, 'infra/guard/protected-paths.txt')
    if os.path.exists(p):
        for ln in open(p, encoding='utf-8'):
            ln = ln.split('#')[0].strip()
            if not ln: continue
            modify_only = ln.endswith('[modify-only]'); ln = ln.replace('[modify-only]', '').strip()
            neg = ln.startswith('!'); ln = ln.lstrip('!')
            pats.append((glob_to_re(ln), neg, modify_only))
    return pats

def is_protected(path, status, pats):
    hit = False
    for rx, neg, mo in pats:
        if rx.match(path):
            if neg: hit = False
            elif mo and status == 'A': hit = False
            else: hit = True
    return hit

def parse_trailers(msg):
    t = {}
    for ln in msg.strip().split('\n'):
        m = re.match(r'^([A-Za-z][\w-]*):\s*(.+?)\s*$', ln)
        if m: t.setdefault(m.group(1).lower(), []).append(m.group(2))
    return t

def added_lines(root, parent, commit, path):
    out = git(root, 'diff', '-U0', '--no-renames', parent, commit, '--', path)
    return [l[1:] for l in out.split('\n') if l.startswith('+') and not l.startswith('+++')], [l[1:] for l in out.split('\n') if l.startswith('-') and not l.startswith('---')]

class Report:
    def __init__(self): self.fails = []; self.warns = []
    def fail(self, check, commit, msg): self.fails.append((check, commit[:8], msg))
    def warn(self, check, commit, msg): self.warns.append((check, commit[:8], msg))

def release_state(root, rev):
    """current release id + the sets that belong to it, read from the tree of `rev`."""
    rel = show(root, rev, 'api/config/release.php'); cur = 'R1'
    if rel:
        m = re.search(r"'id'\s*=>\s*'(R[\d.]+)'", rel)
        if m: cur = m.group(1)
    def js(p):
        s = show(root, rev, p); return json.loads(s) if s else None
    r1s, r1p, r3s, r3p = js('docs/release/r1-scope.json'), js('docs/release/r1-plan.json'), js('docs/release/r3-scope.json'), js('docs/release/r3-plan.json')
    fulls = js('docs/release/full-scope.json')
    tables = set(r1s['tables']) if r1s else set(); ctrl = set(); tasks = {}
    if r1p:
        for t in r1p['tasks']:
            tasks[t['id']] = t
            for r in t['routes']:
                m = re.search(r'-> (\w+)@', r); ctrl.add(m.group(1)) if m else None
    if cur in ('R3',) and r3s: tables |= set(r3s['tables']) | set(r3s['prerequisites']['tables'])
    r3tasks = {}
    if r3p:
        for t in r3p['tasks']:
            r3tasks[t['id']] = t
            if cur in ('R3',):
                for r in t['routes']:
                    m = re.search(r'-> (\w+)@', r); ctrl.add(m.group(1)) if m else None
    allowed_tasks = dict(tasks)
    if cur in ('R3',): allowed_tasks.update(r3tasks)
    return dict(current=cur, tables=tables | FRAMEWORK_TABLES, controllers=ctrl, tasks=allowed_tasks, later_tasks=set(r3tasks) - set(allowed_tasks), scope1=r1s, scope3=r3s, full=fulls,
                known_controllers=(r1s or {}).get('controllers', {}))

def norm_deps(v):
    """depends_on is a list in r3-plan.json but a plain string (\"0.1\" or \"2.3, 2.5\") in r1-plan.json - never iterate a string."""
    if not v: return []
    return re.findall(r'[\w.]+', v) if isinstance(v, str) else list(v)

def progress_done(text):
    return set(re.findall(r'^\s*[-*]\s*\[[xX]\]\s*([\w.]+)\b', text or '', re.M))

def is_test(path): return bool(re.search(r'(^|/)(tests?|__tests__)/', path) or re.search(r'\.(test|spec)\.[jt]sx?$', path) or path.endswith('Test.php'))
def is_code(path): return path.startswith(CODE_DIRS) and re.search(r'\.(php|jsx?|tsx?|vue)$', path) is not None
MONEY = re.compile(r'(Fee|Payroll|Salary|Voucher|Refund|Donation|Inventory|Account|CashBook|Cashbook|Payment|Invoice|Advance|Bonus|Settlement)', re.I)
SKIP = re.compile(r'(markTestSkipped|markTestIncomplete|->skip\(|@skip\b|\bit\.skip|\bdescribe\.skip|\btest\.skip|\bxit\(|\bxdescribe\(|\bit\.only|\bdescribe\.only|\btest\.only|#\[Group\(.skip)')
ASSERT = re.compile(r'(\bassert\w*\(|->assert\w*\(|\bexpect\()')
SECRETS = [(r'AKIA[0-9A-Z]{16}', 'AWS access key'), (r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----', 'private key'), (r'\bsk_live_[0-9A-Za-z]{10,}', 'Stripe-style live key'),
           (r'\bxox[baprs]-[0-9A-Za-z-]{10,}', 'Slack token'), (r'(?i)\b(?:api[_-]?key|secret|passwd|password|token)\b\s*[:=]\s*[\'"][A-Za-z0-9/+_\-]{16,}[\'"]', 'hard-coded credential')]
FORBIDDEN = [  # (check-name, regex, applies-to predicate, severity)
    ('tenant-scope bypass: withoutGlobalScope', re.compile(r'withoutGlobalScopes?\s*\('), lambda p: p.endswith('.php'), 'fail'),
    ('raw bulk write on a model (use TenantBulk::insert/upsert)', re.compile(r'(?<![\w$])[A-Z]\w+::(?:insert|upsert)\s*\('), lambda p: p.endswith('.php') and not p.endswith('TenantBulk.php'), 'fail', lambda ln: 'TenantBulk' not in ln),
    ('env() outside config/', re.compile(r'(?<![\w>:])env\s*\('), lambda p: p.endswith('.php') and not p.startswith('api/config/') and '/tests/' not in p, 'fail'),
    ('debug output left in code', re.compile(r'\b(?:dd|dump|var_dump|print_r|ray)\s*\('), lambda p: p.endswith('.php'), 'fail'),
    ('hard-coded storage disk (use private/public)', re.compile(r"Storage::disk\(\s*'(?!private'|public')"), lambda p: p.endswith('.php'), 'fail'),
    ('money as float', re.compile(r'\(float\)|floatval\s*\('), lambda p: p.endswith('.php') and MONEY.search(p) is not None, 'fail'),
    ('float cast outside money code', re.compile(r'\(float\)|floatval\s*\('), lambda p: p.endswith('.php') and MONEY.search(p) is None, 'warn'),
    ('console.log left in frontend code', re.compile(r'console\.(?:log|debug)\s*\('), lambda p: p.startswith('frontend/') and re.search(r'\.[jt]sx?$', p) and '.test.' not in p, 'fail'),
    ('hex colour in a component (use theme tokens)', re.compile(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])'), lambda p: p.startswith('frontend/src/') and re.search(r'\.[jt]sx$', p) and '/theme/' not in p and '.test.' not in p, 'fail'),
    ('auth token in localStorage/sessionStorage', re.compile(r"(?:local|session)Storage\.setItem\(\s*['\"][^'\"]*token", re.I), lambda p: p.startswith('frontend/'), 'fail'),
    ('dangerouslySetInnerHTML', re.compile(r'dangerouslySetInnerHTML'), lambda p: p.startswith('frontend/'), 'warn')]

def check_commit(root, commit, parent, msg, rep, state_cache):
    short = commit[:8]; tr = parse_trailers(msg)
    ns = git(root, 'diff', '--name-status', '--no-renames', parent, commit).strip().split('\n')
    files = [(l.split('\t')[0][0], l.split('\t', 1)[1]) for l in ns if l.strip()]
    if not files: return
    if parent not in state_cache: state_cache[parent] = release_state(root, parent)
    st = state_cache[parent]
    # the protected list comes from the PARENT (already approved) tree - a commit must not be able to edit its own rules away
    pats = load_protected_from_tree(root, parent) or load_protected(root)
    crs = [x for v in tr.get('change-request', []) for x in re.findall(r'D\d+', v)]
    base_dec = show(root, parent, 'docs/LOCKED-DECISIONS.md') or ''
    cr_ok = bool(crs) and all(re.search(r'^\| %s \|' % d, base_dec, re.M) for d in crs)
    def allow(line, rule): return f'guard:allow({rule})' in line
    # ---- C1 protected
    for s, p in files:
        if p == 'docs/LOCKED-DECISIONS.md':
            a, r = added_lines(root, parent, commit, p)
            removed_rows = [x for x in r if re.match(r'\| D\d+ \|', x)]
            changed_rows = [x for x in a if re.match(r'\| D\d+ \|', x)]
            old_ids = set(re.findall(r'^\| (D\d+) \|', base_dec, re.M)); new_ids = {re.match(r'\| (D\d+) \|', x).group(1) for x in changed_rows}
            if s == 'D' or (removed_rows and not all(re.match(r'\| (D\d+) \|', x).group(1) in new_ids for x in removed_rows)):
                rep.fail('C1', commit, 'LOCKED-DECISIONS.md is append-only: an existing decision was removed'); continue
            edited = [d for d in new_ids if d in old_ids]
            if edited: rep.fail('C1', commit, f'LOCKED-DECISIONS.md is append-only: existing decision(s) {edited} were edited (write a NEW decision that supersedes it)'); continue
            added = sorted(new_ids - old_ids)
            claimed = sorted({x for v in tr.get('change-request', []) for x in re.findall(r'D\d+', v)})
            if added and set(added) != set(claimed): rep.fail('C1', commit, f'new decision(s) {added} need a matching `Change-Request: {", ".join(added)}` trailer (a human commit)')
            continue
        if is_protected(p, s, pats) and not cr_ok:
            rep.fail('C1', commit, f'protected path changed without a valid `Change-Request: D<n>` trailer: {p}')
    # ---- C2 / C3 migrations
    mig = [(s, p) for s, p in files if re.match(r'api/database/migrations/.*\.php$', p)]
    for s, p in mig:
        if s in ('M', 'D'): rep.fail('C2', commit, f'migrations are append-only - {"deleted" if s == "D" else "edited"}: {p} (add a NEW migration instead)')
        if s == 'A':
            body = show(root, commit, p) or ''
            for tb in set(re.findall(r"Schema::(?:create|table|drop|dropIfExists|rename)\(\s*['\"](\w+)['\"]", body)):
                if tb not in st['tables']: rep.fail('C3', commit, f"migration {os.path.basename(p)} touches table `{tb}` which is not in release {st['current']} (docs/release/*-scope.json)")
    # ---- C4 routes
    for s, p in files:
        if re.match(r'api/routes/.*\.php$', p) and s in ('A', 'M'):
            a, _ = added_lines(root, parent, commit, p)
            for ln in a:
                for c in re.findall(r'(\w+Controller)::class', ln):
                    if c in st['controllers']: continue
                    k = st['known_controllers'].get(c)
                    if k: rep.fail('C4', commit, f"route names {c}, a controller of release {k['release']} (current release is {st['current']}): {p}")
                    else: rep.warn('C4', commit, f'route names {c} which is in no release plan (unknown controller): {p}')
    # ---- C5 tests
    for s, p in files:
        if not is_test(p): continue
        if s == 'D': rep.fail('C5', commit, f'test file deleted: {p}'); continue
        a, r = added_lines(root, parent, commit, p)
        for ln in a:
            if SKIP.search(ln) and not allow(ln, 'skip'): rep.fail('C5', commit, f'skip/only marker added in {p}: {ln.strip()[:70]}')
        lost = sum(1 for x in r if ASSERT.search(x)) - sum(1 for x in a if ASSERT.search(x))
        if lost > 3: rep.fail('C5', commit, f'{p} lost {lost} assertions (net) - weakening a test to make it pass is forbidden')
    # ---- C7 forbidden code, C8 secrets
    for s, p in files:
        if s == 'D': continue
        if re.search(r'(^|/)\.env(\.[\w]+)?$', p) and not p.endswith('.example'): rep.fail('C8', commit, f'environment file committed: {p}')
        if re.search(r'\.(pem|key|p12|pfx)$', p): rep.fail('C8', commit, f'key/certificate file committed: {p}')
        if not re.search(r'\.(php|jsx?|tsx?|vue|json|ya?ml|env|md|sh|py)$', p): continue
        a, _ = added_lines(root, parent, commit, p)
        for ln in a:
            for rx, what in SECRETS:
                if re.search(rx, ln) and not allow(ln, 'secret') and not p.endswith(('.example', '.md')): rep.fail('C8', commit, f'{what} in {p}: {ln.strip()[:50]}...')
        if is_code(p):
            for what, rx, applies, sev, *lf in FORBIDDEN:
                if not applies(p): continue
                for ln in a:
                    if rx.search(ln) and (not lf or lf[0](ln)):
                        if allow(ln, what.split(' ')[0]) or 'guard:allow' in ln: rep.warn('C7', commit, f'{what} allowed by guard:allow in {p}: {ln.strip()[:60]}')
                        elif sev == 'fail': rep.fail('C7', commit, f'{what}: {p}: {ln.strip()[:70]}')
                        else: rep.warn('C7', commit, f'{what}: {p}: {ln.strip()[:70]}')
    # ---- C9 / C10 task order and progress
    touches_code = any(p.startswith(CODE_DIRS) for s, p in files)
    task = (tr.get('task') or [None])[0]
    prog_before = show(root, parent, 'docs/PROGRESS.md') or ''; done_before = progress_done(prog_before)
    if touches_code:
        if not task: rep.fail('C9', commit, 'a commit that changes api/ or frontend/ needs a `Task: <id>` trailer (task ids: docs/AGENT-PLAN-R*.md)')
        elif task not in st['tasks']:
            why = f'task {task} belongs to a later release (current: {st["current"]})' if task in st['later_tasks'] else f'unknown task id {task}'
            rep.fail('C9', commit, why)
        else:
            if st['tasks'][task].get('blocked'): rep.fail('C9', commit, f"task {task} is BLOCKED by a decision: {re.sub(r'[*`]', '', st['tasks'][task]['blocked'])[:140]}")
            missing = [d for d in norm_deps(st['tasks'][task].get('depends_on')) if d not in done_before]
            if missing: rep.fail('C9', commit, f'task {task} depends on {missing}, which are not [x] in docs/PROGRESS.md yet - do the tasks in order')
        if not any(p == 'docs/PROGRESS.md' for s, p in files): rep.fail('C10', commit, 'a code commit must update docs/PROGRESS.md in the same commit')
    for s, p in files:
        if p == 'docs/PROGRESS.md' and s != 'D':
            a, r = added_lines(root, parent, commit, p)
            un = [x for x in r if re.match(r'\s*[-*]\s*\[[xX]\]', x) and not any(re.match(r'\s*[-*]\s*\[[xX]\]\s*' + re.escape(re.search(r'\]\s*([\w.]+)', x).group(1)), y) for y in a)]
            if un: rep.fail('C10', commit, f'PROGRESS: a done line was removed or un-checked: {un[0].strip()[:60]}')
            newly = [re.search(r'\]\s*([\w.]+)', x).group(1) for x in a if re.match(r'\s*[-*]\s*\[[xX]\]\s*[\w.]+', x)]
            newly = [x for x in newly if x not in done_before]
            if task and any(x != task for x in newly): rep.fail('C10', commit, f'PROGRESS: this commit is `Task: {task}` but also checks off {[x for x in newly if x != task]}')
            if newly and not task: rep.fail('C10', commit, 'PROGRESS: a task was checked off in a commit without a `Task:` trailer')
    # ---- C11 size
    ns2 = git(root, 'diff', '--numstat', '--no-renames', parent, commit).strip().split('\n')
    nfiles = len([x for x in ns2 if x.strip()]); nlines = sum(int(x.split('\t')[0]) + int(x.split('\t')[1]) for x in ns2 if x.strip() and x.split('\t')[0].isdigit() and x.split('\t')[1].isdigit())
    if touches_code:
        if nfiles > FAIL_FILES or nlines > FAIL_LINES: rep.fail('C11', commit, f'commit too large ({nfiles} files, {nlines} lines): split the task')
        elif nfiles > WARN_FILES or nlines > WARN_LINES: rep.warn('C11', commit, f'large commit ({nfiles} files, {nlines} lines): is this really ONE task?')
    # ---- C12 release flip
    for s, p in files:
        if p == 'api/config/release.php':
            rel = (tr.get('release') or [None])[0]; body = show(root, commit, p) or ''
            mods = re.findall(r"'(\w+)'", (re.search(r"'modules'\s*=>\s*\[([^\]]*)\]", body) or [None, ''])[1])
            want = None
            if rel == 'R1' and st['scope1']: want = st['scope1']['modules']
            elif rel == 'R3' and st['scope3']: want = st['scope3']['release_php']['modules']
            elif rel == 'FULL' and st['full']: want = sorted(st['full']['modules'])
            if rel not in ('R1', 'R3', 'FULL'): rep.fail('C12', commit, 'api/config/release.php changed without a `Release: R1|R3|FULL` trailer')
            elif want is None or (sorted(mods) if rel == 'FULL' else mods) != want: rep.fail('C12', commit, f'release.php module list does not equal the {rel} scope file (docs/release/*-scope.json)')
            elif rel == 'R3' and 'A' not in done_before: rep.fail('C12', commit, 'cannot switch to R3 before Release 1 is accepted (task `A` is not [x] in docs/PROGRESS.md)')
            elif rel == 'FULL':
                missing_ms = [m['id'] + '.A' for m in st['full']['milestones'] if m['id'] + '.A' not in done_before]
                if missing_ms: rep.fail('C12', commit, f'the COMPLETE release (D45) needs every milestone accepted; not [x] in docs/PROGRESS.md: {missing_ms}')
    # ---- C14 dependencies
    manifests = [(s, p) for s, p in files if re.search(r'(^|/)(composer\.json|package\.json)$', p)]
    locks = [(s, p) for s, p in files if re.search(r'(^|/)(composer\.lock|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$', p)]
    def deps(txt):
        try: j = json.loads(txt or '{}')
        except Exception: return {}
        d = {}
        for k in ('require', 'require-dev', 'dependencies', 'devDependencies'): d.update({f'{k}:{n}': v for n, v in (j.get(k) or {}).items()})
        return d
    changed_manifest = False
    for s, p in manifests:
        if deps(show(root, parent, p)) != deps(show(root, commit, p)): changed_manifest = True
    if (changed_manifest or locks) and not (task in SCAFFOLD_TASKS) and not cr_ok:
        if changed_manifest: rep.fail('C14', commit, 'dependencies changed (composer.json / package.json) outside the scaffold tasks 0.1-0.3 without a Change-Request')
        elif locks and not changed_manifest: rep.fail('C14', commit, 'a lockfile changed without a manifest change (an accidental `composer update` / `npm install`?)')

def load_protected_from_tree(root, rev):
    s = show(root, rev, 'infra/guard/protected-paths.txt'); pats = []
    for ln in (s or '').split('\n'):
        ln = ln.split('#')[0].strip()
        if not ln: continue
        mo = ln.endswith('[modify-only]'); ln = ln.replace('[modify-only]', '').strip(); neg = ln.startswith('!'); pats.append((glob_to_re(ln.lstrip('!')), neg, mo))
    return pats

def run(root, base, head, staged=False, msg_file=None):
    rep = Report(); cache = {}
    if staged:
        parent = 'HEAD'; msg = ''
        # emulate a commit object: write the index as a tree
        tree = git(root, 'write-tree').strip()
        commit = tree
        ns_msg_path = msg_file or os.path.join(root, '.git', 'COMMIT_EDITMSG'); msg = open(ns_msg_path, encoding='utf-8').read() if os.path.exists(ns_msg_path) else ''
        check_commit(root, commit, parent, msg, rep, cache); return rep
    revs = git(root, 'rev-list', '--reverse', '--no-merges', f'{base}..{head}').split()
    for c in revs:
        parents = git(root, 'rev-list', '--parents', '-n', '1', c).split()[1:]
        parent = parents[0] if parents else empty_tree(root)
        check_commit(root, c, parent, git(root, 'log', '-1', '--format=%B', c), rep, cache)
    return rep

def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'): stream.reconfigure(encoding='utf-8', errors='replace')
    ap = argparse.ArgumentParser(); ap.add_argument('--root', default=ROOT); ap.add_argument('--base'); ap.add_argument('--head', default='HEAD'); ap.add_argument('--staged', action='store_true'); ap.add_argument('--msg-file'); ap.add_argument('--list-checks', action='store_true')
    a = ap.parse_args()
    if a.list_checks: print(' '.join(CHECKS)); return 0
    try:
        if not a.staged and not a.base:
            a.base = git(a.root, 'rev-parse', f'{a.head}~1').strip()
        rep = run(a.root, a.base, a.head, a.staged, a.msg_file)
    except Exception as e:
        print('GUARD ERROR:', e); return 2
    for c, h, m in rep.warns: print(f'WARN  [{c}] {h} {m}')
    for c, h, m in rep.fails: print(f'FAIL  [{c}] {h} {m}')
    print(f'agent_guard: {len(rep.fails)} failure(s), {len(rep.warns)} warning(s)')
    return 1 if rep.fails else 0

if __name__ == '__main__': sys.exit(main())
